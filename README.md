# pocket-claudecode

> [English](README_en.md) | 中文

> **声明**：作者非专业工程师，本项目纯 vibe coding 完成。感谢智谱——Claude Code 接的也是智谱 GLM 模型。

## 背景

用 Claude Code 接其他模型（如智谱 GLM）干活时，没法用官方远程功能。出门在外没带电脑，手机上既看不到 CC 正在跑的任务进度，也没法审批 / 确认 / 执行下一步——CC 在等权限或等选方案时就那么卡着。

这个小工具把电脑上 CC 的会话搬到飞书：手机飞书远程查看 CC 运行情况、审批方案、发指令继续往下跑。CC 的回复内容已按飞书 UI 适配渲染（markdown + 表格 + 审批卡片），手机上看着方便。无需公网 IP，走飞书长连接。

适合：用 Claude Code（含接非官方模型的）干活、想离开电脑后用手机继续盯进度 / 批方案 / 发指令的人。

---

## 工作原理

电脑上的 Claude Code 在 tmux 里跑；一个本地 relay 服务连飞书长连接，把 CC 的会话镜像到飞书群。你在飞书群里发文本 → relay 注入到对应 tmux pane；CC 回复完 → 全局 Stop hook 把结果推回群里（卡片渲染）。按 CC 的 `sessionId` 持久绑定群，`exit` 后 `claude --resume` 同 sessionId 自动接回原群。

```
手机飞书 ──(长连接 WS)──► relay(node, tmux "relay", 看门狗监督)
                              │
            ┌─────────────────┼──────────────────┐
            ▼                 ▼                  ▼
     扫 ~/.claude/      tmux send-keys       全局 Stop/Notification
     sessions/          注入到对应 pane       hooks POST /push
     (发现+名)          (pid→tty→pane)       (带 session_id)
            │                                      │
            ▼                                      ▼
     data/registry.json                      relay 发到绑定的群
     (sessionId↔chat_id)
```

---

## 前置条件

