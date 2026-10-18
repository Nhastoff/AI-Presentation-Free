// Public MCP stdio client used only by local, read-only artifact investigations.
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline');
const unwrap = result => {
  if (result.structuredContent) return result.structuredContent;
  const block = result.content?.find(item => item.type === 'text');
  if (block) { try { return JSON.parse(block.text); } catch {} }
  return result;
};
async function runSession(options, work) {
  const directory = path.resolve(options.directory);
  await fs.mkdir(directory, { recursive: true });
  const env = {
    ...process.env,
    GHIDRA_INSTALL_DIR: 'C:/Users/843E~1/Desktop/Vibra/tools/ghidra_12.1.4_PUBLIC',
    JAVA_HOME: 'C:/Users/843E~1/Desktop/Vibra/tools/jdk-21.0.12.1+1',
    USERPROFILE: 'C:/Users/843E~1',
    TEMP: 'C:/Users/843E~1/AppData/Local/Temp',
    TMP: 'C:/Users/843E~1/AppData/Local/Temp',
    REA_GHIDRA_STARTUP_TIMEOUT_MS: String(options.startupTimeoutMs || 1800000),
    GHIDRA_HEADLESS_MAXMEM: options.heap || '3G',
  };
  const server = spawn(process.execPath, ['C:/Users/Никита/Desktop/Vibra/.rea-install/runtime/node_modules/rea-agents/scripts/rea.mjs', 'mcp'], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let nextId = 1, sequence = 0;
  const pending = new Map();
  const log = await fs.open(path.join(directory, 'server.log'), 'a');
  server.stderr.on('data', chunk => log.write(chunk).catch(() => {}));
  readline.createInterface({ input: server.stdout }).on('line', line => {
    let message; try { message = JSON.parse(line); } catch { return; }
    const waiter = pending.get(message.id); if (!waiter) return;
    pending.delete(message.id);
    message.error ? waiter.reject(new Error(JSON.stringify(message.error))) : waiter.resolve(message.result);
  });
  server.on('error', error => { for (const waiter of pending.values()) waiter.reject(error); pending.clear(); });
  server.on('exit', code => { for (const waiter of pending.values()) waiter.reject(new Error(`REA exited ${code}`)); pending.clear(); });
  const call = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++; pending.set(id, { resolve, reject });
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  async function tool(name, args = {}, filename, settings = {}) {
    const label = filename || `${++sequence}-${name}`;
    const started = Date.now();
    await fs.writeFile(path.join(directory, 'progress.json'), JSON.stringify({ operation: name, parameters: args, started: new Date(started).toISOString() }, null, 2));
    console.log(`${new Date().toISOString()} START ${name} ${label}`);
    const result = await call('tools/call', { name, arguments: args });
    await fs.writeFile(path.join(directory, label + '.json'), JSON.stringify(result, null, 2));
    const data = unwrap(result);
    if (result.isError && !(data.error?.code === 'resource_constraint' && data.error?.details?.resource === 'transport') && !settings.allowError) throw new Error(`${name}: ${JSON.stringify(data.error || data).slice(0, 1500)}`);
    console.log(`${new Date().toISOString()} DONE ${name} ms=${Date.now() - started} evidence=${data.evidence_id || '-'} ${result.isError ? 'error-or-retained-transport-result' : 'ok'}`);
    return data;
  }
  const save = () => tool('export_evidence_bundle', { path: path.join(directory, 'evidence-bundle.json'), overwrite: true }, 'export');
  let failure;
  try {
    await call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'presentation-free-native-research', version: '0.2.0' } });
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const catalog = await call('tools/list', {});
    await fs.writeFile(path.join(directory, 'tool-catalog.json'), JSON.stringify(catalog, null, 2));
    await tool('open_binary', { path: options.target, provider_id: 'ghidra' }, 'identity');
    await work({ tool, save, catalog, unwrap, directory });
  } catch (error) {
    failure = error;
    await fs.writeFile(path.join(directory, 'failure.json'), JSON.stringify({ message: error.message, stack: error.stack, time: new Date().toISOString() }, null, 2));
  } finally {
    try { await save(); } catch (error) { console.error('Evidence export failed:', error.message); }
    try { await tool('close_binary', { snapshot_path: path.join(directory, 'analysis-snapshot.json'), overwrite: true }, 'close'); } catch (error) { console.error('Close failed:', error.message); }
    server.stdin.end();
    await log.close();
  }
  if (failure) throw failure;
  await fs.writeFile(path.join(directory, 'progress.json'), JSON.stringify({ status: 'complete', finished: new Date().toISOString() }, null, 2));
  console.log('RESEARCH COMPLETE', directory);
}
module.exports = { runSession, unwrap };
