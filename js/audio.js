// THE HOLLOW CROWN - audio: studio-recorded CC0 / CC-BY samples (Still North Media, Little Robot Sound Factory,
// Michel Baradari, Matthew Pablo, Kenney, OpenGameArt; full credits in README) played spatially with
// random variants & pitch jitter, ambience/music beds that crossfade by zone, procedural fallbacks.
(function () {
  const A = HC.Audio = {};
  let ctx, master, comp, reverb, revSend, noiseBuf, sfxBus, musBus, ready = false;
  const buffers = {}, beds = {};
  const vol = { master: 0.9, music: 0.55, sfx: 1.0 };

  A.init = function () {
    if (ctx) return;
    // phones / Chromebooks / low-RAM devices: run audio at 22 kHz - decoded sound takes half the memory
    const AC = window.AudioContext || window.webkitAudioContext;
    // (not on iPhone/iPad: a non-native sample rate can leave Safari's audio silent)
    try { ctx = HC.lowMem && !HC.isWebKit ? new AC({ sampleRate: 22050 }) : new AC(); } catch (e) { ctx = new AC(); }
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master = ctx.createGain(); master.gain.value = vol.master;
    sfxBus = ctx.createGain(); sfxBus.gain.value = vol.sfx; musBus = ctx.createGain(); musBus.gain.value = vol.music;
    sfxBus.connect(master); musBus.connect(master); master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    reverb = ctx.createConvolver();
    const len = ctx.sampleRate * 3.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const ch = ir.getChannelData(c); for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    reverb.buffer = ir; revSend = ctx.createGain(); revSend.gain.value = 0.3; revSend.connect(reverb); reverb.connect(sfxBus);
    ready = true;
    decodeAll();
  };
  A.resume = () => { if (ctx && !A.paused && ctx.state !== 'running') ctx.resume(); };
  // pause menu / reading / dialogue in a solo journey: every sound, music and ambience stops exactly where it is
  A.paused = false;
  A.setPaused = function (p) {
    if (A.paused === !!p) return; A.paused = !!p;
    if (!ctx) return;
    if (p) ctx.suspend(); else ctx.resume();
  };

  // ---- iPhone / iPad: Safari keeps Web Audio silent until a tap resumes it, and the ring/silent switch mutes it
  // unless the page's audio session is "playback" (iOS 16.4+), or an <audio> element has played (older iOS).
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { }
  function silentWav() {
    const n = 2205, b = new DataView(new ArrayBuffer(44 + n * 2)), s = (o, t) => [...t].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
    s(0, 'RIFF'); b.setUint32(4, 36 + n * 2, true); s(8, 'WAVEfmt '); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
    b.setUint32(24, 22050, true); b.setUint32(28, 44100, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); s(36, 'data'); b.setUint32(40, n * 2, true);
    return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
  }
  let unlocked = false;
  function unlock() {
    if (ctx && !A.paused && ctx.state !== 'running') ctx.resume();
    if (unlocked) return; unlocked = true;
    try { const el = new Audio(silentWav()); el.setAttribute('playsinline', ''); const p = el.play(); if (p && p.catch) p.catch(() => { unlocked = false; }); } catch (e) { unlocked = false; }
  }
  ['touchend', 'pointerup', 'click', 'keydown'].forEach(t => addEventListener(t, unlock, { capture: true, passive: true }));
  // coming back to the tab (iOS suspends audio in the background)
  document.addEventListener('visibilitychange', () => { if (!document.hidden && ctx && !A.paused && ctx.state !== 'running') ctx.resume(); });
  // Settings -> "Test sound": a plain beep (proves the audio output works) then a sword swing (proves the
  // sound files decode), with a status line the player can report back.
  A.test = function () {
    if (!ctx) A.init();
    unlock(); A.resume();
    const t = ctx.currentTime + 0.05, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 660; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.4);
    setTimeout(() => A.play('swing', null, 1, { rev: 0 }), 600);
    return new Promise(res => setTimeout(() => {
      const s = A.stats();
      res(`audio: ${ctx.state} @ ${ctx.sampleRate} Hz · sounds decoded: ${s.decoded} (failed ${decodeFails}) · ${HC.isWebKit ? 'Safari/iOS' : 'other browser'}${navigator.audioSession ? ' · session ' + navigator.audioSession.type : ''}`);
    }, 900));
  };
  A.stats = () => ({ state: ctx && ctx.state, events: Object.keys(buffers).length, decoded: Object.values(buffers).reduce((s, l) => s + l.length, 0), beds: Object.keys(beds) });
  A.setVolumes = function (v) {
    Object.assign(vol, v);
    if (!ready) return;
    const t = ctx.currentTime;
    master.gain.setTargetAtTime(vol.master, t, 0.1); musBus.gain.setTargetAtTime(vol.music, t, 0.1); sfxBus.gain.setTargetAtTime(vol.sfx, t, 0.1);
  };
  A.master = v => { if (ready) master.gain.setTargetAtTime(v * vol.master, ctx.currentTime, 0.8); };

  // Short effects are decoded up front, a few at a time. Ambience/music beds (minutes long - hundreds of MB once
  // decoded) are only decoded while they are actually wanted, and released again after they fade out.
  const isBed = ev => /^(amb|mus)_/.test(ev);
  const toBytes = uri => { const bin = atob(uri.slice(uri.indexOf(',') + 1)), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); return arr.buffer; };
  let decodeFails = 0;
  const decode = uri => new Promise(res => {
    let done = false; const ok = b => { if (!done) { done = true; res(b); } }, bad = () => { if (!done) { done = true; decodeFails++; res(null); } };
    try { const p = ctx.decodeAudioData(toBytes(uri), ok, bad); if (p && p.catch) p.catch(bad); } catch (e) { bad(); }
  });
  async function decodeAll() {
    const lib = window.HC_SFX || {};
    for (const [ev, list] of Object.entries(lib)) {
      if (isBed(ev)) continue;
      buffers[ev] = [];
      for (const uri of list) { const b = await decode(uri); if (b) buffers[ev].push(b); }
    }
  }
  const bedLoading = {};
  function loadBed(ev) {
    if (buffers[ev] || bedLoading[ev]) return;
    const uri = ((window.HC_SFX || {})[ev] || [])[0]; if (!uri) return;
    bedLoading[ev] = true;
    decode(uri).then(b => { delete bedLoading[ev]; if (b) { buffers[ev] = [b]; refreshBeds(); } });
  }

  A.setListener = function (p, f) {
    if (!ready) return;
    const L = ctx.listener, t = ctx.currentTime;
    if (L.positionX) {
      L.positionX.setValueAtTime(p.x, t); L.positionY.setValueAtTime(p.y, t); L.positionZ.setValueAtTime(p.z, t);
      L.forwardX.setValueAtTime(f.x, t); L.forwardY.setValueAtTime(f.y, t); L.forwardZ.setValueAtTime(f.z, t);
      L.upX.setValueAtTime(0, t); L.upY.setValueAtTime(1, t); L.upZ.setValueAtTime(0, t);
    } else { L.setPosition(p.x, p.y, p.z); L.setOrientation(f.x, f.y, f.z, 0, 1, 0); }
  };
  A.setReverb = v => { if (ready) revSend.gain.setTargetAtTime(v, ctx.currentTime, 0.5); };

  function out(pos, v = 1, rev = 1) {
    const g = ctx.createGain(); g.gain.value = v;
    if (pos) {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 4; p.rolloffFactor = 1.1; p.maxDistance = 300;
      if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
      g.connect(p); p.connect(sfxBus);
      if (rev) { const s = ctx.createGain(); s.gain.value = rev; p.connect(s); s.connect(revSend); }
    } else {
      g.connect(sfxBus);
      if (rev) { const s = ctx.createGain(); s.gain.value = rev * 0.5; g.connect(s); s.connect(revSend); }
    }
    return g;
  }
  // the loudest 10 ms of a buffer (seconds from its start), measured once
  function peakOf(b) {
    if (b._pk !== undefined) return b._pk;
    const d = b.getChannelData(0), w = Math.max(1, Math.round(b.sampleRate * 0.01)), n = Math.min(d.length, b.sampleRate * 1.5);
    let best = 0, at = 0;
    for (let i = 0; i < n; i += w) { let e = 0; for (let j = i; j < Math.min(n, i + w); j++) e += d[j] * d[j]; if (e > best) { best = e; at = i; } }
    return (b._pk = at / b.sampleRate);
  }
  // align: the sample's peak plays exactly A.LEAD seconds after t (whichever variant is picked), so a swing's
  // "whoosh" lands on the animation's impact frame instead of drifting early or late
  A.LEAD = 0.06;
  function sample(ev, dest, t, rate = 1, gain = 1, align = false) {
    const list = buffers[ev]; if (!list || !list.length) return false;
    const s = ctx.createBufferSource(); s.buffer = list[Math.floor(Math.random() * list.length)];
    const r = s.playbackRate.value = rate * (0.92 + Math.random() * 0.16);
    const g = ctx.createGain(); g.gain.value = gain; s.connect(g); g.connect(dest);
    if (!align) { s.start(t); return true; }
    const lead = align === true ? A.LEAD : align;
    let off = peakOf(s.buffer) - lead * r, st = t;
    if (off < 0) { st = t - off / r; off = 0; }
    st = Math.max(ctx.currentTime, st);
    if (off > 0) { g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(gain, st + 0.012); }   // no click when skipping in
    s.start(st, off);
    return true;
  }

  // ---- procedural fallbacks / layers
  function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
  function noise(dest, t, dur, type, f0, f1, q = 1, peak = 0.5, a = 0.005) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); env(g, t, a, peak, dur); s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 1.5); s.stop(t + dur + a + 0.05);
  }
  function tone(dest, t, dur, type, f0, f1, peak = 0.3, a = 0.005) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); env(g, t, a, peak, dur); o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + a + 0.05); return o;
  }
  const PROC = {
    bell(d, t) { const f0 = 146; [[0.5, 1, 9], [1, 0.8, 7], [1.19, 0.5, 5], [1.5, 0.45, 4.5], [2, 0.4, 4], [2.51, 0.25, 3], [2.66, 0.25, 3], [3.01, 0.15, 2.5], [4.1, 0.1, 2]].forEach(([r, a, dur]) => tone(d, t, dur, 'sine', f0 * r, 0, a * 0.35, 0.003)); },
    ping(d, t) { tone(d, t, 0.7, 'sine', 1320, 0, 0.25); tone(d, t + 0.09, 0.8, 'sine', 1760, 0, 0.18); },
    shrine(d, t) { [220, 277, 330, 440].forEach((f, i) => tone(d, t + i * 0.05, 3.5, 'triangle', f, 0, 0.07, 0.6)); },
    death(d, t) { tone(d, t, 4, 'sawtooth', 110, 30, 0.18, 0.5); noise(d, t, 3, 'lowpass', 500, 60, 1, 0.3, 0.3); },
    rumble(d, t) { noise(d, t, 2.2, 'lowpass', 220, 80, 1, 0.6, 0.2); },
    sub(d, t) { tone(d, t, 1.0, 'sine', 70, 28, 0.7); },
    splash(d, t) { noise(d, t + 0.02, 0.15, 'highpass', 2500, 0, 0.5, 0.08); },
    // body of air moved by a blade / body: band-passed noise sweeping down, attack ramped so it "rushes" in
    whoosh(d, t, dur = 0.28, f0 = 1800, f1 = 420, peak = 0.35) { noise(d, t, dur, 'bandpass', f0, f1, 1.4, peak, dur * 0.35); },
    thud(d, t, peak = 0.5) { tone(d, t, 0.22, 'sine', 95, 38, peak, 0.004); noise(d, t, 0.12, 'lowpass', 600, 120, 0.8, peak * 0.5, 0.003); },
  };
  // game event -> recorded sample (+ optional procedural layer)
  const MAP = {
    step: o => o.surface === 'grass' ? 'step_grass' : o.surface === 'stone' ? 'step_stone' : 'step',
    swing: 'swing', heavySwing: 'swing_heavy', hit: 'hit', hit_heavy: 'hit_heavy', hit_armor: 'hit_armor', clang: 'clang', hurt: 'hurt', roll: 'roll',
    screech: 'screech', growl: 'growl', snarl: 'snarl', gurgle: 'gurgle', edeath: 'edeath', moan: 'moan', whisper: 'whisper',
    roar: 'roar', boss_idle: 'boss_idle', boom: 'boom', door: 'door', gate: 'gate', creak: 'creak', crow: 'creak', pickup: 'pickup',
    page: 'page', flask: 'flask', knock: 'knock', fire: 'fire', drip: 'drip', stone: 'hit_stone',
  };
  // newer recorded events play their own sample of the same name
  ['bow_draw', 'bow_shoot', 'bow_nock', 'xbow_shoot', 'xbow_reload', 'arrow_fly', 'arrow_hit', 'arrow_thunk', 'draw_blade', 'draw_dagger', 'sheath',
    'swing_dagger', 'swing_spear', 'swing_axe', 'parry', 'hit_plate', 'chop', 'spell', 'glass', 'inv_open', 'coins', 'jingle_rare', 'jingle_win', 'jingle_lose',
    'ui_click', 'equip_cloth', 'equip_metal', 'drop_item', 'laugh', 'goblin'].forEach(n => { MAP[n] = n; });
  const RATE = { crow: 1.4, stone: 0.7 };
  const IMPACT = new Set(['hit', 'hit_heavy', 'hit_armor', 'hit_plate', 'chop', 'clang', 'arrow_hit', 'arrow_thunk', 'stone', 'parry']);
  const LAYER = { bell: ['bell'], ping: ['ping'], shrine: ['shrine'], death: ['death'], gate: ['rumble'], boom: ['sub'], roar: ['sub'] };

  A.play = function (name, pos, v = 1, opts = {}) {
    if (!ready) return;
    const d = out(pos, v, opts.rev === undefined ? 1 : opts.rev), t = ctx.currentTime + (opts.delay || 0);
    let ev = MAP[name]; if (typeof ev === 'function') ev = ev(opts);
    // impacts land the instant the blow connects (some recordings have a lead-in before the crack)
    if (ev) sample(ev, d, t, (RATE[name] || 1) * (opts.rate || 1), 1, IMPACT.has(name) ? 0.012 : false);
    if (name === 'step' && opts.armor) sample('step_armor', d, t, opts.rate || 1, 0.55);
    if (name === 'roll') sample('step', d, t + 0.18, 0.75, 0.9);
    // ---- player actions: several layers so they read clearly over combat
    if (name === 'attack') {          // light combo hit; opts.combo 0..2 gets a little bigger each step
      // every layer peaks at t + LEAD: the moment the blade passes through (the caller times t from the clip)
      const c = opts.combo || 0, wd = 0.22 + c * 0.05;
      sample(opts.swing || 'swing', d, t, 1.05 - c * 0.06, 1.45 + c * 0.15, true);
      sample('equip_cloth', d, Math.max(ctx.currentTime, t - 0.08), 1.25, 0.35);   // the body moving into the cut
      PROC.whoosh(d, Math.max(ctx.currentTime, t + A.LEAD - wd * 0.35), wd, 2200, 520, 0.22 + c * 0.06);
      if (opts.armor) sample('step_armor', d, Math.max(ctx.currentTime, t - 0.12), 1.1, 0.35);
    }
    if (name === 'heavyAttack') {     // wind-up rattle, then a deep slow cut
      if (opts.armor !== false) sample('step_armor', d, Math.max(ctx.currentTime, t - 0.22), 0.9, 0.45);
      sample(opts.swing || 'swing_heavy', d, t, 0.92, 1.6, true);
      sample('equip_cloth', d, Math.max(ctx.currentTime, t - 0.12), 0.95, 0.45);
      PROC.whoosh(d, Math.max(ctx.currentTime, t + A.LEAD - 0.42 * 0.35), 0.42, 1100, 160, 0.42);
    }
    if (name === 'windup') {          // drawing back for a charged heavy: cloth, gear, a slow rising rush of air
      sample('equip_cloth', d, t, 0.85, 0.7);
      if (opts.armor) sample('step_armor', d, t + 0.05, 0.85, 0.5);
      PROC.whoosh(d, t + 0.05, 0.55, 260, 900, 0.14);
    }
    if (name === 'dodge') {           // cloth + air, body hits the ground, light landing step
      sample('roll', d, t, 1, 1.0);
      PROC.whoosh(d, t, 0.25, 900, 300, 0.2);
      PROC.thud(d, t + 0.2, 0.45); sample('step', d, t + 0.2, 0.7, 1.0);
      sample('step', d, t + 0.5, 0.95, 0.7);
      if (opts.armor) sample('step_armor', d, t + 0.2, 0.85, 0.5);
    }
    if (name === 'shot') {            // bow twang / crossbow clack / staff fire-cast
      if (opts.kind === 'staff') { sample('spell', d, t, opts.heavy ? 0.8 : 1.1, 0.9); sample('fire', d, t, 1.3, opts.heavy ? 0.9 : 0.5); PROC.whoosh(d, t, opts.heavy ? 0.5 : 0.3, 700, 2400, opts.heavy ? 0.4 : 0.28); }
      else if (opts.kind === 'crossbow') { sample('xbow_shoot', d, t, 1, 1.0); PROC.thud(d, t, 0.3); }
      else if (opts.kind === 'javelin') { sample('swing_spear', d, t, 0.85, 1.1, true); PROC.whoosh(d, Math.max(ctx.currentTime, t + A.LEAD - 0.16), 0.45, 1400, 300, 0.4); }
      else if (opts.kind === 'knives') { sample('swing_dagger', d, t, 1.35, 0.9, true); PROC.whoosh(d, Math.max(ctx.currentTime, t + A.LEAD - 0.07), 0.2, 3000, 900, 0.25); }
      else if (opts.kind === 'wand') { sample('spell', d, t, 1.7, 0.7); sample('glass', d, t + 0.02, 2.2, 0.18); }
      else if (opts.kind === 'tome') { sample('spell', d, t, opts.heavy ? 0.55 : 0.75, 1.0); sample('whisper', d, t, 1.2, 0.35); }
      else {
        const cb = opts.kind === 'crossbow';
        PROC.whoosh(d, t + 0.01, 0.26, 3200, 1200, cb ? 0.3 : 0.24);
        PROC.thud(d, t, cb ? 0.4 : 0.22);
        sample(cb ? 'clang' : 'swing', d, t, cb ? 1.8 : 1.5, cb ? 0.25 : 0.55);
      }
    }
    if (name === 'screech' && Math.random() < 0.4) sample('goblin', d, t, 0.8, 0.7);   // more variety for the hollow
    if (name === 'bell') sample('bellhit', d, t, 0.5, 0.6);
    (LAYER[name] || []).forEach(l => PROC[l](d, t));
    if (name === 'step' && opts.wet) PROC.splash(d, t);
  };

  // ---- ambience & music beds
  const BED_SET = {
    village: { amb_wind: 0.32, amb_dread: 0.15, mus_explore: 0.5 },
    forest: { amb_forest: 0.45, amb_wind: 0.18, mus_explore: 0.4 },
    dungeon: { amb_dungeon: 0.55, mus_under: 0.55 },
    arena: { amb_hell: 0.4, amb_dread: 0.15 },
    silent: {},
  };
  let bedZone = 'silent', bossOn = false;
  function bed(ev) {
    if (beds[ev]) return beds[ev];
    const list = buffers[ev]; if (!list || !list.length) { loadBed(ev); return null; }
    const s = ctx.createBufferSource(); s.buffer = list[0]; s.loop = true;
    const g = ctx.createGain(); g.gain.value = 0;
    s.connect(g); g.connect(/^mus_/.test(ev) ? musBus : sfxBus); s.start(0, Math.random() * Math.max(0, list[0].duration - 1));
    return (beds[ev] = { s, g });
  }
  function refreshBeds() {
    if (!ready) return;
    const want = Object.assign({}, BED_SET[bedZone] || {});
    if (bossOn) { Object.keys(want).forEach(k => { if (/^mus_/.test(k)) want[k] = 0; }); want.mus_boss = 0.8; }
    const all = new Set([...Object.keys(beds), ...Object.keys(want)]);
    all.forEach(ev => {
      const b = (want[ev] ? bed(ev) : beds[ev]); if (!b) return;
      b.g.gain.setTargetAtTime(want[ev] || 0, ctx.currentTime, 2.0);
      clearTimeout(b.drop);
      // once a bed has faded out, stop it and free its decoded audio (it is decoded again if it comes back)
      if (!want[ev]) b.drop = setTimeout(() => { try { b.s.stop(); } catch (e) { } b.s.disconnect(); delete beds[ev]; delete buffers[ev]; }, 12000);
    });
  }
  A.setAmbience = function (zone) {
    if (!ready || bedZone === zone) return;
    bedZone = zone;
    A.setReverb({ village: 0.25, forest: 0.3, dungeon: 0.7, arena: 0.8 }[zone] || 0.3);
    refreshBeds();
  };
  A.bossMusic = function (on) { if (!ready) return; bossOn = !!on; refreshBeds(); };

  // occasional ambient details
  let detailT = 3;
  A.update = function (dt, lp) {
    if (!ready) return;
    detailT -= dt;
    if (detailT > 0) return;
    detailT = 5 + Math.random() * 10;
    const a = Math.random() * Math.PI * 2, r = 12 + Math.random() * 25;
    const p = { x: lp.x + Math.cos(a) * r, y: lp.y + 2, z: lp.z + Math.sin(a) * r };
    if (bedZone === 'dungeon') A.play(Math.random() < 0.7 ? 'drip' : 'creak', p, 0.6);
    else if (bedZone === 'forest') A.play(Math.random() < 0.6 ? 'creak' : 'whisper', p, 0.35);
    else if (bedZone === 'village' && Math.random() < 0.5) A.play('creak', p, 0.4);
  };
})();
