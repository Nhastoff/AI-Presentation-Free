import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL('../electron/assistant-ipc.cjs', import.meta.url), 'utf8');
const tool = name => ({ name, description: 'Presentation tool', inputSchema: { type: 'object' } });

function setup(savedThreads = {}) {
  const handlers = new Map(), sent = [], instances = [], reads = [], writes = new Map();
  const mainFrame = {};
  const win = { isDestroyed: () => false, webContents: { mainFrame, send: (name, event) => sent.push({ name, event }) } };
  const event = { sender: win.webContents, senderFrame: mainFrame };
  class FakeService {
    constructor(options) { Object.assign(this, options); this.options = options; instances.push(this); }
    async connect() { this.connected = true; return this.status(); }
    async login() { this.loginCalled = true; return { type: 'chatgpt', authUrl: 'https://auth.openai.com/authorize' }; }
    status() { return { connected: !!this.connected }; }
    async send(request) { this.lastRequest = request; return { threadId: request.threadId || 'created-thread', turnId: 'turn-1' }; }
    disconnect() { this.connected = false; }
  }
  const fsMock = {
    mkdir: async () => {},
    readFile: async target => { reads.push(target); if (target.endsWith('threads.json')) return JSON.stringify(savedThreads); const error = new Error('Missing'); error.code = 'ENOENT'; throw error; },
    writeFile: async (target, data) => writes.set(target, data),
    rename: async (from, to) => { writes.set(to, writes.get(from)); writes.delete(from); },
  };
  const mocks = {
    electron: { ipcMain: { handle: (name, callback) => handlers.set(name, callback) }, dialog: {}, shell: { openExternal: async () => {} }, app: { getPath: () => '/isolated-smoke-profile', on: () => {} } },
    'node:fs/promises': fsMock,
    './codex-service.cjs': { CodexService: FakeService },
  };
  const module = { exports: {} };
  const context = vm.createContext({ module, exports: module.exports, require: name => mocks[name] || require(name), setTimeout, clearTimeout, URL });
  new vm.Script(source, { filename: 'assistant-ipc.cjs' }).runInContext(context);
  module.exports.registerAssistant(() => win);
  const invoke = (name, arg, senderEvent = event) => handlers.get(`assistant:${name}`)(senderEvent, arg);
  return { invoke, handlers, event, sent, instances, reads, writes };
}

test('first action login registers tools/instructions and restores persisted Codex thread mapping', async () => {
  const f = setup({ 'document-1:conversation-1': 'persisted-thread' });
  const tools = [tool('presentation_summary'), tool('presentation_edit')];
  await f.invoke('login', { tools, instructions: 'Use presentation tools.' });
  assert.equal(f.instances.length, 1);
  assert.equal(f.instances[0].loginCalled, true);
  assert.equal(f.instances[0].tools.length, 2);
  assert.equal(f.instances[0].tools[1].name, 'presentation_edit');
  assert.equal(f.instances[0].instructions, 'Use presentation tools.');
  await f.invoke('send', { documentId: 'document-1', conversationId: 'conversation-1', prompt: 'Continue', mode: 'balanced' });
  assert.equal(f.instances[0].lastRequest.threadId, 'persisted-thread');
  assert.equal(f.reads.filter(target => target.endsWith('threads.json')).length, 1);
});

test('connect after login updates existing service configuration before creating threads', async () => {
  const f = setup();
  await f.invoke('login', { tools: [tool('presentation_summary')], instructions: 'Initial' });
  await f.invoke('connect', { tools: [tool('presentation_edit'), tool('shell_execute')], instructions: 'Updated' });
  assert.equal(f.instances.length, 1);
  assert.equal(f.instances[0].tools.length, 1);
  assert.equal(f.instances[0].tools[0].name, 'presentation_edit');
  assert.equal(f.instances[0].instructions, 'Updated');
  assert.equal(f.instances[0].connected, true);
});

test('every IPC entry rejects foreign windows and child frames', async () => {
  const f = setup();
  for (const callback of f.handlers.values()) {
    await assert.rejects(callback({ sender: {}, senderFrame: f.event.senderFrame }, {}), /Unknown sender/);
    await assert.rejects(callback({ sender: f.event.sender, senderFrame: {} }, {}), /Unknown sender/);
  }
  assert.equal(f.instances.length, 0);
});

test('tool calls route to active document and resolve only matching editor replies', async () => {
  const f = setup();
  await f.invoke('connect', { tools: [tool('presentation_summary')] });
  await f.invoke('send', { documentId: 'document-1', conversationId: 'conversation-1', prompt: 'Read', mode: 'economy' });
  const resultPromise = f.instances[0].options.onToolCall({ tool: 'presentation_summary', arguments: {} });
  const message = f.sent.at(-1).event;
  assert.equal(message.type, 'tool');
  assert.equal(message.documentId, 'document-1');
  assert.equal(message.conversationId, 'conversation-1');
  assert.equal(message.name, 'presentation_summary');
  await f.invoke('tool-result', { requestId: 'other-request', result: { ok: false } });
  await f.invoke('tool-result', { requestId: message.requestId, result: { ok: true, revision: 'r1' } });
  const result = await resultPromise;
  assert.equal(result.ok, true);
  assert.equal(result.revision, 'r1');
  await assert.rejects(f.invoke('connect', { tools: [] }), /Дождитесь завершения/);
  f.instances[0].options.onEvent({ method: 'turn/completed', params: { turn: { status: 'completed' } } });
  await f.invoke('connect', { tools: [tool('presentation_edit')] });
  assert.equal(f.instances[0].tools[0].name, 'presentation_edit');
});

test('disconnect settles outstanding editor calls and releases active task', async () => {
  const f = setup();
  await f.invoke('connect', { tools: [tool('presentation_summary')] });
  await f.invoke('send', { documentId: 'document-1', conversationId: 'conversation-1', prompt: 'Read' });
  const resultPromise = f.instances[0].options.onToolCall({ tool: 'presentation_summary', arguments: {} });
  await f.invoke('disconnect');
  assert.equal((await resultPromise).ok, false);
  await f.invoke('connect', { tools: [tool('presentation_summary')] });
  assert.equal(f.instances.length, 2);
});
