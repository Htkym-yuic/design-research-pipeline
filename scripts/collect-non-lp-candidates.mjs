import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const sourcePath = "data/non-lp-sources.json";
const countersPath = "data/id-counters.json";
const reservationsPath = "candidates/non-lp/intake-reservations.json";
const outputPath = process.env.NON_LP_OUTPUT_PATH || "candidates/non-lp/candidates.json";
const reserveIds = process.env.RESERVE_NON_LP_IDS === "true";
const sourceFilter = new Set(
  String(process.env.NON_LP_SOURCE_FILTER || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);
const browserContextOptions = {
  locale: "ja-JP",
  timezoneId: "Asia/Tokyo",
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
};

const sources = JSON.parse(await fs.readFile(sourcePath, "utf8"));
const counters = JSON.parse(await fs.readFile(countersPath, "utf8"));
const reservations = JSON.parse(await fs.readFile(reservationsPath, "utf8").catch(() => '{"reserved":[]}'));
const knownUrls = new Set();
const knownMaterialIds = new Set();
const allocatedByCounter = new Map();
for (const item of reservations.reserved || []) {
  for (const value of [item.captureUrl, item.sourceDetailUrl, item.imageUrl]) {
    if (value) knownUrls.add(normalizeUrl(value));
  }
  if (item.sourceName && item.materialId) knownMaterialIds.add(`${item.sourceName}:${item.materialId}`);
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.searchParams.sort();
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return String(value || "").trim().toLowerCase();
  }
}

