/*
 * Vaultwick — password-protected network drive mounter
 * Copyright (C) 2026 Kostas Melitzanis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec, execFile } = require('child_process');
const crypto = require('crypto');
const os = require('os');
const fs = require('fs');

let mainWindow;
let mounted = false;
let CONFIG = null;

const DEFAULT_THEME = 'emerald';

// macOS: mount under /Volumes (via the native NetFS "mount volume" call) so the
// share shows up as a real drive on the Desktop and in Finder's sidebar.
function macMountPoint() {
  const share = (CONFIG && CONFIG.share) || 'vault';
  return path.join('/Volumes', share);
}

// ---------------------------------------------------------------- config I/O

function configCandidates() {
  return [
    path.join(__dirname, 'vault-config.json'),
    path.join(app.getPath('userData'), 'vault-config.json'),
  ];
}

function findConfig() {
  for (const c of configCandidates()) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

// Where to write: reuse the existing file, else a writable location.
function configWritePath() {
  const existing = findConfig();
  if (existing) return existing;
  return app.isPackaged
    ? path.join(app.getPath('userData'), 'vault-config.json')
    : path.join(__dirname, 'vault-config.json');
}

function loadConfig() {
  const file = findConfig();
  if (!file) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return null;
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(configWritePath(), JSON.stringify(cfg, null, 2));
}

function isConfigured(cfg) {
  return !!(cfg && cfg.host && cfg.share && cfg.username &&
            cfg.salt && cfg.iv && cfg.tag && cfg.data);
}

// ---------------------------------------------------------------- crypto

// Encrypt a secret (the server password) with a key derived from the master
// password (AES-256-GCM). Returns the hex fields stored in the config.
function encryptSecret(masterPassword, secret) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(masterPassword, salt, 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([
    cipher.update(Buffer.from(secret, 'utf8')),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: enc.toString('hex'),
  };
}

// Decrypt the stored server password. Throws (GCM auth failure) on wrong master.
function decryptSecret(masterPassword, cfg) {
  const salt = Buffer.from(cfg.salt, 'hex');
  const key = crypto.scryptSync(masterPassword, salt, 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(cfg.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(cfg.tag, 'hex'));
  const out = Buffer.concat([
    decipher.update(Buffer.from(cfg.data, 'hex')),
    decipher.final(),
  ]);
  return out.toString('utf8');
}

// ---------------------------------------------------------------- mounting

function mountDrive(username, password) {
  return new Promise((resolve, reject) => {
    const host = CONFIG.host;
    const share = CONFIG.share;

    if (process.platform === 'win32') {
      const drive = CONFIG.winDrive || 'Z:';
      const uncPath = `\\\\${host}\\${share}`;
      execFile('net', ['use', drive, '/delete', '/y'], () => {
        const args = ['use', drive, uncPath, password, `/user:${username}`];
        execFile('net', args, (err, stdout, stderr) => {
          if (err) reject(stderr || err.message);
          else resolve(drive);
        });
      });
    } else if (process.platform === 'darwin') {
      const u = encodeURIComponent(username);
      const p = encodeURIComponent(password);
      const smbUrl = `smb://${u}:${p}@${host}/${share}`;
      const mountPoint = macMountPoint();

      if (fs.existsSync(mountPoint)) {
        resolve(mountPoint);
        return;
      }

      const asUrl = smbUrl.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      execFile('osascript', ['-e', `mount volume "${asUrl}"`], (err, stdout, stderr) => {
        if (err) reject(stderr || err.message);
        else resolve(mountPoint);
      });
    } else {
      reject('Unsupported platform');
    }
  });
}

function unmountDrive() {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      const drive = (CONFIG && CONFIG.winDrive) || 'Z:';
      execFile('net', ['use', drive, '/delete', '/y'], () => resolve());
    } else if (process.platform === 'darwin') {
      execFile('diskutil', ['unmount', macMountPoint()], () => resolve());
    } else {
      resolve();
    }
  });
}

// ---------------------------------------------------------------- window

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    resizable: false,
    backgroundColor: '#27c592',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  CONFIG = loadConfig();
  createWindow();
});

app.on('window-all-closed', async () => {
  if (mounted) await unmountDrive();
  app.quit();
});

app.on('before-quit', async (e) => {
  if (mounted) {
    e.preventDefault();
    await unmountDrive();
    mounted = false;
    app.quit();
  }
});

// ---------------------------------------------------------------- IPC

// Tells the renderer whether to show the setup wizard, and the saved theme.
ipcMain.handle('get-status', async () => {
  return {
    configured: isConfigured(CONFIG),
    theme: (CONFIG && CONFIG.theme) || DEFAULT_THEME,
  };
});

// Non-secret config, for pre-filling the wizard when re-running setup.
ipcMain.handle('get-config', async () => {
  if (!CONFIG) return null;
  return {
    host: CONFIG.host || '',
    share: CONFIG.share || '',
    username: CONFIG.username || '',
    winDrive: CONFIG.winDrive || 'Z:',
    theme: CONFIG.theme || DEFAULT_THEME,
  };
});

// First-run setup (and re-run from settings). Encrypts the server password
// with the master password and writes the config file.
ipcMain.handle('save-setup', async (event, data) => {
  const host = (data.host || '').trim();
  const share = (data.share || '').trim() || 'vault';
  const username = (data.username || '').trim();
  const winDrive = (data.winDrive || '').trim() || 'Z:';
  const serverPassword = data.serverPassword || '';
  const masterPassword = data.masterPassword || '';

  if (!host) return { success: false, message: 'Server address is required.' };
  if (!username) return { success: false, message: 'Username is required.' };
  if (!serverPassword) return { success: false, message: 'Server password is required.' };
  if (!masterPassword) return { success: false, message: 'Master password is required.' };

  try {
    if (mounted) {
      await unmountDrive();
      mounted = false;
    }
    const enc = encryptSecret(masterPassword, serverPassword);
    const cfg = {
      host,
      share,
      username,
      winDrive,
      theme: data.theme || (CONFIG && CONFIG.theme) || DEFAULT_THEME,
      ...enc,
    };
    saveConfig(cfg);
    CONFIG = cfg;
    return { success: true };
  } catch (err) {
    return { success: false, message: 'Could not save setup:\n' + err.message };
  }
});

// Re-encrypt the stored server password under a new master password.
ipcMain.handle('change-master-password', async (event, oldPw, newPw) => {
  if (!isConfigured(CONFIG)) {
    return { success: false, message: 'No vault is configured yet.' };
  }
  if (!newPw) {
    return { success: false, message: 'New master password is required.' };
  }

  let serverPassword;
  try {
    serverPassword = decryptSecret(oldPw, CONFIG);
  } catch (e) {
    return { success: false, message: 'Current master password is incorrect.' };
  }

  try {
    const enc = encryptSecret(newPw, serverPassword);
    const cfg = { ...CONFIG, ...enc };
    saveConfig(cfg);
    CONFIG = cfg;
    return { success: true };
  } catch (err) {
    return { success: false, message: 'Could not update password:\n' + err.message };
  } finally {
    serverPassword = null;
  }
});

// Resize the window to snugly fit the current view (no dead space).
ipcMain.handle('resize-window', async (event, height) => {
  if (!mainWindow) return;
  const h = Math.max(360, Math.min(820, Math.round(height)));
  mainWindow.setContentSize(400, h, process.platform === 'darwin');
});

ipcMain.handle('set-theme', async (event, themeId) => {
  if (CONFIG) {
    CONFIG.theme = themeId;
    try { saveConfig(CONFIG); } catch (e) { /* ignore */ }
  }
  return true;
});

ipcMain.handle('check-password', async (event, masterPassword) => {
  if (!isConfigured(CONFIG)) {
    return { success: false, message: 'No vault configured. Please run setup.' };
  }

  let serverPassword;
  try {
    serverPassword = decryptSecret(masterPassword, CONFIG);
  } catch (e) {
    return { success: false, message: 'Incorrect password.' };
  }

  try {
    const mountPath = await mountDrive(CONFIG.username, serverPassword);
    mounted = true;
    return { success: true, mountPath };
  } catch (err) {
    return {
      success: false,
      message: `Password OK, but failed to mount drive:\n${err}`,
    };
  } finally {
    serverPassword = null;
  }
});

ipcMain.handle('open-folder', async () => {
  const drive = (CONFIG && CONFIG.winDrive) || 'Z:';
  if (process.platform === 'win32') {
    exec(`start "" "${drive}\\"`);
  } else {
    execFile('open', [macMountPoint()]);
  }
});

ipcMain.handle('lock-vault', async () => {
  if (mounted) {
    await unmountDrive();
    mounted = false;
  }
  return true;
});
