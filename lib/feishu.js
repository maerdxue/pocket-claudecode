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
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {  // #13 失败重试 1 次（限流/网络抖动）
    try {
      await client.im.message.create({
        params: { receive_id_type: 'chat_id' },
        data: { receive_id: chatId, msg_type: 'text', content: JSON.stringify({ text }) },
      });
      return;
    } catch (e) { lastErr = e; if (attempt === 0) await new Promise(r => setTimeout(r, 1000)); }
  }
  throw lastErr;
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
  if (r && r.code != null && r.code !== 0) throw new Error(`createGroup code=${r.code} ${r.msg || ''}`);  // #11 失败抛错不假绑定
  const chatId = r && r.data && r.data.chat_id;
  if (!chatId) throw new Error('createGroup 未返回 chat_id');
  return chatId;
}


function parseReceiveEvent(data) {
  let text = '';
  try { text = JSON.parse(data.message.content || '{}').text || ''; } catch {}
  text = text.replace(/@_user_\d+/g, '').replace(/\s+/g, ' ').trim();  // 去 @ 占位符 + 收空格
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
