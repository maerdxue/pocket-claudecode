// test/log.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'); const os = require('os'); const path = require('path');
const log = require('../lib/log');

test('append + readTail', () => {
  const dir = path.join(os.tmpdir(), `log-${Date.now()}`);
  log.append(dir, 'sess-a', { dir:'in', kind:'prompt', text:'hi' });
  log.append(dir, 'sess-a', { dir:'out', kind:'result', text:'hello' });
  const tail = log.readTail(dir, 'sess-a', 10);
  assert.equal(tail.length, 2);
  assert.equal(tail[0].text, 'hi');
  assert.equal(tail[1].text, 'hello');
  assert.ok(tail[0].ts);  // 自动加 ts
});

test('readTail 不存在的会话返回空数组', () => {
  const dir = path.join(os.tmpdir(), `log2-${Date.now()}`);
  assert.deepEqual(log.readTail(dir, 'nope', 5), []);
});
