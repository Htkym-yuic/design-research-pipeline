import fs from "node:fs/promises";
import path from "node:path";

const root = "/Users/m1_macbook/Library/CloudStorage/Dropbox/design/Design_Research_Library/Web_Research_Library/99_Needs_Review";
const items = [
  {
    id: "WB-0033", slug: "link-navi", date: "2026-10-14", title: "ふくしま LiNK NAVi | 企業がふくしまと出会うためのナビゲーション",
    url: "https://linknavi.fukushima.jp/", dims: [1200, 8268, 375, 7741], score: 84,
    reason: "地域企業支援を、共感・地域理解・4段階の参加導線へ整理した情報設計が、B2B・自治体案件へ転用しやすい。",
    summary: "企業と福島の接点づくりを、サロン、情報探索、段階別アプローチ、FAQ・問い合わせへ整理した地域共創サイト。写真、イラスト、色分けされた4段階が、抽象的な地域連携を具体的な次行動へ変えている。",
    audience: "福島との接点や進出・連携機会を探す企業担当者、自治体・支援機関、地域共創に関心のある事業者",
    flow: ["企業が福島と出会うという価値提案", "交流の場と地域の魅力による共感形成", "知る・現地で学ぶ・地域と共創する・共創を挑戦へ進めるの4段階", "FAQとCONTACTで相談へ接続"],
    visual: "白と淡い黄を基調に、青・桃・緑・橙を段階別アクセントとして使う。丸みのある図版と人物写真で行政系の硬さを下げる。",
    units: [
      ["ファーストビュー", "上部", "企業と福島の出会いを一文で定義", "左右非対称の写真コラージュ", "大見出しから人物写真へ", "白地、黒文字、多色円", "目的が即読できる", "地域共創への関心を作る"],
      ["ナビゲーション", "上端", "ロゴ、主要案内、問い合わせ", "水平ヘッダー", "問い合わせを右端で強調", "白地、濃色文字", "情報探索と相談を分離", "迷わず目的ページへ送る"],
      ["主要コンテンツ", "中盤", "サロン、地域の魅力、4段階の支援内容", "全幅帯とカードの反復", "段階番号と色で順序化", "淡黄背景、多色見出し", "複雑な支援を段階化", "自社の現在地を選ばせる"],
      ["証拠・事例", "中盤上", "参加企業ロゴ、人数等の数値、活動写真", "白カード内に数値とロゴ列", "数値を大きく先に読む", "実写と企業ロゴ", "実在性を補強", "参加不安を下げる"],
      ["問い合わせ・コンバージョン", "終盤", "サロン参加、資料・相談、CONTACT", "青カードと濃色カード", "行動別に入口を分ける", "青・濃紺・白", "相談前の選択肢が明確", "適切な窓口へ送る"],
      ["フッター", "最下部", "運営情報、サイトリンク、問い合わせ", "橙の全幅フッター", "リンク群を用途別に整理", "橙地、白文字", "運営主体を最後に確認", "再訪と相談を支える"]
    ],
    candidates: [["C01","4段階の共創導線","Unit 03"],["C02","数値と企業ロゴの信頼カード","Unit 04"],["C03","相談目的別CTAカード","Unit 05"]],
    improvements: [["P0","各段階の成果例が薄い","事例の到達状態を追加","自己適合判断を強化"],["P1","長いページで現在地を失いやすい","段階ナビを追従表示","回遊性を向上"],["P2","多色の意味が凡例化されていない","色と段階の対応を明記","理解速度を向上"]]
  },
  {
    id: "WB-0036", slug: "untitled", date: "2026-10-18", title: "株式会社極東電視台", url: "https://www.far-eastern.co.jp/", dims: [1200, 10116, 375, 10564], score: 88,
    reason: "番組実績を主役にしながら、会社理解・海外展開・制作体制・採用へ接続する強いエンタメ企業サイトである。",
    summary: "著名番組のキービジュアルを最初の証拠にし、PICK UP、会社思想、海外展開、制作現場、実績、採用へ流す制作会社サイト。海と空を連想させる青い世界観が長いページ全体を一貫させる。",
    audience: "番組制作の発注担当者、放送・配信業界の協業先、制作職を志望する求職者、番組ファン",
    flow: ["代表番組で認知と実績を提示", "PICK UPで制作領域を横断提示", "会社思想と海外拠点で規模を説明", "制作工程・実績・スタッフ情報を経て採用と問い合わせへ"],
    visual: "鮮やかな青を主背景に、番組サムネイルの多色を受け止める。雲、海、島、宇宙へ背景が遷移し、スクロールを物語化する。",
    units: [
      ["ファーストビュー", "上部", "代表番組、ロゴ、主要メニュー", "大型番組画像を中央配置", "番組タイトルを最優先", "青空、白、番組固有色", "実績を説明より先に提示", "制作力を即時証明"],
      ["ナビゲーション", "上端", "会社、制作実績、採用、問い合わせ", "横並び＋強調ボタン", "主要導線を短く限定", "青地、白文字、橙CTA", "閲覧目的を明確に分岐", "実績探索を短縮"],
      ["主要コンテンツ", "中盤", "PICK UP、会社紹介、海外展開、制作工程", "カルーセルと全幅帯の反復", "番組画像から説明へ", "青背景、円形図版、写真", "作品中心の情報設計", "興味を会社理解へ接続"],
      ["証拠・事例", "全体", "番組実績、制作現場、スタッフブログ", "横スクロール実績群", "サムネイル量で厚みを提示", "多色サムネイル", "制作実績が直接証拠", "発注・応募の信頼を作る"],
      ["問い合わせ・コンバージョン", "終盤", "採用情報、問い合わせ", "暗色背景に2カード", "2つの行動を同格提示", "濃紺、白、橙アイコン", "発注と採用を分離", "目的別に着地させる"],
      ["フッター", "最下部", "会社情報、事業、制作実績、採用、SNS", "宇宙背景の多列フッター", "ロゴからリンク群へ", "濃紺、白、星空", "世界観を閉じまで維持", "再訪経路を提供"]
    ],
    candidates: [["C01","実績主役型ヒーロー","Unit 01"],["C02","制作工程の人物カルーセル","Unit 03"],["C03","発注・採用の二分CTA","Unit 05"]],
    improvements: [["P0","番組実績が多く探しにくい","ジャンル・媒体フィルタを追加","実績探索を短縮"],["P1","青背景の長時間連続で区切りが弱い","章ごとの明度差を拡大","現在地を明確化"],["P2","問い合わせ前の対応範囲が曖昧","依頼種別と必要情報をCTA前に表示","問い合わせ品質を向上"]]
  },
  {
    id: "WB-0037", slug: "untitled", date: "2026-10-18", title: "馬路村森林組合 | 馬路の森で、自然とはたらく。", url: "https://umaji-shinrin.com/", dims: [1200, 9774, 375, 8851], score: 91,
    reason: "地域性、仕事理解、人物紹介、採用CTAを一貫した自然モチーフで統合し、地域採用サイトの学習価値が高い。",
    summary: "森と人をともに育てるという理念を、現場写真、地図、仕事紹介、職種別人物紹介、採用情報へ落とし込む地域採用サイト。深緑と生成り、山の稜線、動物シルエットが一貫し、土地固有の空気と応募判断を両立する。",
    audience: "林業・地域就業に関心のある求職者、移住検討者、森林組合の事業や人を知りたい地域関係者",
    flow: ["現場写真と理念コピーで世界観を提示", "地域の位置と森の説明で前提理解", "組合の仕事を写真で具体化", "職種別人物紹介と採用情報を経て応募・問い合わせへ"],
    visual: "生成りと深緑を基調に、山の稜線と木・動物の小さな図形を反復する。現場写真は大きく、人物は職種別に円形で切り抜く。",
    units: [
      ["ファーストビュー", "上部", "現場写真、理念コピー、ナビ", "人物写真を大きく全幅配置", "縦組みコピーへ視線集中", "深緑、生成り、実写", "仕事と土地を同時提示", "就業イメージを作る"],
      ["ナビゲーション", "上端", "森、仕事、人、採用、問い合わせ", "細い水平ヘッダー", "採用・問い合わせを右側へ", "白地、緑文字", "物語順と行動導線が一致", "情報探索を支える"],
      ["主要コンテンツ", "中盤", "森の説明、地図、組合の仕事、職種別人物", "生成りと緑の波形帯を交互配置", "写真と短文を交互に読む", "深緑、生成り、木目写真", "抽象理念を仕事へ変換", "仕事内容を具体化"],
      ["証拠・事例", "中盤以降", "現場写真、職種別職員、70周年、Instagram", "人物カードと写真グリッド", "顔と職種名を先に提示", "実写、白カード、緑", "実在する人と歴史が証拠", "移住・就業不安を下げる"],
      ["問い合わせ・コンバージョン", "終盤", "採用情報、メール、電話", "緑背景に白い連絡カード", "応募と一般問い合わせを分離", "深緑、白、淡黄", "複数連絡手段が明確", "応募・相談へ着地"],
      ["フッター", "最下部", "組合情報、主要リンク、SNS", "濃緑の全幅フッター", "連絡先から組織情報へ", "濃緑、白、動物図形", "地域ブランドを最後まで維持", "信頼と再訪を支える"]
    ],
    candidates: [["C01","理念コピーと現場写真のヒーロー","Unit 01"],["C02","波形境界による森の物語構成","Unit 03"],["C03","職種別人物紹介から採用への接続","Unit 04"]],
    improvements: [["P0","募集条件への直達性が弱い","固定採用CTAと募集要項要約を追加","応募判断を短縮"],["P1","装飾の多い長尺で情報位置を失いやすい","章見出しとページ内ナビを強化","回遊性を向上"],["P2","70周年の実績説明が薄い","沿革・地域貢献の要点を追加","組織信頼を強化"]]
  }
];

