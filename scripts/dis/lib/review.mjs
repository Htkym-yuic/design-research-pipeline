import path from "node:path";
import fs from "node:fs/promises";
import { sniffImage } from "./capture.mjs";

const UA = "design-research-pipeline-dis/1.0 (public-pages-only)";

/**
 * 比較対象の候補のサムネイル（公開されている画像1枚ずつ）を取得し、番号付きの一覧画像（コンタクトシート）にまとめる。
 * レビュー用にローカルへ保存するだけで、DropboxやNotionへは送らない。画像が取れない候補は番号付きの空欄にする。
 */
export async function buildContactSheet(items, outFile, { fetchImpl = fetch, cols = 3, cell = { w: 360, h: 240 }, maxBytes = 5 * 1024 * 1024 } = {}) {
  const { default: sharp } = await import("sharp");
  const gap = 10;
  const rows = Math.max(1, Math.ceil(items.length / cols));
  const composites = [];
  const results = [];
  for (const [i, it] of items.entries()) {
    let tile = null; let note = null;
    if (it.imageUrl) {
      try {
        const res = await fetchImpl(it.imageUrl, { headers: { "User-Agent": UA } });
        if (!res.ok) note = `HTTP ${res.status}`;
        else {
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length > maxBytes) note = "サイズ上限超過";
          else if (!sniffImage(buf)) note = "画像として読めない";
          else tile = await sharp(buf).resize(cell.w, cell.h, { fit: "cover" }).jpeg({ quality: 80 }).toBuffer();
        }
      } catch (e) { note = e.message; }
    } else note = "画像URLなし";
    if (!tile) tile = await sharp({ create: { width: cell.w, height: cell.h, channels: 3, background: "#d8d8d8" } }).jpeg().toBuffer();
    const badge = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cell.w}" height="${cell.h}"><rect x="0" y="0" width="52" height="52" fill="#000"/><text x="26" y="38" font-size="32" text-anchor="middle" fill="#fff" font-family="Arial, Helvetica, sans-serif" font-weight="bold">${i + 1}</text></svg>`);
    const labeled = await sharp(tile).composite([{ input: badge }]).jpeg({ quality: 80 }).toBuffer();
    composites.push({ input: labeled, left: gap + (i % cols) * (cell.w + gap), top: gap + Math.floor(i / cols) * (cell.h + gap) });
    results.push({ no: i + 1, image: note ? `なし（${note}）` : "あり" });
  }
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await sharp({ create: { width: gap + cols * (cell.w + gap), height: gap + rows * (cell.h + gap), channels: 3, background: "#ffffff" } })
    .composite(composites).jpeg({ quality: 82 }).toFile(outFile);
  return results;
}

/** learning.json（{items:[{no|pageUrl, learningValue, reason}]}）を候補へ反映する。0〜1の範囲外・未知の候補は拒否する。 */
export function applyLearning(candidates, learning, reviewItems = []) {
  const errors = [];
  const byNo = new Map(reviewItems.map((r) => [r.no, r.pageUrl]));
  const byUrl = new Map(candidates.map((c) => [c.pageUrl, c]));
  let applied = 0;
  for (const it of learning?.items || []) {
    const url = it.pageUrl || byNo.get(it.no);
    const c = byUrl.get(url);
    if (!c) { errors.push(`候補が見つからない: ${it.no ?? it.pageUrl}`); continue; }
    const v = Number(it.learningValue);
    if (!(v >= 0 && v <= 1)) { errors.push(`learningValueは0〜1: ${it.no ?? it.pageUrl}`); continue; }
    if (!String(it.reason || "").trim()) { errors.push(`理由(reason)が必須: ${it.no ?? it.pageUrl}`); continue; }
    c.signals = { ...(c.signals || {}), learningValue: v };
    c.reviewReason = String(it.reason).trim();
    applied++;
  }
  return { applied, errors };
}
