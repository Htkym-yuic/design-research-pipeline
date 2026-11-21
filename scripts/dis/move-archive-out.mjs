#!/usr/bin/env node
/**
 * 10_LP/01_案件別 の中の「DIS-LP-0316〜0328」（アーカイブ画像の試験フォルダ）を、01_案件別 の外へ移す。
 * 元の番号体系（01_案件別 は LP-0001〜 のライブラリー番号のみ）に戻すための、移動のみの処理。削除はしない。
 *
 *   node scripts/dis/move-archive-out.mjs                         # ドライラン（計画の表示のみ）
 *   DIS_ENABLE_WRITES=true node scripts/dis/move-archive-out.mjs --apply   # 移動（同じ Dropbox 内の移動）
 *   オプション: --src <10_LP> --dest-name 96_参考_アーカイブ版 --from 316 --to 328 --with-sections
 *
 * ・対象: 01_案件別 直下で、名前が DIS-LP-nnnn（nnnn が from〜to）で始まるフォルダ。
 * ・--with-sections: 02_セクション別/<種類>/{PC,SP} の、同じ番号のファイルも、同じ構造のまま移す。
 * ・移動先: <10_LP>/<dest-name>/01_案件別/… （--with-sections なら /02_セクション別/… も）
 * ・すでに移動先に同名があれば、上書きせず止める。書込みは --apply と DIS_ENABLE_WRITES=true の両方が必要。
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_SRC = path.join(os.homedir(), "Library/CloudStorage/Dropbox/10_デザイン/01_言語化ラボ/10_LP");

/** 名前が DIS-LP-nnnn（from〜to）で始まるか。 */
export function isTarget(name, from = 316, to = 328) {
  const m = /^DIS-LP-(\d{4})(?=_|\.|$)/.exec(name);
  if (!m) return false;
  const n = Number(m[1]);
  return n >= from && n <= to;
}

async function exists(p) { return fs.access(p).then(() => true, () => false); }

/** 移動の計画。{ moves:[{from,to,kind}], conflicts:[to] }。 */
export async function planMoves(src, destName, { from = 316, to = 328, withSections = false } = {}) {
  const moves = [];
  const caseDir = path.join(src, "01_案件別");
  if (await exists(caseDir)) {
    for (const e of await fs.readdir(caseDir, { withFileTypes: true })) {
      if (e.isDirectory() && isTarget(e.name, from, to)) {
        moves.push({ from: path.join(caseDir, e.name), to: path.join(src, destName, "01_案件別", e.name), kind: "dir" });
      }
    }
  }
  const secDir = path.join(src, "02_セクション別");
  if (withSections && await exists(secDir)) {
    for (const k of await fs.readdir(secDir, { withFileTypes: true })) {
      if (!k.isDirectory()) continue;
      for (const dev of ["PC", "SP"]) {
        const d = path.join(secDir, k.name, dev);
        if (!(await exists(d))) continue;
        for (const f of await fs.readdir(d, { withFileTypes: true })) {
          if (f.isFile() && isTarget(f.name, from, to)) {
            moves.push({ from: path.join(d, f.name), to: path.join(src, destName, "02_セクション別", k.name, dev, f.name), kind: "file" });
          }
        }
      }
    }
  }
  const conflicts = [];
  for (const m of moves) if (await exists(m.to)) conflicts.push(m.to);
  return { moves, conflicts };
}

export async function applyMoves(plan) {
  if (plan.conflicts.length) throw new Error(`移動先に同名があるため、上書きしません: ${plan.conflicts[0]}（ほか${plan.conflicts.length - 1}件）`);
  let done = 0;
  for (const m of plan.moves) {
    await fs.mkdir(path.dirname(m.to), { recursive: true });
    await fs.rename(m.from, m.to);
    done++;
  }
  return { done };
}

async function main() {
  const { values: v } = parseArgs({ options: {
    src: { type: "string", default: DEFAULT_SRC }, "dest-name": { type: "string", default: "96_参考_アーカイブ版" },
    from: { type: "string", default: "316" }, to: { type: "string", default: "328" },
    "with-sections": { type: "boolean", default: false }, apply: { type: "boolean", default: false },
  } });
  const plan = await planMoves(v.src, v["dest-name"], { from: Number(v.from), to: Number(v.to), withSections: v["with-sections"] });
  console.log(`元: ${v.src}\n先: ${path.join(v.src, v["dest-name"])}\n移動対象: ${plan.moves.length} 件（フォルダ ${plan.moves.filter((m) => m.kind === "dir").length} / ファイル ${plan.moves.filter((m) => m.kind === "file").length}）`);
  for (const m of plan.moves) console.log(`  ${path.relative(v.src, m.from)}  →  ${path.relative(v.src, m.to)}`);
  if (plan.conflicts.length) console.log(`\n⚠ 移動先に同名: ${plan.conflicts.length} 件（--apply は止まります）`);
  if (!v.apply) { console.log("\nドライランです。何も移動していません。"); return; }
  if (process.env.DIS_ENABLE_WRITES !== "true") { console.error("\n--apply には DIS_ENABLE_WRITES=true が必要です。何も移動していません。"); process.exit(2); }
  const r = await applyMoves(plan);
  const logPath = path.join(REPO, "data/move-archive-out-log.json");
  await fs.writeFile(logPath, JSON.stringify({ movedAt: new Date().toISOString(), src: v.src, destName: v["dest-name"], moves: plan.moves.map((m) => ({ from: path.relative(v.src, m.from), to: path.relative(v.src, m.to) })) }, null, 2) + "\n");
  console.log(`\n移動しました: ${r.done} 件。記録: ${path.relative(REPO, logPath)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(e.message); process.exit(1); });
