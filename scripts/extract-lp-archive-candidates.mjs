import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const idCountersPath = new URL("../data/id-counters.json", import.meta.url);
const idCounters = JSON.parse(await fs.readFile(idCountersPath, "utf8"));
const intakeReservationsPath = new URL("../candidates/lp-archive/intake-reservations.json", import.meta.url);
const knowledgeLpDir = new URL("../knowledge/lp/", import.meta.url);

const sourceUrl = process.env.LP_ARCHIVE_SOURCE_URL || "https://rdlp.jp/lp-archive/";
const outputRoot = process.env.CANDIDATE_OUTPUT_DIR || "candidates/lp-archive";
const candidateLimit = Number.parseInt(process.env.CANDIDATE_LIMIT || "8", 10);
const candidateScanLimit = Number.parseInt(
  process.env.CANDIDATE_SCAN_LIMIT || `${Math.max(candidateLimit * 4, candidateLimit + 10)}`,
  10
);
const nextLpNumber = Number.parseInt(process.env.NEXT_LP_NUMBER || `${idCounters.lp.nextNumber}`, 10);
const shouldReserveIds = process.env.RESERVE_LP_IDS === "true";

function absoluteUrl(value, baseUrl) {
  if (!value) return null;
  return new URL(value, baseUrl).toString();
}

