// lib/ccsessions.js — 扫描 CC 的会话登记本 ~/.claude/sessions/<pid>.json
// CC 每个运行中的 claude 进程都有一条记录，含 pid/sessionId/name/cwd/status。
const fs = require('fs');
const path = require('path');
const os = require('os');

const SESSIONS_DIR = path.join(os.homedir(), '.claude', 'sessions');

function encodeCwd(cwd) { return (cwd || '').replace(/\//g, '-'); }

function transcriptPath(cwd, sessionId) {
  return path.join(os.homedir(), '.claude', 'projects', encodeCwd(cwd), `${sessionId}.jsonl`);
}

function alive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function timeAgo(ms) {
  if (!ms) return '?';
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 0) return '刚刚';
  if (s < 60) return '刚刚';
  if (s < 3600) return Math.floor(s / 60) + '分钟前';
  if (s < 86400) return Math.floor(s / 3600) + '小时前';
  return Math.floor(s / 86400) + '天前';
}

function fmtSize(bytes) {
  if (!bytes || bytes < 0) return '0B';
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / 1048576).toFixed(1) + 'MB';
}

// 扫描所有运行中（进程存活、interactive）的 CC 会话
function scan() {
  const out = [];
  let files = [];
  try { files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json')); }
  catch { return []; }
  for (const f of files) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf8'));
      if (!j.sessionId || !j.pid) continue;
      if (!alive(j.pid)) continue;                          // 进程不在 → 不算运行中
      if (j.kind && j.kind !== 'interactive') continue;    // 只要交互式
      let size = 0;
      try { size = fs.statSync(transcriptPath(j.cwd, j.sessionId)).size; } catch {}
      out.push({
        pid: j.pid,
        sessionId: j.sessionId,
        name: j.name || '(未命名)',
        cwd: j.cwd || '',
        status: j.status || '?',
        updatedAt: j.updatedAt || j.startedAt || 0,
        size,
      });
    } catch {}
  }
  return out;
}

module.exports = { scan, transcriptPath, encodeCwd, alive, timeAgo, fmtSize, SESSIONS_DIR };
