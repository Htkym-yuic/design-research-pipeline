#!/usr/bin/env node
/**
 * セクション画像の「画像を見る確認」のための、確認用シートを作る（Dropbox・Notionは変更しない。読むだけ）。
 * LPごと・端末（PC/SP）ごとに、2枚のJPEGを、ローカルの作業フォルダに作る。
 *   <LP>_<PC|SP>_full.jpg      全体画像を、縦に区切って横に並べた図（ページ全体の流れが1枚で見える）
 *   <LP>_<PC|SP>_sections.jpg  02_セクション別 にある切り出し画像の一覧（#番号と種類コード K01〜K16 を、画像の上に表示）
 *   <LP>.manifest.json         #番号 → ファイル名・種類フォルダの対応
 *
 *   node scripts/dis/section-review-prep.mjs --lp LP-0001,LP-0002        # 指定したLPだけ
 *   node scripts/dis/section-review-prep.mjs --from 1 --to 20             # 番号の範囲
 *   オプション: --src <10_LP> --out ~/dis-review-sheets --force
 * ・出力先は Dropbox の外（既定: ホーム直下の dis-review-sheets）。既にあるシートは、--force がなければ作り直さない。
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const DEFAULT_SRC = path.join(os.homedir(), "Library/CloudStorage/Dropbox/10_デザイン/01_言語化ラボ/10_LP");
const IMG = /\.(png|jpe?g|webp)$/i;
const ls = (d) => fs.readdir(d, { withFileTypes: true }).catch(() => []);

/** 全体画像を、高さ seg ごとに区切るときの、各区間の [top, height]。 */
export function sliceRanges(total, seg) {
  const out = [];
  for (let top = 0; top < total; top += seg) out.push([top, Math.min(seg, total - top)]);
  return out;
}
/** n 個のセルを cols 列に並べたときの、各セルの左上座標。 */
export function gridPositions(n, cols, cellW, cellH, gap = 12) {
  return Array.from({ length: n }, (_, i) => ({ left: gap + (i % cols) * (cellW + gap), top: gap + Math.floor(i / cols) * (cellH + gap) }));
}
export const kindCode = (kindFolder) => `K${String(kindFolder).slice(0, 2)}`;

export async function collect(src, lp) {
  const caseDirs = (await ls(path.join(src, "01_案件別"))).filter((e) => e.isDirectory() && e.name.startsWith(`${lp}_`));
  const full = { PC: null, SP: null };
  for (const d of caseDirs) {
    const stack = [path.join(src, "01_案件別", d.name)];
    while (stack.length) {
      const dir = stack.pop();
      for (const e of await ls(dir)) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) stack.push(p);
        else if (IMG.test(e.name)) for (const dev of ["PC", "SP"]) if (e.name.includes(`_${dev}_全体.`)) full[dev] = p;
      }
    }
  }
  const sections = { PC: [], SP: [] };
  const kinds = (await ls(path.join(src, "02_セクション別"))).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  for (const k of kinds) for (const dev of ["PC", "SP"]) {
    const files = (await ls(path.join(src, "02_セクション別", k, dev))).filter((e) => e.isFile() && IMG.test(e.name) && e.name.startsWith(`${lp}_`)).map((e) => e.name).sort();
    for (const f of files) sections[dev].push({ kind: k, file: f, path: path.join(src, "02_セクション別", k, dev, f) });
  }
  return { full, sections };
}

async function fullSheet(sharp, file, out) {
  const meta = await sharp(file, { limitInputPixels: false }).metadata();
  const W = 340, scale = W / meta.width, totalH = Math.round(meta.height * scale), SEG = 1500;
  const ranges = sliceRanges(totalH, SEG);
  const base = await sharp(file, { limitInputPixels: false }).resize({ width: W }).png().toBuffer();
  const parts = [];
  for (const [top, h] of ranges) parts.push(await sharp(base).extract({ left: 0, top, width: W, height: h }).png().toBuffer());
  const gap = 14, cols = parts.length;
  await sharp({ create: { width: gap + cols * (W + gap), height: SEG + 2 * gap, channels: 3, background: "#ffffff" } })
    .composite(parts.map((b, i) => ({ input: b, left: gap + i * (W + gap), top: gap }))).jpeg({ quality: 72 }).toFile(out);
  return { columns: cols, scaledHeight: totalH };
}

