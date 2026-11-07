# 選定基準（原本: 13/18点以上）

6項目×0〜3点＝18点満点。**合計13点以上**の候補だけが選ばれる。基準を満たす候補がなければ、その媒体はスキップする。

| 項目（key） | 見るところ | 0 | 3 |
|---|---|---|---|
| 構成の明快さ（clarity） | 情報の優先順位が一目で分かる | 不明 | 非常に明快 |
| 独自性・再発見性（uniqueness） | 既存ライブラリー・過去登録にない型や技法 | 重複的 | 新しい発見 |
| 再現可能性（reproducibility） | Canva/Photoshop/Elementorで構造を応用できる | 専用素材に依存 | 容易 |
| 実務との近さ（practicality） | 中小の事業・店舗・採用・EC・キャンペーンなど、案件で使う場面に近い | 遠い | 近い |
| 資料の十分さ（materials） | PC/SP・実寸の撮影が可能で、全体が確認できる | 不可 | 十分 |
| 出典・取得の健全さ（sourcing） | 実ページ/原典が明確で、公開ページから通常の方法で取得できた | 不明 | 明確 |

- `--stage review` が作る `review.json` の `suggested`（materials・sourcing）は目安。人が上書きしてよい。
- `learning.json`: `{"items":[{"no":1,"criteria":{"clarity":3,"uniqueness":2,"reproducibility":2,"practicality":3,"materials":3,"sourcing":3},"reason":"…"}]}`。6項目すべてと理由が必須。
- 見えないことは推測せず、理由に「未確認」と書く。画像が取れない候補（空欄）は、見えない項目を0〜1にする。
- 評価したら `--stage rescore`。合計の高い順に選ばれ、同点は機械的なスコア→日替わりの乱数。公開（publish）は、選定済みの候補が13点以上でないとできない。
