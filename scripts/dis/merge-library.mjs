#!/usr/bin/env node
/**
 * DISの分析を、旧ライブラリーの既存ページ（Notion の LP-000n）とDropboxに、1件にまとめて反映する。
 *   - Dropbox: <日付>/dis-daily/DIS-LP-000n/ に、01_Normal_Images/・03_Analysis/analysis.json・metadata.json を「足りないものだけ」追加する（上書き・移動・削除なし）。
 *   - Notion: 既存の LP-000n ページに、DISの番号・撮り直し画像（FV・全体）・9軸分析・Unit画像を追記する。
 *       章2の旧画像（FV・全体）は、同じ場所のトグル「旧画像（アーカイブ掲載）」に再アップして残し、新しい画像を表示する。
 *       28章（章1〜29）の本文は変更しない。LP-0001 だけは、既存のDISページ（DIS-LP-0004）の冒頭に「統合済み」のリンクを追記する（削除しない）。
 * 既定はドライラン。実書込みは --apply かつ DIS_ENABLE_WRITES=true かつ DRY_RUN=false のときだけ。
 *   node scripts/dis/merge-library.mjs --id DIS-LP-0004 [--stage dropbox|notion|all] [--apply]
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { loadConfig, REPO_ROOT, readJson } from "./lib/config.mjs";
import { assertWritesAllowed, writesAllowed } from "./lib/write-guard.mjs";
import { dropboxFolder, writeDropbox, markdownToBlocks } from "./lib/adapters.mjs";
import { findItemDir } from "./import-analysis.mjs";
import { listBlockChildren, appendBlockChildren, insertBlockChildrenAfter, uploadFileForNotion, headingBlock, paragraphBlock, imageUploadBlock } from "../lib/notion-client.mjs";
import { requireEnv } from "../lib/env.mjs";
import { updateJson } from "./lib/lock.mjs";

const SLOTS = { "PC Full Page": "PC_full", "PC First View": "PC_first_view", "SP Full Page": "SP_full", "SP First View": "SP_first_view" };
const MARK = "DIS 9軸分析";
const OLD_TOGGLE = "旧画像（アーカイブ掲載・撮り直し前）";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (b) => (b?.[b.type]?.rich_text || []).map((t) => t.plain_text ?? t.text?.content ?? "").join("");
const rt = (content, link) => [{ type: "text", text: { content, ...(link ? { link: { url: link } } : {}) } }];
const notionUrl = (id) => `https://app.notion.com/p/${id.replace(/-/g, "")}`;

async function exists(p) { try { await fs.access(p); return true; } catch { return false; } }

async function walk(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.name !== ".DS_Store") out.push(p);
  }
  return out;
}

/** Dropboxに置くファイルの計画（ローカル → 相対パス）。指定の範囲: 01_Normal_Images 全部・03_Analysis/analysis.json・metadata.json。 */
export async function planFiles(itemDir) {
  const normal = path.join(itemDir, "files", "01_Normal_Images");
  const files = (await walk(normal)).sort().map((p) => ({ local: p, rel: `01_Normal_Images/${path.relative(normal, p).split(path.sep).join("/")}` }));
  files.push({ local: path.join(itemDir, "analysis.json"), rel: "03_Analysis/analysis.json" });
  files.push({ local: path.join(itemDir, "metadata.json"), rel: "metadata.json" });
  return files;
}

/** metadata.json が無い案件（旧ライブラリー取り込み）は、既存の登録処理と同じ項目で、ローカルに新規作成する。既存のファイルは触らない。 */
export async function ensureMetadata(itemDir, apply) {
  const f = path.join(itemDir, "metadata.json");
  if (await exists(f)) return { created: false };
  const a = await readJson(path.join(itemDir, "analysis.json"));
  const it = await readJson(path.join(itemDir, "item.json"));
  const meta = { disId: it.disId, media: it.media, date: it.date, captureSource: it.captureMode === "archive" ? "archive" : "live", pageUrl: it.pageUrl, sourceName: it.sourceName, sourceDetailUrl: it.sourceDetailUrl, brand: it.brand, libraryId: it.libraryId, selectionReason: a.selectionReason, rights: a.rights, analysisVersion: a.analysisVersion, sourceAnalysisRef: a.sourceAnalysisRef, score: null };
  if (apply) await fs.writeFile(f, `${JSON.stringify(meta, null, 2)}\n`);
  return { created: true };
}

