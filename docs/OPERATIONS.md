# 運用メモ

## 役割分担

- Dropbox: 画像、スクリーンショット、一次資料の正本置き場
- Notion: 人が読む分析、分類、運用ステータスの管理
- GitHub: 自動処理、構造化ナレッジ、Creative Brief Studio AI同期用データの管理

## 基本フロー

1. リサーチ対象を収集する
2. 一覧ページから個別候補を抽出する
3. 候補を人が確認し、採用・除外を判断する
4. 採用した対象のPC / SPスクリーンショットを取得する
5. Dropboxの該当ライブラリへ保存する
6. Notionの正本DBへ分析結果を登録する
7. `knowledge/` に機械利用用JSONを生成する
8. `exports/creative-brief-studio-ai/` に同期用パッケージを生成する

## 初期参考元

| 種別 | 参考元 | URL |
| --- | --- | --- |
| Banner | バナー広場 | `https://banner-hiroba.com/` |
| LP | LPアーカイブ | `https://rdlp.jp/lp-archive/` |
| Web | SANKOU! | `https://sankoudesign.com/` |
| Mixed | Pinterest | `https://www.pinterest.jp` |
| Parts | Parts. | `https://partsdesign.net/` |

初期参考元の接続テストでは、各サイトをPCファーストビューとSPファーストビューで撮影します。

LP候補の本取得では、既存のLP分析ページに合わせて以下を基本セットにします。

- PC Full Page
- PC First View
- PC Section一覧
- SP Full Page
- SP First View
- SP Section一覧

Section一覧は分析用の目次画像です。裏側には `S01` / `C01` 形式の個別切り出し候補とy座標を残し、Notionの「Section位置索引」「パーツ切り出し指示書」で確認・調整できるようにします。

## 候補抽出

参考元サイトの一覧ページは、最終的な研究対象そのものではありません。

LPアーカイブの場合は、一覧ページから個別LP候補を抽出し、`candidates/lp-archive/candidates.json` に保存します。候補には `LP-0214` 以降の仮IDを付与します。

抽出候補には以下を含めます。

- 仮ID
- タイトル
- 実際に撮影するURL
- LPアーカイブ内の詳細ページURL
- サムネイルURL
- 企業名
- カテゴリ
- テイストタグ
- LPアーカイブ保存画像URL

## 撮影対象URLの扱い

スクリーンショット取得では、参考元サイトのトップURLだけで止めず、実際に撮影したページURLを保存します。

- `captureUrl`: 実際にスクリーンショットを撮るURL
- `sourceUrl`: 参考元サービスや参考元サイトのURL
- `sourceDetailUrl`: 掲載元の詳細ページURL

たとえばLPアーカイブ経由で個別LPを撮影する場合、`sourceUrl` はLPアーカイブ、`sourceDetailUrl` はLPアーカイブ内の個別詳細ページURL、`captureUrl` は実際に撮影する対象LPのURLとして管理します。

## 広告表示の扱い

研究用スクリーンショットでは、広告やスポンサー枠が分析対象を邪魔する場合があります。

`data/targets.json` の各対象に `hideSelectors` を設定すると、撮影前に該当要素を非表示にします。LPアーカイブでは、広告バナー、Google広告、スポンサー枠を非表示にして撮影する設定を入れています。

## Notionステータス

- `CBS同期状態`
- `CBS同期日`
- `GitHubナレッジパス`
- `Dropbox正本パス`
- `ナレッジ化ステータス`

## Dropbox正本ルート

```text
/design/Design_Research_Library/
```

各ライブラリでは、以下の共通構成を使います。

```text
00_Guide/
01_Master/
02_By_Date/
90_Legacy/
99_Needs_Review/
```

## 注意

APIキー、アクセストークン、NotionやDropboxの秘密情報はリポジトリへ直接保存しません。GitHub Secretsで管理します。

## LP検証

LPを「完了」扱いにする前に、以下の2種類の検証を行います。

```bash
npm run knowledge:validate-lp -- --input <analysis.md または metadata.json>
npm run knowledge:crosscheck-lp -- --input <LPフォルダ>
```

`knowledge:validate-lp` は、LP ID、URL、参考元詳細URL、Dropbox正本パス、GitHubナレッジパス、CBS同期状態など、分析・ナレッジ化に必要な項目を確認します。

`knowledge:crosscheck-lp` は、PC / SP の Full Page、First View、Section一覧、個別セクション画像、Notion用画像、`metadata.json` を確認します。SP Full Page はスマホ幅として扱えるよう、430px以下であることを検証します。
