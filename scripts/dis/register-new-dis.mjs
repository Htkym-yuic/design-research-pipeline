#!/usr/bin/env node
/**
 * 軽量分析だけのLP（例: LP-0216）を、DISの新しい形で、Dropbox・Notionに新規登録する。
 *   - Dropbox: <日付>/dis-daily/DIS-LP-000n/ に新規作成（画像・分析・metadata.json・28ch/）。既存フォルダがあれば中止。上書きしない
 *   - Notion:  DISのページを1つ新規作成。並び: 冒頭のコールアウト（旧LPページ・Dropboxのリンク）→ 画像（FV・全体）→ DIS 9軸分析（各Unitの下にPC→SP）→ 28章分析
 *              9軸と28章は別の見出し。点数は混ぜない。
 *   - 旧LPページ（軽量分析）: 「登録済み」のコールアウトを1つ足すだけ（既存の本文・プロパティは変えない）
 *   - data/dis-relations.json に、DISページのID・旧ページのIDを記録
 * 既定はドライラン。実書込みは --apply かつ DIS_ENABLE_WRITES=true かつ DRY_RUN=false のときだけ。
 *   node scripts/dis/register-new-dis.mjs --id DIS-LP-0184 [--apply]
 */
import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { loadConfig, REPO_ROOT, readJson } from "./lib/config.mjs";
import { assertWritesAllowed, writesAllowed } from "./lib/write-guard.mjs";
import { dropboxFolder, planDropboxFiles, writeDropbox, buildNotionProps, DEFAULT_PROPERTY_MAP } from "./lib/adapters.mjs";
import { findItemDir } from "./import-analysis.mjs";
import { mdToBlocks } from "./register-lp28.mjs";
import { checkLp28Chapter8 } from "./lib/lp28-check.mjs";
import { lp28Values } from "./lib/lp28-props.mjs";
import { disCallout, dropboxPathProp, fixExternalSyncLine, buildAnalysisBlocks, groupUnitImages, notionPageUrl } from "./lib/dis-page.mjs";
import { updateJson } from "./lib/lock.mjs";
import { toJpeg, upload, sleep, SLOTS, MARK, exists, rt } from "./merge-library.mjs";
import * as nc from "../lib/notion-client.mjs";
import { requireEnv } from "../lib/env.mjs";
import os from "node:os";

const textOf = (b) => (b?.[b.type]?.rich_text || []).map((t) => t.plain_text ?? t.text?.content ?? "").join("");
const MB = (n) => `${(n / 1e6).toFixed(1)}MB`;

