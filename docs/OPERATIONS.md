# 運用メモ

## 役割分担

- Dropbox: 画像、スクリーンショット、一次資料の正本置き場
- Notion: 人が読む分析、分類、運用ステータスの管理
- GitHub: 自動処理、構造化ナレッジ、Creative Brief Studio AI同期用データの管理

## 基本フロー

1. リサーチ対象を収集する
2. 対象URLや素材を分類する
3. PC / SPのスクリーンショットを取得する
4. Dropboxの該当ライブラリへ保存する
5. Notionの正本DBへ分析結果を登録する
6. `knowledge/` に機械利用用JSONを生成する
7. `exports/creative-brief-studio-ai/` に同期用パッケージを生成する

## 初期参考元

| 種別 | 参考元 | URL |
| --- | --- | --- |
| Banner | バナー広場 | `https://banner-hiroba.com/` |
| LP | LPアーカイブ | `https://rdlp.jp/lp-archive/` |
| Web | SANKOU! | `https://sankoudesign.com/` |
| Mixed | Pinterest | `https://www.pinterest.jp` |
| Parts | Parts. | `https://partsdesign.net/` |

初期テストでは、各サイトをPCファーストビューとSPファーストビューで撮影します。

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
