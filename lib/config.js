/*
 * Vaultwick — password-protected network drive mounter
 * Copyright (C) 2026 Kostas Melitzanis
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { LEGACY_KDF } = require('./crypto');

const CONFIG_VERSION = 2;

const DEFAULT_SETTINGS = Object.freeze({
  theme: 'emerald',
  language: null, // null = follow the OS locale
  autoLockMinutes: 15, // 0 = never
  lockOnSleep: true,
  closeToTray: true,
  launchAtLogin: false,
});

function emptyConfig() {
  return { version: CONFIG_VERSION, settings: { ...DEFAULT_SETTINGS }, activeVaultId: null, vaults: [] };
}

function newId() {
  return crypto.randomBytes(6).toString('hex');
}

// Upgrade any older on-disk shape to the current one. v1 was a single flat vault.
function migrate(raw) {
  if (!raw || typeof raw !== 'object') return emptyConfig();
  if (raw.version === CONFIG_VERSION) {
    return {
      ...emptyConfig(),
      ...raw,
      settings: { ...DEFAULT_SETTINGS, ...(raw.settings || {}) },
      vaults: Array.isArray(raw.vaults) ? raw.vaults : [],
    };
  }
  const cfg = emptyConfig();
  if (raw.theme) cfg.settings.theme = raw.theme;
  if (raw.host && raw.salt && raw.data) {
    const id = newId();
    cfg.vaults.push({
      id,
      name: raw.share || 'Vault',
      host: raw.host,
      share: raw.share || 'vault',
      username: raw.username,
      winDrive: raw.winDrive || 'Z:',
      kdf: raw.kdf || { ...LEGACY_KDF },
      salt: raw.salt,
      iv: raw.iv,
      tag: raw.tag,
      data: raw.data,
    });
    cfg.activeVaultId = id;
  }
  return cfg;
}

function isComplete(vault) {
  return !!(vault && vault.host && vault.share && vault.username && vault.salt && vault.iv && vault.tag && vault.data);
}

class ConfigStore {
  constructor(file) {
    this.file = file;
    this.data = emptyConfig();
  }

  load() {
    try {
      this.data = migrate(JSON.parse(fs.readFileSync(this.file, 'utf8')));
    } catch {
      this.data = emptyConfig();
    }
    return this.data;
  }

  // Atomic, owner-only write: a crash mid-write can never leave a truncated file.
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
    try {
      fs.chmodSync(this.file, 0o600);
    } catch {
      /* not supported on every filesystem */
    }
  }

  get settings() {
    return this.data.settings;
  }

  get vaults() {
    return this.data.vaults;
  }

  vault(id) {
    return this.data.vaults.find((v) => v.id === id) || null;
  }

  activeVault() {
    return this.vault(this.data.activeVaultId) || this.data.vaults[0] || null;
  }

  isConfigured() {
    return this.data.vaults.some(isComplete);
  }
}

module.exports = { ConfigStore, migrate, newId, isComplete, DEFAULT_SETTINGS, CONFIG_VERSION };