/** 計画（読み取りだけ）。Dropboxに置くファイルと、Notionのページ構成を返す。 */
export async function planNewDis({ disId, itemDir, cfg, rel }) {
  const item = await readJson(path.join(itemDir, "item.json"));
  const analysis = await readJson(path.join(itemDir, "analysis.json"));
  const lp = rel.libraryId;
  const folder = dropboxFolder(cfg, "lp", item.date, disId);
  const md28 = await fs.readFile(path.join(itemDir, "28ch", `${lp}_v1.0.md`), "utf8");
  const chk = checkLp28Chapter8(md28);
  if (!chk.ok) throw new Error(`28章の第8章の書式が不正です（登録しません）:\n  ${chk.errors.join("\n  ")}`);
  const v = lp28Values({ md: md28, item, analysis, lpId: lp, disId });
  const analysisMd = fixExternalSyncLine(await fs.readFile(path.join(itemDir, "analysis.md"), "utf8"), { dropboxFolderPath: folder, lp });

  // Dropbox
  const captured = await readJson(path.join(itemDir, "files.json"), []);
  const generated = ["analysis.json", "analysis.md", "annotations.json", "text-index.json"].map((n) => ({ local: path.join(itemDir, n), rel: `03_Analysis/${n}` }));
  const metaFile = path.join(itemDir, "metadata.json");
  generated.push({ local: metaFile, rel: "metadata.json" });
  const metadata = { disId, media: "lp", date: item.date, captureSource: item.captureMode || "archive", pageUrl: item.pageUrl, sourceName: item.sourceName, sourceDetailUrl: item.sourceDetailUrl, brand: item.brand, analysisVersion: analysis.analysisVersion, relatedLp: lp };
  const plan = planDropboxFiles([...captured, ...generated], folder);
  const ch = path.join(itemDir, "28ch");
  plan.push({ local: path.join(ch, `${lp}_v1.0.md`), remote: `${folder}/28ch/${lp}_v1.0.md` });
  for (const f of (await fs.readdir(path.join(ch, "images")).catch(() => [])).sort()) plan.push({ local: path.join(ch, "images", f), remote: `${folder}/28ch/images/${f}` });
  const sizes = [];
  for (const p of plan) sizes.push(p.local === metaFile ? Buffer.byteLength(JSON.stringify(metadata, null, 2)) : (await fs.stat(p.local).catch(() => null))?.size ?? 0);
  const group = (p) => (p.remote.includes("/28ch/") ? "28ch/" : p.remote.includes("/03_Analysis/") ? "03_Analysis/" : p.remote.endsWith("/metadata.json") ? "metadata.json" : p.remote.split("/").slice(-2, -1)[0] === "sections_by_unit" ? "files/sections_by_unit/" : p.remote.includes("/sections/") ? "files/sections/" : "files/（画像・Notion用）");
  const byGroup = {};
  plan.forEach((p, i) => { const g = group(p); (byGroup[g] ||= { files: 0, bytes: 0 }); byGroup[g].files++; byGroup[g].bytes += sizes[i]; });
  const missing = plan.filter((p, i) => p.local !== metaFile && !sizes[i]).map((p) => p.remote);

  // Notion
  const sbu = path.join(itemDir, "files", "01_Normal_Images", "sections_by_unit");
  const unitNames = ((await exists(sbu)) ? await fs.readdir(sbu) : []).filter((n) => /^(pc|sp)_\d{2}_.+\.png$/.test(n)).sort();
  const slots = [];
  for (const [label, key] of Object.entries(SLOTS)) { const f = path.join(itemDir, "files", "01_Normal_Images", `${disId}_${key}.png`); if (await exists(f)) slots.push({ label, key, file: f }); }
  const title = `${disId}｜${v.brand}｜LP分析`;
  const body28 = mdToBlocks(md28);
  const countBlocks = (bl) => bl.reduce((n, b) => n + 1 + (b.table?.children?.length || 0), 0);
  return { disId, lp, item, analysis, folder, md28, analysisMd, v, title, plan, sizes, byGroup, missing, metadata, metaFile, unitNames, slots, body28, body28Blocks: countBlocks(body28), body28Images: body28.filter((b) => b.__image).length, itemDir };
}

/** Dropboxの同期フォルダ（ローカル）へ、上書きせずにコピーする。すでにフォルダがあれば中止。 */
export async function copyToLocalDropbox({ plan, folder, root }) {
  const dest = path.join(root, folder);
  if (await exists(dest)) throw new Error(`同期フォルダに、すでに ${dest} があります。何もコピーしません`);
  const copied = [];
  for (const p of plan) {
    const to = path.join(root, p.remote);
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.copyFile(p.local, to, fsConstants.COPYFILE_EXCL); // 既存ファイルがあればエラー（上書きしない）
    copied.push({ remote: p.remote, bytes: (await fs.stat(p.local)).size });
  }
  return { dest, copied };
}

/** 同期の完了を、Dropbox側の一覧（読み取りのみ）で確かめる。全ファイルが、同じ大きさで見えるまで待つ。 */
export async function waitForSync({ copied, folder, listFolder, timeoutSec = 900, intervalSec = 15, log = () => {} }) {
  const want = new Map(copied.map((c) => [c.remote, c.bytes]));
  const t0 = Date.now();
  for (;;) {
    const seen = new Map();
    const walk = async (dir) => { for (const e of await listFolder(dir)) { if (e.tag === "folder") await walk(e.path); else seen.set(e.path, e.size); } };
    await walk(folder).catch(() => {});
    const lower = new Map([...seen].map(([k, v]) => [k.toLowerCase(), v]));
    const missing = [...want].filter(([k, v]) => lower.get(k.toLowerCase()) !== v);
    log(`同期待ち: ${want.size - missing.length}/${want.size}`);
    if (!missing.length) return { ok: true, sec: Math.round((Date.now() - t0) / 1000) };
    if (Date.now() - t0 > timeoutSec * 1000) return { ok: false, missing: missing.map(([k]) => k).slice(0, 5), sec: Math.round((Date.now() - t0) / 1000) };
    await sleep(intervalSec * 1000);
  }
}

