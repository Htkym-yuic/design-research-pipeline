# デザインリサーチ 分析依頼（2026-10-11）

このMarkdownは、GitHub Actionsが自動収集した候補のうち、まだ深い分析をしていないものを
ChatGPT / Claude に貼り付けて分析してもらうための依頼文です。OpenAI/Anthropic APIの
呼び出しは行わず、人がこの内容をコピーしてチャットへ貼り付けることを前提にしています。

## 使い方

1. このファイル全体をChatGPT（またはClaude）に貼り付ける。
2. 候補ごとに回答してもらった分析結果を確認する。
3. Claude Codeに「このMarkdownと回答を渡すので knowledge/<media>/<ID>.json へ反映して」と依頼する。
4. Note記事化の観点で良い案が出たら `outputs/note-drafts/` へタイトル案・メモとして残す。
5. 変更はPRで確認する（mainへの直接pushはしない）。

候補件数: 20件

## 素材探索（20件）

### 候補ID: ILAC-0114

- 媒体種別: 素材探索
- タイトル: ボランティア活動 ボランティア
- URL: https://www.ac-illust.com/main/detail.php?id=22104090
- 参考元URL（詳細）: https://www.ac-illust.com/main/detail.php?id=22104090
- スクリーンショット: 保存なし（メタ情報のみ）
- 参考元: イラストAC
- 取得日: 2026-10-11
- 軽量分析の概要: イラストACから収集したAsset参考。ボランティア活動 ボランティア。
- 軽量分析（配色・サイズ）: メタ情報のみ。340×340の掲載画像を基準に確認。

#### 分析してほしい観点

- 構図・情報優先順位・視線誘導（Z型/F型等）
- 配色・コントラスト・タイポグラフィの特徴
- 再利用できる構造・パターン（他業種に転用する際の注意点も含めて）
- 権利上の注意点（素材・コピー・ロゴ等、直接模倣してはいけない部分）
- 検索語・用途適合性（素材自体の権利は転載しないこと前提）

#### CBS（Creative Brief Studio AI）用JSONでほしい項目

