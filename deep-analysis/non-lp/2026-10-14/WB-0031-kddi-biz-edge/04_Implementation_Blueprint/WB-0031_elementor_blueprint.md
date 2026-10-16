# WB-0031｜Elementor脳内実装設計

## 位置づけ

- 29章のデザイン分析とは分離した、WordPress／Elementor制作向けの実装設計である。
- 原サイトの固有コピー、ロゴ、社員写真、固有の会社名は再利用せず、コンテナ構造と情報設計だけを参照する。
- 正本画像はPC Full Pageキャプチャを使う。セクション境界はDOM実測ではなく画像の目視推定である。

## サイト共通設定

| 項目 | Elementor設定案 |
|---|---|
| Page Layout | Elementor Full Width |
| Outer Container | Full Width、Direction: Column |
| Content Width | 1200px前後 |
| Gap | Section間80〜120px、カード内部24〜32px |
| Breakpoints | Desktop 1440、Tablet 1024、Mobile 767以下（タブレット固有の挙動は未確認） |
| Typography | カテゴリ見出し（About/People/Growth/Recruit）は英字の太いゴシック体で大きく、本文は中太ゴシック体 |
| CTA | Primary(ENTRY)はピンクのソリッドボタンで他要素と差別化。Secondary(View All/View More)はテキストリンク＋矢印アイコン |
| カード | アイコンまたは写真＋タイトル＋説明＋矢印アイコンの共通Loop Itemを複数セクションで再利用 |

## Elementor Navigator想定

```text
Page Root
├── Global Header [Sticky想定]
│   └── Logo / Nav Menu(4、2項目はサブメニュー想定) / ENTRY Button
├── Hero
│   ├── Image×3(対角線配置) + Arrow Connector(装飾)
│   └── Label + Heading
├── Manifesto Text
│   └── 長文Text Block + Image×2
├── About
│   ├── Top Message Card: Image / Text / Button(View More)
│   └── Grid(2×2): Repeater(Icon/Image, Heading, Text, Arrow)
├── People
│   ├── Repeater(3): Background Color / Image / Role+Name / One-line Copy / Arrow(色対応)
│   └── Button(View All)
├── Panorama Image Strip [3分割全幅]
├── Growth
│   └── Repeater(3): Image / Heading / Text / Arrow
├── Office Image [全幅]
├── Recruit
│   ├── Repeater(3): Icon / Heading / Text / Arrow
│   └── Button(View All)
├── Final CTA [Ribbon Background]
│   └── Heading / Button(ENTRY、大型) / Text
└── Footer
    ├── Logo / SNS Link / External Links(お問い合わせ/プライバシーポリシー/コーポレートサイト)
    ├── Link Grid(4列: About/People/Growth/Recruit)
    └── Tagline(大型Text再掲) / Copyright
```

## セクション別実装メモ

### 00｜ヘッダー＋ファーストビュー（y=0-800）

- 親Container: 横並び、両端揃え。Logo／Nav Menu(4項目、ABOUT・GROWTHに+アイコン)／ENTRY Button(ピンク、ピル型)。
- Hero: Image3枚を対角線上にオフセット配置、間を矢印アイコン（装飾Shape/SVG）で接続。
- Label「KDDI Biz Edge Corporation RECRUIT SITE」＋大型Heading。

### 01｜マニフェストコピー（y=800-2500）

- 単一Column Container、長文Text Block（段落ごとに空行）。
- 右側にImage×2（サイズ違い）を配置。

### 02｜About（y=2500-4500）

- Top Message: 2カラムCard（左Image、右Text+役職氏名+Button）。
- その下にGrid Container(2×2): 各セルはIcon(矢印)＋Image＋Heading＋Text。4セル目「数字で見るKDDI Biz Edge」はCounter Widgetを想定（本分析のキャプチャでは数値が描画されず、章17参照）。

### 03｜People（y=4500-5200）

- 3-Column Repeater。各カードは背景色(青/ピンク/黄)付きContainer＋Image＋役職＋氏名＋一言コピー＋背景色に対応した矢印Icon Button。
- 下にButton(すべての社員紹介を見る View All)。

### 04｜パノラマ写真＋Growth（y=5200-6900）

- 全幅3分割Image Gallery（Flexboxで等間隔）。
- Growth: Heading＋導入Text＋3-Row List Repeater(Image/Heading/Text/Arrow)。

### 05｜Recruit（y=6900-7500）

- 全幅Image。
- Recruit: Heading＋導入Text＋3-Row List Repeater(Icon/Heading/Text/Arrow)＋Button(採用情報をすべて見る View All)。

### 06｜最終ENTRY CTA（y=7500-7980）

- 背景: カラフルな曲線リボン（SVGまたは画像、teal/ピンク/黄/青のグラデーション）。
- 中央Column: Heading／ENTRY Button(大型、矢印Icon付き)／補足Text。

### 07｜フッター（y=7980-8632）

- 左Column: Logo／SNS Link／External Link List。
- 右Grid(4列): About/People/Growth/Recruitそれぞれのサブリンク。
- 最下段: Tagline(大型Text、本文と同じ文言を再掲)／Copyright Text。

## 共通レスポンシブ手順

1. ヘッダーNav(4項目)はSPでHamburgerへ切り替える。
2. AboutのGrid(2×2)はSPで縦積み1列に変更する。
3. Peopleの3-Column CardはSPで横スクロールまたは縦積みに変更する（本分析では未確認のため実装時に選定）。
4. Growth/Recruitの3-Row ListはPC/SPとも基本構造を維持し、画像サイズのみ調整する。

## Atomic ElementsとCSS

- Atomic Elements: 「数字で見るKDDI Biz Edge」のカウントアップアニメーション等、標準Containerのアニメーション機能では再現しにくい場合のみ候補とする。
- CSS: 標準のLayout、Style、Advanced、Responsiveで再現できないことを確認するまで追加しない。矢印コネクターの角度・曲線リボン背景はSVGまたは画像での実装を優先する。

## 未確認

- ナビゲーション各項目(+付き)のサブメニュー内容
- 「数字で見るKDDI Biz Edge」の実際の数値とカウントアップ挙動
- 各カード・View All/View Moreの遷移先URL
- 社員紹介の全体人数・他職種の有無
- 正確なHEX値、フォントファミリー名、ブレークポイントの実数値
- ヘッダーのSticky挙動
- 使用素材（写真）のライセンスと差し替え条件

## 参照

- 対象URL: https://recruit.kddi-bizedge.com/newgrads/
- 元画像: ../01_Normal_Images/WB-0031_SITE_PC_full.png
- 注釈画像: WB-0031_elementor_brain_implementation.png
