# Changelog

All notable changes to Vaultwick are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!--
How releases work: bump "version" in package.json and add a matching
"## [x.y.z] - YYYY-MM-DD" section below. When that reaches main, the Release
workflow tags vx.y.z, builds every platform and publishes a GitHub Release
whose description is exactly that section.
-->

## [Unreleased]

## [1.2.1] - 2026-10-07

### Fixed

- macOS: the app quit immediately on launch. Builds without a Developer ID
  certificate are now ad-hoc signed, which Apple Silicon requires. CI now checks
  that the macOS app is signed and starts.

## [1.2.0] - 2026-10-07

### Changed

- New logo for the app icon and inside the app: a vault door whose dial is a
  network hub. Inside the app the dial turns open while a vault is mounted.
- Darker, more muted colour themes (emerald, ocean, wine, violet, midnight).
- README shows the logo, status badges and a download guide per platform.

## [1.1.1] - 2026-10-06

### Added

- macOS builds for Intel (`Vaultwick-X.Y.Z.amd64.dmg`) in addition to Apple
  Silicon (`Vaultwick-X.Y.Z-arm64.dmg`).

## [1.1.0] - 2026-10-06

### Added

- **Multiple vaults** — add, edit, switch between and remove network shares,
  each with its own name and master password.
- **Auto-lock** after 5–60 minutes of inactivity, and when the computer goes
  to sleep or the screen locks.
- **Detection of external ejects** — the app returns to the lock screen if the
  share is disconnected outside the app.
- **Touch ID unlock** on macOS, backed by the system keychain.
- **Tray / menu-bar icon** with Open Folder, Lock Vault and Quit, plus an
  option to keep running in the background.
- **Launch at login** on macOS and Windows.
- **Test connection** button in the setup wizard.
- **Password strength meter** for new master passwords.
- **Greek translation**, with automatic language detection and a language
  picker in Settings.
- **Linux support** (mounting via GVfs / `gio mount`; AppImage and .deb builds).
- **Automatic updates** from GitHub Releases.
- Release workflow that tags, builds and publishes releases with notes taken
  from this changelog.
- Unit tests, ESLint, Prettier and GitHub Actions CI.

### Changed

- Refreshed design: glass cards, padlock badge, toggle switches, clearer
  inputs, focus rings and a pulsing mount indicator.
- Stronger key derivation (scrypt N=2¹⁷). Existing vaults are upgraded
  automatically on their next unlock.
- Master passwords must be at least 8 characters.
- The configuration file moved to a versioned format; older files are migrated
  automatically.
- Windows mounting now uses `New-SmbMapping` (non-persistent) instead of
  `net use`.
- Error messages are clearer and translated.

### Removed

- The legacy `setup.js` command-line setup (the in-app wizard replaces it).

### Security

- Server passwords are passed to the OS mount tools through stdin and no
  longer appear in the process list.
- Fixed a command-injection risk when opening the mounted folder on Windows.
- All IPC input is validated, and calls from any page other than the app's own
  are rejected.
- The macOS mount point is now matched to the exact server and share, so the
  app can never unmount an unrelated volume.
- The config file is written atomically with owner-only (0600) permissions.
- Strict Content-Security-Policy, blocked navigation and new windows, denied
  permission requests and an explicitly sandboxed renderer.
- Increasing delay after repeated wrong passwords.
- Packaged builds enable Electron fuses (no `runAsNode`, `NODE_OPTIONS` or
  inspector flags; ASAR integrity validation) and the macOS hardened runtime.

## [1.0.0] - 2026-06-15

### Added

- First release: unlock with a master password to mount an SMB share
  (`/Volumes` on macOS, a drive letter on Windows).
- Server password encrypted at rest with AES-256-GCM and scrypt.
- First-run setup wizard, master password change and five colour themes.

[Unreleased]: https://github.com/kmelitzanis/vaultwick/compare/v1.2.1...HEAD
[1.2.1]: https://github.com/kmelitzanis/vaultwick/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/kmelitzanis/vaultwick/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/kmelitzanis/vaultwick/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/kmelitzanis/vaultwick/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/kmelitzanis/vaultwick/releases/tag/v1.0.0
