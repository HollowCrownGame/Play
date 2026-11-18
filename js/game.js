// THE HOLLOW CROWN - main game: boot, input, player controller, camera, story, bosses, horror,
// progression (ashes & levels), fast travel, map & compass, co-op glue, UI.
(function () {
  const V3 = THREE.Vector3;
  const W = HC.World, A = HC.Audio, Net = HC.Net, S = HC.ESTATE;
  const $ = id => document.getElementById(id);
  const G = HC.Game = { players: new Map(), enemies: new Map(), flags: {}, started: false, t: 0, bosses: {} };
  const opt = { cls: 'sword', name: 'Traveler', sens: 1, bloom: true };
  let renderer, scene, camera, composer, finalPass, hemi, moon, lightPool = [];
  let me = null;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const vec = a => new V3(a[0], a[1], a[2]);

  // ================================================================ boot
  function loadModels(cb) {
    // three r128's GLTFLoader decodes textures with createImageBitmap everywhere except Firefox; Safari's
    // implementation is buggy (blank / white textures - later three versions skip it on Safari too).
    // Hiding it makes the loader fall back to plain <img> decoding.
    if (HC.isWebKit && window.createImageBitmap) { try { window.createImageBitmap = undefined; } catch (e) { } }
    const loader = new THREE.GLTFLoader(), names = Object.keys(window.HC_MODELS || {});
    if (THREE.DRACOLoader) {
      const draco = new THREE.DRACOLoader();
      draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/gltf/');
      if (HC.lowMem) draco.setWorkerLimit(1);   // each decoder worker holds its own WebAssembly heap
      loader.setDRACOLoader(draco);
    }
    HC.assets = {}; let n = 0;
    const step = () => { $('loadPct').textContent = Math.round(n / names.length * 100) + '%'; };
    // one model at a time, dropping each base64 copy once parsed - parsing all 69 at once spiked memory
    // past what phones allow a tab (the page reloaded part-way through loading)
    const next = () => {
      if (n >= names.length) { cb(); return; }
      const name = names[n];
      HC.crumb(`model ${n + 1}/${names.length} (${name})`);
      let buf = null;
      try {
        const bin = atob(HC_MODELS[name]); buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      } catch (e) { console.error('model', name, e); }
      delete HC_MODELS[name];
      const done = () => { n++; step(); setTimeout(next, 0); };
      if (!buf) { done(); return; }
      loader.parse(buf.buffer, '', g => {
        if (HC.lowMem) shrinkTextures(g.scene, [512, 256, 128][HC.safeLevel] || 128);
        HC.assets[name] = g.scene;
        if (name === 'anims') { HC.CLIPS = {}; g.animations.forEach(c => { HC.CLIPS[c.name] = c; }); }
        done();
      }, e => { console.error('model', name, e); done(); });
    };
    next();
  }
  // phones: redraw every model texture at <= max px on a small canvas so the full-size decoded image can be freed
  // (a 1024 px texture holds ~4 MB decoded; 69 models carry well over a hundred of them)
  const shrunk = new WeakMap();   // weak, so the original full-size images can still be garbage-collected
  function shrinkTextures(root, max) {
    root.traverse(o => {
      if (!o.isMesh) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
        ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'].forEach(k => {
          const t = m[k], img = t && t.image;
          if (!img || !img.width || (img.width <= max && img.height <= max)) return;
          if (shrunk.has(img)) { t.image = shrunk.get(img); t.needsUpdate = true; return; }
          const s = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
          try { c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); } catch (e) { return; }
          shrunk.set(img, c); t.image = c; t.needsUpdate = true;
          if (img.src && img.src.startsWith('blob:')) { try { URL.revokeObjectURL(img.src); } catch (e) { } }
        });
      });
    });
  }
  function initRenderer() {
    renderer = new THREE.WebGLRenderer({ antialias: !HC.lowMem, powerPreference: HC.lowMem ? 'default' : 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, HC.lowMem ? 1 : 1.5));
    renderer.setSize(innerWidth, innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
    $('game').appendChild(renderer.domElement);
    scene = HC.scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x15171c, 0.02); scene.background = new THREE.Color(0x15171c);
    camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 1500);
    hemi = new THREE.HemisphereLight(0x59617a, 0x1a1612, 0.5); scene.add(hemi);
    moon = new THREE.DirectionalLight(0x9aa4c0, 0.45); moon.position.set(30, 60, -80); scene.add(moon);
    scene.add(new THREE.AmbientLight(0x202024, 0.25));
    for (let i = 0; i < (SV().lights || 6); i++) { const l = new THREE.PointLight(0xffa050, 0, 10, 2); scene.add(l); lightPool.push(l); }
    camera.fov = SV().fov;
    DR.scale = SV().renderScale === 'auto' ? Math.min(window.devicePixelRatio, HC.phoneScreen ? 1.5 : 1.0) : parseFloat(SV().renderScale);
    renderer.setPixelRatio(DR.scale);
    if (opt.bloom && THREE.EffectComposer && THREE.UnrealBloomPass) {
      const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: renderer.capabilities.isWebGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType });
      composer = new THREE.EffectComposer(renderer, rt);
      composer.addPass(new THREE.RenderPass(scene, camera));
      composer.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.75, 0.55, 0.85));
      finalPass = new THREE.ShaderPass({
        uniforms: { tDiffuse: { value: null }, time: { value: 0 }, dmg: { value: 0 }, exposure: { value: 1.15 }, desat: { value: 0.22 }, grain: { value: SV().grain ? 1 : 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `uniform sampler2D tDiffuse; uniform float time, dmg, exposure, desat, grain; varying vec2 vUv;
          vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0); }
          float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + time) * 43758.5453); }
          void main(){
            vec3 c = aces(texture2D(tDiffuse, vUv).rgb * exposure);
            float l = dot(c, vec3(0.299,0.587,0.114)); c = mix(c, vec3(l) * vec3(1.02,1.0,0.96), desat);
            c = pow(c, vec3(1.0/2.2));
            vec2 d = vUv - 0.5; float v = smoothstep(0.85, 0.25, length(d * vec2(1.1, 1.0)));
            c *= mix(mix(0.75, 0.35, grain), 1.0, v); c = mix(c, vec3(0.45,0.0,0.0), dmg * (1.0 - v) * 0.9);
            c += (rnd(vUv * 731.0) - 0.5) * 0.045 * grain;
            gl_FragColor = vec4(c, 1.0);
          }`,
      });
      composer.addPass(finalPass);
      renderer.toneMapping = THREE.NoToneMapping; renderer.outputEncoding = THREE.LinearEncoding;
    }
    addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); if (composer) composer.setSize(innerWidth, innerHeight); });
  }

  // ================================================================ title / lobby
  const show = (id, on = true) => $(id).classList.toggle('hidden', !on);
  document.querySelectorAll('.cls').forEach(b => b.onclick = () => { document.querySelectorAll('.cls').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); opt.cls = b.dataset.cls; });
  const SV = () => HC.Settings.v;
  function readOpts() {
    opt.name = ($('inName').value.trim() || 'Traveler').slice(0, 14); opt.bloom = SV().bloom; opt.sens = SV().sens;
    try { localStorage.setItem('hc_name', opt.name); } catch (e) { }
    if (HC.safeLevel < 2) { A.init(); A.resume(); }
    HC.Settings.apply();
  }
  $('btnSettings').onclick = () => HC.Settings.open();
  $('btnSettings2').onclick = () => { show('pause', false); HC.Settings.open(); };
  $('btnSettingsClose').onclick = () => { HC.Settings.close(); if (G.started && !G.ended) lock(); };
  // live-applicable settings
  G.applySettings = function () {
    const v = SV();
    opt.sens = v.sens;
    if (camera) { camera.fov = v.fov; camera.updateProjectionMatrix(); }
    if (finalPass) finalPass.uniforms.grain.value = v.grain ? 1 : 0;
    W.viewMul = v.viewDist;
    if (W.ash) W.ash.visible = v.particles !== false;
    show('fps', !!v.showFps && G.started);
    if (renderer && v.renderScale !== 'auto') { DR.scale = parseFloat(v.renderScale); renderer.setPixelRatio(DR.scale); renderer.setSize(innerWidth, innerHeight); if (composer) composer.setSize(innerWidth, innerHeight); }
  };
  try { $('inName').value = localStorage.getItem('hc_name') || ''; } catch (e) { }
  if (HC.lastCrash) $('netStatus').textContent = `Last time the game stopped loading at: ${HC.lastCrash.stage}. ` +
    `Safe mode is on (lowest graphics${HC.safeLevel >= 2 ? ', no sound' : ''}).`;
  $('btnSolo').onclick = () => { readOpts(); Net.mode = 'solo'; G.roster = [{ pid: 'p0', name: opt.name, cls: opt.cls, slot: 0 }]; beginGame(); };
  $('btnHost').onclick = () => {
    readOpts(); $('netStatus').textContent = 'Lighting the signal fire...'; Net.handler = onNet;
    Net.host({ ready: code => { G.roster = [{ pid: 'p0', name: opt.name, cls: opt.cls, slot: 0 }]; $('lobbyCode').textContent = code; show('title', false); show('lobby'); renderLobby(); }, error: e => $('netStatus').textContent = e });
  };
  $('btnJoin').onclick = () => {
    const code = $('inCode').value.trim().toUpperCase();
    if (code.length < 5) { $('netStatus').textContent = 'Enter the five-letter code from your host.'; return; }
    readOpts(); $('netStatus').textContent = 'Searching the dark for your friends...'; Net.handler = onNet;
    Net.join(code, { status: t => $('netStatus').textContent = t, ready: () => { Net.send({ t: 'hello', name: opt.name, cls: opt.cls }); $('lobbyCode').textContent = code; show('title', false); show('lobby'); show('btnStart', false); show('lobbyWait'); }, error: e => $('netStatus').textContent = e });
  };
  $('btnStart').onclick = () => { Net.broadcast({ t: 'start', flags: G.flags }); beginGame(); };
  function renderLobby() { $('lobbyList').innerHTML = (G.roster || []).map(r => `<li>${esc(r.name)}${r.pid === Net.pid ? ' <span class="small">(you)</span>' : ''}</li>`).join(''); }

  // ================================================================ start
  function beginGame() {
    if (G.booting) return; G.booting = true;
    show('title', false); show('lobby', false); show('loading');
    setTimeout(() => {
      HC.crumb('starting the 3D renderer');
      initRenderer();
      loadModels(() => {
        HC.crumb('building the world');
        W.build(scene);
        HC.crumb('lighting the world');
        W.makeEnv(renderer);
        HC.FX.init(scene);
        HC.crumb('placing enemies and characters');
        spawnEnemies(); setupBosses(); buildInteractables(); buildNPCs(); buildMap();
        W.applyLowMaterials(scene);
        HC.crumb('first frame');
        setTimeout(HC.loadOk, 8000);   // survived the first seconds of play: the load is good
        (G.roster || []).forEach(addPlayer);
        me = G.players.get(Net.pid);
        if (!me) { addPlayer({ pid: Net.pid, name: opt.name, cls: opt.cls, slot: 0 }); me = G.players.get(Net.pid); }
        applyLoadout(); HC.Items.onChange(applyLoadout);
        respawnAt(W.START, Math.PI);
        me.spawn = W.START.clone(); me.camPitch = 0.12;
        G.horror = { appT: 30 + Math.random() * 30, stepT: 45 + Math.random() * 40, mimicT: 80 + Math.random() * 60, bellT: 60 };
        show('loading', false); show('hud'); G.started = true; G.applySettings();
        applyFlagsVisuals();
        setTimeout(() => openNote('letter'), 900);
        setTimeout(ringBell, 6000);
        last = performance.now(); requestAnimationFrame(loop);
      });
    }, 30);
  }
  function addPlayer(r) {
    if (G.players.has(r.pid)) return;
    const av = new HC.Avatar(r.cls, HC.PLAYER_COLORS[r.slot % 4], r.name);
    scene.add(av.root);
    const c = HC.CLASSES[r.cls];
    const p = { id: r.pid, name: r.name, cls: r.cls, slot: r.slot, avatar: av, pos: W.START.clone().add(new V3(r.slot * 1.5 - 2, 0, 0)), yaw: Math.PI, look: Math.PI,
      hp: c.hp, maxHp: c.hp, downed: false, dead: false, act: 'idle', lantern: true, local: r.pid === Net.pid, netPos: new V3(), netYaw: 0, zone: 'wilds', relics: new Set(), vel: new V3() };
    p.netPos.copy(p.pos); G.players.set(r.pid, p);
    if (p.local) Object.assign(p, { st: 100, maxSt: 100, flasks: 4, maxFlasks: 4, actT: 0, actDur: 0, iframes: 0, stDelay: 0, camYaw: Math.PI, camPitch: 0.1, lock: null, fp: false,
      queued: null, hitDone: false, bleed: 0, spawn: W.START.clone(), notesRead: new Set(), knowName: false, ash: 0, level: 1, vig: 0, end: 0, str: 0, found: new Set(), toys: new Set(),
      buffs: {}, dmgBonus: 1, defMul: 1, spdMul: 1, stMul: 1, leech: 0, luck: 0, wb: 'longsword', wr: 0 });
  }
  // the equipped weapon (from the satchel, js/items.js) -> the model in your hand + trinket stats
  function applyLoadout() {
    if (!me) return;
    const w = HC.Items.weapon(), v = HC.Items.visual(w ? w.b : null, w ? w.r : 0);
    me.wb = w ? w.b : ''; me.wr = w ? w.r : 0;
    me.avatar.setWeapon(w ? v.model : null, w ? v.style : 'sword', v.glow, v.amt);
    me.armorCode = HC.Items.armorCode(); me.avatar.setArmor(HC.Items.armorVisual(me.armorCode));
    recalcStats();
  }
  function removePlayer(pid) { const p = G.players.get(pid); if (!p) return; scene.remove(p.avatar.root); G.players.delete(pid); }

  // ================================================================ enemies
  function spawnEnemies() {
    let n = 0;
    const add = (type, pos, o) => { const e = new HC.Enemy('e' + (n++), type, pos, o); G.enemies.set(e.id, e); return e; };
    const ow = (type, x, z) => add(type, new V3(x, W.heightAt(x, z), z));
    const cp = (key, type, x, z) => add(type, W.cellPos(key, x, z));
    // the Drowned Village & graveyard
    [[-18, 0], [15, 20], [-8, -16], [21, -2], [-30, 18], [5, 48], [-22, 40]].forEach(([x, z]) => ow('hollow', x, z));
    [[-12, 6], [10, 14], [-30, 4], [25, 6], [-4, 30], [18, -14], [-34, -16]].forEach(([x, z]) => ow('drowned', x, z));
    ow('knight', 36, -31); ow('hollow', 28, -20); ow('hollow', 41, -18);
    // the old roads
    [[105, -98], [118, -115], [96, -120]].forEach(([x, z]) => ow('hollow', x, z));
    ow('arbalist', 198, 248); ow('arbalist', 212, 262); ow('knight', 190, 270);
    ow('knight', -128, 196); [[-120, 186], [-140, 200], [-110, 200]].forEach(([x, z]) => ow('hollow', x, z));
    [[60, 18], [150, 26], [-60, -4], [0, 100]].forEach(([x, z]) => ow('hollow', x, z));
    // Blackroot Forest
    [[-170, -6], [-200, 14], [-225, -20], [-250, -28], [-280, -40], [-300, -30], [-330, -46], [-240, 40], [-300, 60], [-350, 20], [-210, -80], [-280, -120]].forEach(([x, z]) => ow('hollow', x, z));
    ow('knight', -320, -20); ow('knight', -345, -60); ow('knight', -260, 90);
    ow('wraith', -230, -60); ow('wraith', -310, 10); ow('wraith', -360, -110);
    ow('arbalist', -270, -10); ow('arbalist', -340, 40);
    G.watcher = ow('watcher', -300, 60); G.watcher.setState(S.hidden); G.watcher.stateT = -25;
    // the crater
    [[372, 70], [380, 100], [395, 55], [410, 120], [450, 40], [460, 120], [385, 40], [440, 140]].forEach(([x, z]) => ow('drowned', x, z));
    ow('wraith', 360, 110); ow('wraith', 470, 80); ow('hollow', 330, 70); ow('hollow', 345, 90); ow('hollow', 340, 50); ow('knight', 380, 80);
    // the citadel road
    ow('knight', 10, -250); ow('knight', -14, -290); ow('knight', 6, -380); ow('knight', -6, -420);
    ow('arbalist', -20, -330); ow('arbalist', 20, -360); ow('arbalist', 14, -405); ow('hollow', 8, -200); ow('hollow', -10, -220);
    // catacombs
    [[34, 6], [42, 10], [38, 13], [8, 24], [13, 17]].forEach(([x, z]) => cp('catacombs', 'hollow', x, z));
    cp('catacombs', 'knight', 11, 20); cp('catacombs', 'knight', 39, 36); cp('catacombs', 'wraith', 30, 40); cp('catacombs', 'arbalist', 50, 34);
    // the drowned nave
    [[14, 16], [28, 20], [20, 30], [14, 40], [30, 44], [22, 48]].forEach(([x, z]) => cp('cathedral', 'drowned', x, z));
    [[18, 12], [26, 26], [5, 26], [39, 27]].forEach(([x, z]) => cp('cathedral', 'hollow', x, z));
    cp('cathedral', 'wraith', 22, 38); cp('cathedral', 'wraith', 16, 50); cp('cathedral', 'knight', 22, 55);
    // the King's Below
    [[34, 6], [42, 12]].forEach(([x, z]) => cp('below', 'knight', x, z)); cp('below', 'knight', 30, 36); cp('below', 'knight', 48, 36); cp('below', 'knight', 39, 50);
    cp('below', 'arbalist', 44, 31); cp('below', 'arbalist', 32, 40); cp('below', 'wraith', 38, 22); cp('below', 'wraith', 26, 34);
    [[36, 3], [40, 14], [38, 25]].forEach(([x, z]) => cp('below', 'hollow', x, z));
    // the five bosses
    G.bossE = {
      sentinel: add('sentinel', new V3(W.HEART.x, W.heightAt(W.HEART.x, W.HEART.z), W.HEART.z), { yaw: Math.PI / 2 }),
      brother: add('brother', W.cellPos('catacombs', 40, 74), { yaw: Math.PI }),
      bellbearer: add('bellbearer', W.cellPos('cathedral', 22, 72), { yaw: Math.PI }),
      corvane: add('corvane', new V3(W.CITADEL.x, W.CIT_H, W.CITADEL.z - 6), { yaw: 0 }),
      king: add('king', W.cellPos('below', 40, 72), { yaw: Math.PI }),
    };
    G.summonN = 0;
  }
  G.onEnemyDeath = function (e) {
    G.sound('growl', e.pos, 0.5);
    if (Net.isHost() && HC.Items) HC.Items.rollLoot(e);
    event({ t: 'ash', amt: e.cfg.ash || 0, pos: [e.pos.x, e.pos.y, e.pos.z] });
    if (e.boss) event({ t: 'bossDead', key: e.type, pos: [e.pos.x, e.pos.y, e.pos.z] });
  };
  G.bossPhase = (key, ph) => event({ t: 'bossPhase', key, ph });
  G.bossSummon = (boss, type, count) => {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * 6.28, p = boss.pos.clone().add(new V3(Math.cos(a) * 6, 0, Math.sin(a) * 6));
      if (p.x > 1500 && !W.walkable(p.x, p.z)) p.copy(boss.pos).add(new V3(i ? 4 : -4, 0, -4));
      event({ t: 'spawn', id: 'S' + (G.summonN++), type, pos: [p.x, 0, p.z] });
    }
  };
  G.projectile = (type, pos, vel, dmg) => { HC.Proj.spawn(type, pos, vel, dmg, true); Net.broadcast({ t: 'ev', e: { t: 'proj', type, pos: pos.toArray(), vel: vel.toArray() } }); };
  G.statuesCreep = () => { if (Math.random() < 0.02) W.statues.forEach(s => { if (!s.ring) return; const d = new V3(W.HEART.x - s.mesh.position.x, 0, W.HEART.z - s.mesh.position.z); if (d.length() > 14) { s.mesh.position.addScaledVector(d.normalize(), 0.6); s.col.x = s.mesh.position.x; s.col.z = s.mesh.position.z; } }); };

  // ================================================================ bosses
  function setupBosses() {
    const dun = (key, cz) => p => p.pos.x > 1500 && W.dungeonAt(p.pos.x, p.pos.z) && W.dungeonAt(p.pos.x, p.pos.z).key === key && (p.pos.z - W.DUNGEONS[key].DZ) / 2 > cz;
    G.bosses = {
      sentinel: { inside: p => p.pos.x < 1500 && Math.hypot(p.pos.x - W.HEART.x, p.pos.z - W.HEART.z) < 17, arena: W.arenaSentinel, sigil: 'tears', relic: 'veil', music: 1 },
      brother: { inside: dun('catacombs', 58), fog: 'brother', sigil: 'silence', relic: 'ring' },
      bellbearer: { inside: dun('cathedral', 60), fog: 'bell', sigil: 'bell', relic: 'bellshard' },
      corvane: { inside: p => p.pos.x < 1500 && G.flags.citadelOpen && Math.hypot(p.pos.x - W.CITADEL.x, p.pos.z - W.CITADEL.z) < 30, arena: W.arenaCorvane, sigil: 'oath', relic: 'oathbrand' },
      king: { inside: dun('below', 58), fog: 'king', relic: 'shard' },
    };
    // a ring of pale fog shows the arena boundary for outdoor fights
    const mk = a => { const m = new THREE.Mesh(new THREE.CylinderGeometry(a.r, a.r, 9, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0xc8b89a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })); m.position.set(a.x, W.heightAt(a.x, a.z) + 4, a.z); scene.add(m); return m; };
    G.bosses.sentinel.ringMesh = mk(W.arenaSentinel); G.bosses.corvane.ringMesh = mk(W.arenaCorvane);
  }
  function bossHost() {
    if (G.activeBoss) return;
    for (const key in G.bosses) {
      if (G.flags['dead_' + key]) continue;
      if ([...G.players.values()].some(p => !p.downed && p.hp > 0 && G.bosses[key].inside(p))) { event({ t: 'bossIntro', key }); return; }
    }
  }
  function startBossIntro(key) {
    const b = G.bossE[key], B = G.bosses[key];
    G.activeBoss = key; G.flags['intro_' + key] = true;
    if (B.fog) W.fogWall = B.fog; if (B.arena) B.arena.on = true;
    if (Net.isHost()) { b.maxHp = b.cfg.hp * (1 + 0.6 * (G.players.size - 1)); b.hp = b.maxHp; b.phase = 1; b.used.clear(); b.setState(S.intro); }
    b.root.visible = true;
    const inFight = B.inside(me) || me.pos.distanceTo(b.pos) < 40;
    if (inFight) G.cine = { t: 0, dur: 5.5, boss: b };
    A.play('roar', b.pos, 1.2, { delay: 2.5 });
    $('bossTitle').querySelector('small').textContent = b.cfg.title; $('bossTitle').querySelector('h2').textContent = b.cfg.name.toUpperCase();
    setTimeout(() => { show('bossTitle', false); void $('bossTitle').offsetWidth; show('bossTitle'); setTimeout(() => show('bossTitle', false), 5200); }, inFight ? 1600 : 0);
    A.bossMusic(true, 1);
    show('bossbar'); $('bossName').textContent = b.cfg.name;
    if (!inFight) message(`${b.cfg.name} has awoken. Your friends are fighting it.`);
  }
  function endBoss(key, won, pos) {
    const B = G.bosses[key];
    if (B.arena) B.arena.on = false;
    if (B.fog) W.fogWall = null;
    G.activeBoss = null; A.bossMusic(false); show('bossbar', false);
    if (!won) return;
    G.flags['dead_' + key] = true;
    if (B.sigil) G.flags['sigil_' + B.sigil] = true;
    const b = G.bossE[key]; b.state = S.dead;
    areaBanner(key === 'king' ? 'THE HOLLOW KING FALLS' : 'WARDEN FELLED');
    A.play('jingle_win', null, 0.55, { delay: 1.2 });
    A.play('bell', null, 0.6, { delay: 2 });
    if (B.sigil) setTimeout(() => message(`${b.cfg.name} is defeated. You claim the Sigil of ${{ tears: 'Tears', silence: 'Silence', bell: 'the Bell', oath: 'the Oath' }[B.sigil]}.`), 2500);
    if (B.relic) addInter({ pos: pos.clone(), r: 3, label: 'Take what it left behind', cond: () => !me.relics.has(B.relic), act: () => grantRelic(B.relic) });
    if (key === 'king') me.readFinal = false;
    if (sigilCount() === 3 && !G.saidSigils) { G.saidSigils = true; setTimeout(() => areaBanner('THE CITADEL AWAITS'), 6000); }
  }
  const sigilCount = () => ['tears', 'silence', 'bell'].filter(s => G.flags['sigil_' + s]).length;

  // ================================================================ event bus (host applies + broadcasts; clients forward)
  function event(e) { if (!Net.isHost()) { Net.send({ t: 'req', e }); return; } applyEvent(e); Net.broadcast({ t: 'ev', e }); }
  G.event = event;
  G.fx = (type, pos, o) => event({ t: 'fx', type, pos: [pos.x, pos.y, pos.z], o });
  G.sound = (name, pos, vol = 1) => event({ t: 'snd', name, pos: pos ? [pos.x, pos.y, pos.z] : null, vol });
  G.shake = a => event({ t: 'shake', a });
  function applyEvent(e) {
    switch (e.t) {
      case 'fx': HC.FX.spawn(e.type, vec(e.pos), e.o || {}); break;
      case 'snd': A.play(e.name, e.pos ? vec(e.pos) : null, e.vol); break;
      case 'shake': G.shakeA = Math.max(G.shakeA || 0, e.a); break;
      case 'proj': if (!Net.isHost()) HC.Proj.spawn(e.type, vec(e.pos), vec(e.vel), 0, false); break;
      case 'pshot': if (e.by !== Net.pid) HC.Proj.spawn(e.type, vec(e.pos), vec(e.vel), 0, false, { grav: e.grav || 0, size: e.size }); break;
      case 'loot': case 'lootTake': if (HC.Items) HC.Items.onEvent(e); break;
      case 'flag':
        if (G.flags[e.k] === e.v) break;
        G.flags[e.k] = e.v; applyFlagsVisuals();
        if (e.msg) message(e.msg);
        if (e.k === 'key' && e.v) A.play('pickup');
        if (e.k === 'gateOpen' && e.v) { A.play('gate', W.cellPos('below', 39, 42, 2), 1.5); areaBanner('THE WAY IS OPEN'); }
        if (e.k === 'citadelOpen' && e.v) { A.play('gate', W.GATEHOUSE, 1.5); areaBanner('THE CITADEL OPENS'); }
        break;
      case 'msg': message(e.text); break;
      case 'chat': chatLine(e.from, e.text, e.tag, e.color); break;
      case 'adm': if (HC.Access) HC.Access.apply(e); break;
      case 'ping': HC.FX.spawn('pingMark', vec(e.pos), { color: HC.PLAYER_COLORS[e.slot % 4] }); A.play('ping', vec(e.pos), 1.2); break;
      case 'spawn': if (!G.enemies.has(e.id)) { const en = new HC.Enemy(e.id, e.type, vec(e.pos)); en.summoned = true; G.enemies.set(e.id, en); en.setState(S.chase); } break;
      case 'bossIntro': startBossIntro(e.key); break;
      case 'bossPhase': A.bossMusic(true, 2); if (G.bossE[e.key]) A.play('laugh', G.bossE[e.key].pos, 1.2); areaBanner({ sentinel: 'THE SENTINEL WEEPS NO MORE', brother: 'IT SPEAKS WITH YOUR VOICE', bellbearer: 'THE BELL CRACKS', corvane: 'THE CAPTAIN REMEMBERS HIS OATH', king: 'THE KING REMEMBERS HIS OATH' }[e.key] || ''); break;
      case 'bossDead': endBoss(e.key, true, vec(e.pos)); break;
      case 'bossReset': if (G.activeBoss) endBoss(G.activeBoss, false); break;
      case 'ash': if (me && me.pos.distanceTo(vec(e.pos)) < 70 && e.amt) { const n = Math.round(e.amt * (1 + (me.luck || 0))); me.ash += n; floatText(`+${n} ashes`); } break;
      case 'plate': {
        const pl = W.plates[e.i]; pl.vis = e.on;
        if (e.on) { pl.visT = G.t; A.play('stone', pl.pos, 0.8); if (!G.flags.gateOpen) message(G.players.size > 1 ? 'A rune ignites beneath your feet. Its twin lies on the far side of the hall.' : `A rune ignites. It will burn for ${PLATE_WINDOW} heartbeats... its twin lies across the hall.`); }
        break;
      }
      case 'wipe': onWipe(); break;
      case 'ending': showEnding(e.choice, e.by); break;
      case 'revive': if (e.target === Net.pid) revived(e.by); break;
      case 'dmg': if (e.target === Net.pid) receiveDamage(e.dmg, vec(e.src), e.kind); break;
    }
  }
  G.hitPlayer = function (pid, dmg, src, kind) {
    if (pid === Net.pid) receiveDamage(dmg, src, kind);
    else Net.sendTo(pid, { t: 'ev', e: { t: 'dmg', target: pid, dmg, src: [src.x, src.y, src.z], kind } });
  };

  function onNet(m, from) {
    switch (m.t) {
      case 'hello': {
        if (!Net.isHost()) break;
        const live = new Set([...Net.conns.values()].map(v => v.pid));
        G.roster = G.roster.filter(x => x.pid === 'p0' || live.has(x.pid));
        const used = new Set(G.roster.filter(x => x.pid !== from).map(r => r.slot));
        let slot = parseInt(from.slice(1)); if (used.has(slot)) { slot = 1; while (used.has(slot)) slot++; }
        const r = { pid: from, name: String(m.name).slice(0, 14), cls: HC.CLASSES[m.cls] ? m.cls : 'sword', slot };
        G.roster = G.roster.filter(x => x.pid !== from); G.roster.push(r);
        Net.sendTo(from, { t: 'welcome', pid: from, roster: G.roster, started: G.started, flags: G.flags });
        Net.broadcast({ t: 'roster', roster: G.roster }); renderLobby();
        if (G.started) { addPlayer(r); message(`${r.name} has arrived in Veyr.`); }
        break;
      }
      case 'leave': {
        const p = G.players.get(from); if (p) message(`${p.name} has been lost to the dark.`);
        G.roster = (G.roster || []).filter(x => x.pid !== from); removePlayer(from);
        Net.broadcast({ t: 'roster', roster: G.roster }); renderLobby(); break;
      }
      case 'st': { const p = G.players.get(from); if (p) applyPlayerState(p, m); break; }
      case 'req': {
        const e = m.e;
        if (e.t === 'hit') { const en = G.enemies.get(e.id); if (en) en.takeHit(e.dmg, e.poise, vec(e.from), from); break; }
        if (e.t === 'dmg') break;
        event(e); break;
      }
      case 'welcome': G.roster = m.roster; G.flags = m.flags || {}; renderLobby(); if (m.started) beginGame(); break;
      case 'roster':
        G.roster = m.roster; renderLobby();
        if (G.started) {
          m.roster.forEach(r => { if (!G.players.has(r.pid)) { addPlayer(r); message(`${r.name} has arrived in Veyr.`); } });
          [...G.players.keys()].forEach(pid => { if (!m.roster.find(r => r.pid === pid)) { message(`${G.players.get(pid).name} has been lost to the dark.`); removePlayer(pid); } });
        }
        break;
      case 'start': G.flags = m.flags || {}; beginGame(); break;
      case 'snap':
        if (!G.started) break;
        m.pl.forEach(s => { if (s.id === Net.pid) return; const p = G.players.get(s.id); if (p) applyPlayerState(p, s); });
        m.en.forEach(s => { const e = G.enemies.get(s[0]); if (e) e.applySnap(s); });
        if (m.ab !== undefined && m.ab !== G.activeBoss) { if (m.ab && !G.activeBoss) startBossIntro(m.ab); else if (!m.ab && G.activeBoss) endBoss(G.activeBoss, false); }
        break;
      case 'ev': if (G.started) applyEvent(m.e); break;
      case 'hostLost': message('The host has left. The journey ends here.'); setTimeout(() => location.reload(), 4000); break;
    }
  }
  function playerState(p) {
    return { t: 'st', id: p.id, x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2), yaw: +p.yaw.toFixed(2), look: +p.look.toFixed(2), act: p.act,
      at: +(p.actT || p.avatar.actT || 0).toFixed(2), ad: +(p.actDur || p.avatar.actDur || 0).toFixed(2), sp: +(p.avatar.speed).toFixed(1), hp: Math.round(p.hp), mhp: p.maxHp, dn: p.downed ? 1 : 0, ln: p.lantern ? 1 : 0, cb: p.avatar.combo || 0, w: p.wb || '', wr: p.wr || 0, dw: +(p.avatar.draw || 0).toFixed(2), ch: +(p.avatar.charge || 0).toFixed(2), pt: +(p.avatar.pitch || 0).toFixed(2), ar: p.armorCode || '' };
  }
  function applyPlayerState(p, s) {
    p.netPos.set(s.x, s.y, s.z); p.netYaw = s.yaw; p.look = s.look; p.hp = s.hp; p.maxHp = s.mhp; p.downed = !!s.dn;
    if (!p.local) { p.avatar.draw = s.dw || 0; p.avatar.charge = s.ch || 0; p.avatar.pitch = s.pt || 0; if (s.ar !== undefined && s.ar !== p.armorCode) { p.armorCode = s.ar; p.avatar.setArmor(HC.Items.armorVisual(s.ar)); } }
    if (!p.local && s.w !== undefined && (p.wb !== s.w || p.wr !== s.wr)) {
      p.wb = s.w; p.wr = s.wr; const v = HC.Items.visual(s.w || null, s.wr);
      p.avatar.setWeapon(s.w ? v.model : null, s.w ? v.style : 'sword', v.glow, v.amt);
    }
    if (p.act !== s.act) {
      p.avatar.actT = s.at;
      // teammates' swings and rolls (their own client plays them for them)
      if (!p.local && s.act === 'draw' && p.pos.distanceTo(me.pos) < 40) A.play('bow_draw', p.pos, 0.9);
      if (!p.local && s.act === 'loose' && p.pos.distanceTo(me.pos) < 40) A.play('bow_shoot', p.pos, 1.0);
      if (!p.local && ['attack', 'heavy', 'roll'].includes(s.act) && p.pos.distanceTo(me.pos) < 40) {
        const st = HC.STYLES[p.avatar.style] || {}, at = st[s.act === 'heavy' ? 'heavy' : 'light'] || {};
        playActSound(s.act, p.pos, p.avatar.style, s.cb || 0, s.act === 'roll' ? 0 : Math.max(0, (st.ranged ? at.hit : 0.12) - (s.at || 0)));
      }
    }
    p.act = s.act; p.avatar.act = s.act; p.avatar.actDur = s.ad; p.avatar.speed = s.sp; p.avatar.combo = s.cb || 0;
    if (p.lantern !== !!s.ln) { p.lantern = !!s.ln; p.avatar.setLantern(p.lantern); }
    if (p.netPos.distanceTo(p.pos) > 10) p.pos.copy(p.netPos);
  }
  let netT = 0;
  function netTick(dt) {
    if (Net.mode === 'solo') return;
    netT += dt; if (netT < 1 / 15) return; netT = 0;
    if (Net.mode === 'client') { Net.send(playerState(me)); return; }
    const near = e => [...G.players.values()].some(p => p.pos.distanceTo(e.pos) < 160) || e.boss;
    Net.broadcast({ t: 'snap', pl: [...G.players.values()].map(playerState), en: [...G.enemies.values()].filter(near).map(e => e.snap()), ab: G.activeBoss || null });
  }

  // ================================================================ input
  const keys = {}; const mouse = { l: false, r: false }; let locked = false;
  const canvasEl = () => renderer && renderer.domElement;
  // used by js/touch.js (phone / tablet / touchscreen Chromebook controls)
  G.input = {
    keys, mouse, stick: { x: 0, y: 0 },
    attack: kind => press(kind),          // touch buttons: press / release (hold to draw a bow or charge a heavy)
    release: kind => release(kind),
    look(dx, dy) { if (!me) return; me.camYaw -= dx * 0.006 * opt.sens; me.camPitch = Math.max(-1.0, Math.min(1.1, me.camPitch + dy * 0.005 * opt.sens)); },
    pause() { if (G.started && !G.ended && !overlayOpen()) show('pause'); },
    overlayOpen: () => overlayOpen(),
  };
  addEventListener('keydown', e => {
    if (!G.started) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target !== $('chatIn')) return;   // typing in a panel
    if (!$('makerPanel').classList.contains('hidden')) return;
    if (document.activeElement === $('chatIn')) {
      if (e.key === 'Enter') { const t = $('chatIn').value.trim(); $('chatIn').value = ''; show('chatIn', false); $('chatIn').blur(); if (t) { if (HC.Access) HC.Access.chat(t); else event({ t: 'chat', from: me.name, text: t.slice(0, 120) }); } lock(); }
      if (e.key === 'Escape') { show('chatIn', false); $('chatIn').blur(); }
      return;
    }
    if (!$('mapOverlay').classList.contains('hidden')) { if (e.code === 'KeyM' || e.code === 'Escape') { show('mapOverlay', false); lock(); } return; }
    if (overlayOpen()) { if (['KeyE', 'Escape', 'Enter'].includes(e.code)) closeOverlay(); e.preventDefault(); return; }
    keys[e.code] = true;
    if (e.code === 'Tab') { e.preventDefault(); toggleLock(); }
    if (e.code === 'Space') { e.preventDefault(); tryRoll(); }
    if (e.code === 'KeyQ' && !e.repeat) press('heavy');
    if (e.code === 'KeyJ' && !e.repeat) press('attack');    // keyboard-only attack (Chromebook touchpads)
    if (e.code === 'KeyR') tryDrink();
    if (e.code === 'KeyE') tryInteract();
    if (e.code === 'KeyF') { me.lantern = !me.lantern; me.avatar.setLantern(me.lantern); }
    if (e.code === 'KeyV') me.fp = !me.fp;
    if (e.code === 'KeyG') doPing();
    if (e.code === 'KeyI') { e.preventDefault(); HC.Items.open(); }
    if (/^Digit[1-4]$/.test(e.code)) HC.Items.quickUse(+e.code.slice(5) - 1);
    if (e.code === 'KeyM') { drawMap(); show('mapOverlay'); unlockPointer(); }
    if (e.code === 'Enter') { show('chatIn'); $('chatIn').focus(); unlockPointer(); e.preventDefault(); }
  });
  addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'KeyQ') release('heavy'); if (e.code === 'KeyJ') release('attack'); });
  // Clicks on the game view always act (attack / block), whether or not the browser granted mouse capture;
  // a click without capture also asks for it. Previously a click only requested capture, so if the browser
  // refused (or was slow), left click did nothing at all.
  addEventListener('mousedown', e => {
    if (!G.started || overlayOpen() || G.touch) return;
    if (!locked && e.target !== canvasEl()) return;          // clicks on HUD / chat
    if (!locked) lock();
    if (e.button === 0) { mouse.l = true; press('attack'); }
    if (e.button === 2) mouse.r = true;
  });
  addEventListener('mouseup', e => { if (e.button === 0) { mouse.l = false; release('attack'); } if (e.button === 2) mouse.r = false; });
  addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('mousemove', e => {
    if (!me || !G.started) return;
    // captured: mouse looks freely. Not captured (browser refused): drag with a button held to look.
    if (!locked && !(G.lockFailed && e.buttons)) return;
    me.camYaw -= e.movementX * 0.0024 * opt.sens;
    me.camPitch = Math.max(-1.0, Math.min(1.1, me.camPitch + e.movementY * 0.0022 * opt.sens));
  });
  document.addEventListener('pointerlockerror', () => {
    if (!G.started) return;
    const first = !G.lockWarned; G.lockFailed = true; G.lockWarned = true;
    if (first) message('Your browser blocked mouse capture: hold a mouse button and drag to look around.');
  });
  function lock() { const c = canvasEl(); if (c && c.requestPointerLock) { try { const r = c.requestPointerLock(); if (r && r.catch) r.catch(() => { }); } catch (e) { } } }
  function unlockPointer() { if (document.exitPointerLock) document.exitPointerLock(); }
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvasEl();
    if (locked) G.lockFailed = false;
    document.body.classList.toggle('unlocked', !locked && G.started);
    if (!locked && G.started && !overlayOpen() && document.activeElement !== $('chatIn') && !G.ended && $('mapOverlay').classList.contains('hidden')) show('pause');
  });
  $('btnResume').onclick = () => { show('pause', false); lock(); };
  $('btnQuit').onclick = () => location.reload();
  $('btnAgain').onclick = () => location.reload();
  $('mapClose').onclick = () => { show('mapOverlay', false); lock(); };
  document.querySelectorAll('#choice button').forEach(b => b.onclick = () => { show('choice', false); event({ t: 'ending', choice: b.dataset.end, by: me.name }); });
  function overlayOpen() { return ['reader', 'dialog', 'choice', 'ending', 'shrineMenu', 'settings', 'makerPanel', 'inventory', 'trade'].some(id => !$(id).classList.contains('hidden')) || !$('pause').classList.contains('hidden'); }
  function closeOverlay() {
    if (!$('ending').classList.contains('hidden') || !$('choice').classList.contains('hidden')) return;
    if (!$('dialog').classList.contains('hidden') && G.dialogQueue && G.dialogQueue.length) { nextDialog(); return; }
    ['reader', 'dialog', 'pause', 'shrineMenu', 'settings', 'inventory', 'trade'].forEach(id => show(id, false));
    lock();
  }

  // ================================================================ local player
  const C = () => HC.CLASSES[me.cls];
  const busy = () => ['attack', 'heavy', 'roll', 'drink', 'hurt', 'downed', 'revive', 'cine', 'throw', 'charge', 'draw', 'cast', 'loose', 'getup'].includes(me.act);
  function startAct(a, dur) { me.act = a; me.actT = 0; me.actDur = dur; me.avatar.act = a; me.avatar.actT = 0; me.avatar.actDur = dur; me.hitDone = false; }
  // ---- press / release: bows draw while held, the staff charges, melee heavies wind up; everything else fires on press
  const canAct = () => me && !me.downed && !me.dead && !G.cine && !me.frozen;
  const style = () => HC.STYLES[me.avatar.style] || HC.STYLES.sword;
  const held = {};
  function noAmmo() {
    if (HC.Items.ammoFor()) return false;
    if (G.t - (G.noAmmoT || -9) > 2) { G.noAmmoT = G.t; message('No arrows left. Buy more at an ember, or take them from the fallen.'); }
    return true;
  }
  function press(kind) {
    if (!me) return;
    held[kind] = true;
    const S = style();
    if (S.charge === 'draw') return startDraw();
    if (S.charge === 'cast') return startCast(kind);
    if (!S.ranged && kind === 'heavy' && me.avatar.weapon) return startCharge();
    tryAttack(kind);
  }
  function release(kind) {
    if (!me || !held[kind]) return;
    held[kind] = false;
    if (me.act === 'draw') loose();
    else if (me.act === 'cast' && me.castKind === kind) castRelease();
    else if (me.act === 'charge' && kind === 'heavy') chargeRelease();
  }
  function startDraw() {
    if (!canAct() || busy() || me.st <= 0 || noAmmo()) return;
    startAct('draw', 99); me.draw = 0; me.yaw = me.camYaw; me.avatar.nocked = true;
    A.play('bow_draw', null, 0.9);
  }
  function loose() {
    const a = HC.Items.weaponStats('attack'), p = me.draw;
    if (noAmmo()) { startAct('idle', 0); return; }
    // a quick tap still shoots, weakly; a full draw hits twice as hard and flies much faster and flatter
    const shot = Object.assign({}, a, { dmg: a.dmg * (0.45 + 1.55 * p), speed: a.speed * (0.45 + 0.55 * p), poise: a.poise * (0.5 + p) });
    me.st -= a.st; me.stDelay = 0.6;
    fireShot(shot);
    startAct('loose', 0.32); me.atk = shot; me.avatar.nocked = false;
    A.play('bow_shoot', null, 0.6 + 0.5 * p);
  }
  function startCast(kind) {
    if (!canAct() || busy()) return;
    const a = HC.Items.weaponStats(kind); if (me.st < a.st * 0.5) return;
    startAct('cast', 99); me.castKind = kind; me.charge = 0; me.yaw = me.camYaw;
    A.play('spell', null, 0.35, { rate: kind === 'heavy' ? 0.7 : 1 });
  }
  function castRelease() {
    const kind = me.castKind, a = HC.Items.weaponStats(kind), p = me.charge;
    const shot = Object.assign({}, a, { dmg: a.dmg * (0.6 + 0.9 * p), speed: a.speed * (0.8 + 0.4 * p), size: 0.7 + 0.8 * p });
    me.st -= a.st; me.stDelay = 0.8;
    startAct(kind === 'heavy' ? 'heavy' : 'attack', a.dur); me.atk = shot; me.avatar.atk = shot; me.yaw = me.camYaw;
    A.play('spell', null, 0.8, { rate: 1.1 });
  }
  function startCharge() {
    if (!canAct() || busy() || me.st <= 0) return;
    startAct('charge', 99); me.charge = 0; me.atk = HC.Items.weaponStats('heavy'); me.avatar.atk = me.atk;
    if (me.lock) faceTarget(); else me.yaw = me.camYaw;
  }
  function chargeRelease() {
    const p = me.charge; startAct('idle', 0);
    tryAttack('heavy', { charge: p, fromCharge: true });
  }
  function tryAttack(kind, opts = {}) {
    if (!canAct()) return;
    if (busy()) { if ((me.act === 'attack' || me.act === 'heavy') && me.actT > me.actDur * 0.45) me.queued = kind; return; }
    const a = HC.Items.weaponStats(kind);
    if (me.st <= 0) return;
    if (a.ranged && a.ammo && noAmmo()) return;
    if (opts.charge > 0.15) {   // a charged heavy: up to +80% damage and double stagger
      a.dmg *= 1 + 0.8 * opts.charge; a.poise *= 1 + opts.charge; a.charged = opts.charge;
      G.shakeA = Math.max(G.shakeA || 0, 0.2 * opts.charge);
    }
    me.st -= a.st; me.stDelay = 0.8;
    // chain light attacks into a three-hit combo when pressed in rhythm
    me.combo = kind !== 'heavy' && G.t - (me.lastAtkEnd || -9) < 0.55 ? ((me.combo || 0) + 1) % 3 : 0;
    me.avatar.combo = me.combo;
    if (me.lock) faceTarget(); else if (a.ranged) me.yaw = me.camYaw; else if (moveDir().lengthSq() > 0) me.yaw = Math.atan2(moveDir().x, moveDir().z); else me.yaw = me.camYaw;
    startAct(kind === 'heavy' ? 'heavy' : 'attack', a.dur); me.atk = a; me.avatar.atk = a;
    if (opts.fromCharge) { me.avatar.lastAct = 'charge'; }
    if (me.avatar.style === 'crossbow') A.play('xbow_reload', null, 0.8, { delay: a.hit + 0.35 });
    // your own swings play un-positioned at full volume (the camera sits metres behind you); clips peak ~0.2 s in
    playActSound(kind === 'heavy' ? 'heavy' : 'attack', null, a.style, me.combo, Math.max(0, a.ranged ? a.hit : a.hit - 0.2));
  }
  // attack / heavy / roll sounds. pos = null -> your own character (full volume), else a teammate in 3D
  function playActSound(act, pos, style, combo = 0, delay = 0) {
    const S = HC.STYLES[style] || {}, armor = !!S.armor, v = pos ? 1.2 : 1.0, rev = pos ? 0.8 : 0.35;
    const swing = { dagger: 'swing_dagger', spear: 'swing_spear', axe: 'swing_axe', hammer: 'swing_axe', scythe: 'swing_spear' }[style];
    if (act === 'roll') A.play('dodge', pos, v, { armor, rev });
    else if (S.ranged) A.play('shot', pos, v, { delay, kind: style, heavy: act === 'heavy', rev });
    else if (act === 'heavy' || armor) A.play('heavyAttack', pos, v, { delay, armor, rev, swing });   // greatswords and hammers always swing heavy
    else A.play('attack', pos, v, { delay, combo, armor, rev, swing });
  }
  function tryRoll() {
    if (!me || me.downed || me.dead || G.cine || me.frozen || ['roll', 'downed', 'drink', 'throw'].includes(me.act)) return;
    if ((me.act === 'attack' || me.act === 'heavy') && me.actT < me.actDur * 0.6) return;
    if (me.st < 5) return;
    me.st -= C().rollCost; me.stDelay = 0.8;
    const d = moveDir();
    me.rollDir = d.lengthSq() > 0 ? d.clone() : new V3(-Math.sin(me.yaw), 0, -Math.cos(me.yaw));
    me.yaw = Math.atan2(me.rollDir.x, me.rollDir.z); if (d.lengthSq() === 0) me.yaw += Math.PI;
    startAct('roll', 0.6); me.iframes = 0.42; playActSound('roll', null, me.avatar.style);
  }
  function tryDrink() { if (!me || busy() || me.downed || me.flasks <= 0) return; me.flasks--; startAct('drink', 1.15); me.healed = false; me.drinkFn = null; }
  // potions from the satchel: same drinking animation, the item's own effect
  function drinkItem(fn) { if (!me || busy() || me.downed || me.dead || me.frozen) return false; startAct('drink', 1.15); me.healed = false; me.drinkFn = fn; return true; }
  function throwBomb(dmg) {
    if (!me || busy() || me.downed || me.dead || me.frozen) return false;
    me.yaw = me.lock ? Math.atan2(me.lock.pos.x - me.pos.x, me.lock.pos.z - me.pos.z) : me.camYaw;
    startAct('throw', 0.9); me.bombDmg = dmg; me.thrown = false; return true;
  }
  function faceTarget() { const t = me.lock; if (t) me.yaw = Math.atan2(t.pos.x - me.pos.x, t.pos.z - me.pos.z); }
  const moveInput = () => {
    if (me && me.frozen) return new V3();
    const c = me && me.confuseT > 0 ? -1 : 1;
    return new V3(((keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + G.input.stick.x) * c, 0, ((keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) + G.input.stick.y) * c);
  };
  function moveDir() {
    const i = moveInput(); if (i.lengthSq() === 0) return i;
    const f = new V3(Math.sin(me.camYaw), 0, Math.cos(me.camYaw)), r = new V3(-Math.cos(me.camYaw), 0, Math.sin(me.camYaw));
    return f.multiplyScalar(i.z).add(r.multiplyScalar(i.x)).normalize();
  }
  function toggleLock() {
    if (me.lock) { me.lock = null; return; }
    let best = null, bs = 1e9;
    G.enemies.forEach(e => {
      if (!e.alive || !e.root.visible || e.type === 'watcher') return;
      const d = e.pos.distanceTo(me.pos); if (d > 30) return;
      const a = Math.abs(HC.angDiff(me.camYaw, Math.atan2(e.pos.x - me.pos.x, e.pos.z - me.pos.z)));
      const sc = d + a * 12; if (sc < bs) { bs = sc; best = e; }
    });
    me.lock = best;
  }
  const dmgMul = () => (1 + me.str * 0.06) * (me.relics.has('oathbrand') ? 1.15 : 1) * (me.dmgBonus || 1) * (me.power || 1);
  // one enemy takes one hit from you (sword swing, arrow, orb, bomb...)
  function hitEnemy(e, dmg, poise, o = {}) {
    const hp = e.pos.clone().setY(e.pos.y + Math.min(e.cfg.h * 0.6, 2.2));
    const metal = ['knight', 'corvane', 'king', 'sentinel'].includes(e.type);
    if (o.fire || o.perk === 'fire') { dmg *= 1.2; HC.FX.spawn('ember', hp); }
    HC.FX.spawn(e.type === 'sentinel' ? 'stone' : metal ? 'spark' : 'blood', hp);
    const pierce = o.proj === 'arrow' || o.proj === 'bolt';
    if (e.type !== 'watcher') A.play(e.type === 'sentinel' ? 'stone' : metal ? 'hit_armor' : pierce ? 'arrow_hit' : o.heavy ? 'hit_heavy' : 'hit', hp, o.ranged ? 0.8 : 0.9);
    if (metal && e.type !== 'sentinel') A.play('hit_plate', hp, 0.5);
    if (me.avatar.style === 'axe' && !o.ranged && !metal) A.play('chop', hp, 0.45);
    const steal = (o.perk === 'leech' ? 0.06 : 0) + (me.leech || 0);
    if (steal && e.type !== 'watcher') me.hp = Math.min(me.maxHp, me.hp + dmg * steal);
    if (Net.isHost()) e.takeHit(dmg, poise, me.pos, me.id);
    else { Net.send({ t: 'req', e: { t: 'hit', id: e.id, dmg, poise, from: [me.pos.x, me.pos.y, me.pos.z] } }); if (e.type !== 'watcher') e.rig.flash = 0.25; }
  }
  function performHit() {
    const a = me.atk, ring = me.relics.has('ring') && me.act === 'heavy';
    if (a.ranged) { fireShot(a); return; }
    let hitAny = false;
    G.enemies.forEach(e => {
      if (!e.alive || !e.root.visible) return;
      const dx = e.pos.x - me.pos.x, dz = e.pos.z - me.pos.z, d = Math.hypot(dx, dz);
      if (d > a.range + e.cfg.r + (ring ? 3 : 0) || Math.abs(e.pos.y - me.pos.y) > 3.5) return;
      if (Math.abs(HC.angDiff(me.yaw, Math.atan2(dx, dz))) > a.arc / 2 && d > e.cfg.r + 0.6) return;
      hitAny = true;
      hitEnemy(e, (a.dmg * (0.9 + Math.random() * 0.2) + (ring ? 18 : 0)) * dmgMul(), a.poise, { perk: a.perk, heavy: me.act === 'heavy' || HC.STYLES[a.style].armor });
    });
    if (ring) { const p = me.pos.clone().add(new V3(Math.sin(me.yaw) * 2.5, 1.2, Math.cos(me.yaw) * 2.5)); HC.FX.spawn('ember', p); A.play('fire', p, 0.8); }
    if (hitAny) { G.hitstop = 0.06; G.shakeA = Math.max(G.shakeA || 0, me.act === 'heavy' ? 0.25 : 0.12); }
  }
  // bows, crossbows, staffs: shoot toward the centre of the screen (or the locked-on enemy)
  function aimPoint() {
    if (me.lock && me.lock.alive) return me.lock.pos.clone().setY(me.lock.pos.y + Math.min(me.lock.cfg.h, 3) * 0.55);
    const f = new V3(); camera.getWorldDirection(f);
    const p = camera.position.clone();
    for (let i = 0; i < 140; i++) { p.addScaledVector(f, 0.6); if (p.y < W.heightAt(p.x, p.z) || (p.x > 1500 && !W.walkable(p.x, p.z))) break; }
    return p;
  }
  function fireShot(a) {
    let ammo = null;
    if (a.ammo) { ammo = HC.Items.ammoFor(); if (!ammo) return; HC.Items.takeBase(ammo, 1); }
    const av = me.avatar, to = aimPoint(), n = a.n || 1;
    let from = me.pos.clone().add(new V3(Math.sin(me.yaw) * 0.55, 1.45, Math.cos(me.yaw) * 0.55));
    if (av.style === 'bow' && av.weapon) from = av.weapon.localToWorld(new V3(0, 0.02, 0.12));            // off the arrow rest
    else if (av.style === 'staff' && av.rig.b.hand_l) from = av.rig.palm('hand_l', new THREE.Matrix4().copy(av.rig.model.matrixWorld).invert()).applyMatrix4(av.rig.model.matrixWorld).add(to.clone().sub(me.pos).setY(0).normalize().multiplyScalar(0.25));   // from the open palm
    else if (av.style === 'crossbow' && av.weapon) from = av.weapon.localToWorld(new V3(0, 0.05, 0.35));
    for (let i = 0; i < n; i++) {
      const dir = to.clone().sub(from); const dist = dir.length(); dir.normalize();
      if (n > 1) dir.applyAxisAngle(new V3(0, 1, 0), (i - (n - 1) / 2) * 0.09);
      const vel = dir.multiplyScalar(a.speed);
      if (a.grav) vel.y += a.grav * (dist / a.speed) * 0.5;          // lob slightly so the arrow lands on the aim point
      const fire = ammo === 'firearrow' || a.proj === 'orb' || a.proj === 'wave' || a.perk === 'fire';
      const dmg = a.dmg * (0.9 + Math.random() * 0.2) * dmgMul() * (ammo === 'firearrow' ? 1.4 : 1);
      HC.Proj.spawn(a.proj, from, vel, dmg, true, { friendly: true, poise: a.poise, pierce: !!a.pierce, grav: a.grav || 0, perk: a.perk, fire, life: 3, size: a.size });
      event({ t: 'pshot', type: a.proj, pos: from.toArray(), vel: vel.toArray(), grav: a.grav || 0, size: a.size || 1, by: Net.pid });
    }
    if (a.proj === 'wave' || a.proj === 'orb') HC.FX.spawn('ember', from);
  }
  G.projHit = (e, p) => hitEnemy(e, p.dmg, p.poise || 10, { fire: p.fire, perk: p.perk, ranged: true, proj: p.type });
  G.bombBurst = function (p) {
    G.fx('ring', p.pos, { color: 0xff6a20, r: 4, life: 0.6 }); G.fx('ember', p.pos); G.sound('boom', p.pos, 0.9); G.sound('glass', p.pos, 0.8);
    G.enemies.forEach(e => { if (e.alive && e.root.visible && e.pos.distanceTo(p.pos) < 3.8 + e.cfg.r) hitEnemy(e, p.dmg * dmgMul(), 60, { fire: true, ranged: true }); });
  };
  function receiveDamage(dmg, src, kind) {
    if (!me || me.downed || me.dead || G.ended) return;
    if (me.god && kind !== 'admin') return;
    if (me.iframes > 0 && kind !== 'watcher' && kind !== 'admin') return;
    if (kind !== 'admin') dmg *= me.defMul || 1;
    const toSrc = Math.atan2(src.x - me.pos.x, src.z - me.pos.z);
    const blocking = me.act === 'block' && Math.abs(HC.angDiff(me.yaw, toSrc)) < 1.4 && kind !== 'watcher' && kind !== 'fire' && kind !== 'admin';
    if (blocking && me.st > 0) {
      me.st -= dmg * (me.relics.has('bellshard') ? 0.8 : 1.6); me.stDelay = 1;
      A.play('parry', me.pos, 1); HC.FX.spawn('spark', me.pos.clone().setY(me.pos.y + 1.2));
      dmg *= 0.12;
      if (me.st <= 0) { startAct('hurt', 0.9); message('Your guard breaks.'); }
    } else {
      startAct('hurt', kind === 'watcher' ? 1.2 : 0.4); A.play('hurt', me.pos, 0.9);
      HC.FX.spawn('blood', me.pos.clone().setY(me.pos.y + 1.2));
      G.dmgFlash = 1; G.shakeA = Math.max(G.shakeA || 0, kind === 'watcher' ? 0.8 : 0.35);
      if (kind === 'watcher') { message('Something cold passed through you.'); G.dmgFlash = 1.5; }
    }
    me.hp -= dmg;
    if (me.hp <= 0) { me.hp = 0; goDown(); }
  }
  function goDown() {
    const others = [...G.players.values()].filter(p => !p.local && !p.downed && p.hp > 0);
    if (Net.mode === 'solo') { die(true); return; }
    if (others.length === 0) { me.downed = true; startAct('downed', 999); event({ t: 'wipe' }); return; }
    me.downed = true; me.bleed = 35; startAct('downed', 999); me.lock = null;
    show('downed'); A.play('death', me.pos, 0.6);
    event({ t: 'msg', text: `${me.name} has fallen! Hold [E] beside them to lift them up.` });
  }
  function die(resetWorld) {
    if (me.dead) return;
    me.dead = true; me.downed = false; show('downed', false); startAct('downed', 999);
    A.play('death', null, 1); A.play('jingle_lose', null, 0.45, { delay: 1.2 }); show('death'); $('deathSub').textContent = 'The ember remembers you.';
    setTimeout(() => { show('death', false); me.dead = false; if (resetWorld && Net.isHost()) resetWorldOnDeath(); respawnAt(me.spawn, me.yaw); }, 4200);
  }
  function onWipe() { if (!me) return; me.downed = false; die(true); }
  function resetWorldOnDeath() {
    G.enemies.forEach(e => { if (e.summoned) { e.remove(); G.enemies.delete(e.id); } else if (!(e.boss && G.flags['dead_' + e.type])) e.reset(); });
    if (G.activeBoss) event({ t: 'bossReset' });
  }
  function revived(byName) { me.downed = false; me.hp = me.maxHp * 0.4; startAct('getup', 1.4); show('downed', false); message(`${byName} lifted you from the dark.`); A.play('shrine', me.pos, 0.5); }
  function respawnAt(p, yaw) {
    me.pos.copy(p); me.pos.y = W.heightAt(p.x, p.z);
    me.hp = me.maxHp; me.st = me.maxSt; me.flasks = me.maxFlasks; me.downed = false; me.dead = false; me.lock = null;
    startAct('idle', 0); me.yaw = yaw; me.camYaw = yaw; show('downed', false);
    $('fade').classList.add('on'); setTimeout(() => $('fade').classList.remove('on'), 600);
  }
  function recalcStats() {
    const c = C(), b = HC.Items.bonus(), bf = me.buffs || {};
    me.maxHp = Math.round(c.hp + me.vig * 24 + (me.relics.has('shard') ? 20 : 0) + b.hp);
    me.maxSt = 100 + me.end * 10;
    me.maxFlasks = 4 + (me.relics.has('shard') ? 1 : 0) + (me.relics.has('charm') ? 1 : 0) + (me.bonusFlasks || 0);
    me.dmgBonus = (1 + b.dmg) * (bf.might > 0 ? 1.3 : 1);
    me.armorVal = b.armor;
    me.defMul = (1 - Math.min(0.6, b.def)) * (bf.iron > 0 ? 0.6 : 1) * 100 / (100 + b.armor);   // 100 armor = half damage
    me.spdMul = (1 + b.speed) * (1 - b.weight); me.stMul = (1 + b.stam) * (bf.breath > 0 ? 2 : 1); me.leech = b.leech; me.luck = b.luck;
    me.hp = Math.min(me.hp, me.maxHp); me.flasks = Math.min(me.flasks, me.maxFlasks);
  }
  // timed effects: potion buffs, regeneration, admin effects (burn, blindness, confusion)
  function tickEffects(dt) {
    const bf = me.buffs; let re = false;
    for (const k in bf) { bf[k] -= dt; if (bf[k] <= 0) { delete bf[k]; re = true; if (k !== 'regen') message(`${{ might: 'Might', iron: 'Ironskin', breath: 'Stamina tonic' }[k] || k} wore off.`); } }
    if (bf.regen > 0 && !me.downed) me.hp = Math.min(me.maxHp, me.hp + me.maxHp * 0.03 * dt);
    if (re) recalcStats();
    if (me.burnT > 0) {
      me.burnT -= dt; me.burnAcc = (me.burnAcc || 0) + dt;
      if (me.burnAcc > 0.5) { me.burnAcc = 0; if (!me.god && !me.downed) { me.hp -= me.maxHp * 0.03; HC.FX.spawn('ember', me.pos.clone().setY(me.pos.y + 1)); if (me.hp <= 0) { me.hp = 0; goDown(); } } }
    }
    if (me.confuseT > 0) me.confuseT -= dt;
    if (me.blindT > 0) { me.blindT -= dt; $('blind').style.opacity = Math.min(1, me.blindT); } else $('blind').style.opacity = 0;
    if (me.infSt) me.st = me.maxSt;
  }

  // ================================================================ interactables
  G.inter = [];
  function addInter(o) { G.inter.push(o); return o; }
  function note(id, pos, label, extra, cond) { return addInter({ pos, r: 2.6, label: label || 'Read', cond, act: () => { openNote(id); if (extra) extra(); } }); }
  const gy = (x, z) => new V3(x, W.heightAt(x, z), z);
  function buildInteractables() {
    const P = W.cellPos;
    const hf = (i, d = 3.8) => { const h = W.houses[i]; return h.position.clone().add(new V3(Math.sin(h.rotation.y) * d, 0, Math.cos(h.rotation.y) * d)); };
    // ---- village
    note('ledger', hf(0), 'Read the ledger on the doorstep');
    note('drawing', hf(3), "Pick up a child's drawing");
    note('wardens', gy(-7.5, 15.5), 'Read the page pinned to the statue', () => { if (!G.flags.wardens) event({ t: 'flag', k: 'wardens', v: true }); });
    addInter({ pos: gy(0, -24.6), r: 2.6, label: 'Knock on the church door', act: () => {
      A.play('knock', new V3(0, 2, -25.5), 1); setTimeout(() => A.play('knock', new V3(0, 2, -27), 0.9), 1500);
      openNote('church'); setTimeout(ringBell, 2500);
    } });
    note('keeper', gy(30, -19), "Read the groundskeeper's note");
    note('gallows', gy(W.GALLOWS.x + 2, W.GALLOWS.z + 3), 'Read the sentence');
    note('tower', gy(W.TOWER.x, W.TOWER.z - 4.5), 'Read the watch log');
    const cr = W.crypt.rotation.y, front = new V3(Math.sin(cr), 0, Math.cos(cr));
    addInter({ pos: W.CRYPT.clone().addScaledVector(front, 1.6), r: 2.6, label: () => G.flags.key ? 'Descend into the crypt' : 'Try the crypt gate', act: () => {
      if (!G.flags.key) { A.play('knock', W.CRYPT.clone().setY(-1), 1.2); message('Locked. Something on the other side knocks back.'); return; }
      if (!G.flags.cryptOpen) event({ t: 'flag', k: 'cryptOpen', v: true });
      A.play('door', null, 1); travel(P('catacombs', 7, 6), 0);
    } });
    addInter({ pos: P('catacombs', 7, 3), r: 3, label: 'Climb back to the graveyard', act: () => travel(W.CRYPT.clone().addScaledVector(front, 3), cr) });
    // ---- forest
    note('plaque', gy(-186, 1.4), 'Read the plaque');
    note('hermitNote', gy(W.HERMIT.x - 2, W.HERMIT.z - 5), "Read the hermit's journal", () => { if (!G.flags.key) event({ t: 'flag', k: 'key', v: true, msg: `${me.name} found the Rusted Crypt Key under the hermit's bed.` }); });
    note('edda', gy(W.HEART.x + 3, W.HEART.z + 3), 'Read the inscription', null, () => G.flags.dead_sentinel);
    G.whisper = { pos: W.WHISPER.clone(), done: false };
    // ---- crater & cathedral
    note('maudNote', gy(W.SHRINES.rim.pos.x + 3, W.SHRINES.rim.pos.z + 3), "Read Sister Maud's prayer card");
    addInter({ pos: gy(W.CATH_DOOR.x - 2, W.CATH_DOOR.z), r: 4, label: 'Enter the Sunken Cathedral', act: () => { A.play('door', null, 1); travel(P('cathedral', 22, 4), 0); } });
    addInter({ pos: P('cathedral', 22, 1), r: 3, label: 'Leave the cathedral', act: () => travel(gy(W.CATH_DOOR.x - 6, W.CATH_DOOR.z), -Math.PI / 2) });
    note('hymnal', P('cathedral', 4, 26), 'Read the waterlogged hymnal');
    note('calloway', P('cathedral', 40, 26), "Read Calloway's sermon");
    // ---- catacombs
    note('decree', P('catacombs', 38, 14), 'Read the decree');
    note('physician', P('catacombs', 10, 22), "Read the physician's record");
    note('brotherNote', P('catacombs', 7, 18), 'Read the scratches on the wall');
    // ---- citadel
    addInter({ pos: gy(0, W.GATEHOUSE.z + 7), r: 3.5, label: () => G.flags.citadelOpen ? 'The gate stands open' : 'Present the Sigils', cond: () => !G.flags.citadelOpen, act: () => {
      if (sigilCount() < 3) { talk('hollis', HC.NPCS.hollis.gateClosed); return; }
      event({ t: 'flag', k: 'citadelOpen', v: true, msg: 'Three Sigils flare. The Citadel gate grinds open.' });
    } });
    note('oath', gy(W.CITADEL.x + 20, W.CITADEL.z - 22), 'Read the oath carved in the wall');
    note('corvaneLetter', gy(W.KEEP_DOOR.x + 3, W.KEEP_DOOR.z + 3), 'Read the letter', null, () => G.flags.dead_corvane);
    addInter({ pos: gy(W.KEEP_DOOR.x, W.KEEP_DOOR.z + 1.5), r: 3, label: () => G.flags.dead_corvane ? 'Descend into the King\'s Below' : 'The keep door is barred', act: () => {
      if (!G.flags.dead_corvane) { message('The door does not move. Something in the courtyard still holds the key.'); return; }
      A.play('door', null, 1); travel(P('below', 7, 6), 0);
    } });
    addInter({ pos: P('below', 7, 3), r: 3, label: 'Climb back to the keep', act: () => travel(gy(W.KEEP_DOOR.x, W.KEEP_DOOR.z + 5), 0) });
    // ---- the King's Below
    note('stones', P('below', 30, 3), 'Read the wall of names');
    addInter({ pos: P('below', 44, 80), r: 2.4, label: "Read the King's final record", cond: () => G.flags.dead_king, act: () => { openNote('finalRecord'); me.readFinal = true; } });
    addInter({ pos: W.SEAL.clone().add(new V3(0, 0, -4.5)), r: 3.5, label: 'Place your hands upon the Seal', cond: () => G.flags.dead_king && !G.ended, act: () => {
      if (!me.readFinal) { message('Read the record by the throne first.'); return; } unlockPointer(); show('choice');
    } });
    // fog walls
    [['catacombs', 'brother'], ['cathedral', 'bell'], ['below', 'king']].forEach(([k, f]) => {
      const cx = k === 'cathedral' ? 22 : 39, cz = k === 'cathedral' ? 57 : 55;
      addInter({ pos: P(k, cx, cz), r: 3, label: 'Pass through the fog', cond: () => W.fogWall === f, act: () => travel(P(k, cx, cz + 4), 0) });
    });
    // shrines
    Object.entries(W.SHRINES).forEach(([id, s]) => addInter({ pos: s.pos.clone().setY(s.dungeon ? 0 : W.heightAt(s.pos.x, s.pos.z)), r: 2.8, label: 'Rest at the ember', act: () => restAtShrine(id) }));
    // lost toys (optional collectibles)
    const toyPos = { toy1: gy(-50, 22), toy2: gy(-315, 95), toy3: gy(W.CITADEL.x - 30, W.CITADEL.z + 8), toy4: gy(W.CRATER.x - 40, W.CRATER.z + 30), toy5: P('catacombs', 14, 25) };
    HC.TOYS.forEach(t => {
      const pos = toyPos[t.id];
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), new THREE.MeshBasicMaterial({ color: 0xd8c9a6, toneMapped: false }));
      m.position.copy(pos).setY(pos.y + 0.5); scene.add(m); t.mesh = m;
      addInter({ pos, r: 2.2, label: `Pick up ${t.name.toLowerCase()}`, cond: () => !me.toys.has(t.id), act: () => {
        me.toys.add(t.id); m.visible = false; A.play('pickup'); message(`${t.name}. (${me.toys.size}/5)`);
        if (me.toys.size === 5) { grantRelic('charm'); }
      } });
    });
  }
  function travel(p, yaw) {
    $('fade').classList.add('on'); me.act = 'cine';
    setTimeout(() => { me.pos.copy(p); me.pos.y = W.heightAt(p.x, p.z); me.yaw = yaw; me.camYaw = yaw; me.lock = null; startAct('idle', 0); $('fade').classList.remove('on'); }, 900);
  }
  G.travel = travel;
  function grantRelic(id) {
    if (me.relics.has(id)) return;
    me.relics.add(id); A.play('pickup');
    const R = HC.RELICS[id]; message(`Relic obtained: ${R[0]} - ${R[1]}`);
    recalcStats(); if (id === 'shard') { me.hp += 20; me.flasks++; } if (id === 'charm') me.flasks++;
  }
  HC.RELICS = { veil: ["Mourner's Veil", 'The dead notice you from closer.'], ring: ['Ashen Ring', 'Heavy attacks [Q] unleash a wave of embers.'],
    bellshard: ['Shard of the Great Bell', 'Blocking costs half the stamina.'], oathbrand: ['Oathbrand', 'Your blows land 15% harder.'],
    shard: ['Crown Shard', '+1 Ember Flask, +20 health.'], charm: ["Children's Charm", 'Five small things, remembered. +1 Ember Flask.'] };

  // ---- shrines: rest, level up, travel
  function restAtShrine(id) {
    const s = W.SHRINES[id];
    me.found.add(id);
    me.hp = me.maxHp; me.flasks = me.maxFlasks; me.st = me.maxSt;
    me.spawn = s.pos.clone().add(new V3(0, 0, 2.5));
    startAct('rest', 2.2); A.play('shrine', s.pos, 1); HC.FX.spawn('ember', s.pos.clone().setY((s.dungeon ? 0 : W.heightAt(s.pos.x, s.pos.z)) + 0.6));
    G.shrineAt = id; renderShrineMenu(); show('shrineMenu'); unlockPointer();
  }
  function renderShrineMenu() {
    const cost = 80 + (me.level - 1) * 55;
    const stat = (k, label, val) => `<button data-lvl="${k}" ${me.ash < cost ? 'disabled' : ''}>${label} <span class="small">(${val})</span></button>`;
    $('shrineBody').innerHTML = `<p class="small">Health, stamina and flasks restored. Ashes: <b>${me.ash}</b> &nbsp; Level ${me.level} &nbsp; Next level: ${cost}</p>
      <div class="row">${stat('vig', 'Vigor +12 HP', me.vig)}${stat('end', 'Endurance +10 ST', me.end)}${stat('str', 'Strength +6% dmg', me.str)}</div>
      <h3>Travel to an ember you have woken</h3><div class="row">${Object.entries(W.SHRINES).filter(([id]) => me.found.has(id) && id !== G.shrineAt).map(([id, s]) => `<button data-go="${id}">${s.name}</button>`).join('') || '<span class="small">No other embers woken yet.</span>'}</div>
      <div id="shopBox"></div>`;
    HC.Items.renderShop($('shopBox'));
    $('shrineBody').querySelectorAll('[data-lvl]').forEach(b => b.onclick = () => { if (me.ash < cost) return; me.ash -= cost; me.level++; me[b.dataset.lvl]++; recalcStats(); me.hp = me.maxHp; me.st = me.maxSt; A.play('pickup', null, 0.6); renderShrineMenu(); });
    $('shrineBody').querySelectorAll('[data-go]').forEach(b => b.onclick = () => { const s = W.SHRINES[b.dataset.go]; show('shrineMenu', false); lock(); me.spawn = s.pos.clone().add(new V3(0, 0, 2.5)); travel(me.spawn, 0); });
  }

  // ================================================================ notes, NPCs, dialogue
  function openNote(id) {
    const n = HC.NOTES[id]; if (!n) return;
    me.notesRead.add(id);
    $('readerTitle').textContent = n.title; $('readerText').innerHTML = n.text;
    show('reader'); unlockPointer(); A.play('page', null, 0.6);
  }
  function talk(npc, line) { G.dialogQueue = []; $('dlgName').textContent = HC.NPCS[npc].name; $('dlgText').textContent = line; show('dialog'); unlockPointer(); }
  function nextDialog() { const l = G.dialogQueue.shift(); $('dlgText').textContent = l; }
  G.npcIdx = {};
  function talkNPC(id) {
    const N = HC.NPCS[id], i = G.npcIdx[id] || 0;
    let line;
    if (id === 'pilgrim' && G.flags.dead_king) line = N.after.kingDead;
    else if (id === 'pilgrim' && sigilCount() === 3 && !G.saidS3) { line = N.after.sigils3; G.saidS3 = true; }
    else if (id === 'pilgrim' && G.players.size > 1 && i > 2 && !G.saidCoop) { line = N.coop; G.saidCoop = true; }
    else { line = N.lines[i % N.lines.length]; G.npcIdx[id] = i + 1; }
    if (id === 'pilgrim' && i === 1 && !G.flags.wardens) event({ t: 'flag', k: 'wardens', v: true });
    talk(id, line);
  }
  G.npcRigs = [];
  function buildNPCs() {
    const mk = (id, asset, pos, faceTo, idle, talkClip, sitDrop = 0) => {
      const rig = new HC.Rig(asset);
      rig.play(idle, { at: Math.random() });
      rig.root.position.set(pos.x, W.heightAt(pos.x, pos.z) - sitDrop, pos.z); rig.root.rotation.y = Math.atan2(faceTo.x - pos.x, faceTo.z - pos.z);
      scene.add(rig.root); W.addCircle(pos.x, pos.z, 0.6);
      rig.idle = idle; rig.talk = talkClip; rig.npc = id;
      addInter({ pos: pos.clone(), r: 2.8, label: `Speak with ${HC.NPCS[id].name}`, act: () => { talkNPC(id); rig.play(talkClip); rig.talkT = 6; } });
      if (id === 'hollis') rig.attach('sword', 'hand_r', { mode: 'grip' });
      G.npcRigs.push(rig);
      return rig;
    };
    mk('pilgrim', 'npc_pilgrim', W.PILGRIM, W.SHRINES.village.pos, 'Sitting_Idle_Loop', 'Sitting_Talking_Loop');
    mk('hermit', 'npc_hermit', new V3(W.HERMIT.x + 1, 0, W.HERMIT.z - 2), W.SHRINES.hermit.pos, 'Sitting_Idle_Loop', 'Sitting_Talking_Loop');
    mk('maud', 'npc_maud', new V3(W.SHRINES.rim.pos.x + 2.5, 0, W.SHRINES.rim.pos.z - 2), W.CRATER, 'Idle_Loop', 'Idle_Talking_Loop');
    mk('hollis', 'npc_hollis', new V3(W.SHRINES.gate.pos.x - 3, 0, W.SHRINES.gate.pos.z - 2), new V3(0, 0, -200), 'Sword_Idle', 'Idle_Talking_Loop');
  }
  function updateNPCs(dt) {
    G.npcRigs.forEach(r => {
      if (r.root.position.distanceTo(camera.position) > 90) return;
      if (r.talkT > 0) { r.talkT -= dt; if (r.talkT <= 0) r.play(r.idle, { fade: 0.5 }); }
      r.update(dt);
    });
  }

  // ================================================================ flags → world, objectives
  function applyFlagsVisuals() {
    W.gateOpen = !!G.flags.gateOpen; W.citadelOpen = !!G.flags.citadelOpen;
    if (W.cryptGate) W.cryptGate.position.y = W.heightAt(W.CRYPT.x, W.CRYPT.z) + (G.flags.cryptOpen ? 3.4 : 0);
  }
  function objective() {
    const f = G.flags, O = HC.OBJECTIVES;
    if (G.ended) return [O.done, []];
    if (f.dead_king) return [O.seal, [W.SEAL]];
    if (f.gateOpen) return [O.king, [W.cellPos('below', 40, 70)]];
    if (f.dead_corvane) return [O.keep, [W.KEEP_DOOR]];
    if (f.citadelOpen) return [O.corvane, [W.CITADEL]];
    if (sigilCount() === 3) return [O.citadel, [W.GATEHOUSE]];
    if (f.wardens || f.key || sigilCount() > 0) {
      const t = [];
      if (!f.sigil_tears) t.push(W.HEART); if (!f.sigil_bell) t.push(W.CATH_DOOR); if (!f.sigil_silence) t.push(f.key ? W.CRYPT : W.HERMIT);
      const left = ['tears', 'silence', 'bell'].filter(s => !f['sigil_' + s]).length;
      return [`${O.wardens} <span class="small">(${3 - left}/3)</span>` + (!f.key && !f.sigil_silence ? '<br><span class="small">The crypt key is with the Hermit at the edge of Blackroot.</span>' : ''), t];
    }
    return [O.start, [W.SHRINES.village.pos, W.PILGRIM]];
  }

  // ================================================================ puzzle (host)
  const PLATE_WINDOW = 10;
  function puzzleHost() {
    if (G.flags.gateOpen || !W.plates) return;
    W.plates.forEach((pl, i) => {
      const on = [...G.players.values()].some(p => !p.downed && p.pos.distanceTo(pl.pos) < 1.5);
      if (on && !pl.pressed) { pl.lastT = G.t; event({ t: 'plate', i, on: true }); }
      if (!on && pl.pressed) event({ t: 'plate', i, on: false });
      pl.pressed = on;
    });
    const [a, b] = W.plates, now = G.t;
    if ((a.pressed && b.pressed) || (a.pressed && b.lastT && now - b.lastT < PLATE_WINDOW) || (b.pressed && a.lastT && now - a.lastT < PLATE_WINDOW))
      event({ t: 'flag', k: 'gateOpen', v: true, msg: 'Both runes burn. Somewhere ahead, iron groans.' });
  }
  function updatePlates() {
    if (!W.plates) return;
    W.plates.forEach(pl => { const on = G.flags.gateOpen || pl.vis || (pl.visT && G.t - pl.visT < PLATE_WINDOW); pl.rune.material.color.setHex(on ? 0xff7a30 : 0x331a10); pl.light.intensity = on ? 2.5 : 0; });
  }

  // ================================================================ endings
  function showEnding(choice, by) {
    G.ended = true; unlockPointer(); show('choice', false);
    const E = HC.ENDINGS[choice]; let paras = E.text.slice();
    if (choice === 'crown' && G.players.size > 1) paras[0] = `${esc(by)} lifts the crown. ` + paras[0];
    if (me.knowName) paras.push(HC.SECRET_ENDING_LINE);
    if (me.toys.size === 5) paras.push(HC.TOYS_ENDING_LINE);
    A.bossMusic(false);
    if (choice === 'destroy') { W.skyMat.uniforms.horizon.value.set(0x8a6a50); W.skyMat.uniforms.zenith.value.set(0x2a3a5a); }
    $('fade').classList.add('on');
    setTimeout(() => {
      $('endTitle').textContent = E.title;
      $('endText').innerHTML = paras.map(p => `<p>${p}</p>`).join('') + `<p class="small">Chosen by ${esc(by)}. Level ${me.level}. ${me.notesRead.size} records read. Thank you for playing THE HOLLOW CROWN.</p>`;
      show('ending'); $('fade').classList.remove('on'); A.play(choice === 'destroy' ? 'shrine' : 'bell', null, 0.8);
    }, 1600);
  }

  // ================================================================ horror director (local, per player)
  function horror(dt) {
    const H = G.horror, outside = me.pos.x < 1500, zone = me.zone;
    if (G.cine || G.activeBoss) return;
    const alone = [...G.players.values()].every(p => p.local || p.pos.distanceTo(me.pos) > 25);
    if (!G.app) { const ap = new HC.Rig('watcher'); ap.root.visible = false; scene.add(ap.root); ap.play('Idle_Loop', { at: 0.3 }); ap.update(0.01); ap.frozen = true; G.app = { rig: ap, on: false }; }
    const app = G.app;
    if (app.on) {
      const d = app.rig.root.position.distanceTo(me.pos); app.life -= dt;
      if (d < 36 || app.life <= 0) { app.on = false; app.rig.root.visible = false; if (d < 36) A.play('whisper', app.rig.root.position, 0.6); }
      app.rig.root.rotation.y = Math.atan2(me.pos.x - app.rig.root.position.x, me.pos.z - app.rig.root.position.z);
    } else if (outside && (H.appT -= dt) <= 0) {
      H.appT = 45 + Math.random() * 60;
      const a = me.camYaw + (Math.random() - 0.5) * 0.9, r = 48 + Math.random() * 22, x = me.pos.x + Math.sin(a) * r, z = me.pos.z + Math.cos(a) * r;
      if (Math.hypot(x, z) < 590 && W.heightAt(x, z) > W.waterAt(x, z)) { app.rig.root.position.set(x, W.heightAt(x, z), z); app.rig.root.visible = true; app.on = true; app.life = 30; }
    }
    if ((H.stepT -= dt) <= 0) {
      H.stepT = 35 + Math.random() * 50;
      if (alone) {
        const side = Math.random() < 0.5 ? 1 : -1, back = new V3(-Math.sin(me.yaw), 0, -Math.cos(me.yaw)), right = new V3(-Math.cos(me.yaw), 0, Math.sin(me.yaw));
        const start = me.pos.clone().addScaledVector(back, 12 + Math.random() * 6).addScaledVector(right, side * 6);
        for (let i = 0; i < 8; i++) A.play('step', start.clone().addScaledVector(right, -side * i * 0.8).setY(me.pos.y), 1.4, { delay: i * 0.48, wet: zone === 'village' });
      }
    }
    if ((H.mimicT -= dt) <= 0) {
      H.mimicT = 70 + Math.random() * 80;
      if (zone === 'forest' || !outside) {
        const a = Math.random() * Math.PI * 2, p = me.pos.clone().add(new V3(Math.cos(a) * 22, 1, Math.sin(a) * 22));
        if (![...G.players.values()].some(o => !o.local && o.pos.distanceTo(p) < 15)) A.play(Math.random() < 0.6 ? 'ping' : 'whisper', p, 1.0);
      }
    }
    if (outside && (H.bellT -= dt) <= 0) { H.bellT = 100 + Math.random() * 80; ringBell(); }
    if (zone === 'forest') {
      const fr = new THREE.Frustum(); fr.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      W.statues.forEach(s => {
        if (s.ring && !G.flags.dead_sentinel) return;
        const sp = s.mesh.position, d = sp.distanceTo(me.pos);
        if (d < 95 && fr.containsPoint(sp.clone().setY(sp.y + 2))) { s.unseen = 0; return; }
        s.unseen += dt;
        if (d < 70 && d > 9 && s.unseen > 4 + Math.random() * 6) {
          s.unseen = 0;
          const dir = me.pos.clone().sub(sp).setY(0).normalize(), step = Math.min(d - 8, 2 + Math.random() * 3), nx = sp.x + dir.x * step, nz = sp.z + dir.z * step;
          if (W.pathDist(nx, nz) > 1.2 || Math.random() < 0.3) { sp.set(nx, W.heightAt(nx, nz) - 0.1, nz); s.col.x = nx; s.col.z = nz; s.mesh.rotation.y = Math.atan2(me.pos.x - nx, me.pos.z - nz); if (d < 25 && Math.random() < 0.4) A.play('stone', sp, 0.35); }
        }
      });
    }
    if (!G.whisper.done && me.pos.distanceTo(G.whisper.pos) < 7) {
      if (![...G.players.values()].some(p => !p.local && p.pos.distanceTo(me.pos) < 30)) { G.whisper.done = true; me.knowName = true; A.play('whisper', null, 1); setTimeout(() => openNote('whisper'), 800); }
    }
    // the crater sings on the hour: Calloway's bell
    if (zone === 'crater' && Math.floor(G.t / 75) !== G.lastToll) { G.lastToll = Math.floor(G.t / 75); A.play('bell', W.CRATER.clone().setY(-10), 1.6, { rev: 1.5 }); }
  }
  function ringBell() {
    if (!W.bell) return;
    G.bellSwing = 6;
    const audible = me && me.pos.x < 1500;
    A.play('bell', W.BELL_POS, audible ? 2.2 : 0.25, { rev: 1.5 }); A.play('bell', W.BELL_POS, audible ? 2.0 : 0.2, { delay: 3.4, rev: 1.5 });
    if (me && audible && !G.bellNoted) { G.bellNoted = true; subtitle('The church bell rings. There is no rope.'); }
  }
  function doPing() {
    const f = new V3(); camera.getWorldDirection(f);
    const p = camera.position.clone();
    for (let i = 0; i < 160; i++) { p.addScaledVector(f, 0.5); if (p.y < W.heightAt(p.x, p.z) || (p.x > 1500 && !W.walkable(p.x, p.z))) break; }
    p.y = W.heightAt(p.x, p.z);
    event({ t: 'ping', pos: [p.x, p.y, p.z], slot: me.slot });
  }

  // ================================================================ map & compass
  let mapBase = null;
  function buildMap() {
    const S2 = 512, c = document.createElement('canvas'); c.width = c.height = S2;
    const g = c.getContext('2d'), im = g.createImageData(S2, S2), d = im.data;
    for (let y = 0; y < S2; y++) for (let x = 0; x < S2; x++) {
      const wx = (x / S2 - 0.5) * 1300, wz = (y / S2 - 0.5) * 1300, h = W.heightAt(wx, wz), zn = W.zoneAt(wx, wz), i = (y * S2 + x) * 4;
      let r = 60, gg = 56, b = 48;
      if (zn === 'forest') { r = 34; gg = 46; b = 32; } else if (zn === 'citadel') { r = 58; gg = 54; b = 52; } else if (zn === 'crater') { r = 42; gg = 44; b = 46; }
      const sh = Math.max(0.5, Math.min(1.6, 1 + (h - W.heightAt(wx - 4, wz - 4)) * 0.15)) * (0.75 + Math.min(h, 90) / 250);
      if (h < W.waterAt(wx, wz)) { r = 18; gg = 26; b = 34; }
      d[i] = r * sh; d[i + 1] = gg * sh; d[i + 2] = b * sh; d[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    g.strokeStyle = 'rgba(150,120,80,0.8)'; g.lineWidth = 2;
    const M = (x, z) => [(x / 1300 + 0.5) * S2, (z / 1300 + 0.5) * S2];
    W.PATHS.forEach(p => { g.beginPath(); p.forEach(([x, z], i) => { const [mx, my] = M(x, z); i ? g.lineTo(mx, my) : g.moveTo(mx, my); }); g.stroke(); });
    g.fillStyle = '#d8cfbd'; g.font = '13px Cinzel, serif'; g.textAlign = 'center';
    [['The Drowned Village', 0, 30], ['Blackroot Forest', -380, 120], ['The Sunken Cathedral', 430, 190], ['The Ashen Citadel', 0, -590], ['Gallows Hill', 112, -130], ['Old Watchtower', 205, 285], ['Hamlet of Ash', -130, 225]]
      .forEach(([t, x, z]) => { const [mx, my] = M(x, z); g.fillText(t, mx, my); });
    mapBase = c; G.mapM = M;
  }
  function drawMap() {
    const cv = $('mapCanvas'), g = cv.getContext('2d'), M = G.mapM;
    g.drawImage(mapBase, 0, 0);
    Object.entries(W.SHRINES).forEach(([id, s]) => { if (s.dungeon || !me.found.has(id)) return; const [x, y] = M(s.pos.x, s.pos.z); g.fillStyle = '#ff7a30'; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); });
    objective()[1].forEach(p => { if (p.x > 1500) return; const [x, y] = M(p.x, p.z); g.strokeStyle = '#c9a35a'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y - 7); g.lineTo(x + 7, y); g.lineTo(x, y + 7); g.lineTo(x - 7, y); g.closePath(); g.stroke(); });
    G.players.forEach(p => {
      const pp = p.pos.x > 1500 ? null : p.pos; if (!pp) return;
      const [x, y] = M(pp.x, pp.z); g.fillStyle = '#' + new THREE.Color(HC.PLAYER_COLORS[p.slot % 4]).offsetHSL(0, 0.3, 0.25).getHexString();
      g.save(); g.translate(x, y); g.rotate(-p.yaw + Math.PI); g.beginPath(); g.moveTo(0, -8); g.lineTo(5, 6); g.lineTo(-5, 6); g.closePath(); g.fill(); g.restore();
    });
    $('mapNote').textContent = me.pos.x > 1500 ? `You are underground: ${W.areaName(me.zone)}.` : W.areaName(me.zone);
  }
  function compass() {
    const el = $('compass'), w = el.clientWidth || 600, fov = 2.2;
    let html = '';
    const put = (bearing, cls, txt) => { const rel = HC.angDiff(me.camYaw, bearing); if (Math.abs(rel) > fov / 2) return; html += `<span class="${cls}" style="left:${(0.5 - rel / fov) * 100}%">${txt}</span>`; };
    [[Math.PI, 'N'], [Math.PI / 2, 'E'], [0, 'S'], [-Math.PI / 2, 'W']].forEach(([b, t]) => put(b, 'cd', t));
    if (me.pos.x < 1500) {
      objective()[1].forEach(p => { if (p.x < 1500 && p.distanceTo(me.pos) > 6) put(Math.atan2(p.x - me.pos.x, p.z - me.pos.z), 'co', '◆'); });
      G.players.forEach(p => { if (!p.local && p.pos.x < 1500) put(Math.atan2(p.pos.x - me.pos.x, p.pos.z - me.pos.z), 'cp', '●'); });
    }
    el.innerHTML = html;
  }

  // ================================================================ HUD
  function message(t) { const d = document.createElement('div'); d.textContent = t; $('messages').appendChild(d); setTimeout(() => d.remove(), 5200); while ($('messages').children.length > 4) $('messages').firstChild.remove(); }
  G.message = message;
  function floatText(t) { const d = document.createElement('div'); d.className = 'float'; d.textContent = t; $('floats').appendChild(d); setTimeout(() => d.remove(), 1800); }
  function subtitle(t) { $('subtitle').textContent = t; clearTimeout(G.subT); G.subT = setTimeout(() => $('subtitle').textContent = '', 5000); }
  function chatLine(from, text, tag, color) { const d = document.createElement('div'); d.innerHTML = `${tag ? `<i class="rtag" style="color:${esc(color || '#c9a35a')}">[${esc(tag)}]</i> ` : ''}<b>${esc(from)}:</b> ${esc(text)}`; $('chatLog').appendChild(d); setTimeout(() => d.remove(), 12000); }
  function areaBanner(text) { const el = $('areaTitle'); el.querySelector('h2').textContent = text; el.classList.add('hidden'); void el.offsetWidth; el.classList.remove('hidden'); clearTimeout(G.bannerT); G.bannerT = setTimeout(() => el.classList.add('hidden'), 5000); }
  let hudT = 0;
  function hud(dt) {
    $('hpFill').style.width = (me.hp / me.maxHp * 100) + '%';
    $('stFill').style.width = Math.max(0, me.st / me.maxSt * 100) + '%';
    document.querySelector('.bar.hp').style.width = Math.min(460, 160 + me.maxHp * 0.6) + 'px';
    document.querySelector('.bar.st').style.width = (120 + me.maxSt) + 'px';
    compass();
    hudT -= dt; if (hudT > 0) return; hudT = 0.2;
    $('flasks').innerHTML = Array.from({ length: me.maxFlasks }, (_, i) => `<span class="${i < me.flasks ? '' : 'empty'}"></span>`).join('');
    const sig = ['tears', 'silence', 'bell', 'oath'].filter(s => G.flags['sigil_' + s]).map(s => `<span class="sig">Sigil of ${{ tears: 'Tears', silence: 'Silence', bell: 'the Bell', oath: 'the Oath' }[s]}</span>`).join('');
    $('relics').innerHTML = [...me.relics].map(r => `<span>${HC.RELICS[r][0]}</span>`).join('') + (G.flags.key ? '<span>Crypt Key</span>' : '') + sig;
    $('ashes').textContent = `${me.ash} ashes · Lv ${me.level}${me.armorVal ? ' · armor ' + me.armorVal : ''}`;
    HC.Items.hud();
    $('objective').innerHTML = `<small>OBJECTIVE</small>${objective()[0]}`;
    $('area').textContent = W.areaName(me.zone);
    $('party').innerHTML = [...G.players.values()].filter(p => !p.local).map(p => `<div class="pm ${p.downed ? 'down' : ''}"><span>${esc(p.name)}${p.downed ? ' (fallen)' : ''}</span><div class="bar"><i style="width:${p.hp / p.maxHp * 100}%;background:#8a2a22"></i></div></div>`).join('');
    if (G.activeBoss) { const b = G.bossE[G.activeBoss]; $('bossFill').style.width = (b.hp / b.maxHp * 100) + '%'; }
    show('crosshair', me.fp || !!(HC.STYLES[me.avatar.style] || {}).ranged);
    if (me.downed) $('bleed').textContent = `(${Math.ceil(me.bleed)})`;
  }

  // ================================================================ main loop
  let last = 0; const zoneShown = {};
  const ENV = {
    village: { fog: 0x15171c, d: 0.02, hemi: 0.5, moon: 0.45 }, wilds: { fog: 0x16181d, d: 0.017, hemi: 0.5, moon: 0.45 },
    forest: { fog: 0x0d100e, d: 0.032, hemi: 0.3, moon: 0.22 }, crater: { fog: 0x10141a, d: 0.022, hemi: 0.38, moon: 0.3 },
    citadel: { fog: 0x1a1614, d: 0.016, hemi: 0.45, moon: 0.5 },
    catacombs: { fog: 0x040302, d: 0.055, hemi: 0.035, moon: 0 }, brotherArena: { fog: 0x03040a, d: 0.035, hemi: 0.06, moon: 0 },
    nave: { fog: 0x05070a, d: 0.035, hemi: 0.07, moon: 0 }, bellArena: { fog: 0x06080c, d: 0.025, hemi: 0.1, moon: 0 },
    below: { fog: 0x040302, d: 0.05, hemi: 0.035, moon: 0 }, kingArena: { fog: 0x0a0302, d: 0.028, hemi: 0.09, moon: 0 },
  };
  const AMB = { village: 'village', wilds: 'village', forest: 'forest', crater: 'forest', citadel: 'village', catacombs: 'dungeon', nave: 'dungeon', below: 'dungeon', brotherArena: 'arena', bellArena: 'arena', kingArena: 'arena' };
  const tmpC = new THREE.Color();
  // dynamic resolution: keep ~45+ fps on modest GPUs by scaling the render resolution
  const DR = { scale: Math.min(window.devicePixelRatio, 1.25), acc: 0, n: 0 };
  const FPS = { acc: 0, n: 0 };
  function dynRes(rawDt) {
    FPS.acc += rawDt; FPS.n++;
    if (FPS.acc > 0.5) { if (SV().showFps) $('fps').textContent = `${Math.round(FPS.n / FPS.acc)} fps · ${Math.round(DR.scale * 100)}%`; FPS.acc = 0; FPS.n = 0; }
    if (SV().renderScale !== 'auto') return;
    DR.acc += rawDt; DR.n++;
    if (DR.acc < 2) return;
    const avg = DR.acc / DR.n; DR.acc = 0; DR.n = 0;
    let s = DR.scale;
    // phones have 2-3x pixel-dense screens: let automatic resolution climb to 2x there, 1.25x elsewhere
    const top = Math.min(window.devicePixelRatio, HC.phoneScreen ? 2 : 1.25), bottom = HC.phoneScreen ? 0.9 : 0.55;
    if (avg > 1 / 40 && s > bottom) s = Math.max(bottom, s - 0.1);
    else if (avg < 1 / 55 && s < top) s = Math.min(top, s + 0.1);
    if (Math.abs(s - DR.scale) > 0.01) {
      DR.scale = s; renderer.setPixelRatio(s); renderer.setSize(innerWidth, innerHeight);
      if (composer) { composer.setPixelRatio ? composer.setPixelRatio(s) : 0; composer.setSize(innerWidth, innerHeight); }
    }
  }
  function loop(now) {
    requestAnimationFrame(loop);
    const raw = (now - last) / 1000;
    if (raw > 0 && raw < 0.5) dynRes(raw);
    let dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (G.hitstop > 0) { G.hitstop -= dt; dt *= 0.15; }
    dt *= G.timeScale || 1;
    G.t += dt; update(dt);
    if (composer) { finalPass.uniforms.time.value = G.t % 100; finalPass.uniforms.dmg.value = Math.min(1, G.dmgFlash || 0); composer.render(); }
    else renderer.render(scene, camera);
  }
  function update(dt) {
    if (!me) return;
    controlLocal(dt); tickEffects(dt); HC.Items.update(dt, G.t);
    G.players.forEach(p => {
      if (!p.local) { const prev = p.pos.clone(); p.pos.lerp(p.netPos, 1 - Math.exp(-12 * dt)); p.vel.copy(p.pos).sub(prev).divideScalar(Math.max(dt, 1e-3)); p.yaw += HC.angDiff(p.yaw, p.netYaw) * Math.min(1, dt * 12); p.avatar.actT += dt; }
      p.zone = W.zoneAt(p.pos.x, p.pos.z); p.avatar.pos.copy(p.pos); p.avatar.yaw = p.yaw; p.avatar.update(dt);
    });
    const host = Net.isHost();
    const ai = host ? [...G.players.values()].map(p => ({ id: p.id, pos: p.pos, vel: p.vel, yaw: p.yaw, alive: !p.downed && p.hp > 0 && p.act !== 'cine', look: p.look, stealth: p.local && me.relics.has('veil') ? 0.6 : 1 })) : null;
    G.enemies.forEach(e => {
      if (host) {
        const near = e.boss || e.type === 'watcher' || ai.some(p => p.pos.distanceTo(e.pos) < 90);
        if (near && (!G.cine || e.boss) && !G.peace) e.hostUpdate(dt, ai);
      } else e.clientUpdate(dt);
      const d = e.pos.distanceTo(camera.position);
      const range = (me.pos.x > 1500 ? 60 : (me.zone === 'forest' ? 60 : 85)) * (W.viewMul || 1);   // beyond this the fog has swallowed them
      if (d < range || (e.boss && G.activeBoss === e.type)) {
        // animation LOD: distant enemies update their skeleton every 2nd / 3rd frame
        const skip = SV().animLod && !e.boss ? (d > 45 ? 3 : d > 22 ? 2 : 1) : 1;
        e.lodAcc = (e.lodAcc || 0) + dt; e.lodN = ((e.lodN || 0) + 1) % skip;
        if (e.lodN === 0) { e.animate(e.lodAcc); e.lodAcc = 0; } else { e.root.position.copy(e.pos); e.root.rotation.y = e.yaw; }
      } else e.root.visible = false;
    });
    HC.Proj.update(dt, ai);
    if (host) { puzzleHost(); bossHost(); }
    updatePlates();
    G.dmgFlash = Math.max(0, (G.dmgFlash || 0) - dt * 1.6);
    HC.FX.update(dt);
    updateNPCs(dt);
    if (G.bellSwing > 0 && W.bell) { G.bellSwing -= dt; W.bell.rotation.z = Math.sin(G.t * 2.4) * 0.45 * Math.min(1, G.bellSwing / 3); }
    if (W.bigBell) W.bigBell.rotation.z = Math.sin(G.t * 0.8) * (G.activeBoss === 'bellbearer' ? 0.25 : 0.06);
    ['sentinel', 'corvane'].forEach(k => { const m = G.bosses[k] && G.bosses[k].ringMesh; if (m) { const to = G.activeBoss === k ? 0.18 + Math.sin(G.t * 3) * 0.04 : 0; m.material.opacity += (to - m.material.opacity) * Math.min(1, dt * 2); m.visible = m.material.opacity > 0.01; } });
    horror(dt);
    camUpdate(dt);
    W.update(dt, G.t, camera.position, camera);
    envUpdate(dt); lightsUpdate();
    const f = new V3(); camera.getWorldDirection(f); A.setListener(camera.position, f); A.update(dt, me.pos);
    hud(dt); interactPrompt(); netTick(dt);
    HC.TOYS.forEach(t => { if (t.mesh) { t.mesh.rotation.y += dt; t.mesh.position.y += Math.sin(G.t * 2) * 0.002; } });
    // discover embers by walking near them
    for (const id in W.SHRINES) if (!me.found.has(id) && W.SHRINES[id].pos && W.SHRINES[id].pos.distanceTo(me.pos) < 12) { me.found.add(id); message(`Ember discovered: ${W.SHRINES[id].name}`); }
  }

  function controlLocal(dt) {
    me.actT += dt; me.avatar.actT = me.actT; me.iframes = Math.max(0, me.iframes - dt);
    me.zone = W.zoneAt(me.pos.x, me.pos.z);
    if (G.cine) { G.cine.t += dt; if (G.cine.t > G.cine.dur) G.cine = null; me.avatar.speed = 0; return; }
    const c = C(); let speed = 0, dir = moveDir();
    const inputLocked = overlayOpen() || document.activeElement === $('chatIn') || !$('mapOverlay').classList.contains('hidden');
    if (inputLocked) dir.set(0, 0, 0);
    me.stDelay -= dt;
    if (me.stDelay <= 0 && !busy()) me.st = Math.min(me.maxSt, me.st + dt * (me.act === 'block' ? 12 : 34) * (me.stMul || 1));
    const prev = me.pos.clone();
    if (me.act === 'downed') {
      if (!me.dead) { me.bleed -= dt; if (me.bleed <= 0 && Net.mode !== 'solo') die(false); }
      if (dir.lengthSq()) W.move(me.pos, dir.x * 0.5 * dt, dir.z * 0.5 * dt, 0.4);
    } else if (me.act === 'roll') {
      const p = me.actT / me.actDur, sp = 8.5 * (1 - p * 0.75);
      W.move(me.pos, me.rollDir.x * sp * dt, me.rollDir.z * sp * dt, 0.4);
      if (me.actT >= me.actDur) startAct('idle', 0);
    } else if (me.act === 'attack' || me.act === 'heavy') {
      if (me.lock && me.actT < me.atk.hit * 0.7) faceTarget();
      if (!me.hitDone && me.actT >= me.atk.hit) { me.hitDone = true; performHit(); }
      if (me.actT > me.atk.hit * 0.6 && me.actT < me.atk.hit) W.move(me.pos, Math.sin(me.yaw) * 2.2 * dt, Math.cos(me.yaw) * 2.2 * dt, 0.4);
      if (me.actT >= me.actDur) { const q = me.queued; me.queued = null; me.lastAtkEnd = G.t; startAct('idle', 0); if (q) tryAttack(q); }
    } else if (me.act === 'drink') {
      speed = c.speed * 0.35;
      if (!me.healed && me.actT > 0.6) {
        me.healed = true;
        if (me.drinkFn) { me.drinkFn(); me.drinkFn = null; } else me.hp = Math.min(me.maxHp, me.hp + me.maxHp * 0.45);
        A.play('flask', me.pos, 0.8); HC.FX.spawn('ember', me.pos.clone().setY(me.pos.y + 1));
      }
      if (me.actT >= me.actDur) startAct('idle', 0);
    } else if (me.act === 'throw') {
      if (!me.thrown && me.actT > 0.42) {
        me.thrown = true;
        const from = me.pos.clone().add(new V3(Math.sin(me.yaw) * 0.4, 1.7, Math.cos(me.yaw) * 0.4)), to = aimPoint();
        const flat = Math.min(16, Math.max(3, Math.hypot(to.x - from.x, to.z - from.z))), t = flat / 13;
        const vel = new V3(Math.sin(me.yaw) * 13, (to.y - from.y + 0.5 * 12 * t * t) / t, Math.cos(me.yaw) * 13);
        HC.Proj.spawn('bomb', from, vel, me.bombDmg || 70, true, { friendly: true, grav: 12, life: 3, fire: true });
        event({ t: 'pshot', type: 'bomb', pos: from.toArray(), vel: vel.toArray(), grav: 12, by: Net.pid });
        A.play('heavyAttack', null, 0.7, { armor: false, rev: 0.3 });
      }
      if (me.actT >= me.actDur) startAct('idle', 0);
    } else if (me.act === 'hurt' || me.act === 'rest' || me.act === 'revive') {
      if (me.actT >= me.actDur) startAct('idle', 0);
      if (me.act === 'revive') {
        const t = G.reviveTarget;
        if (!keys.KeyE || !t || !t.downed || t.pos.distanceTo(me.pos) > 2.6) { startAct('idle', 0); G.reviveTarget = null; }
        else if (me.actT >= 2.4) { event({ t: 'revive', target: t.id, by: me.name }); startAct('idle', 0); G.reviveTarget = null; }
      }
    } else if (me.act === 'draw' || me.act === 'cast' || me.act === 'charge') {
      // holding: the bow draws / the staff gathers fire / the swing winds up; you can still shuffle around
      const k = Math.min(1, me.actT / (me.act === 'cast' ? 1.1 : 1.0));
      if (me.act === 'draw') me.draw = k; else me.charge = k;
      if (me.lock) faceTarget(); else me.yaw = me.camYaw;
      speed = c.speed * (me.act === 'charge' ? 0.25 : 0.45) * (me.spdMul || 1);
      if (k >= 1) { me.st -= dt * 7; me.stDelay = 0.5; }
      if (me.act === 'charge' && k >= 1 && Math.random() < dt * 6) HC.FX.spawn('ember', me.pos.clone().add(new V3(Math.sin(me.yaw) * 0.6, 1.2, Math.cos(me.yaw) * 0.6)));
      // let go automatically when the button was released elsewhere (focus lost), stamina ran out, or a charge maxed out
      const anyHeld = held.attack || held.heavy;
      if (!anyHeld || me.st <= 0 || (me.act === 'charge' && me.actT > 2.5)) {
        if (me.act === 'draw') loose(); else if (me.act === 'cast') castRelease(); else chargeRelease();
      }
    } else if (me.act === 'loose' || me.act === 'getup' || me.act === 'pickup' || me.act === 'interact') {
      if (me.act === 'loose') speed = c.speed * 0.45 * (me.spdMul || 1);
      if ((me.act === 'pickup' || me.act === 'interact') && dir.lengthSq() > 0) startAct('idle', 0);
      if (me.actT >= me.actDur) startAct('idle', 0);
    } else if (me.act !== 'cine') {
      const blocking =(mouse.r || keys.KeyK) && !inputLocked;   // right mouse / touch Block button / K key
      // touch players sprint by pushing the stick: stop at 25 stamina so there is always enough left to attack or roll
      const sprint = keys.ShiftLeft && dir.lengthSq() > 0 && me.st > (G.touch ? 25 : 0) && !blocking;
      speed = c.speed * (blocking ? 0.45 : sprint ? 1.65 : 1) * (me.speedMul || 1) * (me.spdMul || 1);
      if (sprint) { me.st -= dt * 15; me.stDelay = 0.5; }
      if (blocking) { if (me.act !== 'block') startAct('block', 0); } else if (me.act === 'block') startAct('idle', 0);
      if (me.lock && (!me.lock.alive || me.lock.pos.distanceTo(me.pos) > 34)) me.lock = null;
    }
    if (W.heightAt(me.pos.x, me.pos.z) < W.waterAt(me.pos.x, me.pos.z) - 0.15) speed *= 0.75;
    if (speed > 0 && dir.lengthSq() > 0) {
      W.move(me.pos, dir.x * speed * dt, dir.z * speed * dt, 0.4);
      const want = me.lock && !keys.ShiftLeft ? Math.atan2(me.lock.pos.x - me.pos.x, me.lock.pos.z - me.pos.z) : Math.atan2(dir.x, dir.z);
      me.yaw += HC.angDiff(me.yaw, want) * Math.min(1, dt * 12);
      // footsteps land when a foot actually plants in the walk/run animation (distance timer only as a fallback)
      const plant = me.avatar.rig.footPlant ? me.avatar.rig.footPlant() : null;
      me.stepAcc = (me.stepAcc || 0) + speed * dt;
      if (plant === true || (plant === null && me.stepAcc > 1.1)) {
        me.stepAcc = 0;
        const surface = W.isUnder(me.zone) || me.zone === 'citadel' ? 'stone' : me.zone === 'forest' ? 'grass' : 'dirt';
        A.play('step', me.pos, 0.55, { wet: W.heightAt(me.pos.x, me.pos.z) < W.waterAt(me.pos.x, me.pos.z), rev: 0.3, surface, armor: !!(HC.STYLES[me.avatar.style] || {}).armor });
      }
    } else speed = 0;
    if (me.act === 'block' && me.lock) faceTarget();
    if (['draw', 'cast', 'charge', 'loose'].includes(me.act) && !me.lock) me.yaw = me.camYaw;   // keep facing the aim while strafing
    me.avatar.speed = speed;
    me.avatar.draw = me.draw || 0; me.avatar.charge = me.charge || 0;
    me.avatar.pitch = Math.max(-0.9, Math.min(0.9, -me.camPitch + 0.12));
    me.pos.y = W.heightAt(me.pos.x, me.pos.z);
    me.vel.copy(me.pos).sub(prev).divideScalar(Math.max(dt, 1e-3));
    me.look = me.camYaw;
    if (!zoneShown[me.zone] && me.zone !== 'wilds') { zoneShown[me.zone] = true; areaBanner(W.areaName(me.zone).toUpperCase()); }
    A.setAmbience(AMB[me.zone] || 'village');
    me.avatar.setHeadVisible(!me.fp);
  }

  const camPos = new V3(), camLook = new V3();
  function camUpdate(dt) {
    G.shakeA = Math.max(0, (G.shakeA || 0) - dt * 1.5);
    if (G.cine && G.cine.boss) {
      const b = G.cine.boss, q = G.cine.t / G.cine.dur, a = b.yaw + 0.6 - q * 1.2, R = (11 - q * 3) * Math.max(1, b.cfg.h / 3);
      const pos = b.pos.clone().add(new V3(Math.sin(a) * R, 2.2 + q * 1.5 + b.cfg.h * 0.3, Math.cos(a) * R));
      if (pos.x > 1500 && !W.walkable(pos.x, pos.z)) pos.lerp(b.pos.clone().setY(pos.y), 0.5);
      camera.position.lerp(pos, 1 - Math.exp(-4 * dt)); camLook.lerp(b.pos.clone().setY(b.pos.y + b.cfg.h * 0.8), 1 - Math.exp(-4 * dt)); camera.lookAt(camLook);
      return;
    }
    if (me.lock && me.lock.alive) {
      const want = Math.atan2(me.lock.pos.x - me.pos.x, me.lock.pos.z - me.pos.z);
      me.camYaw += HC.angDiff(me.camYaw, want) * Math.min(1, dt * 6);
      me.camPitch = HC.damp(me.camPitch, me.lock.boss ? 0.02 : 0.18, 4, dt);
    }
    { if (keys.ArrowLeft) me.camYaw += dt * 2; if (keys.ArrowRight) me.camYaw -= dt * 2; if (keys.ArrowUp) me.camPitch -= dt; if (keys.ArrowDown) me.camPitch += dt; }
    const cp = Math.cos(me.camPitch), f = new V3(Math.sin(me.camYaw) * cp, -Math.sin(me.camPitch), Math.cos(me.camYaw) * cp), right = new V3(-Math.cos(me.camYaw), 0, Math.sin(me.camYaw));
    if (me.fp && !me.downed) {
      const pos = me.pos.clone().add(new V3(0, 1.62, 0)).addScaledVector(new V3(Math.sin(me.camYaw), 0, Math.cos(me.camYaw)), 0.18);
      camera.position.copy(pos); camera.lookAt(pos.clone().add(f));
    } else {
      const target = me.pos.clone().add(new V3(0, 1.55, 0)).addScaledVector(right, 0.45);
      G.camZoom = HC.damp(G.camZoom || 1, me.act === 'draw' ? 0.62 + 0.1 * (1 - me.draw) : 1, 6, dt);   // over the shoulder while drawing
      const dist = (me.lock && me.lock.boss ? 4.5 + me.lock.cfg.h * 0.6 : 4.3) * G.camZoom;
      const pos = target.clone().addScaledVector(f, -dist);
      const fr = W.rayFree(target, pos); if (fr < 1) pos.lerpVectors(target, pos, Math.max(0.15, fr));
      const gy2 = W.heightAt(pos.x, pos.z) + 0.35; if (pos.y < gy2) pos.y = gy2;
      camPos.copy(pos); camera.position.lerp(camPos, 1 - Math.exp(-20 * dt)); camLook.copy(target); camera.lookAt(camLook);
    }
    if (G.shakeA > 0) { camera.position.x += (Math.random() - 0.5) * G.shakeA * 0.4; camera.position.y += (Math.random() - 0.5) * G.shakeA * 0.4; }
    if (me.lock && me.lock.alive) {
      const p = me.lock.pos.clone().setY(me.lock.pos.y + Math.min(me.lock.cfg.h * 0.75, 3)).project(camera);
      show('lockon'); $('lockon').style.left = ((p.x + 1) / 2 * innerWidth) + 'px'; $('lockon').style.top = ((1 - p.y) / 2 * innerHeight) + 'px';
    } else show('lockon', false);
  }
  function envUpdate(dt) {
    const e = ENV[me.zone] || ENV.village, k = 1 - Math.exp(-dt * 1.2);
    let d = e.d * (G.fogMul || 1); if (me.zone === 'kingArena' && G.flags.dead_king) d *= 0.6;
    scene.fog.density += (d - scene.fog.density) * k;
    tmpC.setHex(e.fog); scene.fog.color.lerp(tmpC, k); scene.background.copy(scene.fog.color);
    hemi.intensity += (e.hemi - hemi.intensity) * k; moon.intensity += (e.moon - moon.intensity) * k;
    W.skyMat.uniforms.horizon.value.lerp(tmpC.setHex(me.zone === 'forest' ? 0x14171a : 0x1d2027), k);
  }
  function lightsUpdate() {
    const cands = [];
    G.players.forEach(p => { if (!p.lantern || p.dead) return; cands.push({ pos: p.pos.clone().add(new V3(Math.sin(p.yaw) * 0.3, 1.1, Math.cos(p.yaw) * 0.3)), color: 0xffa860, intensity: p.local ? 2.6 : 2.0, dist: p.local ? 18 : 15, flicker: 0.08, pri: p.local ? -1e6 : -1000 }); });
    W.lightSources.forEach(s => { if (s.intensity > 0) cands.push({ pos: s.pos, color: s.color, intensity: s.intensity, dist: s.dist, flicker: s.flicker, pri: 0 }); });
    if (G.activeBoss) { const b = G.bossE[G.activeBoss]; if (b.phase === 2) cands.push({ pos: b.pos.clone().setY(b.pos.y + 2.5), color: 0xff4010, intensity: 3, dist: 16, flicker: 0.3, pri: -500 }); }
    HC.Proj.list.forEach(p => { if (p.type !== 'bolt' && p.type !== 'arrow') cands.push({ pos: p.pos, color: p.type === 'pale' ? 0x9ad0ff : 0xff6a20, intensity: 2, dist: 8, flicker: 0, pri: -200 }); });
    const cp = camera.position;
    cands.forEach(c => c.score = c.pri + c.pos.distanceToSquared(cp)); cands.sort((a, b) => a.score - b.score);
    lightPool.forEach((l, i) => {
      const c = cands[i]; if (!c) { l.intensity = 0; return; }
      l.position.copy(c.pos); l.color.set(c.color); l.distance = c.dist;
      let I = c.intensity * (c.flicker ? 1 - c.flicker * (0.5 + 0.5 * Math.sin(G.t * 13 + i * 7) * Math.sin(G.t * 7.3 + i)) : 1);
      if (c.pri === -1e6 && W.isUnder(me.zone) && Math.random() < 0.004) I *= 0.2;
      l.intensity = I;
    });
  }
  function interactPrompt() {
    let best = null, bd = 1e9;
    if (!me.downed && !G.cine) {
      G.inter.forEach(o => { if (o.cond && !o.cond()) return; const d = o.pos.distanceTo(me.pos); if (d < o.r && d < bd) { bd = d; best = o; } });
      G.players.forEach(p => { if (p.local || !p.downed) return; const d = p.pos.distanceTo(me.pos); if (d < 2.4 && d < bd) { bd = d; best = { revive: p, label: `Hold to lift ${p.name}` }; } });
    }
    G.nearInter = best;
    if (best && !overlayOpen()) { $('prompt').innerHTML = `<b>[E]</b> ${esc(typeof best.label === 'function' ? best.label() : best.label)}`; show('prompt'); } else show('prompt', false);
  }
  function tryInteract() {
    const o = G.nearInter; if (!o || (busy() && me.act !== 'block')) return;
    if (o.revive) { G.reviveTarget = o.revive; startAct('revive', 2.4); return; }
    o.act();
  }

  // used by js/access.js (admin commands)
  G.api = { me: () => me, message, chatLine, areaBanner, floatText, revived, receiveDamage, lock, recalc: () => recalcStats(), drink: drinkItem, throwBomb,
    startAct, grantRelic, ringBell, goDown, respawnAt, travel, camera: () => camera,
    resetEnemies: () => { if (Net.isHost()) resetWorldOnDeath(); } };
  HC.debug = { tp: (x, z) => { me.pos.set(x, W.heightAt(x, z), z); }, flags: () => G.flags, me: () => me, G, cam: () => camera, W,
    // dev only (local test server): render one frame, optionally from a given camera, and upload it as /shot
    snap(name, pos, look) {
      if (pos) { camera.position.copy(pos); camera.lookAt(look); camera.updateMatrixWorld(); }
      if (composer) composer.render(); else renderer.render(scene, camera);
      return fetch('/shot?name=' + encodeURIComponent(name), { method: 'POST', body: renderer.domElement.toDataURL('image/png') }).then(r => r.status);
    },
    step(n = 60) { for (let i = 0; i < n; i++) { G.t += 1 / 60; update(1 / 60); } },
    bench(n = 20) { const gl = renderer.getContext(), t0 = performance.now(); for (let i = 0; i < n; i++) { update(1 / 60); if (composer) composer.render(); else renderer.render(scene, camera); } gl.finish(); return ((performance.now() - t0) / n).toFixed(1) + ' ms/frame, calls=' + renderer.info.render.calls + ', tris=' + renderer.info.render.triangles; } };
})();
