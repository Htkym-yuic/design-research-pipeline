# DIS分析パック（schema `dis-1.0`）

検証コード: `scripts/dis/lib/analysis-schema.mjs`（`npm run dis:run -- --stage validate`）。

必須:
- `summary` / `selectionReason`（なぜ今日この1件か）
- `units[]`: 全Section/Unit。`name` `observation` `annotation` 必須、`sectionRef`（位置）推奨
- `axes[]`: 9軸ちょうど。`score`(1-5) `evidence` `confidence`(high|medium|low) `unverified` 必須（なければ「なし」）
  - 情報設計 / 視線誘導 / タイポグラフィ / 配色 / 余白・レイアウト / CTA・導線 / 信頼性・根拠 / ブランド一貫性 / 再現性
- `actions`: `top`=1件、`priority`≥1、`ideas`≥1
- `reproduction`: Canva / Photoshop / Elementor 各≥1手順（Elementorは標準Container/Widget中心）
- `rightsNotes`: 未確認事項と転用しない要素
- 禁止: ロゴ・人物・写真・コピー・価格・実績値の転用フィールド
- 画像から確認できないことは推測と明記。実測値として書かない。
