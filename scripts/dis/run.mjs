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
import { buildKnownIndex, normalizeUrl } from "./lib/dedupe.mjs";
import { selectOne, interleaveBySource } from "./lib/select.mjs";
import { collectFromSource, loadFixture } from "./lib/collect.mjs";
import { emptyAnalysis, validateAnalysis, analysisToMarkdown } from "./lib/analysis-schema.mjs";
import { emptyAnnotations, validateAnnotations } from "./lib/annotations.mjs";
import { buildTextIndex } from "./lib/text-index.mjs";
import { idempotencyKey, loadLedger, saveLedger, findEntry, upsertEntry } from "./lib/ledger.mjs";
import { writesAllowed } from "./lib/write-guard.mjs";
import { buildContactSheet, applyLearning, suggestCriteria } from "./lib/review.mjs";
import { dropboxFolder, planDropboxFiles, writeDropbox, writeNotion, buildNotionBlocks, DEFAULT_PROPERTY_MAP } from "./lib/adapters.mjs";

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

const STAGES = ["collect", "select", "review", "rescore", "capture", "template", "validate", "publish"];
const DEFAULT_STAGES = STAGES.filter((s) => !["review", "rescore"].includes(s));
const stages = args.stage === "all" ? DEFAULT_STAGES : args.stage.split(",");
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
      const skippedSources = [];
      const sourceReports = [];
      if (fixture) candidates = fixture[media] || [];
      else {
        candidates = [];
        const isKnown = (u) => known.check({ sourceDetailUrl: u }, { windowDays: cfg.dedupeWindowDays, today: args.date }).duplicate;
        for (const s of cfg.sources.filter((x) => x.media === media)) {
          if (s.enabled === false) { skippedSources.push({ sourceKey: s.key, sourceName: s.name, reason: `無効化中: ${s.disabledReason || "理由未記載"}` }); continue; }
          if (s.termsStatus !== "known") { skippedSources.push({ sourceKey: s.key, sourceName: s.name, reason: "利用条件未確認のため取得せず" }); continue; }
          const got = await collectFromSource(s, { isKnown });
          candidates.push(...got);
          sourceReports.push(got.report);
        }
      }
      await wj(out, { collectedAt: new Date().toISOString(), candidates, skippedSources, sourceReports });
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

  if (stages.includes("review")) {
    const sel0 = await readJson(`${d}/selection.json`, null);
    if (!sel0) throw new Error("selection.json がありません（先に collect,select）");
    const items = sel0.evaluated.filter((e) => e.inComparison).map((e, i) => ({ no: i + 1, brand: e.brand, sourceKey: e.sourceKey, sourceDetailUrl: e.sourceDetailUrl, pageUrl: e.pageUrl, imageUrl: e.imageUrl || null, score: e.score, originUnresolved: !!e.originUnresolved, suggested: suggestCriteria(e, media) }));
    const sheet = await buildContactSheet(items, `${d}/review/contact_sheet.jpg`);
    await wj(`${d}/review/review.json`, { date: args.date, media, items: items.map((it, i) => ({ ...it, image: sheet[i].image })), selection: { passScore: cfg.selection.passScore, maxScore: cfg.selection.maxScore, criteria: cfg.selection.criteria }, howTo: "contact_sheet.jpg を見て、各候補を6項目×0〜3点で評価し、criteria と reason を learning.json に書き、--stage rescore を実行する（合計13/18点以上が選定基準）。suggested（資料の十分さ・出典の健全さ）は目安" });
    r.stages.review = `${items.length}件 → review/contact_sheet.jpg`;
  }

  if (stages.includes("rescore")) {
    const learning = await readJson(`${d}/learning.json`, null);
    if (!learning) throw new Error("learning.json がありません");
    const cur = await readJson(`${d}/selection.json`, null);
    if (cur?.selected && findEntry(ledger, idempotencyKey(media, cur.selected.pageUrl))) throw new Error("公開済みのため再選定できません");
    const cdata = await readJson(`${d}/candidates.json`);
    const review = await readJson(`${d}/review/review.json`, { items: [] });
    const { applied, errors } = applyLearning(cdata.candidates, learning, review.items);
    if (errors.length) throw new Error(`learning.json に誤り: ${errors.join(" / ")}`);
    await wj(`${d}/candidates.json`, cdata);
    const valid = cdata.candidates.filter((c) => !c.fetchError);
    const failures = cdata.candidates.filter((c) => c.fetchError);
    const res = selectOne([...interleaveBySource(valid, args.date), ...failures], {
      tieSeed: args.date, weights: cfg.scoring.weights, minScore: cfg.minScoreToSelect, maxCandidates: cfg.maxCandidatesPerMedia,
      passScore: cfg.selection.passScore, reviewedOnly: true,
      dupCheck: (c) => known.check(c, { windowDays: cfg.dedupeWindowDays, today: args.date }),
    });
    const sel = res.selected && { ...res.selected, disId };
    await wj(`${d}/selection.json`, { date: args.date, disId, selected: sel, evaluated: res.evaluated, fetchFailures: failures.map((f) => ({ sourceKey: f.sourceKey, sourceDetailUrl: f.sourceDetailUrl, error: f.fetchError })), skippedReason: res.skippedReason ?? null, rescoredAt: new Date().toISOString(), reviewApplied: applied });
    r.stages.rescore = sel ? `${applied}件反映 → 選定: ${sel.brand}（${sel.reviewTotal}/${cfg.selection.maxScore}点。理由: ${sel.reviewReason}）` : `${applied}件反映 → SKIP: ${res.skippedReason}`;
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
    const parts = [];
    if (await readJson(f, null)) parts.push("analysis exists (not overwritten)");
    else { await wj(f, emptyAnalysis({ media, disId, pageUrl: sel.pageUrl, brand: sel.brand })); parts.push("analysis created"); }
    const fa = `${d}/annotations.json`;
    if (await readJson(fa, null)) parts.push("annotations exists (not overwritten)");
    else { await wj(fa, emptyAnnotations({ disId })); parts.push("annotations created"); }
    r.stages.template = parts.join(" / ");
  }

  let analysis = null;
  if (stages.includes("validate") || stages.includes("publish")) {
    analysis = await readJson(`${d}/analysis.json`, null);
    if (analysis) {
      // 選定結果を正とする: ID・実ページURLは常に選定から。brand が "AUTO" のときだけ選定のブランド名を使う。
      analysis.disId = disId;
      analysis.pageUrl = sel.pageUrl;
      if (!analysis.brand || analysis.brand === "AUTO") analysis.brand = sel.brand;
      await wj(`${d}/analysis.json`, analysis);
    }
    const annotations = analysis ? await readJson(`${d}/annotations.json`, null) : null;
    const v = analysis ? validateAnalysis(analysis) : { ok: false, errors: ["analysis.json なし"] };
    const va = analysis && v.ok ? (annotations ? validateAnnotations(annotations, analysis) : { ok: false, errors: ["annotations.json なし（注釈データが必要）"] }) : { ok: true, errors: [] };
    const okAll = v.ok && va.ok;
    r.stages.validate = okAll ? "ok" : { ok: false, errors: [...v.errors, ...va.errors.map((e) => `[注釈] ${e}`)] };
    if (okAll) {
      await fs.writeFile(`${d}/analysis.md`, analysisToMarkdown(analysis));
      await wj(`${d}/text-index.json`, buildTextIndex(analysis));
    }
    if (!okAll && stages.includes("publish")) { r.stages.publish = "blocked: analysis not complete"; return; }
  }

  if (stages.includes("publish")) {
    if (!(sel.reviewTotal >= cfg.selection.passScore)) { r.stages.publish = `blocked: 選定基準${cfg.selection.passScore}/${cfg.selection.maxScore}点が未判定または未達（review→learning.json→rescore を実行）`; return; }
    const entry = findEntry(ledger, key);
    const folder = dropboxFolder(cfg, media, args.date, disId);
    const generated = [{ local: `${d}/analysis.json`, rel: "03_Analysis/analysis.json" }, { local: `${d}/analysis.md`, rel: "03_Analysis/analysis.md" }, { local: `${d}/annotations.json`, rel: "03_Analysis/annotations.json" }, { local: `${d}/text-index.json`, rel: "03_Analysis/text-index.json" }];
    const meta = { disId, media, date: args.date, pageUrl: sel.pageUrl, sourceName: sel.sourceName, sourceDetailUrl: sel.sourceDetailUrl, brand: sel.brand, selectionReason: analysis.selectionReason, rights: analysis.rights, analysisVersion: analysis.analysisVersion, sourceAnalysisRef: analysis.sourceAnalysisRef, score: sel.score };
    await wj(`${d}/metadata.json`, meta);
    generated.push({ local: `${d}/metadata.json`, rel: "metadata.json" });
    const captured = (await readJson(`${d}/files.json`, [])) ;
    const plan = planDropboxFiles([...captured, ...generated], folder);
    const host = (u) => { try { return new URL(u).hostname; } catch { return ""; } };
    const brand = analysis.brand || sel.brand;
    const notionValues = { disId, brand, title: `${disId} ${brand}`, pageUrl: sel.pageUrl, detailUrl: sel.sourceDetailUrl, sourceName: sel.sourceName, sourceLine: `${sel.sourceName} ${sel.sourceDetailUrl}`, date: args.date, dropboxFolder: folder, summary: analysis.summary, imageUrl: sel.imageUrl, domain: host(sel.pageUrl), normalizedUrl: normalizeUrl(sel.pageUrl), key };
    const origin = captured.find((c) => /^01_Original\/banner\./.test(c.rel));
    const mime = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
    const attachFile = origin ? { path: origin.local, name: path.basename(origin.local), contentType: mime[origin.rel.split(".").pop()] || "application/octet-stream" } : null;
    const result = { dryRun: !writeOk, key, dropboxFolder: folder, dropboxPlan: plan.map((p) => p.remote), notion: { library: cfg.media[media].notion.libraryName, collection: cfg.media[media].notion.collection, title: notionValues.title, plannedProperties: Object.keys({ ...(cfg.media[media].notion.propertyMap || DEFAULT_PROPERTY_MAP), ...(analysis.notionProps || {}) }), attachment: attachFile ? `${attachFile.name}（${cfg.media[media].notion.fileProp || "列なし"}）` : null } };
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
        result.notionResult = await writeNotion({ cfg, media, values: notionValues, blocks: buildNotionBlocks(analysis, await fs.readFile(`${d}/analysis.md`, "utf8")), opts: { apply: args.apply }, extraProps: analysis.notionProps || {}, attachFile });
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
