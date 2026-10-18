import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const { CodexService, discoverCodex, selectMode } = createRequire(import.meta.url)('../electron/codex-service.cjs');

const models = [{ id: 'available-model', model: 'available-model', displayName: 'Available', isDefault: true,
  supportedReasoningEfforts: ['low', 'medium', 'high'].map(reasoningEffort => ({ reasoningEffort })), defaultReasoningEffort: 'medium' }];

function fixture(t, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'presentation-codex-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const messages = [], events = [];
  const child = new EventEmitter();
  child.stdout = new PassThrough(); child.stderr = new PassThrough();
  const notify = (method, params) => child.stdout.write(`${JSON.stringify({ method, params })}\n`);
  let auth = options.auth || 'chatgpt', launch;
  child.kill = () => child.emit('exit', 0);
  child.stdin = new Writable({ write(chunk, encoding, done) {
    for (const line of String(chunk).trim().split('\n')) {
      const message = JSON.parse(line); messages.push(message);
      if (!message.method || message.id === undefined) continue;
      let result = {};
      if (message.method === 'account/read') result = { account: { type: auth, planType: 'pro' } };
      if (message.method === 'model/list') result = { data: models };
      if (message.method === 'thread/start') result = { thread: { id: 'thread-1' } };
      if (message.method === 'thread/resume') result = { thread: { id: message.params.threadId } };
      if (message.method === 'turn/start') result = { turn: { id: 'turn-1' } };
      if (message.method === 'account/login/start') result = { type: 'chatgpt', authUrl: 'https://auth.openai.com/authorize?test=1' };
      queueMicrotask(() => child.stdout.write(`${JSON.stringify({ id: message.id, result })}\n`));
    }
    done();
  } });
  const service = new CodexService({ cwd: dir, codexHome: path.join(dir, 'profile'), executable: '/fake/codex',
    spawnProcess: (...args) => { launch = args; return child; }, onEvent: event => events.push(event), ...options });
  t.after(() => service.disconnect());
  return { service, messages, events, child, notify, get launch() { return launch; }, setAuth(value) { auth = value; } };
}

test('discovers macOS desktop binary without relying on a GUI app PATH', () => {
  assert.equal(discoverCodex({ platform: 'darwin', env: { PATH: '' }, home: '/Users/test', exists: p => p === '/Applications/Codex.app/Contents/Resources/codex' }), '/Applications/Codex.app/Contents/Resources/codex');
});

test('modes use actual advertised efforts and retain supported default model', () => {
  assert.equal(selectMode(models, 'economy').effort, 'low');
  assert.equal(selectMode(models, 'quality').effort, 'high');
  assert.equal(selectMode([{ ...models[0], supportedReasoningEfforts: [{ reasoningEffort: 'custom' }], defaultReasoningEffort: 'custom' }], 'quality').effort, 'custom');
});

test('initializes isolated ChatGPT App Server and registers dynamic tools', async t => {
  const f = fixture(t, { tools: [{ name: 'read_slides', description: 'Read', inputSchema: { type: 'object' } }] });
  const state = await f.service.connect();
  assert.equal(state.authenticated, true);
  assert.equal(f.launch[2].shell, false);
  assert.ok(f.launch[2].env.CODEX_HOME.endsWith('profile'));
  assert.ok(f.launch[1].includes('forced_login_method="chatgpt"'));
  assert.ok(f.launch[1].includes('features.shell_tool=false'));
  assert.equal(f.launch[2].env.OPENAI_API_KEY, undefined);
  const result = await f.service.send({ text: 'Создай слайд', mode: 'economy' });
  assert.equal(result.effort, 'low');
  const start = f.messages.find(m => m.method === 'thread/start');
  assert.equal(start.params.dynamicTools[0].type, 'function');
  assert.equal(start.params.sandbox, 'read-only');
  assert.equal(start.params.approvalPolicy, 'never');
  f.notify('item/agentMessage/delta', { threadId: 'thread-1', delta: 'Готово' });
  f.notify('turn/completed', { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.service.status().busy, false);
  assert.ok(f.events.some(e => e.method === 'item/agentMessage/delta'));
  await f.service.send({ threadId: 'thread-1', text: 'Поправь заголовок' });
  assert.equal(f.messages.filter(m => m.method === 'thread/start').length, 1);
});

test('never starts inference with API authentication, including account changes', async t => {
  const f = fixture(t, { auth: 'apiKey' });
  await f.service.connect();
  await assert.rejects(f.service.send({ text: 'Test' }), /ChatGPT/);
  assert.equal(f.messages.some(m => m.method === 'turn/start'), false);
});

test('tools are allowed only for active thread, deduplicated and approvals declined', async t => {
  let calls = 0;
  const f = fixture(t, { tools: [{ name: 'edit', description: 'Edit', inputSchema: {} }], onToolCall: async () => { calls++; return { ok: true }; } });
  await f.service.send({ text: 'Edit' });
  const params = { threadId: 'thread-1', turnId: 'turn-1', tool: 'edit', callId: 'call-1', arguments: {} };
  await f.service.handleServerRequest({ id: 100, method: 'item/tool/call', params });
  await f.service.handleServerRequest({ id: 101, method: 'item/tool/call', params });
  assert.equal(calls, 1);
  await f.service.handleServerRequest({ id: 102, method: 'item/tool/call', params: { ...params, threadId: 'other' } });
  assert.equal(f.messages.find(m => m.id === 102).result.success, false);
  await f.service.handleServerRequest({ id: 103, method: 'item/commandExecution/requestApproval', params: {} });
  assert.equal(f.messages.find(m => m.id === 103).result.decision, 'decline');
  await f.service.stop();
  assert.ok(f.messages.some(m => m.method === 'turn/interrupt' && m.params.turnId === 'turn-1'));
});

test('disconnect rejects pending work and reconnect resumes explicit thread', async t => {
  const f = fixture(t);
  await f.service.connect();
  f.service.disconnect();
  assert.equal(f.service.status().connected, false);
  const g = fixture(t);
  await g.service.send({ threadId: 'saved-thread', text: 'Continue' });
  assert.equal(g.messages.find(m => m.method === 'thread/resume').params.threadId, 'saved-thread');
  assert.equal(g.messages.some(m => m.method === 'thread/start'), false);
});
