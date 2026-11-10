/** notionProps（Notion用の列）から、CBSナレッジのタグを組み立てる。LP（業種タグ・商材・配色タグ・レイアウトタグ・コピータイプ）とWeb・バナー（サイト種別・広告タイプなど）の両方に対応。 */
/** category（LP／WB／BN）を渡すと、商材は「LP/物販」「BN/サービス」のように、カテゴリ付きにする（広告タイプは商材に入れない）。 */
export function tagsFromNotionProps(p = {}, category = null) {
  const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  const uniq = (xs) => [...new Set(xs.filter(Boolean))];
  return {
    industry_tags: uniq([...arr(p["業種タグ"]), p["サイト種別"], ...String(p["ブランド・商材"] || "").split("／").slice(1)]),
    product_tags: category ? uniq(arr(p["商材"]).map((v) => (String(v).includes("/") ? v : `${category}/${v}`))) : uniq([...arr(p["商材"]), p["広告タイプ"]]),
    color_tags: uniq(arr(p["配色タグ"])),
    layout_tags: uniq([...arr(p["レイアウトタグ"]), ...arr(p["構成タイプ"])]),
    copy_types: uniq(arr(p["コピータイプ"])),
  };
}
