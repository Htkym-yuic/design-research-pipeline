#!/usr/bin/env node
/**
 * 02_セクション別 にある「DIS-LP-nnnn_…」のファイルを、ライブラリー番号「LP-mmmm_…」に直す計画を作る（読むだけ。何も変更しない）。
 * あわせて、FV など、セクション画像が足りないLPの一覧を作る（DIS- の分を直した場合の見込みも含む）。
 *
 *   node scripts/dis/section-rename-plan.mjs            # 画面に表示し、data/section-dis-rename-plan.csv と data/section-gaps.csv を作る
 *   オプション: --src <10_LP>
 *
 * ・DIS番号 → LP番号: ①data/lp-renumber-map.json の oldDisIds ②data/dis-relations.json ③ファイル名の「名前」が、ライブラリーのタイトルと一致するもの
 * ・衝突: 同じLP・同じ種類・同じ端末に、すでに LP- のファイルがあるときは「衝突」（上書きしない。人が決める）
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { scan } from "./section-audit.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_SRC = path.join(os.homedir(), "Library/CloudStorage/Dropbox/10_デザイン/01_言語化ラボ/10_LP");
const IMG = /\.(png|jpe?g|webp)$/i;

/** 名前を、比較用に正規化（記号・空白・アンダースコアを除き、小文字にする）。 */
export const norm = (s) => String(s).normalize("NFKC").toLowerCase().replace(/[\s_\-・。、．，.()（）【】\[\]!！?？®™"'“”]/g, "");

/** 「DIS-LP-nnnn_名前_PC_NN_種類.png」を分解する。 */
export function parseDisName(file) {
  const m = /^DIS-LP-(\d{4})_(.*)_(PC|SP)_(\d{2})_(.+)\.(png|jpe?g|webp)$/i.exec(file);
  return m ? { dis: `DIS-LP-${m[1]}`, name: m[2], dev: m[3], seq: m[4], kindName: m[5], ext: m[6] } : null;
}

/** DIS番号・名前から、ライブラリー番号を推定する。{ lp, basis } or null */
export function resolveLp({ dis, name }, map, relations) {
  const byOld = map.items.find((i) => (i.oldDisIds || []).includes(dis));
  if (byOld) return { lp: byOld.oldLp, basis: "対応表(oldDisIds)" };
  const rel = (relations?.relations || []).find((r) => r.disId === dis && r.libraryId);
  if (rel) return { lp: rel.libraryId, basis: "dis-relations" };
  const n = norm(name);
  const hits = map.items.filter((i) => norm(i.title) === n);
  if (hits.length === 1) return { lp: hits[0].oldLp, basis: "タイトル一致" };
  if (hits.length > 1) return { lp: null, basis: `タイトル一致が複数(${hits.map((h) => h.oldLp).join("/")})` };
  const starts = map.items.filter((i) => n.length >= 4 && (norm(i.title).startsWith(n) || n.startsWith(norm(i.title))) && norm(i.title).length >= 4);
  if (starts.length === 1) return { lp: starts[0].oldLp, basis: "タイトル前方一致" };
  return null;
}

async function main() {
  const { values: v } = parseArgs({ options: { src: { type: "string", default: DEFAULT_SRC } } });
  const map = JSON.parse(await fs.readFile(path.join(REPO, "data/lp-renumber-map.json"), "utf8"));
  const relations = JSON.parse(await fs.readFile(path.join(REPO, "data/dis-relations.json"), "utf8").catch(() => "{}"));
  const secDir = path.join(v.src, "02_セクション別");
  const kinds = (await fs.readdir(secDir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const have = new Map(); // `${lp}|${kind}|${dev}` -> true (LP- のファイル)
  const disFiles = [];
  for (const k of kinds) for (const dev of ["PC", "SP"]) {
    for (const e of await fs.readdir(path.join(secDir, k, dev), { withFileTypes: true }).catch(() => [])) {
      if (!e.isFile() || !IMG.test(e.name)) continue;
      const m = /^LP-(\d{4})_/.exec(e.name);
      if (m) have.set(`LP-${m[1]}|${k}|${dev}`, true);
      else if (e.name.startsWith("DIS-LP-")) disFiles.push({ kind: k, dev, file: e.name });
    }
  }
  const rows = [];
  for (const f of disFiles) {
    const p = parseDisName(f.file);
    if (!p) { rows.push({ 種類: f.kind, 端末: f.dev, 現在のファイル名: f.file, DIS番号: "", 推定LP番号: "", 根拠: "名前の形式が想定外", 新ファイル名: "", 衝突: "" }); continue; }
    const r = resolveLp(p, map, relations);
    const lp = r?.lp || "";
    const newName = lp ? f.file.replace(/^DIS-LP-\d{4}/, lp) : "";
    const conflict = lp && have.get(`${lp}|${f.kind}|${f.dev}`) ? "衝突（既に同じLP・種類・端末のファイルあり）" : "";
    rows.push({ 種類: f.kind, 端末: f.dev, 現在のファイル名: f.file, DIS番号: p.dis, 推定LP番号: lp, 根拠: r?.basis || "対応するLPが見つからない", 新ファイル名: newName, 衝突: conflict });
  }
  const { by } = await scan(v.src);
  const expected = JSON.parse(await fs.readFile(path.join(REPO, "config/section-expected-gaps.json"), "utf8").catch(() => "{}")).items || {};
  const gaps = [];
  const renameOk = new Set(rows.filter((r) => r.推定LP番号 && !r.衝突).map((r) => `${r.推定LP番号}|${r.種類}|${r.端末}`));
  const fvKind = kinds.find((k) => /FV/.test(k));
  for (const it of map.items) for (const dev of ["PC", "SP"]) {
    if (expected[it.oldLp]?.[dev]) continue;
    const now = have.has(`${it.oldLp}|${fvKind}|${dev}`);
    const after = now || renameOk.has(`${it.oldLp}|${fvKind}|${dev}`);
    const hasFull = !!by.get(it.oldLp)?.full[dev];
    if (!now) gaps.push({ lp: it.oldLp, title: it.title, 端末: dev, 種類: fvKind, 現在: "なし", DIS分を直した後: after ? "あり（DIS-の分で埋まる）" : "なし（作成が必要）", 全体画像: hasFull ? "あり" : "なし", 作成方法: after ? "不要" : hasFull ? "全体画像から切り出し" : "URLから撮影", 重複扱い: it.status === "excluded_duplicate" ? "重複" : "" });
  }
  const summary = {};
  for (const r of rows) { const k = r.衝突 ? "衝突" : r.推定LP番号 ? "直せる" : "未対応"; summary[k] = (summary[k] || 0) + 1; }
  console.log(`DIS-LP-… のセクション画像: ${rows.length} 件  ${JSON.stringify(summary)}`);
  const byDis = new Map();
  for (const r of rows) { const k = `${r.DIS番号}→${r.推定LP番号 || "?"}（${r.根拠}）`; byDis.set(k, (byDis.get(k) || 0) + 1); }
  for (const [k, n] of [...byDis].sort()) console.log(`  ${k}  ${n}件`);
  console.log(`\nFV（${fvKind}）が無い 端末別LP: ${gaps.length} 件（うち DIS- の分で埋まる: ${gaps.filter((g) => g.DIS分を直した後.startsWith("あり")).length}、作成が必要: ${gaps.filter((g) => g.DIS分を直した後.startsWith("なし")).length}）`);
  for (const g of gaps) console.log(`  ${g.lp} ${g.端末} ${g.title}  → ${g.DIS分を直した後} / 全体画像${g.全体画像} → ${g.作成方法}${g.重複扱い ? " [重複]" : ""}`);
  const csv = (arr) => { if (!arr.length) return ""; const h = Object.keys(arr[0]); return [h.join(","), ...arr.map((r) => h.map((k) => `"${String(r[k]).replace(/"/g, '""')}"`).join(","))].join("\n") + "\n"; };
  await fs.writeFile(path.join(REPO, "data/section-dis-rename-plan.csv"), csv(rows));
  await fs.writeFile(path.join(REPO, "data/section-gaps.csv"), csv(gaps));
  console.log("\n書き出し: data/section-dis-rename-plan.csv / data/section-gaps.csv（リポジトリ内のみ。Dropbox・Notionは変更していません）");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(e.message); process.exit(1); });
