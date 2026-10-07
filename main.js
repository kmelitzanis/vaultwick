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

'use strict';

const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  ipcMain,
  nativeImage,
  powerMonitor,
  safeStorage,
  session,
  shell,
  systemPreferences,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const { encryptSecret, decryptSecret, needsKdfUpgrade } = require('./lib/crypto');
const { ConfigStore, newId, isComplete } = require('./lib/config');
const V = require('./lib/validate');
const mounter = require('./lib/mount');

const WINDOW_WIDTH = 400;
const INDEX_FILE = path.join(__dirname, 'index.html');
const INDEX_URL = pathToFileURL(INDEX_FILE).href;
const WATCH_INTERVAL_MS = 15000;

let mainWindow = null;
let tray = null;
let quitting = false;
let mounted = null; // { vaultId, path }
let watchTimer = null;
const failures = new Map(); // vaultId -> { count, until }

// ---------------------------------------------------------------- config

// In development an existing ./vault-config.json is still honoured; otherwise
// the config lives in the per-user data directory.
function configPath() {
  const local = path.join(__dirname, 'vault-config.json');
  if (!app.isPackaged && fs.existsSync(local)) return local;
  return path.join(app.getPath('userData'), 'vault-config.json');
}

let store;

function publicVault(v) {
  return {
    id: v.id,
    name: v.name,
    host: v.host,
    share: v.share,
    username: v.username,
    winDrive: v.winDrive,
    touchId: !!v.quickUnlock,
  };
}

function touchIdAvailable() {
  try {
    return process.platform === 'darwin' && systemPreferences.canPromptTouchID() && safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function fail(code, extra = {}) {
  return { success: false, code, ...extra };
}

// ---------------------------------------------------------------- mounting

async function doMount(vault, serverPassword) {
  if (mounted && mounted.vaultId !== vault.id) await doUnmount();
  const mountPath = await mounter.mount(vault, serverPassword);
  mounted = { vaultId: vault.id, path: mountPath };
  startWatch();
  refreshTray();
  return mountPath;
}

async function doUnmount() {
  if (!mounted) return;
  const vault = store.vault(mounted.vaultId);
  mounted = null;
  stopWatch();
  refreshTray();
  if (vault) await mounter.unmount(vault);
}

async function lock(reason) {
  if (!mounted) return;
  await doUnmount();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('vault-locked', reason);
}

// Lightweight check used by the watcher; avoids spawning PowerShell every tick.
async function stillMounted() {
  if (!mounted) return false;
  if (process.platform === 'win32') return fs.existsSync(mounted.path);
  const vault = store.vault(mounted.vaultId);
  return !!(vault && (await mounter.mountedPath(vault)));
}

// Auto-lock on idle, and notice when the share is ejected from outside the app.
function startWatch() {
  stopWatch();
  watchTimer = setInterval(async () => {
    if (!mounted) return stopWatch();
    const minutes = store.settings.autoLockMinutes;
    if (minutes > 0 && powerMonitor.getSystemIdleTime() >= minutes * 60) {
      await lock('idle');
      return;
    }
    if (!(await stillMounted())) {
      mounted = null;
      stopWatch();
      refreshTray();
      if (mainWindow) mainWindow.webContents.send('vault-locked', 'external');
    }
  }, WATCH_INTERVAL_MS);
}

function stopWatch() {
  if (watchTimer) clearInterval(watchTimer);
  watchTimer = null;
}

// ---------------------------------------------------------------- unlock throttling

function throttled(vaultId) {
  const f = failures.get(vaultId);
  if (!f || Date.now() >= f.until) return 0;
  return Math.ceil((f.until - Date.now()) / 1000);
}

// After 3 wrong attempts, wait 2s, 4s, 8s ... up to 60s between tries.
function recordFailure(vaultId) {
  const f = failures.get(vaultId) || { count: 0, until: 0 };
  f.count += 1;
  f.until = f.count >= 3 ? Date.now() + Math.min(60, 2 ** (f.count - 2)) * 1000 : 0;
  failures.set(vaultId, f);
}

// ---------------------------------------------------------------- window & tray

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: 600,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    backgroundColor: '#0e5c49',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) mainWindow.show();
  });
  mainWindow.on('close', (e) => {
    if (!quitting && tray && store.settings.closeToTray) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.loadFile(INDEX_FILE);
}

function trayImage() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'));
  return img.isEmpty() ? img : img.resize({ width: 18, height: 18 });
}

