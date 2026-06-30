// test/tmux.test.js
const test = require('node:test');
const assert = require('node:assert');
const tmux = require('../lib/tmux');

test('parseListPanes: 只挑 claude 进程的 pane', () => {
  const raw = [
    'cc\tclaude_exe\t/home/me/project/cc-feishu',
    'relay\tnode\t/home/me/project/one-cli',
    '1\tzsh\t/home/me',
  ].join('\n');
  const out = tmux.parseListPanes(raw);
  assert.deepEqual(out, [{ session: 'cc', cwd: '/home/me/project/cc-feishu' }]);
});

test('parseListPanes: 空输入返回 []', () => {
  assert.deepEqual(tmux.parseListPanes(''), []);
  assert.deepEqual(tmux.parseListPanes(null), []);
});

test('sendKeys: -l text 然后 Enter 顺序', async () => {
  const calls = [];
  const mockExec = (args) => { calls.push(args); return Promise.resolve(''); };
  await tmux.sendKeys('sess', 'hi', mockExec);
  assert.deepEqual(calls[0], ['send-keys', '-t', 'sess', '-l', 'hi']);
  assert.deepEqual(calls[1], ['send-keys', '-t', 'sess', 'Enter']);
});

test('sendKeys: 同 pane 并发串行不交错', async () => {
  const calls = [];
  const mockExec = (args) => { calls.push(args.join(' ')); return Promise.resolve(''); };
  await Promise.all([
    tmux.sendKeys('p', 'A', mockExec),
    tmux.sendKeys('p', 'B', mockExec),
  ]);
  // A 的 text+Enter 完成后 B 才开始，不交错成 A_text B_text A_Enter B_Enter
  assert.deepEqual(calls, [
    'send-keys -t p -l A',
    'send-keys -t p Enter',
    'send-keys -t p -l B',
    'send-keys -t p Enter',
  ]);
});
