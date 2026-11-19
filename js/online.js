// THE HOLLOW CROWN - online accounts: access codes, the one-time Maker claim, usernames, roles and bans.
// Backed by Firebase (anonymous auth + Firestore, enforced by firestore.rules) when js/firebase-config.js is
// filled in; otherwise a LOCAL TEST MODE that keeps the same data in this browser's localStorage.
(function () {
  const O = HC.Online = { mode: 'offline', uid: null, ready: false };
  const MAKER_CODE = 'Admin';
  const PERM = 9e15;                                  // "permanent" ban timestamp
  O.PERM = PERM;
  O.MAKER_CODE = MAKER_CODE;
  const wrong = () => { const e = new Error('wrong'); e.code = 'wrong'; return e; };
  const err = (code, msg) => { const e = new Error(msg || code); e.code = code; return e; };
  O.validCode = c => /^[A-Za-z0-9_-]{3,32}$/.test(c);
  O.validName = n => /^[A-Za-z0-9 _-]{3,14}$/.test(n) && n.trim() === n;
  const newUser = (uid, o) => Object.assign({ uid, name: '', nameLower: '', admin: false, role: '', via: '', banUntil: 0, banReason: '', bannedBy: '', mutedUntil: 0, created: Date.now() }, o);
  O.isBanned = u => !!u && u.banUntil > Date.now();

  // ------------------------------------------------------------------ Firebase backend
  function firebaseBackend(cfg) {
    const app = firebase.initializeApp(cfg);
    const auth = firebase.auth(), db = firebase.firestore();
    const doc = p => db.doc(p), col = p => db.collection(p);
    const data = s => s.exists ? Object.assign({ id: s.id }, s.data()) : null;
    const inc = firebase.firestore.FieldValue.increment;
    const B = {
      async init() {
        await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        const user = await new Promise(res => { const off = auth.onAuthStateChanged(u => { off(); res(u); }); });
        return (user || (await auth.signInAnonymously()).user).uid;
      },
      get: async p => data(await doc(p).get()),
      list: async c => (await col(c).get()).docs.map(data),
      watch(p, cb) { return doc(p).onSnapshot(s => cb(data(s)), () => { }); },
      watchCol(c, cb) { return col(c).onSnapshot(q => cb(q.docs.map(data)), () => { }); },
      async claimMaker(uid, self) {
        const b = db.batch();
        b.set(doc('meta/maker'), { uid, at: Date.now() });
        if (self) b.update(doc('users/' + uid), { admin: true, via: 'maker' });
        else b.set(doc('users/' + uid), newUser(uid, { admin: true, via: 'maker' }));
        await b.commit();
      },
      async redeem(uid, code, c, self) {
        const b = db.batch();
        b.update(doc('codes/' + code), { uses: inc(1) });
        const grant = { admin: (self && self.admin) || c.kind === 'admin', role: c.role || (self ? self.role : ''), via: code };
        if (self) b.update(doc('users/' + uid), grant); else b.set(doc('users/' + uid), newUser(uid, grant));
        await b.commit();
      },
      async setName(uid, name) {
        const b = db.batch();
        b.set(doc('names/' + name.toLowerCase()), { uid });
        b.update(doc('users/' + uid), { name, nameLower: name.toLowerCase() });
        await b.commit();
      },
      update: (p, patch) => doc(p).update(patch),
      set: (p, v) => doc(p).set(v),
      del: p => doc(p).delete(),
      add: async (c, v) => (await col(c).add(v)).id,
      watchQuery(c, field, val, cb) { return col(c).where(field, '==', val).onSnapshot(q => cb(q.docs.map(data)), e => console.warn('watch', c, e)); },
    };
    return B;
  }

  // ------------------------------------------------------------------ local test backend (one browser)
  function localBackend() {
    const KEY = 'hc_localdb_v1';
    const dev = new URLSearchParams(location.search).get('device') || 'main';
    const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
    const save = d => localStorage.setItem(KEY, JSON.stringify(d));
    const at = (d, p) => { const [c, id] = p.split('/'); d[c] = d[c] || {}; return [d[c], id]; };
    const listeners = new Set();
    const fire = () => listeners.forEach(f => f());
    addEventListener('storage', e => { if (e.key === KEY) fire(); });
    let uidCache;
    return {
      async init() {
        const k = 'hc_local_uid_' + dev;
        uidCache = localStorage.getItem(k);
        if (!uidCache) { uidCache = 'local-' + dev + '-' + Math.random().toString(36).slice(2, 10); localStorage.setItem(k, uidCache); }
        return uidCache;
      },
      async get(p) { const [c, id] = at(load(), p); return c[id] ? Object.assign({ id }, c[id]) : null; },
      async list(c) { const d = load(); return Object.entries(d[c] || {}).map(([id, v]) => Object.assign({ id }, v)); },
      watch(p, cb) { const f = async () => cb(await this.get(p)); listeners.add(f); f(); return () => listeners.delete(f); },
      watchCol(c, cb) { const f = async () => cb(await this.list(c)); listeners.add(f); f(); return () => listeners.delete(f); },
      async claimMaker(uid, self) {
        const d = load(); d.meta = d.meta || {};
        if (d.meta.maker) throw wrong();
        d.meta.maker = { uid, at: Date.now() };
        d.users = d.users || {};
        d.users[uid] = self ? Object.assign(d.users[uid], { admin: true, via: 'maker' }) : newUser(uid, { admin: true, via: 'maker' });
        save(d); fire();
      },
      async redeem(uid, code, c, self) {
        const d = load(); const cur = (d.codes || {})[code];
        if (!cur || cur.uses >= cur.maxUses) throw wrong();
        cur.uses++;
        d.users = d.users || {};
        const grant = { admin: (self && self.admin) || cur.kind === 'admin', role: cur.role || (self ? self.role : ''), via: code };
        d.users[uid] = self ? Object.assign(d.users[uid], grant) : newUser(uid, grant);
        save(d); fire();
      },
      async setName(uid, name) {
        const d = load(); d.names = d.names || {};
        if (d.names[name.toLowerCase()]) throw err('taken');
        d.names[name.toLowerCase()] = { uid };
        Object.assign(d.users[uid], { name, nameLower: name.toLowerCase() });
        save(d); fire();
      },
      async update(p, patch) { const d = load(); const [c, id] = at(d, p); if (!c[id]) throw err('missing'); Object.assign(c[id], patch); save(d); fire(); },
      async set(p, v) { const d = load(); const [c, id] = at(d, p); c[id] = v; save(d); fire(); },
      async del(p) { const d = load(); const [c, id] = at(d, p); delete c[id]; save(d); fire(); },
      async add(c, v) { const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8); await this.set(c + '/' + id, v); return id; },
      watchQuery(c, field, val, cb) { const f = async () => cb((await this.list(c)).filter(x => x[field] === val)); listeners.add(f); f(); return () => listeners.delete(f); },
    };
  }

  let B;
  O.init = async function () {
    const devLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).has('local');
    if (window.HC_FIREBASE && window.firebase && !devLocal) { B = firebaseBackend(window.HC_FIREBASE); O.mode = 'firebase'; }
    else { B = localBackend(); O.mode = 'local'; }
    O.uid = await B.init();
    O.ready = true;
    return O.uid;
  };

  // ------------------------------------------------------------------ account
  O.self = () => B.get('users/' + O.uid);
  O.getUser = uid => B.get('users/' + uid);
  O.watchSelf = cb => B.watch('users/' + O.uid, cb);
  O.makerUid = async () => { const m = await B.get('meta/maker'); return m ? m.uid : null; };

  // the access gate: "Admin" claims the Maker seat exactly once; anything else must be a live access code
  O.enterCode = async function (code) {
    code = String(code || '').trim();
    const self = await O.self();
    if (code === MAKER_CODE) {
      if (await O.makerUid()) throw wrong();
      try { await B.claimMaker(O.uid, self); } catch (e) { throw wrong(); }
      return { maker: true };
    }
    if (!O.validCode(code)) throw wrong();
    const c = await B.get('codes/' + code);
    if (!c || c.uses >= c.maxUses) throw wrong();
    if (self && self.via === code) throw wrong();
    try { await B.redeem(O.uid, code, c, self); } catch (e) { throw wrong(); }
    return { admin: c.kind === 'admin', role: c.role || '' };
  };
  O.setName = async function (name) {
    name = String(name || '').trim();
    if (!O.validName(name)) throw err('invalid');
    if (await B.get('names/' + name.toLowerCase())) throw err('taken');
    try { await B.setName(O.uid, name); } catch (e) { throw err('taken'); }
  };
  O.findByName = async function (name) {
    const n = await B.get('names/' + String(name).trim().toLowerCase());
    return n ? O.getUser(n.uid) : null;
  };

  // ------------------------------------------------------------------ Maker / admin tools
  O.listUsers = () => B.list('users');
  O.updateUser = (uid, patch) => B.update('users/' + uid, patch);
  O.ban = (uid, minutes, reason, by) => B.update('users/' + uid, { banUntil: minutes ? Date.now() + minutes * 60000 : PERM, banReason: String(reason || '').slice(0, 120), bannedBy: by || '' });
  O.unban = uid => B.update('users/' + uid, { banUntil: 0, banReason: '', bannedBy: '' });
  O.mute = (uid, minutes) => B.update('users/' + uid, { mutedUntil: minutes ? Date.now() + minutes * 60000 : 0 });
  O.revoke = uid => B.del('users/' + uid);

  O.listRoles = () => B.list('roles');
  O.watchRoles = cb => B.watchCol('roles', cb);
  O.saveRole = (id, role) => B.set('roles/' + id, { name: String(role.name).slice(0, 24), color: role.color || '#c9a35a', commands: (role.commands || []).slice(0, 64) });
  O.deleteRole = id => B.del('roles/' + id);

  O.listCodes = () => B.list('codes');
  O.createCode = async function (code, o) {
    code = String(code).trim();
    if (!O.validCode(code)) throw err('invalid', 'Codes are 3-32 letters, digits, - or _.');
    if (code === MAKER_CODE) throw err('invalid', '"Admin" is reserved for the Maker.');
    if (await B.get('codes/' + code)) throw err('taken', 'That code already exists.');
    await B.set('codes/' + code, { kind: o.kind === 'admin' ? 'admin' : 'join', maxUses: Math.max(1, Math.min(100000, o.maxUses | 0)), uses: 0, role: o.role || '', created: Date.now(), by: O.uid });
  };
  O.setCodeUses = (code, maxUses) => B.update('codes/' + code, { maxUses: Math.max(0, maxUses | 0) });
  O.deleteCode = code => B.del('codes/' + code);

  // ------------------------------------------------------------------ public worlds (anyone can drop in)
  // lobbies/{code}: { code, host (uid), hostName, players, max, pvp, at }. The host refreshes it every 15 s;
  // listings older than 45 s are treated as gone (a closed tab cannot delete its own listing).
  O.listLobby = (code, o) => B.set('lobbies/' + code, Object.assign({ code, host: O.uid, at: Date.now() }, o));
  O.unlistLobby = code => B.del('lobbies/' + code).catch(() => { });
  O.publicLobbies = async () => (await B.list('lobbies')).filter(l => Date.now() - (l.at || 0) < 45000 && (l.players || 0) < (l.max || 4));

  // ------------------------------------------------------------------ who is playing where (for commands across servers)
  // presence/{uid}: { uid, name, where ('solo' | lobby code), pid, at } - refreshed every 20 s while in a world
  O.setPresence = o => B.set('presence/' + O.uid, Object.assign({ uid: O.uid, at: Date.now() }, o));
  O.clearPresence = () => B.del('presence/' + O.uid).catch(() => { });
  O.onlinePlayers = async () => (await B.list('presence')).filter(p => Date.now() - (p.at || 0) < 60000);

  // ------------------------------------------------------------------ commands sent to a player in another world
  // rcmds/{id}: { to, from, byName, op, a, at }. The receiver re-checks the sender's rights before applying it.
  O.sendCmd = (to, op, a, byName) => B.add('rcmds', { to, from: O.uid, byName, op, a: a || {}, at: Date.now() });
  O.watchCmds = cb => B.watchQuery('rcmds', 'to', O.uid, cb);
  O.delCmd = id => B.del('rcmds/' + id).catch(() => { });

  // ------------------------------------------------------------------ satchels & the Trading Post
  O.loadInv = () => B.get('inv/' + O.uid);
  O.saveInv = v => B.set('inv/' + O.uid, v);
  O.getInv = uid => B.get('inv/' + uid);
  O.createTrade = t => B.add('trades', t);
  O.tradeStatus = (id, status) => B.update('trades/' + id, { status, at: Date.now() });
  // trades you sent + trades sent to you, merged into one live list
  O.watchTrades = function (cb) {
    let a = [], b = [];
    const emit = () => { const m = new Map(); a.concat(b).forEach(t => m.set(t.id, t)); cb([...m.values()]); };
    const u1 = B.watchQuery('trades', 'from', O.uid, l => { a = l; emit(); });
    const u2 = B.watchQuery('trades', 'to', O.uid, l => { b = l; emit(); });
    return () => { u1 && u1(); u2 && u2(); };
  };
})();
