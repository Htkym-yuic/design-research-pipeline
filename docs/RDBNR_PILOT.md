# RDBNR BN-0001 安全なクラウド収集パイロット（v0.1）

## 目的

既存のLP日次パイプラインを変更せず、RDBNR個別ページ `https://rdbnr.jp/archive/190670/` の公開情報を、GitHub Actionsのヘッドレスブラウザで読み取れるか検証します。**新規の6軸採点・画像のダウンロード・スクリーンショット・Dropbox保存・Notion書込み・スケジュール起動は行いません。**

- 既存の`design-research-daily.yml`を編集しない。
- 別ワークフロー `rdbnr-banner-pilot.yml` を追加する。最初は `workflow_dispatch` 手動実行のみ。Pull Requestにはネットワークアクセスなしの単体テストだけを実行する。
- `data/rdbnr-pilot-reviewed.json` は2026-10-10再評価済み `BN-0001` の6軸スコアとselectionを変更せず引き継いだ検証用入力。新しい評価ではない。
- `scripts/rdbnr-pilot.mjs` はページを開いて同一事例を確認するだけ。DOM全体・写真・HTML・スクリーンショットを保存しない。
- 公開テキストを読めない場合は `report.json` に `failure_reason` を書き `collected_count=0` とする。アクセス制限は回避しない。
- 出力は `artifacts/rdbnr-pilot/scout-drs-1.0.json` および `report.json`。画像は出力しない。

## 取込方法（コピー・修正可能）

リポジトリの `main` を変更せず、GitHub上の新規ブランチ `feature/rdbnr-bn-pilot-20261010` を作り、このパッケージの **6ファイル＋この文書** を同じ相対パスで追加します。既存ファイルの上書きは不要です。

Gitコマンドを使用できる場合（パッケージを解凍して、リポジトリ直下へコピーした後）：

```sh
git switch -c feature/rdbnr-bn-pilot-20261010
git add .github/workflows/rdbnr-banner-pilot.yml data/rdbnr-pilot-reviewed.json scripts/rdbnr-pilot.mjs scripts/rdbnr-pilot-core.mjs scripts/test-rdbnr-pilot.mjs scripts/validate-bn-deep-28.mjs scripts/test-bn-deep-28.mjs docs/RDBNR_PILOT.md
node --test scripts/test-rdbnr-pilot.mjs scripts/test-bn-deep-28.mjs
git commit -m "Add isolated read-only RDBNR BN pilot"
git push -u origin feature/rdbnr-bn-pilot-20261010
```

GitHubのPull Requestでは、変更内容を比較し、mainへのマージ前にレビューします。マージ後の `Actions > RDBNR BN Pilot (read-only) > Run workflow` からDRY_RUNのみ実行できます。**GitHub Actionsの workflow_dispatch は基本的にワークフローファイルがデフォルトブランチに存在する必要があります。**

## BN専用Deepの28章・15項目検査

`node scripts/validate-bn-deep-28.mjs path/to/BN-0001.md` で28章・章8の15固定項目・章5/14/16/17を検証できます。既存のGitHub非LP29章規格は変更しません。

## 成功条件

1. 単体テスト全件合格。GitHub Actionsでブラウザが起動する。
2. `report.json.status=verified_metadata` なら既存のBN-0001について公開情報の同一対象性を確認したことになる。AI解説と画像検証は混同しない。
3. `scout-drs-1.0.json` に `BN-0001` だけが含まれること（取得失敗時は0件と理由）。スコアは2026-10-10再評価の引継ぎに限る。
4. `rights_excluded`、`image_saved=false`、`notion_updated=false`、`dropbox_updated=false`。
5. 既存LP workflowに変更がないこと。

## 次の改修案（別PR）

- RDBNRのメタ情報をラベルごとに読み取る詳細パーサーを実ページテストで確立。
- 今回の28章・章8の15固定項目を独立したBN規格として追加。既存の非LP29章・12項目を上書きしない。
- 画像の視覚確認と保存・再配布の権利判断は別ゲートにする。
- Notionの既存事例を `詳細URL＋ブランド＋タイトル` で照合し、空欄のみ補完。同期後に読み戻し検証。権利未確認画像のアップロード不可。
- 1件のdry-run検証後、件数上限8・指定曜日の有効化・Deep分析への引き渡しを段階的に追加。

## 注意

このパッケージは**GitHub上の動作確認前**の提案実装です。ここではネットワークを使わない単体テストのみ実行できます。GitHubへの反映には書き込み権限がある連携、または利用者によるコピー・PR作成が必要です。
