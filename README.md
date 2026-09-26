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

初期状態では、GitHub Actionsに手動実行と毎日実行の入口を用意しています。

現在は `data/targets.json` に登録した撮影対象を、PC / SP のファーストビューで撮影するテストを行います。

`data/reference-sources.json` は参考元サイト一覧、`data/targets.json` は実際にスクリーンショットを撮る対象URL一覧です。LPアーカイブなどの参考元を使う場合も、トップページだけでなく、撮影時に見ていた個別詳細ページURLを `sourceDetailUrl` に残します。

LPアーカイブは、一覧ページそのものではなく、一覧から個別LP候補を抽出します。候補は `candidates/lp-archive/candidates.json` に出力します。

実際のスクリーンショット取得、Dropbox保存、Notion登録、Creative Brief Studio AI同期には、各サービスの接続情報をGitHub Secretsへ安全に登録してから処理を追加します。

## 公開範囲

このリポジトリはprivate運用を前提にします。調査元URL、分析メモ、連携設定、将来的なAPI連携情報を扱うためです。
