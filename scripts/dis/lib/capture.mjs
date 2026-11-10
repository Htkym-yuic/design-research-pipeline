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
export async function captureFullPage(url, outDir, { id = "item", spUrl = null, targets = ["pc", "sp"] } = {}) {
  const { chromium, devices } = await import("playwright");
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
      if (!targets.includes(name)) continue; // PCのみ／SPのみの案件では、片方を撮影しない
      const NAME = name.toUpperCase();
      const full = path.join(normal, `${id}_${NAME}_full.png`);
      let ctx;
      // SPの全体画像が意図した幅（375px）より広がる場合（UAでPC版を返すページなど）は、スマホのUAを付けて、それでも広ければモバイル端末の模擬を外して再撮影する。
      const attempts = mobile ? [{ asMobile: true }, { asMobile: true, ua: true }, { asMobile: false }] : [{ asMobile: false }];
      for (const [i, at] of attempts.entries()) {
        ctx = await browser.newContext({ viewport, isMobile: at.asMobile, deviceScaleFactor: 1, ...(at.ua ? { userAgent: devices["iPhone 13"].userAgent, hasTouch: true } : {}) });
        const page = await ctx.newPage();
        const resp = await page.goto(mobile && spUrl ? spUrl : url, { waitUntil: "load", timeout: 45000 });
        if (!resp || resp.status() >= 400) throw new Error(`HTTP ${resp?.status()}（撮影中止・回避しない）`);
        await page.waitForTimeout(1500);
        await scrollThrough(page);
        await page.screenshot({ path: full, fullPage: true });
        const w = (await sharp(full, { limitInputPixels: false }).metadata()).width;
        if (!mobile || w <= 430 || i === attempts.length - 1) break;
        warnings.push(`SPの全体画像が${w}pxに広がったため、${at.ua ? "モバイル端末の模擬を外して" : "スマホのUAを付けて"}再撮影した`);
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
export async function deriveSet(full, { id, NAME, name, viewportH, normal, notion, secDir, mapCols, cellW, add, warnings }) {
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

/** アーカイブの紹介ページが載せている「自分の全体画像」（full_N）のURLを取り出す（full.jpg 1枚、または full_1・full_2…）。関連作品のサムネイル等は対象外。 */
export function parseArchiveFullImages(html, pageUrl) {
  // img の src／data-src のほか、JSON-LD の "contentUrl": "…/image/lp-archive/<ID>/full.png" も全体画像として扱う（img が /image/rdlp/ の表示用に変わったページがある）。
  const re = /(?:(?:src|data-src)=|"contentUrl":\s*)["']?([^"'\s]*\/image\/lp-archive\/(\d+)\/full(?:_(\d+))?\.[a-z0-9.]+)["']/gi;
  const found = [];
  for (const m of html.matchAll(re)) { try { found.push({ url: new URL(m[1], pageUrl).href, postId: m[2], n: Number(m[3] || 0) }); } catch { /* 無視 */ } }
  if (!found.length) return [];
  const own = found[0].postId; // 先頭の full_ が、この紹介ページ自身の画像
  return [...new Map(found.filter((f) => f.postId === own).sort((a, b) => a.n - b.n).map((f) => [f.url, f])).values()];
}

/**
 * 紹介ページの <img> から、PC版・スマホ版の全体画像（/image/rdlp/<ID>/full(_N).jpg.webp）を、alt の「PC版」「スマホ版」で振り分ける。
 * スマホ版が full_1・full_2 のように縦に分かれている場合は、番号順に並べる（呼び出し側で縦につなぐ）。
 */
export function parseArchiveDeviceImages(html, pageUrl) {
  const out = { pc: [], sp: [] };
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = tag.match(/\bsrc=["']([^"']*\/image\/rdlp\/\d+\/full(?:_(\d+))?\.[a-z0-9.]+)["']/i);
    if (!src) continue;
    const alt = (tag.match(/\balt=["']([^"']*)["']/i) || [])[1] || "";
    const dev = /スマホ版/.test(alt) ? "sp" : /PC版/.test(alt) ? "pc" : null;
    if (!dev) continue;
    try { out[dev].push({ url: new URL(src[1], pageUrl).href, n: Number(src[2] || 0) }); } catch { /* 無視 */ }
  }
  for (const d of ["pc", "sp"]) out[d] = [...new Map(out[d].sort((a, b) => a.n - b.n).map((x) => [x.url, x])).values()];
  return out;
}

/**
 * 実ページが開けない（公開終了・移転など）場合に、アーカイブが保存している全体画像で、撮影と同じファイル一式を作る。
 * 1案件の画像だけを取得する（一括ダウンロードなし）。取得できない・画像として読めない場合は、回避せず理由つきで止まる。
 * 紹介ページにPC版・スマホ版（alt で判別）が載っていれば、それぞれPC・SPとして使う（スマホ版が複数枚に分かれていれば縦につなぐ）。
 * 旧形式（alt なし）は、幅の広い画像をPC、狭い画像をSPとして扱う。画像が1枚だけなら、PCのみ（SPは欠けるため、画像の揃いはNGになる）。
 */
export async function captureFromArchive(detailUrl, outDir, { id = "item", fetchImpl = fetch, spDetailUrl = null } = {}) {
  const { default: sharp } = await import("sharp");
  const UA = { "User-Agent": "design-research-pipeline-dis/1.0 (public-pages-only)" };
  const getPage = async (u) => {
    const r = await fetchImpl(u, { headers: UA });
    if (!r.ok) throw new Error(`アーカイブの紹介ページを取得できません HTTP ${r.status}（回避しない）`);
    return r.text();
  };
  const html = await getPage(detailUrl);
  const byDev = parseArchiveDeviceImages(html, detailUrl);
  const legacy = byDev.pc.length || byDev.sp.length ? [] : parseArchiveFullImages(html, detailUrl).slice(0, spDetailUrl ? 1 : 2);
  if (spDetailUrl && !byDev.sp.length) { // スマホ版の紹介ページが別URLの場合は、そこから取る
    const sp2 = parseArchiveDeviceImages(await getPage(spDetailUrl), spDetailUrl);
    if (sp2.sp.length) byDev.sp = sp2.sp;
    else { const l = parseArchiveFullImages(await getPage(spDetailUrl), spDetailUrl)[0]; if (l) byDev.sp = [{ ...l, referer: spDetailUrl }]; }
  }
  if (!byDev.pc.length && !byDev.sp.length && !legacy.length) throw new Error("アーカイブの紹介ページに、全体画像が見つかりません");
  const normal = path.join(outDir, "01_Normal_Images");
  const notion = path.join(outDir, "02_Notion_Images");
  const secDir = path.join(normal, "sections");
  await fs.mkdir(secDir, { recursive: true });
  await fs.mkdir(notion, { recursive: true });
  const fetchImg = async (im) => {
    const r = await fetchImpl(im.url, { headers: { ...UA, Referer: im.referer || detailUrl } });
    if (!r.ok) throw new Error(`画像取得失敗 HTTP ${r.status}（回避しない）: ${im.url}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_IMAGE_BYTES) throw new Error("画像サイズ上限超過");
    try { await sharp(buf, { limitInputPixels: false }).metadata(); } catch { throw new Error(`画像として読めません: ${im.url}`); }
    return buf;
  };
  // 複数枚（full_1・full_2…）は、先頭の幅にそろえて縦につなぐ
  const stack = async (bufs) => {
    if (bufs.length === 1) return bufs[0];
    const metas = await Promise.all(bufs.map((b) => sharp(b, { limitInputPixels: false }).metadata()));
    const w = metas[0].width;
    const parts = await Promise.all(bufs.map((b, i) => (metas[i].width === w ? sharp(b, { limitInputPixels: false }).png().toBuffer() : sharp(b, { limitInputPixels: false }).resize({ width: w }).png().toBuffer())));
    const hs = await Promise.all(parts.map(async (b) => (await sharp(b, { limitInputPixels: false }).metadata()).height));
    let top = 0;
    const layers = parts.map((input, i) => { const l = { input, left: 0, top }; top += hs[i]; return l; });
    return sharp({ create: { width: w, height: top, channels: 3, background: "#fff" }, limitInputPixels: false }).composite(layers).png().toBuffer();
  };
  const decoded = [];
  const files = [];
  const warnings = ["実ページではなく、アーカイブ掲載の画像から作成（実ページの動き・文言・最新状態は未確認）"];
  files.warnings = warnings;
  if (byDev.pc.length || byDev.sp.length) {
    for (const dev of ["pc", "sp"]) {
      if (!byDev[dev].length) { warnings.push(`紹介ページに${dev === "pc" ? "PC" : "スマホ"}版の画像がありません`); continue; }
      const buf = await stack(await Promise.all(byDev[dev].map(fetchImg)));
      decoded.push({ dev, buf, width: (await sharp(buf, { limitInputPixels: false }).metadata()).width, url: byDev[dev].map((x) => x.url).join(" + ") });
    }
  } else {
    const list = [];
    for (const im of legacy) { const buf = await fetchImg(im); list.push({ buf, width: (await sharp(buf, { limitInputPixels: false }).metadata()).width, url: im.url }); }
    list.sort((a, b) => b.width - a.width);
    list.forEach((d, i) => decoded.push({ ...d, dev: i === 0 ? "pc" : "sp" }));
    if (!list[1]) warnings.push("全体画像が1枚だけのため、PCとして扱う（PC/SPのどちらかは、画像を見て確認）。SPの画像はなし");
  }
  const add = (local, rel) => files.push({ local, rel });
  const plan = decoded.map((d) => [d.dev, d, d.dev === "pc" ? 4 : 6, d.dev === "pc" ? 300 : 150]);
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

/**
 * 取得済みの全体画像（Buffer）から、撮影・アーカイブ取得と同じファイル一式を作る（旧ライブラリーの取り込み用）。
 * images: { pc?: Buffer, sp?: Buffer }。戻り値は、[{ local, rel }]（.warnings 付き）。
 */
export async function buildSetFromBuffers(outDir, id, images, { note = "" } = {}) {
  const { default: sharp } = await import("sharp");
  const normal = path.join(outDir, "01_Normal_Images");
  const notion = path.join(outDir, "02_Notion_Images");
  const secDir = path.join(normal, "sections");
  await fs.mkdir(secDir, { recursive: true });
  await fs.mkdir(notion, { recursive: true });
  const files = [];
  const warnings = note ? [note] : [];
  files.warnings = warnings;
  const add = (local, rel) => files.push({ local, rel });
  for (const [name, mapCols, cellW, viewportH] of [["pc", 4, 300, 900], ["sp", 6, 150, 812]]) {
    const buf = images[name];
    if (!buf) { warnings.push(`${name === "pc" ? "PC" : "スマホ"}版の画像がありません`); continue; }
    const NAME = name.toUpperCase();
    const full = path.join(normal, `${id}_${NAME}_full.png`);
    await sharp(buf, { limitInputPixels: false }).png().toFile(full);
    add(full, `01_Normal_Images/${id}_${NAME}_full.png`);
    const meta = await sharp(full, { limitInputPixels: false }).metadata();
    warnings.push(`${NAME}: 画像の幅は${meta.width}px・高さは${meta.height}px`);
    await deriveSet(full, { id, NAME, name, viewportH, normal, notion, secDir, mapCols, cellW, add, warnings });
  }
  return files;
}
