import fs from "node:fs/promises";

const UA = "design-research-pipeline-dis/1.0 (public-pages-only)";

function abs(href, base) { try { return new URL(href, base).toString(); } catch { return null; } }
function meta(html, prop) {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, "i")) ||
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, "i"));
  return m?.[1]?.trim() || null;
}

/** robots.txt で禁止されていれば取得しない（簡易判定: User-agent:* の Disallow 前方一致）。 */
export async function robotsAllows(url, fetchImpl = fetch) {
  try {
    const u = new URL(url);
    const r = await fetchImpl(`${u.origin}/robots.txt`, { headers: { "User-Agent": UA } });
    if (!r.ok) return true;
    let applies = false;
    for (const line of (await r.text()).split(/\r?\n/)) {
      const [k, ...rest] = line.split("#")[0].split(":");
      const v = rest.join(":").trim();
      if (/^user-agent$/i.test(k.trim())) applies = v === "*";
      else if (applies && /^disallow$/i.test(k.trim()) && v && u.pathname.startsWith(v)) return false;
    }
    return true;
  } catch { return true; }
}

/** 一覧ページから詳細URL候補を抽出（公開ページのみ・1ソース1リクエスト＋詳細は最大N件）。 */
const NAV_WORDS = /^\/(about|contact|privacy|policy|terms|rules|faq|news|info|company|search|login|signup|register|feed|rss|sitemap|tag|tags|category|categories|author|page|archive|archives\/?$|ranking|submit|advertise|ad)(\/|$)/i;

/** 一覧ページから詳細URL候補を抽出。detailPathRegex があればそれを優先（精度が高い）。無ければ detailPathIncludes ＋ ナビ/カテゴリ除外。 */
export function extractDetailLinks(html, source, limit = 8) {
  const seen = new Set();
  const out = [];
  const origin = new URL(source.listUrl).origin;
  const listPath = new URL(source.listUrl).pathname;
  const re = source.detailPathRegex ? new RegExp(source.detailPathRegex) : null;
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>/gi)) {
    const url = abs(m[1], source.listUrl);
    if (!url || !url.startsWith(origin)) continue;
    const p = new URL(url).pathname;
    if (p === listPath || p === "/" || /\.(jpg|jpeg|png|gif|svg|webp|css|js|pdf)$/i.test(p)) continue;
    if (re) { if (!re.test(p)) continue; }
    else if (!p.includes(source.detailPathIncludes) || NAV_WORDS.test(p) || /\/(page|tag|category|author)\//.test(p)) continue;
    if (seen.has(url)) continue;
    seen.add(url); out.push(url);
    if (out.length >= limit) break;
  }
  return out;
}

/** 詳細ページから title / 画像 / 実ページURL(outbound) を抽出。 */
export function parseDetail(html, detailUrl) {
  const title = meta(html, "og:title") || html.match(/<title>([^<]+)/i)?.[1]?.trim() || null;
  const image = abs(meta(html, "og:image") || "", detailUrl);
  const host = new URL(detailUrl).hostname;
  const outbound = [...html.matchAll(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>/gi)]
    .map((m) => m[1]).filter((u) => { try { return new URL(u).hostname !== host && !/(twitter|facebook|instagram|line\.me|google|pinterest|youtube|hatena)\./.test(u); } catch { return false; } });
  return { title, image, pageUrl: outbound[0] || null };
}

const attr = (tag, name) => tag.match(new RegExp(`${name}=["']([^"']*)["']`, "i"))?.[1] ?? null;
const stripTags = (h) => h.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

