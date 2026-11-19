// THE HOLLOW CROWN - characters (CC0 Quaternius bodies + motion-captured clips), enemies, bosses,
// projectiles, FX. Every character shares the Universal Animation Library skeleton, so one set of clips
// (models/anims.glb) drives them all through THREE.AnimationMixer with crossfades.
(function () {
  const V3 = THREE.Vector3, Q = THREE.Quaternion;
  const W = HC.World;
  const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
  const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
  HC.angDiff = angDiff; HC.damp = damp;

  // ------------------------------------------------------------ appearance: per-character tints & scale
  // Material names come from the Quaternius packs: MI_Ranger*, MI_Peasant*, MI_Regular_*, MI_Superhero_*, MI_Eyes, MI_Hair_*
  const LOOK = {
    player: { scale: 1.0, cloth: null },
    hollow: { scale: 1.12 },
    drowned: { scale: 1.0, hair: 0x101418 },
    knight: { scale: 1.05, skin: 0x9a8a80, cloth: 0x3a2222 },
    arbalist: { scale: 1.0, skin: 0x8a8580, cloth: 0x4a4a40 },
    wraith: { scale: 1.08, cloth: 0x202024 },
    watcher: { scale: 1.5, cloth: 0x1a1a1c },
    sentinel: { scale: 2.4 },
    brother: { scale: 1.45 },
    bellbearer: { scale: 2.1 },
    corvane: { scale: 1.18, cloth: 0x2a1a1a },
    boss: { scale: 1.75, cloth: 0x281418 },
    npc_pilgrim: { scale: 1.0, cloth: 0x3a3632 }, npc_hermit: { scale: 1.0, cloth: 0x4a4a3a }, npc_maud: { scale: 1.0 }, npc_hollis: { scale: 1.0, cloth: 0x4a3a30 },
  };
  function tintMaterial(m, look, playerTint) {
    const n = m.name || '';
    if (/Glow/.test(n)) { m.toneMapped = false; return; }
    if (/Eyes|Hair/.test(n)) { if (look.hair && /Hair/.test(n)) m.color.set(look.hair); return; }
    if (/Regular|Superhero/.test(n)) { if (look.skin) m.color.set(look.skin); return; }
    if (/MI_Imp/.test(n)) return;
    if (/Ranger|Peasant/.test(n)) {
      if (playerTint !== undefined) m.color.set(playerTint).lerp(new THREE.Color(1, 1, 1), 0.35);
      else if (look.cloth) m.color.set(look.cloth).multiplyScalar(1.6);
      else m.color.setRGB(0.62, 0.6, 0.56);
    }
  }

  HC.GRIP_TWIST = -1.9;   // measured against Sword_Idle / Sword_Attack: low guard at rest, horizontal slash forward
  // ------------------------------------------------------------ the rig
  const _q = new Q(), _q2 = new Q(), _e = new THREE.Euler(), _m = new THREE.Matrix4(), _v = new V3(), _s = new V3();
  // "Clip|upper" / "Clip|lower": the clip with only its torso+arms+head tracks, or only its pelvis+legs tracks.
  // Lets the legs walk while the arms block / drink, instead of the whole body sliding in a standing pose.
  const LOWER_BONE = /^(root|pelvis|thigh_|calf_|foot_|ball_)/i;
  // "Clip|rarm" = only the right arm (shoulder to fingertips), "Clip|norarm" = everything except it
  const RARM_BONE = /^(clavicle|upperarm|lowerarm|hand|index|middle|ring|pinky|thumb)_.*r$|^(clavicle|upperarm|lowerarm|hand)_r$/;
  const PARTS = {
    upper: n => !LOWER_BONE.test(n), lower: n => LOWER_BONE.test(n),
    rarm: n => RARM_BONE.test(n), norarm: n => !RARM_BONE.test(n),
  };
  function splitClip(name) {
    const m = /^(.+)\|(upper|lower|rarm|norarm)$/.exec(name); if (!m || !HC.CLIPS[m[1]]) return null;
    const src = HC.CLIPS[m[1]], keep = PARTS[m[2]];
    const tracks = src.tracks.filter(t => keep(t.name.split('.')[0]));
    return (HC.CLIPS[name] = new THREE.AnimationClip(name, src.duration, tracks));
  }
  // a copy of a skinned mesh's geometry without the triangles mostly weighted to the given bones (inside a height
  // band of the bind pose): used to remove the cloth that sits under a piece of armor. Cached per mesh + cut list.
  function cutGeometry(mesh, cuts) {
    const full = mesh.userData.fullGeo, key = cuts.map(c => c.bones.source + c.ymin + ':' + c.ymax).join('|');
    full.userData.cuts = full.userData.cuts || {};
    if (full.userData.cuts[key]) return full.userData.cuts[key];
    const idx = full.index, si = full.attributes.skinIndex, sw = full.attributes.skinWeight, pos = full.attributes.position;
    if (!si || !sw) return full;
    const names = mesh.skeleton.bones.map(b => b.name), N = pos.count;
    const dom = new Array(N);
    for (let v = 0; v < N; v++) {
      let best = 0, bw = -1;
      const ws = [sw.getX(v), sw.getY(v), sw.getZ(v), sw.getW(v)], is = [si.getX(v), si.getY(v), si.getZ(v), si.getW(v)];
      for (let k = 0; k < 4; k++) if (ws[k] > bw) { bw = ws[k]; best = is[k]; }
      dom[v] = names[best] || '';
    }
    const covered = v => cuts.some(c => c.bones.test(dom[v]) && pos.getY(v) >= (c.ymin || -9) && pos.getY(v) <= (c.ymax || 9));
    const src = idx ? idx.array : Array.from({ length: N }, (_, i) => i), out = [];
    for (let i = 0; i < src.length; i += 3) {
      const a = src[i], b = src[i + 1], c = src[i + 2];
      if ((covered(a) ? 1 : 0) + (covered(b) ? 1 : 0) + (covered(c) ? 1 : 0) >= 2) continue;
      out.push(a, b, c);
    }
    const g = new THREE.BufferGeometry();
    for (const k in full.attributes) g.setAttribute(k, full.attributes[k]);
    g.setIndex(out); g.boundingSphere = full.boundingSphere; g.boundingBox = full.boundingBox;
    return (full.userData.cuts[key] = g);
  }
  // rotate a bone (blend w) so that its world-space direction `from` turns into `to`
  function turnBone(bone, from, to, w) {
    const q = new Q().setFromUnitVectors(from, to); if (w < 1) q.slerp(new Q(), 1 - w);
    const pq = bone.parent.getWorldQuaternion(new Q()), wq = bone.getWorldQuaternion(new Q());
    bone.quaternion.copy(pq.invert().multiply(q.multiply(wq)));
    bone.updateMatrixWorld(true);
  }
  class Rig {
    constructor(asset, opts = {}) {
      this.asset = asset;
      this.model = W.clone(asset);
      this.look = opts.look || LOOK[asset] || { scale: 1 };
      this.mats = [];
      this.model.traverse(o => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        tintMaterial(o.material, this.look, opts.tint);
        o.material = W.lowMat(o.material);
        o.material.userData.baseEmissive = o.material.emissive ? o.material.emissive.clone() : new THREE.Color();
        this.mats.push(o.material);
        o.frustumCulled = false;
      });
      this.b = {};
      this.model.traverse(o => { if (o.isBone) this.b[o.name] = o; });
      this.root = new THREE.Group(); this.spin = new THREE.Group();
      this.pivotH = 0;
      this.spin.add(this.model); this.root.add(this.spin);
      this.model.scale.setScalar(this.look.scale || 1);
      this.mixer = new THREE.AnimationMixer(this.model);
      this.actions = {}; this.cur = null; this.flash = 0; this.opacity = 1; this.frozen = false;
    }
    action(name) {
      if (!this.actions[name]) {
        const clip = HC.CLIPS[name] || splitClip(name);
        if (!clip) return null;
        this.actions[name] = this.mixer.clipAction(clip);
      }
      return this.actions[name];
    }
    // crossfade to a clip. opts: loop (default true), fade, ts (timeScale), restart, clamp
    play(name, opts = {}) {
      const a = this.action(name); if (!a) return null;
      const same = this.cur === a;
      if (same && !opts.restart) { if (opts.ts !== undefined) a.timeScale = opts.ts; return a; }
      const loop = opts.loop !== false;
      if (loop && !opts.restart && a.enabled && a.isScheduled()) {
        // switching back to a loop that is still blending out: keep its phase instead of snapping to frame 0
        a.stopFading(); a.paused = false;
      } else {
        a.reset();
        // walk <-> run <-> sprint: start the new loop at the same point of the stride as the old one
        const c = this.cur;
        if (loop && !opts.restart && opts.at === undefined && c && c.loop === THREE.LoopRepeat && c.enabled)
          a.time = (c.time / c.getClip().duration % 1) * a.getClip().duration;
      }
      a.setLoop(opts.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      a.clampWhenFinished = opts.loop === false;
      a.timeScale = opts.ts !== undefined ? opts.ts : 1;
      a.enabled = true; a.setEffectiveWeight(1);
      if (opts.at) a.time = opts.at * a.getClip().duration;
      a.play();
      if (this.cur && !same) this.cur.crossFadeTo(a, opts.fade !== undefined ? opts.fade : 0.18, false);
      this.cur = a; this.curName = name;
      return a;
    }
    // time-warp a one-shot clip so its impact frame (fraction f of the clip) lands after `toImpact` seconds
    strike(name, toImpact, f = 0.45) {
      const clip = HC.CLIPS[name]; if (!clip) return;
      this.play(name, { loop: false, restart: true, ts: Math.max(0.18, Math.min(3, clip.duration * f / Math.max(0.05, toImpact))), fade: 0.1 });
    }
    // upper-body layer: play `name`'s arms/torso on top of whatever the legs are doing (null = off).
    // While a layer is on, the base clip should be its legs-only version (see moveLegs).
    layer(name, opts = {}, part = 'upper') {
      const want = name ? name + '|' + part : null;
      if (this.layerName === want) return;
      if (this.layerAct) this.layerAct.fadeOut(0.15);
      this.layerAct = null; this.layerName = want;
      if (!want) return;
      const a = this.action(want); if (!a) return;
      a.reset(); a.setLoop(opts.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = opts.loop === false;
      a.timeScale = opts.ts || 1; a.enabled = true; a.setEffectiveWeight(1); a.fadeIn(0.15); a.play();
      this.layerAct = a;
    }
    // walk/run with legs only (for use under an upper-body layer)
    moveLegs(speed, set) {
      const W2 = set.walkSpeed || 1.4, R = set.runSpeed || 3.6;
      if (speed > 3.0) return this.play(set.run.split('|')[0] + '|lower', { ts: Math.max(0.6, speed / R) });
      return this.play(set.walk.split('|')[0] + '|lower', { ts: Math.max(0.5, speed / W2) * (set.walkTs || 1) });
    }
    // pose the skeleton at time t of a clip (outside the normal mixer) while fn runs - used to measure grips
    withPose(clip, t, fn) {
      const c = HC.CLIPS[clip]; if (!c) return fn();
      const mx = new THREE.AnimationMixer(this.model), a = mx.clipAction(c); a.play(); mx.setTime(t);
      this.model.updateMatrixWorld(true);
      try { return fn(); } finally { a.stop(); mx.uncacheRoot(this.model); }
    }
    // two-bone IK in world space, blended by w: the hand reaches `target`, the elbow bends toward `pole`
    ik(upper, lower, hand, target, pole, w = 1) {
      const U = this.b[upper], L = this.b[lower], H = this.b[hand]; if (!U || !L || !H || w <= 0.001) return;
      const s = U.getWorldPosition(new V3()), e = L.getWorldPosition(new V3()), h = H.getWorldPosition(new V3());
      const a = s.distanceTo(e), b = e.distanceTo(h);
      const t = target.clone(); let d = t.distanceTo(s); const maxd = (a + b) * 0.995;
      if (d > maxd) { t.sub(s).setLength(maxd).add(s); d = maxd; }
      d = Math.max(d, Math.abs(a - b) + 1e-3);
      const dir = t.clone().sub(s).normalize();
      const cosA = Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d)));
      const perp = pole.clone().sub(s); perp.sub(dir.clone().multiplyScalar(perp.dot(dir)));
      if (perp.lengthSq() < 1e-8) perp.set(0, -1, 0); perp.normalize();
      const eNew = s.clone().addScaledVector(dir, cosA * a).addScaledVector(perp, Math.sqrt(1 - cosA * cosA) * a);
      turnBone(U, e.clone().sub(s).normalize(), eNew.sub(s).normalize(), w);
      const e2 = L.getWorldPosition(new V3()), h2 = H.getWorldPosition(new V3());
      turnBone(L, h2.sub(e2).normalize(), t.clone().sub(e2).normalize(), w);
    }
    armLength(upper, lower, hand) {
      const p = n => this.b[n].getWorldPosition(new V3());
      return p(upper).distanceTo(p(lower)) + p(lower).distanceTo(p(hand));
    }
    // the hole the curled fingers close around, in model space: pos = its centre, quat = a weapon frame whose
    // +Z (blade / shaft) runs along the hole out of the thumb side and whose +X (edge) faces the knuckles
    gripFrame(bone, inv) {
      const s = bone.slice(-1), P = n => this.b[n] ? new V3().setFromMatrixPosition(this.b[n].matrixWorld).applyMatrix4(inv) : null;
      const avg = (f) => { const v = new V3(); let n = 0; ['01', '02', '03', '04_leaf'].forEach(j => { const p = P(f + '_' + j + '_' + s); if (p) { v.add(p); n++; } }); return n ? v.multiplyScalar(1 / n) : null; };
      const fi = ['index', 'middle', 'ring', 'pinky'].map(avg).filter(Boolean);
      const c = fi.reduce((a, v) => a.add(v), new V3()).multiplyScalar(1 / fi.length);
      const ix = avg('index'), pk = avg('pinky');
      const axis = ix.clone().sub(pk).normalize();
      const fwd = P('middle_01_' + s).sub(P(bone)); fwd.addScaledVector(axis, -fwd.dot(axis)).normalize();
      const y = new V3().crossVectors(axis, fwd);
      return { pos: c, quat: new Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(fwd, y, axis)) };
    }
    // model-space centre of the palm of hand_l / hand_r
    palm(bone, inv) {
      const s = bone.slice(-1), P = n => new V3().setFromMatrixPosition(this.b[n].matrixWorld).applyMatrix4(inv);
      return P('index_01_' + s).add(P('pinky_01_' + s)).multiplyScalar(0.5).lerp(P(bone), 0.35);
    }
    // a model-space placement (pos, quat, scale) expressed in the bone's local frame
    toLocal(bone, posM, quatM, scale = 1) {
      const b = this.b[bone];
      const inv = new THREE.Matrix4().copy(this.model.matrixWorld).invert();
      _m.copy(inv).multiply(b.matrixWorld).decompose(_v, _q2, _s);
      const bwi = new THREE.Matrix4().compose(_v, _q2, _s).invert();
      const local = bwi.multiply(new THREE.Matrix4().compose(posM, quatM, new V3(1, 1, 1).multiplyScalar(scale / (this.look.scale || 1))));
      const out = { p: new V3(), q: new Q(), s: new V3() }; local.decompose(out.p, out.q, out.s); return out;
    }
    // a weapon "stance": held at the palm with a fixed model-space orientation, measured in a given pose
    // spec: { clip, t, rot: [x, y, z] (model-space Euler), off: [x, y, z] (model-space metres) }
    stanceLocal(bone, spec) {
      const run = () => {
        this.model.updateMatrixWorld(true);
        const inv = new THREE.Matrix4().copy(this.model.matrixWorld).invert();
        const q = new Q().setFromEuler(new THREE.Euler(...(spec.rot || [0, 0, 0]), 'YXZ'));
        if (spec.palm) {   // resting on the open palm (books, bows, the crossbow stock)
          const pos = this.palm(bone, inv); if (spec.off) pos.add(new V3(spec.off[0], spec.off[1], spec.off[2]));
          return this.toLocal(bone, pos, q, spec.scale || 1);
        }
        // otherwise the fist stays closed around the haft, and the WRIST turns to point it the way the stance
        // wants (up to a natural limit) - instead of the weapon floating at a fixed angle in front of the palm
        const g = this.gripFrame(bone, inv);
        if (spec.flip) g.quat.multiply(new Q().setFromAxisAngle(new V3(0, 1, 0), Math.PI));
        // a bow: its limbs (+Y) run through the fist out of the thumb side, its back (+Z) faces where the knuckles do
        if (spec.bow) g.quat.multiply(new Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new V3(0, 1, 0), new V3(0, 0, 1), new V3(1, 0, 0))));
        if (spec.slide) g.pos.add(new V3(0, 0, spec.slide).applyQuaternion(g.quat));
        const ax = spec.bow ? new V3(0, 1, 0) : new V3(0, 0, 1);
        const from = ax.clone().applyQuaternion(g.quat), to = ax.clone().applyQuaternion(q);
        // full: match the whole orientation (which way the bow faces too), not just where the haft points
        let R = spec.full ? q.clone().multiply(g.quat.clone().invert()) : new Q().setFromUnitVectors(from, to);
        const ang = 2 * Math.acos(Math.min(1, Math.abs(R.w))), cap = spec.wristMax || 1.25;
        if (ang > cap) R = new Q().slerp(R, cap / ang);
        _m.copy(inv).multiply(this.b[bone].matrixWorld).decompose(_v, _q2, _s);
        const H = _q2.clone(), wrist = H.clone().invert().multiply(R).multiply(H);
        const out = this.toLocal(bone, g.pos, g.quat, spec.scale || 1); out.wrist = wrist;
        return out;
      };
      if (spec.clip && spec.t === 'peak') {
        // the moment the hand is furthest forward (a thrust's full extension)
        const c = HC.CLIPS[spec.clip], s = bone.slice(-1); let best = 0, bz = -1e9;
        for (let i = 0; i <= 24; i++) {
          const t = c.duration * i / 24;
          const z = this.withPose(spec.clip, t, () => { const inv = new THREE.Matrix4().copy(this.model.matrixWorld).invert(); return this.palm(bone, inv).z; });
          if (z > bz) { bz = z; best = t; }
        }
        return this.withPose(spec.clip, best, run);
      }
      return spec.clip ? this.withPose(spec.clip, spec.t || 0, run) : run();
    }
    update(dt) { this.mixer.update(this.frozen ? 0 : dt); }
    // true on the frame a foot touches down in the current pose (null when the skeleton has no feet).
    // Tracks each foot's height above the root with a slowly-rising floor, so it adapts to any clip.
    footPlant() {
      const fl = this.b.foot_l, fr = this.b.foot_r; if (!fl || !fr) return null;
      if (!this.fs) this.fs = { l: { min: 9, up: false }, r: { min: 9, up: false } };
      const sc = (this.look.scale || 1) * this.root.scale.y, rootY = this.root.getWorldPosition(_v).y;
      let hit = false;
      for (const [k, b] of [['l', fl], ['r', fr]]) {
        const st = this.fs[k], y = (b.getWorldPosition(_s).y - rootY) / sc;
        st.min = Math.min(y, st.min + 0.0004);
        if (y > st.min + 0.035) st.up = true;
        else if (st.up && y < st.min + 0.015) { st.up = false; hit = true; }
      }
      return hit;
    }
    // add a model-space rotation on top of the animated pose (used for guard / aim overlays)
    overlay(bone, x, y, z) {
      const b = this.b[bone]; if (!b || !b.parent) return;
      b.parent.updateMatrixWorld(true);
      _m.copy(this.model.matrixWorld).invert().multiply(b.parent.matrixWorld).decompose(_v, _q2, _s);
      const pw = _q2.clone();                     // parent orientation in model space
      _e.set(x, y, z, 'YXZ'); _q.setFromEuler(_e);
      // local' = pw^-1 * R * pw * local
      b.quaternion.premultiply(pw.clone().invert().multiply(_q).multiply(pw));
    }
    // attach a static model to a bone. mode 'grip': through the fist along the knuckle line (weapons);
    // 'forward': facing the character's forward (crossbow/shield); 'model': at a model-space position (lantern)
    attach(asset, bone, opts = {}) {
      const b = this.b[bone]; if (!b) return null;
      const obj = W.clone(asset);
      W.applyLowMaterials(obj);
      // full-metal props render black with no env map (and the HDR eclipse env blooms out), so make them part-metal
      obj.traverse(o => { const m = o.isMesh && o.material; if (m && m.isMeshStandardMaterial && m.metalness > 0.4) { o.material = m.clone(); o.material.metalness = 0.35; o.material.roughness = Math.min(m.roughness, 0.6); } });
      if (opts.mode === 'none') { b.add(obj); return obj; }      // the caller places it (weapon stances)
      this.model.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(this.model.matrixWorld).invert();
      const P = n => this.b[n] ? new V3().setFromMatrixPosition(this.b[n].matrixWorld).applyMatrix4(inv) : null;
      let posM, quatM;
      if (opts.mode === 'wrap') {
        // through the closed fist: the fingers wrap the handle (player weapons)
        const g = this.gripFrame(bone, inv); posM = g.pos; quatM = g.quat;
        if (opts.flip) quatM.multiply(new Q().setFromAxisAngle(new V3(0, 1, 0), Math.PI));   // blade out of the pinky side
        if (opts.roll) quatM.multiply(new Q().setFromAxisAngle(new V3(0, 0, 1), opts.roll));
        if (opts.slide) posM.add(new V3(0, 0, opts.slide).applyQuaternion(quatM));             // grip further up / down the haft
      } else if ((opts.mode || 'grip') === 'grip') {
        const s = bone.slice(-1), h = P(bone), idx = P('index_01_' + s), pk = P('pinky_01_' + s), mid = P('middle_02_' + s) || idx;
        const fingers = mid.clone().sub(h).normalize();
        const blade = idx.clone().sub(pk).normalize().applyAxisAngle(fingers, opts.twist !== undefined ? opts.twist : HC.GRIP_TWIST);
        const up = fingers.clone().sub(blade.clone().multiplyScalar(fingers.dot(blade))).normalize();
        const x = new V3().crossVectors(up, blade).normalize();
        quatM = new Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, up, blade));
        posM = idx.clone().add(pk).multiplyScalar(0.5).lerp(h, 0.35).addScaledVector(blade, 0.07 * (opts.scale || 1));
      } else if (opts.mode === 'forward') {
        posM = P(bone).add(opts.offset || new V3());
        quatM = new Q().setFromEuler(new THREE.Euler(opts.rotX || 0, 0, 0));
      } else {
        posM = opts.pos.clone(); quatM = new Q();
      }
      // convert model-space placement into the bone's local frame
      _m.copy(inv).multiply(b.matrixWorld).decompose(_v, _q2, _s);
      const bw = new THREE.Matrix4().compose(_v, _q2, _s), bwi = bw.clone().invert();
      const local = bwi.multiply(new THREE.Matrix4().compose(posM, quatM, new V3(1, 1, 1).multiplyScalar((opts.scale || 1) / (this.look.scale || 1))));
      local.decompose(obj.position, obj.quaternion, obj.scale);
      b.add(obj);
      return obj;
    }
    hitFlash(dt) {
      if (this.flash > 0) this.flash -= dt;
      const f = Math.max(0, this.flash) * 3;
      if (f <= 0 && !this.flashing) return;
      this.flashing = f > 0;
      this.mats.forEach(m => { if (m.emissive && !/Glow/.test(m.name)) m.emissive.copy(m.userData.baseEmissive).lerp(new THREE.Color(0.9, 0.25, 0.1), Math.min(1, f)); });
    }
    setOpacity(o) {
      if (Math.abs(o - this.opacity) < 0.01) return;
      this.opacity = o;
      this.mats.forEach(m => { m.transparent = o < 1; m.opacity = o; m.depthWrite = o > 0.5; });
    }
    // locomotion clip by speed, in-sync with actual ground speed
    move(speed, set) {
      const W2 = set.walkSpeed || 1.4, R = set.runSpeed || 3.6, Sp = set.sprintSpeed || 6.2;
      // gait with hysteresis: going up needs the full threshold, coming down needs to drop a margin below it,
      // so a speed hovering at a threshold can't flip walk<->run every frame
      const up = [0.15, set.run ? 2.6 : 99, set.sprint ? 5.4 : 99], down = [0.08, set.run ? 2.2 : 99, set.sprint ? 4.9 : 99];
      let g = this.gait || 0;
      while (g < 3 && speed >= up[g]) g++;
      while (g > 0 && speed < down[g - 1]) g--;
      this.gait = g;
      if (g === 0) return this.play(set.idle, { ts: set.idleTs || 1 });
      if (g === 1) return this.play(set.walk, { ts: Math.max(0.4, speed / W2) * (set.walkTs || 1) });
      if (g === 2) return this.play(set.run, { ts: Math.max(0.5, speed / R) });
      return this.play(set.sprint, { ts: speed / Sp });
    }
  }
  HC.Rig = Rig;

  // ------------------------------------------------------------ player classes & avatar
  HC.CLASSES = {
    sword: { name: 'Traveler', weapon: 'sword', hp: 220, rollCost: 16, speed: 4.7 },
    greatsword: { name: 'Traveler', weapon: 'greatsword', hp: 220, rollCost: 16, speed: 4.7 },
  };
  // weapon styles: how each kind of weapon is held and swung (damage is scaled by the item's rarity in js/items.js).
  //   light / heavy: { dmg, poise, range, arc, dur, hit, st } (ranged: + proj, speed, n, ammo, grav)
  //   clips: light combo, heavyClip: heavy attack, windup: fraction of the heavy clip held while charging
  //   hand: which hand holds it. fight: grip used to strike. carry: grip while walking/idle (measured in a pose)
  //   carryArm: keep the weapon arm raised (torch pose) while not fighting - polearms and the staff stay upright
  //   charge: hold the attack to charge it ('draw' = bow, 'cast' = staff, heavy-only for melee)
  const SW = ['Sword_Regular_A', 'Sword_Regular_B', 'Sword_Regular_C'];
  const UPRIGHT = { clip: 'Idle_Torch_Loop', t: 0.6, rot: [-Math.PI / 2, 0, 0] };
  HC.STYLES = {
    sword: { light: { dmg: 24, poise: 18, range: 2.5, arc: 1.9, dur: 0.62, hit: 0.32, st: 14 }, heavy: { dmg: 44, poise: 45, range: 2.7, arc: 1.4, dur: 1.0, hit: 0.58, st: 30 }, clips: SW, heavyClip: 'Sword_Dash', windup: 0.1, idle: 'Sword_Idle' },
    greatsword: { light: { dmg: 40, poise: 40, range: 3.2, arc: 2.4, dur: 0.9, hit: 0.5, st: 22 }, heavy: { dmg: 74, poise: 90, range: 3.4, arc: 2.0, dur: 1.4, hit: 0.88, st: 40 }, clips: ['Sword_Regular_A', 'Sword_Regular_C', 'Sword_Regular_B'], heavyClip: 'Sword_Heavy_Combo', windup: 0.15, armor: true, idle: 'Sword_Idle' },
    dagger: { light: { dmg: 15, poise: 8, range: 2.0, arc: 1.6, dur: 0.42, hit: 0.2, st: 8 }, heavy: { dmg: 34, poise: 22, range: 2.3, arc: 1.2, dur: 0.75, hit: 0.38, st: 18 }, clips: ['Punch_Cross'], heavyClip: 'Melee_Hook', windup: 0.3, idle: 'Sword_Idle',
      fight: { clip: 'Punch_Cross', t: 'peak', rot: [-0.15, 0, 0] } },   // quick forward stabs; heavy = lunging stab
    axe: { light: { dmg: 30, poise: 26, range: 2.5, arc: 1.9, dur: 0.72, hit: 0.38, st: 17 }, heavy: { dmg: 58, poise: 60, range: 2.7, arc: 1.6, dur: 1.1, hit: 0.62, st: 32 }, clips: ['Sword_Regular_A', 'Melee_Hook', 'Sword_Regular_C'], heavyClip: 'Sword_Heavy_Combo', windup: 0.15, idle: 'Sword_Idle' },
    spear: { light: { dmg: 23, poise: 16, range: 3.7, arc: 0.8, dur: 0.6, hit: 0.3, st: 13 }, heavy: { dmg: 48, poise: 45, range: 4.1, arc: 0.7, dur: 0.95, hit: 0.5, st: 28 }, clips: ['Punch_Cross'], heavyClip: 'Melee_Hook', lightF: 0.38, heavyF: 0.6, windup: 0.3, idle: 'Idle_Loop', carry: UPRIGHT, carryArm: true,
      fight: { clip: 'Punch_Cross', t: 'peak', rot: [-0.08, 0, 0] } },   // right-hand thrusts: the shaft lies along the arm; heavy = lunge
    hammer: { light: { dmg: 46, poise: 60, range: 2.9, arc: 2.0, dur: 1.0, hit: 0.55, st: 24 }, heavy: { dmg: 88, poise: 120, range: 3.1, arc: 2.4, dur: 1.5, hit: 0.92, st: 42 }, clips: ['Melee_Hook', 'Sword_Regular_B', 'Sword_Regular_C'], heavyClip: 'Sword_Heavy_Combo', windup: 0.15, armor: true, idle: 'Sword_Idle' },
    scythe: { light: { dmg: 32, poise: 24, range: 3.4, arc: 2.8, dur: 0.8, hit: 0.42, st: 18 }, heavy: { dmg: 62, poise: 55, range: 3.6, arc: 3.2, dur: 1.2, hit: 0.7, st: 34 }, clips: ['Sword_Regular_B', 'Sword_Regular_A', 'Sword_Regular_C'], heavyClip: 'Sword_Heavy_Combo', windup: 0.15, idle: 'Idle_Loop', carry: UPRIGHT, carryArm: true },
    mace: { light: { dmg: 34, poise: 42, range: 2.4, arc: 1.8, dur: 0.75, hit: 0.4, st: 18 }, heavy: { dmg: 64, poise: 85, range: 2.6, arc: 1.6, dur: 1.15, hit: 0.65, st: 34 }, clips: ['Melee_Hook', 'Sword_Regular_A', 'Sword_Regular_B'], heavyClip: 'Sword_Heavy_Combo', windup: 0.15, armor: true, idle: 'Sword_Idle' },
    greataxe: { light: { dmg: 50, poise: 58, range: 3.2, arc: 2.4, dur: 1.05, hit: 0.55, st: 26 }, heavy: { dmg: 95, poise: 115, range: 3.4, arc: 2.4, dur: 1.55, hit: 0.95, st: 44 }, clips: ['Sword_Regular_A', 'Sword_Regular_C', 'Melee_Hook'], heavyClip: 'Sword_Heavy_Combo', windup: 0.15, armor: true, idle: 'Sword_Idle' },
    rapier: { light: { dmg: 20, poise: 10, range: 2.9, arc: 0.9, dur: 0.45, hit: 0.2, st: 9 }, heavy: { dmg: 46, poise: 26, range: 3.3, arc: 0.8, dur: 0.8, hit: 0.45, st: 20 }, clips: ['Punch_Cross'], heavyClip: 'Melee_Hook', windup: 0.3, idle: 'Sword_Idle',
      fight: { clip: 'Punch_Cross', t: 'peak', rot: [-0.1, 0, 0] } },
    halberd: { light: { dmg: 36, poise: 32, range: 3.9, arc: 1.0, dur: 0.85, hit: 0.42, st: 20 }, heavy: { dmg: 72, poise: 75, range: 4.2, arc: 0.9, dur: 1.3, hit: 0.7, st: 38 }, clips: ['Punch_Cross', 'Melee_Hook'], heavyClip: 'Melee_Hook', windup: 0.3, idle: 'Idle_Loop', carry: UPRIGHT, carryArm: true,
      fight: { clip: 'Punch_Cross', t: 'peak', rot: [-0.08, 0, 0] } },
    katana: { light: { dmg: 30, poise: 22, range: 2.8, arc: 2.1, dur: 0.55, hit: 0.28, st: 15 }, heavy: { dmg: 60, poise: 50, range: 3.0, arc: 1.8, dur: 0.95, hit: 0.5, st: 30 }, clips: ['Sword_Regular_A', 'Sword_Regular_B', 'Sword_Regular_A'], heavyClip: 'Sword_Dash', windup: 0.1, idle: 'Sword_Idle', twoHand: true },
    flail: { light: { dmg: 38, poise: 40, range: 2.8, arc: 2.6, dur: 0.85, hit: 0.46, st: 20 }, heavy: { dmg: 72, poise: 85, range: 3.0, arc: 2.8, dur: 1.25, hit: 0.75, st: 36 }, clips: ['Sword_Regular_A', 'Melee_Hook', 'Sword_Regular_C'], heavyClip: 'Sword_Heavy_Combo', windup: 0.15, armor: true, idle: 'Sword_Idle', chain: true },
    warpick: { light: { dmg: 30, poise: 30, range: 2.5, arc: 1.4, dur: 0.75, hit: 0.4, st: 17 }, heavy: { dmg: 62, poise: 60, range: 2.7, arc: 1.2, dur: 1.15, hit: 0.65, st: 32 }, clips: ['Melee_Hook', 'Sword_Regular_B', 'Melee_Hook'], heavyClip: 'Sword_Heavy_Combo', windup: 0.15, idle: 'Sword_Idle', pierce: 1.3 },
    sickle: { light: { dmg: 17, poise: 10, range: 2.1, arc: 2.0, dur: 0.42, hit: 0.2, st: 8 }, heavy: { dmg: 38, poise: 24, range: 2.3, arc: 2.2, dur: 0.75, hit: 0.4, st: 18 }, clips: ['Sword_Regular_B', 'Sword_Regular_A'], heavyClip: 'Sword_Dash', windup: 0.1, idle: 'Sword_Idle', bleed: true },
    // both fists: a cestus on each hand, the jab (left) and cross (right) alternate
    fists: { light: { dmg: 15, poise: 12, range: 1.8, arc: 1.4, dur: 0.36, hit: 0.15, st: 7 }, heavy: { dmg: 40, poise: 45, range: 2.0, arc: 1.3, dur: 0.75, hit: 0.42, st: 18 }, clips: ['Punch_Jab', 'Punch_Cross'], heavyClip: 'Melee_Hook', windup: 0.3, idle: 'Idle_Loop', dual: true, twoHand: true, punch: true },
    // thrown: the weapon in your hand leaves it at the release frame (a new one is drawn after)
    javelin: { ranged: true, thrown: true, light: { dmg: 44, poise: 36, dur: 0.95, hit: 0.45, st: 14, proj: 'javelin', speed: 30, grav: 7 }, heavy: { dmg: 84, poise: 75, dur: 1.3, hit: 0.7, st: 26, proj: 'javelin', speed: 42, grav: 5 }, idle: 'Idle_Loop', carry: UPRIGHT, carryArm: true,
      aim: { clip: 'OverhandThrow', t: 0.25, rot: [-0.25, 0, 0] } },   // raised over the shoulder, point first
    knives: { ranged: true, thrown: true, light: { dmg: 18, poise: 8, dur: 0.5, hit: 0.22, st: 7, proj: 'knife', speed: 38, grav: 3 }, heavy: { dmg: 17, poise: 8, dur: 0.85, hit: 0.38, st: 16, proj: 'knife', speed: 36, grav: 3, n: 3 }, idle: 'Sword_Idle',
      carry: { clip: 'Sword_Idle', t: 0.5, rot: [Math.PI / 2, 0, 0] }, aim: { clip: 'OverhandThrow', t: 0.25, rot: [-0.25, 0, 0] } },
    // magic: the wand is held in the casting (left) hand; the grimoire is held in the right while the left hand casts
    wand: { ranged: true, hand: 'hand_l', light: { dmg: 20, poise: 8, dur: 0.42, hit: 0.16, st: 7, proj: 'pale', speed: 34, frost: true }, heavy: { dmg: 22, poise: 8, dur: 0.7, hit: 0.3, st: 18, proj: 'pale', speed: 32, frost: true, n: 3 }, idle: 'Idle_Loop',
      carry: { clip: 'Idle_Loop', t: 0.5, rot: [Math.PI / 2 - 0.3, 0, 0] }, aim: { clip: 'Spell_Simple_Shoot', t: 0.4, rot: [0, 0, 0] }, twoHand: true },
    tome: { ranged: true, charge: 'cast', light: { dmg: 34, poise: 24, dur: 0.55, hit: 0.2, st: 18, proj: 'void', speed: 20, pierce: true }, heavy: { dmg: 58, poise: 50, dur: 0.75, hit: 0.3, st: 36, proj: 'void', speed: 16, pierce: true, size: 2.2 }, idle: 'Idle_Loop',
      carry: { clip: 'Idle_Torch_Loop', t: 0.6, rot: [0, Math.PI / 2, 0], off: [0, 0.04, 0.04], palm: true }, carryArm: true, fightArm: true, twoHand: true },
    bow: { ranged: true, charge: 'draw', hand: 'hand_l', light: { dmg: 26, poise: 14, dur: 0.35, hit: 0.0, st: 6, proj: 'arrow', speed: 60, ammo: true, grav: 3 }, heavy: { dmg: 26, poise: 14, dur: 0.35, hit: 0.0, st: 6, proj: 'arrow', speed: 60, ammo: true, grav: 3 }, idle: 'Idle_Loop',
      carry: { clip: 'Idle_Loop', t: 0.5, rot: [0.3, 0, 0], bow: true, full: true, wristMax: 1.8 },
      string: { top: new V3(0, 0.71, -0.082), bottom: new V3(0, -0.71, -0.082) } },
    crossbow: { ranged: true, light: { dmg: 40, poise: 30, dur: 1.75, hit: 0.32, st: 8, proj: 'bolt', speed: 62, ammo: true, grav: 2, reload: 1.1 }, heavy: { dmg: 30, poise: 22, dur: 2.0, hit: 0.5, st: 20, proj: 'bolt', speed: 55, ammo: true, n: 3, grav: 2, reload: 1.1 }, idle: 'Idle_Loop',
      carry: { clip: 'Idle_Loop', t: 0.5, rot: [Math.PI / 2 - 0.25, 0, 0], palm: true }, aim: { clip: 'Pistol_Aim_Neutral', t: 0.4, rot: [0, 0, 0], palm: true } },
    staff: { ranged: true, charge: 'cast', light: { dmg: 30, poise: 20, dur: 0.55, hit: 0.2, st: 16, proj: 'orb', speed: 26 }, heavy: { dmg: 56, poise: 50, dur: 0.7, hit: 0.3, st: 36, proj: 'wave', speed: 18, pierce: true }, idle: 'Idle_Loop', carry: UPRIGHT, carryArm: true, fightArm: true },
  };
  // the admin Corolla: on foot you fight with the real fists weapon (same jab-cross combos, hook, sounds and stats as the
  // cestus), just with nothing on your knuckles. It is driven: see js/car.js
  HC.STYLES.car = Object.assign({}, HC.STYLES.fists, { noHold: true });
  // no weapon at all: exactly the same bare-fisted fighting as above
  HC.STYLES.unarmed = Object.assign({}, HC.STYLES.fists, { noHold: true });
  // the Lab Rat (admin command): no weapons, only bites. The human rig is hidden; the rat is animated in code.
  HC.STYLES.rat = { light: { dmg: 9, poise: 6, range: 1.35, arc: 1.5, dur: 0.34, hit: 0.11, st: 5 }, heavy: { dmg: 22, poise: 16, range: 1.7, arc: 1.2, dur: 0.62, hit: 0.3, st: 12 },
    clips: ['Punch_Jab'], heavyClip: 'Punch_Jab', windup: 0.2, idle: 'Idle_Loop', noHold: true, bite: true };
  const RAT_SCALE = 5;   // the model is a real 15 cm rat: this makes a rat the size of a small dog
  // ---- character customization (colours, parts, build) and cosmetic accessories (models/acc_*.glb)
  HC.LOOKS = {
    outfit: [['Ranger', 0x9e8f82], ['Crimson', 0xa85048], ['Midnight', 0x4e5f80], ['Ash', 0x9c9c9c], ['Bone', 0xdacfb6], ['Forest', 0x66885a], ['Soot', 0x4a4440], ['Royal', 0x7a5a9e], ['Gilded', 0xc4a25e]],
    skin: [['Default', 0xffffff], ['Pale', 0xffe8dc], ['Warm', 0xe0b494], ['Tan', 0xb88a66], ['Brown', 0x8a5e40], ['Deep', 0x5e3e2c], ['Ghoul', 0xa4b4a2], ['Ashen', 0x9a9aa4]],
    hair: [['Brown', 0xffffff], ['Black', 0x302824], ['Blond', 0xe8c080], ['Red', 0xc0502c], ['White', 0xf0f0f0], ['Grey', 0x8a8a8a], ['Blue', 0x6070c8], ['Green', 0x60a060]],
    // slot -> accessories: [id, name, bone, model-space offset from that bone (measured in the idle pose)]
    acc: {
      head: [['acc_hat', 'Hunter\'s hat'], ['acc_witch', 'Witch\'s hat'], ['acc_crown', 'Iron crown'], ['acc_horns', 'Horns'], ['acc_halo', 'Halo']],
      face: [['acc_plague', 'Plague mask'], ['acc_eyepatch', 'Eyepatch']],
      neck: [['acc_scarf', 'Scarf']],
      back: [['acc_pack', 'Backpack'], ['acc_quiver', 'Quiver'], ['acc_cape', 'Cloak'], ['acc_wings', 'Bat wings']],
      shoulder: [['acc_raven', 'Raven']],
      hip: [['acc_skull', 'Skull charm']],
    },
    anchor: { head: ['Head', [0, 0.225, 0.02]], face: ['Head', [0, 0.115, 0.155]], neck: ['neck_01', [0, 0.0, 0.012]], back: ['spine_03', [0, 0.06, -0.165]],
      shoulder: ['upperarm_l', [-0.03, 0.085, -0.01]], hip: ['thigh_r', [-0.075, 0.07, 0.02]] },
  };
  HC.LOOK_DEFAULT = { outfit: 0, skin: 0, hair: 0, hood: 1, paul: 1, belt: 1, brace: 1, lantern: 1, height: 1, build: 1, acc: {} };
  // two-handed weapons: the left fist always holds the haft too. slide = where (metres along the weapon, from the
  // right hand toward the pommel / butt) the left hand closes. They also slow your walk a little (game.js).
  HC.TWO_HAND = { greatsword: { slide: -0.16 }, katana: { slide: -0.14 }, greataxe: { slide: -0.42 }, hammer: { slide: -0.36 },
    halberd: { slide: -0.55 }, scythe: { slide: -0.5 } };
  // where in each clip the weapon actually sweeps through the space in front of the character (measured by
  // tracing the blade tip through the clip), so the hit lands on that frame
  HC.CLIP_F = { Sword_Regular_A: 0.3, Sword_Regular_B: 0.45, Sword_Regular_C: 0.32, Sword_Dash: 0.19, Melee_Hook: 0.6,
    Punch_Cross: 0.3, Punch_Jab: 0.3, OverhandThrow: 0.45, Sword_Heavy_Combo: 0.25, Sword_Regular_Combo: 0.06, Sword_Attack: 0.25 };
  HC.PLAYER_COLORS = [0x6a5440, 0x3a5a6a, 0x6a3a3a, 0x4a6a40];
  const LOCO = {};
  function loco(idle, sfx) {
    const k = idle + sfx;
    return LOCO[k] || (LOCO[k] = { idle: idle + sfx, walk: 'Walk_Loop' + sfx, run: 'Jog_Fwd_Loop' + sfx, sprint: 'Sprint_Loop' + sfx, walkSpeed: 1.5, runSpeed: 3.8, sprintSpeed: 6.5 });
  }
  const FIGHT_ACTS = ['attack', 'heavy', 'block', 'charge'];
  const _qI = new Q();
  const _up = new V3(0, 1, 0), _aim = new V3(), _t = new V3(), _p = new V3(), _mi = new THREE.Matrix4(), _qq = new Q();

  class Avatar {
    constructor(cls, color, name) {
      this.cls = cls; this.name = name;
      this.rig = new Rig('player', { tint: color });
      this.root = this.rig.root;
      this.style = 'sword'; this.stances = {};
      this.lantern = this.rig.attach('lantern', 'pelvis', { mode: 'model', pos: new V3(0.2, 0.92, 0.08), scale: 0.8 });
      this.lanternGlow = [];
      if (this.lantern) this.lantern.traverse(o => { if (o.isMesh && /Glow/.test(o.material.name)) { o.material = o.material.clone(); this.lanternGlow.push(o.material); } });
      this.act = 'idle'; this.actT = 0; this.actDur = 1; this.speed = 0; this.lastAct = null;
      this.pos = new V3(); this.yaw = 0; this.headVisible = true;
      this.draw = 0; this.pitch = 0; this.twist = 0; this.drawW = 0; this.idleT = 0; this.charge = 0;
      this.armor = {};
      this.setWeapon(HC.CLASSES[cls].weapon, 'sword');
    }
    // swap the held weapon. glow: rarity colour (hex) worked into the weapon's metal for rare and better items
    setWeapon(model, style, glow, glowAmt = 0) {
      const key = model + '|' + style + '|' + glow;
      if (this.weaponKey === key) return;
      this.weaponKey = key;
      if (this.weapon && this.weapon.parent) this.weapon.parent.remove(this.weapon);
      if (this.weapon2 && this.weapon2.parent) this.weapon2.parent.remove(this.weapon2); this.weapon2 = null;
      if (this.string) { this.string.geometry.dispose(); this.string = null; }
      this.nockArrow = null;
      const S = HC.STYLES[style] || HC.STYLES.sword;
      this.style = HC.STYLES[style] ? style : 'sword';
      this.hand = S.hand || 'hand_r';
      this.stances = {}; this.stanceKey = null;
      if (!(HC.assets && HC.assets[model]) || S.noHold) { this.weapon = null; this.lh = null; this.updateShieldVis && this.updateShieldVis(); return; }
      const r = this.rig;
      if (S.ranged) {
        this.weapon = r.attach(model, this.hand, { mode: 'none' });
      } else if (S.fight) {
        this.weapon = r.attach(model, this.hand, { mode: 'none' });
        this.stances.fight = r.stanceLocal(this.hand, S.fight);
      } else {
        // the fist closes around the handle, measured in the weapon's own ready pose
        this.weapon = r.withPose(S.idle || 'Sword_Idle', 0.3, () => r.attach(model, this.hand, Object.assign({ mode: 'wrap' }, S.wrap)));
        this.stances.fight = { p: this.weapon.position.clone(), q: this.weapon.quaternion.clone() };
      }
      if (S.dual) this.weapon2 = r.withPose(S.idle || 'Sword_Idle', 0.3, () => r.attach(model, 'hand_l', Object.assign({ mode: 'wrap' }, S.wrap)));   // the other fist
      if (S.carry) this.stances.carry = r.stanceLocal(this.hand, S.carry);
      if (S.aim) this.stances.aim = r.stanceLocal(this.hand, S.aim);
      if (!this.stances.fight) this.stances.fight = this.stances.aim || this.stances.carry;
      this.lh = HC.TWO_HAND[this.style] ? this.measureLeftFist(HC.TWO_HAND[this.style]) : null;
      this.updateShieldVis && this.updateShieldVis();
      this.applyStance(this.stances.carry || this.stances.fight, 1);
      if (glow != null && glowAmt > 0) {
        // a faint inner glow in the rarity colour on the metal parts (not the wood or leather)
        const c = new THREE.Color(glow);
        this.weapon.traverse(o => {
          if (!o.isMesh || !o.material.emissive) return;
          if (!/Steel|Iron|Brass|Crystal|Glow/i.test(o.material.name)) return;
          o.material = o.material.clone();
          o.material.emissive.copy(c).multiplyScalar(0.05 + 0.13 * glowAmt);
        });
      }
      if (this.style === 'bow') {
        // a live bowstring (bends to the drawing hand) and the arrow on the string while drawing
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
        this.string = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xd8cdb4 }));
        this.string.frustumCulled = false; this.weapon.add(this.string);
        if (HC.assets.arrow) { this.nockArrow = W.clone('arrow'); this.nockArrow.visible = false; this.weapon.add(this.nockArrow); }
        this.setString(null);
      }
    }
    // the left hand as a closed fist (from the jab): its finger rotations, and where its grip hole sits relative
    // to the hand bone, so the IK can put that hole - not the wrist - on the haft
    measureLeftFist(spec) {
      const r = this.rig, h = r.b.hand_l; if (!h || !r.b.upperarm_l) return null;
      return r.withPose('Punch_Jab', 0.2, () => {
        const inv = new THREE.Matrix4().copy(r.model.matrixWorld).invert();
        const g = r.gripFrame('hand_l', inv);
        _m.copy(inv).multiply(h.matrixWorld).decompose(_v, _q2, _s);
        const off = _q2.clone().invert().multiply(g.quat);                       // hand -> grip frame
        const c = h.worldToLocal(g.pos.clone().applyMatrix4(r.model.matrixWorld));  // grip hole, hand-local
        const fingers = [];
        h.traverse(b => { if (b !== h && b.isBone && /^(index|middle|ring|pinky|thumb)_0[123]_l$/.test(b.name)) fingers.push([b, b.quaternion.clone()]); });
        return { slide: spec.slide, offInv: off.invert(), c, fingers, w: 0 };
      });
    }
    // two-handed weapons: reach the left arm to the haft and close the fist around it (on top of any clip)
    leftHandOnHaft(dt, a) {
      const L = this.lh, r = this.rig; if (!L || !this.weapon) return;
      const on = this.weapon.visible && !['roll', 'downed', 'revive', 'drink', 'throw', 'getup', 'pickup', 'interact', 'rest', 'hurt', 'drive'].includes(a) && !this.air;
      L.w = damp(L.w, on ? 1 : 0, on ? 9 : 14, dt);
      if (L.w < 0.01) return;
      r.model.updateMatrixWorld(true);
      const wm = this.weapon.matrixWorld, wq = new Q(); wm.decompose(_v, wq, _s);
      const target = new V3(0, 0, L.slide).applyMatrix4(wm);
      const Qd = wq.multiply(L.offInv);                                            // hand_l world orientation
      const hs = r.b.hand_l.getWorldScale(new V3());
      const wrist = target.sub(L.c.clone().multiply(hs).applyQuaternion(Qd));
      const pole = r.b.lowerarm_l.getWorldPosition(new V3()).add(new V3(0, -0.3, 0));
      r.ik('upperarm_l', 'lowerarm_l', 'hand_l', wrist, pole, L.w);
      const h = r.b.hand_l, pq = h.parent.getWorldQuaternion(new Q());
      h.quaternion.slerp(pq.invert().multiply(Qd), L.w);
      L.fingers.forEach(([b, q]) => b.quaternion.slerp(q, L.w));
      h.updateMatrixWorld(true);
    }
    // Lab Rat: swap the human for the rat model (models/rat.glb: body + head + tail pieces)
    setRat(on) {
      on = !!on && !!(HC.assets && HC.assets.rat);
      if (!!this.ratObj === on) return;
      if (on) {
        const r = W.clone('rat'); r.scale.setScalar(RAT_SCALE);
        r.traverse(o => { if (o.isMesh) { o.castShadow = true; o.material = o.material.clone(); } });
        this.ratParts = { body: r.getObjectByName('body') || r, head: r.getObjectByName('head'), tail: r.getObjectByName('tail') };
        if (this.ratParts.head) this.ratParts.head0 = this.ratParts.head.position.clone();
        this.ratObj = r; this.root.add(r); this.ratT = 0; this.biteT = 0;
      } else { this.root.remove(this.ratObj); this.ratObj = null; this.ratParts = null; }
      this.rig.model.visible = !on;
      if (this.shield) this.updateShieldVis();
    }
    // the rat's movement is procedural: a bounding gallop, a lunge for each bite, sniffing at rest, a swishing tail
    animateRat(dt, a) {
      const P = this.ratParts, R = this.ratObj; if (!P || !R) return;
      const sp = Math.min(1.5, (this.speed || 0) / 4.5), run = sp > 0.05;
      this.ratT += dt * (run ? 9 + sp * 9 : 1.2);
      const t = this.ratT;
      const bound = run ? Math.abs(Math.sin(t)) : 0;
      R.position.y = bound * 0.07 * Math.min(1, sp + 0.3);
      R.rotation.x = run ? Math.sin(t * 2) * 0.12 * Math.min(1, sp + 0.3) : 0;
      R.scale.set(RAT_SCALE * (1 - bound * 0.04), RAT_SCALE * (1 + bound * 0.06), RAT_SCALE * (1 + bound * 0.08));
      if (P.tail) { P.tail.rotation.y = Math.sin(t * (run ? 0.5 : 1.7)) * (run ? 0.25 : 0.45); P.tail.rotation.x = run ? -0.15 + Math.sin(t) * 0.1 : Math.sin(t * 0.8) * 0.08; }
      if (P.head) {
        let pitch = 0, fwd = 0, yaw = 0;
        if ((a === 'attack' || a === 'heavy') && this.atk) {
          // lunge: rear back, snap forward on the hit frame, recover
          const hit = Math.max(0.05, this.atk.hit || 0.15), u = this.actT;
          // (the head only tilts a little so the neck seam never opens; the whole body does the lunging)
          if (u < hit) { const k = u / hit; pitch = -0.18 * k; fwd = -0.012 * k; }
          else { const k = Math.min(1, (u - hit) / 0.2); pitch = 0.22 * (1 - k) - 0.18 * (1 - Math.min(1, (u - hit) / 0.05)); fwd = 0.03 * (1 - k); }
          R.position.z = fwd * RAT_SCALE * 4;
          R.rotation.x = pitch * 0.5;
          fwd = 0;
        } else {
          R.position.z = 0;
          if (!run) { pitch = Math.sin(t * 9) * 0.04 + Math.sin(t * 1.3) * 0.12; yaw = Math.sin(t * 0.7) * 0.35; }   // sniffing about
        }
        P.head.rotation.set(pitch, yaw, 0);
        P.head.position.copy(P.head0); P.head.position.z += fwd;
      }
      // fallen: roll onto its side
      R.rotation.z = a === 'downed' ? 1.4 : 0;
    }
    // customization: look = HC.LOOK_DEFAULT-shaped object (see the Character screen in game.js)
    setLook(look) {
      const L = Object.assign({}, HC.LOOK_DEFAULT, look || {}); L.acc = Object.assign({}, (look && look.acc) || {});
      const key = JSON.stringify(L); if (this.lookKey === key) return; this.lookKey = key; this.look = L;
      const X = HC.LOOKS, model = this.rig.model;
      if (!this.own) { this.own = []; model.traverse(o => { if (o.isSkinnedMesh && !o.userData.acc && !o.userData.armor) this.own.push(o); }); }
      const pick = (arr, i) => (arr[i] || arr[0])[1];
      model.traverse(o => {
        if (!o.isMesh || o.userData.acc) return;
        if (!o.userData.ownMat) { o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone(); o.userData.ownMat = true; o.userData.baseCol = (Array.isArray(o.material) ? o.material : [o.material]).map(m => m.color ? m.color.clone() : null); }
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m, i) => {
          if (!m.color) return;
          const base = o.userData.baseCol[i]; if (!base) return;
          // outfit 0 keeps the player's own co-op colour; the others replace it. Skin and hair tint the textures.
          if (/MI_Ranger/.test(m.name)) {
            // re-dye only the cloth: the green parts of the outfit texture take the new colour, leather stays leather
            if (!m.userData.dye) {
              m.userData.dye = { value: new THREE.Color(1, 1, 1) }; m.userData.dyeAmt = { value: 0 };
              m.onBeforeCompile = sh => {
                sh.uniforms.uDye = m.userData.dye; sh.uniforms.uDyeAmt = m.userData.dyeAmt;
                sh.fragmentShader = 'uniform vec3 uDye; uniform float uDyeAmt;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
                  float dyeMask = smoothstep(1.04, 1.3, diffuseColor.g / (max(diffuseColor.r, diffuseColor.b) + 0.003));
                  float dyeLum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
                  diffuseColor.rgb = mix(diffuseColor.rgb, dyeLum * uDye * 2.4, dyeMask * uDyeAmt);`);
              };
              m.customProgramCacheKey = () => 'hcDye'; m.needsUpdate = true;
            }
            if (L.outfit) { m.color.setRGB(0.92, 0.92, 0.92); m.userData.dye.value.setHex(pick(X.outfit, L.outfit)); m.userData.dyeAmt.value = 1; }
            else { m.color.copy(base); m.userData.dyeAmt.value = 0; }
          }
          else if (/Superhero|Regular/.test(m.name)) m.color.copy(base).multiply(new THREE.Color(pick(X.skin, L.skin)));
          else if (/MI_Hair/.test(m.name)) m.color.copy(base).multiply(new THREE.Color(pick(X.hair, L.hair)));
        });
      });
      this.mats = []; model.traverse(o => { if (o.isMesh && o.material && !o.userData.acc) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.emissive) { m.userData.baseEmissive = m.userData.baseEmissive || m.emissive.clone(); } this.mats.push(m); }); });
      this.applyPartVis();
      if (this.lantern) this.lantern.visible = !!L.lantern;
      model.scale.set(L.build || 1, L.height || 1, L.build || 1);
      // accessories: re-attach what changed
      this.accObjs = this.accObjs || {};
      for (const slot of Object.keys(X.acc)) {
        const want = L.acc[slot] || '', cur = this.accObjs[slot];
        if (cur && cur.userData.accId === want && cur.userData.hood === !!L.hood) continue;
        if (cur && cur.parent) cur.parent.remove(cur); delete this.accObjs[slot];
        if (!want || !HC.assets || !HC.assets[want]) continue;
        const [bone, off] = X.anchor[slot]; if (!this.rig.b[bone]) continue;
        const lift = slot === 'head' && L.hood ? 0.045 : 0;                // sit on the hood when it is up
        const o = this.rig.withPose('Idle_Loop', 0.0, () => {
          this.rig.model.updateMatrixWorld(true);
          const inv = new THREE.Matrix4().copy(this.rig.model.matrixWorld).invert();
          const p = new V3().setFromMatrixPosition(this.rig.b[bone].matrixWorld).applyMatrix4(inv).add(new V3(off[0], off[1] + lift, off[2]));
          return this.rig.attach(want, bone, { mode: 'model', pos: p });
        });
        if (!o) continue;
        o.userData.accId = want; o.userData.hood = !!L.hood;
        o.traverse(m => { if (m.isMesh) { m.userData.acc = true; if (slot === 'head' || slot === 'face') m.userData.headwear = true; if (/Glow/.test(m.material.name)) m.material.toneMapped = false; } });
        this.accObjs[slot] = o;
      }
      if (!this.headVisible) { this.headVisible = true; this.setHeadVisible(false); }
    }
    // which outfit parts show: the look's choices, minus anything armor is covering
    applyPartVis() {
      const L = this.look || HC.LOOK_DEFAULT, A = this.armorMeshes || {};
      const hide = [];
      if (A.head || !L.hood) hide.push(/Head_Hood/);
      if (A.head) hide.push(/Hair_/);
      if (A.chest || !L.paul) hide.push(/Acc_Pauldron/);
      if (A.chest || !L.belt) hide.push(/Body_Belt/);
      if (A.arms || !L.brace) hide.push(/Arms_Bracer/);
      if (L.acc && (L.acc.head === 'acc_witch' || L.acc.head === 'acc_hat')) hide.push(/Head_Hood/);   // brimmed hats replace the hood
      (this.own || []).forEach(o => { const n = o.name + ' ' + (o.parent ? o.parent.name : ''); o.visible = !hide.some(r => r.test(n)); });
    }
    // armor: skinned pieces from models/armor_<set>.glb, re-bound to this character's own skeleton so they bend
    // with every animation. vis = { head: 'plate', chest: 'chain', arms: null, legs: 'leather' }
    setArmor(vis) {
      vis = vis || {};
      const model = this.rig.model;
      this.armorMeshes = this.armorMeshes || {};
      if (!this.own) { this.own = []; model.traverse(o => { if (o.isSkinnedMesh && !o.userData.acc && !o.userData.armor) this.own.push(o); }); }
      ['head', 'chest', 'arms', 'legs'].forEach(slot => {
        const want = vis[slot] || null, cur = this.armorMeshes[slot];
        if (cur && cur.userData.set === want) return;
        if (cur) { cur.parent && cur.parent.remove(cur); delete this.armorMeshes[slot]; }
        if (!want || !HC.assets || !HC.assets['armor_' + want]) return;
        const pieces = [];
        HC.assets['armor_' + want].traverse(o => { if (o.isSkinnedMesh && (o.name === slot || (o.parent && o.parent.name === slot))) pieces.push(o); });
        if (!pieces.length) return;
        const grp = new THREE.Group(); grp.userData.set = want;
        for (const src of pieces) {
          const bones = src.skeleton.bones.map(b => this.rig.b[b.name]);
          if (bones.some(b => !b)) continue;
          const m = new THREE.SkinnedMesh(src.geometry, src.material);
          m.bind(new THREE.Skeleton(bones, src.skeleton.boneInverses), src.bindMatrix);
          W.applyLowMaterials(m);
          if (m.material.isMeshStandardMaterial && m.material.metalness > 0.4) { m.material = m.material.clone(); m.material.metalness = 0.4; m.material.roughness = Math.min(m.material.roughness, 0.55); }
          m.frustumCulled = false; m.userData.armor = true; grp.add(m);
        }
        model.add(grp); this.armorMeshes[slot] = grp;
      });
      // hide the outfit parts each piece replaces (the hood and hair under a helmet, the leather pauldron, the bracers)
      // - shared with the Character screen's choices in applyPartVis()
      // ...and cut away the cloth faces underneath each piece, so nothing can poke through the armor when it moves
      const cuts = [];
      if (this.armorMeshes.chest) cuts.push({ mesh: /Ranger_Body$/, bones: /^(spine_0[123]|clavicle_[lr])$/, ymin: 1.02 });
      if (this.armorMeshes.legs) {
        cuts.push({ mesh: /Feet_Boots/, bones: /^calf_[lr]$/, ymin: 0.16 });
        if (['chain', 'bone', 'plate'].includes(this.armorMeshes.legs.userData.set)) cuts.push({ mesh: /Ranger_Legs/, bones: /^thigh_[lr]$/, ymin: 0.62, ymax: 0.97 });
      }
      this.applyPartVis();
      this.own.forEach(o => {
        const n = o.name + ' ' + (o.parent ? o.parent.name : '');
        if (!o.isSkinnedMesh) return;
        if (!o.userData.fullGeo) o.userData.fullGeo = o.geometry;
        const mine = cuts.filter(c => c.mesh.test(n));
        o.geometry = mine.length ? cutGeometry(o, mine) : o.userData.fullGeo;
      });
    }
    // shield on the left forearm, measured in the raised-shield pose so it faces forward when guarding
    setShield(code) {
      if (this.shieldCode === code) return;
      this.shieldCode = code;
      if (this.shield && this.shield.parent) this.shield.parent.remove(this.shield);
      this.shield = null;
      const v = code && HC.Items && HC.Items.shieldVisual(code);
      if (!v || !HC.assets[v.model]) return;
      const r = this.rig;
      this.shield = r.attach(v.model, 'lowerarm_l', { mode: 'none' });
      // guard: measured in the raised-shield pose, facing forward. carry: hanging upright at the left side, facing out.
      const measure = (clip, t, off, rot) => r.withPose(clip, t, () => {
        const inv = new THREE.Matrix4().copy(r.model.matrixWorld).invert();
        const P = n => new V3().setFromMatrixPosition(r.b[n].matrixWorld).applyMatrix4(inv);
        const pos = P('lowerarm_l').lerp(P('hand_l'), 0.55).add(off);
        return r.toLocal('lowerarm_l', pos, new Q().setFromEuler(new THREE.Euler(...rot, 'YXZ')), v.model === 'tower' ? 1.0 : 0.9);
      });
      const big = v.model === 'tower' ? 1.4 : 1;
      this.shieldSt = {
        guard: measure('Idle_Shield_Loop', 0.5, new V3(0, 0, 0.07), [0, 0, 0]),
        carry: measure('Sword_Idle', 0.5, new V3(0.07, 0.02 * big, 0.02), [0, Math.PI / 2, 0]),
      };
      const st = this.shieldSt.carry;
      this.shield.position.copy(st.p); this.shield.quaternion.copy(st.q); this.shield.scale.copy(st.s);
      this.updateShieldVis();
    }
    updateShieldStance(dt) {
      if (!this.shield || !this.shieldSt) return;
      const st = this.shieldSt[this.act === 'block' ? 'guard' : 'carry'], f = 1 - Math.exp(-dt * 14);
      this.shield.position.lerp(st.p, f); this.shield.quaternion.slerp(st.q, f);
    }
    // bows, crossbows and staffs need the left hand: the shield is slung away while one is held
    // (two-handed weapons too: greatswords, greataxes, hammers, halberds and scythes)
    updateShieldVis() { const S = HC.STYLES[this.style] || {}; if (this.shield) this.shield.visible = !this.ratObj &&!S.twoHand && !HC.TWO_HAND[this.style] && !['bow', 'crossbow', 'staff', 'greatsword', 'greataxe', 'hammer', 'halberd', 'scythe'].includes(this.style); }
    get hasShield() { return !!(this.shield && this.shield.visible); }
    applyStance(st, f) {
      if (!st || !this.weapon) return;
      this.weapon.position.lerp(st.p, f); this.weapon.quaternion.slerp(st.q, f);
      // the wrist turn that points the held weapon the way this stance wants (on top of the animated hand)
      this.wristQ = (this.wristQ || new Q()).slerp(st.wrist || _qI, f);
      const h = this.rig.b[this.hand]; if (!h) return;
      // never stack: undo last frame's turn if no clip track rewrote the hand since
      if (this.wristBase && this.wristHand === h && h.quaternion.equals(this.wristOut)) h.quaternion.copy(this.wristBase);
      this.wristBase = h.quaternion.clone(); this.wristHand = h;
      h.quaternion.multiply(this.wristQ); this.wristOut = h.quaternion.clone();
    }
    // nock: bow-local point the string is pulled to (null = straight)
    setString(nock) {
      if (!this.string) return;
      const S = HC.STYLES.bow.string, a = this.string.geometry.attributes.position;
      const m = nock || S.top.clone().add(S.bottom).multiplyScalar(0.5);
      a.setXYZ(0, S.top.x, S.top.y, S.top.z); a.setXYZ(1, m.x, m.y, m.z); a.setXYZ(2, S.bottom.x, S.bottom.y, S.bottom.z); a.needsUpdate = true;
    }
    setLantern(on) { this.lanternGlow.forEach(m => m.color.setHex(on ? 0xffb060 : 0x221810)); }
    // first person hides everything on the head (face, hair, hood, helmet, hats) so the camera never looks out from inside it
    setHeadVisible(v) {
      const h = this.rig.b.Head; if (!h || this.headVisible === v) return;
      h.scale.setScalar(v ? 1 : 0.001); this.headVisible = v;
      const re = /Hood|Hair|Head|Eye|Brow|Lash|Teeth|Tongue|Beard|Face|Hat|Helm|Mask|Horn|Crown|Acc_Head/i;
      const list = [];
      this.rig.model.traverse(o => { if (o.isMesh && (re.test(o.name) || re.test(o.parent ? o.parent.name : '') || o.userData.headwear)) list.push(o); });
      if (this.armorMeshes && this.armorMeshes.head) this.armorMeshes.head.traverse(o => { if (o.isMesh) list.push(o); });
      list.forEach(o => { if (!v) { o.userData.fpWas = o.visible; o.visible = false; } else if (o.userData.fpWas !== undefined) { o.visible = o.userData.fpWas; delete o.userData.fpWas; } });
    }
    update(dt) {
      const r = this.rig, a = this.act, S = HC.STYLES[this.style] || HC.STYLES.sword;
      // polearms and the staff: the weapon arm stays raised (upright grip) except while swinging
      const arm = !!(this.weapon && S.carryArm) && (S.fightArm || !FIGHT_ACTS.includes(a)) && !['roll', 'downed', 'revive', 'rest', 'hurt', 'throw', 'getup', 'pickup', 'drive'].includes(a);
      const sfx = arm ? '|norarm' : '';
      const fresh = a !== this.lastAct || this.lastArm !== arm;
      const prevAct = this.lastAct;
      this.lastAct = a; this.lastArm = arm;
      const moving = this.speed > 0.3, P = loco(arm ? 'Idle_Loop' : (S.idle || 'Sword_Idle'), sfx);
      let layer = arm ? ['Idle_Torch_Loop', {}, 'rarm'] : null;
      if (a !== 'idle' || moving) { this.idleT = 0; if (this.fidget) this.fidget = null; }
      switch (a) {
        case 'attack': case 'heavy': case 'charge': {
          const at = this.atk || S[a === 'attack' ? 'light' : 'heavy'];
          if (this.style === 'crossbow') {
            if (fresh) this.shot = false;
            if (this.actT < at.hit) r.play('Pistol_Aim_Neutral', { loop: false, fade: 0.1 });
            else if (!this.shot) { this.shot = true; r.play('Pistol_Shoot', { loop: false, restart: true, fade: 0.04 }); }
            else if (this.actT > at.hit + 0.3) r.play('Pistol_Reload', { loop: false, ts: HC.CLIPS.Pistol_Reload.duration / Math.max(0.4, (at.reload || 1.1)), fade: 0.12 });
          } else if (S.thrown) {
            // overhand throw; the weapon leaves the hand at the release frame
            if (fresh) r.strike('OverhandThrow', Math.max(0.1, at.hit), 0.45);
          } else if (this.style === 'wand') {
            if (fresh) r.strike('Spell_Simple_Shoot', Math.max(0.08, at.hit), 0.4);
          } else if (S.charge === 'cast') {
            if (fresh) r.strike('Spell_Simple_Shoot' + sfx, Math.max(0.08, at.hit), 0.4);
          } else if (this.style === 'bow') {
            if (moving) r.move(this.speed, P); else r.play(P.idle, { fade: 0.2 });
          } else {
            const clip = (a === 'attack' ? S.clips[(this.combo || 0) % S.clips.length] : S.heavyClip) + sfx;
            if (a === 'charge') {
              // wind up and hold the pose until the button is released
              if (fresh) r.play(clip, { loop: false, restart: true, ts: 0.7, fade: 0.1 });
              const c = r.cur, hold = (S.windup || 0.25) * c.getClip().duration;
              if (c.time >= hold) { c.time = hold; c.paused = true; }
            } else if (a === 'heavy' && prevAct === 'charge' && r.cur) {
              // released: continue the held swing so the blow lands on time
              const c = r.cur; c.paused = false;
              c.timeScale = Math.max(0.5, (c.getClip().duration * (HC.CLIP_F[S.heavyClip] || 0.5) - c.time) / Math.max(0.1, at.hit));
            } else if (fresh || this.lastCombo !== this.combo) r.strike(clip, at.hit, HC.CLIP_F[clip.split('|')[0]] || (a === 'heavy' ? 0.5 : 0.42));
            this.lastCombo = this.combo;
          }
          break;
        }
        case 'draw': case 'loose':
          if (moving) r.move(this.speed, P); else r.play(P.idle, { fade: 0.2 });
          break;
        case 'cast':
          if (fresh) r.play('Spell_Simple_Enter' + sfx, { loop: false, restart: true, fade: 0.12 });
          else if (r.cur && r.cur.time >= r.cur.getClip().duration - 0.02) r.play('Spell_Simple_Idle_Loop' + sfx, { fade: 0.15 });
          break;
        case 'roll': if (fresh) r.play('Roll', { loop: false, restart: true, ts: HC.CLIPS.Roll.duration / Math.max(0.3, this.actDur), fade: 0.08 }); break;
        case 'hurt': if (fresh) r.play(this.actDur > 0.8 ? 'Hit_Knockback' : Math.random() < 0.5 ? 'Hit_Chest' : 'Hit_Head', { loop: false, restart: true, ts: 1.3, fade: 0.06 }); break;
        case 'throw': if (fresh) r.play('OverhandThrow', { loop: false, restart: true, ts: HC.CLIPS.OverhandThrow.duration / Math.max(0.3, this.actDur), fade: 0.08 }); break;
        case 'drink':
          if (moving && !arm) { layer = ['Consume', { loop: false, ts: HC.CLIPS.Consume.duration / Math.max(0.3, this.actDur) }, 'upper']; r.moveLegs(this.speed, P); }
          else if (fresh || this.wasLayered) r.play('Consume' + sfx, { loop: false, restart: true, ts: HC.CLIPS.Consume.duration / this.actDur });
          break;
        case 'block': {
          const bc = this.hasShield ? 'Idle_Shield_Loop' : 'Sword_Block';     // with a shield: shield up in front
          if (moving) { layer = [bc, this.hasShield ? {} : { loop: false }, 'upper']; r.moveLegs(this.speed, P); }
          else r.play(bc, this.hasShield ? { fade: 0.12 } : { loop: false, fade: 0.12 });
          break;
        }
        case 'revive': r.play('Fixing_Kneeling'); break;
        case 'drive': r.play('Sitting_Idle_Loop', { fade: 0.3 }); break;
        case 'downed': if (fresh) r.play('Death01', { loop: false, restart: true, fade: 0.2 }); break;
        case 'getup': if (fresh) r.play('LayToIdle', { loop: false, restart: true, ts: HC.CLIPS.LayToIdle.duration / Math.max(0.4, this.actDur), fade: 0.1 }); break;
        case 'rest':
          if (fresh) r.play('Sitting_Enter', { loop: false, restart: true, fade: 0.25 });
          else if (r.curName === 'Sitting_Enter' && r.cur.time >= r.cur.getClip().duration - 0.03) r.play('Sitting_Idle_Loop', { fade: 0.3 });
          break;
        case 'pickup': if (fresh) r.play('PickUp_Table', { loop: false, restart: true, ts: HC.CLIPS.PickUp_Table.duration / Math.max(0.3, this.actDur), fade: 0.12 }); break;
        case 'interact': if (fresh) r.play('Interact' + sfx, { loop: false, restart: true, ts: HC.CLIPS.Interact.duration / Math.max(0.3, this.actDur), fade: 0.12 }); break;
        default:
          if (this.air) { r.play('Jump_Loop', { fade: 0.2 }); break; }     // flying / launched
          // a swing that just ended plays out its follow-through instead of snapping back to the guard
          if (fresh && (prevAct === 'attack' || prevAct === 'heavy') && r.cur && this.style !== 'bow' && this.style !== 'crossbow')
            this.recover = { name: r.curName, t: prevAct === 'heavy' ? 0.6 : 0.45 };
          if (this.recover) {
            const c = r.cur;
            if (moving || a !== 'idle' || !c || r.curName !== this.recover.name || c.time >= c.getClip().duration - 0.02 || (this.recover.t -= dt) <= 0) this.recover = null;
            else break;
          }
          // standing still for a while: fold the arms, or hold the lantern up and peer into the dark
          if (!moving && a === 'idle' && !arm) {
            this.idleT += dt;
            if (!this.fidget && this.idleT > 14) { this.fidget = Math.random() < 0.5 ? 'Idle_FoldArms_Loop' : 'Idle_Lantern_Loop'; this.fidgetT = 5 + Math.random() * 3; }
            if (this.fidget) { this.fidgetT -= dt; r.play(this.fidget, { fade: 0.5 }); if (this.fidgetT <= 0) { this.fidget = null; this.idleT = 0; } break; }
          }
          r.move(this.speed, P);
      }
      this.wasLayered = !!layer && layer[2] === 'upper';
      if (layer) r.layer(layer[0], layer[1], layer[2]); else r.layer(null);
      r.update(dt);
      // first person: bend the chest and neck with where you look, so the arms and weapon stay in view
      if (this.fp && !['drive', 'roll', 'downed', 'revive', 'rest', 'getup'].includes(a)) {
        const p = Math.max(-0.8, Math.min(0.8, (this.pitch || 0) - 0.12));
        r.overlay('spine_02', -p * 0.3, 0, 0); r.overlay('spine_03', -p * 0.35, 0, 0);
        if (r.b.neck_01) r.overlay('neck_01', -p * 0.25, 0, 0);
      }
      // ---- bow: turn side-on, the bow arm points at the target, the other hand draws the string to the jaw
      const drawing = this.style === 'bow' && (a === 'draw' || a === 'loose') && this.weapon;
      this.drawW = damp(this.drawW, drawing ? 1 : 0, drawing ? 14 : 10, dt);
      this.twist = damp(this.twist, drawing ? -1.15 : 0, 12, dt);
      this.root.position.copy(this.pos); this.root.rotation.y = this.yaw + this.twist;
      if (this.drawW > 0.01 && this.weapon) this.archery(a);
      else {
        // ordinary grips: blend toward the stance for what the character is doing
        let k = 'fight';
        if (S.ranged) k = S.aim && ['attack', 'heavy'].includes(a) ? 'aim' : 'carry';
        else if (this.stances.carry && !FIGHT_ACTS.includes(a)) k = 'carry';
        const st = this.stances[k] || this.stances.fight || this.stances.carry;
        // thrown weapons vanish from the hand once released, until the throw is over
        if (this.weapon) this.weapon.visible = !(S.thrown && (a === 'attack' || a === 'heavy') && this.actT > ((this.atk || S.light).hit || 0.3));
        this.applyStance(st, this.stanceKey === k ? 1 - Math.exp(-dt * 16) : 1 - Math.exp(-dt * 16));
        this.stanceKey = k;
        if (this.string && this.drawW <= 0.01) { this.setString(null); if (this.nockArrow) this.nockArrow.visible = false; }
      }
      this.leftHandOnHaft(dt, a);
      if (this.ratObj) this.animateRat(dt, a);
      // behind the wheel: both hands on the rim (10 and 2), following it as it turns
      if (a === 'drive' && this.driveGrips) {
        r.model.updateMatrixWorld(true);
        const g = this.driveGrips, pl = r.b.lowerarm_l, pr = r.b.lowerarm_r;
        if (pl) r.ik('upperarm_l', 'lowerarm_l', 'hand_l', g.left, pl.getWorldPosition(new V3()).add(new V3(0, -0.4, 0)), 1);
        if (pr) r.ik('upperarm_r', 'lowerarm_r', 'hand_r', g.right, pr.getWorldPosition(new V3()).add(new V3(0, -0.4, 0)), 1);
      }
      this.updateShieldStance(dt);
      r.hitFlash(dt);
    }
    archery(a) {
      const r = this.rig, w = Math.min(1, this.drawW), pu = this.pitch;
      // aim direction: the way the character faces (yaw) tilted by the camera pitch
      _aim.set(Math.sin(this.yaw) * Math.cos(pu), Math.sin(pu), Math.cos(this.yaw) * Math.cos(pu));
      r.model.updateMatrixWorld(true);
      // head and chest turn back toward the target while the hips stay side-on; chest leans with the aim
      r.overlay('spine_03', 0, 0.35 * w, 0); r.overlay('neck_01', 0, 0.45 * w, 0); r.overlay('Head', 0, 0.35 * w, 0);
      r.overlay('spine_02', 0, 0, pu * 0.6 * w);
      r.model.updateMatrixWorld(true);
      const ls = r.b.upperarm_l.getWorldPosition(new V3()), rs = r.b.upperarm_r.getWorldPosition(new V3());
      const reach = r.armLength('upperarm_l', 'lowerarm_l', 'hand_l') * 0.92;
      const grip = ls.clone().addScaledVector(_aim, reach);
      r.ik('upperarm_l', 'lowerarm_l', 'hand_l', grip, ls.clone().addScaledVector(_aim, 0.3).add(new V3(0, -0.6, 0)), w);
      // the bow: upright (slightly canted), facing the target, in the left palm
      r.model.updateMatrixWorld(true);
      const inv = _mi.copy(r.model.matrixWorld).invert();
      const palmW = r.palm('hand_l', inv).applyMatrix4(r.model.matrixWorld);
      const zf = _aim.clone(), yu = _up.clone().sub(zf.clone().multiplyScalar(_up.dot(zf))).normalize();
      yu.applyAxisAngle(zf, -0.12);
      const xr = new V3().crossVectors(yu, zf).normalize();
      const qW = new Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xr, yu, zf));
      const hb = r.b.hand_l, hq = hb.getWorldQuaternion(new Q()), hs = hb.getWorldScale(new V3());
      const wq = hq.clone().invert().multiply(qW);
      const wp = hb.worldToLocal(palmW.clone());
      const st = this.stances.carry;
      this.weapon.position.copy(st ? st.p.clone().lerp(wp, w) : wp);
      this.weapon.quaternion.copy(st ? st.q.clone().slerp(wq, w) : wq);
      this.weapon.updateMatrixWorld(true);
      // draw hand: from the string to the anchor at the jaw as the draw builds; snaps forward on release
      const pull = a === 'loose' ? 0 : this.draw;
      const stringW = this.weapon.localToWorld(new V3(0, 0, -0.082));
      const nockW = stringW.clone().addScaledVector(_aim, -(0.04 + 0.56 * pull));
      const wristT = nockW.clone().addScaledVector(_aim, -0.07).add(new V3(0, -0.03, 0));
      r.ik('upperarm_r', 'lowerarm_r', 'hand_r', wristT, rs.clone().addScaledVector(_aim, -0.6).add(new V3(0, 0.25, 0)), w);
      // string + arrow follow the drawing fingers
      r.model.updateMatrixWorld(true);
      const fing = r.b.middle_01_r ? r.b.middle_01_r.getWorldPosition(new V3()) : nockW;
      const nockL = this.weapon.worldToLocal(a === 'loose' ? stringW.clone() : fing.clone());
      nockL.x = 0;                                     // the string stays in the bow's plane
      this.setString(nockL);
      if (this.nockArrow) {
        const show = a === 'draw' && this.nocked !== false;
        this.nockArrow.visible = show;
        if (show) {
          const dir = new V3(0, 0, 1);                 // bow-local forward
          this.nockArrow.position.copy(nockL).addScaledVector(dir, 0.415);
          this.nockArrow.quaternion.identity();
        }
      }
    }
  }
  HC.Avatar = Avatar;

  // ------------------------------------------------------------ FX
  const FX = HC.FX = { list: [] };
  FX.init = function (scene) {
    FX.scene = scene;
    FX.ringGeo = new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2);
    FX.pillarGeo = new THREE.CylinderGeometry(1, 1.4, 9, 16, 1, true);
    FX.circleGeo = new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2);
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, '#fff'); gr.addColorStop(0.4, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    FX.dot = new THREE.CanvasTexture(c);
    W.ash.material.map = FX.dot; W.ash.material.needsUpdate = true;
  };
  const SHARED = () => [FX.ringGeo, FX.pillarGeo, FX.circleGeo];
  FX.spawn = function (type, pos, o = {}) {
    let obj, life;
    if (type === 'spark' || type === 'blood' || type === 'ember' || type === 'dust' || type === 'stone') {
      const n = type === 'ember' ? 40 : 20, arr = new Float32Array(n * 3), vel = [];
      for (let i = 0; i < n; i++) { arr[i * 3] = pos.x; arr[i * 3 + 1] = pos.y; arr[i * 3 + 2] = pos.z; vel.push(new V3((Math.random() - 0.5) * 6, Math.random() * 5 + (type === 'ember' ? 2 : 0), (Math.random() - 0.5) * 6)); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      const col = { spark: 0xffd08a, blood: 0x6a0a08, ember: 0xff6a20, dust: 0x6a6258, stone: 0x8a857c }[type];
      obj = new THREE.Points(g, new THREE.PointsMaterial({ color: col, size: type === 'dust' || type === 'stone' ? 0.4 : 0.2, map: FX.dot, transparent: true, depthWrite: false, toneMapped: type === 'blood' || type === 'dust' || type === 'stone' }));
      obj.userData.vel = vel; life = type === 'ember' ? 1.6 : 0.7;
    } else if (type === 'ring') {
      obj = new THREE.Mesh(FX.ringGeo, new THREE.MeshBasicMaterial({ color: o.color || 0xff7a30, transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
      obj.position.copy(pos).setY(pos.y + 0.15); life = o.life || 0.9; obj.userData.maxR = o.r || 10;
    } else if (type === 'pillar') {
      obj = new THREE.Mesh(FX.pillarGeo, new THREE.MeshBasicMaterial({ color: o.color || 0xff5a1a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      obj.position.copy(pos).setY(pos.y + 4.5); obj.scale.set(o.r || 2, 0.01, o.r || 2); life = 1.0;
    } else if (type === 'warn') {
      obj = new THREE.Mesh(FX.circleGeo, new THREE.MeshBasicMaterial({ color: 0xff3010, transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false }));
      obj.position.copy(pos).setY(pos.y + 0.08); obj.scale.setScalar(o.r || 2); life = o.life || 1.2;
    } else if (type === 'pingMark') {
      obj = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.25, 30, 8, 1, true), new THREE.MeshBasicMaterial({ color: o.color || 0xffd08a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      obj.position.copy(pos).setY(pos.y + 15); life = 5;
    }
    if (!obj) return;
    Object.assign(obj.userData, { type, life, t: 0 });
    FX.scene.add(obj); FX.list.push(obj);
  };
  FX.update = function (dt) {
    for (let i = FX.list.length - 1; i >= 0; i--) {
      const o = FX.list[i], u = o.userData; u.t += dt; const p = u.t / u.life;
      if (o.isPoints) {
        const a = o.geometry.attributes.position;
        for (let j = 0; j < u.vel.length; j++) { u.vel[j].y -= (u.type === 'ember' ? 1 : 12) * dt; a.array[j * 3] += u.vel[j].x * dt; a.array[j * 3 + 1] += u.vel[j].y * dt; a.array[j * 3 + 2] += u.vel[j].z * dt; }
        a.needsUpdate = true; o.material.opacity = 1 - p;
      } else if (u.type === 'ring') { const r = 0.5 + p * u.maxR; o.scale.set(r, 1, r); o.material.opacity = 1 - p; }
      else if (u.type === 'pillar') { o.scale.y = p < 0.15 ? p / 0.15 : 1; o.material.opacity = 0.9 * (1 - p); }
      else if (u.type === 'warn') o.material.opacity = 0.15 + 0.35 * p;
      else if (u.type === 'pingMark') o.material.opacity = 0.5 * (1 - p);
      if (p >= 1) { FX.scene.remove(o); if (!SHARED().includes(o.geometry)) o.geometry.dispose(); o.material.dispose(); FX.list.splice(i, 1); }
    }
  };

  // ------------------------------------------------------------ projectiles (host decides hits; everyone draws)
  const Proj = HC.Proj = { list: [] };
  // o (player shots): { friendly, poise, pierce, grav, perk } - friendly shots are simulated by the shooter against enemies
  Proj.spawn = function (type, pos, vel, dmg, simulate, o = {}) {
    let mesh;
    if (type === 'bolt') mesh = W.clone('bolt');
    else if (type === 'arrow' && HC.assets && HC.assets.arrow) { mesh = W.clone('arrow'); mesh.scale.setScalar(1.15); }
    else if ((type === 'javelin' || type === 'knife') && HC.assets && HC.assets[type]) { mesh = W.clone(type); }   // model tips point +Z = the flight direction
    else if (type === 'void') { mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), new THREE.MeshBasicMaterial({ color: 0x8a20ff, toneMapped: false })); }
    else if (type === 'bomb' && HC.assets && HC.assets.potion) { mesh = W.clone('potion'); mesh.traverse(m => { if (m.isMesh && /Liquid/.test(m.material.name)) { m.material = m.material.clone(); m.material.color.setHex(0x222018); m.material.emissive && m.material.emissive.setHex(0x401000); } }); }
    else {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(type === 'wave' ? 0.6 : 0.28, 12, 8), new THREE.MeshBasicMaterial({ color: type === 'pale' ? 0x9ad0ff : 0xff6a20, toneMapped: false }));
      if (type === 'wave') mesh.scale.set(3, 0.4, 0.6);
    }
    const holder = new THREE.Group(); holder.add(mesh); holder.position.copy(pos);
    if (o.size && o.size !== 1) mesh.scale.multiplyScalar(o.size);
    holder.quaternion.setFromUnitVectors(new V3(0, 0, 1), vel.clone().normalize());
    FX.scene.add(holder);
    Proj.list.push(Object.assign({ type, pos: pos.clone(), vel: vel.clone(), dmg, life: 4, mesh: holder, sim: simulate, hit: new Set() }, o));
  };
  Proj.update = function (dt, players) {
    for (let i = Proj.list.length - 1; i >= 0; i--) {
      const p = Proj.list[i];
      if (p.grav) { p.vel.y -= p.grav * dt; p.mesh.quaternion.setFromUnitVectors(new V3(0, 0, 1), p.vel.clone().normalize()); }
      p.pos.addScaledVector(p.vel, dt); p.life -= dt; p.mesh.position.copy(p.pos);
      if (p.type === 'orb') { p.mesh.scale.setScalar(1 + Math.sin(p.life * 30) * 0.15); if (Math.random() < 0.3) FX.spawn('ember', p.pos.clone()); }
      if (p.type === 'bomb') p.mesh.rotation.x += dt * 9;
      if (p.type === 'knife') p.mesh.children[0].rotation.x += dt * 22;            // spinning end over end
      if (p.type === 'void') { p.mesh.rotation.y += dt * 5; if (Math.random() < 0.4) FX.spawn('spark', p.pos.clone()); }
      let dead = p.life <= 0;
      if (p.pos.x > 1500 ? !W.walkable(p.pos.x, p.pos.z) : p.pos.y < W.heightAt(p.pos.x, p.pos.z)) {
        dead = true;
        if (p.type === 'arrow' || p.type === 'bolt') HC.Audio.play('arrow_thunk', p.pos, 0.6);   // sticks into the ground
      }
      // an enemy bolt whistling past your head
      if (!p.friendly && !p.whizzed && (p.type === 'bolt' || p.type === 'arrow') && HC.Game.api) {
        const me = HC.Game.api.me();
        if (me && Math.abs(me.pos.x - p.pos.x) + Math.abs(me.pos.z - p.pos.z) < 3.5) { p.whizzed = true; HC.Audio.play('arrow_fly', p.pos, 1.0); }
      }
      // the local player's own shots: hit enemies (the hit goes through the normal damage path in game.js)
      if (p.friendly && p.sim && !dead) HC.Game.enemies.forEach(e => {
        if (dead || !e.alive || !e.root.visible || p.hit.has(e.id)) return;
        const r = (e.cfg.r || 0.5) + (p.type === 'wave' ? 1.6 : p.type === 'void' ? 0.5 * (p.size || 1) : p.type === 'bomb' ? 0.5 : 0.35), cy = e.pos.y + Math.min(e.cfg.h, 3) * 0.55;
        if (Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < r && Math.abs(cy - p.pos.y) < Math.max(1.1, e.cfg.h * 0.6)) {
          p.hit.add(e.id); HC.Game.projHit(e, p);
          if (!p.pierce) dead = true;
        }
      });
      // PvP worlds: your shots hit other players too
      if (p.friendly && p.sim && !dead && HC.Game.pvp) HC.Game.players.forEach(pl => {
        if (dead || pl.local || pl.downed || p.hit.has(pl.id)) return;
        if (Math.hypot(pl.pos.x - p.pos.x, pl.pos.z - p.pos.z) < 0.6 + (p.type === 'wave' ? 1.6 : 0) && Math.abs(pl.pos.y + 1 - p.pos.y) < 1.2) {
          p.hit.add(pl.id); HC.Game.pvpHit(pl, p.dmg);
          if (!p.pierce) dead = true;
        }
      });
      if (dead && p.friendly && p.sim && p.type === 'bomb') HC.Game.bombBurst(p);
      if (p.sim && players && !p.friendly) for (const pl of players) {
        if (!pl.alive || p.hit.has(pl.id)) continue;
        const r = p.type === 'wave' ? 2.2 : 0.8;
        if (Math.hypot(pl.pos.x - p.pos.x, pl.pos.z - p.pos.z) < r && Math.abs(pl.pos.y + 1 - p.pos.y) < 1.6) {
          p.hit.add(pl.id); HC.Game.hitPlayer(pl.id, p.dmg, p.pos, 'proj');
          if (p.type !== 'wave') dead = true;
        }
      }
      if (dead) { FX.scene.remove(p.mesh); Proj.list.splice(i, 1); if (p.type === 'orb' || p.type === 'bomb') FX.spawn('ember', p.pos.clone()); }
    }
  };

  // ------------------------------------------------------------ enemies
  const S = HC.ESTATE = { idle: 0, chase: 1, windup: 2, attack: 3, recover: 4, stagger: 5, dead: 6, guard: 7, freeze: 8, hidden: 9, intro: 10, roar: 11, ret: 12, rise: 13, aim: 14, flee: 15 };
  HC.ESTATE_NAME = Object.fromEntries(Object.entries(S).map(([k, v]) => [v, k]));
  const TYPES = HC.ETYPES = {
    hollow: { asset: 'hollow', hp: 55, speed: 2.0, run: 4.2, dmg: 14, range: 1.9, windup: 0.6, atk: 0.35, rec: 0.9, aggro: 17, poise: 20, r: 0.45, h: 1.3, ash: 25 },
    drowned: { asset: 'drowned', hp: 75, speed: 1.4, run: 2.8, dmg: 17, range: 2.0, windup: 0.75, atk: 0.4, rec: 1.0, aggro: 9, poise: 30, r: 0.45, h: 1.6, ash: 40, ambush: true },
    knight: { asset: 'knight', hp: 150, speed: 1.5, run: 3.3, dmg: 24, range: 2.6, windup: 0.85, atk: 0.3, rec: 1.0, aggro: 18, poise: 60, r: 0.55, h: 1.8, ash: 90, weapon: 'sword', shield: true },
    arbalist: { asset: 'arbalist', hp: 60, speed: 1.6, run: 3.2, dmg: 18, range: 1.8, windup: 1.0, atk: 0.25, rec: 1.4, aggro: 26, poise: 18, r: 0.45, h: 1.7, ash: 55, weapon: 'crossbow', ranged: 'bolt', keep: 9 },
    wraith: { asset: 'wraith', hp: 85, speed: 2.4, run: 3.2, dmg: 20, range: 1.8, windup: 0.9, atk: 0.3, rec: 1.2, aggro: 22, poise: 25, r: 0.45, h: 1.9, ash: 70, ranged: 'orb', keep: 7, float: true },
    watcher: { asset: 'watcher', hp: 1e9, speed: 0, run: 5.2, dmg: 45, range: 1.7, windup: 0, atk: 0, rec: 0, aggro: 45, poise: 1e9, r: 0.45, h: 2.7, ash: 0 },
  };
  // clip sets per type
  // clip sets per type (Quaternius Universal Animation Library 1 + 2)
  const SETS = {
    hollow: { idle: 'Zombie_Idle_Loop', walk: 'Zombie_Walk_Fwd_Loop', run: 'Sprint_Loop', walkSpeed: 1.0, runSpeed: 6.0, atk: 'Zombie_Scratch', hit: 'Hit_Head', rise: 'LayToIdle', voice: 'screech' },
    drowned: { idle: 'Zombie_Idle_Loop', idleTs: 0.7, walk: 'Zombie_Walk_Fwd_Loop', run: 'Zombie_Walk_Fwd_Loop', walkSpeed: 1.0, atk: 'Zombie_Scratch', hit: 'Hit_Chest', rise: 'LayToIdle', voice: 'gurgle' },
    knight: { idle: 'Idle_Shield_Loop', walk: 'Walk_Loop', run: 'Jog_Fwd_Loop', atk: 'Sword_Regular_A', atk2: 'Sword_Regular_B', guard: 'Sword_Block', hit: 'Hit_Chest', stagger: 'Idle_Shield_Break', voice: 'growl' },
    arbalist: { idle: 'Pistol_Idle_Loop', walk: 'Walk_Loop', run: 'Jog_Fwd_Loop', aim: 'Pistol_Aim_Neutral', atk: 'Pistol_Shoot', melee: 'Melee_Hook', hit: 'Hit_Chest', voice: 'growl' },
    wraith: { idle: 'Spell_Simple_Idle_Loop', walk: 'Spell_Simple_Idle_Loop', run: 'Spell_Simple_Idle_Loop', aim: 'Spell_Simple_Enter', atk: 'Spell_Simple_Shoot', melee: 'Zombie_Scratch', hit: 'Hit_Head', voice: 'moan' },
    watcher: { idle: 'Zombie_Idle_Loop', idleTs: 0.25, walk: 'Zombie_Walk_Fwd_Loop', run: 'Zombie_Walk_Fwd_Loop', walkSpeed: 0.9, hit: 'Hit_Head', voice: 'moan' },
    boss: { idle: 'Sword_Idle', walk: 'Walk_Loop', run: 'Jog_Fwd_Loop', hit: 'Hit_Knockback', over: 'Sword_Regular_C', side: 'Sword_Regular_B', thrust: 'Sword_Dash',
      both: 'Spell_Simple_Shoot', bell: 'NinjaJump_Start', weep: 'Crouch_Idle_Loop', roar: 'Spell_Simple_Enter', intro: 'LayToIdle' },
  };
  SETS.sentinel = { ...SETS.boss, idle: 'Idle_Loop', over: 'Punch_Cross', side: 'Melee_Hook', thrust: 'Shield_Dash', walkSpeed: 1.4 * 2.4, runSpeed: 3.6 * 2.4 };
  SETS.brother = { ...SETS.boss, idle: 'Zombie_Idle_Loop', idleTs: 0.5, walk: 'Zombie_Walk_Fwd_Loop', run: 'Sprint_Loop', over: 'Zombie_Scratch', side: 'Zombie_Scratch', thrust: 'Melee_Hook', walkSpeed: 1.0 * 1.45, runSpeed: 6.0 * 1.45 };
  SETS.bellbearer = { ...SETS.boss, idle: 'Idle_Loop', walk: 'Walk_Loop', run: 'Walk_Loop', over: 'Punch_Cross', side: 'Melee_Hook', thrust: 'Shield_Dash', walkSpeed: 1.4 * 2.1, walkTs: 0.8 };
  SETS.corvane = { ...SETS.boss, idle: 'Idle_Shield_Loop', walkSpeed: 1.4 * 1.18, runSpeed: 3.6 * 1.18 };
  SETS.king = { ...SETS.boss, walkSpeed: 1.4 * 1.75, runSpeed: 3.6 * 1.75 };

  const BOSSES = HC.BOSSES = {
    sentinel: { asset: 'sentinel', name: 'The Weeping Sentinel', title: 'Mourner of Blackroot', hp: 1400, speed: 2.0, run: 3.0, r: 1.5, h: 4.3, poise: 160, ash: 2500, sigil: 'tears',
      attacks: [{ n: 'fist', kind: 'melee', w: 0.9, a: 0.35, rec: 1.0, range: 5.2, arc: 1.2, dmg: 30, anim: 'over', min: 0, max: 6 },
        { n: 'sweep', kind: 'melee', w: 1.0, a: 0.4, rec: 1.1, range: 6.0, arc: 1.7, dmg: 28, anim: 'side', min: 0, max: 6.5 },
        { n: 'slam', kind: 'slam', w: 1.2, a: 0.3, rec: 1.4, range: 4.5, dmg: 36, ring: 13, anim: 'bell', min: 0, max: 7 },
        { n: 'weep', kind: 'guard', w: 0.4, a: 2.4, rec: 0.3, anim: 'weep', min: 0, max: 40, weight: 0.4 },
        { n: 'charge', kind: 'lunge', w: 0.8, a: 0.8, rec: 1.2, dmg: 30, speed: 14, anim: 'thrust', min: 7, max: 30, weight: 1.2 },
        { n: 'shards', kind: 'wave', w: 1.0, a: 0.4, rec: 1.0, dmg: 22, ring: 16, anim: 'both', min: 0, max: 30, phase: 2 },
        { n: 'quake', kind: 'erupt', w: 1.0, a: 1.4, rec: 0.9, dmg: 26, anim: 'both', min: 6, max: 30, phase: 2, color: 0xbfc8d0 }] },
    brother: { asset: 'brother', name: 'The Patient Brother', title: 'That Which Knocks', hp: 1150, speed: 2.4, run: 4.2, r: 0.8, h: 3.4, poise: 110, ash: 2500, sigil: 'silence',
      attacks: [{ n: 'reach', kind: 'lunge', w: 0.7, a: 0.45, rec: 1.0, dmg: 26, speed: 10, anim: 'thrust', min: 2, max: 9 },
        { n: 'swipe', kind: 'melee', w: 0.55, a: 0.3, rec: 0.6, range: 4.2, arc: 1.5, dmg: 22, anim: 'side', min: 0, max: 4.5, next: 'swipe2' },
        { n: 'swipe2', kind: 'melee', w: 0.35, a: 0.3, rec: 0.9, range: 4.2, arc: 1.5, dmg: 22, anim: 'over', min: 99, max: 99 },
        { n: 'scream', kind: 'wave', w: 1.1, a: 0.5, rec: 1.0, dmg: 20, ring: 14, anim: 'both', min: 0, max: 12, color: 0x9ab8ff },
        { n: 'blink', kind: 'blink', w: 0.4, a: 0.2, rec: 0.4, anim: 'idle', min: 8, max: 40, weight: 1.2 },
        { n: 'whispers', kind: 'volley', w: 0.9, a: 0.4, rec: 1.0, dmg: 16, proj: 'pale', count: 5, anim: 'both', min: 6, max: 30, phase: 2 }] },
    bellbearer: { asset: 'bellbearer', name: 'Bishop Calloway, the Bell-Bearer', title: 'He Who Rings', hp: 1700, speed: 1.7, run: 2.6, r: 1.7, h: 4.3, poise: 180, ash: 3500, sigil: 'bell',
      attacks: [{ n: 'maul', kind: 'melee', w: 0.95, a: 0.35, rec: 1.1, range: 5.6, arc: 1.4, dmg: 32, anim: 'over', min: 0, max: 6 },
        { n: 'swing', kind: 'melee', w: 1.0, a: 0.4, rec: 1.0, range: 6.2, arc: 1.8, dmg: 28, anim: 'side', min: 0, max: 6.5 },
        { n: 'toll', kind: 'wave', w: 1.3, a: 0.4, rec: 0.2, dmg: 24, ring: 18, anim: 'bell', min: 0, max: 30, next: 'toll2', color: 0x9ab8ff },
        { n: 'toll2', kind: 'wave', w: 0.6, a: 0.4, rec: 1.2, dmg: 24, ring: 18, anim: 'bell', min: 99, max: 99, color: 0x9ab8ff },
        { n: 'drop', kind: 'slam', w: 1.3, a: 0.3, rec: 1.6, range: 4.6, dmg: 42, ring: 14, anim: 'bell', min: 0, max: 7 },
        { n: 'debris', kind: 'erupt', w: 1.0, a: 1.4, rec: 0.9, dmg: 26, anim: 'both', min: 0, max: 30, phase: 2, color: 0xbfc8d0 },
        { n: 'faithful', kind: 'summon', w: 1.2, a: 0.5, rec: 1.0, type: 'hollow', count: 2, anim: 'both', min: 0, max: 40, phase: 2, once: true }] },
    corvane: { asset: 'corvane', name: 'Ser Corvane, Ashen Captain', title: 'Last of the Ashen Guard', hp: 1350, speed: 2.8, run: 5.0, r: 0.75, h: 2.4, poise: 120, ash: 4500, sigil: 'oath', weapon: 'embersword', wscale: 1.1,
      attacks: [{ n: 'cut', kind: 'melee', w: 0.45, a: 0.25, rec: 0.35, range: 3.6, arc: 1.3, dmg: 24, anim: 'over', min: 0, max: 4, next: 'cut2' },
        { n: 'cut2', kind: 'melee', w: 0.35, a: 0.25, rec: 0.35, range: 3.6, arc: 1.5, dmg: 24, anim: 'side', min: 99, max: 99, next: 'cut3' },
        { n: 'cut3', kind: 'melee', w: 0.55, a: 0.3, rec: 1.0, range: 3.8, arc: 1.2, dmg: 30, anim: 'over', min: 99, max: 99 },
        { n: 'lunge', kind: 'lunge', w: 0.6, a: 0.5, rec: 1.0, dmg: 28, speed: 18, anim: 'thrust', min: 4, max: 14 },
        { n: 'emberwave', kind: 'volley', w: 0.8, a: 0.3, rec: 1.0, dmg: 24, proj: 'wave', count: 1, anim: 'side', min: 6, max: 30 },
        { n: 'oath', kind: 'erupt', w: 1.0, a: 1.4, rec: 0.9, dmg: 26, anim: 'both', min: 0, max: 30, phase: 2 },
        { n: 'flurry', kind: 'volley', w: 0.7, a: 0.3, rec: 0.8, dmg: 20, proj: 'wave', count: 3, anim: 'side', min: 5, max: 30, phase: 2 }] },
    king: { asset: 'boss', name: 'Aldric, the Hollow King', title: 'Warden of the Below', hp: 1900, speed: 2.4, run: 3.2, r: 1.3, h: 3.3, poise: 150, ash: 0, weapon: 'greatsword', wscale: 1.0,
      attacks: [{ n: 'sweep', kind: 'melee', w: 0.95, a: 0.35, rec: 1.0, range: 5.8, arc: 1.5, dmg: 30, anim: 'side', min: 0, max: 6.5 },
        { n: 'slam', kind: 'slam', w: 1.15, a: 0.3, rec: 1.3, range: 4.2, dmg: 38, ring: 12, anim: 'over', min: 0, max: 5 },
        { n: 'thrust', kind: 'lunge', w: 0.75, a: 0.6, rec: 1.1, dmg: 28, speed: 16, anim: 'thrust', min: 4, max: 16 },
        { n: 'combo', kind: 'melee', w: 0.6, a: 0.3, rec: 0.5, range: 5.2, arc: 1.4, dmg: 22, anim: 'over', min: 0, max: 4.5, next: 'sweep' },
        { n: 'erupt', kind: 'erupt', w: 1.0, a: 1.4, rec: 0.9, dmg: 26, anim: 'both', min: 6, max: 30, phase: 2 },
        { n: 'court', kind: 'summon', w: 1.0, a: 0.5, rec: 0.8, type: 'knight', count: 2, anim: 'both', min: 0, max: 40, phase: 2, once: true }] },
  };

  class Enemy {
    constructor(id, type, pos, opts = {}) {
      this.id = id; this.type = type; this.boss = BOSSES[type] || null;
      this.cfg = this.boss || TYPES[type];
      this.rig = new Rig(this.cfg.asset);
      this.root = this.rig.root;
      this.set = SETS[type] || SETS.knight;
      if (this.cfg.weapon) this.rig.attach(this.cfg.weapon, 'hand_r', type === 'arbalist' ? { mode: 'forward', offset: new V3(0, 0.05, 0.25) } : { mode: 'grip', scale: this.cfg.wscale || 1 });
      if (this.cfg.shield) this.rig.attach('shield', 'lowerarm_l', { mode: 'forward', offset: new V3(0.08, 0, 0.12), scale: 0.9 });
      this.pos = pos.clone(); this.home = pos.clone(); this.yaw = opts.yaw !== undefined ? opts.yaw : Math.random() * 6.28; this.homeYaw = this.yaw;
      this.maxHp = this.cfg.hp * (opts.hpMul || 1); this.hp = this.maxHp; this.poise = this.cfg.poise;
      this.state = this.boss ? S.hidden : (this.cfg.ambush ? S.hidden : S.idle);
      this.stateT = 0; this.atk = 0; this.target = null; this.phase = 1; this.animState = -1;
      this.wander = this.pos.clone(); this.netPos = this.pos.clone(); this.netYaw = this.yaw;
      this.hitPlayers = new Set(); this.speedNow = 0; this.deadT = 0; this.t = Math.random() * 10; this.used = new Set();
      this.root.position.copy(this.pos);
      HC.scene.add(this.root);
      this.root.visible = this.state !== S.hidden || this.type === 'watcher';
      this.rig.play(this.set.idle, { at: Math.random() });
    }
    get alive() { return this.state !== S.dead && this.state !== S.hidden; }
    get A() { return this.boss ? this.boss.attacks[this.atk] : null; }
    setState(s, atk) { this.state = s; this.stateT = 0; if (atk !== undefined) this.atk = atk; this.hitPlayers.clear(); }
    faceTo(p, dt, k = 6) { const want = Math.atan2(p.x - this.pos.x, p.z - this.pos.z); this.yaw += angDiff(this.yaw, want) * Math.min(1, dt * k); }
    moveDir(dx, dz, sp, dt) { const l = Math.hypot(dx, dz) || 1; W.move(this.pos, dx / l * sp * dt, dz / l * sp * dt, this.cfg.r); this.speedNow = sp; }
    nearestPlayer(players, maxD) {
      let best = null, bd = maxD;
      for (const p of players) {
        if (!p.alive || (p.pos.x > 1500) !== (this.pos.x > 1500)) continue;
        const d = p.pos.distanceTo(this.pos);
        if (d < bd && d < maxD * (p.stealth || 1)) { bd = d; best = p; }
      }
      return best;
    }
    // ---------------- host only
    takeHit(dmg, poiseDmg, from, attackerId) {
      if (!this.alive) return false;
      if (this.type === 'watcher') { HC.Game.fx('dust', this.pos.clone().setY(this.pos.y + 1.5)); HC.Game.sound('whisper', this.pos); return false; }
      if (this.state === S.intro) return false;
      let d = dmg;
      if (this.state === S.guard) {
        if (this.boss) { d *= 0.05; poiseDmg = 0; HC.Game.sound('clang', this.pos); }
        else {
          const toAtt = Math.atan2(from.x - this.pos.x, from.z - this.pos.z);
          if (Math.abs(angDiff(this.yaw, toAtt)) < 1.2) { d *= 0.2; poiseDmg *= 0.3; HC.Game.sound('clang', this.pos); HC.Game.fx('spark', this.pos.clone().setY(this.pos.y + 1.2)); }
        }
      }
      if (this.state === S.roar) d *= 0.5;
      this.hp -= d; this.rig.flash = 0.25; this.poise -= poiseDmg;
      if (this.hp <= 0) { this.hp = 0; this.setState(S.dead); HC.Game.onEnemyDeath(this); return true; }
      if (!this.boss && this.type !== 'knight' && Math.random() < 0.45) HC.Game.sound(this.type === 'wraith' ? 'moan' : 'snarl', this.pos, 0.6);
      if (this.poise <= 0) { this.poise = this.cfg.poise; if (!this.boss || this.state !== S.attack) this.setState(S.stagger); }
      if (this.type === 'wraith' && Math.random() < 0.35) this.blinkAway(5);
      if (!this.target) this.target = attackerId;
      if (this.state === S.idle) this.setState(S.chase);
      return true;
    }
    blinkAway(dist) {
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * 6.28, x = this.pos.x + Math.cos(a) * dist, z = this.pos.z + Math.sin(a) * dist;
        if (x > 1500 ? W.walkable(x, z) : true) { HC.Game.fx('dust', this.pos.clone().setY(this.pos.y + 1)); this.pos.set(x, this.pos.y, z); return; }
      }
    }
    hostUpdate(dt, players) {
      this.stateT += dt;
      if (this.type === 'watcher') return this.watcherAI(dt, players);
      if (this.boss) return this.bossAI(dt, players);
      const c = this.cfg;
      this.speedNow = 0;
      this.poise = Math.min(c.poise, this.poise + dt * c.poise * 0.15);
      let tp = players.find(p => p.id === this.target && p.alive);
      switch (this.state) {
        case S.hidden: {
          const t = this.nearestPlayer(players, c.aggro);
          if (t) { this.target = t.id; this.setState(S.rise); this.faceTo(t.pos, 1, 100); HC.Game.sound(this.set.voice || 'gurgle', this.pos, 0.9); HC.Game.fx('dust', this.pos.clone().setY(this.pos.y + 0.3)); }
          break;
        }
        case S.rise: if (this.stateT > 1.6) this.setState(S.chase); break;
        case S.idle: {
          const t = this.nearestPlayer(players, c.aggro);
          if (t) { this.target = t.id; this.setState(S.chase); HC.Game.sound(this.set.voice || 'growl', this.pos, 0.8); break; }
          if (this.wander.distanceTo(this.pos) < 0.6 || this.stateT > 8) {
            if (Math.random() < dt * 0.8) { const a = Math.random() * 6.28, r = Math.random() * 6; this.wander.set(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r); this.stateT = 0; }
          } else { this.faceTo(this.wander, dt, 3); this.moveDir(this.wander.x - this.pos.x, this.wander.z - this.pos.z, c.speed * 0.6, dt); }
          break;
        }
        case S.chase: {
          if (!tp) { tp = this.nearestPlayer(players, c.aggro * 1.5); if (tp) this.target = tp.id; else { this.setState(S.ret); break; } }
          const d = tp.pos.distanceTo(this.pos);
          if (this.home.distanceTo(this.pos) > 45 || d > c.aggro * 2.2) { this.setState(S.ret); break; }
          this.faceTo(tp.pos, dt, 8);
          if (c.ranged) {
            if (d < c.keep * 0.6 && this.type === 'arbalist') { if (d < c.range) { this.setState(S.windup); break; } this.moveDir(this.pos.x - tp.pos.x, this.pos.z - tp.pos.z, c.speed, dt); break; }
            if (d < 24 && this.stateT > 0.6) { this.setState(S.aim); break; }
            this.moveDir(tp.pos.x - this.pos.x, tp.pos.z - this.pos.z, c.run, dt);
            break;
          }
          if (d < c.range) { if (c.shield && Math.random() < 0.35) this.setState(S.guard); else this.setState(S.windup); }
          else this.moveDir(tp.pos.x - this.pos.x, tp.pos.z - this.pos.z, d > 6 ? c.run : c.speed * 1.4, dt);
          break;
        }
        case S.aim: {
          if (!tp) { this.setState(S.chase); break; }
          this.faceTo(tp.pos, dt, 6);
          if (this.type === 'wraith') { const side = Math.sin(this.t * 1.3) > 0 ? 1 : -1; this.moveDir(Math.cos(this.yaw) * side, -Math.sin(this.yaw) * side, 1.2, dt); }
          if (this.stateT > c.windup) {
            const from = this.pos.clone().add(new V3(Math.sin(this.yaw) * 0.6, c.h * 0.75, Math.cos(this.yaw) * 0.6));
            const to = tp.pos.clone().setY(tp.pos.y + 1.1), sp = c.ranged === 'bolt' ? 34 : 13;
            const lead = to.clone().addScaledVector(tp.vel || new V3(), from.distanceTo(to) / sp);
            HC.Game.projectile(c.ranged, from, lead.sub(from).normalize().multiplyScalar(sp), c.dmg);
            HC.Game.sound(c.ranged === 'bolt' ? 'swing' : 'fire', this.pos, 0.8);
            this.setState(S.recover);
          }
          break;
        }
        case S.guard:
          if (tp) { this.faceTo(tp.pos, dt, 6); const d = tp.pos.distanceTo(this.pos); if (d > c.range + 0.6) this.moveDir(tp.pos.x - this.pos.x, tp.pos.z - this.pos.z, c.speed * 0.7, dt); }
          if (this.stateT > 1.1 + Math.random() * 0.4) this.setState(S.windup);
          break;
        case S.windup:
          if (tp) this.faceTo(tp.pos, dt, this.stateT < c.windup * 0.7 ? 7 : 1);
          if (this.stateT >= c.windup) { this.setState(S.attack); HC.Game.sound('swing', this.pos); }
          break;
        case S.attack:
          if (this.type === 'hollow' || this.type === 'drowned') this.moveDir(Math.sin(this.yaw), Math.cos(this.yaw), 4, dt);
          this.meleeCheck(players, c.range + 0.3, 1.2, c.dmg);
          if (this.stateT >= c.atk) {
            if (this.type === 'knight' && !this.combo) { this.combo = true; this.setState(S.windup); this.stateT = c.windup * 0.55; }
            else { this.combo = false; this.setState(S.recover); }
          }
          break;
        case S.recover: if (this.stateT >= c.rec) this.setState(S.chase); break;
        case S.stagger: if (this.stateT >= 1.4) this.setState(S.chase); break;
        case S.ret: {
          const t = this.nearestPlayer(players, c.aggro * 0.7);
          if (t) { this.target = t.id; this.setState(S.chase); break; }
          this.faceTo(this.home, dt, 4); this.moveDir(this.home.x - this.pos.x, this.home.z - this.pos.z, c.speed, dt);
          this.hp = Math.min(this.maxHp, this.hp + dt * 20);
          if (this.home.distanceTo(this.pos) < 1) { this.setState(c.ambush ? S.hidden : S.idle); this.target = null; }
          break;
        }
      }
    }
    meleeCheck(players, range, arc, dmg) {
      for (const p of players) {
        if (!p.alive || this.hitPlayers.has(p.id)) continue;
        const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz);
        if (d > range + 0.4 || Math.abs(p.pos.y - this.pos.y) > 3.5) continue;
        if (Math.abs(angDiff(this.yaw, Math.atan2(dx, dz))) > arc && d > this.cfg.r + 0.8) continue;
        this.hitPlayers.add(p.id); HC.Game.hitPlayer(p.id, dmg, this.pos, this.type);
      }
    }
    watcherAI(dt, players) {
      const inForest = p => p.pos.x < -150 && p.pos.x < 1500;
      const cand = players.filter(p => p.alive && inForest(p));
      if (this.state === S.hidden) { this.root.visible = false; if (cand.length && this.stateT > 14) this.relocate(cand[Math.floor(Math.random() * cand.length)], 55); return; }
      const seen = players.some(p => p.alive && p.look !== undefined && this.observedBy(p));
      const tp = this.nearestPlayer(cand, 60);
      if (!tp) { if (this.stateT > 6) this.setState(S.hidden); return; }
      this.target = tp.id;
      const d = tp.pos.distanceTo(this.pos);
      if (seen) {
        if (this.state !== S.freeze) this.setState(S.freeze);
        this.seenT = (this.seenT || 0) + dt;
        if (d > 30 && this.seenT > 3.5) { this.seenT = 0; HC.Game.fx('dust', this.pos.clone().setY(this.pos.y + 1.5)); this.setState(S.hidden); }
        return;
      }
      this.seenT = 0;
      if (this.state !== S.chase) this.setState(S.chase);
      this.faceTo(tp.pos, dt, 20);
      const burst = Math.sin(this.stateT * 5) > -0.2 ? 1 : 0.1;
      this.moveDir(tp.pos.x - this.pos.x, tp.pos.z - this.pos.z, this.cfg.run * burst * (d > 25 ? 2.2 : 1), dt);
      if (d < this.cfg.range) { HC.Game.hitPlayer(tp.id, this.cfg.dmg, this.pos, 'watcher'); HC.Game.sound('screech', this.pos, 1.4); this.relocate(tp, 70); }
    }
    observedBy(p) { const dx = this.pos.x - p.pos.x, dz = this.pos.z - p.pos.z; if (Math.hypot(dx, dz) > 75) return false; return Math.abs(angDiff(p.look, Math.atan2(dx, dz))) < 0.62; }
    relocate(near, dist) {
      const a = Math.random() * Math.PI * 2;
      this.pos.set(Math.min(-170, near.pos.x + Math.cos(a) * dist), 0, Math.max(-400, Math.min(400, near.pos.z + Math.sin(a) * dist)));
      this.pos.y = W.heightAt(this.pos.x, this.pos.z);
      this.setState(S.freeze); this.root.visible = true;
    }
    // ---------------- bosses
    pickAttack(d) {
      const list = this.boss.attacks;
      const ok = list.map((a, i) => [a, i]).filter(([a]) => d >= a.min && d <= a.max && (!a.phase || a.phase <= this.phase) && !(a.once && this.used.has(a.n)));
      if (!ok.length) return -1;
      let tot = ok.reduce((s, [a]) => s + (a.weight || 1), 0), r = Math.random() * tot;
      for (const [a, i] of ok) { r -= (a.weight || 1); if (r <= 0) return i; }
      return ok[0][1];
    }
    bossAI(dt, players) {
      const c = this.cfg; this.speedNow = 0;
      this.poise = Math.min(c.poise, this.poise + dt * 10);
      if (this.state === S.hidden || this.state === S.dead) return;
      if (this.state === S.intro) { if (this.stateT > 5) this.setState(S.chase); return; }
      if (this.state === S.roar) {
        if (this.stateT > 0.2 && !this.roared) { this.roared = true; HC.Game.sound('roar', this.pos, 1.5); HC.Game.fx('ring', this.pos, { r: 14 }); HC.Game.bossPhase(this.type, 2); }
        if (this.stateT > 2.6) this.setState(S.chase);
        return;
      }
      if (this.phase === 1 && this.hp < this.maxHp * 0.5) { this.phase = 2; this.roared = false; this.setState(S.roar); return; }
      let tp = players.find(p => p.id === this.target && p.alive);
      if (!tp || Math.random() < dt * 0.15) { tp = this.nearestPlayer(players, 90); this.target = tp ? tp.id : null; }
      if (!tp) return;
      const d = tp.pos.distanceTo(this.pos), spd = this.phase === 2 ? 1.22 : 1, A = this.A;
      switch (this.state) {
        case S.chase: case S.idle: case S.ret: case S.guard: {
          if (this.state === S.guard) { if (this.stateT > A.a) this.setState(S.chase); else { HC.Game.statuesCreep && HC.Game.statuesCreep(); } break; }
          this.faceTo(tp.pos, dt, 4);
          if (this.stateT > 0.45) {
            const i = this.pickAttack(d);
            if (i >= 0 && (Math.random() < dt * 3.5 || d < 4)) { this.beginAttack(i, players); break; }
          }
          if (d > c.r + 2.6) this.moveDir(tp.pos.x - this.pos.x, tp.pos.z - this.pos.z, (d > 10 ? c.run : c.speed) * spd, dt);
          break;
        }
        case S.windup: {
          this.faceTo(tp.pos, dt, this.stateT < A.w * 0.6 ? 5 : 0.5);
          if (A.kind === 'erupt' && !this.warned) { this.warned = true; (this.targets || []).forEach(p => HC.Game.fx('warn', p, { r: 2.4, life: A.w + 0.2 })); }
          if (this.stateT >= A.w / spd) { this.warned = false; this.setState(S.attack, this.atk); HC.Game.sound(A.kind === 'slam' ? 'heavySwing' : A.anim === 'bell' ? 'bell' : 'swing', this.pos, 1.3); }
          break;
        }
        case S.attack: {
          this.runAttack(A, players, dt);
          if (this.stateT >= A.a) {
            this.done = false;
            const nx = A.next ? this.boss.attacks.findIndex(a => a.n === A.next) : -1;
            if (nx >= 0) this.beginAttack(nx, players); else this.setState(S.recover, this.atk);
          }
          break;
        }
        case S.recover: if (this.stateT >= A.rec / spd) this.setState(S.chase); break;
        case S.stagger: if (this.stateT >= 2.2) this.setState(S.chase); break;
      }
      if (this.ring) {
        this.ring.t += dt; const r = 0.5 + this.ring.t / 1.0 * this.ring.R;
        for (const p of players) { if (!p.alive || this.ring.hit.has(p.id)) continue; if (Math.abs(p.pos.distanceTo(this.ring.p) - r) < 0.8) { this.ring.hit.add(p.id); HC.Game.hitPlayer(p.id, this.ring.dmg, this.ring.p, 'wave'); } }
        if (this.ring.t > 1) this.ring = null;
      }
    }
    beginAttack(i, players) {
      const A = this.boss.attacks[i];
      if (A.once) this.used.add(A.n);
      if (A.kind === 'guard') { this.setState(S.guard, i); return; }
      if (A.kind === 'erupt') this.targets = players.filter(p => p.alive && p.pos.distanceTo(this.pos) < 32).map(p => p.pos.clone());
      this.setState(S.windup, i);
    }
    runAttack(A, players, dt) {
      const fwd = new V3(Math.sin(this.yaw), 0, Math.cos(this.yaw)), mul = this.phase === 2 ? 1.12 : 1;
      if (A.kind === 'melee') this.meleeCheck(players, A.range, A.arc, A.dmg * mul);
      else if (A.kind === 'lunge') { this.moveDir(fwd.x, fwd.z, A.speed, dt); this.meleeCheck(players, this.cfg.r + 1.6, 1.6, A.dmg * mul); }
      else if (this.done) return;
      else if (A.kind === 'slam' && this.stateT > 0.1) {
        this.done = true;
        const fp = this.pos.clone().addScaledVector(fwd, this.cfg.r + 2);
        HC.Game.sound('boom', fp, 1.5); HC.Game.fx('ring', fp, { r: A.ring, life: 1.0 }); HC.Game.fx('dust', fp.clone().setY(fp.y + 0.5)); HC.Game.shake(0.6);
        this.ring = { p: fp, t: 0, hit: new Set(), R: A.ring, dmg: 18 };
        for (const p of players) if (p.alive && p.pos.distanceTo(fp) < A.range * 0.7) { this.ring.hit.add(p.id); HC.Game.hitPlayer(p.id, A.dmg * mul, fp, 'slam'); }
      } else if (A.kind === 'wave' && this.stateT > 0.1) {
        this.done = true;
        HC.Game.sound(A.anim === 'bell' ? 'bell' : 'roar', this.pos, 1.4); HC.Game.fx('ring', this.pos, { r: A.ring, life: 1.0, color: A.color }); HC.Game.shake(0.4);
        this.ring = { p: this.pos.clone(), t: 0, hit: new Set(), R: A.ring, dmg: A.dmg * mul };
      } else if (A.kind === 'erupt' && this.stateT > 0.05) {
        this.done = true;
        (this.targets || []).forEach(ep => { HC.Game.fx('pillar', ep, { r: 2.2, color: A.color }); HC.Game.sound('fire', ep, 1.2); for (const p of players) if (p.alive && p.pos.distanceTo(ep) < 2.4) HC.Game.hitPlayer(p.id, A.dmg * mul, ep, 'fire'); });
      } else if (A.kind === 'volley' && this.stateT > 0.1) {
        this.done = true;
        const tp = players.find(p => p.id === this.target) || players[0];
        if (!tp) return;
        for (let k = 0; k < A.count; k++) {
          const spread = (k - (A.count - 1) / 2) * 0.28;
          const from = this.pos.clone().addScaledVector(fwd, this.cfg.r + 0.5).setY(this.pos.y + (A.proj === 'wave' ? 1.0 : this.cfg.h * 0.7));
          const dir = tp.pos.clone().setY(tp.pos.y + 1).sub(from).normalize().applyAxisAngle(new V3(0, 1, 0), spread);
          HC.Game.projectile(A.proj, from, dir.multiplyScalar(A.proj === 'wave' ? 16 : 12), A.dmg * mul);
        }
      } else if (A.kind === 'summon') { this.done = true; HC.Game.bossSummon(this, A.type, A.count); }
      else if (A.kind === 'blink') {
        this.done = true;
        const tp = players.find(p => p.id === this.target) || players[0];
        if (tp) {
          const behind = tp.pos.clone().add(new V3(-Math.sin(tp.yaw || 0) * 3.5, 0, -Math.cos(tp.yaw || 0) * 3.5));
          if (behind.x < 1500 || W.walkable(behind.x, behind.z)) { HC.Game.fx('dust', this.pos.clone().setY(this.pos.y + 1.5)); this.pos.copy(behind); this.faceTo(tp.pos, 1, 100); HC.Game.sound('whisper', this.pos, 1.2); }
        }
      }
    }
    // ---------------- network
    snap() { return [this.id, +this.pos.x.toFixed(2), +this.pos.z.toFixed(2), +this.yaw.toFixed(2), this.state, +this.stateT.toFixed(2), Math.round(this.hp), this.atk, this.root.visible ? 1 : 0, Math.round(this.speedNow * 10), this.phase, Math.round(this.maxHp)]; }
    applySnap(s) {
      this.netPos.set(s[1], 0, s[2]); this.netYaw = s[3];
      if (s[4] !== this.state) { this.state = s[4]; this.hitPlayers.clear(); }
      this.stateT = s[5]; if (s[6] < this.hp) this.rig.flash = 0.25; this.hp = s[6]; this.atk = s[7];
      this.root.visible = !!s[8]; this.speedNow = s[9] / 10; this.phase = s[10] || 1; this.maxHp = s[11] || this.maxHp;
      if (this.netPos.distanceTo(this.pos) > 8) this.pos.copy(this.netPos);
    }
    clientUpdate(dt) {
      this.stateT += dt;
      this.pos.x = damp(this.pos.x, this.netPos.x, 12, dt); this.pos.z = damp(this.pos.z, this.netPos.z, 12, dt);
      this.yaw += angDiff(this.yaw, this.netYaw) * Math.min(1, dt * 12);
    }
    // ---------------- animation (everyone): pick clips from the state machine
    animate(dt) {
      this.t += dt;
      if (this.state === S.hidden && this.type !== 'watcher') { this.root.visible = false; return; }
      const g = W.heightAt(this.pos.x, this.pos.z);
      this.pos.y = g + (this.cfg.float ? 0.35 + Math.sin(this.t * 1.7) * 0.12 : 0);
      const r = this.rig, set = this.set, fresh = this.animState !== this.state || this.animAtk !== this.atk;
      this.animState = this.state; this.animAtk = this.atk;
      const A = this.A, c = this.cfg;
      r.frozen = false;
      switch (this.state) {
        case S.windup: if (fresh) {
          const clip = this.boss ? (set[A.anim] || set.over) : (this.combo && set.atk2 ? set.atk2 : (c.ranged ? (set.melee || set.atk) : set.atk));
          const wind = this.boss ? A.w / (this.phase === 2 ? 1.22 : 1) : (this.combo ? c.windup * 0.45 : c.windup);
          r.strike(clip, wind, this.boss && A.anim === 'bell' ? 0.85 : 0.45);
        } break;
        case S.attack: break;   // the strike clip carries on through the impact
        case S.aim: if (fresh) { r.play(set.aim, { loop: false, restart: true }); this.aimShot = false; } break;
        case S.recover:
          if (fresh && c.ranged && !this.boss) r.play(set.atk, { loop: false, restart: true, ts: 1.2 });
          else if (this.stateT > 0.35) r.move(0, set);
          break;
        case S.guard:
          if (this.boss) r.play(set.weep, { fade: 0.3 });
          else if (set.guard) r.play(set.guard, { loop: false, fade: 0.15 });
          else r.move(this.speedNow, set);
          break;
        case S.stagger: if (fresh) r.play(set.stagger || set.hit || 'Hit_Chest', { loop: false, restart: true, ts: 0.9 }); break;
        case S.dead: if (fresh) {
          r.play('Death01', { loop: false, restart: true, fade: 0.15 });
          if (this.stateT < 1 && this.type !== 'watcher' && HC.Audio) HC.Audio.play(this.type === 'wraith' ? 'moan' : this.boss ? 'roar' : 'edeath', this.pos, this.boss ? 1.4 : 0.9);
        } break;
        case S.freeze: r.frozen = true; break;
        case S.rise: if (fresh) r.play(set.rise || 'Fixing_Kneeling', { loop: false, restart: true, ts: 0.9 }); break;
        case S.intro: if (fresh) r.play(set.intro || 'Fixing_Kneeling', { loop: false, restart: true, ts: 0.5 }); else if (this.stateT > 3.4) r.play(set.roar || 'Spell_Simple_Enter', { loop: false, ts: 0.7 }); break;
        case S.roar: if (fresh) r.play(set.roar || 'Spell_Simple_Enter', { loop: false, restart: true, ts: 0.6 }); break;
        default: r.move(this.speedNow, set);
      }
      r.update(dt);
      this.root.position.copy(this.pos);
      if (this.state === S.dead) {
        this.deadT += dt;
        if (this.deadT > 4) this.root.position.y -= (this.deadT - 4) * 0.5;
        if (this.deadT > 7) this.root.visible = false;
      } else if (this.type !== 'watcher') { this.deadT = 0; this.root.visible = true; }
      this.root.rotation.y = this.yaw;
      // local footsteps for nearby walking enemies, timed to the animation's foot plants
      const cam = HC.debugCam;
      if (cam && HC.Audio && !c.float && this.state !== S.dead && this.speedNow > 0.2 && this.root.visible &&
          Math.abs(cam.position.x - this.pos.x) + Math.abs(cam.position.z - this.pos.z) < 32 && r.footPlant() === true) {
        const armor = ['knight', 'corvane', 'king', 'sentinel'].includes(this.type);
        HC.Audio.play('step', this.pos, this.boss ? 0.9 : 0.45, { surface: this.pos.x > 1500 ? 'stone' : 'dirt', armor, rate: this.boss ? 0.7 : 1, rev: 0.3 });
      }
      r.hitFlash(dt);
    }
    reset() {
      if (this.type === 'watcher') return;
      this.pos.copy(this.home); this.netPos.copy(this.home); this.hp = this.maxHp; this.target = null; this.deadT = 0; this.phase = 1; this.used.clear(); this.yaw = this.homeYaw;
      this.setState(this.boss || this.cfg.ambush ? S.hidden : S.idle);
      this.root.visible = !(this.boss || this.cfg.ambush);
      this.root.position.copy(this.pos);
    }
    remove() { HC.scene.remove(this.root); }
  }
  HC.Enemy = Enemy;
})();