function researchDateJst() {
  return process.env.RESEARCH_DATE_JST
    || new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function dateIndex(dateValue = researchDateJst()) {
  const parsed = Date.parse(`${dateValue}T00:00:00Z`);
  return Number.isNaN(parsed) ? 0 : Math.floor(parsed / 86400000);
}

function configureDailySearch(source) {
  if (!Array.isArray(source.searchTerms) || source.searchTerms.length === 0 || !source.searchParam) return source;
  const searchTerm = source.searchTerms[dateIndex() % source.searchTerms.length];
  const collectionUrl = new URL(source.collectionUrl || source.sourceUrl);
  collectionUrl.searchParams.set(source.searchParam, searchTerm);
  return { ...source, searchTerm, collectionUrl: collectionUrl.toString() };
}

function collectionUrlsFor(source) {
  const primary = source.collectionUrl || source.sourceUrl;
  if (!source.paginationPattern || !source.pageScanLimit) return [primary];
  return Array.from({ length: source.pageScanLimit }, (_, index) => {
    const pageNumber = index + 1;
    return pageNumber === 1 ? primary : source.paginationPattern.replace("{page}", String(pageNumber));
  });
}

function nextId(source, offset) {
  const key = source.counterKey || source.key;
  const counter = counters[key];
  if (!counter?.nextNumber) throw new Error(`${key} のnextNumberがdata/id-counters.jsonにありません`);
  return `${source.prefix}-${String(counter.nextNumber + (allocatedByCounter.get(key) || 0) + offset).padStart(4, "0")}`;
}

function titleFrom(candidate, source) {
  return candidate.title || candidate.alt?.split(/[_\n,]/)[0]?.trim() || `${source.sourceName} reference`;
}

async function extractCards(page, source) {
  return page.evaluate((definition) => {
    const values = [];
    const seen = new Set();

    if (definition.mode === "ac_metadata") {
      for (const figure of document.querySelectorAll("figure")) {
        const image = [...figure.querySelectorAll("img")].find((item) => {
          const src = item.currentSrc || item.src || item.dataset.src || "";
          return src.includes(definition.imageHostIncludes);
        });
        if (!image) continue;

        const hrefs = [...figure.querySelectorAll("a[href]")].map((anchor) => anchor.href);
        let materialUrl = null;
        let materialId = null;
        let title = null;
        for (const href of hrefs) {
          try {
            const parsed = new URL(href);
            const nested = parsed.searchParams.get("url");
            if (nested?.includes("/main/detail")) {
              const detail = new URL(nested);
              materialId = detail.searchParams.get("id") || detail.pathname.match(/\/main\/detail\/(\d+)/)?.[1];
              materialUrl = materialId
                ? definition.detailStyle === "path"
                  ? `${detail.origin}/main/detail/${encodeURIComponent(materialId)}`
                  : `${detail.origin}/main/detail.php?id=${encodeURIComponent(materialId)}`
                : detail.toString();
              title = parsed.searchParams.get("word") || title;
            }
            if (!materialId && parsed.searchParams.get("id") && ["/main/related.php", "/search/ris.php", "/search/ris"].includes(parsed.pathname)) {
              materialId = parsed.searchParams.get("id");
            }
          } catch {}
        }
        if (!materialUrl && materialId) {
          materialUrl = definition.detailStyle === "path"
            ? `${new URL(definition.sourceUrl).origin}/main/detail/${encodeURIComponent(materialId)}`
            : `${new URL(definition.sourceUrl).origin}/main/detail.php?id=${encodeURIComponent(materialId)}`;
        }
        if (!materialUrl || !materialId || seen.has(materialUrl)) continue;
        seen.add(materialUrl);

        const src = image.currentSrc || image.src || image.dataset.src || null;
        values.push({
          title: title || image.alt?.split(/[,_\n]/)[0]?.trim() || null,
          alt: image.alt || null,
          imageUrl: src,
          width: image.naturalWidth || Number(image.getAttribute("width")) || null,
          height: image.naturalHeight || Number(image.getAttribute("height")) || null,
          sourceDetailUrl: materialUrl,
          captureUrl: materialUrl,
          landingUrl: null,
          materialId,
          authorProfileUrl: hrefs.find((href) => href.includes("/main/profile.php") || href.includes("/profile/")) || null,
          searchTerm: definition.searchTerm || null
        });
      }
      return values;
    }

    const images = [...document.images];

    function linksNear(image) {
      const links = [];
      let node = image;
      for (let depth = 0; depth < 7 && node; depth += 1, node = node.parentElement) {
        for (const anchor of node.querySelectorAll?.("a[href]") || []) links.push(anchor.href);
        if (links.length >= 4) break;
      }
      return [...new Set(links)];
    }

    for (const image of images) {
      const src = image.currentSrc || image.src;
      if (!src || src.startsWith("data:") || !src.includes(definition.imageHostIncludes)) continue;
      if (
        image.naturalWidth < (definition.minImageWidth || 180)
        || image.naturalHeight < (definition.minImageHeight || 120)
        || seen.has(src)
      ) continue;
      seen.add(src);

      const links = linksNear(image);
      const internalDetail = links.find((href) =>
        definition.detailPathIncludes && href.includes(new URL(definition.sourceUrl).hostname) && href.includes(definition.detailPathIncludes)
      );
      const external = links.find((href) => {
        try { return new URL(href).hostname !== new URL(definition.sourceUrl).hostname; } catch { return false; }
      });
      const sameHost = links.find((href) => {
        try { return new URL(href).hostname === new URL(definition.sourceUrl).hostname; } catch { return false; }
      });

      const caption = image.closest("figure")?.querySelector("figcaption")?.textContent?.trim();
      values.push({
        title: caption && caption !== "Add new" ? caption : null
          || (image.title && image.title !== "Add new" ? image.title : null)
          || image.alt?.split(/[,\n]/)[0]?.trim()
          || null,
        alt: image.alt || null,
        imageUrl: src,
        width: image.naturalWidth,
        height: image.naturalHeight,
        sourceDetailUrl: internalDetail || sameHost || definition.sourceUrl,
        captureUrl: definition.mode === "web" ? external : src,
        landingUrl: definition.captureLandingPage ? external : null,
        materialId: null,
        authorProfileUrl: null,
        searchTerm: definition.searchTerm || null
      });
    }
    return values;
  }, source);
}

function buildPatternCandidates(candidates, reservations, counters) {
  const patternCounter = counters.patterns;
  if (!patternCounter?.nextNumber) return [];
  const knownTitles = new Set((reservations.reserved || []).filter((item) => item.id?.startsWith("PAT-")).map((item) => item.title));
  const firstOf = (predicate) => candidates.find(predicate);
  const observations = [];
  const banner = firstOf((item) => item.mediaType === "Banner" && item.landingUrl);
  const web = firstOf((item) => item.mediaType === "Web");
  const parts = firstOf((item) => item.mediaType === "Parts");
  const graphic = firstOf((item) => item.mediaType === "Graphic");
  const canva = firstOf((item) => item.mediaType === "Canva");
  const shortTitle = (item) => String(item?.title || item?.id || "参考事例").replace(/\s+/g, " ").slice(0, 70);
  if (banner) observations.push({
    evidence: banner,
    title: `${shortTitle(banner)}に見る広告と遷移先FVの訴求連続性`,
    patternType: "訴求", targetMedia: ["Banner", "LP"],
    rule: "広告で約束した価値・対象・オファーが、遷移先ファーストビューでも同じ優先順位で示されているかを比較する。",
    cautions: "コピーの一致だけで判断せず、画像・CTA・価格条件を週末レビューで確認する。"
  });
  if (web) observations.push({
    evidence: web,
    title: `${shortTitle(web)}に見るPC・SPの情報優先順位`,
    patternType: "情報設計", targetMedia: ["Web", "LP"],
    rule: "画面幅が変わっても、主見出し・主要ベネフィット・CTAの意味と順序を維持する。",
    cautions: "単なる縮小ではなく、折り返し・CTA位置・画像トリミングを実画像で確認する。"
  });
  if (parts) observations.push({
    evidence: parts,
    title: `${shortTitle(parts)}に見るセクション内の役割集約`,
    patternType: "構成", targetMedia: ["Parts", "Web", "LP"],
    rule: "一つのセクション内で見出し・説明・証拠・行動導線の役割を整理し、他案件へ転用可能な単位として捉える。",
    cautions: "切り出し範囲が広すぎないか、前後セクションへの依存がないかを確認する。"
  });
  if (graphic) observations.push({
    evidence: graphic,
    title: `${shortTitle(graphic)}に見る文字組みと視線誘導`,
    patternType: "視線誘導", targetMedia: ["Graphic", "Banner"],
    rule: "主見出し・補足・画像・行動情報のサイズ差と配置から、最初に読ませる情報を明確にする。",
    cautions: "素材そのものではなく、情報階層と余白の考え方だけを転用する。"
  });
  if (canva) observations.push({
    evidence: canva,
    title: `${shortTitle(canva)}に見る反復可能なテンプレート構造`,
    patternType: "反復", targetMedia: ["Canva", "Graphic", "SNS"],
    rule: "画像枠・見出し・補足情報の位置を固定し、素材を差し替えても情報階層が崩れない構造を作る。",
    cautions: "テンプレートの複製ではなく、グリッド・余白・主従関係のみを参考にする。"
  });
  if (observations.length === 0) return [];
  const rotated = observations.map((_, index) => observations[(dateIndex() + index) % observations.length]);
  const limit = Number.parseInt(process.env.DAILY_PATTERN_LIMIT || "2", 10);
  const accepted = [];
  for (const definition of rotated) {
    if (accepted.length >= limit || knownTitles.has(definition.title)) continue;
    const id = `PAT-${String(patternCounter.nextNumber + accepted.length).padStart(4, "0")}`;
    accepted.push({
      id,
      status: "candidate",
      mediaType: "Pattern",
      sourceKey: "patterns",
      title: definition.title,
      captureUrl: definition.evidence.captureUrl,
      imageUrl: null,
      landingUrl: null,
      sourceName: `日次収集から抽出（${definition.evidence.sourceName}）`,
      sourceUrl: definition.evidence.sourceUrl,
      sourceDetailUrl: definition.evidence.sourceDetailUrl,
      library: "Pattern_Research_Library",
      notionEnv: "NOTION_PATTERNS_DATA_SOURCE_ID",
      saveImage: false,
      materialId: id,
      authorProfileUrl: null,
      searchTerm: null,
      metadata: {
        collectionMode: "derived_pattern",
        patternType: definition.patternType,
        targetMedia: definition.targetMedia,
        rule: definition.rule,
        cautions: definition.cautions,
        evidenceIds: [definition.evidence.id]
      }
    });
  }
  return accepted;
}

async function findBannerLanding(browser, detailUrl, sourceHost) {
  if (!detailUrl) return null;
  const page = await browser.newPage(browserContextOptions);
  try {
    await page.goto(detailUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
    return await page.evaluate((host) => {
      const ignored = ["google", "facebook", "twitter", "x.com", "pinterest", "instagram", "amazon"];
      return [...document.querySelectorAll("a[href]")].map((a) => a.href).find((href) => {
        try {
          const hostname = new URL(href).hostname;
          return hostname !== host && !ignored.some((word) => hostname.includes(word));
        } catch { return false; }
      }) || null;
    }, sourceHost);
  } catch {
    return null;
  } finally {
    await page.close();
  }
}

async function findDetailTitle(browser, detailUrl) {
  if (!detailUrl) return null;
  const page = await browser.newPage(browserContextOptions);
  try {
    await page.goto(detailUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
    return await page.evaluate(() => {
      const value = document.querySelector("h1")?.textContent?.trim()
        || document.querySelector('meta[property="og:title"]')?.content?.trim()
        || document.title?.trim();
      return value?.replace(/\s*[-|｜].*デザインAC.*$/i, "").trim() || null;
    });
  } catch {
    return null;
  } finally {
    await page.close();
  }
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
const browser = await chromium.launch();
const allCandidates = [];
const sourceResults = [];

try {
  for (const originalSource of sources.filter((item) => sourceFilter.size === 0 || sourceFilter.has(item.key))) {
    const source = configureDailySearch(originalSource);
    const limit = Number.parseInt(`${source.perRunLimit ?? process.env[source.limitEnv] ?? source.defaultLimit}`, 10);
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, ...browserContextOptions });
    try {
      const cards = [];
      const seenCards = new Set();
      const diagnostics = [];
      for (const collectionUrl of collectionUrlsFor(source)) {
        await page.goto(collectionUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(2500);
        await page.evaluate(async () => {
          const limit = Math.min(document.documentElement.scrollHeight, 5000);
          for (let y = 0; y < limit; y += 700) {
            window.scrollTo(0, y);
            await new Promise((resolve) => setTimeout(resolve, 180));
          }
          window.scrollTo(0, 0);
        });
        let pageCards = await extractCards(page, source);
        if (pageCards.length === 0) {
          await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
          await page.waitForTimeout(6000);
          pageCards = await extractCards(page, source);
        }
        if (pageCards.length === 0) diagnostics.push(await page.evaluate(() => ({
            finalUrl: location.href,
            title: document.title,
            bodyPreview: document.body?.innerText?.replace(/\s+/g, " ").slice(0, 500) || "",
            figureCount: document.querySelectorAll("figure").length,
            imageCount: document.images.length
          })));
        for (const card of pageCards) {
          const identity = normalizeUrl(card.sourceDetailUrl || card.imageUrl || card.captureUrl);
          if (seenCards.has(identity)) continue;
          seenCards.add(identity);
          cards.push(card);
        }
        const unseenCount = cards.filter((card) => {
          const urls = [card.sourceDetailUrl, card.captureUrl, card.imageUrl].filter(Boolean).map(normalizeUrl);
          const materialIdentity = card.materialId ? `${source.sourceName}:${card.materialId}` : null;
          return !urls.some((value) => knownUrls.has(value)) && !(materialIdentity && knownMaterialIds.has(materialIdentity));
        }).length;
        if (unseenCount >= limit) break;
      }
      const pageDiagnostic = cards.length === 0 ? diagnostics[0] || null : null;
      const accepted = [];

      for (const card of cards) {
        if (accepted.length >= limit) break;
        if (source.captureLandingPage && !card.landingUrl) {
          card.landingUrl = await findBannerLanding(browser, card.sourceDetailUrl, new URL(source.sourceUrl).hostname);
        }
        if (!card.title || card.title === "Add new") {
          card.title = await findDetailTitle(browser, card.sourceDetailUrl) || card.title;
        }
        const identityUrls = [card.sourceDetailUrl, card.captureUrl, card.imageUrl].filter(Boolean).map(normalizeUrl);
        const materialIdentity = card.materialId ? `${source.sourceName}:${card.materialId}` : null;
        if (identityUrls.some((value) => knownUrls.has(value)) || (materialIdentity && knownMaterialIds.has(materialIdentity))) continue;
        identityUrls.forEach((value) => knownUrls.add(value));
        if (materialIdentity) knownMaterialIds.add(materialIdentity);

        const id = nextId(source, accepted.length);
        accepted.push({
          id,
          status: "candidate",
          mediaType: source.mediaType,
          sourceKey: source.key,
          title: titleFrom(card, source),
          captureUrl: card.captureUrl || card.imageUrl,
          imageUrl: card.imageUrl,
          landingUrl: card.landingUrl,
          sourceName: source.sourceName,
          sourceUrl: source.sourceUrl,
          sourceDetailUrl: card.sourceDetailUrl,
          library: source.library,
          notionEnv: source.notionEnv,
          saveImage: source.mode !== "ac_metadata",
          materialId: card.materialId,
          authorProfileUrl: card.authorProfileUrl,
          searchTerm: card.searchTerm,
          metadata: {
            width: card.width,
            height: card.height,
            alt: card.alt,
            subtype: source.subtype || null,
            subtypeLabel: source.subtypeLabel || null
          }
        });
      }

      allCandidates.push(...accepted);
      const counterKey = source.counterKey || source.key;
      allocatedByCounter.set(counterKey, (allocatedByCounter.get(counterKey) || 0) + accepted.length);
      const accessBlocked = pageDiagnostic && /403|request blocked|access denied|captcha/i.test(
        `${pageDiagnostic.title} ${pageDiagnostic.bodyPreview}`
      );
      sourceResults.push({
        key: source.key,
        sourceName: source.sourceName,
        status: accessBlocked ? "blocked" : cards.length === 0 ? "unavailable" : "collected",
        found: cards.length,
        accepted: accepted.length,
        reason: accessBlocked
          ? "取得元がGitHubホストランナーからのアクセスを拒否しました。ローカル収集ルートで再実行してください。"
          : cards.length === 0 ? "対象画像を取得できませんでした。次回再試行します。" : null,
        diagnostic: pageDiagnostic,
      });

      if (pageDiagnostic) console.warn(`${source.sourceName} diagnostic: ${JSON.stringify(pageDiagnostic)}`);

    } catch (error) {
      sourceResults.push({ key: source.key, sourceName: source.sourceName, status: "failed", error: error.message });
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}

const patternCandidates = buildPatternCandidates(allCandidates, reservations, counters);
if (patternCandidates.length > 0) {
  allCandidates.push(...patternCandidates);
  sourceResults.push({ key: "patterns", sourceName: "日次収集から抽出", status: "collected", found: patternCandidates.length, accepted: patternCandidates.length, reason: null, diagnostic: null });
  if (reserveIds) {
    counters.patterns.existingMax = counters.patterns.nextNumber + patternCandidates.length - 1;
    counters.patterns.nextNumber += patternCandidates.length;
    counters.patterns.lastReservationAt = new Date().toISOString();
  }
}

const output = { collectedAt: new Date().toISOString(), candidateCount: allCandidates.length, candidates: allCandidates, sourceResults };
await fs.writeFile(outputPath, JSON.stringify(output, null, 2) + "\n");

if (reserveIds && allCandidates.length > 0) {
  for (const [key, count] of allocatedByCounter) {
    if (count <= 0) continue;
    const counter = counters[key];
    counter.existingMax = counter.nextNumber + count - 1;
    counter.nextNumber += count;
    counter.lastReservationAt = new Date().toISOString();
  }
  const byId = new Map((reservations.reserved || []).map((item) => [item.id, item]));
  for (const candidate of allCandidates) {
    byId.set(candidate.id, {
      id: candidate.id,
      title: candidate.title,
      mediaType: candidate.mediaType,
      sourceName: candidate.sourceName,
      captureUrl: candidate.captureUrl,
      sourceDetailUrl: candidate.sourceDetailUrl,
      imageUrl: candidate.imageUrl,
      materialId: candidate.materialId || null,
      authorProfileUrl: candidate.authorProfileUrl || null,
      reservedAt: output.collectedAt
    });
  }
  reservations.updatedAt = output.collectedAt;
  reservations.reserved = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  await fs.writeFile(reservationsPath, JSON.stringify(reservations, null, 2) + "\n");
  await fs.writeFile(countersPath, JSON.stringify(counters, null, 2) + "\n");
}

console.log(`Non-LP candidates: ${allCandidates.length}`);
for (const result of sourceResults) console.log(`${result.sourceName}: ${result.status} accepted=${result.accepted || 0}${result.error ? ` error=${result.error}` : ""}`);
