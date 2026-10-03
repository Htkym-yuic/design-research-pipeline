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

async function dismissObstructions(page) {
  const dismissed = [];
  const closeNames = /閉じる|close|dismiss/i;
  const closeControls = page.getByRole("button", { name: closeNames });
  for (let index = 0; index < await closeControls.count(); index += 1) {
    const control = closeControls.nth(index);
    if (!await control.isVisible().catch(() => false)) continue;
    await control.click({ timeout: 2000 }).catch(() => {});
    dismissed.push("named-close-control");
  }

  const removed = await page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const campaignPattern = /Amazon|ギフトカード|40,?000円|4万円/i;
    const candidates = [...document.querySelectorAll("body *")].filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const text = element.textContent || "";
      const mediaText = [...element.querySelectorAll("img")]
        .map((image) => `${image.alt || ""} ${image.src || ""}`)
        .join(" ");
      const isFloating = style.position === "fixed" || style.position === "absolute";
      const isLowerOverlay = rect.x > viewportWidth * 0.2 && rect.y > viewportHeight * 0.35;
      const isOverlaySize = rect.width >= 180 && rect.width <= viewportWidth * 0.9
        && rect.height >= 80 && rect.height <= viewportHeight * 0.65;
      return isFloating && isLowerOverlay && isOverlaySize
        && campaignPattern.test(`${text} ${mediaText}`);
    });

    const roots = candidates.filter((candidate) => !candidates.some((other) => other !== candidate && other.contains(candidate)));
    roots.forEach((element) => element.remove());
    return roots.length;
  });
  if (removed > 0) dismissed.push(`campaign-overlay:${removed}`);
  await page.waitForTimeout(500);
  return dismissed;
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
  const dismissed = await dismissObstructions(page);
  const firstView = path.join(output, `${id}_SITE_${label}_first_view.png`);
  const fullPage = path.join(output, `${id}_SITE_${label}_full.png`);
  await page.screenshot({ path: firstView });
  await page.screenshot({ path: fullPage, fullPage: true });
  const finalUrl = page.url();
  const title = await page.title();
  await context.close();
  return { label, firstView, fullPage, finalUrl, title, dismissed };
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
