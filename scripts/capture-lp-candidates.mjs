import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const candidatesPath = new URL("../candidates/lp-archive/candidates.json", import.meta.url);
const candidateData = JSON.parse(await fs.readFile(candidatesPath, "utf8"));

const outputRoot = process.env.LP_CANDIDATE_OUTPUT_DIR || "screenshots/lp-candidates";
const candidateLimit = Number.parseInt(process.env.LP_CANDIDATE_LIMIT || `${candidateData.candidates.length}`, 10);
const sectionLimit = Number.parseInt(process.env.LP_SECTION_LIMIT || "8", 10);

const viewports = [
  { key: "pc", label: "PC", width: 1200, height: 900, isMobile: false },
  { key: "sp", label: "SP", width: 375, height: 812, isMobile: true }
];

const cleanupCss = `
  iframe[src*="doubleclick"],
  iframe[src*="googlesyndication"],
  iframe[id*="google_ads"],
  ins.adsbygoogle,
  [id*="google_ads"],
  [class*="google-auto-placed"],
  [class*="ad-"],
  [class*="_ad"],
  [class*="ads"],
  [id*="ad-"],
  [id*="_ad"],
  [id*="ads"],
  [aria-label*="広告"],
  [class*="cookie"],
  [id*="cookie"] {
    visibility: hidden !important;
  }
`;

function safeName(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function zeroPad(value, digits = 2) {
  return String(value).padStart(digits, "0");
}

function sectionSlug(index) {
  const labels = [
    "hero",
    "problem",
    "features",
    "proof",
    "service",
    "cta",
    "flow",
    "faq"
  ];
  return labels[index - 1] || "section";
}

async function getPageMetrics(page) {
  return page.evaluate(() => {
    const body = document.body;
    const documentElement = document.documentElement;
    return {
      width: Math.max(body.scrollWidth, documentElement.scrollWidth, documentElement.clientWidth),
      height: Math.max(body.scrollHeight, documentElement.scrollHeight, documentElement.clientHeight)
    };
  });
}

async function waitForImages(page) {
  await page.evaluate(async (timeoutMs) => {
    const images = Array.from(document.images);
    const timeout = new Promise((resolve) => window.setTimeout(resolve, timeoutMs));
    const decodeAll = Promise.all(
      images
        .filter((image) => !image.complete || image.naturalWidth === 0)
        .slice(0, 80)
        .map((image) => image.decode().catch(() => {}))
    );
    await Promise.race([decodeAll, timeout]);
  }, 3000);
}

async function preloadLazyAssets(page, viewportHeight) {
  await page.evaluate(async (step) => {
    const getHeight = () => Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
      document.documentElement.clientHeight
    );

    for (let y = 0; y < getHeight(); y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }

    window.scrollTo(0, getHeight());
    await new Promise((resolve) => window.setTimeout(resolve, 500));
    window.scrollTo(0, 0);
    await new Promise((resolve) => window.setTimeout(resolve, 500));
  }, Math.max(600, Math.floor(viewportHeight * 0.8)));

  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await waitForImages(page);
}

function buildSections(totalHeight, viewport, maxSections) {
  const preferredSectionHeight = viewport.isMobile ? 1800 : 1400;
  const maxCaptureHeight = 4800;
  const rawCount = Math.max(
    1,
    Math.ceil(totalHeight / preferredSectionHeight),
    Math.ceil(totalHeight / maxCaptureHeight)
  );
  const count = Math.min(maxSections, rawCount);
  const sectionHeight = Math.ceil(totalHeight / count);

  return Array.from({ length: count }, (_, index) => {
    const startY = index * sectionHeight;
    const endY = index === count - 1 ? totalHeight : Math.min(totalHeight, (index + 1) * sectionHeight);
    const number = index + 1;
    return {
      id: `S${zeroPad(number)}`,
      candidateComponentId: `C${zeroPad(number)}`,
      role: `${sectionSlug(number)} candidate`,
      yStart: startY,
      yEnd: endY,
      height: endY - startY,
      naming: null
    };
  });
}

