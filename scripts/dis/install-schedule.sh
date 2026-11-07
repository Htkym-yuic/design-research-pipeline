#!/usr/bin/env bash
# DIS 日次の準備を、macOSの launchd に登録／解除する（あなたのMacで、あなたが実行する）。
#   登録:  bash scripts/dis/install-schedule.sh [--hour 6] [--minute 0]
#   解除:  bash scripts/dis/install-schedule.sh --uninstall
#   状態:  bash scripts/dis/install-schedule.sh --status
set -eu
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LABEL="jp.design-research.dis-prep"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"
HOUR=6; MINUTE=0; ACTION=install
while [ $# -gt 0 ]; do
  case "$1" in
    --hour) HOUR="$2"; shift 2;;
    --minute) MINUTE="$2"; shift 2;;
    --uninstall) ACTION=uninstall; shift;;
    --status) ACTION=status; shift;;
    *) echo "不明な引数: $1"; exit 2;;
  esac
done
case "$ACTION" in
  status)
    if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then echo "登録済み: $LABEL"; [ -f "$PLIST" ] && grep -A2 StartCalendarInterval "$PLIST" | tr -d '\n' && echo; else echo "未登録"; fi;;
  uninstall)
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"; echo "解除しました: $LABEL";;
  install)
    case "$HOUR$MINUTE" in *[!0-9]*) echo "時刻は数字で指定してください"; exit 2;; esac
    [ "$HOUR" -le 23 ] && [ "$MINUTE" -le 59 ] || { echo "時刻が範囲外です"; exit 2; }
    mkdir -p "$HOME/Library/LaunchAgents" "$REPO/outputs/dis/logs"
    sed -e "s|{{REPO}}|$REPO|g" -e "s|{{HOUR}}|$HOUR|g" -e "s|{{MINUTE}}|$MINUTE|g" \
      "$REPO/scripts/dis/launchd/$LABEL.plist.template" > "$PLIST"
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    launchctl bootstrap "$DOMAIN" "$PLIST"
    echo "登録しました: 毎日 $(printf '%02d:%02d' "$HOUR" "$MINUTE")（Macのローカル時刻）に準備を実行します。"
    echo "ログ: $REPO/outputs/dis/logs/   解除: bash scripts/dis/install-schedule.sh --uninstall";;
esac
