# WB-0076｜Elementor脳内実装設計（確定版）

## 位置づけ

- 29章のデザイン分析とは分離した、WordPress／Elementor制作向けの実装設計である。
- 原サイトの固有コピー、ロゴ、学校名、事例写真、製品写真は再利用せず、コンテナ構造と情報設計だけを参照する。
- 日次自動生成の仮説版（`WB-0076_elementor_implementation.json`、8セクションの汎用テンプレート、Dropbox `99_Needs_Review/2026-11-11/daily-intake/WB-0076/` に保存）を、本詳細分析で実画像から読み取ったセクション境界・固有の構成要素（ABOUT、CASE STUDIES、PRODUCTS、目的から探す等）に置き換えた確定版である。
- セクションのy／height座標は、Dropboxから取得したPC Full Page実画像（`WB-0076_SITE_PC_full.png`、1200×6917px）のピクセル位置から算出したおおよその値であり、実DOM・開発者ツールでの実測値ではない（第17章参照）。

## サイト共通設定

| 項目 | Elementor設定案 |
|---|---|
| Page Layout | Elementor Full Width |
| Outer Container | Full Width、Direction: Column |
| Content Width | 1120〜1200px前後（推奨値、未実測） |
| Gap | Section間64〜96px、内部24〜40px（推奨値） |
| Breakpoints | Desktop 1200、Tablet 1024、Mobile 767以下（推奨値、実際のブレークポイントは未確認） |
| Typography | 見出しは太いゴシック（英字はコンデンス系）、本文は中太ゴシック |
| CTA | Primaryは紺色地に白文字の丸型ボタン、Secondaryは白地に紺色矢印アイコン |
| Border Radius | 写真・カードは中〜大、CTAバナー・バッジはpillまたは大きな角丸 |

## Elementor Navigator想定

```text
Page Root
├── Hero
│   ├── Heading（差し色強調付き）
│   ├── Hero Image（全幅教室写真）
│   ├── Vertical Tagline Text（英語）
│   └── Decorative Shapes（幾何学図形）
├── About
│   ├── Dashed Border Container
│   ├── Two Columns: Label+Heading+Text（左） / Mini Banner Link（右上）
│   └── Photo Gallery Loop Grid（5枚）
├── Pick Up
│   ├── Section Heading + Nav Arrows/Dots
│   └── Loop Carousel: Image / Card Heading
├── Case Studies
│   ├── Light-Blue Background Container
│   ├── Section Heading
│   ├── Loop Grid 3列: Image / Badge("インタビューあり") / School Name / Type Tag / Use-case Tags
│   └── Button: もっと見る
├── Keyword Marquee
│   └── Infinite Scroll Text Repeat（LEARNING/CREATIVE/GROW/CONNECT）
├── Products
│   ├── Section Heading
│   └── Loop Grid 4列×2行: Category Label / Image / Arrow Icon Button
├── Purpose Finder（目的から製品を探す）
│   ├── Left: Icon List Button×4
│   └── Right: Photo Collage Grid
├── Renewal CTA Banner
│   └── Navy Background: Image / Heading / Benefit Tag×3 / Round Button
├── GAIA LABO Banner
│   └── Dashed Border: Illustration Icon / Heading / Speech-bubble Tag / Text / Round Button
├── News
│   ├── Section Heading
│   └── Loop Grid/Posts: Date / Tag / Title
└── Contact + Footer
    ├── Navy CONTACT Banner
    └── Footer: Logo / 3 Column Link List / Emphasis Contact Button / Legal Links / Corporate Logo
```

## セクション別実装判断

| Section | 親Container | 主なWidget | 動的処理・Plugin候補 | SP変換 |
|---|---|---|---|---|
| Hero | Column、中央揃え | Heading、Image、Text（縦書き） | 縦書きはCSS Writing-mode、標準Widget中心 | 見出しを写真に重ねる配置へ変更 |
| About | Row 2列＋Grid | Heading、Text、Image Loop Grid | 方眼背景はContainer背景画像、標準Widget中心 | 写真5枚を2＋1＋2等へ再配置 |
| Pick Up | Column＋Carousel | Loop Carousel、Image、Heading | Elementor Pro Loop CarouselまたはSwiper | 1〜2枚表示（要検証） |
| Case Studies | Column＋Grid | Loop Grid、Image、Icon List（タグ） | 事例CPT＋カスタムフィールド（学校種別・用途タグ） | 1列縦積み |
| Keyword Marquee | Row、横スクロール | Text＋Icon反復 | CSS Marquee／JSプラグイン | 速度・幅を調整して維持 |
| Products | Grid | Loop Grid、Image、Icon Button | 製品カテゴリTaxonomyでLoop Grid自動生成 | 1列縦積み |
| Purpose Finder | Row 2列 | Icon List（Button）、Image Grid | ボタンに製品カテゴリへのアンカーリンクを設定（要検証） | 画像を縮小し縦積み |
| Renewal CTA Banner | Column、中央揃え | Image、Heading、Icon List（Tag）、Button | 標準Widget | ベネフィットタグを折り返し表示 |
| GAIA LABO Banner | Row | Image、Heading、Text、Button | 標準Widget | 縦積み |
| News | Column | Posts Widget／Loop Grid | WordPress投稿＋カテゴリTag | Date→Tag→Titleの順を維持 |
| Contact + Footer | Column＋Grid | Heading、Button、Nav Menu | Theme Builder | 3カラム→Accordion化も可 |

## 実装上の注意

1. CASE STUDIESの学校種別・用途タグは、事例CPTのカスタムフィールド（タクソノミー）として実装し、カードごとにベタ打ちしない。タグ数が多い場合は「他+n」表記で折りたたむ表示ロジックを用意する。
2. 「目的から製品を探す」の4ボタンは、対応するPRODUCTSカテゴリへのアンカーリンクまたはフィルタリングUIとして実装することを推奨する（原サイトでの実際の遷移先は未確認）。
3. 色帯CTAバナー（リニューアル提案／GAIA LABO／CONTACT）は共通のバナーコンポーネント（背景色・画像・見出し・ボタンをフィールド化）として実装し、個別にSectionを複製しない。
4. Heroの縦書き英語タグラインはCSSの`writing-mode`で実装し、画像化しない（多言語差し替え・アクセシビリティのため）。
5. カルーセル以外は極力Elementor標準機能（Loop Grid、Container）で構成する。

## 未確認

- 実サイトのPCヘッダーの正確なグローバルナビ項目・ラベル文言は、Full Page最上部の撮影範囲内で確認できず、フッターのリンク構成からの推測に留まる。
- Pick UpカルーセルのSP表示枚数、自動再生の有無、スワイプ挙動は静止画のため未確認。
- 「目的から探す」ボタンの実際の遷移先（アンカーか別ページか）は未確認。
- 実際のブレークポイント値、コンテナ幅、余白のpx値はすべて画像からの概算であり、開発者ツールでの実測ではない。
- Elementorへ置き換える際の実装案であり、原サイトの内部実装（フレームワーク、アニメーション実装方法等）を断定するものではない。
