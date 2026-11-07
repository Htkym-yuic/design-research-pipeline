import fs from "node:fs/promises";
import path from "node:path";
import { assertWritesAllowed } from "./write-guard.mjs";
import { requireEnv } from "../../lib/env.mjs";
import { appendBlockChildren, createPage, findPageByUrl, getDataSource, buildPropertyByType, headingBlock, paragraphBlock, uploadFileForNotion } from "../../lib/notion-client.mjs";
import { ensureFolder, pathExists, uploadFileNoOverwrite } from "../../lib/dropbox-client.mjs";

/** Dropbox保存先。99_Needs_Review/<日付>/dis-daily/<DIS-ID>/ （新規フォルダーのみ） */
export function dropboxFolder(cfg, media, date, disId, env = process.env) {
  const root = env[cfg.dropbox.rootEnv] || cfg.dropbox.defaultRoot;
  return `${root}/${cfg.media[media].library}/${cfg.dropbox.reviewFolder}/${date}/${cfg.dropbox.subFolder}/${disId}`;
}

/** 計画（書込みなし）。ファイル → Dropbox相対パスの対応を返す。 */
export function planDropboxFiles(files, folder) {
  return files.map((f) => ({ local: f.local, remote: `${folder}/${f.rel}` }));
}

/**
 * Dropbox作成専用アダプター。上書き・移動・削除は一切しない。
 * 既存フォルダーがあれば（自分の台帳完了分を除き）中止する。
 */
export async function writeDropbox({ folder, plan, opts, ledgerDone = false }) {
  assertWritesAllowed(opts);
  if (ledgerDone) return { status: "skipped_already_done", folder };
  if (await pathExists(folder)) return { status: "aborted_folder_exists", folder };
  await ensureFolder(folder);
  const uploaded = [];
  for (const p of plan) {
    await ensureFolder(path.posix.dirname(p.remote));
    await uploadFileNoOverwrite(p.remote, await fs.readFile(p.local));
    uploaded.push(p.remote);
  }
  return { status: "created", folder, uploaded };
}

/** 既定の対応表（LPライブラリー向け）。他の媒体は config.media.<m>.notion.propertyMap で上書きする。値の指定: 値のキー名 / "=リテラル" / 配列（リテラル）。 */
export const DEFAULT_PROPERTY_MAP = {
  "タイトル": "title", "ブランド": "brand", "参考URL": "pageUrl", "出典": "sourceLine", "取得日": "date",
  "Dropbox正本パス": "dropboxFolder", "メイン訴求": "summary", "進捗メモ": "=DIS日次学習で自動登録（要レビュー）",
};

export function resolveSpec(spec, v) {
  if (Array.isArray(spec)) return spec;
  if (typeof spec !== "string") return undefined;
  return spec.startsWith("=") ? spec.slice(1) : v[spec];
}

const optionNames = (prop) => (prop?.[prop.type]?.options || []).map((o) => o.name);

/**
 * Notion登録用プロパティを、実際の列の型に合わせて組み立てる。
 * 無い列・対応しない型・選択肢にない値は、黙って省く（既存の列や選択肢は変更しない）。
 * 戻り値の skipped に、省いた列と理由を残す。
 */
export function buildNotionProps(schema, v, map = DEFAULT_PROPERTY_MAP, extra = {}, skipped = []) {
  const out = {};
  for (const [col, spec] of Object.entries({ ...map, ...Object.fromEntries(Object.entries(extra).map(([k, val]) => [k, Array.isArray(val) ? val : `=${val}`])) })) {
    const prop = schema[col];
    if (!prop) { skipped.push({ col, reason: "列なし" }); continue; }
    const value = resolveSpec(spec, v);
    if (value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length)) continue;
    const type = prop.type;
    if (!["title", "rich_text", "url", "date", "select", "multi_select", "status", "checkbox"].includes(type)) { skipped.push({ col, reason: `未対応の型 ${type}` }); continue; }
    if (["select", "status", "multi_select"].includes(type)) {
      const names = optionNames(prop);
      const vals = Array.isArray(value) ? value : [value];
      const ok = vals.filter((x) => names.includes(String(x)));
      if (ok.length !== vals.length) skipped.push({ col, reason: `選択肢にない値: ${vals.filter((x) => !ok.includes(x)).join(",")}` });
      if (!ok.length) continue;
      out[col] = buildPropertyByType(type, type === "multi_select" ? ok : ok[0]);
      continue;
    }
    const text = Array.isArray(value) ? value.join(", ") : value;
    const maxLen = type === "rich_text" || type === "title" ? 1900 : 2000;
    out[col] = buildPropertyByType(type, String(text).slice(0, maxLen));
  }
  return out;
}

