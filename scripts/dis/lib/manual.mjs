import { fetchGetter, parseDetail, cleanTitle } from "./collect.mjs";

const IMAGE_EXT = /\.(png|jpe?g|webp|gif)(\?.*)?$/i;

/** ユーザーがURLを指定した案件を、候補1件にする（公開ページのみ。robots.txt・403等は回避せず、理由を返して止める）。 */
export async function buildManualCandidate(url, media, getter = fetchGetter()) {
  let u;
  try { u = new URL(url); } catch { throw new Error(`URLとして読めません: ${url}`); }
  if (!/^https?:$/.test(u.protocol)) throw new Error("http(s)のURLのみ指定できます");
  const base = { media, sourceKey: "manual", sourceName: "手動指定", termsStatus: "known", manual: true, sourceDetailUrl: u.href, pageUrl: u.href };
  if (media === "banner" && IMAGE_EXT.test(u.pathname)) {
    return { ...base, brand: decodeURIComponent(u.pathname.split("/").pop()), title: u.pathname.split("/").pop(), imageUrl: u.href, originUnresolved: true, signals: { learningValue: 0.5 } };
  }
  if (!(await getter.robots(u.href))) throw new Error("robots.txtで禁止されているため取得しません");
  const res = await getter.get(u.href);
  if (!res.ok) throw new Error(`HTTP ${res.status}（回避しません。ブラウザで開ける場合は、画像・資料を別途ご用意ください）`);
  const d = parseDetail(res.text, u.href);
  const title = cleanTitle(d.title || u.hostname);
  return { ...base, brand: title, title, imageUrl: d.image || null, signals: { learningValue: 0.5 } };
}

/** 手動指定の選定: 重複とIDの衝突だけを確認し、13/18基準・機械点の足切りは適用しない（人が選んだものとして扱う）。 */
export function selectManual(cand, { disId, dupCheck, ledgerEntries = [] }) {
  const dup = dupCheck(cand);
  if (dup.duplicate) return { selected: null, evaluated: [{ ...cand, duplicate: dup, blockers: [`重複(${dup.reason}: ${dup.of ?? "?"})`], inComparison: true }], skippedReason: `重複のため登録しません（${dup.reason}）` };
  if (ledgerEntries.some((e) => e.disId === disId)) return { selected: null, evaluated: [{ ...cand, blockers: ["ID衝突"], inComparison: true }], skippedReason: `${disId} は登録済みです。--date で別の日付を指定してください` };
  const selected = { ...cand, disId, score: null, manual: true, reviewReason: "ユーザーが対象を指定（選定基準13/18点・機械的スコアの足切りは適用しない）", duplicate: dup, blockers: [], inComparison: true };
  return { selected, evaluated: [selected] };
}
