import fs from "node:fs/promises";

const analysisDate = "2026-11-01";
const profiles = [
  {
    id: "WB-0049", slug: "kutsushitaya-fudge-special-snap", collectedAt: "2026-10-27",
    notionPage: "https://app.notion.com/p/40524d4fa67181a68e93fb41bd1ba1b1",
    title: "KUTSUSHITAYA × FUDGE.jp SPECIAL SNAP｜この秋は、レトロな靴下が気分でして。",
    captureUrl: "https://tabio.com/blogs/features/friendsnap2026",
    sourceDetailUrl: "https://sankoudesign.com/web/kutsushitayafudgejp-specialsnap/",
    dims: [1200, 18592, 375, 20907], score: { visual: 19, clarity: 17, originality: 14, reusability: 18, learning: 14, evidence: 10 },
    selectionReason: "商品一覧を先に置かず、スタイリング人物、靴下の接写、商品バリエーション、購入CTAを1つのLOOKごとに反復する編集型EC構造が、ファッション・雑貨の文脈販売へ転用しやすい。",
    summary: ["靴下を単品で並べず、FUDGEらしい人物スナップとレトロな生活場面の中で商品価値を伝える編集型EC特集。", "3つのSNAPが、全幅の導入写真、スタイリング写真、足元接写、色柄バリエーション、BUY NOWの順を反復し、閲覧と購入を自然につなぐ。", "余白の大きい淡い背景とコラージュ配置により、長尺でもカタログではなく雑誌を読む感覚を維持している。"],
    audience: ["想定ターゲット: レトロ・トラッドな装いを好む若年〜中年女性、FUDGE読者、靴下から秋冬コーデを更新したい層。", "利用文脈: コーディネート発見、着用イメージ確認、色柄比較、商品購入。", "認知段階: categoryAwareからproductAware。", "主な障壁: 単体商品だけでは合わせ方が分からない、柄物が自分の服に合うか不安、長尺特集から商品ページへ移りにくい。"],
    flow: ["コラボと季節テーマを人物3体のキービジュアルで提示", "企画説明と3人のモデル紹介で読み方を作る", "SNAP 01を全身・足元・商品列・BUY NOWで展開", "SNAP 02を生活場面と円形接写で展開", "SNAP 03を色柄の強いコーデと商品列で展開", "集合スナップとスタッフ情報で企画を閉じる"],
    visualFlow: "濃緑・橙・茶の見開き風キービジュアルから、淡いピンクの大きな余白へ移り、写真フレーム、円形接写、商品列、楕円CTAを反復する。各SNAPの濃色帯が現在地を戻す目印になる。",
    visualStyle: ["淡いピンクと生成りを基調に、濃緑・テラコッタ・ボルドーをSNAPの区切りに使用。", "手書き風の注釈、傾いた英字、線画の靴下・矢印を使い、雑誌のスクラップブック感を作る。", "人物全身、足元接写、商品単体を異なる縮尺で並べ、着用文脈と購入対象を往復させる。"],
    units: [
      ["ファーストビュー", "ページ最上部", "コラボ名、季節テーマ、3人のスタイリング人物", "3分割の濃色背景に人物を切り抜き配置", "大きな企画名から人物、靴下へ視線が落ちる", "濃緑・橙・茶、手書き線画、切り抜き人物", "商品より先に企画世界観を提示する編集型ECの入口", "閲覧者を商品探索ではなくスタイル発見へ誘導"],
      ["企画説明・モデル紹介", "FV直下", "短いイントロ、靴下モチーフ、3人のプロフィール", "細い本文と小さな円形プロフィールを中央配置", "余白の後に説明と人物の順で企画前提を理解させる", "淡桃背景、濃緑文字、小さな写真円", "長尺特集の登場人物と読み方を先に共有", "後続SNAPへの愛着と識別を作る"],
      ["SNAP 01", "上中段", "全身、室内写真、足元、商品色柄、購入CTA", "全幅導入帯の後に左右非対称コラージュ", "人物全体→足元→商品単体→CTA", "テラコッタ、緑枠、楕円ボタン", "一つの着こなしを購入可能な商品へ分解", "着用イメージから購入へ接続"],
      ["SNAP 02", "中段", "生活場面、円形接写、靴と靴下の組合せ、商品列", "矩形写真と円形写真を重ねた見開き風", "場面写真から局所接写へズームする", "ボルドー、生成り、円形マスク", "柄物の合わせ方を複数距離で説明", "柄への不安を使用場面で軽減"],
      ["SNAP 03", "下中段", "濃緑の導入帯、人物、椅子の生活場面、商品列", "強い導入帯と余白の大きいコラージュ", "色面→人物→足元→商品→CTA", "濃緑、青緑、茶、チェック柄", "3章目でも反復構造を保ちながら配色で差別化", "複数商品の比較と購入を支援"],
      ["クロージング", "最下部", "集合スナップ、制作・出演情報", "人物を中央に集め、クレジットを小さく整理", "購入訴求を終えた後に企画の余韻と出典を提示", "生成り、緑、実写", "広告色を弱めて編集企画として閉じる", "ブランド好意と再訪を残す"]
    ],
    copy: ["商品名より先に季節の気分とスタイリングテーマを語り、欲しい理由を作ってから商品へ接続する。", "SNAP番号と人物名を章見出しとして反復し、長尺ページの現在地を保つ。", "BUY NOWは各LOOKの説明と商品列の後に置かれ、文脈理解後の購入行動になっている。"],
    trust: ["実際の着用写真、足元接写、色柄バリエーションを併置し、見た目と商品の対応を証明する。", "出演者と制作クレジットを終盤に示し、編集企画としての実在性を補強する。", "サイズ・価格・在庫などの購入判断情報は遷移先依存で、ページ内では弱い。"],
    strengths: ["着用文脈から商品へ分解する反復構造", "雑誌的な長尺編集と購入CTAの両立", "PC/SPで物語順を維持"],
    weaknesses: ["非常に長く、購入対象へ戻る負荷が高い", "CTA文言が一律で商品差が伝わりにくい", "商品名・価格がページ内で目立たない"],
    opportunities: ["追従型のLOOK索引を加える", "CTAに商品名・価格帯を併記する", "各SNAPの関連商品をまとめて比較可能にする"],
    improvements: [["P0", "長尺で商品位置を見失う", "PC 18592px・SP 20907px", "SNAP 01〜03の追従アンカーと商品一覧へ戻る導線を追加", "商品再発見を短縮", "商品クリック率・スクロール深度"], ["P1", "BUY NOWが対象商品を特定しにくい", "複数商品列の後に同一文言", "商品名・価格帯・色数をCTA付近へ追加", "遷移前の判断を強化", "CTA到達後遷移率"], ["P2", "商品比較が章をまたぐ", "各SNAPが独立して長い", "末尾に全商品比較グリッドを追加", "比較離脱を削減", "比較セクション利用率"]],
    candidates: [["C01", "人物・足元・商品列の三段編集", "Unit 03"], ["C02", "濃色導入帯と余白コラージュ", "Unit 05"], ["C03", "文脈理解後の楕円購入CTA", "Unit 03"]],
    db: [["サイト種別", "EC特集・タイアップ"], ["業種", "ファッション・靴下"], ["主要CV", "商品詳細閲覧・購入"], ["構成タイプ", "LOOK反復型・編集型EC"]]
  },
  {
    id: "WB-0052", slug: "idid-day-2026", collectedAt: "2026-10-30", title: "iDID Day 2026",
    notionPage: "https://app.notion.com/p/40824d4fa6718159b2cdf044b4cb1023",
    captureUrl: "https://day2026.idid.team/", sourceDetailUrl: "https://sankoudesign.com/web/ididday2026/",
    dims: [1200, 11890, 375, 11361], score: { visual: 18, clarity: 18, originality: 14, reusability: 19, learning: 15, evidence: 10 },
    selectionReason: "強いイラストFVから、趣旨、登壇者、会場証拠、概要、チケット、FAQ、関連イベント、スポンサーへ順に落とし込むため、カンファレンスやセミナーの募集設計として再利用価値が高い。",
    summary: ["デジタルクリエイティブ領域のイベントを、街のようなイラストFVと硬質な情報ブロックで両立させたイベントサイト。", "登壇者カード、会場写真、開催概要、2種のチケット、FAQを順に配置し、興味喚起から参加判断までを一ページで完結させる。", "PCの余白と左右分散、SPの単列化を使い分けながら、番号付き章見出しで長尺の現在地を保つ。"],
    audience: ["想定ターゲット: デジタルデザイン、映像、インタラクティブ領域の制作者・学生・企業担当者。", "利用文脈: イベント趣旨確認、登壇者確認、日時・会場確認、チケット選択、FAQ確認。", "認知段階: eventAwareからdecisionReady。", "主な障壁: 自分に合う内容か、誰が登壇するか、参加方法・料金・会場が分かるか。"],
    flow: ["街型イラストと開催情報でイベント世界観を提示", "挨拶文で開催目的と対象者を説明", "登壇者カードで内容の質を証明", "会場写真と協力組織で実在性を補強", "開催概要・アクセスで参加条件を確定", "チケット種別と申込み導線を提示", "FAQ・関連イベント・スポンサーで不安解消と信頼を完成"],
    visualFlow: "カラフルな街イラストで感情を作った後、生成り背景と黒い太字見出しへ切り替える。章番号、赤い小点、左見出し・右本文のレイアウトが情報量の多いページを整理する。",
    visualStyle: ["生成り背景、黒い極太和文、赤い番号アクセントを基本とし、登壇者カードだけ多色で区別。", "FVは密度の高い手描きイラスト、本文は広い余白と表・アコーディオンで機能性を担保。", "会場写真は横に流れる断片として置き、イベントの現場感を補う。"],
    units: [
      ["ファーストビュー", "ページ最上部", "イベント名、テーマ、街型イラスト、開催情報", "横長イラストを全幅配置し下端に情報帯", "ロゴ→イラスト内の活動→開催日へ", "多色イラスト、生成り、黒、赤", "抽象的なデジタル制作を祝祭空間として可視化", "イベントへの興味と記憶を作る"],
      ["挨拶・趣旨", "FV直下", "開催の背景、iDIDの説明、対象領域", "左に大見出し、右に本文、下に日付補足", "見出しから説明文へ水平移動", "生成り、黒太字、細い本文", "参加価値を感情から言語へ変換", "自分向けのイベントか判断させる"],
      ["登壇者", "上中段", "顔写真、氏名、肩書、所属", "PCは横一列、SPは2列カード", "色別カードと顔写真で比較", "多色カード、円形・矩形顔写真", "登壇者の多様性を一覧で証明", "参加内容への期待と信頼を高める"],
      ["会場・概要", "中段", "会場写真、協力組織、日時、場所、アクセス", "写真帯の後にロゴグリッドと表", "感情的証拠から実用情報へ移行", "実写、白カード、罫線表", "参加判断に必要な条件を集約", "移動・時間の不確実性を下げる"],
      ["チケット・FAQ", "下中段", "Making・Thinking等の種別、価格・条件、申込、質問", "左見出し・右詳細、FAQはアコーディオン", "種別→条件→申込→不安解消", "生成り、黒、白パネル", "複数参加形態を比較可能にする", "購入・申込み直前の障壁を処理"],
      ["関連イベント・スポンサー", "最下部", "関連企画カード、法人案内、スポンサー一覧", "茶色の関連企画帯の後にロゴグリッド", "次の回遊と主催基盤を最後に提示", "茶、生成り、白、企業ロゴ", "単発イベントをコミュニティ文脈へ接続", "信頼形成と継続接点を作る"]
    ],
    copy: ["『デジタルクリエイティブのいまをつくる人のための』という対象定義が、イベント名だけでは分からない参加価値を補う。", "章見出しを『ご挨拶』『登壇者』『概要』『チケット』『質問』と短くし、走査読みを可能にする。", "チケットは参加目的に応じた複数種を並べ、価格だけでなく体験差を選ばせる。"],
    trust: ["登壇者の顔・所属、会場写真、協力組織、スポンサーを異なる章で積み上げる。", "日時・場所・アクセス・FAQを購入前に同一ページへ置き、参加不安を処理する。", "登壇内容の個別詳細は静止画では薄く、セッション選択の根拠は要確認。"],
    strengths: ["感情的FVと実用情報の明確な役割分担", "登壇者・会場・スポンサーの多層証拠", "チケット比較からFAQへの自然な順序"],
    weaknesses: ["PCの大きな余白が情報到達を遅らせる", "登壇者とセッションの対応が一覧で見えにくい", "チケット種別名だけでは差が直感的でない"],
    opportunities: ["登壇者からセッションへリンクする", "チケット比較表を先に置く", "固定の申込みCTAと残席情報を追加する"],
    improvements: [["P0", "登壇者と内容の対応が弱い", "人物カードとプログラムが離れている", "人物カードにテーマ・時刻・詳細アンカーを追加", "参加動機を具体化", "登壇者カードCTR"], ["P1", "チケット種別の比較負荷", "縦並びの文章中心", "対象・含まれる体験・価格・定員を比較表化", "選択時間を短縮", "購入開始率"], ["P2", "長尺で申込み導線が遠い", "申込は下部中心", "PC/SPに固定チケットCTAを追加", "機会損失を低減", "固定CTA利用率"]],
    candidates: [["C01", "街型イラストのイベントFV", "Unit 01"], ["C02", "色分け登壇者カード一覧", "Unit 03"], ["C03", "チケット比較からFAQへの導線", "Unit 05"]],
    db: [["サイト種別", "イベント・カンファレンス"], ["業種", "デジタルクリエイティブ"], ["主要CV", "チケット申込み"], ["構成タイプ", "募集判断完結型"]]
  },
  {
    id: "WB-0054", slug: "persol-miraiz", collectedAt: "2026-10-31", title: "PERSOL MIRAIZ｜納得の“はたらく未来”支援サービス",
    notionPage: "https://app.notion.com/p/40924d4fa671818aa98cdd5ba8f58ff6",
    captureUrl: "https://miraiz-persol.jp/", sourceDetailUrl: "https://sankoudesign.com/web/persolmiraiz/",
    dims: [1200, 11545, 375, 11485], score: { visual: 19, clarity: 19, originality: 13, reusability: 20, learning: 15, evidence: 10 },
    selectionReason: "抽象的なキャリア不安を共感コピーで受け止め、目的の異なる2サービスへ分岐し、成果数値、利用者の声、記事、FAQ、外部相談先へ段階的に接続するため、無形サービスのCV設計として学習価値が高い。",
    summary: ["働く未来への迷いを、自己理解イベントとキャリア相談という2つの支援サービスへ分けて解消するサービスサイト。", "FV直後に『はたらくの中に、自分らしさの納得を。』と問題を言語化し、ピンクと緑の2カードで入口を選ばせる。", "開催実績、満足度、利用者の声、記事、FAQを重ね、最後に外部相談窓口と企業ブランドへ接続する。"],
    audience: ["想定ターゲット: 今後の働き方に迷う会社員、自己理解を深めたい人、具体的なキャリア相談を求める人。", "利用文脈: 不安の言語化、サービス比較、参加条件・費用確認、利用者評価確認、相談申込み。", "認知段階: problemAwareからsolutionAware。", "主な障壁: 何を相談すべきか分からない、無料支援の内容が不明、イベントと相談サービスの違いが分からない。"],
    flow: ["人物写真と大コピーで将来不安へ共感", "ブランドメッセージで『納得』を価値として定義", "MIRAIZ HUBとMIRAIZ CAREER COACHの2入口を比較提示", "イベント実績・利用者の声でHUBを証明", "サービス条件・利用者の声でCAREER COACHを証明", "記事で潜在課題を教育", "FAQで反論を処理", "ブランド宣言と外部相談窓口で行動へ着地"],
    visualFlow: "FVの青い巨大コピーと人物を起点に、白地の理念、ピンクと緑の二分カード、各サービスの淡色セクションへ進む。利用者の声の多色カードが横方向の動きを作り、FAQで情報密度を整える。",
    visualStyle: ["PERSOLの青を軸に、HUBはピンク、CAREER COACHは緑で機能を色分け。", "丸みの強いカード、円形人物写真、線画の軌道を使い、キャリア相談の硬さを和らげる。", "大きな和文コピーと小さな説明文の差を大きくし、感情→理解→行動の順を視覚化する。"],
    units: [
      ["ファーストビュー", "ページ最上部", "人物、巨大コピー、2つの主要CTA、ロゴ", "人物を中央寄せし、青い文字と線を大きく重ねる", "コピー→人物→ピンク・緑CTA", "白、青、ピンク、緑、実写", "無形サービスの課題を感情的に可視化", "自分事化とサービス選択を同時に促す"],
      ["価値提案", "FV直下", "自分らしさと納得に関する説明、複数人物写真", "左右本文と円形人物列", "大見出し→説明→多様な人物", "淡青背景、黒文字、円形写真", "対象者の幅とブランド思想を説明", "相談への心理的抵抗を下げる"],
      ["サービス分岐", "上中段", "MIRAIZ HUBとCAREER COACHの概要・対象・CTA", "ピンクと緑の2カードを左右並列、SPは縦積み", "悩み別ラベル→説明→CTA", "ピンク、緑、白、ロゴタイプ", "目的の異なる支援を早期に分岐", "適切なサービス詳細へ送る"],
      ["MIRAIZ HUB", "中段", "イベント説明、開催数値、会場写真、利用者の声", "淡桃の大面に写真グリッドと数値カード", "概要→数値証拠→現場写真→声", "淡桃、ピンク、青緑の声カード", "イベントの実在性と参加後の感想を証明", "参加不安を下げイベント詳細へ接続"],
      ["CAREER COACH", "下中段", "相談内容、無料・時間・回数、写真、利用者の声", "淡緑の大面に条件カードと写真グリッド", "価値→条件→相談場面→声", "淡緑、緑、青・桃の声カード", "無形相談の提供条件を具体化", "費用・拘束時間の不安を処理"],
      ["記事・FAQ・クロージング", "下部", "記事カード、よくある質問、ブランド宣言、相談窓口、企業情報", "白背景のカード群から淡青の宣言、最後にフッター", "学習→反論処理→理念再提示→行動", "白、淡青、青、緑の相談カード", "検討の深さに応じた複数の次行動を用意", "今すぐ申込まない層も記事・相談先へ残す"]
    ],
    copy: ["『モヤモヤしたら、未来が拓く合図。』で不安を前向きな行動サインへ言い換える。", "『はたらくの中に、自分らしさの納得を。』をブランド価値として反復し、2サービスを同じ目的へ束ねる。", "イベント参加とキャリア相談を色・ロゴ・CTAで分け、利用者が自分の課題に合う入口を選べる。"],
    trust: ["開催数、満足度等の数値、実際のイベント・相談写真、複数の利用者の声をサービスごとに配置する。", "無料・時間・回数を明示し、相談サービスの不確実性を下げる。", "PERSOLブランドと外部相談窓口を終盤に置き、個別サービスの信頼を企業基盤へ接続する。"],
    strengths: ["課題共感から2サービス分岐への短い導線", "色分けと同型カードによる比較容易性", "数値・写真・声・FAQの多層証拠"],
    weaknesses: ["横流れの利用者カードは全件把握しにくい", "FVの巨大コピーがSPで人物と競合する", "最終CTAが複数あり主行動が分散する"],
    opportunities: ["悩み別の簡易診断をサービス分岐前に加える", "利用者の声を課題別に絞り込む", "ページ終盤で主CTAを再度二択に集約する"],
    improvements: [["P0", "2サービスの適合判断が自己申告に依存", "分岐カードは説明中心", "3問程度の悩み診断と推奨入口を追加", "誤選択と離脱を減らす", "診断完了率・推奨CTA率"], ["P1", "利用者の声が横流れで比較しにくい", "複数カードが画面外へ続く", "悩み・年代タグと停止可能な一覧を追加", "自分に近い証拠を発見", "声カード詳細率"], ["P2", "終盤の行動が分散", "記事・FAQ・外部相談・各サービスが併存", "最後に2サービスCTAを再集約し外部相談を補助化", "主要CVを明確化", "最終CTA転換率"]],
    candidates: [["C01", "共感コピーと人物の課題喚起FV", "Unit 01"], ["C02", "同型・色分けされた2サービス分岐", "Unit 03"], ["C03", "数値・現場写真・利用者の声の証拠階層", "Unit 04"]],
    db: [["サイト種別", "サービスサイト"], ["業種", "キャリア支援・人材"], ["主要CV", "イベント参加・キャリア相談"], ["構成タイプ", "課題共感・二分岐型"]]
  }
];

