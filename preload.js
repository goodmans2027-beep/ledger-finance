const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    isElectron:       true,
    reload:           () => ipcRenderer.send('app-reload'),
    toggleDevTools:   () => ipcRenderer.send('app-toggle-devtools'),
    toggleFullscreen: () => ipcRenderer.send('app-toggle-fullscreen'),
    onUpdateReady:    (cb) => ipcRenderer.on('update-ready', cb),
    installUpdate:    () => ipcRenderer.send('app-install-update'),
});
