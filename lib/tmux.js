// lib/tmux.js
const { execFile } = require('child_process');

function exec(args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile('tmux', args, opts, (err, stdout) => {
      if (err) reject(err); else resolve(stdout);
    });
  });
}

// 解析 `tmux list-panes -a -F '#{session_name}\t#{pane_current_command}\t#{pane_current_path}'`
function parseListPanes(raw) {
  const out = [];
  for (const line of (raw || '').split('\n').filter(Boolean)) {
    const [session, cmd, cwd] = line.split('\t');
    if (cmd && cmd.startsWith('claude')) out.push({ session, cwd });
  }
  return out;
}

async function listClaudeSessions() {
  let raw;
  try {
    raw = await exec(['list-panes', '-a', '-F', '#{session_name}\t#{pane_current_command}\t#{pane_current_path}']);
  } catch { return []; }  // tmux server 没起
  return parseListPanes(raw);
}

async function sendKeys(session, text) {
  await exec(['send-keys', '-t', session, '-l', text]);
  await exec(['send-keys', '-t', session, 'Enter']);
}

async function capturePane(session, lines = 30) {
  const raw = await exec(['capture-pane', '-t', session, '-p', '-S', `-${lines}`]);
  return raw.trimEnd();
}

// 给 hooks 用：由 TMUX_PANE 反查会话名
async function sessionNameFromPane(pane) {
  const raw = await exec(['display-message', '-t', pane, '-p', '#{session_name}']);
  return raw.trim();
}

// pid → tty → tmux pane（注入路由用；不在 tmux 返回 null）
async function paneForPid(pid) {
  if (!pid) return null;
  let tty;
  try {
    const { execFileSync } = require('child_process');
    tty = execFileSync('ps', ['-o', 'tty=', '-p', String(pid)], { encoding: 'utf8' }).trim();
  } catch { return null; }
  if (!tty) return null;
  if (!tty.startsWith('/dev/')) tty = '/dev/' + tty;
  let raw;
  try { raw = await exec(['list-panes', '-a', '-F', '#{pane_id} #{pane_tty}']); }
  catch { return null; }
  for (const line of raw.split('\n').filter(Boolean)) {
    const [paneId, paneTty] = line.split(/\s+/);
    if (paneTty === tty) return paneId;
  }
  return null;  // 不在 tmux
}

module.exports = { exec, parseListPanes, listClaudeSessions, sendKeys, capturePane, sessionNameFromPane, paneForPid };
