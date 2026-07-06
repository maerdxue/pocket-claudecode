// test/commands.test.js
const test = require('node:test');
const assert = require('node:assert');
const commands = require('../lib/commands');

function deps(over = {}) {
  return {
    myOpenId: 'ou_me',
    reg: {},
    sent: [], injected: [], captured: 'SCREEN', createdChatId: 'oc_NEW', logs: {},
    injectFails: false, captureReturns: 'SCREEN',
    pending: new Map(), patched: [], queued: [], queuePrompt(sid, text) { this.queued.push([sid, text]); },
    async send(chatId, text) { this.sent.push([chatId, text]); },
    async inject(sessionId, text) { if (this.injectFails) throw new Error('not-in-tmux'); this.injected.push([sessionId, text]); },
    async patchCard(messageId, card) { this.patched.push([messageId, card]); },
    async capture() { return this.captureReturns; },
    async createGroup() { return this.createdChatId; },
    async createDoc() { return 'doc_FAKE'; },
    bindDoc(sessionId, docId) { if (this.reg[sessionId]) this.reg[sessionId].doc_id = docId; },
    docUrl(docId) { return 'https://feishu.cn/docx/' + docId; },
    bind(sessionId, chatId, name) { if (this.reg[sessionId]) { this.reg[sessionId].chat_id = chatId; this.reg[sessionId].group_name = name; } },
    unbind(sessionId) { if (this.reg[sessionId]) { this.reg[sessionId].chat_id = null; this.reg[sessionId].group_name = null; } },
    appendLog(sessionId, e) { (this.logs[sessionId] = this.logs[sessionId] || []).push(e); },
    readLog(sessionId, n) { return (this.logs[sessionId] || []).slice(-n); },
    listSessions() { return Object.entries(this.reg).map(([sid, v]) => ({ sessionId: sid, ...v })); },
    ...over,
  };
}

function sess(sid, name, cwd, status, extra = {}) {
  return { sessionId: sid, name, cwd, status, ccStatus: 'idle', updatedAt: Date.now(), size: 100, chat_id: null, group_name: null, pid: 111, ...extra };
}

test('/list 按项目分组，显示 name+时间+大小+状态', async () => {
  const d = deps();
  d.reg = {
    'sid-cc': sess('sid-cc', '会话测试', '/p/one-cli', 'active', { chat_id: 'oc_G', group_name: 'one-cli:会话测试' }),
    'sid-auth': sess('sid-auth', 'auth', '/p/one-cli', 'inactive'),
    'sid-other': sess('sid-other', 'x', '/p/proj2', 'active'),
  };
  await commands.handleMessage({ text: '/list', chatId: 'oc_p2p', chatType: 'p2p', openId: 'ou_me' }, d);
  const out = d.sent[0][1];
  assert.match(out, /📁 one-cli/);
  assert.match(out, /📁 proj2/);
  assert.match(out, /会话测试/);
  assert.match(out, /🟢/);
  assert.match(out, /⚫/);
});

test('/open <序号>：建群绑定', async () => {
  const d = deps();
  d.reg = { 'sid-1': sess('sid-1', 'cc', '/p/one-cli', 'active') };
  await commands.handleMessage({ text: '/open 1', chatId: 'oc_p2p', chatType: 'p2p', openId: 'ou_me' }, d);
  assert.equal(d.reg['sid-1'].chat_id, 'oc_NEW');
  assert.match(d.sent[0][1], /已建群/);
});

test('/open <对话名>：建群绑定', async () => {
  const d = deps();
  d.reg = { 'sid-1': sess('sid-1', '会话测试', '/p/one-cli', 'active') };
  await commands.handleMessage({ text: '/open 会话测试', chatId: 'oc_p2p', chatType: 'p2p', openId: 'ou_me' }, d);
  assert.equal(d.reg['sid-1'].chat_id, 'oc_NEW');
});

