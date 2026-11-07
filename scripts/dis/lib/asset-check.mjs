/**
 * 撮影した画像の揃いを検査する。LPの取り込み手順（原本）と既存の crosscheck-lp の基準に合わせる:
 *   PC: full / first_view（幅1000px以上）、sections（幅600px以上）
 *   SP: full / first_view（幅430px以下）、sections（幅600px以上）
 *   Notion用JPEG: 4枚（PC・SPの first_view と sections）、幅720px以下、5MB未満
 * crosscheck-lp 自体は metadata.id が LP-0000 形式であることを要求するため、DISのID（DIS-LP-YYYYMMDD）には使えない。
 */
import fs from "node:fs/promises";
import path from "node:path";

const NOTION_MAX = 5 * 1024 * 1024;

async function inspect(file) {
  const { default: sharp } = await import("sharp");
  try { return { ...(await sharp(file, { limitInputPixels: false }).metadata()), bytes: (await fs.stat(file)).size }; } catch { return null; }
}

export async function checkAssetSet(dir, { id, media }) {
  const errors = [];
  const warnings = [];
  const normal = path.join(dir, "01_Normal_Images");
  const notion = path.join(dir, "02_Notion_Images");
  const need = async (file, label, rule = {}) => {
    const m = await inspect(file);
    if (!m) { errors.push(`${label} がない、または画像として読めない（${path.relative(dir, file)}）`); return null; }
    if (rule.minWidth && m.width < rule.minWidth) errors.push(`${label} の幅が${m.width}px（${rule.minWidth}px以上が必要）`);
    if (rule.maxWidth && m.width > rule.maxWidth) errors.push(`${label} の幅が${m.width}px（${rule.maxWidth}px以下が必要）`);
    if (rule.maxBytes && m.bytes >= rule.maxBytes) errors.push(`${label} が${(m.bytes / 1048576).toFixed(1)}MB（5MB未満が必要）`);
    return m;
  };
  if (media === "banner") {
    const ext = (await fs.readdir(normal).catch(() => [])).find((f) => /^banner\.(png|jpe?g|webp|gif)$/i.test(f));
    if (!ext) errors.push("01_Normal_Images/banner.* がない");
    else await need(path.join(normal, ext), "バナー原本");
    await need(path.join(notion, "banner_notion.jpg"), "Notion用バナー画像", { maxBytes: NOTION_MAX });
  } else {
    const rules = [["PC_full", { minWidth: 1000 }], ["PC_first_view", { minWidth: 1000 }], ["PC_sections", { minWidth: 600 }], ["SP_full", { maxWidth: 430 }], ["SP_first_view", { maxWidth: 430 }], ["SP_sections", { minWidth: 600 }]];
    for (const [k, rule] of rules) await need(path.join(normal, `${id}_${k}.png`), k, rule);
    for (const k of ["PC_first_view", "PC_sections", "SP_first_view", "SP_sections"]) await need(path.join(notion, `${id}_${k}_notion.jpg`), `Notion用 ${k}`, { maxWidth: 720, maxBytes: NOTION_MAX });
    const secs = await fs.readdir(path.join(normal, "sections")).catch(() => []);
    if (!secs.some((f) => /^pc_\d+\.jpg$/.test(f))) errors.push("sections/ にPCの分割画像がない");
    if (!secs.some((f) => /^sp_\d+\.jpg$/.test(f))) errors.push("sections/ にSPの分割画像がない");
  }
  return { ok: errors.length === 0, errors, warnings };
}