const unitFields = (p) => p.units.map((u) => ({
  name: u[0], position: u[1], role: u[2], observed: u[2], layout: u[3], hierarchy: u[4], style: u[5],
  mediumEvaluation: u[6], contribution: u[7], evidence: `${p.id}_SITE_PC_full.pngおよび${p.id}_SITE_SP_full.pngの目視確認`,
  reuse: `${u[3]}と${u[4]}の役割分担`, rights: "rights_unknown。ロゴ、人物・商品写真、固有コピーはrights_excluded。", confidence: "高（PC/SP全体画像を確認）"
}));

const build = (p) => {
  const [pw, ph, sw, sh] = p.dims;
  const source = `/Users/m1_macbook/Library/CloudStorage/Dropbox/design/Design_Research_Library/Web_Research_Library/99_Needs_Review/${p.collectedAt}/daily-intake/${p.id}`;
  return {
    id: p.id, type: "WB", assetType: "Web", label: "Webサイト", title: p.title, sourceName: "SANKOU!",
    sourceDetailUrl: p.sourceDetailUrl, captureUrl: p.captureUrl, officialUrl: p.captureUrl, collectedAt: p.collectedAt,
    analysisDate, cbsStatus: "未同期・ユーザー確認待ち", outputRoot: `deep-analysis/non-lp/${analysisDate}/${p.id}-${p.slug}`,
    sync: {
      analysisStatus: "completed_and_validated",
      notionStatus: "synced_and_verified",
      notionPageUrl: p.notionPage,
      dropboxStatus: "synced_and_verified",
      dropboxPath: `/design/Design_Research_Library/Web_Research_Library/99_Needs_Review/selected/${p.id}-${p.slug}`,
      knowledgeJsonStatus: "validated_with_zero_warnings",
      cbsProductionStatus: "not_applied_user_confirmation_required"
    },
    selectionReason: p.selectionReason,
    images: [
      { slot: "PC Full Page", path: `../01_Normal_Images/${p.id}_SITE_PC_full.png`, status: `${pw}×${ph}px、目視確認済み` },
      { slot: "PC First View", path: `../01_Normal_Images/${p.id}_SITE_PC_first_view.png`, status: `${pw}×900px、目視確認済み` },
      { slot: "PC Section一覧", path: "failure_reason: section_index_not_generated_separately", status: "PC Full Pageで代替" },
      { slot: "SP Full Page", path: `../01_Normal_Images/${p.id}_SITE_SP_full.png`, status: `${sw}×${sh}px、目視確認済み` },
      { slot: "SP First View", path: `../01_Normal_Images/${p.id}_SITE_SP_first_view.png`, status: `${sw}×812px、目視確認済み` },
      { slot: "SP Section一覧", path: "failure_reason: section_index_not_generated_separately", status: "SP Full Pageで代替" }
    ],
    map: [`PC ${pw}×${ph}px、SP ${sw}×${sh}px。`, `構成順: ${p.flow.join(" → ")}。`, "個別Section画像は未生成のため、PC/SP Full Pageを正本証拠とする。", `日次Elementor一次設計は${p.id}_elementor_brain_implementation.pngとJSON・手順書で確認する。`],
    summary: p.summary, audience: p.audience, flow: p.flow, visualFlow: p.visualFlow, units: unitFields(p), copy: p.copy, trust: p.trust,
    variants: [`PCは${pw}px幅で横並び・余白・重なりを活用し、SPは375px幅の単列へ再配置する。`, "PC/SPで章順とCTAの意味は維持されている。", "ホバー、メニュー展開、カルーセル操作状態は静止画未取得。", "Elementor再現は標準Container、見出し、テキスト、画像、ボタンを優先し、CSSは最小限とする。"],
    visualStyle: p.visualStyle, strengths: p.strengths, weaknesses: p.weaknesses, opportunities: p.opportunities,
    improvements: p.improvements.map(([priority, issue, evidence, fix, effect, metric]) => ({ priority, issue, evidence, fix, effect, metric })),
    candidates: p.candidates.map(([id, name, unit]) => ({ id, name, unit, kind: "layout", value: "高", keep: "情報順、役割分担、余白・反復構造", replace: "ロゴ、人物・商品写真、固有コピー、ブランド色", position: unit, slug: name.replaceAll("・", "-"), exclude: "ロゴ、人物・商品写真、固有コピー", instruction: "意味単位を切らず、前後文脈とPC/SP差を含めて再現する。" })),
    rightsExcluded: "ロゴ、人物・商品写真、イベントイラスト、固有コピー、企業ロゴ", referenceOnly: "構成、余白、情報順序、CTAの役割、色分け原則",
    unknowns: [
      { target: "Section一覧", reason: "section_index_not_generated_separately", impact: "境界のピクセル実測不可", alternative: "PC/SP Full Page", next: "必要時にSection画像を生成" },
      { target: "動的状態", reason: "interaction_state_not_captured", impact: "ホバー・展開・自動再生を評価不可", alternative: "静止画と日次実装一次設計", next: "実サイト操作で確認" },
      { target: "権利", reason: "asset_license_unverified", impact: "固有素材を転用不可", alternative: "構造のみreference_only", next: "制作元・ライセンス確認" }
    ],
    profileRows: [["サイト目的", p.summary[0], "PC/SP Full Page"], ["情報設計", p.flow.join(" → "), "章順の目視"], ["ナビゲーション", "主要分類と行動CTAを分離", "First Viewと終盤"], ["サービス導線", "理解・証拠・不安解消後にCTA", "Unit 03〜06"], ["信頼形成", p.trust[0], "画像・数値・カード"], ["PC/SP構造変化", "横組み・重なりから単列へ", "PC/SP比較"], ["問い合わせ導線", "主要CVと補助導線を終盤に再提示", "Unit 05〜06"], ["詳細分析状態", "29章完成・検証対象", "本分析"]],
    transfers: [["B2Bサービス", "課題→選択肢→証拠→FAQ→CTA", "固有写真・コピー・色", "導入成果と料金", "即時購入のみの商材"], ["教育・スクール", "対象別入口と体験証拠", "講師・受講者・カリキュラム", "受講条件", "単一教材の販売"], ["地域・イベント", "物語導入と参加条件の段階提示", "地域・登壇者・会場情報", "日程・アクセス", "短い告知バナー"]],
    tokens: [["背景", p.visualStyle[0], "長尺の章区切り"], ["面", "白または淡色カード", "証拠と本文をまとめる"], ["本文", "高コントラストの濃色・16px相当以上", "可読性確保"], ["強調", "意味を固定したアクセント色", "カテゴリ・行動を区別"], ["CTA", "背景と明確に分離した動詞ラベル", "遷移先と対象を明示"]],
    scores: p.score, scoreDecision: "画像証拠と構造転用価値が十分なため、CBS同期候補とする。",
    databaseRows: [...p.db, ["ページ規模", "長尺1ページ"], ["PC/SP", "both"], ["クレジット", "未確認"], ["詳細分析状態", "完成・検証済み"]],
    evidence: [[p.captureUrl, "公式URL", "取得済み", "URL確認"], [`${p.id}_SITE_PC_full.png`, "PC Full", `${pw}×${ph}px`, "デコード・目視確認"], [`${p.id}_SITE_SP_full.png`, "SP Full", `${sw}×${sh}px`, "デコード・目視確認"], [`${p.id}_elementor_brain_implementation.png`, "実装一次設計", "高精細PNG", "日次生成済み"]],
    sources: [p.captureUrl, p.sourceDetailUrl], history: ["PC/SP全体画像と日次Elementor一次設計を確認。"], sourceDir: source
  };
};

