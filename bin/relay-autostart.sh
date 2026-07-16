#!/usr/bin/env bash
# launchd 开机调用：起 tmux:relay + 看门狗。
# relay 在 tmux:relay 跑（可 tmux attach -t relay 看日志），看门狗监督 relay 崩/卡自愈。
# 已有 relay session 则跳过（幂等，可重复跑）。
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/node/bin:$PATH"
PROJ="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJ" || exit 1
if tmux has-session -t relay 2>/dev/null; then
  exit 0  # 已有 relay session（看门狗在跑），不重复起
fi
tmux new -d -s relay
sleep 1
tmux send-keys -t relay 'bin/relay-watchdog' Enter
