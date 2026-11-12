#!/usr/bin/env node
/**
 * data/dis-library-progress.json に、1件の結果を記録する（ユニット数・9軸の点数は、analysis.json から読む）。
 *   node scripts/dis/record-progress.mjs --lp LP-0011 --duration 190 --tokens 120000
 *   node scripts/dis/record-progress.mjs --lp LP-0012 --status failed --note "SP・PCとも画像なし"
 * 書込みは、このファイルだけ。
 */
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { loadConfig, REPO_ROOT, readJson } from "./lib/config.mjs";
import { findItemDir } from "./import-analysis.mjs";

const { values: a } = parseArgs({ options: { lp: { type: "string" }, duration: { type: "string" }, tokens: { type: "string" }, status: { type: "string", default: "analyzed" }, note: { type: "string" } } });
if (!a.lp) throw new Error("--lp LP-nnnn を指定");
const rels = (await readJson(path.join(REPO_ROOT, "data/dis-relations.json"))).relations;
const rel = rels.find((r) => r.libraryId === a.lp && r.relation === "same_lp");
const f = path.join(REPO_ROOT, "data/dis-library-progress.json");
const prog = await readJson(f);
const item = { status: a.status, ...(a.duration ? { durationSec: Number(a.duration) } : {}), ...(a.tokens ? { tokens: Number(a.tokens) } : {}) };
if (rel) {
  item.disId = rel.disId;
  const dir = await findItemDir(path.join(REPO_ROOT, "outputs/dis"), await loadConfig(), rel.disId);
  const an = dir ? await readJson(path.join(dir, "analysis.json"), null) : null;
  if (an) {
    item.title = an.brand;
    item.units = (an.units || []).length;
    const sc = (Array.isArray(an.axes) ? an.axes : Object.values(an.axes || {})).map((x) => Number(x.score ?? x)).filter((n) => n > 0);
    item.score = `${sc.reduce((p, c) => p + c, 0)}/${sc.length * 5}`;
  }
}
if (a.note) item.notes = a.note;
prog.items[a.lp] = { ...(prog.items[a.lp] || {}), ...item };
prog.updatedAt = new Date().toISOString();
await fs.writeFile(f, `${JSON.stringify(prog, null, 2)}\n`);
console.log(a.lp, JSON.stringify(item));
