#!/bin/bash
# Near-real-time 13F capture, run every 2 minutes from cron on the VPS:
#   */2 * * * * /home/debian/stuckless-net/scripts/watch-13f.sh >> /home/debian/watch-13f.log 2>&1
# The daily refresh must hold the same lock, since both use the one clone:
#   30 22 * * * flock /tmp/stuckless-refresh.lock /home/debian/refresh-stuckless.sh >> ...
# A run with nothing new makes one EDGAR request and exits silently. Stock-page
# move markers, the backtest and the five factors catch up in the daily refresh.
set -e
exec 9>/tmp/stuckless-refresh.lock
flock -n 9 || exit 0
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
cd "$HOME/stuckless-net"

ids="$(npm run -s watch-13f)"
[ -n "$ids" ] || exit 0
echo "$(date -u) new 13F: $ids"

git pull --rebase -q origin master
if ! ONLY="$ids" OPENFIGI_API_KEY="$(cat "$HOME/.config/stuckless-net/openfigi-key")" npm run -s refresh-13f; then
  # Leave the tree clean, or the daily refresh's pull would fail too
  git checkout -- public data
  echo "$(date -u) refresh-13f failed"
  exit 1
fi

git add public/superinvestors.json public/superinvestors public/status.json data
git diff --cached --quiet && exit 0
git commit -q -m "13F: $ids ($(date -u +%F))"
for attempt in 1 2 3; do
  if git push -q origin master; then
    echo "$(date -u) pushed $ids"
    exit 0
  fi
  echo "$(date -u) push rejected (attempt $attempt), rebasing onto origin/master"
  git pull --rebase -X theirs -q origin master
done
echo "$(date -u) push failed after 3 attempts"
exit 1
