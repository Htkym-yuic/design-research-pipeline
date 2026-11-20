#!/usr/bin/env node
/**
 * アーカイブ（rdlp）掲載の全体画像を、新しい LP 番号で、Dropbox の案件別フォルダに保存する（分析はしない）。
 *
 *   node scripts/dis/archive-shots.mjs --list
 *   node scripts/dis/archive-shots.mjs --limit 1                       # ドライラン（取得して、保存先と番号の計画を表示。何も書かない）
 *   DIS_ENABLE_WRITES=true node scripts/dis/archive-shots.mjs --limit 1 --apply   # 保存（新規のみ）
 *
 * ・対象: data/dis-archive-align-queue.json の status=ready（rdlpUrl あり）。DIS の番号は使わない。
 * ・番号: data/id-counters.json の LP の次の番号（LP-0250〜）。確保は追記のみ。番号は再利用しない。
 * ・保存先: <Dropbox同期フォルダ>/10_デザイン/01_言語化ラボ/10_LP/01_案件別/LP-nnnn_<名前>/
 *     LP-nnnn_<名前>_PC_全体.png／_SP_全体.png／_PC_FV.png／_SP_FV.png
 *   フォルダがすでにあるときは、上書きせず中止する。
 * ・PC と SP が同じ画像のとき（アーカイブが1枚だけ載せている場合）は、SPを保存しない。
 * ・robots.txt・403 などは回避しない。失敗は理由を記録して次へ進む。
 * ・書込みは --apply と DIS_ENABLE_WRITES=true の両方が必要。ログ: data/lp-archive-realign.json（追記のみ）。
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { captureFromArchive } from "./lib/capture.mjs";
import { robotsAllows } from "./lib/collect.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const QUEUE = "data/dis-archive-align-queue.json";
const REALIGN = "data/lp-archive-realign.json";
const COUNTERS = "data/id-counters.json";
const RESERVATIONS = "candidates/lp-archive/intake-reservations.json";
const DEFAULT_DEST = path.join(os.homedir(), "Library/CloudStorage/Dropbox/10_デザイン/01_言語化ラボ/10_LP/01_案件別");
const pad = (n) => String(n).padStart(4, "0");
const readJson = async (f, d = null) => { try { return JSON.parse(await fs.readFile(path.join(REPO, f), "utf8")); } catch { return d; } };
async function writeAtomic(f, data) { const p = path.join(REPO, f); await fs.writeFile(`${p}.tmp`, JSON.stringify(data, null, 2) + "\n"); await fs.rename(`${p}.tmp`, p); }

export const safeTitle = (t) => Array.from(String(t || "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, "_").replace(/^[._]+|[._]+$/g, "")).slice(0, 40).join("") || "untitled";

/** 次の LP 番号。カウンターの整合（nextNumber = existingMax + 1）と、使用済みでないことを確認する。 */
export function nextLpNumber(counters, realign, reservations) {
  const c = counters.lp;
  if (!c || c.nextNumber !== c.existingMax + 1) throw new Error("LP のカウンターが連続していません（nextNumber ≠ existingMax + 1）。先に整合を確認してください");
  const id = `LP-${pad(c.nextNumber)}`;
  if ((realign.items || []).some((x) => x.libraryId === id) || (reservations.reserved || []).some((x) => x.id === id)) throw new Error(`${id} は、すでに使われています`);
  return c.nextNumber;
}

/** 2つの画像が、見た目として同じか（縮小して比べる）。アーカイブが同じ画像を PC・SP として載せている場合の検出。 */
export async function samePixels(a, b) {
  const { default: sharp } = await import("sharp");
  const ma = await sharp(a, { limitInputPixels: false }).metadata();
  const mb = await sharp(b, { limitInputPixels: false }).metadata();
  if (Math.abs(ma.width - mb.width) > 2 || Math.abs(ma.height - mb.height) > 2) return false;
  const small = async (buf) => (await sharp(buf, { limitInputPixels: false }).resize({ width: 48, height: 96, fit: "fill" }).greyscale().raw().toBuffer());
  const [x, y] = await Promise.all([small(a), small(b)]);
  let d = 0; for (let i = 0; i < x.length; i++) d += Math.abs(x[i] - y[i]);
  return d / x.length < 3;
}

/** 1件: アーカイブ画像を取得し、保存する 4（または2）ファイルを、用意する。apply のときだけ destRoot に書く。 */
export async function shootOne({ rdlpUrl, libraryId, title, destRoot, apply = false, fetchImpl = fetch }) {
  const { default: sharp } = await import("sharp");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "archive-shots-"));
  try {
    await captureFromArchive(rdlpUrl, tmp, { id: libraryId, fetchImpl });
    const normal = path.join(tmp, "01_Normal_Images");
    const read = async (n) => fs.readFile(path.join(normal, `${libraryId}_${n}_full.png`)).catch(() => null);
    const pc = await read("PC"); let sp = await read("SP");
    if (!pc && !sp) throw new Error("全体画像を作れませんでした");
    const notes = [];
    if (pc && sp && (await samePixels(pc, sp))) { sp = null; notes.push("PCとSPが同じ画像のため、SPは保存しない"); }
    const name = `${libraryId}_${safeTitle(title)}`;
    const files = [];
    const add = async (suffix, buf, vh) => {
      files.push({ name: `${name}_${suffix}_全体.png`, buf });
      const m = await sharp(buf, { limitInputPixels: false }).metadata();
      files.push({ name: `${name}_${suffix}_FV.png`, buf: await sharp(buf, { limitInputPixels: false }).extract({ left: 0, top: 0, width: m.width, height: Math.min(m.height, vh) }).png().toBuffer() });
    };
    if (pc) await add("PC", pc, 900);
    if (sp) await add("SP", sp, 812);
    const folder = path.join(destRoot, name);
    if (apply) {
      if (await fs.access(folder).then(() => true, () => false)) throw new Error(`すでにあります（上書きしません）: ${folder}`);
      await fs.mkdir(folder);
      for (const f of files) await fs.writeFile(path.join(folder, f.name), f.buf, { flag: "wx" });
    }
    return { folder, files: files.map((f) => ({ name: f.name, bytes: f.buf.length })), devices: sp ? ["pc", "sp"] : ["pc"], notes };
  } finally { await fs.rm(tmp, { recursive: true, force: true }); }
}

