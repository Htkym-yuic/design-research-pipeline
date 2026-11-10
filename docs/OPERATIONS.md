# 運用メモ

## 役割分担

- Dropbox: 画像、スクリーンショット、一次資料の正本置き場
- Notion: 人が読む分析、分類、運用ステータスの管理
- GitHub: 自動処理、構造化ナレッジ、Creative Brief Studio AI同期用データの管理

## 基本フロー

1. リサーチ対象を収集する
2. 一覧ページから個別候補を抽出する
3. 候補を人が確認し、採用・除外を判断する
4. 採用した対象のPC / SPスクリーンショットを取得する
5. Dropboxの該当ライブラリへ保存する
6. Notionの正本DBへ分析結果を登録する
7. `knowledge/` に機械利用用JSONを生成する
8. `exports/creative-brief-studio-ai/` に同期用パッケージを生成する

## 初期参考元

| 種別 | 参考元 | URL |
| --- | --- | --- |
| Banner | バナー広場 | `https://banner-hiroba.com/` |
| LP | LPアーカイブ | `https://rdlp.jp/lp-archive/` |
| Web | SANKOU! | `https://sankoudesign.com/` |
| Mixed | Pinterest | `https://www.pinterest.jp` |
| Parts | Parts. | `https://partsdesign.net/` |

初期参考元の接続テストでは、各サイトをPCファーストビューとSPファーストビューで撮影します。

LP候補の本取得では、既存のLP分析ページに合わせて以下を基本セットにします。

- PC Full Page
- PC First View
- PC Section一覧
- SP Full Page
- SP First View
- SP Section一覧

Section一覧は分析用の目次画像です。裏側には `S01` / `C01` 形式の個別切り出し候補とy座標を残し、Notionの「Section位置索引」「パーツ切り出し指示書」で確認・調整できるようにします。

## 候補抽出

参考元サイトの一覧ページは、最終的な研究対象そのものではありません。

LPアーカイブの場合は、一覧ページから個別LP候補を抽出し、`candidates/lp-archive/candidates.json` に保存します。候補IDは `data/id-counters.json` の `lp.nextNumber` から開始します。

2026-09-26時点で、Dropboxには `LP-0214〜LP-0221` の候補フォルダが存在します。`LP-0215` は生活本舗のCBS同期済みIDとして固定し、重複していたSunshine City候補は `LP-0222` へ変更しました。2026-09-27以降の正式な新規候補は `LP-0223` から開始します。

現在の予約状況は `candidates/lp-archive/intake-reservations.json` に記録します。

日次実行では `RESERVE_LP_IDS=true` を付けて候補抽出を行い、抽出後に `data/id-counters.json` を次回開始番号へ進めます。これにより、翌日の収集で同じIDを再利用しないようにします。

候補抽出時には、既存の候補ファイル、`intake-reservations.json`、`knowledge/lp/*.json` の `captureUrl` / `sourceDetailUrl` / LP Archive post ID を確認します。すでに `LP-0215` などで登録済みのLPが再度一覧に出てきた場合は、新しいIDを付与せずスキップし、次の未登録候補を `LP-0223` 以降へ繰り上げます。

日次スケジュールは、収集とラフ分析が朝4:00〜4:30頃までに終わることを目標に、GitHub Actionsを毎日1:30 JSTに開始します。

抽出候補には以下を含めます。

- 仮ID
- タイトル
- 実際に撮影するURL
- LPアーカイブ内の詳細ページURL
- サムネイルURL
- 企業名
- カテゴリ
- テイストタグ
- LPアーカイブ保存画像URL

## 撮影対象URLの扱い

スクリーンショット取得では、参考元サイトのトップURLだけで止めず、実際に撮影したページURLを保存します。

- `captureUrl`: 実際にスクリーンショットを撮るURL
- `sourceUrl`: 参考元サービスや参考元サイトのURL
- `sourceDetailUrl`: 掲載元の詳細ページURL

たとえばLPアーカイブ経由で個別LPを撮影する場合、`sourceUrl` はLPアーカイブ、`sourceDetailUrl` はLPアーカイブ内の個別詳細ページURL、`captureUrl` は実際に撮影する対象LPのURLとして管理します。

## 広告表示の扱い

研究用スクリーンショットでは、広告やスポンサー枠が分析対象を邪魔する場合があります。

`data/targets.json` の各対象に `hideSelectors` を設定すると、撮影前に該当要素を非表示にします。LPアーカイブでは、広告バナー、Google広告、スポンサー枠を非表示にして撮影する設定を入れています。

## Notionステータス

- `CBS同期状態`
- `CBS同期日`
- `GitHubナレッジパス`
- `Dropbox正本パス`
- `ナレッジ化ステータス`

## Dropbox正本ルート

```text
/design/Design_Research_Library/
```

各ライブラリでは、以下の共通構成を使います。

```text
00_Guide/
01_Master/
02_By_Date/
90_Legacy/
99_Needs_Review/
```

## 注意

APIキー、アクセストークン、NotionやDropboxの秘密情報はリポジトリへ直接保存しません。GitHub Secretsで管理します。

## LP検証

LPを「完了」扱いにする前に、以下の2種類の検証を行います。

```bash
npm run knowledge:validate-lp -- --input <analysis.md または metadata.json>
npm run knowledge:crosscheck-lp -- --input <LPフォルダ>
```

`knowledge:validate-lp` は、LP ID、URL、参考元詳細URL、Dropbox正本パス、GitHubナレッジパス、CBS同期状態など、分析・ナレッジ化に必要な項目を確認します。

