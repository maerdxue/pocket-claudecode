// test/cardrender.test.js
const test = require('node:test');
const assert = require('node:assert');
const { markdownToCard } = require('../lib/cardrender');

test('纯文本段落 → 单 markdown 元素', () => {
  const c = markdownToCard('你好，这是回复。');
  assert.equal(c.elements.length, 1);
  assert.equal(c.elements[0].tag, 'markdown');
  assert.match(c.elements[0].content, /你好/);
});

test('表格 → table 元素，columns + rows(name:值)', () => {
  const c = markdownToCard('| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |');
  const t = c.elements.find(e => e.tag === 'table');
  assert.ok(t, '应有 table 元素');
  assert.deepEqual(t.columns.map(h => h.display_name), ['A', 'B']);
  assert.equal(t.rows.length, 2);
  assert.equal(t.rows[0]['c0'], '1');
  assert.equal(t.rows[1]['c1'], '4');
});

test('代码块 → markdown 元素含 fence', () => {
  const c = markdownToCard('```js\nconst x=1;\n```');
  assert.equal(c.elements[0].tag, 'markdown');
  assert.match(c.elements[0].content, /const x=1/);
  assert.match(c.elements[0].content, /```/);
});

test('混合：段落+表格+段落 → 三元素顺序正确', () => {
  const c = markdownToCard('前面一段。\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n后面一段。');
  assert.equal(c.elements.length, 3);
  assert.equal(c.elements[0].tag, 'markdown');
  assert.match(c.elements[0].content, /前面一段/);
  assert.equal(c.elements[1].tag, 'table');
  assert.equal(c.elements[2].tag, 'markdown');
  assert.match(c.elements[2].content, /后面一段/);
});

test('列表 → markdown 元素含列表项', () => {
  const c = markdownToCard('- 项一\n- 项二');
  assert.equal(c.elements[0].tag, 'markdown');
  assert.match(c.elements[0].content, /项一/);
  assert.match(c.elements[0].content, /项二/);
});

test('分割线 → hr 元素', () => {
  const c = markdownToCard('上\n\n---\n\n下');
  assert.ok(c.elements.some(e => e.tag === 'hr'));
  assert.equal(c.elements.filter(e => e.tag === 'markdown').length, 2);
});

test('header 含 label', () => {
  const c = markdownToCard('x', { label: '主要程序' });
  assert.match(c.header.title.content, /主要程序/);
});

test('标题保留在 markdown 块', () => {
  const c = markdownToCard('## 结论\n正文');
  assert.equal(c.elements[0].tag, 'markdown');
  assert.match(c.elements[0].content, /## 结论/);
});

test('空输入 → 空 elements', () => {
  const c = markdownToCard('');
  assert.equal(c.elements.length, 0);
});

test('#4 未闭合代码块降级普通文本（不吞后续当代码）', () => {
  const c = markdownToCard('```bash\nls\n后续文本');
  const md = c.elements.filter(e => e.tag === 'markdown').map(e => e.content).join('\n');
  assert.match(md, /后续文本/);  // 后续文本正常出现，不被吞当代码
  assert.doesNotMatch(md, /```bash\nls\n```/);  // 未闭合不补 ``` 闭合代码块
});

test('#3 超长 content 截断到上限内', () => {
  const c = markdownToCard('x'.repeat(50000));
  const md = c.elements.filter(e => e.tag === 'markdown').map(e => e.content).join('\n');
  assert.ok(md.length < 50000);
  assert.match(md, /已截断/);
});

test('#20 \\| 转义还原（单元格含 |）', () => {
  const c = markdownToCard('| a | b |\n|---|---|\n| 1\\|2 | 3 |');
  const t = c.elements.find(e => e.tag === 'table');
  assert.ok(t);
  assert.equal(t.rows[0]['c0'], '1|2');  // \| 还原为 |
});
