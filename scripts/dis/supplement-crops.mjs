#!/usr/bin/env node
/**
 * 登録済みの案件に、Sectionごとの切り出し画像（sections_by_unit/）を、新規ファイルとして追加する。
 * 既存のDropboxフォルダ・ファイル・Notionは変更しない。追加先 <案件フォルダ>/01_Normal_Images/sections_by_unit/ に、すでにあるファイルは上書きせずスキップし、足りないファイルだけを追加する（途中で止まった場合の再実行用）。
 * 既定はドライラン。実書込みは --apply かつ DIS_ENABLE_WRITES=true かつ DRY_RUN=false のときだけ。
 *   node scripts/dis/supplement-crops.mjs --id DIS-LP-0002 [--apply]
 */
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { loadConfig, REPO_ROOT } from "./lib/config.mjs";
import { loadLedger, saveLedger } from "./lib/ledger.mjs";
import { assertWritesAllowed, writesAllowed } from "./lib/write-guard.mjs";
import { findItemDir } from "./import-analysis.mjs";
import { SECTION_DIR } from "./lib/crop.mjs";

/** 追加する計画（ローカルのファイルと、Dropbox上の新しいパス）。読み取りのみ。 */
export async function planCropUpload({ entry, itemDir }) {
  if (!entry?.dropbox?.folder) throw new Error("台帳に、Dropboxの保存先がありません（登録済みの案件のみ対象）");
  const localDir = path.join(itemDir, "files", "01_Normal_Images", SECTION_DIR);
  let names = [];
  try { names = (await fs.readdir(localDir)).filter((n) => /\.(png|json)$/.test(n)).sort(); } catch { /* なし */ }
  if (!names.some((n) => n.endsWith(".png"))) throw new Error(`切り出し画像がありません: ${localDir}（先に --stage crop を実行）`);
  const remoteDir = `${entry.dropbox.folder}/01_Normal_Images/${SECTION_DIR}`;
  return { remoteDir, files: names.map((n) => ({ local: path.join(localDir, n), remote: `${remoteDir}/${n}` })) };
}

async function main() {
  const { values } = parseArgs({ options: { id: { type: "string" }, apply: { type: "boolean", default: false }, out: { type: "string" } } });
  if (!values.id) { console.error("--id <DIS-ID> が必要です"); process.exit(2); }
  const cfg = await loadConfig();
  const ledger = await loadLedger();
  const entry = ledger.entries.find((e) => e.disId === values.id);
  if (!entry) throw new Error(`台帳に ${values.id} がありません（先に登録が必要）`);
  if (entry.supplementCrops?.status === "created") { console.log(`${values.id}: 追加済み（スキップ）`); return; }
  const itemDir = await findItemDir(values.out || `${REPO_ROOT}outputs/dis`, cfg, values.id);
  if (!itemDir) throw new Error(`案件フォルダが見つかりません（${values.id}）`);
  const plan = await planCropUpload({ entry, itemDir });
  const opts = { apply: values.apply };
  console.log(`モード: ${writesAllowed(opts) ? "本番（新規ファイルのみ追加）" : "ドライラン（外部書込みなし）"}`);
  console.log(`追加先: ${plan.remoteDir}/（${plan.files.length}ファイル）`);
  for (const f of plan.files.slice(0, 5)) console.log(`  ${path.basename(f.remote)}`);
  if (plan.files.length > 5) console.log(`  …ほか ${plan.files.length - 5} 件`);
  if (!writesAllowed(opts)) return;
  assertWritesAllowed(opts);
  const { pathExists, ensureFolder, uploadFileNoOverwrite } = await import("../lib/dropbox-client.mjs");
  if (!(await pathExists(entry.dropbox.folder))) throw new Error("案件のDropboxフォルダが見つかりません（中止）");
  await ensureFolder(plan.remoteDir);
  const uploaded = [], skipped = [];
  for (const f of plan.files) {
    if (await pathExists(f.remote)) { skipped.push(f.remote); continue; } // すでにあるファイルは、上書きしない
    await uploadFileNoOverwrite(f.remote, await fs.readFile(f.local));
    uploaded.push(f.remote);
  }
  entry.supplementCrops = { status: "created", folder: plan.remoteDir, uploaded, skippedExisting: skipped, at: new Date().toISOString() };
  await saveLedger(ledger);
  console.log(`追加しました（新規${uploaded.length}ファイル／すでにあるためスキップ${skipped.length}ファイル）。台帳を更新したので、コミットとプッシュをお願いします`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main().catch((e) => { console.error(e.message); process.exit(1); });