`knowledge:crosscheck-lp` は、PC / SP の Full Page、First View、Section一覧、個別セクション画像、Notion用画像、`metadata.json` を確認します。SP Full Page はスマホ幅として扱えるよう、430px以下であることを検証します。

## 自動化（GitHub Actions）

`.github/workflows/design-research-daily.yml` が、LPと非LPの日次軽量分析パイプライン（収集→スクショ取得→Dropbox保存→Notion登録）をMacを起動せずに実行する。毎日01:37 JSTに本実行し、未完了時のみ01:52 JSTの予備便が動く。`workflow_dispatch`ではLPと非LPを個別に選んで手動実行できる。

### 必要なGitHub Secrets

リポジトリの `Settings > Secrets and variables > Actions > Secrets` に登録する（値をリポジトリへ直接保存しない）。

| Secret名 | 用途 |
| --- | --- |
| `DROPBOX_APP_KEY` | DropboxアプリのApp key |
| `DROPBOX_APP_SECRET` | Dropboxアプリのapp secret |
| `DROPBOX_REFRESH_TOKEN` | Dropboxのリフレッシュトークン（長期間有効。実行のたびに短命なアクセストークンへ交換する） |
| `NOTION_TOKEN` | Notion Internal Integration Token |
| `OPENAI_API_KEY` または `ANTHROPIC_API_KEY` | 将来、分析処理でLLMを使う場合に備えて（現時点の日次パイプラインでは未使用） |

Dropboxのリフレッシュトークンの取得手順（概要）：Dropbox App Console でアプリを作成し、OAuth2のAuthorization Code フローに `token_access_type=offline` を指定して認可コードを取得、`https://api.dropboxapi.com/oauth2/token` へ交換リクエストを送ると `refresh_token` が得られる。

### 必要なGitHub Variables

`Settings > Secrets and variables > Actions > Variables` に登録する（秘密情報ではないのでVariablesでよい）。

| Variable名 | 例 | 用途 |
| --- | --- | --- |
| `DROPBOX_DESIGN_ROOT` | `/design/Design_Research_Library` | Dropbox正本ルート |
| `NOTION_LP_DATA_SOURCE_ID` | `39624d4f-a671-8094-ba0c-000b11fefbd0` | NotionのLPリサーチライブラリーのデータソースID |
| `DAILY_LP_LIMIT` | `2` | 日次で新規抽出・撮影するLP候補数 |
| `DRY_RUN` | `false` | `true`の場合、Dropbox/Notionへ実際には書き込まない |

LP以外は以下のVariableで保存先と件数を管理する。

| Variable名（予定） | 用途 |
| --- | --- |
| `NOTION_BANNER_DATA_SOURCE_ID` | NotionのバナーリサーチライブラリーのデータソースID |
| `NOTION_WEB_DATA_SOURCE_ID` | NotionのウェブサイトリサーチライブラリーのデータソースID |
| `NOTION_GRAPHIC_DATA_SOURCE_ID` | NotionのグラフィックデザインリサーチライブラリーのデータソースID |
| `NOTION_CANVA_DATA_SOURCE_ID` | NotionのCanvaリサーチライブラリーのデータソースID |
| `NOTION_PARTS_DATA_SOURCE_ID` | NotionのデザインパーツライブラリのデータソースID |
| `NOTION_PARTS_REVIEW_DATA_SOURCE_ID` | 旧パーツ514件を保管する`99｜要確認・移行待ち / 04｜デザインパーツ再分析待ち`のデータソースID |
| `NOTION_PATTERNS_DATA_SOURCE_ID` | Notionのデザイン原則・パターンのデータソースID |
| `NOTION_ASSET_DATA_SOURCE_ID` | Notionの素材探索ナレッジのデータソースID |
| `DAILY_BANNER_LIMIT` / `DAILY_WEB_LIMIT` / `DAILY_GRAPHIC_LIMIT` / `DAILY_PARTS_LIMIT` / `DAILY_CANVA_LIMIT` / `DAILY_ASSET_LIMIT` | 各媒体の日次収集件数 |
| `DAILY_PATTERN_LIMIT` | 当日の実例から抽出するデザイン原則・パターン件数（既定2件） |

### Notionのプロパティ対応表

`config/notion-lp-properties.json` に、Notion側の実際のプロパティ名・型との対応表を持つ。実際のNotionデータベースのプロパティ名が異なる場合は、このJSONだけを編集すればよい（スクリプトのコードは変更不要）。`matchProperty`（既定："LP ID"）で既存ページを検索し、見つかれば更新、無ければ新規作成する。

### 実行フロー

1. `npm run check:env` — 必要なSecrets / Variablesが揃っているか確認する（DRY_RUN=trueのときはSecretsが無くてもよい）
2. `npm run extract:lp:test`（`RESERVE_LP_IDS=true`）— LPアーカイブから新規候補を抽出し、`data/id-counters.json` の採番を進める
3. 候補予約（`candidates/lp-archive/candidates.json` 等）をコミット・push
4. `npm run capture:lp:candidates` — 抽出した実候補（フィクスチャではない）をPC/SPで撮影する
5. `npm run dropbox:upload:lp` — 撮影結果を`99_Needs_Review/<日付>/daily-intake-<開始ID>-<終了ID>/`配下へアップロードする
6. `candidates/lp-archive/lightweight-analysis.json`へ画面確認済みの軽量分析を用意する。未記入の候補は分析待ちとして扱う
7. `npm run notion:register:lp` — Notionへ軽量分析とPC/SPのFV・全体画像を新規作成・更新する

