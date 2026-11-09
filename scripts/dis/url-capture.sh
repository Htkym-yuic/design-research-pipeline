#!/usr/bin/env bash
# URLを指定して、スクリーンショット（撮影）までを実行する。ターミナルにコマンドを打たなくてよいように、ダイアログで聞く。
#  - 外部への書き込みは一切しない（DRY_RUN=true固定。DIS_ENABLE_WRITES は外す）。Dropbox/Notionの認証情報も使わない。
#  - 撮影・分析用テンプレートの作成までを行い、完了したら画像のフォルダをFinderで開く。分析はチャットで行う。
#  - テスト・手動実行用: DIS_MEDIA（lp/web/banner）、DIS_URL、DIS_FROM_ARCHIVE=1、DIS_RUN_CMD（実行コマンドの差し替え）、DIS_PRINT_ONLY=1（組み立てたコマンドを表示するだけ）、DIS_NO_OPEN=1、DIS_NOTIFY=0
set -u

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO" || exit 1
export PATH="${DIS_EXTRA_PATH:+$DIS_EXTRA_PATH:}/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/current/bin:$PATH"
unset DIS_ENABLE_WRITES
export DRY_RUN=true

have_gui() { [ -z "${DIS_NO_GUI:-}" ] && command -v osascript >/dev/null 2>&1; }

notify() {
  [ "${DIS_NOTIFY:-1}" = "0" ] && return 0
  have_gui || return 0
  local msg="${1//\"/\'}" title="${2//\"/\'}"
  osascript -e "display notification \"$msg\" with title \"$title\"" >/dev/null 2>&1 || true
}

# 1) 媒体
MEDIA="${DIS_MEDIA:-}"
if [ -z "$MEDIA" ]; then
  if have_gui; then
    CHOICE="$(osascript -e 'set r to choose from list {"LP", "Webサイト", "バナー"} with title "DIS 撮影" with prompt "どの種類を撮影しますか？" default items {"LP"}
if r is false then return ""
return item 1 of r' 2>/dev/null)"
  else
    printf '種類を選んでください（1=LP 2=Webサイト 3=バナー）: '; read -r n
    case "$n" in 1) CHOICE="LP";; 2) CHOICE="Webサイト";; 3) CHOICE="バナー";; *) CHOICE="";; esac
  fi
  case "$CHOICE" in LP) MEDIA=lp;; Webサイト) MEDIA=web;; バナー) MEDIA=banner;; *) echo "中止しました"; exit 0;; esac
fi
case "$MEDIA" in lp|web|banner) ;; *) echo "媒体が不正です: ${MEDIA}"; exit 2;; esac

# 2) URL
URL="${DIS_URL:-}"
if [ -z "$URL" ]; then
  if have_gui; then
    URL="$(osascript -e 'text returned of (display dialog "撮影したいページのURLを貼り付けてください。" default answer "" with title "DIS 撮影" buttons {"キャンセル", "実行"} default button "実行")' 2>/dev/null)"
  else
    printf 'URL: '; read -r URL
  fi
fi
URL="$(printf '%s' "$URL" | tr -d '[:space:]')"
case "$URL" in http://*|https://*) ;; *) echo "URLが空、または http(s) で始まっていません。中止しました"; exit 2;; esac

# 3) LPアーカイブの紹介ページのときだけ、実ページが開けない場合の選択を聞く
ARCHIVE="${DIS_FROM_ARCHIVE:-}"
case "$URL" in
  https://rdlp.jp/*|http://rdlp.jp/*)
    if [ -z "$ARCHIVE" ] && [ "$MEDIA" != "banner" ] && have_gui; then
      A="$(osascript -e 'button returned of (display dialog "LPアーカイブの紹介ページです。\n実際のLPが公開終了などで開けない場合は、アーカイブの掲載画像で分析できます。" with title "DIS 撮影" buttons {"実ページを撮影", "アーカイブの画像を使う"} default button "実ページを撮影")' 2>/dev/null)"
      [ "$A" = "アーカイブの画像を使う" ] && ARCHIVE=1
    fi;;
esac

DATE_JST="$(TZ=Asia/Tokyo date +%F)"
LOG_DIR="$REPO/outputs/dis/logs"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/url-$(TZ=Asia/Tokyo date +%Y%m%d-%H%M%S).log"

EXTRA=""
[ -n "$ARCHIVE" ] && EXTRA="--from-archive"
CMD="${DIS_RUN_CMD:-node scripts/dis/run.mjs --media ${MEDIA} --url \"${URL}\" ${EXTRA} --stage collect,select,capture,template --capture}"

echo "== DIS 撮影 $(TZ=Asia/Tokyo date '+%F %T')  media=${MEDIA}  url=${URL}  archive=${ARCHIVE:-no}"
echo "+ ${CMD}"
[ -n "${DIS_PRINT_ONLY:-}" ] && exit 0   # テスト用: 組み立てたコマンドを表示するだけで実行しない
STATUS=0
bash -c "$CMD" 2>&1 | tee "$LOG" || true
STATUS="${PIPESTATUS[0]}"
echo "== 終了コード ${STATUS}（ログ: ${LOG}）"

if [ "$STATUS" -ne 0 ]; then
  notify "撮影に失敗しました。ターミナルの表示を確認してください" "DIS 撮影"
  exit "$STATUS"
fi

# 結果のフォルダ（このURLの作業フォルダ）を開く
case "$MEDIA" in lp) LIB="LP";; web) LIB="ウェブ";; banner) LIB="バナー";; esac
OUT="$(ls -td "$REPO"/outputs/dis/"${LIB}"/*/files 2>/dev/null | head -1)"
notify "撮影が完了しました。画像をチャットに添付してください" "DIS 撮影"
if [ -n "$OUT" ]; then
  echo "== 画像の場所: ${OUT}"
  [ -z "${DIS_NO_OPEN:-}" ] && command -v open >/dev/null 2>&1 && open "${OUT}/01_Normal_Images" 2>/dev/null
fi
exit 0
