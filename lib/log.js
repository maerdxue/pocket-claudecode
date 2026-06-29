// lib/log.js
const fs = require('fs');
const path = require('path');

function logPath(logDir, session) {
  return path.join(logDir, `${session}.jsonl`);
}

function append(logDir, session, entry) {
  fs.mkdirSync(logDir, { recursive: true });
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n';
  fs.appendFileSync(logPath(logDir, session), line);
}

function readTail(logDir, session, n = 10) {
  try {
    const raw = fs.readFileSync(logPath(logDir, session), 'utf8').trim();
    if (!raw) return [];
    return raw.split('\n').slice(-n).map(l => JSON.parse(l));
  } catch { return []; }
}

module.exports = { append, readTail };
