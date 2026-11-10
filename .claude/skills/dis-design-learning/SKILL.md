---
name: dis-design-learning
description: 既存デザイン事例を上書きせず、DISの9軸評価、全Section分析、改善案、注釈、Canva／Photoshop／Elementor再現手順、検索・制作添削用データを作成・検証するときに使う。CBSやNotionへの同期だけを頼まれた場合は使わない。
metadata:
  short-description: DISの分析・学習・添削を安全に作る
---

# Design Intelligence System (DIS)

## 目的

DISは、既存のLP・バナー・Canva等の分析を消さずに、根拠付きの追加分析を作る。成果物は、制作で再利用できる構造、改善アクション、再現手順、検索・添削用の情報を持つ。

## 必ず守ること

- 既存のDropbox、Notion、CBS、既存分析の本文・画像・IDを上書き、移動、削除しない。
- DISの分析は `analysisVersion` と `sourceAnalysisRef` を持つ別成果物にする。
- 画面、元画像、一次情報で確認できないことは推測しない。`unknowns`、影響、次に必要な確認を残す。
- 固有写真、人物、ロゴ、コピー、価格、実績値は再利用対象にしない。構造・役割・制作原則だけを抽出する。
- CBS、Notion、Dropboxへの書き込みは、ユーザーが明示したときだけ行う。単体DISの作成・検証はローカルで完結させる。

## 基本フロー

1. 新規のLP／Web／バナーを探す場合は、[参照元レジストリ](references/reference-source-registry.md) の登録サイトと読み取り条件を確認する。掲載サイトは探索の入口であり、一括取得やアクセス制御の回避はしない。
2. 元画像と既存分析の参照先を確定する。原画像を再確認できない場合は二次根拠として明記する。
3. 全Section／全Unitを記録する。各項目に役割、根拠、確信度、再利用構造、差替必須要素、未確認事項を付ける。
4. 9軸を採点する。点数だけでなく、根拠、対象範囲、確信度、未確認事項を必須にする。
5. 改善案は「最優先アクション／優先アクション／改善アイデア」で表示し、課題、変更、期待変化、確認指標を記録する。
6. Canva、Photoshop、Elementorでは、再現可能な構造と固有素材の差替を分けて手順化する。
7. 注釈は元画像を変更せず、座標・ラベル・根拠を別データとして持つ。
8. 分析パックを検証後、自然言語検索用の索引を生成する。画像類似検索は元画像が利用可能な場合だけ進める。

日次自動収集を依頼された場合は、[日次収集ワークフロー](references/daily-learning-workflow.md) を読み、媒体のローテーション、1日あたりの上限、重複確認、新規ページのみの登録を守る。

## 9軸

`purpose_fit`（目的適合）、`information_hierarchy`（情報優先順位）、`visual_flow`（視線誘導）、`message_copy`（訴求・コピー）、`trust_safety`（信頼・安心）、`color_legibility`（配色・可読性）、`layout_spacing`（レイアウト・余白）、`visual_brand`（ビジュアル・ブランド）、`implementation_reuse`（実装・転用性）を使う。

点数は1〜5、`0`は評価不能として合計に入れない。媒体横断で合計点の順位付けはしない。

## 成果物の使い分け

- 分析・再分析・全Sectionの欠落確認: `DIS Analysis Pack`
- 注釈図の準備: `DIS Annotation`
- テキスト検索: `DIS Text Index`
- 画像類似検索: 元画像の候補台帳と、許諾済みの埋め込み索引
- 制作添削: 提出物とDISの再利用構造・改善案を照合する。原画像がない場合、視覚上の断定をしない。

詳細な必須フィールドと完了チェックは [analysis-pack reference](references/analysis-pack.md) を読む。

## 入口: 「DISを進めたい」と言われたら、最初に聞く（Macで動かすClaude Code）

最初に、次の2つを聞く（AskUserQuestion）。
1. 進め方: **自動の候補から選ぶ**／**手動（URLを指定する）**
2. 種類: LP／Web／バナー

