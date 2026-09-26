import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const REQUIRED_NORMAL_IMAGES = [
  { key: "PC_full", pattern: /_PC_full\.png$/i, minWidth: 1000 },
  { key: "PC_first_view", pattern: /_PC_first_view\.png$/i, minWidth: 1000 },
  { key: "PC_sections", pattern: /_PC_sections\.png$/i, minWidth: 600 },
  { key: "SP_full", pattern: /_SP_full\.png$/i, maxWidth: 430 },
  { key: "SP_first_view", pattern: /_SP_first_view\.png$/i, maxWidth: 430 },
  { key: "SP_sections", pattern: /_SP_sections\.png$/i, minWidth: 600 }
];

const REQUIRED_NOTION_IMAGES = [
  /_PC_first_view_notion\.jpe?g$/i,
  /_PC_sections_notion\.jpe?g$/i,
  /_SP_first_view_notion\.jpe?g$/i,
  /_SP_sections_notion\.jpe?g$/i
];

function usage() {
  console.error("Usage: npm run knowledge:crosscheck-lp -- --input <lp-folder>");
}

function getArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

function addIssue(issues, level, message) {
  issues.push({ level, message });
}

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

async function readJson(jsonPath, issues) {
  try {
    return JSON.parse(await fs.readFile(jsonPath, "utf8"));
  } catch (error) {
    addIssue(issues, "error", `Cannot read JSON: ${jsonPath} (${error instanceof Error ? error.message : String(error)})`);
    return null;
  }
}

function candidateTitleSlug(title) {
  return String(title || "untitled")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "untitled";
}

async function checkImage(filePath, rule, issues) {
  let metadata;
  try {
    metadata = await sharp(filePath).metadata();
  } catch (error) {
    addIssue(issues, "error", `Cannot inspect image: ${filePath} (${error instanceof Error ? error.message : String(error)})`);
    return;
  }

  if (rule.minWidth && metadata.width < rule.minWidth) {
    addIssue(issues, "error", `${rule.key} width is ${metadata.width}px, expected at least ${rule.minWidth}px.`);
  }

  if (rule.maxWidth && metadata.width > rule.maxWidth) {
    addIssue(issues, "error", `${rule.key} width is ${metadata.width}px, expected ${rule.maxWidth}px or less.`);
  }

  if (!metadata.height || metadata.height < 1) {
    addIssue(issues, "error", `${rule.key} has invalid height.`);
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
  const stat = await fs.stat(inputPath);
  if (!stat.isDirectory()) {
    addIssue(issues, "error", "Input must be an LP folder.");
  }
} catch {
  addIssue(issues, "error", `Input folder does not exist: ${inputPath}`);
}

if (issues.length === 0) {
  const files = await walk(inputPath);
  const basenames = files.map((file) => path.basename(file));
  const metadataPath = path.join(inputPath, "metadata.json");

  if (!await exists(metadataPath)) {
    addIssue(issues, "error", "Missing metadata.json.");
  } else {
    const metadata = await readJson(metadataPath, issues);
    if (metadata) {
      if (!/^LP-\d{4}$/.test(metadata.id || "")) {
        addIssue(issues, "error", "metadata.id must use LP-0000 format.");
      }
      if (metadata.mediaType !== "LP") {
        addIssue(issues, "error", "metadata.mediaType must be LP.");
      }
      if (!metadata.captureUrl) {
        addIssue(issues, "error", "metadata.captureUrl is required.");
      }
      if (!metadata.sourceDetailUrl) {
        addIssue(issues, "error", "metadata.sourceDetailUrl is required.");
      }

      const expectedSlug = `${metadata.id}-${candidateTitleSlug(metadata.title)}`;
      const folderName = path.basename(inputPath);
      if (!folderName.startsWith(metadata.id) && folderName !== expectedSlug) {
        addIssue(issues, "warning", `Folder name does not match expected slug ${expectedSlug}.`);
      }
    }
  }

  for (const rule of REQUIRED_NORMAL_IMAGES) {
    const match = files.find((file) => rule.pattern.test(path.basename(file)));
    if (!match) {
      addIssue(issues, "error", `Missing required image: ${rule.key}`);
      continue;
    }
    await checkImage(match, rule, issues);
  }

  for (const pattern of REQUIRED_NOTION_IMAGES) {
    if (!basenames.some((name) => pattern.test(name))) {
      addIssue(issues, "warning", `Missing Notion image matching ${pattern}`);
    }
  }

  const pcSections = files.filter((file) => /\/pc_sections\/.+_PC_C\d{2}-.+\.png$/i.test(file));
  const spSections = files.filter((file) => /\/sp_sections\/.+_SP_C\d{2}-.+\.png$/i.test(file));
  if (pcSections.length === 0) {
    addIssue(issues, "error", "Missing pc_sections slices.");
  }
  if (spSections.length === 0) {
    addIssue(issues, "error", "Missing sp_sections slices.");
  }

  const summaryPath = path.join(path.dirname(inputPath), "summary.json");
  if (!await exists(summaryPath)) {
    addIssue(issues, "warning", "Missing sibling summary.json.");
  }
}

const errors = issues.filter((issue) => issue.level === "error");
const warnings = issues.filter((issue) => issue.level === "warning");

for (const issue of issues) {
  console.log(`${issue.level.toUpperCase()}: ${issue.message}`);
}

if (errors.length === 0) {
  console.log(`LP asset crosscheck passed with ${warnings.length} warning(s).`);
  process.exit(0);
}

console.error(`LP asset crosscheck failed with ${errors.length} error(s) and ${warnings.length} warning(s).`);
process.exit(1);
