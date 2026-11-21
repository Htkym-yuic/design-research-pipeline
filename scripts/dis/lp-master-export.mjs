#!/usr/bin/env node
/**
 * 案件台帳の元データを作る（読むだけ。Dropbox・Notionは変更しない）。
 *   node scripts/dis/lp-master-export.mjs            # data/lp-master.csv と data/lp-master-sections.csv を作る（リポジトリ内のみ）
 *   オプション: --src <10_LP>
 *
 * lp-master.csv        : LPごとに1行（番号・タイトル・アーカイブURL・案件別フォルダ・全体画像のリンク・PC/SPのセクション数と構成・要対応）
 * lp-master-sections.csv: セクション画像ごとに1行（LP・端末・順番・種類・ファイル名・リンク）
 * リンクは、Dropbox の Web のURL（ログイン中のあなたが開ける。共有リンクは作らない）。
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LOCAL_ROOT = path.join(os.homedir(), "Library/CloudStorage/Dropbox");
const DEFAULT_SRC = path.join(LOCAL_ROOT, "10_デザイン/01_言語化ラボ/10_LP");
const IMG = /\.(png|jpe?g|webp)$/i;
const ls = (d) => fs.readdir(d, { withFileTypes: true }).catch(() => []);

/** Dropbox の Web のURL。kind: "home"（フォルダ）／"preview"（ファイル）。rel は Dropbox のルートからの相対パス。 */
export function dropboxUrl(rel, kind = "home") {
  return `https://www.dropbox.com/${kind}/${rel.split(path.sep).join("/").split("/").map(encodeURIComponent).join("/")}`;
}
/** 「LP-0001_名前_PC_03_特徴.png」→ { dev, seq, kind }。 */
export function parseSectionName(file) {
  const m = /_(PC|SP)_(\d{1,3})_(.+)\.(png|jpe?g|webp)$/i.exec(file);
  return m ? { dev: m[1], seq: Number(m[2]), kindName: m[3] } : null;
}
/** 構成の文字列。同じ種類が続くときは「×2」にまとめる。 */
export function structureText(items) {
  const out = [];
  for (const it of items) {
    const last = out[out.length - 1];
    if (last && last.k === it.kindName) last.n++; else out.push({ k: it.kindName, n: 1 });
  }
  return out.map((o) => (o.n > 1 ? `${o.k}×${o.n}` : o.k)).join(" > ");
}
/** 構成の流れ（矢印でつなぐ。まとめない）。 */
export const flowText = (items) => items.map((i) => i.kindName).join("→");
const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const toCsv = (rows) => { const h = Object.keys(rows[0]); return [h.map(csvCell).join(","), ...rows.map((r) => h.map((k) => csvCell(r[k])).join(","))].join("\n") + "\n"; };