- Node.js ≥ 20、tmux、`claude` 命令（[Claude Code](https://claude.com/claude-code)）
- 飞书账号（企业管理员或获授权，用于配机器人）
- macOS / Linux 原生；**Windows 用户用 WSL2**（本项目依赖 tmux，Windows 原生无）

## 快速开始

最快路径：把 [SETUP.md](SETUP.md) 整份丢给你的 AI 助手（Claude Code / Cursor 等）让它自动装，或照着人工走。约 15 分钟（含飞书配置）。

一句话流程：装依赖 → 拿项目 → `npm install` → 配 `.env` → `bin/install-hooks` → 起 relay → `bin/doctor` 验证 → 飞书发 `/list`。

## 飞书配置

飞书自建应用（创建/启用机器人/权限/事件订阅/发布版本）**只能在 [open.feishu.cn](https://open.feishu.cn) 网页手动配，没有 CLI**。按 [docs/feishu-setup.md](docs/feishu-setup.md) 走一遍，拿到 App ID / App Secret / 你的 open_id 填进 `.env`。

## 配置（.env）

复制 `.env.example` 为 `.env` 填值（详见 [docs/feishu-setup.md](docs/feishu-setup.md)）：

```
FEISHU_APP_ID=cli_...        # 飞书应用凭证
FEISHU_APP_SECRET=...
FEISHU_MY_OPEN_ID=ou_...     # 你的 open_id 白名单（只接受你本人消息）
RELAY_PORT=7788              # 本地 push 端口
POLL_SEC=5                   # 扫 sessions 间隔（秒）
```

---

## 使用（飞书）

**单聊机器人（控制台）**：
- `/list` — 列所有运行中 CC 会话（按项目分组：序号 · 名 · 时间 · 大小 · 状态 · 绑群）
- `/open <序号|对话名>` — 建群 `项目:对话名` + 绑定（重名用序号）
- `/claude` — CC 内置命令 + 你的 skills 备忘清单
- `/help`

**会话群（绑定后）**：
- 直接发文本 → 注入到对应 claude（active 且在 tmux 时）
- `/status` — 截该会话 tmux 当前屏
- `/history [N]` — 近 N 条交互日志（默认 10）
- `/close` — 解绑

**生命周期**：CC 里 `exit` 会话 → 群里收「已退出（可 resume）」→ `/list` 变 ⚫ → `claude --resume <名>` → 群里收「已恢复」，原群接着用。

---

## 故障恢复（挂了怎么拉起来）

```bash
# 1. 判断状态
curl -s --max-time 3 http://127.0.0.1:7788/health    # 活着→{"ok":true,...,"ws_ready":true}
tmux ls                                                # 看有没有 relay 会话

# 2. 拉起来（在项目目录里）
tmux new -d -s relay
tmux send-keys -t relay 'cd ~/pocket-claudecode && bin/relay-watchdog' Enter
sleep 6 && curl -s http://127.0.0.1:7788/health       # 应 ok:true ws_ready:true
```

| 情况 | 处理 |
|---|---|
| 看门狗也被杀（误 Ctrl-c 进了 tmux:relay） | 重起看门狗（上面第 2 步） |
| 电脑重启过（tmux server 没了） | `tmux new -d -s relay` 再起看门狗（无开机自启） |
| relay 起来但飞书不回 | `tmux capture-pane -t relay -p \| tail -30` 看日志；多半 .env 凭证或全局 hooks 丢了 |
| 全局 hooks 丢了（claude 停了不推结果） | `bin/install-hooks` 重装（非破坏性合并 ~/.claude/settings.json） |
| 拿不准哪坏了 | `bin/doctor` 自检 |

---

## 运维日常

```bash
curl -s http://127.0.0.1:7788/health          # 状态
tmux attach -t relay                           # 实时日志（Ctrl-b d 退出，勿 Ctrl-c）
cat ~/pocket-claudecode/data/registry.json       # 当前会话+绑定
cat ~/pocket-claudecode/data/logs/<sessionId>.jsonl   # 某会话交互日志

# 重启 relay（看门狗下，新代码生效）
tmux send-keys -t relay C-c                    # 杀 relay 子进程，看门狗自动拉起

# 跑测试
cd ~/pocket-claudecode && node --test
```

## 常见问题

| 现象 | 排查 |
|---|---|
| 飞书发消息「已读」但没反应 | claude 还在 bake（长任务）没 stop；Stop hook 在 stop 后才推。等一下或 `/status` 看实时 |
| 群里发消息回「会话不在 tmux」 | 那个 claude 在普通终端跑，不是 tmux。要可控就在 tmux 里跑（`bin/cc-start`） |
| `/list` 没列出某个会话 | 该 claude 进程不在 `~/.claude/sessions/` 或已退；确认 `ls ~/.claude/sessions/` |
| claude 停了结果没推回 | 全局 hooks 丢了 → `bin/install-hooks`；或 relay 没在跑 → 见故障恢复 |
| relay 日志报「发消息失败」 | 飞书 token 过期 / 群被删；群删了 relay 会自动解绑 |

---

## 文件结构

```
pocket-claudecode/
├─ relay.js            # 入口：扫 sessions dir + 轮询 + 装配
├─ SETUP.md            # 安装指南（可交 AI 助手自动执行）
├─ lib/
│  ├─ ccsessions.js    # 扫 ~/.claude/sessions/<pid>.json
│  ├─ registry.js      # sessionId 键 merge/bind/unbind
│  ├─ tmux.js          # paneForPid(pid→tty→pane) / sendKeys / capturePane
│  ├─ feishu.js        # makeClients / sendToChat / sendCard / patchCard / createGroup / 收消息+卡片回调
│  ├─ commands.js      # /list /open /status /history /close /claude + 注入 + handleCardAction
│  ├─ http.js          # /push（result 卡片 / permission 内容+确认卡）+ /health
│  ├─ cardrender.js    # markdown → 飞书卡片（markdown 块 + 表格→table 组件）
│  ├─ permissionCard.js # 内容卡/确认卡/已处理卡 + parseOptions 方案解析
│  ├─ ccskills.js      # /claude：动态扫 ~/.claude skills 生成备忘清单
│  ├─ log.js           # 交互日志 append/readTail
│  └─ util.js          # truncate
├─ hooks/
│  ├─ stop_hook.js     # 全局 Stop：POST session_id + last_assistant_message
│  └─ notify_hook.js   # 全局 Notification：POST session_id + message
├─ bin/
│  ├─ cc-start         # 起 tmux+claude（--resume 恢复；默认 claude，CC_CMD 可覆盖）
│  ├─ relay-watchdog   # 监督 relay，崩/卡自拉起（每 10s 探 /health）
│  ├─ install-hooks    # 非破坏性合并全局 ~/.claude/settings.json hooks
│  └─ doctor           # 依赖与配置自检（只检查+提示，不自动装）
├─ docs/
│  └─ feishu-setup.md  # 飞书自建应用网页配置指引
├─ data/               # 运行时（gitignored）
│  ├─ registry.json    # sessionId→{pid,name,cwd,chat_id,status,...}
│  └─ logs/<sessionId>.jsonl
├─ test/*.test.js      # 单测，node --test
├─ .env.example        # 配置模板
└─ .env                # 实际配置（gitignored）
```

## 限制（已知，未做）

- **无开机自启**：看门狗覆盖 relay 崩溃/卡死，但电脑重启后 tmux 没了需手动起（见故障恢复）。
- **Stop hook 在 relay 重启窗口内结果丢**：不兜底 spool（重启窗口约 2–10s，概率低）。
- **方向键-only 的权限 prompt 不能手机选**：只支持数字键/文本可选的。
- **`/push` 无鉴权**：绑 127.0.0.1，本机其他进程可伪造推送（个人用接受；多用户场景应加 token）。
- **Windows 原生不支持**：依赖 tmux，请用 WSL2。
- **非 tmux 的 claude 会话**：能发现/显示/推结果，但不能注入或截屏（注入靠 tmux pane）。

## 依赖

- Node.js ≥ 20
- `@larksuiteoapi/node-sdk`（飞书官方 SDK，长连接 + API）
- `dotenv`
- tmux
- Claude Code（`claude` 命令）

## License

MIT。
