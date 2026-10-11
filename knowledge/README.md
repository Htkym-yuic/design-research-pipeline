# knowledge/ の使い方（APIなし半自動運用）

`knowledge/<media>/<ID>.json` は、Creative Brief Studio AI（CBS）が読み込む構造化ナレッジの正本。
`knowledge/lp/LP-0215.json` が最も充実した実例。他媒体（banner / web / graphic / parts / patterns /
canva / logo / business-card / poster / flyer / trends / note-ideas）は、下記の共通の型に沿って
ChatGPT / Claudeの分析結果をClaude Codeで反映していく。

このディレクトリ自体にOpenAI/Anthropic APIを呼ぶ処理は無い。ファイルはすべて人が
`outputs/analysis-requests/` のMarkdownをChatGPT/Claudeに貼り付けて得た回答を、
Claude Code等でJSON化してここへ置く想定。

## 共通の型（最小セット）

```json
{
  "id": "BN-0001",
  "mediaType": "Banner",
  "title": "（タイトル）",
  "source": {
    "captureUrl": "（実際に撮影したURL）",
    "sourceUrl": "（参考元サイトのURL）",
    "sourceDetailUrl": "（掲載元の詳細ページURL）",
    "notionUrl": "（Notion上のページURL。あれば）",
    "dropboxPath": "（Dropbox正本パス。あれば）"
  },
  "tags": {
    "industry": [],
    "color": [],
    "layout": [],
    "copy": []
  },
  "primary_appeal": "（主訴求と、そう判断した理由）",
  "reusable_principles": [
    "（他案件に転用できる原則。1項目1文）"
  ],
  "rights_excluded": [
    "（直接模倣してはいけない要素：ロゴ、人物写真、固有コピー、固有数値 等）"
  ],
  "analysis_notes": {
    "completion_status": "pending_review",
    "analyzed_by": "chatgpt | claude | claude-code",
    "analyzed_at": "YYYY-MM-DD"
  },
  "cbs_sync": {
    "status": "not_yet_synced"
  }
}
```

`tags` / `primary_appeal` / `reusable_principles` / `rights_excluded` の語彙・書き方の考え方は、
`knowledge/lp/LP-0215.json` の `industry_tags` / `copy_types` / `reusable_principles` /
`rights_excluded` に合わせる（新しい媒体だからといって無理に新しい語彙体系を作らない）。

## 媒体別ディレクトリの現状

| ディレクトリ | 自動収集元（GitHub Actions） | 現状 |
| --- | --- | --- |
| `lp/` | LPアーカイブ | 実例あり（LP-0215.json） |
| `banner/` `web/` `graphic/` `parts/` `canva/` | `design-research-daily.yml` | 空（候補はNotionに登録済みだが、CBS向けJSON化は未着手） |
| `patterns/` | 日次の機械的テンプレート抽出（AI判断なし） | 空 |
| `logo/` `business-card/` `poster/` `flyer/` | デザインAC経由でグラフィックとして収集中（`graphic/`内の`subtype`で区別）。専用ディレクトリは将来の分離先として用意 | 空 |
| `trends/` | 自動収集元なし（将来GitHub検索等を追加する場合の置き場） | 空 |
| `note-ideas/` | 自動収集元なし（ChatGPT/Claudeとの対話から手動で追記） | 空 |

空ディレクトリは `.gitkeep` でGit管理している。
