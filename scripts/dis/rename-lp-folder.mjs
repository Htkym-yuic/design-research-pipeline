#!/usr/bin/env node
/**
 * 10_LP の中の、1つのLPの名前（番号）を付け替える。フォルダとファイル名の頭の「LP-nnnn_名前」を、別の番号にする（移動のみ。削除しない）。
 *
 *   node scripts/dis/rename-lp-folder.mjs --from LP-0227_タニカのあまざけ --to LP-0223_タニカのあまざけ            # ドライラン
 *   DIS_ENABLE_WRITES=true node scripts/dis/rename-lp-folder.mjs --from … --to … --apply                          # 実行
 *   オプション: --src <10_LP>
 *
 * ・対象: 01_案件別/<from>（フォルダと、中のファイル）／02_セクション別/<種類>/<PC|SP> の <from>_… で始まるファイル／91〜95 の参考フォルダ直下の <from>_… のファイル
 * ・移動先に同名があれば、止まる（上書きしない）。実行の記録: data/rename-lp-folder-log.jsonl
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_SRC = path.join(os.homedir(), "Library/CloudStorage/Dropbox/10_デザイン/01_言語化ラボ/10_LP");
const ls = (d) => fs.readdir(d, { withFileTypes: true }).catch(() => []);
const exists = (p) => fs.access(p).then(() => true, () => false);

export const swap = (name, from, to) => (name === from || name.startsWith(`${from}_`) || name.startsWith(from) ? to + name.slice(from.length) : name);

/** 計画: { moves:[{from,to}], conflicts:[to] } */
export async function planRename(src, from, to) {
  const moves = [];
  // 01_案件別: 中のファイル→フォルダの順（フォルダは最後に移動する）
  const dir = path.join(src, "01_案件別", from);
  if (await exists(dir)) {
    for (const e of await ls(dir)) if (e.name.startsWith(from)) moves.push({ from: path.join(dir, e.name), to: path.join(dir, swap(e.name, from, to)) });
    moves.push({ from: dir, to: path.join(src, "01_案件別", to), dir: true });
  }
  const sec = path.join(src, "02_セクション別");
  for (const k of await ls(sec)) if (k.isDirectory()) for (const dev of ["PC", "SP"]) {
    const d = path.join(sec, k.name, dev);
    for (const f of await ls(d)) if (f.isFile() && f.name.startsWith(`${from}_`)) moves.push({ from: path.join(d, f.name), to: path.join(d, swap(f.name, from, to)) });
  }
  for (const r of await ls(src)) if (r.isDirectory() && /^9[1-5]_/.test(r.name)) {
    for (const f of await ls(path.join(src, r.name))) if (f.isFile() && f.name.startsWith(`${from}_`)) moves.push({ from: path.join(src, r.name, f.name), to: path.join(src, r.name, swap(f.name, from, to)) });
  }
  const conflicts = [];
  for (const m of moves) { if (await exists(m.to) && path.resolve(m.to) !== path.resolve(m.from)) conflicts.push(m.to); }
  return { moves, conflicts };
}

export async function applyRename(plan) {
  if (plan.conflicts.length) throw new Error(`移動先に同名があるため、止めます: ${plan.conflicts[0]}（ほか${plan.conflicts.length - 1}件）`);
  for (const m of plan.moves) await fs.rename(m.from, m.to);
  return { done: plan.moves.length };
}

async function main() {
  const { values: v } = parseArgs({ options: { src: { type: "string", default: DEFAULT_SRC }, from: { type: "string" }, to: { type: "string" }, apply: { type: "boolean", default: false } } });
  if (!v.from || !v.to || v.from === v.to) { console.error("--from と --to（別の名前）を指定してください。"); process.exit(1); }
  const plan = await planRename(v.src, v.from, v.to);
  const rel = (p) => path.relative(v.src, p);
  console.log(`対象: ${plan.moves.length} 件（ファイル ${plan.moves.filter((m) => !m.dir).length}／フォルダ ${plan.moves.filter((m) => m.dir).length}）`);
  for (const m of plan.moves.slice(0, 40)) console.log(`  ${rel(m.from)}  →  ${path.basename(m.to)}`);
  if (plan.moves.length > 40) console.log(`  …ほか ${plan.moves.length - 40} 件`);
  if (plan.conflicts.length) console.log(`⚠ 移動先に同名: ${plan.conflicts.length} 件（--apply は止まります）`);
  if (!plan.moves.length) { console.log("対象がありません。"); return; }
  if (!v.apply) { console.log("\nドライランです。何も変更していません。"); return; }
  if (process.env.DIS_ENABLE_WRITES !== "true") { console.error("--apply には DIS_ENABLE_WRITES=true が必要です。"); process.exit(2); }
  const r = await applyRename(plan);
  await fs.appendFile(path.join(REPO, "data/rename-lp-folder-log.jsonl"), JSON.stringify({ at: new Date().toISOString(), from: v.from, to: v.to, moves: plan.moves.map((m) => ({ from: rel(m.from), to: rel(m.to) })) }) + "\n");
  console.log(`\n付け替えました: ${r.done} 件。記録: data/rename-lp-folder-log.jsonl`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(e.message); process.exit(1); });
