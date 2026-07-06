// relay.js — 飞书 <-> Claude Code 桥（按 CC sessionId 持久绑定）
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const path = require('path');
const feishu = require('./lib/feishu');
const tmux = require('./lib/tmux');
const registry = require('./lib/registry');
const ccsessions = require('./lib/ccsessions');
const log = require('./lib/log');
const commands = require('./lib/commands');
const { startHttpServer } = require('./lib/http');

const APP_ID = process.env.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET;
const MY_OPEN_ID = (process.env.FEISHU_MY_OPEN_ID || '').trim();
const PORT = parseInt(process.env.RELAY_PORT || '7788', 10);
const POLL_SEC = parseInt(process.env.POLL_SEC || '5', 10);

const REGISTRY_PATH = path.join(__dirname, 'data', 'registry.json');
const LOG_DIR = path.join(__dirname, 'data', 'logs');

if (!APP_ID || !APP_SECRET) { console.error('❌ .env 缺 FEISHU_APP_ID / FEISHU_APP_SECRET'); process.exit(1); }

const reg = registry.load(REGISTRY_PATH);
let wsReady = false;
const { client, wsClient } = feishu.makeClients({
  appId: APP_ID, appSecret: APP_SECRET,
  onReady: () => { wsReady = true; console.log('✅ 飞书长连接已建立'); },
  onError: (err) => { wsReady = false; console.error('❌ 长连接失败:', err.message); },
  onReconnected: () => { wsReady = true; console.log('✅ 飞书长连接已重连'); },
  onReconnecting: () => { wsReady = false; console.log('… 飞书长连接重连中'); },
});

const deps = {
  myOpenId: MY_OPEN_ID,
  reg,
  wsReady: () => wsReady,
  async send(chatId, text) { try { await feishu.sendToChat(client, chatId, text); } catch (e) { console.error('发消息失败', e.message); } },
  async inject(sessionId, text) {
    const pid = deps.reg[sessionId]?.pid;
    const pane = pid ? await tmux.paneForPid(pid) : null;
    if (!pane) throw new Error('not-in-tmux');
    await tmux.sendKeys(pane, text);
    console.log(`➡️ 注入 ${sessionId.slice(0,8)}: ${JSON.stringify(text)}`);
  },
  async capture(sessionId) {
    const pid = deps.reg[sessionId]?.pid;
    const pane = pid ? await tmux.paneForPid(pid) : null;
    if (!pane) return null;
    return tmux.capturePane(pane);
  },
  async createGroup(name, ownerOpenId) { return await feishu.createGroup(client, name, ownerOpenId); },
  bind(sessionId, chatId, groupName) { registry.bind(reg, sessionId, chatId, groupName); persist(); },
  unbind(sessionId) { registry.unbind(reg, sessionId); persist(); },
  appendLog(sessionId, entry) { log.append(LOG_DIR, sessionId, entry); },
  readLog(sessionId, n) { return log.readTail(LOG_DIR, sessionId, n); },
  listSessions() { return Object.entries(reg).map(([sid, v]) => ({ sessionId: sid, ...v })); },
  async sendCard(chatId, card) { return await feishu.sendCard(client, chatId, card); },  // 不吞异常：失败让 http.js 降级纯文本，否则 result 静默丢失
  async patchCard(messageId, card) { try { await feishu.patchCard(client, messageId, card); } catch (e) { console.error('patchCard 失败:', e.message); } },
  pending: new Map(),
  setPending(sessionId, info) { this.pending.set(sessionId, info); },
  pendingPrompts: new Map(),  // busy 时排队的群消息，poll 检测 busy→idle 自动注入
  queuePrompt(sessionId, text) { const q = this.pendingPrompts.get(sessionId) || []; q.push(text); this.pendingPrompts.set(sessionId, q); },
};

function persist() { registry.save(REGISTRY_PATH, reg); }

feishu.startReceive(wsClient, async (p) => {
  console.log(`📨 recv chat=${p.chatId} from=${p.openId} type=${p.chatType}`);
  await commands.handleMessage(p, deps);
}, async (c) => {
  console.log(`🎴 card chat=${c.chatId} from=${c.openId} tag=${c.tag} value=${JSON.stringify(c.value)}`);
  await commands.handleCardAction(c, deps);
}).catch(e => console.error('ws start 失败:', e));

startHttpServer({ port: PORT, deps }).then(({ port }) => console.log(`🔌 push 端口 :${port}/push`));

function stableReg(o) {  // #15 排除 last_seen 比较，避免每 5s 因 last_seen 变写盘
  const c = {};
  for (const [k, v] of Object.entries(o)) c[k] = { ...v, last_seen: undefined };
  return JSON.stringify(c);
}
// 轮询：扫 CC sessions dir → merge → 退出/恢复通知
async function poll() {
  const scanned = ccsessions.scan();
  const before = JSON.parse(JSON.stringify(reg));
  const merged = registry.merge(reg, scanned);
  Object.assign(reg, merged);  // #16 先覆盖（bind 看到新数据），再删多余，比 delete 全部安全
  for (const k of Object.keys(reg)) if (!(k in merged)) delete reg[k];
  for (const sid of Object.keys(reg)) {
    const beforeStatus = before[sid]?.status;
    const chatId = reg[sid].chat_id || before[sid]?.chat_id;
    if (!chatId) continue;
    if (reg[sid].status === 'inactive' && beforeStatus === 'active') {
      const otherActive = Object.values(reg).some(e => e.chat_id === chatId && e.status === 'active');  // #10 chatId 还有别的 active 不发退出
      if (!otherActive) {
        console.log(`⏹ 会话退出: ${reg[sid].name}`);
        deps.send(chatId, `会话已退出（可恢复）：在 CC 里 claude --resume ${reg[sid].name}，恢复后此群自动接回。`).catch(()=>{});
      }
    }
    if (reg[sid].status === 'active' && beforeStatus === 'inactive') {
      const wasActive = Object.values(before).some(e => e.chat_id === chatId && e.status === 'active');  // #10 chatId 之前已有 active 不发恢复
      if (!wasActive) {
        console.log(`▶️ 会话恢复: ${reg[sid].name}`);
        deps.send(chatId, `会话已恢复: ${reg[sid].name}，可继续对话。`).catch(()=>{});
      }
    }
    // busy→idle：CC 忙完，自动注入排队的群消息
    if (before[sid]?.ccStatus === 'busy' && reg[sid].ccStatus === 'idle' && reg[sid].status === 'active') {
      const q = deps.pendingPrompts && deps.pendingPrompts.get(sid);
      if (q && q.length) {
        deps.pendingPrompts.delete(sid);
        for (const msg of q) {
          try {
            await deps.inject(sid, msg);
            deps.appendLog(sid, { dir: 'in', kind: 'queued', text: msg });
            console.log(`⏩ 排队注入 ${sid.slice(0,8)}: ${JSON.stringify(msg)}`);
          } catch (e) {
            console.error('排队注入失败:', e.message);
            if (e.message === 'not-in-tmux' && chatId) deps.send(chatId, '排队消息注入失败：会话不在 tmux。').catch(()=>{});
          }
        }
        if (chatId) deps.send(chatId, `✅ CC 忙完，已自动发送排队的 ${q.length} 条消息。`).catch(()=>{});
      }
    }
  }
  if (stableReg(reg) !== stableReg(before)) persist();
}
setInterval(poll, POLL_SEC * 1000);
poll();

console.log(`🚀 relay 启动  poll=${POLL_SEC}s  会话数=${Object.keys(reg).length}`);