async function sectionsSheet(sharp, items, out) {
  const cellW = 300, cellH = 640, label = 26, cols = Math.min(5, Math.max(1, items.length));
  const pos = gridPositions(items.length, cols, cellW, cellH + label);
  const comps = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const thumb = await sharp(it.path, { limitInputPixels: false }).resize({ width: cellW, height: cellH, fit: "inside", withoutEnlargement: true }).png().toBuffer();
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cellW}" height="${label}"><rect width="100%" height="100%" fill="#222"/><text x="8" y="19" font-size="16" font-family="Helvetica,Arial,sans-serif" fill="#fff">#${String(i + 1).padStart(2, "0")}  ${kindCode(it.kind)}</text></svg>`);
    comps.push({ input: svg, ...pos[i] }, { input: thumb, left: pos[i].left, top: pos[i].top + label });
  }
  const rows = Math.ceil(items.length / cols);
  await sharp({ create: { width: 12 + cols * (cellW + 12), height: 12 + rows * (cellH + label + 12), channels: 3, background: "#eeeeee" } }).composite(comps).jpeg({ quality: 72 }).toFile(out);
}

async function main() {
  const { values: v } = parseArgs({ options: {
    src: { type: "string", default: DEFAULT_SRC }, out: { type: "string", default: path.join(os.homedir(), "dis-review-sheets") },
    lp: { type: "string" }, from: { type: "string" }, to: { type: "string" }, force: { type: "boolean", default: false },
  } });
  const { default: sharp } = await import("sharp");
  let lps = v.lp ? v.lp.split(",").map((s) => s.trim()) : [];
  if (!lps.length && v.from) for (let n = Number(v.from); n <= Number(v.to || v.from); n++) lps.push(`LP-${String(n).padStart(4, "0")}`);
  if (!lps.length) { console.error("--lp LP-0001,LP-0002 または --from 1 --to 20 を指定してください。"); process.exit(1); }
  await fs.mkdir(v.out, { recursive: true });
  for (const lp of lps) {
    const { full, sections } = await collect(v.src, lp);
    const manifest = { lp, sheets: [], sections: { PC: [], SP: [] } };
    for (const dev of ["PC", "SP"]) {
      sections[dev].forEach((s, i) => manifest.sections[dev].push({ index: i + 1, kind: s.kind, code: kindCode(s.kind), file: s.file }));
      const fOut = path.join(v.out, `${lp}_${dev}_full.jpg`), sOut = path.join(v.out, `${lp}_${dev}_sections.jpg`);
      if (full[dev] && (v.force || !(await fs.access(fOut).then(() => true, () => false)))) { try { manifest.sheets.push({ dev, type: "full", file: path.basename(fOut), ...(await fullSheet(sharp, full[dev], fOut)) }); } catch (e) { console.warn(`  ${lp} ${dev} 全体: ${e.message}`); } }
      if (sections[dev].length && (v.force || !(await fs.access(sOut).then(() => true, () => false)))) { try { await sectionsSheet(sharp, sections[dev], sOut); manifest.sheets.push({ dev, type: "sections", file: path.basename(sOut), count: sections[dev].length }); } catch (e) { console.warn(`  ${lp} ${dev} 切り出し: ${e.message}`); } }
    }
    await fs.writeFile(path.join(v.out, `${lp}.manifest.json`), JSON.stringify(manifest, null, 2) + "\n");
    console.log(`${lp}: 全体 PC${full.PC ? "○" : "×"} SP${full.SP ? "○" : "×"} / 切り出し PC${sections.PC.length} SP${sections.SP.length}`);
  }
  console.log(`\n出力先: ${v.out}（Dropboxの外。元画像は変更していません）`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(e.message); process.exit(1); });