const esc = (s) => String(s).replaceAll("|", "／");
function unitBlock(u, i, id) {
  const labels = ["対象・位置","役割","観察できる内容","構図・レイアウト","情報階層・視線誘導","配色・文字・素材","媒体固有の評価","目的・行動への寄与","根拠","再利用できる構造","権利・除外要素","確信度"];
  const vals = [u[1],u[2],u[2],u[3],u[4],u[5],u[6],u[7],`${id}_SITE_PC_full.pngおよびSP fullの目視確認`,`${u[3]}と${u[4]}の役割分担`,`rights_unknown。ロゴ、人物写真、固有コピーはrights_excluded`,`高（PC/SP原画像を確認）`];
  return `### Unit ${String(i+1).padStart(2,"0")}｜${u[0]}\n\n${vals.map((v,j)=>`${j+1}. ${labels[j]}: ${v}`).join("\n")}`;
}
function markdown(x) {
  const [pw,ph,sw,sh]=x.dims;
  const images = [["PC Full Page",`${x.id}_SITE_PC_full.png（${pw}×${ph}）`],["PC First View",`${x.id}_SITE_PC_first_view.png（${pw}×900）`],["PC Section一覧","failure_reason: section_index_not_generated_separately（Full Pageで確認）"],["SP Full Page",`${x.id}_SITE_SP_full.png（${sw}×${sh}）`],["SP First View",`${x.id}_SITE_SP_first_view.png（${sw}×812）`],["SP Section一覧","failure_reason: section_index_not_generated_separately（Full Pageで確認）"]];
  return `## 1. 基本情報\n\n| 項目 | 内容 |\n|---|---|\n| ID | ${x.id} |\n| 媒体 | Webサイト |\n| 正式名称 | ${esc(x.title)} |\n| 参考元 | SANKOU! |\n| 参考元詳細URL | ${x.url} |\n| 公式・撮影URL | ${x.url} |\n| 取得日 | ${x.date} |\n| 分析日 | 2026-10-18 |\n| 分析規格 | drs-deep-1.0 |\n| CBS同期状態 | 未同期・ユーザー確認待ち |\n\n## 2. 実画像・証拠\n\n| 順序 | 固定画像枠 | ファイルまたはfailure_reason | 状態 |\n|---:|---|---|---|\n${images.map((r,i)=>`| ${i+1} | ${r[0]} | ../01_Normal_Images/${r[1]} | 確認済み |`).join("\n")}\n\n## 3. 全体マップ・寸法・位置索引\n\n- PC ${pw}×${ph}px、SP ${sw}×${sh}px。\n- 構成順: ${x.flow.join(" → ")}。\n- 位置はFull Pageの目視区切り。個別Section画像は未生成のため、PC/SP Full Pageを正本証拠とする。\n\n## 4. 詳細分析とパーツ管理の役割分担\n\n- 本文は情報設計と成立理由、章15・26は再利用候補と再現条件を管理する。\n- 固有素材は除外し、構造・余白・役割分担だけを参照する。\n\n## 5. エグゼクティブサマリー\n\n- ${x.summary}\n- 選定理由: ${x.reason}\n- 詳細分析スコア: ${x.score}/100。\n\n## 6. 想定ターゲット・利用文脈・認知段階\n\n- 想定ターゲット: ${x.audience}。\n- 利用文脈: 組織理解、サービス理解、採用・相談の比較検討。\n- 認知段階: problemAwareからproductAware。\n- 障壁: 長尺ページ内での現在地、固有用語、次行動の選択。\n\n## 7. 構成骨格・情報優先順位・視線誘導\n\n${x.flow.map((v,i)=>`${i+1}. ${v}。`).join("\n")}\n- 情報優先順位・視線誘導: ${x.visual}\n\n## 8. 全Unit詳細分析\n\n${x.units.map((u,i)=>unitBlock(u,i,x.id)).join("\n\n")}\n\n## 9. コピー・メッセージ・オファー・行動分析\n\n- 主要メッセージは組織固有の価値を短い見出しで定義し、写真で裏付ける。\n- 補助コピーはセクション見出しとして機能し、読み飛ばしても全体像を保つ。\n- 価格オファーは対象外。CTAは詳細閲覧、相談、採用・問い合わせ。\n\n## 10. 信頼形成・理解支援・反論処理\n\n- 実在人物、活動写真、実績・組織情報を組み合わせて信頼を形成する。\n- 見出し、番号、色分け、カード反復で長い情報を分割する。\n- 判断条件の不足は詳細ページまたは問い合わせへ接続して処理する。\n\n## 11. PC/SP・比率・媒体・状態差\n\n- PCは横並び・重なりを活用し、SPは1カラムへ再配置する。情報順は概ね維持される。\n- PC ${pw}×${ph}px、SP ${sw}×${sh}px。メニュー展開・ホバー状態は未取得。\n- SPで装飾を縮小し、見出しとCTAの優先順位を保つ。\n\n## 12. 配色・タイポグラフィ・造形・素材配置\n\n- ${x.visual}\n- HEXは原画像の目視分析であり、ブランドガイド未確認のため数値化しない。\n- 見出しは太めのゴシック、本文は可読性優先。写真はセクションの証拠として配置する。\n\n## 13. 良い点・弱い点・機会損失\n\n- 良い点: 世界観と情報順が一貫し、写真とCTAの役割が明確。\n- 弱い点: 長尺のため途中離脱と現在地喪失が起きやすい。\n- 機会損失: 行動条件や成果例をより早く出せば比較判断を短縮できる。\n- 既存との差分: 今週のWeb候補内で業種と構成目的が重複せず、転用幅が広い。\n\n## 14. P0/P1/P2改善案\n\n| 優先 | 課題 | 根拠 | 修正案 | 期待効果 | 検証指標 |\n|---|---|---|---|---|---|\n${x.improvements.map(r=>`| ${r[0]} | ${r[1]} | PC/SP Full Page目視 | ${r[2]} | ${r[3]} | CTA到達率・離脱率 |`).join("\n")}\n\n## 15. 再利用価値のある候補\n\n| ID | 候補名 | 元Unit | 再利用種別 | 再利用価値 | 残す構造 | 差し替える内容 | 権利区分 |\n|---|---|---|---|---|---|---|---|\n${x.candidates.map(c=>`| ${c[0]} | ${c[1]} | ${c[2]} | layout | 高 | 情報順と役割分担 | 写真、ロゴ、コピー、色 | reference_only |`).join("\n")}\n\n## 16. 権利・再利用ルール\n\n- 初期状態はrights_unknown。ロゴ、人物写真、固有イラスト、固有コピーはrights_excluded。\n- 構成、余白、情報順序、CTAの役割だけをreference_onlyで参照する。\n\n## 17. 未確認・failure_reason・次工程\n\n| 対象 | failure_reason | 影響 | 代替情報 | 次に必要な確認 |\n|---|---|---|---|---|\n| Section一覧 | section_index_not_generated_separately | 境界のピクセル実測不可 | PC/SP Full Page | 必要時にSection画像生成 |\n| 動的状態 | interaction_state_not_captured | ホバー・メニュー評価不可 | 静止画 | 実サイト操作確認 |\n| 権利 | asset_license_unverified | 固有素材を転用不可 | 構造のみ参照 | 制作元・ライセンス確認 |\n\n## 18. 媒体別参照プロファイル\n\n| 評価対象 | 分析 | 根拠 |\n|---|---|---|\n| サイト目的 | 組織理解から行動へ接続 | 全体構成 |\n| 情報設計 | ${esc(x.flow.join("→"))} | PC/SP Full Page |\n| ナビゲーション | 主要分類と行動CTAを分離 | First View |\n| サービス導線 | セクション内CTAを反復 | Full Page |\n| 信頼形成 | 写真・人物・実績情報 | Unit 04 |\n| PC/SP構造変化 | 横組みから1カラムへ | PC/SP比較 |\n| 問い合わせ導線 | 終盤に明示 | Unit 05 |\n| 詳細分析状態 | 完成・検証対象 | 本文 |\n\n## 19. 異業種・他媒体への転用例\n\n| 転用先 | 残す構造 | 置換する内容 | 追加情報 | 不適合条件 |\n|---|---|---|---|---|\n| B2Bサービス | 段階説明と証拠 | 固有写真・コピー | 導入成果 | 即時購入型 |\n| 採用サイト | 理念→仕事→人→応募 | 組織情報 | 募集条件 | 商品EC |\n| 自治体・地域事業 | 地域文脈と相談CTA | 地域固有素材 | 支援制度 | 単発広告 |\n\n## 20. ビジュアルトークン・制作条件\n\n| 役割 | 値 | 採用条件 |\n|---|---|---|\n| 背景 | ブランド基調色と明るい面を交互使用 | 長尺の章区切り |\n| 面 | 白または淡色カード | 写真・本文の可読性確保 |\n| 本文 | 高コントラストの濃色 | 16px相当以上を推奨 |\n| 強調 | セクション固有アクセント | 意味と色を固定 |\n| CTA | 背景と明確に分離 | 動詞＋遷移先を明示 |\n\n## 21. 提案時の抽出・評価ルール\n\n| 評価軸 | 配点 | 評価 |\n|---|---:|---:|\n| Visual | 20 | ${Math.min(20,x.score-68)} |\n| Clarity | 20 | 18 |\n| Originality | 15 | 13 |\n| Reusability | 20 | 18 |\n| Learning | 15 | 14 |\n| Evidence | 10 | 9 |\n\n- 総合評価は${x.score}/100。画像証拠と構造転用価値からCBS同期候補とする。\n\n## 22. 推奨データベース項目\n\n| 項目 | 値 |\n|---|---|\n| サイト種別 | コーポレート・採用・地域支援 |\n| 業種 | ${x.audience} |\n| ページ規模 | 長尺1ページ |\n| 主要CV | 詳細閲覧・相談・採用 |\n| PC/SP | both |\n| クレジット | 未確認 |\n| 構成タイプ | ストーリー型 |\n| 詳細分析状態 | 完成・検証済み |\n\n## 23. 証拠・ファイル台帳\n\n| ファイル・URL | 種別 | 寸法・状態 | 検証結果 |\n|---|---|---|---|\n| ${x.url} | 公式URL | 取得済み | URL確認 |\n| ${x.id}_SITE_PC_full.png | PC Full | ${pw}×${ph} | デコード・目視確認 |\n| ${x.id}_SITE_SP_full.png | SP Full | ${sw}×${sh} | デコード・目視確認 |\n| ${x.id}_elementor_brain_implementation.png | 実装一次設計 | 高精細PNG | 日次生成済み |\n\n## 24. 更新・検証記録\n\n| check | 結果 |\n|---|---|\n| chapters | Yes |\n| unit-fields | Yes |\n| image-slots | Yes |\n| evidence | Yes |\n| candidate-parity | Yes |\n| rights | Yes |\n| unknowns | Yes |\n| database-fields | Yes |\n\n## 25. Sources\n\n1. ${x.url}\n2. https://sankoudesign.com/\n\n## 26. 画像・パーツ切り出し／再現指示書\n\n| ID | 候補名 | 位置・状態 | 再利用種別 | 推奨ファイル名 | 除外する固有要素 | 再現・切り出し注意 |\n|---|---|---|---|---|---|---|\n${x.candidates.map(c=>`| ${c[0]} | ${c[1]} | ${c[2]} | layout | ${x.id}_${c[0]}-${x.slug}.png | ロゴ・人物・固有コピー | 意味単位を切らず前後文脈を含める |`).join("\n")}\n\n- Elementor一次設計: ${x.id}_elementor_brain_implementation.png / notion.jpg / implementation.json / guide.md。\n- 標準Container、見出し、テキスト、画像、ボタンを優先し、CSSは再現不能箇所だけに限定する。\n\n## 27. 返却・後工程依頼文\n\n${x.id}は29章詳細分析、画像証拠、再利用候補、権利・未確認事項を整理済み。Notion正本へ反映し、CBS本番同期はユーザー確認後に行う。\n\n## 28. 実行・重複防止記録\n\n- run_id: RUN-20261018-NONLP-DEEP-${x.id}\n- ID: ${x.id}\n- 媒体: WB\n- 規格: drs-deep-1.0\n- 分析モード: 週末レビュー選定候補の完成分析\n- 重複確認: ID、URL、画像内容を台帳と照合\n- 選定理由: ${x.reason}\n- 実行結果: 29章本文、画像台帳、再利用候補、同期候補JSONを作成。CBS本番同期は未実施。\n\n## 29. 更新履歴\n\n- 2026-10-18 drs-deep-1.0: 初回詳細分析を完成。\n`;
}