const items = profiles.map(build);
await fs.writeFile(`data/non-lp-deep-analysis-content-${analysisDate}.json`, `${JSON.stringify({ schema_version: "drs-deep-content-1.0", generatedAt: "2026-11-01T02:30:00.000+09:00", items }, null, 2)}\n`);
await fs.writeFile("data/non-lp-deep-analysis-selection.json", `${JSON.stringify({ schema_version: "drs-deep-selection-1.0", runDate: analysisDate, weeklyTop3: profiles.map((p) => ({ id: p.id, status: "selected_for_non_lp_deep_analysis", reason: p.selectionReason })), selected: profiles.map((p) => ({ id: p.id, type: "WB", title: p.title, source: "SANKOU!", url: p.captureUrl, reason: `${p.selectionReason} PC/SP画像とElementor一次設計が揃っている。` })), excluded: [{ id: "WB-0048", status: "recapture_wait", reason: "First Viewが黒い読み込み状態" }, { id: "WB-0053", status: "recapture_wait", reason: "Access Denied画面" }, { id: "WB-0056", status: "recapture_wait", reason: "大きなモーダルが画面を遮蔽" }] }, null, 2)}\n`);

const review = `# 週末レビュー ${analysisDate}\n\n## 今週の収集\n\n- 合計156件: WB 9、GR 30、PT 25、CV 1、PAT 11、ILAC 40、PHAC 40。\n- LP・BN・UIは新規0件。Canvaは1件に留まり、媒体バランスが不足。\n- PATは目標12件に対して11件、PTは日別の欠落があり25件。\n\n## 詳細分析 上位3件\n\n${profiles.map((p, i) => `${i + 1}. ${p.id}｜${p.title}\n   - ${p.selectionReason}\n   - 29章分析、PC/SP画像台帳、再利用候補、同期候補JSONを作成。`).join("\n")}\n\n## 次点・再取得待ち\n\n- 次点: WB-0050（福祉・地域サービス）、WB-0051（コワーキング）、WB-0055（コスメEC）。\n- 再取得待ち: WB-0048（黒い読み込み状態）、WB-0053（Access Denied）、WB-0056（モーダル遮蔽）。\n- 参照のみ: GR・PT・PAT・CV・AC系は週次上位3件の上限により今回は詳細分析しない。削除はしない。\n\n## CBS\n\n- 上位3件を同期候補JSON化し、スキーマ検証後にユーザー確認待ちとする。\n- CBS本番同期は実施しない。\n\n## 次週の強化\n\n- LP、バナー、UI、Canvaの候補源・取得経路を優先して回復する。\n- PAT 2件/日とPTの日次欠落を監視する。\n- WB-0048・0053・0056は遮蔽物を除いた再撮影を行う。\n`;
await fs.mkdir("deep-analysis/weekly-review", { recursive: true });
await fs.writeFile(`deep-analysis/weekly-review/${analysisDate}.md`, review);
console.log(`Prepared ${items.length} weekly analysis records for ${analysisDate}.`);
