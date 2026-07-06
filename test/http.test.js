// test/http.test.js
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { startHttpServer } = require('../lib/http');

function deps() {
  return {
    reg: { 'cc': { chat_id: 'oc_G', status: 'active', group_name: 'one-cli:cc', doc_id: 'doc1' } },
    sent: [], sentCards: [], captured: 'SCREEN', logs: {}, pending: new Map(), patched: [],
    async send(chatId, text) { this.sent.push([chatId, text]); },
    async sendCard(chatId, card) { this.sentCards.push([chatId, card]); return 'om_1'; },
    async patchCard(messageId, card) { this.patched.push([messageId, card]); },
    setPending(session, info) { this.pending.set(session, info); },
    unbind(session) { if (this.reg[session]) { this.reg[session].chat_id = null; } },
    async capture(session) { return this.captured; },
    appendLog(session, e) { (this.logs[session] = this.logs[session]||[]).push(e); },
  };
}

async function post(port, body) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const req = http.request({ port, path:'/push', method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)} }, (res) => {
      let b=''; res.on('data',c=>b+=c); res.on('end',()=>resolve({code:res.statusCode, body:b}));
    });
    req.write(data); req.end();
  });
}

test('/push kind=result：last_assistant_message 转卡片发送，不发纯文本', async () => {
  const d = deps();
  const { port, close } = await startHttpServer({ port: 0, deps: d });
  const r = await post(port, { session:'cc', kind:'result', text:'## 结论\n这是回复。' });
  await close();
  assert.equal(r.code, 200);
  assert.equal(d.sentCards.length, 1);
  assert.equal(d.sentCards[0][0], 'oc_G');
  assert.match(JSON.stringify(d.sentCards[0][1]), /这是回复/);
  assert.match(JSON.stringify(d.sentCards[0][1]), /one-cli:cc/);
  assert.equal(d.sent.length, 0);
  assert.equal(d.logs.cc[0].kind, 'result');
  assert.equal(d.logs.cc[0].text, '## 结论\n这是回复。');
});

test('/push kind=result：表格 markdown 转卡片含 table 元素', async () => {
  const d = deps();
  const { port, close } = await startHttpServer({ port: 0, deps: d });
  await post(port, { session:'cc', kind:'result', text:'| A | B |\n|---|---|\n| 1 | 2 |' });
  await close();
  assert.match(JSON.stringify(d.sentCards[0][1]), /"tag":"table"/);
});

test('/push kind=result：sendCard 失败降级纯文本原文', async () => {
  const d = deps();
  d.sendCard = async () => { throw new Error('卡片API挂'); };
  const { port, close } = await startHttpServer({ port: 0, deps: d });
  const r = await post(port, { session:'cc', kind:'result', text:'回复内容' });
  await close();
  assert.equal(r.code, 200);
  assert.equal(d.sentCards.length, 0);
  assert.equal(d.sent.length, 1);
  assert.match(d.sent[0][1], /回复内容/);
});

test('/push kind=permission：真权限发 内容卡片+确认卡片 两条', async () => {
  const d = deps();
  const { port, close } = await startHttpServer({ port: 0, deps: d });
  await post(port, { session:'cc', kind:'permission', message:'Claude needs your permission' });
  await close();
  assert.equal(d.sentCards.length, 2);  // 内容 + 确认
  assert.match(JSON.stringify(d.sentCards[0][1]), /SCREEN/);  // 第一条内容卡片含 screen
  assert.match(JSON.stringify(d.sentCards[1][1]), /待审批/);  // 第二条确认卡片
  assert.equal(d.pending.get('cc').messageId, 'om_1');
  assert.equal(d.logs.cc[0].kind, 'permission');
});

test('/push kind=permission：idle(waiting for input)不发（CC stop 已推结果，多发无用）', async () => {
  const d = deps();
  const { port, close } = await startHttpServer({ port: 0, deps: d });
  await post(port, { session:'cc', kind:'permission', message:'Claude is waiting for your input' });
  await close();
  assert.equal(d.sentCards.length, 0);
  assert.equal(d.pending.size, 0);
  assert.equal(d.sent.length, 0);  // idle 不发任何消息
});

