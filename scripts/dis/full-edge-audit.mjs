#!/usr/bin/env node
/**
 * 全体画像（01_案件別/…_PC_全体 / _SP_全体）の「先頭・末尾の欠け」を調べる（読むだけ。Dropbox・Notionは変更しない）。
 *
 *   node scripts/dis/full-edge-audit.mjs                       # 全LP。数値の判定と、先頭・末尾の見比べシートを作る
 *   node scripts/dis/full-edge-audit.mjs --lp LP-0029,LP-0008  # 指定したLPだけ
 *   オプション: --src <10_LP> --sheets ~/dis-edge-sheets --no-sheets
 *
 * 数値の判定（疑いの目安。確定ではない）:
 *  - 末尾が空白: 下端に、一様な空白が 600px 以上続く（撮影が途中で止まった／読み込み前の空白）
 *  - 末尾が切れている疑い: 最下行まで中身が続いていて、空白の余白が無い（フッターの途中で切れた可能性）
 *  - 幅が他と違う: 端末ごとの最頻の幅と違う（2倍解像度など）
 *  - 切り出し範囲が小さい/大きい: 同じLP・端末のセクション画像の高さの合計が、全体の 60% 未満／150% 超
 *  - 高さが小さい: 1500px 未満
 * 見比べシート: 1枚に16LP分、各LPの「先頭」と「末尾」の帯を並べる（目で、ヘッダー・フッターがあるかを確認する）。
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_SRC = path.join(os.homedir(), "Library/CloudStorage/Dropbox/10_デザイン/01_言語化ラボ/10_LP");
const IMG = /\.(png|jpe?g|webp)$/i;
const ls = (d) => fs.readdir(d, { withFileTypes: true }).catch(() => []);

/** 行ごとの「一様か」の配列から、下端から数えた連続する一様行の数。 */
export function tailBlank(flags) { let n = 0; for (let i = flags.length - 1; i >= 0 && flags[i]; i--) n++; return n; }
/** 最頻値。 */
export function mode(arr) { const m = new Map(); for (const v of arr) m.set(v, (m.get(v) || 0) + 1); return [...m].sort((a, b) => b[1] - a[1])[0]?.[0]; }

/** 数値からの疑いの一覧。 */
export function flagsFor(m, commonWidth) {
  const f = [];
  if (m.tailBlank >= 600) f.push(`末尾が空白（${m.tailBlank}px）`);
  else if (m.tailBlank < 8 && m.bottomTouch) f.push("末尾が切れている疑い（最下行まで中身が続く）");
  if (commonWidth && m.width !== commonWidth) f.push(`幅が他と違う（${m.width}px／多数は${commonWidth}px）`);
  if (m.coverage != null && m.coverage < 0.6) f.push(`切り出し範囲が小さい（全体の${Math.round(m.coverage * 100)}%）`);
  if (m.coverage != null && m.coverage > 1.5) f.push(`切り出し範囲が大きい（全体の${Math.round(m.coverage * 100)}%）`);
  if (m.height < 1500) f.push(`高さが小さい（${m.height}px）`);
  return f;
}

async function edgeRows(sharp, file, height, width, where, count) {
  const h = Math.min(count, height);
  const top = where === "top" ? 0 : height - h;
  const { data, info } = await sharp(file, { limitInputPixels: false }).extract({ left: 0, top, width, height: h }).raw().toBuffer({ resolveWithObject: true });
  const C = info.channels, flags = [];
  for (let y = 0; y < h; y++) {
    let mn = [255, 255, 255], mx = [0, 0, 0];
    for (let x = 0; x < width; x += 2) for (let c = 0; c < 3; c++) { const v = data[(y * width + x) * C + c]; if (v < mn[c]) mn[c] = v; if (v > mx[c]) mx[c] = v; }
    flags.push(Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) <= 12);
  }
  return flags;
}

async function findFull(src, lp, dev) {
  const d = (await ls(path.join(src, "01_案件別"))).find((e) => e.isDirectory() && e.name.startsWith(`${lp}_`));
  if (!d) return null;
  const f = (await ls(path.join(src, "01_案件別", d.name))).find((e) => e.isFile() && IMG.test(e.name) && e.name.includes(`_${dev}_全体.`));
  return f ? path.join(src, "01_案件別", d.name, f.name) : null;
}

async function sectionHeightSum(sharp, src, lp, dev) {
  let sum = 0, n = 0;
  for (const k of (await ls(path.join(src, "02_セクション別"))).filter((e) => e.isDirectory())) {
    for (const f of await ls(path.join(src, "02_セクション別", k.name, dev))) {
      if (f.isFile() && IMG.test(f.name) && f.name.startsWith(`${lp}_`)) { const m = await sharp(path.join(src, "02_セクション別", k.name, dev, f.name), { limitInputPixels: false }).metadata().catch(() => null); if (m) { sum += m.height; n++; } }
    }
  }
  return { sum, n };
}

