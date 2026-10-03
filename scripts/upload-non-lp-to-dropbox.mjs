import fs from "node:fs/promises";
import path from "node:path";
import { isDryRun } from "./lib/env.mjs";
import { checkAuth, ensureFolder, uploadFile } from "./lib/dropbox-client.mjs";

const summaryPath = "screenshots/non-lp-candidates/summary.json";
const outputPath = "screenshots/non-lp-candidates/dropbox-upload-result.json";
const root = process.env.DROPBOX_DESIGN_ROOT || "/design/Design_Research_Library";
const dryRun = isDryRun();
const dateJst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
const summary = JSON.parse(await fs.readFile(summaryPath, "utf8"));

if (!dryRun) await checkAuth();
const results = [];

function collectPaths(value, paths = []) {
  if (!value) return paths;
  if (typeof value === "string" && /\.(png|jpe?g|json|md)$/i.test(value)) paths.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectPaths(item, paths));
  else if (typeof value === "object") Object.values(value).forEach((item) => collectPaths(item, paths));
  return paths;
}

for (const item of summary.results || []) {
  const base = `${root}/${item.library}/99_Needs_Review/${dateJst}/daily-intake/${item.id}`;
  const candidateResult = { id: item.id, mediaType: item.mediaType, dropboxPath: base, status: "uploaded", files: [] };
  try {
    const metadataPath = path.join(item.directory, "metadata.json");
    const files = item.saveImage ? [metadataPath, ...new Set(collectPaths(item.files))] : [metadataPath];
    if (!dryRun) await ensureFolder(base);
    for (const local of files) {
      const remote = `${base}/${path.basename(local)}`;
      if (dryRun) candidateResult.files.push({ remote, status: "dry_run" });
      else {
        await uploadFile(remote, await fs.readFile(local));
        candidateResult.files.push({ remote, status: "uploaded" });
      }
    }
  } catch (error) {
    candidateResult.status = "failed";
    candidateResult.error = error.message;
  }
  results.push(candidateResult);
}

await fs.writeFile(outputPath, JSON.stringify({ uploadedAt: new Date().toISOString(), dryRun, results }, null, 2) + "\n");
const failed = results.filter((item) => item.status === "failed");
console.log(`Non-LP Dropbox: ${results.length - failed.length}/${results.length} succeeded.`);
if (failed.length > 0) process.exitCode = 1;
