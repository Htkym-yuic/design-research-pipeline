/**
 * 撮影した画像の揃いを検査する。LPの取り込み手順（原本）と既存の crosscheck-lp の基準に合わせる:
 *   PC: full / first_view（幅1000px以上）、sections（幅600px以上）
 *   SP: full / first_view（幅430px以下）、sections（幅600px以上）
 *   Notion用JPEG: 4枚（PC・SPの first_view と sections）、幅720px以下、5MB未満
 * crosscheck-lp 自体は metadata.id が LP-0000 形式であることを要求するため、DISのID（DIS-LP-0001 など）には使えない。
 */
import fs from "node:fs/promises";
import path from "node:path";

const NOTION_MAX = 5 * 1024 * 1024;

async function inspect(file) {
  const { default: sharp } = await import("sharp");
  try { return { ...(await sharp(file, { limitInputPixels: false }).metadata()), bytes: (await fs.stat(file)).size }; } catch { return null; }
}

export async function checkAssetSet(dir, { id, media, archive = false, devices = ["pc", "sp"] }) {
  const errors = [];
  const warnings = [];
  const normal = path.join(dir, "01_Normal_Images");
  const notion = path.join(dir, "02_Notion_Images");
  const need = async (file, label, rule = {}) => {
    const m = await inspect(file);
    if (!m) { errors.push(`${label} がない、または画像として読めない（${path.relative(dir, file)}）`); return null; }
    // アーカイブ画像で作った場合、元画像の幅は選べないため、幅の基準は警告にとどめる（画像の有無・読めること・容量は従来どおり必須）
    const widthIssue = archive ? (msg) => warnings.push(`${msg}（アーカイブ画像のため警告）`) : (msg) => errors.push(msg);
    if (rule.minWidth && m.width < rule.minWidth) widthIssue(`${label} の幅が${m.width}px（${rule.minWidth}px以上が必要）`);
    if (rule.maxWidth && m.width > rule.maxWidth) widthIssue(`${label} の幅が${m.width}px（${rule.maxWidth}px以下が必要）`);
    if (rule.maxBytes && m.bytes >= rule.maxBytes) errors.push(`${label} が${(m.bytes / 1048576).toFixed(1)}MB（5MB未満が必要）`);
    return m;
  };
  if (media === "banner") {
    const ext = (await fs.readdir(normal).catch(() => [])).find((f) => /^banner\.(png|jpe?g|webp|gif)$/i.test(f));
    if (!ext) errors.push("01_Normal_Images/banner.* がない");
    else await need(path.join(normal, ext), "バナー原本");
    await need(path.join(notion, "banner_notion.jpg"), "Notion用バナー画像", { maxBytes: NOTION_MAX });
  } else {
    let rules = [["PC_full", { minWidth: 1000 }], ["PC_first_view", { minWidth: 1000 }], ["PC_sections", { minWidth: 600 }], ["SP_full", { maxWidth: 430 }], ["SP_first_view", { maxWidth: 430 }], ["SP_sections", { minWidth: 600 }]];
    // アーカイブ画像が1枚だけ（PCのみ）の場合は、SPの項目は検査せず、警告にとどめる
    let noSp = archive && !(await fs.stat(path.join(normal, `${id}_SP_full.png`)).catch(() => null));
    if (noSp) warnings.push("アーカイブ画像が1枚のため、SPの画像はありません");
    // PCのみ／SPのみの案件（device 指定）では、ないほうの画像は検査しない
    noSp = noSp || !devices.includes("sp");
    const noPc = !devices.includes("pc");
    if (!devices.includes("sp") && !archive) warnings.push("PCのみの案件のため、SPの画像は検査しない");
    if (noPc) warnings.push("SPのみの案件のため、PCの画像は検査しない");
    const skip = (k) => (noSp && k.startsWith("SP_")) || (noPc && k.startsWith("PC_"));
    rules = rules.filter(([k]) => !skip(k));
    for (const [k, rule] of rules) await need(path.join(normal, `${id}_${k}.png`), k, rule);
    for (const k of ["PC_first_view", "PC_sections", "SP_first_view", "SP_sections"].filter((k) => !skip(k))) await need(path.join(notion, `${id}_${k}_notion.jpg`), `Notion用 ${k}`, { maxWidth: 720, maxBytes: NOTION_MAX });
    const secs = await fs.readdir(path.join(normal, "sections")).catch(() => []);
    if (!noPc && !secs.some((f) => /^pc_\d+\.jpg$/.test(f))) errors.push("sections/ にPCの分割画像がない");
    if (!noSp && !secs.some((f) => /^sp_\d+\.jpg$/.test(f))) errors.push("sections/ にSPの分割画像がない");
  }
  return { ok: errors.length === 0, errors, warnings };
}
