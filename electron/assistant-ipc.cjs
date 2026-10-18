const { ipcMain, dialog, shell, app } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { CodexService } = require('./codex-service.cjs');

function registerAssistant(getWindow) {
  let service, active, tools = [], instructions = '';
  const conversations = new Map(), pending = new Map();
  let loadedConversations = false;
  const root = () => path.join(app.getPath('userData'), 'assistant');
  const emit = event => { const win = getWindow(); if (win && !win.isDestroyed()) win.webContents.send('assistant:event', event); };
  const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
  const filePath = id => { if (!validId(id)) throw new Error('Некорректный идентификатор документа'); return path.join(root(), 'history', `${id}.json`); };
  const ensureService = () => {
    if (service) return service;
    service = new CodexService({ cwd: root(), codexHome: path.join(root(), 'codex-profile'), tools, instructions,
      openExternal: url => { const u = new URL(url); if (u.protocol !== 'https:' || !['auth.openai.com','auth0.openai.com','chatgpt.com'].includes(u.hostname)) throw new Error('Неизвестный адрес авторизации'); return shell.openExternal(url); },
      onEvent: ({ method, params = {} }) => {
        const conversationId = active?.conversationId;
        if (method === 'connection/status') emit({ type: 'connection', ...params });
        else if (method === 'connection/error' || method === 'error' || method === 'assistant/timeout') {
          emit({ type: 'error', conversationId, message: params.message || params.error?.message || 'Задача Codex прервана. Подключитесь снова.' });
          if (method === 'connection/error') { active = null; for (const p of pending.values()) { clearTimeout(p.timer); p.resolve({ ok: false, error: 'Соединение прервано' }); } pending.clear(); }
        }
        else if (method === 'item/agentMessage/delta') emit({ type: 'delta', conversationId, text: params.delta });
        else if (method === 'turn/completed') {
          emit({ type: params.turn?.status === 'failed' ? 'error' : 'done', conversationId, cancelled: params.turn?.status === 'interrupted', message: params.turn?.error?.message });
          active = null;
        } else if (method === 'item/started') emit({ type: 'status', conversationId, text: params.item?.type === 'webSearch' ? 'Поиск источников…' : 'Codex работает…' });
        else if (method === 'thread/tokenUsage/updated') emit({ type: 'usage', conversationId, usage: params.tokenUsage });
      },
      onToolCall: call => new Promise((resolve, reject) => {
        const requestId = crypto.randomUUID();
        const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('Редактор не ответил')); }, 110000);
        pending.set(requestId, { resolve, timer });
        emit({ type: 'tool', requestId, conversationId: active?.conversationId, documentId: active?.documentId, name: call.tool, arguments: call.arguments });
      }),
    });
    return service;
  };
  const handle = (name, callback) => ipcMain.handle(`assistant:${name}`, async (event, arg = {}) => {
    const win = getWindow();
    if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('Unknown sender');
    return callback(arg);
  });
  handle('status', () => service?.status() || { connected: false });
  handle('connect', async arg => {
    if (Array.isArray(arg.tools) && arg.tools.length <= 10 && JSON.stringify(arg.tools).length < 100000) tools = arg.tools.filter(t => /^presentation_[a-z_]+$/.test(t.name));
    if (typeof arg.instructions === 'string') instructions = arg.instructions.slice(0, 20000);
    await fs.mkdir(root(), { recursive: true });
    if (!loadedConversations) {
      try { const saved = JSON.parse(await fs.readFile(path.join(root(), 'threads.json'), 'utf8')); for (const [key, value] of Object.entries(saved)) if (typeof value === 'string') conversations.set(key, value); } catch (e) { if (e.code !== 'ENOENT') throw new Error('Не удалось прочитать список разговоров'); }
      loadedConversations = true;
    }
    return ensureService().connect();
  });
  handle('login', () => ensureService().login());
  handle('disconnect', () => { service?.disconnect(); service = null; active = null; for (const p of pending.values()) { clearTimeout(p.timer); p.resolve({ ok: false, error: 'Отключено' }); } pending.clear(); return { connected: false }; });
  handle('send', async arg => {
    if (!validId(arg.conversationId) || !validId(arg.documentId) || typeof arg.prompt !== 'string' || arg.prompt.length > 50000) throw new Error('Некорректный запрос');
    if (active) throw new Error('Дождитесь завершения текущей задачи');
    active = { conversationId: arg.conversationId, documentId: arg.documentId };
    try {
      const attachments = (arg.attachments || []).slice(0, 8).map(a => ({ id: a.id, name: String(a.name).slice(0, 250), textCharacters: a.text?.length || 0, hasImage: !!a.dataUrl, instruction: 'Read text with presentation_read_attachment only when relevant; insert images with attachmentId.' }));
      const context = { ...arg.context, attachments };
      if (JSON.stringify(context).length > 1200000) throw new Error('Слишком большой контекст');
      const key = `${arg.documentId}:${arg.conversationId}`;
      const result = await ensureService().send({ threadId: conversations.get(key), text: arg.prompt, context, mode: arg.mode,
        images: (arg.attachments || []).filter(a => a.analyzeImage && a.dataUrl).map(a => ({ url: a.dataUrl })) });
      conversations.set(key, result.threadId);
      const threadsPath = path.join(root(), 'threads.json');
      await fs.writeFile(`${threadsPath}.tmp`, JSON.stringify(Object.fromEntries(conversations)), { mode: 0o600 });
      await fs.rename(`${threadsPath}.tmp`, threadsPath);
      return result;
    } catch (error) { active = null; throw error; }
  });
  handle('stop', () => service?.stop() || { stopped: true });
  handle('tool-result', arg => { const p = pending.get(arg.requestId); if (p) { clearTimeout(p.timer); pending.delete(arg.requestId); p.resolve(arg.result); } return true; });
  handle('history-load', async arg => { try { const data = await fs.readFile(filePath(arg.documentId), 'utf8'); if (data.length > 12 * 1024 * 1024) return []; return JSON.parse(data); } catch (e) { if (e.code === 'ENOENT') return []; throw e; } });
  handle('history-save', async arg => {
    const target = filePath(arg.documentId), value = JSON.stringify(arg.conversations);
    if (!Array.isArray(arg.conversations) || value.length > 12 * 1024 * 1024) throw new Error('История слишком велика. Очистите старые разговоры.');
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temp, value, { mode: 0o600 }); await fs.rename(temp, target); return true;
  });
  handle('pick-attachments', async () => {
    const result = await dialog.showOpenDialog(getWindow(), { title: 'Материалы для помощника', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Материалы', extensions: ['pdf','docx','pptx','json','pfree','txt','md','csv','png','jpg','jpeg','webp','gif'] }] });
    if (result.canceled) return [];
    const output = []; let total = 0;
    for (const target of result.filePaths.slice(0, 8)) {
      const stat = await fs.stat(target); total += stat.size;
      if (!stat.isFile() || stat.size > 20 * 1024 * 1024 || total > 40 * 1024 * 1024) throw new Error('Максимум 20 МБ на файл и 40 МБ суммарно');
      const data = await fs.readFile(target);
      output.push({ id: crypto.createHash('sha256').update(data).digest('hex'), name: path.basename(target), size: data.length, data: data.toString('base64') });
    }
    return output;
  });
  app.on('before-quit', () => service?.disconnect());
}
module.exports = { registerAssistant };
