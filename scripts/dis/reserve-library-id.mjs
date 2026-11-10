#!/usr/bin/env node
/**
 * DISの案件に、ライブラリーの番号（LP-nnnn／BN-nnnn／WB-nnnn）を対応づける。ローカルのファイルのみ（Notion・Dropbox・CBSには書かない）。
 *   --same-as <番号>  ライブラリーに同じ作品がすでにある（既存の番号を使う。新しい番号は取らない）
 *   --reserve         ライブラリー未登録。次の番号を確保する（id-counters.json・予約ファイル・対応表を更新）
 * 既定はドライラン（変更内容の表示のみ）。書込みは --apply のときだけ。既存の番号・既存の対応は変更しない（追記のみ）。
 *   node scripts/dis/reserve-library-id.mjs --id DIS-WB-20261107 --reserve [--source-url <掲載元の詳細ページ>] [--apply]
 */
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { normalizeUrl } from "./lib/dedupe.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MEDIA = { LP: { key: "lp", prefix: "LP", mediaType: "LP", reservations: "candidates/lp-archive/intake-reservations.json", sameRel: "same_lp" }, BN: { key: "banner", prefix: "BN", mediaType: "Banner", reservations: "candidates/non-lp/intake-reservations.json", sameRel: "same_work" }, WB: { key: "web", prefix: "WB", mediaType: "Web", reservations: "candidates/non-lp/intake-reservations.json", sameRel: "same_work" } };
const readJson = async (f) => JSON.parse(await fs.readFile(f, "utf8"));
const pad = (n) => String(n).padStart(4, "0");

/** 変更内容の計算（ファイルへは書かない）。 */
export function planReservation({ disId, mode, sameAs, sourceUrl, libraryPage, ledgerEntry, counters, relations, reservations, now = new Date() }) {
  const m = /^DIS-(LP|BN|WB)-(\d{4}|\d{8})$/.exec(disId || "");
  if (!m) throw new Error(`DISのIDの形式が違います: ${disId}`);
  const media = MEDIA[m[1]];
  if (!ledgerEntry) throw new Error(`台帳に ${disId} がありません（登録済みの案件のみ対象）`);
  if (relations.relations.some((r) => r.disId === disId)) throw new Error(`${disId} は、すでに対応表にあります（既存の対応は変更しません）`);
  const counter = counters[media.key];
  if (!counter) throw new Error(`id-counters.json に ${media.key} がありません`);
  if (counter.nextNumber !== counter.existingMax + 1) throw new Error(`${media.key} のカウンターが連続していません（nextNumber ≠ existingMax + 1）。先に整合を確認してください`);
  const iso = now.toISOString();
  const url = ledgerEntry.pageUrl;
  const canonicalKey = /rdlp\.jp\/archives\/otherdesign\/lp\/(\d+)/.exec(sourceUrl || "")?.[1] ? `rdlp:${/rdlp\.jp\/archives\/otherdesign\/lp\/(\d+)/.exec(sourceUrl)[1]}` : `${media.key}:${normalizeUrl(url)}`;
  const base = { disId, libraryNotionPageId: libraryPage || null, disNotionPageId: ledgerEntry.notion?.pageId || null, canonicalKey, establishedAt: iso.slice(0, 10) };
  const plan = { disId, media: media.key, relationsAdd: null, counters: null, reservationAdd: null, reservationsPath: null };
  if (mode === "same") {
    const mm = new RegExp(`^${media.prefix}-(\\d{4})$`).exec(sameAs || "");
    if (!mm) throw new Error(`--same-as は ${media.prefix}-nnnn の形式です: ${sameAs}`);
    if (Number(mm[1]) < 1 || Number(mm[1]) > counter.existingMax) throw new Error(`${sameAs} は、ライブラリーに存在する番号ではありません（最大 ${media.prefix}-${pad(counter.existingMax)}）`);
    plan.relationsAdd = { ...base, relation: media.sameRel, libraryId: sameAs, primaryId: sameAs, disRole: "追加の層（構造・再利用・再現手順・改善案・Unit別の切り出し）", cbsPolicy: `CBSには、${sameAs}の1件に、DISの層として付ける。${disId}を、独立した作品として載せない。評価点は混ぜず、方法を明記して分ける。` };
    return plan;
  }
  const n = counter.nextNumber;
  const libraryId = `${media.prefix}-${pad(n)}`;
  if (relations.relations.some((r) => r.libraryId === libraryId)) throw new Error(`${libraryId} は、すでに別の対応で使われています`);
  plan.relationsAdd = { ...base, relation: "reserved_for_library", libraryId, primaryId: libraryId, disRole: "追加の層（構造・再利用・再現手順・改善案・Unit別の切り出し）。ライブラリー側の取り込み・28章の分析は未実施", cbsPolicy: "ライブラリーに取り込みが済んだら、1件に、DISの層として付ける。DIS単独では、CBSに載せない。" };
  const next = { ...counter, existingMax: n, nextNumber: n + 1 };
  if (media.key === "lp") next.lastReservation = { reservedAt: iso, idStart: libraryId, idEnd: libraryId, candidateCount: 1, sourceName: `DIS（${disId}に、番号だけ確保）`, outputPath: "data/dis-relations.json" };
  else next.lastReservationAt = iso;
  plan.counters = { before: { existingMax: counter.existingMax, nextNumber: counter.nextNumber }, after: next };
  plan.reservationsPath = media.reservations;
  plan.reservationAdd = media.key === "lp"
    ? { id: libraryId, title: ledgerEntry.brand, status: "reserved_dis_link", captureUrl: url, sourceDetailUrl: sourceUrl || null, lpArchivePostId: /\/lp\/(\d+)/.exec(sourceUrl || "")?.[1] || null, linkedDisId: disId, reservedAt: iso }
    : { id: libraryId, title: ledgerEntry.brand, mediaType: media.mediaType, sourceName: "DIS", status: "reserved_dis_link", captureUrl: url, sourceDetailUrl: sourceUrl || null, imageUrl: null, materialId: null, linkedDisId: disId, reservedAt: iso };
  if (reservations.reserved.some((r) => r.id === libraryId)) throw new Error(`${libraryId} は、すでに予約ファイルにあります`);
  return plan;
}

