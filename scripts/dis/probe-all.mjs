#!/usr/bin/env node
/**
 * 全参照元の到達性チェック（読み取りのみ・外部書込みなし）。
 *   npm run dis:probe-all [-- --include-disabled] [--only lp,web,banner] [--json out.json]
 * 各ソースにつき、robots.txt → 一覧ページ → 詳細リンク抽出 → 詳細ページ1件 を順に試し、結果を1表にまとめる。
 * 403/429/robots禁止などは「見えない」として記録するだけで、回避しない。サイト負荷を避けるため直列＋待機。
 */
import fs from "node:fs/promises";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./lib/config.mjs";
import { fetchGetter, extractDetailLinks, extractRdlpCards } from "./lib/collect.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 1ソースを診断して { status, note, links } を返す。getter を差し替えればテスト可能。 */
export async function probeSource(src, getter = fetchGetter()) {
  const out = { key: src.key, media: src.media, enabled: src.enabled !== false, url: src.listUrl, listStatus: "-", links: 0, detailStatus: "-", verdict: "", note: "" };
  try {
    if (!(await getter.robots(src.listUrl))) { out.verdict = "見えない"; out.note = "robots.txtで禁止"; return out; }
    const res = await getter.get(src.listUrl);
    if (!res.ok) { out.listStatus = `HTTP ${res.status}`; out.verdict = "見えない"; out.note = res.status === 403 || res.status === 429 ? "自動取得を拒否（回避しない）" : "一覧を取得できない"; return out; }
    out.listStatus = "OK";
    const links = src.parser === "rdlp" ? extractRdlpCards(res.text, src.listUrl, 20).map((c) => c.url) : extractDetailLinks(res.text, src, 20);
    out.links = links.length;
    if (!links.length) { out.verdict = "要調整"; out.note = "一覧は見えるが作品リンクを抽出できない（抽出ルールの見直し／JS描画の可能性）"; return out; }
    if (!(await getter.robots(links[0]))) { out.detailStatus = "robots禁止"; out.verdict = "見えない"; out.note = "詳細ページがrobots.txtで禁止"; return out; }
    const d = await getter.get(links[0]);
    out.detailStatus = d.ok ? "OK" : `HTTP ${d.status}`;
    out.verdict = d.ok ? "見える" : "見えない";
    if (!d.ok) out.note = "詳細ページを拒否（回避しない）";
  } catch (e) { out.verdict = "見えない"; out.note = `通信エラー: ${e.message}`.slice(0, 80); }
  return out;
}

export function formatTable(rows) {
  const head = ["ソース", "媒体", "設定", "一覧", "リンク数", "詳細", "判定", "メモ"];
  const body = rows.map((r) => [r.key, r.media, r.enabled ? "有効" : "無効", r.listStatus, String(r.links), r.detailStatus, r.verdict, r.note]);
  return [head, ...body].map((c) => c.join(" | ")).join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { "include-disabled": { type: "boolean", default: false }, only: { type: "string" }, json: { type: "string" }, delay: { type: "string", default: "1500" } } });
  const cfg = await loadConfig();
  const only = values.only ? values.only.split(",") : null;
  const list = cfg.sources.filter((s) => (values["include-disabled"] || s.enabled !== false) && (!only || only.includes(s.media)));
  const getter = fetchGetter();
  const rows = [];
  for (const s of list) { rows.push(await probeSource(s, getter)); console.error(`… ${s.key}: ${rows.at(-1).verdict}`); await sleep(Number(values.delay)); }
  console.log("\n" + formatTable(rows));
  const n = (v) => rows.filter((r) => r.verdict === v).length;
  console.log(`\n見える ${n("見える")} / 要調整 ${n("要調整")} / 見えない ${n("見えない")}（全${rows.length}件）`);
  if (values.json) { await fs.writeFile(values.json, JSON.stringify({ at: new Date().toISOString(), rows }, null, 2) + "\n"); console.log(`保存: ${values.json}`); }
}
