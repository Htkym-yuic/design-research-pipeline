# outputs/note-drafts/ の使い方

note記事の「完成記事」をここで自動生成することはしない。GitHub Actionsが作るのは、あくまで
「記事化候補」「タイトル案」「分析待ちメモ」まで。本文の執筆・公開は人（ChatGPT/Claudeとの
対話を含む）が行う。

## ファイル名の目安

```text
outputs/note-drafts/<date>-<slug>.md
```

## 中身の目安

```markdown
# タイトル案: ○○

- 元ネタ候補ID: BN-0001, WB-0012
- 新規性: （既出のネタと重複していないか）
- 想定読者: （制作者 / 担当者 / 経営者 等）
- 書きたい主張: （1〜2文）
- 参考にする分析結果: knowledge/banner/BN-0001.json
- ステータス: ネタ案 / 執筆待ち / レビュー待ち / 公開済み
```

`candidates/analysis-queue/<date>/note-ideas.json` にも、ネタの種を手動で追記していく
（自動収集元がまだ無いため、現時点では空の器のみを日次で用意している）。
