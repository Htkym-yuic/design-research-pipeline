#!/usr/bin/env node
/**
 * 1つのLPを撮影（または、アーカイブ画像を取得）して、10_LP/01_案件別/<LP-nnnn_名前>/ に保存する（新規のみ。上書き・削除しない）。
 *
 *   # 実ページを撮影（PC幅1440／SP幅375。ログイン・Bot対策の回避はしない）
 *   node scripts/dis/capture-to-case.mjs --lp LP-0227 --url https://www.mod.go.jp/gsdf/jieikanbosyu/
 *   # LPアーカイブの画像を取得
 *   node scripts/dis/capture-to-case.mjs --lp LP-0227 --archive 229262
 *   DIS_ENABLE_WRITES=true node scripts/dis/capture-to-case.mjs --lp LP-0227 --url … --apply     # 保存
 *
 *   オプション: --sp-url <SP用URL> --targets pc,sp --src <10_LP>
 * ・撮影・取得は、作業用の一時フォルダ（Dropboxの外）で行い、できた全体画像とFVだけを、案件別にコピーする。
 * ・保存名: <LP-nnnn_名前>_<PC|SP>_全体.png／_FV.png（名前は、対応表のタイトルから作る）
 * ・--apply なし（ドライラン）では、撮影も取得もしない。計画の表示のみ。
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_SRC = path.join(os.homedir(), "Library/CloudStorage/Dropbox/10_デザイン/01_言語化ラボ/10_LP");
const exists = (p) => fs.access(p).then(() => true, () => false);

/** フォルダ名: 「LP-0227」＋タイトル（空白は_、フォルダに使えない文字は除く）。 */
export const folderName = (lp, title) => `${lp}_${String(title).trim().replace(/\s+/g, "_").replace(/[\\/:*?"<>|]/g, "")}`;

/** コピー計画。tmpDir は、captureFullPage / captureFromArchive の出力先（01_Normal_Images を含む）。 */
export function planCopies(src, folder, tmpDir, id, targets) {
  const out = [];
  for (const t of targets) {
    const T = t.toUpperCase();
    out.push({ from: path.join(tmpDir, "01_Normal_Images", `${id}_${T}_full.png`), to: path.join(src, "01_案件別", folder, `${folder}_${T}_全体.png`) });
    out.push({ from: path.join(tmpDir, "01_Normal_Images", `${id}_${T}_first_view.png`), to: path.join(src, "01_案件別", folder, `${folder}_${T}_FV.png`) });
  }
  return out;
}

export async function copyNew(items) {
  const r = { copied: [], skipped: [], missing: [] };
  for (const it of items) {
    if (!(await exists(it.from))) { r.missing.push(it.from); continue; }
    if (await exists(it.to)) { r.skipped.push(it.to); continue; }
    await fs.mkdir(path.dirname(it.to), { recursive: true });
    await fs.copyFile(it.from, it.to, fs.constants.COPYFILE_EXCL);
    r.copied.push(it.to);
  }
  return r;
}

async function main() {
  const { values: v } = parseArgs({ options: { src: { type: "string", default: DEFAULT_SRC }, lp: { type: "string" }, url: { type: "string" }, "sp-url": { type: "string" }, archive: { type: "string" }, targets: { type: "string", default: "pc,sp" }, apply: { type: "boolean", default: false } } });
  if (!v.lp || (!v.url && !v.archive)) { console.error("--lp LP-0227 と、--url <URL> か --archive <rdlpのID> を指定してください。"); process.exit(1); }
  const map = JSON.parse(await fs.readFile(path.join(REPO, "data/lp-renumber-map.json"), "utf8"));
  const item = map.items.find((i) => i.oldLp === v.lp);
  if (!item) { console.error(`対応表に ${v.lp} がありません。`); process.exit(1); }
  const existing = (await fs.readdir(path.join(v.src, "01_案件別"), { withFileTypes: true }).catch(() => [])).find((e) => e.isDirectory() && e.name.startsWith(`${v.lp}_`));
  const folder = existing ? existing.name : folderName(v.lp, item.title);
  const targets = v.targets.split(",").map((s) => s.trim());
  const tmp = path.join(os.tmpdir(), `capture-${v.lp}`);
  const plan = planCopies(v.src, folder, tmp, v.lp, targets);
  console.log(`LP: ${v.lp} ${item.title}\n方法: ${v.archive ? `アーカイブ画像（rdlp ${v.archive}）` : `実ページ撮影（${v.url}）`}\n保存先: ${path.join(v.src, "01_案件別", folder)}${existing ? "（既存のフォルダ）" : "（新規）"}`);
  for (const p of plan) console.log(`  ${path.basename(p.to)}${(await exists(p.to)) ? "  （すでにあるので、保存しない）" : ""}`);
  if (!v.apply) { console.log("\nドライランです。撮影も、保存もしていません。"); return; }
  if (process.env.DIS_ENABLE_WRITES !== "true") { console.error("\n--apply には DIS_ENABLE_WRITES=true が必要です。"); process.exit(2); }
  await fs.rm(tmp, { recursive: true, force: true }); await fs.mkdir(tmp, { recursive: true });
  const cap = await import("./lib/capture.mjs");
  let warnings = [];
  if (v.archive) { const r = await cap.captureFromArchive(`https://rdlp.jp/archives/otherdesign/lp/${v.archive}`, tmp, { id: v.lp }); warnings = r?.warnings || []; }
  else { const r = await cap.captureFullPage(v.url, tmp, { id: v.lp, spUrl: v["sp-url"] || null, targets }); warnings = r.warnings || []; }
  for (const w of warnings) console.log(`⚠ ${w}`);
  const r = await copyNew(plan);
  console.log(`\n保存 ${r.copied.length} 件／すでにあるためスキップ ${r.skipped.length} 件／作れなかった ${r.missing.length} 件`);
  for (const m of r.missing) console.log(`  × ${path.basename(m)}`);
  console.log(`作業用フォルダ（Dropboxの外）: ${tmp}`);
  if (r.missing.length) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(e.message); process.exit(1); });
