#!/usr/bin/env node
/**
 * LP-0223（旧LP-0227 タニカ）・LP-0224（旧LP-0228 リクルート）の全体画像・FV画像を、Dropbox の旧ライブラリー（Research_Library/…/01_By_Date/2026-09-27）から、
 * 10_LP/01_案件別/<LP-nnnn_名前>/ へ、コピーする（コピーのみ。元は変更しない。先にあるファイルは上書きしない）。
 *
 *   node scripts/dis/copy-lp-source.mjs                                   # ドライラン（計画の表示のみ）
 *   DIS_ENABLE_WRITES=true node scripts/dis/copy-lp-source.mjs --apply     # コピー（新規のみ）
 *   オプション: --dropbox <Dropboxの同期フォルダ> （既定: ~/Library/CloudStorage/Dropbox） / --lp LP-0224（指定したLPだけ。省略すると、両方）
 *
 * ・元: <Dropbox>/Research_Library/Design/LP_Research_Library/01_By_Date/2026-09-27/LP/<Product|Service>/<LP-nnnn_名前>/{01_PC,02_SP}/…
 * ・先: <Dropbox>/10_デザイン/01_言語化ラボ/10_LP/01_案件別/<LP-nnnn_名前>/<LP-nnnn_名前>_<PC|SP>_<全体|FV>.png
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const OLD = "Research_Library/Design/LP_Research_Library/01_By_Date/2026-09-27/LP";
const NEW = "10_デザイン/01_言語化ラボ/10_LP/01_案件別";
// lp/folder: 新しい番号（コピー先）。srcLp/srcFolder: 旧ライブラリー（2026-09-27）での、元の番号・フォルダ名（番号ずれの整理前）
export const TARGETS = [
  { lp: "LP-0223", folder: "LP-0223_タニカのあまざけ", srcLp: "LP-0227", srcFolder: "LP-0227_タニカのあまざけ", kind: "Product" },
  { lp: "LP-0224", folder: "LP-0224_リクルートダイレクトスカウト", srcLp: "LP-0228", srcFolder: "LP-0228_リクルートダイレクトスカウト", kind: "Service" },
];

/** 1つのLPの、コピー計画（元・先・種別）。 */
export function planFor(root, t) {
  const base = path.join(root, OLD, t.kind, t.srcFolder);
  const dest = path.join(root, NEW, t.folder);
  const items = [];
  for (const dev of ["PC", "SP"]) {
    const d = dev === "PC" ? "01_PC" : "02_SP";
    items.push({ what: `${dev} 全体`, from: path.join(base, d, "01_Full_Page", `${t.srcLp}_${dev}_full_page_20260927.png`), to: path.join(dest, `${t.folder}_${dev}_全体.png`) });
    items.push({ what: `${dev} FV`, from: path.join(base, d, "02_First_View", `${t.srcLp}_${dev}_first_view_20260927.png`), to: path.join(dest, `${t.folder}_${dev}_FV.png`) });
  }
  return items;
}

export async function applyCopy(items) {
  const res = { copied: 0, skipped: 0, missing: [] };
  for (const it of items) {
    const st = await fs.stat(it.from).catch(() => null);
    if (!st) { res.missing.push(it.from); continue; }
    const ex = await fs.stat(it.to).catch(() => null);
    if (ex) { if (ex.size === st.size) { res.skipped++; continue; } throw new Error(`すでにあり、内容が違うため、上書きしません: ${it.to}`); }
    await fs.mkdir(path.dirname(it.to), { recursive: true });
    await fs.copyFile(it.from, it.to, fs.constants.COPYFILE_EXCL);
    const after = await fs.stat(it.to);
    if (after.size !== st.size) throw new Error(`コピー後の容量が違います: ${it.to}`);
    res.copied++;
  }
  return res;
}

async function main() {
  const { values: v } = parseArgs({ options: { dropbox: { type: "string", default: path.join(os.homedir(), "Library/CloudStorage/Dropbox") }, apply: { type: "boolean", default: false }, lp: { type: "string" } } });
  const targets = v.lp ? TARGETS.filter((t) => t.lp === v.lp) : TARGETS;
  if (!targets.length) { console.error(`対象外のLPです: ${v.lp}（対象: ${TARGETS.map((t) => t.lp).join(", ")}）`); process.exit(1); }
  const items = targets.flatMap((t) => planFor(v.dropbox, t));
  for (const it of items) {
    const st = await fs.stat(it.from).catch(() => null);
    const ex = await fs.stat(it.to).catch(() => null);
    console.log(`${st ? "○" : "×元なし"} ${ex ? "(先に有り)" : ""} ${path.basename(it.to)}  ← ${path.relative(v.dropbox, it.from)}${st ? `  ${(st.size / 1048576).toFixed(1)}MB` : ""}`);
  }
  if (!v.apply) { console.log("\nドライランです。何もコピーしていません。"); return; }
  if (process.env.DIS_ENABLE_WRITES !== "true") { console.error("\n--apply には DIS_ENABLE_WRITES=true が必要です。"); process.exit(2); }
  const r = await applyCopy(items);
  console.log(`\nコピー ${r.copied} 件／同じ内容でスキップ ${r.skipped} 件／元なし ${r.missing.length} 件`);
  if (r.missing.length) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(e.message); process.exit(1); });
