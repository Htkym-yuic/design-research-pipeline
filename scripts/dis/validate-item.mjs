#!/usr/bin/env node
/**
 * 案件フォルダ（outputs/dis/<LP|バナー|ウェブ>/<連番>_…/）の分析・注釈を検証し、analysis.md と text-index.json を作る。
 * 登録（Dropbox・Notion）はしない。旧ライブラリーから取り込んだ案件など、登録しない案件の検証用。
 *   node scripts/dis/validate-item.mjs --id DIS-LP-0005
 */
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { loadConfig, REPO_ROOT } from "./lib/config.mjs";
import { validateAnalysis, analysisToMarkdown } from "./lib/analysis-schema.mjs";
import { validateAnnotations } from "./lib/annotations.mjs";
import { buildTextIndex } from "./lib/text-index.mjs";
import { findItemDir } from "./import-analysis.mjs";

const readJson = async (f) => JSON.parse(await fs.readFile(f, "utf8"));

export async function validateItem({ disId, outDir = path.join(REPO_ROOT, "outputs/dis") }) {
  const cfg = await loadConfig();
  const dir = await findItemDir(outDir, cfg, disId);
  if (!dir) throw new Error(`案件フォルダが見つかりません（${disId}）`);
  const item = await readJson(path.join(dir, "item.json"));
  const a = await readJson(path.join(dir, "analysis.json"));
  // ID・実ページのURL・名前は、案件の情報（item.json）を正とする（"AUTO" や空は、ここで補う）
  a.disId = disId;
  if (item.pageUrl) a.pageUrl = item.pageUrl;
  if (!a.brand || a.brand === "AUTO") a.brand = item.brand;
  const ann = await readJson(path.join(dir, "annotations.json"));
  const v = validateAnalysis(a);
  const w = validateAnnotations(ann, a);
  const errors = [...v.errors.map((e) => `分析: ${e}`), ...w.errors.map((e) => `注釈: ${e}`)];
  if (errors.length) return { ok: false, dir, errors };
  await fs.writeFile(path.join(dir, "analysis.json"), JSON.stringify(a, null, 2) + "\n");
  await fs.writeFile(path.join(dir, "analysis.md"), analysisToMarkdown(a));
  await fs.writeFile(path.join(dir, "text-index.json"), JSON.stringify(buildTextIndex(a), null, 2) + "\n");
  return { ok: true, dir, units: a.units.length };
}

async function main() {
  const { values } = parseArgs({ options: { id: { type: "string" } } });
  if (!values.id) throw new Error("--id（例: DIS-LP-0005）が必要です");
  const r = await validateItem({ disId: values.id });
  if (!r.ok) { console.error(`検証NG（${r.dir}）\n  ${r.errors.join("\n  ")}`); process.exit(1); }
  console.log(`検証OK: ${values.id}（Unit ${r.units}）。analysis.md・text-index.json を作りました（登録はしていません）`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
