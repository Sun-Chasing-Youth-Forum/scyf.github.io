const { contextBridge, ipcRenderer } = require('electron');
const methods = ['bootstrap', 'sync', 'login', 'logout', 'startDevice', 'pollDevice', 'cancelDevice', 'edit', 'saveDrafts', 'discardDrafts', 'upload', 'exportDrafts', 'publish', 'deployment', 'open'];
contextBridge.exposeInMainWorld('forumManager', Object.fromEntries(methods.map(method => [method, async (data) => {
  const result = await ipcRenderer.invoke('manager', { method, data });
  if (!result.ok) { const error = new Error(result.error); error.code = result.code; throw error; }
  return result.value;
}])));
