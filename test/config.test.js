'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ConfigStore, migrate } = require('../lib/config');

test('migrates a v1 flat config', () => {
  const cfg = migrate({
    host: 'nas',
    share: 'vault',
    username: 'u',
    winDrive: 'Y:',
    theme: 'ocean',
    salt: 'a',
    iv: 'b',
    tag: 'c',
    data: 'd',
  });
  assert.strictEqual(cfg.version, 2);
  assert.strictEqual(cfg.settings.theme, 'ocean');
  assert.strictEqual(cfg.vaults.length, 1);
  assert.strictEqual(cfg.vaults[0].winDrive, 'Y:');
  assert.strictEqual(cfg.vaults[0].kdf.N, 2 ** 14);
  assert.strictEqual(cfg.activeVaultId, cfg.vaults[0].id);
});

test('saves atomically with owner-only permissions', { skip: process.platform === 'win32' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vw-'));
  const file = path.join(dir, 'vault-config.json');
  const store = new ConfigStore(file);
  store.load();
  store.save();
  assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600);
  assert.deepStrictEqual(fs.readdirSync(dir), ['vault-config.json']);
});

test('broken file loads as empty config', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vw-'));
  const file = path.join(dir, 'vault-config.json');
  fs.writeFileSync(file, '{oops');
  const store = new ConfigStore(file);
  store.load();
  assert.strictEqual(store.isConfigured(), false);
});
