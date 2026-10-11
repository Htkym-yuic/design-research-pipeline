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

export const FINGERPRINTS = {
  "tailwind.config.js": { query: "filename:tailwind.config.js", path: "tailwind.config.js" },
  "tailwind.config.ts": { query: "filename:tailwind.config.ts", path: "tailwind.config.ts" },
  "design-tokens.json": { query: "filename:design-tokens.json", path: "design-tokens.json" },
  "figma.config.js": { query: "filename:figma.config.js", path: "figma.config.js" },
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
