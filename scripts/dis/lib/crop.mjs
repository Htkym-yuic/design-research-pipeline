import fs from "node:fs/promises";
import path from "node:path";

/** Sectionの種類（LP・Web。ファイル名にも使う）。分析の units[].roleType は、媒体に応じた一覧から選ぶ。 */
export const SECTION_TYPES = ["FV", "悩み提起", "共感", "解決策", "ベネフィット", "特徴", "実績", "比較", "商品紹介", "料金", "流れ", "FAQ", "CTA", "会社情報", "ナビ", "フッター", "その他"];
/** バナーは、セクションではなく「要素」の構成のため、別の一覧を使う（CTA・ベネフィット・その他は、Sectionの種類と共通）。 */
export const BANNER_ELEMENT_TYPES = ["キービジュアル", "人物・キャラ", "商品画像", "UI・証拠", "キャッチコピー", "補足コピー", "ベネフィット", "オファー", "CTA", "ロゴ", "注釈・権利", "背景・装飾", "その他"];
/** 全部（索引・旧データの判定用）。 */
export const ROLE_TYPES = [...new Set([...SECTION_TYPES, ...BANNER_ELEMENT_TYPES])];
/** 媒体（lp / web / banner）ごとの、選べる種類。 */
export const roleTypesFor = (media) => (media === "banner" ? BANNER_ELEMENT_TYPES : media === "lp" || media === "web" ? SECTION_TYPES : ROLE_TYPES);

export const SECTION_DIR = "sections_by_unit";

const safe = (s) => String(s).replace(/[\\/:*?"<>|\s]+/g, "_");

/**
 * 行ごとの輝度のばらつき（余白の判定に使う）を計算する。
 */
export async function rowVariance(file, { width = 240 } = {}) {
  const { default: sharp } = await import("sharp");
  const meta = await sharp(file, { limitInputPixels: false }).metadata();
  const { data, info } = await sharp(file, { limitInputPixels: false }).resize({ width, fit: "fill", height: Math.round((meta.height * width) / meta.width) }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const rows = new Float64Array(info.height);
  for (let y = 0; y < info.height; y++) {
    let sum = 0, sq = 0;
    for (let x = 0; x < info.width; x++) { const v = data[y * info.width + x]; sum += v; sq += v * v; }
    const mean = sum / info.width;
    rows[y] = sq / info.width - mean * mean;
  }
  return { rows, scale: meta.height / info.height, height: meta.height, width: meta.width };
}

/** 余白とみなす、行ごとの輝度のばらつきの上限（0〜255の輝度の分散）。写真や模様の行は、これより大きい。 */
export const BLANK_VARIANCE = 12;
/** 吸着で動かしてよい最大の距離（元画像のpx）。縦に長いページでも、遠くの余白へ飛ばないための上限。 */
export const MAX_SNAP_PX = 90;

/**
 * 目測の境界の近くに、「余白とみなせる行」があるときだけ、そこへ寄せる。なければ、目測の位置のまま。
 * 探す幅は、全体の windowFrac と MAX_SNAP_PX の小さいほう。余白どうしでは、元の位置に近い行を選ぶ。
 */
export function snapBoundary(est, { rows, scale, height }, windowFrac = 0.03) {
  if (est <= 0) return 0;
  if (est >= 1) return height;
  const center = Math.round((est * height) / scale);
  const winPx = Math.min(windowFrac * height, MAX_SNAP_PX);
  const win = Math.max(3, Math.round(winPx / scale));
  let best = -1, bestDist = Infinity;
  for (let y = Math.max(1, center - win); y <= Math.min(rows.length - 1, center + win); y++) {
    if (rows[y] > BLANK_VARIANCE) continue; // 余白ではない行は、候補にしない
    const d = Math.abs(y - center);
    if (d < bestDist) { bestDist = d; best = y; }
  }
  return best < 0 ? Math.min(height, Math.round(est * height)) : Math.min(height, Math.round(best * scale));
}

/** 分析の各Unitの regions（正規化した縦の範囲）で、全体画像をSectionごとに切り出す。pc/sp それぞれ、画像と範囲がある場合のみ。 */
export async function cropSections(itemDir, analysis, { id }) {
  const { default: sharp } = await import("sharp");
  const normal = path.join(itemDir, "files", "01_Normal_Images");
  const outDir = path.join(normal, SECTION_DIR);
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });
  const produced = [];
  const warnings = [];
  const units = analysis.units || [];
  for (const dev of ["pc", "sp"]) {
    const src = path.join(normal, `${id}_${dev.toUpperCase()}_full.png`);
    const exists = await fs.access(src).then(() => true, () => false);
    const targets = units.map((u, i) => ({ u, i, r: u.regions?.[dev] })).filter((t) => t.r);
    if (!targets.length) continue;
    if (!exists) { warnings.push(`${dev.toUpperCase()}の全体画像がないため、${dev}のSectionは切り出していません`); continue; }
    const stats = await rowVariance(src);
    const snapped = new Map(); // 同じ境界は、1回だけ吸着（隣り合うSectionが、重ならず・隙間なく切れる）
    const snap = (v) => { const k = Math.round(v * 1000); if (!snapped.has(k)) snapped.set(k, snapBoundary(v, stats)); return snapped.get(k); };
    for (const t of targets) {
      const y0 = snap(t.r.y0), y1 = snap(t.r.y1);
      if (y1 - y0 < 20) { warnings.push(`${dev}_${String(t.i + 1).padStart(2, "0")}: 切り出しの高さが小さすぎるためスキップ（${y1 - y0}px）`); continue; }
      const name = `${dev}_${String(t.i + 1).padStart(2, "0")}_${safe(t.u.roleType || "その他")}.png`;
      const file = path.join(outDir, name);
      await sharp(src, { limitInputPixels: false }).extract({ left: 0, top: y0, width: stats.width, height: y1 - y0 }).png().toFile(file);
      produced.push({ local: file, rel: `01_Normal_Images/${SECTION_DIR}/${name}`, unitId: t.u.id, device: dev, y0, y1 });
    }
  }
  await fs.writeFile(path.join(outDir, "index.json"), JSON.stringify(produced.map(({ rel, unitId, device, y0, y1 }) => ({ file: path.basename(rel), unitId, device, y0, y1 })), null, 2) + "\n");
  return { produced, warnings };
}
