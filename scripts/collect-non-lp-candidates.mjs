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
  const definitions = [
    {
      title: "バナーと遷移先FVで訴求の連続性を保つ",
      condition: candidates.some((item) => item.mediaType === "Banner" && item.landingUrl),
      patternType: "訴求",
      targetMedia: ["Banner", "LP"],
      rule: "広告で約束した価値・対象・オファーを、遷移先ファーストビューでも同じ順序と言葉で再提示する。",
      cautions: "遷移先で別の訴求を先に出すと離脱要因になるため、表現差を週末レビューで確認する。",
      evidenceIds: candidates.filter((item) => item.mediaType === "Banner" && item.landingUrl).map((item) => item.id)
    },
    {
      title: "PCとSPで主要情報の優先順位を維持する",
      condition: candidates.some((item) => item.mediaType === "Web"),
      patternType: "情報設計",
      targetMedia: ["Web", "LP"],
      rule: "画面幅が変わっても、主見出し・主要ベネフィット・CTAの順序と意味を維持する。",
      cautions: "単なる縮小ではなく、SPでの折り返し・CTA位置・画像トリミングを確認する。",
      evidenceIds: candidates.filter((item) => item.mediaType === "Web").map((item) => item.id)
    },
    {
      title: "反復グリッドで複数素材の視線リズムを作る",
      condition: candidates.some((item) => ["Graphic", "Canva"].includes(item.mediaType)),
      patternType: "構成",
      targetMedia: ["Graphic", "Parts"],
      rule: "複数の写真や情報を同じグリッド単位で反復し、サイズ差で主従を作る。",
      cautions: "素材数を増やしすぎず、色温度と余白量を揃えて散漫さを防ぐ。",
      evidenceIds: candidates.filter((item) => ["Graphic", "Canva"].includes(item.mediaType)).map((item) => item.id)
    }
  ];
  const accepted = [];
  for (const definition of definitions) {
    if (!definition.condition || knownTitles.has(definition.title)) continue;
    const id = `PAT-${String(patternCounter.nextNumber + accepted.length).padStart(4, "0")}`;
    accepted.push({
      id,
      status: "candidate",
      mediaType: "Pattern",
      sourceKey: "patterns",
      title: definition.title,
      captureUrl: null,
      imageUrl: null,
      landingUrl: null,
      sourceName: "日次収集から抽出",
      sourceUrl: null,
      sourceDetailUrl: null,
      library: "Pattern_Research_Library",
      notionEnv: "NOTION_PATTERNS_DATA_SOURCE_ID",
      saveImage: false,
      materialId: id,
      authorProfileUrl: null,
      searchTerm: null,
      metadata: { collectionMode: "derived_pattern", ...definition }
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
  for (const source of sources.filter((item) => sourceFilter.size === 0 || sourceFilter.has(item.key))) {
    const limit = Number.parseInt(`${source.perRunLimit ?? process.env[source.limitEnv] ?? source.defaultLimit}`, 10);
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, ...browserContextOptions });
    try {
      await page.goto(source.collectionUrl || source.sourceUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(2500);
      await page.evaluate(async () => {
        const limit = Math.min(document.documentElement.scrollHeight, 5000);
        for (let y = 0; y < limit; y += 700) {
          window.scrollTo(0, y);
          await new Promise((resolve) => setTimeout(resolve, 180));
        }
        window.scrollTo(0, 0);
      });
      let cards = await extractCards(page, source);
      if (cards.length === 0) {
        await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(6000);
        cards = await extractCards(page, source);
      }
      const pageDiagnostic = cards.length === 0
        ? await page.evaluate(() => ({
            finalUrl: location.href,
            title: document.title,
            bodyPreview: document.body?.innerText?.replace(/\s+/g, " ").slice(0, 500) || "",
            figureCount: document.querySelectorAll("figure").length,
            imageCount: document.images.length
          }))
        : null;
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
