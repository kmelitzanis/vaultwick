'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { extractSection } = require('../scripts/changelog');

const MD = `# Changelog

## [Unreleased]

- Nothing yet

## [1.1.0] - 2026-10-06

### Added
- Thing one

## [1.0.0] - 2026-01-01

- First

[1.1.0]: https://example.com
`;

test('extracts a version section', () => {
  assert.strictEqual(extractSection(MD, '1.1.0'), '### Added\n- Thing one');
  assert.strictEqual(extractSection(MD, 'v1.0.0'), '- First');
});

test('does not match a prefix of another version', () => {
  assert.strictEqual(extractSection(MD, '1.1'), null);
  assert.strictEqual(extractSection(MD, '2.0.0'), null);
});

test('the current package version has a changelog entry', () => {
  const root = path.join(__dirname, '..');
  const { version } = require(path.join(root, 'package.json'));
  const md = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  assert.ok(extractSection(md, version), `CHANGELOG.md needs a "## [${version}]" section`);
});