async function main() {
  const { values } = parseArgs({ options: { list: { type: "boolean" }, limit: { type: "string" }, only: { type: "string" }, apply: { type: "boolean" }, dest: { type: "string" } } });
  const queue = await readJson(QUEUE);
  if (!queue) throw new Error(`${QUEUE} がありません。git pull してください`);
  const realign = (await readJson(REALIGN)) || { note: "アーカイブ画像を新しい LP 番号で Dropbox に保存した記録（追記のみ。番号は再利用しない）。LP-0014 の画像を撮り直した LP-0250 のように、元の LP 番号と対応づける。", items: [] };
  const done = new Set(realign.items.map((x) => x.rdlpUrl));
  const destRoot = values.dest || DEFAULT_DEST;
  if (values.list) {
    for (const it of queue.items) console.log(`${(done.has(it.rdlpUrl) ? "done" : it.rdlpUrl ? "pending" : "need_rdlp").padEnd(9)} ${it.libraryId} ${it.title}  ${it.rdlpUrl || ""}`);
    return;
  }
  if (values.apply && process.env.DIS_ENABLE_WRITES !== "true") throw new Error("書込みには DIS_ENABLE_WRITES=true も必要です（Dropbox への保存のため）");
  let todo = queue.items.filter((it) => it.rdlpUrl && !done.has(it.rdlpUrl));
  if (values.only) todo = todo.filter((it) => it.libraryId === values.only || it.rdlpUrl.includes(values.only));
  if (values.limit) todo = todo.slice(0, Number(values.limit));
  console.log(`${values.apply ? "保存" : "ドライラン（何も書かない）"}: 対象 ${todo.length} 件 / 保存先 ${destRoot}`);
  if (values.apply && !(await fs.access(destRoot).then(() => true, () => false))) throw new Error(`保存先がありません: ${destRoot}（--dest で指定）`);
  let plannedNext = null;
  for (const it of todo) {
    const counters = await readJson(COUNTERS); const reservations = await readJson(RESERVATIONS);
    const n = plannedNext ?? nextLpNumber(counters, realign, reservations);
    const libraryId = `LP-${pad(n)}`;
    console.log(`\n== ${it.libraryId} ${it.title} → ${libraryId}（${it.rdlpUrl}）`);
    try {
      if (!(await robotsAllows(it.rdlpUrl))) throw new Error("robots.txtで禁止されているため取得しません");
      const r = await shootOne({ rdlpUrl: it.rdlpUrl, libraryId, title: it.title, destRoot, apply: !!values.apply });
      console.log(`  保存先: ${r.folder}\n  ${r.files.map((f) => `${f.name}（${Math.round(f.bytes / 1024)}KB）`).join("\n  ")}\n  端末: ${r.devices.join("・")}${r.notes.length ? "\n  注: " + r.notes.join("／") : ""}`);
      if (values.apply) {
        const now = new Date().toISOString();
        counters.lp = { ...counters.lp, existingMax: n, nextNumber: n + 1, lastReservation: { reservedAt: now, idStart: libraryId, idEnd: libraryId, candidateCount: 1, sourceName: `アーカイブ画像の撮り直し（${it.libraryId}）`, outputPath: REALIGN } };
        reservations.reserved.push({ id: libraryId, title: it.title, status: "archive_realign", captureUrl: it.realUrl, sourceDetailUrl: it.rdlpUrl, lpArchivePostId: it.rdlpId, originalLibraryId: it.libraryId, reservedAt: now });
        reservations.updatedAt = now; reservations.nextLpId = `LP-${pad(n + 1)}`;
        realign.items.push({ libraryId, originalLibraryId: it.libraryId, title: it.title, rdlpUrl: it.rdlpUrl, rdlpId: it.rdlpId, realUrl: it.realUrl, folder: r.folder, devices: r.devices, notes: r.notes, assignedAt: now });
        await writeAtomic(COUNTERS, counters); await writeAtomic(RESERVATIONS, reservations); await writeAtomic(REALIGN, realign);
        plannedNext = null;
      } else plannedNext = n + 1; // ドライランでは、続けて表示するため、次の番号を仮に進める
    } catch (e) {
      console.log(`  失敗: ${e.message}（回避しません。次へ進みます）`);
      if (!values.apply) plannedNext = n; // 失敗した番号は、ドライランでは使い回して表示
    }
  }
  if (values.apply) console.log("\n書き込みました。data/id-counters.json・data/lp-archive-realign.json・candidates/lp-archive/intake-reservations.json をコミットして、プッシュしてください");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main().catch((e) => { console.error(e.message); process.exit(1); });
