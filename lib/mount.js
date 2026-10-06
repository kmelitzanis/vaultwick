/*
 * Vaultwick — password-protected network drive mounter
 * Copyright (C) 2026 Kostas Melitzanis
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use strict';

// Mounting SMB shares on each platform. Secrets are always written to the
// child's stdin — never put on its command line, where any local process could
// read them from the process list.

const { execFile, spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

function run(cmd, args, input, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Timed out'));
    }, timeoutMs);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error((stderr || stdout).trim() || `${cmd} exited with ${code}`));
    });
    child.stdin.on('error', () => {}); // child may exit before reading everything
    child.stdin.end(input || '');
  });
}

function exec(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true }, (err, stdout) => resolve(err ? '' : String(stdout)));
  });
}

// ---------------------------------------------------------------- quoting

const psQuote = (s) => `'${String(s).replace(/'/g, "''")}'`;
const asQuote = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const uncPath = (v) => `\\\\${v.host}\\${v.share}`;
const smbUrl = (v) => `smb://${v.host}/${encodeURIComponent(v.share)}`;

// ---------------------------------------------------------------- Windows

const PS = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'];

async function winMount(v, password) {
  const script = `
$ErrorActionPreference = 'Stop'
$drive = ${psQuote(v.winDrive)}
$remote = ${psQuote(uncPath(v))}
$existing = Get-SmbMapping -LocalPath $drive -ErrorAction SilentlyContinue
if ($existing) {
  if ($existing.RemotePath -ieq $remote) { exit 0 }
  Write-Error "Drive $drive is already mapped to $($existing.RemotePath)."
  exit 3
}
if (Test-Path ($drive + '\\')) { Write-Error "Drive $drive is already in use."; exit 3 }
New-SmbMapping -LocalPath $drive -RemotePath $remote -UserName ${psQuote(v.username)} -Password ${psQuote(password)} -Persistent $false | Out-Null
`;
  await run('powershell.exe', PS, script);
  return `${v.winDrive}\\`;
}

async function winMountedPath(v) {
  const out = await run(
    'powershell.exe',
    PS,
    `(Get-SmbMapping -LocalPath ${psQuote(v.winDrive)} -ErrorAction SilentlyContinue).RemotePath`,
  ).catch(() => '');
  return out.trim().toLowerCase() === uncPath(v).toLowerCase() ? `${v.winDrive}\\` : null;
}

async function winUnmount(v) {
  await run(
    'powershell.exe',
    PS,
    `Remove-SmbMapping -LocalPath ${psQuote(v.winDrive)} -Force -UpdateProfile -ErrorAction SilentlyContinue`,
  ).catch(() => {});
}

// ---------------------------------------------------------------- macOS

// Finds where this exact host/share is mounted, from `mount` output lines like
//   //user@nas.local/My%20Share on /Volumes/My Share (smbfs, nodev, ...)
function parseMacMounts(output, v) {
  const host = v.host.toLowerCase();
  const share = v.share.toLowerCase();
  for (const line of String(output).split('\n')) {
    const m = /^\/\/(?:[^@]*@)?([^/]+)\/(.+?) on (.+) \(smbfs\b/.exec(line);
    if (!m) continue;
    let mShare = m[2];
    try {
      mShare = decodeURIComponent(mShare);
    } catch {
      /* keep raw */
    }
    if (m[1].toLowerCase() === host && mShare.toLowerCase() === share) return m[3];
  }
  return null;
}

async function macMountedPath(v) {
  return parseMacMounts(await exec('/sbin/mount', []), v);
}

async function macMount(v, password) {
  const already = await macMountedPath(v);
  if (already) return already;
  // NetFS "mount volume" shows the share on the Desktop and in Finder's sidebar.
  const script = `mount volume ${asQuote(smbUrl(v))} as user name ${asQuote(v.username)} with password ${asQuote(password)}`;
  await run('/usr/bin/osascript', ['-'], script);
  const mounted = await macMountedPath(v);
  if (!mounted) throw new Error('The share did not appear after mounting.');
  return mounted;
}

async function macUnmount(v) {
  const p = await macMountedPath(v);
  if (p) await exec('/usr/sbin/diskutil', ['unmount', p]);
}

// ---------------------------------------------------------------- Linux (GVfs)

function linuxGvfsPath(v) {
  const uid = typeof process.getuid === 'function' ? process.getuid() : 1000;
  return path.join(`/run/user/${uid}/gvfs`, `smb-share:server=${v.host.toLowerCase()},share=${v.share.toLowerCase()}`);
}

async function linuxMountedPath(v) {
  const p = linuxGvfsPath(v);
  return fs.existsSync(p) ? p : null;
}

async function linuxMount(v, password) {
  const already = await linuxMountedPath(v);
  if (already) return already;
  let user = v.username;
  let domain = '';
  const bs = user.indexOf('\\');
  if (bs > 0) {
    domain = user.slice(0, bs);
    user = user.slice(bs + 1);
  }
  // gio prompts for user, domain and password in that order.
  await run('gio', ['mount', smbUrl(v)], `${user}\n${domain}\n${password}\n`);
  const p = await linuxMountedPath(v);
  if (!p) throw new Error('The share did not appear after mounting.');
  return p;
}

async function linuxUnmount(v) {
  await exec('gio', ['mount', '-u', smbUrl(v)]);
}

// ---------------------------------------------------------------- public API

const impl = {
  win32: { mount: winMount, unmount: winUnmount, mountedPath: winMountedPath },
  darwin: { mount: macMount, unmount: macUnmount, mountedPath: macMountedPath },
  linux: { mount: linuxMount, unmount: linuxUnmount, mountedPath: linuxMountedPath },
}[os.platform()];

function unsupported() {
  return Promise.reject(new Error('Unsupported platform'));
}

// Quick reachability check of the SMB port before attempting a mount.
function probe(host, port = 445, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const sock = net.connect({ host: host.replace(/^\[|\]$/g, ''), port });
    const done = (ok) => {
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(timeoutMs, () => done(false));
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
  });
}

module.exports = {
  supported: !!impl,
  mount: impl ? impl.mount : unsupported,
  unmount: impl ? impl.unmount : () => Promise.resolve(),
  mountedPath: impl ? impl.mountedPath : () => Promise.resolve(null),
  probe,
  parseMacMounts,
};
