#!/usr/bin/env node
/**
 * Dropbox の 10_LP を、新しい番号（DIS-LP-0001〜）の名前で、新しい場所にコピーする（元は変更しない）。
 *
 *   node scripts/dis/renumber-copy.mjs                      # ドライラン（計画の表示のみ。何も書かない）
 *   DIS_ENABLE_WRITES=true node scripts/dis/renumber-copy.mjs --apply     # コピー（新規のみ）
 *   node scripts/dis/renumber-copy.mjs --verify             # コピー先と元の、ファイル数・容量を照合
 *
 * ・対応表: data/lp-renumber-map.json（status=draft のあいだは、ドライランのみ。--apply には、status=confirmed が必要）
 * ・元: <Dropbox同期フォルダ>/10_デザイン/01_言語化ラボ/10_LP（--src）  先: 同じ階層の 10_LP_新番号（--dest）
 * ・対象のフォルダ: 既定は 01_案件別・02_セクション別（--include で追加。例: 91_参考_概観図）
 * ・名前の変更: 名前の中の「LP-nnnn」を「DIS-LP-mmmm」に置き換える（フォルダ名・ファイル名とも。すでに DIS- が付くものは変えない）。
 * ・重複のため除外した LP は、コピーしない（元には残る）。対応表にない LP 番号は、止めて報告する。
 * ・書込みは、--apply と DIS_ENABLE_WRITES=true の両方が必要。コピーは新規のみ（すでにあるファイルは、上書きしない）。
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = path.join(os.homedir(), "Library/CloudStorage/Dropbox/10_デザイン/01_言語化ラボ");
const LP_TOKEN = /(^|[^A-Za-z0-9-])LP-(\d{4})(?=_|\.|$)/g;

/** 対応表から、旧LP番号 → { newId, status } を作る。 */
export function buildLookup(map) {
  const m = new Map();
  for (const it of map.items) m.set(it.oldLp, { newId: it.newId, status: it.status });
  return m;
}

/** 1つの相対パス（フォルダ名・ファイル名）を、新しい名前にする。 */
export function renameRel(rel, lookup) {
  const lps = new Set();
  let excluded = false; const unmapped = [];
  const out = rel.split("/").map((seg) => seg.replace(LP_TOKEN, (all, pre, n) => {
    const key = `LP-${n}`; const hit = lookup.get(key);
    if (!hit) { unmapped.push(key); return all; }
    lps.add(key);
    if (hit.status !== "adopted" || !hit.newId) { excluded = true; return all; }
    return `${pre}${hit.newId}`;
  })).join("/");
  return { newRel: out, lps: [...lps], excluded, unmapped };
}

async function* walk(dir, base = dir) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p, base);
    else if (e.isFile() && !e.name.startsWith(".")) yield path.relative(base, p).split(path.sep).join("/");
  }
}

/** 計画を作る（書かない）。 */
export async function planCopy(src, include, lookup) {
  const plan = { copies: [], excluded: [], unmapped: [], collisions: [], noLp: 0, bytes: 0 };
  const seen = new Map();
  for (const top of include) {
    const dir = path.join(src, top);
    if (!(await fs.access(dir).then(() => true, () => false))) { plan.unmapped.push(`（フォルダなし）${top}`); continue; }
    for await (const sub of walk(dir)) {
      const rel = `${top}/${sub}`;
      const r = renameRel(rel, lookup);
      if (r.unmapped.length) { plan.unmapped.push(`${rel}（${[...new Set(r.unmapped)].join("・")}）`); continue; }
      if (r.excluded) { plan.excluded.push(rel); continue; }
      if (!r.lps.length) plan.noLp++;
      if (seen.has(r.newRel)) { plan.collisions.push(`${rel} ↔ ${seen.get(r.newRel)} → ${r.newRel}`); continue; }
      seen.set(r.newRel, rel);
      const st = await fs.stat(path.join(src, rel));
      plan.bytes += st.size;
      plan.copies.push({ from: rel, to: r.newRel, size: st.size });
    }
  }
  return plan;
}

