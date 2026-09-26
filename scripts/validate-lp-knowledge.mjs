import fs from "node:fs/promises";
import path from "node:path";

const REQUIRED_MARKDOWN_SECTIONS = [
  "1. 基本情報",
  "2. LP全体マップ（実画像）",
  "28. 実行結果",
  "29. 改訂履歴"
];

const REQUIRED_MARKDOWN_TERMS = [
  "LP-",
  "captureUrl",
  "sourceDetailUrl",
  "Dropbox正本パス",
  "GitHubナレッジパス",
  "CBS同期状態",
  "ナレッジ化ステータス"
];

const REQUIRED_JSON_FIELDS = [
  "id",
  "mediaType",
  "title",
  "captureUrl",
  "sourceUrl",
  "sourceDetailUrl"
];

function usage() {
  console.error("Usage: npm run knowledge:validate-lp -- --input <analysis.md|knowledge.json|metadata.json>");
}

function getArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

function addIssue(issues, level, message) {
  issues.push({ level, message });
}

function assertLpId(value, issues, label = "id") {
  if (typeof value !== "string" || !/^LP-\d{4}$/.test(value)) {
    addIssue(issues, "error", `${label} must use LP-0000 format.`);
  }
}

function normalizeJsonRoot(value) {
  if (Array.isArray(value?.candidates)) {
    return value.candidates;
  }
  if (Array.isArray(value)) {
    return value;
  }
  return [value];
}

async function validateMarkdown(inputPath, issues) {
  const markdown = await fs.readFile(inputPath, "utf8");

  for (const section of REQUIRED_MARKDOWN_SECTIONS) {
    if (!markdown.includes(section)) {
      addIssue(issues, "error", `Missing required section: ${section}`);
    }
  }

  for (const term of REQUIRED_MARKDOWN_TERMS) {
    if (!markdown.includes(term)) {
      addIssue(issues, "error", `Missing required term: ${term}`);
    }
  }

  const sectionNumbers = [...markdown.matchAll(/^#{1,6}\s+(\d+)\./gm)].map((match) => Number.parseInt(match[1], 10));
  if (sectionNumbers.length > 0) {
    const maxSection = Math.max(...sectionNumbers);
    if (maxSection < 29) {
      addIssue(issues, "error", `Expected section 29, but highest numbered section is ${maxSection}.`);
    }
  } else {
    addIssue(issues, "warning", "No numbered Markdown headings were found.");
  }

  const lpIds = [...markdown.matchAll(/LP-\d{4}/g)].map((match) => match[0]);
  if (lpIds.length === 0) {
    addIssue(issues, "error", "No LP-0000 ID found.");
  }

  const uniqueIds = new Set(lpIds);
  if (uniqueIds.size > 1) {
    addIssue(issues, "warning", `Multiple LP IDs found: ${[...uniqueIds].join(", ")}`);
  }
}

async function validateJson(inputPath, issues) {
  const raw = await fs.readFile(inputPath, "utf8");
  const json = JSON.parse(raw);
  const records = normalizeJsonRoot(json);

  if (records.length === 0) {
    addIssue(issues, "error", "JSON contains no LP records.");
    return;
  }

  for (const [index, record] of records.entries()) {
    const prefix = records.length === 1 ? "record" : `record ${index + 1}`;

    for (const field of REQUIRED_JSON_FIELDS) {
      if (!record[field]) {
        addIssue(issues, "error", `${prefix} missing required field: ${field}`);
      }
    }

    assertLpId(record.id, issues, `${prefix}.id`);

    if (record.mediaType && record.mediaType !== "LP") {
      addIssue(issues, "error", `${prefix}.mediaType must be LP.`);
    }

    for (const urlField of ["captureUrl", "sourceUrl", "sourceDetailUrl", "thumbnailUrl"]) {
      if (record[urlField] && !/^https?:\/\//.test(record[urlField])) {
        addIssue(issues, "error", `${prefix}.${urlField} must be an http(s) URL.`);
      }
    }

    if (record.captureUrl && record.sourceDetailUrl && record.captureUrl === record.sourceDetailUrl) {
      addIssue(issues, "warning", `${prefix}.captureUrl and sourceDetailUrl are identical; confirm whether this is intentional.`);
    }
  }
}

const input = getArg("input");
if (!input) {
  usage();
  process.exit(2);
}

const inputPath = path.resolve(input);
const issues = [];

try {
  const ext = path.extname(inputPath).toLowerCase();
  if (ext === ".md" || ext === ".markdown") {
    await validateMarkdown(inputPath, issues);
  } else if (ext === ".json") {
    await validateJson(inputPath, issues);
  } else {
    addIssue(issues, "error", `Unsupported input extension: ${ext || "(none)"}`);
  }
} catch (error) {
  addIssue(issues, "error", error instanceof Error ? error.message : String(error));
}

const errors = issues.filter((issue) => issue.level === "error");
const warnings = issues.filter((issue) => issue.level === "warning");

for (const issue of issues) {
  console.log(`${issue.level.toUpperCase()}: ${issue.message}`);
}

if (errors.length === 0) {
  console.log(`LP knowledge validation passed with ${warnings.length} warning(s).`);
  process.exit(0);
}

console.error(`LP knowledge validation failed with ${errors.length} error(s) and ${warnings.length} warning(s).`);
process.exit(1);
