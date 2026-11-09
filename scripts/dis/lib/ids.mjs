import fs from "node:fs/promises";
import path from "node:path";

/** 連番ID（例: DIS-LP-0001）。旧形式（DIS-LP-YYYYMMDD）は既存データなので変更せず、連番の計算にも含めない。 */
export const serialPattern = (prefix, code) => new RegExp(`^${prefix}-${code}-(\\d{4})$`);

export function formatDisId(prefix, code, n) {
  if (!Number.isInteger(n) || n < 1 || n > 9999) throw new Error(`連番が範囲外です: ${n}`);
  return `${prefix}-${code}-${String(n).padStart(4, "0")}`;
}

export function isSerialId(id, prefix, code) { return serialPattern(prefix, code).test(String(id || "")); }

/** 台帳（登録済み）と、作業中の予約（各日の selection.json に採番済みのID）の最大値＋1。欠番は許容、再利用はしない。 */
export function nextSerial({ ledgerEntries = [], reservedIds = [], prefix, code }) {
  const re = serialPattern(prefix, code);
  const nums = [...ledgerEntries.map((e) => e.disId), ...reservedIds].map((id) => String(id || "").match(re)?.[1]).filter(Boolean).map(Number);
  return (nums.length ? Math.max(...nums) : 0) + 1;
}

/** outputs/dis/<日付>/<media>/selection.json に採番済みのIDを集める（読み取りのみ）。 */
export async function reservedIdsFromOutputs(outDir, media) {
  const ids = [];
  let days = [];
  try { days = await fs.readdir(outDir); } catch { return ids; }
  for (const day of days) {
    try {
      for (const sub of await fs.readdir(path.join(outDir, day))) {
        if (sub !== media && !sub.startsWith(`${media}-url-`)) continue; // 手動指定の作業フォルダ（<media>-url-<tag>）も含める
        try {
          const sel = JSON.parse(await fs.readFile(path.join(outDir, day, sub, "selection.json"), "utf8"));
          if (sel?.selected?.disId) ids.push(sel.selected.disId);
          if (sel?.previousAssignment?.disId) ids.push(sel.previousAssignment.disId); // 一時的に未選定でも、番号は予約のまま
        } catch { /* なければ無視 */ }
      }
    } catch { /* なければ無視 */ }
  }
  return ids;
}
