// hooks/notify_hook.js — 全局 Notification：读 stdin 的 session_id + message，POST /push kind=permission
// relay 按 sessionId 路由 + 截屏推群；未绑定的自动丢弃。
const http = require('http');
const PORT = parseInt(process.env.RELAY_PORT || '7788', 10);
function die(c) { process.exit(c); }
let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  try {
    const j = JSON.parse(d);
    const sessionId = j.session_id;
    if (!sessionId) die(0);
    const message = j.message || '需要输入';
    const req = http.request({ host: '127.0.0.1', port: PORT, path: '/push', method: 'POST', headers: { 'Content-Type': 'application/json' } }, () => die(0));
    req.on('error', () => die(0));
    req.write(JSON.stringify({ session: sessionId, kind: 'permission', message }));
    req.end();
  } catch { die(0); }
});
setTimeout(() => die(0), 1500).unref();
