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

## このリポジトリでの実装

コマンド・ファイル構成・スキーマ（dis-2.0）・日次運用の手順は [実装メモ](references/implementation-notes.md) を読む。
