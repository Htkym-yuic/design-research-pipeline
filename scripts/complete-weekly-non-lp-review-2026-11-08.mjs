import fs from "node:fs/promises";

const analysisDate = "2026-11-08";
const generatedAt = "2026-11-08T01:30:00.000+09:00";

const profiles = [
  {
    id: "WB-0061", slug: "smarthr-recruit", collectedAt: "2026-11-04",
    notionPage: "https://app.notion.com/p/40d24d4fa67181d8843cd58065ef6b10",
    title: "株式会社SmartHR 採用サイト", captureUrl: "https://recruit.smarthr.co.jp/",
    sourceDetailUrl: "https://sankoudesign.com/web/smarthr-recruit/", dims: [1200, 8622, 375, 10678],
    artifact: "artifacts/41673078808/WB-0061-smarthr",
    selectionReason: "社会課題を起点に、会社の現在地、未来、数値証拠、イベント・メディアへ進む採用ストーリーが明快で、採用LPや企業サイトへ転用できる説得構造が最も強い。",
    summary: [
      "『社会変革を、仕事にしよう。』を核に、候補者を求人票ではなく社会課題と企業の挑戦へ招く採用サイト。",
      "課題カード、Company Deck、未来像、Facts、イベント・メディアの順で、共感から企業理解、証拠、接点形成へ進む。",
      "水色から桃色のグラデーションと大きな文字を反復し、採用情報の硬さを抑えつつ、変革志向を一貫して示す。"
    ],
    audience: ["想定: 社会課題への関心が強い転職候補者、新卒・中途のデジタル人材。", "利用文脈: 企業理解、事業の将来性確認、カルチャー探索、イベント・採用情報への遷移。", "認知段階: companyAwareからconsideration。", "障壁: 事業規模・社会的意義・組織の実態・自分との接点が見えにくいこと。"],
    flow: ["変革メッセージと人物で自分事化", "社会課題カードで取り組む理由を具体化", "Company Deckで組織理解へ接続", "未来像と事業写真で方向性を提示", "Factsで規模と実績を証明", "イベント・メディアで低摩擦の次行動を提示", "採用メッセージを再提示して閉じる"],
    visualFlow: "大きな一文と人物から始まり、課題カードの反復、資料・未来像、数値グリッドへ密度を上げ、最後にイベントと記事カードで具体的な接点へ着地する。",
    units: [
      ["ファーストビュー", "最上部", "採用メッセージ、人物、企業ロゴ、主要ナビ", "全幅グラデーション上に大見出しと人物を重ねる", "大見出し→人物→ナビ", "水色・桃・白、極太和文、実写人物", "採用ブランドを求人一覧より先に定義", "社会変革志向の候補者を選別し共感を作る"],
      ["ナビゲーション", "ヘッダーとページ内導線", "企業理解・仕事・人・採用情報への入口", "簡潔な横並びと行動リンク", "情報探索と応募行動を分離", "白地、濃色文字、余白大", "長尺採用サイトの探索負荷を抑える", "候補者の関心段階別に次ページへ送る"],
      ["主要コンテンツ", "上中段", "社会課題、Company Deck、未来像", "カード反復と大きな資料・写真面を交互配置", "課題→会社→未来の因果順", "淡色面、角丸カード、写真、資料モック", "企業の存在理由と現在地を一続きで説明", "共感を企業理解へ変換する"],
      ["証拠・事例", "中下段", "Facts、利用規模、組織・事業の数値", "大きな数字をグリッドで一覧化", "数値→補足ラベル→関連説明", "白地、青紫数字、細い罫線", "抽象的な変革メッセージを定量化", "企業規模と成長性への不安を下げる"],
      ["問い合わせ・コンバージョン", "下段", "イベント、メディア、採用接点", "カード一覧と明確なリンク", "参加・読む・採用情報の低摩擦順", "写真カード、短い見出し、矢印", "応募前の関係形成を複数用意", "温度の低い候補者も接点に残す"],
      ["フッター", "最下部", "採用メッセージ再掲、各種リンク、企業情報", "大きなコピー面の後に整理されたリンク群", "理念再確認→探索リンク", "グラデーション、白、濃色文字", "ページ全体の主張を回収", "再探索と応募検討を促す"]
    ],
    visualStyle: ["水色・青紫・桃色のグラデーションをブランド面として反復。", "大きな和文見出しと細い補足文の差で、採用メッセージと証拠を分ける。", "人物・事業写真は角丸または大面で使い、数値グリッドと交互に配置する。"],
    copy: ["『社会変革を、仕事にしよう。』が候補者の価値観と仕事を直接結びつける。", "社会課題→会社の役割→未来の順で、求人条件より先に応募理由を作る。", "イベント・記事を用意し、応募だけを唯一のCTAにしない。"],
    trust: ["Company Deck、事業写真、規模を示すFacts、イベント・記事を異なる証拠として積み上げる。", "数値の定義や更新日は静止画だけでは確認できず、採用判断では原典確認が必要。"],
    strengths: ["社会課題から企業証拠へ進む採用ストーリー", "大見出しと数値の情報階層", "応募前接点の多様さ"],
    weaknesses: ["主応募CTAが終盤まで弱い", "グラデーションと大文字が続き章差が薄い", "数値の定義・時点が走査読みに弱い"],
    opportunities: ["職種別入口を課題カード後へ追加", "Factsに更新日と定義を併記", "イベント閲覧から採用情報への橋渡しを強化"],
    improvements: [["P0","職種探索への接続が遅い","ブランド理解が先行し具体的求人が遠い","課題カード直後に職種別入口を追加","共感から求人探索への離脱を抑制","職種一覧到達率"],["P1","Factsの意味が瞬時に判別しにくい","大数字は強いが定義が小さい","単位・更新日・意味を数字直下へ固定","証拠の解釈精度を上げる","Facts滞在・採用情報CTR"],["P2","応募前接点から採用導線が分散","イベントと記事が別カード群","各カードに関連職種・採用情報リンクを追加","関心を応募検討へ接続","記事後採用ページ遷移率"]],
    candidates: [["C01","社会課題カードから会社理解への接続","Unit 03"],["C02","大数字のFactsグリッド","Unit 04"],["C03","イベント・メディアの低摩擦CTA","Unit 05"]],
    db: [["サイト種別","採用サイト"],["業種","HR SaaS・IT"],["主要CV","採用情報閲覧・応募・イベント接点"],["構成タイプ","社会課題起点・証拠積層型"]],
    scores: { visual: 19, clarity: 19, originality: 13, reusability: 20, learning: 15, evidence: 10 },
    dis: [["purpose_fit",5,"採用目的と社会変革メッセージが一貫","全ページ","高","応募フォーム以降"],["information_hierarchy",5,"課題→会社→未来→Facts→接点の順序","PC/SP全体","高","動的メニュー"],["visual_flow",4,"大見出し・カード・数字でリズムを形成","PC/SP静止画","高","アニメーション"],["message_copy",5,"仕事と社会変革を直結する主コピー","主要コピー","高","A/B結果"],["trust_safety",4,"Deck・数値・写真・記事の多層証拠","公開画面","中","数値更新日"],["color_legibility",4,"淡色面と濃色文字で可読性を維持","主要Section","高","コントラスト実測"],["layout_spacing",4,"大余白とカード反復が長尺を整理","PC/SP","高","CSS実測"],["visual_brand",5,"グラデーションと太字が採用ブランドを統一","全体","高","ブランド規定"],["implementation_reuse",5,"カード・Facts・記事一覧が標準Widgetで再現可能","主要Section","高","動的CMS配線"]],
    elementor: [
      ["HeaderHero","page > hero(full width) > hero-inner(row)","Site Logo / Nav Menu / Heading / Image / Button","最小高720、左右2列、背景グラデーション","縦積み、人物を見出し下、ナビはMenu Toggle","人物と固有コピーは差替え"],
      ["IssuesAccordion","section > inner > issue-grid","Heading / Text Editor / Icon Box または Accordion","4カードの2〜4列","1列またはAccordion","標準Border・Radius・Gapで再現"],
      ["CompanyDeckFuture","section > inner > media-copy","Heading / Image / Text Editor / Button","資料モックと本文の2列","画像→本文→ボタン","重なりは負Marginを使い過ぎない"],
      ["FactsGrid","section > inner > facts-grid > fact-card","Heading / Counter / Text Editor","3列グリッド","1〜2列","単位はCounter外のTextで管理"],
      ["EventsMedia","section > inner > card-grid","Loop Grid / Image / Heading / Text / Button","3列カード","1列または横スクロールなし","CMS利用時はLoop Grid"],
      ["FooterHero","footer > message > links","Heading / Nav Menu / Icon List / Text","大コピー後にリンク群","縦積み・中央寄せ","CSSなしで順序を維持"]
    ]
  },
  {
    id: "WB-0067", slug: "kyoshin-digital-academy", collectedAt: "2026-11-07",
    notionPage: "https://app.notion.com/p/41024d4fa67181459c24eaf6d33bd290",
    title: "Kyoshin Digital Academy", captureUrl: "https://digital-academy.kyoshin.co.jp/",
    sourceDetailUrl: "https://sankoudesign.com/web/kyoshindigitalacademy/", dims: [1200, 6290, 375, 7607],
    artifact: "artifacts/42250875611/WB-0067-kyoshin-digital-academy",
    selectionReason: "教育企業のDX組織を、Digital Humanという思想、組織・働き方、社員インタビュー、外部記事へ短いページで接続し、採用と企業変革を同時に伝える構造が希少。",
    summary: ["教育企業のDX部門を、技術一覧ではなく『Digital Human』という人物像で表現する組織・採用サイト。", "DX Vision、Organization、How We Work、Interview、Wantedlyの順で、思想から実態、人物、外部接点へ進む。", "黒地と紫の発光表現、巨大英字、カードの横方向リズムで、教育業界に先端性を付与する。"],
    audience: ["想定: 教育DXに関心のあるエンジニア、デザイナー、企画職、社内外の変革関係者。", "利用文脈: 組織の思想・仕事・人の確認、インタビュー閲覧、Wantedlyへの遷移。", "認知段階: companyAwareからinterest。", "障壁: 教育企業のDXが何をする組織か、技術職として成長できるか、誰と働くか。"],
    flow: ["Digital Humanの世界観を提示", "DX Visionで存在理由を説明", "OrganizationとHow We Workで働く構造を具体化", "Interviewで人物証拠を提示", "Wantedly記事で継続的な情報へ接続", "企業リンクを整理して閉じる"],
    visualFlow: "暗いFVの発光モチーフから、白地の説明と黒いカード面を交互に進み、人物カードと記事カードで具体性を上げる。",
    units: [
      ["ファーストビュー","最上部","Digital Human、ロゴ、抽象ビジュアル、ナビ","黒背景に巨大英字と紫の発光形状","英字→人物像の短文→下方向","黒・紫・白、抽象3D、太い英字","DX組織の先端性を一瞬で記憶させる","技術志向の候補者を引き込む"],
      ["ナビゲーション","ヘッダー","Vision、About、Interview、外部採用導線","最小限の横並び","内容探索と外部遷移を分離","黒地、白文字","短いページの現在地を支援","関心の高い章へ直接送る"],
      ["主要コンテンツ","上中段","DX Vision、Organization、How We Work","大見出しと2枚の情報カード","思想→組織→働き方","白・黒の面切替、紫アクセント","抽象ブランドを業務構造へ翻訳","仕事内容の不明瞭さを減らす"],
      ["証拠・事例","中下段","社員インタビュー、顔写真、役割","人物カードを反復","顔→肩書→記事入口","実写、黒カード、白文字","実在する人と経験を証拠化","働く相手とキャリアを想像させる"],
      ["問い合わせ・コンバージョン","下段","Wantedly記事、採用外部リンク","記事カードと外部CTA","記事→外部プロフィール・募集","カード、矢印、紫アクセント","自社サイトで完結しない採用接点を用意","継続閲覧と応募媒体へ送る"],
      ["フッター","最下部","企業・関連リンク、コピーライト","黒背景の簡潔なリンク群","外部情報→企業基盤","黒・白","DX組織を母体企業へ接続","出典と再探索を保証"]
    ],
    visualStyle: ["黒と紫の発光色をブランド核に、白Sectionで可読性を回復。", "巨大英字と短い和文を組み合わせ、未来感と理解可能性を両立。", "人物・記事カードは角丸矩形で統一し、横方向の連続性を作る。"],
    copy: ["Digital Humanを主語にし、DXをシステム導入ではなく人と組織の変化として語る。", "OrganizationとHow We Workで抽象概念を具体化。", "InterviewとWantedlyは読む行動を先に置き、応募圧を下げる。"],
    trust: ["組織説明、働き方、社員の顔・肩書、外部Wantedly記事を証拠として使う。", "職種要件・募集条件・選考導線は外部媒体依存で、ページ内の判断材料は限定的。"],
    strengths: ["教育とDXを結ぶ独自ブランド", "短尺で思想から人物まで到達", "暗色ブランドと白地説明の切替"],
    weaknesses: ["募集職種と条件がページ内で見えにくい", "抽象ビジュアルが業務像を遅らせる", "外部記事への依存が強い"],
    opportunities: ["職種・プロジェクト一覧を追加", "Vision直後に成果事例を置く", "外部遷移前に応募判断情報を要約"],
    improvements: [["P0","募集判断情報が不足","人物・記事はあるが職種条件が薄い","職種、役割、勤務地、働き方の要約を追加","外部遷移前の適合判断を支援","採用媒体遷移後応募率"],["P1","DXの成果が抽象的","Visionと組織説明中心","教育現場のBefore/After事例を1〜2件追加","事業価値の信頼を強化","事例閲覧率"],["P2","暗色カードの連続で章差が弱い","Interviewと記事が類似カード","人物と記事で比率・背景を変える","走査性を改善","下段スクロール深度"]],
    candidates: [["C01","暗色Digital Human FV","Unit 01"],["C02","Organization・How We Workの2カード","Unit 03"],["C03","人物から外部記事へ進む採用導線","Unit 04-05"]],
    db: [["サイト種別","組織紹介・採用サイト"],["業種","教育・DX"],["主要CV","インタビュー閲覧・Wantedly遷移"],["構成タイプ","思想→組織→人物型"]],
    scores: { visual: 19, clarity: 17, originality: 15, reusability: 18, learning: 14, evidence: 9 },
    dis: [["purpose_fit",4,"組織理解と採用接点に集中","全ページ","高","外部応募後"],["information_hierarchy",4,"Vision→組織→人物→記事","PC/SP","高","動的ナビ"],["visual_flow",4,"黒白の面切替とカード反復","静止画","高","モーション"],["message_copy",4,"Digital HumanでDX人材像を定義","主要コピー","高","ブランド定義原文"],["trust_safety",3,"人物と外部記事はあるが成果数値が弱い","公開画面","中","採用条件"],["color_legibility",4,"暗色と白字、白Sectionで可読性確保","主要Section","高","実測"],["layout_spacing",4,"短尺と大余白で章を整理","PC/SP","高","CSS実測"],["visual_brand",5,"黒紫・巨大英字が強い識別性","全体","高","ブランド規定"],["implementation_reuse",4,"標準Containerとカードで大半を再現","主要Section","高","3D・発光表現"]],
    elementor: [
      ["HeaderHero","page > hero > hero-inner","Site Logo / Nav Menu / Heading / Text / Image","最小高760、黒背景、文字と抽象画像を重ねる","縦積み、英字サイズ縮小","発光は画像素材、CSS filterは使わない"],
      ["DXVision","section > inner > copy","Heading / Text Editor / Image","左右2列、大余白","画像→見出し→本文","標準Gapで再現"],
      ["AboutUsCards","section > inner > two-card","Heading / Icon Box / Text / Button","2列カード","1列","OrganizationとHow We Workを別Container"],
      ["InterviewCards","section > inner > people-grid","Loop Grid / Image / Heading / Text","3列","1列または2列","CMSならLoop Item化"],
      ["WantedlyCards","section > inner > article-grid","Loop Grid / Image / Heading / Button","3列","1列","外部リンクを明記"],
      ["Footer","footer > inner","Nav Menu / Icon List / Text","横並び","縦積み","標準Widgetのみ"]
    ]
  },
  {
    id: "WB-0070", slug: "sakurai-dental", collectedAt: "2026-11-08",
    notionPage: "https://app.notion.com/p/41124d4fa6718166b96bcee50de10699",
    title: "桜井歯科医院", captureUrl: "https://www.dental-sakurai.com/",
    sourceDetailUrl: "https://sankoudesign.com/web/sakuraidental/", dims: [1200, 12740, 375, 10594],
    artifact: "artifacts/42390428616/WB-0070-untitled",
    selectionReason: "医療サイトで強い販促を避け、理念、医院の特徴、診療内容、2院のアクセス、ニュース、連絡先を静かな編集デザインで整理しており、信頼優先のサービス設計を補える。",
    summary: ["『歯と長くつきあう場所。』を中心に、治療の即時訴求より継続的な関係と安心を伝える歯科医院サイト。", "理念、特徴、診療内容、2院のアクセス、ニュース、連絡先を大きな余白と実写写真で順に提示する。", "縦組み風の見出し、細い罫線、落ち着いた写真により、医療の緊張を抑えながら専門性を保つ。"],
    audience: ["想定: 地域の患者、継続通院を考える家族、初診前に医院方針とアクセスを確認したい人。", "利用文脈: 医院理解、診療内容確認、通院先選択、アクセス・連絡先確認。", "認知段階: localSearchからconsideration。", "障壁: 治療への不安、医院の考え方、対応診療、場所・連絡方法が分からないこと。"],
    flow: ["関係性を示すコピーと院内写真で安心を作る", "理念を短文で説明", "医院の特徴を写真と番号で提示", "診療内容を整理して適合を確認", "2院のアクセスを比較", "ニュースで運営の現在性を示す", "連絡先とフッターへ着地"],
    visualFlow: "白い余白と静かな写真から始まり、特徴の番号・写真、診療メニューの罫線、アクセス情報へ情報密度を段階的に上げる。",
    units: [
      ["ファーストビュー","最上部","主コピー、院内・人物写真、ロゴ、ナビ","余白の大きい白地にコピーと写真を分離","コピー→写真→下方向","白、黒、淡いベージュ、実写、細字","医療の安心を価格や症例より先に提示","初診時の心理的抵抗を下げる"],
      ["ナビゲーション","ヘッダー","医院紹介、特徴、診療、アクセス、連絡","細い文字の簡潔な横並び","探索項目を均等に提示","白地、黒文字","地域医療サイトの主要情報へ直行","緊急度の異なる目的を支援"],
      ["主要コンテンツ","上中段","理念、医院の特徴、院内写真","見出し・本文・大写真を交互に配置","理念→特徴番号→写真証拠","白、淡色、細罫線、落ち着いた写真","抽象的な安心を空間と運営方針で具体化","医院選択の感情と理解を支援"],
      ["証拠・事例","中段","診療内容、設備・対応、医院写真","罫線付きメニューと写真","カテゴリ→説明→詳細入口","白地、黒、番号、写真","対応範囲と専門性を整理","自分の症状に合うか判断させる"],
      ["問い合わせ・コンバージョン","下段","2院アクセス、電話・連絡先、ニュース","院ごとの情報ブロックと連絡導線","医院選択→場所→連絡","地図・住所・電話、細罫線","来院に必要な実用情報を集約","通院先決定と連絡へ送る"],
      ["フッター","最下部","医院情報、関連リンク、コピーライト","余白のあるリンク・情報群","連絡後の再確認","白、黒、淡色","医療情報を静かに閉じる","出典と再探索を保証"]
    ],
    visualStyle: ["白を主面に、黒と淡いベージュ・グレーだけで落ち着きを作る。", "細い明朝・ゴシックと大きな余白で、医療広告的な圧迫を避ける。", "院内・スタッフ写真を大きく置き、設備説明より先に雰囲気を伝える。"],
    copy: ["『歯と長くつきあう場所。』が治療単発ではなく継続関係を約束する。", "特徴と診療内容は短い見出しと説明に分け、専門語の密度を抑える。", "アクセスと連絡先は院別に分け、地域利用の実務判断を支える。"],
    trust: ["院内写真、運営方針、診療内容、複数院の住所・連絡先、ニュース更新を重ねる。", "医師資格、料金、症例、緊急時対応は静止画範囲で十分確認できず、医療判断では原典確認が必要。"],
    strengths: ["安心を先に作る非販促的FV", "理念から診療・アクセスへの自然な順序", "PC/SPで余白と章順を維持"],
    weaknesses: ["予約方法が強く見えない", "診療項目の詳細到達が長い", "医師・資格証拠が全体構成で弱い"],
    opportunities: ["固定の予約・電話導線を追加", "症状から診療へ進む入口を追加", "医師・設備・衛生方針の証拠を早める"],
    improvements: [["P0","初診行動が見つけにくい","静かなデザインで予約・電話が埋もれる","ヘッダーとSP下部に予約・電話CTAを固定","来院意欲を行動へ接続","予約開始率・電話タップ率"],["P1","症状から診療内容を探しにくい","診療科目中心の整理","症状別入口と対応診療の対応表を追加","医療知識が少ない人の探索を短縮","症状入口利用率"],["P2","専門性の証拠が遅い","理念・空間写真が先行","担当医、資格、衛生・設備の要約を特徴内に追加","安心を根拠で補強","医師紹介閲覧率"]],
    candidates: [["C01","余白と写真の安心型FV","Unit 01"],["C02","番号付き特徴の編集レイアウト","Unit 03"],["C03","2院アクセス比較ブロック","Unit 05"]],
    db: [["サイト種別","医院・地域サービス"],["業種","歯科・医療"],["主要CV","診療確認・電話・来院"],["構成タイプ","信頼先行・地域導線型"]],
    scores: { visual: 18, clarity: 19, originality: 12, reusability: 19, learning: 15, evidence: 10 },
    dis: [["purpose_fit",5,"安心・診療確認・来院情報に集中","全ページ","高","予約後"],["information_hierarchy",5,"理念→特徴→診療→アクセス","PC/SP","高","動的メニュー"],["visual_flow",4,"余白・写真・罫線で静かな流れ","静止画","高","モーション"],["message_copy",5,"継続関係を短い主コピーで表現","主要コピー","高","患者調査"],["trust_safety",4,"院内・診療・アクセスは十分、資格証拠は要確認","公開画面","中","資格・料金"],["color_legibility",5,"白地と黒文字の高い可読性","主要Section","高","実測"],["layout_spacing",5,"余白が医療の緊張を緩和","PC/SP","高","CSS実測"],["visual_brand",4,"縦組み風見出しと静かな写真で識別","全体","高","ブランド規定"],["implementation_reuse",5,"標準Widgetでほぼ再現可能","主要Section","高","縦書き表現"]],
    elementor: [
      ["HeaderHero","page > hero > hero-inner","Site Logo / Nav Menu / Heading / Image / Text","2列、最小高720、余白大","画像→コピーまたはコピー→画像の単列","縦書きは可能なら通常横組みで代替"],
      ["Philosophy","section > inner > copy","Heading / Text Editor / Image","本文と写真の2列","単列","標準Typographyで再現"],
      ["FeaturesEditorial","section > inner > feature-list > feature","Heading / Text / Image / Divider","交互2列、番号表示","画像→番号→見出し→本文","奇偶反転はSPで解除"],
      ["TreatmentMenu","section > inner > treatment-list","Accordion / Heading / Text / Icon List","2列または全幅Accordion","1列Accordion","標準Accordionを優先"],
      ["Access","section > inner > clinic-grid > clinic","Heading / Text / Google Maps / Icon List / Button","2院を2列比較","院ごとに縦積み","電話はtelリンク、地図は標準Widget"],
      ["NewsContactFooter","section > news + contact + footer","Loop Grid / Heading / Text / Button / Nav Menu","ニュース3列、連絡帯、リンク群","すべて1列","予約CTAは標準Buttonで固定案"]
    ],
    cssPolicy: "標準Elementorを優先。縦書きを厳密に再現する場合だけwriting-modeを最小限使用し、未習熟時は横組みで代替する。"
  }
];

