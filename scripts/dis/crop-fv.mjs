#!/usr/bin/env node
/**
 * 全体画像の上端から、FV（最初のCTAまで）を切り出して、02_セクション別/01_FV/<PC|SP>/ に保存する（新規のみ。上書きしない）。
 *
 *   node scripts/dis/crop-fv.mjs --lp LP-0029 --dev SP --height 1400            # ドライラン（何も書かない）
 *   DIS_ENABLE_WRITES=true node scripts/dis/crop-fv.mjs --lp LP-0029 --dev SP --height 1400 --apply
 *   オプション: --src <10_LP>
 *
 * ・高さ（--height）は、全体画像を見て、FV（キービジュアル＋主コピー＋最初のCTAボタン）が収まる位置で決める（px）。
 * ・元: <10_LP>/01_案件別/<LP-nnnn_名前>/…_<PC|SP>_全体.png   先: <10_LP>/02_セクション別/01_FV/<PC|SP>/<LP-nnnn_名前>_<PC|SP>_01_FV.png
 * ・書込みは --apply と DIS_ENABLE_WRITES=true の両方が必要。先にファイルがあれば、止める。
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const DEFAULT_SRC = path.join(os.homedir(), "Library/CloudStorage/Dropbox/10_デザイン/01_言語化ラボ/10_LP");

/** 計画: { folder, full, out } or throw */
export async function planFv(src, lp, dev) {
  const cases = (await fs.readdir(path.join(src, "01_案件別"), { withFileTypes: true }).catch(() => [])).filter((e) => e.isDirectory() && e.name.startsWith(`${lp}_`));
  if (cases.length !== 1) throw new Error(`${lp} の案件別フォルダが ${cases.length} 件です（1件である必要があります）`);
  const folder = cases[0].name;
  const dir = path.join(src, "01_案件別", folder);
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(`_${dev}_全体.png`) || f.endsWith(`_${dev}_全体.jpg`));
  if (files.length !== 1) throw new Error(`${folder} の ${dev} 全体画像が ${files.length} 件です（1件である必要があります）`);
  const kindDir = (await fs.readdir(path.join(src, "02_セクション別"), { withFileTypes: true })).find((e) => e.isDirectory() && /^01_?FV/i.test(e.name));
  if (!kindDir) throw new Error("02_セクション別/01_FV が見つかりません");
  const out = path.join(src, "02_セクション別", kindDir.name, dev, `${folder}_${dev}_01_FV.png`);
  return { folder, full: path.join(dir, files[0]), out };
}

export async function cropFv(plan, height) {
  const { default: sharp } = await import("sharp");
  const meta = await sharp(plan.full, { limitInputPixels: false }).metadata();
  if (!(height > 0) || height > meta.height) throw new Error(`高さ ${height}px が不正です（全体画像は ${meta.width}×${meta.height}px）`);
  if (await fs.access(plan.out).then(() => true, () => false)) throw new Error(`すでにあるため、上書きしません: ${plan.out}`);
  await fs.mkdir(path.dirname(plan.out), { recursive: true });
  await sharp(plan.full, { limitInputPixels: false }).extract({ left: 0, top: 0, width: meta.width, height }).png().toFile(plan.out);
  return { width: meta.width, height };
}

async function main() {
  const { values: v } = parseArgs({ options: { src: { type: "string", default: DEFAULT_SRC }, lp: { type: "string" }, dev: { type: "string" }, height: { type: "string" }, apply: { type: "boolean", default: false } } });
  if (!v.lp || !["PC", "SP"].includes(v.dev) || !v.height) { console.error("--lp LP-0029 --dev SP --height 1400 を指定してください。"); process.exit(1); }
  const plan = await planFv(v.src, v.lp, v.dev);
  const { default: sharp } = await import("sharp");
  const meta = await sharp(plan.full, { limitInputPixels: false }).metadata();
  console.log(`元: ${plan.full}（${meta.width}×${meta.height}px）\n先: ${plan.out}\n切り出し: 上端から ${v.height}px`);
  if (!v.apply) { console.log("\nドライランです。何も書いていません。"); return; }
  if (process.env.DIS_ENABLE_WRITES !== "true") { console.error("\n--apply には DIS_ENABLE_WRITES=true が必要です。"); process.exit(2); }
  const r = await cropFv(plan, Number(v.height));
  console.log(`\n作成しました: ${r.width}×${r.height}px`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(e.message); process.exit(1); });
