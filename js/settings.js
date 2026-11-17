// THE HOLLOW CROWN - graphics / audio / control settings with presets, persisted in localStorage.
(function () {
  const S = HC.Settings = {};
  // phones, tablets, Chromebooks and devices reporting <= 4 GB RAM get the memory-saving paths
  HC.lowMem = /[?&]lowmem\b/.test(location.search) || matchMedia('(pointer: coarse)').matches || /CrOS|Android|iPhone|iPad/.test(navigator.userAgent) || (navigator.deviceMemory || 8) <= 4;
  // Safari / every iPhone & iPad browser (all WebKit underneath)
  HC.isWebKit = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|Edg|OPR/.test(navigator.userAgent)) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  HC.phoneScreen = matchMedia('(pointer: coarse)').matches && (window.devicePixelRatio || 1) >= 2;
  // Load breadcrumbs: every loading stage is written to localStorage. If the browser kills the tab (out of memory)
  // the crumb survives the reload, so the next visit knows where it died and switches to safe mode.
  const CRUMB = 'hc_loadcrumb_v1';
  let lastCrumb = null; try { lastCrumb = JSON.parse(localStorage.getItem(CRUMB) || 'null'); } catch (e) { }
  HC.lastCrash = lastCrumb && lastCrumb.stage ? lastCrumb : null;
  HC.safeLevel = HC.lastCrash ? Math.min(2, (lastCrumb.fails || 0) + 1) : 0;   // 1 = safe graphics, 2 = also no sound
  HC.crumb = stage => { try { localStorage.setItem(CRUMB, JSON.stringify({ stage, fails: HC.safeLevel, at: Date.now() })); } catch (e) { } };
  HC.loadOk = () => { try { localStorage.removeItem(CRUMB); } catch (e) { } };
  const KEY = 'hc_settings_v1';
  S.PRESETS = {
    phone: { renderScale: 'auto', viewDist: 0.6, vegetation: 'off', terrain: 'low', bloom: false, grain: false, lights: 2, animLod: true, textures: 'full', lighting: 'simple', particles: false },
    potato: { renderScale: '0.55', viewDist: 0.5, vegetation: 'off', terrain: 'low', bloom: false, grain: false, lights: 2, animLod: true, textures: 'flat', lighting: 'simple', particles: false },
    low: { renderScale: '0.7', viewDist: 0.65, vegetation: 'off', terrain: 'low', bloom: false, grain: false, lights: 4, animLod: true, textures: 'full', lighting: 'simple', particles: true },
    medium: { renderScale: 'auto', viewDist: 0.85, vegetation: 'low', terrain: 'medium', bloom: true, grain: true, lights: 6, animLod: true, textures: 'full', lighting: 'full', particles: true },
    high: { renderScale: 'auto', viewDist: 1.0, vegetation: 'high', terrain: 'high', bloom: true, grain: true, lights: 8, animLod: true, textures: 'full', lighting: 'full', particles: true },
    ultra: { renderScale: '1', viewDist: 1.35, vegetation: 'high', terrain: 'high', bloom: true, grain: true, lights: 8, animLod: false, textures: 'full', lighting: 'full', particles: true },
  };
  S.v = Object.assign({ preset: 'medium', showFps: false, fov: 65, sens: 1, vMaster: 0.9, vMusic: 0.55, vSfx: 1.0 }, S.PRESETS.medium);
  // first run: phones/tablets start on Potato, Chromebooks on Low (both can be changed in Settings)
  let saved = null; try { saved = localStorage.getItem(KEY); } catch (e) { }
  if (!saved) {
    const crOS = /CrOS/.test(navigator.userAgent), phone = !crOS && matchMedia('(pointer: coarse)').matches;
    const p = phone ? 'phone' : crOS ? 'low' : null;
    if (p) { Object.assign(S.v, S.PRESETS[p]); S.v.preset = p; }
  }
  try { Object.assign(S.v, JSON.parse(saved || '{}')); } catch (e) { }
  // one-time move for phones that were saved on the old (much too blurry) Potato default
  if (matchMedia('(pointer: coarse)').matches && !/CrOS/.test(navigator.userAgent) && !S.v.phoneFix1) {
    if (!saved || S.v.preset === 'potato') { Object.assign(S.v, S.PRESETS.phone); S.v.preset = 'phone'; }
    S.v.phoneFix1 = true; try { localStorage.setItem(KEY, JSON.stringify(S.v)); } catch (e) { }
  }
  // the last load crashed: force the lightest settings (not saved, so Settings still shows the player's choice)
  if (HC.safeLevel) Object.assign(S.v, S.PRESETS.potato, { renderScale: '0.4', viewDist: 0.5 });
  S.save = () => { try { localStorage.setItem(KEY, JSON.stringify(S.v)); } catch (e) { } };
  // settings that only take effect when the world is (re)built
  S.RESTART = new Set(['vegetation', 'terrain', 'bloom', 'lights', 'textures', 'lighting']);
  S.VEG = { off: 0, low: 0.45, high: 1 };
  S.TERRAIN = { low: 200, medium: 280, high: 350 };

  const FIELDS = [
    ['preset', 'Quality preset', 'select', { phone: 'Phone / tablet', potato: 'Potato (fastest)', low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra', custom: 'Custom' }],
    ['renderScale', 'Render resolution', 'select', { auto: 'Automatic (holds the frame rate)', '0.4': '40%', '0.55': '55%', '0.7': '70%', '0.85': '85%', '1': '100%', '1.25': '125%' }],
    ['textures', 'Textures', 'select', { full: 'Full', flat: 'Off (flat colours)' }],
    ['lighting', 'Lighting', 'select', { full: 'Full (physically based)', simple: 'Simple (faster)' }],
    ['particles', 'Falling ash particles', 'check'],
    ['viewDist', 'View distance', 'range', [0.5, 1.5, 0.05]],
    ['vegetation', 'Grass & ferns', 'select', { off: 'Off', low: 'Sparse', high: 'Dense' }],
    ['terrain', 'Terrain detail', 'select', { low: 'Low', medium: 'Medium', high: 'High' }],
    ['lights', 'Dynamic lights', 'select', { 2: '2', 4: '4', 6: '6', 8: '8' }],
    ['bloom', 'Bloom glow', 'check'],
    ['grain', 'Film grain & vignette', 'check'],
    ['animLod', 'Reduce animation rate for distant enemies', 'check'],
    ['showFps', 'Show FPS', 'check'],
    ['fov', 'Field of view', 'range', [50, 90, 1]],
    ['sens', 'Mouse sensitivity', 'range', [0.3, 2.5, 0.1]],
    ['vMaster', 'Master volume', 'range', [0, 1, 0.05]],
    ['vMusic', 'Music volume', 'range', [0, 1, 0.05]],
    ['vSfx', 'Effects volume', 'range', [0, 1, 0.05]],
  ];
  S.open = function () {
    const box = document.getElementById('settingsBody');
    box.innerHTML = FIELDS.map(([k, label, type, o]) => {
      const note = S.RESTART.has(k) && HC.Game && HC.Game.started ? ' <span class="small">(next start)</span>' : '';
      if (type === 'select') return `<label class="set"><span>${label}${note}</span><select data-k="${k}">${Object.entries(o).map(([v, t]) => `<option value="${v}" ${String(S.v[k]) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
      if (type === 'range') return `<label class="set"><span>${label} <b data-out="${k}">${S.v[k]}</b></span><input type="range" data-k="${k}" min="${o[0]}" max="${o[1]}" step="${o[2]}" value="${S.v[k]}"></label>`;
      return `<label class="set"><span>${label}${note}</span><input type="checkbox" data-k="${k}" ${S.v[k] ? 'checked' : ''}></label>`;
    }).join('') + `<label class="set"><span>Sound check <span id="sndInfo" class="small"></span></span><button id="btnSndTest" type="button">Test sound</button></label>`;
    box.querySelector('#btnSndTest').onclick = async () => {
      const i = box.querySelector('#sndInfo'); i.textContent = ' testing...';
      try { i.textContent = ' ' + await HC.Audio.test(); } catch (e) { i.textContent = ' error: ' + e.message; }
    };
    box.querySelectorAll('[data-k]').forEach(el => el.oninput = el.onchange = () => {
      const k = el.dataset.k;
      let v = el.type === 'checkbox' ? el.checked : el.type === 'range' ? parseFloat(el.value) : el.value;
      if (k === 'lights') v = parseInt(v);
      if (k === 'preset') { if (S.PRESETS[v]) Object.assign(S.v, S.PRESETS[v]); S.v.preset = v; S.save(); S.open(); S.apply(); return; }
      S.v[k] = v;
      if (k in S.PRESETS.medium) S.v.preset = 'custom';
      const out = box.querySelector(`[data-out="${k}"]`); if (out) out.textContent = v;
      S.save(); S.apply();
      const ps = box.querySelector('[data-k="preset"]'); if (ps) ps.value = S.v.preset;
    });
    document.getElementById('settings').classList.remove('hidden');
  };
  S.close = () => document.getElementById('settings').classList.add('hidden');
  S.apply = () => { if (HC.Game && HC.Game.applySettings) HC.Game.applySettings(); if (HC.Audio) HC.Audio.setVolumes({ master: S.v.vMaster, music: S.v.vMusic, sfx: S.v.vSfx }); };
})();
