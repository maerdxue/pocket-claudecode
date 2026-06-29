// lib/permissionCard.js — 权限审批交互卡片构造（纯函数）
const { truncate } = require('./util');

// 默认按钮（真权限 1/2/3）。方案选择时由 parseOptions 生成带描述的 options 替代。
const BUTTONS = [
  { label: '1', value: '1', type: 'default' },
  { label: '2', value: '2', type: 'default' },
  { label: '3', value: '3', type: 'default' },
];

const NOTE = '对照上方内容点对应按钮；非选项或自由输入请直接手打回复。';

// screen 拼成 markdown 代码块（内容卡片用）
function screenBody({ screen, message, label }) {
  let head = '';
  if (label) head += `**${label}**\n`;
  if (message) head += `**${message}**\n\n`;
  const body = (screen || '').trim() || '(无画面)';
  return `${head}\`\`\`\n${truncate(body, 4000)}\n\`\`\``;
}

// 内容卡片：展示 screen（方案列表/审批画面），独立一条消息，点确认后不被清空
function buildContentCard({ screen = '', message = '', label = '' } = {}) {
  return {
    config: { wide_screen_mode: true },
    header: { title: { tag: 'plain_text', content: label || 'Claude 状态' }, template: 'blue' },
    elements: [
      { tag: 'div', text: { tag: 'lark_md', content: screenBody({ screen, message, label }) } },
    ],
  };
}

// 确认卡片：简短提示 + 按钮（不带 screen，screen 在内容卡片）
function buildPermissionCard({ message = '', label = '', buttons = null } = {}) {
  const btns = (Array.isArray(buttons) && buttons.length) ? buttons : BUTTONS;
  let head = '';
  if (label) head += `**${label}**\n`;
  if (message) head += `**${message}**\n\n`;
  return {
    config: { wide_screen_mode: true, update_multi: true },
    header: { title: { tag: 'plain_text', content: '⏸ 需要输入' }, template: 'orange' },
    elements: [
      { tag: 'div', text: { tag: 'lark_md', content: `${head}点对应按钮选择，或直接手打回复。` } },
      { tag: 'note', elements: [{ tag: 'plain_text', content: NOTE }] },
      { tag: 'action', actions: btns.map(b => ({
        tag: 'button',
        text: { tag: 'plain_text', content: b.label },
        type: b.type || 'default',
        value: b.value,
      })) },
    ],
  };
}

// 点确认后 patch：保留原选项 + 标记已选，不清空（无 options 降级显示已注入）
function buildHandledCard({ options = null, input = '' } = {}) {
  let body;
  if (Array.isArray(options) && options.length) {
    body = options.map(o => {
      const chosen = (o.value && o.value.choice === input) || o.value === input;
      return `${chosen ? '✅' : '⬜'} ${o.label}`;
    }).join('\n');
    body += `\n\n已选择：\`${input}\``;
  } else {
    body = `已注入：\`${input}\``;
  }
  return {
    config: { wide_screen_mode: true, update_multi: true },
    header: { title: { tag: 'plain_text', content: '✅ 已处理' }, template: 'green' },
    elements: [
      { tag: 'div', text: { tag: 'lark_md', content: body } },
    ],
  };
}

// 按钮回调 value → 要注入的裸字符。兼容字符串与 {choice} 对象。
function extractInput(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    if (typeof value.choice === 'string') return value.choice;
    if (typeof value.choice === 'number') return String(value.choice);
    return null;
  }
  return null;
}

// 从截屏文本解析"方案N：xxx"，返回带描述的按钮 options；不足 2 个返回 null（降级纯文本）
function parseOptions(screen) {
  if (!screen) return null;
  const numMap = { '一': 1, '二': 2, '三': 3, '四': 4, '1': 1, '2': 2, '3': 3, '4': 4 };
  const opts = [];
  for (const line of String(screen).split('\n')) {
    const m = line.match(/^\s*方案\s*([一二三四1-4])\s*[：:.\-、)]\s*(.+?)\s*$/);
    if (m) {
      const n = numMap[m[1]];
      if (n) opts.push({ label: `方案${m[1]} · ${m[2].trim().slice(0, 20)}`, value: { choice: String(n) }, type: 'default' });
    }
  }
  return opts.length >= 2 ? opts : null;
}

module.exports = { buildPermissionCard, buildContentCard, buildHandledCard, extractInput, parseOptions, BUTTONS };