日次のNotion登録では、軽量分析を週末まで保留しない。概要、FV印象、構成、テイスト・配色、参考点、要確認点、詳細分析候補度を短く記録し、PC/SPそれぞれのファーストビューと全体確認画像を掲載する。週末へ回すのは29項目の詳細分析とCBS同期である。
8. `npm run blueprint:daily -- --scope lp` — LPごとに注釈入り脳内実装図、Notion用JPEG、標準Elementor作成手順、構造JSONを生成する
9. `npm run collect:non-lp`以降で、バナー・Web・グラフィック・パーツ・Canva・素材候補を収集、撮影、軽量分析する。新規パーツ候補は05へ登録し、旧パーツ514件は99配下の再分析待ちDBで保管する
10. `npm run blueprint:daily -- --scope non-lp` — 視覚対象に媒体別の脳内実装図と手順書を生成する。素材メタ情報と抽象Patternは直接実装対象から除外する
11. Dropboxでは正本PNG、Notion用JPEG、`03_Implementation_Blueprint`のMarkdown/JSONを保存し、Notionへ軽量JPEGと一次設計の説明を掲載する
12. `npm run report:daily:summary` — GitHub ActionsのStep SummaryへLP・非LP・脳内実装図の結果（失敗があればその内容）を出力する
13. 候補・撮影結果・Dropboxアップロード結果・Notion登録結果をGitHub Artifactとして保存する（`if-no-files-found: warn` のため、途中で失敗しても直前までの結果は残る）

### 日次脳内実装と詳細分析の役割分担

- 日次: 画像から読み取れる意味単位を赤枠で示し、標準ElementorのContainer / Widget、PC/SPの基本方針、作成順を一次設計として記録する。
- 詳細分析: 日次図を捨てずに、実際の境界、寸法、レイアウト、レスポンシブ、動作、権利条件を検証して確定版へ更新する。
- 日次で推測した値は「推奨値」「仮説」と明記する。取得できない値を実測値として扱わない。
- Atomic Elementsは補助案、CSSは標準機能で再現できない場合のみ使用する。

候補1件の処理に失敗しても、他の候補の処理は継続する（各スクリプト内で候補単位にtry/catchしている）。

### DRY_RUNモード

- `DRY_RUN=true`（既定）：Dropbox/Notionへ実際には書き込まず、書き込み予定の内容だけを`dropbox-upload-result.json` / `notion-registration-result.json`へ出力する。
- `DRY_RUN=false`：実際にDropboxへアップロードし、Notionへページを作成・更新する。
- 手動実行（`workflow_dispatch`）では毎回選べる。スケジュール実行はリポジトリVariable `DRY_RUN` の値に従う（未設定なら`true`のまま）。**本番反映する場合は、Variable `DRY_RUN` を`false`に変更すること。**
- 非LPだけを個別検証するときは、`non_lp_source_filter` に `illustrationAc`、`photoAc`、`parts` などのsource keyを指定する。AC系は素材をダウンロードせず、ID、正式な素材ページURL、検索語、作者プロフィールURLのみを保存する。
- 写真AC・イラストACの検索語は、ビジネス、美容、医療、介護、教育、飲食、EC・物販、住宅、士業、採用、家族、シニア、テクノロジー、自然・地域をJSTの日付で循環する。`RESEARCH_DATE_JST=YYYY-MM-DD`で検証日を固定できる。
- 写真AC・イラストACはGitHubホストランナーのIPにCloudFront 403を返す場合がある。その場合は`blocked`として報告し、同じ収集コードをローカルMacで実行する。アクセス制限の迂回は行わない。
- Parts.はトップページだけでなく過去ページも走査し、予約済みURLを除外して新規候補を探す。当日の実例から、根拠ID付きのデザイン原則・パターンを最大`DAILY_PATTERN_LIMIT`件生成する。

### 週末の非LP詳細分析

LP以外は docs/NON_LP_DEEP_ANALYSIS_SPEC.md の drs-deep-1.0 を使用する。LPと同じ29章構成を固定し、
媒体別の画像枠・Unit・重点評価だけを切り替える。週末レビューで選定したIDだけを
data/non-lp-deep-analysis-selection.json に記入し、次を実行する。

~~~bash
npm run analyze:non-lp:selected:deep -- --selection data/non-lp-deep-analysis-selection.json
~~~

生成直後はテンプレートであり、画像理解と実測を終えていない。完成報告の前に
npm run knowledge:validate-non-lp -- --input "<Markdown>" --mode analysis を通す。

## APIなし半自動運用（分析待ちキュー）

LP以外の領域（バナー・Web・グラフィック・パーツ・Canva・素材探索・note記事ネタ等）を、
OpenAI/Anthropic APIの常時利用を前提にせず、ChatGPT/Claudeの通常プラン範囲で半自動的に
分析していくための仕組み。GitHub Actionsでは**収集・整理・分析待ち化まで**を行い、
深い分析・CBS用ナレッジ本文の作成・Note記事案の作成はChatGPT/Claude/Claude Codeへ渡す。

### 全体の流れ

1. GitHub Actions（既存の`collect:non-lp`等）で候補を収集する（変更なし）
2. `npm run queue:build` — `candidates/non-lp/candidates.json` と
   `candidates/non-lp/lightweight-analysis.json` を媒体別に整理し、
   `candidates/analysis-queue/<日付>/<媒体>.json` へ出力する
3. `npm run queue:request` — 上記キューから、ChatGPT/Claudeに貼り付ける分析依頼Markdownを
   `outputs/analysis-requests/<日付>-design-research-request.md` へ生成する
