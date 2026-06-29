# pocket-claudecode

> [中文](README.md) | English

> **Disclaimer**: The author is not a professional engineer — this project is pure vibe coding. Thanks to Zhipu; Claude Code here is also wired to Zhipu's GLM model.

## Background

When you run Claude Code against other models (e.g. Zhipu GLM), the official remote features aren't available. Away from your computer without a laptop, you can neither see what CC is currently working on nor approve / confirm / advance to the next step — CC just sits there stuck waiting for a permission or a plan choice.

This little tool brings your on-computer CC sessions into Feishu (Lark): from your phone's Feishu you can remotely check CC's running status, approve plans, and send prompts to keep it going. CC's replies are adapted to Feishu's UI (markdown + tables + approval cards) so they read well on mobile. No public IP needed — uses Feishu long-connection.

For: people using Claude Code (including non-official model setups) who want to keep watching progress / approving plans / sending prompts from their phone after stepping away.

---

## How it works

CC runs in tmux on your computer; a local relay connects to Feishu via long-connection and mirrors CC sessions into Feishu groups. You send text in a Feishu group → relay injects it into the matching tmux pane; when CC finishes a reply → a global Stop hook pushes the result back to the group (rendered as a card). Groups are persistently bound by CC's `sessionId`; after `exit`, `claude --resume` with the same sessionId auto-rejoins the original group.

```
Phone Feishu ──(long-connection WS)──► relay(node, tmux "relay", watchdog-supervised)
                              │
            ┌─────────────────┼──────────────────┐
            ▼                 ▼                  ▼
     scan ~/.claude/    tmux send-keys       global Stop/Notification
     sessions/          inject to pane       hooks POST /push
     (discover+name)    (pid→tty→pane)       (with session_id)
            │                                      │
            ▼                                      ▼
     data/registry.json                      relay sends to bound group
     (sessionId↔chat_id)
```

---

## Prerequisites

