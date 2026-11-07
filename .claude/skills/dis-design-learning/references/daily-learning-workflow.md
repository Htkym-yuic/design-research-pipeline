# 日次フロー・冪等性・重複判定

- ID: `DIS-<LP|BN|WB>-<YYYYMMDD>`（既存 LP-/BN-/WB- 採番 `data/id-counters.json` は消費しない）
- Dropbox: `<DROPBOX_DESIGN_ROOT>/<媒体Library>/99_Needs_Review/<日付>/dis-daily/<DIS-ID>/`（01_Original, 02_Preview, 03_Analysis, metadata.json）。既存フォルダーがあれば中止。
- Notion: 各ライブラリへ新規ページのみ。同一「参考URL」が既存ならスキップ。更新APIは使わない。
- 冪等: 選定結果は `selection.json` を再利用。台帳キー=媒体＋正規化URL。Dropbox/Notionの完了段階は台帳に記録し再実行時にスキップ。
- 重複: URL一致は期間無関係で除外。ブランド一致は直近180日。照合先=既存candidates/reservations/knowledge/deep-analysis/台帳/Notionスナップショット(`--snapshot`)。
- 媒体ごとに独立try/catch。1媒体の失敗・スキップは他に影響しない。
