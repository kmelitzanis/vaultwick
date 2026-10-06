#!/usr/bin/env node
/*
 * Vaultwick — password-protected network drive mounter
 * Copyright (C) 2026 Kostas Melitzanis
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use strict';

// electron-builder always calls the Intel architecture "x64". Releases name it
// "amd64" instead (Vaultwick-1.2.0.amd64.dmg), so this renames the Intel files
// in dist/ and rewrites latest-mac.yml to match, keeping auto-update working.
//
//   node scripts/rename-mac-artifacts.js [dist]

const fs = require('fs');
const path = require('path');

const FROM = '-x64.';
const TO = '.amd64.';

function renameMacArtifacts(dir) {
  const renamed = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.includes(FROM)) continue;
    const next = name.replace(FROM, TO);
    fs.renameSync(path.join(dir, name), path.join(dir, next));
    renamed.push([name, next]);
  }
  const yml = path.join(dir, 'latest-mac.yml');
  if (fs.existsSync(yml)) {
    let text = fs.readFileSync(yml, 'utf8');
    for (const [from, to] of renamed) text = text.split(from).join(to);
    fs.writeFileSync(yml, text);
  }
  return renamed;
}

if (require.main === module) {
  const dir = process.argv[2] || path.join(__dirname, '..', 'dist');
  for (const [from, to] of renameMacArtifacts(dir)) console.log(`${from} -> ${to}`);
}

module.exports = { renameMacArtifacts };
