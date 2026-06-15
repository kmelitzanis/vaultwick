// One-time setup: creates vault-config.json (legacy CLI; the app now has a
// built-in setup wizard on first launch).
// Your server password is encrypted with your master password (AES-256-GCM),
// so it is never stored in plain text.
//
// Run with:  node setup.js

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

// Masked prompt for passwords (shows * instead of the characters)
function askHidden(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    stdin.resume();
    if (stdin.isTTY) stdin.setRawMode(true);
    let value = '';
    const onData = (chunk) => {
      const char = chunk.toString('utf8');
      if (char === '\n' || char === '\r' || char === '\u0004') {
        if (stdin.isTTY) stdin.setRawMode(false);
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(value);
      } else if (char === '\u0003') { // Ctrl+C
        process.exit(1);
      } else if (char === '\u007f' || char === '\b') { // backspace
        if (value.length > 0) {
          value = value.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else {
        value += char;
        process.stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

(async () => {
  console.log('\n=== Vaultwick setup ===\n');

  const host = (await ask('Server host/IP [192.168.1.1]: ')).trim() || '192.168.1.1';
  const share = (await ask('Share/folder name [vault]: ')).trim() || 'vault';
  const username = (await ask('Username: ')).trim();
  const winDrive = (await ask('Windows drive letter [Z:]: ')).trim() || 'Z:';

  const sharePassword = await askHidden('Server password: ');
  const vaultPassword = await askHidden('Choose a VAULT password (to unlock the app): ');
  const vaultPassword2 = await askHidden('Confirm vault password: ');

  rl.close();

  if (vaultPassword !== vaultPassword2) {
    console.error('\nVault passwords do not match. Nothing saved.');
    process.exit(1);
  }
  if (!username) {
    console.error('\nUsername is required. Nothing saved.');
    process.exit(1);
  }

  // Encrypt the NAS password with a key derived from the vault password
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(vaultPassword, salt, 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([
    cipher.update(Buffer.from(sharePassword, 'utf8')),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  const config = {
    host,
    share,
    username,
    winDrive,
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: enc.toString('hex'),
  };

  const outPath = path.join(__dirname, 'vault-config.json');
  fs.writeFileSync(outPath, JSON.stringify(config, null, 2));
  console.log(`\nSaved ${outPath}`);
  console.log('Your server password is encrypted with your master password.');
  console.log('Start the app with:  npm start\n');
})();
