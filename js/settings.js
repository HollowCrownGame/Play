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
    // the lightest possible: tiny resolution, no lights, no textures, 30 fps cap, close view, enemies animate only up close
    toaster: { renderScale: '0.33', viewDist: 0.3, vegetation: 'off', terrain: 'potato', bloom: false, grain: false, lights: 0, animLod: true, textures: 'flat', lighting: 'simple', particles: false, fpsCap: 30, crowd: 'near' },
    phone: { renderScale: 'auto', viewDist: 0.6, vegetation: 'off', terrain: 'low', bloom: false, grain: false, lights: 2, animLod: true, textures: 'full', lighting: 'simple', particles: false, fpsCap: 0, crowd: 'normal' },
    potato: { renderScale: '0.5', viewDist: 0.45, vegetation: 'off', terrain: 'potato', bloom: false, grain: false, lights: 1, animLod: true, textures: 'flat', lighting: 'simple', particles: false, fpsCap: 30, crowd: 'near' },
    low: { renderScale: '0.7', viewDist: 0.65, vegetation: 'off', terrain: 'low', bloom: false, grain: false, lights: 3, animLod: true, textures: 'full', lighting: 'simple', particles: true, fpsCap: 0, crowd: 'normal' },
    medium: { renderScale: 'auto', viewDist: 0.85, vegetation: 'low', terrain: 'medium', bloom: true, grain: true, lights: 6, animLod: true, textures: 'full', lighting: 'full', particles: true, fpsCap: 0, crowd: 'normal' },
    high: { renderScale: 'auto', viewDist: 1.0, vegetation: 'high', terrain: 'high', bloom: true, grain: true, lights: 8, animLod: true, textures: 'full', lighting: 'full', particles: true, fpsCap: 0, crowd: 'far' },
    ultra: { renderScale: '1', viewDist: 1.35, vegetation: 'high', terrain: 'high', bloom: true, grain: true, lights: 8, animLod: false, textures: 'full', lighting: 'full', particles: true, fpsCap: 0, crowd: 'far' },
  };
  S.v = Object.assign({ preset: 'medium', showFps: false, fov: 65, sens: 1, vMaster: 0.9, vMusic: 0.55, vSfx: 1.0, look: 'cycle', brightness: 1, dayLen: 16, autoTune: true }, S.PRESETS.medium);

  // ---- what is this device? The graphics chip (from WebGL), CPU cores, memory and screen size decide the preset.
  HC.detectDevice = function () {
    const ua = navigator.userAgent, cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || (/(iPhone|iPad)/.test(ua) ? 4 : 8);
    const touch = matchMedia('(pointer: coarse)').matches, crOS = /CrOS/.test(ua), dpr = window.devicePixelRatio || 1;
    const px = screen.width * screen.height * dpr * dpr;
    let gpu = '';
    try {
      const c = document.createElement('canvas'), gl = c.getContext('webgl2') || c.getContext('webgl');
      if (gl) { const ext = gl.getExtension('WEBGL_debug_renderer_info'); gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || ''); const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); }
      else gpu = 'none';
    } catch (e) { }
    const g = gpu.toLowerCase();
    // graphics tier: 0 = software / no GPU ... 5 = big desktop card
    let tier = 2;
    if (!gpu || g === 'none' || /swiftshader|llvmpipe|softpipe|basic render|microsoft basic|software/.test(g)) tier = 0;
    else if (/mali-[4t]|mali-g(31|51|52|57)|adreno \(tm\) [2-5]\d\d|adreno [2-5]\d\d|powervr|intel.*hd graphics( [2-5]\d\d\d|$| \(| family)|intel.*(uhd graphics 6(00|05)|hd graphics 500|hd graphics 400)|gma/.test(g)) tier = 1;
    else if (/intel.*(uhd|hd) graphics|mali-g(6|7)\d|adreno.*6\d\d|apple a1[0-3]|vivante|tegra|geforce gt \d|geforce \d{3}m?\b|mx ?1[1-5]0|radeon r[5-7] |radeon hd [5-8]\d\d\d/.test(g)) tier = 2;   // + budget GeForce GT / MX and older Radeons
    else if (/iris|radeon\(tm\) graphics|radeon graphics|vega \d|adreno.*7\d\d|apple (a1[4-9]|m1|m2)|apple gpu|gtx (9|10)\d\d|mx\d\d\d|rx (4|5)\d\d/.test(g)) tier = 3;
    else if (/gtx 16|rtx (20|30)\d\d|rx (5|6)\d\d\d|apple m[1-4] (pro|max)|arc a/.test(g)) tier = 4;
    else if (/rtx (40|50)\d\d|rx (7|9)\d\d\d|rtx a\d\d\d\d/.test(g)) tier = 5;
    else if (/nvidia|geforce|radeon|amd/.test(g)) tier = 3;
    // weak CPUs and little memory pull it down; huge screens cost more pixels
    if (cores <= 2 || mem <= 2) tier = Math.min(tier, 1);
    else if (cores <= 4 && mem <= 4) tier = Math.min(tier, 2);
    if (px > 8e6 && tier < 4) tier = Math.max(0, tier - 1);
    if (crOS) tier = Math.min(tier, 2);
    const preset = tier <= 0 ? 'toaster' : tier === 1 ? 'potato' : tier === 2 ? (touch && !crOS ? 'phone' : 'low') : tier === 3 ? (touch ? 'phone' : 'medium') : tier === 4 ? 'high' : 'ultra';
    return { preset, tier, gpu: gpu || 'unknown graphics', cores, mem, touch, px };
  };
  S.autoDetect = function (apply = true) {
    const d = HC.detectDevice();
    if (apply) { Object.assign(S.v, S.PRESETS[d.preset]); S.v.preset = d.preset; S.v.detected = d.preset; S.save(); }
    return d;
  };
  // first run: pick the preset from the hardware (it can still be changed in Settings, and auto-tune adjusts in play)
  let saved = null; try { saved = localStorage.getItem(KEY); } catch (e) { }
  if (!saved) { try { const d = HC.detectDevice(); Object.assign(S.v, S.PRESETS[d.preset]); S.v.preset = d.preset; S.v.detected = d.preset; } catch (e) { } }
  try { Object.assign(S.v, JSON.parse(saved || '{}')); } catch (e) { }
  // one-time move for phones that were saved on the old (much too blurry) Potato default
  if (matchMedia('(pointer: coarse)').matches && !/CrOS/.test(navigator.userAgent) && !S.v.phoneFix1) {
    if (saved && S.v.preset === 'potato' && !S.v.detected) { Object.assign(S.v, S.PRESETS.phone); S.v.preset = 'phone'; }
    S.v.phoneFix1 = true; try { localStorage.setItem(KEY, JSON.stringify(S.v)); } catch (e) { }
  }
  // the last load crashed: force the lightest settings (not saved, so Settings still shows the player's choice)
  if (HC.safeLevel) Object.assign(S.v, S.PRESETS.potato, { renderScale: '0.4', viewDist: 0.5 });
  S.save = () => { try { localStorage.setItem(KEY, JSON.stringify(S.v)); } catch (e) { } };
  // settings that only take effect when the world is (re)built
  S.RESTART = new Set(['vegetation', 'terrain', 'bloom', 'lights', 'textures', 'lighting']);
  S.VEG = { off: 0, low: 0.45, high: 1 };
  S.TERRAIN = { potato: 110, low: 200, medium: 280, high: 350 };
  S.CROWD = { near: 0.55, normal: 1, far: 1.4 };   // how far away enemies are drawn, animated and thinking

  const FIELDS = [
    // how the world looks: follow the day/night cycle, or keep one time of day for yourself (co-op still shares the real time and the blood moon)
    ['pvp', 'PvP: players can hurt each other (in worlds you host or open publicly)', 'check'],
    ['look', 'World look', 'select', { cycle: 'Day / night cycle', day: 'Always daytime (grey daylight)', dusk: 'Always dusk', night: 'Always night (the eclipse)' }],
    ['brightness', 'Brightness', 'range', [0.6, 1.8, 0.05]],
    ['dayLen', 'Length of a full day (minutes, solo / host)', 'range', [4, 60, 1]],
    ['preset', 'Quality preset', 'select', { toaster: 'Toaster (lowest possible)', potato: 'Potato', phone: 'Phone / tablet', low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra', custom: 'Custom' }],
    ['autoTune', 'Auto-optimize while playing (lowers settings itself if the game stutters)', 'check'],
    ['fpsCap', 'Frame rate limit (saves battery and heat)', 'select', { 0: 'No limit', 60: '60 fps', 45: '45 fps', 30: '30 fps', 24: '24 fps' }],
    ['renderScale', 'Render resolution', 'select', { auto: 'Automatic (holds the frame rate)', '0.25': '25%', '0.33': '33%', '0.4': '40%', '0.5': '50%', '0.55': '55%', '0.7': '70%', '0.85': '85%', '1': '100%', '1.25': '125%' }],
    ['crowd', 'Enemy detail (how far enemies are drawn and animated)', 'select', { near: 'Near only (fastest)', normal: 'Normal', far: 'Far' }],
    ['textures', 'Textures', 'select', { full: 'Full', flat: 'Off (flat colours)' }],
    ['lighting', 'Lighting', 'select', { full: 'Full (physically based)', simple: 'Simple (faster)' }],
    ['particles', 'Falling ash particles', 'check'],
    ['viewDist', 'View distance', 'range', [0.25, 1.5, 0.05]],
    ['vegetation', 'Grass & ferns', 'select', { off: 'Off', low: 'Sparse', high: 'Dense' }],
    ['terrain', 'Terrain detail', 'select', { potato: 'Lowest', low: 'Low', medium: 'Medium', high: 'High' }],
    ['lights', 'Dynamic lights', 'select', { 0: 'None', 1: '1', 2: '2', 3: '3', 4: '4', 6: '6', 8: '8' }],
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
    // "detect my device": shows what was found and picks the matching preset
    const d0 = HC.detectDevice();
    box.insertAdjacentHTML('afterbegin', `<div class="set detect"><span>This device: <b>${d0.gpu.replace(/[<>&]/g, '')}</b><br><span class="small">${d0.cores} CPU cores · ${d0.mem} GB memory${d0.px ? ` · ${Math.round(d0.px / 1e6 * 10) / 10} MP screen` : ''}${d0.touch ? ' · touch' : ''} → suggested: <b>${d0.preset}</b></span></span><button id="btnDetect" type="button">Use suggested settings</button></div>`);
    box.querySelector('#btnDetect').onclick = () => { S.autoDetect(true); S.open(); S.apply(); };
    box.querySelector('#btnSndTest').onclick = async () => {
      const i = box.querySelector('#sndInfo'); i.textContent = ' testing...';
      try { i.textContent = ' ' + await HC.Audio.test(); } catch (e) { i.textContent = ' error: ' + e.message; }
    };
    box.querySelectorAll('[data-k]').forEach(el => el.oninput = el.onchange = () => {
      const k = el.dataset.k;
      let v = el.type === 'checkbox' ? el.checked : el.type === 'range' ? parseFloat(el.value) : el.value;
      if (k === 'lights' || k === 'fpsCap') v = parseInt(v);
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
