#!/usr/bin/env node
// hooks/mac_notify.js — Claude Code Stop 弹 macOS 通知。
// title = Claude Code · 会话名；subtitle = 项目目录；body = 已完成 + 最近任务主题。
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function clean(value, max = 80) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function basename(p) {
  if (!p) return '';
  return path.basename(String(p).replace(/\/+$/, ''));
}

function readSessionInfo(sessionId) {
  if (!sessionId) return {};
  try {
    const dir = path.join(os.homedir(), '.claude', 'sessions');
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const e = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        if (e.sessionId === sessionId) return e;
      } catch {}
    }
  } catch {}
  return {};
}

function readLastLines(file, maxLines = 200, maxBytes = 256 * 1024) {
  if (!file) return [];
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const stat = fs.fstatSync(fd);
      const size = Math.min(stat.size, maxBytes);
      const buf = Buffer.alloc(size);
      fs.readSync(fd, buf, 0, size, Math.max(0, stat.size - size));
      return buf.toString('utf8').split('\n').filter(Boolean).slice(-maxLines);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return [];
  }
}

function messageText(e) {
  const msg = e && e.message;
  if (!msg) return '';
  const c = msg.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c
      .map(x => (x && typeof x === 'object' ? (x.text || x.content || '') : String(x || '')))
      .filter(Boolean)
      .join(' ');
  }
  return '';
}

function readTranscriptContext(transcriptPath) {
  const ctx = { cwd: '', topic: '' };
  let aiTitle = '';
  let lastPrompt = '';
  let lastHuman = '';

  for (const line of readLastLines(transcriptPath)) {
    try {
      const e = JSON.parse(line);
      if (e.cwd) ctx.cwd = String(e.cwd);
      if (e.type === 'ai-title' && e.aiTitle) aiTitle = String(e.aiTitle);
      if (e.type === 'last-prompt' && e.lastPrompt) lastPrompt = String(e.lastPrompt);
      if (e.type === 'user' && e.origin && e.origin.kind === 'human') {
        const text = messageText(e);
        if (text) lastHuman = text;
      }
    } catch {}
  }

  ctx.topic = clean(aiTitle || lastPrompt || lastHuman, 90);
  return ctx;
}

function buildNotification(input) {
  const session = readSessionInfo(input.session_id || input.sessionId || '');
  const ctx = readTranscriptContext(input.transcript_path || input.transcriptPath || '');

  const sessionName = clean(input.session_name || input.name || session.name, 40);
  const project = clean(basename(input.cwd || session.cwd || ctx.cwd), 40);
  const displayName = sessionName || project || 'Claude Code';
  const topic = ctx.topic;

  return {
    title: `Claude Code · ${displayName}`,
    subtitle: project && project !== displayName ? project : '任务完成',
    body: topic ? `已完成：${topic}` : `${displayName} 已完成`,
  };
}

let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  let input = {};
  try { input = JSON.parse(d || '{}'); } catch {}
  const notification = buildNotification(input);

  if (process.env.CLAUDE_HOOK_NOTIFY_DRY_RUN === '1') {
    console.log(JSON.stringify(notification, null, 2));
    process.exit(0);
  }

  const script = `on run argv
  display notification (item 1 of argv) with title (item 2 of argv) subtitle (item 3 of argv) sound name "Glass"
end run`;

  try {
    execFileSync('osascript', ['-e', script, notification.body, notification.title, notification.subtitle], { stdio: 'ignore' });
  } catch {}
  process.exit(0);
});

setTimeout(() => process.exit(0), 5000).unref();
