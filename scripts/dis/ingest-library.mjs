#!/usr/bin/env node
/**
 * 旧ライブラリーのLP（LP-0002 など）を、DISの案件フォルダに取り込む。
 *   - Dropboxから、PC・SPの全体画像と、元の記録（source-record.json）を「読み取るだけ」（Dropbox・Notionには書かない）
 *   - DISの連番ID（DIS-LP-000n）を振り、ライブラリー番号と対応づける（data/dis-relations.json に追記）
 *   - outputs/dis/LP/<連番>_<日付>_<名前>/ に、撮影時と同じファイル一式と、分析・注釈のテンプレートを作る
 *   node scripts/dis/ingest-library.mjs --lp LP-0002
 * 旧ライブラリーのフォルダ: /Research_Library/Design/LP_Research_Library/01_By_Date/<日付>/LP/All_LP_001-180/LP-nnnn_名前/
 *   00_Metadata/source-record.json、01_PC/01_Full_Page/、02_SP/01_Full_Page/
 */
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { loadConfig, REPO_ROOT } from "./lib/config.mjs";
import { loadLedger } from "./lib/ledger.mjs";
import { formatDisId, nextSerial, reservedIdsFromOutputs } from "./lib/ids.mjs";
import { itemRelDir, reservedFromLibrary } from "./lib/library.mjs";
import { buildSetFromBuffers } from "./lib/capture.mjs";
import { emptyAnalysis } from "./lib/analysis-schema.mjs";
import { emptyAnnotations } from "./lib/annotations.mjs";
import { MANUAL_REASON_PLACEHOLDER } from "./lib/review.mjs";
import { planReservation } from "./reserve-library-id.mjs";
import { updateJson } from "./lib/lock.mjs";

export const OLD_LIBRARY_ROOT = "/Research_Library/Design/LP_Research_Library/01_By_Date";
const IMG = /\.(jpe?g|png|webp)$/i;
const readJson = async (f, d = null) => { try { return JSON.parse(await fs.readFile(f, "utf8")); } catch { return d; } };

/** 旧ライブラリーの、LPフォルダを探す（名前が `LP-nnnn_` で始まるフォルダ）。 */
export async function findLibraryFolder(dbx, lp) {
  // フォルダ名は、LP-0201_ のように4桁のものと、LP-181_ のように3桁のものがある（LP-0181〜0200の一部）
  const short = `LP-${Number(lp.slice(3))}_`;
  const names = [...new Set([`${lp}_`, short])];
  const found = [];
  for (const nm of names) found.push(...(await dbx.searchNames(nm, OLD_LIBRARY_ROOT)).filter((e) => e.tag === "folder" && e.name.startsWith(nm)));
  const hits = [...new Map(found.map((e) => [e.path, e])).values()];
  if (!hits.length) throw new Error(`旧ライブラリーに ${lp} のフォルダが見つかりません（${OLD_LIBRARY_ROOT} 配下を検索）`);
  if (hits.length > 1) throw new Error(`${lp} のフォルダが複数あります。どれか確認してください: ${hits.map((h) => h.path).join(" / ")}`);
  return hits[0];
}

async function pickImage(dbx, dir) {
  let list = [];
  try { list = (await dbx.listFolder(dir)).filter((e) => e.tag === "file" && IMG.test(e.name)); } catch { return null; }
  if (!list.length) return null;
  list.sort((a, b) => Number(/full/i.test(b.name)) - Number(/full/i.test(a.name)) || (b.size || 0) - (a.size || 0));
  return list[0];
}