4. 生成されたMarkdownをChatGPT（またはClaude）に貼り付けて分析してもらう
5. 分析結果をレビューする
6. Claude Codeに「このMarkdownと回答を渡すので `knowledge/<媒体>/<ID>.json` へ反映して」と依頼する
7. 変更はPRで確認する（mainへの直接pushはしない）
8. Creative Brief Studio AIへの反映は、別途ユーザー確認後に行う（本番同期の自動化は対象外）

### コマンド

```bash
npm run queue:build                 # 当日分のキューを作成（candidates/analysis-queue/<today>/）
npm run queue:build -- --date 2026-10-11   # 日付を指定して作成
npm run queue:request               # 当日分の分析依頼Markdownを生成
npm run queue:request -- --date 2026-10-11 # 日付を指定して生成
```

いずれもAPIキーを一切使わず、既存のcandidates.json/lightweight-analysis.jsonを読み込むだけの
ローカル処理（ネットワーク通信なし）。Secrets/Variablesが未設定でも動作する。

### 対象範囲とknowledge/の置き場

`knowledge/` 配下に媒体別の置き場を用意している（`banner/` `web/` `graphic/` `parts/` `canva/`
`patterns/` に加え、`logo/` `business-card/` `poster/` `flyer/` `trends/` `note-ideas/`）。
共通の型と現状は [`knowledge/README.md`](../knowledge/README.md) を参照。

note記事ネタの候補は `outputs/note-drafts/` に置く。使い方は
[`outputs/note-drafts/README.md`](../outputs/note-drafts/README.md) を参照。

### 既存フローへの影響

このキュー構築・分析依頼Markdown生成は、既存のLP日次フロー
（`.github/workflows/design-research-daily.yml`、`capture-lp-candidates.mjs`、
`register-lp-intake-notion.mjs`、`upload-lp-intake-to-dropbox.mjs`、`knowledge/lp/`）には
一切変更・依存しない。既存の非LP収集（`collect-non-lp-candidates.mjs` 等）が出力する
`candidates/non-lp/candidates.json` / `lightweight-analysis.json` を**読み込むだけ**で、
書き込みや上書きは行わない。

### 現時点でまだ自動化していないこと

- Creative Brief Studio AIへの同期（`npm run knowledge:apply`等）は対象外。Notionへの軽量分析ページ登録までがこのワークフローの範囲。
- 画像理解を伴う詳細分析本文の自動確定。非LPは29章テンプレートと検証処理まで自動化し、週末レビューで選んだ候補だけを画像確認して完成させる。
- 画像理解を伴う最終的な意味判断。日次は自動一次分析までとし、コピー、正確な訴求分類、パーツ境界、原則の妥当性は週末レビューで確認する。
- DropboxやNotion内の既存資産の移動・削除。

## Design Research Scout（GitHub公開コードからのトレンド調査）

`imsaif/design-with-claude` の `research-scout` ブランチにあった調査エージェント設計を、
`docs/scout/` と `scripts/scout/` へ draft-only の独立モジュールとして移植したもの。
LP/バナー等の収集（Dropbox・Notionへの一次資料保存）とは別の、**GitHub公開コード上の
デザイン制作ツール採用傾向**を調べる仕組み。

### 役割

- 対象: Tailwind・Storybook・design-tokens.json・Figma連携ツールチェーン等の指紋
  （`scripts/scout/fingerprints.mjs`。暫定の指紋セットで見直し前提）。
- 書き込み先: `docs/scout/drafts/` と `docs/scout/scan-log.md` だけ。`knowledge/`への
  反映は人（Claude Codeを含む）がドラフトをレビューした後の別工程。
- 使うAPI: GitHub REST APIのみ（`GITHUB_TOKEN`）。OpenAI/Anthropic APIは呼ばない。
- 数字の扱い: Wilson 95%信頼区間 or directional floorラベル必須。裸の数字は書かない
  （`docs/scout/DRAFT-TEMPLATE.md`）。

### コマンド

```bash
npm run scout:test                                             # 純粋関数のユニットテスト
npm run scout:collect -- --fingerprint=tailwind.config.js --count-only
npm run scout:collect -- --fingerprint=tailwind.config.js,.storybook --sample=60
```

いずれもネットワーク呼び出しは`GITHUB_TOKEN`を使ったGitHub REST APIのみ。
ローカル実行時は`GITHUB_TOKEN`（Personal Access Token等）を環境変数に設定する。
GitHub Actions実行時は自動発行される`secrets.GITHUB_TOKEN`を使うため、追加のSecrets登録は不要。

### 未検証事項（このPRの時点）

- このサンドボックス環境には実際のGitHub REST APIを叩けるトークンが無く、
  `scripts/scout/index.mjs`のネットワーク経路（`github-client.mjs`）はライブでは
  未検証。純粋関数（`toCsv.mjs`/`stats.mjs`/`fingerprints.mjs`）は`npm run scout:test`で
  検証済み。クエリ構文自体は別ツール経由のGitHub code search APIで実際に妥当な件数
  （`tailwind.config.js`で約128万件、`.storybook/main`で約2.9万件、2026-10-11時点）が
  返ることを確認済み。
- `figma.config.js`の`filename:`クエリは完全一致ではなく類似ファイル名も混ざることを
  確認済み（`docs/scout/scan-config.md`に記載）。実運用前に指紋の精度を見直すこと。

### `research-scout-weekly.yml`

`workflow_dispatch`（指紋・サンプル数・count-onlyを指定可）に加えて、週1回
（月曜00:00 JST）のスケジュール実行を持つ。`daily-intake`とはconcurrency groupを分離。
現時点では`docs/scout/drafts/`への変更をArtifactとしてアップロードするのみで、
mainへの自動コミットは行っていない（必要なら別途判断）。

