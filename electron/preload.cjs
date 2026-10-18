const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('presentationFree', Object.freeze({
  platform: process.platform,
  exportPdf: (options) => ipcRenderer.invoke('presentation-free:export-pdf', options),
}));

contextBridge.exposeInMainWorld('presentationAI', Object.freeze({
  status: () => ipcRenderer.invoke('assistant:status'),
  connect: options => ipcRenderer.invoke('assistant:connect', options),
  login: () => ipcRenderer.invoke('assistant:login'),
  disconnect: () => ipcRenderer.invoke('assistant:disconnect'),
  send: request => ipcRenderer.invoke('assistant:send', request),
  stop: () => ipcRenderer.invoke('assistant:stop'),
  historyLoad: request => ipcRenderer.invoke('assistant:history-load', request),
  historySave: request => ipcRenderer.invoke('assistant:history-save', request),
  pickAttachments: () => ipcRenderer.invoke('assistant:pick-attachments'),
  toolResult: response => ipcRenderer.invoke('assistant:tool-result', response),
  onEvent: callback => { const listener = (_event, value) => callback(value); ipcRenderer.on('assistant:event', listener); return () => ipcRenderer.removeListener('assistant:event', listener); },
}));
