#!/usr/bin/env python3
"""案件台帳ブック（.xlsx）を作る。Googleスプレッドシートに取り込める。新規作成のみ（すでにあれば止まる）。

  python3 scripts/dis/build_lp_workbook.py --out ~/Desktop/LP案件台帳.xlsx [--notion <Notionのcsv>]

入力: data/lp-master.csv と data/lp-master-sections.csv（npm run dis:lp-master で作る）
      --notion: NotionのLPリサーチライブラリーを CSV で書き出したもの（メイン訴求・オファー・カテゴリ等を入れる。任意）
シート: 使い方／案件台帳／セクション一覧／言語化ワーク／評価観点／オファー・特典一覧
"""
import argparse, csv, os, re, sys
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

HEAD_FILL = PatternFill("solid", fgColor="1F2A44")
HEAD_FONT = Font(bold=True, color="FFFFFF")
INPUT_FILL = PatternFill("solid", fgColor="FFF8DC")   # あなたが書く欄
AI_FILL = PatternFill("solid", fgColor="E8F0FE")      # AIが書く欄
REF_FILL = PatternFill("solid", fgColor="F1F3F4")     # 参考（Notion）
LINK_FONT = Font(color="0563C1", underline="single")
THIN = Side(style="thin", color="D0D0D0")

def read_csv(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))

def lp_key(title):
    m = re.match(r"\s*(?:[^\wぁ-んァ-ヶ一-龥]*)?LP-(\d{4})", title or "")
    return f"LP-{m.group(1)}" if m else None

def load_notion(path):
    out = {}
    if not path: return out
    for r in read_csv(path):
        k = lp_key(r.get("タイトル") or r.get("Name") or "")
        if k and k not in out: out[k] = r
    return out

def style_header(ws, row=1, fill=HEAD_FILL):
    for c in ws[row]:
        c.fill, c.font = fill, HEAD_FONT if fill is HEAD_FILL else Font(bold=True)
        c.alignment = Alignment(wrap_text=True, vertical="center", horizontal="center")

def link(cell, url, text):
    if url:
        cell.value, cell.hyperlink, cell.font = text, url, LINK_FONT

def widths(ws, ws_widths):
    for i, w in enumerate(ws_widths, 1): ws.column_dimensions[get_column_letter(i)].width = w