## Creative Brief Studio AI向けエクスポート（`exports/creative-brief-studio-ai/`）

`knowledge/**/*.json`（媒体を問わず全件）から、CBS側が検索に使う軽量インデックスを
生成する。

```bash
npm run cbs:export
```

`exports/creative-brief-studio-ai/manifest.json`（件数・媒体一覧等のメタ情報）と
`index.json`（id・mediaType・title・tags・summary・knowledgePathの軽量配列）を生成する。
**CBS本体への本番同期はここでは行わない。** 生成までがこのコマンドの範囲。


## DIS日次学習（LP・バナー・Web 各1件）

既存の日次パイプライン（`design-research-daily.yml`）とは別機能。設定は `config/dis-daily.json`、実装は `scripts/dis/`、手順は `.claude/skills/dis-design-learning/`。

- 既定はドライラン。外部書込みは `--apply` + `DIS_ENABLE_WRITES=true` + `DRY_RUN=false` が全て必要。
- 分析（画像理解）はClaude Codeが行うため、GitHub Actionsの定期実行には載せていない。
- 台帳 `data/dis-ledger.json` は本番書込み時のみ更新。成果物は `outputs/dis/`（Git管理外）。
- 参照元の `termsStatus` は初期値すべて `unknown`（取得しない）。規約確認後に `known` へ変更する。

```bash
npm run dis:test
npm run dis:run -- --stage collect,select,template --fixture scripts/dis/fixtures/sample-candidates.json
```

### DIS: 学習価値の比較と参照元の有効化

- 撮影の前に `--stage review` で、比較する5候補のサムネイルを番号つきの一覧画像（`review/contact_sheet.jpg`）にまとめ、評価を `learning.json` に書き、`--stage rescore` で選定に反映する。基準は `.claude/skills/dis-design-learning/references/learning-value-rubric.md`。
- 取得に失敗し続ける参照元は、`config/dis-daily.json` で `enabled: false` と `disabledReason` を付けて止める（SANKOU!、CSS Design Awards、Land-book、SiteInspire、BANNER LIBRARY、Banner Matome、GDWEB）。URLや規約を確認できたら `enabled` を外す。
- 構造の確認は `npm run dis:probe -- --source <key>`。

### DIS: 毎朝の「準備」の自動実行（Mac / launchd）

- 自動化するのは準備だけ（収集→選定→比較用の一覧画像）。外部への書き込みと認証情報は使わない（`DRY_RUN=true`固定、`DIS_ENABLE_WRITES` は常に外す）。評価・撮影・分析・本番の書き込みは、通知後に人が行う。
- 登録: `bash scripts/dis/install-schedule.sh [--hour 6] [--minute 0]` / 状態: `--status` / 解除: `--uninstall`
- 実行内容: `scripts/dis/daily-prep.sh`。ログは `outputs/dis/logs/prep-<日付>.log`。完了と失敗はmacOSの通知で知らせる。
- 通知後の流れ: 一覧画像（`outputs/dis/<日付>/<媒体>/review/contact_sheet.jpg`）をチャットに添付 → 評価（`learning.json`）→ `--stage rescore,capture --capture` → 分析 → 検証 → 本番（`--apply`）。
- 既存の日次パイプライン（GitHub Actions）とは独立している。

### DIS: 選定基準・保存形式（原本に合わせた更新）

- 選定は6項目×0〜3点＝18点満点で、13点以上が基準（`config/dis-daily.json` の `selection`）。基準は `.claude/skills/dis-design-learning/references/learning-value-rubric.md`。`review` → `learning.json` → `rescore` で決め、基準未達ならスキップ。公開（publish）は選定基準を満たした候補だけ。
- Dropboxは `01_Normal_Images`・`02_Notion_Images`・`03_Analysis`。Notionの本文にはLP・Webで軽量画像4枚を載せる。詳細は `references/implementation-notes.md`。


## DIS: URLを指定して詳細分析する（手動指定）

候補の収集・選定を使わず、指定したURL1件を対象にする。`--media` は1つだけ（lp / banner / web）。

```bash
cd ~/design-research-pipeline-auto
DRY_RUN=true npm run dis:run -- --media lp --url https://example.com/ --date 2026-11-09 --stage collect,select,capture,template --capture
```

- 重複（登録済み・180日以内）とID衝突（同じ日付・媒体のDIS-IDが使用済み）だけを確認する。13/18の基準と機械的スコアの足切りは適用しない（人が選んだものとして扱い、selectionReasonに明記）。
- 出力先: `outputs/dis/<LP|バナー|ウェブ>/<連番>_<日付>_<ブランド>/`（撮影画像は `files/`。撮影するには `--capture` が必要）。構成は下の「出力フォルダの構成」を参照。Dropbox・Notionへの書込みは、従来どおり `--apply` ＋ `DIS_ENABLE_WRITES=true` ＋ `DRY_RUN=false` のときだけ。
- ログイン・課金壁・Bot対策・robots.txt禁止・403等は回避せず、理由を表示して止まる。
- 同じ日付・媒体にすでに登録済みの場合は、`--date` で別の日付を指定する。

### DIS: IDは媒体ごとの連番

