const { contextBridge, ipcRenderer } = require('electron');
const invoke = (name, ...args) => ipcRenderer.invoke(`diffgusting:${name}`, ...args);
contextBridge.exposeInMainWorld('diffgusting', {
  bootstrap: () => invoke('bootstrap'),
  open: request => invoke('open', request),
  comparisonActivate: id => invoke('comparison-activate', id),
  comparisonClose: id => invoke('comparison-close', id),
  recentOpen: key => invoke('recent-open', key),
  sourceLoad: (side, descriptor) => invoke('source-load', side, descriptor),
  sourceState: () => invoke('source-state'),
  historyOpen: (side, generation) => invoke('history-open', side, generation),
  historyPage: (id, cursor) => invoke('history-page', id, cursor),
  historyClose: id => invoke('history-close', id),
  sourceCommit: (side, generation, ref) => invoke('source-commit', side, generation, ref),
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