async function main() {
  const { values: v } = parseArgs({ options: { src: { type: "string", default: DEFAULT_SRC } } });
  const map = JSON.parse(await fs.readFile(path.join(REPO, "data/lp-renumber-map.json"), "utf8"));
  const expected = JSON.parse(await fs.readFile(path.join(REPO, "config/section-expected-gaps.json"), "utf8").catch(() => "{}")).items || {};
  const relRoot = (p) => path.relative(LOCAL_ROOT, p);
  const caseDirs = new Map();
  for (const e of await ls(path.join(v.src, "01_案件別"))) { const m = e.isDirectory() && /^(LP-\d{4})_/.exec(e.name); if (m) caseDirs.set(m[1], e.name); }
  const secs = new Map(); // lp|dev -> [{seq,kindName,file,kind}]
  const kinds = (await ls(path.join(v.src, "02_セクション別"))).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  for (const k of kinds) for (const dev of ["PC", "SP"]) {
    for (const f of await ls(path.join(v.src, "02_セクション別", k, dev))) {
      const m = f.isFile() && IMG.test(f.name) && /^(LP-\d{4})_/.exec(f.name); const p = m && parseSectionName(f.name);
      if (!p) continue;
      const key = `${m[1]}|${dev}`; if (!secs.has(key)) secs.set(key, []);
      secs.get(key).push({ seq: p.seq, kindName: p.kindName, file: f.name, kind: k });
    }
  }
  const notesFile = JSON.parse(await fs.readFile(path.join(REPO, "config/ledger-notes.json"), "utf8").catch(() => "{}"));
  const notes = notesFile.items || {}, sources = notesFile.sources || {};
  const rows = [], secRows = [];
  const inMap = new Set(map.items.map((i) => i.oldLp));
  const extra = [...new Set([...caseDirs.keys(), ...[...secs.keys()].map((k) => k.split("|")[0])])].filter((lp) => !inMap.has(lp)).sort()
    .map((lp) => ({ oldLp: lp, title: (caseDirs.get(lp) || "").replace(/^LP-\d{4}_/, "") || "（名前なし）", rdlpId: null, status: "adopted", note: "対応表にない番号（フォルダから追加）" }));
  for (const it of [...map.items, ...extra]) {
    const folder = caseDirs.get(it.oldLp);
    const row = { LP番号: it.oldLp, タイトル: it.title, rdlpID: it.rdlpId || "", アーカイブURL: it.rdlpId ? `https://rdlp.jp/archives/otherdesign/lp/${it.rdlpId}` : "", 重複: it.status === "excluded_duplicate" ? `重複（${it.note || ""}）` : "", 案件別フォルダ名: folder || "", 案件別リンク: folder ? dropboxUrl(relRoot(path.join(v.src, "01_案件別", folder)), "home") : "" };
    const flags = [];
    for (const dev of ["PC", "SP"]) {
      let full = "";
      if (folder) { const f = (await ls(path.join(v.src, "01_案件別", folder))).find((e) => e.isFile() && IMG.test(e.name) && e.name.includes(`_${dev}_全体.`)); if (f) full = dropboxUrl(relRoot(path.join(v.src, "01_案件別", folder, f.name)), "preview"); }
      const list = (secs.get(`${it.oldLp}|${dev}`) || []).sort((a, b) => a.seq - b.seq || a.kind.localeCompare(b.kind));
      row[`${dev}全体画像リンク`] = full; row[`${dev}有無`] = list.length || full ? "あり" : (expected[it.oldLp]?.[dev] ? "なし（許容）" : "なし");
      row[`${dev}セクション数`] = list.length; row[`${dev}構成`] = structureText(list); row[`${dev}流れ`] = flowText(list);
      if (!list.length && !expected[it.oldLp]?.[dev]) flags.push(`${dev}のセクション画像なし`);
      if (full && !list.length) flags.push(`${dev}は全体画像のみ（切り出し待ち）`);
      if (list.length && !list.some((x) => x.kindName === "FV") && !expected[it.oldLp]?.[dev]) flags.push(`${dev}にFVなし`);
      for (const s of list) secRows.push({ LP番号: it.oldLp, タイトル: it.title, 端末: dev, 順番: s.seq, 種類: s.kind, ファイル名: s.file, リンク: dropboxUrl(relRoot(path.join(v.src, "02_セクション別", s.kind, dev, s.file)), "preview") });
    }
    if (!folder) flags.push("案件別フォルダなし");
    row.要対応 = flags.join(" / "); row.備考 = notes[it.oldLp] || ""; row.元ページURL = sources[it.oldLp] || ""; rows.push(row);
  }
  await fs.writeFile(path.join(REPO, "data/lp-master.csv"), toCsv(rows));
  await fs.writeFile(path.join(REPO, "data/lp-master-sections.csv"), toCsv(secRows.length ? secRows : [{ LP番号: "" }]));
  console.log(`対応表にない番号（フォルダから追加）: ${extra.length} 件 ${extra.map((e) => e.oldLp).join(" ")}\nLP: ${rows.length} 件（案件別フォルダあり ${rows.filter((r) => r.案件別フォルダ名).length}）／セクション画像: ${secRows.length} 件`);
  console.log(`要対応あり: ${rows.filter((r) => r.要対応).length} 件`);
  console.log("書き出し: data/lp-master.csv / data/lp-master-sections.csv（リポジトリ内のみ）");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(e.message); process.exit(1); });
