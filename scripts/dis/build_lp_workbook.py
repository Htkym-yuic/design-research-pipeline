#!/usr/bin/env python3
"""LP台帳ブック（.xlsx）を作る。Googleスプレッドシートに取り込める。新規作成のみ（すでにあれば止まる）。

  python3 scripts/dis/build_lp_workbook.py --out ~/Desktop/LP台帳.xlsx \
      [--ledger-dir ~/Library/CloudStorage/Dropbox/10_デザイン/00_台帳] [--notion <Notionのcsv>]

入力:
  data/lp-master.csv, data/lp-master-sections.csv … npm run dis:lp-master で作る
  --ledger-dir … 00_台帳 にある旧ファイル（LP対応表_案件別リスト.xlsx／対応表_LP_元フォルダ.csv／再撮影コピー結果.csv）を取り込む（任意。読むだけ）
  --notion      … NotionのLPリサーチライブラリーのCSV（メイン訴求・オファー等。任意）
シート: 使い方／案件台帳／LP構成／言語化／保管場所／フォルダ地図／セクション画像一覧／オファー・特典一覧／評価観点／整理メモ
"""
import argparse, csv, os, re, sys
from collections import OrderedDict, defaultdict
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

HEAD_FILL = PatternFill("solid", fgColor="1F2A44"); HEAD_FONT = Font(bold=True, color="FFFFFF")
INPUT_FILL = PatternFill("solid", fgColor="FFF8DC"); AI_FILL = PatternFill("solid", fgColor="E8F0FE"); REF_FILL = PatternFill("solid", fgColor="F1F3F4")
LINK_FONT = Font(color="0563C1", underline="single")
KINDS = ["FV", "悩み提起", "解決策", "商品紹介", "特徴", "ベネフィット", "実績", "流れ", "CTA", "FAQ", "フッター", "その他", "比較", "料金", "会社情報", "ナビ"]

def read_csv(path):
    with open(path, encoding="utf-8-sig", newline="") as f: return list(csv.DictReader(f))

def lp_key(title):
    m = re.match(r"\s*[^\w぀-ヿ一-鿿]*LP-(\d{4})", title or "")
    return f"LP-{m.group(1)}" if m else None

def load_notion(path):
    out = {}
    if not path: return out
    for r in read_csv(path):
        k = lp_key(r.get("タイトル") or r.get("Name") or "")
        if k and k not in out: out[k] = r
    return out

def load_old_ledger(d):
    """00_台帳 の旧ファイル3つを読む。無ければ空。"""
    old = {"xlsx": {}, "origin": {}, "recapture": {}, "found": []}
    if not d: return old
    d = os.path.expanduser(d)
    x = os.path.join(d, "LP対応表_案件別リスト.xlsx")
    if os.path.exists(x):
        wb = load_workbook(x, read_only=True, data_only=True); old["found"].append("LP対応表_案件別リスト.xlsx")
        ws = wb["案件別リスト"] if "案件別リスト" in wb.sheetnames else wb[wb.sheetnames[0]]
        hdr = None
        for row in ws.iter_rows(values_only=True):
            cells = [("" if v is None else str(v)) for v in row]
            if hdr is None:
                if "LP番号" in cells: hdr = {h: i for i, h in enumerate(cells) if h}
                continue
            if "LP番号" not in hdr: continue
            k = cells[hdr["LP番号"]] if hdr["LP番号"] < len(cells) else ""
            if re.fullmatch(r"LP-\d{4}", k):
                old["xlsx"][k] = {h: (cells[i] if i < len(cells) else "") for h, i in hdr.items()}
    c = os.path.join(d, "対応表_LP_元フォルダ.csv")
    if os.path.exists(c):
        old["found"].append("対応表_LP_元フォルダ.csv")
        for r in read_csv(c): old["origin"][r["LP番号"]] = r.get("元フォルダ", "")
    c = os.path.join(d, "再撮影コピー結果.csv")
    if os.path.exists(c):
        old["found"].append("再撮影コピー結果.csv")
        for r in read_csv(c): old["recapture"][r["LP番号"]] = r
    return old

def head(ws, row=1):
    for c in ws[row]:
        c.fill, c.font = HEAD_FILL, HEAD_FONT
        c.alignment = Alignment(wrap_text=True, vertical="center", horizontal="center")

def link(cell, url, text):
    if url: cell.value, cell.hyperlink, cell.font = text, url, LINK_FONT

