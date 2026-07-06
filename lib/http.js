// lib/http.js
const http = require('http');
const registry = require('./registry');
const { truncate } = require('./util');
const { buildPermissionCard, buildContentCard, parseOptions, BUTTONS } = require('./permissionCard');
const { markdownToCard } = require('./cardrender');

function startHttpServer({ port, deps }) {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const active = Object.values(deps.reg).filter(e => e.status === 'active').length;
        const bound = Object.values(deps.reg).filter(e => e.chat_id).length;
        const wsReady = typeof deps.wsReady === 'function' ? deps.wsReady() : !!deps.wsReady;
        return res.end(JSON.stringify({ ok: true, sessions: { active, bound }, ws_ready: wsReady }));
      }
      // 安全说明：/push 绑 127.0.0.1 但无鉴权，本机任意进程可伪造推送。个人单机可接受；多用户/高敏感场景应加 RELAY_PUSH_TOKEN 校验（future）。
      if (req.method === 'POST' && req.url === '/push') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', async () => {
          try {
            const { session, kind, text, message } = JSON.parse(body || '{}');
            const entry = deps.reg[session];
            const chatId = entry?.chat_id;
            if (!chatId) { res.writeHead(200); return res.end('no-bound'); }  // 没绑群：丢弃
            if (kind === 'permission') {
              let screen = null;
              try { screen = await deps.capture(session); } catch (e) { console.error('capture 失败:', e.message); }  // #12 capture 异常不 500，走降级
              const isApproval = message && /permission/i.test(message);  // "Claude needs your permission" vs idle "waiting for your input"
              const label = entry.group_name || entry.name || session.slice(0, 8);
              const options = parseOptions(screen || '');
              const plainMsg = (withScreen) => {
                const head = isApproval ? `⏸ 会话${label ? ' ' + label : ''}待审批，等你处理。` : `⏸ 会话${label ? ' ' + label : ''}已就绪，等你输入。`;
                return head + (message ? `（${message}）` : '') + (withScreen && screen ? '\n' + truncate(screen) : '');
              };
              const sendPlain = async (withScreen = false) => { try { await deps.send(chatId, plainMsg(withScreen)); } catch (e) { deps.unbind(session); console.error('push 失败，解绑', session, e.message); return false; } return true; };
              if ((isApproval && screen) || options) {
                // 内容消息：展示 screen（独立卡片，点确认后不被清空，回看仍知当时在干嘛）
                try { await deps.sendCard(chatId, buildContentCard({ screen, message, label })); }
                catch (e) { console.error('内容卡片发失败:', e.message); }
                // 确认卡片：按钮（不带 screen）；setPending 存 options 供 patch 保留选项
                const btns = options || BUTTONS;
                let mid;
                try { mid = await deps.sendCard(chatId, buildPermissionCard({ message: isApproval ? '待审批' : '请选择', label, buttons: btns })); }
                catch (e) { console.error('确认卡 sendCard 失败，降级纯文本:', e.message); mid = null; }
                if (mid) deps.setPending(session, { chatId, messageId: mid, ts: Date.now(), options: btns, screen, message, label });
                else { const ok = await sendPlain(true); if (!ok) return res.writeHead(200).end('unbind'); }
              } else if (isApproval) {
                // 真权限但非 tmux(capture null)：发"待审批"提示供决策
                const ok = await sendPlain(true);
                if (!ok) return res.writeHead(200).end('unbind');
              }
              // idle(waiting for input) 不发——CC stop 已推结果，多发"已就绪"无用
              deps.appendLog(session, { dir: 'note', kind: 'permission', text: message || '', screen: screen || '' });
            } else {
              // last_assistant_message 原文 → 飞书卡片(markdown+表格组件) → sendCard；失败降级纯文本原文
              const label = entry.group_name || entry.name || session.slice(0, 8);
              const card = markdownToCard(text || '(空)', { label });
              try { await deps.sendCard(chatId, card); }
              catch (e) {
                console.error('sendCard 失败，降级纯文本:', e.message);
                try { await deps.send(chatId, truncate(text || '(空)')); }
                catch (e2) { deps.unbind(session); console.error('push 失败，解绑', session, e2.message); return res.writeHead(200).end('unbind'); }
              }
              deps.appendLog(session, { dir: 'out', kind: 'result', text: text || '' });
            }
            res.writeHead(200); res.end('ok');
          } catch (e) { res.writeHead(500); res.end(e.message); }
        });
      } else {
        res.writeHead(404); res.end('nf');
      }
    });
    server.listen(port, '127.0.0.1', () => resolve({ port: server.address().port, close: () => server.close() }));
  });
}

module.exports = { startHttpServer };