const unitFields = (p) => p.units.map((u) => ({ name:u[0], position:u[1], role:u[2], observed:u[2], layout:u[3], hierarchy:u[4], style:u[5], mediumEvaluation:u[6], contribution:u[7], evidence:`${p.id}_SITE_PC_full.png / ${p.id}_SITE_SP_full.pngを目視確認`, reuse:`${u[3]}と${u[4]}の役割分担`, rights:"rights_unknown。ロゴ、人物・院内写真、固有コピーはrights_excluded。", confidence:"高（PC/SP全体画像を確認）" }));

const build = (p) => {
  const [pw,ph,sw,sh] = p.dims;
  return {
    id:p.id, type:"WB", assetType:"Web", label:"Webサイト", title:p.title, sourceName:"SANKOU!", sourceDetailUrl:p.sourceDetailUrl, captureUrl:p.captureUrl, officialUrl:p.captureUrl, collectedAt:p.collectedAt, analysisDate,
    analysisVersion:"drs-deep-1.0+dis-1.0", sourceAnalysisRef:`candidates/non-lp/lightweight-analysis.json#analyses.${p.id}`,
    dailyAgreement:"PC/SP比較と深掘り候補という日次判断は一致。", deepDifference:"全6 Unit、目的・証拠・改善、DIS 9軸、標準Elementor確定設計を追加し、固有素材と再利用構造を分離。",
    cbsStatus:"未同期・ユーザー確認待ち", outputRoot:`deep-analysis/non-lp/${analysisDate}/${p.id}-${p.slug}`,
    sync:{analysisStatus:"completed_and_validated",notionStatus:"pending_weekly_sync",notionPageUrl:p.notionPage,dropboxStatus:"pending_weekly_sync",dropboxPath:`/design/Design_Research_Library/Web_Research_Library/99_Needs_Review/selected/${p.id}-${p.slug}`,knowledgeJsonStatus:"pending_validation",cbsProductionStatus:"not_applied_user_confirmation_required"},
    selectionReason:p.selectionReason,
    images:[{slot:"PC Full Page",path:`../01_Normal_Images/${p.id}_SITE_PC_full.png`,status:`${pw}×${ph}px、目視確認済み`},{slot:"PC First View",path:`../01_Normal_Images/${p.id}_SITE_PC_first_view.png`,status:`${pw}×900px、目視確認済み`},{slot:"PC Section一覧",path:"failure_reason: section_index_not_generated_separately",status:"PC Full Pageで代替"},{slot:"SP Full Page",path:`../01_Normal_Images/${p.id}_SITE_SP_full.png`,status:`${sw}×${sh}px、目視確認済み`},{slot:"SP First View",path:`../01_Normal_Images/${p.id}_SITE_SP_first_view.png`,status:`${sw}×812px、目視確認済み`},{slot:"SP Section一覧",path:"failure_reason: section_index_not_generated_separately",status:"SP Full Pageで代替"}],
    map:[`PC ${pw}×${ph}px、SP ${sw}×${sh}px。`,`構成順: ${p.flow.join(" → ")}。`,"Section一覧画像は未生成のためFull Pageを正本証拠とする。",`Elementor確定設計は03_Implementation_Blueprint/${p.id}_elementor_implementation_guide.mdとJSONに記録。`],
    summary:p.summary,audience:p.audience,flow:p.flow,visualFlow:p.visualFlow,units:unitFields(p),copy:p.copy,trust:p.trust,
    variants:[`PCは${pw}px幅、SPは${sw}px幅。章順と主メッセージは維持。`,"横並びはSPで単列化し、写真・見出し・本文の意味順を保つ。","ホバー、メニュー開閉、カルーセルは静止画未確認。","標準Elementor Container / Widgetを優先し、CSSは原則不使用。"],
    visualStyle:p.visualStyle,strengths:p.strengths,weaknesses:p.weaknesses,opportunities:p.opportunities,
    improvements:p.improvements.map(([priority,issue,evidence,fix,effect,metric])=>({priority,issue,evidence,fix,effect,metric})),
    candidates:p.candidates.map(([id,name,unit])=>({id,name,unit,kind:"layout",value:"高",keep:"情報順、役割、余白、反復構造",replace:"ロゴ、人物・院内写真、固有コピー、ブランド色",position:unit,slug:name.replaceAll("・","-"),exclude:"ロゴ、人物・院内写真、固有コピー",instruction:"前後文脈とPC/SP差を含め、標準Elementorで再現する。"})),
    rightsExcluded:"ロゴ、人物・院内写真、固有コピー、企業固有数値",referenceOnly:"構成、余白、情報順、カード・証拠・CTAの役割",
    unknowns:[{target:"Section一覧",reason:"section_index_not_generated_separately",impact:"境界の個別画像実測不可",alternative:"PC/SP Full Page",next:"必要時にSection画像を生成"},{target:"動的状態",reason:"interaction_state_not_captured",impact:"ホバー・展開・モーション評価不可",alternative:"静止画と一次設計",next:"実サイト操作で確認"},{target:"権利・実績時点",reason:"license_and_update_date_unverified",impact:"固有素材・数値を転用不可",alternative:"構造のみreference_only",next:"原典と権利者を確認"}],
    profileRows:[["サイト目的",p.summary[0],"PC/SP Full Page"],["情報設計",p.flow.join(" → "),"章順の目視"],["ナビゲーション","主要分類と行動導線を分離","FV・フッター"],["信頼形成",p.trust[0],"写真・数値・カード"],["PC/SP構造変化","横組みから単列へ","PC/SP比較"],["詳細分析状態","29章・DIS・Elementor確定設計","本分析"]],
    transfers:[["採用・企業サイト","理念→証拠→人物→接点","固有人物・数値・色","職種・応募条件","即時購入EC"],["教育・医療サービス","安心→特徴→内容→アクセス","専門用語・写真","資格・料金・連絡","短い広告バナー"],["地域サービス","理念→実在証拠→場所・連絡","地域・人物","営業時間・アクセス","全国EC"]],
    tokens:[["背景",p.visualStyle[0],"章の役割を色で固定"],["面","白・淡色または暗色カード","本文と証拠を分離"],["本文","背景と高コントラスト、16px相当以上","可読性"],["強調","アクセント色を1役割に固定","分類・CTA"],["CTA","動詞と遷移先を明示","行動の予測可能性"]],
    scores:p.scores,disScores:p.dis.map(([axis,score,evidence,scope,confidence,unknowns])=>({axis,score,evidence,scope,confidence,unknowns})),scoreDecision:"画像証拠、媒体固有の成立条件、構造転用価値が揃うためCBS同期候補とする。",
    databaseRows:[...p.db,["ページ規模","長尺1ページ"],["PC/SP","both"],["権利","rights_unknown / 固有素材rights_excluded"],["詳細分析状態","完成・検証対象"]],
    evidence:[[p.captureUrl,"公式URL","取得済み","URL確認"],[`${p.id}_SITE_PC_full.png`,"PC Full",`${pw}×${ph}px`,"デコード・目視確認"],[`${p.id}_SITE_SP_full.png`,"SP Full",`${sw}×${sh}px`,"デコード・目視確認"],[`${p.id}_elementor_brain_implementation.png`,"日次一次設計","高精細PNG","確定設計の証拠として参照"]],
    sources:[p.captureUrl,p.sourceDetailUrl],history:["PC/SP全体画像と日次一次分析を確認。","DIS 9軸と標準Elementor確定設計を追加。"],
    sectionCoverage:{required:6,analyzed:6,missing:[]},elementorSections:p.elementor.map(([name,container,widgets,desktop,mobile,notes])=>({name,container,widgets,desktop,mobile,notes})),
    canvaReproduction:"Sectionごとに背景面・写真・見出し・本文・CTAをグループ化し、PC構図を基準にSPは単列で再配置。固有ロゴ・写真・コピーは必ず差し替える。",
    photoshopReproduction:"背景、写真、見出し、本文、装飾、CTAをレイヤー群に分離。写真はスマートオブジェクト、文字は編集可能なまま保持し、固有素材は参照のみ。",
    cssPolicy:p.cssPolicy || "標準Elementorを優先し、背景グラデーションも標準設定で作る。標準機能で成立しない動き・特殊文字組みだけ最小限のCSSを別記録する。",
    artifact:p.artifact
  };
};

