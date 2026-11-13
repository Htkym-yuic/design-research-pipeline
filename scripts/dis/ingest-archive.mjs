#!/usr/bin/env node
/**
 * ライブラリーにある「軽量分析のみ」のLP（LP-0216 など）を、DISの案件フォルダに取り込む。
 *   - 手元（Dropbox同期フォルダ）の metadata.json の archiveAssets から、PC・SPの全体画像を、LPアーカイブ（rdlp）から取得する（読み取りのみ。Dropbox・Notionには書かない）
 *   - DISの連番IDを振り、ライブラリー番号と対応づける（data/dis-relations.json に追記）
 *   - outputs/dis/LP/<連番>_<日付>_<名前>/ に、撮影時と同じファイル一式と、分析・注釈のテンプレートを作る
 *   node scripts/dis/ingest-archive.mjs --lp LP-0216 --meta "<metadata.json のパス>"
 * 旧ライブラリー用の ingest-library.mjs とは別。既存のスクリプトは変更しない。
 */
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { loadConfig, REPO_ROOT } from "./lib/config.mjs";
import { formatDisId, nextSerial, reservedIdsFromOutputs } from "./lib/ids.mjs";
import { itemRelDir, reservedFromLibrary } from "./lib/library.mjs";
import { buildSetFromBuffers } from "./lib/capture.mjs";
import { emptyAnalysis } from "./lib/analysis-schema.mjs";
import { emptyAnnotations } from "./lib/annotations.mjs";
import { MANUAL_REASON_PLACEHOLDER } from "./lib/review.mjs";
import { planReservation } from "./reserve-library-id.mjs";
import { updateJson } from "./lib/lock.mjs";

const readJson = async (f, d = null) => { try { return JSON.parse(await fs.readFile(f, "utf8")); } catch { return d; } };

async function download(url) {
  if (!/^https:\/\/rdlp\.jp\/image\/lp-archive\//.test(url)) throw new Error(`rdlp の画像URL以外は取得しません: ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`画像を取得できません（${res.status}）: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function ingestArchiveLp({ lp, metaPath, root = REPO_ROOT, date = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10) }) {
  if (!/^LP-\d{3,4}$/.test(lp)) throw new Error(`--lp は LP-0216 の形式です: ${lp}`);
  const meta = await readJson(metaPath);
  if (!meta || meta.id !== lp) throw new Error(`metadata.json の id が ${lp} と一致しません（${meta?.id}）`);
  const pcUrl = meta.archiveAssets?.pcImageUrls?.[0];
  const spUrl = meta.archiveAssets?.spImageUrls?.[0];
  if (!pcUrl && !spUrl) throw new Error(`${lp}: archiveAssets に全体画像のURLがありません`);
  const cfg = await loadConfig();
  const f = (p) => path.join(root, p);
  const outDir = f("outputs/dis");
  const relations = await readJson(f("data/dis-relations.json"), { schemaVersion: "dis-relations-1.0", relations: [] });
  const dup = relations.relations.find((r) => r.libraryId === lp && r.relation !== "reserved_for_library");
  if (dup) throw new Error(`${lp} は、すでに ${dup.disId} と対応づけられています（${dup.relation}）。重複して取り込みません`);

  const brand = String(meta.title || lp).trim();
  const ledger = await readJson(f("data/dis-ledger.json"), { entries: [] });
  const reserved = [...(await reservedIdsFromOutputs(outDir, "lp")), ...(await reservedFromLibrary(outDir, cfg, "lp"))];
  const disId = formatDisId(cfg.idPrefix, cfg.media.lp.idCode, nextSerial({ ledgerEntries: ledger.entries, reservedIds: reserved, prefix: cfg.idPrefix, code: cfg.media.lp.idCode }));
  const itemDir = path.join(outDir, itemRelDir(cfg, "lp", { disId, date, brand }));

  const images = {};
  if (pcUrl) images.pc = await download(pcUrl);
  if (spUrl) images.sp = await download(spUrl);
  const files = await buildSetFromBuffers(path.join(itemDir, "files"), disId, images, { note: `LPアーカイブ（rdlp）掲載の全体画像から作成（${lp}。実ページの動き・文言・最新状態は未確認）` });
  await fs.writeFile(path.join(itemDir, "files.json"), JSON.stringify(files.map(({ local, rel }) => ({ local, rel })), null, 2) + "\n");

  const m = meta.metadata || {};
  const item = { disId, media: "lp", date, mode: "ライブラリー（軽量分析のみ）", brand: `${brand}のLPデザイン`.replace(/のLPデザイン(のLPデザイン)+$/, "のLPデザイン"), pageUrl: meta.captureUrl || null, sourceDetailUrl: meta.sourceDetailUrl || null, sourceName: "LPアーカイブ", libraryId: lp, rdlpId: m.lpArchivePostId || null, captureMode: "archive", devices: [pcUrl && "pc", spUrl && "sp"].filter(Boolean), source: { company: m.company || null, category: m.category || null, tasteTag: m.tasteTag || null } };
  await fs.writeFile(path.join(itemDir, "item.json"), JSON.stringify(item, null, 2) + "\n");
  const a = emptyAnalysis({ media: "lp", disId, pageUrl: item.pageUrl || "AUTO", brand: item.brand, captureSource: `アーカイブ掲載の全体画像（${lp}。実ページは未確認）`, selectionReason: `${MANUAL_REASON_PLACEHOLDER}（ユーザーが選定。ライブラリー ${lp}（軽量分析のみ）を、DISの9軸と28章で詳細分析。画像は、LPアーカイブ掲載の全体画像）` });
  a.sourceAnalysisRef = `ライブラリー ${lp} の軽量分析（Notion）。内容は引き継がず、画像から新規に分析する`;
  await fs.writeFile(path.join(itemDir, "analysis.json"), JSON.stringify(a, null, 2) + "\n");
  await fs.writeFile(path.join(itemDir, "annotations.json"), JSON.stringify(emptyAnnotations(a), null, 2) + "\n");

  const counters = await readJson(f("data/id-counters.json"));
  const plan = planReservation({ disId, mode: "same", sameAs: lp, sourceUrl: item.sourceDetailUrl, ledgerEntry: { pageUrl: item.pageUrl, brand: item.brand, notion: {} }, counters, relations, reservations: { reserved: [] } });
  await updateJson(f("data/dis-relations.json"), { schemaVersion: "dis-relations-1.0", relations: [] }, (cur) => { cur.relations.push(plan.relationsAdd); return cur; });
  return { disId, lp, itemDir, brand: item.brand, pageUrl: item.pageUrl, devices: item.devices, warnings: files.warnings };
}

async function main() {
  const { values } = parseArgs({ options: { lp: { type: "string" }, meta: { type: "string" }, date: { type: "string" } } });
  if (!values.lp || !values.meta) throw new Error("--lp（例: LP-0216）と --meta（metadata.json のパス）が必要です");
  const r = await ingestArchiveLp({ lp: values.lp, metaPath: values.meta, ...(values.date ? { date: values.date } : {}) });
  console.log(JSON.stringify({ ...r, next: [`画像を読んで ${r.itemDir}/analysis.json と annotations.json を書く`, `npm run dis:validate-item -- --id ${r.disId}`, `npm run dis:crop-units -- --id ${r.disId}`, `npm run dis:cbs-draft -- --id ${r.disId}（28章の下書き）`] }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
