# design-research-pipeline

Creative Brief Studio AIとは分離して運用する、デザインリサーチ用パイプラインです。

このリポジトリでは、LP / Banner / Web / Graphic / Parts / Patterns の参考収集、スクリーンショット取得、分析、Dropbox / Notion連携、そして最終的なCreative Brief Studio AIへのナレッジ同期を行う予定です。

## 目的

- デザイン参考の収集と一次資料管理
- PC / SP のスクリーンショット取得
- レイアウト、情報設計、CTA、配色、タイポグラフィ、再利用パターンの分析
- Dropboxへの画像・素材保存
- Notionへの人が読む分析結果の登録
- Creative Brief Studio AIが利用できる構造化ナレッジの生成
- Creative Brief Studio AI側への同期

## 対象ライブラリ

| 種別 | ID例 | Notion | Dropbox |
| --- | --- | --- | --- |
| LP | `LP-0001` | `01｜LPリサーチライブラリー` | `LP_Research_Library` |
| Banner | `BN-0001` | `02｜バナーリサーチライブラリー` | `Banner_Research_Library` |
| Web | `WEB-0001` | `03｜Webサイトリサーチライブラリー` | `Web_Research_Library` |
| Graphic | `GR-0001` | `04｜グラフィックデザインリサーチライブラリー` | `Graphic_Research_Library` |
| Parts | `PT-0001` | `05｜デザインパーツライブラリ` | `Parts_Research_Library` |
| Patterns | `PATTERN-0001` | `06｜デザイン原則・パターン` | `Design_Research_System` |

## 連携先

- Dropbox正本ルート: `/design/Design_Research_Library/`
- Notion管理ページ: `02｜デザインリサーチ`
- GitHubナレッジ出力: `knowledge/`
- Creative Brief Studio AI同期用出力: `exports/creative-brief-studio-ai/`

## ディレクトリ

```text
.
├── .github/workflows/
├── candidates/
├── data/
├── docs/
├── exports/
│   └── creative-brief-studio-ai/
├── knowledge/
│   ├── lp/
│   ├── banner/
│   ├── web/
│   ├── graphic/
│   ├── parts/
│   └── patterns/
└── scripts/
```

## 定期実行

`.github/workflows/design-research-daily.yml` が、GitHub Actions上で毎日01:30 JSTに自動実行されます（`workflow_dispatch`での手動実行も可能）。Macを起動する必要はありません。

夜中に収集とラフ分析を進め、朝4:00〜4:30頃までに確認できる状態を目指します。

現在自動化されているのはLPのみです。日次で以下を行います。

1. LPアーカイブから新規候補を抽出する（`data/id-counters.json` で採番）
2. 抽出した候補をPC/SPで撮影する
3. Dropboxの `99_Needs_Review/<日付>/daily-intake-<開始ID>-<終了ID>/` へ正本画像・Notion用軽量画像を保存する
4. Notionの「01｜LPリサーチライブラリー」へ軽量分析ページを新規作成・更新する

詳細な設定手順（必要なGitHub Secrets / Variables、DRY_RUNモードの使い方等）は [`docs/OPERATIONS.md`](docs/OPERATIONS.md) の「自動化（GitHub Actions）」を参照してください。

`data/reference-sources.json` は参考元サイト一覧、`data/targets.json` は実際にスクリーンショットを撮る対象URL一覧です。LPアーカイブなどの参考元を使う場合も、トップページだけでなく、撮影時に見ていた個別詳細ページURLを `sourceDetailUrl` に残します。

LPアーカイブは、一覧ページそのものではなく、一覧から個別LP候補を抽出します。候補は `candidates/lp-archive/candidates.json` に出力します。LP候補IDは `data/id-counters.json` で管理し、日次実行では抽出後に次回開始番号を進めて重複を防ぎます。既存候補や同期済みナレッジと同じURLが出た場合は、その候補をスキップして次の未登録候補を繰り上げます。

バナー・Web・グラフィック・パーツ・パターンの自動収集、および Creative Brief Studio AI への同期は、まだこのワークフローには含まれていません（`docs/OPERATIONS.md` の「現時点でまだ自動化していないこと」を参照）。

## 公開範囲

このリポジトリはprivate運用を前提にします。調査元URL、分析メモ、連携設定、将来的なAPI連携情報を扱うためです。
