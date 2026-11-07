import fs from "node:fs/promises";
import path from "node:path";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

async function previews(src, dest) {
  const { default: sharp } = await import("sharp");
  await sharp(src, { limitInputPixels: false }).resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 78 }).toFile(dest);
}

/** LP/Web: 公開ページをPC/SPで撮影（ログイン・課金壁・Bot対策の回避はしない）。 */
export async function captureFullPage(url, outDir) {
  const { chromium } = await import("playwright");
  await fs.mkdir(path.join(outDir, "01_Original"), { recursive: true });
  await fs.mkdir(path.join(outDir, "02_Preview"), { recursive: true });
  const browser = await chromium.launch();
  const files = [];
  try {
    for (const [name, viewport, mobile] of [["pc", { width: 1440, height: 900 }, false], ["sp", { width: 390, height: 844 }, true]]) {
      const ctx = await browser.newContext({ viewport, isMobile: mobile, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      const resp = await page.goto(url, { waitUntil: "load", timeout: 45000 });
      if (!resp || resp.status() >= 400) throw new Error(`HTTP ${resp?.status()}（撮影中止・回避しない）`);
      await page.waitForTimeout(1500);
      const orig = path.join(outDir, "01_Original", `${name}_full.png`);
      await page.screenshot({ path: orig, fullPage: true });
      const prev = path.join(outDir, "02_Preview", `${name}_preview.jpg`);
      await previews(orig, prev);
      files.push({ local: orig, rel: `01_Original/${name}_full.png` }, { local: prev, rel: `02_Preview/${name}_preview.jpg` });
      await ctx.close();
    }
  } finally { await browser.close(); }
  return files;
}

/** バナー: 公開されている画像1枚のみ取得（ギャラリー一括DLなし）。 */
export async function downloadBanner(imageUrl, outDir, fetchImpl = fetch) {
  await fs.mkdir(path.join(outDir, "01_Original"), { recursive: true });
  await fs.mkdir(path.join(outDir, "02_Preview"), { recursive: true });
  const res = await fetchImpl(imageUrl, { headers: { "User-Agent": "design-research-pipeline-dis/1.0 (public-pages-only)" } });
  if (!res.ok) throw new Error(`画像取得失敗 HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_IMAGE_BYTES) throw new Error("画像サイズ上限超過");
  const ext = (new URL(imageUrl).pathname.match(/\.(png|jpe?g|webp|gif)$/i)?.[1] || "png").toLowerCase();
  const orig = path.join(outDir, "01_Original", `banner.${ext}`);
  await fs.writeFile(orig, buf);
  const prev = path.join(outDir, "02_Preview", "banner_preview.jpg");
  await previews(orig, prev);
  return [{ local: orig, rel: `01_Original/banner.${ext}` }, { local: prev, rel: "02_Preview/banner_preview.jpg" }];
}
