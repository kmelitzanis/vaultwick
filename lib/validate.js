/*
 * Vaultwick — password-protected network drive mounter
 * Copyright (C) 2026 Kostas Melitzanis
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use strict';

const THEMES = ['emerald', 'ocean', 'sunset', 'violet', 'midnight'];
const LANGUAGES = ['en', 'el'];
const MIN_MASTER_LENGTH = 8;

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

// Hostname, IPv4, or IPv6 (optionally bracketed). No paths, ports or schemes.
function validHost(v) {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  if (!s || s.length > 253) return false;
  if (/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/.test(s))
    return true;
  return /^\[?[0-9A-Fa-f:.]+\]?$/.test(s) && s.includes(':');
}

// A single share name: no separators, no traversal, no quotes or control chars.
function validShare(v) {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  if (!s || s.length > 80 || s === '.' || s === '..') return false;
  return /^[A-Za-z0-9 _.\-$]+$/.test(s);
}

// user, user@domain or DOMAIN\user
function validUsername(v) {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  return s.length > 0 && s.length <= 256 && !CONTROL.test(s) && !/["/:;|=,+*?<>[\]]/.test(s);
}

function normalizeDrive(v) {
  const s = String(v || '')
    .trim()
    .toUpperCase();
  const m = /^([D-Z]):?$/.exec(s);
  return m ? `${m[1]}:` : null;
}

function validName(v) {
  return typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 60 && !CONTROL.test(v);
}

function validTheme(v) {
  return THEMES.includes(v);
}

function validLanguage(v) {
  return LANGUAGES.includes(v);
}

function validSecret(v) {
  return typeof v === 'string' && v.length > 0 && v.length <= 1024;
}

function validMaster(v) {
  return validSecret(v) && v.length >= MIN_MASTER_LENGTH;
}

module.exports = {
  THEMES,
  LANGUAGES,
  MIN_MASTER_LENGTH,
  validHost,
  validShare,
  validUsername,
  normalizeDrive,
  validName,
  validTheme,
  validLanguage,
  validSecret,
  validMaster,
};
