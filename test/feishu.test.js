// test/feishu.test.js
const test = require('node:test');
const assert = require('node:assert');
const feishu = require('../lib/feishu');

test('sendToChat: 调 im.message.create 正确参数', async () => {
  const calls = [];
  const fakeClient = { im: { message: { create: async (args) => { calls.push(args); return {}; } } } };
  await feishu.sendToChat(fakeClient, 'oc_123', 'hello');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].params.receive_id_type, 'chat_id');
  assert.equal(calls[0].data.receive_id, 'oc_123');
  assert.deepEqual(JSON.parse(calls[0].data.content), { text: 'hello' });
});

test('createGroup: 调 im.chat.create 并返回 chat_id', async () => {
  const fakeClient = { im: { chat: { create: async (args) => { return { data: { chat_id: 'oc_NEW' } }; } } } };
  const chatId = await feishu.createGroup(fakeClient, 'one-cli', 'ou_me');
  assert.equal(chatId, 'oc_NEW');
});

test('#11 createGroup: code 非 0 抛错不假绑定', async () => {
  const fakeClient = { im: { chat: { create: async () => ({ code: 99999, msg: 'fail' }) } } };
  await assert.rejects(feishu.createGroup(fakeClient, 'x', 'ou_me'), /code=99999/);
});

test('#11 createGroup: 无 chat_id 抛错', async () => {
  const fakeClient = { im: { chat: { create: async () => ({ code: 0, data: {} }) } } };
  await assert.rejects(feishu.createGroup(fakeClient, 'x', 'ou_me'), /未返回 chat_id/);
});

test('#13 sendToChat: 失败重试 1 次后成功', async () => {
  let calls = 0;
  const fakeClient = { im: { message: { create: async () => { calls++; if (calls === 1) throw new Error('limit'); return {}; } } } };
  await feishu.sendToChat(fakeClient, 'oc_1', 'hi');
  assert.equal(calls, 2);  // 第一次失败重试第二次成功
});

test('parseReceiveEvent: 从 im.message.receive_v1 提取 chatId/openId/text/chatType', () => {
  const data = {
    sender: { sender_id: { open_id: 'ou_me' } },
    message: { chat_id: 'oc_1', message_type: 'text', chat_type: 'group', content: '{"text":"hi @_user_1"}' },
  };
  const p = feishu.parseReceiveEvent(data);
  assert.equal(p.chatId, 'oc_1');
  assert.equal(p.openId, 'ou_me');
  assert.equal(p.chatType, 'group');
  assert.equal(p.text, 'hi');  // parseReceiveEvent 去 @占位符
});

test('parseReceiveEvent: @ 占位符去掉，/命令干净', () => {
  const data = {
    sender: { sender_id: { open_id: 'ou_me' } },
    message: { chat_id: 'oc_1', message_type: 'text', chat_type: 'group', content: '{"text":"@_user_1  /status"}' },
  };
  const p = feishu.parseReceiveEvent(data);
  assert.equal(p.text, '/status');
});

test('sendCard: 调 im.message.create 发 interactive 卡片，返回 message_id', async () => {
  const calls = [];
  const fakeClient = { im: { message: { create: async (args) => { calls.push(args); return { data: { message_id: 'om_1' } }; } } } };
  const mid = await feishu.sendCard(fakeClient, 'oc_1', { header: { title: { content: 'x' } } });
  assert.equal(mid, 'om_1');
  assert.equal(calls[0].params.receive_id_type, 'chat_id');
  assert.equal(calls[0].data.receive_id, 'oc_1');
  assert.equal(calls[0].data.msg_type, 'interactive');
  assert.deepEqual(JSON.parse(calls[0].data.content), { header: { title: { content: 'x' } } });
});

test('patchCard: 调 im.message.patch 更新卡片', async () => {
  const calls = [];
  const fakeClient = { im: { message: { patch: async (args) => { calls.push(args); } } } };
  await feishu.patchCard(fakeClient, 'om_1', { elements: [] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path.message_id, 'om_1');
  assert.deepEqual(JSON.parse(calls[0].data.content), { elements: [] });
});

test('parseCardAction: 从 card.action.trigger 提取 chatId/value/openId（v2 context）', () => {
  const data = {
    context: { open_chat_id: 'oc_1', open_message_id: 'om_1' },
    operator: { open_id: 'ou_me' },
    action: { tag: 'button', value: { choice: '1' } },
  };
  const c = feishu.parseCardAction(data);
  assert.equal(c.chatId, 'oc_1');
  assert.equal(c.messageId, 'om_1');
  assert.equal(c.openId, 'ou_me');
  assert.equal(c.tag, 'button');
  assert.deepEqual(c.value, { choice: '1' });
});

test('parseCardAction: 老 schema 顶层 id 兼容', () => {
  const data = { open_chat_id: 'oc_2', open_message_id: 'om_2', action: { value: '1' } };
  const c = feishu.parseCardAction(data);
  assert.equal(c.chatId, 'oc_2');
  assert.equal(c.value, '1');
});
