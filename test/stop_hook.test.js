// test/stop_hook.test.js
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

function startServer(onReq) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let d = '';
      req.on('data', c => d += c);
      req.on('end', () => { onReq(d); res.end('ok'); });
    });
    server.listen(0, () => resolve({ server, port: server.address().port }));
  });
}

function runHook(port, input) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(__dirname, '../hooks/stop_hook.js')], {
      env: { ...process.env, RELAY_PORT: String(port) },
    });
    p.stdin.write(JSON.stringify(input));
    p.stdin.end();
    p.on('close', code => resolve(code));
  });
}

test('stop_hook: 空 last_assistant_message 不推（die 0）', async () => {
  let pushed = false;
  const { server, port } = await startServer(() => { pushed = true; });
  const code = await runHook(port, { session_id: 's1', last_assistant_message: '' });
  server.close();
  assert.equal(code, 0);
  assert.equal(pushed, false);  // 空不推占位垃圾
});

test('stop_hook: 有 last_assistant_message 推 /push', async () => {
  let body = null;
  const { server, port } = await startServer(d => { body = d; });
  await runHook(port, { session_id: 's1', last_assistant_message: 'hello' });
  server.close();
  assert.ok(body);
  const j = JSON.parse(body);
  assert.equal(j.session, 's1');
  assert.equal(j.text, 'hello');
});

test('stop_hook: 无 session_id die 0 不推', async () => {
  let pushed = false;
  const { server, port } = await startServer(() => { pushed = true; });
  const code = await runHook(port, { last_assistant_message: 'x' });
  server.close();
  assert.equal(code, 0);
  assert.equal(pushed, false);
});
