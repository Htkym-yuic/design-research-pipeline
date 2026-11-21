#!/usr/bin/env node
/**
 * フォルダ A の中の「すべてのファイル」が、フォルダ B の中に、同じ中身（ハッシュが同じ）で存在するかを調べる（読むだけ。何も変更・削除しない）。
 * 名前が違っていてもよい（番号の付け替え前後を、中身で突き合わせる）。
 *
 *   node scripts/dis/compare-trees.mjs                               # 既定: A=10_LP_新番号／B=10_LP（01_案件別・02_セクション別・91〜96）
 *   オプション: --a <フォルダ> --b <フォルダ> --b-include 01_案件別,02_セクション別,96_参考_アーカイブ版
 *
 * 結果: 「Bに同じ中身がある」件数と、「Bに無い（消すと失われる）」ファイルの一覧（data/compare-trees-unmatched.csv）。
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LAB = path.join(os.homedir(), "Library/CloudStorage/Dropbox/10_デザイン/01_言語化ラボ");

export async function* walk(dir) {
  for (const e of await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p); else if (e.isFile() && !e.name.startsWith(".")) yield p;
  }
}
export function sha256(file) {
  return new Promise((resolve, reject) => { const h = crypto.createHash("sha256"); fs.createReadStream(file).on("data", (d) => h.update(d)).on("end", () => resolve(h.digest("hex"))).on("error", reject); });
}

/** A の各ファイルが、B にあるか。{ total, matched, unmatched:[{file,size,reason}] } */
export async function compareTrees(filesA, filesB, log = () => {}) {
  const bySize = new Map();
  for (const f of filesB) { const st = await fsp.stat(f); if (!bySize.has(st.size)) bySize.set(st.size, []); bySize.get(st.size).push(f); }
  const hashCache = new Map();
  const hashOf = async (f) => { if (!hashCache.has(f)) hashCache.set(f, await sha256(f)); return hashCache.get(f); };
  const out = { total: filesA.length, matched: 0, unmatched: [] };
  let i = 0;
  for (const f of filesA) {
    const st = await fsp.stat(f); const cands = bySize.get(st.size);
    if (!cands) out.unmatched.push({ file: f, size: st.size, reason: "同じ容量のファイルがBにない" });
    else {
      const h = await hashOf(f); let ok = false;
      for (const c of cands) if ((await hashOf(c)) === h) { ok = true; break; }
      if (ok) out.matched++; else out.unmatched.push({ file: f, size: st.size, reason: "容量は同じだが、中身が違う" });
    }
    if (++i % 500 === 0) log(`  ${i}/${filesA.length}`);
  }
  return out;
}

async function main() {
  const { values: v } = parseArgs({ options: { a: { type: "string", default: path.join(LAB, "10_LP_新番号") }, b: { type: "string", default: path.join(LAB, "10_LP") }, "b-include": { type: "string" } } });
  const include = (v["b-include"] || "01_案件別,02_セクション別,91_参考_概観図,92_参考_再撮影の別版,93_参考_DIS分析ファイル,94_参考_機械分割,95_参考_その他,96_参考_アーカイブ版").split(",").map((s) => s.trim());
  const filesA = []; for await (const f of walk(v.a)) filesA.push(f);
  const tops = (await fsp.readdir(v.b, { withFileTypes: true })).filter((e) => e.isDirectory() && (include.includes(e.name) || include.some((x) => e.name.startsWith(x.slice(0, 3))))).map((e) => e.name);
  const filesB = []; for (const t of tops) for await (const f of walk(path.join(v.b, t))) filesB.push(f);
  console.log(`A: ${v.a}（${filesA.length} ファイル）\nB: ${v.b}（${tops.join(" / ")}、${filesB.length} ファイル）\n中身（SHA-256）で突き合わせます。時間がかかります…`);
  const r = await compareTrees(filesA, filesB, console.log);
  console.log(`\nAのうち、Bに同じ中身がある: ${r.matched} / ${r.total} ファイル`);
  console.log(`Bに無い（Aを消すと失われる）: ${r.unmatched.length} ファイル`);
  const byTop = {};
  for (const u of r.unmatched) { const k = path.relative(v.a, u.file).split(path.sep).slice(0, 2).join("/"); byTop[k] = (byTop[k] || 0) + 1; }
  for (const [k, n] of Object.entries(byTop).sort((x, y) => y[1] - x[1]).slice(0, 15)) console.log(`  ${String(n).padStart(5)}  ${k}`);
  const csv = ["ファイル,容量,理由", ...r.unmatched.map((u) => `"${path.relative(v.a, u.file).replace(/"/g, '""')}",${u.size},"${u.reason}"`)].join("\n") + "\n";
  await fsp.writeFile(path.join(REPO, "data/compare-trees-unmatched.csv"), csv);
  console.log("\n一覧: data/compare-trees-unmatched.csv（リポジトリ内のみ。何も変更・削除していません）");
  console.log(r.unmatched.length === 0 ? "→ Aの中身は、すべてBにあります。" : "→ Bに無いファイルがあります。消す前に、一覧を確認してください。");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(e.message); process.exit(1); });
