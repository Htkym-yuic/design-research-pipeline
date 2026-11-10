# 旧ライブラリーのLPを、DISの9軸で連続分析する（`LP-0002` 以降）

旧ライブラリー（Dropbox `/Research_Library/Design/LP_Research_Library/01_By_Date/…/LP-nnnn_名前/`）のLPは、旧分析（28章など）はあるが、DISの新しい軸（dis-2.0）の分析がない。画像は、フォルダにあるアーカイブ掲載の全体画像（`01_PC/01_Full_Page`・`02_SP/01_Full_Page`）を使う（撮り直さない）。

## 方針（2026-11-10 に確認済み）
- **分析とナレッジ化のみ。** DropboxとNotionに、新規ページ・新規フォルダは作らない（既存のライブラリーのページと重複させない）。
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
5. `data/dis-library-progress.json` に、LP番号・DISのID・状態・所要時間・メモを記録する。

## バッチの終わり
`npm run cbs:export` → `knowledge/lp/`・`exports/`・`data/dis-relations.json`・`data/dis-library-progress.json` をコミットしてプッシュ。

## 注意
- 画像がない・読めないLPは、無理に埋めず、`failed` と理由を記録して、次へ。
- 1件ごとにサブエージェントに任せる（画像が重く、会話の容量が増えるため）。
- ID（DISの連番・ライブラリー番号）は、再利用しない。
