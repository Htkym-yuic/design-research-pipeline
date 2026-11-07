import fs from "node:fs/promises";
import path from "node:path";
import { assertWritesAllowed } from "./write-guard.mjs";
import { requireEnv } from "../../lib/env.mjs";
import { appendBlockChildren, createPage, findPageByUrl, getDataSource, buildPropertyByType, headingBlock, paragraphBlock } from "../../lib/notion-client.mjs";
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

/** Notion登録用プロパティ。実スキーマにある名前・型だけ設定する（無いものは黙って省く）。 */
export function buildNotionProps(schema, v) {
  const out = {};
  const want = [
    [["タイトル", "名前", "Name"], "title", `${v.disId} ${v.brand}`],
    [["ブランド"], "rich_text", v.brand],
    [["参考URL", "URL"], "url", v.pageUrl],
    [["出典"], "rich_text", `${v.sourceName} ${v.sourceDetailUrl}`],
    [["取得日"], "date", v.date],
    [["Dropbox正本パス"], "rich_text", v.dropboxFolder],
    [["メイン訴求"], "rich_text", v.summary],
    [["進捗メモ"], "rich_text", "DIS日次学習で自動登録（要レビュー）"],
  ];
  for (const [names, type, value] of want) {
    if (!value) continue;
    const name = names.find((n) => schema[n] && (schema[n].type === type));
    if (name) out[name] = buildPropertyByType(type, value);
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

/** Notion作成専用アダプター。既存ページは編集せず、同一URLが既にあれば作成をスキップ。 */
export async function writeNotion({ cfg, media, values, blocks, opts }) {
  assertWritesAllowed(opts);
  requireEnv("NOTION_TOKEN");
  const dsId = requireEnv(cfg.media[media].notion.envVar);
  const schema = (await getDataSource(dsId)).properties || {};
  const urlProp = ["参考URL", "URL"].find((n) => schema[n]?.type === "url");
  if (urlProp) {
    const found = await findPageByUrl(dsId, urlProp, values.pageUrl);
    if (found) return { status: "skipped_exists", pageId: found.id ?? found };
  }
  // 1リクエスト100ブロックまで。新規ページ作成後、残りは同じ新規ページへ追記する（既存ページは触らない）。
  const page = await createPage(dsId, buildNotionProps(schema, values), blocks.slice(0, 95));
  for (let i = 95; i < blocks.length; i += 95) await appendBlockChildren(page.id, blocks.slice(i, i + 95));
  return { status: "created", pageId: page.id, url: page.url, blocks: blocks.length };
}