- Node.js ≥ 20, tmux, `claude` command ([Claude Code](https://claude.com/claude-code))
- Feishu account (enterprise admin or authorized, to configure the bot)
- macOS / Linux native; **Windows users use WSL2** (this project depends on tmux, which Windows doesn't have natively)

## Quick start

Fastest path: hand [SETUP.md](SETUP.md) to your AI assistant (Claude Code / Cursor etc.) to auto-install, or follow it manually. ~15 min (including Feishu config).

One-liner: install deps → get project → `npm install` → configure `.env` → `bin/install-hooks` → start relay → `bin/doctor` verify → Feishu `/list`.

## Feishu config

The self-built Feishu app (create / enable bot / permissions / event subscription / publish) **can only be configured manually on the [open.feishu.cn](https://open.feishu.cn) web console — no CLI**. Follow [docs/feishu-setup.md](docs/feishu-setup.md) to get App ID / App Secret / your open_id into `.env`.

## Configuration (.env)

Copy `.env.example` to `.env` and fill in (see [docs/feishu-setup.md](docs/feishu-setup.md)):

```
FEISHU_APP_ID=cli_...        # Feishu app credentials
FEISHU_APP_SECRET=...
FEISHU_MY_OPEN_ID=ou_...     # your open_id whitelist (only your own messages accepted)
RELAY_PORT=7788              # local push port
POLL_SEC=5                   # sessions scan interval (sec)
```

---

## Usage (Feishu)

**Bot 1:1 chat (console)**:
- `/list` — list all running CC sessions (grouped by project: index · name · time · size · status · bound group)
- `/open <index|name>` — create group `project:name` + bind (use index if names collide)
- `/claude` — CC built-in commands + your skills cheat sheet
- `/help`

**Session group (after binding)**:
- send text directly → injected into the matching claude (when active and in tmux)
- `/status` — capture the session's current tmux screen
- `/history [N]` — last N interaction log entries (default 10)
- `/close` — unbind

**Lifecycle**: `exit` a session in CC → group gets "exited (resumable)" → `/list` shows ⚫ → `claude --resume <name>` → group gets "resumed", keep using the same group.

---

## Recovery (how to bring it back up)

```bash
# 1. Check status
curl -s --max-time 3 http://127.0.0.1:7788/health    # alive→{"ok":true,...,"ws_ready":true}
tmux ls                                                # is there a relay session?

# 2. Bring it up (in the project dir)
tmux new -d -s relay
tmux send-keys -t relay 'cd ~/pocket-claudecode && bin/relay-watchdog' Enter
sleep 6 && curl -s http://127.0.0.1:7788/health       # should be ok:true ws_ready:true
```

| Situation | Fix |
|---|---|
| Watchdog also killed (accidental Ctrl-c in tmux:relay) | restart watchdog (step 2 above) |
| Computer restarted (no tmux server) | `tmux new -d -s relay` then watchdog (no auto-start on boot) |
| relay up but Feishu doesn't reply | `tmux capture-pane -t relay -p \| tail -30`; usually .env creds or global hooks missing |
| Global hooks missing (CC stops but no result pushed) | `bin/install-hooks` (non-destructive merge of ~/.claude/settings.json) |
| Not sure what's broken | `bin/doctor` self-check |

---

## Day-to-day ops

```bash
curl -s http://127.0.0.1:7788/health          # status
tmux attach -t relay                           # live log (Ctrl-b d to detach, not Ctrl-c)
cat ~/pocket-claudecode/data/registry.json       # current sessions + bindings
cat ~/pocket-claudecode/data/logs/<sessionId>.jsonl   # a session's interaction log

# restart relay (under watchdog, new code takes effect)
tmux send-keys -t relay C-c                    # kill relay child, watchdog auto-restarts

# run tests
cd ~/pocket-claudecode && node --test
```

## FAQ

| Symptom | Check |
|---|---|
| Feishu message "read" but no response | claude is still baking (long task) and hasn't stopped; Stop hook pushes after stop. Wait or `/status` for live |
| Group message says "session not in tmux" | that claude runs in a plain terminal, not tmux. Run it in tmux (`bin/cc-start`) to be controllable |
| `/list` misses a session | that claude process isn't in `~/.claude/sessions/` or has exited; check `ls ~/.claude/sessions/` |
| CC stopped but result not pushed | global hooks missing → `bin/install-hooks`; or relay not running → see Recovery |
| relay log says "send message failed" | Feishu token expired / group deleted; relay auto-unbinds deleted groups |

---

## File structure

```
pocket-claudecode/
├─ relay.js            # entry: scan sessions dir + poll + assemble
├─ SETUP.md            # install guide (can be handed to an AI assistant)
├─ lib/
│  ├─ ccsessions.js    # scan ~/.claude/sessions/<pid>.json
│  ├─ registry.js      # sessionId-keyed merge/bind/unbind
│  ├─ tmux.js          # paneForPid(pid→tty→pane) / sendKeys / capturePane
│  ├─ feishu.js        # makeClients / sendToChat / sendCard / patchCard / createGroup / receive msg+card
│  ├─ commands.js      # /list /open /status /history /close /claude + inject + handleCardAction
│  ├─ http.js          # /push (result card / permission content+confirm card) + /health
│  ├─ cardrender.js    # markdown → Feishu card (markdown block + table component)
│  ├─ permissionCard.js # content/confirm/handled card + parseOptions
│  ├─ ccskills.js      # /claude: scan ~/.claude skills into a cheat sheet
│  ├─ log.js           # interaction log append/readTail
│  └─ util.js          # truncate
├─ hooks/
│  ├─ stop_hook.js     # global Stop: POST session_id + last_assistant_message
│  └─ notify_hook.js   # global Notification: POST session_id + message
├─ bin/
│  ├─ cc-start         # start tmux+claude (--resume; default claude, CC_CMD override)
│  ├─ relay-watchdog   # supervise relay, auto-restart on crash/hang (health probe every 10s)
│  ├─ install-hooks    # non-destructive merge of global ~/.claude/settings.json hooks
│  └─ doctor           # dependency & config self-check (check + hint only, no auto-install)
├─ docs/
│  └─ feishu-setup.md  # Feishu self-built app web config guide
├─ data/               # runtime (gitignored)
│  ├─ registry.json    # sessionId→{pid,name,cwd,chat_id,status,...}
│  └─ logs/<sessionId>.jsonl
├─ test/*.test.js      # unit tests, node --test
├─ .env.example        # config template
└─ .env                # actual config (gitignored)
```

## Limitations (known, not done)

- **No auto-start on boot**: watchdog covers relay crash/hang, but after a reboot tmux is gone and needs manual start (see Recovery).
- **Stop hook drops results during relay restart window**: no spool fallback (restart window ~2–10s, low probability).
- **Arrow-key-only permission prompts can't be selected on mobile**: only numeric/text-choosable ones.
- **`/push` has no auth**: bound to 127.0.0.1, other local processes could spoof pushes (fine for personal use; add a token for multi-user).
- **Windows not natively supported**: depends on tmux, use WSL2.
- **Non-tmux claude sessions**: can be discovered/shown/pushed, but can't be injected or screen-captured (injection relies on a tmux pane).

## Dependencies

- Node.js ≥ 20
- `@larksuiteoapi/node-sdk` (Feishu official SDK, long-connection + API)
- `dotenv`
- tmux
- Claude Code (`claude` command)

## License

MIT.
