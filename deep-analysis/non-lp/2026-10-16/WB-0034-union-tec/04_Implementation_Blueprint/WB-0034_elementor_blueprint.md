# WB-0034｜Elementor脳内実装設計

## 位置づけ

- 29章のデザイン分析とは分離した、WordPress／Elementor制作向けの実装設計である。
- 原サイトのロゴ、固有コピー、施工写真、ポートレート写真、クライアント名は再利用せず、コンテナ構造と情報設計だけを参照する。
- 本ブループリントは日次収集時に生成された仮説版（`screenshots/non-lp-candidates/WB-0034-union-tec/03_Implementation_Blueprint/`）を、29章分析で確定した実際のSection境界・構成要素に基づき確定版として更新したものである。sectionのy/heightはPC Full Page（1200×9955px）の実画像から色境界を実測して設定した。
- Capabilityセクション下部とNews〜Recruit間（元画像y≈1960-3029px、y≈6640-8300px付近）はフルページキャプチャ時点で画像が未読み込みだったため、見出し・ボタンのみを正本情報とし、未確認部分は実装時に別途ヒアリングが必要。

## サイト共通設定

| 項目 | Elementor設定案 |
|---|---|
| Page Layout | Elementor Full Width |
| Outer Container | Full Width、Direction: Column |
| Content Width | 1200px前後。本文系は960px程度へ絞る |
| Gap | Section間96〜140px、内部24〜40px |
| Breakpoints | Desktop 1200、Tablet 1024、Mobile 375以下 |
| Typography | 見出し・ワードマークは極太ゴシック、本文は中太ゴシック |
| CTA | Primary(Contact)は黒塗りピル、Secondary(Discover more)は白地黒縁ピル |
| 写真トリミング | 楕円(オーバル)マスクをヒーロー・ポートレートに使用 |

## Elementor Navigator想定

```text
Page Root
├── Header [Global]
│   └── Header Inner: Site Logo / Ja-En Switch / Nav Group A(強み・事業展開・企業情報) /
│       Nav Group B(アクセス・採用・お知らせ) / Contact Button / Menu Toggle
├── Hero(FV)
│   ├── Background Wordmark Text("UNION TEC")
│   ├── Oval-masked Image(施工現場/プロダクト)
│   ├── Split Heading("人類に意義ある空間を")
│   ├── Lead Text
│   └── Scroll Indicator
├── Philosophy Statement
│   └── Centered Text Block(3 Paragraphs)
├── Capability
│   ├── Section Heading + Subheading
│   └── Discover More Button
│   [注] 下部の追加コンテンツ(アイコン等)は未確認。実装前に実機再確認が必要。
├── Service
│   ├── Blurred Photo Background
│   ├── Section Heading + Description
│   ├── Bullet List(4 items: Spatial Design / Planning&Engineering /
│   │   Construction Management / Digital&Technical Services)
│   └── Discover More Button
├── Featured Projects
│   ├── Section Heading + Carousel Arrows
│   └── Project Card Loop: Category Label(Shop/Office/Hotel) / Large Image / Project Name
├── News
│   ├── Section Heading + Category Filter Tabs
│   ├── News Item Loop: Thumbnail / Title / Date / Category Tag
│   └── View All Button
├── Recruit
│   ├── Discover More Button
│   └── Oval-masked Portrait Image
└── Footer
    ├── Large Wordmark + Tagline Repeat
    ├── Office Locations Grid(本社/関西支店/ベトナム/ニューヨーク)
    ├── Nav Repeat + SNS Links
    ├── Certification Logos Row
    └── Privacy Policy / Contact Button / Copyright
```

## セクション別実装判断

| Section | 親Container | 主なWidget | 動的処理・Plugin候補 | SP変換 |
|---|---|---|---|---|
| Header | Row、Space Between | Site Logo、Nav Menu×2群、Button | Elementor Pro Theme Builder(Sticky Header) | ロゴ＋Contact/Menuピルのみ残し、ナビはオフキャンバスメニュー化 |
| Hero(FV) | Column、中央揃え＋背景テキスト | Heading(大型)、Image(Oval Mask)、Text、Scroll Icon | 画像マスクはCSS clip-pathまたはElementor Image内蔵マスク機能 | ワードマークと写真を縦圧縮、重なり順を維持 |
| Philosophy | Column、中央寄せ | Text Editor | 標準Widget | 行間・段落間を保持しつつ1カラム化 |
| Capability | Column、中央揃え | Heading、Text、Button | 下部コンテンツ未確認のためLoop/Icon Box等は実機確認後に決定 | 同一構成を1カラムで継承 |
| Service | Column、背景画像 | Background Image(Blur)、Heading、Text、Icon List、Button | Background OverlayはElementor標準機能で実装可 | 背景画像比率を縦長に調整、箇条書きはそのまま縦積み |
| Featured Projects | Row＋Carousel | Loop Carousel、Image、Text、Arrow Nav | Elementor Loop Carousel／Swiper | 1枚表示のスワイプカルーセルへ変換 |
| News | Column＋Grid/List | Loop Grid、Image、Heading、Text、Tag | WordPress投稿タイプ化を推奨 | サムネイル＋テキストを縦1列に変換 |
| Recruit | Column、中央揃え | Button、Image(Oval Mask) | 標準Widget | 同一構成を1カラムで継承 |
| Footer | Column＋Grid | Nav Menu、Icon List、Image(Logos)、Button | Theme Builder | 拠点情報・ナビを縦積み、ロゴ列は折り返しグリッド |

## 実装上の注意

1. ヒーローのワードマーク＋楕円写真の重なりは、背景テキストと前景画像の2レイヤーをElementor標準のポジショニング機能で重ね、無理にCSSを追加しない。
2. Capabilityセクション下部は29章分析時点で未読み込みのまま確認できなかったため、実装前に実機の再スクロール確認を行い、アイコン・追加テキストの有無を確定させる。
3. Featured Projects・NewsはCPT（カスタム投稿タイプ）化し、静的カード量産ではなくLoop Item化することで追加・並び替えを容易にする。
4. 複数拠点フッターは拠点数が変わる可能性を考慮し、固定列数ではなく可変グリッドで組む。
5. カルーセル、オフキャンバスメニュー以外は極力Elementor標準機能で構成する。

## 未確認

- Capabilityセクション下部、News〜Recruit間の空白領域に本来存在する可能性のあるコンテンツ（アイコン、追加写真、追加テキスト等）は未確認。
- SPのハンバーガーメニュー展開後の項目構成は未検証。
- 実サイトのCMS、使用ライブラリ、アニメーション仕様、正確なブレークポイント値は未確認。
- Elementorへ置き換える際の実装案であり、原サイトの内部実装を断定するものではない。
