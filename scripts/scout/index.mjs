#!/usr/bin/env node
// Design Research Scout コレクターCLI — デザイン制作・デザインシステム関連の
// GitHub公開コードの傾向を、再現可能な形で収集する。
//
// 移植元: imsaif/design-with-claude の research-scout ブランチ
// (scripts/research/collect/index.mjs)。ガードレール（draft-only、数値を盛らない、
// 限界を書く）と「count-only -> sample -> CSV -> Wilson 95% CI -> draft」の
// ループはそのまま踏襲し、`gh` CLI依存をfetchベースのgithub-client.mjsへ置き換えた。
//
//   node scripts/scout/index.mjs --fingerprint=tailwind.config.js --sample=30
//   node scripts/scout/index.mjs --fingerprint=.storybook --count-only
//
// OpenAI/Anthropic APIは一切呼ばない。GITHUB_TOKENのみを使う。
import { writeFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fingerprintSpec } from "./fingerprints.mjs";
import { searchCount, searchRepos, firstCommitDate } from "./github-client.mjs";
import { rowFrom, toCsv, COUNT_HISTORY_HEADER, countHistoryRow } from "./toCsv.mjs";
import { formatCi } from "./stats.mjs";

const COUNT_HISTORY_PATH = "docs/scout/count-history.csv";

function parseArgs(argv) {
  const args = { fingerprint: null, sample: 30, out: null, countOnly: false };
  for (const a of argv.slice(2)) {
    if (a.startsWith("--fingerprint=")) args.fingerprint = a.slice("--fingerprint=".length);
    else if (a.startsWith("--sample=")) args.sample = parseInt(a.slice("--sample=".length), 10);
    else if (a.startsWith("--out=")) args.out = a.slice("--out=".length);
    else if (a === "--count-only") args.countOnly = true;
    else if (a === "--help" || a === "-h") args.help = true;
  }
  return args;
}

function usage() {
  console.log(`Design Research Scout コレクター

  --fingerprint=<name[,name...]>  指紋（デザイン関連の設定ファイル等）
  --sample=<N>                    指紋ごとに抽出するリポジトリ数（既定30）
  --out=<path>                    CSV出力先（既定 docs/scout/drafts/<date>-<fp>-sample.csv）
  --count-only                    total_countの目安のみ表示し、サンプリングしない
  --help                          このヘルプ

指紋一覧: scripts/scout/fingerprints.mjs`);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.fingerprint) {
    usage();
    process.exit(args.fingerprint ? 0 : 2);
  }

  const fingerprints = args.fingerprint.split(",").map((s) => s.trim()).filter(Boolean);
  fingerprints.forEach(fingerprintSpec); // 先に全部検証する

  // --- 規模: directionalなtotal_countの目安（揮発性が高いことを明示する） ---
  console.log("規模 — GitHub `search/code` のtotal_count（再現可能だが揮発性が高いconservativeな");
  console.log("floor値。リポジトリ数ではなくインデックス済みファイル数であることに注意）:");
  const runDate = today();
  mkdirSync(dirname(COUNT_HISTORY_PATH), { recursive: true });
  if (!existsSync(COUNT_HISTORY_PATH)) writeFileSync(COUNT_HISTORY_PATH, `${COUNT_HISTORY_HEADER}\n`);
  for (const fp of fingerprints) {
    const { query } = fingerprintSpec(fp);
    const count = await searchCount(query);
    console.log(`  ${fp.padEnd(20)} ${count.toLocaleString("en-US")}`);
    appendFileSync(COUNT_HISTORY_PATH, `${countHistoryRow({ date: runDate, fingerprint: fp, count })}\n`);
  }
  if (args.countOnly) return;

  // --- サンプリング: リポジトリ -> 採用日（first-commit） ---
  const perFp = Math.max(1, Math.ceil(args.sample / fingerprints.length));
  const rows = [];
  let capHit = false;
  const skipped = { noDate: 0, noPath: 0 };

  for (const fp of fingerprints) {
    const { query, path } = fingerprintSpec(fp);
    if (!path) {
      skipped.noPath += 1;
      console.error(`  ${fp} はディレクトリ単位の指紋のため、採用日を算出できません（count-onlyのみ対応）。`);
      continue;
    }
    const { repos, hitCap } = await searchRepos(query, perFp);
    capHit = capHit || hitCap;
    console.error(`  ${fp} を ${repos.length}件サンプリング中...`);
    for (const repo of repos) {
      const firstCommit = await firstCommitDate(repo, path);
      if (!firstCommit) {
        skipped.noDate += 1;
        continue;
      }
      rows.push(rowFrom({ repo, fingerprint: fp, firstCommit }));
    }
  }

  // --- CSV書き出し ---
  const outPath = args.out
    || `docs/scout/drafts/${today()}-${fingerprints.join("+").replace(/[^a-zA-Z0-9.+-]/g, "")}-sample.csv`;
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, toCsv(rows));

  // --- directionalな要約（ここで数値を確定させない） ---
  const n = rows.length;
  const byQuarter = {};
  for (const row of rows) byQuarter[row.quarter] = (byQuarter[row.quarter] || 0) + 1;

  console.log(`\nサンプルを書き出しました: ${outPath}`);
  console.log(
    `  N:  ${n}` +
      `${skipped.noDate ? `（採用日が取得できず${skipped.noDate}件スキップ）` : ""}` +
      `${skipped.noPath ? `（ディレクトリ単位指紋${skipped.noPath}件はサンプリング対象外）` : ""}`,
  );
  if (n > 0) {
    console.log("  四半期別件数（DIRECTIONAL・小標本の場合は参考程度）:");
    for (const [quarter, count] of Object.entries(byQuarter).sort()) {
      console.log(`    ${quarter}: ${count}件 ${formatCi(count, n)}`);
    }
  }
  if (capHit) console.log("  ⚠ いずれかの指紋で1,000件の検索上限に到達。サンプルは関連度順で、ランダムではない。");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