- 自動の候補から選ぶ → 下の「自動の候補から進める流れ」。
- 手動（URL指定） → その後の「URLを指定された場合の対話フロー」。URL（LPアーカイブの紹介ページでもよい）も聞く。
- 1案件につき1会話が目安（画像が重く、容量を使うため）。

どちらの流れも、**最後の登録（Dropbox・Notionへの書込み）の直前に、必ずユーザーに確認する**（登録計画を見せ、「登録する／見送る」を聞く）。「はい」の返事があったときだけ、`--apply` ＋ `DIS_ENABLE_WRITES=true` ＋ `DRY_RUN=false` で実行する。確認なしの自動登録はしない。登録後は、台帳（`data/dis-ledger.json`）のコミットとプッシュを案内し、DropboxとNotionを読み取りで確認する。

## 自動の候補から進める流れ

1. 準備の確認: `outputs/dis/<日付>/<lp|banner|web>/review/contact_sheet.jpg` と `review.json` があるか。なければ `bash scripts/dis/daily-prep.sh`（書込みなし）を実行する。
2. コンタクトシートを読む: 各候補を、`learning-value-rubric.md` の6項目（0〜3点）で採点し、**どこが良いか**を具体的に書いた `reason` を付ける。サムネイルだけで判断できない点は、控えめに採点し、撮影後に見直す。
3. `outputs/dis/<日付>/<媒体>/learning.json` に `{ "items": [{ "no": 1, "criteria": {...6項目}, "reason": "…" }] }` を書き、`DRY_RUN=true npm run dis:run -- --media <媒体> --stage rescore` を実行する。13/18点以上の候補が選ばれる。基準未達ならスキップし、理由を伝える。
4. 撮影とテンプレート: `DRY_RUN=true npm run dis:run -- --media <媒体> --stage capture,template --capture`。連番ID（`DIS-LP-0001` など）が採番され、案件フォルダ `outputs/dis/<LP|バナー|ウェブ>/<連番>_<日付>_<ブランド>/` ができる。
5. 以降は、手動と同じ（画像を全Sectionぶん読む → `analysis.json`・`annotations.json` を案件フォルダに書く → 検証 → 登録計画 → ユーザーに確認 → 登録）。選定理由は、手順2・3の `reason` と6項目の点数が、自動で入る。

## URLを指定された場合の対話フロー（手動。Macで動かすClaude Code）

ユーザーが「このURLを分析したい」「LPを撮影して分析して」などと言ったら、次の順に進める。撮影はサイトに届く環境（ユーザーのMac）でのみ行う。クラウドのセッションではサイトに届かないため、撮影はせず、`bash scripts/dis/install-url-app.sh` で作るアプリ（または `scripts/dis/url-capture.sh`）の使用を案内し、画像の添付を依頼する。

1. 質問する: 種類（LP / Web / バナー）と、対象のURL。LP・Webは、パソコン版とスマホ版でURLが異なるページがあるため、**URLを2回聞く**（①パソコン版のURL、②スマホ版のURL）。どちらも無い場合は、「なし」と答えるか、そのままEnter（空）でよい。答えの組み合わせで、次の3パターンに分けて撮影する。
   - **両方ある**: `--url "<PC版>" --sp-url "<スマホ版>"`（同じURLなら `--sp-url` は省略してよい）。
   - **PCだけある（スマホなし）**: `--url "<PC版>" --device pc`。SPは撮影せず、分析ではSPを未確認として扱う。
   - **スマホだけある（PCなし）**: `--url "<スマホ版>" --device sp`。PCは撮影せず、分析ではPCを未確認として扱う。
   `--device` は撮影の段階（capture）だけに付ける（`item.json` の `devices` に記録され、以降の段階で使われる）。`--sp-url` はSPの撮影だけに使い、`item.json` に `spUrl` として記録する。バナーは1つのURLのみ。LPアーカイブ（rdlp）の紹介ページのURLなら、実際のLPを撮影するか、アーカイブ掲載の画像（`--from-archive`。実ページが公開終了などで開けない場合）を使うかも聞く。
