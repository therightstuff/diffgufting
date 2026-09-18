const { contextBridge, ipcRenderer } = require('electron');
const invoke = (name, ...args) => ipcRenderer.invoke(`diffgufting:${name}`, ...args);
contextBridge.exposeInMainWorld('diffgufting', {
  bootstrap: () => invoke('bootstrap'),
  aboutLink: link => invoke('about-link', link),
  open: request => invoke('open', request),
  comparisonActivate: id => invoke('comparison-activate', id),
  comparisonClose: id => invoke('comparison-close', id),
  comparisonBack: () => invoke('comparison-back'),
  comparisonForward: () => invoke('comparison-forward'),
  comparisonNew: () => invoke('comparison-new'),
  comparisonSubmit: () => invoke('comparison-submit'),
  comparisonType: type => invoke('comparison-type', type),
  recentOpen: key => invoke('recent-open', key),
  sourceLoad: (side, descriptor) => invoke('source-load', side, descriptor),
  sourceState: () => invoke('source-state'),
  historyOpen: (side, generation) => invoke('history-open', side, generation),
  historyPage: (id, cursor) => invoke('history-page', id, cursor),
  historyClose: id => invoke('history-close', id),
  sourceCommit: (side, generation, ref, owner) => invoke('source-commit', side, generation, ref, owner),
  sourceWorking: (side, generation, owner) => invoke('source-working', side, generation, owner),
  read: file => invoke('read', file),
  selectedEntry: pathname => invoke('selected-entry', pathname),
  save: request => invoke('save', request),
  saveAs: request => invoke('save-as', request),
  choose: directory => invoke('choose', directory),
  refresh: () => invoke('refresh'),
  preferences: value => invoke('preferences', value),
  dirty: value => ipcRenderer.send('diffgufting:dirty', value),
  closeApproved: () => ipcRenderer.send('diffgufting:close-approved'),
  onEvent: callback => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('diffgufting:event', listener);
    return () => ipcRenderer.removeListener('diffgufting:event', listener);
  },
});
