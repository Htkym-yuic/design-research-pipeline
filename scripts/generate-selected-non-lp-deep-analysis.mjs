import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    args[key] = next && !next.startsWith("--") ? argv[++i] : true;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const selectionPath = args.selection || "data/non-lp-deep-analysis-selection.json";
let selection;
try {
  selection = JSON.parse(await fs.readFile(selectionPath, "utf8"));
} catch (error) {
  console.error(`選定ファイルを読み込めません: ${selectionPath} (${error.message})`);
  process.exit(1);
}

if (!Array.isArray(selection.selected) || selection.selected.length === 0) {
  console.error("selected が空です。週末レビューで選定したIDだけを指定してください。");
  process.exit(1);
}

const seen = new Set();
const results = [];
for (const entry of selection.selected) {
  if (!entry?.id) throw new Error("selected内にidがない項目があります");
  if (seen.has(entry.id)) throw new Error(`選定IDが重複しています: ${entry.id}`);
  seen.add(entry.id);
  const childArgs = [
    "scripts/create-non-lp-deep-analysis-template.mjs",
    "--id", entry.id,
    "--date", selection.runDate || entry.date || new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  ];
  if (entry.type) childArgs.push("--type", entry.type);
  if (entry.title) childArgs.push("--title", entry.title);
  if (entry.source) childArgs.push("--source", entry.source);
  if (entry.url) childArgs.push("--url", entry.url);
  if (selection.output) childArgs.push("--output", selection.output);
  const run = spawnSync(process.execPath, childArgs, { encoding: "utf8" });
  if (run.status !== 0) {
    console.error(run.stderr || run.stdout);
    process.exit(run.status || 1);
  }
  const parsed = JSON.parse(run.stdout);
  const validation = spawnSync(process.execPath, [
    "scripts/validate-non-lp-deep-analysis.mjs",
    "--input", parsed.markdownPath,
    "--mode", "template"
  ], { encoding: "utf8" });
  if (validation.status !== 0) {
    console.error(validation.stderr || validation.stdout);
    process.exit(validation.status || 1);
  }
  results.push({ ...parsed, validation: "template_passed" });
}

console.log(JSON.stringify({
  schema_version: "drs-deep-selection-1.0",
  run_date: selection.runDate || null,
  selected_count: results.length,
  results
}, null, 2));
