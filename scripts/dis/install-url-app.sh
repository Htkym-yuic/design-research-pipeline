#!/usr/bin/env bash
# デスクトップに「DIS URL撮影」アプリを作る（ダブルクリックで、種類とURLを聞いて撮影まで実行する）。
#   bash scripts/dis/install-url-app.sh            作成
#   bash scripts/dis/install-url-app.sh --remove   削除
set -u
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP="${HOME}/Desktop/DIS URL撮影.app"
if [ "${1:-}" = "--remove" ]; then rm -rf "$APP" && echo "削除しました: ${APP}"; exit 0; fi
command -v osacompile >/dev/null 2>&1 || { echo "osacompile が見つかりません（macOSで実行してください）"; exit 1; }
case "$REPO" in "$HOME/Documents"*|"$HOME/Desktop"*|"$HOME/Downloads"*) echo "注意: 保護されたフォルダ内のため、アプリから実行できない場合があります。~/design-research-pipeline-auto を使ってください。";; esac
rm -rf "$APP"
osacompile -o "$APP" -e "tell application \"Terminal\"" -e "activate" -e "do script \"bash '${REPO}/scripts/dis/url-capture.sh'\"" -e "end tell" && echo "作成しました: ${APP}（ダブルクリックで実行）"
