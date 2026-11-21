#!/usr/bin/env node
/**
 * 全LPについて、「セクション画像（FV・ベネフィット・悩み提起・フッター等）」が取得できているかを調べる（読むだけ。何も書かない）。
 *
 *   node scripts/dis/section-audit.mjs                 # 一覧を表示し、data/lp-section-audit.csv と .json を作る（リポジトリ内のみ）
 *   オプション: --src <10_LP> --out data/lp-section-audit
 *
 * ・LPの一覧: data/lp-renumber-map.json（旧LP番号 LP-0001〜）。
 * ・見る場所: <10_LP>/01_案件別/LP-nnnn_*（全体画像 *_PC_全体 / *_SP_全体）と、<10_LP>/02_セクション別/<NN_種類>/{PC,SP}/LP-nnnn_*_{PC|SP}_NN_種類.*
 * ・区分: 全体画像なし（先に撮影が必要）／セクション未取得（全体画像はある＝切り出し対象）／FVのみ／PCのみ／SPのみ／取得済み。
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_SRC = path.join(os.homedir(), "Library/CloudStorage/Dropbox/10_デザイン/01_言語化ラボ/10_LP");

async function ls(dir) { return fs.readdir(dir, { withFileTypes: true }).catch(() => []); }
async function* walk(dir) {
  for (const e of await ls(dir)) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p); else if (e.isFile()) yield p;
  }
}
const IMG = /\.(png|jpe?g|webp)$/i;

/** 10_LP を走査して、LP番号ごとの { full:{PC,SP}, sections:{PC:Set,SP:Set}, hasCaseDir } を返す。 */
export async function scan(src) {
  const by = new Map();
  const get = (lp) => { if (!by.has(lp)) by.set(lp, { hasCaseDir: false, full: { PC: false, SP: false }, sections: { PC: new Set(), SP: new Set() } }); return by.get(lp); };
  for (const e of await ls(path.join(src, "01_案件別"))) {
    const m = e.isDirectory() && /^LP-(\d{4})(?=_|$)/.exec(e.name);
    if (!m) continue;
    const rec = get(`LP-${m[1]}`); rec.hasCaseDir = true;
    for await (const f of walk(path.join(src, "01_案件別", e.name))) {
      const b = path.basename(f);
      if (!IMG.test(b)) continue;
      if (/_PC_全体\./.test(b)) rec.full.PC = true;
      if (/_SP_全体\./.test(b)) rec.full.SP = true;
    }
  }
  const kinds = [];
  for (const k of await ls(path.join(src, "02_セクション別"))) {
    if (!k.isDirectory()) continue;
    kinds.push(k.name);
    for (const dev of ["PC", "SP"]) {
      for (const f of await ls(path.join(src, "02_セクション別", k.name, dev))) {
        const m = f.isFile() && IMG.test(f.name) && /^LP-(\d{4})_/.exec(f.name);
        if (m) get(`LP-${m[1]}`).sections[dev].add(k.name);
      }
    }
  }
  return { by, kinds: kinds.sort() };
}

/** 1LPの区分。 */
export function classify(rec) {
  if (!rec) return "全体画像なし";
  const pc = rec.sections.PC.size, sp = rec.sections.SP.size;
  if (pc === 0 && sp === 0) return (rec.full.PC || rec.full.SP) ? "セクション未取得（全体画像あり）" : "全体画像なし";
  if (pc && !sp) return "SPなし";
  if (sp && !pc) return "PCなし";
  const all = new Set([...rec.sections.PC, ...rec.sections.SP]);
  if (all.size <= 1) return "FVのみ";
  return "取得済み";
}

async function main() {
  const { values: v } = parseArgs({ options: { src: { type: "string", default: DEFAULT_SRC }, out: { type: "string", default: "data/lp-section-audit" } } });
  const map = JSON.parse(await fs.readFile(path.join(REPO, "data/lp-renumber-map.json"), "utf8"));
  const { by, kinds } = await scan(v.src);
  const rows = map.items.map((it) => {
    const rec = by.get(it.oldLp);
    const pcKinds = rec ? [...rec.sections.PC].sort() : [], spKinds = rec ? [...rec.sections.SP].sort() : [];
    const have = new Set([...pcKinds, ...spKinds]);
    return {
      lp: it.oldLp, title: it.title, 区分: classify(rec), 案件別フォルダ: rec?.hasCaseDir ? "有" : "無",
      全体PC: rec?.full.PC ? "有" : "無", 全体SP: rec?.full.SP ? "有" : "無",
      PC種類数: pcKinds.length, SP種類数: spKinds.length,
      取得済みの種類: [...have].map((k) => k.replace(/^\d+_/, "")).join("/"), 重複扱い: it.status === "excluded_duplicate" ? "重複" : "",
    };
  });
  const count = {};
  for (const r of rows) count[r.区分] = (count[r.区分] || 0) + 1;
  console.log(`元: ${v.src}\n種類フォルダ: ${kinds.join(" ")}\n対象LP: ${rows.length}\n`);
  for (const [k, n] of Object.entries(count).sort()) console.log(`${String(n).padStart(4)}  ${k}`);
  for (const k of ["全体画像なし", "セクション未取得（全体画像あり）", "SPなし", "PCなし", "FVのみ"]) {
    const list = rows.filter((r) => r.区分 === k);
    if (list.length) console.log(`\n[${k}] ${list.length}件\n  ` + list.map((r) => `${r.lp}${r.重複扱い ? "(重複)" : ""} ${r.title}`).join("\n  "));
  }
  const head = Object.keys(rows[0]);
  const csv = [head.join(","), ...rows.map((r) => head.map((h) => `"${String(r[h]).replace(/"/g, '""')}"`).join(","))].join("\n") + "\n";
  await fs.writeFile(path.join(REPO, v.out + ".csv"), csv);
  await fs.writeFile(path.join(REPO, v.out + ".json"), JSON.stringify({ generatedAt: new Date().toISOString(), kinds, count, rows }, null, 2) + "\n");
  console.log(`\n書き出し: ${v.out}.csv / ${v.out}.json（リポジトリ内のみ。Dropbox・Notionは変更していません）`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(e.message); process.exit(1); });
