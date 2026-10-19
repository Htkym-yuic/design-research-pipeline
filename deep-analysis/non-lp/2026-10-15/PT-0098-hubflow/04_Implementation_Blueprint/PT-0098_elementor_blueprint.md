# PT-0098｜Elementor脳内実装設計

## 位置づけ

- 29章のデザイン分析とは分離した、WordPress／Elementor制作向けの実装設計である。
- 原パーツ（hubflowの課題提起コピー×プロダクトモックHero）の固有コピー、ロゴ、UIダッシュボードの具体内容は再利用せず、コンテナ構造と情報設計だけを参照する。
- 正本画像は`01_Normal_Images/PT-0098_reference.png`（1370×782px）。日次収集時点では画像の目視確認前に生成された仮説版（セクション3分割・汎用値）のみが存在していたため、本分析で実際の構成に基づく確定版へ更新した。

## パーツ共通設定

| 項目 | Elementor設定案 |
|---|---|
| コンテナ種別 | Section Container（Full Width） |
| Direction | Row（PC）／Column（SP、未検証の推奨値） |
| Content Width | 全体1370px相当。左Column 57%・右Column 43%の比率を維持 |
| Gap | カラム間Gapは未実測。推奨値として40〜56pxを仮置き |
| Breakpoints | Desktop基準。Tablet/Mobileのブレークポイント値は未検証 |
| Typography | 見出しは太いゴシック、リード文・ボタンラベルは標準ゴシック |
| CTA | Secondary（お問い合わせ）は白地＋アウトライン、Primary（無料で試してみる）は青系グラデーション塗り |
| Border Radius | ボタンは角丸矩形（正確な半径値は未実測） |
| 背景装飾 | 有機曲線はElementor標準のBackground Overlay画像で代替し、カスタムCSSは使用しない |

## Elementor Navigator想定

```text
01_hero (Section Container, Row)
├── 01_03_BackgroundDecoration (Background Overlay Image, 画面全幅)
├── 01_01_LeftColumn (Container, Column)
│   ├── Heading: 「未来の業務体験、今ここに DX化の先へ」
│   ├── Text: 課題提起リード文
│   └── CtaRow (Container, Row)
│       ├── Button: 「お問い合わせ」（Secondary、アウトライン）
│       └── Button: 「無料で試してみる」（Primary、グラデーション）
└── 01_02_RightColumn_Mock (Container)
    └── Image: プロダクトモック（ノートPC＋ダッシュボードUI合成）
```

## 要素別実装判断

| 要素 | 親Container | 主なWidget | 備考 | SP変換 |
|---|---|---|---|---|
| 背景装飾 | Hero全体の背面 | Background Overlay（画像） | 低コントラストの曲線のため、標準機能で管理しにくければ補助的にAtomic Elements/最小限CSSを検討 | 同一画像を縮小表示、またはSPのみ非表示も選択肢 |
| 見出しブロック | 左Column、Column方向 | 見出し＋テキスト | 理想像の大見出し＋課題言及リード文の2段構成を維持 | フォントサイズを1段階縮小 |
| CTAペア | 見出しブロック下 | ボタン×2（Row配置） | 同形・同サイズを維持し、色のコントラストのみで優先度を表現 | Row維持（横幅に収まる場合）または縦積みへ変更を実機確認の上で判断 |
| プロダクトモック | 右Column | 画像 | ノートPC＋UIダッシュボードの合成1枚画像として扱う | 幅100%、縦横比維持、PCより優先度を下げてCTA後に配置 |

## 実装上の注意

1. 左右カラムの比率（57% / 43%）を崩さないよう、Elementor ContainerのFlex Basisまたは% Widthで固定する。
2. 背景の有機曲線装飾は、標準ElementorのBackground機能（画像またはグラデーション背景）で再現し、複雑なSVGパスが必要な場合のみ補助的にAtomic Elementsまたは最小限のカスタムCSSを検討する（原則CSSなしの方針を優先）。
3. プロダクトモック画像は実際の管理画面UIを含むため、実装時は許諾済みの自社UI画像に差し替える。
4. CTAペアは同形・同サイズを維持し、プライマリボタンのグラデーションのみで優先度を表現する。カスタムカラーはプロジェクトのブランドカラーに合わせて差し替える。
5. 右下に確認された円形アイコン（チャットウィジェット疑い）は本画像だけでは機能・挙動が断定できないため、実装するかどうかは案件要件に応じて別途判断する。

## 未確認

- 正確なカラーコード、グラデーション角度、Gap、Padding、Border Radiusの数値は代表点のピクセルサンプリングによる概算値であり、デザインツールでの厳密な確認が必要。
- 右下アイコンの機能（チャットウィジェットか否か）、クリック時の挙動は未確認。
- SPでのレイアウト折返し順序・CTAペアの配置（横並び維持か縦積みか）は未検証の推奨案であり、断定ではない。
- 元ページ全体でのヘッダー・フッターとの接続関係、背景有機曲線の正確な形状パスは未確認。
