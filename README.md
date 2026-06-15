# 🔒 Vaultwick

A small, cross-platform desktop app that mounts a password-protected network
drive (SMB/CIFS) — from a NAS, a PC, or any SMB server — and exposes it as a
real mounted volume. Your server password is encrypted at rest with a master
password you choose, so it's never stored in plain text.

Built with [Electron](https://www.electronjs.org/).

## Features

- **One master password** unlocks the app and mounts your drive.
- **Encrypted credentials** — the server password is sealed with AES-256-GCM
  using a key derived (scrypt) from your master password. Wrong password →
  decryption simply fails.
- **Real mounted volume** — on macOS the share appears under `/Volumes` (shown
  on the Desktop and in Finder's sidebar); on Windows it maps to a drive letter.
- **First-run setup wizard** — no config files to hand-edit.
- **Settings** — change your master password, re-run setup, and pick from
  several gradient themes.
- **No admin rights required** for mounting.

## Install / Run from source

```bash
git clone https://github.com/<your-username>/vaultwick.git
cd vaultwick
npm install
npm start
```

On first launch the setup wizard collects your server address, shared folder,
username, server password, and a master password.

## Build installers

```bash
npm run dist:mac    # .dmg  (must be built on macOS)
npm run dist:win    # .exe  (build on Windows, or via Wine on macOS)
npm run dist:all    # both
```

Output is written to `dist/`.

> **Note:** Unsigned builds trigger Gatekeeper (macOS) / SmartScreen (Windows)
> warnings. Code signing requires an Apple Developer / Windows certificate.

## How it works

| File | Role |
|------|------|
| `main.js` | Electron main process: config, crypto, mounting (`mount_smbfs` / `net use`), IPC |
| `preload.js` | Secure bridge exposing a minimal `vaultAPI` to the renderer |
| `index.html` + `assets/css/app.css` | The UI (wizard, lock, unlocked, settings) |
| `setup.js` | Optional legacy CLI setup (the app has a built-in wizard) |

The encrypted config (`vault-config.json`) is written to the app's per-user
data directory. **It is git-ignored and never shipped inside the app.**

## Security notes

- The master password is never stored — only a random salt, IV, GCM tag, and
  ciphertext are saved. The key is re-derived on each unlock.
- This protects the stored credential at rest. It is not a substitute for
  full-disk encryption or proper server-side access controls.

## License

Licensed under the **GNU General Public License v3.0 or later**.
See [LICENSE](LICENSE) for the full text.
