'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vaultAPI', {
  getStatus: () => ipcRenderer.invoke('get-status'),
  saveVault: (data) => ipcRenderer.invoke('save-vault', data),
  deleteVault: (id) => ipcRenderer.invoke('delete-vault', id),
  setActiveVault: (id) => ipcRenderer.invoke('set-active-vault', id),
  unlock: (id, password) => ipcRenderer.invoke('unlock', id, password),
  unlockTouchId: (id) => ipcRenderer.invoke('unlock-touch-id', id),
  setTouchId: (id, enable, password) => ipcRenderer.invoke('set-touch-id', id, enable, password),
  changeMasterPassword: (id, oldPw, newPw) => ipcRenderer.invoke('change-master-password', id, oldPw, newPw),
  testConnection: (data) => ipcRenderer.invoke('test-connection', data),
  updateSettings: (patch) => ipcRenderer.invoke('update-settings', patch),
  resizeWindow: (height) => ipcRenderer.invoke('resize-window', height),
  openFolder: () => ipcRenderer.invoke('open-folder'),
  lockVault: () => ipcRenderer.invoke('lock-vault'),
  onLocked: (cb) => {
    const listener = (_e, reason) => cb(reason);
    ipcRenderer.on('vault-locked', listener);
    return () => ipcRenderer.removeListener('vault-locked', listener);
  },
});
