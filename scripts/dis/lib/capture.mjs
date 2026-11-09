import fs from "node:fs/promises";
import path from "node:path";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

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
export async function sliceTall(src, outDir, prefix, { sliceHeight = 1600, maxSlices = 40, width = 1000 } = {}) {
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

/** 分割画像を、番号つきで並べた「Section一覧」（ページ全体の地図）にまとめる。 */
export async function buildSectionsMap(sliceFiles, outFile, { cols = 4, cellW = 300, gap = 10, minWidth = 640 } = {}) {
  const { default: sharp } = await import("sharp");
  const c = Math.min(cols, Math.max(1, sliceFiles.length));
  const w = Math.max(cellW, Math.ceil((minWidth - gap) / c) - gap); // 枚数が少ないときは1枚を大きくして、全体の幅を確保する
  const tiles = [];
  for (const [i, f] of sliceFiles.entries()) {
    const buf = await sharp(f).resize({ width: w }).jpeg({ quality: 80 }).toBuffer();
    const meta = await sharp(buf).metadata();
    const badge = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${meta.height}"><rect width="38" height="30" fill="#000"/><text x="19" y="22" font-size="19" text-anchor="middle" fill="#fff" font-family="Arial, Helvetica, sans-serif" font-weight="bold">${i + 1}</text></svg>`);
    tiles.push({ input: await sharp(buf).composite([{ input: badge }]).jpeg({ quality: 80 }).toBuffer(), h: meta.height });
  }
  const rows = Math.ceil(tiles.length / c);
  const rowH = Array.from({ length: rows }, (_, r) => Math.max(...tiles.slice(r * c, r * c + c).map((t) => t.h)));
  const composites = tiles.map((t, i) => ({ input: t.input, left: gap + (i % c) * (w + gap), top: gap + rowH.slice(0, Math.floor(i / c)).reduce((n, h) => n + h + gap, 0) }));
  await sharp({ create: { width: gap + c * (w + gap), height: gap + rowH.reduce((n, h) => n + h + gap, 0), channels: 3, background: "#ffffff" } }).composite(composites).png().toFile(outFile);
}

/** Notion用の軽量JPEG（約720px幅・5MB未満）。5MBを超える場合は画質を下げる。 */
export async function toNotionJpeg(src, dest, { width = 720, maxBytes = 5 * 1024 * 1024 - 64 * 1024 } = {}) {
  const { default: sharp } = await import("sharp");
  for (let q = 82; q >= 40; q -= 12) {
    const buf = await sharp(src, { limitInputPixels: false }).resize({ width, withoutEnlargement: true }).jpeg({ quality: q }).toBuffer();
    if (buf.length <= maxBytes || q <= 40) { await fs.writeFile(dest, buf); return buf.length; }
  }
}

/**
 * LP/Web: 公開ページをPC/SPで撮影（ログイン・課金壁・Bot対策の回避はしない）。
 * 原本のLP取り込みの形に合わせる:
 *   01_Normal_Images/{id}_{PC|SP}_full.png / _first_view.png / _sections.png と、分割画像 sections/{pc|sp}_NN.jpg
 *   02_Notion_Images/{id}_{PC|SP}_first_view_notion.jpg / _sections_notion.jpg（約720px・5MB未満）
 */
export async function captureFullPage(url, outDir, { id = "item" } = {}) {
  const { chromium } = await import("playwright");
  const { default: sharp } = await import("sharp");
  const normal = path.join(outDir, "01_Normal_Images");
  const notion = path.join(outDir, "02_Notion_Images");
  const secDir = path.join(normal, "sections");
  await fs.mkdir(secDir, { recursive: true });
  await fs.mkdir(notion, { recursive: true });
  const browser = await chromium.launch();
  const files = [];
  const warnings = [];
  files.warnings = warnings;
  const add = (local, rel) => files.push({ local, rel });
  try {
    for (const [name, viewport, mobile, mapCols, cellW] of [["pc", { width: 1440, height: 900 }, false, 4, 300], ["sp", { width: 375, height: 812 }, true, 6, 150]]) {
      const NAME = name.toUpperCase();
      const full = path.join(normal, `${id}_${NAME}_full.png`);
      let ctx;
      // SPの全体画像が意図した幅（375px）より広がる場合（スマホ用の設定がないページなど）は、モバイル端末の模擬を外して再撮影する。
      for (const asMobile of mobile ? [true, false] : [false]) {
        ctx = await browser.newContext({ viewport, isMobile: asMobile, deviceScaleFactor: 1 });
        const page = await ctx.newPage();
        const resp = await page.goto(url, { waitUntil: "load", timeout: 45000 });
        if (!resp || resp.status() >= 400) throw new Error(`HTTP ${resp?.status()}（撮影中止・回避しない）`);
        await page.waitForTimeout(1500);
        await scrollThrough(page);
        await page.screenshot({ path: full, fullPage: true });
        const w = (await sharp(full, { limitInputPixels: false }).metadata()).width;
        if (!mobile || w <= 430) break;
        warnings.push(`SPの全体画像が${w}pxに広がったため、モバイル端末の模擬を外して再撮影した`);
        await ctx.close();
      }
      add(full, `01_Normal_Images/${id}_${NAME}_full.png`);
      await deriveSet(full, { id, NAME, name, viewportH: viewport.height, normal, notion, secDir, mapCols, cellW, add, warnings });
      await ctx.close();
    }
  } finally { await browser.close(); }
  return files;
}


/** 全体画像（{id}_{PC|SP}_full.png）から、first_view・分割画像・Section一覧・Notion用JPEGを作る（撮影とアーカイブ画像で共通）。 */
async function deriveSet(full, { id, NAME, name, viewportH, normal, notion, secDir, mapCols, cellW, add, warnings }) {
  const { default: sharp } = await import("sharp");
  const meta = await sharp(full, { limitInputPixels: false }).metadata();
  const fv = path.join(normal, `${id}_${NAME}_first_view.png`);
  await sharp(full, { limitInputPixels: false }).extract({ left: 0, top: 0, width: meta.width, height: Math.min(viewportH, meta.height) }).png().toFile(fv);
  add(fv, `01_Normal_Images/${id}_${NAME}_first_view.png`);
  const sl = await sliceTall(full, secDir, name);
  for (const f of sl.files) add(path.join(secDir, f), `01_Normal_Images/sections/${f}`);
  if (sl.total > sl.files.length) warnings.push(`${name}: ${sl.total}枚中${sl.files.length}枚のみ切り出し（上限で切り捨て）`);
  const map = path.join(normal, `${id}_${NAME}_sections.png`);
  await buildSectionsMap(sl.files.map((f) => path.join(secDir, f)), map, { cols: mapCols, cellW });
  add(map, `01_Normal_Images/${id}_${NAME}_sections.png`);
  for (const kind of ["first_view", "sections"]) {
    const dest = path.join(notion, `${id}_${NAME}_${kind}_notion.jpg`);
    await toNotionJpeg(path.join(normal, `${id}_${NAME}_${kind}.png`), dest);
    add(dest, `02_Notion_Images/${id}_${NAME}_${kind}_notion.jpg`);
  }
}

/** アーカイブの紹介ページが載せている「自分の全体画像」（full_N）のURLを取り出す。関連作品のサムネイル等は対象外。 */
export function parseArchiveFullImages(html, pageUrl) {
  const re = /(?:src|data-src)=["']([^"']*\/image\/lp-archive\/(\d+)\/full_(\d+)\.[a-z0-9.]+)["']/gi;
  const found = [];
  for (const m of html.matchAll(re)) { try { found.push({ url: new URL(m[1], pageUrl).href, postId: m[2], n: Number(m[3]) }); } catch { /* 無視 */ } }
  if (!found.length) return [];
  const own = found[0].postId; // 先頭の full_ が、この紹介ページ自身の画像
  return [...new Map(found.filter((f) => f.postId === own).sort((a, b) => a.n - b.n).map((f) => [f.url, f])).values()];
}

/**
 * 実ページが開けない（公開終了・移転など）場合に、アーカイブが保存している全体画像で、撮影と同じファイル一式を作る。
 * 1案件の画像だけを取得する（一括ダウンロードなし）。取得できない・画像として読めない場合は、回避せず理由つきで止まる。
 * 幅の広い画像をPC、狭い画像をSPとして扱う。画像が1枚だけなら、PCのみ（SPは欠けるため、画像の揃いはNGになる）。
 */
export async function captureFromArchive(detailUrl, outDir, { id = "item", fetchImpl = fetch } = {}) {
  const { default: sharp } = await import("sharp");
  const UA = { "User-Agent": "design-research-pipeline-dis/1.0 (public-pages-only)" };
  const page = await fetchImpl(detailUrl, { headers: UA });
  if (!page.ok) throw new Error(`アーカイブの紹介ページを取得できません HTTP ${page.status}（回避しない）`);
  const imgs = parseArchiveFullImages(await page.text(), detailUrl).slice(0, 2);
  if (!imgs.length) throw new Error("アーカイブの紹介ページに、全体画像（full_N）が見つかりません");
  const normal = path.join(outDir, "01_Normal_Images");
  const notion = path.join(outDir, "02_Notion_Images");
  const secDir = path.join(normal, "sections");
  await fs.mkdir(secDir, { recursive: true });
  await fs.mkdir(notion, { recursive: true });
  const decoded = [];
  for (const im of imgs) {
    const r = await fetchImpl(im.url, { headers: { ...UA, Referer: detailUrl } });
    if (!r.ok) throw new Error(`画像取得失敗 HTTP ${r.status}（回避しない）: ${im.url}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_IMAGE_BYTES) throw new Error("画像サイズ上限超過");
    let meta;
    try { meta = await sharp(buf, { limitInputPixels: false }).metadata(); } catch { throw new Error(`画像として読めません: ${im.url}`); }
    decoded.push({ buf, width: meta.width, url: im.url });
  }
  decoded.sort((a, b) => b.width - a.width);
  const files = [];
  const warnings = ["実ページではなく、アーカイブ掲載の画像から作成（実ページの動き・文言・最新状態は未確認）"];
  files.warnings = warnings;
  const add = (local, rel) => files.push({ local, rel });
  const plan = [["pc", decoded[0], 4, 300], ...(decoded[1] ? [["sp", decoded[1], 6, 150]] : [])];
  if (!decoded[1]) warnings.push("全体画像が1枚だけのため、SPの画像がありません");
  for (const [name, d, mapCols, cellW] of plan) {
    const NAME = name.toUpperCase();
    const full = path.join(normal, `${id}_${NAME}_full.png`);
    await sharp(d.buf, { limitInputPixels: false }).png().toFile(full);
    add(full, `01_Normal_Images/${id}_${NAME}_full.png`);
    warnings.push(`${NAME}: アーカイブ画像の幅は${d.width}px（${d.url}）`);
    await deriveSet(full, { id, NAME, name, viewportH: name === "pc" ? 900 : 812, normal, notion, secDir, mapCols, cellW, add, warnings });
  }
  return files;
}

/** 先頭バイトから画像形式を判定する（拡張子や Content-Type を信用しない）。 */
export function sniffImage(buf) {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length >= 12 && buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "webp";
  if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.subarray(0, 6).toString())) return "gif";
  return null;
}

/** バナー: 公開されている画像1枚のみ取得（ギャラリー一括DLなし）。画像と確認できなければ保存せずに理由つきで失敗する。 */
export async function downloadBanner(imageUrl, outDir, fetchImpl = fetch) {
  const res = await fetchImpl(imageUrl, { headers: { "User-Agent": "design-research-pipeline-dis/1.0 (public-pages-only)" } });
  if (!res.ok) throw new Error(`画像取得失敗 HTTP ${res.status}（回避しない）: ${imageUrl}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_IMAGE_BYTES) throw new Error("画像サイズ上限超過");
  const ext = sniffImage(buf);
  if (!ext) throw new Error(`画像として読めないデータです（content-type: ${res.headers.get("content-type") || "不明"}, ${buf.length}バイト）。ホットリンク防止等の可能性があり、回避しません: ${imageUrl}`);
  await fs.mkdir(path.join(outDir, "01_Normal_Images"), { recursive: true });
  await fs.mkdir(path.join(outDir, "02_Notion_Images"), { recursive: true });
  const orig = path.join(outDir, "01_Normal_Images", `banner.${ext}`);
  await fs.writeFile(orig, buf);
  const prev = path.join(outDir, "02_Notion_Images", "banner_notion.jpg");
  try { await toNotionJpeg(orig, prev); }
  catch (e) { throw new Error(`Notion用画像の生成に失敗（形式: ${ext}）: ${e.message}`); }
  return [{ local: orig, rel: `01_Normal_Images/banner.${ext}` }, { local: prev, rel: "02_Notion_Images/banner_notion.jpg" }];
}
