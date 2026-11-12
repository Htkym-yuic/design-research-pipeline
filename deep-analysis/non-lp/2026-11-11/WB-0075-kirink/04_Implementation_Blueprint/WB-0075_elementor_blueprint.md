# WB-0075｜Elementor脳内実装設計（確定版）

## 位置づけ

- 29章のデザイン分析とは分離した、WordPress／Elementor制作向けの実装設計である。
- 原サイトの固有コピー、ロゴ、人物写真、記事本文は再利用せず、コンテナ構造と情報設計だけを参照する。
- 日次自動生成の仮説版（`WB-0075_elementor_implementation.json`、8セクションの汎用テンプレート、Dropbox `99_Needs_Review/2026-11-11/daily-intake/WB-0075/` に保存）を、本詳細分析で実画像から読み取ったセクション境界・固有の構成要素（年齢確認モーダル、テーマ別新着、連載カラーカード、つながるメディア等）に置き換えた確定版である。
- セクションのy／height座標は、Dropboxから取得したPC Full Page実画像（`WB-0075_SITE_PC_full.png`、1200×9358px）のピクセル位置から算出したおおよその値であり、実DOM・開発者ツールでの実測値ではない（第17章参照）。

## サイト共通設定

| 項目 | Elementor設定案 |
|---|---|
| Page Layout | Elementor Full Width |
| Outer Container | Full Width、Direction: Column |
| Content Width | 1120〜1200px前後（推奨値、未実測） |
| Gap | Section間64〜96px、内部24〜48px（推奨値） |
| Breakpoints | Desktop 1200、Tablet 1024、Mobile 767以下（推奨値、実際のブレークポイントは未確認） |
| Typography | 見出しは極太ゴシック、本文は中太ゴシック |
| CTA | 年齢確認・記事導線ともに黒塗りピル型ボタンで統一 |
| Border Radius | カード・写真で中程度、モーダル・バッジは大きめの角丸 |

## Elementor Navigator想定

```text
Page Root
├── Global Header
│   └── Header Inner: モーション/言語切替(Ja/En) / 新着・連載・キリンクとは / 検索Button
├── Date & Logo Bar
│   └── Date Block / KIRINK Logo / Tagline Text / "キリンク、はじまりました" Badge
├── Hero + Age-Gate
│   ├── Hero Media: Image + Back Button
│   ├── Age Verification Modal [Popup] : Text / Button(はい) / Link(いいえ)
│   ├── Cookie Consent Bar [Popup/Bar]
│   └── News Loop List（3件）: Thumbnail / Category / Title
├── Keyword Tags + Category Highlights
│   ├── Keyword Chip Carousel
│   └── Category Block（色分けUnderline + Loop Grid）× 可変件数
├── Feature Grid（次のキリン）
│   └── Loop Grid: Image / Category / Heading / Tags
├── Series Cards（連載）
│   ├── Loop Grid 3列×2行: Series Color Card（Image or Illustration / Label / "連載を見る"）
│   └── Button: 連載一覧
├── Theme Highlights（テーマ別新着）
│   └── Theme Block（表示テーマのみ）× 最大6: Underline Color / Loop Grid
├── Glossary + Featured Policy
│   ├── Glossary Card: Label / Button(一覧を見る)
│   └── Policy Card: "Innovate2035!" Heading / Text / Link
├── Logo Marquee
│   └── Infinite Scroll Text/Logo Repeat
├── Related Media Grid（つながるメディア）
│   └── Loop Grid 4列×2行: Logo Image / Link Text / External Icon
└── Footer
    ├── Footer Top: Logo / Back-to-top Button
    ├── 3 Column Nav: Contents / Themes / SNS
    └── Legal Bar: Age/Alcohol Notices / Corporate Links / Copyright
```

## セクション別実装判断

| Section | 親Container | 主なWidget | 動的処理・Plugin候補 | SP変換 |
|---|---|---|---|---|
| Global Header | Row、Space Between | Nav Menu、言語切替Toggle、Search Button | Elementor Pro Theme Builder | アイコンのみに圧縮 |
| Date & Logo Bar | Column、中央揃え | Heading（日付）、Image（ロゴ）、Text（タグライン） | 標準Widget | そのまま縦積み |
| Hero + Age-Gate | Column（Hero）＋Popup（モーダル） | Image、Button、Popup Builder、Loop Grid（News） | Elementor Pro Popup Builder（年齢確認・Cookie） | モーダルは画面中央固定を維持、News ListはHero下へ移動 |
| Keyword Tags | Row、横スクロール | Icon List／Button Group | 横スクロールにはCarousel系Widgetまたはカスタムスクロール | チップを折り返し表示に変更 |
| Category Highlights | Column＋Grid | Loop Grid、Heading、Image、Text | CPT（記事）＋カテゴリTaxonomyでLoop Grid自動生成 | 1列縦積み、カテゴリ数は新着有無で可変 |
| Feature Grid | Grid | Loop Grid | 特集用Taxonomyまたは手動Repeater | 1列縦積み |
| Series Cards | Grid | Loop Grid、Image/Illustration、Button | シリーズごとに背景色をLoop Item条件分岐で設定 | 1列縦積み |
| Theme Highlights | Column反復 | Loop Grid×テーマ数 | テーマTaxonomyで新着0件時は自動非表示（要検証） | 新着があるテーマのみ縦積み表示 |
| Glossary + Policy | Row 2列 | Heading、Button、Text | 標準Widget | 縦積み |
| Logo Marquee | Row、横スクロール | Image反復 | CSS Marquee／JSプラグイン | 速度・幅を調整して維持 |
| Related Media Grid | Grid | Loop Grid、Image、Text、Icon | 固定Repeater（社数が少なく更新頻度が低いため） | 1列縦積み |
| Footer | Column＋Grid | Nav Menu、Icon List、Image | Theme Builder | 3カラム→Accordion化も可 |

## 実装上の注意

1. 年齢確認モーダルとCookie同意バーは、分析用のスクリーンショットでは同時に表示されているが、実装時は両者が同時に視界を塞がないよう、表示タイミング・優先順位を設計する（第13〜14章のP0改善案に対応）。
2. テーマ別新着（6テーマ）は新着記事の有無で表示テーマ数が変わる可能性があるため、記事CPTのクエリ条件（カテゴリ別件数0件なら非表示）として実装し、固定6ブロックをハードコーディングしない。
3. 連載カードのシリーズ別固有色・イラストは、Loop ItemのDynamic Tag（カスタムフィールド）で背景色・画像を切り替える設計にし、カードごとにテンプレートを複製しない。
4. 「つながるメディア」はグループ会社・関連メディアへの外部リンクであることをアイコンで明示し、target="_blank"相当の挙動にする。
5. カルーセル、Popup以外は極力Elementor標準機能（Loop Grid、Container）で構成する。

## 未確認

- 実サイトのCMS、記事取得のクエリ条件、年齢確認モーダルの表示ロジック（Cookie等での再訪問時非表示化の有無）は未確認。
- 気になるキーワードタグの横スクロール挙動（ドラッグ／矢印ボタン操作時の件数・ループ有無）は静止画のため未確認。
- テーマ別新着で「飲みもの・お酒」「社会・サステナビリティ」が撮影時点で非表示だった正確な条件（新着0件か、別の表示ロジックか）は未確認。
- 実際のブレークポイント値、コンテナ幅、余白のpx値はすべて画像からの概算であり、開発者ツールでの実測ではない。
- Elementorへ置き換える際の実装案であり、原サイトの内部実装（フレームワーク、アニメーション実装方法等）を断定するものではない。