test('/push kind=permission：idle 含方案发 内容+确认(方案按钮) 两条', async () => {
  const d = deps();
  d.captured = '选方案：\n方案一：Redis\n方案二：LRU\n方案三：SQLite';
  const { port, close } = await startHttpServer({ port: 0, deps: d });
  await post(port, { session:'cc', kind:'permission', message:'Claude is waiting for your input' });
  await close();
  assert.equal(d.sentCards.length, 2);
  assert.equal(d.pending.get('cc').messageId, 'om_1');
  assert.equal(d.pending.get('cc').options.length, 3);  // 方案 options 存进 pending
  assert.match(JSON.stringify(d.sentCards[1][1]), /方案一/);  // 确认卡含方案按钮
});

test('/push kind=permission：非tmux(capture null)极简提示不发卡片', async () => {
  const d = deps(); d.captured = null;
  const { port, close } = await startHttpServer({ port: 0, deps: d });
  await post(port, { session:'cc', kind:'permission', message:'Claude needs your permission' });
  await close();
  assert.equal(d.sentCards.length, 0);
  assert.equal(d.pending.size, 0);
  assert.match(d.sent[0][1], /待审批/);
  assert.doesNotMatch(d.sent[0][1], /SCREEN/);
});

test('/push kind=permission：sendCard 失败降级带截屏纯文本', async () => {
  const d = deps();
  d.sendCard = async () => { throw new Error('卡片API挂'); };
  const { port, close } = await startHttpServer({ port: 0, deps: d });
  await post(port, { session:'cc', kind:'permission', message:'Claude needs your permission' });
  await close();
  assert.equal(d.pending.size, 0);  // 确认卡失败没 setPending
  assert.match(d.sent[0][1], /待审批/);
  assert.match(d.sent[0][1], /SCREEN/);  // 真权限降级仍带截屏供决策
});

test('/push 无绑定群(chat_id=null)：不推不报错', async () => {
  const d = deps(); d.reg.cc.chat_id = null;
  const { port, close } = await startHttpServer({ port: 0, deps: d });
  const r = await post(port, { session:'cc', kind:'result', text:'x' });
  await close();
  assert.equal(r.code, 200);
  assert.equal(d.sent.length, 0);
  assert.equal(d.sentCards.length, 0);
});

test('/health：返回状态', async () => {
  const d = deps();
  const { port, close } = await startHttpServer({ port: 0, deps: d });
  const r = await new Promise(res => http.get(`http://127.0.0.1:${port}/health`, c => { let b=''; c.on('data',x=>b+=x); c.on('end',()=>res(b)); }));
  await close();
  assert.match(r, /ok/);
});

test('/push 卡片+纯文本都失败：解绑 chat_id', async () => {
  const d = deps();
  d.reg = { 'cc': { chat_id: 'oc_G', status: 'active' } };
  d.sendCard = async () => { throw new Error('卡片挂'); };
  d.send = async () => { throw new Error('群被删'); };
  let unbound = null;
  d.unbind = (s) => { unbound = s; };
  const { port, close } = await startHttpServer({ port: 0, deps: d });
  const r = await post(port, { session:'cc', kind:'result', text:'x' });
  await close();
  assert.equal(r.code, 200);
  assert.equal(unbound, 'cc');
});

test('#12 /push kind=permission: capture 抛错不 500 走降级', async () => {
  const d = deps();
  d.capture = async () => { throw new Error('tmux 挂'); };
  const { port, close } = await startHttpServer({ port: 0, deps: d });
  const r = await post(port, { session: 'cc', kind: 'permission', message: 'Claude needs your permission' });
  await close();
  assert.equal(r.code, 200);
  assert.equal(d.sentCards.length, 0);
  assert.match(d.sent[0][1], /待审批/);
});
