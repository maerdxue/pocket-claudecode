#!/usr/bin/env node
// hooks/mac_notify.js — CC Stop 弹 macOS 通知：
// subtitle = 会话名(你起的,如"主要程序") 优先, 退化项目目录名(cwd); body = 任务主题(ai-title/last-prompt)
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');

// 扫 ~/.claude/sessions/ 找 sessionId 对应的会话名(用户起的名)
function readSessionName(sessionId) {
  if (!sessionId) return '';
  try {
    const dir = os.homedir() + '/.claude/sessions';
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const e = JSON.parse(fs.readFileSync(dir + '/' + f, 'utf8'));
        if (e.sessionId === sessionId && e.name) return String(e.name);
      } catch {}
    }
  } catch {}
  return '';
}

function readCtx(transcriptPath) {
  const r = { cwd: '', topic: '' };
  if (!transcriptPath) return r;
  try {
    const tail = execFileSync('tail', ['-n', '30', transcriptPath], { encoding: 'utf8', timeout: 500, stdio: ['ignore', 'pipe', 'ignore'] });
    let ai = '', lp = '';
    for (const line of tail.split('\n')) {
      try {
        const e = JSON.parse(line);
        if (e && e.type === 'ai-title' && e.aiTitle) ai = String(e.aiTitle);
        if (e && e.type === 'last-prompt' && e.lastPrompt) lp = String(e.lastPrompt);
        if (e && e.cwd && !r.cwd) r.cwd = String(e.cwd);
      } catch {}
    }
    r.topic = (ai || lp).trim().replace(/\s+/g, ' ').slice(0, 60);
    r.cwd = r.cwd ? r.cwd.split('/').filter(Boolean).pop() : '';
  } catch {}
  return r;
}

let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  let j = {};
  try { j = JSON.parse(d || '{}'); } catch {}
  const ctx = readCtx(j.transcript_path || '');
  const name = readSessionName(j.session_id || '');
  const sub = (name || ctx.cwd || 'Claude Code').replace(/"/g, '\\"');
  const body = '已完成';
  try {
    execFileSync('osascript', ['-e', `display notification "${body}" with title "Claude Code" subtitle "${sub}" sound name "Glass"`], { stdio: 'ignore' });
  } catch {}
  process.exit(0);
});