- 新規は `DIS-LP-0001`、`DIS-BN-0001`、`DIS-WB-0001`（媒体ごとに0001から）。登録済みの旧形式6件（`DIS-LP-20261107` など）は変更しない。
- 採番のタイミング: 撮影（`--capture`）またはテンプレート作成の時点。選定しただけでは番号を使わない。採番後は `selection.json` に保存され、同じ候補を再実行しても番号は変わらない。
- 番号 = 台帳の最大値 ＋ 作業中の予約（各日の selection.json の採番済みID）の最大値 ＋ 1。取りやめた分は欠番のままで、再利用しない。
- 日付は、Dropboxの日付フォルダ・Notion・台帳で管理する。
- 手動指定（`--url`）は、URLごとに作業フォルダ（`<media>-url-<8桁>`）が分かれる。撮影・分析・検証・登録の各コマンドにも、同じ `--url` を付けて実行する。

### DIS: ライブラリー番号との対応と、CBS・28章への下書き（`dis:cbs-draft`）

DISの分析（`DIS-LP-nnnn`）は、ライブラリーの番号（`LP-nnnn`）と対応づけて扱う。対応は `data/dis-relations.json` に記録する。

- `same_lp`: ライブラリーに同じLPの既存ページがある（例: DIS-LP-0004 = LP-0001）。番号は既存を維持し、主はライブラリー側。DISは追加の層。
- `reserved_for_library`: ライブラリー未登録のLP。番号だけ確保した（例: DIS-LP-0001〜0003 = LP-0245〜0247。`data/id-counters.json`・`candidates/lp-archive/intake-reservations.json` も更新）。ライブラリーの取り込みと28章の分析は、あとで行う。
- CBSには、LPの1件に、DISの層として付ける。DIS-LP単独では載せない。評価点（28章のヒューリスティックと、DISの9軸）は、混ぜずに、方法を明記して分ける。
- 同じ参考URLの既存ページがあるときに、DISのページも作る場合は、登録に `--allow-existing-url` を付ける（既存ページは変更しない）。

下書きの作成（ローカルのみ・外部書込みなし）:

```bash
npm run dis:cbs-draft -- --id DIS-LP-0001 [--tags <タグのJSON>]
```

- `cbs-knowledge-draft.json`: CBS用ナレッジ（`knowledge/lp/LP-nnnn.json` と同じ形）の下書き。`cbs_sync.status = draft_from_dis`、`actual_cbs_import = not_synced`。`npm run knowledge:validate-lp -- --input <ファイル>` で検証できる。`knowledge/lp/` への配置・CBSへの同期は、別途、指示があったときだけ。
- `lp28-seed.md`: 28章（`lp-deep-analyzer`、章順v4.0）のうち、DISで埋められる章（ヘッダーメタ、章1・3・14〜17・23・28、章8の一部）の下書きと、未作成の章の一覧。
- 28章の分析は、このファイルと、案件フォルダの画像（`files/01_Normal_Images/`、`sections_by_unit/`）を使い、`lp-deep-analyzer` の手順で、未作成の章を書く。1つのLPごとに会話を分ける（画像が重いため）。Notion・Dropboxへの登録は、確認のあとにだけ行う。

### DIS: PC版・スマホ版のURLが異なる場合／片方だけの場合（`--sp-url`・`--device`）

LP・Webは、パソコン版とスマホ版でURLが異なることがある。対話では、PC版のURLとスマホ版のURLを2回聞き、無い場合は「なし」かそのままEnter（空）とする。答えに応じて、次の3パターンで撮影する（撮影の段階のみ。以降の段階には付けない）。

| パターン | 撮影コマンド（`--stage collect,select,capture,template --capture` を付ける） |
|---|---|
| 両方ある | `--url <PC版> --sp-url <スマホ版>`（同じURLなら `--sp-url` は省略） |
| PCだけ | `--url <PC版> --device pc` |
| スマホだけ | `--url <スマホ版> --device sp` |

- 案件の `item.json` に `devices`（`["pc","sp"]`／`["pc"]`／`["sp"]`）と、`--sp-url` を使った場合は `spUrl` が記録される。
- `--device pc` / `sp` では、ないほうの画像の撮影と必須チェック（画像の揃い）を行わない。分析では、ないほうを未確認として扱い、`regions` を未指定（`{0,0}`）にする。Notionの全体図は、あるほう（PC優先、なければSP）で作る。
- `--sp-url` を指定しない場合（両方）は、PC版のURLをスマホ幅で撮影する。幅が広がるときは、スマホのUA→模擬なしの順に再撮影する。

### DIS: 実ページが開けない場合（アーカイブ掲載の画像で分析）

LPアーカイブ（rdlp）の紹介ページのURLを `--url` に渡し、実ページが公開終了・移転などで撮影できない場合は `--from-archive` を付ける。

```bash
DRY_RUN=true npm run dis:run -- --media lp --url <rdlpの紹介ページURL> --from-archive --stage collect,select,capture,template --capture
```

- 紹介ページが載せている、その案件自身の全体画像（`full_N`。最大2枚）だけを取得する。関連作品のサムネイルは使わない。一括ダウンロードはしない。
- 幅の広い画像をPC、狭い画像をSPとして扱い、通常の撮影と同じファイル一式（first_view・分割・Section一覧・Notion用JPEG）を作る。
- 元画像の幅は選べないため、幅の基準は警告にとどめる。画像の有無・読めること・容量は必須。
- 分析テンプレートには `captureSource`（アーカイブ掲載の画像・実ページは未確認）が入る。動き・実際の文言・最新状態は未確認として扱い、確信度を下げて記録する。
- 取得できない（403等）場合は回避せず止まる。すでに通常撮影した作業フォルダは、消してからやり直す。

### DIS: ターミナルに打たずにURLから撮影する（ダイアログ版）

