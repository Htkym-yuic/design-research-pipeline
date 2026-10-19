# WB-0032｜Elementor脳内実装設計

## 位置づけ

- 29章のデザイン分析とは分離した、WordPress／Elementor制作向けの実装設計である。
- 原サイトの固有コピー、ロゴ、客室写真、固有の地名・施設名は再利用せず、コンテナ構造と情報設計だけを参照する。
- 正本画像はPC Full Pageキャプチャを使うが、スクロール連動演出の影響で複数区間が白・黒の空白として記録されている（29章分析の章3・章17参照）。本ガイドのセクション境界・構成内容は、空白区間についてはSP Full PageおよびPC First Viewで補完した推定値であり、実測DOMではない。

## サイト共通設定

| 項目 | Elementor設定案 |
|---|---|
| Page Layout | Elementor Full Width |
| Outer Container | Full Width、Direction: Column |
| Content Width | 1200px前後。詩的コピーブロックは800〜1000pxへ絞る |
| Gap | Section間120〜180px（情緒訴求ブロックは特に余白を大きく取る） |
| Breakpoints | Desktop 1440、Tablet 1024、Mobile 767以下（タブレット固有の挙動は未確認） |
| Typography | 和文見出しは明朝体系（繊細・高級感）、ロゴは筆文字（画像またはWebフォント） |
| CTA | Primaryは黒地白文字のソリッドボタン。予約CTAは常時固定表示 |
| Motion | スクロール連動フェードインを多用。Elementor Motion Effectsまたはカスタムスクリプトでの実装を想定（詳細未確認） |

## Elementor Navigator想定

```text
Page Root
├── Global Header [ロゴ＋Hamburgerのみ]
├── 予約CTA [PC: 右端縦固定 / SP: 下部固定バー、全Section共通で重畳]
├── Brand Intro (split-screen)
│   ├── Split Image(左右2分割、対比ペアのカルーセル想定)
│   ├── Logo + Ruby
│   ├── 対比Heading(カルーセル)
│   └── 由来Text + Scroll Indicator
├── Emotive Triptych [Dark Background]
│   └── Repeater(3): Heading(右寄せ大型) / Text(左寄せ) / 背景Image(スクロール演出)
├── Rooms
│   ├── Intro Text + Special Room Card + Button(客室一覧)
│   └── Feature: Heading / Text / Room Image(露天風呂)
├── Dining
│   └── Text + Button(食事について知る)
├── News
│   └── Loop(4): Date / Category Badge / Heading + Button(一覧を見る)
├── Whole-Building Rental
│   └── Text + Entrance Image + Button(全館貸切について知る)
├── Instagram Feed
│   └── Image Grid(4) + External Link Button
├── Access
│   └── List(東京/名古屋からのアクセス) + Button(アクセス情報を見る)
└── Footer
    ├── Reservation CTA: Heading(ご予約) / Tel Button / Online Button / Check-in-out Text
    ├── Logo + Address + Instagram Link
    ├── Vertical Link List(8項目)
    └── Legal Row: Copyright / お問い合わせ / 求人情報 / プライバシーポリシー
```

## セクション別実装メモ

### 00｜グローバルヘッダー（y=0-900）

- 親Container: 横並び、両端揃え。左: Logo(画像、筆文字)。右: Hamburger Icon。
- 予約CTAは別レイヤーのSticky Widgetとして全Section共通で重畳表示（PC: 画面右端縦固定、SP: 画面下部固定バー）。実装はElementorのSticky機能または固定位置CSSを使う。

### 01｜ブランド導入 split-screen（y=900-4500）

- 親Container: 横2分割（PC）／縦積み圧縮（SP）。
- 左右それぞれに背景Image（対比ペアのテーマに応じて差し替え、カルーセル機構が必要）。
- 中央にLogo+Ruby、下部に対比Heading（2〜3語×2＋接続詞）。
- 由来Text（2〜3行）とScroll Indicatorを下部に配置。
- **注意**: この区間はキャプチャ時に一部が空白だった。PC First Viewでは正しく描画されていたため、実装自体に問題は無いと考えられるが、スクロール連動演出のタイミング調整を本番環境で確認すること。

