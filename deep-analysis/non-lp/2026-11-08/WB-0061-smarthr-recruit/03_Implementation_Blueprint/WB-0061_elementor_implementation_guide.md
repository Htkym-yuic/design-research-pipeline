# WB-0061 標準Elementor脳内実装・確定版

## 方針

- Containerと標準Widgetを優先し、Atomic Elementsは補助案に限定する。
- 標準Elementorを優先し、背景グラデーションも標準設定で作る。標準機能で成立しない動き・特殊文字組みだけ最小限のCSSを別記録する。
- ロゴ、人物・院内写真、固有コピーは再利用せず、構造だけを参考にする。

## 作成順

### 1. HeaderHero

- Container: page > hero(full width) > hero-inner(row)
- 入れるWidget: Site Logo / Nav Menu / Heading / Image / Button
- PC: 最小高720、左右2列、背景グラデーション
- SP: 縦積み、人物を見出し下、ナビはMenu Toggle
- 注意: 人物と固有コピーは差替え

### 2. IssuesAccordion

- Container: section > inner > issue-grid
- 入れるWidget: Heading / Text Editor / Icon Box または Accordion
- PC: 4カードの2〜4列
- SP: 1列またはAccordion
- 注意: 標準Border・Radius・Gapで再現

### 3. CompanyDeckFuture

- Container: section > inner > media-copy
- 入れるWidget: Heading / Image / Text Editor / Button
- PC: 資料モックと本文の2列
- SP: 画像→本文→ボタン
- 注意: 重なりは負Marginを使い過ぎない

### 4. FactsGrid

- Container: section > inner > facts-grid > fact-card
- 入れるWidget: Heading / Counter / Text Editor
- PC: 3列グリッド
- SP: 1〜2列
- 注意: 単位はCounter外のTextで管理

### 5. EventsMedia

- Container: section > inner > card-grid
- 入れるWidget: Loop Grid / Image / Heading / Text / Button
- PC: 3列カード
- SP: 1列または横スクロールなし
- 注意: CMS利用時はLoop Grid

### 6. FooterHero

- Container: footer > message > links
- 入れるWidget: Heading / Nav Menu / Icon List / Text
- PC: 大コピー後にリンク群
- SP: 縦積み・中央寄せ
- 注意: CSSなしで順序を維持

## 確認事項

- Section一覧: section_index_not_generated_separately。必要時にSection画像を生成。
- 動的状態: interaction_state_not_captured。実サイト操作で確認。
- 権利・実績時点: license_and_update_date_unverified。原典と権利者を確認。
