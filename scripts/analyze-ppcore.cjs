// Persistent public MCP session: import once, retain complete returned Evidence.
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline');
const directory = path.resolve('research', 'ppcore-complete');
let nextId = 1;
const pending = new Map();
let server;
async function call(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}
async function tool(name, args, filename) {
  console.log(`${new Date().toISOString()} START ${name}`);
  const result = await call('tools/call', { name, arguments: args });
  await fs.writeFile(path.join(directory, filename + '.json'), JSON.stringify(result, null, 2));
  const text = result.content?.find(item => item.type === 'text')?.text;
  let data = result.structuredContent;
  if (!data && text) { try { data = JSON.parse(text); } catch {} }
  if (result.isError) {
    if (data?.error?.code === 'resource_constraint' && data.error.details?.resource === 'transport') {
      console.log(`${new Date().toISOString()} COMPLETE ${name}; response exceeds MCP budget; full Evidence retained for file export`);
      return data;
    }
    throw new Error(`${name} failed; see ${filename}.json`);
  }
  console.log(`${new Date().toISOString()} DONE ${name} evidence=${data?.evidence_id || '-'} bytes=${JSON.stringify(result).length}`);
  return data;
}
async function main() {
  await fs.mkdir(directory, { recursive: true });
  const launcher = 'C:/Users/Никита/Desktop/Vibra/.rea-install/runtime/node_modules/rea-agents/scripts/rea.mjs';
  server = spawn(process.execPath, [launcher, 'mcp'], { env: process.env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const stderr = await fs.open(path.join(directory, 'server.log'), 'a');
  server.stderr.on('data', chunk => stderr.write(chunk));
  readline.createInterface({ input: server.stdout }).on('line', line => {
    try {
      const message = JSON.parse(line);
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      message.error ? waiter.reject(new Error(JSON.stringify(message.error))) : waiter.resolve(message.result);
    } catch (error) { console.error('MCP parse error:', error.message); }
  });
  server.on('exit', (code) => { for (const waiter of pending.values()) waiter.reject(new Error(`REA exited ${code}`)); pending.clear(); });
  await call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'presentation-free-research', version: '1.0.0' } });
  server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const catalog = await call('tools/list');
  await fs.writeFile(path.join(directory, 'tool-catalog.json'), JSON.stringify(catalog, null, 2));
  await tool('open_binary', { path: 'C:/Program Files (x86)/Microsoft Office/Office12/PPCORE.DLL', provider_id: 'ghidra' }, 'identity');
  await tool('binary_overview', {}, 'overview');
  await tool('binary_session', {}, 'session-analyzed');
  await tool('list_procedures', {}, 'procedures');
  await tool('export_evidence_bundle', { path: path.join(directory, 'evidence-bundle.json'), overwrite: true }, 'export-inventory');
  await tool('list_strings', {}, 'strings');
  await tool('search_strings', { mode: 'regex', case_sensitive: false, pattern: 'Ribbon|SlideShow|NewSlide|Clipboard|Paragraph|Animation|Presentation|PowerPoint|Insert|Print|Save|Open|Command|Shape' }, 'feature-strings');
  await tool('search_procedures', { mode: 'regex', case_sensitive: false, pattern: 'Dll|Slide|Present|Load|Save|Print|Export|Command|Dispatch|Shape|Ppt' }, 'named-procedures');
  await tool('analyze_function', { procedure: '0x30105928' }, 'ppmain-function');
  await tool('analyze_function', { procedure: '0x30104ccd' }, 'splash-function');
  await tool('export_evidence_bundle', { path: path.join(directory, 'evidence-bundle.json'), overwrite: true }, 'export');
  await tool('close_binary', { snapshot_path: path.join(directory, 'analysis-snapshot.json'), overwrite: true }, 'close');
  server.stdin.end();
  console.log('ANALYSIS COMPLETE');
}
main().catch(async error => {
  console.error(error.stack);
  if (server && !server.killed) {
    try { await tool('export_evidence_bundle', { path: path.join(directory, 'evidence-bundle.json'), overwrite: true }, 'export-after-error'); } catch {}
    try { await tool('close_binary', { snapshot_path: path.join(directory, 'analysis-snapshot.json'), overwrite: true }, 'close-after-error'); } catch {}
    server.stdin.end();
  }
  process.exitCode = 1;
});
