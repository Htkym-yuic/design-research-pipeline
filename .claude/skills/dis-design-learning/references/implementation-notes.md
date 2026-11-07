# このリポジトリでのDIS実装メモ

原本スキル（SKILL.md と references/ の3ファイル）が正。ここには、このリポジトリのコマンドと構成だけを書く。

## 構成

- 設定: `config/dis-daily.json`（参照元・媒体・Notion/Dropbox・採点の重み）。参照元のURLは `references/reference-source-registry.md` に一致させる。
- 実装: `scripts/dis/`（`run.mjs` が各段階を実行、`lib/` に収集・選定・撮影・分析スキーマ・注釈・索引・アダプター）。
- 台帳: `data/dis-ledger.json`（二重登録を防ぐ。本番の書き込みのあとにコミットする）。
- 成果物: `outputs/dis/<日付>/<媒体>/`（Git管理外）。分析の履歴・草稿は `candidates/dis/<日付>/`。

## 段階（`npm run dis:run -- --stage ...`）

collect → select → **review**（比較用の一覧画像）→ **rescore**（`learning.json` の評価を反映）→ capture（`--capture`）→ template → validate → publish（`--apply` で本番）。

外部への書き込みは、`--apply` と `DIS_ENABLE_WRITES=true` と `DRY_RUN=false` の3つが揃ったときだけ。

## 分析（schema `dis-2.0`）

- 9軸のキーは `purpose_fit` `information_hierarchy` `visual_flow` `message_copy` `trust_safety` `color_legibility` `layout_spacing` `visual_brand` `implementation_reuse`。点数は0〜5（0＝評価不能で、`notEvaluableReason` が必須）。各軸に `scope`（対象範囲）・`evidence`・`confidence`・`unverified`。媒体横断の合計点・順位は作らない。
- `analysisVersion`・`sourceAnalysisRef`・`sourceImageRefs`・`generatedAt`・`reviewState`・`sectionCoverage`（source＝analyzed＝units）。
- Unitごとに `role`・`evidence`・`confidence`・`reuseStructure`・`mustReplace`・`unknowns`（item/impact/nextCheck）。
- 改善案は `improvements.top`（1件）/`priority`/`ideas`。各項目に `issue`・`evidence`・`change`・`expected`・`metric`。
- 再現手順は、ツール（Canva/Photoshop/Elementor）ごとに `structureSteps`（再現できる構造）と `replaceSteps`（固有素材の差替）。
- `reuse`・`rights`・`existingAnalysisComparison`・`externalSync` を持つ。
- 注釈は `annotations.json`（`dis-annotation-1.0`）。元画像は変えず、`image`・`bbox`（0〜1の正規化座標、目測の概算）・`label`・`evidence`・`confidence`。全Unitに1件以上。
- 検証を通ると `analysis.md` と `text-index.json`（自然言語検索用）が作られる。検索は `npm run dis:search -- "検索語"`。
- 旧形式（`dis-1.0`・旧9軸）は履歴として残るが、公開（publish）はできない。

## 毎朝の準備（Mac）

`bash scripts/dis/install-schedule.sh` で、launchd に登録。収集・選定・一覧画像だけを自動で行い、書き込みはしない。`Documents` 配下では動かないため、ホーム直下のコピーで運用する。

## 未対応・要判断（原本との差）

- ID体系（原本は `LP-0245` のような4桁の通し番号。現状は `DIS-LP-YYYYMMDD`）。
- 選定基準13/18点（6項目×3点と推測。中身が未確認）。現状は人の評価（`learning.json`）を優先して選ぶ。
- Dropboxの保存形式（原本は `01_Normal_Images/`・`02_Notion_Images/`）とNotion本文への軽量画像（約720px、5MB未満）。
- 既存の `knowledge:validate-lp` / `knowledge:crosscheck-lp`（LPの6＋4枚の画像の揃いを要求）への適合。
