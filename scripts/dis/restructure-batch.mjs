#!/usr/bin/env node
/**
 * DISページを、新しい形へ、1ページずつ順番に書き換える（--restructure --apply を、並行せずに繰り返す）。
 *   - 止まる条件に当たったページ（画像の枚数が合わない・PCかSPの画像が無い・すでに書き換え済み 等）は、何も書かずに飛ばして記録し、次へ進む
 *   - 書込みのエラー（API・削除の失敗など）が3件続いたら、そこで止まる
 *   - 結果は outputs/dis/backup/batch-<日時>.json に、1ページごとに追記して保存する（途中で止まっても残る）
 * 実書込みは、DIS_ENABLE_WRITES=true・DRY_RUN=false・--apply がそろったときだけ。
 *   node scripts/dis/restructure-batch.mjs --from 1 --to 182 [--apply]
 */
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { REPO_ROOT } from "./lib/config.mjs";

export const SKIP_RE = /何も書いていません|対応するLP番号がありません|案件フォルダ|DISページがありません|見つかりません|すでに組み替え済み/;
export const MAX_CONSECUTIVE_FAILURES = 3;

/** 失敗の文言から、「飛ばした（何も書いていない）」か「失敗（書込みのエラー）」かを分ける。 */
export function classify(code, output) {
  if (code === 0) return "success";
  return SKIP_RE.test(output) ? "skipped" : "failed";
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = async (f, d) => { try { return JSON.parse(await fs.readFile(f, "utf8")); } catch { return d; } };

function runOne(disId, pageId) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(REPO_ROOT, "scripts/dis/migrate-to-dis-page.mjs"), "--id", disId, "--restructure", "--apply", "--page", pageId], { env: process.env });
    let out = "";
    child.stdout.on("data", (d) => (out += d)); child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code, out }));
  });
}

async function main() {
  const { values: a } = parseArgs({ options: { from: { type: "string", default: "1" }, to: { type: "string", default: "182" }, apply: { type: "boolean", default: false } } });
  const rels = (await readJson(path.join(REPO_ROOT, "data/dis-relations.json"), { relations: [] })).relations;
  const log = (await readJson(path.join(REPO_ROOT, "data/dis-merge-log.json"), { entries: [] })).entries;
  const done = new Set(log.filter((e) => e.kind === "restructure-dis-page" && e.status === "done").map((e) => e.disId));
  const ids = [];
  for (let n = Number(a.from); n <= Number(a.to); n++) ids.push(`DIS-LP-${String(n).padStart(4, "0")}`);
  const outFile = path.join(REPO_ROOT, "outputs/dis/backup", `batch-${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}.json`);
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  const results = [];
  const save = () => fs.writeFile(outFile, `${JSON.stringify(results, null, 2)}\n`);
  let consecutive = 0;
  console.log(`対象 ${ids.length}件（${ids[0]}〜${ids.at(-1)}）。結果: ${outFile}`);
  if (!a.apply) { console.log("ドライラン: --apply が無いので、何も書きません"); return; }
  for (const disId of ids) {
    if (done.has(disId)) { results.push({ disId, status: "skipped", reason: "すでに書き換え済み（記録あり）" }); await save(); continue; }
    const pageId = rels.find((r) => r.disId === disId)?.disNotionPageId;
    if (!pageId) { results.push({ disId, status: "skipped", reason: "DISページのIDが対応表にありません" }); await save(); continue; }
    const t0 = Date.now();
    const { code, out } = await runOne(disId, pageId);
    const status = classify(code, out);
    const reason = status === "success" ? "" : (/"error": "(.*)"/.exec(out) || /Error: (.*)/.exec(out) || /^(.*何も書いていません.*)$/m.exec(out) || [, out.slice(-300)])[1] || out.slice(-300);
    const warnings = (out.match(/WARNING: [^"\n]*/g) || []);
    results.push({ disId, status, reason: reason.trim(), warnings, sec: Math.round((Date.now() - t0) / 1000) });
    await save();
    console.log(`${disId} ${status}${reason ? `: ${reason.trim().slice(0, 120)}` : ""}`);
    consecutive = status === "failed" ? consecutive + 1 : 0;
    if (consecutive >= MAX_CONSECUTIVE_FAILURES) { console.log(`書込みのエラーが${MAX_CONSECUTIVE_FAILURES}件続いたため、ここで止めます（${disId}）`); break; }
    await sleep(1000);
  }
  const c = (s) => results.filter((r) => r.status === s).length;
  console.log(`完了: 成功 ${c("success")} / 飛ばした ${c("skipped")} / 失敗 ${c("failed")}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message || e); process.exit(1); });
