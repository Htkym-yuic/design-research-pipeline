# Design Research Scout — 調査ログ（候補ボード）

実行をまたいだ記憶。外部ストアは持たず、このファイル＋既存の`knowledge/`の内容を
読んで「何が既にカバーされているか」を判断し、観察結果を追記していく。

**状態の値:** `new`（未着手） · `drafted`（ドラフト作成済み） ·
`covered-by-knowledge`（既存のknowledge/で既にカバー） · `rejected-thin`（根拠薄弱で却下）

## 候補一覧

| 観点 | 状態 | 備考 |
|---|---|---|
| Tailwind採用時期の推移（四半期別） | `new` | 未着手 |
| design-tokens.json採用時期の推移 | `new` | 未着手 |
| Figma連携ツールチェーン採用 | `new` | 未着手 |
| Storybook採用 | `new` | 未着手 |
| 複数指紋の共起（Tailwind + Storybook等） | `new` | 未着手 |

## 実行ログ

<!-- 新しい実行を上に追記する。各実行は1ブロック。 -->

### 2026-10-11 — seed

- 走査: なし（初期シード）。
- 観察: `knowledge/trends/`・`knowledge/ai-design/`はまだ空。既存のスタディは無い。
- 選んだ候補: なし（シードのみ）。
- 備考: `imsaif/design-with-claude`のresearch-scoutブランチから、収集ロジック・
  Wilson信頼区間・ドラフトテンプレートの考え方を移植した
  （`feature/integrate-research-scout`）。指紋セット自体はagent-config調査から
  デザイン制作関連へ入れ替えており、実際の収集結果で妥当性を見直す必要がある。
