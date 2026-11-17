// THE HOLLOW CROWN - world: a 1.4 km kingdom (terrain, five regions, three underground places),
// collision, light sources, sky, vegetation streaming.
(function () {
  const W = HC.World = {};
  const V3 = THREE.Vector3;

  // ------------------------------------------------------------ noise
  function hash(x, y) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967295;
  }
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
  }
  function fbm(x, y, o = 4) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += vnoise(x * f, y * f) * a; f *= 2.03; a *= 0.5; } return s; }
  W.fbm = fbm;
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  let seed = 1337;
  W.rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const rand = W.rand;

  // ------------------------------------------------------------ the map
  W.WATER_Y = 0.12;
  W.LAKE_Y = -19.55;
  W.START = new V3(0, 0, 150);
  W.CHURCH = new V3(0, 0, -38);
  W.BELL_POS = new V3(0, 14, -28.5);
  W.GRAVE = new V3(34, 0, -26);
  W.CRYPT = new V3(42, 0, -38);
  W.PILGRIM = new V3(10.5, 0, 6.5);
  W.HEART = new V3(-380, 0, -40);          // Weeping Sentinel
  W.WHISPER = new V3(-262, 0, -96);
  W.HERMIT = new V3(-172, 0, 44);
  W.CRATER = new V3(430, 0, 80);           // Sunken Cathedral
  W.CATH_FLOOR = -20;
  W.CATH_DOOR = new V3(401, 0, 80);
  W.CITADEL = new V3(0, 0, -500);          // Ashen Citadel courtyard (Ser Corvane)
  W.CIT_H = 38;
  W.GATEHOUSE = new V3(0, 0, -452);
  W.KEEP_DOOR = new V3(0, 0, -527);
  W.GALLOWS = new V3(112, 0, -108);
  W.TOWER = new V3(205, 0, 255);
  W.HAMLET = new V3(-130, 0, 190);
  W.SHRINES = {
    village: { name: 'Village Ember', pos: new V3(7, 0, 9) },
    hermit: { name: "Hermit's Ember", pos: new V3(-166, 0, 52) },
    rim: { name: 'Crater Rim Ember', pos: new V3(296, 0, 64) },
    gate: { name: 'Citadel Road Ember', pos: new V3(6, 0, -342) },
    catacombs: { name: 'Catacomb Ember', dungeon: 'catacombs', cell: [5, 9] },
    nave: { name: 'Narthex Ember', dungeon: 'cathedral', cell: [17, 4] },
    below: { name: "Ember of the Below", dungeon: 'below', cell: [5, 9] },
  };
  const PATHS = [
    [[0, 175], [0, 120], [0, 60], [2, 12]],                                                      // south road
    [[-4, 4], [-40, 2], [-90, -6], [-150, -10], [-200, 10], [-260, -30], [-320, -36], [-365, -40]],  // west road → Blackroot
    [[6, -6], [22, -14], [36, -26], [41, -34]],                                                  // graveyard
    [[-200, 10], [-172, 40]],                                                                    // hermit
    [[-260, -30], [-262, -90]],                                                                  // whisper glade trail
    [[30, 4], [100, 20], [180, 30], [250, 55], [296, 64], [330, 74], [370, 80], [398, 80]],     // east road → crater
    [[0, -60], [12, -130], [-18, -210], [8, -280], [4, -340], [0, -420], [0, -448]],             // north road → citadel
    [[100, 20], [112, -100]], [[0, 120], [120, 200], [200, 250]], [[-40, 2], [-90, 120], [-130, 185]],
  ];
  function segDist(px, pz, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    let t = l2 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0; t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
  }
  function pathDist(x, z) { let d = 1e9; for (const p of PATHS) for (let i = 0; i < p.length - 1; i++) d = Math.min(d, segDist(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1])); return d; }
  W.pathDist = pathDist;
  W.PATHS = PATHS;

  function baseH(x, z) {
    let h = fbm(x * 0.005, z * 0.005) * 22 + fbm(x * 0.025 + 9, z * 0.025) * 2.6;
    const d = Math.hypot(x, z);
    h += sstep(560, 690, d) * 95 * (0.7 + 0.5 * fbm(x * 0.01, z * 0.01));
    // citadel plateau
    const cd = Math.hypot(x - W.CITADEL.x, z - W.CITADEL.z);
    h = lerp(h, W.CIT_H + fbm(x * 0.03, z * 0.03) * 1.2, 1 - sstep(95, 210, cd));
    h = lerp(h, W.CIT_H, 1 - sstep(62, 80, cd));
    // the crater of the Sunken Cathedral
    const kd = Math.hypot(x - W.CRATER.x, z - W.CRATER.z);
    h = lerp(h, h - 24 * (1 - sstep(40, 128, kd)) + 4 * Math.exp(-Math.pow((kd - 118) / 14, 2)), 1);
    h = lerp(h, W.CATH_FLOOR, 1 - sstep(44, 60, kd));
    // village basin + plateaus
    const vd = Math.hypot(x, z - 5);
    h = lerp(h, fbm(x * 0.06, z * 0.06) * 0.6 + 0.02, 1 - sstep(42, 86, vd));
    h = lerp(h, 0.75, 1 - sstep(16, 24, Math.hypot(x - W.CHURCH.x, z - W.CHURCH.z)));
    h = lerp(h, 0.6, 1 - sstep(13, 20, Math.hypot(x - W.GRAVE.x, z - W.GRAVE.z)));
    h = lerp(h, 0.45, 1 - sstep(6, 11, Math.hypot(x - 7, z - 9)));
    // clearings
    h = lerp(h, clearH.heart, 1 - sstep(26, 40, Math.hypot(x - W.HEART.x, z - W.HEART.z)));
    h = lerp(h, clearH.hermit, 1 - sstep(12, 22, Math.hypot(x - W.HERMIT.x, z - W.HERMIT.z)));
    // roads: smoothed and slightly sunken
    const pd = pathDist(x, z);
    h -= (1 - sstep(1.8, 5.5, pd)) * 0.35;
    return h;
  }
  const clearH = { heart: 0, hermit: 0 };

  const TS = 1400;
  let TSEG = 350, TSTEP = TS / TSEG;   // terrain resolution comes from the Terrain detail setting
  let hgrid;
  W.heightAt = function (x, z) {
    if (x > 1500) return 0;
    const gx = (x + TS / 2) / TSTEP, gz = (z + TS / 2) / TSTEP;
    const ix = Math.max(0, Math.min(TSEG - 1, Math.floor(gx))), iz = Math.max(0, Math.min(TSEG - 1, Math.floor(gz)));
    const fx = Math.min(1, Math.max(0, gx - ix)), fz = Math.min(1, Math.max(0, gz - iz));
    const R = TSEG + 1;
    const a = hgrid[iz * R + ix], b = hgrid[iz * R + ix + 1], c = hgrid[(iz + 1) * R + ix], d = hgrid[(iz + 1) * R + ix + 1];
    if (fx + fz <= 1) return a + (b - a) * fx + (c - a) * fz;
    return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
  };
  W.waterAt = () => -999;   // no water anywhere

  // ------------------------------------------------------------ zones
  W.zoneAt = function (x, z) {
    if (x > 1500) {
      const dg = W.dungeonAt(x, z);
      if (!dg) return 'dungeon';
      const cz = (z - dg.DZ) / dg.CELL;
      if (dg.key === 'catacombs') return cz >= 56 ? 'brotherArena' : 'catacombs';
      if (dg.key === 'cathedral') return cz >= 58 ? 'bellArena' : 'nave';
      return cz >= 56 ? 'kingArena' : 'below';
    }
    if (Math.hypot(x, z - 5) < 85) return 'village';
    if (Math.hypot(x - W.CITADEL.x, z - W.CITADEL.z) < 150) return 'citadel';
    if (Math.hypot(x - W.CRATER.x, z - W.CRATER.z) < 140) return 'crater';
    if (x < -150) return 'forest';
    return 'wilds';
  };
  W.AREAS = {
    village: 'The Drowned Village', wilds: 'The Old Roads of Veyr', forest: 'Blackroot Forest', crater: 'The Sunken Cathedral',
    citadel: 'The Ashen Citadel', catacombs: 'The Catacombs', brotherArena: 'The Ossuary Deep', nave: 'The Drowned Nave',
    bellArena: 'Foot of the Bell Tower', below: "The King's Below", kingArena: 'The Seat of the Seal',
  };
  W.areaName = z => W.AREAS[z] || '';
  W.isUnder = z => ['catacombs', 'brotherArena', 'nave', 'bellArena', 'below', 'kingArena', 'dungeon'].includes(z);

  // ------------------------------------------------------------ textures
  function canvasTex(size, draw, rep, srgb = true) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'); draw(g, size);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (rep) t.repeat.set(rep, rep);
    t.anisotropy = 4;
    if (srgb) t.encoding = THREE.sRGBEncoding;
    return t;
  }
  function normalFrom(tex, strength = 2.5) {
    const src = tex.image, s = src.width, g = src.getContext('2d'), d = g.getImageData(0, 0, s, s).data;
    const c = document.createElement('canvas'); c.width = c.height = s;
    const og = c.getContext('2d'), im = og.createImageData(s, s), o = im.data;
    const L = (x, y) => d[(((y + s) % s) * s + ((x + s) % s)) * 4] / 255;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const dx = (L(x + 1, y) - L(x - 1, y)) * strength, dy = (L(x, y + 1) - L(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1), i = (y * s + x) * 4;
      o[i] = (-dx / len * 0.5 + 0.5) * 255; o[i + 1] = (dy / len * 0.5 + 0.5) * 255; o[i + 2] = (1 / len * 0.5 + 0.5) * 255; o[i + 3] = 255;
    }
    og.putImageData(im, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.copy(tex.repeat); t.anisotropy = 4;
    return t;
  }
  function noiseFill(g, s, lo, hi, sc) {
    const im = g.getImageData(0, 0, s, s), d = im.data;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const ax = x / s * Math.PI * 2, ay = y / s * Math.PI * 2;
      const n = fbm(Math.cos(ax) * sc + 40, Math.sin(ax) * sc + Math.cos(ay) * sc * 0.7 + Math.sin(ay) * sc * 0.7, 5);
      const v = lo + (hi - lo) * (n * 0.5 + 0.5), i = (y * s + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
  }
  W.makeTextures = function () {
    W.tex = {};
    W.tex.grunge = canvasTex(256, (g, s) => {
      noiseFill(g, s, 155, 255, 3);
      for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; g.fillRect(Math.random() * s, Math.random() * s, Math.random() * 30, Math.random() * 3); }
    });
    W.tex.ground = canvasTex(256, (g, s) => {
      noiseFill(g, s, 170, 255, 4);
      for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(${Math.random() < 0.6 ? '0,0,0' : '255,255,255'},${Math.random() * 0.18})`; g.beginPath(); g.arc(Math.random() * s, Math.random() * s, Math.random() * 2.2, 0, 7); g.fill(); }
    }, 280);
    W.tex.groundN = normalFrom(W.tex.ground, 1.6);
    const bricks = (g, s, rows, cols, base) => {
      g.fillStyle = '#1b1a19'; g.fillRect(0, 0, s, s);
      const bh = s / rows, bw = s / cols;
      for (let r = 0; r < rows; r++) for (let c = -1; c < cols; c++) {
        const off = (r % 2) * bw / 2, v = base + Math.random() * 40 - 20;
        const gr = g.createLinearGradient(0, r * bh, 0, r * bh + bh);
        gr.addColorStop(0, `rgb(${v + 18},${v + 16},${v + 12})`); gr.addColorStop(1, `rgb(${v - 10},${v - 11},${v - 13})`);
        g.fillStyle = gr;
        g.fillRect(c * bw + off + 3, r * bh + 3, bw - 6, bh - 6);
        for (let k = 0; k < 6; k++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`; g.fillRect(c * bw + off + Math.random() * bw, r * bh + Math.random() * bh, Math.random() * 18, Math.random() * 6); }
        if (Math.random() < 0.15) { g.fillStyle = 'rgba(40,60,20,0.35)'; g.fillRect(c * bw + off, r * bh + bh * 0.6, bw, bh * 0.4); }
      }
    };
    W.tex.brick = canvasTex(512, (g, s) => bricks(g, s, 10, 5, 95)); W.tex.brick.repeat.set(1, 3.5);
    W.tex.brickN = normalFrom(W.tex.brick, 3);
    W.tex.floor = canvasTex(512, (g, s) => bricks(g, s, 6, 6, 70)); W.tex.floor.repeat.set(30, 45);
    W.tex.floorN = normalFrom(W.tex.floor, 3);
    W.tex.water = canvasTex(256, (g, s) => noiseFill(g, s, 0, 255, 8), 30, false);
  };

  // ------------------------------------------------------------ PBR textures (CC0 Poly Haven) & shader patches
  W.pbr = {};
  function pbr(key, rep = 1) {
    if (W.pbr[key]) return W.pbr[key];
    if (!window.HC_TEX || !HC_TEX[key + '_c']) return null;
    const L = new THREE.TextureLoader();
    const c = L.load(HC_TEX[key + '_c']), n = L.load(HC_TEX[key + '_n']);
    [c, n].forEach(t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.repeat.set(rep, rep); });
    c.encoding = THREE.sRGBEncoding;
    return (W.pbr[key] = { c, n });
  }
  W.pbrTex = pbr;
  // world-space (triplanar) projection: consistent texel density on any mesh, no UVs needed
  // ------------------------------------------------------------ low-end material modes
  // "flat colours": textures removed, each material keeps its texture's average colour.
  // "simple lighting": physically-based materials become cheap Lambert materials.
  const TP_AVG = { ground: 0x5a5040, mud: 0x463c30, trail: 0x6a6258, brick: 0x6e665e, blocks: 0x7e766c, cobble: 0x625e58, wood: 0x6a5440, rockwall: 0x5e5a56 };
  const avgCache = new Map();
  function texAvg(tex) {
    if (!tex || !tex.image) return null;
    if (avgCache.has(tex.image)) return avgCache.get(tex.image);
    let c = null;
    try {
      const cv = document.createElement('canvas'); cv.width = cv.height = 8;
      const g = cv.getContext('2d'); g.drawImage(tex.image, 0, 0, 8, 8);
      const d = g.getImageData(0, 0, 8, 8).data; let r = 0, gg = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
      c = new THREE.Color(r / 64 / 255, gg / 64 / 255, b / 64 / 255).convertSRGBToLinear();
    } catch (e) { c = null; }
    avgCache.set(tex.image, c);
    return c;
  }
  const lowCache = new Map();
  W.lowMode = () => { const v = HC.Settings ? HC.Settings.v : {}; return { flat: v.textures === 'flat', simple: v.lighting === 'simple' }; };
  W.lowMat = function (m) {
    const { flat, simple } = W.lowMode();
    if ((!flat && !simple) || !m || m.userData.low || m.isShaderMaterial || m.isPointsMaterial || m.isMeshBasicMaterial) return m;
    if (lowCache.has(m)) return lowCache.get(m);
    const col = m.color ? m.color.clone() : new THREE.Color(1, 1, 1);
    if (flat) {
      if (m.userData.tpKey) col.multiply(new THREE.Color(TP_AVG[m.userData.tpKey] || 0x777777).convertSRGBToLinear()).multiplyScalar(1.6);
      else if (m.map && m.map !== W.tex.grunge) { const a = texAvg(m.map); if (a) col.multiply(a); }
      else if (m.map === W.tex.grunge) col.multiplyScalar(0.85);
    }
    // glow (emissive) maps: e.g. white emissive + a map that is black except the eyes. Without the map that white
    // would light the whole body, so in flat mode the glow colour is scaled by the map's average instead.
    const emi = m.emissive ? m.emissive.clone() : new THREE.Color(0);
    if (flat && m.emissiveMap) { const a = texAvg(m.emissiveMap); emi.multiply(a || new THREE.Color(0)); }
    let out = m;
    if (simple && (m.isMeshStandardMaterial || m.isMeshPhongMaterial)) {
      out = new THREE.MeshLambertMaterial({ color: col, map: flat ? null : m.map, emissive: emi, emissiveMap: flat ? null : m.emissiveMap, emissiveIntensity: m.emissiveIntensity,
        transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, side: m.side, vertexColors: m.vertexColors, skinning: m.skinning, fog: m.fog });
      out.name = m.name; out.toneMapped = m.toneMapped; out.userData = Object.assign({}, m.userData);
      if (!flat && (m.userData.tpKey || m.userData.keepShader)) out.onBeforeCompile = m.onBeforeCompile;
    } else if (flat) {
      m.color.copy(col); if (m.emissive) m.emissive.copy(emi);
      ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'bumpMap', 'emissiveMap'].forEach(k => { if (k in m) m[k] = null; });
    }
    if (flat) { out.map = null; out.onBeforeCompile = function () { }; if (out.alphaTest) out.alphaTest = 0; }
    out.userData.low = true; out.needsUpdate = true;
    lowCache.set(m, out);
    return out;
  };
  // convert every material in the scene (shared materials are converted once)
  W.applyLowMaterials = function (root) {
    const { flat, simple } = W.lowMode(); if (!flat && !simple) return;
    root.traverse(o => { if (o.isMesh || o.isInstancedMesh) o.material = Array.isArray(o.material) ? o.material.map(W.lowMat) : W.lowMat(o.material); });
  };
  W.triplanar = function (mat, key, scale = 0.35, tint) {
    mat.userData.tpKey = key;
    const t = pbr(key); if (!t) return mat;
    if (tint !== undefined) mat.color.set(tint);
    mat.map = null;
    mat.onBeforeCompile = sh => {
      sh.uniforms.tpC = { value: t.c }; sh.uniforms.tpS = { value: scale };
      sh.vertexShader = 'varying vec3 vTpPos; varying vec3 vTpN;\n' + sh.vertexShader.replace('#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vec4 tpP = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          tpP = instanceMatrix * tpP;
        #endif
        vTpPos = (modelMatrix * tpP).xyz; vTpN = normalize(mat3(modelMatrix) * objectNormal);`);
      sh.fragmentShader = 'uniform sampler2D tpC; uniform float tpS; varying vec3 vTpPos; varying vec3 vTpN;\n' + sh.fragmentShader.replace('#include <map_fragment>',
        `vec3 tpB = pow(abs(vTpN), vec3(4.0)); tpB /= (tpB.x + tpB.y + tpB.z);
        vec3 tpCol = texture2D(tpC, vTpPos.zy * tpS).rgb * tpB.x + texture2D(tpC, vTpPos.xz * tpS).rgb * tpB.y + texture2D(tpC, vTpPos.xy * tpS).rgb * tpB.z;
        diffuseColor.rgb *= tpCol * 1.6;`);
    };
    mat.needsUpdate = true;
    return mat;
  };
  // the bright stylized CC0 kits are re-graded for Veyr: darker, colder, weathered
  const GRADE = [
    [/Plaster/, m => m.color.setRGB(0.6, 0.57, 0.52)], [/UnevenBrick|Brick|RockTrim/, m => m.color.setRGB(0.55, 0.54, 0.53)],
    [/WoodTrim/, m => m.color.setRGB(0.45, 0.4, 0.36)], [/RoundTiles/, m => m.color.setRGB(0.42, 0.36, 0.36)],
    [/WindowGlass/, m => { m.emissive = new THREE.Color(0xff9a40); m.emissiveIntensity = 1.4; m.color.setRGB(0.3, 0.2, 0.1); }],
    [/Bark/, m => m.color.setRGB(0.55, 0.52, 0.5)], [/Leaves_Pine/, m => m.color.setRGB(0.45, 0.5, 0.45)],
    [/Leaves_TwistedTree/, m => m.color.setRGB(0.55, 0.32, 0.3)], [/^Leaves$|Leaves_NormalTree/, m => m.color.setRGB(0.45, 0.5, 0.42)],
    [/^Grass/, m => m.color.setRGB(0.45, 0.48, 0.36)], [/^Rocks/, m => m.color.setRGB(0.55, 0.55, 0.55)],
  ];
  const ASSET_TINT = { bush: 0x3a4a30, grass: 0x58603e };
  function dressMaterials(root, asset) {
    root.traverse(o => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m => {
        if (m.userData.dressed) return;
        m.userData.dressed = true;
        const n = m.name || '';
        if (/Glow/.test(n)) { m.toneMapped = false; return; }
        const g = GRADE.find(([re]) => re.test(n));
        if (g) { g[1](m); if (ASSET_TINT[asset]) m.color.set(ASSET_TINT[asset]); if (m.map && /Leaves|Grass/.test(n)) { m.alphaTest = 0.5; m.side = THREE.DoubleSide; } return; }
        if (/^MI_|Superhero|Regular|Ranger|Peasant/.test(n)) return;   // character materials are tinted per character
        if (/^stone|^slate/.test(n) && /church|cathedral|castle|gatehouse|keep|watchtower|arch|pillar|well|shrine|sarcophagus|wall/.test(asset)) {
          W.triplanar(m, /castle|gatehouse|keep|watchtower/.test(asset) ? 'brick' : 'blocks', 0.4, /slate/.test(n) ? 0x4a4a52 : /dark/.test(n) ? 0x6a6a6a : 0x9a968e);
          return;
        }
        if (/^wood/.test(n)) { W.triplanar(m, 'wood', 0.6, 0x8a8078); return; }
        if (!/void|Window/.test(n) && !m.map) { m.map = W.tex.grunge; m.needsUpdate = true; }
      });
    });
  }
  W.dressMaterials = dressMaterials;

  // ------------------------------------------------------------ asset helpers
  W.clone = name => {
    const src = HC.assets[name];
    let hasSkin = false; src.traverse(o => { if (o.isSkinnedMesh) hasSkin = true; });
    return hasSkin && THREE.SkeletonUtils ? THREE.SkeletonUtils.clone(src) : src.clone(true);
  };
  const PLACE_SCALE = { statue: 1.65 };
  W.placed = [];
  W.place = function (name, x, z, ry = 0, s = 1, dy = 0, y) {
    s *= PLACE_SCALE[name] || 1;
    const o = W.clone(name);
    o.position.set(x, (y !== undefined ? y : W.heightAt(x, z)) + dy, z);
    o.rotation.y = ry; o.scale.setScalar(s);
    W.scene.add(o);
    const box = new THREE.Box3().setFromObject(o), r = box.getSize(new V3()).length() / 2;
    W.placed.push({ o, r, under: x > 1500 });
    return o;
  };
  // distance culling for placed objects: the fog has swallowed anything beyond ~180 m anyway
  function cullPlaced(cam) {
    const under = cam.x > 1500;
    for (const p of W.placed) {
      if (p.o.userData.keepVisible === false) continue;
      if (p.under !== under) { p.o.visible = false; continue; }
      const d = Math.hypot(p.o.position.x - cam.x, p.o.position.z - cam.z) - p.r;
      p.o.visible = d < (under ? 70 : 190) * (W.viewMul || 1);
    }
  }
  // vegetation/props streamed in 100 m chunks so only nearby instances are ever drawn
  W.chunks = new Map();
  W.instance = function (name, list, viewDist = 150, CHUNK = 100) {
    const src = HC.assets[name];
    src.updateMatrixWorld(true);
    const meshes = [];
    src.traverse(o => { if (o.isMesh) { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); meshes.push([g, o.material]); } });
    const by = new Map();
    list.forEach(it => { const k = Math.floor(it.x / CHUNK) + ',' + Math.floor(it.z / CHUNK); if (!by.has(k)) by.set(k, []); by.get(k).push(it); });
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    by.forEach((items, k) => {
      const [cx, cz] = k.split(',').map(Number);
      const group = new THREE.Group();
      meshes.forEach(([geo, mat]) => {
        const im = new THREE.InstancedMesh(geo, mat, items.length);
        items.forEach((it, i) => {
          e.set(it.rx || 0, it.ry || 0, it.rz || 0); q.setFromEuler(e);
          m4.compose(new V3(it.x, it.y !== undefined ? it.y : W.heightAt(it.x, it.z) - (it.sink || 0), it.z), q, new V3(it.s, it.sy || it.s, it.s));
          im.setMatrixAt(i, m4);
        });
        im.instanceMatrix.needsUpdate = true;
        im.frustumCulled = false;
        group.add(im);
      });
      const center = new V3((cx + 0.5) * CHUNK, W.heightAt((cx + 0.5) * CHUNK, (cz + 0.5) * CHUNK), (cz + 0.5) * CHUNK);
      W.scene.add(group);
      const key = name + ':' + k;
      if (!W.chunks.has(key)) W.chunks.set(key, []);
      W.chunks.get(key).push({ group, center, viewDist, size: CHUNK, heavy: true });
    });
  };
  function streamChunks(cam) {
    const fwd = new V3(); HC.debugCam && HC.debugCam.getWorldDirection(fwd);
    W.chunks.forEach(list => list.forEach(c => {
      const dx = c.center.x - cam.x, dz = c.center.z - cam.z, d = Math.hypot(dx, dz);
      let vis = d < c.viewDist * (W.viewMul || 1) + c.size * 0.71 && cam.x < 1500;
      if (vis && d > c.size * 1.2 && fwd.lengthSq()) vis = (dx * fwd.x + dz * fwd.z) / d > -0.35;   // behind the camera
      c.group.visible = vis;
    }));
  }
  // reflections skip vegetation and characters: the mirror only needs sky, buildings and terrain
  W.hideHeavy = function (hide) {
    W.chunks.forEach(list => list.forEach(c => { if (hide) { c.wasVis = c.group.visible; c.group.visible = false; } else c.group.visible = c.wasVis; }));
    if (HC.Game && HC.Game.enemies) HC.Game.enemies.forEach(e => { if (hide) { e.root.userData.wv = e.root.visible; e.root.visible = false; } else e.root.visible = e.root.userData.wv; });
  };

  // ------------------------------------------------------------ collision
  const HCELL = 8, hashMap = new Map();
  W.boxes = []; W.dynCircles = []; W.arenaClamps = [];
  const hkey = (ix, iz) => ix * 73856093 ^ iz * 19349663;
  W.addCircle = function (x, z, r) {
    const c = { x, z, r }, k = hkey(Math.floor(x / HCELL), Math.floor(z / HCELL));
    if (!hashMap.has(k)) hashMap.set(k, []);
    hashMap.get(k).push(c);
    return c;
  };
  W.addBox = (x, z, hw, hd, rot = 0, on) => W.boxes.push({ x, z, hw, hd, c: Math.cos(rot), s: Math.sin(rot), on });
  W.blocked = function (x, z, r = 1) {   // used by placement to avoid overlapping objects
    const ix = Math.floor(x / HCELL), iz = Math.floor(z / HCELL);
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
      const l = hashMap.get(hkey(ix + a, iz + b)); if (l) for (const c of l) if (Math.hypot(x - c.x, z - c.z) < r + c.r) return true;
    }
    for (const b of W.boxes) {
      const dx = x - b.x, dz = z - b.z, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
      if (Math.abs(lx) < b.hw + r && Math.abs(lz) < b.hd + r) return true;
    }
    return false;
  };
  function pushCircle(p, r, c) {
    const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = r + c.r;
    if (d < m && d > 1e-4) { p.x = c.x + dx / d * m; p.z = c.z + dz / d * m; }
  }
  function resolveOver(p, r) {
    const ix = Math.floor(p.x / HCELL), iz = Math.floor(p.z / HCELL);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = hashMap.get(hkey(ix + a, iz + b)); if (l) for (const c of l) pushCircle(p, r, c); }
    for (const c of W.dynCircles) pushCircle(p, r, c);
    for (const b of W.boxes) {
      if (b.on && !b.on()) continue;
      const dx = p.x - b.x, dz = p.z - b.z, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
      if (Math.abs(lx) > b.hw + r || Math.abs(lz) > b.hd + r) continue;
      const qx = Math.max(-b.hw, Math.min(b.hw, lx)), qz = Math.max(-b.hd, Math.min(b.hd, lz));
      const ox = lx - qx, oz = lz - qz, d = Math.hypot(ox, oz);
      let nx, nz;
      if (d >= r) continue;
      if (d < 1e-4) { const ex = b.hw - Math.abs(lx), ez = b.hd - Math.abs(lz); if (ex < ez) { nx = Math.sign(lx) * (b.hw + r); nz = lz; } else { nx = lx; nz = Math.sign(lz) * (b.hd + r); } }
      else { nx = qx + ox / d * r; nz = qz + oz / d * r; }
      p.x = b.x + nx * b.c + nz * b.s; p.z = b.z - nx * b.s + nz * b.c;
    }
    for (const a of W.arenaClamps) {   // boss arenas hold you in while the fight lasts
      if (!a.on) continue;
      const dx = p.x - a.x, dz = p.z - a.z, d = Math.hypot(dx, dz);
      if (d > a.r - r && d < a.r + 6) { p.x = a.x + dx / d * (a.r - r); p.z = a.z + dz / d * (a.r - r); }
    }
    const d = Math.hypot(p.x, p.z);
    if (d > 600) { p.x *= 600 / d; p.z *= 600 / d; }
  }

  // ------------------------------------------------------------ underground places (cell grids)
  const CELL = 2;
  W.DUNGEONS = {
    catacombs: { DX: 2000, DZ: 0, GW: 62, GH: 90, ceil: 7.0, rooms: { entry: [2, 2, 12, 12], corr1: [12, 6, 30, 8], crypt: [30, 0, 46, 16], corrWest: [16, 12, 30, 14], ossuary: [6, 12, 16, 26],
      corrSouth: [37, 16, 40, 30], hall: [24, 30, 54, 42], hallCorr: [38, 42, 41, 56], arena: [22, 56, 58, 86] }, solid: [[30, 3, 32, 5], [44, 3, 46, 5], [36, 34, 42, 39]] },
    cathedral: { DX: 2200, DZ: 0, GW: 44, GH: 84, ceil: 15.0, rooms: { narthex: [12, 0, 32, 9], nave: [8, 9, 36, 54], chapelW: [2, 22, 8, 32], chapelE: [36, 22, 42, 32], apse: [16, 54, 28, 58], tower: [6, 58, 38, 82] }, solid: [] },
    below: { DX: 2400, DZ: 0, GW: 62, GH: 90, ceil: 8.0, rooms: { entry: [2, 2, 12, 12], corr1: [12, 6, 30, 8], crypt: [30, 0, 46, 16], corrSouth: [37, 16, 40, 30], puzzle: [24, 30, 54, 42],
      gateCorr: [38, 42, 41, 56], arena: [22, 56, 58, 86] }, solid: [[35, 33, 43, 42]] },
  };
  Object.entries(W.DUNGEONS).forEach(([k, d]) => { d.key = k; d.CELL = CELL; d.grid = new Uint8Array(d.GW * d.GH); d.blockers = []; });
  W.dungeonAt = function (x, z) {
    for (const k in W.DUNGEONS) { const d = W.DUNGEONS[k]; if (x >= d.DX - 4 && x < d.DX + d.GW * CELL + 4 && z >= d.DZ - 4 && z < d.DZ + d.GH * CELL + 4) return d; }
    return null;
  };
  W.cellPos = (key, cx, cz, y = 0) => { const d = W.DUNGEONS[key]; return new V3(d.DX + cx * CELL + CELL / 2, y, d.DZ + cz * CELL + CELL / 2); };
  W.walkable = function (x, z) {
    const d = W.dungeonAt(x, z); if (!d) return false;
    const cx = Math.floor((x - d.DX) / CELL), cz = Math.floor((z - d.DZ) / CELL);
    if (cx < 0 || cz < 0 || cx >= d.GW || cz >= d.GH || !d.grid[cz * d.GW + cx]) return false;
    for (const b of d.blockers) if (b.on() && cx >= b.r[0] && cx < b.r[2] && cz >= b.r[1] && cz < b.r[3]) return false;
    return true;
  };
  const free = (x, z, r) => W.walkable(x - r, z - r) && W.walkable(x + r, z - r) && W.walkable(x - r, z + r) && W.walkable(x + r, z + r);
  W.move = function (p, dx, dz, r) {
    if (p.x > 1500) {
      if (free(p.x + dx, p.z, r)) p.x += dx;
      if (free(p.x, p.z + dz, r)) p.z += dz;
      const ix = Math.floor(p.x / HCELL), iz = Math.floor(p.z / HCELL);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const l = hashMap.get(hkey(ix + a, iz + b)); if (l) for (const c of l) { const ox = p.x, oz = p.z; pushCircle(p, r, c); if (!free(p.x, p.z, r)) { p.x = ox; p.z = oz; } }
      }
    } else { p.x += dx; p.z += dz; resolveOver(p, r); }
  };
  W.rayFree = function (a, b) {
    if (a.x < 1500) return 1;
    const d = W.dungeonAt(a.x, a.z), ceil = d ? d.ceil - 0.4 : 6.6, n = 24;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      if (!W.walkable(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t) || a.y + (b.y - a.y) * t > ceil) return Math.max(0, (i - 1.5) / n);
    }
    return 1;
  };

  // ------------------------------------------------------------ light sources (pooled by the game)
  W.lightSources = [];
  W.addLight = (pos, color, intensity, dist, flicker = 0) => { const s = { pos: pos.clone(), color: new THREE.Color(color), intensity, dist, flicker }; W.lightSources.push(s); return s; };

  // ------------------------------------------------------------ build
  W.build = function (scene) {
    W.scene = scene;
    const SVv = HC.Settings ? HC.Settings.v : {};
    TSEG = (HC.Settings && HC.Settings.TERRAIN[SVv.terrain]) || 280; TSTEP = TS / TSEG;
    W.vegMul = HC.Settings ? HC.Settings.VEG[SVv.vegetation] : 0.45;
    W.viewMul = SVv.viewDist || 1;
    W.makeTextures();
    Object.entries(HC.assets).forEach(([n, a]) => dressMaterials(a, n));
    clearH.heart = 0; clearH.hermit = 0;
    clearH.heart = baseH(W.HEART.x + 60, W.HEART.z) * 0 + fbm(W.HEART.x * 0.005, W.HEART.z * 0.005) * 22;
    clearH.hermit = fbm(W.HERMIT.x * 0.005, W.HERMIT.z * 0.005) * 22;
    buildSky(scene);
    buildTerrain(scene);
    buildWater(scene);
    buildVillage();
    buildCitadel();
    buildCrater();
    buildForestAndWilds();
    buildDistant(scene);
    Object.values(W.DUNGEONS).forEach(buildDungeon);
    dressCatacombs(); dressCathedral(); dressBelow();
    buildAsh(scene);
  };

  function buildSky(scene) {
    W.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { sunDir: { value: new V3(0.15, 0.32, -0.94).normalize() }, horizon: { value: new THREE.Color(0x1d2027) }, zenith: { value: new THREE.Color(0x030305) }, t: { value: 0 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 sunDir, horizon, zenith; uniform float t; varying vec3 vDir;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        void main(){
          vec3 d = normalize(vDir); float up = clamp(d.y * 1.6, 0.0, 1.0);
          vec3 col = mix(horizon, zenith, pow(up, 0.6));
          float a = acos(clamp(dot(d, sunDir), -1.0, 1.0)), disc = 0.06;
          float corona = exp(-(a - disc) * 24.0) * step(disc, a);
          float rays = 0.6 + 0.4 * sin(atan(d.x - sunDir.x, d.y - sunDir.y) * 18.0 + t * 0.05);
          col += vec3(1.0, 0.86, 0.62) * corona * 1.6 * rays + vec3(0.55, 0.42, 0.3) * exp(-a * 3.5) * 0.35 * step(disc, a);
          col *= step(disc, a) * 0.99 + 0.01;
          vec2 sp = floor(d.xz / (d.y + 0.2) * 220.0);
          col += vec3(0.6) * step(0.9975, h(sp)) * up;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    W.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), W.skyMat);
    W.sky.renderOrder = -10; scene.add(W.sky);
  }

  function buildTerrain(scene) {
    const geo = new THREE.PlaneGeometry(TS, TS, TSEG, TSEG); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, n = pos.count;
    hgrid = new Float32Array(n);
    const col = new Float32Array(n * 3);
    const C = h => new THREE.Color(h);
    const cMud = C(0x2a2620), cMoss = C(0x1c2416), cDirt = C(0x3a3024), cRock = C(0x3b3a38), cAsh = C(0x46423d), cDark = C(0x141712), cAshen = C(0x353230), tmp = new THREE.Color();
    for (let i = 0; i < n; i++) { const h = baseH(pos.getX(i), pos.getZ(i)); pos.setY(i, h); hgrid[i] = h; }
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal;
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = hgrid[i], nz = fbm(x * 0.05, z * 0.05), zone = W.zoneAt(x, z);
      if (zone === 'forest') tmp.copy(cMoss).lerp(cDark, 0.4 + nz * 0.4);
      else if (zone === 'village') tmp.copy(cMud).lerp(cMoss, 0.3 + nz * 0.3);
      else if (zone === 'citadel') tmp.copy(cAshen).lerp(cAsh, 0.4 + nz * 0.3);
      else if (zone === 'crater') tmp.copy(cMud).lerp(cDark, 0.5 + nz * 0.3);
      else tmp.copy(cMoss).lerp(cAsh, 0.35 + nz * 0.4);
      tmp.lerp(cRock, sstep(0.18, 0.42, 1 - nrm.getY(i)) * 0.9 + sstep(45, 70, h) * 0.5);
      tmp.lerp(cDirt, (1 - sstep(1.8, 4.5, pathDist(x, z))) * 0.85);
      if (h < W.waterAt(x, z) + 0.15) tmp.lerp(cDark, 0.5);
      tmp.multiplyScalar(1.5).convertSRGBToLinear();
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // splat weights: x = forest floor, y = mud/leaves, z = rocky trail (roads and steep ground)
    const spl = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = hgrid[i], zone = W.zoneAt(x, z);
      let a = zone === 'forest' ? 1 : 0.35 + fbm(x * 0.02, z * 0.02) * 0.3, b = zone === 'village' || zone === 'crater' ? 1 : 0.4 + fbm(x * 0.03 + 7, z * 0.03) * 0.4;
      let c = (1 - sstep(1.8, 4.5, pathDist(x, z))) * 2.5 + sstep(0.2, 0.45, 1 - nrm.getY(i)) * 2 + (zone === 'citadel' ? 0.8 : 0) + sstep(40, 70, h);
      a = Math.max(0, a); b = Math.max(0, b);
      const s = a + b + c || 1; spl[i * 3] = a / s; spl[i * 3 + 1] = b / s; spl[i * 3 + 2] = c / s;
      // with real textures carrying the detail, vertex colour becomes a gentle tint (flat mode keeps full colour)
      if (!W.lowMode().flat) { col[i * 3] = col[i * 3] * 0.5 + 0.11; col[i * 3 + 1] = col[i * 3 + 1] * 0.5 + 0.11; col[i * 3 + 2] = col[i * 3 + 2] * 0.5 + 0.1; }
    }
    geo.setAttribute('splat', new THREE.BufferAttribute(spl, 3));
    const A = pbr('ground'), B = pbr('mud'), Cc = pbr('trail');
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: W.tex.ground, normalMap: A ? A.n : W.tex.groundN, normalScale: new THREE.Vector2(1, 1), roughness: 0.95 });
    if (W.lowMode().flat) { mat.map = null; mat.normalMap = null; mat.color.setScalar(1.25); }
    else if (A && B && Cc) {
      mat.onBeforeCompile = sh => {
        Object.assign(sh.uniforms, { tA: { value: A.c }, tB: { value: B.c }, tC: { value: Cc.c }, nA: { value: A.n }, nB: { value: B.n }, nC: { value: Cc.n } });
        sh.vertexShader = 'attribute vec3 splat; varying vec3 vSplat; varying vec2 vWxz;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n vSplat = splat; vWxz = position.xz;');
        sh.fragmentShader = 'uniform sampler2D tA, tB, tC, nA, nB, nC; varying vec3 vSplat; varying vec2 vWxz;\n' + sh.fragmentShader
          .replace('#include <map_fragment>', `vec2 tuv = vWxz * 0.22; vec2 tuv2 = vWxz * 0.031;
            vec3 tcol = texture2D(tA, tuv).rgb * vSplat.x + texture2D(tB, tuv).rgb * vSplat.y + texture2D(tC, tuv * 0.8).rgb * vSplat.z;
            tcol *= 0.75 + 0.5 * texture2D(tB, tuv2).g;   // large-scale variation hides tiling
            diffuseColor.rgb *= tcol * 2.2;`)
          .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace('texture2D( normalMap, vUv )',
            '(texture2D(nA, tuv) * vSplat.x + texture2D(nB, tuv) * vSplat.y + texture2D(nC, tuv * 0.8) * vSplat.z)'));
      };
    }
    mat.userData.keepShader = true;
    W.terrain = new THREE.Mesh(geo, mat);
    scene.add(W.terrain);
  }

  // ------------------------------------------------------------ water: planar reflections + rippling normals + fresnel
  function waterNormals() {
    // tileable ripple normal map built from layered value noise
    const s = 256, c = document.createElement('canvas'); c.width = c.height = s;
    const g = c.getContext('2d'), im = g.createImageData(s, s), d = im.data, hgt = new Float32Array(s * s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const ax = x / s * Math.PI * 2, ay = y / s * Math.PI * 2;
      let h = 0, amp = 1, f = 2;
      for (let o = 0; o < 5; o++) { h += vnoise(Math.cos(ax) * f + 11 * o, Math.sin(ax) * f + Math.cos(ay) * f * 0.8 + Math.sin(ay) * f * 0.8) * amp; f *= 2; amp *= 0.5; }
      hgt[y * s + x] = h;
    }
    const H = (x, y) => hgt[((y + s) % s) * s + ((x + s) % s)];
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * 3, dy = (H(x, y + 1) - H(x, y - 1)) * 3, l = Math.hypot(dx, dy, 1), i = (y * s + x) * 4;
      d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (-dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  }
  W.waters = [];
  W.makeWater = function (geo, pos, opts = {}) {
    let m;
    if (W.cheapWater !== false) {
      // glossy dark surface reflecting the baked eclipse sky (env map), rippled by a scrolling normal map
      if (!W.waterStd) {
        const n = W.tex.waterN; n.repeat.set(70, 70);
        W.waterStd = new THREE.MeshPhongMaterial({ color: 0x020406, specular: 0x161412, shininess: 500, normalMap: n, normalScale: new THREE.Vector2(0.18, 0.18),
          transparent: true, opacity: 0.95 });
      }
      m = new THREE.Mesh(geo, W.waterStd);
    } else if (THREE.Water) {
      m = new THREE.Water(geo, {
        textureWidth: 384, textureHeight: 384, waterNormals: W.tex.waterN, alpha: 1.0,
        sunDirection: new V3(0.15, 0.32, -0.94).normalize(), sunColor: opts.sun || 0xd8c8a8,
        waterColor: opts.color || 0x04080b, distortionScale: opts.distort || 0.9, fog: true,
      });
      m.material.uniforms.size.value = opts.size || 2.5;
      // darker, subtler reflections (the stock shader is tuned for a bright ocean)
      m.material.fragmentShader = m.material.fragmentShader
        .replace('vec3( 0.1 ) + reflectionSample * 0.9 + reflectionSample * specularLight', 'vec3( 0.015 ) + reflectionSample * 0.32 + reflectionSample * specularLight * 0.5')
        .replace('sunColor * diffuseLight * 0.3', 'sunColor * diffuseLight * 0.05');
      const orig = m.onBeforeRender;
      m.onBeforeRender = function () { W.hideHeavy(true); orig.apply(this, arguments); W.hideHeavy(false); };
    } else {
      m = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color: 0x030507, specular: 0x2a2c30, shininess: 140 }));
    }
    m.position.copy(pos); W.scene.add(m); W.waters.push(m);
    return m;
  };
  function buildWater(scene) {
    W.tex.water.encoding = THREE.LinearEncoding;
    W.tex.waterN = waterNormals();
    W.waterMat = new THREE.MeshPhongMaterial({ color: 0x030507, specular: 0x2a2c30, shininess: 140, transparent: true, opacity: 0.92, bumpMap: W.tex.water, bumpScale: 0.012 });
    // water removed by request: no surface meshes are created
  }

  const facing = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);

  // generic overlap-free scatter: rejects spots too close to anything already placed
  function scatter(n, area, ok, minR) {
    const out = []; let tries = 0;
    while (out.length < n && tries++ < n * 40) {
      const x = area.x0 + rand() * (area.x1 - area.x0), z = area.z0 + rand() * (area.z1 - area.z0);
      if (!ok(x, z) || W.blocked(x, z, minR)) continue;
      out.push([x, z]);
    }
    return out;
  }
  W.scatter = scatter;

  function buildVillage() {
    W.church = W.place('church', W.CHURCH.x, W.CHURCH.z, 0, 1, -0.3);
    W.bell = W.church.getObjectByName('bell');
    W.addBox(0, -40, 5.0, 9.4); W.addBox(0, -28.5, 2.8, 2.8); W.addCircle(0, -49, 4.2);
    W.addLight(new V3(0, 8, -24), 0xff9a4a, 2.2, 16, 0.1);
    const houses = [['house_a', -24, 12], ['house_b', -27, -10], ['house_c', -16, -25], ['house_b', 22, 14], ['house_a', 27, -5], ['house_c', -11, 31], ['house_a', 15, 33],
      ['house_ruin', -36, 30], ['house_c', 34, 30], ['house_b', -39, -2], ['house_ruin', 17, -27], ['house_a', -48, 14], ['house_ruin', 46, 8]];
    const HS = { house_a: [3.25, 4.25], house_b: [2.25, 3.25], house_c: [3.25, 3.25], house_ruin: [3.25, 4.25] };
    W.houses = [];
    houses.forEach(([kind, x, z]) => {
      const ry = facing(x, z, 0, 3) + (rand() - 0.5) * 0.25, s = 0.95 + rand() * 0.1;
      const h = W.place(kind, x, z, ry, s, -0.15, Math.max(0.2, W.heightAt(x, z)));
      h.userData.kind = kind; W.houses.push(h);
      const [hw, hd] = HS[kind];
      W.addBox(x, z, hw * s, hd * s, ry);
      if (kind !== 'house_ruin') { const fwd = new V3(Math.sin(ry), 0, Math.cos(ry)); W.addLight(new V3(x, 2, z).addScaledVector(fwd, hd + 1), 0xff8a3a, 1.4, 9, 0.15); }
    });
    W.place('well', -5, -2, 0.4); W.addCircle(-5, -2, 1.2);
    const sv = W.SHRINES.village.pos;
    W.place('shrine', sv.x, sv.z, 0); W.addCircle(sv.x, sv.z, 1.0); W.addLight(sv.clone().setY(1.2), 0xff6a20, 3, 14, 0.35);
    [[4, 40], [-4, 22], [-8, 8], [12, -6], [20, -16], [-20, -14], [-3, 62], [3, 100]].forEach(([x, z], i) => {
      const ry = rand() * 6.28; W.place('lamppost', x, z, ry); W.addCircle(x, z, 0.25);
      if (i % 3 !== 2) W.addLight(new V3(x - Math.sin(ry) * 0.85, W.heightAt(x, z) + 2.65, z - Math.cos(ry) * 0.85), 0xffa050, 1.6, 11, 0.25);
    });
    W.place('statue', -9, 14, facing(-9, 14, 0, 30), 1.1); W.addCircle(-9, 14, 0.9);
    W.place('wagon', -14, 48, 2.2); W.addBox(-14, 48 + 1.1, 1.0, 2.0, 2.2);
    [[-21, 17], [19, 19], [24, -1], [-13, 26]].forEach(([x, z], i) => { W.place('crate', x, z, i * 0.7, 0.9); W.addCircle(x, z, 0.6); });
    // graveyard
    const graves = [], crosses = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
      if (rand() < 0.12) continue;
      const x = W.GRAVE.x - 9 + c * 3.4 + (rand() - 0.5) * 0.6, z = W.GRAVE.z - 7 + r * 4.2 + (rand() - 0.5) * 0.6;
      (rand() < 0.3 ? crosses : graves).push({ x, z, ry: Math.PI / 4 + (rand() - 0.5) * 0.3, rx: (rand() - 0.5) * 0.15, rz: (rand() - 0.5) * 0.2, s: 0.9 + rand() * 0.25, sink: 0.1 });
      W.addCircle(x, z, 0.45);
    }
    W.instance('grave', graves); W.instance('grave_cross', crosses);
    const fences = [];
    for (let i = 0; i < 26; i++) {
      if (i === 21 || i === 20) continue;
      const a = i / 26 * Math.PI * 2;
      fences.push({ x: W.GRAVE.x + Math.cos(a) * 15, z: W.GRAVE.z + Math.sin(a) * 13, ry: -a + Math.PI / 2, rz: (rand() - 0.5) * 0.12, s: 1.15 });
    }
    W.instance('fence', fences);
    const cr = facing(W.CRYPT.x, W.CRYPT.z, 20, -10);
    W.crypt = W.place('arch', W.CRYPT.x, W.CRYPT.z, cr, 0.55, -0.1);
    const back = new THREE.Mesh(new THREE.BoxGeometry(5, 8, 0.3), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    back.position.set(0, 4, 0); W.crypt.add(back);
    W.cryptGate = W.place('gate', W.CRYPT.x, W.CRYPT.z, cr, 0.6); W.cryptGate.scale.set(0.6, 0.55, 0.6);
    W.addBox(W.CRYPT.x, W.CRYPT.z, 2.5, 0.8, cr);
    const bz = new V3(W.CRYPT.x + Math.sin(cr) * 3 + Math.cos(cr) * 3, 0, W.CRYPT.z + Math.cos(cr) * 3 - Math.sin(cr) * 3);
    W.place('brazier', bz.x, bz.z); W.addLight(bz.clone().setY(W.heightAt(bz.x, bz.z) + 1.6), 0xff6020, 2.2, 10, 0.4);
    // the old south road
    W.place('arch', 0, 70, 0, 0.75, -0.2); W.addBox(-2.25, 70, 0.45, 0.5); W.addBox(2.25, 70, 0.45, 0.5);
    W.place('gallows', W.GALLOWS.x, W.GALLOWS.z, 0.7); W.addBox(W.GALLOWS.x, W.GALLOWS.z, 1.9, 1.9, 0.7);
    W.place('watchtower', W.TOWER.x, W.TOWER.z, 0); W.addCircle(W.TOWER.x, W.TOWER.z, 3.2);
    [[-130, 190], [-118, 205], [-145, 178]].forEach(([x, z], i) => { const ry = rand() * 6; W.place('house_ruin', x, z, ry, 1); W.addBox(x, z, 3.3, 2.8, ry); });
    W.place('wagon', 60, 16, 1.2); W.addBox(60, 16, 1.0, 2.0, 1.2);
  }

  function buildCitadel() {
    const C = W.CITADEL, y = W.CIT_H;
    // ring of walls and towers around the courtyard; gap in the south for the gatehouse
    const R = 52, nSeg = 22;
    for (let i = 0; i < nSeg; i++) {
      const a = (i + 0.5) / nSeg * Math.PI * 2;
      const x = C.x + Math.sin(a) * R, z = C.z + Math.cos(a) * R;
      if (Math.abs(a - 0) < 0.25 || Math.abs(a - Math.PI * 2) < 0.25) continue;   // gatehouse gap (south, +Z)
      const ry = a;   // outer face (-Y in Blender = +Z local) points away from centre
      W.place('castle_wall', x, z, ry, 1.08, 0, y - 0.5);
      W.addBox(x, z, 7.4, 1.7, ry);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i + 0.5) / 6 * Math.PI * 2 + 0.26, x = C.x + Math.sin(a) * R, z = C.z + Math.cos(a) * R;
      W.place('castle_tower', x, z, a, 1, 0, y - 0.5); W.addCircle(x, z, 4.6);
      W.addLight(new V3(x, y + 9, z), 0xff8a3a, 1.2, 14, 0.2);
    }
    W.place('gatehouse', W.GATEHOUSE.x, W.GATEHOUSE.z, 0, 1, 0, y - 0.5);
    W.addBox(-5, W.GATEHOUSE.z, 2.6, 4.1); W.addBox(5, W.GATEHOUSE.z, 2.6, 4.1);
    W.addCircle(-8.2, W.GATEHOUSE.z + 3, 3.2); W.addCircle(8.2, W.GATEHOUSE.z + 3, 3.2);
    W.citadelGate = W.place('gate', W.GATEHOUSE.x, W.GATEHOUSE.z + 3.2, 0, 1, 0, y);
    W.citadelGate.scale.set(0.98, 1.1, 1);
    W.addBox(0, W.GATEHOUSE.z + 3.2, 2.6, 0.6, 0, () => !W.citadelOpen);
    W.addLight(new V3(0, y + 4, W.GATEHOUSE.z + 6), 0xff7a30, 2.4, 14, 0.3);
    W.keep = W.place('keep', C.x, C.z - 38, 0, 1, 0, y - 0.5);
    W.addBox(C.x, C.z - 38, 13.5, 11.5); [[-13, 11], [13, 11], [-13, -11], [13, -11]].forEach(([dx, dz]) => W.addCircle(C.x + dx, C.z - 38 + dz, 3.8));
    // courtyard dressing
    [[-18, 10], [18, 10], [-18, -15], [18, -15]].forEach(([dx, dz]) => { const x = C.x + dx, z = C.z + dz; W.place('brazier', x, z, 0, 1.4, 0, y); W.addCircle(x, z, 0.7); W.addLight(new V3(x, y + 2, z), 0xff5020, 2.4, 15, 0.4); });
    for (let i = 0; i < 6; i++) { const x = C.x - 25 + i * 10, z = C.z + 22; W.place('statue', x, z, Math.PI, 0.9, 0, y); W.addCircle(x, z, 0.85); }
    W.arenaCorvane = { x: C.x, z: C.z, r: 42, on: false }; W.arenaClamps.push(W.arenaCorvane);
    // the road up: ruined walls and a shrine
    const gs = W.SHRINES.gate.pos; W.place('shrine', gs.x, gs.z, 0); W.addCircle(gs.x, gs.z, 1.0); W.addLight(gs.clone().setY(W.heightAt(gs.x, gs.z) + 1.2), 0xff6a20, 3, 14, 0.35);
    [[-14, -300], [16, -370], [-12, -395]].forEach(([x, z], i) => { W.place('castle_wall', x, z, 0.4 + i, 0.5, -1.8); W.addBox(x, z, 3.5, 0.8, 0.4 + i); });
  }

  function buildCrater() {
    const K = W.CRATER, f = W.CATH_FLOOR;
    W.cathedral = W.place('cathedral', K.x, K.z, -Math.PI / 2, 1, 0, f - 4.2);   // swallowed to the knees
    W.addBox(K.x, K.z, 11.5, 23, -Math.PI / 2);
    W.addBox(K.x - 25, K.z, 13, 4.2, -Math.PI / 2);   // facade & towers
    W.addLight(new V3(K.x - 30, f + 15, K.z), 0xff9a4a, 2.5, 26, 0.1);
    const rs = W.SHRINES.rim.pos; W.place('shrine', rs.x, rs.z, 0); W.addCircle(rs.x, rs.z, 1.0); W.addLight(rs.clone().setY(W.heightAt(rs.x, rs.z) + 1.2), 0xff6a20, 3, 14, 0.35);
    // drowned graves and broken pews on the crater floor
    const graves = scatter(40, { x0: K.x - 70, x1: K.x + 70, z0: K.z - 70, z1: K.z + 70 }, (x, z) => { const d = Math.hypot(x - K.x, z - K.z); return d > 36 && d < 80; }, 1.2)
      .map(([x, z]) => { W.addCircle(x, z, 0.45); return { x, z, ry: rand() * 6, rx: (rand() - 0.5) * 0.4, rz: (rand() - 0.5) * 0.4, s: 1, sink: 0.25 }; });
    W.instance('grave', graves);
    [[K.x - 48, K.z - 14], [K.x - 52, K.z + 12], [K.x - 60, K.z - 2]].forEach(([x, z], i) => { W.place('pew', x, z, 1.4 + i, 1, -0.2); W.addBox(x, z, 1.8, 0.3, 1.4 + i); });
    [[K.x - 42, K.z - 22], [K.x - 42, K.z + 22]].forEach(([x, z]) => { W.place('lamppost', x, z, Math.PI / 2); W.addLight(new V3(x - 0.85, W.heightAt(x, z) + 2.65, z), 0x9ab8ff, 1.4, 11, 0.2); });
  }

  function buildForestAndWilds() {
    // landmark clearings
    W.statues = [];
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + 0.3, x = W.HEART.x + Math.cos(a) * 24, z = W.HEART.z + Math.sin(a) * 24;
      const st = W.place('statue', x, z, facing(x, z, W.HEART.x, W.HEART.z), 1.0, -0.1);
      const c = { x, z, r: 0.85 }; W.dynCircles.push(c);
      W.statues.push({ mesh: st, col: c, home: new V3(x, 0, z), unseen: 0, ring: true });
    }
    W.arenaSentinel = { x: W.HEART.x, z: W.HEART.z, r: 21, on: false }; W.arenaClamps.push(W.arenaSentinel);
    [[-186, -2], [-214, 6], [-240, -26], [-290, -34], [-330, -40], [-262, -70]].forEach(([x, z]) => {
      const st = W.place('statue', x, z, facing(x, z, W.HEART.x, W.HEART.z), 1.0, -0.1);
      const c = { x, z, r: 0.85 }; W.dynCircles.push(c);
      W.statues.push({ mesh: st, col: c, home: new V3(x, 0, z), unseen: 0 });
    });
    // hermit's camp
    const hs = W.SHRINES.hermit.pos; W.place('shrine', hs.x, hs.z, 0); W.addCircle(hs.x, hs.z, 1.0); W.addLight(hs.clone().setY(W.heightAt(hs.x, hs.z) + 1.2), 0xff6a20, 3, 14, 0.35);
    W.place('house_b', W.HERMIT.x - 4, W.HERMIT.z - 8, 0.3, 0.75); W.addBox(W.HERMIT.x - 4, W.HERMIT.z - 8, 2.0, 2.5, 0.3);
    W.addLight(new V3(W.HERMIT.x - 3, 2, W.HERMIT.z - 4), 0xff8a3a, 1.4, 9, 0.15);
    W.place('deadtrunk', W.HERMIT.x + 3, W.HERMIT.z + 3, 1.0, 1.2); W.addBox(W.HERMIT.x + 3, W.HERMIT.z + 3, 2.4, 0.5, 1.0);
    // vegetation (overlap-free: every placement checks what is already there)
    const okVeg = (x, z, clear = 5) => {
      if (pathDist(x, z) < clear) return false;
      if (Math.hypot(x, z - 5) < 88 || Math.hypot(x, z) > 610) return false;
      if (Math.hypot(x - W.HEART.x, z - W.HEART.z) < 30 || Math.hypot(x - W.HERMIT.x, z - W.HERMIT.z) < 16) return false;
      if (Math.hypot(x - W.WHISPER.x, z - W.WHISPER.z) < 8) return false;
      if (Math.hypot(x - W.CITADEL.x, z - W.CITADEL.z) < 75) return false;
      if (Math.hypot(x - W.CRATER.x, z - W.CRATER.z) < 62) return false;
      if (W.heightAt(x, z) < W.waterAt(x, z) + 0.2) return false;
      return true;
    };
    const pines = [[], [], []], dead = [[], [], []], bushes = [], rocks = [[], [], []], ferns = [], grass = [], mossy = [];
    const PINE = ['pine1', 'pine3', 'pine5'], DEAD = ['deadtree1', 'deadtree2', 'deadtree3'], ROCK = ['rockm1', 'rockm2', 'rockm3'];
    const forestArea = { x0: -620, x1: -150, z0: -420, z1: 420 };
    const pick = () => Math.floor(rand() * 3);
    scatter(1800, forestArea, (x, z) => okVeg(x, z), 2.6).forEach(([x, z]) => {
      const s = 1.1 + rand() * 0.8;
      if (rand() < 0.18) dead[pick()].push({ x, z, ry: rand() * 6.28, s: s * 0.85, rz: (rand() - 0.5) * 0.1, sink: 0.25 });
      else pines[pick()].push({ x, z, ry: rand() * 6.28, s, sy: s * (0.9 + rand() * 0.4), sink: 0.25 });
      W.addCircle(x, z, 0.3 * s + 0.15);
    });
    scatter(1000, { x0: -620, x1: 620, z0: -620, z1: 620 }, (x, z) => x > -150 && okVeg(x, z) && rand() < 0.75, 3.5).forEach(([x, z]) => {
      const s = 1.0 + rand() * 0.8;
      if (rand() < 0.45) dead[pick()].push({ x, z, ry: rand() * 6.28, s, sink: 0.25 }); else pines[pick()].push({ x, z, ry: rand() * 6.28, s, sy: s, sink: 0.25 });
      W.addCircle(x, z, 0.3 * s + 0.15);
    });
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2, x = W.WHISPER.x + Math.cos(a) * 10, z = W.WHISPER.z + Math.sin(a) * 10; dead[i % 3].push({ x, z, ry: rand() * 6.28, s: 1.1, sink: 0.2 }); W.addCircle(x, z, 0.5); }
    scatter(260, { x0: -620, x1: 620, z0: -620, z1: 620 }, (x, z) => okVeg(x, z, 6), 3).forEach(([x, z]) => {
      const s = 0.5 + rand() * 1.1;
      if (rand() < 0.15) { mossy.push({ x, z, ry: rand() * 6.28, s: s * 1.4, sink: 0.2 }); W.addCircle(x, z, 1.3 * s); }
      else { rocks[pick()].push({ x, z, ry: rand() * 6.28, s, sink: 0.25 * s }); W.addCircle(x, z, 1.2 * s); }
    });
    // ground clutter: ferns under the canopy, wispy grass in the open (no collision)
    const vm = W.vegMul === undefined ? 1 : W.vegMul;
    const seedSave = seed;   // clutter density is per-player; keep the shared world layout deterministic
    if (vm > 0) {
      scatter(Math.round(3500 * vm), forestArea, (x, z) => okVeg(x, z, 2.5), 0.8).forEach(([x, z]) => ferns.push({ x, z, ry: rand() * 6.28, s: 0.6 + rand() * 0.7, sink: 0.05 }));
      scatter(Math.round(4000 * vm), { x0: -620, x1: 620, z0: -620, z1: 620 }, (x, z) => x > -200 && okVeg(x, z, 2.5) && W.heightAt(x, z) > 1, 0.8).forEach(([x, z]) => grass.push({ x, z, ry: rand() * 6.28, s: 0.5 + rand() * 0.6, sink: 0.05 }));
    }
    seed = seedSave;
    // the crimson tree at the heart of Blackroot
    W.place('twisted', W.HEART.x - 2, W.HEART.z + 3, 0.6, 1.1, -0.3); W.addCircle(W.HEART.x - 2, W.HEART.z + 3, 1.6);
    W.addLight(new V3(W.HEART.x - 2, W.heightAt(W.HEART.x, W.HEART.z) + 6, W.HEART.z + 3), 0xff3a20, 1.2, 22, 0.2);
    const cliffs = scatter(40, { x0: -640, x1: 640, z0: -640, z1: 640 }, (x, z) => { const d = Math.hypot(x, z); return d > 470 && d < 600 && pathDist(x, z) > 20; }, 10)
      .map(([x, z]) => { W.addCircle(x, z, 7); return { x, z, ry: rand() * 6, s: 1 + rand(), sink: 1.5 }; });
    scatter(1500, { x0: -620, x1: 620, z0: -620, z1: 620 }, (x, z) => okVeg(x, z, 3.2), 1.2).forEach(([x, z]) => bushes.push({ x, z, ry: rand() * 6.28, s: 0.5 + rand() * 0.7, sink: 0.15 }));
    PINE.forEach((n, i) => W.instance(n, pines[i], 110, 50));
    DEAD.forEach((n, i) => W.instance(n, dead[i], 110, 50));
    ROCK.forEach((n, i) => W.instance(n, rocks[i], 90, 50));
    W.instance('mossrocks', mossy, 80, 50);
    W.instance('bush', bushes, 60, 50);
    W.instance('fern', ferns, 34, 25);
    W.instance('grass', grass, 30, 25);
    W.instance('cliff', cliffs, 400);
    const logs = scatter(60, forestArea, (x, z) => okVeg(x, z), 3).map(([x, z]) => { const ry = rand() * 6; W.addBox(x, z, 2.2, 0.5, ry); return { x, z, ry, s: 1.2, sink: 0.1 }; });
    W.instance('deadtrunk', logs, 110);
  }

  function buildDistant(scene) {
    // far silhouette of the citadel, only while you are far away from it
    const silMat = new THREE.MeshBasicMaterial({ color: 0x0b0c10, fog: false }), winMat = new THREE.MeshBasicMaterial({ color: 0xff8c3a, fog: false, toneMapped: false });
    const g = new THREE.Group();
    [['keep', 0, -38, 1], ['castle_tower', -50, 0, 1], ['castle_tower', 50, 0, 1], ['castle_tower', -30, 40, 1], ['castle_tower', 30, 40, 1], ['gatehouse', 0, 50, 1]].forEach(([n, x, z, s]) => {
      const t = W.clone(n); t.traverse(o => { if (o.isMesh) o.material = /Glow/.test(o.material.name) ? winMat : silMat; });
      t.position.set(x, 0, z); t.scale.setScalar(s); g.add(t);
    });
    const hill = new THREE.Mesh(new THREE.CylinderGeometry(70, 260, 90, 12), silMat); hill.position.set(0, -45, 0); g.add(hill);
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(900, 60, 40), silMat); ridge.position.set(0, -48, 60); g.add(ridge);
    g.traverse(o => { if (o.isMesh) o.renderOrder = -5; });
    W.citadelSil = g; scene.add(g);
  }

  // ------------------------------------------------------------ underground places
  function buildDungeon(d) {
    const mark = ([x0, z0, x1, z1], v) => { for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) d.grid[z * d.GW + x] = v; };
    Object.values(d.rooms).forEach(r => mark(r, 1));
    d.solid.forEach(r => mark(r, 0));
    const walls = [];
    for (let z = 0; z < d.GH; z++) for (let x = 0; x < d.GW; x++) {
      if (d.grid[z * d.GW + x]) continue;
      let adj = false;
      for (let a = -1; a <= 1 && !adj; a++) for (let b = -1; b <= 1; b++) { const xx = x + a, zz = z + b; if (xx >= 0 && zz >= 0 && xx < d.GW && zz < d.GH && d.grid[zz * d.GW + xx]) { adj = true; break; } }
      if (adj) walls.push([x, z]);
    }
    const H = d.ceil + 0.3;
    const wallMat = W.triplanar(new THREE.MeshStandardMaterial({ map: W.tex.brick, normalMap: W.tex.brickN, roughness: 0.92 }), d.key === 'cathedral' ? 'blocks' : 'brick', 0.45, d.key === 'cathedral' ? 0x8a8680 : 0x6a6662);
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL, H, CELL), wallMat, walls.length), m4 = new THREE.Matrix4();
    walls.forEach(([x, z], i) => { const p = W.cellPos(d.key, x, z, H / 2); m4.makeTranslation(p.x, p.y, p.z); im.setMatrixAt(i, m4); });
    W.scene.add(im);
    const fx = d.DX + d.GW * CELL / 2, fz = d.DZ + d.GH * CELL / 2;
    const floorTex = W.tex.floor.clone(); floorTex.needsUpdate = true; floorTex.repeat.set(d.GW / 2, d.GH / 2);
    const floorN = W.tex.floorN.clone(); floorN.needsUpdate = true; floorN.repeat.set(d.GW / 2, d.GH / 2);
    const cob = pbr('cobble');
    let fmap = floorTex, fnrm = floorN;
    if (cob) { fmap = cob.c.clone(); fnrm = cob.n.clone(); [fmap, fnrm].forEach(t => { t.needsUpdate = true; t.repeat.set(d.GW / 1.5, d.GH / 1.5); }); }
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(d.GW * CELL, d.GH * CELL), new THREE.MeshStandardMaterial({ map: fmap, normalMap: fnrm, color: 0x8a8580, roughness: 0.85 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(fx, 0, fz); W.scene.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(d.GW * CELL, d.GH * CELL), new THREE.MeshStandardMaterial({ color: 0x0c0b0a, roughness: 1 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(fx, d.ceil, fz); W.scene.add(ceil);
    const sh = Object.values(W.SHRINES).find(s => s.dungeon === d.key);
    if (sh) { sh.pos = W.cellPos(d.key, sh.cell[0], sh.cell[1]); W.place('shrine', sh.pos.x, sh.pos.z, 0, 1, 0, 0); W.addCircle(sh.pos.x, sh.pos.z, 1.0); W.addLight(sh.pos.clone().setY(1.2), 0xff6a20, 3, 14, 0.35); }
  }
  const P = W.cellPos;
  function brazier(key, x, z, s = 1) { const p = P(key, x, z); W.place('brazier', p.x, p.z, 0, s, 0, 0); W.addLight(p.clone().setY(1.6 * s), 0xff6020, 2.2, 12, 0.4); W.addCircle(p.x, p.z, 0.5 * s); }
  function seal(key, x, z) {
    const sp = P(key, x, z), g = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.3, 0.3, 40), new THREE.MeshStandardMaterial({ color: 0x1a1716, roughness: 0.8, map: W.tex.grunge }));
    const glow = new THREE.MeshBasicMaterial({ color: 0xff2010, toneMapped: false });
    for (let r = 0; r < 3; r++) { const t = new THREE.Mesh(new THREE.TorusGeometry(2 + r * 1.6, 0.07, 6, 48), glow); t.rotation.x = Math.PI / 2; t.position.y = 0.17; g.add(t); }
    for (let i = 0; i < 8; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 5.2), glow); b.rotation.y = i / 8 * Math.PI; b.position.y = 0.17; g.add(b); }
    g.add(disc); g.position.copy(sp); W.scene.add(g);
    W.sealMat = glow; W.addLight(sp.clone().setY(1.5), 0xff2010, 3, 18, 0.2);
    return sp;
  }
  function fogWall(key, x, z, w) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 7), new THREE.MeshBasicMaterial({ color: 0xc8b89a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    const p = P(key, x, z); m.position.set(p.x, 3.5, p.z - 1); W.scene.add(m); return m;
  }
  function dressCatacombs() {
    const k = 'catacombs';
    for (let i = 0; i < 4; i++) for (const cx of [33, 43]) { const p = P(k, cx, 2 + i * 3.5); W.place('sarcophagus', p.x, p.z, Math.PI / 2, 1, 0, 0); W.addCircle(p.x, p.z, 1.1); }
    [[31, 1], [44, 14], [31, 14], [7, 13], [14, 24], [26, 31], [52, 31], [26, 41], [52, 41]].forEach(([x, z]) => brazier(k, x, z));
    for (let i = 0; i < 3; i++) { const p = P(k, 8 + i * 3, 25); W.place('sarcophagus', p.x, p.z, 0, 0.9, 0, 0); }
    for (let i = 0; i < 14; i++) { const p = P(k, 24 + (i * 7) % 30, 31 + (i * 3) % 10); W.place('bones', p.x, p.z, i, 1, 0, 0); }
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, p = P(k, 40 + Math.cos(a) * 13, 71 + Math.sin(a) * 11); W.place('pillar', p.x, p.z, a, 1.0, 0, 0); W.addCircle(p.x, p.z, 0.9); if (i % 2 === 0) W.addLight(p.clone().setY(3), 0x8aa0ff, 1.0, 12, 0.3); }
    W.fogBrother = fogWall(k, 39, 56, 6.2);
    W.DUNGEONS.catacombs.blockers.push({ r: [38, 56, 41, 57], on: () => W.fogWall === 'brother' });
  }
  function dressCathedral() {
    const k = 'cathedral';
    for (let z = 12; z < 52; z += 5) for (const x of [12, 31]) { const p = P(k, x, z); W.place('pillar', p.x, p.z, 0, 1.9, 0, 0); W.addCircle(p.x, p.z, 1.4); }
    for (let z = 14; z < 50; z += 3) for (const x of [17, 26]) { const p = P(k, x, z); W.place('pew', p.x, p.z, Math.PI, 1, 0, 0); W.addBox(p.x, p.z, 1.8, 0.3); }
    [[14, 2], [29, 2], [10, 20], [33, 20], [10, 44], [33, 44], [5, 26], [39, 26], [22, 56]].forEach(([x, z]) => brazier(k, x, z, 1.2));
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, p = P(k, 22 + Math.cos(a) * 12, 70 + Math.sin(a) * 9); W.place('pillar', p.x, p.z, a, 1.6, 0, 0); W.addCircle(p.x, p.z, 1.2); }
    // the hanging bell above the arena
    const bp = P(k, 22, 70);
    const bell = W.clone('church').getObjectByName('bell');
    if (bell) { bell.parent && bell.parent.remove(bell); bell.position.set(bp.x, 9, bp.z); bell.scale.setScalar(2.2); W.scene.add(bell); W.bigBell = bell; }
    W.addLight(new V3(bp.x, 6, bp.z), 0x9ab8ff, 2.0, 20, 0.15);
    W.fogBell = fogWall(k, 22, 58, 20);
    W.DUNGEONS.cathedral.blockers.push({ r: [16, 58, 28, 59], on: () => W.fogWall === 'bell' });
    // flooded floor sheen in the nave
  }
  function dressBelow() {
    const k = 'below';
    for (let i = 0; i < 4; i++) for (const cx of [33, 43]) { const p = P(k, cx, 2 + i * 3.5); W.place('sarcophagus', p.x, p.z, Math.PI / 2, 1, 0, 0); W.addCircle(p.x, p.z, 1.1); }
    [[31, 1], [44, 14], [33, 31], [45, 31], [25, 41], [53, 41]].forEach(([x, z]) => brazier(k, x, z));
    W.plates = [P(k, 28, 40), P(k, 50, 40)].map(p => {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.4, 0.18, 20), new THREE.MeshStandardMaterial({ color: 0x3a3836, roughness: 0.9, map: W.tex.grunge }));
      const rune = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 6, 28), new THREE.MeshBasicMaterial({ color: 0x331a10 }));
      rune.rotation.x = Math.PI / 2; rune.position.y = 0.11; g.add(base, rune); g.position.copy(p); W.scene.add(g);
      return { pos: p, rune, light: W.addLight(p.clone().setY(1), 0xff7a30, 0, 7, 0.1), pressed: false };
    });
    const gp = P(k, 39, 42); W.gate = W.place('gate', gp.x, gp.z - 0.6, 0, 1, 0, 0); W.gate.scale.set(1.2, 1.15, 1);
    W.DUNGEONS.below.blockers.push({ r: [38, 42, 41, 43], on: () => !W.gateOpen });
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, p = P(k, 40 + Math.cos(a) * 13, 71 + Math.sin(a) * 11); W.place('pillar', p.x, p.z, a, 1.0, 0, 0); W.addCircle(p.x, p.z, 0.9); if (i % 2 === 0) W.addLight(p.clone().setY(3), 0xff4a1a, 1.4, 12, 0.3); }
    [[26, 60], [54, 60], [26, 82], [54, 82]].forEach(([x, z]) => brazier(k, x, z, 1.4));
    W.SEAL = seal(k, 40, 80);
    const th = new THREE.Group(), stoneM = new THREE.MeshStandardMaterial({ color: 0x2a2826, map: W.tex.grunge, roughness: 0.9 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 2), stoneM); seat.position.y = 0.6;
    const backr = new THREE.Mesh(new THREE.BoxGeometry(2.4, 5, 0.6), stoneM); backr.position.set(0, 2.5, 0.8);
    th.add(seat, backr); th.position.set(W.SEAL.x, 0.2, W.SEAL.z + 0.5); W.scene.add(th); W.addCircle(W.SEAL.x, W.SEAL.z + 0.5, 1.4);
    W.fogKing = fogWall(k, 39, 56, 6.2);
    W.DUNGEONS.below.blockers.push({ r: [38, 56, 41, 57], on: () => W.fogWall === 'king' });
  }

  // ------------------------------------------------------------ ash particles
  function buildAsh(scene) {
    const N = 1600, geo = new THREE.BufferGeometry(), p = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { p[i * 3] = (Math.random() - 0.5) * 60; p[i * 3 + 1] = Math.random() * 30; p[i * 3 + 2] = (Math.random() - 0.5) * 60; }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    W.ash = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x9a9288, size: 0.09, transparent: true, opacity: 0.75, depthWrite: false }));
    W.ash.frustumCulled = false; scene.add(W.ash);
  }

  // bake the eclipse sky into a prefiltered environment map once (for water and metal reflections)
  W.makeEnv = function (renderer) {
    const pm = new THREE.PMREMGenerator(renderer), s = new THREE.Scene();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), W.skyMat); s.add(sky);
    const rt = pm.fromScene(s, 0.02);
    W.env = rt.texture;   // kept for metals; water stays env-free (the corona's HDR values bloom out)
    pm.dispose();
  };
  W.gateOpen = false; W.fogWall = null;
  W.update = function (dt, t, camPos, cam) {
    HC.debugCam = cam;
    W.skyMat.uniforms.t.value = t;
    W.sky.position.copy(camPos);
    const dc = Math.hypot(camPos.x - W.CITADEL.x, camPos.z - W.CITADEL.z);
    W.citadelSil.visible = camPos.x < 1500 && dc > 260;
    if (W.citadelSil.visible) { const dir = new V3(W.CITADEL.x - camPos.x, 0, W.CITADEL.z - camPos.z).normalize(); W.citadelSil.position.set(camPos.x + dir.x * 330, Math.min(camPos.y, 10) + 4, camPos.z + dir.z * 330); W.citadelSil.rotation.y = Math.atan2(-dir.x, -dir.z); }
    W.tex.water.offset.set(t * 0.004, t * 0.006);
    if (W.waterStd) { W.tex.waterN.offset.set(t * 0.006, t * 0.004); W.waterStd.normalScale.set(0.17 + Math.sin(t * 0.4) * 0.03, 0.17); }
    // only the water you can actually see renders its reflection
    W.waters.forEach(w => {
      if (w.material.uniforms && w.material.uniforms.time) w.material.uniforms.time.value = t * 0.35;
      const under = w.position.x > 1500;
      w.visible = under === (camPos.x > 1500) && Math.hypot(w.position.x - camPos.x, w.position.z - camPos.z) < 260;
    });
    streamChunks(camPos);
    cullPlaced(camPos);
    const a = W.ash.geometry.attributes.position, arr = a.array;
    if (W.ash.visible) for (let i = 0; i < arr.length; i += 3) {
      arr[i + 1] -= dt * (0.4 + (i % 7) * 0.05); arr[i] += Math.sin(t * 0.5 + i) * dt * 0.3;
      if (arr[i + 1] < camPos.y - 8) { arr[i + 1] = camPos.y + 14; arr[i] = camPos.x + (Math.random() - 0.5) * 60; arr[i + 2] = camPos.z + (Math.random() - 0.5) * 60; }
      if (Math.abs(arr[i] - camPos.x) > 32) arr[i] = camPos.x + (Math.random() - 0.5) * 60;
      if (Math.abs(arr[i + 2] - camPos.z) > 32) arr[i + 2] = camPos.z + (Math.random() - 0.5) * 60;
    }
    a.needsUpdate = true;
    W.ash.material.color.setHex(camPos.x > 1500 ? 0x4a3a30 : 0x9a9288);
    if (W.gate) { const ty = W.gateOpen ? 6.2 : 0; W.gate.position.y += (ty - W.gate.position.y) * Math.min(1, dt * 0.8); }
    if (W.citadelGate) { const ty = W.CIT_H + (W.citadelOpen ? 7 : 0); W.citadelGate.position.y += (ty - W.citadelGate.position.y) * Math.min(1, dt * 0.6); }
    [['brother', W.fogBrother], ['bell', W.fogBell], ['king', W.fogKing]].forEach(([k, m]) => { if (m) { const to = W.fogWall === k ? 0.35 + Math.sin(t * 3) * 0.05 : 0; m.material.opacity += (to - m.material.opacity) * Math.min(1, dt * 2); } });
    if (W.sealMat) W.sealMat.color.setRGB(0.8 + Math.sin(t * 1.7) * 0.2, 0.08, 0.04);
  };
})();
