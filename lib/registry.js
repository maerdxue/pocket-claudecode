// lib/registry.js — 以 CC sessionId 为键（resume 后不变，绑定持久）
const fs = require('fs');
const path = require('path');

function load(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; } }
function save(p, reg) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(reg, null, 2)); }
function basename(cwd) { return path.basename(cwd || '') || 'session'; }
function genGroupName(cwd, name) { return `${basename(cwd)}:${name}`; }

// scanned: ccsessions.scan() 结果 [{sessionId, pid, name, cwd, status, updatedAt, size}]
// 不在 scanned 里的：绑定的→inactive 保留（可 resume 接回）；未绑定的→丢弃
function merge(reg, scanned) {
  const now = new Date().toISOString();
  const next = {};
  for (const s of scanned) {
    const ex = reg[s.sessionId];
    next[s.sessionId] = {
      sessionId: s.sessionId,
      pid: s.pid,
      name: s.name,
      cwd: s.cwd,
      ccStatus: s.status,            // CC 的 idle/busy
      updatedAt: s.updatedAt,
      size: s.size,
      status: 'active',              // 运行中
      chat_id: ex?.chat_id ?? null,
      group_name: ex?.group_name ?? null,
      doc_id: ex?.doc_id ?? null,
      last_seen: now,
    };
  }
  for (const sid of Object.keys(reg)) {
    if (next[sid]) continue;
    if (reg[sid].chat_id) {
      // 绑定过的：inactive 保留（resume 同 sessionId 自动接回）
      next[sid] = { ...reg[sid], status: 'inactive', pid: null, last_seen: now };
    }
    // 未绑定的：丢弃
  }
  return next;
}

function findByChatId(reg, chatId) {
  for (const [sid, e] of Object.entries(reg)) {
    if (e.chat_id === chatId) return sid;
  }
  return null;
}
function bind(reg, sid, chatId, groupName) {
  if (reg[sid]) reg[sid] = { ...reg[sid], chat_id: chatId, group_name: groupName };
  return reg;
}
function unbind(reg, sid) {
  if (reg[sid]) reg[sid] = { ...reg[sid], chat_id: null, group_name: null };
  return reg;
}
function get(reg, sid) { return reg[sid] || null; }

module.exports = { load, save, basename, genGroupName, merge, findByChatId, bind, unbind, get };
