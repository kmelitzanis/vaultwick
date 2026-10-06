'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { parseMacMounts } = require('../lib/mount');

const OUT = [
  '/dev/disk3s1s1 on / (apfs, sealed, local, read-only, journaled)',
  '//bob@nas.local/My%20Share on /Volumes/My Share-1 (smbfs, nodev, nosuid, mounted by bob)',
  '//alice@other/vault on /Volumes/vault (smbfs, nodev, nosuid, mounted by bob)',
].join('\n');

test('finds the mount point of the matching share', () => {
  assert.strictEqual(parseMacMounts(OUT, { host: 'NAS.local', share: 'my share' }), '/Volumes/My Share-1');
});

test('ignores a same-named share on another host', () => {
  assert.strictEqual(parseMacMounts(OUT, { host: 'nas.local', share: 'vault' }), null);
});
