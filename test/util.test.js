// test/util.test.js
const test = require('node:test');
const assert = require('node:assert');
const { truncate } = require('../lib/util');

test('truncate: 短串不变', () => {
  assert.equal(truncate('hello'), 'hello');
});

test('truncate: 超长截断加后缀', () => {
  const s = 'x'.repeat(30001);
  const out = truncate(s);
  assert.equal(out.length, 30000 + '\n'.length + '…(已截断)'.length);
  assert.match(out, /…\(已截断\)$/);
});

test('truncate: null → 空串', () => {
  assert.equal(truncate(null), '');
  assert.equal(truncate(undefined), '');
});

test('truncate: 自定义 max 与后缀', () => {
  const out = truncate('abcdefgh', 4, '...');
  assert.equal(out, 'abcd\n...');
});
