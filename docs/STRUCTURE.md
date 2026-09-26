# 構成ルール

## IDルール

| 種別 | ID形式 |
| --- | --- |
| LP | `LP-0001` |
| Banner | `BN-0001` |
| Web | `WEB-0001` |
| Graphic | `GR-0001` |
| Parts | `PT-0001` |
| Patterns | `PATTERN-0001` |

## GitHub内の保存先

```text
knowledge/lp/
knowledge/banner/
knowledge/web/
knowledge/graphic/
knowledge/parts/
knowledge/patterns/
```

Creative Brief Studio AIへ渡す同期用データは、以下にまとめます。

```text
exports/creative-brief-studio-ai/
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

重要なのは `captureUrl` と `sourceDetailUrl` です。LPアーカイブなどの参考元を使う場合は、トップページURLだけでなく、撮影時に参照した個別詳細ページURLを残します。

## Dropboxとの対応

| GitHub | Dropbox |
| --- | --- |
| `knowledge/lp/` | `LP_Research_Library/01_Master/` |
| `knowledge/banner/` | `Banner_Research_Library/01_Master/` |
| `knowledge/web/` | `Web_Research_Library/01_Master/` |
| `knowledge/graphic/` | `Graphic_Research_Library/01_Master/` |
| `knowledge/parts/` | `Parts_Research_Library/01_Master/` |
| `knowledge/patterns/` | `Design_Research_System/01_Master/` |
