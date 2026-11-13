#!/usr/bin/env node
/**
 * 28章（LP-nnnn_v1.0.md）を、Dropbox（正本）とNotion（ライブラリーのページ＋分割の子ページ）へ、新規に登録する。
 *   - Dropbox: 新規ファイルのみ（uploadFileNoOverwrite。既存は上書きしない）
 *   - Notion: 「01｜LPリサーチライブラリー」に、`LP-nnnn｜ブランド｜LP分析` を新規作成（Part1＝ヘッダー＋章1〜7）。
 *             章8前半・章8後半・章9〜28は、Part1の子ページ。「✅ 分析表記済み」の台帳反映の子ページも作る。
 *     同じタイトルのページがあれば、作らない。既存のページは変更しない。
 * 既定はドライラン（書込みなし。計画だけ出す）。実書込みは --apply かつ DIS_ENABLE_WRITES=true かつ DRY_RUN=false のときだけ。
 *   node scripts/dis/register-lp28.mjs --id DIS-LP-0001 [--apply]
 */
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { loadConfig, REPO_ROOT } from "./lib/config.mjs";
import { assertWritesAllowed, writesAllowed } from "./lib/write-guard.mjs";
import { findItemDir } from "./import-analysis.mjs";
import { checkLp28Chapter8 } from "./lib/lp28-check.mjs";
import { lp28Values, stampMarkdown } from "./lib/lp28-props.mjs";

const rtChunks = (text, max = 1900) => {
  const t = String(text ?? "").replace(/\*\*(.+?)\*\*/g, "$1");
  const out = [];
  for (let i = 0; i < t.length; i += max) out.push({ type: "text", text: { content: t.slice(i, i + max) } });
  return out.length ? out : [{ type: "text", text: { content: "" } }];
};
const textBlock = (type, text) => ({ object: "block", type, [type]: { rich_text: rtChunks(text) } });

/** Markdown → Notionのブロック。画像は {__image:{rel,caption}} の目印にし、書込み時にアップロードして差し替える。表は、表ブロック（行は子）にする。 */
export function mdToBlocks(md) {
  const lines = String(md).split("\n");
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    if (!line.trim()) continue;
    let m;
    if (/^---+$/.test(line.trim())) { blocks.push({ object: "block", type: "divider", divider: {} }); continue; }
    if ((m = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/))) { blocks.push({ __image: { rel: m[2], caption: m[1] } }); continue; }
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { if (m[1].length === 1) continue; blocks.push(textBlock(`heading_${m[1].length}`, m[2])); continue; }
    if (line.startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].trimStart().startsWith("|")) { rows.push(lines[i].trim()); i++; }
      i--;
      const cells = (r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const data = rows.filter((r) => !cells(r).every((c) => /^:?-{2,}:?$/.test(c))).map(cells);
      const width = Math.max(...data.map((r) => r.length));
      blocks.push({ object: "block", type: "table", table: { table_width: width, has_column_header: true, has_row_header: false, children: data.map((r) => ({ object: "block", type: "table_row", table_row: { cells: Array.from({ length: width }, (_, k) => rtChunks(r[k] ?? "")) } })) } });
      continue;
    }
    if ((m = line.match(/^>\s?(.*)$/))) { blocks.push(textBlock("quote", m[1])); continue; }
    if ((m = line.match(/^\s*[-*]\s+(.*)$/))) { blocks.push(textBlock("bulleted_list_item", m[1])); continue; }
    if ((m = line.match(/^\s*\d+\.\s+(.*)$/))) { blocks.push(textBlock("numbered_list_item", m[1])); continue; }
    blocks.push(textBlock("paragraph", line));
  }
  return blocks;
}

