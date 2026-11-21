#!/usr/bin/env node
/**
 * 全体画像を、決めた範囲（y座標）で切り出して、02_セクション別/<NN_種類>/<PC|SP>/ に保存する（新規のみ。元・既存は変更しない）。
 * 範囲は、全体画像を見て決めた「切り出し計画」（data/section-cut-plans/LP-nnnn.json）から読む。
 *
 *   node scripts/dis/cut-sections.mjs --plan data/section-cut-plans/LP-0227.json            # ドライラン（検証と計画の表示のみ）
 *   DIS_ENABLE_WRITES=true node scripts/dis/cut-sections.mjs --plan … --apply               # 切り出して保存（新規のみ）
 *   オプション: --src <10_LP>
 *
 * 計画の書式: { "lp": "LP-0227", "folder": "LP-0227_タニカのあまざけ",
 *   "devices": { "PC": { "sections": [ { "y0": 0, "y1": 1800, "kind": "01_FV", "note": "" }, … ] }, "SP": { … } } }
 * ・kind は、16種類のフォルダ名（01_FV〜16_ナビ）。y0〜y1 は、全体画像の元のpx。上から順に並べる（隣との重なりは、警告）。
 * ・出力名: <folder>_<PC|SP>_<NN>_<種類>.png（NN は、ページ上の順番。同じ種類が複数あっても、順番で区別される）
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const DEFAULT_SRC = path.join(os.homedir(), "Library/CloudStorage/Dropbox/10_デザイン/01_言語化ラボ/10_LP");
export const KINDS = ["01_FV", "02_悩み提起", "03_解決策", "04_商品紹介", "05_特徴", "06_ベネフィット", "07_実績", "08_流れ", "09_CTA", "10_FAQ", "11_フッター", "12_その他", "13_比較", "14_料金", "15_会社情報", "16_ナビ"];
const MIN_H = 60;

/** 計画の検証。{ errors:[], warnings:[] }。imgHeight は元画像の高さ。 */
export function validateSections(sections, imgHeight) {
  const errors = [], warnings = [];
  if (!sections?.length) errors.push("セクションが空です");
  let prev = null;
  (sections || []).forEach((s, i) => {
    const tag = `#${i + 1}`;
    if (!KINDS.includes(s.kind)) errors.push(`${tag} 種類が不正: ${s.kind}`);
    if (!(Number.isInteger(s.y0) && Number.isInteger(s.y1))) errors.push(`${tag} y0・y1 は整数にしてください`);
    else {
      if (s.y0 < 0 || s.y1 > imgHeight) errors.push(`${tag} 範囲 ${s.y0}-${s.y1} が画像の高さ ${imgHeight} を超えています`);
      if (s.y1 - s.y0 < MIN_H) errors.push(`${tag} 高さが ${MIN_H}px 未満です（${s.y1 - s.y0}px）`);
      if (prev) {
        if (s.y0 < prev.y0) errors.push(`${tag} 前のセクションより上にあります（順番を確認）`);
        else if (s.y0 < prev.y1) warnings.push(`${tag} 前のセクションと ${prev.y1 - s.y0}px 重なっています`);
      }
      prev = s;
    }
  });
  if (sections?.length && sections[0].y0 > 200) warnings.push(`先頭が y=${sections[0].y0} から始まっています（上端の切り落としを確認）`);
  if (sections?.length && imgHeight - sections[sections.length - 1].y1 > 400) warnings.push(`最下部 ${imgHeight - sections[sections.length - 1].y1}px が、どのセクションにも入っていません`);
  return { errors, warnings };
}

export const outName = (folder, dev, idx, kind) => `${folder}_${dev}_${String(idx + 1).padStart(2, "0")}_${kind.replace(/^\d+_/, "")}.png`;

export async function runPlan(src, plan, { apply = false } = {}) {
  const { default: sharp } = await import("sharp");
  const out = { errors: [], warnings: [], cuts: [], created: 0, skipped: 0 };
  for (const dev of ["PC", "SP"]) {
    const d = plan.devices?.[dev];
    if (!d?.sections?.length) continue;
    const dir = path.join(src, "01_案件別", plan.folder);
    const full = (await fs.readdir(dir).catch(() => [])).find((f) => f.endsWith(`_${dev}_全体.png`) || f.endsWith(`_${dev}_全体.jpg`));
    if (!full) { out.errors.push(`${plan.folder} の ${dev} 全体画像がありません`); continue; }
    const meta = await sharp(path.join(dir, full), { limitInputPixels: false }).metadata();
    const v = validateSections(d.sections, meta.height);
    out.errors.push(...v.errors.map((e) => `${dev} ${e}`)); out.warnings.push(...v.warnings.map((w) => `${dev} ${w}`));
    d.sections.forEach((s, i) => {
      if (!KINDS.includes(s.kind)) return;
      out.cuts.push({ dev, y0: s.y0, y1: s.y1, width: meta.width, full: path.join(dir, full), to: path.join(src, "02_セクション別", s.kind, dev, outName(plan.folder, dev, i, s.kind)) });
    });
  }
  if (out.errors.length || !apply) return out;
  for (const c of out.cuts) {
    if (await fs.access(c.to).then(() => true, () => false)) { out.skipped++; continue; }
    await fs.mkdir(path.dirname(c.to), { recursive: true });
    await sharp(c.full, { limitInputPixels: false }).extract({ left: 0, top: c.y0, width: c.width, height: c.y1 - c.y0 }).png().toFile(c.to);
    out.created++;
  }
  return out;
}

async function main() {
  const { values: v } = parseArgs({ options: { src: { type: "string", default: DEFAULT_SRC }, plan: { type: "string" }, apply: { type: "boolean", default: false } } });
  if (!v.plan) { console.error("--plan data/section-cut-plans/LP-0227.json を指定してください。"); process.exit(1); }
  const plan = JSON.parse(await fs.readFile(v.plan, "utf8"));
  if (v.apply && process.env.DIS_ENABLE_WRITES !== "true") { console.error("--apply には DIS_ENABLE_WRITES=true が必要です。"); process.exit(2); }
  const r = await runPlan(v.src, plan, { apply: v.apply });
  for (const c of r.cuts) console.log(`${c.dev} y ${String(c.y0).padStart(5)}-${String(c.y1).padStart(5)} (${c.y1 - c.y0}px)  → ${path.relative(v.src, c.to)}`);
  for (const w of r.warnings) console.log(`⚠ ${w}`);
  for (const e of r.errors) console.error(`✗ ${e}`);
  if (r.errors.length) { console.error("\n計画にエラーがあります。何も保存していません。"); process.exit(1); }
  console.log(v.apply ? `\n保存 ${r.created} 件／すでにあるためスキップ ${r.skipped} 件` : "\nドライランです。何も保存していません。");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(e.message); process.exit(1); });