async function toJpeg(src, name, { width = 1200, maxBytes = 4.5 * 1024 * 1024 } = {}) {
  const { default: sharp } = await import("sharp");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "dis-merge-"));
  const out = path.join(tmp, `${name}.jpg`);
  // Notionの1ファイルの上限は5MiB。収まるまで、幅と画質を段階的に下げる
  // JPEGは縦65,500pxまで。超える縦長の全体画像は、収まるよう幅を下げる
  const meta = await sharp(src, { limitInputPixels: false }).metadata();
  const maxW = Math.max(120, Math.floor((meta.width * 60000) / meta.height));
  for (const [w0, q] of [[width, 82], [1000, 78], [800, 74], [640, 70], [480, 65], [360, 60]]) {
    const w = Math.min(w0, maxW);
    await sharp(src, { limitInputPixels: false }).resize({ width: w, withoutEnlargement: true }).jpeg({ quality: q }).toFile(out);
    if ((await fs.stat(out)).size <= maxBytes) return out;
  }
  return out;
}

async function downloadToTemp(url, name) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`旧画像の取得に失敗（${res.status}）`);
  const buf = Buffer.from(await res.arrayBuffer());
  // 種類は、ヘッダではなく中身（先頭のバイト）で判定する。Notionは、画像の拡張子（.png/.jpg/.gif/.webp など）のファイル名しか受け付けない
  const hex = buf.subarray(0, 12).toString("hex");
  let ext = ".png", type = "image/png";
  if (hex.startsWith("ffd8ff")) { ext = ".jpg"; type = "image/jpeg"; }
  else if (hex.startsWith("89504e47")) { ext = ".png"; type = "image/png"; }
  else if (hex.startsWith("47494638")) { ext = ".gif"; type = "image/gif"; }
  else if (hex.startsWith("52494646") && buf.subarray(8, 12).toString("ascii") === "WEBP") { ext = ".webp"; type = "image/webp"; }
  else if (/^\s*(<\?xml|<svg)/i.test(buf.subarray(0, 200).toString("utf8"))) { ext = ".svg"; type = "image/svg+xml"; }
  else throw new Error(`旧画像の形式が分かりません（先頭 ${hex}）`);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "dis-old-"));
  const f = path.join(tmp, `${name}${ext}`);
  await fs.writeFile(f, buf);
  return { file: f, type };
}

async function upload(file, type = "image/jpeg") { await sleep(350); return uploadFileForNotion(file, type); }

const DIS_NUMBER_NOTE = (disId, lp) => ({ object: "block", type: "callout", callout: { icon: { type: "emoji", emoji: "🔗" }, rich_text: rt(`番号: ${lp}（旧ライブラリー）＝ ${disId}（DIS）。このページは、28章分析（章1〜29。旧ライブラリーの分析）と、DIS 9軸分析（ページ末尾。dis-2.0）を1ページにまとめたもの。2つの評価の点数は別の方法によるもので、混ぜない。`) } });

