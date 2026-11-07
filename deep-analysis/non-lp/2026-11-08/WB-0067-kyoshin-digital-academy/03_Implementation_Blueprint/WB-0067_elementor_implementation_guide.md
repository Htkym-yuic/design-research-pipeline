# WB-0067 標準Elementor脳内実装・確定版

## 方針

- Containerと標準Widgetを優先し、Atomic Elementsは補助案に限定する。
- 標準Elementorを優先し、背景グラデーションも標準設定で作る。標準機能で成立しない動き・特殊文字組みだけ最小限のCSSを別記録する。
- ロゴ、人物・院内写真、固有コピーは再利用せず、構造だけを参考にする。

## 作成順

### 1. HeaderHero

- Container: page > hero > hero-inner
- 入れるWidget: Site Logo / Nav Menu / Heading / Text / Image
- PC: 最小高760、黒背景、文字と抽象画像を重ねる
- SP: 縦積み、英字サイズ縮小
- 注意: 発光は画像素材、CSS filterは使わない

### 2. DXVision

- Container: section > inner > copy
- 入れるWidget: Heading / Text Editor / Image
- PC: 左右2列、大余白
- SP: 画像→見出し→本文
- 注意: 標準Gapで再現

### 3. AboutUsCards

- Container: section > inner > two-card
- 入れるWidget: Heading / Icon Box / Text / Button
- PC: 2列カード
- SP: 1列
- 注意: OrganizationとHow We Workを別Container

### 4. InterviewCards

- Container: section > inner > people-grid
- 入れるWidget: Loop Grid / Image / Heading / Text
- PC: 3列
- SP: 1列または2列
- 注意: CMSならLoop Item化

### 5. WantedlyCards

- Container: section > inner > article-grid
- 入れるWidget: Loop Grid / Image / Heading / Button
- PC: 3列
- SP: 1列
- 注意: 外部リンクを明記

### 6. Footer

- Container: footer > inner
- 入れるWidget: Nav Menu / Icon List / Text
- PC: 横並び
- SP: 縦積み
- 注意: 標準Widgetのみ

## 確認事項

- Section一覧: section_index_not_generated_separately。必要時にSection画像を生成。
- 動的状態: interaction_state_not_captured。実サイト操作で確認。
- 権利・実績時点: license_and_update_date_unverified。原典と権利者を確認。
