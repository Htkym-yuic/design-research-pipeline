#!/usr/bin/env bash
# DIS 日次の「準備」だけを実行する（収集 → 選定 → 比較用の一覧画像）。
#  - 外部への書き込みは一切しない（DRY_RUN=true固定。DIS_ENABLE_WRITES は必ず外す）。Dropbox/Notionの認証情報も使わない。
#  - 結果は outputs/dis/logs/prep-<日付>.log に残し、macOSの通知で知らせる。
#  - 評価・撮影・分析・本番の書き込みは、通知後に人が行う（チャットで一覧画像を見せる）。
set -u

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO" || exit 1

# launchd は PATH が最小限なので、よく使う場所を足す（DIS_EXTRA_PATH で追加も可）
export PATH="${DIS_EXTRA_PATH:+$DIS_EXTRA_PATH:}/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/current/bin:$PATH"

# 安全: 書き込み系は必ず無効にする
unset DIS_ENABLE_WRITES
export DRY_RUN=true

DATE_JST="$(TZ=Asia/Tokyo date +%F)"
LOG_DIR="$REPO/outputs/dis/logs"
LOG="$LOG_DIR/prep-$DATE_JST.log"
mkdir -p "$LOG_DIR"

notify() {
  # $1=本文 $2=タイトル
  [ "${DIS_NOTIFY:-1}" = "0" ] && return 0
  command -v osascript >/dev/null 2>&1 || return 0
  local msg="${1//\"/\'}" title="${2//\"/\'}"
  osascript -e "display notification \"$msg\" with title \"$title\"" >/dev/null 2>&1 || true
}

STATUS=0
{
  echo "== DIS準備 $(TZ=Asia/Tokyo date '+%F %T %Z')  repo=$REPO"
  if ! command -v node >/dev/null 2>&1; then
    echo "node が見つかりません（PATH=$PATH）"
    exit 127
  fi
  CMD="${DIS_RUN_CMD:-npm run -s dis:run -- --stage collect,select,review}"
  echo "+ $CMD"
  bash -c "$CMD"
} >>"$LOG" 2>&1 || STATUS=$?
echo "== 終了コード $STATUS" >>"$LOG"

if [ "$STATUS" -ne 0 ]; then
  notify "準備に失敗しました（コード $STATUS）。ログ: outputs/dis/logs/prep-$DATE_JST.log" "DIS 日次学習"
  exit "$STATUS"
fi

SUMMARY="$(node "$REPO/scripts/dis/prep-summary.mjs" "$REPO/outputs/dis" "$DATE_JST" 2>>"$LOG")"
echo "== 結果: $SUMMARY" >>"$LOG"
notify "$SUMMARY。一覧画像をチャットへ" "DIS 日次学習の準備完了"
exit 0
