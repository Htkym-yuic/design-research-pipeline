import fs from "node:fs/promises";
function arg(name) { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : null; }
function inferType(id) {
  const prefix = String(id).split("-")[0];
  return ["PHAC", "ILAC", "SLAC", "DESAC", "MVAC", "NYAC", "FBAC", "MEAC"].includes(prefix) ? "ASSET" : prefix;
}
const input = arg("input");
if (!input) { console.error("Usage: npm run knowledge:validate-non-lp-json -- --input <knowledge.json>"); process.exit(2); }
const config = JSON.parse(await fs.readFile("config/non-lp-deep-analysis-templates.json", "utf8"));
const record = JSON.parse(await fs.readFile(input, "utf8"));
const issues = [];
function required(path, value) {
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) issues.push(`missing: ${path}`);
}
required("schema_version", record.schema_version);
required("id", record.id);
required("media_type", record.media_type);
required("title", record.title);
required("source.source_detail_url", record.source?.source_detail_url);
required("source.capture_url", record.source?.capture_url);
required("analysis.summary", record.analysis?.summary);
required("analysis.score.total", record.analysis?.score?.total);
required("analysis.units", record.analysis?.units);
required("reusable_patterns", record.reusable_patterns);
required("rights.status", record.rights?.status);
required("evidence.files", record.evidence?.files);
required("cbs_sync.status", record.cbs_sync?.status);
if (Array.isArray(record.evidence?.files)) {
  record.evidence.files.forEach((file, index) => required(`evidence.files[${index}]`, file));
}
const type = String(record.media_type || inferType(record.id)).toUpperCase();
const profile = config.types[type];
if (!profile) issues.push(`unsupported media_type: ${type}`);
if (profile && !new RegExp(profile.idPattern).test(record.id)) issues.push(`invalid id: ${record.id}`);
for (const [name, value] of Object.entries({ source_detail_url: record.source?.source_detail_url, capture_url: record.source?.capture_url })) {
  if (value && !/^https?:\/\//.test(value)) issues.push(`invalid URL: ${name}`);
}
if (record.analysis?.score?.total < 0 || record.analysis?.score?.total > 100) issues.push("score.total must be 0-100");
if (record.cbs_sync?.status === "synced") issues.push("CBS production sync must not be marked synced by this pipeline");
if (issues.length > 0) {
  for (const issue of issues) console.error(`ERROR: ${issue}`);
  process.exit(1);
}
console.log("Non-LP knowledge validation passed with 0 warning(s).");
