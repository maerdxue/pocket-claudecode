// lib/util.js
function truncate(s, max = 30000, suffix = '…(已截断)') {
  if (s == null) return '';
  s = String(s);
  return s.length <= max ? s : s.slice(0, max) + '\n' + suffix;
}

module.exports = { truncate };
