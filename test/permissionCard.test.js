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

test('buildHandledCard: 无 options 降级显示已注入', () => {
  const card = buildHandledCard({ input: '2' });
  const div = card.elements.find(e => e.tag === 'div');
  assert.match(div.text.content, /已注入.*2/);
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
