---
name: dis-design-learning
description: DIS（Design Intelligence System）日次学習。LP・バナー・Webサイトを各1件選定し、DIS分析を作成、Dropbox 99_Needs_Review と Notion へ新規登録する。「DIS」「日次学習」「dis-design-learning」で使う。
---

# DIS 日次学習（LP / バナー / Web 各1件）

> 注意: このスキル本文はハンドオフメモから再構成した暫定版。元の `~/.codex/skills/dis-design-learning/` の
> SKILL.md と references を受領したら、`references/` を差し替え・統合すること（未提供のため未確認）。

## 絶対ルール
- 既定は**ドライラン**。外部書込みは `--apply` + `DIS_ENABLE_WRITES=true` + `DRY_RUN=false` の3条件が揃った時のみ。ユーザーが本番実行を明示するまで書かない。
- 既存のDropbox・Notion・CBS・28/29章分析・既存ID・GitHubナレッジを上書き／移動／削除しない。Notionは新規ページ作成のみ、Dropboxは新規フォルダーのみ（`mode: add`）。
- 既存「Design Research Daily」ワークフローを置換・無効化しない。重複は `data/dis-ledger.json`・`candidates/`・`knowledge/`・`deep-analysis/`・Notionスナップショットで除外する。
- ログイン／課金壁／Bot対策／ダウンロード制限を回避しない。ギャラリー一括DL禁止。ロゴ・人物・写真・コピー・価格・実績値を転用しない。
- 根拠のないデザイン評価をしない。量より品質。条件を満たさない媒体は**その媒体だけスキップ**。

## 手順
1. `git status` と未コミット変更を確認（上書きしない）。
2. 候補収集〜選定: `npm run dis:run -- --stage collect,select [--media lp,banner,web]`
   - 参照元は `config/dis-daily.json`。`termsStatus` が `known` でない参照元は取得されない。規約を確認できたものだけ `known` にする（変更はユーザー確認）。
   - 各媒体で最大5候補を比較。`outputs/dis/<日付>/<媒体>/selection.json` に全候補のスコアと除外理由が残る。
   - `signals.learningValue` は機械的に判定できないので、候補を実際に見て Claude が `candidates.json` で更新してから選定する。
3. 撮影: `--stage capture --capture`（LP/Web=PC/SP全体、バナー=公開画像1枚）。
4. 分析: `--stage template` で `analysis.json` の雛形を生成し、画像を確認して**全Section/Unit・9軸（根拠・確信度・未確認事項必須）・注釈・最優先1件／優先／改善アイデア・Canva／Photoshop／Elementor再現手順**を埋め `status: "complete"` にする。詳細は `references/analysis-pack.md`。
5. 検証: `--stage validate`（不合格なら公開しない）。
6. 公開計画: `--stage publish`（ドライランは `publish-result.json` に計画のみ出力）。
7. 本番は、ユーザーの明示指示後に `DIS_ENABLE_WRITES=true DRY_RUN=false npm run dis:run -- --stage publish --apply`。

## 参照
- `references/analysis-pack.md` 分析の必須項目
- `references/reference-source-registry.md` 参照元一覧
- `references/daily-learning-workflow.md` 日次フローと冪等性・重複判定
