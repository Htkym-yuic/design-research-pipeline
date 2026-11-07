#!/usr/bin/env node
/**
 * 参照元の構造診断（読み取りのみ・外部書込みなし）。個別ページのURL形式と、実ページへのリンクの位置を要約して表示する。
 *   node scripts/dis/probe.mjs --source io3000 [--details 2]
 * robots.txt は尊重し、403等は回避しない。出力はサイトのHTMLそのものではなく、リンクの構造の要約のみ。
 */
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./lib/config.mjs";
import { fetchGetter, extractDetailLinks } from "./lib/collect.mjs";

/** 内部リンクのパスを「先頭2階層＋*」に集約して件数と例を返す。 */
export function summarizeListLinks(html, listUrl, topN = 8) {
  const origin = new URL(listUrl).origin;
  const groups = new Map();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>/gi)) {
    let u; try { u = new URL(m[1], listUrl); } catch { continue; }
    if (u.origin !== origin) continue;
    const segs = u.pathname.split("/").filter(Boolean);
    const key = "/" + (segs.length <= 1 ? segs.join("/") : segs.slice(0, -1).join("/") + "/*") + (u.pathname.endsWith("/") && segs.length ? "/" : "");
    const g = groups.get(key) || { count: 0, examples: new Set() };
    g.count++; if (g.examples.size < 2) g.examples.add(u.pathname);
    groups.set(key, g);
  }
  return [...groups.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, topN).map(([k, v]) => ({ pattern: k, count: v.count, examples: [...v.examples] }));
}

/** 詳細ページの外部リンク（ホスト・リンク文字・class）の要約。 */
export function summarizeOutbound(html, pageUrl, max = 8) {
  const host = new URL(pageUrl).hostname;
  const out = [];
  for (const m of html.matchAll(/<a\b([^>]*)href=["'](https?:\/\/[^"']+)["']([^>]*)>([\s\S]{0,120}?)<\/a>/gi)) {
    let h; try { h = new URL(m[2]).hostname; } catch { continue; }
    if (h === host) continue;
    const cls = (m[1] + m[3]).match(/class=["']([^"']*)["']/i)?.[1] || "";
    const text = m[4].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 30);
    out.push({ host: h, text, class: cls.slice(0, 40), query: new URL(m[2]).search ? "query付き" : "" });
    if (out.length >= max) break;
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { source: { type: "string" }, details: { type: "string", default: "2" } } });
  const cfg = await loadConfig();
  const src = cfg.sources.find((s) => s.key === values.source);
  if (!src) { console.error(`不明なsource。選べる値: ${cfg.sources.map((s) => s.key).join(", ")}`); process.exit(1); }
  const getter = fetchGetter();
  console.log(`== ${src.key} ${src.listUrl} (termsStatus=${src.termsStatus})`);
  if (!(await getter.robots(src.listUrl))) { console.log("robots.txtで禁止。終了"); process.exit(0); }
  const res = await getter.get(src.listUrl);
  if (!res.ok) { console.log(`取得失敗 HTTP ${res.status}（回避しない）`); process.exit(0); }
  console.log("-- 内部リンクのパターン（件数順）");
  for (const g of summarizeListLinks(res.text, src.listUrl)) console.log(`  ${String(g.count).padStart(4)}  ${g.pattern}   例: ${g.examples.join(" , ")}`);
  const links = extractDetailLinks(res.text, src, 20).slice(0, Number(values.details));
  console.log(`-- 現在の抽出ルールで取れた詳細リンク: ${extractDetailLinks(res.text, src, 20).length}件`);
  for (const u of links) {
    const r = await getter.get(u);
    console.log(`-- 詳細 ${u} → ${r.ok ? "OK" : "HTTP " + r.status}`);
    if (!r.ok) continue;
    console.log(`   title: ${(r.text.match(/<title>([^<]*)/i)?.[1] || "").trim().slice(0, 60)}`);
    console.log(`   og:image: ${/property=["']og:image["']/i.test(r.text) ? "あり" : "なし"}`);
    for (const o of summarizeOutbound(r.text, u)) console.log(`   外部リンク: ${o.host}  文字「${o.text}」 class「${o.class}」 ${o.query}`);
  }
}