function refreshTray() {
  if (!tray) return;
  const vault = mounted && store.vault(mounted.vaultId);
  tray.setToolTip(vault ? `Vaultwick — ${vault.name} unlocked` : 'Vaultwick — locked');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: vault ? `● ${vault.name}` : 'Locked', enabled: false },
      { type: 'separator' },
      { label: 'Show Vaultwick', click: showWindow },
      { label: 'Open Folder', enabled: !!vault, click: () => mounted && shell.openPath(mounted.path) },
      { label: 'Lock Vault', enabled: !!vault, click: () => lock('tray') },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]),
  );
}

function createTray() {
  try {
    tray = new Tray(trayImage());
    tray.on('click', showWindow);
    refreshTray();
  } catch {
    tray = null; // e.g. a Linux desktop without a status area
  }
}

function applyLoginItem() {
  if (process.platform !== 'darwin' && process.platform !== 'win32') return;
  app.setLoginItemSettings({ openAtLogin: !!store.settings.launchAtLogin, args: ['--hidden'] });
}

// ---------------------------------------------------------------- hardening

app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (e, url) => {
    if (url !== INDEX_URL) e.preventDefault();
  });
  contents.on('will-attach-webview', (e) => e.preventDefault());
});

// Every IPC call must come from our own page, never from anything else.
function handle(channel, fn) {
  ipcMain.handle(channel, (event, ...args) => {
    const frame = event.senderFrame;
    if (!frame || frame.url !== INDEX_URL || event.sender !== (mainWindow && mainWindow.webContents)) {
      throw new Error('Rejected IPC from untrusted sender');
    }
    return fn(...args);
  });
}

// ---------------------------------------------------------------- lifecycle

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);

  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    store = new ConfigStore(configPath());
    store.load();
    createWindow();
    createTray();
    applyLoginItem();

    const lockOnSleep = () => store.settings.lockOnSleep && lock('sleep');
    powerMonitor.on('suspend', lockOnSleep);
    powerMonitor.on('lock-screen', lockOnSleep);

    if (app.isPackaged) {
      try {
        const { autoUpdater } = require('electron-updater');
        autoUpdater.checkForUpdatesAndNotify().catch(() => {});
      } catch {
        /* updater unavailable */
      }
    }
  });

  app.on('activate', showWindow);

  app.on('window-all-closed', () => {
    if (!tray || !store.settings.closeToTray) app.quit();
  });

  app.on('before-quit', async (e) => {
    quitting = true;
    if (mounted) {
      e.preventDefault();
      await doUnmount();
      app.quit();
    }
  });
}

// ---------------------------------------------------------------- IPC

handle('get-status', async () => ({
  configured: store.isConfigured(),
  settings: store.settings,
  locale: app.getLocale(),
  vaults: store.vaults.filter(isComplete).map(publicVault),
  activeVaultId: (store.activeVault() || {}).id || null,
  mounted,
  platform: process.platform,
  touchIdAvailable: touchIdAvailable(),
  loginItemSupported: process.platform === 'darwin' || process.platform === 'win32',
  minMasterLength: V.MIN_MASTER_LENGTH,
}));

