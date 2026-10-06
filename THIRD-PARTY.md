# Third-party software

Vaultwick is licensed under the GNU General Public License v3.0 or later (see
[LICENSE](LICENSE)). The installers it ships include the third-party software
listed below, each under its own license. All of these licenses are compatible
with the GPL-3.0.

## Bundled in the application

| Component | Version | License | Source |
|-----------|---------|---------|--------|
| [Electron](https://www.electronjs.org/) | 42.x | MIT | https://github.com/electron/electron |
| [Chromium](https://www.chromium.org/) (part of Electron) | — | BSD-3-Clause and others | https://chromium.googlesource.com/chromium/src |
| [Node.js](https://nodejs.org/) (part of Electron) | — | MIT and others | https://github.com/nodejs/node |
| [electron-updater](https://github.com/electron-userland/electron-builder) | 6.8.x | MIT | https://github.com/electron-userland/electron-builder |
| builder-util-runtime | 9.7.x | MIT | https://github.com/electron-userland/electron-builder |
| fs-extra | 10.1.x | MIT | https://github.com/jprichardson/node-fs-extra |
| graceful-fs | 4.2.x | ISC | https://github.com/isaacs/node-graceful-fs |
| jsonfile | 6.2.x | MIT | https://github.com/jprichardson/node-jsonfile |
| universalify | 2.0.x | MIT | https://github.com/RyanZim/universalify |
| js-yaml | 4.x | MIT | https://github.com/nodeca/js-yaml |
| argparse | 2.0.x | Python-2.0 | https://github.com/nodeca/argparse |
| lazy-val | 1.0.x | MIT | https://github.com/develar/lazy-val |
| lodash.escaperegexp | 4.1.x | MIT | https://github.com/lodash/lodash |
| lodash.isequal | 4.5.x | MIT | https://github.com/lodash/lodash |
| semver | 7.x | ISC | https://github.com/npm/node-semver |
| tiny-typed-emitter | 2.1.x | MIT | https://github.com/binier/tiny-typed-emitter |
| debug | 4.x | MIT | https://github.com/debug-js/debug |
| ms | 2.1.x | MIT | https://github.com/vercel/ms |
| sax | 1.x | BlueOak-1.0.0 | https://github.com/isaacs/sax-js |

Electron ships the full license texts of Chromium and its dependencies inside
every build (`LICENSES.chromium.html` next to the executable). The license
texts of the npm packages are included in their folders under
`resources/app.asar/node_modules/`.

## Development only (not shipped)

| Component | License |
|-----------|---------|
| electron-builder | MIT |
| ESLint, @eslint/js, globals | MIT |
| Prettier | MIT |

## Operating-system tools

Vaultwick calls tools that are part of the operating system and are not
distributed with it: PowerShell `SmbShare` cmdlets (Windows), `osascript`,
`mount` and `diskutil` (macOS), and `gio` from GVfs (Linux).

## Regenerating this list

```bash
npm ls --omit=dev --all
npx license-checker --production --summary
```
