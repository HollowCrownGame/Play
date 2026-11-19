// THE HOLLOW CROWN - the admin-only 2014 Toyota Corolla E180 EU: a drivable car.
// Model: models/corolla.glb (built by tools/build_car.py) - nodes body, wheel_fl/fr/rl/rr (origin on the axle), steering.
// Car space: +Z = nose, +X = driver's (left) side, metres. Physics: a simple bicycle model with tyre grip, engine power
// falling off with speed, brakes, reverse, a handbrake that lets the rear slide, slopes, and solid walls / props.
(function () {
  const V3 = THREE.Vector3, W = HC.World;
  const L = 2.55, TRACK = 1.22, WHEEL_R = 0.31;         // wheelbase, track, tyre radius (from the model)
  const SEAT = new V3(0.36, 0.5, -0.2);                 // driver's hip point (car space)
  const EYE = new V3(0.36, 1.12, -0.1);
  // the Sitting_Idle_Loop clip puts the hips 0.54 m above and 0.33 m behind the character's root
  const HIP_UP = 0.54, HIP_BACK = 0.33;
  const DOOR = new V3(1.55, 0, -0.1);                   // where you step out (driver's side)
  const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

  class Car {
    constructor(owner) {
      this.owner = owner;
      this.root = new THREE.Group();
      this.body = new THREE.Group(); this.root.add(this.body);
      const m = W.clone('corolla');
      W.applyLowMaterials && W.applyLowMaterials(m);                 // only does anything on the flat / simple graphics settings
      m.traverse(o => {
        if (!o.isMesh) return;
        o.castShadow = true;
        const mt = o.material; if (!mt) return;
        if (/Glass|Lens/.test(mt.name)) { o.material = mt.clone(); o.material.transparent = true; o.material.opacity = /Glass/.test(mt.name) ? 0.38 : 0.55; o.material.depthWrite = false; }
        if (/Headlight|Taillight/.test(mt.name)) { o.material = mt.clone(); this[/Head/.test(mt.name) ? 'headMat' : 'tailMat'] = o.material; }
      });
      this.body.add(m);
      this.wheels = {}; ['fl', 'fr', 'rl', 'rr'].forEach(k => { const w = m.getObjectByName('wheel_' + k); if (w) { w.rotation.order = 'YXZ'; this.wheels[k] = w; } });
      this.steering = m.getObjectByName('steering'); if (this.steering) this.steerQ0 = this.steering.quaternion.clone();
      // headlights: one spot light, on while someone drives
      this.lamp = new THREE.SpotLight(0xfff0d8, 0, 38, 0.6, 0.5, 1.4); this.lamp.position.set(0, 0.75, 2.0);
      this.lamp.target.position.set(0, 0.2, 14); this.body.add(this.lamp); this.body.add(this.lamp.target);
      this.pos = new V3(); this.yaw = 0; this.vel = new THREE.Vector2(); this.steer = 0; this.spin = 0; this.pitch = 0; this.roll = 0; this.lean = 0;
      this.vF = 0; this.slip = 0; this.driven = false; this.hitCd = new Map();
      W.scene.add(this.root);
    }
    place(pos, yaw) { this.pos.copy(pos); this.yaw = yaw; this.vel.set(0, 0); this.settle(1); this.draw(0); }
    fwd() { return new V3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
    left() { return new V3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }
    toWorld(local) { return local.clone().applyEuler(new THREE.Euler(this.pitchX || 0, this.yaw, this.rollZ || 0, 'YXZ')).add(this.root.position); }
    seatWorld() { return this.toWorld(SEAT); }
    // where the seated character's root goes so its hips land on the seat
    driverRoot() { const s = this.seatWorld(); return s.add(new V3(0, -HIP_UP, 0)).addScaledVector(this.fwd(), HIP_BACK); }
    eyeWorld() { return this.toWorld(EYE); }
    doorWorld() { return this.toWorld(DOOR); }
    // dir: +1 moving forward, -1 reversing, 0 any. The nose only stops forward motion and the tail only stops reversing,
    // so a car with its bumper against a rock can always back out.
    blockedAt(p, yaw, dir = 0) {
      const f = new V3(Math.sin(yaw), 0, Math.cos(yaw));
      for (const d of [1.55, 0.6, -0.6, -1.55]) {
        if (dir > 0 && d < -1) continue;
        if (dir < 0 && d > 1) continue;
        const x = p.x + f.x * d, z = p.z + f.z * d;
        if (W.blocked(x, z, 0.85)) return true;
        if (x < 1500 && W.heightAt(x, z) < W.waterAt(x, z) - 0.9) return true;      // deep water stops the car
      }
      return false;
    }
    // input: { throttle: -1..1, steer: -1..1 (+ = right), brake: handbrake bool }. Returns impact speed on a crash.
    update(dt, inp) {
      let crash = 0;
      const steps = Math.max(1, Math.ceil(dt / (1 / 90))), h = dt / steps;
      for (let s = 0; s < steps; s++) crash = Math.max(crash, this.step(h, inp));
      this.draw(dt);
      return crash;
    }
    step(dt, inp) {
      const f = this.fwd(), r = new V3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
      let vF = this.vel.x * f.x + this.vel.y * f.z, vR = this.vel.x * r.x + this.vel.y * r.z;
      const t = inp ? inp.throttle : 0, hb = !!(inp && inp.brake);
      let a = 0;
      if (t > 0.05) a = vF < -0.4 ? 15 * t : Math.min(8.5, 92 / Math.max(1, vF)) * t;              // brake out of reverse, or drive
      else if (t < -0.05) a = vF > 0.4 ? -15 * -t : (vF > -9 ? -4.2 * -t : 0);                     // brake, or reverse (max ~32 km/h)
      else a = -Math.sign(vF) * Math.min(Math.abs(vF) / dt, 1.4);                                    // engine braking + rolling
      a -= 0.0017 * vF * Math.abs(vF);                                                                // air drag: top speed ~ 145 km/h
      a -= 9.8 * Math.sin(this.pitch) * 0.7;                                                          // hills
      if (hb) a -= Math.sign(vF) * Math.min(Math.abs(vF) / dt, 7);
      const inWater = this.pos.x < 1500 && W.heightAt(this.pos.x, this.pos.z) < W.waterAt(this.pos.x, this.pos.z) - 0.1;
      if (inWater) a -= vF * 1.2;
      vF += a * dt;
      // steering: less lock at speed, eased in
      const maxSteer = 0.62 / (1 + Math.abs(vF) / 14);
      this.steer = damp(this.steer, (inp ? inp.steer : 0) * maxSteer, 7, dt);
      let yawRate = -this.steer * vF / L;
      if (hb && Math.abs(vF) > 4) yawRate *= 1.45;                                                    // the rear steps out
      // tyre grip pulls the sideways part of the motion back toward zero (low grip = a slide)
      const grip = hb ? 1.4 : Math.abs(yawRate * vF) > 16 ? 7 : 16;
      vR *= Math.exp(-grip * dt);
      this.slip = Math.abs(vR);
      // the motion keeps its old direction while the body turns: the tyres' grip (above) drags it round next step,
      // so with good grip it follows the nose and on the handbrake the car slides
      this.vel.set(f.x * vF + r.x * vR, f.z * vF + r.z * vR);
      this.yaw += yawRate * dt;
      const np = this.pos.clone(); np.x += this.vel.x * dt; np.z += this.vel.y * dt;
      let crash = 0;
      // if the car is already wedged (a prop spawned on it), let it drive out rather than trapping it
      const dirn = Math.sign(vF);
      if (this.blockedAt(np, this.yaw, dirn) && !this.blockedAt(this.pos, this.yaw, 0)) {
        crash = Math.hypot(this.vel.x, this.vel.y);
        this.vel.multiplyScalar(-0.25); vF = -vF * 0.25;
      } else this.pos.copy(np);
      this.vF = vF;
      this.spin += vF / WHEEL_R * dt;
      this.settle(dt);
      return crash;
    }
    // sit on the terrain: height from the four tyre contact points, pitch and roll from their differences
    settle(dt) {
      const f = this.fwd(), l = this.left(), H = (df, dl) => { const x = this.pos.x + f.x * df + l.x * dl, z = this.pos.z + f.z * df + l.z * dl; return W.heightAt(x, z); };
      const fl = H(1.27, TRACK / 2), fr = H(1.27, -TRACK / 2), rl = H(-1.29, TRACK / 2), rr = H(-1.29, -TRACK / 2);
      const y = (fl + fr + rl + rr) / 4;
      this.pos.y = dt >= 1 ? y : damp(this.pos.y, y, 18, dt);
      this.pitch = damp(this.pitch, Math.atan2((fl + fr) / 2 - (rl + rr) / 2, L), dt >= 1 ? 1e3 : 12, dt);
      this.roll = damp(this.roll, Math.atan2((fl + rl) / 2 - (fr + rr) / 2, TRACK), dt >= 1 ? 1e3 : 12, dt);
    }
    draw(dt) {
      // body leans out of turns and squats under acceleration a little
      this.lean = damp(this.lean, -this.steer * this.vF * 0.012, 6, dt || 1);
      this.pitchX = -this.pitch; this.rollZ = this.roll;
      this.root.position.copy(this.pos);
      this.root.rotation.set(this.pitchX, this.yaw, this.rollZ, 'YXZ');
      this.body.rotation.z = this.lean;
      for (const [k, w] of Object.entries(this.wheels)) { w.rotation.x = this.spin; w.rotation.y = k[0] === 'f' ? -this.steer : 0; }
      if (this.steering) this.steering.quaternion.copy(this.steerQ0).multiply(new THREE.Quaternion().setFromAxisAngle(new V3(0, 0.42, -0.91).normalize(), this.steer * 7));
      const on = this.driven;
      this.lamp.intensity = on ? 2.2 : 0;
      if (this.headMat) this.headMat.emissiveIntensity = on ? 2.5 : 0.2;
      if (this.tailMat) this.tailMat.emissiveIntensity = on ? (this.braking ? 4 : 1.5) : 0.2;
    }
    // where the hands go on the rim (world space): 10-and-2, turning with the wheel
    handGrips() {
      if (!this.steering) return null;
      this.root.updateMatrixWorld(true);
      const c = this.steering.getWorldPosition(new V3()), ax = new V3(0, 0.42, -0.91).normalize();
      const q = this.steering.getWorldQuaternion(new THREE.Quaternion());
      const out = [];
      for (const side of [1, -1]) {
        const p = new V3(side * 0.165, 0.06, 0).applyAxisAngle(ax, 0).applyQuaternion(q).add(c);
        out.push(p);
      }
      return { left: out[0], right: out[1] };
    }
    // network: [x, y, z, yaw, steer, vF, driven]
    net() { return [+this.pos.x.toFixed(2), +this.pos.y.toFixed(2), +this.pos.z.toFixed(2), +this.yaw.toFixed(3), +this.steer.toFixed(2), +this.vF.toFixed(1), this.driven ? 1 : 0]; }
    applyNet(a, dt) {
      const tp = new V3(a[0], a[1], a[2]);
      if (this.pos.distanceTo(tp) > 8) this.pos.copy(tp); else this.pos.lerp(tp, 1 - Math.exp(-dt * 12));
      this.yaw += HC.angDiff(this.yaw, a[3]) * (1 - Math.exp(-dt * 12));
      this.steer = a[4]; this.vF = a[5]; this.driven = !!a[6];
      this.spin += this.vF / WHEEL_R * dt;
      this.settle(dt); this.draw(dt);
    }
    dispose() { W.scene.remove(this.root); }
  }
  Car.SEAT = SEAT;
  HC.Car = Car;
})();