2. 撮影する（外部書込みなし）:
   `DRY_RUN=true npm run dis:run -- --media <lp|web|banner> --url "<URL>" [--sp-url "<スマホ版URL>"] [--device both|pc|sp] [--from-archive] --stage collect,select,capture,template --capture`
   - IDは媒体ごとの連番（`DIS-LP-0001`）が撮影時に採番される。
   - 403・robots.txt禁止・ログイン壁・Bot対策は回避せず、理由を伝えて止まる。
3. 結果を確認する: `disId`、`capture` の「画像の揃い」、警告（アーカイブ画像・幅など）。PCとSPの画像幅が同じ場合は、PC/SPではなく前半・後半の分割画像の疑いがあるため、画像を見て確認する。
4. 画像を実際に読む: 案件フォルダ `outputs/dis/<LP|バナー|ウェブ>/<連番>_<日付>_<ブランド>/files/01_Normal_Images/`（一覧は `outputs/dis/INDEX.md`） の全体画像と、`sections/` の分割画像を、全Sectionぶん読む。見えない箇所は推測せず、unknownsに残す。
5. 分析を書く: 案件フォルダの `analysis.json`（dis-2.0）と `annotations.json` を埋める。手動指定の案件は、`selectionReason` の「良い点: （分析時に記入）」を、どこが良いかの具体的な文章に置き換える（未記入だと検証が通らない。最後の注記「（ユーザーが選定…）」は残す）。アーカイブ画像の場合は `captureSource` を残し、動き・実際の文言・最新状態を未確認として扱い、確信度を下げる。
6. 検証する: `DRY_RUN=true npm run dis:run -- --media <…> --url "<URL>" --stage validate`（撮影・分析と同じ `--url` を付ける）。
7. 登録計画（ドライラン: `--stage validate,publish`）を見せ、ユーザーに「登録する／見送る」を確認する。「登録する」の返事があったときだけ、`--apply` ＋ `DIS_ENABLE_WRITES=true` ＋ `DRY_RUN=false` で書き込む。登録後は、台帳のコミットとプッシュを案内し、DropboxとNotionを読み取りで確認する。

## Sectionごとの切り出し（意味のまとまりごと。機械的な分割は、そのまま残る）

分析を書くとき、各Unitに次の2つを必ず付ける。
- `roleType`: Sectionの種類。`FV`／`悩み提起`／`共感`／`解決策`／`ベネフィット`／`特徴`／`実績`／`比較`／`商品紹介`／`料金`／`流れ`／`FAQ`／`CTA`／`会社情報`／`ナビ`／`フッター`／`その他` のいずれか。LPをまたいだ比較・検索のため、一覧から選ぶ（役割の説明は、従来どおり `role` に自由に書く）。
- `regions`: 全体画像の縦の範囲（0〜1の割合）。`{ "pc": { "y0": 0, "y1": 0.2 }, "sp": { "y0": 0, "y1": 0.15 } }`。PCとSPは、レイアウトが違うので、それぞれ別に見て決める。SPの画像がなければ、`sp` は `{ "y0": 0, "y1": 0 }`（未指定）にする。目測でよい（境界は、近くの余白に自動で吸着する）。

分析と検証のあとで、`DRY_RUN=true npm run dis:run -- --media <媒体> [--url "<URL>"] --stage crop` を実行すると、案件フォルダの `files/01_Normal_Images/sections_by_unit/` に、`pc_01_FV.png`、`pc_02_悩み提起.png`、`sp_01_FV.png` のような名前で切り出される（番号はUnitの順）。登録時には、Dropboxにも新規ファイルとして入る。従来の機械的な分割（`sections/pc_01.jpg`）は、そのまま残る。旧形式の分析（`roleType` なし）は、検証を通るが、切り出しはできない。

## このリポジトリでの実装

コマンド・ファイル構成・スキーマ（dis-2.0）・日次運用の手順は [実装メモ](references/implementation-notes.md) を読む。
