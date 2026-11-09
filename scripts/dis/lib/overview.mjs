import fs from "node:fs/promises";
import path from "node:path";

/** Notionの本文に載せる、Sectionごとの全体図のファイル名（02_Notion_Images/{ID}_PC_units_notion.jpg）。 */
export const OVERVIEW_KEY = "PC_units";
export const OVERVIEW_CAPTION = "セクション全体図（番号・種類は分析のUnit順。PC優先、なければSP）";

const COLS = 4, TILE_W = 340, GAP = 18, LABEL_H = 40, PAD = 24, TITLE_H = 70;
const FONT = "Hiragino Sans, Noto Sans CJK JP, Noto Sans JP, sans-serif";
const MAX_BYTES = 4.5 * 1024 * 1024; // Notionの画像の上限（5MB）に収める

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/**
 * Sectionごとの切り出し画像（cropSections の produced）を、ラベル（番号と種類）つきで、1枚の全体図にまとめる。
 * 各Unitは、PCの切り出しがあればPC、なければSPを使う（SPのときはラベルに「（SP）」）。
 * 出力: <案件フォルダ>/files/02_Notion_Images/{id}_PC_units_notion.jpg。Unitごとの切り出しがなければ null。
 * 機械的な全体画像・切り出しの元画像は変更しない。
 */
export async function buildUnitOverview(itemDir, analysis, { id, produced }) {
  const { default: sharp } = await import("sharp");
  const units = analysis.units || [];
  const tiles = [];
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    const pick = (dev) => produced.find((p) => p.unitId === u.id && p.device === dev);
    const p = pick("pc") || pick("sp");
    if (!p) continue;
    const buf = await sharp(p.local, { limitInputPixels: false }).resize({ width: TILE_W }).jpeg({ quality: 82 }).toBuffer();
    const { height } = await sharp(buf).metadata();
    tiles.push({ no: String(i + 1).padStart(2, "0"), role: u.roleType || "その他", device: p.device, buf, height });
  }
  if (!tiles.length) return null;

  // 一番低い列に、順に積む（縦に長いSectionがあっても、全体が1枚に収まる）
  const colH = Array(COLS).fill(PAD + TITLE_H);
  const placed = tiles.map((t) => {
    const c = colH.indexOf(Math.min(...colH));
    const at = { ...t, left: PAD + c * (TILE_W + GAP), top: colH[c] };
    colH[c] += LABEL_H + 4 + t.height + GAP;
    return at;
  });
  const width = PAD * 2 + COLS * TILE_W + (COLS - 1) * GAP;
  const height = Math.max(...colH) + PAD - GAP;

  const title = `<svg width="${width}" height="${TITLE_H}" xmlns="http://www.w3.org/2000/svg"><text x="${PAD}" y="46" font-size="30" font-weight="700" font-family="${FONT}" fill="#222">${esc(analysis.disId || id)} ${esc(analysis.brand)} ／ セクション全体図</text></svg>`;
  const layers = [{ input: Buffer.from(title), left: 0, top: 0 }];
  for (const p of placed) {
    const tag = p.device === "sp" ? "（SP）" : "";
    const label = `<svg width="${TILE_W}" height="${LABEL_H}" xmlns="http://www.w3.org/2000/svg"><rect width="${TILE_W}" height="${LABEL_H}" rx="6" fill="#222"/><text x="12" y="27" font-size="20" font-weight="700" font-family="${FONT}" fill="#fff">${p.no}  ${esc(p.role)}${tag}</text></svg>`;
    layers.push({ input: Buffer.from(label), left: p.left, top: p.top });
    layers.push({ input: p.buf, left: p.left, top: p.top + LABEL_H + 4 });
  }

  const outDir = path.join(itemDir, "files", "02_Notion_Images");
  await fs.mkdir(outDir, { recursive: true });
  const file = path.join(outDir, `${id}_${OVERVIEW_KEY}_notion.jpg`);
  let quality = 82, out;
  const base = sharp({ create: { width, height, channels: 3, background: "#f2f2f2" } }).composite(layers);
  for (; quality >= 40; quality -= 14) {
    out = await base.clone().jpeg({ quality }).toBuffer();
    if (out.length <= MAX_BYTES) break;
  }
  await fs.writeFile(file, out);
  return { local: file, rel: `02_Notion_Images/${id}_${OVERVIEW_KEY}_notion.jpg`, width, height, bytes: out.length, tiles: tiles.length };
}
