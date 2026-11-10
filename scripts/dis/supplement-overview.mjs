#!/usr/bin/env node
/**
 * 登録済みの案件に、「Sectionごとの全体図」を後から追加する。
 *  - Dropbox: <案件フォルダ>/02_Notion_Images/<ID>_PC_units_notion.jpg を新規ファイルとして追加（すでにあればスキップ。上書きしない）
 *  - Notion: 本文の見出し「画像（Notion用の軽量版。正本はDropbox）」の直後に、全体図を1枚追加する。既存の画像・本文は変更・削除しない。
 * 事前に、分析に roleType・regions があり、`--stage crop` で全体図ができていること。
 * 既定はドライラン。実書込みは --apply かつ DIS_ENABLE_WRITES=true かつ DRY_RUN=false のときだけ。
 *   node scripts/dis/supplement-overview.mjs --id DIS-LP-0002 [--apply]
 */
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { loadConfig, REPO_ROOT } from "./lib/config.mjs";
import { loadLedger, saveLedger } from "./lib/ledger.mjs";
import { assertWritesAllowed, writesAllowed } from "./lib/write-guard.mjs";
import { findItemDir } from "./import-analysis.mjs";
import { OVERVIEW_KEY, OVERVIEW_CAPTION } from "./lib/overview.mjs";

export const NOTION_IMAGE_HEADING = "画像（Notion用の軽量版。正本はDropbox）";

/** 追加する計画（ローカルの全体図と、Dropbox上の新しいパス）。読み取りのみ。 */
export async function planOverviewUpload({ entry, itemDir }) {
  if (!entry?.dropbox?.folder) throw new Error("台帳に、Dropboxの保存先がありません（登録済みの案件のみ対象）");
  if (!entry?.notion?.pageId) throw new Error("台帳に、Notionのページがありません（登録済みの案件のみ対象）");
  const name = `${entry.disId}_${OVERVIEW_KEY}_notion.jpg`;
  const local = path.join(itemDir, "files", "02_Notion_Images", name);
  try { await fs.access(local); } catch { throw new Error(`全体図がありません: ${local}（先に分析へ roleType・regions を書き、--stage crop を実行）`); }
  return { local, name, remote: `${entry.dropbox.folder}/02_Notion_Images/${name}`, pageId: entry.notion.pageId };
}

const blockText = (b) => (b?.[b.type]?.rich_text || []).map((t) => t.plain_text ?? t.text?.content ?? "").join("");

/** 既存の本文から、挿入位置（見出しのブロックID）と、すでに全体図があるかを調べる。 */
export function findInsertPoint(children) {
  const heading = children.find((b) => b.type === "heading_2" && blockText(b).startsWith("画像（Notion用"));
  const exists = children.some((b) => b.type === "image" && (b.image?.caption || []).some((t) => (t.plain_text ?? t.text?.content ?? "").startsWith("セクション全体図")));
  return { headingId: heading?.id || null, exists };
}

async function main() {
  const { values } = parseArgs({ options: { id: { type: "string" }, apply: { type: "boolean", default: false }, out: { type: "string" } } });
  if (!values.id) { console.error("--id <DIS-ID> が必要です"); process.exit(2); }
  const cfg = await loadConfig();
  const ledger = await loadLedger();
  const entry = ledger.entries.find((e) => e.disId === values.id);
  if (!entry) throw new Error(`台帳に ${values.id} がありません（先に登録が必要）`);
  if (entry.supplementOverview?.status === "created") { console.log(`${values.id}: 追加済み（スキップ）`); return; }
  const itemDir = await findItemDir(values.out || `${REPO_ROOT}outputs/dis`, cfg, values.id);
  if (!itemDir) throw new Error(`案件フォルダが見つかりません（${values.id}）`);
  const plan = await planOverviewUpload({ entry, itemDir });
  const opts = { apply: values.apply };
  console.log(`モード: ${writesAllowed(opts) ? "本番（新規追加のみ）" : "ドライラン（外部書込みなし）"}`);
  console.log(`Dropbox: ${plan.remote}`);
  console.log(`Notion: ページ ${plan.pageId} の見出し「${NOTION_IMAGE_HEADING}」の直後に、全体図を追加（既存の画像・本文は変更しない）`);
  if (!writesAllowed(opts)) return;
  assertWritesAllowed(opts);

  const { pathExists, ensureFolder, uploadFileNoOverwrite } = await import("../lib/dropbox-client.mjs");
  const { listBlockChildren, insertBlockChildrenAfter, uploadFileForNotion, imageUploadBlock } = await import("../lib/notion-client.mjs");
  // 先に、Notionの挿入位置を確認する（読み取りのみ）。見つからなければ、何も書かずに中止する。
  const children = await listBlockChildren(plan.pageId);
  const { headingId, exists } = findInsertPoint(children);
  if (!headingId) throw new Error("Notionの本文に、見出し「画像（Notion用の軽量版…）」が見つかりません（何も書き込まず中止）");
  const result = { at: new Date().toISOString(), dropbox: null, notion: null };
  if (!(await pathExists(entry.dropbox.folder))) throw new Error("案件のDropboxフォルダが見つかりません（中止）");
  if (await pathExists(plan.remote)) result.dropbox = "skipped_existing";
  else { await ensureFolder(path.posix.dirname(plan.remote)); await uploadFileNoOverwrite(plan.remote, await fs.readFile(plan.local)); result.dropbox = "created"; }
  if (exists) result.notion = "skipped_existing";
  else {
    const fileId = await uploadFileForNotion(plan.local, "image/jpeg");
    const res = await insertBlockChildrenAfter(plan.pageId, [imageUploadBlock(fileId, OVERVIEW_CAPTION)], headingId);
    result.notion = "created"; result.blockId = res?.results?.[0]?.id ?? null;
  }
  entry.supplementOverview = { status: "created", ...result };
  await saveLedger(ledger);
  console.log(`追加しました（Dropbox: ${result.dropbox} / Notion: ${result.notion}）。台帳を更新したので、コミットとプッシュをお願いします`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main().catch((e) => { console.error(e.message); process.exit(1); });
