import fs from "node:fs/promises";

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

function inferType(id) {
  const prefix = String(id).split("-")[0];
  return ["PHAC", "ILAC", "SLAC", "DESAC", "MVAC", "NYAC", "FBAC", "MEAC"].includes(prefix) ? "ASSET" : prefix;
}

function chapterBody(markdown, chapter) {
  const startMatch = new RegExp(`^## ${chapter}\\.[^\\n]*$`, "m").exec(markdown);
  if (!startMatch) return "";
  const bodyStart = startMatch.index + startMatch[0].length;
  const nextMatch = new RegExp(`^## ${chapter + 1}\\.[^\\n]*$`, "m").exec(markdown.slice(bodyStart));
  const bodyEnd = nextMatch ? bodyStart + nextMatch.index : markdown.length;
  return markdown.slice(bodyStart, bodyEnd);
}

function candidateIds(body) {
  return [...body.matchAll(/^\|\s*(C\d{2,3})\s*\|/gm)].map((match) => match[1]);
}

const args = parseArgs(process.argv.slice(2));
if (!args.input) {
  console.error("Usage: npm run knowledge:validate-non-lp -- --input <markdown> [--mode template|analysis] [--type BN]");
  process.exit(1);
}

const config = JSON.parse(await fs.readFile("config/non-lp-deep-analysis-templates.json", "utf8"));
const markdown = await fs.readFile(args.input, "utf8");
const mode = args.mode || "analysis";
const id = markdown.match(/^\| ID \| ([^|]+) \|$/m)?.[1]?.trim();
const type = String(args.type || inferType(id)).toUpperCase();
const profile = config.types[type];
if (!profile) throw new Error(`未対応の媒体種別です: ${type}`);

const results = [];
function check(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
}

const firstLine = markdown.split(/\r?\n/).find((line) => line.trim());
check("first-line", firstLine === "## 1. 基本情報", firstLine || "empty");

const headings = [...markdown.matchAll(/^## (\d+)\./gm)].map((match) => Number(match[1]));
check("chapters", headings.length === 29 && headings.every((value, index) => value === index + 1), headings.join(","));
check("id", Boolean(id && new RegExp(profile.idPattern).test(id)), id || "missing");

const units = [...chapterBody(markdown, 8).matchAll(/^### Unit (\d{2})｜(.+)$/gm)];
check("unit-headings", units.length >= profile.analysisUnits.length, `${units.length}/${profile.analysisUnits.length}`);
const unitBlocks = chapterBody(markdown, 8).split(/^### Unit \d{2}｜.+$/gm).slice(1);
const unitFieldOk = unitBlocks.length > 0 && unitBlocks.every((block) =>
  config.commonUnitFields.every((field, index) => block.includes(`${index + 1}. ${field}:`))
);
check("unit-fields", unitFieldOk, `${config.commonUnitFields.length} fields per unit`);

const imageChapter = chapterBody(markdown, 2);
const missingSlots = profile.imageSlots.filter((slot) => !imageChapter.includes(`| ${slot} |`));
check("image-slots", missingSlots.length === 0, missingSlots.join(","));
const imageEvidenceOk = profile.imageSlots.every((slot) => {
  const line = imageChapter.split("\n").find((row) => row.includes(`| ${slot} |`)) || "";
  return /\.(?:png|jpe?g|webp)|failure_reason/i.test(line);
});
check("image-evidence", mode === "template" || imageEvidenceOk, mode === "template" ? "template mode" : "path or failure_reason required");

const ch15 = candidateIds(chapterBody(markdown, 15));
const ch26 = candidateIds(chapterBody(markdown, 26));
check("candidate-parity", ch15.length > 0 && JSON.stringify(ch15) === JSON.stringify(ch26), `ch15=${ch15.join(",")} ch26=${ch26.join(",")}`);

check("rights", chapterBody(markdown, 16).includes("rights_unknown") && chapterBody(markdown, 16).includes("rights_excluded"));
check("unknowns", chapterBody(markdown, 17).includes("failure_reason"));
check("sources", /^\d+\. https?:\/\//m.test(chapterBody(markdown, 25)) || mode === "template");
check("run-record", chapterBody(markdown, 28).includes(`ID: ${id}`) && chapterBody(markdown, 28).includes(`媒体: ${type}`));

const placeholders = (markdown.match(/\[(?:要分析|要設定|要実測|要確認|該当なし／要分析)[^\]]*\]/g) || []).length;
check("analysis-complete", mode === "template" || placeholders === 0, `placeholders=${placeholders}`);

for (const result of results) {
  console.log(`${result.name}: ${result.passed ? "Yes" : "No"}${result.detail ? ` (${result.detail})` : ""}`);
}
const failures = results.filter((result) => !result.passed);
if (failures.length > 0) {
  console.error(`Non-LP deep analysis validation failed: ${failures.map((item) => item.name).join(", ")}`);
  process.exit(1);
}
console.log(`Non-LP deep analysis validation passed in ${mode} mode with 0 warning(s).`);
