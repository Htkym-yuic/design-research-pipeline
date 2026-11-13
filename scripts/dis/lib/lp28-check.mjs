/**
 * 28章（LP-nnnn_v1.0.md）の第8章の書式検証。登録（Dropbox・Notion）の前に通す。
 *   1. 各Sectionで、項目1〜15が、番号どおり、別々の行になっている（次の項目が同じ行につながっていない）
 *   2. 項目15に、20字以上の同じ並びが2回出ていない
 * 外部には何も書かない。
 */

export const ITEM_LABELS = [
  "Section番号・位置", "役割", "見出し・主要コピー", "価格・オファー", "CTA", "バッジ・ラベル", "アイコン", "カード・表・FAQ",
  "装飾", "画像・人物・商品配置", "訴求意図・購入心理への作用", "PC/SP差", "証拠ソース", "確信度", "未確認事項・failure_reason",
];
export const REPEAT_MIN = 20;

/** 20字以上の同じ並びが、重ならずに2回出ていれば、その並びを返す（なければ null）。 */
export function findRepeat(text, n = REPEAT_MIN) {
  const s = String(text);
  const seen = new Map();
  for (let i = 0; i + n <= s.length; i++) {
    const k = s.slice(i, i + n);
    if (seen.has(k) && i - seen.get(k) >= n) return k;
    if (!seen.has(k)) seen.set(k, i);
  }
  return null;
}

/** 第8章のSectionごとに、書式を検査する。戻り値: { ok, sections, errors } */
export function checkLp28Chapter8(md) {
  const s = String(md);
  const a = s.search(/^## 8\. /m), b = s.search(/^## 9\. /m);
  if (a < 0 || b < 0 || a > b) return { ok: false, sections: 0, errors: ["章8・章9の見出しが見つかりません"] };
  const secs = s.slice(a, b).split(/^(?=### Section)/m).slice(1);
  const errors = [];
  if (!secs.length) errors.push("第8章に「### Section」がありません");
  for (const sec of secs) {
    const lines = sec.split("\n");
    const head = lines[0].replace(/^###\s*/, "").slice(0, 24);
    const nums = lines.map((l) => /^(\d{1,2})\. /.exec(l)).filter(Boolean).map((m) => Number(m[1]));
    if (nums.length !== 15 || nums.some((n, i) => n !== i + 1)) errors.push(`${head}: 項目1〜15が、別々の行で、番号どおりに並んでいません（行頭の番号: ${nums.join(",") || "なし"}）`);
    // 行の途中に、次の項目（番号＋固定の項目名）がつながっている
    const joined = lines.filter((l) => new RegExp(`[^\\n]\\s\\d{1,2}\\. (?:${ITEM_LABELS.map((x) => x.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")).join("|")})[:：]`).test(l));
    if (joined.length) errors.push(`${head}: 1行に複数の項目がつながっています（${joined.length}行。例: ${joined[0].slice(0, 40)}…）`);
    const l15 = lines.find((l) => /^15\. /.test(l));
    if (l15) {
      const rep = findRepeat(l15.replace(/^15\. /, ""));
      if (rep) errors.push(`${head}: 項目15に、同じ並びの繰り返しがあります（「${rep}」）`);
    }
  }
  return { ok: errors.length === 0, sections: secs.length, errors };
}
