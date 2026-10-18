const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('presentationFree', Object.freeze({
  platform: process.platform,
  exportPdf: (options) => ipcRenderer.invoke('presentation-free:export-pdf', options),
}));