const items=profiles.map(build);
await fs.writeFile(`data/non-lp-deep-analysis-content-${analysisDate}.json`,`${JSON.stringify({schema_version:"drs-deep-content-1.0",generatedAt,items},null,2)}\n`);
await fs.writeFile("data/non-lp-deep-analysis-selection.json",`${JSON.stringify({schema_version:"drs-deep-selection-1.0",runDate:analysisDate,weeklyTop3:profiles.map(p=>({id:p.id,status:"selected_for_non_lp_deep_analysis",reason:p.selectionReason})),selected:profiles.map(p=>({id:p.id,type:"WB",title:p.title,source:"SANKOU!",url:p.captureUrl,reason:`${p.selectionReason} PC/SP画像と日次脳内実装が揃っている。`})),next:[{id:"WB-0068",status:"next_candidate",reason:"ファッションECの編集型ビジュアル"},{id:"WB-0069",status:"next_candidate",reason:"採用・企業サイトの情報設計"},{id:"WB-0065",status:"next_candidate",reason:"飲食・店舗ブランドの実務転用"}],excluded:[{id:"WB-0066",status:"recapture_wait",reason:"スクリーンショット取得タイムアウト"}]},null,2)}\n`);

await fs.mkdir("deep-analysis/weekly-review",{recursive:true});
const review=`# 週末レビュー ${analysisDate}\n\n## 今週の収集\n\n- 合計73件: WB 14、GR 35、PT 7、CV 3、PAT 14。\n- LP・BN・UI・ILAC・PHACは新規0件。Canvaは3件。AC系はGitHub runnerで403となりMac補完が未実行。\n- PATは2件/日で14件。PTは7件だが直近5日連続0件。\n\n## 詳細分析 上位3件\n\n${profiles.map((p,i)=>`${i+1}. ${p.id}｜${p.title}\n   - ${p.selectionReason}\n   - 29章、6 Unit、DIS 9軸、Elementor確定設計、同期候補JSONを作成。`).join("\n")}\n\n## 次点・再取得待ち\n\n- 次点: WB-0068、WB-0069、WB-0065。\n- 再取得待ち: WB-0066（撮影タイムアウト）。\n- その他は削除せず、次回候補または参照のみとして保持。\n\n## CBS\n\n- 上位3件を同期候補JSON化し、検証後にユーザー確認待ちとする。\n- CBS本番同期は実施しない。\n\n## 次週の強化\n\n- LP、BN、UI、Canva、日次PTの取得源を優先して回復する。\n- AC系はMacローカル補完の起動条件と実行結果を監視する。\n- WB-0066を再撮影する。\n`;
await fs.writeFile(`deep-analysis/weekly-review/${analysisDate}.md`,review);

