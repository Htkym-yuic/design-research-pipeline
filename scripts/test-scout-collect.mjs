#!/usr/bin/env node
// Design Research Scout コレクターの純粋関数のユニットテスト（ネットワーク不使用）。
// ネットワークを使うモジュール（github-client.mjs）は、
// `npm run scout:collect -- --count-only` 等で実際に動かして確認する。
//
// 移植元: imsaif/design-with-claude の research-scout ブランチ
// (scripts/test-research-collect.mjs)。classifyFrontend関連のテストは、
// このリポジトリではis_frontend列自体を落としたため対象外。
import assert from "node:assert/strict";
import { quarterOf, toCsv, rowFrom, CSV_HEADER, countHistoryRow, COUNT_HISTORY_HEADER } from "./scout/toCsv.mjs";
import { wilson95, formatCi } from "./scout/stats.mjs";
import { fingerprintSpec, FINGERPRINTS } from "./scout/fingerprints.mjs";

let passed = 0;
const ok = (name) => { console.log(`  ✓ ${name}`); passed += 1; };

// --- fingerprintSpec ---------------------------------------------------------
assert.equal(fingerprintSpec("tailwind.config.js").path, "tailwind.config.js");
ok("fingerprintSpec: tailwind.config.js のpathが設定されている");

assert.equal(fingerprintSpec(".storybook").path, null);
ok("fingerprintSpec: .storybook はディレクトリ単位のためpathがnull");

assert.throws(() => fingerprintSpec("unknown-fingerprint"), /未知の指紋です/);
ok("fingerprintSpec: 未知の指紋はエラーになる");

assert.ok(Object.keys(FINGERPRINTS).length >= 3, "指紋は3種類以上あるべき");
ok("FINGERPRINTS: 最低限の指紋セットが揃っている");

// --- quarterOf ---------------------------------------------------------------
assert.equal(quarterOf("2026-03-15T10:57:48Z"), "2026Q1");
ok("2026-03 => 2026Q1");
assert.equal(quarterOf("2025-10-31T11:42:13Z"), "2025Q4");
ok("2025-10 => 2025Q4");
assert.equal(quarterOf("2025-04-01T00:00:00Z"), "2025Q2");
ok("2025-04 => 2025Q2");
assert.equal(quarterOf("2026-07-01T00:00:00Z"), "2026Q3");
ok("2026-07 => 2026Q3");

// --- toCsv / rowFrom -----------------------------------------------------------
const rows = [
  rowFrom({ repo: "vercel/next.js", fingerprint: "tailwind.config.js", firstCommit: "2026-03-15T10:57:48Z" }),
  rowFrom({ repo: "shadcn-ui/ui", fingerprint: ".storybook", firstCommit: "2025-10-31T11:42:13Z" }),
];
const csv = toCsv(rows);
const lines = csv.trim().split("\n");
assert.equal(lines[0], CSV_HEADER);
ok("CSVヘッダーが仕様どおり");
assert.equal(lines[0], "repo,fingerprint,first_commit,quarter");
ok("CSVヘッダーの列構成が正しい");
assert.equal(lines[1], "vercel/next.js,tailwind.config.js,2026-03-15T10:57:48Z,2026Q1");
ok("行: quarterが正しく算出されている");
assert.ok(csv.endsWith("\n"), "CSVは末尾改行で終わるべき");
ok("CSVが末尾改行で終わっている");

// --- wilson95 / formatCi（p=0での偽の精度バグを踏襲して確認） -------------------
{
  const { low, high } = wilson95(0, 40);
  assert.equal(low, 0, "0/40の下限は0");
  assert.ok(high > 0.05 && high < 0.13, `0/40の上限は約9%のはず、実際は${(high * 100).toFixed(1)}%`);
}
ok("wilson95(0,40) => [0, ~9%]（±0の偽の精度にならない）");

{
  const { low, high } = wilson95(63, 278);
  assert.ok(Math.round(low * 100) >= 18 && Math.round(low * 100) <= 19, `下限は約18%のはず`);
  assert.ok(Math.round(high * 100) >= 27 && Math.round(high * 100) <= 29, `上限は約28%のはず`);
}
ok("wilson95(63,278) が移植元スタディの18-28%を再現する");

assert.equal(formatCi(63, 278), "23% (95% CI 18-28%, n=278)");
ok("formatCiが期待どおりの文字列を返す");
assert.equal(formatCi(0, 0), "0% (95% CI 0-100%, n=0)");
ok("formatCiがn=0でも0除算せずに動く");

// --- countHistoryRow ---------------------------------------------------------
assert.equal(COUNT_HISTORY_HEADER, "date,fingerprint,total_count");
ok("件数履歴CSVのヘッダーが仕様どおり");
assert.equal(
  countHistoryRow({ date: "2026-10-18", fingerprint: "tailwind.config.js", count: 1277952 }),
  "2026-10-18,tailwind.config.js,1277952",
);
ok("countHistoryRow: 日付・指紋・件数が仕様どおりの順で並ぶ");

console.log(`\n✅ scout-collect: ${passed}件のアサーションに成功`);
