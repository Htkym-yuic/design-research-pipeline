#!/usr/bin/env node
/**
 * DIS日次学習ワークフロー（LP/バナー/Web 各1件）。既定は完全ドライラン（外部書込みなし）。
 *
 * node scripts/dis/run.mjs --stage <collect|select|capture|template|validate|publish|all> \
 *   [--media lp,banner,web] [--date YYYY-MM-DD] [--fixture path] [--out dir] [--capture] [--apply]
 */
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { loadConfig, jstDate, readJson, MEDIA_KEYS, REPO_ROOT } from "./lib/config.mjs";
import { buildKnownIndex } from "./lib/dedupe.mjs";
import { selectOne, interleaveBySource } from "./lib/select.mjs";
import { collectFromSource, loadFixture } from "./lib/collect.mjs";
import { emptyAnalysis, validateAnalysis, analysisToMarkdown } from "./lib/analysis-schema.mjs";
import { idempotencyKey, loadLedger, saveLedger, findEntry, upsertEntry } from "./lib/ledger.mjs";
import { writesAllowed } from "./lib/write-guard.mjs";
import { dropboxFolder, planDropboxFiles, writeDropbox, writeNotion, buildNotionProps, buildNotionBlocks } from "./lib/adapters.mjs";

const { values: args } = parseArgs({
  options: {
    stage: { type: "string", default: "all" },
    media: { type: "string", default: MEDIA_KEYS.join(",") },
    date: { type: "string", default: jstDate() },
    fixture: { type: "string" },
    out: { type: "string", default: `${REPO_ROOT}outputs/dis` },
    capture: { type: "boolean", default: false },
    apply: { type: "boolean", default: false },
    ledger: { type: "string" },
    snapshot: { type: "string" },
  },
});

const STAGES = ["collect", "select", "capture", "template", "validate", "publish"];
const stages = args.stage === "all" ? STAGES : args.stage.split(",");
const medias = args.media.split(",").map((s) => s.trim()).filter(Boolean);
for (const s of stages) if (!STAGES.includes(s)) throw new Error(`不明なstage: ${s}`);
for (const m of medias) if (!MEDIA_KEYS.includes(m)) throw new Error(`不明なmedia: ${m}`);

const cfg = await loadConfig();
const dir = (m) => path.join(args.out, args.date, m);
const wj = async (file, data) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(data, null, 2) + "\n"); };
const writeOk = writesAllowed({ apply: args.apply });
const ledgerFile = args.ledger || undefined;
const ledger = await loadLedger(ledgerFile);
const notionSnapshot = args.snapshot ? await readJson(args.snapshot, null) : null;
const known = await buildKnownIndex({ ledger, notionSnapshot });
const fixture = args.fixture ? await loadFixture(args.fixture) : null;
const summary = { date: args.date, mode: writeOk ? "APPLY" : "DRY_RUN", media: {} };