/** コピー（新規のみ）。すでにあるファイルは、同じ容量ならスキップ、違えば止める。 */
export async function applyCopy(src, dest, plan, log = () => {}) {
  let done = 0, skipped = 0;
  for (const c of plan.copies) {
    const to = path.join(dest, c.to);
    await fs.mkdir(path.dirname(to), { recursive: true });
    try {
      await fs.copyFile(path.join(src, c.from), to, fs.constants.COPYFILE_EXCL);
      done++;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      const st = await fs.stat(to);
      if (st.size !== c.size) throw new Error(`すでにあり、容量が違います（上書きしません）: ${c.to}`);
      skipped++;
    }
    if ((done + skipped) % 500 === 0) log(`  ${done + skipped}/${plan.copies.length}`);
  }
  return { done, skipped };
}

async function main() {
  const { values } = parseArgs({ options: { apply: { type: "boolean" }, verify: { type: "boolean" }, src: { type: "string" }, dest: { type: "string" }, include: { type: "string" }, map: { type: "string" } } });
  const map = JSON.parse(await fs.readFile(path.join(REPO, values.map || "data/lp-renumber-map.json"), "utf8"));
  const lookup = buildLookup(map);
  const src = values.src || path.join(BASE, "10_LP");
  const dest = values.dest || path.join(BASE, "10_LP_新番号");
  const include = (values.include || "01_案件別,02_セクション別").split(",").map((s) => s.trim()).filter(Boolean);
  const plan = await planCopy(src, include, lookup);
  const gb = (plan.bytes / 1024 ** 3).toFixed(2);
  console.log(`元: ${src}\n先: ${dest}\n対象フォルダ: ${include.join("・")}\nコピーするファイル: ${plan.copies.length} 件（${gb} GB）／除外（重複のLP）: ${plan.excluded.length} 件／LP番号のないファイル: ${plan.noLp} 件`);
  for (const c of plan.copies.slice(0, 3)) console.log(`  例: ${c.from}\n   → ${c.to}`);
  if (plan.unmapped.length) console.log(`\n対応表にない・見つからない: ${plan.unmapped.length} 件（先頭5件）\n  ${plan.unmapped.slice(0, 5).join("\n  ")}`);
  if (plan.collisions.length) console.log(`\n名前の衝突: ${plan.collisions.length} 件（先頭5件）\n  ${plan.collisions.slice(0, 5).join("\n  ")}`);
  if (values.verify) {
    let missing = 0, diff = 0;
    for (const c of plan.copies) {
      const st = await fs.stat(path.join(dest, c.to)).catch(() => null);
      if (!st) missing++; else if (st.size !== c.size) diff++;
    }
    console.log(`\n照合: ファイル ${plan.copies.length} 件のうち、先にない ${missing} 件、容量が違う ${diff} 件`);
    return;
  }
  if (!values.apply) { console.log("\nドライランです（何も書いていません）。コピーするには、--apply と DIS_ENABLE_WRITES=true が必要です"); return; }
  if (process.env.DIS_ENABLE_WRITES !== "true") throw new Error("コピーには DIS_ENABLE_WRITES=true も必要です（Dropbox への書込みのため）");
  if (map.status !== "confirmed") throw new Error(`対応表（data/lp-renumber-map.json）が確定していません（status=${map.status}）。ユーザーの確認後に confirmed にします`);
  if (plan.unmapped.length || plan.collisions.length) throw new Error("対応表にない番号、または名前の衝突があります。先に直してください");
  if (await fs.access(dest).then(() => true, () => false)) console.log("注: コピー先がすでにあります。途中からの再開（すでにあるファイルは、容量が同じならスキップ）");
  const r = await applyCopy(src, dest, plan, console.log);
  console.log(`\nコピーしました: 新規 ${r.done} 件／スキップ ${r.skipped} 件。--verify で照合してください`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main().catch((e) => { console.error(e.message); process.exit(1); });
