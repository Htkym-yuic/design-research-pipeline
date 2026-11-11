#!/usr/bin/env node
/**
 * リポジトリ内の分析ファイル（candidates/dis/<日付>/<ID>.analysis.json と .annotations.json）を、
 * 案件フォルダ（outputs/dis/<LP|Banner|Web>/<連番>_…/）に取り込む。ローカルのファイルのみ（外部書込みなし）。
 *   node scripts/dis/import-analysis.mjs --id DIS-LP-0001 [--replace]
 * 既存の analysis.json が「テンプレートのまま」のときだけ置き換える。分析済みのものは、--replace がない限り上書きしない。
 */
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { loadConfig, REPO_ROOT } from "./lib/config.mjs";
import { validateAnalysis } from "./lib/analysis-schema.mjs";
import { validateAnnotations } from "./lib/annotations.mjs";
import { mediaFolders } from "./lib/library.mjs";

const readJson = async (f) => JSON.parse(await fs.readFile(f, "utf8"));

export async function findItemDir(outDir, cfg, disId) {
  for (const media of Object.keys(cfg.media)) for (const folder of mediaFolders(cfg, media)) {
    const base = path.join(outDir, folder);
    let names = [];
    try { names = await fs.readdir(base); } catch { continue; }
    for (const n of names) {
      try { if ((await readJson(path.join(base, n, "item.json"))).disId === disId) return path.join(base, n); } catch { /* 無視 */ }
    }
  }
  return null;
}

export async function findSource(srcDir, disId) {
  let days = [];
  try { days = (await fs.readdir(srcDir)).sort().reverse(); } catch { return null; }
  for (const day of days) {
    const a = path.join(srcDir, day, `${disId}.analysis.json`);
    const n = path.join(srcDir, day, `${disId}.annotations.json`);
    try { await fs.access(a); await fs.access(n); return { analysis: a, annotations: n }; } catch { /* 次へ */ }
  }
  return null;
}

export async function importAnalysis({ disId, outDir, srcDir, replace = false }) {
  const cfg = await loadConfig();
  const dir = await findItemDir(outDir, cfg, disId);
  if (!dir) throw new Error(`案件フォルダが見つかりません（${disId}）。先に撮影（--capture）を実行してください`);
  const src = await findSource(srcDir, disId);
  if (!src) throw new Error(`分析ファイルが見つかりません: ${srcDir}/<日付>/${disId}.analysis.json と .annotations.json`);
  const a = await readJson(src.analysis);
  const n = await readJson(src.annotations);
  const v = validateAnalysis(a); const w = validateAnnotations(n, a);
  if (!v.ok || !w.ok) throw new Error(`分析ファイルの検証に失敗: ${[...v.errors, ...w.errors].join(" / ")}`);
  const dest = path.join(dir, "analysis.json");
  let cur = null;
  try { cur = await readJson(dest); } catch { /* なし */ }
  if (cur && cur.status !== "template" && !replace) throw new Error("案件フォルダの analysis.json は、すでに分析済みです。上書きしません（置き換えるなら --replace）");
  await fs.writeFile(dest, JSON.stringify(a, null, 2) + "\n");
  await fs.writeFile(path.join(dir, "annotations.json"), JSON.stringify(n, null, 2) + "\n");
  return { dir, source: src.analysis };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { id: { type: "string" }, replace: { type: "boolean", default: false }, out: { type: "string" }, src: { type: "string" } } });
  if (!values.id) { console.error("--id <DIS-ID> が必要です"); process.exit(2); }
  try {
    const r = await importAnalysis({ disId: values.id, outDir: values.out || `${REPO_ROOT}outputs/dis`, srcDir: values.src || `${REPO_ROOT}candidates/dis`, replace: values.replace });
    console.log(`取り込みました: ${r.dir}\n  元: ${r.source}`);
  } catch (e) { console.error(e.message); process.exit(1); }
}
