/*
 * Vaultwick — password-protected network drive mounter
 * Copyright (C) 2026 Kostas Melitzanis
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use strict';

const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);

// Parameters used for new encryptions. ~128 MiB of memory per derivation makes
// offline guessing against a stolen config considerably more expensive.
const DEFAULT_KDF = Object.freeze({ name: 'scrypt', N: 2 ** 17, r: 8, p: 1 });
// Configs written before KDF parameters were stored used Node's defaults.
const LEGACY_KDF = Object.freeze({ name: 'scrypt', N: 2 ** 14, r: 8, p: 1 });

function kdfOf(record) {
  return record && record.kdf ? record.kdf : LEGACY_KDF;
}

function needsKdfUpgrade(record) {
  const k = kdfOf(record);
  return k.N < DEFAULT_KDF.N || k.r < DEFAULT_KDF.r || k.p < DEFAULT_KDF.p;
}

async function deriveKey(password, salt, kdf) {
  if (!kdf || kdf.name !== 'scrypt') throw new Error('Unsupported KDF');
  const maxmem = 256 * kdf.N * kdf.r + 32 * 1024 * 1024;
  return scrypt(String(password), salt, 32, { N: kdf.N, r: kdf.r, p: kdf.p, maxmem });
}

// Encrypt `secret` with a key derived from `password` (AES-256-GCM). Returns the
// hex fields stored in the config, including the KDF parameters used.
async function encryptSecret(password, secret, kdf = DEFAULT_KDF) {
  const salt = crypto.randomBytes(16);
  const key = await deriveKey(password, salt, kdf);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(Buffer.from(String(secret), 'utf8')), cipher.final()]);
  return {
    kdf: { ...kdf },
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
    data: enc.toString('hex'),
  };
}

// Decrypt a record produced by encryptSecret. Throws on a wrong password
// (GCM authentication failure) or a tampered record.
async function decryptSecret(password, record) {
  const key = await deriveKey(password, Buffer.from(record.salt, 'hex'), kdfOf(record));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(record.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(record.tag, 'hex'));
  const out = Buffer.concat([decipher.update(Buffer.from(record.data, 'hex')), decipher.final()]);
  return out.toString('utf8');
}

module.exports = { DEFAULT_KDF, LEGACY_KDF, encryptSecret, decryptSecret, needsKdfUpgrade };