export async function mergeNotion({ disId, lp, pageId, itemDir, apply, log }) {
  const blocks = await listBlockChildren(pageId);
  const steps = [];
  const hasMark = blocks.some((b) => /^heading_/.test(b.type) && text(b).startsWith(MARK));
  const hasNote = blocks.some((b) => b.type === "callout" && text(b).includes(`${disId}（DIS）`));
  // 1) 番号の注記（基本情報の表の直後）
  const tableIdx = blocks.findIndex((b) => b.type === "table");
  const afterId = (tableIdx >= 0 ? blocks[tableIdx] : blocks[0]).id;
  steps.push({ step: "番号の注記", todo: !hasNote });
  if (apply && !hasNote) await insertBlockChildrenAfter(pageId, [DIS_NUMBER_NOTE(disId, lp)], afterId);
  // 2) 章2の画像4枠（FV・全体）
  const newImgs = path.join(itemDir, "files", "01_Normal_Images");
  for (let i = 0; i < blocks.length; i++) {
    const h = blocks[i];
    if (h.type !== "heading_3" || !SLOTS[text(h).trim()]) continue;
    const key = SLOTS[text(h).trim()];
    const src = path.join(newImgs, `${disId}_${key}.png`);
    let j = i + 1;
    while (j < blocks.length && blocks[j].type !== "image" && !/^heading_/.test(blocks[j].type)) j++;
    const old = blocks[j]?.type === "image" ? blocks[j] : null;
    const already = blocks.slice(i + 1, j + 3).some((b) => b.type === "toggle" && text(b) === OLD_TOGGLE) || (old && (old.image.caption || []).some((c) => (c.plain_text || "").includes("DIS撮り直し")));
    const todo = (await exists(src)) && old && !already;
    steps.push({ step: `画像 ${text(h).trim()}`, todo: Boolean(todo), reason: !(await exists(src)) ? "DIS側の画像なし（SP未取得）" : !old ? "旧画像ブロックなし" : already ? "実施済み" : "" });
    if (!apply || !todo) continue;
    const jpg = await toJpeg(src, `${disId}_${key}`);
    const newId = await upload(jpg);
    const dl = old.image.type === "file" ? await downloadToTemp(old.image.file.url, `old_${key}`) : null;
    const oldUp = dl ? await upload(dl.file, dl.type) : null;
    const toggle = oldUp
      ? { object: "block", type: "toggle", toggle: { rich_text: rt(OLD_TOGGLE), children: [imageUploadBlock(oldUp, `旧画像（${path.basename(dl.file)}）`)] } }
      : { object: "block", type: "toggle", toggle: { rich_text: rt(`${OLD_TOGGLE}（外部URL: ${old.image.external?.url || "不明"}）`) } };
    // 新画像とトグルを、旧画像の直後に追加 → 追加できたことを確認 → 旧画像を削除（Notionのごみ箱。復元可能）
    await insertBlockChildrenAfter(pageId, [imageUploadBlock(newId, `DIS撮り直し（${disId}）${text(h).trim()}`), toggle], old.id);
    if (!oldUp) throw new Error(`${text(h)}: 旧画像を再アップできないため、旧画像は削除しません`);
    await notionDelete(old.id);
    log.push({ disId, step: `画像差し替え ${text(h).trim()}`, ok: true });
  }
  // 3) DIS 9軸分析（末尾に追記）
  steps.push({ step: "DIS 9軸分析の追記", todo: !hasMark });
  if (apply && !hasMark) {
    const md = await fs.readFile(path.join(itemDir, "analysis.md"), "utf8");
    const out = [headingBlock(`${MARK}（dis-2.0）｜${disId}`, 2), paragraphBlock(`この見出し以降は、DISの9軸（1〜5点）による評価。上の28章分析（章1〜29）の点数とは別の方法で、混ぜない。画像は、DISで撮り直したもの（Dropbox正本: 99_Needs_Review 配下の dis-daily/${disId}/）。`), ...markdownToBlocks(md)];
    const sbu = path.join(newImgs, "sections_by_unit");
    for (const dev of ["pc", "sp"]) {
      const names = (await exists(sbu)) ? (await fs.readdir(sbu)).filter((n) => n.startsWith(`${dev}_`) && n.endsWith(".png")).sort() : [];
      if (!names.length) continue;
      out.push(headingBlock(`${dev.toUpperCase()} Unit画像（${dev}_NN_種類）`, 3));
      for (const n of names) {
        const jpg = await toJpeg(path.join(sbu, n), n.replace(/\.png$/, ""));
        out.push(imageUploadBlock(await upload(jpg), n.replace(/\.png$/, "")));
      }
    }
    const rec = (await fs.readdir(itemDir)).find((n) => /^reconciliation_.*\.md$/.test(n));
    if (rec) out.push(headingBlock(`28章とDISの食い違い（${rec.replace(/\.md$/, "")}）`, 2), ...markdownToBlocks(await fs.readFile(path.join(itemDir, rec), "utf8")));
    for (let i = 0; i < out.length; i += 90) { await appendBlockChildren(pageId, out.slice(i, i + 90)); await sleep(350); }
    log.push({ disId, step: "DIS 9軸分析の追記", blocks: out.length, ok: true });
  }
  return steps;
}

async function notionDelete(blockId) {
  const r = await fetch(`https://api.notion.com/v1/blocks/${blockId}`, { method: "DELETE", headers: { Authorization: `Bearer ${requireEnv("NOTION_TOKEN")}`, "Notion-Version": "2025-09-03" } });
  if (!r.ok) throw new Error(`ブロックの削除に失敗（${r.status}）`);
}

