// test/permissionCard.test.js
const test = require('node:test');
const assert = require('node:assert');
const { buildPermissionCard, buildHandledCard, buildContentCard, extractInput, parseOptions, BUTTONS } = require('../lib/permissionCard');

test('buildPermissionCard: 不含 screen，含 message+按钮+note', () => {
  const card = buildPermissionCard({ message: '待审批', label: 'one-cli:cc' });
  assert.equal(card.config.wide_screen_mode, true);
  assert.equal(card.header.template, 'orange');
  const div = card.elements.find(e => e.tag === 'div');
  assert.equal(div.text.tag, 'lark_md');
  assert.match(div.text.content, /待审批/);
  assert.doesNotMatch(div.text.content, /```/);  // 不含 screen 代码块
  const action = card.elements.find(e => e.tag === 'action');
  assert.deepEqual(action.actions.map(b => b.value), ['1', '2', '3']);  // 默认 BUTTONS
  assert.deepEqual(action.actions.map(b => b.text.content), ['1', '2', '3']);
  assert.ok(card.elements.some(e => e.tag === 'note'));
});

test('buildPermissionCard: 传 buttons 用自定义按钮', () => {
  const opts = [{ label: '方案一·A', value: { choice: '1' }, type: 'default' }, { label: '方案二·B', value: { choice: '2' }, type: 'default' }];
  const card = buildPermissionCard({ message: '请选择', buttons: opts });
  const action = card.elements.find(e => e.tag === 'action');
  assert.deepEqual(action.actions.map(b => b.value), [{ choice: '1' }, { choice: '2' }]);
  assert.match(action.actions[0].text.content, /方案一·A/);
});

test('buildContentCard: screen 进代码块 + message + label', () => {
  const card = buildContentCard({ screen: 'line1\nline2', message: '需要输入', label: 'one-cli:cc' });
  assert.equal(card.header.template, 'blue');
  const div = card.elements.find(e => e.tag === 'div');
  assert.equal(div.text.tag, 'lark_md');
  assert.match(div.text.content, /```/);
  assert.match(div.text.content, /line1/);
  assert.match(div.text.content, /line2/);
  assert.match(div.text.content, /需要输入/);
  assert.match(div.text.content, /one-cli:cc/);
});

test('buildContentCard: 空 screen 显示无画面', () => {
  const card = buildContentCard({ screen: '', message: 'x' });
  const div = card.elements.find(e => e.tag === 'div');
  assert.match(div.text.content, /无画面/);
});

test('buildContentCard: 截屏超长截断到 4000 内', () => {
  const card = buildContentCard({ screen: 'x'.repeat(5000) });
  const div = card.elements.find(e => e.tag === 'div');
  assert.ok(div.text.content.length < 5000);
});

test('buildHandledCard: 有 options 保留选项+标记已选，无按钮', () => {
  const opts = [{ label: '方案一·A', value: { choice: '1' } }, { label: '方案二·B', value: { choice: '2' } }];
  const card = buildHandledCard({ options: opts, input: '2' });
  assert.ok(!card.elements.some(e => e.tag === 'action'));  // 无按钮
  const div = card.elements.find(e => e.tag === 'div');
  assert.match(div.text.content, /方案一·A/);
  assert.match(div.text.content, /方案二·B/);
  assert.match(div.text.content, /✅/);  // 有已选标记
  assert.match(div.text.content, /已选择.*2/);
});

test('buildHandledCard: choice number vs input string 统一比较标对 ✅', () => {
  const opts = [{ label: 'A', value: { choice: 1 } }, { label: 'B', value: { choice: 2 } }];
  const card = buildHandledCard({ options: opts, input: '1' });  // input string, choice number
  const div = card.elements.find(e => e.tag === 'div');
  assert.match(div.text.content, /✅ A/);
  assert.match(div.text.content, /⬜ B/);
});

test('buildHandledCard: 无 options 降级显示已注入', () => {
  const card = buildHandledCard({ input: '2' });
  const div = card.elements.find(e => e.tag === 'div');
  assert.match(div.text.content, /已注入.*2/);
});

test('#17 buildHandledCard: input 不匹配选项走已注入不画方框', () => {
  const opts = [{ label: 'A', value: { choice: '1' } }, { label: 'B', value: { choice: '2' } }];
  const card = buildHandledCard({ options: opts, input: '手打文本' });
  const div = card.elements.find(e => e.tag === 'div');
  assert.match(div.text.content, /已注入.*手打文本/);
  assert.doesNotMatch(div.text.content, /⬜/);
});