/** LPアーカイブ一覧: .lp-card.lp-show-wrap のカードだけを対象に、個別ページURL・タイトル・投稿IDを取る（カテゴリ/タグ一覧は対象外）。 */
export function extractRdlpCards(html, listUrl, limit = 8) {
  const chunks = html.split(/(?=<[^>]+class=["'][^"']*\blp-card\b[^"']*\blp-show-wrap\b)/).slice(1);
  const out = [];
  for (const chunk of chunks) {
    const block = chunk.slice(0, 4000);
    const anchor = block.match(/lp-card-(?:img|label)[^>]*>\s*<a\b[^>]*>/i)?.[0] || block.match(/<a\b[^>]*href=[^>]*>/i)?.[0];
    const url = anchor ? abs(attr(anchor, "href"), listUrl) : null;
    if (!url) continue;
    const label = block.match(/lp-card-label[^>]*>([\s\S]*?)<\/div>/i)?.[1];
    const title = (label && stripTags(label)) || attr(block.match(/<img\b[^>]*>/i)?.[0] || "", "alt") || null;
    const postId = block.match(/<input[^>]*name=["']post_id["'][^>]*>/i);
    const company = stripTags(block.match(/class=["']company["'][^>]*>([\s\S]*?)<\//i)?.[1] || "") || null;
    out.push({ url, title, postId: postId ? attr(postId[0], "value") : null, company });
    if (out.length >= limit) break;
  }
  return [...new Map(out.map((o) => [o.url, o])).values()];
}

/** LPアーカイブ詳細: a.url_check の href が実LPのURL。 */
export function parseRdlpDetail(html, detailUrl) {
  const anchors = [...html.matchAll(/<a\b[^>]*>/gi)].map((m) => m[0]).filter((t) => /class=["'][^"']*\burl_check\b/i.test(t));
  const pageUrl = anchors.map((t) => abs(attr(t, "href"), detailUrl)).find(Boolean) || null;
  const firstImg = html.match(/class=["'][^"']*url_check[^"']*["'][^>]*>\s*<img\b[^>]*>/i)?.[0].match(/<img\b[^>]*>/i)?.[0];
  const image = abs((firstImg && attr(firstImg, "src")) || meta(html, "og:image") || "", detailUrl);
  return { title: meta(html, "og:title"), image, pageUrl };
}

/** 通常のfetchによるページ取得。{ok,status,text}。403等はそのまま失敗扱い（回避しない）。 */
export function fetchGetter(fetchImpl = fetch) {
  return {
    async get(url) {
      const r = await fetchImpl(url, { headers: { "User-Agent": UA } });
      return { ok: r.ok, status: r.status, text: r.ok ? await r.text() : "" };
    },
    robots: (url) => robotsAllows(url, fetchImpl),
  };
}

/** ライブ収集。getter を差し替えればテスト可能。失敗は fetchError に格納して継続。 */
export async function collectFromSource(source, { getter = fetchGetter(), detailLimit = 3 } = {}) {
  const base = { media: source.media, sourceKey: source.key, sourceName: source.name, termsStatus: source.termsStatus };
  try {
    if (!(await getter.robots(source.listUrl))) return [{ ...base, fetchError: "robots.txtで禁止" }];
    const res = await getter.get(source.listUrl);
    if (!res.ok) return [{ ...base, fetchError: `HTTP ${res.status}（回避しない）` }];
    const rdlp = source.parser === "rdlp";
    const cards = rdlp ? extractRdlpCards(res.text, source.listUrl, detailLimit) : extractDetailLinks(res.text, source, detailLimit).map((url) => ({ url }));
    const results = [];
    for (const card of cards) {
      const detailUrl = card.url;
      try {
        const r = await getter.get(detailUrl);
        if (!r.ok) { results.push({ ...base, sourceDetailUrl: detailUrl, fetchError: `HTTP ${r.status}` }); continue; }
        const d = rdlp ? parseRdlpDetail(r.text, detailUrl) : parseDetail(r.text, detailUrl);
        const title = card.title || d.title;
        results.push({ ...base, sourceDetailUrl: detailUrl, brand: card.company || title, title, archivePostId: card.postId ?? null, pageUrl: d.pageUrl, imageUrl: d.image, signals: heuristicSignals(d) });
      } catch (e) { results.push({ ...base, sourceDetailUrl: detailUrl, fetchError: e.message }); }
    }
    return results;
  } catch (e) {
    return [{ ...base, fetchError: e.message }];
  }
}

/** 機械的に判定できる指標のみ。learningValue は未判定（0.5）で、最終判断はClaudeが候補レビューで上書きする。 */
export function heuristicSignals(d) {
  return { learningValue: 0.5, freshness: 0.7, originalSource: d.pageUrl ? 1 : 0, assetsAvailable: d.image ? 1 : 0.3, rightsClarity: 0.5 };
}

export async function loadFixture(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}
