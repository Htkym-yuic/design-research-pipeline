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
  const expected = JSON.parse(await fs.readFile(path.join(REPO, "config/section-expected-gaps.json"), "utf8").catch(() => "{}")).items || {};
  const rows = map.items.map((it) => {
    const rec = by.get(it.oldLp);
    const pcKinds = rec ? [...rec.sections.PC].sort() : [], spKinds = rec ? [...rec.sections.SP].sort() : [];
    const have = new Set([...pcKinds, ...spKinds]);
    return {
      lp: it.oldLp, title: it.title, 区分: (classify(rec) === "SPなし" && expected[it.oldLp]?.SP) ? "SPなし（許容）" : (classify(rec) === "PCなし" && expected[it.oldLp]?.PC) ? "PCなし（許容）" : classify(rec), 案件別フォルダ: rec?.hasCaseDir ? "有" : "無",
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
  // 種類ごとの取得状況（PC/SP それぞれ、何件のLPに画像があるか）と、種類数の少ないLP
  const perKind = Object.fromEntries(kinds.map((k) => [k, { PC: 0, SP: 0 }]));
  for (const it of map.items) { const rec = by.get(it.oldLp); if (!rec) continue; for (const d of ["PC", "SP"]) for (const k of rec.sections[d]) perKind[k][d]++; }
  console.log("\n[種類ごとの取得LP数]（PC / SP）");
  for (const k of kinds) console.log(`  ${k.padEnd(10)} ${String(perKind[k].PC).padStart(4)} / ${String(perKind[k].SP).padStart(4)}`);
  const hist = {};
  for (const r of rows) hist[r.PC種類数] = (hist[r.PC種類数] || 0) + 1;
  console.log("\n[PCの種類数の分布]（種類数: LP数）  " + Object.entries(hist).sort((a, b) => a[0] - b[0]).map(([n, c]) => `${n}:${c}`).join("  "));
  const thin = rows.filter((r) => r.区分 === "取得済み" && (Math.min(r.PC種類数, r.SP種類数) <= 3 || Math.abs(r.PC種類数 - r.SP種類数) >= 3));
  if (thin.length) console.log(`\n[要確認: 種類数が3以下、またはPCとSPの差が3以上] ${thin.length}件\n  ` + thin.map((r) => `${r.lp} ${r.title}  PC${r.PC種類数}/SP${r.SP種類数} [${r.取得済みの種類}]`).join("\n  "));
  // 有無の一覧表（案件別 × セクション別）
  const caseLps = [...by].filter(([, r]) => r.hasCaseDir).map(([lp]) => lp).sort();
  const secLps = [...by].filter(([, r]) => r.sections.PC.size || r.sections.SP.size).map(([lp]) => lp).sort();
  const inMap = new Set(map.items.map((i) => i.oldLp));
  const caseNoSec = caseLps.filter((lp) => !secLps.includes(lp));
  const secNoCase = secLps.filter((lp) => !caseLps.includes(lp));
  console.log(`\n[案件別 ↔ セクション別]  案件別のLPフォルダ: ${caseLps.length} / セクション別に1枚でもあるLP: ${secLps.length}`);
  console.log(`  案件別にあって、セクション別に1枚も無い: ${caseNoSec.length}件 ${caseNoSec.join(" ")}`);
  console.log(`  セクション別にあって、案件別に無い: ${secNoCase.length}件 ${secNoCase.join(" ")}`);
  console.log(`  対応表（${map.items.length}件）のうち、案件別フォルダが無い: ${map.items.filter((i) => !by.get(i.oldLp)?.hasCaseDir).map((i) => i.oldLp).join(" ") || "なし"}`);
  console.log(`  案件別・セクション別にあるが、対応表に無い番号: ${[...new Set([...caseLps, ...secLps])].filter((lp) => !inMap.has(lp)).join(" ") || "なし"}`);
  console.log("\n[種類ごとの有無]（LP数: PCあり / SPあり / 両方 / どちらも無し）");
  const matrix = [];
  for (const k of kinds) {
    let pc = 0, sp = 0, both = 0;
    for (const it of map.items) { const r = by.get(it.oldLp); const a = r?.sections.PC.has(k), b = r?.sections.SP.has(k); if (a) pc++; if (b) sp++; if (a && b) both++; }
    console.log(`  ${k.padEnd(10)} ${String(pc).padStart(4)} / ${String(sp).padStart(4)} / ${String(both).padStart(4)} / ${String(map.items.length - new Set(map.items.filter((it) => by.get(it.oldLp)?.sections.PC.has(k) || by.get(it.oldLp)?.sections.SP.has(k))).size).padStart(4)}`);
  }
  const fv = kinds.find((k) => /FV/.test(k));
  const noFv = (dev) => map.items.filter((it) => !expected[it.oldLp]?.[dev] && !by.get(it.oldLp)?.sections[dev].has(fv)).map((it) => it.oldLp);
  console.log(`\n[FV（${fv}）が無いLP]  PC: ${noFv("PC").length}件 ${noFv("PC").join(" ")}\n                    SP: ${noFv("SP").length}件 ${noFv("SP").join(" ")}`);
  for (const it of map.items) { const r = by.get(it.oldLp); const row = { lp: it.oldLp, title: it.title, 案件別: r?.hasCaseDir ? "有" : "無" }; for (const k of kinds) row[k] = `${r?.sections.PC.has(k) ? "PC" : "-"}${r?.sections.SP.has(k) ? "SP" : "-"}`; matrix.push(row); }
  const mh = Object.keys(matrix[0]);
  await fs.writeFile(path.join(REPO, "data/lp-section-matrix.csv"), [mh.join(","), ...matrix.map((r) => mh.map((h) => `"${r[h]}"`).join(","))].join("\n") + "\n");
  console.log("\n有無の一覧表: data/lp-section-matrix.csv（LP × 16種類。PC/SP/-）");
  const head = Object.keys(rows[0]);
  const csv = [head.join(","), ...rows.map((r) => head.map((h) => `"${String(r[h]).replace(/"/g, '""')}"`).join(","))].join("\n") + "\n";
  await fs.writeFile(path.join(REPO, v.out + ".csv"), csv);
  await fs.writeFile(path.join(REPO, v.out + ".json"), JSON.stringify({ generatedAt: new Date().toISOString(), kinds, count, rows }, null, 2) + "\n");
  console.log(`\n書き出し: ${v.out}.csv / ${v.out}.json（リポジトリ内のみ。Dropbox・Notionは変更していません）`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(e.message); process.exit(1); });