for (const item of items) {
  const root=item.outputRoot;
  const normal=`${root}/01_Normal_Images`;
  const notion=`${root}/02_Notion_Images`;
  const blueprint=`${root}/03_Implementation_Blueprint`;
  await Promise.all([fs.mkdir(normal,{recursive:true}),fs.mkdir(notion,{recursive:true}),fs.mkdir(blueprint,{recursive:true})]);
  for (const name of [`${item.id}_SITE_PC_full.png`,`${item.id}_SITE_PC_first_view.png`,`${item.id}_SITE_SP_full.png`,`${item.id}_SITE_SP_first_view.png`,`${item.id}_reference.png`]) {
    await fs.copyFile(`${item.artifact}/${name}`,`${normal}/${name}`);
  }
  for (const name of [`${item.id}_SITE_PC_first_view_notion.jpg`,`${item.id}_SITE_SP_first_view_notion.jpg`,`${item.id}_reference_notion.jpg`]) {
    await fs.copyFile(`${item.artifact}/${name}`,`${notion}/${name}`);
  }
  for (const name of [`${item.id}_elementor_brain_implementation.png`,`${item.id}_elementor_brain_implementation_notion.jpg`]) {
    await fs.copyFile(`${item.artifact}/03_Implementation_Blueprint/${name}`,`${blueprint}/${name}`);
  }
  const blueprintJson={schema_version:"elementor-blueprint-1.1",status:"weekly_deep_analysis_confirmed",id:item.id,analysis_date:analysisDate,principles:{standard_elementor_first:true,atomic_elements:"optional_only",css:item.cssPolicy},sections:item.elementorSections,pc_sp:{desktop:"横並び・大余白・原画像の章順",mobile:"意味順を維持して単列化。タップ対象は44px以上を推奨"},unconfirmed:item.unknowns.map(x=>({target:x.target,reason:x.reason,next:x.next}))};
  await fs.writeFile(`${blueprint}/${item.id}_elementor_implementation.json`,`${JSON.stringify(blueprintJson,null,2)}\n`);
  const guide=`# ${item.id} 標準Elementor脳内実装・確定版\n\n## 方針\n\n- Containerと標準Widgetを優先し、Atomic Elementsは補助案に限定する。\n- ${item.cssPolicy}\n- ロゴ、人物・院内写真、固有コピーは再利用せず、構造だけを参考にする。\n\n## 作成順\n\n${item.elementorSections.map((s,i)=>`### ${i+1}. ${s.name}\n\n- Container: ${s.container}\n- 入れるWidget: ${s.widgets}\n- PC: ${s.desktop}\n- SP: ${s.mobile}\n- 注意: ${s.notes}`).join("\n\n")}\n\n## 確認事項\n\n${item.unknowns.map(x=>`- ${x.target}: ${x.reason}。${x.next}。`).join("\n")}\n`;
  await fs.writeFile(`${blueprint}/${item.id}_elementor_implementation_guide.md`,guide);
}
console.log(`Prepared ${items.length} weekly analysis records for ${analysisDate}.`);
