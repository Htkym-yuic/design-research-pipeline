import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const sourcesPath = new URL("../data/reference-sources.json", import.meta.url);
const sources = JSON.parse(await fs.readFile(sourcesPath, "utf8"));

const outputRoot = process.env.SCREENSHOT_OUTPUT_DIR || "screenshots/test-run";
const sourceFilter = process.env.SOURCE_ID;
const sourceLimit = Number.parseInt(process.env.SOURCE_LIMIT || `${sources.length}`, 10);

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

const targetSources = sources
  .filter((source) => !sourceFilter || source.id === sourceFilter)
  .slice(0, sourceLimit);

await fs.mkdir(outputRoot, { recursive: true });

const browser = await chromium.launch();
const results = [];

try {
  for (const source of targetSources) {
    const sourceSlug = safeName(`${source.id}-${source.name}`);
    const sourceDir = path.join(outputRoot, sourceSlug);
    await fs.mkdir(sourceDir, { recursive: true });

    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: viewport.isMobile,
        deviceScaleFactor: 1,
        locale: "ja-JP"
      });
      const page = await context.newPage();
      const result = {
        sourceId: source.id,
        name: source.name,
        url: source.url,
        category: source.primaryCategory,
        viewport: viewport.key,
        viewportLabel: viewport.label,
        status: "pending",
        screenshotPath: null,
        error: null
      };

      try {
        await page.goto(source.url, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(1500);

        const screenshotPath = path.join(sourceDir, `${viewport.key}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });

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
  outputRoot,
  sourceCount: targetSources.length,
  results
};

await fs.writeFile(path.join(outputRoot, "summary.json"), JSON.stringify(summary, null, 2));

const failed = results.filter((result) => result.status !== "captured");
console.log(`Captured ${results.length - failed.length}/${results.length} screenshots.`);

if (failed.length > 0) {
  console.log("Some screenshots failed. See screenshots/test-run/summary.json for details.");
}
