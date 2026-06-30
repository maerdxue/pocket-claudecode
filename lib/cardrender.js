// lib/cardrender.js — markdown → 飞书消息卡片 JSON
// 飞书卡片 markdown 组件支持：加粗/斜体/删除线/链接/图片/有序无序列表/引用/代码块/标题
// 不支持表格 → 用 table 组件承载；分割线 → hr 元素

function splitCells(line) {
  return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '')
    .replace(/\\\|/g, '')  // \| 转义占位，避免被当列分隔
    .split('|')
    .map(s => s.replace(//g, '|').trim());
}
function isTableRow(line) { return /^\s*\|.*\|\s*$/.test(line); }
function isTableSep(line) {
  const t = line.trim();
  if (!t.startsWith('|') || !t.endsWith('|')) return false;
  const cells = t.slice(1, -1).split('|').map(s => s.trim());
  return cells.length >= 1 && cells.every(c => /^:?-+:?$/.test(c));  // 每列 :?-+:? 严格
}

// 从 lines[i]（表头行）解析表格，返回 { table, next }
// 飞书 table 组件：columns 定义列(name+display_name+data_type)，rows 用 {列name:值} 填充
function parseTable(lines, i) {
  const header = splitCells(lines[i]);
  const colNames = header.map((_, idx) => 'c' + idx);  // 列标记，避免表头名含特殊字符/重复
  const rows = [];
  let j = i + 2;  // 跳过表头 + 分隔行
  while (j < lines.length && isTableRow(lines[j])) {
    rows.push(splitCells(lines[j]));
    j++;
  }
  return {
    table: {
      tag: 'table',
      page_size: 10,
      columns: header.map((name, idx) => ({ name: colNames[idx], display_name: name, data_type: 'lark_md', width: 'auto' })),
      rows: rows.map(r => { const o = {}; colNames.forEach((cn, idx) => { o[cn] = r[idx] || ''; }); return o; }),
    },
    next: j,
  };
}

const MAX_CONTENT = 30000;  // 飞书单 markdown 元素 content 上限，超长会被拒
function cap(s) {
  s = String(s || '');
  return s.length <= MAX_CONTENT ? s : s.slice(0, MAX_CONTENT) + '\n…(已截断)';
}

// markdown → 飞书卡片 { config, header, elements[] }
function markdownToCard(md, { label } = {}) {
  const lines = (md || '').split('\n');
  const elements = [];
  let buf = [];
  let i = 0;
  const flush = () => {
    if (buf.length) {
      const content = cap(buf.join('\n').trim());
      if (content) elements.push({ tag: 'markdown', content });
      buf = [];
    }
  };
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {            // 代码块
      flush();
      const lang = line.trim().slice(3);
      const code = [];
      i++;
      let closed = false;
      while (i < lines.length) {
        if (lines[i].trim().startsWith('```')) { closed = true; break; }
        code.push(lines[i]); i++;
      }
      if (closed) {
        i++;  // 跳过闭合 fence
        elements.push({ tag: 'markdown', content: cap('```' + lang + '\n' + code.join('\n') + '\n```') });
      } else {
        // 未闭合：降级普通文本（开 fence + code 当字面，不当代码块吞后续到 EOF）
        buf.push(line, ...code);
      }
      continue;
    }
    if (/^---+\s*$/.test(line)) {                    // 分割线 → hr
      flush();
      elements.push({ tag: 'hr' });
      i++;
      continue;
    }
    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {  // 表格
      flush();
      const { table, next } = parseTable(lines, i);
      elements.push(table);
      i = next;
      continue;
    }
    buf.push(line);                                  // 普通行累积进 markdown 块
    i++;
  }
  flush();
  return {
    config: { wide_screen_mode: true },
    header: { title: { tag: 'plain_text', content: label || 'Claude 回复' }, template: 'blue' },
    elements,
  };
}

module.exports = { markdownToCard };
