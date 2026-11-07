import fs from "node:fs/promises";
import path from "node:path";
import { assertWritesAllowed } from "./write-guard.mjs";
import { requireEnv } from "../../lib/env.mjs";
import { createPage, findPageByUrl, getDataSource, buildPropertyByType, headingBlock, paragraphBlock } from "../../lib/notion-client.mjs";
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

export function buildNotionBlocks(a, markdownSections) {
  const blocks = [headingBlock("概要", 2), paragraphBlock(a.summary), headingBlock("選定理由", 2), paragraphBlock(a.selectionReason)];
  for (const [title, text] of markdownSections) blocks.push(headingBlock(title, 2), paragraphBlock(text.slice(0, 1900)));
  return blocks.slice(0, 95);
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
  const page = await createPage(dsId, buildNotionProps(schema, values), blocks);
  return { status: "created", pageId: page.id, url: page.url };
}
