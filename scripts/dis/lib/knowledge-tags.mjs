/** notionProps（Notion用の列）から、CBSナレッジのタグを組み立てる。LP（業種タグ・商材・配色タグ・レイアウトタグ・コピータイプ）とWeb・バナー（サイト種別・広告タイプなど）の両方に対応。 */
export function tagsFromNotionProps(p = {}) {
  const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  const uniq = (xs) => [...new Set(xs.filter(Boolean))];
  return {
    industry_tags: uniq([...arr(p["業種タグ"]), p["サイト種別"], ...String(p["ブランド・商材"] || "").split("／").slice(1)]),
    product_tags: uniq([...arr(p["商材"]), p["広告タイプ"]]),
    color_tags: uniq(arr(p["配色タグ"])),
    layout_tags: uniq([...arr(p["レイアウトタグ"]), ...arr(p["構成タイプ"])]),
    copy_types: uniq(arr(p["コピータイプ"])),
  };
}
