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
export function extractDetailLinks(html, source, limit = 8) {
  const seen = new Set();
  const out = [];
  const origin = new URL(source.listUrl).origin;
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>/gi)) {
    const url = abs(m[1], source.listUrl);
    if (!url || !url.startsWith(origin)) continue;
    const p = new URL(url).pathname;
    if (!p.includes(source.detailPathIncludes) || p === new URL(source.listUrl).pathname || /\.(jpg|png|gif|svg|css|js)$/i.test(p) || /\/(page|tag|category|author)\//.test(p)) continue;
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

/** ライブ収集。fetchImpl を差し替えればテスト可能。失敗は fetchError に格納して継続。 */
export async function collectFromSource(source, { fetchImpl = fetch, detailLimit = 3 } = {}) {
  const base = { media: source.media, sourceKey: source.key, sourceName: source.name, termsStatus: source.termsStatus };
  try {
    if (!(await robotsAllows(source.listUrl, fetchImpl))) return [{ ...base, fetchError: "robots.txtで禁止" }];
    const res = await fetchImpl(source.listUrl, { headers: { "User-Agent": UA } });
    if (!res.ok) return [{ ...base, fetchError: `HTTP ${res.status}（回避しない）` }];
    const links = extractDetailLinks(await res.text(), source, detailLimit);
    const results = [];
    for (const detailUrl of links) {
      try {
        const r = await fetchImpl(detailUrl, { headers: { "User-Agent": UA } });
        if (!r.ok) { results.push({ ...base, sourceDetailUrl: detailUrl, fetchError: `HTTP ${r.status}` }); continue; }
        const d = parseDetail(await r.text(), detailUrl);
        results.push({ ...base, sourceDetailUrl: detailUrl, brand: d.title, title: d.title, pageUrl: d.pageUrl, imageUrl: d.image, signals: heuristicSignals(d) });
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