test('/open 重名：提示用序号', async () => {
  const d = deps();
  d.reg = {
    'sid-1': sess('sid-1', 'dup', '/p/one-cli', 'active'),
    'sid-2': sess('sid-2', 'dup', '/p/one-cli', 'active'),
  };
  await commands.handleMessage({ text: '/open dup', chatId: 'oc_p2p', chatType: 'p2p', openId: 'ou_me' }, d);
  assert.match(d.sent[0][1], /重名/);
  assert.equal(d.injected.length, 0);
});

test('/open 不存在：回无此对话名', async () => {
  const d = deps();
  d.reg = { 'sid-1': sess('sid-1', 'cc', '/p/one-cli', 'active') };
  await commands.handleMessage({ text: '/open nope', chatId: 'oc_p2p', chatType: 'p2p', openId: 'ou_me' }, d);
  assert.match(d.sent[0][1], /无此对话名/);
});

test('群里纯文本 active：注入', async () => {
  const d = deps();
  d.reg = { 'sid-1': sess('sid-1', 'cc', '/p/one-cli', 'active', { chat_id: 'oc_G' }) };
  await commands.handleMessage({ text: '写个函数', chatId: 'oc_G', chatType: 'group', openId: 'ou_me' }, d);
  assert.deepEqual(d.injected, [['sid-1', '写个函数']]);
});

test('群里纯文本 inactive：回未运行', async () => {
  const d = deps();
  d.reg = { 'sid-1': sess('sid-1', 'cc', '/p/one-cli', 'inactive', { chat_id: 'oc_G' }) };
  await commands.handleMessage({ text: '继续', chatId: 'oc_G', chatType: 'group', openId: 'ou_me' }, d);
  assert.equal(d.injected.length, 0);
  assert.match(d.sent[0][1], /未运行/);
});

test('群里纯文本 active 但非 tmux：回非tmux提示', async () => {
  const d = deps({ injectFails: true });
  d.reg = { 'sid-1': sess('sid-1', 'cc', '/p/one-cli', 'active', { chat_id: 'oc_G' }) };
  await commands.handleMessage({ text: '继续', chatId: 'oc_G', chatType: 'group', openId: 'ou_me' }, d);
  assert.equal(d.injected.length, 0);
  assert.match(d.sent[0][1], /不在 tmux/);
});

test('/status active：截屏', async () => {
  const d = deps();
  d.reg = { 'sid-1': sess('sid-1', 'cc', '/p/one-cli', 'active', { chat_id: 'oc_G' }) };
  await commands.handleMessage({ text: '/status', chatId: 'oc_G', chatType: 'group', openId: 'ou_me' }, d);
  assert.equal(d.sent[0][1], 'SCREEN');
});

test('/status active 但非 tmux：回非tmux提示', async () => {
  const d = deps({ captureReturns: null });
  d.reg = { 'sid-1': sess('sid-1', 'cc', '/p/one-cli', 'active', { chat_id: 'oc_G' }) };
  await commands.handleMessage({ text: '/status', chatId: 'oc_G', chatType: 'group', openId: 'ou_me' }, d);
  assert.match(d.sent[0][1], /不在 tmux/);
});

test('/status inactive：回未运行', async () => {
  const d = deps();
  d.reg = { 'sid-1': sess('sid-1', 'cc', '/p/one-cli', 'inactive', { chat_id: 'oc_G' }) };
  await commands.handleMessage({ text: '/status', chatId: 'oc_G', chatType: 'group', openId: 'ou_me' }, d);
  assert.match(d.sent[0][1], /未运行/);
});

test('/history：回日志', async () => {
  const d = deps();
  d.reg = { 'sid-1': sess('sid-1', 'cc', '/p/one-cli', 'active', { chat_id: 'oc_G' }) };
  d.logs['sid-1'] = [{ ts: 't', dir: 'in', kind: 'prompt', text: 'hi' }];
  await commands.handleMessage({ text: '/history', chatId: 'oc_G', chatType: 'group', openId: 'ou_me' }, d);
  assert.match(d.sent[0][1], /hi/);
});

