// test/ccsessions.test.js
const test = require('node:test');
const assert = require('node:assert');
const cc = require('../lib/ccsessions');

test('scan: 返回数组，每条有 pid/sessionId/name/cwd', () => {
  const s = cc.scan();
  assert.ok(Array.isArray(s));
  for (const e of s) {
    assert.ok(e.pid, '有 pid');
    assert.ok(e.sessionId, '有 sessionId');
    assert.ok(typeof e.name === 'string');
    assert.ok(typeof e.cwd === 'string');
  }
});

test('encodeCwd', () => {
  assert.equal(cc.encodeCwd('/Users/x/project'), '-Users-x-project');
  assert.equal(cc.encodeCwd(''), '');
});

test('timeAgo', () => {
  const now = Date.now();
  assert.equal(cc.timeAgo(now), '刚刚');
  assert.equal(cc.timeAgo(now - 5 * 1000), '刚刚');
  assert.equal(cc.timeAgo(now - 5 * 60 * 1000), '5分钟前');
  assert.equal(cc.timeAgo(now - 3 * 3600 * 1000), '3小时前');
  assert.equal(cc.timeAgo(now - 2 * 86400 * 1000), '2天前');
});

test('fmtSize', () => {
  assert.equal(cc.fmtSize(0), '0B');
  assert.equal(cc.fmtSize(500), '500B');
  assert.equal(cc.fmtSize(2048), '2.0KB');
  assert.equal(cc.fmtSize(2 * 1048576), '2.0MB');
});

test('alive: 当前进程存活，假 pid 不在', () => {
  assert.equal(cc.alive(process.pid), true);
  assert.equal(cc.alive(99999999), false);
  assert.equal(cc.alive(null), false);
});

test('#9 aliveClaude: 不存在/假 pid 返回 false（不调 ps 误判）', () => {
  assert.equal(cc.aliveClaude(99999999), false);
  assert.equal(cc.aliveClaude(null), false);
});
