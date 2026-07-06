// lib/commands.js
const registry = require('./registry');
const { genGroupName, basename } = registry;
const { truncate } = require('./util');
const cc = require('./ccsessions');  // timeAgo/fmtSize
const { extractInput, buildHandledCard } = require('./permissionCard');
const ccskills = require('./ccskills');

const PENDING_TTL_MS = 300 * 1000;

// CC 内置 / 命令（静态；skills/自定义命令由 ccskills 动态扫描 ~/.claude）
const BUILTINS = [
  '/clear /compact /resume /exit',
  '/model /config /memory /init /permissions',
  '/review /agents /mcp',
  '/help /cost /status /doctor',
].join('\n');

// 按 项目→name 排序，/list 和 /open 共用一致序号
function orderedSessions(d) {
  return d.listSessions().sort((a, b) => {
    const pa = basename(a.cwd), pb = basename(b.cwd);
    if (pa !== pb) return pa < pb ? -1 : 1;
    return (a.name || '') < (b.name || '') ? -1 : 1;
  });
}

async function handleMessage(msg, d) {
  const { text, chatId, chatType, openId } = msg;
  if (!openId) return;  // openId 缺失拒绝（防 undefined 短路放行）
  if (d.myOpenId && openId !== d.myOpenId) return;
  const isGroup = chatType === 'group';
  const isCmd = text.startsWith('/');

  if (!isGroup && isCmd) {
    const [cmd, ...args] = text.slice(1).split(/\s+/);
    if (cmd === 'whoami') return d.send(chatId, `你的 open_id: \`${openId || '(拿不到)'}\`\n\n填到 .env 的 FEISHU_MY_OPEN_ID（白名单），重启 relay 生效。`);
    if (cmd === 'list') return d.send(chatId, formatList(orderedSessions(d)));
    if (cmd === 'open') return cmdOpen(d, chatId, args.join(' '));
    if (cmd === 'claude') return d.send(chatId, truncate(ccskills.buildCheatSheet(BUILTINS)));
    if (cmd === 'help') return d.send(chatId, [
      '单聊: /list /open <序号|对话名> /whoami /claude /help',
      '群里: /status /history [N] /close，或直接发文本注入',
      'inactive：/history /close 可用；发消息或 /status 提示未运行',
      '非 tmux 会话：能看不能控（注入需 tmux）'
    ].join('\n'));
  }
  if (!isGroup && !isCmd) {
    if (!d.myOpenId) return d.send(chatId, `首次配置——你的 open_id: \`${openId || '(拿不到)'}\`\n\n填到 .env 的 FEISHU_MY_OPEN_ID 后重启 relay（pkill -f 'relay\\.js'）让白名单生效，再发 /list 开始。`);
    return d.send(chatId, '这是控制台，用 /list /open；对话去对应群。');
  }

  const sessionId = registry.findByChatId(d.reg, chatId);
  if (!sessionId) return d.send(chatId, '此群未绑定会话，单聊 /open <序号|对话名>。');
  const entry = d.reg[sessionId];
  const inactive = entry && entry.status !== 'active';

  if (isCmd) {
    const [cmd, ...args] = text.slice(1).split(/\s+/);
    if (cmd === 'history') {
      const n = args[0] !== undefined ? Math.max(1, parseInt(args[0], 10) || 1) : 10;
      const tail = d.readLog(sessionId, n);
      const body = tail.map(e => `[${e.dir}] ${e.text}`).join('\n') || '(无历史)';
      return d.send(chatId, truncate(body));
    }
    if (cmd === 'close') { d.unbind(sessionId); return d.send(chatId, '已解绑，会话不再推送。'); }
    if (cmd === 'status') {
      if (inactive) return d.send(chatId, notRunningMsg(entry));
      const screen = await d.capture(sessionId);
      if (screen === null) return d.send(chatId, notInTmuxMsg());
      return d.send(chatId, truncate(screen || '(无画面)', 30000, '…(已截断，/history 看全)'));
    }
    return d.send(chatId, '未知命令。/status /history [N] /close，或直接发文本注入。');
  }

  if (inactive) return d.send(chatId, notRunningMsg(entry));
  if (entry && entry.ccStatus === 'busy') {
    if (d.queuePrompt) d.queuePrompt(sessionId, text);
    return d.send(chatId, `⏳ CC 正在忙，消息已排队，忙完自动发（不用重发）。`);
  }
  try {
    await d.inject(sessionId, text);
    d.appendLog(sessionId, { dir: 'in', kind: 'prompt', text });
  } catch (e) {
    if (e.message === 'not-in-tmux') return d.send(chatId, notInTmuxMsg());
    throw e;
  }
}

function notRunningMsg(entry) {
  return `会话未运行（已退出）。恢复：CC 里 claude --resume ${entry?.name || ''}，恢复后此群自动接回。`;
}
function notInTmuxMsg() {
  return `会话不在 tmux 里，无法手机发指令/截屏。要可控请在 tmux 里跑（cc-start 或 tmux new 后 claude --resume）。`;
}