- id / mediaType / title
- industry_tags / color_tags / layout_tags / copy_types（既存のknowledge/lp/*.jsonと同じ語彙系）
- primary_appeal（主訴求とその理由）
- reusable_principles（他案件に転用できる原則。配列）
- rights_excluded（直接模倣してはいけない要素。配列）
- source（captureUrl / sourceUrl / sourceDetailUrl）
- 媒体が素材探索であることを踏まえた、その媒体特有の追加項目があれば提案してほしい

#### Note記事化の観点

- この事例から得られる学び・発見は何か（タイトル案も1つ提示してほしい）
- 既出のネタと重複していないか（新規性があるか）
- 誰向けの記事になりそうか（制作者・担当者・経営者 等）

### 候補ID: ILAC-0115

- 媒体種別: 素材探索
- タイトル: 手03
- URL: https://www.ac-illust.com/main/detail.php?id=1360153
- 参考元URL（詳細）: https://www.ac-illust.com/main/detail.php?id=1360153
- スクリーンショット: 保存なし（メタ情報のみ）
- 参考元: イラストAC
- 取得日: 2026-10-11
- 軽量分析の概要: イラストACから収集したAsset参考。手03。
- 軽量分析（配色・サイズ）: メタ情報のみ。476×340の掲載画像を基準に確認。

#### 分析してほしい観点

- 構図・情報優先順位・視線誘導（Z型/F型等）
- 配色・コントラスト・タイポグラフィの特徴
- 再利用できる構造・パターン（他業種に転用する際の注意点も含めて）
- 権利上の注意点（素材・コピー・ロゴ等、直接模倣してはいけない部分）
- 検索語・用途適合性（素材自体の権利は転載しないこと前提）

#### CBS（Creative Brief Studio AI）用JSONでほしい項目

- id / mediaType / title
- industry_tags / color_tags / layout_tags / copy_types（既存のknowledge/lp/*.jsonと同じ語彙系）
- primary_appeal（主訴求とその理由）
- reusable_principles（他案件に転用できる原則。配列）
- rights_excluded（直接模倣してはいけない要素。配列）
- source（captureUrl / sourceUrl / sourceDetailUrl）
- 媒体が素材探索であることを踏まえた、その媒体特有の追加項目があれば提案してほしい

#### Note記事化の観点

- この事例から得られる学び・発見は何か（タイトル案も1つ提示してほしい）
- 既出のネタと重複していないか（新規性があるか）
- 誰向けの記事になりそうか（制作者・担当者・経営者 等）

### 候補ID: ILAC-0116

- 媒体種別: 素材探索
- タイトル: ハートを持つ女性 ハート
- URL: https://www.ac-illust.com/main/detail.php?id=22457750
- 参考元URL（詳細）: https://www.ac-illust.com/main/detail.php?id=22457750
- スクリーンショット: 保存なし（メタ情報のみ）
- 参考元: イラストAC
- 取得日: 2026-10-11
- 軽量分析の概要: イラストACから収集したAsset参考。ハートを持つ女性 ハート。
- 軽量分析（配色・サイズ）: メタ情報のみ。240×340の掲載画像を基準に確認。

#### 分析してほしい観点

- 構図・情報優先順位・視線誘導（Z型/F型等）
- 配色・コントラスト・タイポグラフィの特徴
- 再利用できる構造・パターン（他業種に転用する際の注意点も含めて）
- 権利上の注意点（素材・コピー・ロゴ等、直接模倣してはいけない部分）
- 検索語・用途適合性（素材自体の権利は転載しないこと前提）

#### CBS（Creative Brief Studio AI）用JSONでほしい項目

- id / mediaType / title
- industry_tags / color_tags / layout_tags / copy_types（既存のknowledge/lp/*.jsonと同じ語彙系）
- primary_appeal（主訴求とその理由）
- reusable_principles（他案件に転用できる原則。配列）
- rights_excluded（直接模倣してはいけない要素。配列）
- source（captureUrl / sourceUrl / sourceDetailUrl）
- 媒体が素材探索であることを踏まえた、その媒体特有の追加項目があれば提案してほしい

#### Note記事化の観点

- この事例から得られる学び・発見は何か（タイトル案も1つ提示してほしい）
- 既出のネタと重複していないか（新規性があるか）
- 誰向けの記事になりそうか（制作者・担当者・経営者 等）

### 候補ID: ILAC-0117

- 媒体種別: 素材探索
- タイトル: 介護ロボット ai
- URL: https://www.ac-illust.com/main/detail.php?id=1479386
- 参考元URL（詳細）: https://www.ac-illust.com/main/detail.php?id=1479386
- スクリーンショット: 保存なし（メタ情報のみ）
- 参考元: イラストAC
- 取得日: 2026-10-11
- 軽量分析の概要: イラストACから収集したAsset参考。介護ロボット ai。
- 軽量分析（配色・サイズ）: メタ情報のみ。340×340の掲載画像を基準に確認。

#### 分析してほしい観点

- 構図・情報優先順位・視線誘導（Z型/F型等）
- 配色・コントラスト・タイポグラフィの特徴
- 再利用できる構造・パターン（他業種に転用する際の注意点も含めて）
- 権利上の注意点（素材・コピー・ロゴ等、直接模倣してはいけない部分）
- 検索語・用途適合性（素材自体の権利は転載しないこと前提）

#### CBS（Creative Brief Studio AI）用JSONでほしい項目

- id / mediaType / title
- industry_tags / color_tags / layout_tags / copy_types（既存のknowledge/lp/*.jsonと同じ語彙系）
- primary_appeal（主訴求とその理由）
- reusable_principles（他案件に転用できる原則。配列）
- rights_excluded（直接模倣してはいけない要素。配列）
- source（captureUrl / sourceUrl / sourceDetailUrl）
- 媒体が素材探索であることを踏まえた、その媒体特有の追加項目があれば提案してほしい

#### Note記事化の観点

- この事例から得られる学び・発見は何か（タイトル案も1つ提示してほしい）
- 既出のネタと重複していないか（新規性があるか）
- 誰向けの記事になりそうか（制作者・担当者・経営者 等）

### 候補ID: ILAC-0118

- 媒体種別: 素材探索
- タイトル: ボランティア ボランティア
- URL: https://www.ac-illust.com/main/detail.php?id=22677208
- 参考元URL（詳細）: https://www.ac-illust.com/main/detail.php?id=22677208
- スクリーンショット: 保存なし（メタ情報のみ）
- 参考元: イラストAC
- 取得日: 2026-10-11
- 軽量分析の概要: イラストACから収集したAsset参考。ボランティア ボランティア。
- 軽量分析（配色・サイズ）: メタ情報のみ。340×340の掲載画像を基準に確認。

#### 分析してほしい観点

- 構図・情報優先順位・視線誘導（Z型/F型等）
- 配色・コントラスト・タイポグラフィの特徴
- 再利用できる構造・パターン（他業種に転用する際の注意点も含めて）
- 権利上の注意点（素材・コピー・ロゴ等、直接模倣してはいけない部分）
- 検索語・用途適合性（素材自体の権利は転載しないこと前提）

#### CBS（Creative Brief Studio AI）用JSONでほしい項目

- id / mediaType / title
- industry_tags / color_tags / layout_tags / copy_types（既存のknowledge/lp/*.jsonと同じ語彙系）
- primary_appeal（主訴求とその理由）
- reusable_principles（他案件に転用できる原則。配列）
- rights_excluded（直接模倣してはいけない要素。配列）
- source（captureUrl / sourceUrl / sourceDetailUrl）
- 媒体が素材探索であることを踏まえた、その媒体特有の追加項目があれば提案してほしい

#### Note記事化の観点

- この事例から得られる学び・発見は何か（タイトル案も1つ提示してほしい）
- 既出のネタと重複していないか（新規性があるか）
- 誰向けの記事になりそうか（制作者・担当者・経営者 等）

### 候補ID: ILAC-0119

- 媒体種別: 素材探索
- タイトル: 介護するロボット ai
- URL: https://www.ac-illust.com/main/detail.php?id=22644968
- 参考元URL（詳細）: https://www.ac-illust.com/main/detail.php?id=22644968
- スクリーンショット: 保存なし（メタ情報のみ）
- 参考元: イラストAC
- 取得日: 2026-10-11
- 軽量分析の概要: イラストACから収集したAsset参考。介護するロボット ai。
- 軽量分析（配色・サイズ）: メタ情報のみ。453×340の掲載画像を基準に確認。

#### 分析してほしい観点

- 構図・情報優先順位・視線誘導（Z型/F型等）
- 配色・コントラスト・タイポグラフィの特徴
- 再利用できる構造・パターン（他業種に転用する際の注意点も含めて）
- 権利上の注意点（素材・コピー・ロゴ等、直接模倣してはいけない部分）
- 検索語・用途適合性（素材自体の権利は転載しないこと前提）

#### CBS（Creative Brief Studio AI）用JSONでほしい項目

- id / mediaType / title
- industry_tags / color_tags / layout_tags / copy_types（既存のknowledge/lp/*.jsonと同じ語彙系）
- primary_appeal（主訴求とその理由）
- reusable_principles（他案件に転用できる原則。配列）
- rights_excluded（直接模倣してはいけない要素。配列）
- source（captureUrl / sourceUrl / sourceDetailUrl）
- 媒体が素材探索であることを踏まえた、その媒体特有の追加項目があれば提案してほしい

#### Note記事化の観点

- この事例から得られる学び・発見は何か（タイトル案も1つ提示してほしい）
- 既出のネタと重複していないか（新規性があるか）
- 誰向けの記事になりそうか（制作者・担当者・経営者 等）

### 候補ID: ILAC-0120

- 媒体種別: 素材探索
- タイトル: 少し先の未来たち ai
- URL: https://www.ac-illust.com/main/detail.php?id=2017685
- 参考元URL（詳細）: https://www.ac-illust.com/main/detail.php?id=2017685
- スクリーンショット: 保存なし（メタ情報のみ）
- 参考元: イラストAC
- 取得日: 2026-10-11
- 軽量分析の概要: イラストACから収集したAsset参考。少し先の未来たち ai。
- 軽量分析（配色・サイズ）: メタ情報のみ。335×340の掲載画像を基準に確認。

#### 分析してほしい観点

- 構図・情報優先順位・視線誘導（Z型/F型等）
- 配色・コントラスト・タイポグラフィの特徴
- 再利用できる構造・パターン（他業種に転用する際の注意点も含めて）
- 権利上の注意点（素材・コピー・ロゴ等、直接模倣してはいけない部分）
- 検索語・用途適合性（素材自体の権利は転載しないこと前提）

#### CBS（Creative Brief Studio AI）用JSONでほしい項目

- id / mediaType / title
- industry_tags / color_tags / layout_tags / copy_types（既存のknowledge/lp/*.jsonと同じ語彙系）
- primary_appeal（主訴求とその理由）
- reusable_principles（他案件に転用できる原則。配列）
- rights_excluded（直接模倣してはいけない要素。配列）
- source（captureUrl / sourceUrl / sourceDetailUrl）
- 媒体が素材探索であることを踏まえた、その媒体特有の追加項目があれば提案してほしい

#### Note記事化の観点

- この事例から得られる学び・発見は何か（タイトル案も1つ提示してほしい）
- 既出のネタと重複していないか（新規性があるか）
- 誰向けの記事になりそうか（制作者・担当者・経営者 等）

### 候補ID: ILAC-0121

- 媒体種別: 素材探索
- タイトル: 健康体操をする高齢者と介護スタッフ 健康体操
- URL: https://www.ac-illust.com/main/detail.php?id=2402211
- 参考元URL（詳細）: https://www.ac-illust.com/main/detail.php?id=2402211
- スクリーンショット: 保存なし（メタ情報のみ）
- 参考元: イラストAC
- 取得日: 2026-10-11
- 軽量分析の概要: イラストACから収集したAsset参考。健康体操をする高齢者と介護スタッフ 健康体操。
- 軽量分析（配色・サイズ）: メタ情報のみ。420×340の掲載画像を基準に確認。

#### 分析してほしい観点

- 構図・情報優先順位・視線誘導（Z型/F型等）
- 配色・コントラスト・タイポグラフィの特徴
- 再利用できる構造・パターン（他業種に転用する際の注意点も含めて）
- 権利上の注意点（素材・コピー・ロゴ等、直接模倣してはいけない部分）
- 検索語・用途適合性（素材自体の権利は転載しないこと前提）

#### CBS（Creative Brief Studio AI）用JSONでほしい項目

- id / mediaType / title
- industry_tags / color_tags / layout_tags / copy_types（既存のknowledge/lp/*.jsonと同じ語彙系）
- primary_appeal（主訴求とその理由）
- reusable_principles（他案件に転用できる原則。配列）
- rights_excluded（直接模倣してはいけない要素。配列）
- source（captureUrl / sourceUrl / sourceDetailUrl）
- 媒体が素材探索であることを踏まえた、その媒体特有の追加項目があれば提案してほしい

#### Note記事化の観点

- この事例から得られる学び・発見は何か（タイトル案も1つ提示してほしい）
- 既出のネタと重複していないか（新規性があるか）
- 誰向けの記事になりそうか（制作者・担当者・経営者 等）

### 候補ID: ILAC-0122

- 媒体種別: 素材探索
- タイトル: おばあさん おばあさん
- URL: https://www.ac-illust.com/main/detail.php?id=87482
- 参考元URL（詳細）: https://www.ac-illust.com/main/detail.php?id=87482
- スクリーンショット: 保存なし（メタ情報のみ）
- 参考元: イラストAC
- 取得日: 2026-10-11
- 軽量分析の概要: イラストACから収集したAsset参考。おばあさん おばあさん。
- 軽量分析（配色・サイズ）: メタ情報のみ。340×340の掲載画像を基準に確認。

#### 分析してほしい観点

- 構図・情報優先順位・視線誘導（Z型/F型等）
- 配色・コントラスト・タイポグラフィの特徴
- 再利用できる構造・パターン（他業種に転用する際の注意点も含めて）
- 権利上の注意点（素材・コピー・ロゴ等、直接模倣してはいけない部分）
- 検索語・用途適合性（素材自体の権利は転載しないこと前提）

#### CBS（Creative Brief Studio AI）用JSONでほしい項目

- id / mediaType / title
- industry_tags / color_tags / layout_tags / copy_types（既存のknowledge/lp/*.jsonと同じ語彙系）
- primary_appeal（主訴求とその理由）
- reusable_principles（他案件に転用できる原則。配列）
- rights_excluded（直接模倣してはいけない要素。配列）
- source（captureUrl / sourceUrl / sourceDetailUrl）
- 媒体が素材探索であることを踏まえた、その媒体特有の追加項目があれば提案してほしい

#### Note記事化の観点

- この事例から得られる学び・発見は何か（タイトル案も1つ提示してほしい）
- 既出のネタと重複していないか（新規性があるか）
- 誰向けの記事になりそうか（制作者・担当者・経営者 等）

### 候補ID: ILAC-0123

- 媒体種別: 素材探索
- タイトル: ボランティア活動 ボランティア
- URL: https://www.ac-illust.com/main/detail.php?id=2335465
- 参考元URL（詳細）: https://www.ac-illust.com/main/detail.php?id=2335465
- スクリーンショット: 保存なし（メタ情報のみ）
- 参考元: イラストAC
- 取得日: 2026-10-11
- 軽量分析の概要: イラストACから収集したAsset参考。ボランティア活動 ボランティア。
- 軽量分析（配色・サイズ）: メタ情報のみ。511×340の掲載画像を基準に確認。

#### 分析してほしい観点

- 構図・情報優先順位・視線誘導（Z型/F型等）
- 配色・コントラスト・タイポグラフィの特徴
- 再利用できる構造・パターン（他業種に転用する際の注意点も含めて）
- 権利上の注意点（素材・コピー・ロゴ等、直接模倣してはいけない部分）
- 検索語・用途適合性（素材自体の権利は転載しないこと前提）

#### CBS（Creative Brief Studio AI）用JSONでほしい項目

- id / mediaType / title
- industry_tags / color_tags / layout_tags / copy_types（既存のknowledge/lp/*.jsonと同じ語彙系）
- primary_appeal（主訴求とその理由）
- reusable_principles（他案件に転用できる原則。配列）
- rights_excluded（直接模倣してはいけない要素。配列）
- source（captureUrl / sourceUrl / sourceDetailUrl）
- 媒体が素材探索であることを踏まえた、その媒体特有の追加項目があれば提案してほしい

#### Note記事化の観点

- この事例から得られる学び・発見は何か（タイトル案も1つ提示してほしい）
- 既出のネタと重複していないか（新規性があるか）
- 誰向けの記事になりそうか（制作者・担当者・経営者 等）

### 候補ID: PHAC-0114

- 媒体種別: 素材探索
- タイトル: シニア男性にカウンセリングする理学療法士 リハビリ施設
- URL: https://www.photo-ac.com/main/detail/35053653
- 参考元URL（詳細）: https://www.photo-ac.com/main/detail/35053653
- スクリーンショット: 保存なし（メタ情報のみ）
- 参考元: 写真AC
- 取得日: 2026-10-11
- 軽量分析の概要: 写真ACから収集したAsset参考。シニア男性にカウンセリングする理学療法士 リハビリ施設。
- 軽量分析（配色・サイズ）: メタ情報のみ。511×340の掲載画像を基準に確認。

#### 分析してほしい観点

- 構図・情報優先順位・視線誘導（Z型/F型等）
- 配色・コントラスト・タイポグラフィの特徴
- 再利用できる構造・パターン（他業種に転用する際の注意点も含めて）
- 権利上の注意点（素材・コピー・ロゴ等、直接模倣してはいけない部分）
- 検索語・用途適合性（素材自体の権利は転載しないこと前提）

#### CBS（Creative Brief Studio AI）用JSONでほしい項目

- id / mediaType / title
- industry_tags / color_tags / layout_tags / copy_types（既存のknowledge/lp/*.jsonと同じ語彙系）
- primary_appeal（主訴求とその理由）
- reusable_principles（他案件に転用できる原則。配列）
- rights_excluded（直接模倣してはいけない要素。配列）
- source（captureUrl / sourceUrl / sourceDetailUrl）
- 媒体が素材探索であることを踏まえた、その媒体特有の追加項目があれば提案してほしい

#### Note記事化の観点

- この事例から得られる学び・発見は何か（タイトル案も1つ提示してほしい）
- 既出のネタと重複していないか（新規性があるか）
- 誰向けの記事になりそうか（制作者・担当者・経営者 等）

### 候補ID: PHAC-0115

- 媒体種別: 素材探索
- タイトル: 施設・デイサービスで働くケアマネージャー ケアマネージャー
- URL: https://www.photo-ac.com/main/detail/35053836
- 参考元URL（詳細）: https://www.photo-ac.com/main/detail/35053836
- スクリーンショット: 保存なし（メタ情報のみ）
- 参考元: 写真AC
- 取得日: 2026-10-11
- 軽量分析の概要: 写真ACから収集したAsset参考。施設・デイサービスで働くケアマネージャー ケアマネージャー。
- 軽量分析（配色・サイズ）: メタ情報のみ。511×340の掲載画像を基準に確認。

#### 分析してほしい観点

- 構図・情報優先順位・視線誘導（Z型/F型等）
- 配色・コントラスト・タイポグラフィの特徴
- 再利用できる構造・パターン（他業種に転用する際の注意点も含めて）
- 権利上の注意点（素材・コピー・ロゴ等、直接模倣してはいけない部分）
- 検索語・用途適合性（素材自体の権利は転載しないこと前提）

#### CBS（Creative Brief Studio AI）用JSONでほしい項目

- id / mediaType / title
- industry_tags / color_tags / layout_tags / copy_types（既存のknowledge/lp/*.jsonと同じ語彙系）
- primary_appeal（主訴求とその理由）
- reusable_principles（他案件に転用できる原則。配列）
- rights_excluded（直接模倣してはいけない要素。配列）
- source（captureUrl / sourceUrl / sourceDetailUrl）
- 媒体が素材探索であることを踏まえた、その媒体特有の追加項目があれば提案してほしい

#### Note記事化の観点

- この事例から得られる学び・発見は何か（タイトル案も1つ提示してほしい）
- 既出のネタと重複していないか（新規性があるか）
- 誰向けの記事になりそうか（制作者・担当者・経営者 等）

### 候補ID: PHAC-0116

- 媒体種別: 素材探索
- タイトル: シニア男性とケアマネージャーの男性 老人ホーム
- URL: https://www.photo-ac.com/main/detail/35053833
- 参考元URL（詳細）: https://www.photo-ac.com/main/detail/35053833
- スクリーンショット: 保存なし（メタ情報のみ）
- 参考元: 写真AC
- 取得日: 2026-10-11
- 軽量分析の概要: 写真ACから収集したAsset参考。シニア男性とケアマネージャーの男性 老人ホーム。
- 軽量分析（配色・サイズ）: メタ情報のみ。511×340の掲載画像を基準に確認。

#### 分析してほしい観点

- 構図・情報優先順位・視線誘導（Z型/F型等）
- 配色・コントラスト・タイポグラフィの特徴
- 再利用できる構造・パターン（他業種に転用する際の注意点も含めて）
- 権利上の注意点（素材・コピー・ロゴ等、直接模倣してはいけない部分）
- 検索語・用途適合性（素材自体の権利は転載しないこと前提）

#### CBS（Creative Brief Studio AI）用JSONでほしい項目

- id / mediaType / title
- industry_tags / color_tags / layout_tags / copy_types（既存のknowledge/lp/*.jsonと同じ語彙系）
- primary_appeal（主訴求とその理由）
- reusable_principles（他案件に転用できる原則。配列）
- rights_excluded（直接模倣してはいけない要素。配列）
- source（captureUrl / sourceUrl / sourceDetailUrl）
- 媒体が素材探索であることを踏まえた、その媒体特有の追加項目があれば提案してほしい

#### Note記事化の観点

- この事例から得られる学び・発見は何か（タイトル案も1つ提示してほしい）
- 既出のネタと重複していないか（新規性があるか）
- 誰向けの記事になりそうか（制作者・担当者・経営者 等）

### 候補ID: PHAC-0117

- 媒体種別: 素材探索
- タイトル: 笑顔の高齢者女性と介護士 訪問介護
- URL: https://www.photo-ac.com/main/detail/23261174
- 参考元URL（詳細）: https://www.photo-ac.com/main/detail/23261174
- スクリーンショット: 保存なし（メタ情報のみ）
- 参考元: 写真AC
- 取得日: 2026-10-11
- 軽量分析の概要: 写真ACから収集したAsset参考。笑顔の高齢者女性と介護士 訪問介護。
- 軽量分析（配色・サイズ）: メタ情報のみ。511×340の掲載画像を基準に確認。

#### 分析してほしい観点

- 構図・情報優先順位・視線誘導（Z型/F型等）
- 配色・コントラスト・タイポグラフィの特徴
- 再利用できる構造・パターン（他業種に転用する際の注意点も含めて）
- 権利上の注意点（素材・コピー・ロゴ等、直接模倣してはいけない部分）
- 検索語・用途適合性（素材自体の権利は転載しないこと前提）

#### CBS（Creative Brief Studio AI）用JSONでほしい項目

- id / mediaType / title
- industry_tags / color_tags / layout_tags / copy_types（既存のknowledge/lp/*.jsonと同じ語彙系）
- primary_appeal（主訴求とその理由）
- reusable_principles（他案件に転用できる原則。配列）
- rights_excluded（直接模倣してはいけない要素。配列）
- source（captureUrl / sourceUrl / sourceDetailUrl）
- 媒体が素材探索であることを踏まえた、その媒体特有の追加項目があれば提案してほしい

#### Note記事化の観点

- この事例から得られる学び・発見は何か（タイトル案も1つ提示してほしい）
- 既出のネタと重複していないか（新規性があるか）
- 誰向けの記事になりそうか（制作者・担当者・経営者 等）

### 候補ID: PHAC-0118

- 媒体種別: 素材探索
- タイトル: 在宅介護で食事をするシニアの女性 食事
- URL: https://www.photo-ac.com/main/detail/35059540
- 参考元URL（詳細）: https://www.photo-ac.com/main/detail/35059540
- スクリーンショット: 保存なし（メタ情報のみ）
- 参考元: 写真AC
- 取得日: 2026-10-11
- 軽量分析の概要: 写真ACから収集したAsset参考。在宅介護で食事をするシニアの女性 食事。
- 軽量分析（配色・サイズ）: メタ情報のみ。511×340の掲載画像を基準に確認。

#### 分析してほしい観点

- 構図・情報優先順位・視線誘導（Z型/F型等）
- 配色・コントラスト・タイポグラフィの特徴
- 再利用できる構造・パターン（他業種に転用する際の注意点も含めて）
- 権利上の注意点（素材・コピー・ロゴ等、直接模倣してはいけない部分）
- 検索語・用途適合性（素材自体の権利は転載しないこと前提）

#### CBS（Creative Brief Studio AI）用JSONでほしい項目

- id / mediaType / title
- industry_tags / color_tags / layout_tags / copy_types（既存のknowledge/lp/*.jsonと同じ語彙系）
- primary_appeal（主訴求とその理由）
- reusable_principles（他案件に転用できる原則。配列）
- rights_excluded（直接模倣してはいけない要素。配列）
- source（captureUrl / sourceUrl / sourceDetailUrl）
- 媒体が素材探索であることを踏まえた、その媒体特有の追加項目があれば提案してほしい

#### Note記事化の観点

- この事例から得られる学び・発見は何か（タイトル案も1つ提示してほしい）
- 既出のネタと重複していないか（新規性があるか）
- 誰向けの記事になりそうか（制作者・担当者・経営者 等）

### 候補ID: PHAC-0119

- 媒体種別: 素材探索
- タイトル: 車椅子に乗ったシニア女性と介助する夫婦 介護
- URL: https://www.photo-ac.com/main/detail/34942387
- 参考元URL（詳細）: https://www.photo-ac.com/main/detail/34942387
- スクリーンショット: 保存なし（メタ情報のみ）
- 参考元: 写真AC
- 取得日: 2026-10-11
- 軽量分析の概要: 写真ACから収集したAsset参考。車椅子に乗ったシニア女性と介助する夫婦 介護。
- 軽量分析（配色・サイズ）: メタ情報のみ。511×340の掲載画像を基準に確認。

#### 分析してほしい観点

- 構図・情報優先順位・視線誘導（Z型/F型等）
- 配色・コントラスト・タイポグラフィの特徴
- 再利用できる構造・パターン（他業種に転用する際の注意点も含めて）
- 権利上の注意点（素材・コピー・ロゴ等、直接模倣してはいけない部分）
- 検索語・用途適合性（素材自体の権利は転載しないこと前提）

#### CBS（Creative Brief Studio AI）用JSONでほしい項目

- id / mediaType / title
- industry_tags / color_tags / layout_tags / copy_types（既存のknowledge/lp/*.jsonと同じ語彙系）
- primary_appeal（主訴求とその理由）
- reusable_principles（他案件に転用できる原則。配列）
- rights_excluded（直接模倣してはいけない要素。配列）
- source（captureUrl / sourceUrl / sourceDetailUrl）
- 媒体が素材探索であることを踏まえた、その媒体特有の追加項目があれば提案してほしい

#### Note記事化の観点

- この事例から得られる学び・発見は何か（タイトル案も1つ提示してほしい）
- 既出のネタと重複していないか（新規性があるか）
- 誰向けの記事になりそうか（制作者・担当者・経営者 等）

### 候補ID: PHAC-0120

- 媒体種別: 素材探索
- タイトル: リハビリでマッサージをする理学療法士 作業療法士
- URL: https://www.photo-ac.com/main/detail/35053650
- 参考元URL（詳細）: https://www.photo-ac.com/main/detail/35053650
- スクリーンショット: 保存なし（メタ情報のみ）
- 参考元: 写真AC
- 取得日: 2026-10-11
- 軽量分析の概要: 写真ACから収集したAsset参考。リハビリでマッサージをする理学療法士 作業療法士。
- 軽量分析（配色・サイズ）: メタ情報のみ。511×340の掲載画像を基準に確認。

#### 分析してほしい観点

- 構図・情報優先順位・視線誘導（Z型/F型等）
- 配色・コントラスト・タイポグラフィの特徴
- 再利用できる構造・パターン（他業種に転用する際の注意点も含めて）
- 権利上の注意点（素材・コピー・ロゴ等、直接模倣してはいけない部分）
- 検索語・用途適合性（素材自体の権利は転載しないこと前提）

#### CBS（Creative Brief Studio AI）用JSONでほしい項目

- id / mediaType / title
- industry_tags / color_tags / layout_tags / copy_types（既存のknowledge/lp/*.jsonと同じ語彙系）
- primary_appeal（主訴求とその理由）
- reusable_principles（他案件に転用できる原則。配列）
- rights_excluded（直接模倣してはいけない要素。配列）
- source（captureUrl / sourceUrl / sourceDetailUrl）
- 媒体が素材探索であることを踏まえた、その媒体特有の追加項目があれば提案してほしい

#### Note記事化の観点

- この事例から得られる学び・発見は何か（タイトル案も1つ提示してほしい）
- 既出のネタと重複していないか（新規性があるか）
- 誰向けの記事になりそうか（制作者・担当者・経営者 等）

### 候補ID: PHAC-0121

- 媒体種別: 素材探索
- タイトル: 老人ホーム・介護施設にいる車椅子の女性 介護
- URL: https://www.photo-ac.com/main/detail/34942224
- 参考元URL（詳細）: https://www.photo-ac.com/main/detail/34942224
- スクリーンショット: 保存なし（メタ情報のみ）
- 参考元: 写真AC
- 取得日: 2026-10-11
- 軽量分析の概要: 写真ACから収集したAsset参考。老人ホーム・介護施設にいる車椅子の女性 介護。
- 軽量分析（配色・サイズ）: メタ情報のみ。511×340の掲載画像を基準に確認。

#### 分析してほしい観点

- 構図・情報優先順位・視線誘導（Z型/F型等）
- 配色・コントラスト・タイポグラフィの特徴
- 再利用できる構造・パターン（他業種に転用する際の注意点も含めて）
- 権利上の注意点（素材・コピー・ロゴ等、直接模倣してはいけない部分）
- 検索語・用途適合性（素材自体の権利は転載しないこと前提）

#### CBS（Creative Brief Studio AI）用JSONでほしい項目

- id / mediaType / title
- industry_tags / color_tags / layout_tags / copy_types（既存のknowledge/lp/*.jsonと同じ語彙系）
- primary_appeal（主訴求とその理由）
- reusable_principles（他案件に転用できる原則。配列）
- rights_excluded（直接模倣してはいけない要素。配列）
- source（captureUrl / sourceUrl / sourceDetailUrl）
- 媒体が素材探索であることを踏まえた、その媒体特有の追加項目があれば提案してほしい

#### Note記事化の観点

- この事例から得られる学び・発見は何か（タイトル案も1つ提示してほしい）
- 既出のネタと重複していないか（新規性があるか）
- 誰向けの記事になりそうか（制作者・担当者・経営者 等）

### 候補ID: PHAC-0122

- 媒体種別: 素材探索
- タイトル: 公園で話す高齢者と笑顔の介護スタッフ女性 高齢者
- URL: https://www.photo-ac.com/main/detail/26122806
- 参考元URL（詳細）: https://www.photo-ac.com/main/detail/26122806
- スクリーンショット: 保存なし（メタ情報のみ）
- 参考元: 写真AC
- 取得日: 2026-10-11
- 軽量分析の概要: 写真ACから収集したAsset参考。公園で話す高齢者と笑顔の介護スタッフ女性 高齢者。
- 軽量分析（配色・サイズ）: メタ情報のみ。511×340の掲載画像を基準に確認。

#### 分析してほしい観点

- 構図・情報優先順位・視線誘導（Z型/F型等）
- 配色・コントラスト・タイポグラフィの特徴
- 再利用できる構造・パターン（他業種に転用する際の注意点も含めて）
- 権利上の注意点（素材・コピー・ロゴ等、直接模倣してはいけない部分）
- 検索語・用途適合性（素材自体の権利は転載しないこと前提）

#### CBS（Creative Brief Studio AI）用JSONでほしい項目

- id / mediaType / title
- industry_tags / color_tags / layout_tags / copy_types（既存のknowledge/lp/*.jsonと同じ語彙系）
- primary_appeal（主訴求とその理由）
- reusable_principles（他案件に転用できる原則。配列）
- rights_excluded（直接模倣してはいけない要素。配列）
- source（captureUrl / sourceUrl / sourceDetailUrl）
- 媒体が素材探索であることを踏まえた、その媒体特有の追加項目があれば提案してほしい

#### Note記事化の観点

- この事例から得られる学び・発見は何か（タイトル案も1つ提示してほしい）
- 既出のネタと重複していないか（新規性があるか）
- 誰向けの記事になりそうか（制作者・担当者・経営者 等）

### 候補ID: PHAC-0123

- 媒体種別: 素材探索
- タイトル: リハビリでをするシニアと作業療法士 リハビリ
- URL: https://www.photo-ac.com/main/detail/35053824
- 参考元URL（詳細）: https://www.photo-ac.com/main/detail/35053824
- スクリーンショット: 保存なし（メタ情報のみ）
- 参考元: 写真AC
- 取得日: 2026-10-11
- 軽量分析の概要: 写真ACから収集したAsset参考。リハビリでをするシニアと作業療法士 リハビリ。
- 軽量分析（配色・サイズ）: メタ情報のみ。511×340の掲載画像を基準に確認。

#### 分析してほしい観点

- 構図・情報優先順位・視線誘導（Z型/F型等）
- 配色・コントラスト・タイポグラフィの特徴
- 再利用できる構造・パターン（他業種に転用する際の注意点も含めて）
- 権利上の注意点（素材・コピー・ロゴ等、直接模倣してはいけない部分）
- 検索語・用途適合性（素材自体の権利は転載しないこと前提）

#### CBS（Creative Brief Studio AI）用JSONでほしい項目

- id / mediaType / title
- industry_tags / color_tags / layout_tags / copy_types（既存のknowledge/lp/*.jsonと同じ語彙系）
- primary_appeal（主訴求とその理由）
- reusable_principles（他案件に転用できる原則。配列）
- rights_excluded（直接模倣してはいけない要素。配列）
- source（captureUrl / sourceUrl / sourceDetailUrl）
- 媒体が素材探索であることを踏まえた、その媒体特有の追加項目があれば提案してほしい

#### Note記事化の観点

- この事例から得られる学び・発見は何か（タイトル案も1つ提示してほしい）
- 既出のネタと重複していないか（新規性があるか）
- 誰向けの記事になりそうか（制作者・担当者・経営者 等）
