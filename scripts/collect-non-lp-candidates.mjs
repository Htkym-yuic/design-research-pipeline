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
for (const item of reservations.reserved || []) {
  for (const value of [item.captureUrl, item.sourceDetailUrl, item.imageUrl]) {
    if (value) knownUrls.add(normalizeUrl(value));
  }
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
  const counter = counters[source.key];
  if (!counter?.nextNumber) throw new Error(`${source.key} のnextNumberがdata/id-counters.jsonにありません`);
  return `${source.prefix}-${String(counter.nextNumber + offset).padStart(4, "0")}`;
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
            if (nested?.includes("/main/detail.php")) {
              const detail = new URL(nested);
              materialId = detail.searchParams.get("id");
              materialUrl = materialId
                ? `${detail.origin}${detail.pathname}?id=${encodeURIComponent(materialId)}`
                : detail.toString();
              title = parsed.searchParams.get("word") || title;
            }
            if (!materialId && parsed.searchParams.get("id") && ["/main/related.php", "/search/ris.php"].includes(parsed.pathname)) {
              materialId = parsed.searchParams.get("id");
            }
          } catch {}
        }
        if (!materialUrl && materialId) {
          materialUrl = `${new URL(definition.sourceUrl).origin}/main/detail.php?id=${encodeURIComponent(materialId)}`;
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
          authorProfileUrl: hrefs.find((href) => href.includes("/main/profile.php")) || null,
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
      if (image.naturalWidth < 180 || image.naturalHeight < 120 || seen.has(src)) continue;
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

      values.push({
        title: image.title || image.alt?.split(/[,\n]/)[0]?.trim() || null,
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

await fs.mkdir(path.dirname(outputPath), { recursive: true });
const browser = await chromium.launch();
const allCandidates = [];
const sourceResults = [];

try {
  for (const source of sources.filter((item) => sourceFilter.size === 0 || sourceFilter.has(item.key))) {
    const limit = Number.parseInt(process.env[source.limitEnv] || `${source.defaultLimit}`, 10);
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
        const identityUrls = [card.sourceDetailUrl, card.captureUrl, card.imageUrl].filter(Boolean).map(normalizeUrl);
        if (identityUrls.some((value) => knownUrls.has(value))) continue;
        identityUrls.forEach((value) => knownUrls.add(value));

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
          metadata: { width: card.width, height: card.height, alt: card.alt }
        });
      }

      allCandidates.push(...accepted);
      sourceResults.push({
        key: source.key,
        sourceName: source.sourceName,
        status: cards.length === 0 ? "unavailable" : "collected",
        found: cards.length,
        accepted: accepted.length,
        reason: cards.length === 0 ? "対象画像を取得できませんでした。次回再試行します。" : null,
        diagnostic: pageDiagnostic,
      });

      if (pageDiagnostic) console.warn(`${source.sourceName} diagnostic: ${JSON.stringify(pageDiagnostic)}`);

      if (reserveIds && accepted.length > 0) {
        const counter = counters[source.key];
        counter.existingMax = counter.nextNumber + accepted.length - 1;
        counter.nextNumber += accepted.length;
        counter.lastReservationAt = new Date().toISOString();
      }
    } catch (error) {
      sourceResults.push({ key: source.key, sourceName: source.sourceName, status: "failed", error: error.message });
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}

const output = { collectedAt: new Date().toISOString(), candidateCount: allCandidates.length, candidates: allCandidates, sourceResults };
await fs.writeFile(outputPath, JSON.stringify(output, null, 2) + "\n");

if (reserveIds && allCandidates.length > 0) {
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
