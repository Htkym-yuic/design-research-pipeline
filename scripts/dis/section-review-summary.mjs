#!/usr/bin/env node
/**
 * 画像確認の結果（data/lp-section-review/LP-nnnn.json）を集計する（読むだけ）。
 *   node scripts/dis/section-review-summary.mjs
 * 出力: 画面の集計と、data/lp-section-review-fixes.csv（直す候補の一覧。ファイルは動かさない）
 * 結果の書式は docs/SECTION_REVIEW_PROTOCOL.md を参照。
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const VERDICTS = ["ok", "wrong_kind", "mixed", "bad_crop", "duplicate", "unreadable"];

/** 結果の配列から、集計と直す候補を作る。 */
export function summarize(results) {
  const verdicts = Object.fromEntries(VERDICTS.map((v) => [v, 0]));
  const fixes = [], missing = [], problems = [];
  for (const r of results) {
    let bad = 0;
    for (const dev of ["PC", "SP"]) {
      for (const s of r.devices?.[dev]?.sections || []) {
        verdicts[s.verdict] = (verdicts[s.verdict] || 0) + 1;
        if (s.verdict !== "ok") { bad++; fixes.push({ lp: r.lp, dev, file: s.file, 現在の種類: s.assignedKind, 判定: s.verdict, 正しい種類: s.correctKind || "", 理由: s.note || "" }); }
      }
      for (const m of r.devices?.[dev]?.missing || []) { bad++; missing.push({ lp: r.lp, dev, 種類: m.kind, 根拠: m.evidence || "" }); }
    }
    if (bad) problems.push(r.lp);
  }
  return { reviewed: results.length, verdicts, fixes, missing, problemLps: problems };
}

async function main() {
  const dir = path.join(REPO, "data/lp-section-review");
  const files = (await fs.readdir(dir).catch(() => [])).filter((f) => /^LP-\d{4}\.json$/.test(f));
  const results = [];
  for (const f of files) results.push(JSON.parse(await fs.readFile(path.join(dir, f), "utf8")));
  const s = summarize(results);
  console.log(`確認済みLP: ${s.reviewed}\n判定: ${VERDICTS.map((v) => `${v}=${s.verdicts[v]}`).join(" ")}\n問題のあるLP: ${s.problemLps.length}\n不足している種類: ${s.missing.length}`);
  const rows = [...s.fixes.map((x) => ({ 区分: "要修正", ...x })), ...s.missing.map((x) => ({ 区分: "不足", lp: x.lp, dev: x.dev, file: "", 現在の種類: "", 判定: "missing", 正しい種類: x.種類, 理由: x.根拠 }))];
  if (rows.length) {
    const head = Object.keys(rows[0]);
    await fs.writeFile(path.join(REPO, "data/lp-section-review-fixes.csv"), [head.join(","), ...rows.map((r) => head.map((h) => `"${String(r[h]).replace(/"/g, '""')}"`).join(","))].join("\n") + "\n");
    console.log("書き出し: data/lp-section-review-fixes.csv（ファイルは動かしていません）");
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(e.message); process.exit(1); });
