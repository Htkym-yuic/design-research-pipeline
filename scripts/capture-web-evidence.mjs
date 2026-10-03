import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith("--")) continue;
    const key = argv[index].slice(2);
    const next = argv[index + 1];
    args[key] = next && !next.startsWith("--") ? argv[++index] : true;
  }
  return args;
}

async function warmLazyContent(page) {
  await page.evaluate(async () => {
    const step = Math.max(480, Math.floor(window.innerHeight * 0.75));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 180));
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
}

async function capture(browser, { url, id, output, label, viewport, isMobile }) {
  const context = await browser.newContext({
    viewport,
    isMobile,
    deviceScaleFactor: 1,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo"
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(4000);
  await warmLazyContent(page);
  const firstView = path.join(output, `${id}_SITE_${label}_first_view.png`);
  const fullPage = path.join(output, `${id}_SITE_${label}_full.png`);
  await page.screenshot({ path: firstView });
  await page.screenshot({ path: fullPage, fullPage: true });
  const finalUrl = page.url();
  const title = await page.title();
  await context.close();
  return { label, firstView, fullPage, finalUrl, title };
}

const args = parseArgs(process.argv.slice(2));
if (!args.url || !args.id || !args.output) {
  console.error("Usage: node scripts/capture-web-evidence.mjs --url <url> --id <WB-0000> --output <dir>");
  process.exit(2);
}

await fs.mkdir(args.output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const results = [];
  results.push(await capture(browser, {
    url: args.url,
    id: args.id,
    output: args.output,
    label: "PC",
    viewport: { width: 1440, height: 900 },
    isMobile: false
  }));
  results.push(await capture(browser, {
    url: args.url,
    id: args.id,
    output: args.output,
    label: "SP",
    viewport: { width: 390, height: 844 },
    isMobile: true
  }));
  console.log(JSON.stringify({ id: args.id, requestedUrl: args.url, results }, null, 2));
} finally {
  await browser.close();
}
