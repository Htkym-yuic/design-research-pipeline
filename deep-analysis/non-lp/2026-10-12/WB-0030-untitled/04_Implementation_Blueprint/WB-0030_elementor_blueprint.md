# WB-0030｜Elementor脳内実装設計

## 位置づけ

- 29章のデザイン分析とは分離した、WordPress／Elementor制作向けの実装設計である。
- 原サイトの固有コピー、ロゴ、歴史写真、事業写真、ニュース記事内容は再利用せず、コンテナ構造と情報設計だけを参照する。
- 正本画像はCookie同意バナーが表示された状態のPC Full Pageキャプチャを使う。バナー自体はページ構造ではなくPopup/Notice Widgetとして扱う。
- セクション境界（y座標）は実測DOMではなく、取得したPC Full Page画像（1200×8398px）を目視して区切った推定値である。実装時は対象サイトでのDOM実測を推奨する。

## サイト共通設定

| 項目 | Elementor設定案 |
|---|---|
| Page Layout | Elementor Full Width |
| Outer Container | Full Width、Direction: Column |
| Content Width | 1200px前後。本文系は1000〜1100pxへ絞る |
| Gap | Section間96〜140px、内部24〜48px |
| Breakpoints | Desktop 1440、Tablet 1024、Mobile 767以下（タブレット固有の挙動は未確認） |
| Typography | 和文見出しは太いゴシック、英文タグライン・ラベルはセリフ体またはやや装飾的な書体、本文は中太ゴシック |
| CTA | Primaryは黒塗り角丸ボタン、Secondaryは白地＋黒枠のアウトラインボタン |
| 背景切替 | 明（白〜薄グレー）と暗（黒〜濃灰）を交互配置する構成原則を維持する |

## Elementor Navigator想定

```text
Page Root
├── Global Header [Sticky要実測]
│   └── Header Inner: Logo / Nav Menu(4) / Divider / External Links(2) / Locale Toggle / Hamburger
├── Hero
│   ├── Heading(2行)
│   ├── Text（タグライン）
│   └── Background Decoration: 多色ラインイラスト
├── Identity Intro
│   ├── Image Grid（非対称3枚）
│   ├── Heading／Text
│   └── CTA Button
├── Cookie Consent [Popup Widget・ページ構造外]
├── History
│   ├── Background Decoration: 巨大アウトラインText
│   ├── Label／Heading／Text
│   ├── Timeline Nav（横並び9項目）
│   └── Era Detail: Image×4(白黒) / Heading / Text / Next-Era Circular Preview
│   └── CTA Button
├── Business
│   ├── Sticky Image（事業ごとに差し替え）
│   └── Loop(4): Number / Heading(JP) / Label(EN) / Text / Arrow Icon
│   └── CTA Button
├── Sustainability
│   ├── Heading／Text／CTA Button
│   └── Image Grid（非対称3枚）
├── News
│   ├── Heading
│   └── Loop Grid(3件表示): Thumbnail / Date / Category Badge / Heading / Arrow Icon
│   └── CTA Button
└── Footer
    ├── Link Columns(4): About STYLEM / Business / Sustainability / News
    ├── Outline Button Group(3): Fabric Store / Recruit / Contact Us
    ├── Large Logo + Tagline
    └── Legal Row: Copyright / サイトマップ / 個人情報保護ポリシー / ご利用条件
```

## セクション別実装メモ

### 00｜グローバルヘッダー（y=0-80）

- 親Container: 横並び、両端揃え（Justify: Space Between）。
- 左: Logo（画像またはテキストロゴ、About STYLEMへリンク）。
- 右: Nav Menu Widget(4項目、各+アイコンはサブメニュー開閉インジケーター) → 縦区切り線 → 外部リンク2つ(↗アイコン付き) → 言語トグル(Pill型) → Hamburger Icon。
- SP: Logo＋言語トグル＋Hamburgerのみ。Nav Menuと外部リンクはオフキャンバスメニューへ格納想定（展開内容は未確認のため実装時に要確認）。
- Stickyヘッダーかどうかは画像から判断できないため未確認。固定ヘッダーにする場合はz-indexをCookie Popupより低く設定する。

### 01｜Hero／ファーストビュー（y=80-620）

- 親Container: 縦積み、左寄せ。
- Heading(H1相当、2行、PC/SPで改行位置を変更)。
- Text（タグライン「1864 >>> Your Creative Partner」、小さめグレー）。
- 背景装飾: 多色ラインイラスト（SVG推奨、画像の場合はPNG/WebP）。Containerの背景またはAbsolute配置の装飾要素として扱う。
- SP: イラストを縦方向に圧縮し見出し下部へ配置。

### 02｜アイデンティティ導入（y=620-2185）