async function main() {
  const { values: args } = parseArgs({ options: { id: { type: "string" }, apply: { type: "boolean", default: false }, dropbox: { type: "string", default: "api" } } });
  if (!args.id) throw new Error("--id DIS-LP-000n を指定");
  const disId = args.id;
  const cfg = await loadConfig();
  const relFile = await readJson(path.join(REPO_ROOT, "data/dis-relations.json"));
  const rel = relFile.relations.find((r) => r.disId === disId && r.relation === "same_lp");
  if (!rel) throw new Error(`${disId} に対応するLP番号がありません`);
  const itemDir = await findItemDir(path.join(REPO_ROOT, "outputs/dis"), cfg, disId);
  const P = await planNewDis({ disId, itemDir, cfg, rel });
  const wr = writesAllowed({ apply: args.apply });
  const dsId = requireEnv(cfg.media.lp.notion.envVar);
  const oldPageHit = rel.libraryNotionPageId ? { id: rel.libraryNotionPageId } : await nc.findPageByMatchProperty(dsId, await nc.loadLpPropertyConfig(), P.lp);
  if (!oldPageHit) throw new Error(`${P.lp} の旧Notionページが見つかりません`);
  const oldPageId = oldPageHit.id;
  const oldBlocks = await nc.listBlockChildren(oldPageId);
  const dup = await nc.findPageByProperty(dsId, "タイトル", "title", P.title);
  if (dup) throw new Error(`同じタイトルのNotionページが既にあります（${dup.id ?? dup}）。何も作りません`);
  if (rel.disNotionPageId) throw new Error(`${disId} は、すでにNotionページ（${rel.disNotionPageId}）が記録されています。何も作りません`);
  const summary = {
    mode: wr ? "APPLY" : "DRY_RUN", disId, lp: P.lp, oldPageId, oldBlocks: oldBlocks.length,
    dropbox: { folder: P.folder, files: P.plan.length, bytes: P.sizes.reduce((a, b) => a + b, 0), groups: Object.fromEntries(Object.entries(P.byGroup).map(([k, g]) => [k, `${g.files}件 ${MB(g.bytes)}`])), missingLocalFiles: P.missing },
    notion: { title: P.title, unitImages: P.unitNames.length, units: Object.keys(groupUnitImages(P.unitNames)).length, slotImages: P.slots.map((s) => s.key), body28Blocks: P.body28Blocks, body28Images: P.body28Images, props: { ...P.v.props, タイトル: P.title, Dropbox正本パス: `リンク（${P.folder}）`, Notion同期: "チェック" } },
    oldPageAppend: "表の直後に、登録済みのコールアウトを1つ足す（既存の本文・プロパティは変えない）",
  };
  if (!wr) { console.log(JSON.stringify(summary, null, 2)); console.log("\nドライラン: 書込みはしていません。"); return; }
  assertWritesAllowed({ apply: args.apply });
  if (P.missing.length) throw new Error(`ローカルに無いファイルがあります: ${P.missing.slice(0, 3).join(", ")}`);

  // 1) Dropbox（新規のみ。既存フォルダがあれば中止）
  await fs.writeFile(P.metaFile, `${JSON.stringify(P.metadata, null, 2)}\n`);
  await fs.writeFile(path.join(P.itemDir, "analysis.md"), P.analysisMd);
  let dbx;
  if (args.dropbox === "local") {
    // ローカルの同期フォルダへ、上書きせずにコピー → 同期の完了を確かめてから、Notionへ進む
    const root = process.env.DROPBOX_LOCAL_ROOT || path.join(os.homedir(), "Dropbox");
    const { copied } = await copyToLocalDropbox({ plan: P.plan, folder: P.folder, root });
    const { listFolder } = await import("../lib/dropbox-client.mjs");
    const sync = await waitForSync({ copied, folder: P.folder, listFolder, log: (m) => console.error(m) });
    if (!sync.ok) throw new Error(`Dropboxの同期が完了していません（${sync.sec}秒待ち。足りない例: ${sync.missing.join(", ")}）。Notionには書いていません`);
    dbx = { status: "created", uploaded: copied.map((c) => c.remote), syncSec: sync.sec };
  } else {
    dbx = await writeDropbox({ folder: P.folder, plan: P.plan, opts: { apply: true } });
    if (dbx.status !== "created") throw new Error(`Dropbox: ${dbx.status}（${dbx.folder}）。Notionには書いていません`);
  }

  // 2) Notion（新規ページ1つ）。旧ページへのリンク・Dropboxのリンクは、冒頭のコールアウトへ
  const img = path.join(P.itemDir, "files", "01_Normal_Images");
  const up = async (file, name) => upload(await toJpeg(file, name));
  const blocks = [disCallout({ disId, lp: P.lp, oldPageId, dropboxFolderPath: P.folder })];
  if (P.slots.length) {
    blocks.push(nc.headingBlock("画像（DIS）：ファーストビュー・全体", 2));
    for (const s of P.slots) { blocks.push(nc.headingBlock(s.label, 3), nc.imageUploadBlock(await up(s.file, `${disId}_${s.key}`), `DIS画像（${disId}）${s.label}`)); }
  }
  blocks.push(nc.headingBlock(`${MARK}（dis-2.0）｜${disId}`, 2), nc.paragraphBlock("この見出しは、DISの9軸（1〜5点）による評価。下の「28章分析」の点数とは別の方法で、混ぜない。"));
  const ready = {};
  for (const n of P.unitNames) { const k = n.replace(/\.png$/, ""); ready[k] = nc.imageUploadBlock(await up(path.join(img, "sections_by_unit", n), k), k); }
  const placed = buildAnalysisBlocks(P.analysisMd, groupUnitImages(P.unitNames), (n) => ready[n]);
  if (placed.orphans.length) throw new Error(`対応するUnitが分析に無い画像: ${placed.orphans.join(", ")}。Notionには書いていません`);
  blocks.push(...placed.blocks);
  blocks.push(nc.headingBlock(`28章分析｜${P.lp}（統一28章 v4.0）`, 1), nc.paragraphBlock(`以下は、${P.lp} の28章分析（v1.0。DISの分析から作成）。上のDIS 9軸分析とは評価の方法が違うため、点数は混ぜない。`));
  for (const b of P.body28) {
    if (!b.__image) { blocks.push(b); continue; }
    const f = path.join(P.itemDir, "28ch", b.__image.rel);
    blocks.push(nc.imageUploadBlock(await up(f, path.basename(f).replace(/\.[^.]+$/, "")), b.__image.caption));
  }
  const schema = (await nc.getDataSource(dsId)).properties || {};
  const skipped = [];
  const values = { title: P.title, brand: P.v.brand, pageUrl: P.item.sourceDetailUrl, sourceLine: P.v.props["出典"], date: P.v.date, dropboxFolder: P.folder, summary: P.v.props["メイン訴求"] };
  const props = buildNotionProps(schema, values, DEFAULT_PROPERTY_MAP, { ...P.analysis.notionProps, 進捗メモ: P.v.props["進捗メモ"] }, skipped);
  props["Dropbox正本パス"] = dropboxPathProp(P.folder);
  if (schema["Notion同期"]?.type === "checkbox") props["Notion同期"] = { checkbox: true };
  const page = await nc.createPage(dsId, props, blocks.slice(0, 30));
  try {
    for (let i = 30; i < blocks.length; i += 30) { await nc.appendBlockChildren(page.id, blocks.slice(i, i + 30)); await sleep(350); }
  } catch (e) {
    await nc.notionFetch(`/pages/${page.id}`, { method: "PATCH", body: JSON.stringify({ in_trash: true }) }).catch(() => {});
    throw new Error(`${disId}: 途中で失敗したため、作りかけの新ページ（${page.id}）をごみ箱へ移しました（Dropboxは作成済み）: ${e.message}`);
  }

  // 3) 旧LPページ（軽量分析）に、登録済みのコールアウトを1つ足す（既存の本文は変えない）
  const note = [...rt(`${disId} のページに登録済み（DISの9軸分析と28章分析を1ページにまとめている。このページは、軽量分析の記録として残している）: `), ...rt(disId, notionPageUrl(page.id))];
  const anchor = oldBlocks.find((b) => b.type === "table") || oldBlocks[0];
  await nc.insertBlockChildrenAfter(oldPageId, [{ object: "block", type: "callout", callout: { icon: { type: "emoji", emoji: "➡️" }, rich_text: note } }], anchor.id);

  // 4) 記録
  await updateJson(path.join(REPO_ROOT, "data/dis-relations.json"), { relations: [] }, (r) => {
    const r0 = r.relations.find((x) => x.disId === disId && x.relation === "same_lp");
    r0.disNotionPageId = page.id; r0.libraryNotionPageId = oldPageId;
    r0.lp28 = { version: "v1.0", status: "registered", registeredAt: new Date().toISOString().slice(0, 10), dropboxFolder: `${P.folder}/28ch`, notionPageId: page.id, note: "28章はDISページの中（28章分析の見出し）" };
    return r;
  });
  await updateJson(path.join(REPO_ROOT, "data/dis-merge-log.json"), { entries: [] }, (prev) => { prev.entries.push({ at: new Date().toISOString(), kind: "register-new-dis", disId, lp: P.lp, status: "done", pageId: page.id, oldPageId, dropboxFolder: P.folder, files: P.plan.length, blocks: blocks.length }); return prev; });
  console.log(JSON.stringify({ ...summary, result: { dropbox: { status: dbx.status, uploaded: dbx.uploaded.length }, notion: { pageId: page.id, url: page.url, blocks: blocks.length, skippedProps: skipped } } }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message || e); process.exit(1); });
