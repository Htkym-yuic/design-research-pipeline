#!/usr/bin/env node
/**
 * 10_LP の中の参考フォルダ（91〜96）を、10_LP の外の「10_デザイン/02_LP参考資料/」へ移す（移動のみ。削除しない。名前は変えない）。
 *
 *   node scripts/dis/move-reference-folders.mjs                      # ドライラン（計画の表示のみ）
 *   DIS_ENABLE_WRITES=true node scripts/dis/move-reference-folders.mjs --apply
 *   オプション: --lp <10_LP> --dest <移動先の親フォルダ> --dest-name 02_LP参考資料
 *
 * ・対象: 10_LP 直下の、名前が「91_」〜「96_」で始まるフォルダ。01_案件別・02_セクション別は、動かさない。
 * ・移動先に同名のフォルダがあれば、止まる（上書き・統合しない）。
 * ・移動先に README.txt（各フォルダの説明）を、新規で作る（すでにあれば作らない）。
 * ・実行の記録: data/move-reference-folders-log.json
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DESIGN = path.join(os.homedir(), "Library/CloudStorage/Dropbox/10_デザイン");
const DEFAULT_LP = path.join(DESIGN, "01_言語化ラボ/10_LP");
const exists = (p) => fs.access(p).then(() => true, () => false);

export const README = `LP参考資料（10_LP から移したフォルダ）
作成: 2026-11-21（番号・名前は、移す前のまま）

91_参考_概観図              … LPごとの概観図
92_参考_再撮影の別版          … 再撮影の別版（「要確認_別ページの可能性」を含む）
93_参考_DIS分析ファイル        … 分析の本文（28章など）。消さないこと
94_参考_機械分割              … 機械的に分割した画像（切り出しの元の素材）
95_参考_LP番号なしのフォルダ      … 番号のないフォルダ（旧）
96_参考_アーカイブ版           … アーカイブ画像の試験フォルダ（DIS-LP-0316〜0328）

LPの案件別・セクション別の画像は、10_デザイン/01_言語化ラボ/10_LP の 01_案件別・02_セクション別 にあります。
`;

/** 移す対象のフォルダ名（91_〜96_）。 */
export const isRef = (name) => /^9[1-6]_/.test(name);

async function stat(dir) { let files = 0, bytes = 0; const stack = [dir]; while (stack.length) { const d = stack.pop(); for (const e of await fs.readdir(d, { withFileTypes: true }).catch(() => [])) { const p = path.join(d, e.name); if (e.isDirectory()) stack.push(p); else if (e.isFile()) { files++; bytes += (await fs.stat(p).catch(() => ({ size: 0 }))).size; } } } return { files, bytes }; }

export async function planMove(lp, destRoot) {
  const moves = [], conflicts = [];
  for (const e of await fs.readdir(lp, { withFileTypes: true })) {
    if (!e.isDirectory() || !isRef(e.name)) continue;
    const to = path.join(destRoot, e.name);
    moves.push({ name: e.name, from: path.join(lp, e.name), to });
    if (await exists(to)) conflicts.push(to);
  }
  return { moves, conflicts };
}

export async function applyMove(plan, destRoot) {
  if (plan.conflicts.length) throw new Error(`移動先に同名があるため、止めます: ${plan.conflicts[0]}`);
  await fs.mkdir(destRoot, { recursive: true });
  for (const m of plan.moves) await fs.rename(m.from, m.to);
  const readme = path.join(destRoot, "README.txt");
  if (!(await exists(readme))) await fs.writeFile(readme, README);
  return { moved: plan.moves.length };
}

async function main() {
  const { values: v } = parseArgs({ options: { lp: { type: "string", default: DEFAULT_LP }, dest: { type: "string", default: DESIGN }, "dest-name": { type: "string", default: "02_LP参考資料" }, apply: { type: "boolean", default: false } } });
  const destRoot = path.join(v.dest, v["dest-name"]);
  const plan = await planMove(v.lp, destRoot);
  console.log(`元: ${v.lp}\n先: ${destRoot}\n`);
  for (const m of plan.moves) { const s = await stat(m.from); console.log(`  ${m.name}  （${s.files} ファイル／${(s.bytes / 1048576).toFixed(0)}MB）  →  ${path.basename(destRoot)}/${m.name}`); }
  if (!plan.moves.length) { console.log("対象のフォルダがありません。"); return; }
  if (plan.conflicts.length) console.log(`\n⚠ 移動先に同名: ${plan.conflicts.length} 件（--apply は止まります）`);
  if (!v.apply) { console.log("\nドライランです。何も移動していません。"); return; }
  if (process.env.DIS_ENABLE_WRITES !== "true") { console.error("--apply には DIS_ENABLE_WRITES=true が必要です。"); process.exit(2); }
  const r = await applyMove(plan, destRoot);
  await fs.writeFile(path.join(REPO, "data/move-reference-folders-log.json"), JSON.stringify({ at: new Date().toISOString(), dest: destRoot, moves: plan.moves.map((m) => ({ from: m.from, to: m.to })) }, null, 2) + "\n");
  console.log(`\n移動しました: ${r.moved} フォルダ。記録: data/move-reference-folders-log.json`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(e.message); process.exit(1); });
