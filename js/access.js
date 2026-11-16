// THE HOLLOW CROWN - access gate, the Maker panel, roles and in-game commands.
//  * First visit: enter an access code. "Admin" makes this device the Maker - once, ever; after that it is just "wrong".
//  * Then pick a username (unique, saved to the device's account). Banned accounts see the ban instead of the game.
//  * The Maker (and anyone holding an admin code) gets the Maker Panel: access codes, roles, players, bans.
//  * Roles carry a chosen set of /commands; admins can run every command.
(function () {
  const O = HC.Online, Net = HC.Net;
  const AC = HC.Access = { profile: null, maker: false, roles: {}, peers: new Map(), passed: false };
  const $ = id => document.getElementById(id);
  const show = (id, on = true) => $(id).classList.toggle('hidden', !on);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const G = () => HC.Game, api = () => HC.Game && HC.Game.api;

  // ================================================================ commands
  // net: true -> broadcast as an 'adm' event (host checks permission); account: true -> writes the online account
  const CMDS = AC.COMMANDS = {
    announce: { args: '<message>', desc: 'Banner + chat message to everyone', net: true },
    heal: { args: '[player|all]', desc: 'Fully restore health, stamina and flasks', net: true },
    revive: { args: '<player>', desc: 'Lift a fallen player', net: true },
    kill: { args: '<player>', desc: 'Strike a player down', net: true },
    god: { args: '[player]', desc: 'Toggle invulnerability', net: true },
    speed: { args: '<multiplier> [player]', desc: 'Movement speed (1 = normal, max 5)', net: true },
    give: { args: '<player> <ash|flask> <amount>', desc: 'Give ashes or Ember Flasks', net: true },
    tp: { args: '<player>', desc: 'Teleport to a player' },
    bring: { args: '<player|all>', desc: 'Teleport a player to you', net: true },
    spawn: { args: '<enemy> [count]', desc: 'Summon enemies in front of you', net: true },
    clear: { args: '[radius]', desc: 'Destroy enemies around you (default 30 m)', net: true },
    flag: { args: '<key> <on|off>', desc: 'Set a story flag (opens gates, skips bosses...)', net: true },
    kick: { args: '<player> [reason]', desc: 'Remove a player from this journey', net: true },
    mute: { args: '<name> [minutes]', desc: 'Silence a player\'s chat (default 10 min)', account: true },
    unmute: { args: '<name>', desc: 'Lift a mute', account: true },
    tempban: { args: '<name> <minutes> [reason]', desc: 'Ban an account for a while', account: true },
    ban: { args: '<name> [reason]', desc: 'Ban an account forever', account: true },
    unban: { args: '<name>', desc: 'Lift a ban', account: true },
  };
  const FREE = { help: 'List the commands you can use', players: 'Who is in this journey', whoami: 'Your account and role' };

  AC.isAdmin = () => !!AC.profile && (AC.maker || AC.profile.admin) && !O.isBanned(AC.profile);
  AC.role = p => (p && p.role && AC.roles[p.role]) || null;
  AC.can = (cmd, p = AC.profile, maker = AC.maker) => {
    if (FREE[cmd]) return true;
    if (!p || O.isBanned(p)) return false;
    if (maker || p.admin) return true;
    const r = AC.role(p); return !!(r && (r.commands || []).includes(cmd));
  };
  const tagOf = p => p && (p.uid === AC.makerUid ? { tag: 'Maker', color: '#e0b860' } : p.admin ? { tag: 'Admin', color: '#d07050' } : AC.role(p) ? { tag: AC.role(p).name, color: AC.role(p).color } : null);

  function sys(text) { const a = api(); if (a) a.chatLine('*', text, 'System', '#8a8273'); consoleLog(text); }

  // in-game player lookup by (prefix of) name
  function findPlayers(q, allowAll) {
    const list = [...(G() ? G().players.values() : [])];
    if (!q) return [];
    if (allowAll && q.toLowerCase() === 'all') return list;
    const ql = q.toLowerCase();
    const exact = list.filter(p => p.name.toLowerCase() === ql);
    return exact.length ? exact : list.filter(p => p.name.toLowerCase().startsWith(ql)).slice(0, 1);
  }

  // entry point for chat text and the panel console
  AC.chat = function (text) {
    const a = api(); if (!a) return;
    if (text[0] === '/') return AC.run(text.slice(1));
    if (AC.profile && AC.profile.mutedUntil > Date.now()) { sys(`You are muted for ${fmtLeft(AC.profile.mutedUntil)}.`); return; }
    const t = tagOf(AC.profile) || {};
    G().event({ t: 'chat', from: a.me().name, text: text.slice(0, 120), tag: t.tag || '', color: t.color || '' });
  };

  AC.run = async function (line) {
    const parts = line.trim().split(/\s+/), cmd = (parts.shift() || '').toLowerCase(), a = api();
    if (!cmd) return;
    if (!CMDS[cmd] && !FREE[cmd]) return sys(`Unknown command /${cmd}. Type /help.`);
    if (!AC.can(cmd)) return sys(`You don't have permission to use /${cmd}.`);
    const me = a && a.me();
    try {
      switch (cmd) {
        case 'help': {
          const mine = Object.keys(CMDS).filter(c => AC.can(c));
          sys('Commands: /help /players /whoami' + (mine.length ? ' ' + mine.map(c => '/' + c).join(' ') : ''));
          mine.forEach(c => consoleLog(`/${c} ${CMDS[c].args} - ${CMDS[c].desc}`));
          return;
        }
        case 'players': return sys('In this journey: ' + [...G().players.values()].map(p => p.name).join(', '));
        case 'whoami': { const t = tagOf(AC.profile); return sys(`${AC.profile.name}${t ? ' [' + t.tag + ']' : ''}${O.mode === 'local' ? ' (local test mode)' : ''}`); }
        case 'tp': {
          const p = findPlayers(parts[0])[0]; if (!p || !me) return sys('No such player here.');
          me.pos.copy(p.pos); return sys(`Teleported to ${p.name}.`);
        }
        case 'mute': case 'unmute': case 'ban': case 'tempban': case 'unban': return accountCmd(cmd, parts);
      }
      // game commands - resolve targets locally, the host re-checks permission before applying
      if (!me) return sys('Start a journey first.');
      const e = { t: 'adm', op: cmd, by: me.name, byPid: Net.pid, pos: [me.pos.x, me.pos.y, me.pos.z], yaw: me.yaw };
      const need = (q, all) => { const t = findPlayers(q, all); if (!t.length) throw new Error('No such player here.'); return t.map(p => p.id); };
      switch (cmd) {
        case 'announce': if (!parts.length) throw new Error('Usage: /announce <message>'); e.text = parts.join(' ').slice(0, 140); break;
        case 'heal': case 'god': e.targets = parts[0] ? need(parts[0], true) : [Net.pid]; break;
        case 'revive': case 'kill': case 'bring': e.targets = need(parts[0], cmd !== 'kill'); break;
        case 'speed': { const m = parseFloat(parts[0]); if (!(m > 0)) throw new Error('Usage: /speed <multiplier> [player]'); e.mul = Math.min(5, m); e.targets = parts[1] ? need(parts[1], true) : [Net.pid]; break; }
        case 'give': {
          const what = (parts[1] || '').toLowerCase(), n = parseInt(parts[2] || '1');
          if (!['ash', 'ashes', 'flask', 'flasks'].includes(what) || !(n > 0)) throw new Error('Usage: /give <player> <ash|flask> <amount>');
          e.targets = need(parts[0], true); e.what = what.startsWith('ash') ? 'ash' : 'flask'; e.n = Math.min(n, what.startsWith('ash') ? 1e6 : 20); break;
        }
        case 'spawn': {
          const type = (parts[0] || '').toLowerCase(), types = Object.keys(HC.ETYPES || {}).filter(k => !HC.ETYPES[k].boss);
          if (!HC.ETYPES || !HC.ETYPES[type]) throw new Error('Enemies: ' + types.join(', '));
          e.type = type; e.n = Math.max(1, Math.min(10, parseInt(parts[1] || '1'))); break;
        }
        case 'clear': e.r = Math.max(1, Math.min(300, parseFloat(parts[0] || '30'))); break;
        case 'flag': if (!parts[0]) throw new Error('Usage: /flag <key> <on|off>'); e.k = parts[0]; e.v = !/^(off|false|0)$/i.test(parts[1] || 'on'); break;
        case 'kick': e.targets = need(parts[0]); e.reason = parts.slice(1).join(' ').slice(0, 100); if (e.targets.includes(Net.pid)) throw new Error('You cannot kick yourself.'); break;
      }
      G().event(e);
    } catch (err) { sys(err.message || String(err)); }
  };

  async function accountCmd(cmd, parts) {
    const name = parts[0]; if (!name) return sys(`Usage: /${cmd} ${CMDS[cmd].args}`);
    const u = await O.findByName(name); if (!u) return sys(`No account named "${name}".`);
    if (u.uid === AC.makerUid && cmd !== 'unmute' && cmd !== 'unban') return sys('The Maker cannot be punished.');
    if (u.admin && !AC.maker && ['ban', 'tempban', 'mute'].includes(cmd)) return sys('Only the Maker can punish an admin.');
    try {
      if (cmd === 'mute') { const m = parseFloat(parts[1] || '10'); await O.mute(u.uid, m); sys(`${u.name} is muted for ${m} min.`); }
      if (cmd === 'unmute') { await O.mute(u.uid, 0); sys(`${u.name} can speak again.`); }
      if (cmd === 'tempban') { const m = parseFloat(parts[1]); if (!(m > 0)) return sys('Usage: /tempban <name> <minutes> [reason]'); await O.ban(u.uid, m, parts.slice(2).join(' '), AC.profile.name); sys(`${u.name} is banned for ${fmtMin(m)}.`); bootOnline(u, 'ban'); }
      if (cmd === 'ban') { await O.ban(u.uid, 0, parts.slice(1).join(' '), AC.profile.name); sys(`${u.name} is banned forever.`); bootOnline(u, 'ban'); }
      if (cmd === 'unban') { await O.unban(u.uid); sys(`${u.name} is no longer banned.`); }
    } catch (e) { sys('The online service refused that (' + (e.code || e.message) + ').'); }
  }
  // remove a freshly banned player from the current journey right away
  function bootOnline(u, why) {
    const p = [...(G() ? G().players.values() : [])].find(p => p.name.toLowerCase() === u.nameLower);
    const me = api() && api().me();
    if (p && me && p.id !== Net.pid) G().event({ t: 'adm', op: 'kick', by: me.name, byPid: Net.pid, targets: [p.id], reason: why === 'ban' ? 'banned' : '', pos: [0, 0, 0] });
  }

  // applied on every machine (host already verified the sender)
  AC.apply = function (e) {
    const a = api(); if (!a) return;
    const me = a.me(), mine = (e.targets || []).includes(Net.pid);
    const at = new THREE.Vector3(e.pos[0], e.pos[1], e.pos[2]);
    switch (e.op) {
      case 'announce': a.areaBanner(e.text); a.chatLine(e.by, e.text, 'Announcement', '#e0b860'); break;
      case 'heal': if (mine && me) { me.hp = me.maxHp; me.st = me.maxSt; me.flasks = me.maxFlasks; a.message(`${e.by} restored you.`); } break;
      case 'revive': if (mine && me && me.downed) a.revived(e.by); break;
      case 'kill': if (mine && me) { me.god = false; a.receiveDamage(1e9, at, 'admin'); } break;
      case 'god': if (mine && me) { me.god = !me.god; a.message(me.god ? 'You cannot be harmed.' : 'You are mortal again.'); } break;
      case 'speed': if (mine && me) { me.speedMul = e.mul; a.message(`Speed x${e.mul}.`); } break;
      case 'give': if (mine && me) { if (e.what === 'ash') { me.ash += e.n; a.floatText(`+${e.n} ashes`); } else { me.maxFlasks += e.n; me.flasks += e.n; a.message(`${e.by} gave you ${e.n} Ember Flask${e.n > 1 ? 's' : ''}.`); } } break;
      case 'bring': if (mine && me && e.byPid !== Net.pid) { me.pos.set(at.x + (Math.random() - 0.5) * 2, at.y, at.z + (Math.random() - 0.5) * 2); a.message(`${e.by} summoned you.`); } break;
      case 'spawn':
        if (Net.isHost()) for (let i = 0; i < e.n; i++) {
          const ang = (e.yaw || 0) + (i - (e.n - 1) / 2) * 0.35, d = 5;
          const x = at.x + Math.sin(ang) * d, z = at.z + Math.cos(ang) * d;
          const y = x > 1500 ? at.y : HC.World.heightAt(x, z);
          G().event({ t: 'spawn', id: 'adm' + Date.now().toString(36) + i, type: e.type, pos: [x, y, z] });
        }
        break;
      case 'clear':
        if (Net.isHost()) G().enemies.forEach(en => { if (en.alive && !en.boss && en.pos.distanceTo(at) < e.r) en.takeHit(1e9, 1e9, at, e.byPid); });
        break;
      case 'flag': if (Net.isHost()) G().event({ t: 'flag', k: e.k, v: e.v, msg: `${e.by} bent fate: ${e.k} ${e.v ? 'on' : 'off'}.` }); break;
      case 'kick':
        if (mine) AC.kicked(e.reason === 'banned' ? 'You have been banished by ' + e.by + '.' : `${e.by} removed you from the journey.${e.reason ? ' Reason: ' + e.reason : ''}`);
        else if (Net.mode === 'host') setTimeout(() => Net.conns.forEach(v => { if ((e.targets || []).includes(v.pid)) try { v.conn.close(); } catch (x) { } }), 600);
        break;
    }
    if (e.op !== 'announce' && e.byPid === Net.pid) consoleLog(`/${e.op} done.`);
  };

  AC.kicked = function (text) {
    AC.kickedOut = true;
    try { Net.close(); } catch (e) { }
    if (G()) G().ended = true;
    document.exitPointerLock && document.exitPointerLock();
    $('gateTitle').textContent = 'CAST OUT';
    stepTo('gateKick'); $('kickText').textContent = text;
    show('gate'); show('hud', false);
  };

  // ================================================================ networking hooks (no changes to game.js needed)
  // - clients attach their account id to 'hello'; the host checks it (exists, not banned) before letting them in
  // - the host verifies permission for every 'adm' request against the sender's account + role
  // - clients receiving 'denied' are shown why
  const origSend = Net.send;
  Net.send = function (m) { if (m && m.t === 'hello') m.uid = O.uid; return origSend.call(Net, m); };
  let inner = null;
  Object.defineProperty(Net, 'handler', {
    configurable: true,
    get() { return inner ? wrapped : null; },
    set(f) { inner = f; },
  });
  async function wrapped(m, from) {
    if (!inner) return;
    if (m.t === 'denied') { AC.kicked(m.reason); return; }
    if (Net.mode === 'host' && m.t === 'hello') {
      const u = m.uid ? await O.getUser(String(m.uid)).catch(() => null) : null;
      const why = !u ? 'Your account has no access to this world.' : O.isBanned(u) ? 'You are banished' + (u.banUntil < O.PERM ? ' for ' + fmtLeft(u.banUntil) : '') + '.' : !u.name ? 'Pick a name first.' : null;
      if (why) { Net.sendTo(from, { t: 'denied', reason: why }); setTimeout(() => Net.conns.forEach(v => { if (v.pid === from) try { v.conn.close(); } catch (x) { } }), 500); return; }
      AC.peers.set(from, { uid: u.uid });
      m.name = u.name;                         // the account name is authoritative, not whatever the client typed
    }
    if (Net.mode === 'host' && m.t === 'req' && m.e && m.e.t === 'adm') {
      const peer = AC.peers.get(from), u = peer ? await O.getUser(peer.uid).catch(() => null) : null;
      if (!u || !AC.can(m.e.op, u, u.uid === AC.makerUid) || !CMDS[m.e.op] || !CMDS[m.e.op].net) return;
      m.e.by = u.name; m.e.byPid = from;
    }
    if (Net.mode === 'host' && m.t === 'req' && m.e && m.e.t === 'chat') {
      const peer = AC.peers.get(from), u = peer ? await O.getUser(peer.uid).catch(() => null) : null;
      if (!u || (u.mutedUntil || 0) > Date.now()) return;
      const t = tagOf(u) || {}; m.e.from = u.name; m.e.tag = t.tag || ''; m.e.color = t.color || '';
    }
    if (m.t === 'leave') AC.peers.delete(from);
    inner(m, from);
  }

  // ================================================================ gate
  const fmtMin = m => m >= 1440 ? (m / 1440).toFixed(m % 1440 ? 1 : 0) + ' days' : m >= 60 ? (m / 60).toFixed(m % 60 ? 1 : 0) + ' hours' : Math.round(m) + ' minutes';
  const fmtLeft = t => t >= O.PERM ? 'ever' : fmtMin(Math.max(1, Math.ceil((t - Date.now()) / 60000)));
  function stepTo(id) { ['gateCode', 'gateName', 'gateBan', 'gateKick', 'gateWait'].forEach(s => show(s, s === id)); show('gateLead', id === 'gateCode' || id === 'gateName'); }
  function gateErr(t) { $('gateErr').textContent = t || ''; }

  function route(p) {
    AC.profile = p;
    AC.maker = !!p && p.uid === AC.makerUid;
    renderBadges();
    if (AC.kickedOut) return;
    if (!p && G() && G().started) return AC.kicked('Your access to this world was revoked.');
    if (!p) { AC.passed = false; $('gateTitle').textContent = 'THE HOLLOW CROWN'; stepTo('gateCode'); $('gateLead').textContent = 'The gate is sealed. Speak the word that opens it.'; return gateShow(); }
    if (O.isBanned(p)) {
      AC.passed = false;
      $('gateTitle').textContent = 'BANISHED';
      $('banText').textContent = (p.banUntil >= O.PERM ? 'You are banished forever.' : `You are banished for ${fmtLeft(p.banUntil)}.`) + (p.banReason ? ` Reason: ${p.banReason}` : '') + (p.bannedBy ? ` (by ${p.bannedBy})` : '');
      stepTo('gateBan');
      if (G() && G().started) return AC.kicked($('banText').textContent);
      clearTimeout(AC.banT); if (p.banUntil < O.PERM) AC.banT = setTimeout(() => route(AC.profile), Math.min(2 ** 31 - 1, p.banUntil - Date.now() + 1000));
      return gateShow();
    }
    if (!p.name) { AC.passed = false; $('gateTitle').textContent = 'THE HOLLOW CROWN'; stepTo('gateName'); $('gateLead').textContent = AC.maker ? 'You are the Maker of this world. Choose the name you will be known by.' : 'The gate opens. What are you called, traveler?'; setTimeout(() => $('inUser').focus(), 50); return gateShow(); }
    // through the gate
    $('inName').value = p.name; $('inName').readOnly = true;
    if (!AC.passed) { AC.passed = true; show('gate', false); if (!(G() && (G().started || G().booting)) && $('lobby').classList.contains('hidden')) show('title'); }
  }
  function gateShow() { show('gate'); show('title', false); show('lobby', false); }

  function renderBadges() {
    const p = AC.profile, t = tagOf(p);
    $('whoBadge').innerHTML = p && p.name ? `Signed in as <b>${esc(p.name)}</b>${t ? ` <span class="rtag" style="color:${esc(t.color)}">${esc(t.tag)}</span>` : ''}` : '';
    ['btnMaker', 'btnMaker2'].forEach(id => show(id, AC.isAdmin()));
  }

  $('btnAccess').onclick = async () => {
    const code = $('inAccess').value; gateErr('');
    if (!code.trim()) return gateErr('Enter a code.');
    $('btnAccess').disabled = true;
    try {
      const r = await O.enterCode(code);
      if (r.maker) { AC.makerUid = O.uid; AC.maker = true; }
      $('inAccess').value = '';
      route(await O.self());
      if (r.maker) $('gateLead').textContent = 'You are the Maker of this world. This device holds the crown: do not clear its site data. Choose your name.';
    } catch (e) { gateErr(e.code === 'wrong' ? 'Wrong code.' : 'Could not reach the gate (' + (e.code || e.message) + ').'); }
    $('btnAccess').disabled = false;
  };
  $('inAccess').onkeydown = e => { if (e.key === 'Enter') $('btnAccess').click(); };
  $('btnUser').onclick = async () => {
    const n = $('inUser').value.trim(); gateErr('');
    $('btnUser').disabled = true;
    try { await O.setName(n); route(await O.self()); }
    catch (e) { gateErr(e.code === 'taken' ? 'That name is already taken.' : e.code === 'invalid' ? 'Names are 3-14 letters, digits, spaces, - or _.' : 'Could not save the name (' + (e.code || e.message) + ').'); }
    $('btnUser').disabled = false;
  };
  $('inUser').onkeydown = e => { if (e.key === 'Enter') $('btnUser').click(); };
  $('btnKickOk').onclick = () => location.reload();

  AC.boot = async function () {
    gateShow(); stepTo('gateWait');
    try {
      await O.init();
      $('gateMode').textContent = O.mode === 'local' ? 'LOCAL TEST MODE - accounts, codes and bans live only in this browser. Connect Firebase (see SETUP.md) before sharing the game.' : '';
      AC.makerUid = await O.makerUid();
      O.watchRoles(list => { AC.roles = Object.fromEntries(list.map(r => [r.id, r])); renderBadges(); if (!$('makerPanel').classList.contains('hidden')) renderPanel(); });
      O.watchSelf(async p => { if (!AC.makerUid) AC.makerUid = await O.makerUid(); route(p); });
    } catch (e) {
      console.error(e); stepTo('gateCode'); gateErr('Could not reach the online service. Check your connection and reload.');
    }
  };

  // ================================================================ Maker panel
  let tab = 'players', consoleLines = [];
  function consoleLog(t) { consoleLines.push(t); if (consoleLines.length > 80) consoleLines.shift(); const c = $('mkConsoleLog'); if (c) { c.textContent = consoleLines.join('\n'); c.scrollTop = 1e9; } }
  AC.openPanel = function () {
    if (!AC.isAdmin()) return;
    document.exitPointerLock && document.exitPointerLock();
    show('pause', false); show('makerPanel'); renderPanel();
  };
  AC.closePanel = () => { show('makerPanel', false); if (G() && G().started && !G().ended && api()) api().lock(); };
  $('btnMaker').onclick = AC.openPanel; $('btnMaker2').onclick = AC.openPanel;
  $('mkClose').onclick = AC.closePanel;
  document.querySelectorAll('#makerPanel [data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; renderPanel(); });
  addEventListener('keydown', e => {
    if (e.code === 'F8' && AC.isAdmin()) { e.preventDefault(); $('makerPanel').classList.contains('hidden') ? AC.openPanel() : AC.closePanel(); }
    else if (e.code === 'Escape' && !$('makerPanel').classList.contains('hidden')) { e.preventDefault(); AC.closePanel(); }
  });

  const roleOptions = sel => `<option value="">- none -</option>` + Object.values(AC.roles).map(r => `<option value="${esc(r.id)}" ${r.id === sel ? 'selected' : ''}>${esc(r.name)}</option>`).join('');
  const randCode = () => Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
  const busy = async (fn) => { try { await fn(); } catch (e) { alertMsg(e.message === 'wrong' ? 'Refused.' : (e.message || String(e))); } renderPanel(); };
  function alertMsg(t) { $('mkMsg').textContent = t; clearTimeout(AC.msgT); AC.msgT = setTimeout(() => $('mkMsg').textContent = '', 5000); }

  async function renderPanel() {
    document.querySelectorAll('#makerPanel [data-tab]').forEach(b => b.classList.toggle('sel', b.dataset.tab === tab));
    const body = $('mkBody');
    if (tab === 'players') {
      const users = (await O.listUsers().catch(() => [])).sort((a, b) => (b.uid === AC.makerUid) - (a.uid === AC.makerUid) || (b.admin - a.admin) || String(a.name).localeCompare(b.name));
      const online = new Set([...(G() ? G().players.values() : [])].map(p => p.name.toLowerCase()));
      body.innerHTML = `<input id="mkFind" placeholder="Search players..." value="${esc(AC.find || '')}">
        <table class="mk"><tr><th>Player</th><th>Rank / role</th><th>Status</th><th>Actions</th></tr>${users.filter(u => !AC.find || String(u.name).toLowerCase().includes(AC.find.toLowerCase())).map(u => {
        const isMaker = u.uid === AC.makerUid, me = u.uid === O.uid, banned = O.isBanned(u), muted = (u.mutedUntil || 0) > Date.now();
        const status = [online.has(String(u.nameLower)) ? '<span class="on">online</span>' : '', banned ? `<span class="bad">banned ${u.banUntil >= O.PERM ? 'forever' : fmtLeft(u.banUntil)}</span>` : '', muted ? `<span class="warn">muted ${fmtLeft(u.mutedUntil)}</span>` : ''].filter(Boolean).join(' ') || '<span class="small">-</span>';
        const rank = isMaker ? '<b class="maker">Maker</b>' : `${AC.maker ? `<label class="chk"><input type="checkbox" data-admin="${esc(u.uid)}" ${u.admin ? 'checked' : ''}> Admin</label>` : (u.admin ? '<b>Admin</b>' : '')}
            <select data-role="${esc(u.uid)}">${roleOptions(u.role)}</select>`;
        const canPunish = !isMaker && !me && (AC.maker || !u.admin);
        const acts = !canPunish ? '' : `<input class="num" type="number" min="1" value="60" data-mins="${esc(u.uid)}" title="minutes">
            <button data-act="tempban" data-u="${esc(u.uid)}">Temp ban</button><button data-act="ban" data-u="${esc(u.uid)}">Ban</button>
            ${banned ? `<button data-act="unban" data-u="${esc(u.uid)}">Unban</button>` : ''}
            <button data-act="${muted ? 'unmute' : 'mute'}" data-u="${esc(u.uid)}">${muted ? 'Unmute' : 'Mute'}</button>
            <button data-act="revoke" data-u="${esc(u.uid)}" title="Delete the account; they need a new code">Revoke</button>`;
        return `<tr><td>${esc(u.name || '(no name yet)')}${me ? ' <span class="small">(you)</span>' : ''}</td><td>${rank}</td><td>${status}</td><td>${acts}</td></tr>`;
      }).join('')}</table>`;
      $('mkFind').oninput = e => { AC.find = e.target.value; clearTimeout(AC.findT); AC.findT = setTimeout(renderPanel, 250); };
      body.querySelectorAll('[data-role]').forEach(s => s.onchange = () => busy(() => O.updateUser(s.dataset.role, { role: s.value })));
      body.querySelectorAll('[data-admin]').forEach(c => c.onchange = () => busy(() => O.updateUser(c.dataset.admin, { admin: c.checked })));
      body.querySelectorAll('[data-act]').forEach(b => b.onclick = () => busy(async () => {
        const uid = b.dataset.u, u = users.find(x => x.uid === uid), mins = parseFloat((body.querySelector(`[data-mins="${uid}"]`) || {}).value) || 60;
        const act = b.dataset.act;
        if (act === 'tempban' || act === 'ban') { const why = prompt(`Reason for banning ${u.name}? (optional)`) || ''; await O.ban(uid, act === 'ban' ? 0 : mins, why, AC.profile.name); bootOnline(u, 'ban'); alertMsg(`${u.name} banned ${act === 'ban' ? 'forever' : 'for ' + fmtMin(mins)}.`); }
        if (act === 'unban') await O.unban(uid);
        if (act === 'mute') await O.mute(uid, mins);
        if (act === 'unmute') await O.mute(uid, 0);
        if (act === 'revoke' && confirm(`Revoke ${u.name}'s access? They will need a new code (their name stays reserved).`)) { await O.revoke(uid); bootOnline(u, 'ban'); }
      }));
    }
    if (tab === 'roles') {
      const roles = Object.values(AC.roles), cmds = Object.keys(CMDS);
      body.innerHTML = `<p class="small">A role is a set of commands. Give roles to players on the Players tab. Admins can always use everything.</p>
        <div class="rolenew"><input id="mkRoleName" placeholder="New role name (e.g. Moderator)" maxlength="24"> <input id="mkRoleColor" type="color" value="#7aa0d0"> <button id="mkRoleAdd">Create role</button></div>
        ${roles.map(r => `<div class="role" data-r="${esc(r.id)}"><div class="rhead"><input class="rname" value="${esc(r.name)}" maxlength="24"> <input class="rcolor" type="color" value="${esc(r.color || '#c9a35a')}">
          <button class="rsave">Save</button> <button class="rdel">Delete</button></div>
          <div class="rcmds">${cmds.map(c => `<label class="chk" title="${esc(CMDS[c].desc)}"><input type="checkbox" value="${c}" ${(r.commands || []).includes(c) ? 'checked' : ''}> /${c}</label>`).join('')}</div></div>`).join('') || '<p class="small">No roles yet.</p>'}`;
      $('mkRoleAdd').onclick = () => busy(async () => {
        const name = $('mkRoleName').value.trim(); if (!name) throw new Error('Name the role first.');
        const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'role';
        await O.saveRole(AC.roles[id] ? id + '-' + Date.now().toString(36) : id, { name, color: $('mkRoleColor').value, commands: [] });
      });
      body.querySelectorAll('.role').forEach(el => {
        const id = el.dataset.r;
        el.querySelector('.rsave').onclick = () => busy(async () => { await O.saveRole(id, { name: el.querySelector('.rname').value.trim() || 'Role', color: el.querySelector('.rcolor').value, commands: [...el.querySelectorAll('.rcmds input:checked')].map(i => i.value) }); alertMsg('Role saved.'); });
        el.querySelector('.rdel').onclick = () => busy(async () => { if (confirm('Delete this role? Players holding it lose its commands.')) await O.deleteRole(id); });
      });
    }
    if (tab === 'codes') {
      const codes = (await O.listCodes().catch(() => [])).sort((a, b) => b.created - a.created);
      const adminLeft = codes.filter(c => c.kind === 'admin').reduce((s, c) => s + Math.max(0, c.maxUses - c.uses), 0);
      body.innerHTML = `<p class="small">New players need a <b>player code</b> once. <b>Admin codes</b> make the person who enters them an admin. Each code works for as many uses as you allow. "Admin" (the Maker code) has already been used and can never be used again.</p>
        <div class="codenew"><input id="mkCode" placeholder="Code" maxlength="32" value="${randCode()}"> <button id="mkRand" title="Random code">Random</button>
          <select id="mkKind"><option value="join">Player code</option><option value="admin">Admin code</option></select>
          uses <input id="mkUses" class="num" type="number" min="1" value="1">
          role <select id="mkCodeRole">${roleOptions('')}</select> <button id="mkCodeAdd">Create</button></div>
        <p>Admin codes remaining: <b>${adminLeft}</b></p>
        <table class="mk"><tr><th>Code</th><th>Type</th><th>Used</th><th>Max uses</th><th>Role</th><th></th></tr>${codes.map(c => `<tr>
          <td class="mono">${esc(c.id)}</td><td>${c.kind === 'admin' ? '<b class="maker">Admin</b>' : 'Player'}</td><td>${c.uses}</td>
          <td><input class="num" type="number" min="0" value="${c.maxUses}" data-max="${esc(c.id)}"></td><td>${esc((AC.roles[c.role] || {}).name || '')}</td>
          <td><button data-copy="${esc(c.id)}">Copy</button> <button data-del="${esc(c.id)}">Delete</button></td></tr>`).join('')}</table>`;
      $('mkRand').onclick = () => $('mkCode').value = randCode();
      $('mkCodeAdd').onclick = () => busy(async () => { await O.createCode($('mkCode').value, { kind: $('mkKind').value, maxUses: parseInt($('mkUses').value) || 1, role: $('mkCodeRole').value }); alertMsg('Code created.'); });
      body.querySelectorAll('[data-max]').forEach(i => i.onchange = () => busy(() => O.setCodeUses(i.dataset.max, parseInt(i.value) || 0)));
      body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => busy(() => O.deleteCode(b.dataset.del)));
      body.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => { try { navigator.clipboard.writeText(b.dataset.copy); alertMsg('Copied.'); } catch (e) { } });
    }
    if (tab === 'console') {
      body.innerHTML = `<p class="small">Run any command (also works in chat: press Enter in-game and type /help). Commands that affect the world need an active journey.</p>
        <pre id="mkConsoleLog" class="console"></pre><input id="mkConsoleIn" placeholder="/help" autocomplete="off">
        <table class="mk small">${Object.entries(CMDS).map(([c, d]) => `<tr><td class="mono">/${c} ${esc(d.args)}</td><td>${esc(d.desc)}</td></tr>`).join('')}</table>`;
      $('mkConsoleLog').textContent = consoleLines.join('\n');
      $('mkConsoleIn').onkeydown = e => { if (e.key === 'Enter') { const v = e.target.value.trim(); e.target.value = ''; if (v) { consoleLog('> ' + v); if (api()) AC.chat(v[0] === '/' ? v : '/' + v); else AC.run(v.replace(/^\//, '')); } } };
      $('mkConsoleIn').focus();
    }
  }

  AC.boot();
})();
