// lib/feishu.js
const lark = require('@larksuiteoapi/node-sdk');

function makeClients({ appId, appSecret, onReady, onError, onReconnected, onReconnecting }) {
  const client = new lark.Client({
    appId, appSecret,
    appType: lark.AppType.SelfBuild,
    domain: lark.Domain.Feishu,
  });
  const wsClient = new lark.WSClient({
    appId, appSecret,
    domain: lark.Domain.Feishu,
    onReady: onReady || (() => console.log('✅ 飞书长连接已建立')),
    onError: onError || ((err) => console.error('❌ 长连接失败:', err.message)),
    onReconnected: onReconnected || (() => console.log('🔁 飞书长连接已重连')),
    onReconnecting: onReconnecting || (() => console.warn('⏳ 飞书长连接重连中')),
  });
  return { client, wsClient };
}

async function sendToChat(client, chatId, text) {
  await client.im.message.create({
    params: { receive_id_type: 'chat_id' },
    data: { receive_id: chatId, msg_type: 'text', content: JSON.stringify({ text }) },
  });
}

async function sendCard(client, chatId, card) {
  const r = await client.im.message.create({
    params: { receive_id_type: 'chat_id' },
    data: { receive_id: chatId, msg_type: 'interactive', content: JSON.stringify(card) },
  });
  return r && r.data && r.data.message_id;
}

async function patchCard(client, messageId, card) {
  await client.im.message.patch({
    path: { message_id: messageId },
    data: { content: JSON.stringify(card) },
  });
}

async function createGroup(client, name, ownerOpenId) {
  const r = await client.im.chat.create({
    data: { name, description: 'CC 会话群', chat_mode: 'group', chat_type: 'private', external: false, owner_id: ownerOpenId },
  });
  return r.data.chat_id;
}

async function addMember(client, chatId, openId) {
  // 已废弃：createGroup(owner_id=openId) 已把用户拉进群、机器人是创建者自动在群。
  // 飞书 SDK 无 client.im.chat.members（chat 子资源仅 create/delete/get/link/list/search/update）。
  // 保留空实现仅为兼容旧调用方；cmdOpen 已不再调用。
}

function parseReceiveEvent(data) {
  let text = '';
  try { text = JSON.parse(data.message.content || '{}').text || ''; } catch {}
  return {
    chatId: data.message.chat_id,
    openId: data.sender?.sender_id?.open_id,
    chatType: data.message.chat_type,  // 'p2p' | 'group'
    msgType: data.message.message_type,
    text,
  };
}

// 卡片按钮点击回调（card.action.trigger）。v2 shape：id 嵌在 context；老 schema 在顶层，兼容两者。
function parseCardAction(data) {
  const ctx = data.context || {};
  const action = data.action || {};
  return {
    chatId: ctx.open_chat_id || data.open_chat_id,
    messageId: ctx.open_message_id || data.open_message_id,
    openId: data.operator?.open_id,
    tag: action.tag,
    value: action.value,
  };
}

function startReceive(wsClient, onMessage, onCardAction) {
  const dispatcher = new lark.EventDispatcher({}).register({
    'im.message.receive_v1': async (data) => {
      try { await onMessage(parseReceiveEvent(data)); }
      catch (e) { console.error('处理消息出错:', e); }
    },
    'card.action.trigger': async (data) => {
      try { if (onCardAction) await onCardAction(parseCardAction(data)); }
      catch (e) { console.error('处理卡片回调出错:', e); }
    },
  });
  return wsClient.start({ eventDispatcher: dispatcher });
}

module.exports = { makeClients, sendToChat, sendCard, patchCard, createGroup, parseReceiveEvent, parseCardAction, startReceive };