function readVaultForm(data) {
  const d = data && typeof data === 'object' ? data : {};
  const form = {
    name: String(d.name || '').trim() || String(d.share || '').trim(),
    host: String(d.host || '').trim(),
    share: String(d.share || '').trim() || 'vault',
    username: String(d.username || '').trim(),
    winDrive: V.normalizeDrive(d.winDrive || 'Z:'),
    serverPassword: typeof d.serverPassword === 'string' ? d.serverPassword : '',
    masterPassword: typeof d.masterPassword === 'string' ? d.masterPassword : '',
  };
  let error = null;
  if (!V.validHost(form.host)) error = 'invalidHost';
  else if (!V.validShare(form.share)) error = 'invalidShare';
  else if (!V.validUsername(form.username)) error = 'invalidUsername';
  else if (!form.winDrive) error = 'invalidDrive';
  else if (!V.validName(form.name)) error = 'invalidName';
  else if (!V.validSecret(form.serverPassword)) error = 'serverPwRequired';
  return { form, error };
}

// Create a new vault, or replace the connection details of an existing one.
handle('save-vault', async (data) => {
  const { form, error } = readVaultForm(data);
  if (error) return fail(error);
  if (!V.validMaster(form.masterPassword)) return fail('masterTooShort', { min: V.MIN_MASTER_LENGTH });

  const editId = data && typeof data.id === 'string' ? data.id : null;
  const existing = editId ? store.vault(editId) : null;
  if (editId && !existing) return fail('notConfigured');

  try {
    if (existing && mounted && mounted.vaultId === existing.id) await doUnmount();
    const enc = await encryptSecret(form.masterPassword, form.serverPassword);
    const vault = {
      id: existing ? existing.id : newId(),
      name: form.name,
      host: form.host,
      share: form.share,
      username: form.username,
      winDrive: form.winDrive,
      ...enc,
    };
    if (existing) store.vaults.splice(store.vaults.indexOf(existing), 1, vault);
    else store.vaults.push(vault);
    store.data.activeVaultId = vault.id;
    store.save();
    return { success: true, id: vault.id };
  } catch (err) {
    return fail('saveFailed', { detail: err.message });
  }
});

handle('delete-vault', async (id) => {
  const vault = store.vault(id);
  if (!vault) return fail('notConfigured');
  if (mounted && mounted.vaultId === id) await doUnmount();
  store.vaults.splice(store.vaults.indexOf(vault), 1);
  if (store.data.activeVaultId === id) store.data.activeVaultId = store.vaults[0] ? store.vaults[0].id : null;
  store.save();
  return { success: true };
});

handle('set-active-vault', async (id) => {
  if (!store.vault(id)) return fail('notConfigured');
  store.data.activeVaultId = id;
  store.save();
  return { success: true };
});

// Mount a reachable share with a TCP probe first, so a typo in the address
// fails fast with a clear message instead of a long OS timeout.
async function mountChecked(vault, serverPassword) {
  if (!mounter.supported) return fail('unsupported');
  if (!(await mounter.probe(vault.host))) return fail('unreachable', { host: vault.host });
  try {
    const mountPath = await doMount(vault, serverPassword);
    return { success: true, mountPath, vaultId: vault.id };
  } catch (err) {
    return fail('mountFailed', { detail: String(err.message || err) });
  }
}

handle('unlock', async (id, masterPassword) => {
  const vault = store.vault(id);
  if (!isComplete(vault)) return fail('notConfigured');
  const wait = throttled(id);
  if (wait) return fail('tooManyAttempts', { seconds: wait });

  let serverPassword;
  try {
    serverPassword = await decryptSecret(String(masterPassword || ''), vault);
  } catch {
    recordFailure(id);
    return fail('wrongPassword');
  }
  failures.delete(id);

  // Transparently re-encrypt configs written with weaker KDF parameters.
  if (needsKdfUpgrade(vault)) {
    try {
      Object.assign(vault, await encryptSecret(masterPassword, serverPassword));
      store.save();
    } catch {
      /* keep the old record; it still works */
    }
  }

  store.data.activeVaultId = id;
  store.save();
  return mountChecked(vault, serverPassword);
});

