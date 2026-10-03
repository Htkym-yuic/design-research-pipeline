# WB-0004｜Elementor脳内実装設計

## 位置づけ

- 29章のデザイン分析とは分離した、WordPress／Elementor制作向けの実装設計である。
- 原サイトの固有コピー、ロゴ、人物写真、UI画像は再利用せず、コンテナ構造と情報設計だけを参照する。
- 正本画像は固定キャンペーンポップアップを閉じたPC/SPキャプチャを使う。上部の告知バーはページ構造として残す。

## サイト共通設定

| 項目 | Elementor設定案 |
|---|---|
| Page Layout | Elementor Full Width |
| Outer Container | Full Width、Direction: Column |
| Content Width | 1280px前後。本文系は960〜1120pxへ絞る |
| Gap | Section間96〜144px、内部24〜48px |
| Breakpoints | Desktop 1440、Tablet 1024、Mobile 767以下 |
| Typography | 見出しは太いゴシック、本文は中太ゴシック |
| CTA | Primaryは青塗り、Secondaryは白地＋細枠 |
| Border Radius | 写真・カードは24〜32px、Buttonはpill |

## Elementor Navigator想定

```text
Page Root
├── Announcement Bar
│   └── Inner Container: Icon / Text / Detail Button
├── Global Header [Sticky]
│   └── Header Inner: Site Logo / Nav Menu / Utility Links / Login
├── Hero
│   ├── News Carousel
│   ├── Heading
│   ├── Service Scope Text
│   ├── Lead Text
│   ├── CTA Row: Primary Button / Secondary Button
│   └── Hero Media: Image or Video
├── Service Catalog
│   ├── Section Heading
│   └── Service Loop Grid
│       └── Service Card: Image / Heading / Text / Link
├── Onboarding Support
│   └── Two Columns: Copy Group / Image or UI Mock
├── Pricing
│   ├── Section Heading
│   └── Pricing Grid
│       └── Pricing Card: Plan / Price / Feature List / CTA
├── Case Studies
│   └── Loop Carousel: Image / Quote / Company / Link
├── Document Downloads
│   └── Loop Grid: Cover / Category / Heading / Button / Form Popup
├── News
│   └── Posts or Loop Grid: Date / Category / Title
├── FAQ
│   └── Two Columns: Intro and CTA / Accordion
├── Final CTA
│   └── Heading / Proof Text / Primary and Secondary Buttons
└── Footer
    ├── Legal Notes
    └── Link Grid / Logo / Social Icons / Copyright
```

## セクション別実装判断

| Section | 親Container | 主なWidget | 動的処理・Plugin候補 | SP変換 |
|---|---|---|---|---|
| 告知バー | Row、中央揃え | Icon、Text、Button | 期限で表示切替。必要ならDynamic Visibility | 文言短縮、Button維持 |
| Header | Row、Space Between | Site Logo、Nav Menu、Button | Elementor Pro Theme Builder | Hamburger化 |
| Hero | Column、中央揃え | Heading、Text、Button、Image/Video | 告知はLoop CarouselまたはSwiper | CTA縦積み、画像比率変更 |
| Service | Column＋Grid | Loop Grid、Image、Heading、Text | CPT化すると追加・並び替えが容易 | 1列縦積み |
| Onboarding | Row 2列 | Heading、Text、Button、Image | 基本は標準Widgetで実装 | Copy→Image |
| Pricing | Grid | Heading、Icon List、Button | RepeaterまたはLoop Item | 1列、推奨プラン先頭 |
| Case Study | Column | Loop Carousel | Swiper／Elementor Loop Carousel | 1枚表示 |
| Documents | Grid | Loop Grid、Button | Popup＋Form、資料CPT | 1列または横スクロール |
| News | Column | Posts／Loop Grid | WordPress投稿 | Date→Category→Titleを維持 |
| FAQ | Row 2列 | Heading、Text、Accordion | FAQ Schema対応 | 縦積み |
| Final CTA | Column | Heading、Text、Button | 標準Widget | Button縦積み |
| Footer | Column＋Grid | Nav Menu、Icon List、Social Icons | Theme Builder | Link群をAccordion化可能 |

## 実装上の注意

1. 見た目を一枚の背景画像として再現せず、Sectionごとに独立した親Containerを作る。
2. Service、事例、資料、Newsは静的カード量産ではなく、Loop Itemと投稿タイプへ寄せる。
3. PC/SPでDOM順を大きく変えず、Direction、Order、Wrap、Widthで再構成する。
4. 固定キャンペーンポップアップは分析・実装参照画像に含めない。実装する場合もHero写真を覆わない位置と頻度にする。
5. カルーセル、Accordion、Popup以外は極力Elementor標準機能で構成する。

## 未確認

- 実サイトのCMS、使用ライブラリ、アニメーション時間、ブレークポイント値は未確認。
- Elementorへ置き換える際の実装案であり、原サイトの内部実装を断定するものではない。
- 資料ダウンロードのフォーム連携、会員情報、計測タグは案件要件に合わせて別設計する。
