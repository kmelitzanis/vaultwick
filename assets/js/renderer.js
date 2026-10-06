'use strict';

(() => {
  const api = window.vaultAPI;
  const $ = (id) => document.getElementById(id);

  // ---------- State ----------
  let status = null;
  let lang = 'en';
  let wizardMode = 'first'; // 'first' | 'edit' | 'add'
  let removeArmed = false;

  // ---------- i18n ----------
  function t(key, params) {
    const dict = window.I18N[lang] || window.I18N.en;
    let s = dict[key] || window.I18N.en[key] || key;
    if (params) s = s.replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k]) : ''));
    return s;
  }

  function errorText(res) {
    return res && res.code ? t(res.code, res) : t('unknown');
  }

  function resolveLang() {
    const chosen = status.settings.language;
    if (chosen && window.I18N[chosen]) return chosen;
    return String(status.locale || 'en').toLowerCase().startsWith('el') ? 'el' : 'en';
  }

  function applyI18n() {
    lang = resolveLang();
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
    document.querySelectorAll('[data-i18n-ph]').forEach((el) => (el.placeholder = t(el.dataset.i18nPh)));
    document.querySelectorAll('[data-i18n-title]').forEach((el) => (el.title = t(el.dataset.i18nTitle)));
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
  }

  // ---------- Themes ----------
  const THEMES = {
    emerald: { top: '#2fd6a8', bottom: '#1fb47a' },
    ocean: { top: '#4f9bff', bottom: '#5b5bf0' },
    sunset: { top: '#ff9a6b', bottom: '#f43f7c' },
    violet: { top: '#a06bf0', bottom: '#7a3df0' },
    midnight: { top: '#3a5068', bottom: '#1b2735' },
  };

  function applyTheme(id) {
    const theme = THEMES[id] ? id : 'emerald';
    const c = THEMES[theme];
    document.documentElement.style.setProperty('--g-top', c.top);
    document.documentElement.style.setProperty('--g-bottom', c.bottom);
    document.querySelectorAll('.swatch').forEach((s) => {
      const on = s.dataset.theme === theme;
      s.classList.toggle('active', on);
      s.setAttribute('aria-checked', String(on));
    });
  }

  function buildSwatches() {
    const wrap = $('swatches');
    wrap.textContent = '';
    Object.entries(THEMES).forEach(([id, c]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.dataset.theme = id;
      b.title = id;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', id);
      b.style.background = `linear-gradient(170deg, ${c.top}, ${c.bottom})`;
      b.addEventListener('click', async () => {
        applyTheme(id);
        status.settings = await api.updateSettings({ theme: id });
      });
      wrap.appendChild(b);
    });
  }

  // ---------- Password show/hide toggles ----------
  const EYE_OPEN = '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle>';
  const EYE_OFF =
    '<path d="M9.9 4.2A10.9 10.9 0 0 1 12 4c6.5 0 10 7 10 7a18.5 18.5 0 0 1-3 3.6M6 6.3A18.6 18.6 0 0 0 2 11s3.5 7 10 7a10.8 10.8 0 0 0 4.3-.9"></path><path d="m1 1 22 22"></path>';

  function initToggles() {
    document.querySelectorAll('.field input[type=password]').forEach((inp) => {
      if (inp.parentElement.querySelector('.toggle')) return;
      inp.classList.add('has-toggle');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'toggle';
      b.tabIndex = -1;
      b.setAttribute('aria-label', 'Show password');
      b.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        EYE_OPEN +
        '</svg>';
      b.addEventListener('click', () => {
        const reveal = inp.type === 'password';
        inp.type = reveal ? 'text' : 'password';
        b.querySelector('svg').innerHTML = reveal ? EYE_OFF : EYE_OPEN;
        inp.focus();
      });
      inp.parentElement.appendChild(b);
    });
  }

  // ---------- Password strength ----------
  function strength(pw) {
    if (!pw) return -1;
    if (pw.length < status.minMasterLength) return 0;
    const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
    let score = 1;
    if (pw.length >= 12) score++;
    if (pw.length >= 16) score++;
    if (classes >= 3) score++;
    if (/^(.)\1+$/.test(pw) || /^(?:password|12345678|qwerty)/i.test(pw)) score = 1;
    return Math.min(4, score);
  }

  function bindMeter(input, meter, label) {
    input.addEventListener('input', () => {
      const s = strength(input.value);
      meter.dataset.score = String(s);
      label.textContent = s < 0 ? '' : t(`strength${s}`);
    });
  }

  function resetMeter(meter, label) {
    meter.dataset.score = '-1';
    label.textContent = '';
  }

  // ---------- Views ----------
  const views = ['wizard', 'locked', 'unlocked', 'settings'];

  function fitWindow() {
    // .app's scrollHeight = padding + the one visible view (others are display:none)
    api.resizeWindow($('app').scrollHeight);
  }

  function show(view) {
    views.forEach((v) => $(v).classList.toggle('hidden', v !== view));
    requestAnimationFrame(fitWindow);
  }

  function shake(el) {
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }

  function busy(btn, labelKey) {
    btn.disabled = true;
    btn.textContent = '';
    const sp = document.createElement('span');
    sp.className = 'spinner';
    btn.append(sp, t(labelKey));
  }

  function idle(btn, labelKey) {
    btn.disabled = false;
    btn.textContent = t(labelKey);
  }

  function setMsg(el, text, kind = 'error') {
    el.className = `msg ${kind}`;
    el.textContent = text || '';
    requestAnimationFrame(fitWindow);
  }

  // ---------- Status ----------
  async function refresh() {
    status = await api.getStatus();
    applyI18n();
    applyTheme(status.settings.theme);
    document.body.classList.toggle('is-win', status.platform === 'win32');
  }

  function currentVault() {
    const id = (status.mounted && status.mounted.vaultId) || status.activeVaultId;
    return status.vaults.find((v) => v.id === id) || status.vaults[0] || null;
  }

  // ---------- Locked ----------
  const passwordInput = $('password');
  const errorDiv = $('error');
  const unlockBtn = $('unlockBtn');
  const vaultPick = $('vaultPick');

  function renderLocked(message) {
    const many = status.vaults.length > 1;
    $('vaultPickWrap').classList.toggle('hidden', !many);
    vaultPick.textContent = '';
    status.vaults.forEach((v) => {
      const o = document.createElement('option');
      o.value = v.id;
      o.textContent = `${v.name} — ${v.host}/${v.share}`;
      vaultPick.appendChild(o);
    });
    const cur = currentVault();
    if (cur) vaultPick.value = cur.id;
    updateTouchIdButton();
    passwordInput.value = '';
    setMsg(errorDiv, message || '', message ? 'ok' : 'error');
    show('locked');
    passwordInput.focus();
  }

  function selectedVault() {
    return status.vaults.find((v) => v.id === vaultPick.value) || currentVault();
  }

  function updateTouchIdButton() {
    const v = selectedVault();
    $('touchIdBtn').classList.toggle('hidden', !(status.touchIdAvailable && v && v.touchId));
    requestAnimationFrame(fitWindow);
  }

  vaultPick.addEventListener('change', async () => {
    await api.setActiveVault(vaultPick.value);
    status.activeVaultId = vaultPick.value;
    updateTouchIdButton();
    passwordInput.focus();
  });

  async function afterUnlock(result) {
    if (result.success) {
      status.mounted = { vaultId: result.vaultId, path: result.mountPath };
      status.activeVaultId = result.vaultId;
      $('app').classList.add('success');
      setTimeout(() => {
        $('app').classList.remove('success');
        renderUnlocked();
      }, 480);
    } else {
      setMsg(errorDiv, errorText(result));
      passwordInput.value = '';
      shake(passwordInput.parentElement);
      passwordInput.focus();
    }
  }

  $('unlockForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = selectedVault();
    const pw = passwordInput.value;
    if (!pw || !v) {
      shake(passwordInput.parentElement);
      passwordInput.focus();
      return;
    }
    setMsg(errorDiv, '');
    busy(unlockBtn, 'unlocking');
    let result;
    try {
      result = await api.unlock(v.id, pw);
    } finally {
      idle(unlockBtn, 'unlock');
    }
    afterUnlock(result);
  });

  $('touchIdBtn').addEventListener('click', async () => {
    const v = selectedVault();
    if (!v) return;
    setMsg(errorDiv, '');
    const result = await api.unlockTouchId(v.id);
    if (result.success) afterUnlock(result);
    else setMsg(errorDiv, errorText(result));
  });

  // ---------- Unlocked ----------
  function renderUnlocked() {
    const v = currentVault();
    $('unlockedTitle').textContent = v ? v.name : t('unlockedTitle');
    $('mountInfo').textContent = status.mounted ? status.mounted.path : '';
    const min = status.settings.autoLockMinutes;
    $('autoLockNote').textContent = min > 0 ? t('autoLockNote', { min }) : '';
    show('unlocked');
  }

  $('openBtn').addEventListener('click', () => api.openFolder());
  $('lockBtn').addEventListener('click', async () => {
    await api.lockVault();
    status.mounted = null;
    renderLocked();
  });

  api.onLocked(async (reason) => {
    await refresh();
    const key = { idle: 'lockedIdle', sleep: 'lockedSleep', external: 'lockedExternal', tray: 'lockedTray' }[reason];
    renderLocked(key ? t(key) : '');
  });

  // ---------- Settings ----------
  const changePwPanel = $('changePwPanel');
  const touchIdPanel = $('touchIdPanel');

  function collapse(panel, open) {
    panel.classList.toggle('open', open);
    setTimeout(fitWindow, 320); // after the collapse animation settles
  }

  function renderVaultList() {
    const list = $('vaultList');
    list.textContent = '';
    const cur = currentVault();
    status.vaults.forEach((v) => {
      const li = document.createElement('li');
      li.className = v.id === (cur && cur.id) ? 'current' : '';
      const name = document.createElement('span');
      name.className = 'vault-name';
      name.textContent = v.name;
      const where = document.createElement('span');
      where.className = 'vault-where';
      where.textContent = `${v.host}/${v.share}`;
      li.append(name, where);
      if (v.id === (cur && cur.id)) {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = t('active');
        li.appendChild(tag);
      }
      list.appendChild(li);
    });
  }

  function renderSettings() {
    const s = status.settings;
    const v = currentVault();
    $('langSel').value = s.language || '';
    $('autoLockSel').value = String(s.autoLockMinutes);
    $('lockOnSleepSwitch').checked = !!s.lockOnSleep;
    $('traySwitch').checked = !!s.closeToTray;
    $('loginSwitch').checked = !!s.launchAtLogin;
    document.querySelector('.login-item').classList.toggle('hidden', !status.loginItemSupported);
    document.querySelector('.mac-touch').classList.toggle('hidden', !status.touchIdAvailable);
    $('touchIdSwitch').checked = !!(v && v.touchId);
    changePwPanel.classList.remove('open');
    touchIdPanel.classList.remove('open');
    setMsg($('pwMsg'), '');
    setMsg($('touchIdMsg'), '');
    setMsg($('vaultMsg'), '');
    removeArmed = false;
    renderVaultList();
    show('settings');
  }

  $('gearBtn').addEventListener('click', renderSettings);
  $('backBtn').addEventListener('click', renderUnlocked);

  $('langSel').addEventListener('change', async (e) => {
    status.settings = await api.updateSettings({ language: e.target.value || null });
    applyI18n();
    renderVaultList();
  });
  $('autoLockSel').addEventListener('change', async (e) => {
    status.settings = await api.updateSettings({ autoLockMinutes: Number(e.target.value) });
  });
  $('lockOnSleepSwitch').addEventListener('change', async (e) => {
    status.settings = await api.updateSettings({ lockOnSleep: e.target.checked });
  });
  $('traySwitch').addEventListener('change', async (e) => {
    status.settings = await api.updateSettings({ closeToTray: e.target.checked });
  });
  $('loginSwitch').addEventListener('change', async (e) => {
    status.settings = await api.updateSettings({ launchAtLogin: e.target.checked });
  });

  $('changePwToggle').addEventListener('click', () => {
    const open = !changePwPanel.classList.contains('open');
    collapse(changePwPanel, open);
    if (open) $('curPw').focus();
  });

  bindMeter($('newPw'), $('newMeter'), $('newMeterLabel'));

  changePwPanel.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('pwMsg');
    const np = $('newPw').value;
    if (np.length < status.minMasterLength) return setMsg(msg, t('masterTooShort', { min: status.minMasterLength }));
    if (np !== $('newPw2').value) return setMsg(msg, t('newMismatch'));
    const v = currentVault();
    const res = await api.changeMasterPassword(v.id, $('curPw').value, np);
    if (!res.success) return setMsg(msg, errorText(res));
    setMsg(msg, t('pwUpdated'), 'ok');
    ['curPw', 'newPw', 'newPw2'].forEach((id) => ($(id).value = ''));
    resetMeter($('newMeter'), $('newMeterLabel'));
    setTimeout(() => collapse(changePwPanel, false), 1000);
  });

  $('touchIdSwitch').addEventListener('change', async (e) => {
    const v = currentVault();
    if (e.target.checked) {
      collapse(touchIdPanel, true);
      $('touchIdPw').focus();
    } else {
      collapse(touchIdPanel, false);
      await api.setTouchId(v.id, false);
      await refresh();
    }
  });

  touchIdPanel.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = currentVault();
    const res = await api.setTouchId(v.id, true, $('touchIdPw').value);
    $('touchIdPw').value = '';
    if (!res.success) return setMsg($('touchIdMsg'), errorText(res));
    setMsg($('touchIdMsg'), t('touchIdOn'), 'ok');
    await refresh();
    setTimeout(() => collapse(touchIdPanel, false), 900);
  });

  $('rerunBtn').addEventListener('click', () => openWizard('edit'));
  $('addVaultBtn').addEventListener('click', () => openWizard('add'));

  $('removeVaultBtn').addEventListener('click', async () => {
    const v = currentVault();
    if (!v) return;
    if (!removeArmed) {
      removeArmed = true;
      setMsg($('vaultMsg'), t('confirmRemove', { name: v.name }));
      setTimeout(() => (removeArmed = false), 4000);
      return;
    }
    await api.deleteVault(v.id);
    await refresh();
    if (status.vaults.length) renderLocked();
    else openWizard('first');
  });

  // ---------- Wizard ----------
  const W = {
    name: $('wName'),
    host: $('wHost'),
    share: $('wShare'),
    drive: $('wDrive'),
    user: $('wUser'),
    serverPw: $('wServerPw'),
    master: $('wMasterPw'),
    master2: $('wMasterPw2'),
  };

  bindMeter(W.master, $('wMeter'), $('wMeterLabel'));

  function openWizard(mode) {
    wizardMode = mode;
    const v = mode === 'edit' ? currentVault() : null;
    W.name.value = v ? v.name : '';
    W.host.value = v ? v.host : '';
    W.share.value = v ? v.share : '';
    W.user.value = v ? v.username : '';
    W.drive.value = v ? v.winDrive : '';
    W.serverPw.value = '';
    W.master.value = '';
    W.master2.value = '';
    resetMeter($('wMeter'), $('wMeterLabel'));
    setMsg($('wizMsg'), '');
    setMsg($('testMsg'), '');
    const titles = { first: ['wizWelcome', 'wizSubtitle'], edit: ['wizEdit', 'wizEditSubtitle'], add: ['wizAdd', 'wizAddSubtitle'] };
    $('wizTitle').textContent = t(titles[mode][0]);
    $('wizSubtitle').textContent = t(titles[mode][1]);
    $('wizSaveBtn').textContent = t(mode === 'edit' ? 'saveChanges' : 'createVault');
    $('wizCancelBtn').classList.toggle('hidden', mode === 'first');
    show('wizard');
    (mode === 'edit' ? W.serverPw : W.name).focus();
  }

  function wizardData() {
    return {
      name: W.name.value,
      host: W.host.value,
      share: W.share.value,
      username: W.user.value,
      winDrive: W.drive.value || 'Z:',
      serverPassword: W.serverPw.value,
    };
  }

  $('wizCancelBtn').addEventListener('click', () => (status.mounted ? renderSettings() : renderLocked()));

  $('testBtn').addEventListener('click', async () => {
    const btn = $('testBtn');
    const msg = $('testMsg');
    busy(btn, 'testing');
    setMsg(msg, '');
    let res;
    try {
      res = await api.testConnection(wizardData());
    } finally {
      idle(btn, 'testConnection');
    }
    setMsg(msg, res.success ? t('testOk') : errorText(res), res.success ? 'ok inline' : 'error inline');
  });

  $('wizForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('wizMsg');
    const btn = $('wizSaveBtn');
    const data = { ...wizardData(), masterPassword: W.master.value };
    if (wizardMode === 'edit') data.id = currentVault().id;
    if (data.masterPassword.length < status.minMasterLength) {
      return setMsg(msg, t('masterTooShort', { min: status.minMasterLength }));
    }
    if (data.masterPassword !== W.master2.value) return setMsg(msg, t('mismatch'));

    const label = wizardMode === 'edit' ? 'saveChanges' : 'createVault';
    busy(btn, 'saving');
    let res;
    try {
      res = await api.saveVault(data);
    } finally {
      idle(btn, label);
    }
    if (!res.success) return setMsg(msg, errorText(res));
    await refresh();
    status.activeVaultId = res.id;
    if (status.mounted) renderSettings();
    else renderLocked();
  });

  // ---------- Init ----------
  (async () => {
    buildSwatches();
    initToggles();
    await refresh();
    if (!status.configured) openWizard('first');
    else if (status.mounted) renderUnlocked();
    else renderLocked();
  })();
})();
