# 旧ライブラリーのLPを、DISの9軸で連続分析する（`LP-0002` 以降）

旧ライブラリー（Dropbox `/Research_Library/Design/LP_Research_Library/01_By_Date/…/LP-nnnn_名前/`）のLPは、旧分析（28章など）はあるが、DISの新しい軸（dis-2.0）の分析がない。画像は、フォルダにあるアーカイブ掲載の全体画像（`01_PC/01_Full_Page`・`02_SP/01_Full_Page`）を使う（撮り直さない）。

## 方針（2026-11-10 に確認済み）
- **DropboxとNotionには、DISを正にして反映する（2026-11-12 に変更）。** 分析（手順1〜4）はローカルで完結させ、反映（手順6）は、ドライランの計画を見せて、ユーザーが確認してから行う。
  - Dropbox: `/design/Design_Research_Library/LP_Research_Library/99_Needs_Review/<日付>/dis-daily/DIS-LP-000n/` に、`01_Normal_Images/`・`03_Analysis/analysis.json`・`metadata.json` を、足りないものだけ追加する（既存のファイルは、上書き・移動・削除しない）。
  - Notion: DB「01 LPリサーチライブラリー」に、`DIS-LP-000n` のページを新規に作り、DISの9軸・撮り直し画像・Unit画像と、旧 `LP-000n` ページの28章分析（複製）を、1ページにまとめる。9軸と28章の点数は混ぜない。旧ページは削除せず、冒頭に「DIS-LP-000n に移行済み」のリンクを置く。
  - CBSの鍵は、旧ライブラリーの番号（`LP-000n`）のまま。CBS同期状態・ナレッジ関連の設定は、旧ページに残す（新ページには写さない）。
- ナレッジの ID は、旧ライブラリーの番号（`knowledge/lp/LP-0002.json`）。DISの番号（`DIS-LP-0005` など）は `dis_ids` に持つ。
- Notionのページの設定（ナレッジのパスなど）は、プッシュ後に、まとめて行う。
- 最初は、試験の3件（`LP-0002`・`LP-0003`・`LP-0004`）。所要時間と使用量を測ってから、増やす。

## 1件ずつの手順
1. `npm run dis:ingest-library -- --lp LP-0002`
   - Dropboxから、全体画像・元の記録・最新の旧分析を、読み取る（書き込まない）。
   - DISの連番ID（`DIS-LP-000n`）を振り、`outputs/dis/LP/<連番>_<日付>_<名前>/` に、画像一式・テンプレート・`legacy-analysis.md`（比較の参考。内容は引き継がない）を作る。
   - `data/dis-relations.json` に、ライブラリー番号との対応（`same_lp`）を追記する。
2. 画像（PC・SP の全体、セクション一覧、分割画像）を、全Sectionぶん読み、`analysis.json`（dis-2.0）と `annotations.json` を書く。
   - Unitごとに `roleType`（LP・Webの Section の種類）と `regions`（PC・SPの縦の範囲）、9軸（根拠・確信度・未確認）、改善案、再現手順、`notionProps`（タグ。Notionの既存の選択肢のみ）、`existingAnalysisComparison`（旧分析との一致・相違・追加発見）。
   - `selectionReason` は、「良い点: …」を具体的に書き、注記は残す。
   - 見えないもの（動き・実際の文言・実ページ）は、推測せず、未確認として記録する。
3. `npm run dis:validate-item -- --id DIS-LP-000n`（通るまで直す。`analysis.md`・`text-index.json` ができる）。
4. `npm run dis:cbs-draft -- --id DIS-LP-000n --appeal-from-summary --offer "<オファー。なければ「なし（…）」>" --place`（`knowledge/lp/LP-0002.json` を新規配置）。
5. `data/dis-library-progress.json` に、LP番号・DISのID・状態・所要時間（durationSec）・使ったトークン数（tokens）・メモを記録する。
6. （ユーザーの確認後）反映する。
   - `data/dis-notion-pages.json` に、旧ページのID（`pageId`）を足す。
   - Dropbox: `DIS_ENABLE_WRITES=true DRY_RUN=false npm run dis:merge-library -- --id DIS-LP-000n --stage dropbox --apply`
   - Notion: `DIS_ENABLE_WRITES=true DRY_RUN=false npm run dis:migrate-to-dis -- --id DIS-LP-000n --apply`
   - どちらも、`--apply` なしでドライラン（計画の表示）になる。結果は `data/dis-merge-log.json` に残る。
   - 相対パスなど、Notionが受け付けないリンクは、文字だけを残して複製する。

## バッチの終わり
`npm run cbs:export` → `knowledge/lp/`・`exports/`・`data/dis-relations.json`・`data/dis-library-progress.json` をコミットしてプッシュ。

## 注意
- 画像がない・読めないLPは、無理に埋めず、`failed` と理由を記録して、次へ。
- 1件ごとにサブエージェントに任せる（画像が重く、会話の容量が増えるため）。
- ID（DISの連番・ライブラリー番号）は、再利用しない。
- 取り込み（手順1）は、DISの番号が重ならないよう、1件ずつ順に行う。分析（手順2〜3）は並列でよい（サブエージェントの作業用の一時ファイルは、案件ごとの専用フォルダに置く）。
