'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { encryptSecret, decryptSecret, needsKdfUpgrade, LEGACY_KDF } = require('../lib/crypto');

const FAST = { name: 'scrypt', N: 1024, r: 8, p: 1 };

test('round-trips a secret', async () => {
  const rec = await encryptSecret('master-pw', 's3cret!', FAST);
  assert.strictEqual(await decryptSecret('master-pw', rec), 's3cret!');
});

test('rejects a wrong password', async () => {
  const rec = await encryptSecret('master-pw', 's3cret!', FAST);
  await assert.rejects(decryptSecret('nope', rec));
});

test('rejects tampered ciphertext', async () => {
  const rec = await encryptSecret('master-pw', 's3cret!', FAST);
  rec.data = (rec.data[0] === '0' ? '1' : '0') + rec.data.slice(1);
  await assert.rejects(decryptSecret('master-pw', rec));
});

test('decrypts legacy records without kdf params', async () => {
  const rec = await encryptSecret('pw', 'x', LEGACY_KDF);
  delete rec.kdf;
  assert.strictEqual(await decryptSecret('pw', rec), 'x');
  assert.ok(needsKdfUpgrade(rec));
});

test('default params need no upgrade', async () => {
  assert.ok(!needsKdfUpgrade({ kdf: { name: 'scrypt', N: 2 ** 17, r: 8, p: 1 } }));
});
