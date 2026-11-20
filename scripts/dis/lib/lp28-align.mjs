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
 * 章の並びが別構成の旧28章（P4: 「ファーストビュー要約」「Section固定項目」の並びの v2.2 29章）を、
 * v4.0 の章へ、意味で対応づける表。新しい章番号 → 旧の章番号（複数のときは、小見出しでつなぐ。空なら「未確認」）。
 */
export const P4_MAP = {
  1: [1], 2: [2], 3: [3], 4: [], 5: [5], 6: [6], 7: [18], 8: [8], 9: [7, 10], 10: [11], 11: [9], 12: [12, 14], 13: [22], 14: [23],
  15: [15], 16: [], 17: [27], 18: [13], 19: [19], 20: [20], 21: [21], 22: [17], 23: [4, 16], 24: [24, 25, 29], 25: [], 26: [26], 27: [], 28: [28],
};

/**
 * すでに統一28章 v4.0 の名前で書かれた Markdown（章1〜29）の、章29（更新履歴）を、章24の最後へ小見出しで移す。
 * 章29の本文は、最初の「---」までとする。戻り値: 移したあとの Markdown（章29が無ければ、そのまま）。
 */
export function moveCh29ToCh24(md) {
  const lines = String(md).split("\n");
  const i29 = lines.findIndex((l) => /^## 29\. /.test(l));
  if (i29 < 0) return String(md);
  let end = lines.length;
  for (let k = i29 + 1; k < lines.length; k++) if (/^---\s*$/.test(lines[k])) { end = k; break; }
  const body = lines.slice(i29 + 1, end).join("\n").trim();
  const rest = [...lines.slice(0, i29), ...lines.slice(end)];
  const i24 = rest.findIndex((l) => /^## 24\. /.test(l));
  const i25 = rest.findIndex((l, k) => k > i24 && /^## 25\. /.test(l));
  if (i24 < 0 || i25 < 0) throw new Error("章24・章25の見出しが見つかりません");
  let ins = i25;
  while (ins > i24 && (rest[ins - 1].trim() === "" || /^---\s*$/.test(rest[ins - 1]))) ins--;
  rest.splice(ins, 0, "", "### 旧・章29 更新履歴（旧28章の章29。そのまま移した）", "", body, "");
  return rest.join("\n").replace(/\n{3,}/g, "\n\n");
}

/** 旧28章の章の名前から、P4（別構成）かどうかを見分ける。 */
export function detectChapterMap(chapters) {
  const t = (n) => chapters.find((c) => c.n === n)?.title || "";
  return t(2) === "ファーストビュー要約" && t(8) === "Section固定項目" && t(29) === "更新履歴" ? P4_MAP : null;
}

/**
 * 旧28章を v4.0 の形にそろえる。戻り値: { md, mapping, notes }
 *   mapping: 章ごとの { n, from, to, kind: 同名|名前変更|章29→章24へ移動|足す }
 */
export function alignToV40({ md, ref, lp, brand, disId, info, props, date, thumbnailRef = "images/thumbnail.jpg", markLine, ch2Images = [], notionCh28Md = "", notionCh29Md = "" }) {
  const { chapters } = parseChapters(md);
  const byN = new Map(chapters.map((c) => [c.n, c]));
  const cmap = detectChapterMap(chapters);
  // 章0（実行・重複防止記録）で始まり、章28が無い形（章0〜27）は、章0を章28へ移す
  const shift0 = !cmap && byN.has(0) && !byN.has(28) && chapters.every((c) => c.n <= 27);
  const mapping = [], notes = [];
  const out = [];
  out.push(`# ${lp}｜${brand}｜LP分析（統一28章 v4.0）`, "");
  if (thumbnailRef) out.push(`![サムネイル](${thumbnailRef})`, "");
  out.push(headerMeta({ lp, disId, info: info || basicInfo(byN.get(1)?.body || ""), props, date, thumbnail: Boolean(thumbnailRef) }), "", "---", "");
  for (let n = 1; n <= 28; n++) {
    const to = ref[n];
    if (cmap) {
      const srcs = (cmap[n] || []).map((k) => byN.get(k)).filter(Boolean);
      if (!srcs.length) { mapping.push({ n, from: null, to, kind: "足す（旧28章に無い章。内容は「未確認」）" }); out.push(`## ${n}. ${to}`, "", U + "。", ""); continue; }
      let body = srcs[0].body;
      // 旧28章（別構成）のmdには、章2の実画像の記載が無い。いまのNotionにある6枠を落とさないよう、同じ6枠を章2の先頭に置く
      if (n === 2 && ch2Images.length) body = ch2Images.map((x) => `### ${x.title}\n\n![${x.title}](${x.ref})`).join("\n\n") + "\n\n" + body;
      for (const x of srcs.slice(1)) body += `\n\n### 旧・章${x.n} ${x.title}${x.n === 29 ? "（旧28章の章29。そのまま移した）" : "（旧28章の章" + x.n + "。そのまま移した）"}\n\n${x.body.trim()}`;
      mapping.push({ n, from: srcs.map((x) => `${x.n}. ${x.title}`).join(" + "), to, kind: srcs.length > 1 ? `意味で対応（旧章${srcs.map((x) => x.n).join("＋")}をつなぐ）` : `意味で対応（旧章${srcs[0].n}）` });
      out.push(`## ${n}. ${to}`, "", body, "", n === 23 || n === 27 ? "---" : "", n === 23 || n === 27 ? "" : "");
      continue;
    }
    const c = n === 28 && shift0 ? byN.get(0) : byN.get(n);
    if (!c) { mapping.push({ n, from: null, to, kind: "足す（旧28章に無い章。内容は「未確認」）" }); out.push(`## ${n}. ${to}`, "", U + "。", ""); continue; }
    let body = c.body;
    // 章2: 旧28章のmdに無い実画像の枠（例: First View）を、先頭に足す
    if (n === 2 && ch2Images.length) body = ch2Images.map((x) => `### ${x.title}\n\n![${x.title}](${x.ref})`).join("\n\n") + "\n\n" + body;
    // 章28: Notionにだけあった補完記録（写し）は、消さずに、小見出しで残す
    if (n === 28 && notionCh28Md) body += `\n\n### 旧・Notion章28（補完記録。2026-11-14にNotionへ写した、旧v2の章0の写し）\n\n${notionCh28Md}`;
    // 章24: mdに無いNotionの章29（更新履歴）は、章24の最後に小見出しで移す
    if (n === 24 && !byN.get(29) && notionCh29Md) {
      body += `\n\n### 旧・章29 更新履歴（旧28章の章29。Notionにあったものを、そのまま移した）\n\n${notionCh29Md}`;
      mapping.push({ n, from: c.title, to, kind: (c.title === to ? "同名" : "名前変更") + "＋末尾に、Notionの章29の内容を足す" });
    } else if (n === 24 && byN.get(29)) {
      body += `\n\n### 旧・章29 更新履歴（旧28章の章29。そのまま移した）\n\n${byN.get(29).body.trim()}`;
      mapping.push({ n, from: c.title, to, kind: c.title === to ? "同名（末尾に、章29の内容を足す）" : "名前変更＋末尾に、章29の内容を足す" });
    } else mapping.push({ n, from: shift0 && n === 28 ? `0. ${c.title}` : c.title, to, kind: shift0 && n === 28 ? "章0→章28へ移動" : c.title === to ? "同名" : "名前変更" });
    out.push(`## ${n}. ${to}`, "", body, "", n === 23 || n === 27 ? "---" : "", n === 23 || n === 27 ? "" : "");
  }
  if (byN.get(29) && !cmap) mapping.push({ n: 29, from: byN.get(29).title, to: "（章24の末尾へ移動）", kind: "章29→章24へ移動" });
  const extra = chapters.filter((c) => c.n > 29);
  if (extra.length) notes.push(`章${extra.map((c) => c.n).join("・")}は、v4.0に対応する章がなく、そろえていない（${extra.length}章）`);
  out.push("---", "", markLine || `**✅ 分析表記済み｜${lp} ${brand} v1.0（形のみ統一28章 v4.0にそろえた版。内容は旧28章のまま）**`, "");
  return { md: out.join("\n").replace(/\n{3,}/g, "\n\n"), mapping, notes };
}
