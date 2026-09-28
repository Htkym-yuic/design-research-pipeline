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
8. `npm run collect:non-lp`以降で、バナー・Web・グラフィック・パーツ・Canva・素材候補を収集、撮影、軽量分析、Dropbox/Notion登録する。新規パーツ候補は05へ登録し、旧パーツ514件は99配下の再分析待ちDBで保管する
9. `npm run report:daily:summary` — GitHub ActionsのStep SummaryへLP・非LPの結果（失敗があればその内容）を出力する
10. 候補・撮影結果・Dropboxアップロード結果・Notion登録結果をGitHub Artifactとして保存する（`if-no-files-found: warn` のため、途中で失敗しても直前までの結果は残る）

候補1件の処理に失敗しても、他の候補の処理は継続する（各スクリプト内で候補単位にtry/catchしている）。

### DRY_RUNモード

- `DRY_RUN=true`（既定）：Dropbox/Notionへ実際には書き込まず、書き込み予定の内容だけを`dropbox-upload-result.json` / `notion-registration-result.json`へ出力する。
- `DRY_RUN=false`：実際にDropboxへアップロードし、Notionへページを作成・更新する。
- 手動実行（`workflow_dispatch`）では毎回選べる。スケジュール実行はリポジトリVariable `DRY_RUN` の値に従う（未設定なら`true`のまま）。**本番反映する場合は、Variable `DRY_RUN` を`false`に変更すること。**
- 非LPだけを個別検証するときは、`non_lp_source_filter` に `illustrationAc`、`photoAc`、`parts` などのsource keyを指定する。AC系は素材をダウンロードせず、ID、正式な素材ページURL、検索語、作者プロフィールURLのみを保存する。
- 写真AC・イラストACの検索語は、ビジネス、美容、医療、介護、教育、飲食、EC・物販、住宅、士業、採用、家族、シニア、テクノロジー、自然・地域をJSTの日付で循環する。`RESEARCH_DATE_JST=YYYY-MM-DD`で検証日を固定できる。
- 写真AC・イラストACはGitHubホストランナーのIPにCloudFront 403を返す場合がある。その場合は`blocked`として報告し、同じ収集コードをローカルMacで実行する。アクセス制限の迂回は行わない。
- Parts.はトップページだけでなく過去ページも走査し、予約済みURLを除外して新規候補を探す。当日の実例から、根拠ID付きのデザイン原則・パターンを最大`DAILY_PATTERN_LIMIT`件生成する。

### 現時点でまだ自動化していないこと

- Creative Brief Studio AIへの同期（`npm run knowledge:apply`等）は対象外。Notionへの軽量分析ページ登録までがこのワークフローの範囲。
- LP-0180・LP-0215と同じ29項目の詳細分析（週末レビューで人が選んだ候補のみ、別途手動で実施する）。
- 画像理解を伴う最終的な意味判断。日次は自動一次分析までとし、コピー、正確な訴求分類、パーツ境界、原則の妥当性は週末レビューで確認する。
- DropboxやNotion内の既存資産の移動・削除。
