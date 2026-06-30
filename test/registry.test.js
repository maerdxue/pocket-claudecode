// test/registry.test.js
const test = require('node:test');
const assert = require('node:assert');
const reg = require('../lib/registry');

test('genGroupName: 项目:对话名', () => {
  assert.equal(reg.genGroupName('/foo/one-cli', '会话测试'), 'one-cli:会话测试');
  assert.equal(reg.genGroupName('/foo/one-cli', 'auth'), 'one-cli:auth');
});

test('merge: scanned→active，保留已有绑定', () => {
  const before = {
    'sid-a': { sessionId:'sid-a', chat_id:'oc_A', group_name:'p:a', status:'active', name:'a', cwd:'/p/a' },
  };
  const scanned = [{ sessionId:'sid-a', pid:111, name:'a', cwd:'/p/a', status:'idle', updatedAt:1, size:10 }];
  const after = reg.merge(before, scanned);
  assert.equal(after['sid-a'].status, 'active');
  assert.equal(after['sid-a'].chat_id, 'oc_A');
  assert.equal(after['sid-a'].pid, 111);
  assert.equal(after['sid-a'].ccStatus, 'idle');
});

test('merge: 新 scanned 会话 chat_id=null', () => {
  const after = reg.merge({}, [{ sessionId:'sid-b', pid:222, name:'b', cwd:'/p/b', status:'busy', updatedAt:2, size:20 }]);
  assert.equal(after['sid-b'].chat_id, null);
  assert.equal(after['sid-b'].status, 'active');
});

test('merge: 绑定的不在 scanned→inactive 保留绑定', () => {
  const before = { 'sid-a': { sessionId:'sid-a', chat_id:'oc_A', group_name:'p:a', status:'active', name:'a', cwd:'/p/a', pid:111 } };
  const after = reg.merge(before, []);
  assert.equal(after['sid-a'].status, 'inactive');
  assert.equal(after['sid-a'].chat_id, 'oc_A');
  assert.equal(after['sid-a'].pid, null);
});

test('merge: 未绑定的不在 scanned→prune', () => {
  const after = reg.merge({ 'sid-x': { sessionId:'sid-x', chat_id:null, status:'active', name:'x', cwd:'/p/x' } }, []);
  assert.equal(after['sid-x'], undefined);
});

test('#15 merge: inactive 超 7 天 TTL 清除', () => {
  const old = new Date(Date.now() - 8 * 86400 * 1000).toISOString();
  const after = reg.merge({ 'sid-old': { sessionId:'sid-old', chat_id:'oc_O', last_seen: old, status:'inactive', name:'o', cwd:'/p/o' } }, []);
  assert.equal(after['sid-old'], undefined);
});

test('#15 merge: inactive 7 天内保留', () => {
  const recent = new Date(Date.now() - 3 * 86400 * 1000).toISOString();
  const after = reg.merge({ 'sid-r': { sessionId:'sid-r', chat_id:'oc_R', last_seen: recent, status:'inactive', name:'r', cwd:'/p/r' } }, []);
  assert.ok(after['sid-r']);
  assert.equal(after['sid-r'].status, 'inactive');
});

test('merge: inactive+绑定 被 resume→active，原群接回', () => {
  const before = { 'sid-a': { sessionId:'sid-a', chat_id:'oc_A', group_name:'p:a', status:'inactive', name:'a', cwd:'/p/a', pid:null } };
  const scanned = [{ sessionId:'sid-a', pid:333, name:'a', cwd:'/p/a', status:'idle', updatedAt:3, size:30 }];
  const after = reg.merge(before, scanned);
  assert.equal(after['sid-a'].status, 'active');
  assert.equal(after['sid-a'].chat_id, 'oc_A');
  assert.equal(after['sid-a'].pid, 333);
});

test('findByChatId', () => {
  const r = { 'sid-a': { chat_id:'oc_X' }, 'sid-b': { chat_id:null } };
  assert.equal(reg.findByChatId(r, 'oc_X'), 'sid-a');
  assert.equal(reg.findByChatId(r, 'oc_Y'), null);
});

test('bind/unbind', () => {
  let r = { 'sid-a': { chat_id:null, group_name:null, status:'active' } };
  r = reg.bind(r, 'sid-a', 'oc_Z', 'p:a');
  assert.equal(r['sid-a'].chat_id, 'oc_Z');
  r = reg.unbind(r, 'sid-a');
  assert.equal(r['sid-a'].chat_id, null);
});

test('load/save 往返', () => {
  const fs = require('fs'); const os = require('os'); const path = require('path');
  const p = path.join(os.tmpdir(), `reg-${Date.now()}.json`);
  reg.save(p, { 'sid-a': { chat_id:'oc_1' } });
  assert.deepEqual(reg.load(p), { 'sid-a': { chat_id:'oc_1' } });
  fs.unlinkSync(p);
});
