# 健壮性提升计划（待办）

> 来源：2026-06-29 只读 review（3 个 agent 并行审 + 测试覆盖分析），共 27 个 bug。
> 状态：**待另一 terminal 合完代码后，在 main 上执行**（避免同文件 merge 冲突）。
> 原则：每改一项配测试（TDD），改完跑 `node --test` 全绿 + 手动 smoke。

---

## P0 立即修（用户已踩 / 安全 / 数据丢失）

| # | bug | 位置 | 修复要点 |
|---|---|---|---|
| 1 | 看门狗误杀（启动窗口 health 失败 → kill 重启，用户已遇到） | relay.js + bin/relay-watchdog | 看门狗首探加宽限期（启动后 sleep 30 再探）；区分"端口未监听(启动中)"跳过 vs"已监听但不健康"才杀；连续 N 次失败才杀 |
| 2 | parseOptions 选项不适配（"选项不行"根因） | permissionCard.js:97-105 | 正则只认"方案N："+单数字+"N."。扩：`选项\|方案\|项` 前缀 + 字母 `[A-Za-z]` + `①-⑨` + 阿拉伯 `\d+` + 分隔符 `[.、):：-]` + y/n |
| 3 | 卡片超长不截断 → 整卡被飞书拒 | cardrender.js + http.js result 路径 | markdownToCard 对 elements/单元素 content 兜底截断；result 路径调用前先 truncate |
| 4 | 未闭合代码块 → 静默吞后续到 EOF | cardrender.js:53 | 循环结束检测未闭合，补闭合 ``` 或降级普通文本 |
| 5 | 白名单放行漏洞（parseCardAction openId 取不到 → undefined 短路放行，任何人点卡片能注入） | feishu.js:69 + relay.js:136 | openId 取不到视为非法拒绝，不放行 |
| 6 | hook 推垃圾 + 1.5s 超时太紧 | hooks/stop_hook.js:13,21 + notify_hook.js | last_assistant_message 空 → 静默 die(0) 不推占位；超时调 5–10s |
| 7 | sendKeys 非原子（-l 文本 + Enter 分两次，并发注入错位） | tmux.js:30 | 合并单次 `send-keys -l text Enter` 或 per-pane 互斥锁 |
| 8 | buildHandledCard choice 类型不匹配 → 标错 ✅/⬜ | permissionCard.js:60 | `String(o.value?.choice) === String(input)` 统一 |

## P1 可靠性

| # | bug | 位置 | 修复要点 |
|---|---|---|---|
| 9 | pid 复用幽灵会话（alive 只测 pid 存在不验身份） | ccsessions.js:15 | 交叉验 cmdline 含 `claude` / updatedAt 近期 / transcript mtime |
| 10 | poll 通知矛盾（同 chatId active+inactive 发"退出"+"恢复"两条） | relay.js:87 | 按 chatId 下 active 会话数变化判断，而非逐 sid 翻转 |
| 11 | createGroup 失败假绑定（SDK 返非零 code，chat_id=undefined 仍 bind） | feishu.js:43 + commands.js cmdOpen | 校验 `r.code===0` 否则 throw；cmdOpen try/catch 回滚 |
| 12 | capture 异常 → /push 500（tmux.capturePane reject 无独立 try） | http.js:67 | capture 单独 try，失败 screen=null 走降级 |
| 13 | 飞书 API 无重试/断线静默丢（token 过期/限流/WS 断，deps.send 吞异常） | feishu.js + relay.js:37 | token 刷新重试 + wsReady=false 时显式回"长连接断开"而非吞 |
| 14 | 注入后卡片不更新（not-in-tmux/patch 失败留原"⏸需要输入"，误导重复点） | commands.js:145 + patchCard | 失败时 patch 成红提示"会话不在 tmux/手打" |
| 15 | registry 无界增长 + 每次 persist（inactive 永不清 + last_seen 变致每 5s 写盘） | relay.js:97 + registry.js:32 | inactive 加 TTL（如 7 天）；persist 判断排除 last_seen |
| 16 | bind/poll 竞态（reg 原地 delete/assign 期间 bind 被覆盖） | relay.js + registry | bind 不直接 mutate 或 poll 期间加锁 |

## P2 小功能/体验

| # | bug | 修复要点 |
|---|---|---|
| 17 | buildHandledCard input 不匹配选项全 ⬜ 误导（手打文本） | 不匹配走"已注入"分支，不画方框 |
| 18 | parseOptions null 给 BUTTONS(1/2/3) 可能误注 | null 时改"手打回复"，不给数字按钮 |
| 19 | /open name 精确匹配（大小写/空格敏感） | includes / 忽略大小写兜底 |
| 20 | table 解析边界（isTableSep 误判/缺分隔行不识别/列不一致/\| 转义） | isTableSep 严格 `:?-+:?` + 缺分隔 fallback + 还原 `\|` |
| 21 | label `slice(0,24)` UTF-16 代理对截断乱码 | `Array.from(...).slice(0,24).join('')` 按码点 |
| 22 | screen 空显示代码块裹"无画面" | 空时纯文本提示 |
| 23 | /history 0 被当 falsy→10；addMember 死代码 | 0 合法 + 删 addMember |

## 测试补强（代码改完加，只增 test/ 不碰 lib/）

- `relay.js` / `hooks` 集成测试（启动顺序、poll 通知、hook 字段缺失/超时）—— 当前 0 测试
- `parseOptions` 变体格式表驱动测试（选项A/1、/1)/字母/y/n/两位数/①②）
- `cardrender` 超长 / 未闭合代码块 / 表格边界
- `ccsessions` pid 复用 / 字段缺失；`tmux` sendKeys 原子性
- `permissionCard` buildHandledCard 各分支

## 执行顺序

1. 等另一 terminal 合完代码到 main，`git pull` 同步
2. P0 全修（#1 已踩、#2 用户反馈、#5 安全漏洞最该先堵），每项配测试
3. P1 可靠性，配测试
4. P2 体验，配测试
5. 全程 `node --test` 全绿 + smoke（重启 relay + /health + 飞书 /list + /whoami + 方案卡片）
6. commit + push

## 当前测试覆盖（参考）

- 11 个 lib 都有测试（94 个），但 `relay.js`/`hooks` 无测试
- `tmux`(2)/`ccsessions`(5)/`log`(2) 偏少
- parseOptions 变体、看门狗/poll 竞态、WS 重连、卡片超长——全无测试