async function makeSheets(sharp, items, dev, outDir) {
  const CELL_W = 240, LABEL = 20, PER = 16, COLS = 8, GAP = 8;
  const files = [];
  for (let s = 0; s * PER < items.length; s++) {
    const part = items.slice(s * PER, (s + 1) * PER), comps = [];
    let cellH = 0;
    const cells = [];
    for (const it of part) {
      const reg = Math.round(it.width * 1.2);
      const top = await sharp(it.file, { limitInputPixels: false }).extract({ left: 0, top: 0, width: it.width, height: Math.min(reg, it.height) }).resize({ width: CELL_W }).png().toBuffer();
      const bot = await sharp(it.file, { limitInputPixels: false }).extract({ left: 0, top: Math.max(0, it.height - reg), width: it.width, height: Math.min(reg, it.height) }).resize({ width: CELL_W }).png().toBuffer();
      const tm = await sharp(top).metadata(), bm = await sharp(bot).metadata();
      cells.push({ it, top, bot, th: tm.height, bh: bm.height });
      cellH = Math.max(cellH, LABEL + tm.height + 6 + bm.height);
    }
    cells.forEach((c, i) => {
      const left = GAP + (i % COLS) * (CELL_W + GAP), top = GAP + Math.floor(i / COLS) * (cellH + GAP);
      const flagged = c.it.flags.length ? "#c22" : "#222";
      comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CELL_W}" height="${LABEL}"><rect width="100%" height="100%" fill="${flagged}"/><text x="5" y="14" font-size="13" font-family="Helvetica,Arial,sans-serif" fill="#fff">${c.it.lp} ${dev}${c.it.flags.length ? " !" : ""}</text></svg>`), left, top });
      comps.push({ input: c.top, left, top: top + LABEL });
      comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CELL_W}" height="6"><rect width="100%" height="100%" fill="#e11"/></svg>`), left, top: top + LABEL + c.th });
      comps.push({ input: c.bot, left, top: top + LABEL + c.th + 6 });
    });
    const rows = Math.ceil(part.length / COLS);
    const out = path.join(outDir, `${dev}_${String(s + 1).padStart(2, "0")}.jpg`);
    await sharp({ create: { width: GAP + COLS * (CELL_W + GAP), height: GAP + rows * (cellH + GAP), channels: 3, background: "#eee" } }).composite(comps).jpeg({ quality: 70 }).toFile(out);
    files.push({ file: out, lps: part.map((p) => p.lp) });
  }
  return files;
}

async function main() {
  const { values: v } = parseArgs({ options: { src: { type: "string", default: DEFAULT_SRC }, lp: { type: "string" }, sheets: { type: "string", default: path.join(os.homedir(), "dis-edge-sheets") }, "no-sheets": { type: "boolean", default: false } } });
  const { default: sharp } = await import("sharp");
  const map = JSON.parse(await fs.readFile(path.join(REPO, "data/lp-renumber-map.json"), "utf8"));
  const expected = JSON.parse(await fs.readFile(path.join(REPO, "config/section-expected-gaps.json"), "utf8").catch(() => "{}")).items || {};
  const only = v.lp ? new Set(v.lp.split(",").map((s) => s.trim())) : null;
  const lps = map.items.map((i) => i.oldLp).filter((lp) => !only || only.has(lp));
  const rows = [];
  for (const lp of lps) for (const dev of ["PC", "SP"]) {
    if (expected[lp]?.[dev]) continue;
    const file = await findFull(v.src, lp, dev);
    if (!file) { rows.push({ lp, dev, file: null, flags: ["全体画像なし"] }); continue; }
    try {
      const meta = await sharp(file, { limitInputPixels: false }).metadata();
      const tail = await edgeRows(sharp, file, meta.height, meta.width, "bottom", 4000);
      const tb = tailBlank(tail);
      const { sum, n } = await sectionHeightSum(sharp, v.src, lp, dev);
      rows.push({ lp, dev, file, width: meta.width, height: meta.height, tailBlank: tb, bottomTouch: tail.length >= 8 && !tail.slice(-8).every(Boolean), coverage: n ? sum / meta.height : null, sectionCount: n });
    } catch (e) { rows.push({ lp, dev, file, flags: [`読めない: ${e.message}`] }); }
  }
  const common = {};
  for (const dev of ["PC", "SP"]) common[dev] = mode(rows.filter((r) => r.dev === dev && r.width).map((r) => r.width));
  for (const r of rows) if (!r.flags) r.flags = flagsFor(r, common[r.dev]);
  console.log(`対象LP: ${lps.length}（端末別 ${rows.length} 件）  多数派の幅: PC ${common.PC}px / SP ${common.SP}px`);
  const flagged = rows.filter((r) => r.flags.length);
  const byFlag = {};
  for (const r of flagged) for (const f of r.flags) { const k = f.replace(/（.*$/, ""); byFlag[k] = (byFlag[k] || 0) + 1; }
  console.log(`疑いあり: ${flagged.length} 件  ${JSON.stringify(byFlag)}`);
  for (const r of flagged) console.log(`  ${r.lp} ${r.dev}  ${r.flags.join(" / ")}${r.height ? `  [${r.width}×${r.height}]` : ""}`);
  const csv = ["lp,dev,width,height,tailBlank,bottomTouch,coverage,sectionCount,flags", ...rows.map((r) => [r.lp, r.dev, r.width ?? "", r.height ?? "", r.tailBlank ?? "", r.bottomTouch ?? "", r.coverage != null ? r.coverage.toFixed(2) : "", r.sectionCount ?? "", `"${r.flags.join(" / ")}"`].join(","))].join("\n") + "\n";
  await fs.writeFile(path.join(REPO, "data/full-edge-audit.csv"), csv);
  console.log("\n書き出し: data/full-edge-audit.csv");
  if (!v["no-sheets"]) {
    await fs.mkdir(v.sheets, { recursive: true });
    const manifest = {};
    for (const dev of ["PC", "SP"]) {
      const items = rows.filter((r) => r.dev === dev && r.width).map((r) => ({ lp: r.lp, file: r.file, width: r.width, height: r.height, flags: r.flags }));
      manifest[dev] = await makeSheets(sharp, items, dev, v.sheets);
    }
    await fs.writeFile(path.join(v.sheets, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    console.log(`見比べシート: ${v.sheets}/PC_01.jpg … / SP_01.jpg …（1枚に16LP。赤いラベル=疑いあり。上=先頭、赤線の下=末尾）`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(e.message); process.exit(1); });
