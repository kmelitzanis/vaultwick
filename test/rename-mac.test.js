'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { renameMacArtifacts } = require('../scripts/rename-mac-artifacts');

test('renames Intel artifacts to amd64 and updates latest-mac.yml', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vw-mac-'));
  const files = [
    'Vaultwick-1.2.0-arm64.dmg',
    'Vaultwick-1.2.0-arm64.zip',
    'Vaultwick-1.2.0-x64.dmg',
    'Vaultwick-1.2.0-x64.dmg.blockmap',
    'Vaultwick-1.2.0-x64.zip',
  ];
  for (const f of files) fs.writeFileSync(path.join(dir, f), '');
  fs.writeFileSync(
    path.join(dir, 'latest-mac.yml'),
    'files:\n  - url: Vaultwick-1.2.0-x64.zip\n  - url: Vaultwick-1.2.0-arm64.zip\npath: Vaultwick-1.2.0-x64.zip\n',
  );

  renameMacArtifacts(dir);

  assert.deepStrictEqual(fs.readdirSync(dir).sort(), [
    'Vaultwick-1.2.0-arm64.dmg',
    'Vaultwick-1.2.0-arm64.zip',
    'Vaultwick-1.2.0.amd64.dmg',
    'Vaultwick-1.2.0.amd64.dmg.blockmap',
    'Vaultwick-1.2.0.amd64.zip',
    'latest-mac.yml',
  ]);
  const yml = fs.readFileSync(path.join(dir, 'latest-mac.yml'), 'utf8');
  assert.ok(yml.includes('url: Vaultwick-1.2.0.amd64.zip'));
  assert.ok(yml.includes('path: Vaultwick-1.2.0.amd64.zip'));
  assert.ok(yml.includes('url: Vaultwick-1.2.0-arm64.zip'));
});
