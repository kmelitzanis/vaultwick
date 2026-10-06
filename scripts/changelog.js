#!/usr/bin/env node
/*
 * Vaultwick — password-protected network drive mounter
 * Copyright (C) 2026 Kostas Melitzanis
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use strict';

// Prints the CHANGELOG.md section for a version (default: package.json's),
// used as the GitHub Release description. Exits non-zero if it is missing.
//
//   node scripts/changelog.js [version] [path/to/CHANGELOG.md]

const fs = require('fs');
const path = require('path');

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Matches "## [1.2.0] - 2026-10-06", "## 1.2.0", "## v1.2.0 (2026-10-06)" etc.
function extractSection(markdown, version) {
  const v = escapeRegExp(String(version).replace(/^v/, ''));
  const heading = new RegExp(`^##\\s+\\[?v?${v}\\]?(?:\\s|$)`);
  const lines = String(markdown).split(/\r?\n/);
  const start = lines.findIndex((l) => heading.test(l));
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i]) || /^\[[^\]]+\]:\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  const body = lines
    .slice(start + 1, end)
    .join('\n')
    .trim();
  return body || null;
}

if (require.main === module) {
  const root = path.join(__dirname, '..');
  const version = process.argv[2] || require(path.join(root, 'package.json')).version;
  const file = process.argv[3] || path.join(root, 'CHANGELOG.md');
  const section = extractSection(fs.readFileSync(file, 'utf8'), version);
  if (!section) {
    console.error(`No CHANGELOG.md entry found for version ${version}.`);
    process.exit(1);
  }
  process.stdout.write(section + '\n');
}

module.exports = { extractSection };
