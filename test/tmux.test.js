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