/** Notionのrich_textは1要素2000文字まで。行単位で1900文字以内に分割する（切り捨てない）。 */
export function chunkText(text, max = 1900) {
  const out = [];
  let cur = "";
  const push = () => { if (cur.trim()) out.push(cur.trimEnd()); cur = ""; };
  for (let line of String(text).split("\n")) {
    while (line.length > max) { push(); out.push(line.slice(0, max)); line = line.slice(max); }
    if (cur.length + line.length + 1 > max) push();
    cur += line + "\n";
  }
  push();
  return out;
}

const rt = (text) => [{ type: "text", text: { content: text } }];
const plain = (t) => t.replace(/\*\*(.+?)\*\*/g, "$1").trim();
const block = (type, text) => ({ object: "block", type, [type]: { rich_text: rt(text) } });

/** 分析のMarkdownをNotionブロックへ変換（見出し・箇条書き・番号リスト・表→箇条書き）。長文は1900文字で分割し、切り捨てない。 */
export function markdownToBlocks(md) {
  const blocks = [];
  const push = (type, text) => { for (const c of chunkText(text)) blocks.push(block(type, c)); };
  let skippedTitle = false;
  for (const raw of String(md).split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    let m;
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
      if (m[1].length === 1 && !skippedTitle) { skippedTitle = true; continue; } // ページ名と重複するため先頭H1は省く
      push(`heading_${Math.min(m[1].length + (m[1].length === 1 ? 1 : 0), 3)}`, plain(m[2]));
    } else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) push("bulleted_list_item", plain(m[1]));
    else if ((m = line.match(/^\s*\d+\.\s+(.*)$/))) push("numbered_list_item", plain(m[1]));
    else if (line.startsWith("|")) {
      const cells = line.split("|").slice(1, -1).map((c) => plain(c));
      if (cells.every((c) => /^-+$/.test(c))) continue; // 区切り行
      if (cells[0] === "軸") continue; // 表見出し行
      const [axis, score, conf, evidence, unverified] = cells;
      push("bulleted_list_item", `${axis}（評価 ${score} ／ 確信度 ${conf}）根拠: ${evidence} ／ 未確認: ${unverified}`);
    } else push("paragraph", plain(line));
  }
  return blocks;
}

export function buildNotionBlocks(a, markdown) {
  return markdownToBlocks(markdown);
}

/** Notion作成専用アダプター。既存ページは編集せず、同じURLのページが既にあれば作成をスキップ。 */
export async function writeNotion({ cfg, media, values, blocks, opts, extraProps = {}, attachFile = null }) {
  assertWritesAllowed(opts);
  requireEnv("NOTION_TOKEN");
  const ncfg = cfg.media[media].notion;
  const dsId = requireEnv(ncfg.envVar);
  const schema = (await getDataSource(dsId)).properties || {};
  for (const col of ncfg.urlProps || ["参考URL", "URL"]) {
    if (schema[col]?.type !== "url") continue;
    for (const u of [values.pageUrl, values.detailUrl].filter(Boolean)) {
      const found = await findPageByUrl(dsId, col, u);
      if (found) return { status: "skipped_exists", pageId: found.id ?? found, matchedBy: `${col}=${u}` };
    }
  }
  const skipped = [];
  const props = buildNotionProps(schema, values, ncfg.propertyMap || DEFAULT_PROPERTY_MAP, extraProps, skipped);
  let attachment = null;
  if (attachFile && ncfg.fileProp && schema[ncfg.fileProp]?.type === "files") {
    try {
      const id = await uploadFileForNotion(attachFile.path, attachFile.contentType);
      props[ncfg.fileProp] = { files: [{ name: attachFile.name, type: "file_upload", file_upload: { id } }] };
      attachment = "attached";
    } catch (e) { attachment = `failed: ${e.message}`; }
  }
  // 1リクエスト100ブロックまで。新規ページ作成後、残りは同じ新規ページへ追記する（既存ページは触らない）。
  const page = await createPage(dsId, props, blocks.slice(0, 95));
  for (let i = 95; i < blocks.length; i += 95) await appendBlockChildren(page.id, blocks.slice(i, i + 95));
  return { status: "created", pageId: page.id, url: page.url, blocks: blocks.length, skippedProps: skipped, attachment };
}