test('/close：解绑', async () => {
  const d = deps();
  d.reg = { 'sid-1': sess('sid-1', 'cc', '/p/one-cli', 'active', { chat_id: 'oc_G', group_name: 'one-cli:cc' }) };
  await commands.handleMessage({ text: '/close', chatId: 'oc_G', chatType: 'group', openId: 'ou_me' }, d);
  assert.equal(d.reg['sid-1'].chat_id, null);
});

test('/claude：单聊发动态命令清单（扫 skills+commands+built-in）', async () => {
  const d = deps();
  await commands.handleMessage({ text: '/claude', chatId: 'oc_p2p', chatType: 'p2p', openId: 'ou_me' }, d);
  const out = d.sent[0][1];
  assert.match(out, /命令清单/);
  assert.match(out, /\/clear/);
  assert.match(out, /\/model/);
  assert.match(out, /Built-in/);
});

test('单聊纯文本：回控制台提示', async () => {
  const d = deps();
  await commands.handleMessage({ text: '你好', chatId: 'oc_p2p', chatType: 'p2p', openId: 'ou_me' }, d);
  assert.match(d.sent[0][1], /控制台/);
});

test('非白名单 openId：忽略', async () => {
  const d = deps();
  await commands.handleMessage({ text: '/list', chatId: 'oc_p2p', chatType: 'p2p', openId: 'ou_other' }, d);
  assert.equal(d.sent.length, 0);
});

test('handleMessage: openId 缺失拒绝（防 undefined 短路放行）', async () => {
  const d = deps();
  await commands.handleMessage({ text: '/list', chatId: 'oc_p2p', chatType: 'p2p', openId: undefined }, d);
  assert.equal(d.sent.length, 0);
});

test('handleCardAction: openId 缺失拒绝（防伪造回调放行）', async () => {
  const d = deps();
  d.reg = { 'sid-1': sess('sid-1', 'cc', '/p/one-cli', 'active', { chat_id: 'oc_G' }) };
  d.pending.set('sid-1', { chatId: 'oc_G', messageId: 'om_1', ts: Date.now() });
  await commands.handleCardAction({ chatId: 'oc_G', openId: undefined, value: '1' }, d);
  assert.equal(d.injected.length, 0);
  assert.equal(d.sent.length, 0);
});

test('handleCardAction: 正常路由 inject + delete pending + patchCard + 记日志', async () => {
  const d = deps();
  d.reg = { 'sid-1': sess('sid-1', 'cc', '/p/one-cli', 'active', { chat_id: 'oc_G' }) };
  d.pending.set('sid-1', { chatId: 'oc_G', messageId: 'om_1', ts: Date.now() });
  await commands.handleCardAction({ chatId: 'oc_G', openId: 'ou_me', value: '1', messageId: 'om_1' }, d);
  assert.deepEqual(d.injected, [['sid-1', '1']]);
  assert.equal(d.pending.has('sid-1'), false);
  assert.equal(d.patched.length, 1);
  assert.equal(d.patched[0][0], 'om_1');
  assert.equal(d.logs['sid-1'].slice(-1)[0].kind, 'card');
});

test('handleCardAction: value 对象 {choice} 取值', async () => {
  const d = deps();
  d.reg = { 'sid-1': sess('sid-1', 'cc', '/p/one-cli', 'active', { chat_id: 'oc_G' }) };
  d.pending.set('sid-1', { chatId: 'oc_G', messageId: 'om_1', ts: Date.now() });
  await commands.handleCardAction({ chatId: 'oc_G', openId: 'ou_me', value: { choice: '2' } }, d);
  assert.deepEqual(d.injected, [['sid-1', '2']]);
});

test('handleCardAction: 过期不 inject 提示手打', async () => {
  const d = deps();
  d.reg = { 'sid-1': sess('sid-1', 'cc', '/p/one-cli', 'active', { chat_id: 'oc_G' }) };
  d.pending.set('sid-1', { chatId: 'oc_G', messageId: 'om_1', ts: Date.now() - 301 * 1000 });
  await commands.handleCardAction({ chatId: 'oc_G', openId: 'ou_me', value: '1' }, d);
  assert.equal(d.injected.length, 0);
  assert.match(d.sent[0][1], /过期/);
  assert.equal(d.pending.has('sid-1'), false);
});

