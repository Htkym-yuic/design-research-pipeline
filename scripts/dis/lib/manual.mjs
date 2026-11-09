import { fetchGetter, parseDetail, parseRdlpDetail, cleanTitle } from "./collect.mjs";

const IMAGE_EXT = /\.(png|jpe?g|webp|gif)(\?.*)?$/i;

/** ユーザーがURLを指定した案件を、候補1件にする（公開ページのみ。robots.txt・403等は回避せず、理由を返して止める）。 */
export async function buildManualCandidate(url, media, getter = fetchGetter(), sources = []) {
  let u;
  try { u = new URL(url); } catch { throw new Error(`URLとして読めません: ${url}`); }
  if (!/^https?:$/.test(u.protocol)) throw new Error("http(s)のURLのみ指定できます");
  const base = { media, sourceKey: "manual", sourceName: "手動指定", termsStatus: "known", manual: true, sourceDetailUrl: u.href, pageUrl: u.href };
  if (media === "banner" && IMAGE_EXT.test(u.pathname)) {
    return { ...base, brand: decodeURIComponent(u.pathname.split("/").pop()), title: u.pathname.split("/").pop(), imageUrl: u.href, originUnresolved: true, signals: { learningValue: 0.5 } };
  }
  if (!(await getter.robots(u.href))) throw new Error("robots.txtで禁止されているため取得しません");
  // 参照元（まとめサイト）の紹介ページが渡された場合は、そこから実ページのURLを取り出して、実ページを対象にする。
  const agg = sources.find((x) => { try { return new URL(x.listUrl).hostname === u.hostname; } catch { return false; } });
  if (agg && media !== "banner") {
    if (agg.parser !== "rdlp") throw new Error(`${agg.name} の紹介ページが指定されました。実際の${media === "lp" ? "LP" : "サイト"}のURLを指定してください（紹介ページを撮影すると別物になるため）`);
    const r = await getter.get(u.href);
    if (!r.ok) throw new Error(`HTTP ${r.status}（回避しません）`);
    const d = parseRdlpDetail(r.text, u.href);
    if (!d.pageUrl) throw new Error("紹介ページから実際のLPのURLを取り出せませんでした。実際のLPのURLを指定してください");
    const t = cleanTitle(d.title || "");
    return { ...base, sourceKey: agg.key, sourceName: agg.name, sourceDetailUrl: u.href, pageUrl: d.pageUrl, brand: t || new URL(d.pageUrl).hostname, title: t, imageUrl: d.image || null, signals: { learningValue: 0.5 } };
  }
  const res = await getter.get(u.href);
  if (!res.ok) throw new Error(`HTTP ${res.status}（回避しません。ブラウザで開ける場合は、画像・資料を別途ご用意ください）`);
  const d = parseDetail(res.text, u.href);
  const title = cleanTitle(d.title || u.hostname);
  return { ...base, brand: title, title, imageUrl: d.image || null, signals: { learningValue: 0.5 } };
}

/** 手動指定の選定: 重複だけを確認し、13/18基準・機械点の足切りは適用しない（人が選んだものとして扱う）。 */
export function selectManual(cand, { dupCheck }) {
  const dup = dupCheck(cand);
  if (dup.duplicate) return { selected: null, evaluated: [{ ...cand, duplicate: dup, blockers: [`重複(${dup.reason}: ${dup.of ?? "?"})`], inComparison: true }], skippedReason: `重複のため登録しません（${dup.reason}）` };
  const selected = { ...cand, disId: null, score: null, manual: true, reviewReason: "ユーザーが対象を指定（選定基準13/18点・機械的スコアの足切りは適用しない）", duplicate: dup, blockers: [], inComparison: true };
  return { selected, evaluated: [selected] };
}

/**
 * 選定済みの案件を、後から「アーカイブ掲載の画像で分析」に切り替える（実ページが403などで撮影できなかった場合）。
 * rdlpの紹介ページ由来のLP/Webだけが対象。切り替えたら true を返す。
 */
export function applyArchiveMode(sel, { fromArchive, media }) {
  if (!fromArchive) return false;
  if (sel.sourceKey !== "rdlp" || media === "banner") throw new Error("--from-archive は、LPアーカイブ（rdlp）の紹介ページ由来のLP/Webだけで使えます");
  if (sel.captureMode === "archive") return false;
  sel.captureMode = "archive";
  return true;
}
