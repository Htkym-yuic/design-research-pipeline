/**
 * 28章の登録（Notionのプロパティ・Dropboxの日付・台帳の文）を、各LPの内容から作る。
 * 以前は、LP-0245（オランジーナ）の文・日付・タグを固定で入れていたため、他のLPで誤った内容になった。固定の文は持たない。
 * 外部には何も書かない。
 */

const firstSentence = (s, max = 120) => {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  const i = t.indexOf("。");
  const one = i >= 0 ? t.slice(0, i + 1) : t;
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
};

/** 28章のヘッダー表（| 項目 | 内容 |）から、項目名→内容を取る。 */
export function headerMeta(md) {
  const head = String(md).split(/^---+$/m)[0] || "";
  const out = {};
  for (const line of head.split("\n")) {
    const c = line.split("|").map((x) => x.trim());
    if (c.length >= 4 && c[1] && c[2] && !/^-+$/.test(c[1])) out[c[1]] = c[2];
  }
  return out;
}

/** 28章Markdown・item.json・analysis.json から、登録の値を作る。値が見つからない項目は、入れない（推測しない）。 */
export function lp28Values({ md, item = {}, analysis = {}, lpId, disId }) {
  const s = String(md);
  const brand = (/^# .+?｜(.+?)｜LP分析/m.exec(s) || [])[1] || item.brand || "";
  const meta = headerMeta(s);
  const iso = (v) => /\d{4}-\d{2}-\d{2}/.exec(v || "")?.[0];
  const date = item.date || iso(meta["取得日"]) || "";
  const status = meta["ステータス"] || "";
  const sections = (s.match(/^### Section \d+/gm) || []).length;
  const props = { タイトル: `${lpId}｜${brand}｜LP分析`, ブランド: brand };
  if (item.sourceDetailUrl) props["参考URL"] = item.sourceDetailUrl;
  props["出典"] = "LPアーカイブ（アーカイブ掲載の画像。DISの分析から28章化）";
  if (date) props["取得日"] = date;
  const appeal = firstSentence(analysis.summary);
  if (appeal) props["メイン訴求"] = appeal;
  props["進捗メモ"] = `${date ? `${date}: ` : ""}28章 v1.0${status ? `（${status}）` : ""}。${disId} と対応`;
  for (const [k, v] of Object.entries(analysis.notionProps || {})) if (v && (!Array.isArray(v) || v.length)) props[k] = v;
  props["ステータス"] = "進行中";
  return { brand, date, status, sections, props, headerStatus: meta["検証状態"] || status };
}

/** 登録の台帳ページ（✅ 分析表記済み）の本文。 */
export function stampMarkdown({ lpId, disId, date, sections, status, dropboxBase }) {
  return `# ✅ 分析表記済み｜${lpId}\n\n- 28章 v1.0${date ? `（${date}）` : ""}。対象: 全${sections}Section。${status ? `${status}。` : ""}\n- 対応するDIS: ${disId}（Dropbox・Notionに登録済み）\n- 台帳: Dropbox ${dropboxBase}\n- CBS同期: 未同期`;
}
