const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vaultAPI', {
  getStatus: () => ipcRenderer.invoke('get-status'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveSetup: (data) => ipcRenderer.invoke('save-setup', data),
  checkPassword: (password) => ipcRenderer.invoke('check-password', password),
  changeMasterPassword: (oldPw, newPw) =>
    ipcRenderer.invoke('change-master-password', oldPw, newPw),
  setTheme: (themeId) => ipcRenderer.invoke('set-theme', themeId),
  resizeWindow: (height) => ipcRenderer.invoke('resize-window', height),
  openFolder: () => ipcRenderer.invoke('open-folder'),
  lockVault: () => ipcRenderer.invoke('lock-vault'),
});
