// 登録済みのDIS案件に、dis-2.0 の分析・注釈・検索用データを「新しいファイルとして」追加する。
// 既存のDropboxフォルダ・ファイル・Notionは変更しない。追加先は <案件フォルダ>/03_Analysis_v2/ （新規サブフォルダ）。
// 既定はドライラン。実書込みは --apply かつ DIS_ENABLE_WRITES=true かつ DRY_RUN=false のときだけ。
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLedger, saveLedger } from "./lib/ledger.mjs";
import { validateAnalysis, analysisToMarkdown } from "./lib/analysis-schema.mjs";
import { validateAnnotations } from "./lib/annotations.mjs";
import { buildTextIndex } from "./lib/text-index.mjs";
import { assertWritesAllowed, writesAllowed } from "./lib/write-guard.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const SUBDIR = "03_Analysis_v2";

/** 台帳の1件から、追加するファイル一式（メモリ上）と検証結果を作る。 */
export function buildSupplement(entry, analysis, annotations, now = new Date()) {
  const a = JSON.parse(JSON.stringify(analysis));
  a.disId = entry.disId; // ID・実URLは台帳（登録済みの事実）を正とする
  a.pageUrl = entry.pageUrl;
  if (!a.brand || a.brand === "AUTO") a.brand = entry.brand;
  const errors = [...validateAnalysis(a).errors.map((e) => `analysis: ${e}`), ...validateAnnotations(annotations, a).errors.map((e) => `annotations: ${e}`)];
  const files = errors.length ? [] : [
    { name: "analysis_v2.json", body: JSON.stringify(a, null, 2) + "\n" },
    { name: "analysis_v2.md", body: analysisToMarkdown(a) },
    { name: "annotations_v2.json", body: JSON.stringify(annotations, null, 2) + "\n" },
    { name: "text-index_v2.json", body: JSON.stringify(buildTextIndex(a, now), null, 2) + "\n" }
  ];
  return { errors, files, remoteDir: `${entry.dropbox.folder}/${SUBDIR}` };
}

async function main() {
  const argv = process.argv.slice(2);
  const get = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : null; };
  const opts = { apply: argv.includes("--apply") };
  const date = get("date");
  const ledger = await loadLedger();
  const targets = ledger.entries.filter((e) => e.dropbox?.folder && (!date || e.date === date));
  console.log(`モード: ${writesAllowed(opts) ? "本番（新規ファイルのみ追加）" : "ドライラン（外部書込みなし）"}／対象 ${targets.length} 件`);
  let failed = 0;
  for (const e of targets) {
    const base = path.resolve(here, "../../candidates/dis", e.date, e.disId);
    let analysis, annotations;
    try {
      analysis = JSON.parse(await fs.readFile(`${base}.v2.analysis.json`, "utf8"));
      annotations = JSON.parse(await fs.readFile(`${base}.v2.annotations.json`, "utf8"));
    } catch { console.log(`- ${e.disId}: v2ファイルなし（スキップ）`); continue; }
    const s = buildSupplement(e, analysis, annotations);
    if (s.errors.length) { failed++; console.log(`- ${e.disId}: 検証NG\n    ${s.errors.join("\n    ")}`); continue; }
    if (e.supplementV2?.status === "created") { console.log(`- ${e.disId}: 追加済み（スキップ）`); continue; }
    console.log(`- ${e.disId}: 検証OK → ${s.remoteDir}/ に ${s.files.map((f) => f.name).join(", ")}`);
    if (!writesAllowed(opts)) continue;
    assertWritesAllowed(opts);
    const { pathExists, ensureFolder, uploadFileNoOverwrite } = await import("../lib/dropbox-client.mjs");
    if (!(await pathExists(e.dropbox.folder))) { failed++; console.log(`    案件フォルダが見つかりません（中止）`); continue; }
    if (await pathExists(s.remoteDir)) { failed++; console.log(`    ${SUBDIR} が既に存在します（上書きしないため中止）`); continue; }
    await ensureFolder(s.remoteDir);
    const uploaded = [];
    for (const f of s.files) { await uploadFileNoOverwrite(`${s.remoteDir}/${f.name}`, Buffer.from(f.body)); uploaded.push(`${s.remoteDir}/${f.name}`); }
    e.supplementV2 = { status: "created", folder: s.remoteDir, uploaded, at: new Date().toISOString() };
    await saveLedger(ledger); // 1件ごとに記録（途中失敗でも再実行で重複しない）
    console.log(`    追加しました（${uploaded.length}ファイル）`);
  }
  if (failed) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main().catch((e) => { console.error(e.message); process.exit(1); });