function formatId(prefix, number, digits) {
  return `${prefix}-${String(number).padStart(digits, "0")}`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeUrl(value) {
  if (!value) return null;

  try {
    const url = new URL(value);
    url.hash = "";
    url.searchParams.sort();

    const normalized = url.toString().replace(/\/$/, "");
    return normalized.toLowerCase();
  } catch {
    return String(value).trim().replace(/\/$/, "").toLowerCase() || null;
  }
}

async function readJsonIfExists(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function buildKnownLpIndex(outputPath) {
  const knownUrls = new Map();
  const knownArchivePostIds = new Map();

  function addUrl(value, id, reason) {
    const normalized = normalizeUrl(value);
    if (normalized && id && !knownUrls.has(normalized)) knownUrls.set(normalized, { id, reason });
  }

  function addArchivePostId(value, id, reason) {
    if (value && id && !knownArchivePostIds.has(String(value))) {
      knownArchivePostIds.set(String(value), { id, reason });
    }
  }

  const existingCandidates = await readJsonIfExists(outputPath, { candidates: [] });
  for (const candidate of existingCandidates.candidates || []) {
    addUrl(candidate.captureUrl, candidate.id, "existing candidate captureUrl");
    addUrl(candidate.sourceDetailUrl, candidate.id, "existing candidate sourceDetailUrl");
    addArchivePostId(candidate.metadata?.lpArchivePostId, candidate.id, "existing candidate lpArchivePostId");
  }
  for (const candidate of existingCandidates.skippedCandidates || []) {
    const id = candidate.duplicate?.duplicateOf;
    addUrl(candidate.captureUrl, id, "previously skipped duplicate captureUrl");
    addUrl(candidate.sourceDetailUrl, id, "previously skipped duplicate sourceDetailUrl");
    addArchivePostId(candidate.lpArchivePostId, id, "previously skipped duplicate lpArchivePostId");
  }

  const reservations = await readJsonIfExists(intakeReservationsPath, { reserved: [] });
  for (const item of reservations.reserved || []) {
    addUrl(item.captureUrl, item.id, "intake reservation captureUrl");
    addUrl(item.sourceDetailUrl, item.id, "intake reservation sourceDetailUrl");
    addArchivePostId(item.lpArchivePostId, item.id, "intake reservation lpArchivePostId");
  }

  let knowledgeFiles = [];
  try {
    knowledgeFiles = await fs.readdir(knowledgeLpDir);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  for (const file of knowledgeFiles.filter((name) => name.endsWith(".json"))) {
    const knowledge = await readJsonIfExists(new URL(file, knowledgeLpDir), null);
    if (!knowledge?.id) continue;
    addUrl(knowledge.captureUrl, knowledge.id, "knowledge captureUrl");
    addUrl(knowledge.sourceDetailUrl, knowledge.id, "knowledge sourceDetailUrl");
    addUrl(knowledge.source?.captured_url, knowledge.id, "knowledge source.captured_url");
    addUrl(knowledge.source?.reference_detail_url, knowledge.id, "knowledge source.reference_detail_url");
    addArchivePostId(knowledge.source?.archive_post_id, knowledge.id, "knowledge archive_post_id");
  }

  return { knownUrls, knownArchivePostIds };
}

function findDuplicate(candidate, detail, knownIndex) {
  const urlChecks = [
    ["captureUrl", detail.targetUrl || candidate.sourceDetailUrl],
    ["sourceDetailUrl", candidate.sourceDetailUrl]
  ];

  for (const [field, value] of urlChecks) {
    const normalized = normalizeUrl(value);
    const known = normalized ? knownIndex.knownUrls.get(normalized) : null;
    if (known) {
      return {
        duplicateOf: known.id,
        field,
        value,
        reason: known.reason
      };
    }
  }

  const knownPost = candidate.lpArchivePostId
    ? knownIndex.knownArchivePostIds.get(String(candidate.lpArchivePostId))
    : null;
  if (knownPost) {
    return {
      duplicateOf: knownPost.id,
      field: "lpArchivePostId",
      value: candidate.lpArchivePostId,
      reason: knownPost.reason
    };
  }

  return null;
}

await fs.mkdir(outputRoot, { recursive: true });
const outputPath = path.join(outputRoot, "candidates.json");
const knownIndex = await buildKnownLpIndex(outputPath);

const browser = await chromium.launch();
const page = await browser.newPage({ locale: "ja-JP" });

async function extractListing(page) {
  return page.$$eval(
    ".lp-card.lp-show-wrap",
    (cards, { limit, baseUrl }) =>
      cards.slice(0, limit).map((card) => {
        const detailAnchor = card.querySelector(".lp-card-img a[href], .lp-card-label a[href]");
        const titleNode = card.querySelector(".lp-card-label a, .lp-card-label");
        const imageNode = card.querySelector(".lp-card-img img");
        const thumbnailInput = card.querySelector("input[name='thumbnail_path']");
        const postIdInput = card.querySelector("input[name='post_id']");

        const absolutize = (value) => (value ? new URL(value, baseUrl).toString() : null);

        return {
          lpArchivePostId: postIdInput?.getAttribute("value") || null,
          title: titleNode?.textContent?.trim() || imageNode?.getAttribute("alt") || null,
          sourceDetailUrl: absolutize(detailAnchor?.getAttribute("href")),
          thumbnailUrl: absolutize(thumbnailInput?.getAttribute("value") || imageNode?.getAttribute("src")),
          thumbnailAlt: imageNode?.getAttribute("alt") || null,
          company: card.querySelector(".company")?.textContent?.trim() || null,
          category: card.querySelector(".cat")?.textContent?.trim() || null,
          tasteTag: card.querySelector(".tag")?.textContent?.trim() || null,
          favoriteCount: card.querySelector(".fav-num")?.textContent?.trim() || null
        };
      }),
    { limit: candidateScanLimit, baseUrl: sourceUrl }
  );
}

let listingDiagnostic = null;

try {
  await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});

  let listingCandidates = await extractListing(page);
  if (listingCandidates.length === 0) {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(6000);
    listingCandidates = await extractListing(page);
  }
  if (listingCandidates.length === 0) {
    listingDiagnostic = await page.evaluate(() => ({
      finalUrl: location.href,
      title: document.title,
      bodyPreview: document.body?.innerText?.replace(/\s+/g, " ").slice(0, 500) || "",
      lpCardCount: document.querySelectorAll(".lp-card").length,
      lpCardShowWrapCount: document.querySelectorAll(".lp-card.lp-show-wrap").length
    }));
    console.warn(`LPアーカイブ diagnostic: ${JSON.stringify(listingDiagnostic)}`);
  }

  const candidates = [];
  const skippedCandidates = [];

  for (const [index, candidate] of listingCandidates.entries()) {
    const detail = {
      targetUrl: null,
      pcArchiveImageUrls: [],
      spArchiveImageUrls: [],
      allArchiveImageUrls: []
    };

    if (candidate.sourceDetailUrl) {
      const detailPage = await browser.newPage({ locale: "ja-JP" });

      try {
        await detailPage.goto(candidate.sourceDetailUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
        await detailPage.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});

        const extracted = await detailPage.evaluate(() => {
          const urlChecks = [...document.querySelectorAll("a.url_check[href]")];
          const targetUrls = urlChecks.map((anchor) => anchor.href).filter(Boolean);

          const imageGroups = urlChecks.map((anchor) =>
            [...anchor.querySelectorAll("img[src]")].map((image) => ({
              src: image.src,
              alt: image.getAttribute("alt") || "",
              width: image.getAttribute("width") || null,
              height: image.getAttribute("height") || null
            }))
          );

          return {
            targetUrls,
            pcImages: imageGroups[0] || [],
            spImages: imageGroups[1] || [],
            allImages: imageGroups.flat()
          };
        });

        detail.targetUrl = unique(extracted.targetUrls)[0] || null;
        detail.pcArchiveImageUrls = unique(extracted.pcImages.map((image) => image.src));
        detail.spArchiveImageUrls = unique(extracted.spImages.map((image) => image.src));
        detail.allArchiveImageUrls = unique(extracted.allImages.map((image) => image.src));
      } catch (error) {
        detail.error = error instanceof Error ? error.message : String(error);
      } finally {
        await detailPage.close();
      }
    }

    const duplicate = findDuplicate(candidate, detail, knownIndex);
    if (duplicate) {
      skippedCandidates.push({
        title: candidate.title,
        sourceDetailUrl: candidate.sourceDetailUrl,
        captureUrl: detail.targetUrl || candidate.sourceDetailUrl,
        lpArchivePostId: candidate.lpArchivePostId,
        duplicate
      });
      continue;
    }

    const suggestedId = formatId(idCounters.lp.prefix, nextLpNumber + candidates.length, idCounters.lp.digits);
    candidates.push({
      id: suggestedId,
      status: "candidate",
      mediaType: "LP",
      title: candidate.title,
      captureUrl: detail.targetUrl || candidate.sourceDetailUrl,
      captureMode: detail.targetUrl ? "target_site" : "lp_archive_detail",
      sourceType: "Reference Site",
      sourceName: "LPアーカイブ",
      sourceUrl,
      sourceDetailUrl: candidate.sourceDetailUrl,
      thumbnailUrl: candidate.thumbnailUrl,
      metadata: {
        lpArchivePostId: candidate.lpArchivePostId,
        company: candidate.company,
        category: candidate.category,
        tasteTag: candidate.tasteTag,
        favoriteCount: candidate.favoriteCount,
        thumbnailAlt: candidate.thumbnailAlt
      },
      archiveAssets: {
        pcImageUrls: detail.pcArchiveImageUrls,
        spImageUrls: detail.spArchiveImageUrls,
        allImageUrls: detail.allArchiveImageUrls
      },
      notes: "LPアーカイブ一覧から自動抽出した候補。採用前に人が確認する。"
    });

    if (candidates.length >= candidateLimit) break;
  }

  const summary = {
    extractedAt: new Date().toISOString(),
    sourceUrl,
    sourceName: "LPアーカイブ",
    mediaType: "LP",
    requestedLimit: candidateLimit,
    scannedLimit: candidateScanLimit,
    candidateCount: candidates.length,
    skippedDuplicateCount: skippedCandidates.length,
    diagnostic: listingDiagnostic,
    idStart: formatId(idCounters.lp.prefix, nextLpNumber, idCounters.lp.digits),
    idEnd:
      candidates.length > 0
        ? formatId(idCounters.lp.prefix, nextLpNumber + candidates.length - 1, idCounters.lp.digits)
        : null,
    candidates,
    skippedCandidates
  };

  await fs.writeFile(outputPath, JSON.stringify(summary, null, 2));

  if (shouldReserveIds && candidates.length > 0) {
    const reservations = await readJsonIfExists(intakeReservationsPath, { reserved: [] });
    const reservedById = new Map((reservations.reserved || []).map((item) => [item.id, item]));
    for (const candidate of candidates) {
      reservedById.set(candidate.id, {
        id: candidate.id,
        title: candidate.title,
        status: "reserved_daily_intake",
        captureUrl: candidate.captureUrl,
        sourceDetailUrl: candidate.sourceDetailUrl,
        lpArchivePostId: candidate.metadata?.lpArchivePostId || null,
        reservedAt: summary.extractedAt
      });
    }

    const reservedMax = nextLpNumber + candidates.length - 1;
    idCounters.lp.existingMax = Math.max(Number(idCounters.lp.existingMax || 0), reservedMax);
    idCounters.lp.nextNumber = reservedMax + 1;
    idCounters.lp.sourceOfTruth = "Notion 01｜LPリサーチライブラリー + Dropbox/GitHub intake reservations";
    idCounters.lp.lastReservation = {
      reservedAt: summary.extractedAt,
      idStart: summary.idStart,
      idEnd: summary.idEnd,
      candidateCount: candidates.length,
      sourceName: summary.sourceName,
      outputPath
    };
    reservations.updatedAt = summary.extractedAt;
    reservations.reserved = [...reservedById.values()].sort((a, b) => a.id.localeCompare(b.id));
    reservations.nextLpId = formatId(idCounters.lp.prefix, reservedMax + 1, idCounters.lp.digits);
    await fs.writeFile(intakeReservationsPath, JSON.stringify(reservations, null, 2) + "\n");
    await fs.writeFile(idCountersPath, JSON.stringify(idCounters, null, 2) + "\n");
  }

  console.log(`Extracted ${candidates.length} LP Archive candidates.`);
  console.log(`Output: ${outputPath}`);
  if (shouldReserveIds && candidates.length > 0) {
    console.log(`Reserved LP IDs: ${summary.idStart} - ${summary.idEnd}`);
  }
} finally {
  await page.close();
  await browser.close();
}
