const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('waDesktop', {
  getUpdateConfig: () => ipcRenderer.invoke('update:getConfig'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  applyUpdate: () => ipcRenderer.invoke('update:apply'),
  onUpdateProgress: (handler) => {
    const listener = (_event, payload) => handler(payload)
    ipcRenderer.on('update:progress', listener)
    return () => ipcRenderer.removeListener('update:progress', listener)
  },
})