/** 元の記録（source-record.json）から、名前・実LPのURL・掲載元の詳細URLを取り出す。 */
export function parseSourceRecord(rec = {}) {
  const info = rec.info || {};
  const realUrl = Object.entries(info).find(([k, v]) => /^登録日/.test(k) && /^https?:\/\//.test(String(v)))?.[1] || null;
  const heading = String(rec.heading || rec.title || "").replace(/｜.*$/, "").trim();
  return { brand: heading, pageUrl: realUrl || rec.canonical_url || rec.url || null, sourceDetailUrl: rec.canonical_url || rec.url || null, rdlpId: rec.rdlp_id || null, company: info["企業名"] || null, product: info["商品・サービス名"] || null, category: info["カテゴリー"] || null, catchCopy: info["キャッチコピー"] || null };
}

export async function ingestLibraryLp({ lp, dbx, folderPath = null, root = REPO_ROOT, date = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10) }) {
  if (!/^LP-\d{3,4}$/.test(lp)) throw new Error(`--lp は LP-0002 の形式です: ${lp}`);
  const cfg = await loadConfig();
  const f = (p) => path.join(root, p);
  const outDir = f("outputs/dis");
  const relations = await readJson(f("data/dis-relations.json"), { schemaVersion: "dis-relations-1.0", relations: [] });
  const dup = relations.relations.find((r) => r.libraryId === lp && r.relation !== "reserved_for_library");
  if (dup) throw new Error(`${lp} は、すでに ${dup.disId} と対応づけられています（${dup.relation}）。重複して取り込みません`);

  // 1. 旧ライブラリーのフォルダと、元の記録（読み取りのみ）
  // 名前の検索で見つからないときは、Notionの「保存先」などで分かっているフォルダを --folder で指定できる（読み取りのみ）
  const folder = folderPath ? { path: folderPath, name: folderPath.split("/").pop() } : await findLibraryFolder(dbx, lp);
  const rec = parseSourceRecord(JSON.parse((await dbx.downloadFile(`${folder.path}/00_Metadata/source-record.json`).catch(() => Buffer.from("{}"))).toString("utf8")));
  const pc = await pickImage(dbx, `${folder.path}/01_PC/01_Full_Page`);
  const sp = await pickImage(dbx, `${folder.path}/02_SP/01_Full_Page`);
  if (!pc && !sp) throw new Error(`${lp}: 全体画像が見つかりません（01_PC/01_Full_Page・02_SP/01_Full_Page）。${folder.path}`);
  const brand = rec.brand || folder.name.replace(/^LP-\d+_/, "");

  // 2. DISの連番ID（ライブラリー番号と、フォルダ名の連番の予約を避ける）
  const ledger = await readJson(f("data/dis-ledger.json"), { entries: [] });
  const reserved = [...(await reservedIdsFromOutputs(outDir, "lp")), ...(await reservedFromLibrary(outDir, cfg, "lp"))];
  const disId = formatDisId(cfg.idPrefix, cfg.media.lp.idCode, nextSerial({ ledgerEntries: ledger.entries, reservedIds: reserved, prefix: cfg.idPrefix, code: cfg.media.lp.idCode }));
  const itemDir = path.join(outDir, itemRelDir(cfg, "lp", { disId, date, brand }));

  // 3. 画像一式（撮影・アーカイブ取得と同じ形）
  const images = {};
  if (pc) images.pc = await dbx.downloadFile(pc.path);
  if (sp) images.sp = await dbx.downloadFile(sp.path);
  const files = await buildSetFromBuffers(path.join(itemDir, "files"), disId, images, { note: `旧ライブラリー（${lp}）のアーカイブ掲載の全体画像から作成（実ページの動き・文言・最新状態は未確認）` });
  await fs.writeFile(path.join(itemDir, "files.json"), JSON.stringify(files.map(({ local, rel }) => ({ local, rel })), null, 2) + "\n");

  // 旧分析（最新版）の複製。比較（existingAnalysisComparison）の参考にするだけで、内容は引き継がない（読み取りのみ）
  let legacy = null;
  try {
    const cands = (await dbx.listFolder(`${folder.path}/03_Analysis`)).filter((e) => e.tag === "file" && /full_analysis_v(\d+)/.test(e.name)).sort((a, b) => Number(/_v(\d+)/.exec(b.name)?.[1]) - Number(/_v(\d+)/.exec(a.name)?.[1]));
    if (cands[0]) { await fs.writeFile(path.join(itemDir, "legacy-analysis.md"), await dbx.downloadFile(cands[0].path)); legacy = cands[0].path; }
  } catch { /* 旧分析がなくても、取り込みは続ける */ }

  // 4. 案件の情報・分析と注釈のテンプレート
  const item = { disId, media: "lp", date, mode: "ライブラリー（旧）", brand: `${brand}のLPデザイン`.replace(/のLPデザイン(のLPデザイン)+$/, "のLPデザイン"), pageUrl: rec.pageUrl, sourceDetailUrl: rec.sourceDetailUrl, sourceName: "LPアーカイブ", libraryId: lp, libraryDropboxPath: folder.path, legacyAnalysisPath: legacy, rdlpId: rec.rdlpId, captureMode: "archive", devices: [pc && "pc", sp && "sp"].filter(Boolean), source: { company: rec.company, product: rec.product, category: rec.category, catchCopy: rec.catchCopy } };
  await fs.writeFile(path.join(itemDir, "item.json"), JSON.stringify(item, null, 2) + "\n");
  const a = emptyAnalysis({ media: "lp", disId, pageUrl: item.pageUrl || "AUTO", brand: item.brand, captureSource: `アーカイブ掲載の全体画像（旧ライブラリー ${lp}。実ページは未確認）`, selectionReason: `${MANUAL_REASON_PLACEHOLDER}（ユーザーが選定。ライブラリー ${lp} の既存LPを、DISの9軸で再分析。画像は、旧ライブラリーのアーカイブ掲載の全体画像）` });
  a.sourceAnalysisRef = `旧ライブラリー ${lp} の旧分析（Dropbox: ${folder.path}/03_Analysis/）。内容は引き継がず、画像から新規に分析する`;
  await fs.writeFile(path.join(itemDir, "analysis.json"), JSON.stringify(a, null, 2) + "\n");
  await fs.writeFile(path.join(itemDir, "annotations.json"), JSON.stringify(emptyAnnotations(a), null, 2) + "\n");

  // 5. ライブラリー番号との対応（同じLP。追記のみ）
  const counters = await readJson(f("data/id-counters.json"));
  const plan = planReservation({ disId, mode: "same", sameAs: lp, sourceUrl: rec.sourceDetailUrl, ledgerEntry: { pageUrl: item.pageUrl, brand: item.brand, notion: {} }, counters, relations, reservations: { reserved: [] } });
  relations.relations.push(plan.relationsAdd);
  // 他の処理（Notion反映）が同時に対応表を更新していても壊さないよう、書込みの直前に読み直して、追記だけを行う
  await updateJson(f("data/dis-relations.json"), { schemaVersion: "dis-relations-1.0", relations: [] }, (cur) => { cur.relations.push(plan.relationsAdd); return cur; });
  return { disId, lp, itemDir, brand: item.brand, pageUrl: item.pageUrl, devices: item.devices, legacyAnalysis: legacy, warnings: files.warnings };
}

async function main() {
  const { values } = parseArgs({ options: { lp: { type: "string" }, date: { type: "string" }, folder: { type: "string" } } });
  if (!values.lp) throw new Error("--lp（例: LP-0002）が必要です");
  const dbx = await import("../lib/dropbox-client.mjs");
  const r = await ingestLibraryLp({ lp: values.lp, dbx, folderPath: values.folder || null, ...(values.date ? { date: values.date } : {}) });
  console.log(JSON.stringify({ ...r, next: [`旧分析（比較の参考。内容は引き継がない）: ${r.legacyAnalysis ? `${r.itemDir}/legacy-analysis.md` : "なし"}`, `画像を読んで ${r.itemDir}/analysis.json と annotations.json を書く（9軸・Unit・roleType・regions・notionProps・選定理由の「良い点」）`, `npm run dis:validate-item -- --id ${r.disId}`, `npm run dis:cbs-draft -- --id ${r.disId} --appeal-from-summary --offer "<オファー>" --place`] }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