/** 28章のMarkdownを、Part1（ヘッダー＋章1〜7）／Part2（章8前半）／Part3（章8後半）／Part4（章9〜28）に分ける。 */
export function splitParts(md) {
  const s = String(md);
  const i8 = s.search(/^## 8\. /m), i4 = s.search(/^### Section 04/m), i9 = s.search(/^## 9\. /m);
  if (i8 < 0 || i4 < 0 || i9 < 0 || !(i8 < i4 && i4 < i9)) throw new Error("章8・章9の見出しが見つかりません（28章の形式を確認）");
  return { part1: s.slice(0, i8), part2: s.slice(i8, i4), part3: s.slice(i4, i9), part4: s.slice(i9) };
}

const countBlocks = (blocks) => blocks.reduce((n, b) => n + 1 + (b.table?.children?.length || 0), 0);

export async function planLp28({ itemDir, lpId, disId, entry, rel }) {
  const md = await fs.readFile(path.join(itemDir, "28ch", `${lpId}_v1.0.md`), "utf8");
  // 登録の前に、第8章の書式を検証する（項目1〜15が別の行・項目15に20字以上の繰り返しが無い）。NGなら、何も作らず止める
  const chk = checkLp28Chapter8(md);
  if (!chk.ok) throw new Error(`28章の第8章の書式が不正です（登録しません）:\n  ${chk.errors.join("\n  ")}`);
  const parts = splitParts(md);
  const item = await readItem(itemDir);
  const analysis = JSON.parse(await fs.readFile(path.join(itemDir, "analysis.json"), "utf8").catch(() => "{}"));
  const v = lp28Values({ md, item, analysis, lpId, disId });
  const { brand, date } = v;
  if (!date) throw new Error("取得日（item.json の date）が分かりません。登録しません");
  const dropboxBase = `/design/Design_Research_Library/LP_Research_Library/99_Needs_Review/${date}/lp28-${lpId}/${lpId}-${brand}`;
  const files = [];
  const add = async (local, remote, kind) => { try { const st = await fs.stat(local); files.push({ local, remote: `${dropboxBase}/${remote}`, bytes: st.size, kind }); } catch { /* 無ければ除外 */ } };
  const img = path.join(itemDir, "28ch", "images");
  await add(path.join(itemDir, "28ch", `${lpId}_v1.0.md`), `03_Analysis/${lpId}_v1.0.md`, "28章Markdown");
  await add(path.join(itemDir, "28ch", `${lpId}_v1.0.html`), `03_Analysis/${lpId}_v1.0.html`, "1ページ完全版HTML");
  for (const f of (await fs.readdir(img).catch(() => [])).sort()) await add(path.join(img, f), `01_Normal_Images/${/^pc_|^sp_/.test(f) ? "sections_by_unit/" : ""}${f}`, "画像");
  const meta = { lpId, disId, brand, version: "v1.0", date, archiveUrl: item.sourceDetailUrl || rel?.canonicalKey, note: `${v.headerStatus || "28章 v1.0"}。DISとの対応は data/dis-relations.json` };
  const title = v.props["タイトル"];
  const props = { ...v.props, Dropbox正本パス: dropboxBase };
  const pages = [
    { name: `Part1（ヘッダー＋章1〜7）`, title, md: parts.part1, parent: "library" },
    { name: "Part2（章8前半：Section 01〜03）", title: `${lpId}｜章8 全Section分析（前半：01〜03）`, md: parts.part2, parent: "part1" },
    { name: "Part3（章8後半：Section 04〜06）", title: `${lpId}｜章8 全Section分析（後半：04〜06）`, md: parts.part3, parent: "part1" },
    { name: "Part4（章9〜28＋✅マーク）", title: `${lpId}｜章9〜28`, md: parts.part4, parent: "part1" },
  ].map((p) => { const blocks = mdToBlocks(p.md); return { ...p, blocks, blockCount: countBlocks(blocks), images: blocks.filter((b) => b.__image).length }; });
  const stamp = { title: `✅ 分析表記済み｜${lpId} 台帳反映`, md: stampMarkdown({ lpId, disId, date, sections: v.sections, status: v.status, dropboxBase }) };
  return { md, title, props, files, meta, pages, stamp, dropboxBase };
}

async function readItem(itemDir) { try { return JSON.parse(await fs.readFile(path.join(itemDir, "item.json"), "utf8")); } catch { return {}; } }

async function main() {
  const { values } = parseArgs({ options: { id: { type: "string" }, apply: { type: "boolean", default: false }, out: { type: "string" } } });
  if (!values.id) throw new Error("--id（例: DIS-LP-0001）が必要です");
  const cfg = await loadConfig();
  const itemDir = await findItemDir(values.out || path.join(REPO_ROOT, "outputs/dis"), cfg, values.id);
  const relFile = JSON.parse(await fs.readFile(path.join(REPO_ROOT, "data/dis-relations.json"), "utf8"));
  const rel = relFile.relations.find((r) => r.disId === values.id);
  if (!rel?.libraryId) throw new Error(`${values.id} の LP番号が、data/dis-relations.json にありません`);
  const plan = await planLp28({ itemDir, lpId: rel.libraryId, disId: values.id, rel });
  const summary = { mode: writesAllowed({ apply: values.apply }) ? "APPLY" : "DRY_RUN", lpId: rel.libraryId, notionTitle: plan.title, dropboxBase: plan.dropboxBase, dropboxFiles: plan.files.length, dropboxBytes: plan.files.reduce((n, f) => n + f.bytes, 0), notionPages: plan.pages.map((p) => ({ name: p.name, title: p.title, parent: p.parent, blocks: p.blockCount, images: p.images })), props: plan.props };
  if (!writesAllowed({ apply: values.apply })) { console.log(JSON.stringify(summary, null, 2)); console.log("\nドライラン: 書込みはしていません。実行は --apply ＋ DIS_ENABLE_WRITES=true ＋ DRY_RUN=false。"); return; }
  assertWritesAllowed({ apply: values.apply });
  const { ensureFolder, pathExists, uploadFileNoOverwrite } = await import("../lib/dropbox-client.mjs");
  const nc = await import("../lib/notion-client.mjs");
  const { requireEnv } = await import("../lib/env.mjs");
  const result = { dropbox: { uploaded: [], skippedExisting: [] }, notion: {} };

  // Notionに、同じタイトルのページがあれば、何も作らない（Dropboxにも書く前に確認）
  const dsId = requireEnv(cfg.media.lp.notion.envVar);
  const dup = await nc.findPageByProperty(dsId, "タイトル", "title", plan.title);
  if (dup) throw new Error(`同じタイトルのNotionページが既にあります（${dup.id ?? dup}）。何も作りません`);

  // 1) Dropbox（新規のみ）
  const folders = new Set(plan.files.map((f) => path.posix.dirname(f.remote)));
  for (const d of [...folders].sort()) await ensureFolder(d);
  for (const f of plan.files) {
    if (await pathExists(f.remote)) { result.dropbox.skippedExisting.push(f.remote); continue; }
    await uploadFileNoOverwrite(f.remote, await fs.readFile(f.local));
    result.dropbox.uploaded.push(f.remote);
  }
  await uploadFileNoOverwrite(`${plan.dropboxBase}/metadata.json`, Buffer.from(`${JSON.stringify(plan.meta, null, 2)}\n`)).catch(() => {});

  // 2) Notion
  const schema = (await nc.getDataSource(dsId)).properties || {};
  const opts = (p) => (p?.[p.type]?.options || []).map((o) => o.name);
  const props = {}; const skipped = [];
  for (const [col, v] of Object.entries(plan.props)) {
    const p = schema[col];
    if (!p) { skipped.push(`${col}: 列なし`); continue; }
    if (["select", "status", "multi_select"].includes(p.type)) {
      const names = opts(p); const vals = (Array.isArray(v) ? v : [v]).filter((x) => names.includes(x));
      if (vals.length !== (Array.isArray(v) ? v : [v]).length) skipped.push(`${col}: 選択肢にない値あり`);
      if (!vals.length) continue;
      props[col] = nc.buildPropertyByType(p.type, p.type === "multi_select" ? vals : vals[0]);
    } else if (["title", "rich_text", "url", "date"].includes(p.type)) props[col] = nc.buildPropertyByType(p.type, String(v).slice(0, 1900));
    else skipped.push(`${col}: 未対応の型 ${p.type}`);
  }
  const resolve = async (blocks) => {
    const out = [];
    for (const b of blocks) {
      if (!b.__image) { out.push(b); continue; }
      const file = path.join(itemDir, "28ch", b.__image.rel);
      const ct = /\.png$/i.test(file) ? "image/png" : "image/jpeg";
      out.push(nc.imageUploadBlock(await nc.uploadFileForNotion(file, ct), b.__image.caption));
    }
    return out;
  };
  const fill = async (pageId, blocks, firstN) => { for (let i = firstN; i < blocks.length; i += 30) await nc.appendBlockChildren(pageId, blocks.slice(i, i + 30)); };
  const [p1, ...rest] = plan.pages;
  const b1 = await resolve(p1.blocks);
  const page1 = await nc.createPage(dsId, props, b1.slice(0, 30));
  await fill(page1.id, b1, 30);
  result.notion = { part1: { id: page1.id, url: page1.url }, children: [], skippedProps: skipped };
  for (const p of rest) {
    const bl = await resolve(p.blocks);
    const child = await nc.createChildPage(page1.id, p.title, bl.slice(0, 30));
    await fill(child.id, bl, 30);
    result.notion.children.push({ title: p.title, id: child.id });
  }
  const stampBlocks = mdToBlocks(plan.stamp.md);
  const stamp = await nc.createChildPage(page1.id, plan.stamp.title, stampBlocks);
  result.notion.children.push({ title: plan.stamp.title, id: stamp.id });
  relFile.relations.find((r) => r.disId === values.id).lp28 = { ...(rel.lp28 || {}), version: "v1.0", status: "registered", registeredAt: new Date().toISOString().slice(0, 10), dropboxFolder: plan.dropboxBase, notionPageId: page1.id };
  await fs.writeFile(path.join(REPO_ROOT, "data/dis-relations.json"), `${JSON.stringify(relFile, null, 2)}\n`);
  console.log(JSON.stringify({ ...summary, result }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
