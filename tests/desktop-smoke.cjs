// Run after npm run build. For an unpacked .app set PF_ELECTRON_EXECUTABLE
// to .../AI Presentation Free.app/Contents/MacOS/AI Presentation Free.
// PF_CODEX_SMOKE_REQUIRED=1 requires a real installed Codex App Server.
const { _electron: electron } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const root = path.resolve(__dirname, '..');
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'presentation-desktop-smoke-'));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.PRESENTATION_FREE_DEV_URL;
  const customExecutable = process.env.PF_ELECTRON_EXECUTABLE;
  const executablePath = customExecutable || require('electron');
  let application;
  const launch = async () => {
    application = await electron.launch({ executablePath, args: [...(customExecutable ? [] : [root]), `--user-data-dir=${profile}`], env, timeout: 60000 });
    // Set Electron's application storage explicitly as well as Chromium's profile.
    // This keeps the test's history and Codex auth completely separate from users.
    await application.evaluate(({ app }, target) => app.setPath('userData', target), profile);
    const page = await application.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.getByRole('button', { name: 'AI', exact: true }).waitFor({ timeout: 30000 });
    return page;
  };
  try {
    const { ASSISTANT_TOOLS, ASSISTANT_INSTRUCTIONS } = await import(pathToFileURL(path.join(root, 'src/assistant-tools.js')).href);
    const page = await launch();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    const preferences = await application.evaluate(({ BrowserWindow }) => {
      const prefs = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
      return { sandbox: prefs.sandbox, contextIsolation: prefs.contextIsolation, nodeIntegration: prefs.nodeIntegration };
    });
    assert.deepEqual(preferences, { sandbox: true, contextIsolation: true, nodeIntegration: false });
    const bridge = await page.evaluate(async () => ({
      status: await window.presentationAI.status(),
      require: typeof window.require,
      process: typeof window.process,
      rawIPC: typeof window.presentationAI.ipcRenderer,
      exportPdf: typeof window.presentationFree.exportPdf,
    }));
    assert.equal(typeof bridge.status.connected, 'boolean');
    assert.equal(bridge.require, 'undefined');
    assert.equal(bridge.process, 'undefined');
    assert.equal(bridge.rawIPC, 'undefined');
    assert.equal(bridge.exportPdf, 'function');
    await page.getByRole('button', { name: 'AI', exact: true }).click();
    assert.equal(await page.locator('.ai-panel').isVisible(), true);
    await page.getByLabel('Сообщение помощнику').fill('Текст сохраняется при сворачивании');
    await page.getByRole('button', { name: 'Свернуть', exact: true }).click();
    assert.equal(await page.locator('.ai-panel').isVisible(), false);
    await page.getByRole('button', { name: 'AI', exact: true }).click();
    assert.equal(await page.getByLabel('Сообщение помощнику').inputValue(), 'Текст сохраняется при сворачивании');
    const documentId = `desktop-smoke-${Date.now()}`;
    const conversations = [{ id: 'smoke-conversation', title: 'Проверка истории', messages: [{ role: 'user', text: 'Проверка' }], threadId: 'smoke-thread' }];
    const saved = await page.evaluate(async ({ documentId, conversations }) => {
      await window.presentationAI.historySave({ documentId, conversations });
      return window.presentationAI.historyLoad({ documentId });
    }, { documentId, conversations });
    assert.deepEqual(saved, conversations);
    const invalidPathRejected = await page.evaluate(async () => {
      try { await window.presentationAI.historyLoad({ documentId: '../outside-profile' }); return false; }
      catch { return true; }
    });
    assert.equal(invalidPathRejected, true);
    const connection = await page.evaluate(async ({ tools, instructions }) => {
      try { return { ok: true, status: await window.presentationAI.connect({ tools, instructions }) }; }
      catch (error) { return { ok: false, message: error.message }; }
    }, { tools: ASSISTANT_TOOLS, instructions: ASSISTANT_INSTRUCTIONS });
    if (connection.ok) {
      assert.equal(connection.status.connected, true);
      assert.equal(connection.status.authenticated, false, 'The smoke test must use its own empty Codex profile');
      await page.evaluate(() => window.presentationAI.disconnect());
      console.log('Real Codex App Server initialized through the sandboxed preload bridge.');
    } else {
      assert.match(connection.message, /Codex не найден/);
      if (process.env.PF_CODEX_SMOKE_REQUIRED === '1') throw new Error(`Codex is required for this smoke test: ${connection.message}`);
      console.log('Codex is absent; verified the user-facing installation error. Set PF_CODEX_SMOKE_REQUIRED=1 to require initialization.');
    }
    assert.deepEqual(pageErrors, []);
    // Exercise actual file:// PPTX/image export in packaged Electron as well as
    // the browser suite. Only the destination picker is automated.
    const project = { id: 'desktop-export', title: 'Desktop image export', slides: [{ id: 'desktop-slide', background: '#FFFFFF', elements: [
      { id: 'desktop-title', type: 'text', text: 'Editable export', x: 40, y: 40, w: 600, h: 80 },
      { id: 'desktop-image', type: 'image', x: 40, y: 150, w: 200, h: 100, src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9ioAAAAASUVORK5CYII=' },
    ] }] };
    await page.locator('#open-file').setInputFiles({ name: 'desktop-image.pfree.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
    const exportedPath = path.join(profile, 'desktop-image.pptx');
    await application.evaluate(({ session }, target) => {
      global.__desktopExport = null;
      session.defaultSession.once('will-download', (_event, item) => { item.setSavePath(target); item.once('done', (_event, state) => { global.__desktopExport = state; }); });
    }, exportedPath);
    await page.locator('[data-action="export"]').first().click();
    const exportDeadline = Date.now() + 30000;
    let exportState;
    while (Date.now() < exportDeadline) {
      exportState = await application.evaluate(() => global.__desktopExport);
      if (exportState) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(exportState, 'completed', 'Native Electron download completes');
    const archive = await require('jszip').loadAsync(await fs.readFile(exportedPath));
    const slideXml = await archive.file('ppt/slides/slide1.xml').async('string');
    assert(slideXml.includes('Editable export') && slideXml.includes('<p:pic>'));
    assert(Object.keys(archive.files).some(name => name.startsWith('ppt/media/') && name.endsWith('.png')));
    assert.deepEqual(pageErrors, []);
    console.log('Native PPTX export contains editable text and an embedded PNG.');
    await application.close(); application = null;
    const reopened = await launch();
    const restored = await reopened.evaluate(documentId => window.presentationAI.historyLoad({ documentId }), documentId);
    assert.deepEqual(restored, conversations, 'History survives a full application restart');
    console.log(`Desktop smoke passed on ${process.platform}/${process.arch}: built app, sandbox, preload IPC, sidebar and persistent history.`);
  } finally {
    if (application) await application.close();
    await fs.rm(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
