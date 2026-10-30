# WB-0035｜Elementor脳内実装設計

## 位置づけ

- 29章のデザイン分析とは分離した、WordPress／Elementor制作向けの実装設計である。
- 原サイトのロゴ、抽象3Dビジュアル、固有コピー、数値実績は再利用せず、コンテナ構造と情報設計だけを参照する。
- 本ブループリントは日次収集時に生成された仮説版（`screenshots/non-lp-candidates/WB-0035-untitled/03_Implementation_Blueprint/`）を、29章分析で確定した実際のSection境界・構成要素に基づき確定版として更新したものである。sectionのy/heightはPC Full Page（1200×11197px）の実画像から色境界を実測して設定した。
- PC側ヒーロービジュアルおよびプレスリリース〜フッター間の2箇所の長い空白区間（y≈4763-6128px、y≈7968-10420px付近）はフルページキャプチャ時点で未読み込みだったため、「未読み込み領域（要再検証）」として明示し、実装前の実機確認を前提とする。

## サイト共通設定

| 項目 | Elementor設定案 |
|---|---|
| Page Layout | Elementor Full Width |
| Outer Container | Full Width、Direction: Column |
| Content Width | 1200px前後。本文系は900〜1000pxへ絞る |
| Gap | Section間100〜160px、内部24〜40px |
| Breakpoints | Desktop 1200、Tablet 1024、Mobile 375以下 |
| Typography | 見出し(つくる/整える/届ける等)は丸み太字ゴシック、本文は細めゴシック |
| CTA | Primary(お問合せ／私たちの役割)はネイビー塗りピル |
| アクセントカラー | ネイビー(見出し・ボタン)＋オレンジ〜グリーンのグラデーション(ヒーロービジュアルのみ) |

## Elementor Navigator想定

```text
Page Root
├── Header [Global]
│   └── Header Inner: Logo(アイコン+ロゴタイプ) / Nav Menu
│       (Road to 2030 / 私たちの役割 / 事業領域▾ / 会社情報▾ / プレスリリース / お知らせ) /
│       お問合せ Button
├── Hero(FV)
│   ├── Abstract 3D Visual(Glass/Battery Cell Render)
│   ├── Large Heading("しなやかに、力強い電力を。")
│   └── Road to 2030 Corner Card(+ Arrow Link)
│   [注] PC Full/FirstViewでは未読み込み。SP First View・reference.pngを正本参照とする
├── Press Release
│   ├── Section Heading("PRESS RELEASE／プレスリリース")
│   └── Growth Strategy Card Carousel
│       (Pick Up Ribbon / Title / Date / Tag / Lead Text / Thumbnail / Prev-Next Arrows)
├── Business Areas(事業領域)
│   ├── Area 01 "EPC Business／つくる": English Label / Kanji Heading / Description / Image / CTA
│   ├── Area 02 "Aggregation／整える": 同上
│   └── Area 03 "Energy Supply／届ける": 同上
│   [注] 各エリア付随画像は撮影時点で空白。実装前に実機確認が必要
├── [未読み込み領域: 要実機確認]
│   両セクション間に存在する可能性のある追加コンテンツ(事例・実績等)は未確認
└── Footer
    ├── Company Info(社名/住所/TEL)
    ├── Nav Group A(Road to 2030/私たちの役割/事業領域サブメニュー)
    ├── Nav Group B(会社情報/グループ会社/沿革/ミッション/代表インタビュー)
    ├── Nav Group C(プレスリリース/お知らせ/お問合せ/プライバシーポリシー)
    ├── CTA Card("私たちの役割" + Arrow)
    ├── Large Tagline Repeat
    └── Copyright
```

## セクション別実装判断

| Section | 親Container | 主なWidget | 動的処理・Plugin候補 | SP変換 |
|---|---|---|---|---|
| Header | Row、Space Between | Logo、Nav Menu(ドロップダウン2項目含む)、Button | Elementor Pro Theme Builder | ロゴ＋メール/ハンバーガーアイコンのみ残す |
| Hero(FV) | Column、中央揃え | Heading(大型)、3D/Video Background、Card(Road to 2030) | 3DビジュアルはLottie/Video埋め込みまたは静止画で代替 | ビジュアルを先に表示し見出しを下に配置(SP実績のレイアウトを正本とする) |
| Press Release | Column＋Carousel | Loop Carousel、Heading、Text、Tag、Date | WordPress投稿タイプ＋Elementor Loop Carousel | カード1枚表示のスワイプへ変換 |
| Business Areas | Row 2列×3ブロック | Heading(英語+漢字)、Text、Image、Button | Repeater/Loop Itemで3エリアを管理 | 画像→見出し→本文→ボタンの縦積みへ変換 |
| [未読み込み領域] | — | — | 実機確認後にWidget構成を決定 | 同上 |
| Footer | Column＋Grid | Nav Menu×3群、Button、Heading | Theme Builder | 3群ナビを縦積み、CTAカードは全幅維持 |

## 実装上の注意

1. ヒーローの抽象3Dビジュアルは、PC Full Page/First Viewでは未読み込みだったため、SP First View・reference.pngの構図（ビジュアル→見出しの縦順）を正本として実装する。
2. 成長戦略カードは数値（供給力・容量・売上目標）を差し替え前提のダイナミックフィールドとして設計し、将来の数値更新に備える。
3. 事業領域3ブロックはRepeater／Loop Itemで統一管理し、英語ラベル・漢字見出し・説明文・画像・CTAのセット構成を崩さない。
4. 2箇所の未読み込み領域（プレスリリース直後、事業領域直後）は、実装着手前に必ず実機を再訪し、事例・実績コンテンツの有無を確認してからコンポーネントを追加する。
5. カルーセル、ドロップダウンナビ以外は極力Elementor標準機能で構成する。

## 未確認

- PC側ヒーロービジュアルの正確な配色・アニメーション仕様。
- プレスリリース直後(y≈4763-6128px)および事業領域直後(y≈7968-10420px)の未読み込み領域に存在する可能性のあるコンテンツ（顧客事例、実績数値、追加CTA等）。
- 「事業領域▾」「会社情報▾」ドロップダウンの展開内容。
- 実サイトのCMS、使用ライブラリ、正確なブレークポイント値は未確認。
- Elementorへ置き換える際の実装案であり、原サイトの内部実装を断定するものではない。
