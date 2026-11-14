/**
 * 既存の28章（章1〜29。旧ライブラリーの v2.x 系）を、LP-0245（オランジーナ）の形（統一28章 v4.0）にそろえる。純粋な関数だけ（外部には何も書かない）。
 * 方針: 中身を作り直さない。章の名前をそろえ、ヘッダーメタ・サムネイルを足し、章29（更新履歴）は章24の末尾の小見出しへ移す（消さない）。
 *       旧28章に無い・読み取れない項目は「未確認」と書く。
 */

/** 参照（LP-0245_v1.0.md）の章見出し（"1. 基本情報" など）を、番号→名前の表にする。 */
export function refTitles(refMd) {
  const m = {};
  for (const l of String(refMd).split("\n")) { const x = /^## (\d{1,2})\. (.*)$/.exec(l); if (x) m[Number(x[1])] = x[2].trim(); }
  return m;
}

/** Markdownを、前置き（最初の「## n.」より前）と、章の配列に分ける。 */
export function parseChapters(md) {
  const lines = String(md).split("\n");
  const idx = [];
  lines.forEach((l, i) => { const x = /^## (\d{1,2})\. (.*)$/.exec(l); if (x) idx.push({ n: Number(x[1]), title: x[2].trim(), i }); });
  const pre = lines.slice(0, idx[0]?.i ?? lines.length).join("\n");
  const chapters = idx.map((c, k) => ({ n: c.n, title: c.title, body: lines.slice(c.i + 1, idx[k + 1]?.i ?? lines.length).join("\n").replace(/\n+$/, "") }));
  return { pre, chapters };
}

/** 章1の「項目 | 内容」の表から、項目名→内容を取る。 */
export function basicInfo(body) {
  const out = {};
  for (const line of String(body).split("\n")) {
    const c = line.split("|").map((x) => x.trim());
    if (c.length >= 4 && c[1] && c[2] && !/^-+$/.test(c[1]) && c[1] !== "項目") out[c[1]] = c[2];
  }
  return out;
}

const U = "未確認（旧28章に記載なし）";
const pick = (info, ...keys) => { for (const k of keys) { const hit = Object.keys(info).find((x) => x.includes(k)); if (hit && info[hit]) return info[hit]; } return U; };

/** ヘッダーメタ（LP-0245と同じ17行）。値は、旧28章の章1・Notionのプロパティから取る。無いものは「未確認」。 */
export function headerMeta({ lp, disId, info, props = {}, date = "", version = "v1.0", thumbnail = true }) {
  const rows = [
    ["サムネイル", thumbnail ? "上の画像（PC First View）" : U],
    ["LP番号", `${lp}（${disId} と対応。章28参照）`],
    ["ステータス", pick(info, "検証状態") === U ? U : `形をそろえた版（${version}）。内容は旧28章のまま。検証状態: ${pick(info, "検証状態")}`],
    ["オファーカテゴリ", props["オファー"] || pick(info, "価格帯", "オファー")],
    ["コピータイプ", props["コピータイプ"] || U],
    ["業種カテゴリ", pick(info, "LP種別 / 業種", "業種")],
    ["商材", pick(info, "商材")],
    ["主要CV", pick(info, "主コンバージョン", "主要CV")],
    ["URL", pick(info, "公式キャンペーンURL", "公式URL", "実ページURL", "URL")],
    ["Archive URL", pick(info, "Archive URL")],
    ["PC・SP", pick(info, "PC/SP", "PC・SP")],
    ["権利区分", pick(info, "権利区分") === U ? "reference_only／rights_unknown（旧28章に記載なし。章16参照）" : pick(info, "権利区分")],
    ["取得日", props["取得日"] || date || U],
    ["版番号・更新日", `${version}（形をそろえた日: ${new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)}）`],
    ["検証状態", pick(info, "検証状態")],
    ["Scout元", U],
    ["形式基準", "統一28章 v4.0（章順固定。実行・重複防止記録は章28）"],
  ];
  return ["| ヘッダーメタ | 内容 |", "| --- | --- |", ...rows.map(([k, v]) => `| ${k} | ${String(v).replace(/\|/g, "／").replace(/\n/g, " ")} |`)].join("\n");
}

/**
 * 旧28章を v4.0 の形にそろえる。戻り値: { md, mapping, notes }
 *   mapping: 章ごとの { n, from, to, kind: 同名|名前変更|章29→章24へ移動|足す }
 */
export function alignToV40({ md, ref, lp, brand, disId, info, props, date, thumbnailRef = "images/thumbnail.jpg", markLine }) {
  const { chapters } = parseChapters(md);
  const byN = new Map(chapters.map((c) => [c.n, c]));
  const mapping = [], notes = [];
  const out = [];
  out.push(`# ${lp}｜${brand}｜LP分析（統一28章 v4.0）`, "");
  if (thumbnailRef) out.push(`![サムネイル](${thumbnailRef})`, "");
  out.push(headerMeta({ lp, disId, info: info || basicInfo(byN.get(1)?.body || ""), props, date, thumbnail: Boolean(thumbnailRef) }), "", "---", "");
  for (let n = 1; n <= 28; n++) {
    const c = byN.get(n);
    const to = ref[n];
    if (!c) { mapping.push({ n, from: null, to, kind: "足す（旧28章に無い章。内容は「未確認」）" }); out.push(`## ${n}. ${to}`, "", U + "。", ""); continue; }
    let body = c.body;
    if (n === 24 && byN.get(29)) {
      body += `\n\n### 旧・章29 更新履歴（旧28章の章29。そのまま移した）\n\n${byN.get(29).body.trim()}`;
      mapping.push({ n, from: c.title, to, kind: c.title === to ? "同名（末尾に、章29の内容を足す）" : "名前変更＋末尾に、章29の内容を足す" });
    } else mapping.push({ n, from: c.title, to, kind: c.title === to ? "同名" : "名前変更" });
    out.push(`## ${n}. ${to}`, "", body, "", n === 23 || n === 27 ? "---" : "", n === 23 || n === 27 ? "" : "");
  }
  if (byN.get(29)) mapping.push({ n: 29, from: byN.get(29).title, to: "（章24の末尾へ移動）", kind: "章29→章24へ移動" });
  const extra = chapters.filter((c) => c.n > 29);
  if (extra.length) notes.push(`章${extra.map((c) => c.n).join("・")}は、v4.0に対応する章がなく、そろえていない（${extra.length}章）`);
  out.push("---", "", markLine || `**✅ 分析表記済み｜${lp} ${brand} v1.0（形のみ統一28章 v4.0にそろえた版。内容は旧28章のまま）**`, "");
  return { md: out.join("\n").replace(/\n{3,}/g, "\n\n"), mapping, notes };
}
