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

## 保存形式（原本のLP取り込みの形）

Dropbox: `<DROPBOX_DESIGN_ROOT>/<媒体Library>/99_Needs_Review/<日付>/dis-daily/<DIS-ID>/`
- `metadata.json`
- `01_Normal_Images/`: `<DIS-ID>_PC_full.png` / `_PC_first_view.png` / `_PC_sections.png` / `_SP_full.png` / `_SP_first_view.png` / `_SP_sections.png`、分割画像 `sections/pc_NN.jpg`・`sp_NN.jpg`（バナーは `banner.<ext>`）
- `02_Notion_Images/`: `<DIS-ID>_{PC,SP}_{first_view,sections}_notion.jpg`（約720px幅・5MB未満。バナーは `banner_notion.jpg`）
- `03_Analysis/`: `analysis.json`・`analysis.md`・`annotations.json`・`text-index.json`

- 撮影は、SPを375px幅にする。スマホ用の設定がなく幅が広がるページは、モバイル端末の模擬を外して自動で再撮影する。
- 画像の揃いは `lib/asset-check.mjs` で検査する（PC幅1000px以上、SP幅430px以下、セクション一覧は幅600px以上など）。既存の `crosscheck-lp` は、IDが `LP-0000` 形式であることを要求するため、`DIS-…` のIDには使えない。
- Notionの本文には、LP・Webの4枚の軽量画像（PC・SPのファーストビューとセクション一覧）を載せる。バナーは「バナー画像」列に原本を添付する。
- 2026-11-08以前に登録した6件は、旧形式（`01_Original`・`02_Preview`）のまま残す。

## 利用者の判断（記録）

- ID体系は媒体ごとの連番 `DIS-LP-0001` / `DIS-BN-0001` / `DIS-WB-0001`（既存の `LP-0000` の通し番号とは別）。撮影またはテンプレート作成の時点で、台帳の最大値＋作業中の予約の最大値＋1を採番し、selection.json に保存して固定する（欠番は許容・再利用しない）。日付は Dropbox の日付フォルダ・Notion・台帳で管理する。登録済みの旧形式（`DIS-LP-20261107` など6件）は変更しない。
- 参照元の利用条件は確認しない（個人の学習用・非公開・展開しない）。robots.txtは尊重し、アクセス制限は回避しない。公開・共有する場合は、先に規約を確認する。
