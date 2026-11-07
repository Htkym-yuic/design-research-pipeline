import fs from "node:fs/promises";
import path from "node:path";
import { readJson, REPO_ROOT } from "./config.mjs";

export function normalizeUrl(value) {
  if (!value) return null;
  try {
    const u = new URL(value);
    u.hash = "";
    u.hostname = u.hostname.replace(/^www\./, "");
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(k)) u.searchParams.delete(k);
    u.searchParams.sort();
    return `${u.hostname}${u.pathname}${u.search}`.replace(/\/$/, "").toLowerCase();
  } catch {
    return String(value).trim().replace(/\/$/, "").toLowerCase() || null;
  }
}

export function brandKey(value) {
  if (!value) return null;
  return String(value).normalize("NFKC").toLowerCase().replace(/[\s\-_|｜・:：.,、。'"’“”()（）\[\]【】]+/g, "").slice(0, 40) || null;
}

/** 既知エントリ集合。entries: {kind, id, url, brand, date, source} */
export class KnownIndex {
  constructor() {
    this.urls = new Map();
    this.brands = new Map(); // brandKey -> [{id,date,media}]
  }
  add({ id, url, brand, date, media, source }) {
    const nu = normalizeUrl(url);
    if (nu && !this.urls.has(nu)) this.urls.set(nu, { id, source });
    const bk = brandKey(brand);
    if (bk) {
      if (!this.brands.has(bk)) this.brands.set(bk, []);
      this.brands.get(bk).push({ id, date, media, source });
    }
  }
  /** 候補の重複を判定。URL一致は期間無関係に除外、ブランド一致は窓内のみ除外。 */
  check(candidate, { windowDays = 180, today = new Date().toISOString().slice(0, 10) } = {}) {
    for (const u of [candidate.pageUrl, candidate.detailUrl, candidate.sourceDetailUrl]) {
      const hit = this.urls.get(normalizeUrl(u));
      if (hit) return { duplicate: true, reason: "url", of: hit.id, source: hit.source };
    }
    const bk = brandKey(candidate.brand);
    const hits = bk ? this.brands.get(bk) : null;
    if (hits) {
      const limit = Date.parse(today) - windowDays * 86400000;
      const inWindow = hits.find((h) => !h.date || Date.parse(h.date) >= limit);
      if (inWindow) return { duplicate: true, reason: "brand-within-window", of: inWindow.id, source: inWindow.source };
    }
    return { duplicate: false };
  }
}

async function listJson(dir) {
  try {
    return (await fs.readdir(dir, { recursive: true })).filter((f) => f.endsWith(".json")).map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

/** リポジトリ内の既存データ＋任意のNotionスナップショットから既知インデックスを作る（読み取りのみ） */
export async function buildKnownIndex({ root = REPO_ROOT, ledger, notionSnapshot } = {}) {
  const idx = new KnownIndex();
  for (const [file, kind] of [
    ["candidates/lp-archive/candidates.json", "lp"],
    ["candidates/non-lp/candidates.json", null],
    ["candidates/lp-archive/intake-reservations.json", "lp"],
    ["candidates/non-lp/intake-reservations.json", null],
  ]) {
    const data = await readJson(path.join(root, file), {});
    const rows = [...(data.candidates || []), ...(data.skippedCandidates || []), ...(data.reserved || [])];
    for (const c of rows) {
      const media = kind || String(c.mediaType || "").toLowerCase();
      for (const url of [c.captureUrl, c.sourceDetailUrl, c.landingUrl]) idx.add({ id: c.id || c.duplicate?.duplicateOf, url, brand: c.title, date: c.collectedAt || data.collectedAt, media, source: file });
    }
  }
  for (const f of await listJson(path.join(root, "knowledge"))) {
    const k = await readJson(f, null);
    if (!k?.id) continue;
    for (const url of [k.captureUrl, k.sourceDetailUrl, k.source?.captured_url, k.source?.reference_detail_url]) idx.add({ id: k.id, url, brand: k.title || k.brand, date: k.capturedAt, source: path.relative(root, f) });
  }
  for (const f of await listJson(path.join(root, "deep-analysis"))) {
    if (!f.endsWith("metadata.json")) continue;
    const m = await readJson(f, null);
    if (!m?.id) continue;
    for (const url of [m.captureUrl, m.sourceDetailUrl, m.url]) idx.add({ id: m.id, url, brand: m.title, source: path.relative(root, f) });
  }
  for (const e of ledger?.entries || []) idx.add({ id: e.disId, url: e.pageUrl, brand: e.brand, date: e.date, media: e.media, source: "dis-ledger" });
  for (const n of notionSnapshot?.pages || []) idx.add({ id: n.id, url: n.url, brand: n.brand || n.title, date: n.capturedAt, media: n.media, source: "notion-snapshot" });
  return idx;
}
