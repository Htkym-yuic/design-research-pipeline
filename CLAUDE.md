# CLAUDE.md

- このリポジトリは既存の日次デザインリサーチ基盤。DIS日次学習は `scripts/dis/` と `.claude/skills/dis-design-learning/` に分離実装（既存日次ワークフローとは別機能）。
- 外部書込み（Dropbox/Notion）は既定で無効。ユーザーが本番実行を明示するまで `--apply` を使わない。
- 既存のDropbox/Notion/CBS/既存ID/ナレッジ/分析を上書き・移動・削除しない。
- DIS関連の変更後は `npm run dis:test` と `npm run lint:syntax` を通す。