async function writeAtomic(file, data) { const tmp = `${file}.tmp`; await fs.writeFile(tmp, JSON.stringify(data, null, 2) + "\n"); await fs.rename(tmp, file); }

async function main() {
  const { values } = parseArgs({ options: { id: { type: "string" }, "same-as": { type: "string" }, reserve: { type: "boolean", default: false }, "source-url": { type: "string" }, "library-page": { type: "string" }, apply: { type: "boolean", default: false }, root: { type: "string" } } });
  const root = values.root || REPO;
  if (!values.id || (!!values["same-as"] === values.reserve)) throw new Error("--id と、--same-as <番号> または --reserve のどちらか1つが必要です");
  const f = (p) => path.join(root, p);
  const ledger = await readJson(f("data/dis-ledger.json"));
  const counters = await readJson(f("data/id-counters.json"));
  const relations = await readJson(f("data/dis-relations.json"));
  const media = MEDIA[/^DIS-(LP|BN|WB)-/.exec(values.id)?.[1]];
  if (!media) throw new Error(`DISのIDの形式が違います: ${values.id}`);
  const reservations = await readJson(f(media.reservations));
  const plan = planReservation({ disId: values.id, mode: values.reserve ? "reserve" : "same", sameAs: values["same-as"], sourceUrl: values["source-url"], libraryPage: values["library-page"], ledgerEntry: ledger.entries.find((e) => e.disId === values.id), counters, relations, reservations });
  console.log(`モード: ${values.apply ? "書込み（ローカルのファイルのみ）" : "ドライラン（変更内容の表示のみ）"}`);
  console.log(`${plan.disId} → ${plan.relationsAdd.libraryId}（${plan.relationsAdd.relation}）`);
  if (plan.counters) console.log(`カウンター ${plan.media}: existingMax ${plan.counters.before.existingMax} → ${plan.counters.after.existingMax} ／ nextNumber ${plan.counters.before.nextNumber} → ${plan.counters.after.nextNumber}`);
  if (plan.reservationAdd) console.log(`予約ファイル（${plan.reservationsPath}）に追記: ${plan.reservationAdd.id} ${plan.reservationAdd.title}`);
  console.log(`対応表（data/dis-relations.json）に追記: ${plan.relationsAdd.relation}`);
  if (!values.apply) { console.log("書き込むには --apply を付けてください（Notion・Dropbox・CBSには書きません）"); return; }
  relations.relations.push(plan.relationsAdd);
  await writeAtomic(f("data/dis-relations.json"), relations);
  if (plan.counters) {
    counters[plan.media] = plan.counters.after;
    await writeAtomic(f("data/id-counters.json"), counters);
    reservations.reserved.push(plan.reservationAdd);
    reservations.updatedAt = plan.reservationAdd.reservedAt;
    if (plan.media === "lp") reservations.nextLpId = `LP-${pad(plan.counters.after.nextNumber)}`;
    await writeAtomic(f(plan.reservationsPath), reservations);
  }
  console.log("書き込みました。コミットとプッシュをお願いします（data/id-counters.json・data/dis-relations.json・予約ファイル）");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main().catch((e) => { console.error(e.message); process.exit(1); });
