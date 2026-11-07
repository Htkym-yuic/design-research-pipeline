import fs from "node:fs/promises";
import path from "node:path";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

async function previews(src, dest) {
  const { default: sharp } = await import("sharp");
  await sharp(src, { limitInputPixels: false }).resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 78 }).toFile(dest);
}

/** 通常の閲覧と同じく上から下までスクロールして遅延読み込み・スクロール連動表示を発火させ、先頭に戻る。 */
export async function scrollThrough(page, { step = 500, pauseMs = 150, maxSteps = 200 } = {}) {
  for (let i = 0; i < maxSteps; i++) {
    const done = await page.evaluate((st) => { window.scrollBy(0, st); return window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2; }, step);
    await page.waitForTimeout(pauseMs);
    if (done) break;
  }
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
}

/** 縦長の全体画像を読める高さに切り分ける（分析用）。 */
export async function sliceTall(src, outDir, prefix, { sliceHeight = 1600, maxSlices = 14, width = 1000 } = {}) {
  const { default: sharp } = await import("sharp");
  const meta = await sharp(src, { limitInputPixels: false }).metadata();
  const files = [];
  const n = Math.min(maxSlices, Math.ceil(meta.height / sliceHeight));
  for (let i = 0; i < n; i++) {
    const top = i * sliceHeight;
    const h = Math.min(sliceHeight, meta.height - top);
    const name = `${prefix}_${String(i + 1).padStart(2, "0")}.jpg`;
    await sharp(src, { limitInputPixels: false }).extract({ left: 0, top, width: meta.width, height: h }).resize({ width, withoutEnlargement: true }).jpeg({ quality: 80 }).toFile(path.join(outDir, name));
    files.push(name);
  }
  return { files, total: Math.ceil(meta.height / sliceHeight), height: meta.height };
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
      await scrollThrough(page);
      const orig = path.join(outDir, "01_Original", `${name}_full.png`);
      await page.screenshot({ path: orig, fullPage: true });
      const prev = path.join(outDir, "02_Preview", `${name}_preview.jpg`);
      await previews(orig, prev);
      files.push({ local: orig, rel: `01_Original/${name}_full.png` }, { local: prev, rel: `02_Preview/${name}_preview.jpg` });
      const secDir = path.join(outDir, "02_Preview", "sections");
      await fs.mkdir(secDir, { recursive: true });
      const sl = await sliceTall(orig, secDir, name);
      for (const f of sl.files) files.push({ local: path.join(secDir, f), rel: `02_Preview/sections/${f}` });
      if (sl.total > sl.files.length) console.warn(`[capture] ${name}: ${sl.total}枚中${sl.files.length}枚のみ切り出し（上限）`);
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