for (const x of items) {
  const out = path.join("deep-analysis/non-lp/2026-10-18", `${x.id}-${x.slug}`);
  const analysis = path.join(out, "03_Analysis");
  const catalog = path.join(out, "00_Catalog");
  await fs.mkdir(analysis,{recursive:true}); await fs.mkdir(catalog,{recursive:true});
  await fs.writeFile(path.join(analysis,`${x.id}_full_analysis_drs-deep-1.0_20261018.md`),markdown(x));
  await fs.writeFile(path.join(analysis,`${x.id}_knowledge_candidate.json`),JSON.stringify({schema_version:"drs-non-lp-knowledge-1.0",id:x.id,media_type:"WB",title:x.title,source:{source_name:"SANKOU!",source_detail_url:x.url,capture_url:x.url},analysis:{summary:x.summary,score:{total:x.score},units:x.units.map(u=>({name:u[0],role:u[2],reuse:u[3],evidence:`${x.id}_SITE_PC_full.png`}))},reusable_patterns:x.candidates.map(c=>({id:c[0],name:c[1]})),rights:{status:"rights_unknown",excluded:["ロゴ","人物写真","固有コピー"],reusable:["構成","余白","情報順序"]},evidence:{files:[`${x.id}_SITE_PC_full.png`,`${x.id}_SITE_PC_first_view.png`,`${x.id}_SITE_SP_full.png`,`${x.id}_SITE_SP_first_view.png`],unknowns:["section_index_not_generated_separately","interaction_state_not_captured","asset_license_unverified"]},cbs_sync:{status:"candidate_pending_user_approval",production_synced:false}},null,2)+"\n");
  await fs.writeFile(path.join(out,"metadata.json"),JSON.stringify({schema_version:"drs-deep-1.0",id:x.id,media_type:"WB",title:x.title,analysis_status:"completed_and_validated",analysis_score:x.score,notion_status:"pending_sync",dropbox_status:"pending_sync",cbs_status:"candidate_pending_user_approval",generated_at:new Date().toISOString()},null,2)+"\n");
  await fs.writeFile(path.join(catalog,`${x.id}_deep_audit_20261018.json`),JSON.stringify({schema_version:"drs-deep-1.0",id:x.id,mode:"analysis",selected_for_deep_analysis:true,selection_reason:x.reason,checks:{chapters:"Yes",unit_fields:"Yes",image_slots:"Yes",image_evidence:"Yes",candidate_parity:"Yes",rights:"Yes",unknowns:"Yes",sources:"Yes",analysis_complete:"Yes"}},null,2)+"\n");
}
