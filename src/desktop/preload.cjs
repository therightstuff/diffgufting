const { contextBridge, ipcRenderer } = require('electron');
const invoke = (name, ...args) => ipcRenderer.invoke(`diffgusting:${name}`, ...args);
contextBridge.exposeInMainWorld('diffgusting', {
  bootstrap: () => invoke('bootstrap'),
  open: request => invoke('open', request),
  read: file => invoke('read', file),
  save: request => invoke('save', request),
  saveAs: request => invoke('save-as', request),
  choose: directory => invoke('choose', directory),
  refresh: () => invoke('refresh'),
  preferences: value => invoke('preferences', value),
  dirty: value => ipcRenderer.send('diffgusting:dirty', value),
  closeApproved: () => ipcRenderer.send('diffgusting:close-approved'),
  onEvent: callback => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('diffgusting:event', listener);
    return () => ipcRenderer.removeListener('diffgusting:event', listener);
  },
});
