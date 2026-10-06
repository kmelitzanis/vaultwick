# 🔒 Vaultwick

A small, cross-platform desktop app that mounts password-protected network
drives (SMB/CIFS) — from a NAS, a PC, or any SMB server — as real mounted
volumes. Server passwords are encrypted at rest with a master password you
choose, so they are never stored in plain text.

Built with [Electron](https://www.electronjs.org/).

## Features

- **Multiple vaults** — each share has its own name and master password.
- **Encrypted credentials** — AES-256-GCM with a key derived by scrypt
  (N=2¹⁷). Older configs are upgraded transparently on the next unlock.
- **Real mounted volumes** — `/Volumes` on macOS, a drive letter on Windows,
  GVfs (`gio mount`) on Linux.
- **Auto-lock** after a chosen idle time, on sleep and on screen lock; the app
  also notices when the share is ejected from outside.
- **Touch ID** unlock on macOS (via the system keychain).
- **Tray / menu-bar icon** with Open Folder and Lock, optional launch at login.
- **Test connection** button in the setup wizard.
- **Password strength meter**, minimum master-password length and an
  increasing delay after repeated wrong passwords.
- **English and Greek** UI, five colour themes.
- **Automatic updates** from GitHub Releases.

## Run from source

```bash
git clone https://github.com/kmelitzanis/vaultwick.git
cd vaultwick
npm install
npm start
```

## Development

```bash
npm test             # unit tests (node:test)
npm run lint         # ESLint
npm run format       # Prettier
```

CI runs lint, format check, tests and builds for all three platforms on every
pull request.

## Build installers

```bash
npm run dist:mac     # .dmg + .zip  (build on macOS)
npm run dist:win     # .exe         (build on Windows)
npm run dist:linux   # .AppImage + .deb
```

Pushing a `v*` tag runs the release workflow, which builds every platform and
publishes a GitHub Release (used by the auto-updater).

### Code signing

Unsigned builds trigger Gatekeeper / SmartScreen warnings. Signing and
notarization happen automatically when these repository secrets exist:

| Secret | Purpose |
|--------|---------|
| `CSC_LINK`, `CSC_KEY_PASSWORD` | Signing certificate (.p12 / .pfx, base64) |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | macOS notarization |

## How it works

| File | Role |
|------|------|
| `main.js` | Main process: window, tray, auto-lock, IPC (sender-checked) |
| `lib/crypto.js` | scrypt + AES-256-GCM encryption |
| `lib/config.js` | Config schema, migration, atomic owner-only writes |
| `lib/mount.js` | Per-platform mounting; secrets go via stdin, never argv |
| `lib/validate.js` | Input validation for every IPC payload |
| `preload.js` | Minimal `vaultAPI` bridge |
| `index.html`, `assets/` | UI (strict CSP, no inline scripts) |

The config (`vault-config.json`) lives in the per-user data directory with
`0600` permissions. **It is git-ignored and never shipped inside the app.**

## Security notes

- Master passwords are never stored — only salt, IV, GCM tag, ciphertext and
  KDF parameters.
- Server passwords are passed to the OS mount tools through stdin, so they do
  not appear in the process list.
- The renderer is sandboxed with context isolation, a strict CSP, blocked
  navigation/new windows and denied permission requests. Packaged builds
  disable `runAsNode`, `NODE_OPTIONS` and inspector flags via Electron fuses
  and validate ASAR integrity.
- This protects stored credentials at rest. It is not a substitute for
  full-disk encryption or proper server-side access controls.

## License

Licensed under the **GNU General Public License v3.0 or later**.
See [LICENSE](LICENSE) for the full text.