async function cmdOpen(d, replyChatId, arg) {
  if (!arg) return d.send(replyChatId, '用法：/open <序号|对话名>。先 /list 看序号。');
  const list = orderedSessions(d);
  let target = null;
  if (/^\d+$/.test(arg)) {
    target = list[parseInt(arg, 10) - 1];
    if (!target) return d.send(replyChatId, `无此序号：${arg}（/list 看可用序号）`);
  } else {
    let matches = list.filter(s => s.name === arg);  // 精确
    if (matches.length === 0) matches = list.filter(s => s.name && s.name.toLowerCase() === arg.toLowerCase());  // 忽略大小写
    if (matches.length === 0) matches = list.filter(s => s.name && s.name.toLowerCase().includes(arg.toLowerCase()));  // includes 兜底
    if (matches.length === 0) return d.send(replyChatId, `无此对话名：${arg}`);
    if (matches.length > 1) return d.send(replyChatId, `重名 "${arg}"，用 /open <序号>：\n` + matches.map(s => `${list.indexOf(s)+1} ${s.name} ${cc.timeAgo(s.updatedAt)} ${cc.fmtSize(s.size)}`).join('\n'));
    target = matches[0];
  }
  if (target.chat_id) {
    const tag = target.status === 'active' ? '' : '（未运行，resume 后可用）';
    return d.send(replyChatId, `已绑定群: ${target.group_name}${tag}`);
  }
  const groupName = genGroupName(target.cwd, target.name);
  let chatId;
  try { chatId = await d.createGroup(groupName, d.myOpenId); }
  catch (e) { return d.send(replyChatId, `建群失败：${e.message || e}，请稍后重试。`); }
  if (!chatId) return d.send(replyChatId, '建群失败（未返回 chat_id），请稍后重试。');
  d.bind(target.sessionId, chatId, groupName);
  const tag = target.status === 'active' ? '' : '（会话未运行，resume 后可用）';
  return d.send(replyChatId, `已建群'${groupName}'${tag}，去群里对话。`);
}

function formatList(sessions) {
  if (!sessions.length) return '(无会话)';
  const byProj = {};
  sessions.forEach((s, i) => {
    const proj = basename(s.cwd);
    (byProj[proj] = byProj[proj] || []).push({ s, idx: i + 1 });
  });
  return Object.entries(byProj).map(([proj, items]) => {
    const lines = items.map(({ s, idx }) => {
      const dot = s.status === 'active' ? '🟢' : '⚫';
      const bound = s.group_name ? `[已绑 ${s.group_name}]` : '[未绑群]';
      return ` ${idx} ${dot} ${s.name} · ${cc.timeAgo(s.updatedAt)} · ${cc.fmtSize(s.size)} · ${s.ccStatus || '-'} ${bound}`;
    }).join('\n');
    return `📁 ${proj}\n${lines}`;
  }).join('\n');
}

// 卡片按钮回调 → 注入 tmux。防陈旧靠 pending Map（/push permission 时 set）。
async function handleCardAction(action, d) {
  const { chatId, openId, value } = action;
  if (!openId) return;  // openId 缺失拒绝（防伪造回调 undefined 短路放行）
  if (d.myOpenId && openId !== d.myOpenId) return;  // 白名单
  const sessionId = registry.findByChatId(d.reg, chatId);
  if (!sessionId) { await d.send(chatId, '此群未绑定会话，无法处理卡片。'); return; }
  const pending = d.pending && d.pending.get(sessionId);
  if (!pending || Date.now() - pending.ts > PENDING_TTL_MS) {
    if (pending) d.pending.delete(sessionId);
    await d.send(chatId, '该权限卡片已过期，请手打回复。');
    return;
  }
  d.pending.delete(sessionId);  // 先于 inject，防双注入
  const input = extractInput(value);
  if (input == null) { await d.send(chatId, '无法识别按钮内容，请手打回复。'); return; }
  try {
    await d.inject(sessionId, input);
  } catch (e) {
    if (e.message === 'not-in-tmux') {
      await d.send(chatId, notInTmuxMsg());
      if (d.patchCard && pending.messageId) d.patchCard(pending.messageId, { config: { wide_screen_mode: true, update_multi: true }, header: { title: { tag: 'plain_text', content: '⚠️ 不在 tmux' }, template: 'red' }, elements: [{ tag: 'div', text: { tag: 'lark_md', content: '会话不在 tmux，请手打回复。' } }] }).catch(() => {});
      return;
    }
    throw e;
  }
  d.appendLog(sessionId, { dir: 'in', kind: 'card', text: input });
  if (d.patchCard && pending.messageId) {
    d.patchCard(pending.messageId, buildHandledCard({ options: pending.options, input })).catch(e => console.error('patchCard 失败:', e.message));
  }
}

module.exports = { handleMessage, handleCardAction, cmdOpen, formatList, notRunningMsg, notInTmuxMsg, orderedSessions };
