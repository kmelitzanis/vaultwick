'use strict';

const test = require('node:test');
const assert = require('node:assert');
const v = require('../lib/validate');

test('hosts', () => {
  for (const ok of ['192.168.1.10', 'nas', 'nas.local', 'fe80::1', '[fe80::1]']) assert.ok(v.validHost(ok), ok);
  for (const bad of ['', 'a b', 'host/share', 'smb://x', '../etc', 'x"y']) assert.ok(!v.validHost(bad), bad);
});

test('shares', () => {
  for (const ok of ['vault', 'My Share', 'data$', 'a.b-c_d']) assert.ok(v.validShare(ok), ok);
  for (const bad of ['', '.', '..', '../Users', 'a/b', 'a\\b', 'x"y', 'a\nb']) assert.ok(!v.validShare(bad), bad);
});

test('usernames', () => {
  for (const ok of ['bob', 'bob@corp.local', 'CORP\\bob']) assert.ok(v.validUsername(ok), ok);
  for (const bad of ['', 'a"b', 'a\nb', 'a:b']) assert.ok(!v.validUsername(bad), bad);
});

test('drive letters', () => {
  assert.strictEqual(v.normalizeDrive('z'), 'Z:');
  assert.strictEqual(v.normalizeDrive('Y:'), 'Y:');
  for (const bad of ['C:', 'Z:\\', 'Z: & calc', '', 'ZZ']) assert.strictEqual(v.normalizeDrive(bad), null, bad);
});

test('master password length', () => {
  assert.ok(!v.validMaster('short'));
  assert.ok(v.validMaster('long enough'));
});