```bash
cd ~/design-research-pipeline-auto && git pull origin claude/stoic-davinci-b2ek8x
bash scripts/dis/install-url-app.sh     # デスクトップに「DIS URL撮影.app」を作る（削除は --remove）
```

- アプリをダブルクリック → 種類（LP / Webサイト / バナー）を選ぶ → URLを貼る → 撮影・テンプレート作成まで自動実行 → 完了したら画像のフォルダがFinderで開く。
- LPアーカイブ（rdlp）の紹介ページURLのときだけ「実ページを撮影／アーカイブの画像を使う」を聞く。
- 書込み（Dropbox・Notion）は一切しない（DRY_RUN固定）。ログは `outputs/dis/logs/url-<日時>.log`。
- 画像をチャットに添付すると、分析以降をチャットで進める。
- アプリを使わず、`bash scripts/dis/url-capture.sh` でも同じダイアログが出る。

### DIS: 出力フォルダの構成（媒体別・連番）

```
outputs/dis/
├─ INDEX.md                         全案件の一覧（ID・日付・種類・取得[自動/手動]・ブランド・状態・URL・フォルダ）。実行のたびに自動更新
├─ LP/    0001_20261110_KAKEDASHI/  ← 自動・手動を区別せず、媒体ごとに連番で並ぶ（連番_日付_ブランド）
│         0002_20261111_…/
├─ バナー/ 0001_…/
├─ ウェブ/ 0001_…/
└─ 2026-11-10/                      候補置き場（日付ごと）。自動の candidates.json・selection.json・review/（コンタクトシート）、手動の <媒体>-url-<tag>/（候補だけ）
```

- 案件フォルダは、撮影またはテンプレート作成で連番を採番した時点で作られる。中身は、`item.json`（ID・取得方法・URLなど）、`files/`（撮影画像）、`analysis.json`、`annotations.json`、検証後の `analysis.md`・`text-index.json`、登録時の `metadata.json`・`publish-result.json`。
- 連番は媒体ごとに0001から。取りやめた番号は欠番のまま、再利用しない。
- 登録済みの旧形式6件は、このフォルダ構成の対象外（`candidates/dis/` に残る）。
- Dropbox の保存先は従来どおり `.../99_Needs_Review/<日付>/dis-daily/<ID>/`。

### DIS: Sectionごとの切り出し（`--stage crop`）

- 分析の各Unitに `roleType`（Sectionの種類）と `regions`（PC/SPそれぞれの、縦の範囲0〜1）を書くと、`--stage crop` で、全体画像を意味のまとまりごとに切り出す。
- 出力: `files/01_Normal_Images/sections_by_unit/pc_01_FV.png`、`pc_02_悩み提起.png`、`sp_01_FV.png` など。`index.json` に、各ファイルのUnit・端末・切り出し位置（px）を記録する。登録時は、Dropboxの `01_Normal_Images/sections_by_unit/` に新規で入る。
- 境界は、目測の位置の近く（全体の約3%以内）で、何も描かれていない横一列（余白）に自動で吸着する。見出しや画像を、途中で切らないため。隣り合うSectionは、隙間も重なりもなく切れる。
- 従来の機械的な分割（`sections/pc_01.jpg` など、約1600pxごと）は、そのまま残る。
- 種類の一覧: FV／悩み提起／共感／解決策／ベネフィット／特徴／実績／比較／商品紹介／料金／流れ／FAQ／CTA／会社情報／ナビ／フッター／その他。
- 旧形式の分析（`roleType` なし。`DIS-LP-0001` など）は、検証は通るが、切り出しの対象外。

### DIS: 登録済みの案件に、Sectionの切り出し画像を後から追加する（`dis:supplement-crops`）

```bash
npm run dis:supplement-crops -- --id DIS-LP-0002                 # ドライラン（追加先と件数の表示のみ）
DIS_ENABLE_WRITES=true DRY_RUN=false npm run dis:supplement-crops -- --id DIS-LP-0002 --apply   # 本番（ユーザーが明示したときのみ）
```

- 追加先: `<案件のDropboxフォルダ>/01_Normal_Images/sections_by_unit/`（新規フォルダ。すでにある場合は、上書きせず中止）。既存のファイル・Notionは変更しない。
- 追加が済むと、台帳の該当案件に `supplementCrops` が記録される（再実行はスキップ）。コミットとプッシュが必要。
- 通常の登録（`publish`）は、登録済みの案件には使えない（保存先のフォルダがあると、上書きを避けて止まる）。

### DIS: Notion本文の「Sectionごとの全体図」

- `--stage crop` を実行すると、切り出し画像（`sections_by_unit/`）に加えて、ラベル（番号と種類）つきの全体図を1枚作る: `02_Notion_Images/<ID>_PC_units_notion.jpg`（例: `01 FV`、`02 共感`、`03 ベネフィット`）。
- 各Unitは、PCの切り出しがあればPC、なければSP（ラベルに「（SP）」）。4列に積み、5MB未満のJPEGに収める。
- 登録（`publish`）では、この全体図があれば、Notionの本文に載せる画像は、これ1枚だけ（Dropboxの `02_Notion_Images/` にも入る）。なければ（`roleType`・`regions` のない旧形式の案件）、従来の4枚（PC・SPのファーストビューとセクション一覧）。
- 登録済みの案件のNotionページは、変更しない。

### DIS と CBS のつながり（ナレッジ化 → インデックス → Sectionの型）

流れ（外部への書込みはなし。CBS本体への実同期は、ユーザーが確認してから、別工程で行う）:

