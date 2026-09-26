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