def widths(ws, ws_widths):
    for i, w in enumerate(ws_widths, 1): ws.column_dimensions[get_column_letter(i)].width = w

def wrap(ws, cols, start=2):
    for col in cols:
        for row in ws.iter_rows(min_row=start, min_col=col, max_col=col):
            for c in row: c.alignment = Alignment(wrap_text=True, vertical="top")

def build(a):
    master = read_csv(a.master)
    secs = [r for r in read_csv(a.sections) if r.get("LP番号")] if os.path.exists(a.sections) else []
    notion = load_notion(a.notion); old = load_old_ledger(a.ledger_dir)
    kinds_by_lp = defaultdict(set)
    for r in secs: kinds_by_lp[r["LP番号"]].add(re.sub(r"^\d+_", "", r["種類"]))
    wb = Workbook()

    # ---- 使い方
    ws = wb.active; ws.title = "使い方"
    lines = [("LP台帳 — 使い方", True), ("", False), ("■ 各シート", True),
        ("案件台帳: LP-0001〜 の一覧と、状況（ステータス・優先度・PC/SPの有無・セクション数・要対応）。案件管理は、ここ。", False),
        ("LP構成: LPごとの構成。16種類のセクションの有無（○／－）、構成の流れ（上から順）、構造から出した所見（総評・いいところ・悪いところ・改善）。", False),
        ("言語化: 自分の問い・感じたこと・訴求の言語化を書く（黄色）。AIが分析して、点数・コメント・改善案を書く（青）。", False),
        ("保管場所: どこに何が入っているか。アーカイブ・フォルダ・全体画像のリンク（クリックでDropboxが開く）、SP画像の出所。", False),
        ("フォルダ地図: Dropboxのフォルダの役割。", False),
        ("セクション画像一覧: セクション画像1枚ごとの一覧とリンク。LP番号や種類で絞り込める。", False),
        ("オファー・特典一覧／評価観点: 特典の整理表と、AIが採点する5観点の目安。", False),
        ("整理メモ: 旧ファイル（00_台帳の3つ）の中身が、どのシートに入ったか。", False), ("", False),
        ("■ 言語化の練習の流れ", True),
        ("1. 保管場所のリンクから、全体画像（またはセクション画像）を見る。", False),
        ("2. 言語化の黄色い欄に、問い・感じたこと・訴求・ターゲット・オファーを書く（灰色の参考は、見ないで書くのがおすすめ）。", False),
        ("3. AI（Claude）に「言語化の未評価の行を評価して」と頼む。青い欄に、AI分析・点数・コメント・改善案が入る。", False),
        ("4. 案件台帳のステータスを更新する（未着手 → 言語化中 → 評価待ち → 完了）。", False), ("", False),
        ("■ 注意", True),
        ("リンクは、Dropboxにログイン中のあなたのアカウントで開ける（共有リンクではない）。", False),
        ("LP構成の所見は、セクションの種類・順番・数から出したもの。画像の見た目（配色・文字・余白・コピーの中身）は、評価していない。", False),
        ("画像は参考専用。権利のため、転用しない。", False)]
    for i, (t, b) in enumerate(lines, 1):
        c = ws.cell(row=i, column=1, value=t); c.font = Font(bold=b, size=14 if i == 1 else 11); c.alignment = Alignment(wrap_text=True, vertical="top")
    ws.column_dimensions["A"].width = 130

    # ---- 案件台帳
    ws = wb.create_sheet("案件台帳")
    ws.append(["LP番号", "案件名", "ステータス", "優先度", "PC", "SP", "PCセクション数", "SPセクション数", "要対応", "メモ"]); head(ws)
    for r in master:
        title = r["タイトル"] + (f"  ［{r['重複']}］" if r.get("重複") else "")
        ws.append([r["LP番号"], title, "未着手", "", r["PC有無"], r["SP有無"], int(r["PCセクション数"] or 0), int(r["SPセクション数"] or 0), r["要対応"], r.get("備考", "")])
        if r["要対応"]: ws.cell(row=ws.max_row, column=9).font = Font(color="C00000")
    widths(ws, [10, 38, 11, 8, 10, 10, 9, 9, 40, 30]); ws.freeze_panes = "C2"; ws.auto_filter.ref = ws.dimensions; wrap(ws, (9, 10))
    for f, col in (('"未着手,言語化中,評価待ち,完了"', "C"), ('"高,中,低"', "D")):
        dv = DataValidation(type="list", formula1=f, allow_blank=True); ws.add_data_validation(dv); dv.add(f"{col}2:{col}{ws.max_row}")

    # ---- LP構成
    ws = wb.create_sheet("LP構成")
    ws.append(["LP番号", "案件名", "構成の型", "PC数", "SP数"] + KINDS + ["構成の流れ（PC順）", "構成の流れ（SP順）", "総評", "いいところ", "悪いところ", "改善すべきところ"]); head(ws)
    for r in master:
        o = old["xlsx"].get(r["LP番号"], {}); sou = o.get("総評", "")
        m = re.search(r"構成の型：([^\n]+)", sou); typ = m.group(1) if m else ""
        ks = kinds_by_lp.get(r["LP番号"], set())
        ws.append([r["LP番号"], r["タイトル"], typ, int(r["PCセクション数"] or 0), int(r["SPセクション数"] or 0)] + ["○" if k in ks else "－" for k in KINDS]
                  + [r.get("PC流れ", ""), r.get("SP流れ", ""), sou, o.get("いいところ", ""), o.get("悪いところ", ""), o.get("改善すべきところ", "")])
    widths(ws, [10, 32, 26, 6, 6] + [6] * 16 + [50, 50, 50, 50, 50, 50]); ws.freeze_panes = "C2"; ws.auto_filter.ref = ws.dimensions
    wrap(ws, (3, 22, 23, 24, 25, 26, 27))
    for row in ws.iter_rows(min_row=2, min_col=6, max_col=21):
        for c in row: c.alignment = Alignment(horizontal="center")

    # ---- 言語化
    ws = wb.create_sheet("言語化")
    heads = ["LP番号", "案件名", "［参考］構成の流れ", "［参考］メイン訴求（Notion）", "自分の問い", "自分の感想・気づき", "訴求（自分の言葉で1文）", "ターゲット", "オファー・特典", "AI分析（要約）",
             "訴求の的確さ(0-5)", "ターゲットの具体性(0-5)", "オファー・特典の把握(0-5)", "構成の理解(0-5)", "言葉の具体性(0-5)", "合計(25)", "AIコメント", "改善案", "評価日", "評価"]
    ws.append(heads); head(ws)
    for i, c in enumerate(ws[1], 1):
        if i in (3, 4): c.fill, c.font = REF_FILL, Font(bold=True)
        elif 5 <= i <= 9: c.fill, c.font = INPUT_FILL, Font(bold=True)
        elif i >= 10: c.fill, c.font = AI_FILL, Font(bold=True)
    for r in master:
        n = notion.get(r["LP番号"], {})
        ws.append([r["LP番号"], r["タイトル"], r.get("PC流れ", "") or r.get("SP流れ", ""), n.get("メイン訴求", ""), "", "", "", "", "", "", None, None, None, None, None, None, "", "", "", "未"])
        row = ws.max_row
        ws.cell(row=row, column=16, value=f'=IF(COUNT(K{row}:O{row})=0,"",SUM(K{row}:O{row}))')
        for col in (3, 4): ws.cell(row=row, column=col).fill = REF_FILL
        for col in range(5, 10): ws.cell(row=row, column=col).fill = INPUT_FILL
        for col in range(10, 21): ws.cell(row=row, column=col).fill = AI_FILL
    widths(ws, [10, 28, 36, 32, 30, 36, 34, 24, 28, 40, 9, 9, 9, 9, 9, 8, 40, 36, 11, 7]); ws.freeze_panes = "C2"; ws.auto_filter.ref = ws.dimensions
    wrap(ws, (3, 4, 5, 6, 7, 8, 9, 10, 17, 18))
    dv = DataValidation(type="whole", operator="between", formula1="0", formula2="5", allow_blank=True, showErrorMessage=True, errorTitle="0〜5の整数", error="0〜5の整数で入力してください"); ws.add_data_validation(dv); dv.add(f"K2:O{ws.max_row}")
    dv3 = DataValidation(type="list", formula1='"未,済,要再評価"', allow_blank=True); ws.add_data_validation(dv3); dv3.add(f"T2:T{ws.max_row}")

    # ---- 保管場所
    ws = wb.create_sheet("保管場所")
    ws.append(["LP番号", "案件名", "アーカイブ（元ページ）", "案件別フォルダ", "PC全体画像", "SP全体画像", "SP画像の出所", "備考"]); head(ws)
    for r in master:
        rc = old["recapture"].get(r["LP番号"], {})
        ws.append([r["LP番号"], r["タイトル"], "", "", "", "", rc.get("追加した画像", ""), " / ".join(x for x in (r["要対応"], r.get("備考", "")) if x)])
        row = ws.max_row
        link(ws.cell(row=row, column=3), r["アーカイブURL"], "アーカイブ"); link(ws.cell(row=row, column=4), r["案件別リンク"], "フォルダ")
        link(ws.cell(row=row, column=5), r["PC全体画像リンク"], "PC全体"); link(ws.cell(row=row, column=6), r["SP全体画像リンク"], "SP全体")
    widths(ws, [10, 34, 12, 10, 10, 10, 22, 40]); ws.freeze_panes = "C2"; ws.auto_filter.ref = ws.dimensions; wrap(ws, (8,))

    # ---- フォルダ地図
    ws = wb.create_sheet("フォルダ地図")
    ws.append(["場所（Dropbox）", "役割", "中身"]); head(ws)
    for row in [
        ("10_デザイン/00_台帳/", "台帳", "このブック（Googleスプレッドシート）へのリンクを置く場所。旧ファイル（xlsx・csv）は整理後に不要"),
        ("10_デザイン/01_言語化ラボ/10_LP/01_案件別/LP-nnnn_名前/", "案件別", "LPごとの全体画像（PC・SP）とFV。名前は「LP-nnnn_名前_<PC|SP>_<全体|FV>.png」"),
        ("10_デザイン/01_言語化ラボ/10_LP/02_セクション別/<NN_種類>/<PC|SP>/", "セクション別", "セクション画像。名前は「LP-nnnn_名前_<PC|SP>_<順番>_<種類>.png」。種類は16（01_FV〜16_ナビ）"),
        ("10_デザイン/02_LP参考資料/91_参考_概観図", "参考", "LPごとの概観図"),
        ("10_デザイン/02_LP参考資料/92_参考_再撮影の別版", "参考", "再撮影の別版（要確認を含む）"),
        ("10_デザイン/02_LP参考資料/93_参考_DIS分析ファイル", "参考", "分析の本文（28章など）。消さない"),
        ("10_デザイン/02_LP参考資料/94_参考_機械分割", "参考", "機械的な分割画像"),
        ("10_デザイン/02_LP参考資料/95_参考_LP番号なしのフォルダ", "参考", "番号のないフォルダ（旧）"),
        ("10_デザイン/02_LP参考資料/96_参考_アーカイブ版", "参考", "アーカイブ画像の試験フォルダ（DIS-LP-0316〜0329）"),
        ("10_デザイン/01_言語化ラボ/20_ホームページ・30_バナー・40_グラフィック・50_あしらい・パーツ・90_練習メモ", "媒体別", "LP以外の媒体の置き場"),
    ]: ws.append(list(row))
    widths(ws, [80, 14, 80]); wrap(ws, (1, 3))

    # ---- セクション画像一覧
    ws = wb.create_sheet("セクション画像一覧")
    ws.append(["LP番号", "案件名", "端末", "順番", "種類", "画像（クリックで開く）"]); head(ws)
    for r in secs:
        ws.append([r["LP番号"], r["タイトル"], r["端末"], int(r["順番"] or 0), r["種類"], ""])
        link(ws.cell(row=ws.max_row, column=6), r["リンク"], r["ファイル名"])
    widths(ws, [10, 34, 6, 6, 14, 60]); ws.freeze_panes = "A2"; ws.auto_filter.ref = ws.dimensions

    # ---- オファー・特典一覧
    ws = wb.create_sheet("オファー・特典一覧")
    ws.append(["LP番号", "案件名", "オファー・特典（Notion原文）", "種類（選択）", "条件・期間", "備考"]); head(ws)
    for r in master:
        n = notion.get(r["LP番号"], {})
        ws.append([r["LP番号"], r["タイトル"], n.get("オファー", ""), "", "", ""])
    widths(ws, [10, 34, 60, 22, 24, 24]); ws.freeze_panes = "C2"; ws.auto_filter.ref = ws.dimensions; wrap(ws, (3,))
    dv = DataValidation(type="list", formula1='"価格・割引,無料体験・相談,プレゼント・特典,返金保証,送料無料,期間限定,数量限定,資料請求,その他"', allow_blank=True); ws.add_data_validation(dv); dv.add(f"D2:D{ws.max_row}")

    # ---- 評価観点
    ws = wb.create_sheet("評価観点")
    ws.append(["観点", "見るもの", "5点（満点）の目安", "3点の目安", "0〜1点の目安"]); head(ws)
    for row in [
        ("訴求の的確さ", "そのLPが、一番伝えたいことを、1文で言い当てているか", "LPの核（誰に・何を・なぜ選ばれるか）を、1文で言い切れている", "方向は合っているが、要点が抜けている・広すぎる", "商品説明の羅列。訴求とは別のことを書いている"),
        ("ターゲットの具体性", "誰向けのLPかを、状況・悩みつきで書けているか", "年齢・状況・悩み・検討の段階まで、具体的", "『30代女性』など、属性だけ", "『みんな』『誰でも』など、特定できない"),
        ("オファー・特典の把握", "特典・価格・条件・期限・保証を、拾えているか", "主なオファーと、条件（期間・数量・保証）まで拾えている", "主なオファーだけ。条件が抜けている", "オファーに触れていない／誤っている"),
        ("構成の理解", "ページの流れと、各セクションの役割を、説明できているか", "流れの意図（なぜこの順か）まで説明できている", "並びは分かるが、意図が弱い", "構成に触れていない"),
        ("言葉の具体性", "数字・固有の言葉・根拠を使って書けているか", "数字や固有の言葉で、第三者が再現できる", "一部具体的。抽象表現が混ざる", "『いい感じ』『おしゃれ』など、抽象的")]: ws.append(list(row))
    widths(ws, [20, 40, 46, 36, 36]); wrap(ws, (1, 2, 3, 4, 5))
    ws.append([]); ws.append(["採点のしかた", "各観点を0〜5点。合計25点。20点以上=よく言語化できている／15〜19点=要点は押さえている／14点以下=見直し"])

    # ---- 整理メモ
    ws = wb.create_sheet("整理メモ")
    ws.append(["旧ファイル（10_デザイン/00_台帳/）", "このブックでの置き場所", "取り込めたか"]); head(ws)
    for name, where in [("LP対応表_案件別リスト.xlsx", "LP構成（構成の流れ・総評・いいところ・悪いところ・改善）／案件台帳／保管場所"), ("対応表_LP_元フォルダ.csv", "取り込まない（旧パイプラインの番号は不要と判断。今後は、Dropboxの格納先との紐付けに切り替える）"), ("再撮影コピー結果.csv", "保管場所（SP画像の出所）")]:
        ws.append([name, where, ("取り込まない" if name.startswith("対応表_") else "取り込み済み") if name in old["found"] else "（今回は未指定）"])
    ws.append([]); ws.append(["確認できたら、旧ファイルは、00_台帳の中の別フォルダ（例: _旧台帳）に移して、しばらく置いてから削除する。"])
    widths(ws, [44, 70, 18])
    return wb, len(master), len(secs), len(notion), old["found"]

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--master", default="data/lp-master.csv"); p.add_argument("--sections", default="data/lp-master-sections.csv")
    p.add_argument("--ledger-dir", default=None); p.add_argument("--notion", default=None); p.add_argument("--out", required=True)
    p.add_argument("--replace", action="store_true", help="すでにあるファイルは、削除せずに、同じフォルダの _旧台帳/ へ日時つきで移してから、新しく作る")
    a = p.parse_args(); a.out = os.path.expanduser(a.out)
    if os.path.exists(a.out) and not a.replace: sys.exit(f"すでにあるため、上書きしません: {a.out}（入れ替えるときは --replace）")
    wb, n, s, nn, found = build(a)
    if os.path.exists(a.out):
        import shutil, time
        bk = os.path.join(os.path.dirname(a.out), "_旧台帳"); os.makedirs(bk, exist_ok=True)
        base, ext = os.path.splitext(os.path.basename(a.out)); dest = os.path.join(bk, f"{base}.{time.strftime('%Y-%m-%dT%H-%M-%S')}{ext}")
        shutil.move(a.out, dest); print(f"古いファイルを移しました（削除していません）: {dest}")
    wb.save(a.out)
    print(f"作成: {a.out}（LP {n} 件／セクション画像 {s} 件／Notion行 {nn} 件／旧ファイル取り込み: {', '.join(found) or 'なし'}）")

if __name__ == "__main__":
    main()
