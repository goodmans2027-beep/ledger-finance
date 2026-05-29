const { app, BrowserWindow, shell, Menu, ipcMain } = require('electron');
const path = require('path');

let win;

function createWindow() {
    win = new BrowserWindow({
        width:     1280,
        height:    860,
        minWidth:  960,
        minHeight: 640,
        title:     'Ledger — Personal Finance Dashboard',
        icon:      path.join(__dirname, 'assets', 'icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
        },
        backgroundColor: '#1a1a2e',
        show: false,
    });

    // Remove the native menu bar (File / Edit / View / Window / Help)
    Menu.setApplicationMenu(null);

    win.loadFile('index.html');
    win.once('ready-to-show', () => win.show());

    win.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    // Restore cut/copy/paste/select-all via right-click since the menu bar is gone
    win.webContents.on('context-menu', (_e, params) => {
        if (!params.isEditable && !params.selectionText) return;
        Menu.buildFromTemplate([
            { role: 'cut',       enabled: params.isEditable && params.selectionText.length > 0 },
            { role: 'copy',      enabled: params.selectionText.length > 0 },
            { role: 'paste',     enabled: params.isEditable },
            { type: 'separator' },
            { role: 'selectAll', enabled: params.isEditable },
        ]).popup();
    });

    win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
    ipcMain.on('app-reload',            () => win && win.webContents.reload());
    ipcMain.on('app-toggle-devtools',   () => win && win.webContents.toggleDevTools());
    ipcMain.on('app-toggle-fullscreen', () => win && win.setFullScreen(!win.isFullScreen()));
    createWindow();

    if (app.isPackaged) {
        const { autoUpdater } = require('electron-updater');
        autoUpdater.checkForUpdatesAndNotify();
        autoUpdater.on('update-downloaded', () => {
            if (win) win.webContents.send('update-ready');
        });
        ipcMain.on('app-install-update', () => autoUpdater.quitAndInstall());
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (win === null) createWindow();
});