async function createContactSheet(browser, sections, outputPath, title) {
  const context = await browser.newContext({
    viewport: { width: 1200, height: Math.max(900, sections.length * 320) },
    deviceScaleFactor: 1,
    locale: "ja-JP"
  });
  const page = await context.newPage();
  const rows = await Promise.all(
    sections.map(async (section) => {
      const encoded = await fs.readFile(section.path, "base64");
      const fileUrl = `data:image/png;base64,${encoded}`;
      return `
        <article class="row">
          <div class="meta">
            <strong>${section.id}</strong>
            <span>${section.role}</span>
            <code>y=${section.yStart}-${section.yEnd}px</code>
            <code>${path.basename(section.path)}</code>
          </div>
          <img src="${fileUrl}" alt="${section.id}" />
        </article>
      `;
    })
  );

  await page.setContent(
    `<!doctype html>
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            background: #f3f4f6;
            color: #1f2937;
            font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
          }
          .sheet {
            width: 1200px;
            padding: 28px;
          }
          h1 {
            margin: 0 0 20px;
            font-size: 26px;
            line-height: 1.35;
            font-weight: 700;
            letter-spacing: 0;
          }
          .row {
            display: grid;
            grid-template-columns: 260px 1fr;
            gap: 20px;
            align-items: start;
            padding: 18px;
            margin-bottom: 18px;
            background: white;
            border: 1px solid #d1d5db;
          }
          .meta {
            display: grid;
            gap: 8px;
            position: sticky;
            top: 12px;
          }
          strong { font-size: 20px; }
          span { font-size: 14px; color: #4b5563; }
          code {
            display: block;
            overflow-wrap: anywhere;
            padding: 6px 8px;
            background: #eef2f7;
            border-radius: 4px;
            font-size: 12px;
            color: #374151;
          }
          img {
            width: 100%;
            max-height: 280px;
            object-fit: contain;
            object-position: top center;
            border: 1px solid #e5e7eb;
            background: white;
          }
        </style>
      </head>
      <body>
        <main class="sheet">
          <h1>${title}</h1>
          ${rows.join("")}
        </main>
      </body>
    </html>`,
    { waitUntil: "load" }
  );

  await page.evaluate(async () => {
    const images = Array.from(document.images);
    await Promise.all(images.map((image) => image.decode().catch(() => {})));
  });

  const height = await page.locator(".sheet").evaluate((element) => Math.ceil(element.getBoundingClientRect().height));
  await page.setViewportSize({ width: 1200, height: Math.min(Math.max(height, 900), 16000) });
  await page.screenshot({ path: outputPath, fullPage: true, timeout: 30000 });
  await context.close();
}

const candidates = candidateData.candidates.slice(0, candidateLimit);
await fs.mkdir(outputRoot, { recursive: true });

const browser = await chromium.launch({
  args: ["--allow-file-access-from-files"]
});
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
        device: viewport.key,
        viewportLabel: viewport.label,
        status: "pending",
        screenshots: {},
        sections: [],
        pageMetrics: null,
        finalUrl: null,
        error: null
      };

      try {
        console.log(`Capturing ${candidate.id} ${viewport.key}: ${candidate.captureUrl}`);
        await page.goto(candidate.captureUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(1500);
        await page.addStyleTag({ content: cleanupCss });
        await page.waitForTimeout(500);

        result.finalUrl = page.url();
        result.pageMetrics = await getPageMetrics(page);

        const firstViewPath = path.join(candidateDir, `${candidate.id}_${viewport.key.toUpperCase()}_first_view.png`);
        const fullPagePath = path.join(candidateDir, `${candidate.id}_${viewport.key.toUpperCase()}_full.png`);
        const contactSheetPath = path.join(candidateDir, `${candidate.id}_${viewport.key.toUpperCase()}_sections.png`);
        const sectionsDir = path.join(candidateDir, `${viewport.key}_sections`);
        await fs.mkdir(sectionsDir, { recursive: true });

        await page.screenshot({ path: firstViewPath, fullPage: false, timeout: 30000 });
        await preloadLazyAssets(page, viewport.height);
        result.pageMetrics = await getPageMetrics(page);
        await page.screenshot({ path: fullPagePath, fullPage: true, timeout: 60000 });

        const sections = buildSections(result.pageMetrics.height, viewport, sectionLimit);
        for (const section of sections) {
          const number = Number.parseInt(section.id.slice(1), 10);
          const sectionPath = path.join(
            sectionsDir,
            `${candidate.id}_${viewport.key.toUpperCase()}_C${zeroPad(number)}-${sectionSlug(number)}.png`
          );
          await page.setViewportSize({ width: viewport.width, height: section.height });
          await page.evaluate((y) => window.scrollTo(0, y), section.yStart);
          await page.waitForTimeout(300);
          await page.screenshot({ path: sectionPath, fullPage: false, timeout: 30000 });
          section.path = sectionPath;
          section.naming = path.basename(sectionPath, ".png");
        }

        await page.setViewportSize({ width: viewport.width, height: viewport.height });

        await createContactSheet(
          browser,
          sections,
          contactSheetPath,
          `${candidate.id} ${viewport.label} Section Index`
        );

        result.status = "captured";
        result.screenshots = {
          fullPage: fullPagePath,
          firstView: firstViewPath,
          sectionIndex: contactSheetPath
        };
        result.sections = sections;
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
  sectionLimit,
  captureSet: ["fullPage", "firstView", "sectionIndex", "sectionSlices"],
  results
};

await fs.writeFile(path.join(outputRoot, "summary.json"), JSON.stringify(summary, null, 2));

const failed = results.filter((result) => result.status !== "captured");
console.log(`Captured ${results.length - failed.length}/${results.length} LP candidate screenshots.`);

if (failed.length > 0) {
  console.log("Some LP candidate screenshots failed. See screenshots/lp-candidates/summary.json for details.");
}