- 親Container: 縦積み。
- Image Grid Widget（非対称3枚、Gallery or 個別Image+Absolute位置調整）。
- Heading「世界を彩るスタイレム。」／Text／CTA Button(About STYLEM)。
- Cookie同意バナーはこのSection内の固定位置に重なるが、構造上は別レイヤーのPopup/Notice Widgetとして実装する（Section自体の高さ計算に含めない）。
- SP: Image Gridをインターロック型マソンリー（2列、縦方向にオフセット）に再配置。

### 03｜History（沿革）（y=2185-3740）

- 全幅Container、背景色を黒〜濃灰に切替。
- 背景装飾: 英語フレーズの巨大アウトラインText（opacity低め、z-index最背面）。
- Label(History)／Heading／Text（中央寄せ）。
- Timeline Nav: 横並びの年代リスト(1864/1906/1940/1952/1970/1980/2001/2021/2026)、選択中の年代にアンダーライン。クリックで対応する年代詳細へスクロールまたは切り替わる想定（実際の挙動は未確認、Tabs WidgetまたはカスタムJSでの実装を検討）。
- Era Detail: 2カラム（白黒写真×4の不規則グリッド＋Heading/Text）、右端に次年代への円形プレビュー（Nextボタンを兼ねる）。
- CTA Button(Our History)。

### 04｜Business（事業紹介）（y=3740-5280）

- 2カラム親Container。
- 左: Sticky Image（スクロールに応じて事業ごとに差し替わる想定、JSでのIntersection Observer実装、または静的な1枚画像でも可）。
- 右: Heading(Business)／Text（Your Creative Partner説明文）／Loop Grid(4件、縦積み): 連番(01-04)／Heading(JP)／Label(EN)／Text(1行)／矢印Icon(リンク)。各項目間にDivider。
- CTA Button(Our Business)。
- SP: 2カラム→Column化。各カードにInline Image（Stickyではなく通常配置）を追加。

### 05｜Sustainability（y=5280-6500）

- 親Container: 縦積み。
- Heading／Text／CTA Button(Our Sustainability)。
- Image Grid（非対称3枚、02のグリッドと同系統のパターンを再利用）。
- SP: Column化、画像サイズを調整。

### 06｜News（y=6500-7400）

- Heading(News)＋区切り線。
- Loop Grid Widget(3件表示): Thumbnail Image／Date／Category Badge(角丸アウトライン)／Heading／矢印Icon。行間にDivider。
- CTA Button(Our News)。
- 各行の遷移先URLは未確認のため、実装時に個別記事ページのリンク構造を確認する。

### 07｜フッター＋問い合わせCTA（y=7400-8398）

- 全幅Dark Background Container。
- 4列Link Nav（About STYLEM／Business／Sustainability／News、各列にサブリンクLoop）。Sustainability列のみ環境／社会の2階層サブグループを持つ点に注意。
- 右列: Outline Button Group(3): STYLEM Fabric Store↗／Recruit↗／Contact Us。
- 大型Logo Image＋タグラインText（ブランド再認識用）。
- 最下段: Copyright Text＋Legal Link Row（サイトマップ／個人情報保護ポリシー／ご利用条件）。
- SPでの4列グリッドの折り返し方（1列積みかアコーディオン化か）は未確認。情報量が多いため、SPではアコーディオン化を推奨案として記録する（確定ではない）。

## 共通レスポンシブ手順

1. PCの横並びNav MenuはSPでHamburgerメニューへ切り替える。
2. 2カラムSection（Business）はSPでColumn化し、画像→見出し→本文→CTAの順を優先する。
3. Image GridはPC側のオフセット配置からSP側のインターロック型マソンリーへ再構成する。
4. Timeline Navは横スクロール可能なContainerとして実装し、SPでもタップで年代を選択できるようにする。
5. 余白はSpacerではなく、親ContainerのGapとPaddingを優先する。

## Atomic ElementsとCSS

- Atomic Elements: Timeline Navの横スクロール＋選択状態の切り替えなど、標準Containerでは複雑になる挙動がある場合のみ候補とする。
- CSS: 標準のLayout、Style、Advanced、Responsiveで再現できないことを確認するまで追加しない。背景の巨大アウトラインTextのような装飾表現はCSS（text-stroke等）が必要になる可能性が高く、その場合は対象クラスと代替案をここに追記する。

## 未確認

- グローバルヘッダーのSticky挙動
- ハンバーガーメニュー展開時の内容・デザイン
- Timeline Navの実際のクリック/タップ挙動（切り替えかスクロールジャンプか）
- 年代別詳細カルーセルの自動再生有無
- Newsの各記事・フッター各リンクの遷移先
- 正確なHEX値、フォントファミリー名、ブレークポイントの実数値
- タブレット固有の調整値
- 使用素材（写真・イラスト）のライセンスと差し替え条件

## 参照

- 対象URL: https://stylem.co.jp/
- 元画像: ../01_Normal_Images/WB-0030_SITE_PC_full.png
- 注釈画像: WB-0030_elementor_brain_implementation.png