1. **下書き**: `npm run dis:cbs-draft -- --id DIS-WB-0001 [--tags <タグのJSON>]`。LP・Web・バナーに対応。案件フォルダに `cbs-knowledge-draft.json` を作る（LPは28章の下書き `lp28-seed.md` も）。IDは、**全媒体とも、ライブラリー番号（`LP-nnnn`／`BN-nnnn`／`WB-nnnn`）が主**（CBSの鍵）。DISの番号は、`dis_ids` に持つ。ライブラリー番号は、`data/dis-relations.json`（DISの番号との対応）で決める。Web・バナーにも、ライブラリー（Notion・Dropbox）に既存のデータがある（バナーは `BN-0048`、Webは `WB-0068` まで使用済み。`data/id-counters.json`）ため、DISの番号を代わりのIDにはしない（同じ作品が2件になるため）。対応がない場合は、`--place` はできない。
2. **配置**: 同じコマンドに `--place` を付けると、`knowledge/<lp|web|banner>/<ID>.json` に、新規のみ配置する（上書きしない）。配置の条件は、IDがある／訴求・タグが確定している（LPは `--tags` に `primary_appeal` などを書く）／検証を通る（LPは `knowledge:validate-lp`）／`cbs_sync` が下書き・未同期。
3. **インデックス**: `npm run cbs:export` で、`exports/creative-brief-studio-ai/` を更新する。`index.json` の各件に、DISの層（`disId`・`disEvaluation`＝9軸の点数・`sectionTypes`・`sections`・`reusablePrinciples`・`rightsExcluded`・`cbsSyncStatus`）が入る。旧形式のナレッジ（`LP-0215`）は、そのまま扱える。
4. **Sectionの型の索引**: 同じ `cbs:export` が、`section-patterns.json` を作る。Sectionの種類（FV・悩み提起・共感・解決策・ベネフィット・特徴・実績・比較・商品紹介・料金・流れ・FAQ・CTA・会社情報・ナビ・フッター・その他）ごとに、各ナレッジの該当Section（名前・再利用できる構造・差し替え必須の要素）を集める。`controlled=false` は、旧来の自由な役割名（例: `price_anxiety_reduction_hero`）。
5. **評価点は混ぜない**: DISの9軸（各1〜5点）と、28章のヒューリスティック（/100）は、別の物差し。足したり平均したりしない。
6. **未実施**: Notionの、LPライブラリーの既存ページとDISのページの関連付け（リレーション）・CBS同期状態の更新は、Notionの既存の設定・ページを変更するため、ユーザーの許可を得てから行う。

### DIS: ライブラリー番号の確保・対応づけ（`dis:reserve-id`）

DISの案件を、ライブラリーの番号（`LP-nnnn`／`BN-nnnn`／`WB-nnnn`）と対応づける。ローカルのファイルのみを更新する（Notion・Dropbox・CBSには書かない）。既定はドライラン。

```bash
# ライブラリーに同じ作品がすでにある（既存の番号を使う。新しい番号は取らない）
npm run dis:reserve-id -- --id DIS-BN-20261107 --same-as BN-0012 [--library-page <NotionのページID>]
# ライブラリー未登録（次の番号を確保する）
npm run dis:reserve-id -- --id DIS-WB-20261107 --reserve [--source-url <掲載元の詳細ページ>]
# 書込み（ドライランで内容を確認してから）
npm run dis:reserve-id -- --id DIS-WB-20261107 --reserve --apply
```

- 更新するファイル: `data/dis-relations.json`（対応表。追記のみ）。`--reserve` のときは、加えて `data/id-counters.json`（`existingMax`・`nextNumber` を1つ進める）と、予約ファイル（LPは `candidates/lp-archive/intake-reservations.json`、バナー・Webは `candidates/non-lp/intake-reservations.json`）。
- 既存の番号・既存の対応は変更しない。すでに対応表にあるDISのID、存在しない既存番号（`--same-as`）、形式の違う番号は拒否する。
- 書込み後は、これらのファイルをコミットしてプッシュする。そのあと、`dis:cbs-draft` で下書きを作り、`--place` で `knowledge/` に配置する。

### DIS: 旧形式（日付のID）の登録済み案件を、ナレッジ化する（`dis:draft-legacy`）

最初に登録した6件（`DIS-LP-20261107` など）は、日付形式のIDで、v2分析（`candidates/dis/<日付>/<ID>.v2.analysis.json`）がある。Macの案件フォルダが無くても、v2分析・台帳・対応表から、CBS用ナレッジの下書きを作る。

```bash
npm run dis:draft-legacy -- --id DIS-WB-20261107            # 内容の表示のみ（書かない）
npm run dis:draft-legacy -- --id DIS-WB-20261107 --place    # knowledge/web/WB-0069.json に新規配置（上書きしない）
```

- 前提: `dis:reserve-id` で、ライブラリー番号の対応がある（IDは、そのライブラリー番号）。
- Sectionの種類は、`scripts/dis/migration/roletypes.json` を重ねる（元のv2分析は変えない）。バナーは、セクションではなく要素の構成のため、CTA・ベネフィット以外は「その他」。
- タグは、v2分析の `notionProps`（サイト種別・配色・レイアウトなど）から作る。訴求（`primary_appeal`）は、DISの要約の先頭。
- 配置済み: `BN-0049`・`BN-0050`・`WB-0069`・`WB-0070`。LP（`LP-0248`・`LP-0249`）は、28章で訴求・タグを確定してから配置する。
- CBS本体への同期はしない（`cbs_sync` は下書き・未同期のまま）。インデックスの更新は `npm run cbs:export`。
