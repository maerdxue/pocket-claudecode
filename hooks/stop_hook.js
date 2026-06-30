// hooks/stop_hook.js — 全局 Stop：读 stdin 的 session_id + last_assistant_message，POST /push
// relay 按 sessionId 路由到绑定的群；未绑定的自动丢弃。无需 env-guard/TMUX_PANE。
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
    const text = j.last_assistant_message || '';
    if (!text) die(0);  // 空 last_assistant_message 不推占位垃圾
    const transcriptPath = j.transcript_path || '';
    const req = http.request({ host: '127.0.0.1', port: PORT, path: '/push', method: 'POST', headers: { 'Content-Type': 'application/json' } }, () => die(0));
    req.on('error', () => die(0));
    req.write(JSON.stringify({ session: sessionId, kind: 'result', text, transcript_path: transcriptPath }));
    req.end();
  } catch { die(0); }
});
setTimeout(() => die(0), 5000).unref();
