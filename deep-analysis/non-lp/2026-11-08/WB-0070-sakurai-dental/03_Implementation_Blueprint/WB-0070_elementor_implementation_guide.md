# WB-0070 標準Elementor脳内実装・確定版

## 方針

- Containerと標準Widgetを優先し、Atomic Elementsは補助案に限定する。
- 標準Elementorを優先。縦書きを厳密に再現する場合だけwriting-modeを最小限使用し、未習熟時は横組みで代替する。
- ロゴ、人物・院内写真、固有コピーは再利用せず、構造だけを参考にする。

## 作成順

### 1. HeaderHero

- Container: page > hero > hero-inner
- 入れるWidget: Site Logo / Nav Menu / Heading / Image / Text
- PC: 2列、最小高720、余白大
- SP: 画像→コピーまたはコピー→画像の単列
- 注意: 縦書きは可能なら通常横組みで代替

### 2. Philosophy

- Container: section > inner > copy
- 入れるWidget: Heading / Text Editor / Image
- PC: 本文と写真の2列
- SP: 単列
- 注意: 標準Typographyで再現

### 3. FeaturesEditorial

- Container: section > inner > feature-list > feature
- 入れるWidget: Heading / Text / Image / Divider
- PC: 交互2列、番号表示
- SP: 画像→番号→見出し→本文
- 注意: 奇偶反転はSPで解除

### 4. TreatmentMenu

- Container: section > inner > treatment-list
- 入れるWidget: Accordion / Heading / Text / Icon List
- PC: 2列または全幅Accordion
- SP: 1列Accordion
- 注意: 標準Accordionを優先

### 5. Access

- Container: section > inner > clinic-grid > clinic
- 入れるWidget: Heading / Text / Google Maps / Icon List / Button
- PC: 2院を2列比較
- SP: 院ごとに縦積み
- 注意: 電話はtelリンク、地図は標準Widget

### 6. NewsContactFooter

- Container: section > news + contact + footer
- 入れるWidget: Loop Grid / Heading / Text / Button / Nav Menu
- PC: ニュース3列、連絡帯、リンク群
- SP: すべて1列
- 注意: 予約CTAは標準Buttonで固定案

## 確認事項

- Section一覧: section_index_not_generated_separately。必要時にSection画像を生成。
- 動的状態: interaction_state_not_captured。実サイト操作で確認。
- 権利・実績時点: license_and_update_date_unverified。原典と権利者を確認。