async function runMedia(media) {
  const d = dir(media);
  const r = (summary.media[media] = { status: "ok", stages: {} });
  const disId = `${cfg.idPrefix}-${cfg.media[media].idCode}-${args.date.replaceAll("-", "")}`;

  if (stages.includes("collect")) {
    const out = `${d}/candidates.json`;
    if (await readJson(out, null)) { r.stages.collect = "reused"; }
    else {
      let candidates;
      if (fixture) candidates = fixture[media] || [];
      else {
        candidates = [];
        var skippedSources = [];
        const srcs = cfg.sources.filter((s) => s.media === media);
        for (const s of srcs) {
          if (s.termsStatus !== "known") { skippedSources.push({ sourceKey: s.key, sourceName: s.name, reason: "利用条件未確認のため取得せず" }); continue; }
          candidates.push(...(await collectFromSource(s)));
        }
      }
      await wj(out, { collectedAt: new Date().toISOString(), candidates, skippedSources: typeof skippedSources === "undefined" ? [] : skippedSources });
      r.stages.collect = `${candidates.length} candidates`;
    }
  }

  if (stages.includes("select")) {
    const out = `${d}/selection.json`;
    if (await readJson(out, null)) r.stages.select = "reused";
    else {
      const { candidates } = await readJson(`${d}/candidates.json`);
      const usable = candidates.filter((c) => !c.fetchError || c.pageUrl);
      const valid = candidates.filter((c) => !c.fetchError);
      const failures = candidates.filter((c) => c.fetchError);
      const res = selectOne([...interleaveBySource(valid, args.date), ...failures], {
        tieSeed: args.date,
        weights: cfg.scoring.weights, minScore: cfg.minScoreToSelect, maxCandidates: cfg.maxCandidatesPerMedia,
        dupCheck: (c) => known.check(c, { windowDays: cfg.dedupeWindowDays, today: args.date }),
      });
      const sel = res.selected && { ...res.selected, disId };
      await wj(out, { date: args.date, disId, selected: sel, evaluated: res.evaluated, fetchFailures: failures.map((f) => ({ sourceKey: f.sourceKey, sourceDetailUrl: f.sourceDetailUrl, error: f.fetchError })), skippedReason: res.skippedReason ?? null, usableCount: usable.length });
      r.stages.select = sel ? `selected ${sel.brand} (score ${sel.score})` : `SKIP: ${res.skippedReason}`;
    }
  }

  const selection = await readJson(`${d}/selection.json`, null);
  if (!selection?.selected) { r.status = "skipped"; r.reason = selection?.skippedReason ?? "未選定"; return; }
  const sel = selection.selected;
  const key = idempotencyKey(media, sel.pageUrl);

  if (stages.includes("capture")) {
    if (!args.capture) r.stages.capture = "not requested (--capture 未指定)";
    else {
      const { captureFullPage, downloadBanner } = await import("./lib/capture.mjs");
      const files = cfg.media[media].capture === "public-image" ? await downloadBanner(sel.imageUrl, `${d}/files`) : await captureFullPage(sel.pageUrl, `${d}/files`);
      await wj(`${d}/files.json`, files);
      r.stages.capture = `${files.length} files`;
      if (files.warnings?.length) { r.stages.capture += ` / WARNING: ${files.warnings.join("; ")}`; r.warnings = files.warnings; }
    }
  }

  if (stages.includes("template")) {
    const f = `${d}/analysis.json`;
    if (await readJson(f, null)) r.stages.template = "exists (not overwritten)";
    else { await wj(f, emptyAnalysis({ media, disId, pageUrl: sel.pageUrl, brand: sel.brand })); r.stages.template = "created"; }
  }

  let analysis = null;
  if (stages.includes("validate") || stages.includes("publish")) {
    analysis = await readJson(`${d}/analysis.json`, null);
    const v = analysis ? validateAnalysis(analysis) : { ok: false, errors: ["analysis.json なし"] };
    r.stages.validate = v.ok ? "ok" : { ok: false, errors: v.errors };
    if (v.ok) await fs.writeFile(`${d}/analysis.md`, analysisToMarkdown(analysis));
    if (!v.ok && stages.includes("publish")) { r.stages.publish = "blocked: analysis not complete"; return; }
  }

  if (stages.includes("publish")) {
    const entry = findEntry(ledger, key);
    const folder = dropboxFolder(cfg, media, args.date, disId);
    const generated = [{ local: `${d}/analysis.json`, rel: "03_Analysis/analysis.json" }, { local: `${d}/analysis.md`, rel: "03_Analysis/analysis.md" }];
    const meta = { disId, media, date: args.date, pageUrl: sel.pageUrl, sourceName: sel.sourceName, sourceDetailUrl: sel.sourceDetailUrl, brand: sel.brand, selectionReason: analysis.selectionReason, rightsNotes: analysis.rightsNotes, score: sel.score };
    await wj(`${d}/metadata.json`, meta);
    generated.push({ local: `${d}/metadata.json`, rel: "metadata.json" });
    const captured = (await readJson(`${d}/files.json`, [])) ;
    const plan = planDropboxFiles([...captured, ...generated], folder);
    const notionValues = { disId, brand: sel.brand, pageUrl: sel.pageUrl, sourceName: sel.sourceName, sourceDetailUrl: sel.sourceDetailUrl, date: args.date, dropboxFolder: folder, summary: analysis.summary };
    const result = { dryRun: !writeOk, key, dropboxFolder: folder, dropboxPlan: plan.map((p) => p.remote), notion: { library: cfg.media[media].notion.libraryName, collection: cfg.media[media].notion.collection, title: `${disId} ${sel.brand}` } };
    if (captured.length === 0) result.warning = "撮影/画像ファイルなし（--capture 未実施）。本番前に必須。";
    if (writeOk) {
      if (captured.length === 0) throw new Error("正本画像がありません（capture未実施）");
      const base = { key, disId, media, pageUrl: sel.pageUrl, brand: sel.brand, date: args.date };
      if (entry?.dropbox?.status !== "created") {
        result.dropbox = await writeDropbox({ folder, plan, opts: { apply: args.apply }, ledgerDone: entry?.dropbox?.status === "created" });
        upsertEntry(ledger, { ...base, dropbox: result.dropbox }); await saveLedger(ledger, ledgerFile);
        if (result.dropbox.status !== "created") throw new Error(`Dropbox: ${result.dropbox.status}`);
      } else result.dropbox = { status: "skipped_already_done" };
      if (entry?.notion?.status !== "created") {
        result.notionResult = await writeNotion({ cfg, media, values: notionValues, blocks: buildNotionBlocks(analysis, await fs.readFile(`${d}/analysis.md`, "utf8")), opts: { apply: args.apply } });
        upsertEntry(ledger, { ...base, notion: result.notionResult }); await saveLedger(ledger, ledgerFile);
      } else result.notionResult = { status: "skipped_already_done" };
    }
    await wj(`${d}/publish-result.json`, result);
    r.stages.publish = writeOk ? "applied" : "dry-run plan written";
  }
}

for (const media of medias) {
  try { await runMedia(media); }
  catch (e) { summary.media[media] = { ...(summary.media[media] || {}), status: "failed", error: e.message }; }
}
await wj(`${args.out}/${args.date}/summary.json`, summary);
console.log(JSON.stringify(summary, null, 2));
if (Object.values(summary.media).some((m) => m.status === "failed")) process.exitCode = 1;