def build(args):
    master = read_csv(args.master)
    secs = [r for r in read_csv(args.sections) if r.get("LP番号")] if os.path.exists(args.sections) else []
    notion = load_notion(args.notion)
    wb = Workbook()

    # ---- 使い方
    ws = wb.active; ws.title = "使い方"
    lines = [
        ("LP案件台帳 — 使い方", True),
        ("", False),
        ("■ シートの役割", True),
        ("案件台帳: LP-0001〜 の一覧。PC/SPの有無、セクション構成、全体画像・フォルダへのリンク（クリックでDropboxが開く）、状況、要対応。", False),
        ("セクション一覧: セクション画像1枚ごとの一覧（LP・端末・順番・種類・リンク）。LP番号や種類で絞り込める。", False),
        ("言語化ワーク: LPごとに、あなたが「訴求・ターゲット・オファー・構成の特徴」を自分の言葉で書く（黄色の欄）。AIが評価して、青い欄（点数・コメント・改善案）に書き込む。灰色の欄は、参考（Notionの分析）。", False),
        ("評価観点: AIが採点する5つの観点と、0〜5点の目安。", False),
        ("オファー・特典一覧: LPが出している特典・割引・保証などを、種類別に整理する表。", False),
        ("", False),
        ("■ 言語化の練習の流れ", True),
        ("1. 案件台帳のリンクから、全体画像（または、セクション画像）を見る。", False),
        ("2. 言語化ワークの黄色い欄に、訴求・ターゲット・オファー・構成の特徴を書く（参考の灰色は、見ないで書くのがおすすめ）。", False),
        ("3. 書けたら、AI（Claude）に「言語化ワークの未評価の行を評価して」と頼む。AIが青い欄に、点数・コメント・改善案を書く。", False),
        ("4. 案件台帳のステータスを更新する（未着手 → 言語化中 → 評価待ち → 完了）。", False),
        ("", False),
        ("■ 注意", True),
        ("リンクは、Dropboxにログイン中のあなたのアカウントで開ける（共有リンクではない）。", False),
        ("画像（アーカイブ画像）は、参考専用。権利のため、転用しない。", False),
    ]
    for i, (t, b) in enumerate(lines, 1):
        c = ws.cell(row=i, column=1, value=t); c.font = Font(bold=b, size=14 if i == 1 else 11); c.alignment = Alignment(wrap_text=True, vertical="top")
    ws.column_dimensions["A"].width = 120

    # ---- 案件台帳
    ws = wb.create_sheet("案件台帳")
    head = ["LP番号", "タイトル", "ステータス", "優先度", "PC", "SP", "PCセクション数", "SPセクション数", "PC構成", "SP構成", "アーカイブ（元ページ）", "案件別フォルダ", "PC全体画像", "SP全体画像", "メイン訴求（Notion）", "オファー・特典（Notion）", "カテゴリ", "業種", "コピータイプ", "要対応", "メモ"]
    ws.append(head); style_header(ws)
    for r in master:
        n = notion.get(r["LP番号"], {})
        title = r["タイトル"] + (f"  ［{r['重複']}］" if r.get("重複") else "")
        ws.append([r["LP番号"], title, "未着手", "", r["PC有無"], r["SP有無"], int(r["PCセクション数"] or 0), int(r["SPセクション数"] or 0), r["PC構成"], r["SP構成"], "", "", "", "", n.get("メイン訴求", ""), n.get("オファー", ""), n.get("カテゴリ", ""), n.get("業種タグ", ""), n.get("コピータイプ", ""), r["要対応"], ""])
        row = ws.max_row
        link(ws.cell(row=row, column=11), r["アーカイブURL"], "開く")
        link(ws.cell(row=row, column=12), r["案件別リンク"], "フォルダ")
        link(ws.cell(row=row, column=13), r["PC全体画像リンク"], "PC")
        link(ws.cell(row=row, column=14), r["SP全体画像リンク"], "SP")
        if r["要対応"]: ws.cell(row=row, column=20).font = Font(color="C00000")
    widths(ws, [10, 34, 11, 8, 8, 8, 9, 9, 42, 42, 12, 10, 8, 8, 40, 40, 10, 16, 24, 30, 24])
    ws.freeze_panes = "C2"; ws.auto_filter.ref = ws.dimensions
    for col in (9, 10, 15, 16, 19, 20):
        for row in ws.iter_rows(min_row=2, min_col=col, max_col=col):
            for c in row: c.alignment = Alignment(wrap_text=True, vertical="top")
    dv = DataValidation(type="list", formula1='"未着手,言語化中,評価待ち,完了"', allow_blank=True); ws.add_data_validation(dv); dv.add(f"C2:C{ws.max_row}")
    dv2 = DataValidation(type="list", formula1='"高,中,低"', allow_blank=True); ws.add_data_validation(dv2); dv2.add(f"D2:D{ws.max_row}")

    # ---- セクション一覧
    ws = wb.create_sheet("セクション一覧")
    ws.append(["LP番号", "タイトル", "端末", "順番", "種類", "画像（クリックで開く）"]); style_header(ws)
    for r in secs:
        ws.append([r["LP番号"], r["タイトル"], r["端末"], int(r["順番"] or 0), r["種類"], ""])
        link(ws.cell(row=ws.max_row, column=6), r["リンク"], r["ファイル名"])
    widths(ws, [10, 34, 6, 6, 14, 60]); ws.freeze_panes = "A2"; ws.auto_filter.ref = ws.dimensions

    # ---- 言語化ワーク
    ws = wb.create_sheet("言語化ワーク")
    head = ["LP番号", "タイトル", "［参考］メイン訴求（Notion）", "［参考］オファー（Notion）",
            "あなたの言語化: 訴求（1文）", "ターゲット", "オファー・特典", "構成の特徴", "気づき・メモ",
            "訴求の的確さ(0-5)", "ターゲットの具体性(0-5)", "オファー・特典の把握(0-5)", "構成の理解(0-5)", "言葉の具体性(0-5)", "合計(25)",
            "AIコメント", "改善案", "評価日", "評価"]
    ws.append(head); style_header(ws)
    for i, c in enumerate(ws[1], 1):
        if i in (3, 4): c.fill, c.font = REF_FILL, Font(bold=True)
        elif 5 <= i <= 9: c.fill, c.font = INPUT_FILL, Font(bold=True)
        elif i >= 10: c.fill, c.font = AI_FILL, Font(bold=True)
    for r in master:
        n = notion.get(r["LP番号"], {})
        ws.append([r["LP番号"], r["タイトル"], n.get("メイン訴求", ""), n.get("オファー", ""), "", "", "", "", "", None, None, None, None, None, None, "", "", "", "未"])
        row = ws.max_row
        ws.cell(row=row, column=15, value=f'=IF(COUNT(J{row}:N{row})=0,"",SUM(J{row}:N{row}))')
        for col in (3, 4): ws.cell(row=row, column=col).fill = REF_FILL
        for col in range(5, 10): ws.cell(row=row, column=col).fill = INPUT_FILL
        for col in range(10, 20): ws.cell(row=row, column=col).fill = AI_FILL
        for col in (3, 4, 5, 6, 7, 8, 9, 16, 17): ws.cell(row=row, column=col).alignment = Alignment(wrap_text=True, vertical="top")
    widths(ws, [10, 28, 36, 30, 36, 24, 28, 28, 28, 9, 9, 9, 9, 9, 8, 40, 36, 11, 7])
    ws.freeze_panes = "C2"; ws.auto_filter.ref = ws.dimensions
    dv = DataValidation(type="whole", operator="between", formula1="0", formula2="5", allow_blank=True, showErrorMessage=True, errorTitle="0〜5の整数", error="0〜5の整数で入力してください"); ws.add_data_validation(dv); dv.add(f"J2:N{ws.max_row}")
    dv3 = DataValidation(type="list", formula1='"未,済,要再評価"', allow_blank=True); ws.add_data_validation(dv3); dv3.add(f"S2:S{ws.max_row}")

    # ---- 評価観点
    ws = wb.create_sheet("評価観点")
    ws.append(["観点", "見るもの", "5点（満点）の目安", "3点の目安", "0〜1点の目安"]); style_header(ws)
    for row in [
        ("訴求の的確さ", "そのLPが、一番伝えたいことを、1文で言い当てているか", "LPの核（誰に・何を・なぜ選ばれるか）を、1文で言い切れている。Notionの分析と同じ方向", "方向は合っているが、要点が抜けている・広すぎる", "商品説明の羅列。訴求とは別のことを書いている"),
        ("ターゲットの具体性", "誰向けのLPかを、状況・悩みつきで書けているか", "年齢・状況・悩み・検討の段階まで、具体的", "『30代女性』など、属性だけ", "『みんな』『誰でも』など、特定できない"),
        ("オファー・特典の把握", "特典・価格・条件・期限・保証を、拾えているか", "主なオファーと、条件（期間・数量・保証）まで拾えている", "主なオファーだけ。条件が抜けている", "オファーに触れていない／誤っている"),
        ("構成の理解", "ページの流れ（FV→…→CTA）と、各セクションの役割を、説明できているか", "流れの意図（なぜこの順か）まで説明できている", "セクションの並びは分かるが、意図が弱い", "構成に触れていない"),
        ("言葉の具体性", "数字・固有の言葉・根拠を使って書けているか", "数字や固有の言葉で、第三者が再現できる", "一部具体的。抽象表現が混ざる", "『いい感じ』『おしゃれ』など、抽象的"),
    ]: ws.append(list(row))
    widths(ws, [20, 40, 46, 36, 36])
    for row in ws.iter_rows(min_row=2):
        for c in row: c.alignment = Alignment(wrap_text=True, vertical="top")
    ws.append([]); ws.append(["採点のしかた", "各観点を0〜5点。合計25点。20点以上=よく言語化できている／15〜19点=要点は押さえている／14点以下=見直し"])

    # ---- オファー・特典一覧
    ws = wb.create_sheet("オファー・特典一覧")
    ws.append(["LP番号", "タイトル", "オファー・特典（Notion原文）", "種類（選択）", "条件・期間", "備考"]); style_header(ws)
    for r in master:
        n = notion.get(r["LP番号"], {})
        ws.append([r["LP番号"], r["タイトル"], n.get("オファー", ""), "", "", ""])
        ws.cell(row=ws.max_row, column=3).alignment = Alignment(wrap_text=True, vertical="top")
    widths(ws, [10, 34, 60, 22, 24, 24]); ws.freeze_panes = "C2"; ws.auto_filter.ref = ws.dimensions
    dv = DataValidation(type="list", formula1='"価格・割引,無料体験・相談,プレゼント・特典,返金保証,送料無料,期間限定,数量限定,資料請求,その他"', allow_blank=True); ws.add_data_validation(dv); dv.add(f"D2:D{ws.max_row}")
    return wb, len(master), len(secs), len(notion)

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--master", default="data/lp-master.csv"); p.add_argument("--sections", default="data/lp-master-sections.csv")
    p.add_argument("--notion", default=None); p.add_argument("--out", required=True)
    a = p.parse_args(); a.out = os.path.expanduser(a.out)
    if os.path.exists(a.out): sys.exit(f"すでにあるため、上書きしません: {a.out}")
    wb, n, s, nn = build(a); wb.save(a.out)
    print(f"作成: {a.out}（LP {n} 件／セクション画像 {s} 件／Notion行 {nn} 件）")

if __name__ == "__main__":
    main()
