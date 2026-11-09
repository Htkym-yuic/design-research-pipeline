import path from "node:path";
import fs from "node:fs/promises";
import { sniffImage } from "./capture.mjs";

/** 画像の縦横比に応じた切り出し方。縦長（ページ全体のサムネイル）は上端＝ファーストビューを使い、それ以外は全体が入るように余白つきで縮小する。 */
export function tileFit({ width, height }) {
  return height / width > 1.5 ? { fit: "cover", position: "north" } : { fit: "contain", background: "#e8e8e8" };
}

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
          else {
            const meta = await sharp(buf).metadata();
            tile = await sharp(buf).resize(cell.w, cell.h, tileFit(meta)).jpeg({ quality: 80 }).toBuffer();
          }
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

export const CRITERIA_KEYS = ["clarity", "uniqueness", "reproducibility", "practicality", "materials", "sourcing"];

/** review.json に添える、機械的に決められる2項目（資料の十分さ・出典の健全さ）の目安。人が上書きしてよい。 */
export function suggestCriteria(c, media) {
  const sourcing = c.pageUrl && !c.originUnresolved && c.termsStatus === "known" ? 3 : c.originUnresolved && c.imageUrl ? 1 : c.pageUrl ? 2 : 0;
  const materials = media === "banner" ? (c.imageUrl ? 3 : 0) : c.pageUrl ? 3 : 1;
  return { materials, sourcing };
}

/**
 * learning.json（{items:[{no|pageUrl, criteria:{clarity,…各0〜3の整数}, reason}]}）を候補へ反映する。
 * 合計（最大18）を reviewTotal に、合計/18 を signals.learningValue に入れる。欠け・範囲外・理由なし・未知の候補は拒否する。
 */
export function applyLearning(candidates, learning, reviewItems = []) {
  const errors = [];
  const byNo = new Map(reviewItems.map((r) => [r.no, r.pageUrl]));
  const byUrl = new Map(candidates.map((c) => [c.pageUrl, c]));
  let applied = 0;
  for (const it of learning?.items || []) {
    const label = it.no ?? it.pageUrl;
    const c = byUrl.get(it.pageUrl || byNo.get(it.no));
    if (!c) { errors.push(`候補が見つからない: ${label}`); continue; }
    const crit = it.criteria || {};
    const bad = CRITERIA_KEYS.filter((k) => !(Number.isInteger(crit[k]) && crit[k] >= 0 && crit[k] <= 3));
    if (bad.length) { errors.push(`criteria は ${CRITERIA_KEYS.join("/")} の6項目すべてが0〜3の整数: ${label}（不正: ${bad.join(",")}）`); continue; }
    if (!String(it.reason || "").trim()) { errors.push(`理由(reason)が必須: ${label}`); continue; }
    const total = CRITERIA_KEYS.reduce((n, k) => n + crit[k], 0);
    c.reviewCriteria = Object.fromEntries(CRITERIA_KEYS.map((k) => [k, crit[k]]));
    c.reviewTotal = total;
    c.signals = { ...(c.signals || {}), learningValue: total / 18 };
    c.reviewReason = String(it.reason).trim();
    applied++;
  }
  return { applied, errors };
}

/** 手動指定の選定理由に入れる「良い点」の未記入マーカー。残っていると、検証が通らない。 */
export const MANUAL_REASON_PLACEHOLDER = "良い点: （分析時に記入）";

/** 手動指定の注記（選定理由の最後に付ける）: 選定したのはユーザーであること、実ページが取れずアーカイブ画像で分析した場合はその旨。 */
export const manualNote = (sel) => `（ユーザーが選定${sel?.captureMode === "archive" ? "。実ページは取得できなかったため、LPアーカイブ掲載の画像のみを根拠とする" : ""}）`;

const CRITERIA_LABELS = { clarity: "構成の明快さ", uniqueness: "独自性・再発見性", reproducibility: "再現可能性", practicality: "実務との近さ", materials: "資料の十分さ", sourcing: "出典・取得の健全さ" };

/**
 * 分析の「選定理由」の既定文。
 *  - 手動指定: 「良い点: …」（分析時に記入。未記入のままでは検証が通らない）を先頭に、最後に注記「（ユーザーが選定。…）」を付ける。実ページが取れずアーカイブ画像で分析した場合は、その旨も注記に入れる
 *  - 自動: 候補レビューで書いた「良い点」（reviewReason）と、6項目の点数をそのまま使う
 */
export function defaultSelectionReason(sel) {
  if (sel?.manual) return `${MANUAL_REASON_PLACEHOLDER}${manualNote(sel)}`;
  if (sel?.reviewReason) {
    const c = sel.reviewCriteria;
    const detail = c ? `（選定評価 ${sel.reviewTotal}/18: ${CRITERIA_KEYS.map((k) => `${CRITERIA_LABELS[k]} ${c[k]}`).join("・")}）` : "";
    return `${sel.reviewReason}${detail}`;
  }
  return `機械的スコア ${sel?.score ?? "不明"}/100 で選定（人による学習価値の評価は未実施）。`;
}
