import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const targetsPath = new URL("../data/targets.json", import.meta.url);
const targets = JSON.parse(await fs.readFile(targetsPath, "utf8"));

const outputRoot = process.env.SCREENSHOT_OUTPUT_DIR || "screenshots/test-run";
const targetFilter = process.env.TARGET_ID;
const targetLimit = Number.parseInt(process.env.TARGET_LIMIT || `${targets.length}`, 10);

const viewports = [
  { key: "pc_fv", label: "PC first view", width: 1200, height: 900, isMobile: false },
  { key: "sp_fv", label: "SP first view", width: 375, height: 812, isMobile: true }
];

const defaultHideSelectors = [
  "[aria-label='広告']",
  "[data-ad]",
  "[data-ads]",
  "[data-ad-slot]"
];

function safeName(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function hideElements(page, selectors) {
  const uniqueSelectors = [...new Set([...defaultHideSelectors, ...(selectors || [])])];
  const hiddenSelectors = [];

  for (const selector of uniqueSelectors) {
    const hiddenCount = await page
      .$$eval(selector, (elements) => {
        for (const element of elements) {
          element.setAttribute("data-screenshot-hidden", "true");
          element.style.setProperty("display", "none", "important");
          element.style.setProperty("visibility", "hidden", "important");
        }

        return elements.length;
      })
      .catch(() => 0);

    if (hiddenCount > 0) {
      hiddenSelectors.push({ selector, hiddenCount });
    }
  }

  return hiddenSelectors;
}

const captureTargets = targets
  .filter((target) => !targetFilter || target.id === targetFilter)
  .slice(0, targetLimit);

await fs.mkdir(outputRoot, { recursive: true });

const browser = await chromium.launch();
const results = [];

try {
  for (const target of captureTargets) {
    const targetSlug = safeName(`${target.id}-${target.title}`);
    const targetDir = path.join(outputRoot, targetSlug);
    await fs.mkdir(targetDir, { recursive: true });

    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: viewport.isMobile,
        deviceScaleFactor: 1,
        locale: "ja-JP"
      });
      const page = await context.newPage();
      const result = {
        targetId: target.id,
        title: target.title,
        mediaType: target.mediaType,
        captureUrl: target.captureUrl,
        sourceType: target.sourceType,
        sourceName: target.sourceName,
        sourceUrl: target.sourceUrl,
        sourceDetailUrl: target.sourceDetailUrl,
        viewport: viewport.key,
        viewportLabel: viewport.label,
        status: "pending",
        screenshotPath: null,
        error: null
      };

      try {
        await page.goto(target.captureUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(1500);

        result.finalUrl = page.url();
        result.hiddenSelectors = await hideElements(page, target.hideSelectors);

        const screenshotPath = path.join(targetDir, `${viewport.key}.png`);
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
  targetCount: captureTargets.length,
  results
};

await fs.writeFile(path.join(outputRoot, "summary.json"), JSON.stringify(summary, null, 2));

const failed = results.filter((result) => result.status !== "captured");
console.log(`Captured ${results.length - failed.length}/${results.length} screenshots.`);

if (failed.length > 0) {
  console.log("Some screenshots failed. See screenshots/test-run/summary.json for details.");
}