test('handleCardAction: 无 pending(点旧卡) 提示手打', async () => {
  const d = deps();
  d.reg = { 'sid-1': sess('sid-1', 'cc', '/p/one-cli', 'active', { chat_id: 'oc_G' }) };
  await commands.handleCardAction({ chatId: 'oc_G', openId: 'ou_me', value: '1' }, d);
  assert.equal(d.injected.length, 0);
  assert.match(d.sent[0][1], /过期/);
});

test('handleCardAction: 未绑定群不 inject', async () => {
  const d = deps();
  d.reg = {};
  await commands.handleCardAction({ chatId: 'oc_G', openId: 'ou_me', value: '1' }, d);
  assert.equal(d.injected.length, 0);
  assert.match(d.sent[0][1], /未绑定/);
});

test('handleCardAction: not-in-tmux 提示且 pending 已删 + patch 红卡(#14)', async () => {
  const d = deps({ injectFails: true });
  d.reg = { 'sid-1': sess('sid-1', 'cc', '/p/one-cli', 'active', { chat_id: 'oc_G' }) };
  d.pending.set('sid-1', { chatId: 'oc_G', messageId: 'om_1', ts: Date.now() });
  await commands.handleCardAction({ chatId: 'oc_G', openId: 'ou_me', value: '1' }, d);
  assert.equal(d.injected.length, 0);
  assert.match(d.sent[0][1], /不在 tmux/);
  assert.equal(d.pending.has('sid-1'), false);
  assert.equal(d.patched.length, 1);  // #14 原卡 patch 红提示
  assert.equal(d.patched[0][1].header.template, 'red');
});

test('#19 /open 对话名忽略大小写兜底', async () => {
  const d = deps();
  d.reg = { 'sid-1': sess('sid-1', 'CC', '/p/one-cli', 'active') };
  await commands.handleMessage({ text: '/open cc', chatId: 'oc_p2p', chatType: 'p2p', openId: 'ou_me' }, d);
  assert.equal(d.reg['sid-1'].chat_id, 'oc_NEW');  // 大小写兜底匹配
});

test('#11 createGroup 返 null 不假绑定', async () => {
  const d = deps({ createdChatId: null });
  d.reg = { 'sid-1': sess('sid-1', 'cc', '/p/one-cli', 'active') };
  await commands.handleMessage({ text: '/open 1', chatId: 'oc_p2p', chatType: 'p2p', openId: 'ou_me' }, d);
  assert.equal(d.reg['sid-1'].chat_id, null);  // 不 bind
  assert.match(d.sent[0][1], /建群失败/);
});

test('#23 /history 0 不被当 10（至少 1 条）', async () => {
  const d = deps();
  d.reg = { 'sid-1': sess('sid-1', 'cc', '/p/one-cli', 'active', { chat_id: 'oc_G' }) };
  d.logs['sid-1'] = [{ ts: 't', dir: 'in', kind: 'prompt', text: 'hi' }, { ts: 't2', dir: 'out', kind: 'result', text: 'bye' }];
  await commands.handleMessage({ text: '/history 0', chatId: 'oc_G', chatType: 'group', openId: 'ou_me' }, d);
  assert.match(d.sent[0][1], /bye/);  // n=1 显示最后 1 条，不当 10 全显
});

test('handleCardAction: 非白名单 openId 忽略', async () => {
  const d = deps();
  d.reg = { 'sid-1': sess('sid-1', 'cc', '/p/one-cli', 'active', { chat_id: 'oc_G' }) };
  d.pending.set('sid-1', { chatId: 'oc_G', messageId: 'om_1', ts: Date.now() });
  await commands.handleCardAction({ chatId: 'oc_G', openId: 'ou_other', value: '1' }, d);
  assert.equal(d.injected.length, 0);
  assert.equal(d.sent.length, 0);
});

