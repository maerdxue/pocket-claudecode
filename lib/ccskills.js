// lib/ccskills.js — 扫描 CC 的 skills/commands 文件，给 /claude 动态生成命令清单
const fs = require('fs');
const os = require('os');
const path = require('path');

// 从 md 内容提取 YAML frontmatter（简单解析：key: value，value 去首尾引号）
function parseFrontmatter(content) {
  const m = String(content).match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return {};
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([\w][-\w]*)\s*:\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim();
  }
  return fm;
}

// 扫 dir/<skillName>/SKILL.md，返回 [{name, description, source}]
function scanDirSkills(dir, source) {
  const out = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    let content;
    try { content = fs.readFileSync(path.join(dir, e.name, 'SKILL.md'), 'utf8'); } catch { continue; }
    const fm = parseFrontmatter(content);
    out.push({ name: fm.name || e.name, description: fm.description || '', source });
  }
  return out;
}

// 扫 claudeDir/skills（user）+ claudeDir/plugins/cache/*/*/*/skills（plugin，提取插件名）
function scanSkills(claudeDir) {
  const out = [];
  out.push(...scanDirSkills(path.join(claudeDir, 'skills'), 'user'));
  const cacheDir = path.join(claudeDir, 'plugins', 'cache');
  let markets;
  try { markets = fs.readdirSync(cacheDir, { withFileTypes: true }); } catch { markets = []; }
  for (const mk of markets) {
    if (!mk.isDirectory()) continue;
    let plugins;
    try { plugins = fs.readdirSync(path.join(cacheDir, mk.name), { withFileTypes: true }); } catch { continue; }
    for (const p of plugins) {
      if (!p.isDirectory()) continue;
      let versions;
      try { versions = fs.readdirSync(path.join(cacheDir, mk.name, p.name), { withFileTypes: true }); } catch { continue; }
      for (const v of versions) {
        if (!v.isDirectory()) continue;
        out.push(...scanDirSkills(path.join(cacheDir, mk.name, p.name, v.name, 'skills'), `plugin:${p.name}`));
      }
    }
  }
  // 同 source+name 去重（plugin 多版本目录会重复扫，CC 实际只用最新版）
  const seen = new Set();
  return out.filter(s => { const k = s.source + '|' + s.name; if (seen.has(k)) return false; seen.add(k); return true; });
}

// 扫 claudeDir/commands/*.md，name=frontmatter.name 或文件名；过滤 hide-from-slash-command-tool
function scanCommands(claudeDir) {
  const dir = path.join(claudeDir, 'commands');
  const out = [];
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return out; }
  for (const f of entries) {
    if (!f.endsWith('.md')) continue;
    let content;
    try { content = fs.readFileSync(path.join(dir, f), 'utf8'); } catch { continue; }
    const fm = parseFrontmatter(content);
    if (fm['hide-from-slash-command-tool'] === 'true') continue;
    out.push({ name: fm.name || f.replace(/\.md$/, ''), description: fm.description || '' });
  }
  return out;
}

function truncDesc(s, max = 44) {
  s = String(s || '').replace(/\n/g, ' ').trim();
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

// 格式化清单：自定义命令 / User skills / 各 Plugin / Built-in
function formatCheatSheet(skills, commands, builtins) {
  const lines = ['📝 CC / 命令清单（动态扫描本地文件，在 CC 会话里敲，非此处）', ''];
  if (commands.length) {
    lines.push(`【自定义命令】(${commands.length})`);
    for (const c of commands.sort((a, b) => a.name < b.name ? -1 : 1)) lines.push(`/${c.name}  ${truncDesc(c.description)}`);
    lines.push('');
  }
  const bySrc = {};
  for (const s of skills) { (bySrc[s.source] = bySrc[s.source] || []).push(s); }
  const sources = Object.keys(bySrc).sort((a, b) => (a === 'user' ? 0 : 1) - (b === 'user' ? 0 : 1) || a.localeCompare(b));
  for (const src of sources) {
    const list = bySrc[src].sort((a, b) => a.name < b.name ? -1 : 1);
    const label = src === 'user' ? `【User skills】(${list.length})` : `【Plugin: ${src.slice('plugin:'.length)}】(${list.length})`;
    lines.push(label);
    for (const s of list) lines.push(`${s.name}  ${truncDesc(s.description)}`);
    lines.push('');
  }
  lines.push('【Built-in】');
  lines.push(builtins);
  lines.push('', '以 CC 内 /help 实际清单为准；装了新 skill 重发 /claude 即自动列出。');
  return lines.join('\n');
}

// 一站式：扫本机 + 格式化。builtins 由调用方传（静态内置命令）。
// claudeDir 默认 CLAUDE_CONFIG_DIR || ~/.claude；测试可传 fixture 目录（其下直接是 skills/commands/plugins）。
function buildCheatSheet(builtins, claudeDir) {
  const cd = claudeDir || process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return formatCheatSheet(scanSkills(cd), scanCommands(cd), builtins);
}

module.exports = { parseFrontmatter, scanSkills, scanCommands, formatCheatSheet, buildCheatSheet };
