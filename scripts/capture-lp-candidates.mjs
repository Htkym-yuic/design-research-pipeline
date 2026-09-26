import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const candidatesPath = new URL("../candidates/lp-archive/candidates.json", import.meta.url);
const candidateData = JSON.parse(await fs.readFile(candidatesPath, "utf8"));

const outputRoot = process.env.LP_CANDIDATE_OUTPUT_DIR || "screenshots/lp-candidates";
const candidateLimit = Number.parseInt(process.env.LP_CANDIDATE_LIMIT || `${candidateData.candidates.length}`, 10);

const viewports = [
  { key: "pc_fv", label: "PC first view", width: 1200, height: 900, isMobile: false },
  { key: "sp_fv", label: "SP first view", width: 375, height: 812, isMobile: true }
];

function safeName(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const candidates = candidateData.candidates.slice(0, candidateLimit);
await fs.mkdir(outputRoot, { recursive: true });

const browser = await chromium.launch();
const results = [];

try {
  for (const candidate of candidates) {
    const candidateDir = path.join(outputRoot, `${candidate.id}-${safeName(candidate.title || "untitled")}`);
    await fs.mkdir(candidateDir, { recursive: true });
    await fs.writeFile(path.join(candidateDir, "metadata.json"), JSON.stringify(candidate, null, 2));

    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: viewport.isMobile,
        deviceScaleFactor: 1,
        locale: "ja-JP"
      });
      const page = await context.newPage();
      const result = {
        id: candidate.id,
        title: candidate.title,
        captureUrl: candidate.captureUrl,
        sourceDetailUrl: candidate.sourceDetailUrl,
        viewport: viewport.key,
        viewportLabel: viewport.label,
        status: "pending",
        screenshotPath: null,
        finalUrl: null,
        error: null
      };

      try {
        console.log(`Capturing ${candidate.id} ${viewport.key}: ${candidate.captureUrl}`);
        await page.goto(candidate.captureUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(1500);

        result.finalUrl = page.url();
        const screenshotPath = path.join(candidateDir, `${viewport.key}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false, timeout: 30000 });

        result.status = "captured";
        result.screenshotPath = screenshotPath;
      } catch (error) {
        result.status = "error";
        result.error = error instanceof Error ? error.message : String(error);
      } finally {
        results.push(result);
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}

const summary = {
  capturedAt: new Date().toISOString(),
  sourceName: candidateData.sourceName,
  outputRoot,
  candidateCount: candidates.length,
  results
};

await fs.writeFile(path.join(outputRoot, "summary.json"), JSON.stringify(summary, null, 2));

const failed = results.filter((result) => result.status !== "captured");
console.log(`Captured ${results.length - failed.length}/${results.length} LP candidate screenshots.`);

if (failed.length > 0) {
  console.log("Some LP candidate screenshots failed. See screenshots/lp-candidates/summary.json for details.");
}
