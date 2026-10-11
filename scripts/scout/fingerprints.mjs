// design-research-pipeline向けに移植したデザイン領域の指紋（fingerprint）定義。
// 元ネタ: imsaif/design-with-claude の research-scout ブランチ
// (scripts/research/collect/fingerprints.mjs)。agent-config（CLAUDE.md等）の
// 指紋をそのまま使うのではなく、デザイン制作・デザインシステム関連の指紋に
// 入れ替えている。
//
// `query` = GitHub code-search修飾子。`path` = 採用日（first-commit）算出に使う
// リポジトリ内パス（null = count-onlyで、採用日を出せない指紋）。
//
// 【重要】この指紋セットは「最初の案」であり、実際の調査結果がノイズだらけ、
// または的外れだと分かった場合は見直す前提。scan-config.mdのNovelty gateに従い、
// 無理に数値を確定させず、必要ならPRで指紋の追加・削除を提案する。
//
// 【2026-10-11修正】`filename:figma.config.js`だけでは、GitHub側がファイル名を
// ピリオド区切りで緩く照合するらしく、`figma.config.json`のような別拡張子のファイルも
// 結果に混ざることを実クエリで確認した（434件 vs `extension:js`併用時の15件）。
// 件数の少ない指紋ほどこの緩さが顕在化しやすいため、ファイル拡張子を持つ指紋には
// 念のため全て`extension:`修飾子を付けている（`tailwind.config.js`等、件数の多い
// 指紋では結果件数に変化が無いことも確認済み）。

export const FINGERPRINTS = {
  "tailwind.config.js": { query: "filename:tailwind.config.js extension:js", path: "tailwind.config.js" },
  "tailwind.config.ts": { query: "filename:tailwind.config.ts extension:ts", path: "tailwind.config.ts" },
  "design-tokens.json": { query: "filename:design-tokens.json extension:json", path: "design-tokens.json" },
  "figma.config.js": { query: "filename:figma.config.js extension:js", path: "figma.config.js" },
  // ディレクトリ単位の指紋: countableだが単一パスでの採用日算出はできない。
  ".storybook": { query: "path:.storybook filename:main", path: null },
};

export function fingerprintSpec(name) {
  const spec = FINGERPRINTS[name];
  if (!spec) {
    throw new Error(`未知の指紋です: "${name}"。既知の指紋: ${Object.keys(FINGERPRINTS).join(", ")}`);
  }
  return spec;
}