test('#21 parseOptions: label 含 emoji 按码点截断不乱码', () => {
  const opts = parseOptions('Choose an option:\n1. 🚀发射\n2. 🎉庆祝\n3. 🌟星');
  assert.equal(opts.length, 3);
  assert.ok(opts[0].label.includes('🚀'));
});

test('#22 buildContentCard: 空 screen 纯文本不代码块裹', () => {
  const card = buildContentCard({ screen: '', message: 'x' });
  const div = card.elements.find(e => e.tag === 'div');
  assert.match(div.text.content, /无画面/);
  assert.doesNotMatch(div.text.content, /```/);
});

test('parseOptions: 无菜单上下文(模型回复编号列表)不误认', () => {
  const screen = '1. 5选项卡是不是5个按钮全有\n2. 多菜单卡是不是当前题选项';
  assert.equal(parseOptions(screen), null);  // 无 Choose 标题，编号列表不当选项
});

test('parseOptions: CC 回复编号列表+输入框❯ prompt 不误判', () => {
  const screen = '已定：\n1. 宽松 schema 字段必填\n2. 模型质量摘要放末尾\n3. 外部检索失败降级\n\n问题 1：...\nA. 保存\nB. 不保存\n❯ ';
  assert.equal(parseOptions(screen), null);  // 无 Choose 标题，❯ 是输入框 prompt 不是菜单 marker
});

test('extractInput: 字符串原样', () => {
  assert.equal(extractInput('1'), '1');
  assert.equal(extractInput('y'), 'y');
});

test('extractInput: 对象取 choice（字符串/数字）', () => {
  assert.equal(extractInput({ choice: '2' }), '2');
  assert.equal(extractInput({ choice: 3 }), '3');
});

test('extractInput: 无效返回 null', () => {
  assert.equal(extractInput(null), null);
  assert.equal(extractInput(undefined), null);
  assert.equal(extractInput({}), null);
});

test('parseOptions: 识别方案一/二/三 → 带 choice 的 options', () => {
  const screen = '我给三个方案：\n方案一：Redis\n方案二：LRU\n方案三：SQLite\n选哪个？';
  const opts = parseOptions(screen);
  assert.equal(opts.length, 3);
  assert.equal(opts[0].value.choice, '1');
  assert.equal(opts[1].value.choice, '2');
  assert.equal(opts[2].value.choice, '3');
  assert.match(opts[0].label, /Redis/);
  assert.match(opts[1].label, /LRU/);
});

test('parseOptions: 不足 2 个返回 null', () => {
  assert.equal(parseOptions('随便聊\n方案一：A'), null);
  assert.equal(parseOptions(''), null);
  assert.equal(parseOptions(null), null);
});

test('parseOptions: CC 标准菜单 1. xxx 认全 5 个', () => {
  const screen = 'Choose an option:\n1. Redis\n2. LRU\n3. SQLite\n4. Memcache\n5. 文件';
  const opts = parseOptions(screen);
  assert.equal(opts.length, 5);
  assert.deepEqual(opts.map(o => o.value.choice), ['1', '2', '3', '4', '5']);
  assert.match(opts[0].label, /Redis/);
  assert.match(opts[4].label, /文件/);
});

test('parseOptions: 兼容 ❯/> 高亮 marker 前缀', () => {
  const screen = 'Choose an option:\n1. A\n❯ 2. B\n3. C';
  const opts = parseOptions(screen);
  assert.equal(opts.length, 3);
  assert.equal(opts[1].value.choice, '2');
  assert.match(opts[1].label, /^B/);  // marker 不进 label
});

test('parseOptions: 多题表单截屏认当前题选项（Q1/Q2/Q3 tab 行忽略）', () => {
  const screen = 'Q1  Q2  Q3  ✓ Submit\n← →\nChoose an option:\n1. 方案甲\n2. 方案乙\n3. 方案丙';
  const opts = parseOptions(screen);
  assert.equal(opts.length, 3);
  assert.deepEqual(opts.map(o => o.value.choice), ['1', '2', '3']);
  assert.match(opts[0].label, /方案甲/);
});
