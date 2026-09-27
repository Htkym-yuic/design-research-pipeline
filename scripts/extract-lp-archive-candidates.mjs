import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const idCountersPath = new URL("../data/id-counters.json", import.meta.url);
const idCounters = JSON.parse(await fs.readFile(idCountersPath, "utf8"));

const seenPostsPath = new URL("../data/lp-archive-seen-posts.json", import.meta.url);
async function loadSeenPosts() {
  try {
    const raw = JSON.parse(await fs.readFile(seenPostsPath, "utf8"));
    return raw.seenPostIds || {};
  } catch {
    return {};
  }
}
const seenPosts = await loadSeenPosts();

const sourceUrl = process.env.LP_ARCHIVE_SOURCE_URL || "https://rdlp.jp/lp-archive/";
const outputRoot = process.env.CANDIDATE_OUTPUT_DIR || "candidates/lp-archive";
const candidateLimit = Number.parseInt(process.env.CANDIDATE_LIMIT || "8", 10);
// LPアーカイブの一覧は新着順とは限らず、既に採用済みの投稿が上位に居座ることがある。
// 重複除外後もcandidateLimit件を確保できるよう、実際の一覧取得は多めに行う。
const fetchPoolSize = Math.max(candidateLimit * 5, 20);
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

await fs.mkdir(outputRoot, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ locale: "ja-JP" });

try {
  await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});

  const listingCandidatesPool = await page.$$eval(
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
    { limit: fetchPoolSize, baseUrl: sourceUrl }
  );

  // 既に採用済みの投稿（post_id）は候補から除外する。post_idが取れない場合は
  // 重複判定できないため、そのまま通す（誤って弾かないことを優先する）。
  const skippedAsDuplicate = listingCandidatesPool.filter(
    (candidate) => candidate.lpArchivePostId && seenPosts[candidate.lpArchivePostId],
  );
  const listingCandidates = listingCandidatesPool
    .filter((candidate) => !candidate.lpArchivePostId || !seenPosts[candidate.lpArchivePostId])
    .slice(0, candidateLimit);

  if (skippedAsDuplicate.length > 0) {
    console.log(
      `重複のため除外: ${skippedAsDuplicate
        .map((c) => `${c.title}（post_id=${c.lpArchivePostId} → ${seenPosts[c.lpArchivePostId]?.id}）`)
        .join(", ")}`,
    );
  }

  const candidates = [];

  for (const [index, candidate] of listingCandidates.entries()) {
    const suggestedId = formatId(idCounters.lp.prefix, nextLpNumber + index, idCounters.lp.digits);
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
  }

  const summary = {
    extractedAt: new Date().toISOString(),
    sourceUrl,
    sourceName: "LPアーカイブ",
    mediaType: "LP",
    requestedLimit: candidateLimit,
    candidateCount: candidates.length,
    idStart: formatId(idCounters.lp.prefix, nextLpNumber, idCounters.lp.digits),
    idEnd:
      candidates.length > 0
        ? formatId(idCounters.lp.prefix, nextLpNumber + candidates.length - 1, idCounters.lp.digits)
        : null,
    candidates
  };

  const outputPath = path.join(outputRoot, "candidates.json");
  await fs.writeFile(outputPath, JSON.stringify(summary, null, 2));

  if (shouldReserveIds && candidates.length > 0) {
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
    await fs.writeFile(idCountersPath, JSON.stringify(idCounters, null, 2) + "\n");

    // 今回採番した候補のpost_idを重複防止台帳へ記録する（次回以降の抽出で除外されるようにする）
    for (const candidate of candidates) {
      const postId = candidate.metadata?.lpArchivePostId;
      if (!postId) continue;
      seenPosts[postId] = { id: candidate.id, title: candidate.title, firstSeenAt: summary.extractedAt };
    }
    await fs.writeFile(
      seenPostsPath,
      JSON.stringify({ _comment: "LPアーカイブの投稿（post_id）単位の重複防止台帳。", seenPostIds: seenPosts }, null, 2) + "\n",
    );
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
