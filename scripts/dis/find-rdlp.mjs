#!/usr/bin/env node
/**
 * 撮影キュー（data/dis-capture-queue.json）の実ページURLから、LPアーカイブ（rdlp）の紹介ページURLを探す（読み取りのみ）。
 *
 *   npm run dis:find-rdlp -- --list                 # 状態の一覧（実行しない）
 *   npm run dis:find-rdlp -- --limit 5              # 未確認のうち先頭5件を探す
 *   npm run dis:find-rdlp -- --update-queue         # 見つかったものを、撮影キューに反映（rdlpUrl・fromArchive）
 *
 * 探し方: 実ページのドメインなどをキーワードに rdlp の検索ページを開き、候補の紹介ページに載っている「実ページのURL」が、
 *         探しているURLと一致するものを採用する（一致しないものは採用しない）。
 * 守ること: robots.txt を確認する。リクエストの間隔をあける。403・429 が出たら、回避せず、全体を止める。
 * 結果: data/dis-rdlp-lookup.json（found／notfound／blocked）。見つかった紹介ページは、アーカイブ掲載の画像で撮影する。
 */
import fs from "node:fs";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { fetchGetter, extractRdlpCards, parseRdlpDetail } from "./lib/collect.mjs";

const QUEUE = "data/dis-capture-queue.json";
const LOOKUP = "data/dis-rdlp-lookup.json";
const SEARCH = (kw) => `https://rdlp.jp/lp-archive/search?sa=${encodeURIComponent(kw)}&lp_cat_active=1&lp_color_active=1&lp_image_active=1`;
const GENERIC = new Set(["www", "co", "com", "jp", "net", "org", "or", "ne", "ac", "go", "info", "shop", "store", "item", "travel", "brand", "lp", "s", "pages", "jp", "app"]);

/** URLの照合用の形（ホストのwww・パス末尾のスラッシュ・クエリ・ハッシュを除く）。 */
export function normalizeUrl(u) {
  try { const x = new URL(u); return `${x.hostname.replace(/^www\./, "").toLowerCase()}${x.pathname.replace(/\/+$/, "")}`; } catch { return null; }
}

/** 検索キーワードの案（先頭ほど絞れる）: 取得元ドメインの主な語 → パスの語。 */
export function keywordsFor(url) {
  const x = new URL(url);
  const labels = x.hostname.toLowerCase().split(".").filter((l) => !GENERIC.has(l));
  const out = [];
  for (const l of labels) if (l.length >= 3) out.push(l);
  const seg = x.pathname.split("/").filter((s) => s && !GENERIC.has(s) && !/^\d+$/.test(s) && !/\.(html?|php|jsp)$/i.test(s));
  for (const s of seg.slice(0, 2)) if (s.length >= 4) out.push(s);
  return [...new Set(out)].slice(0, 3);
}

/** 1件を探す。getter（get・robots）を差し替えればテストできる。 */
export async function findRdlpFor(target, { getter = fetchGetter(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), delayMs = 1500, maxDetail = 10 } = {}) {
  const want = normalizeUrl(target);
  let checked = 0;
  for (const kw of keywordsFor(target)) {
    const searchUrl = SEARCH(kw);
    if (!(await getter.robots(searchUrl))) return { status: "blocked", reason: "robots.txtで禁止されている", checked };
    await sleep(delayMs);
    const s = await getter.get(searchUrl);
    if (!s.ok) return { status: s.status === 403 || s.status === 429 ? "blocked" : "notfound", reason: `検索 HTTP ${s.status}（回避しません）`, checked };
    const cards = extractRdlpCards(s.text, searchUrl, maxDetail);
    for (const c of cards) {
      await sleep(delayMs);
      const d = await getter.get(c.url);
      checked++;
      if (!d.ok) { if (d.status === 403 || d.status === 429) return { status: "blocked", reason: `紹介ページ HTTP ${d.status}（回避しません）`, checked }; continue; }
      const real = parseRdlpDetail(d.text, c.url).pageUrl;
      if (real && normalizeUrl(real) === want) return { status: "found", rdlpUrl: c.url, keyword: kw, title: c.title, checked };
    }
  }
  return { status: "notfound", reason: "検索の候補に、同じ実ページURLの紹介ページがなかった", checked };
}

const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return fb; } };

async function main() {
  const { values } = parseArgs({ options: { list: { type: "boolean" }, limit: { type: "string" }, only: { type: "string" }, "update-queue": { type: "boolean" }, retry: { type: "boolean" } } });
  const queue = readJson(QUEUE, null);
  if (!queue) throw new Error(`${QUEUE} がありません。git pull してください`);
  const lookup = readJson(LOOKUP, { updatedAt: null, items: {} });
  const isRdlp = (u) => /^https:\/\/rdlp\.jp\//.test(u);
  const targets = queue.items.filter((it) => !isRdlp(it.url) && !it.rdlpUrl);
  const st = (u) => lookup.items[u]?.status || "pending";
  if (values.list) {
    for (const it of queue.items) console.log(`${(it.rdlpUrl ? "queue済" : isRdlp(it.url) ? "rdlp" : st(it.url)).padEnd(9)} ${it.url}${lookup.items[it.url]?.rdlpUrl ? "  →  " + lookup.items[it.url].rdlpUrl : ""}`);
    return;
  }
  if (values["update-queue"]) {
    let n = 0;
    for (const it of queue.items) {
      const r = lookup.items[it.url];
      if (r?.status === "found" && !it.rdlpUrl) { it.rdlpUrl = r.rdlpUrl; it.fromArchive = true; it.note = "rdlpの紹介ページが見つかったため、アーカイブ掲載の画像で撮影（実ページURLは参考）"; n++; }
    }
    fs.writeFileSync(QUEUE, JSON.stringify(queue, null, 1) + "\n");
    console.log(`撮影キューに ${n} 件を反映しました`);
    return;
  }
  let todo = targets.filter((it) => st(it.url) === "pending" || (values.retry && ["notfound", "blocked"].includes(st(it.url))));
  if (values.only) todo = todo.filter((it) => it.url.includes(values.only));
  if (values.limit) todo = todo.slice(0, Number(values.limit));
  console.log(`対象 ${todo.length} 件（読み取りのみ）`);
  for (const it of todo) {
    console.log(`\n== ${it.url}`);
    const r = await findRdlpFor(it.url);
    console.log(r.status === "found" ? `  見つかった: ${r.rdlpUrl}（${r.title || ""}）` : `  ${r.status}: ${r.reason}（確認 ${r.checked} 件）`);
    lookup.items[it.url] = { ...r, checkedAt: new Date().toISOString() };
    lookup.updatedAt = new Date().toISOString();
    fs.writeFileSync(LOOKUP, JSON.stringify(lookup, null, 1) + "\n");
    if (r.status === "blocked") { console.log("\nアクセスが拒否されたため、ここで止めます（回避しません）"); break; }
  }
  const c = {}; for (const it of targets) c[st(it.url)] = (c[st(it.url)] || 0) + 1;
  console.log("\n状態:", JSON.stringify(c));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