handle('unlock-touch-id', async (id) => {
  const vault = store.vault(id);
  if (!vault || !vault.quickUnlock || !touchIdAvailable()) return fail('touchIdUnavailable');
  try {
    await systemPreferences.promptTouchID(`unlock “${vault.name}”`);
  } catch {
    return fail('touchIdFailed');
  }
  let serverPassword;
  try {
    serverPassword = safeStorage.decryptString(Buffer.from(vault.quickUnlock, 'base64'));
  } catch {
    return fail('touchIdFailed');
  }
  store.data.activeVaultId = id;
  store.save();
  return mountChecked(vault, serverPassword);
});

handle('set-touch-id', async (id, enable, masterPassword) => {
  const vault = store.vault(id);
  if (!vault) return fail('notConfigured');
  if (!enable) {
    delete vault.quickUnlock;
    store.save();
    return { success: true };
  }
  if (!touchIdAvailable()) return fail('touchIdUnavailable');
  let serverPassword;
  try {
    serverPassword = await decryptSecret(String(masterPassword || ''), vault);
  } catch {
    return fail('wrongPassword');
  }
  vault.quickUnlock = safeStorage.encryptString(serverPassword).toString('base64');
  store.save();
  return { success: true };
});

handle('change-master-password', async (id, oldPw, newPw) => {
  const vault = store.vault(id);
  if (!isComplete(vault)) return fail('notConfigured');
  if (!V.validMaster(newPw)) return fail('masterTooShort', { min: V.MIN_MASTER_LENGTH });
  const wait = throttled(id);
  if (wait) return fail('tooManyAttempts', { seconds: wait });

  let serverPassword;
  try {
    serverPassword = await decryptSecret(String(oldPw || ''), vault);
  } catch {
    recordFailure(id);
    return fail('currentPwWrong');
  }
  try {
    Object.assign(vault, await encryptSecret(newPw, serverPassword));
    store.save();
    return { success: true };
  } catch (err) {
    return fail('saveFailed', { detail: err.message });
  }
});

// Verifies the address and credentials from the wizard by mounting the share
// and, if it was not mounted before, unmounting it again.
handle('test-connection', async (data) => {
  const { form, error } = readVaultForm({ ...data, name: 'test' });
  if (error) return fail(error);
  if (!mounter.supported) return fail('unsupported');
  if (!(await mounter.probe(form.host))) return fail('unreachable', { host: form.host });
  const probeVault = { ...form, id: 'test' };
  const wasMounted = await mounter.mountedPath(probeVault);
  if (wasMounted) return { success: true };
  try {
    await mounter.mount(probeVault, form.serverPassword);
    await mounter.unmount(probeVault);
    return { success: true };
  } catch (err) {
    return fail('mountFailed', { detail: String(err.message || err) });
  }
});

handle('update-settings', async (patch) => {
  const p = patch && typeof patch === 'object' ? patch : {};
  const s = store.settings;
  if ('theme' in p && V.validTheme(p.theme)) s.theme = p.theme;
  if ('language' in p && (p.language === null || V.validLanguage(p.language))) s.language = p.language;
  if ('autoLockMinutes' in p && [0, 5, 15, 30, 60].includes(p.autoLockMinutes)) s.autoLockMinutes = p.autoLockMinutes;
  if ('lockOnSleep' in p) s.lockOnSleep = !!p.lockOnSleep;
  if ('closeToTray' in p) s.closeToTray = !!p.closeToTray;
  if ('launchAtLogin' in p) {
    s.launchAtLogin = !!p.launchAtLogin;
    applyLoginItem();
  }
  try {
    store.save();
  } catch {
    /* settings still apply for this session */
  }
  return s;
});

// Resize the window to snugly fit the current view (no dead space).
handle('resize-window', async (height) => {
  if (!mainWindow) return;
  const h = Math.max(360, Math.min(820, Math.round(Number(height) || 600)));
  mainWindow.setContentSize(WINDOW_WIDTH, h, process.platform === 'darwin');
});

handle('open-folder', async () => {
  if (!mounted) return fail('notMounted');
  const err = await shell.openPath(mounted.path);
  return err ? fail('openFailed', { detail: err }) : { success: true };
});

handle('lock-vault', async () => {
  await doUnmount();
  return true;
});
