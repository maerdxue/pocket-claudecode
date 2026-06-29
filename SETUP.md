# 安装指南（可交给 AI 助手自动执行）

> 本文件既是给人看的安装步骤，也可整份丢给你的 AI 助手（Claude Code / Cursor / 等）让它自动执行。每步都带「验证」命令，跑通了再往下。

---

## 给 AI 助手的指示

你正在帮用户安装 **pocket-claudecode**（手机飞书远程操控电脑上的 Claude Code，免公网 IP）。

规则：
1. 按顺序执行每一步，每步跑「验证」命令，验证通过再进下一步。
2. **飞书凭证（App ID / App Secret / open_id）只能向用户要，不要伪造**。这些要用户去飞书网页控制台手动配（见 `docs/feishu-setup.md`），你做不了——做到第 4 步时停下，把 `docs/feishu-setup.md` 指给用户，等用户把三个值给你后再继续。
3. 遇到权限/网络问题，报给用户，不要跳过。
4. 路径里 `~/pocket-claudecode` 是项目目录，用户改了就按实际目录来。

---

## 前置确认

- 操作系统：macOS / Linux 原生支持；**Windows 用户请先装 WSL2**（`wsl --install`，重启后在 WSL 终端里跑后续所有命令），本项目依赖 tmux，Windows 原生没有。
- 用户有飞书账号且是企业管理员（或管理员授权），用于配机器人。
- 用户已装 Claude Code（或可用的 `claude` 命令）。

## 1. 装依赖

需要：Node.js ≥ 20、tmux、claude 命令。

```bash
# macOS
brew install node tmux
# Linux / WSL
sudo apt update && sudo apt install -y nodejs tmux curl
# claude（若未装）
npm install -g @anthropic-ai/claude-code
```

验证：
```bash
node -v        # ≥ v20
tmux -V        # 任意版本
claude --version || echo "claude 未在 PATH（自定义命令可用 CC_CMD 覆盖，见 bin/cc-start）"
```

## 2. 拿项目代码

```bash
git clone <repo-url> ~/pocket-claudecode
cd ~/pocket-claudecode
```

（没有 git 也可解压拷贝到 `~/pocket-claudecode`。**如果是从别人那拷的整个目录**，首次跑前务必删 `data/`：`rm -rf data/`——里面是别人的会话绑定和**完整对话日志**，不删 `/list` 会显示别人的会话，还泄露隐私。git clone 不带 data/，无此问题。）

验证：`ls bin/doctor` 存在。

## 3. 装Node 依赖

```bash
cd ~/pocket-claudecode
npm install
```

验证：`node -e "require('@larksuiteoapi/node-sdk')"` 不报错。

## 4. 配 .env（飞书凭证需用户先做）

把这份指引指给用户：**`docs/feishu-setup.md`**（飞书自建应用网页配置，约 10 分钟，必须用户自己在 open.feishu.cn 操作）。

用户配完会给你三个值，填进 `.env`：

```bash
cd ~/pocket-claudecode
cp .env.example .env
# 编辑 .env，填：
#   FEISHU_APP_ID=cli_...        （用户给）
#   FEISHU_APP_SECRET=...        （用户给）
#   FEISHU_MY_OPEN_ID=ou_...     （用户给，第 8 步才能拿到，可先留空）
#   RELAY_PORT=7788              （默认即可）
#   POLL_SEC=5                   （默认即可）
```

> `FEISHU_MY_OPEN_ID` 要等 relay 起来后、给机器人发条消息、从日志里拿 `from=ou_xxx`（见 feishu-setup.md 第 8 节）。先留空，第 7 步后回来填。

验证：`grep -q FEISHU_APP_ID .env && grep -q FEISHU_APP_SECRET .env && echo ok`。

## 5. 装全局 hooks

让 Claude Code 的 Stop / Notification 事件推给 relay：

```bash
cd ~/pocket-claudecode
bin/install-hooks
```

验证：`grep -q stop_hook ~/.claude/settings.json && echo ok`。

## 6. 起 relay（带看门狗，崩了自动拉起）

```bash
tmux new -d -s relay
tmux send-keys -t relay 'cd ~/pocket-claudecode && bin/relay-watchdog' Enter
```

等约 6 秒，看长连接是否建立：

```bash
sleep 6
curl -s http://127.0.0.1:7788/health
# 应返回 {"ok":true,...,"ws_ready":true}
```

> 看日志：`tmux attach -t relay`（Ctrl-b d 退出，**不要 Ctrl-c**，那会杀 relay）。
> **开机自启（可选）**：看门狗已覆盖 relay 崩溃/卡死自愈；电脑重启后 tmux 没了需手动重起上述两条命令。要开机自启可自建 launchd（mac）/ systemd（Linux）拉起 `tmux new -d -s relay + bin/relay-watchdog`，本项目暂不内置。

## 7. 自检

```bash
cd ~/pocket-claudecode
bin/doctor
```

应全 ✅。`relay 运行中` 若 ❌，回第 6 步；`.env 配置` 若 ❌，回第 4 步。

## 8. 飞书验收 + 拿 open_id

1. 在飞书找到机器人（单聊），发 `/list`。应回你运行中的 CC 会话列表（没有会话就回 `(无会话)`，也算通了——说明消息通路 OK）。
2. 看 relay 日志拿 open_id：
   ```bash
   tmux capture-pane -t relay -p | grep 'recv' | tail -1
   # 找 from=ou_xxx，复制 ou_...
   ```
3. 填回 `.env` 的 `FEISHU_MY_OPEN_ID`，重启 relay 让白名单生效：
   ```bash
   tmux send-keys -t relay C-c   # 杀 relay，看门狗自动拉起
   ```

## 9. 用起来

- 单聊机器人发 `/list` 看会话，`/open <序号|对话名>` 建群绑定。
- 在电脑上 tmux 里起一个 claude 会话：`cd ~/pocket-claudecode && bin/cc-start <名字>`（恢复旧会话加 `--resume`）。
- 绑定后，在飞书群里发文本即注入到对应 claude；claude 回复结果自动推回群里（卡片渲染）。
- 命令速查：单聊发 `/help`。

---

卡住了看 [README](README.md) 的「常见问题」，或跑 `bin/doctor` 看哪一项 ❌。
