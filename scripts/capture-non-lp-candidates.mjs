import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const candidatePath = "candidates/non-lp/candidates.json";
const outputRoot = "screenshots/non-lp-candidates";
const data = JSON.parse(await fs.readFile(candidatePath, "utf8"));

function safeName(value) {
  return String(value || "untitled").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "untitled";
}

async function downloadReference(candidate, directory) {
  const response = await fetch(candidate.imageUrl);
  if (!response.ok) throw new Error(`画像取得失敗 ${response.status}: ${candidate.imageUrl}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const normalPath = path.join(directory, `${candidate.id}_reference.png`);
  const notionPath = path.join(directory, `${candidate.id}_reference_notion.jpg`);
  await sharp(buffer, { limitInputPixels: false }).png().toFile(normalPath);
  await sharp(buffer, { limitInputPixels: false }).resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true }).toFile(notionPath);
  return { normalPath, notionPath };
}

async function capturePage(browser, url, directory, id, label, fullPage = true) {
  const outputs = {};
  for (const viewport of [
    { key: "PC", width: 1200, height: 900 },
    { key: "SP", width: 375, height: 812 }
  ]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, locale: "ja-JP" });
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForLoadState("networkidle", { timeout: 7000 }).catch(() => {});
      await page.addStyleTag({ content: "iframe[src*='doubleclick'],iframe[src*='googlesyndication'],ins.adsbygoogle,[class*='cookie'],[id*='cookie']{visibility:hidden!important}" }).catch(() => {});
      await page.evaluate(async () => {
        for (let y = 0; y < document.documentElement.scrollHeight; y += 700) {
          window.scrollTo(0, y);
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        window.scrollTo(0, 0);
      });
      const firstView = path.join(directory, `${id}_${label}_${viewport.key}_first_view.png`);
      const notionFirstView = path.join(directory, `${id}_${label}_${viewport.key}_first_view_notion.jpg`);
      await page.screenshot({ path: firstView });
      await sharp(firstView).resize({ width: 900, withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toFile(notionFirstView);
      outputs[`${viewport.key.toLowerCase()}FirstView`] = firstView;
      outputs[`${viewport.key.toLowerCase()}NotionFirstView`] = notionFirstView;
      if (fullPage) {
        const full = path.join(directory, `${id}_${label}_${viewport.key}_full.png`);
        const notionFull = path.join(directory, `${id}_${label}_${viewport.key}_full_notion.jpg`);
        await page.screenshot({ path: full, fullPage: true, timeout: 30000 });
        await sharp(full, { limitInputPixels: false }).resize({ width: viewport.key === "PC" ? 900 : 375, withoutEnlargement: true }).jpeg({ quality: 72, mozjpeg: true }).toFile(notionFull);
        outputs[`${viewport.key.toLowerCase()}Full`] = full;
        outputs[`${viewport.key.toLowerCase()}NotionFull`] = notionFull;
      }
      outputs[`${viewport.key.toLowerCase()}FinalUrl`] = page.url();
    } finally {
      await context.close();
    }
  }
  return outputs;
}

await fs.mkdir(outputRoot, { recursive: true });
const browser = await chromium.launch();
const results = [];

try {
  for (const candidate of data.candidates || []) {
    const directory = path.join(outputRoot, `${candidate.id}-${safeName(candidate.title)}`);
    await fs.mkdir(directory, { recursive: true });
    const result = { ...candidate, directory, status: "captured", files: {} };
    try {
      if (candidate.saveImage) result.files.reference = await downloadReference(candidate, directory);
      if (candidate.mediaType === "Web" && candidate.captureUrl) {
        result.files.page = await capturePage(browser, candidate.captureUrl, directory, candidate.id, "SITE", true);
      }
      if (candidate.mediaType === "Banner" && candidate.landingUrl) {
        result.files.landing = await capturePage(browser, candidate.landingUrl, directory, candidate.id, "LANDING", false);
      }
    } catch (error) {
      result.status = "failed";
      result.error = error.message;
    }
    await fs.writeFile(path.join(directory, "metadata.json"), JSON.stringify(result, null, 2) + "\n");
    results.push(result);
  }
} finally {
  await browser.close();
}

const summary = { capturedAt: new Date().toISOString(), candidateCount: data.candidates?.length || 0, results };
await fs.writeFile(path.join(outputRoot, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
const failed = results.filter((item) => item.status === "failed");
console.log(`Non-LP capture: ${results.length - failed.length}/${results.length} succeeded.`);
if (failed.length > 0) console.warn(`${failed.length} candidates need review.`);
