const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

let mainWindow;
const developmentUrl = process.env.PRESENTATION_FREE_DEV_URL;

function openExternal(url) {
  try {
    const parsed = new URL(url);
    if (['https:', 'http:'].includes(parsed.protocol)) shell.openExternal(parsed.href);
  } catch { /* Ignore malformed links. */ }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480, height: 950, minWidth: 1000, minHeight: 700,
    title: 'AI Presentation Free', backgroundColor: '#111827',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) {
      event.preventDefault();
      openExternal(url);
    }
  });
  if (developmentUrl) {
    const parsed = new URL(developmentUrl);
    if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsed.hostname)) {
      throw new Error('Development URL must be a local HTTP server.');
    }
    mainWindow.loadURL(parsed.href);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

ipcMain.handle('presentation-free:export-pdf', async (event, options) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Unknown sender');
  if (!options || typeof options.html !== 'string' || options.html.length > 40 * 1024 * 1024) {
    throw new Error('Invalid PDF document');
  }
  const safeName = String(options.defaultName || 'AI Presentation Free').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 120);
  const destination = await dialog.showSaveDialog(mainWindow, {
    title: 'Сохранить презентацию в PDF',
    defaultPath: `${safeName.replace(/\.pdf$/i, '')}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (destination.canceled || !destination.filePath) return { canceled: true };
  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, javascript: false, partition: `pdf-${Date.now()}` },
  });
  printWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  printWindow.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !['data:', 'blob:', 'about:'].some((prefix) => details.url.startsWith(prefix)) });
  });
  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(options.html)}`);
    const pdf = await printWindow.webContents.printToPDF({
      printBackground: true, preferCSSPageSize: true,
      pageSize: { width: 338.667, height: 190.5 }, margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });
    await fs.writeFile(destination.filePath, pdf);
    return { canceled: false, filePath: destination.filePath };
  } finally {
    printWindow.destroy();
  }
});

app.whenReady().then(() => {
  const isMac = process.platform === 'darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(isMac ? [{ label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { type: 'separator' }, { role: 'quit' }] }] : []),
    { label: 'Файл', submenu: [{ role: isMac ? 'close' : 'quit', label: isMac ? 'Закрыть окно' : 'Выход' }] },
    { label: 'Правка', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'Вид', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }, ...(developmentUrl ? [{ role: 'toggleDevTools' }] : [])] },
    { label: 'Окно', submenu: [{ role: 'minimize' }, { role: 'zoom' }] },
  ]));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
