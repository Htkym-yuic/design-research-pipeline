# 構成ルール

## IDルール

| 種別 | ID形式 |
| --- | --- |
| LP | `LP-0001` |
| Banner | `BN-0001` |
| Web | `WB-0001` |
| Graphic | `GR-0001` |
| Parts | `PT-0001` |
| Patterns | `PAT-0001` |
| Web App / UI | `UI-0001` |
| Canva | `CV-0001` |
| Asset | `ASSET-0001` / `PHAC-0001` / `ILAC-0001` 等 |

## GitHub内の保存先

```text
knowledge/lp/
knowledge/banner/
knowledge/web/
knowledge/graphic/
knowledge/parts/
knowledge/patterns/
knowledge/ui/
knowledge/canva/
knowledge/assets/
```

Creative Brief Studio AIへ渡す同期用データは、以下にまとめます。

```text
exports/creative-brief-studio-ai/
```

候補抽出結果は、正式登録前の確認用として以下に保存します。

```text
candidates/
└── lp-archive/
    └── candidates.json
```

## URL項目

撮影対象は `data/targets.json` で管理します。

| 項目 | 意味 |
| --- | --- |
| `captureUrl` | 実際にスクリーンショットを撮ったURL |
| `sourceType` | `Reference Site` / `Direct` / `Search` / `SNS` / `Client` / `Manual` / `Unknown` |
| `sourceName` | LPアーカイブ、SANKOU!、Google検索など |
| `sourceUrl` | 参考元サービスや参考元サイトのURL |
| `sourceDetailUrl` | 参考元内の詳細ページURL |
| `hideSelectors` | 撮影時に非表示にする広告・不要要素のCSSセレクタ |

重要なのは `captureUrl` と `sourceDetailUrl` です。LPアーカイブなどの参考元を使う場合は、トップページURLだけでなく、撮影時に参照した個別詳細ページURLを残します。

## 採番

Notionに既に存在する最大IDの次から採番します。

LPは現時点で `LP-0213` まで存在するため、新規候補は `LP-0214` から開始します。この設定は `data/id-counters.json` で管理します。

## Dropboxとの対応

| GitHub | Dropbox |
| --- | --- |
| `knowledge/lp/` | `LP_Research_Library/01_Master/` |
| `knowledge/banner/` | `Banner_Research_Library/01_Master/` |
| `knowledge/web/` | `Web_Research_Library/01_Master/` |
| `knowledge/graphic/` | `Graphic_Research_Library/01_Master/` |
| `knowledge/parts/` | `Parts_Research_Library/01_Master/` |
| `knowledge/patterns/` | `Design_Research_System/01_Master/` |