### 02｜黒背景・情緒訴求三連ブロック（y=4500-9000）

- 全幅Dark Background Containerを3回反復。
- 各ブロック: 右寄せの大型Heading（縦に積んだ大文字、2〜4文字区切り）＋左寄せのText（2〜3行）。
- 背景に写真（朝・夕・夜等の時間差や、静寂を感じさせるカット）をスクロール連動でフェードイン想定。
- **注意**: この区間はPC Full Pageキャプチャで背景画像が黒一色のまま描画されず、SP Full Pageでのみ実際の背景写真（相模湾の夕景等）を確認できた。本番実装でのクロスブラウザ確認を推奨する。

### 03｜客室紹介＋客室特徴（y=9000-13500）

- Text（8室の案内）＋特別室Card（Image＋ラベル「特別室」＋客室名＋「客室一覧を見る」Button）。
- 全室露天風呂の特徴紹介: Heading／Text／Room Image（横幅広めの夜景カット）。

### 04｜食事＋お知らせ＋全館貸切(前半)（y=13500-17000）

- 食事紹介: Text（2行）＋Button(食事について知る)。
- お知らせ: Heading＋Loop Grid(4件、Date/Category Badge/Heading)＋Divider＋Button(一覧を見る)。
- 全館貸切導入: Text＋Entrance Image開始（後続セクションへ続く）。

### 05｜Instagramフィード（y=17000-18000）

- Image Grid(4枚、正方形トリミング)＋外部Link Button(Instagramを見る)。

### 06｜アクセス（y=18000-19500）

- List Widget（東京/名古屋からのアクセス、箇条書き）＋Button(アクセス情報を見る)。
- 下部でDark Backgroundへのグラデーション遷移（次セクションへの視覚的接続）。

### 07｜ご予約＋フッター（y=19500-20383）

- Dark Background Container。
- Heading(ご予約)＋Tel Button(電話番号)＋Online Button(ご予約・空室確認)を横並びで並列。
- Check-in/Check-out Text。
- Logo＋Address＋Instagram Link（左カラム）、縦書き風Vertical Link List(8項目、右カラム)。
- 最下段Legal Row: お問い合わせ／求人情報／プライバシーポリシー＋Copyright。

## 共通レスポンシブ手順

1. split-screenはPCで横2分割、SPで縦圧縮（画像比率を保ったまま高さを縮める）。
2. 黒背景三連ブロックはPC/SPとも縦積みのまま、文字サイズのみ調整。
3. 予約CTAはPC（画面右端縦固定）とSP（画面下部水平固定バー）で全く異なるコンポーネントとして実装する。
4. 客室・食事・全館貸切の各セクションは、PC 2カラム→SP縦積みを基本とする。

## Atomic ElementsとCSS

- Atomic Elements: split-screenの対比カルーセル、黒背景三連ブロックのスクロール連動フェードインなど、標準Containerのアニメーション機能では再現しにくい挙動がある場合のみ候補とする。
- CSS: 標準のLayout、Style、Advanced、Responsiveで再現できないことを確認するまで追加しない。縦書き風のフッターリンク列は`writing-mode`が必要になる可能性が高く、その場合は対象クラスをここに追記する。

## 未確認

- split-screenカルーセルの切り替えパターン・枚数・タイミング
- 黒背景三連ブロックの背景画像・スクロール演出の正確な実装方式（本分析のキャプチャで複数回描画失敗）
- ハンバーガーメニュー展開時の内容
- 客室料金（ページ内に表示なし）
- 各CTA・お知らせ記事の遷移先URL
- 正確なHEX値、フォントファミリー名、ブレークポイントの実数値
- ヘッダーのSticky挙動
- 使用素材（写真）のライセンスと差し替え条件

## 参照

- 対象URL: https://atami-sanga.jp/
- 元画像: ../01_Normal_Images/WB-0032_SITE_PC_full.png
- 注釈画像: WB-0032_elementor_brain_implementation.png