test('/whoami：回显 open_id', async () => {
  const d = deps();
  await commands.handleMessage({ text: '/whoami', chatId: 'oc_p2p', chatType: 'p2p', openId: 'ou_me' }, d);
  assert.match(d.sent[0][1], /ou_me/);
  assert.match(d.sent[0][1], /open_id/);
});

test('MY_OPEN_ID 空 + 单聊文本：回 open_id 引导（不看日志拿）', async () => {
  const d = deps({ myOpenId: '' });
  await commands.handleMessage({ text: 'hi', chatId: 'oc_p2p', chatType: 'p2p', openId: 'ou_newuser' }, d);
  assert.match(d.sent[0][1], /ou_newuser/);
  assert.match(d.sent[0][1], /FEISHU_MY_OPEN_ID/);
});

test('MY_OPEN_ID 空 + /whoami：也回 open_id', async () => {
  const d = deps({ myOpenId: '' });
  await commands.handleMessage({ text: '/whoami', chatId: 'oc_p2p', chatType: 'p2p', openId: 'ou_newuser' }, d);
  assert.match(d.sent[0][1], /ou_newuser/);
});

test('群里 CC busy：排队不注入，回已排队提示', async () => {
  const d = deps();
  d.reg = { 'sid-1': sess('sid-1', 'cc', '/p/one-cli', 'active', { chat_id: 'oc_G', ccStatus: 'busy' }) };
  await commands.handleMessage({ text: '继续', chatId: 'oc_G', chatType: 'group', openId: 'ou_me' }, d);
  assert.equal(d.injected.length, 0);
  assert.deepEqual(d.queued, [['sid-1', '继续']]);
  assert.match(d.sent[0][1], /排队/);
});

test('群里 CC idle：正常注入（busy 检查不挡 idle）', async () => {
  const d = deps();
  d.reg = { 'sid-1': sess('sid-1', 'cc', '/p/one-cli', 'active', { chat_id: 'oc_G', ccStatus: 'idle' }) };
  await commands.handleMessage({ text: '继续', chatId: 'oc_G', chatType: 'group', openId: 'ou_me' }, d);
  assert.deepEqual(d.injected, [['sid-1', '继续']]);
});

test('群里 /goal 等 CC slash 命令：注入 CC，不当 relay 命令拦', async () => {
  const d = deps();
  d.reg = { 'sid-1': sess('sid-1', 'cc', '/p/one-cli', 'active', { chat_id: 'oc_G', ccStatus: 'idle' }) };
  await commands.handleMessage({ text: '/goal 做个功能', chatId: 'oc_G', chatType: 'group', openId: 'ou_me' }, d);
  assert.deepEqual(d.injected, [['sid-1', '/goal 做个功能']]);
  assert.equal(d.sent.length, 0);  // 不回"未知命令"
});

test('cleanStatusScreen: 去掉 CC TUI 装饰行，留实质内容', () => {
  const raw = [
    'CC 回复第一行',
    'CC 回复第二行',
    '',
    'work-dashboard ⎇feat/data-ingest │ glm-5.2 max │ 691.2k/1000k 69% focus',
    '⏵⏵ accept edits on · 1 shell · ← for agents',
    '⯑ main',
    '◯ BrowserAgent  截图 progress modal 实测    33m 7s',
    '──────────────────────────',
    '数据调整&小功能-glm ──',
    '❯',
  ].join('\n');
  const out = commands.cleanStatusScreen(raw);
  assert.match(out, /CC 回复第一行/);
  assert.match(out, /CC 回复第二行/);
  assert.doesNotMatch(out, /⎇/);
  assert.doesNotMatch(out, /⏵/);
  assert.doesNotMatch(out, /BrowserAgent/);
  assert.doesNotMatch(out, /❯/);
  assert.doesNotMatch(out, /数据调整&小功能-glm/);
});