/** 既存のDISページ（DIS-LP-0004）の冒頭付近に、「統合済み」のリンクを追記する（削除しない）。 */
export async function noteOnDisPage({ disPageId, lpPageId, lp, disId, apply }) {
  const blocks = await listBlockChildren(disPageId);
  if (blocks.some((b) => b.type === "callout" && text(b).includes("統合済み"))) return { todo: false };
  if (apply) {
    const block = { object: "block", type: "callout", callout: { icon: { type: "emoji", emoji: "🔗" }, rich_text: [...rt(`${lp} のページに統合済み: `), ...rt(`${lp}｜LP分析`, notionUrl(lpPageId)), ...rt(`（${disId} の内容は、そのページの末尾「${MARK}」にあります。このページは削除せず残しています）`)] } };
    await insertBlockChildrenAfter(disPageId, [block], blocks[0].id);
  }
  return { todo: true };
}

async function main() {
  const { values: args } = parseArgs({ options: { id: { type: "string" }, stage: { type: "string", default: "all" }, apply: { type: "boolean", default: false } } });
  if (!args.id) throw new Error("--id DIS-LP-000n を指定");
  const cfg = await loadConfig();
  const pages = await readJson(path.join(REPO_ROOT, "data/dis-notion-pages.json"));
  const rel = (await readJson(path.join(REPO_ROOT, "data/dis-relations.json"))).relations.find((r) => r.disId === args.id && r.relation === "same_lp");
  if (!rel) throw new Error(`${args.id} に対応するLP番号がありません（same_lp のみ対象）`);
  const lp = rel.libraryId;
  const entry = pages.pages[lp] || (rel.libraryNotionPageId ? { pageId: rel.libraryNotionPageId } : null);
  if (!entry && args.stage !== "dropbox") throw new Error(`${lp} のNotionページIDが data/dis-notion-pages.json にも dis-relations.json にもありません`);
  const itemDir = await findItemDir(path.join(REPO_ROOT, "outputs/dis"), cfg, args.id);
  if (!itemDir) throw new Error(`${args.id} の案件フォルダが見つかりません`);
  const date = (await readJson(path.join(itemDir, "item.json"))).date;
  const opts = { apply: args.apply };
  const wr = writesAllowed(opts);
  if (args.apply) assertWritesAllowed(opts);
  const result = { disId: args.id, lp, dryRun: !wr, stages: {} };
  const log = [];
  if (["dropbox", "all"].includes(args.stage)) {
    const meta = await ensureMetadata(itemDir, wr);
    const plan = (await planFiles(itemDir)).map((f) => ({ local: f.local, remote: `${dropboxFolder(cfg, "lp", date, args.id)}/${f.rel}` }));
    if (!wr) result.stages.dropbox = { folder: dropboxFolder(cfg, "lp", date, args.id), files: plan.length, metadataToCreate: meta.created };
    else result.stages.dropbox = await writeDropbox({ folder: dropboxFolder(cfg, "lp", date, args.id), plan, opts, resume: true });
    if (wr) result.stages.dropbox = { status: result.stages.dropbox.status, folder: result.stages.dropbox.folder, uploaded: result.stages.dropbox.uploaded.length, skippedExisting: result.stages.dropbox.skippedExisting?.length ?? 0 };
  }
  if (["notion", "all"].includes(args.stage)) {
    result.stages.notion = await mergeNotion({ disId: args.id, lp, pageId: entry.pageId, itemDir, apply: wr, log });
    if (entry.disPageId) result.stages.disPageNote = await noteOnDisPage({ disPageId: entry.disPageId, lpPageId: entry.pageId, lp, disId: args.id, apply: wr });
  }
  if (wr) {
    await updateJson(path.join(REPO_ROOT, "data/dis-merge-log.json"), { entries: [] }, (prev) => { prev.entries.push({ at: new Date().toISOString(), ...result, log }); return prev; });
  }
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message || e); process.exit(1); });

export { toJpeg, downloadToTemp, upload, text, rt, notionUrl, exists, sleep, SLOTS, MARK, OLD_TOGGLE, notionDelete };
