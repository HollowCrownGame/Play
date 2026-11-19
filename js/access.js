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
  // target: players (pick players in the menu) | account (any account by name) | none (world).
  // net: true -> sent as an 'adm' event that the co-op host checks against the sender's permissions.
  // params: inputs shown next to the command's button in the menu (and the order of extra words in chat).
  const num = (k, label, def, min, max) => ({ k, type: 'num', label, def, min, max });
  const txt = (k, label, def = '') => ({ k, type: 'text', label, def });
  const sel = (k, label, opts, def) => ({ k, type: 'select', label, opts, def });
  const P = { target: 'players', net: true }, WD = { target: 'none', net: true }, ACC = { target: 'account', account: true };
  const itemOpts = () => Object.entries(HC.Items.BASES).map(([k, b]) => [k, b.name]);
  const rarOpts = () => HC.Items.RAR.map((r, i) => [String(i), r.name]);
  const enemyOpts = () => Object.keys(HC.ETYPES || {}).filter(k => !HC.ETYPES[k].boss).map(k => [k, k]);
  const relicOpts = () => Object.entries(HC.RELICS || {}).map(([k, r]) => [k, r[0]]);
  const CMDS = AC.COMMANDS = {
    // ---- players
    heal: { ...P, cat: 'Players', label: 'Heal', desc: 'Full health, stamina and flasks; clears burning, blindness and confusion', self: true },
    revive: { ...P, cat: 'Players', label: 'Revive', desc: 'Lift a fallen player' },
    kill: { ...P, cat: 'Players', label: 'Kill', desc: 'Strike a player down' },
    god: { ...P, cat: 'Players', label: 'God mode', desc: 'Toggle: cannot be harmed', self: true },
    speed: { ...P, cat: 'Players', label: 'Speed', desc: 'Movement speed multiplier (1 = normal)', self: true, params: [num('mul', 'x', 2, 0.1, 5)] },
    power: { ...P, cat: 'Players', label: 'Power', desc: 'Damage multiplier (1 = normal)', self: true, params: [num('mul', 'x', 3, 1, 50)] },
    stamina: { ...P, cat: 'Players', label: 'Endless stamina', desc: 'Toggle: stamina never runs out', self: true },
    size: { ...P, cat: 'Players', label: 'Size', desc: 'Make a player giant or tiny (1 = normal)', self: true, params: [num('mul', 'x', 1.6, 0.3, 3)] },
    invisible: { ...P, cat: 'Players', label: 'Invisible', desc: 'Toggle: other players cannot see them', self: true },
    freeze: { ...P, cat: 'Players', label: 'Freeze', desc: 'Toggle: the player cannot move or attack' },
    burn: { ...P, cat: 'Players', label: 'Set on fire', desc: 'Burns for a few seconds', params: [num('s', 'sec', 6, 1, 60)] },
    smite: { ...P, cat: 'Players', label: 'Smite', desc: 'A pillar of fire: half their health' },
    blind: { ...P, cat: 'Players', label: 'Blind', desc: 'Black out their screen', params: [num('s', 'sec', 5, 1, 30)] },
    confuse: { ...P, cat: 'Players', label: 'Confuse', desc: 'Reverse their movement controls', params: [num('s', 'sec', 10, 1, 60)] },
    tp: { target: 'players', cat: 'Players', label: 'Go to', desc: 'Teleport yourself to a player', one: true },
    bring: { ...P, cat: 'Players', label: 'Bring', desc: 'Teleport players to you' },
    home: { ...P, cat: 'Players', label: 'Send home', desc: 'Send them back to the Drowned Village' },
    fly: { ...P, cat: 'Players', label: 'Fly', desc: 'Toggle flying: WASD + look to fly, Space up, C down, Shift fast', self: true },
    noclip: { ...P, cat: 'Players', label: 'No-clip', desc: 'Toggle: walk and fly through walls', self: true },
    launch: { ...P, cat: 'Players', label: 'Launch', desc: 'Throw players high into the air', params: [num('h', 'force', 18, 5, 60)] },
    whisper: { ...P, cat: 'Players', label: 'Whisper', desc: 'Private message on their screen', params: [txt('text', 'message')] },
    // ---- items & progress
    giveitem: { ...P, cat: 'Items', label: 'Give item', desc: 'Put an item in their satchel', self: true, params: [sel('item', 'item', itemOpts, 'longbow'), sel('r', 'rarity', rarOpts, '4'), num('n', 'amount', 1, 1, 99)] },
    kit: { ...P, cat: 'Items', label: 'Starter kit', desc: 'Sword, bow, 30 arrows, 3 draughts', self: true },
    clearinv: { ...P, cat: 'Items', label: 'Empty satchel', desc: 'Delete every item they carry', danger: true },
    ash: { ...P, cat: 'Items', label: 'Give ashes', desc: 'Ashes buy levels and items', self: true, params: [num('n', 'amount', 1000, 1, 1000000)] },
    flask: { ...P, cat: 'Items', label: 'Give flasks', desc: 'Extra Ember Flasks', self: true, params: [num('n', 'amount', 1, 1, 20)] },
    relic: { ...P, cat: 'Items', label: 'Give relic', desc: 'Grant a boss relic', self: true, params: [sel('relic', 'relic', relicOpts, 'oathbrand')] },
    setlevel: { ...P, cat: 'Items', label: 'Set level', desc: 'Set level (stats spread evenly)', self: true, params: [num('n', 'level', 20, 1, 300)] },
    giveset: { ...P, cat: 'Items', label: 'Give armor set', desc: 'All four pieces of one armor set', self: true, params: [sel('set', 'set', () => [['leather', 'Leather'], ['hunter', 'Hunter'], ['chain', 'Chainmail'], ['bone', 'Bonewrought'], ['plate', 'Ashen Plate']], 'plate'), sel('r', 'rarity', rarOpts, '3')] },
    giveall: { ...P, cat: 'Items', label: 'Every weapon', desc: 'One of every weapon and shield', self: true, params: [sel('r', 'rarity', rarOpts, '2')] },
    ammo: { ...P, cat: 'Items', label: 'Give arrows', desc: 'Iron and ember arrows', self: true, params: [num('n', 'amount', 60, 1, 999)] },
    embers: { ...P, cat: 'Items', label: 'Unlock embers', desc: 'Every ember can be travelled to', self: true },
    // ---- moderation
    kick: { ...P, cat: 'Moderation', label: 'Kick', desc: 'Remove from this journey', params: [txt('reason', 'reason')] },
    mute: { ...ACC, cat: 'Moderation', label: 'Mute', desc: 'Silence chat', params: [num('m', 'min', 10, 1, 525600)] },
    unmute: { ...ACC, cat: 'Moderation', label: 'Unmute', desc: 'Lift a mute' },
    tempban: { ...ACC, cat: 'Moderation', label: 'Temp ban', desc: 'Ban the account for a while', params: [num('m', 'min', 60, 1, 5256000), txt('reason', 'reason')] },
    ban: { ...ACC, cat: 'Moderation', label: 'Ban', desc: 'Ban the account forever', danger: true, params: [txt('reason', 'reason')] },
    unban: { ...ACC, cat: 'Moderation', label: 'Unban', desc: 'Lift a ban' },
    // ---- ranks (admins only: a role can never hand out roles, or it could promote itself)
    setrole: { ...ACC, cat: 'Ranks', label: 'Give role', desc: 'Give the picked players a role (its commands + name tag). Make roles in the Maker Panel', adminOnly: true,
      params: [sel('role', 'role', () => { const r = Object.values(AC.roles).map(r => [r.id, r.name]); return r.length ? r : [['', '(no roles yet)']]; }, '')] },
    removerole: { ...ACC, cat: 'Ranks', label: 'Remove role', desc: 'Take away their role', adminOnly: true },
    makeadmin: { ...ACC, cat: 'Ranks', label: 'Make admin', desc: 'Every command + the Maker Panel (Maker only)', makerOnly: true, danger: true },
    removeadmin: { ...ACC, cat: 'Ranks', label: 'Remove admin', desc: 'Take away admin (Maker only)', makerOnly: true },
    // ---- world
    announce: { ...WD, cat: 'World', label: 'Announce', desc: 'Banner + chat message to everyone', params: [txt('text', 'message')] },
    spawn: { ...WD, cat: 'World', label: 'Spawn enemies', desc: 'Summon enemies in front of you', params: [sel('type', 'enemy', enemyOpts, 'hollow'), num('n', 'count', 3, 1, 10)] },
    drop: { ...WD, cat: 'World', label: 'Drop item', desc: 'Drop loot in front of you for anyone to take', params: [sel('item', 'item', itemOpts, 'emberblade'), sel('r', 'rarity', rarOpts, '5'), num('n', 'amount', 1, 1, 99)] },
    lootrain: { ...WD, cat: 'World', label: 'Loot rain', desc: 'Scatter random loot around you', params: [num('n', 'items', 8, 1, 30)] },
    clear: { ...WD, cat: 'World', label: 'Clear area', desc: 'Destroy enemies around you', params: [num('r', 'metres', 30, 1, 300)] },
    killall: { ...WD, cat: 'World', label: 'Kill all', desc: 'Destroy every enemy in the world (not bosses)' },
    bosskill: { ...WD, cat: 'World', label: 'Defeat boss', desc: 'Instantly defeat the boss being fought' },
    resetworld: { ...WD, cat: 'World', label: 'Respawn enemies', desc: 'Every enemy comes back' },
    peace: { ...WD, cat: 'World', label: 'Freeze enemies', desc: 'Toggle: enemies stop moving and attacking' },
    slowmo: { ...WD, cat: 'World', label: 'Slow motion', desc: 'Toggle: the whole world at 40% speed' },
    fog: { ...WD, cat: 'World', label: 'Fog', desc: 'Fog thickness (1 = normal)', params: [num('mul', 'x', 0.3, 0.1, 4)] },
    time: { ...WD, cat: 'World', label: 'Set time of day', desc: 'Jump the day/night cycle', params: [sel('tod', 'time', () => [['0.25', 'Dawn'], ['0.5', 'Noon'], ['0.75', 'Dusk'], ['0.0', 'Midnight']], '0.5')] },
    bloodmoon: { ...WD, cat: 'World', label: 'Blood moon', desc: 'Toggle the blood moon (more, faster, deadlier enemies)' },
    clearloot: { ...WD, cat: 'World', label: 'Clear loot', desc: 'Remove every dropped item lying on the ground' },
    bell: { ...WD, cat: 'World', label: 'Ring the bell', desc: 'The church bell tolls for everyone' },
    flag: { ...WD, cat: 'World', label: 'Story flag', desc: 'Open gates, skip bosses... (e.g. key, cryptOpen, citadelOpen, gateOpen, dead_sentinel)', params: [txt('k', 'flag', 'key'), sel('v', 'set', () => [['1', 'on'], ['0', 'off']], '1')] },
  };
  const FREE = { help: 'List the commands you can use', players: 'Who is in this journey', whoami: 'Your account and role' };

  AC.isAdmin = () => !!AC.profile && (AC.maker || AC.profile.admin) && !O.isBanned(AC.profile);
  AC.role = p => (p && p.role && AC.roles[p.role]) || null;
  AC.can = (cmd, p = AC.profile, maker = AC.maker) => {
    if (FREE[cmd]) return true;
    if (!p || O.isBanned(p)) return false;
    const C = CMDS[cmd];
    if (C && C.makerOnly) return !!maker;
    if (C && C.adminOnly) return !!(maker || p.admin);
    if (maker || p.admin) return true;
    const r = AC.role(p); return !!(r && (r.commands || []).includes(cmd));
  };
  AC.canPanel = () => AC.isAdmin() || Object.keys(CMDS).some(c => AC.can(c));
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

  // entry point for chat text
  AC.chat = function (text) {
    const a = api(); if (!a) return;
    if (text[0] === '/') return AC.run(text.slice(1));
    if (AC.profile && AC.profile.mutedUntil > Date.now()) { sys(`You are muted for ${fmtLeft(AC.profile.mutedUntil)}.`); return; }
    const t = tagOf(AC.profile) || {};
    G().event({ t: 'chat', from: a.me().name, text: text.slice(0, 120), tag: t.tag || '', color: t.color || '' });
  };

  // typed command: /cmd [player|all] [values...]  (the menu calls AC.exec directly)
  AC.run = async function (line) {
    const parts = line.trim().split(/\s+/), cmd = (parts.shift() || '').toLowerCase();
    if (!cmd) return;
    if (FREE[cmd]) {
      if (cmd === 'help') { const mine = Object.keys(CMDS).filter(c => AC.can(c)); sys('Commands: /help /players /whoami' + (mine.length ? ' ' + mine.map(c => '/' + c).join(' ') : '') + (mine.length ? '  (easier: open the Command menu with F8)' : '')); return; }
      if (cmd === 'players') return sys('In this journey: ' + [...G().players.values()].map(p => p.name).join(', '));
      if (cmd === 'whoami') { const t = tagOf(AC.profile); return sys(`${AC.profile.name}${t ? ' [' + t.tag + ']' : ''}${O.mode === 'local' ? ' (local test mode)' : ''}`); }
    }
    const C = CMDS[cmd]; if (!C) return sys(`Unknown command /${cmd}. Type /help.`);
    const pick = { pids: [], names: [] };
    if (C.target === 'players') {
      const who = parts[0] && findPlayers(parts[0], !C.one);
      if (who && who.length) { parts.shift(); pick.pids = who.map(p => p.id); }
      else if (C.self) pick.pids = [Net.pid];
      else return sys(`Usage: /${cmd} <player${C.one ? '' : '|all'}>${(C.params || []).map(p => ' <' + p.label + '>').join('')}`);
    }
    if (C.target === 'account') { if (!parts[0]) return sys(`Usage: /${cmd} <name>${(C.params || []).map(p => ' <' + p.label + '>').join('')}`); pick.names = [parts.shift()]; }
    const args = {};
    (C.params || []).forEach((p, i, arr) => { const v = p.type === 'text' && i === arr.length - 1 ? parts.splice(0).join(' ') : parts.shift(); if (v !== undefined && v !== '') args[p.k] = v; });
    return AC.exec(cmd, pick, args);
  };

  const clamp = (v, p) => { if (p.type !== 'num') return v; const n = parseFloat(v); return Math.max(p.min, Math.min(p.max, isNaN(n) ? p.def : n)); };
  AC.exec = async function (cmd, pick, raw = {}) {
    const C = CMDS[cmd]; if (!C) return;
    if (!AC.can(cmd)) return sys(`You don't have permission to use ${C.label}.`);
    const args = {}; (C.params || []).forEach(p => { args[p.k] = clamp(raw[p.k] !== undefined ? raw[p.k] : p.def, p); });
    try {
      if (C.target === 'account') {
        if (!pick.names.length) throw new Error('Pick a player (or type an account name) first.');
        for (const n of pick.names) await accountCmd(cmd, n, args);
        return;
      }
      const a = api(), me = a && a.me();
      if (!me || !G().started) throw new Error('Start a journey first (commands that change players or the world work in-game).');
      if (C.target === 'players' && !pick.pids.length) throw new Error('Pick at least one player on the left.');
      if (cmd === 'tp') { const p = G().players.get(pick.pids[0]); if (!p) throw new Error('No such player here.'); me.pos.copy(p.pos); return sys(`Teleported to ${p.name}.`); }
      if (cmd === 'kick' && pick.pids.includes(Net.pid)) throw new Error('You cannot kick yourself.');
      if (C.text && !args.text) throw new Error('Type a message first.');
      if ((cmd === 'announce' || cmd === 'whisper') && !String(args.text || '').trim()) throw new Error('Type a message first.');
      G().event({ t: 'adm', op: cmd, by: me.name, byPid: Net.pid, pos: [me.pos.x, me.pos.y, me.pos.z], yaw: me.yaw, targets: C.target === 'players' ? pick.pids : [], a: args });
    } catch (err) { sys(err.message || String(err)); }
  };

  async function accountCmd(cmd, name, A) {
    const u = await O.findByName(name); if (!u) return sys(`No account named "${name}".`);
    if (['setrole', 'removerole', 'makeadmin', 'removeadmin'].includes(cmd)) {
      if (u.uid === AC.makerUid) return sys('The Maker\'s rank cannot be changed.');
      if (u.admin && !AC.maker && cmd !== 'makeadmin') return sys('Only the Maker can change an admin\'s rank.');
      try {
        if (cmd === 'setrole') { const r = AC.roles[A.role]; if (!r) return sys('Create a role in the Maker Panel (Roles tab) first.'); await O.updateUser(u.uid, { role: r.id }); sys(`${u.name} is now ${r.name}.`); }
        if (cmd === 'removerole') { await O.updateUser(u.uid, { role: '' }); sys(`${u.name} no longer has a role.`); }
        if (cmd === 'makeadmin') { await O.updateUser(u.uid, { admin: true }); sys(`${u.name} is now an admin.`); }
        if (cmd === 'removeadmin') { await O.updateUser(u.uid, { admin: false }); sys(`${u.name} is no longer an admin.`); }
      } catch (e) { sys('The online service refused that (' + (e.code || e.message) + ').'); }
      return;
    }
    if (u.uid === AC.makerUid && cmd !== 'unmute' && cmd !== 'unban') return sys('The Maker cannot be punished.');
    if (u.admin && !AC.maker && ['ban', 'tempban', 'mute'].includes(cmd)) return sys('Only the Maker can punish an admin.');
    try {
      if (cmd === 'mute') { await O.mute(u.uid, A.m); sys(`${u.name} is muted for ${fmtMin(A.m)}.`); }
      if (cmd === 'unmute') { await O.mute(u.uid, 0); sys(`${u.name} can speak again.`); }
      if (cmd === 'tempban') { await O.ban(u.uid, A.m, A.reason || '', AC.profile.name); sys(`${u.name} is banned for ${fmtMin(A.m)}.`); bootOnline(u, 'ban'); }
      if (cmd === 'ban') { await O.ban(u.uid, 0, A.reason || '', AC.profile.name); sys(`${u.name} is banned forever.`); bootOnline(u, 'ban'); }
      if (cmd === 'unban') { await O.unban(u.uid); sys(`${u.name} is no longer banned.`); }
    } catch (e) { sys('The online service refused that (' + (e.code || e.message) + ').'); }
  }
  // remove a freshly banned player from the current journey right away
  function bootOnline(u, why) {
    const p = [...(G() ? G().players.values() : [])].find(p => p.name.toLowerCase() === u.nameLower);
    const me = api() && api().me();
    if (p && me && p.id !== Net.pid) G().event({ t: 'adm', op: 'kick', by: me.name, byPid: Net.pid, targets: [p.id], a: { reason: why === 'ban' ? 'banned' : '' }, pos: [0, 0, 0] });
  }

  // applied on every machine (the host already verified the sender)
  AC.apply = function (e) {
    const a = api(); if (!a) return;
    const me = a.me(), A = e.a || {}, targets = e.targets || [], mine = targets.includes(Net.pid), host = Net.isHost();
    const at = new THREE.Vector3(e.pos[0], e.pos[1], e.pos[2]);
    const lim = (v, lo, hi, d) => { const n = parseFloat(v); return Math.max(lo, Math.min(hi, isNaN(n) ? d : n)); };
    const tp = () => targets.map(id => G().players.get(id)).filter(Boolean);
    const front = (d = 4) => new THREE.Vector3(at.x + Math.sin(e.yaw || 0) * d, at.y, at.z + Math.cos(e.yaw || 0) * d);
    const W = HC.World, en = () => [...G().enemies.values()];
    switch (e.op) {
      case 'announce': a.areaBanner(String(A.text || '').slice(0, 140)); a.chatLine(e.by, String(A.text || '').slice(0, 140), 'Announcement', '#e0b860'); break;
      case 'heal': if (mine && me) { me.hp = me.maxHp; me.st = me.maxSt; me.flasks = me.maxFlasks; me.burnT = 0; me.blindT = 0; me.confuseT = 0; a.message(`${e.by} restored you.`); } break;
      case 'revive': if (mine && me && me.downed) a.revived(e.by); break;
      case 'kill': if (mine && me) { me.god = false; a.receiveDamage(1e9, at, 'admin'); } break;
      case 'god': if (mine && me) { me.god = !me.god; a.message(me.god ? 'You cannot be harmed.' : 'You are mortal again.'); } break;
      case 'speed': if (mine && me) { me.speedMul = lim(A.mul, 0.1, 5, 1); a.message(`Speed x${me.speedMul}.`); } break;
      case 'power': if (mine && me) { me.power = lim(A.mul, 1, 50, 1); a.message(`Your blows hit x${me.power} harder.`); } break;
      case 'stamina': if (mine && me) { me.infSt = !me.infSt; a.message(me.infSt ? 'Your stamina is endless.' : 'Your stamina is mortal again.'); } break;
      case 'size': tp().forEach(p => p.avatar.root.scale.setScalar(lim(A.mul, 0.3, 3, 1))); if (mine) a.message(`${e.by} changed your size.`); break;
      case 'invisible': tp().forEach(p => { p.hidden = !p.hidden; if (!p.local) p.avatar.root.visible = !p.hidden; else a.message(p.hidden ? 'You are invisible to the others.' : 'You are visible again.'); }); break;
      case 'freeze': if (mine && me) { me.frozen = !me.frozen; a.message(me.frozen ? `${e.by} froze you in place.` : 'You can move again.'); } break;
      case 'burn': if (mine && me) { me.burnT = lim(A.s, 1, 60, 6); a.message(`${e.by} set you on fire!`); } break;
      case 'smite':
        tp().forEach(p => { HC.FX.spawn('pillar', p.pos, { color: 0xffe0a0, r: 1.6 }); HC.Audio.play('boom', p.pos, 1); });
        if (mine && me) { G().shakeA = 0.8; a.receiveDamage(me.maxHp * 0.5, me.pos.clone().add(new THREE.Vector3(0, 0, 1)), 'fire'); }
        break;
      case 'blind': if (mine && me) me.blindT = lim(A.s, 1, 30, 5); break;
      case 'confuse': if (mine && me) { me.confuseT = lim(A.s, 1, 60, 10); a.message('Your senses twist...'); } break;
      case 'bring': if (mine && me && e.byPid !== Net.pid) { me.pos.set(at.x + (Math.random() - 0.5) * 2, at.y, at.z + (Math.random() - 0.5) * 2); a.message(`${e.by} summoned you.`); } break;
      case 'home': if (mine && me) { a.travel(W.START.clone(), Math.PI); a.message(`${e.by} sent you home.`); } break;
      case 'whisper': if (mine) { a.chatLine(e.by, String(A.text || '').slice(0, 140), 'Whisper', '#b9a0e0'); a.message(`${e.by} whispers: ${String(A.text || '').slice(0, 140)}`); } break;
      case 'giveitem': if (mine && me && HC.Items.BASES[A.item]) {
        // stackables come as one stack; weapons and armor as that many separate pieces. Whatever doesn't fit in a
        // full satchel lands at your feet instead of vanishing.
        const I = HC.Items, r = lim(A.r, 0, 6, 0), n = lim(A.n, 1, 99, 1), one = I.make(A.item, r, 1);
        const stack = !!(one && I.stackable(one));
        let dropped = 0;
        (stack ? [I.make(A.item, r, n)] : Array.from({ length: n }, () => I.make(A.item, r, 1))).forEach(it => {
          if (it && !I.add(it)) { I.dropAt(it, me.pos.clone(), 0); dropped++; }
        });
        a.message(`${e.by} gave you ${I.name(one)}${n > 1 ? ' x' + n : ''}${dropped ? ' (satchel full - dropped at your feet)' : ''}.`);
      } break;
      case 'kit': if (mine) { HC.Items.kit(); a.message(`${e.by} gave you a starter kit.`); } break;
      case 'clearinv': if (mine) { HC.Items.clearAll(); a.message(`${e.by} emptied your satchel.`); } break;
      case 'ash': if (mine && me) { const n = lim(A.n, 1, 1e6, 1); me.ash += n; a.floatText(`+${n} ashes`); } break;
      case 'flask': if (mine && me) { const n = lim(A.n, 1, 20, 1); me.bonusFlasks = (me.bonusFlasks || 0) + n; a.recalc(); me.flasks = me.maxFlasks; a.message(`${e.by} gave you ${n} Ember Flask${n > 1 ? 's' : ''}.`); } break;
      case 'relic': if (mine && me && HC.RELICS[A.relic]) a.grantRelic(A.relic); break;
      case 'setlevel': if (mine && me) { const n = lim(A.n, 1, 300, 1), pts = n - 1; me.level = n; me.vig = Math.ceil(pts / 3); me.end = Math.floor((pts + 1) / 3); me.str = Math.floor(pts / 3); a.recalc(); me.hp = me.maxHp; a.message(`You are now level ${n}.`); } break;
      case 'fly': if (mine && me) { me.flying = !me.flying; if (!me.flying) { me.airOff = Math.max(0, me.pos.y - W.heightAt(me.pos.x, me.pos.z)); me.vy = 0; } a.message(me.flying ? 'You can fly. WASD + look, Space up, C down, Shift faster.' : 'You drift back to the ground.'); } break;
      case 'noclip': if (mine && me) { me.noclip = !me.noclip; a.message(me.noclip ? 'Walls no longer stop you.' : 'You are solid again.'); } break;
      case 'launch': if (mine && me) { me.vy = lim(A.h, 5, 60, 18); me.airOff = Math.max(me.airOff || 0, 0.1); a.message(e.by + ' launched you!'); } break;
      case 'giveset': if (mine && me) { ['head', 'chest', 'arms', 'legs'].forEach(s2 => HC.Items.give(A.set + '_' + s2, lim(A.r, 0, 6, 0), 1)); a.message(e.by + ' gave you a full armor set.'); } break;
      case 'giveall': if (mine && me) { Object.entries(HC.Items.BASES).filter(([, b]) => b.kind === 'weapon' || b.kind === 'shield').forEach(([k]) => HC.Items.give(k, lim(A.r, 0, 6, 0), 1)); HC.Items.give('arrow', 0, 60); a.message(e.by + ' gave you an armory.'); } break;
      case 'ammo': if (mine && me) { const n = lim(A.n, 1, 999, 60); HC.Items.give('arrow', 0, n); HC.Items.give('firearrow', 0, Math.ceil(n / 3)); } break;
      case 'embers': if (mine && me) { Object.keys(W.SHRINES).forEach(id => me.found.add(id)); a.message('Every ember remembers you. Travel from any shrine.'); } break;
      case 'spawn':
        if (host && HC.ETYPES[A.type] && !HC.ETYPES[A.type].boss) { const n = lim(A.n, 1, 10, 1); for (let i = 0; i < n; i++) {
          const ang = (e.yaw || 0) + (i - (n - 1) / 2) * 0.35, d = 5;
          const x = at.x + Math.sin(ang) * d, z = at.z + Math.cos(ang) * d;
          const y = x > 1500 ? at.y : W.heightAt(x, z);
          G().event({ t: 'spawn', id: 'adm' + Date.now().toString(36) + i, type: A.type, pos: [x, y, z] });
        } }
        break;
      case 'drop': if (host) { const it = HC.Items.make(A.item, lim(A.r, 0, 6, 0), lim(A.n, 1, 99, 1)); HC.Items.dropAt(it, front(3), 0); } break;
      case 'lootrain': if (host) { const n = lim(A.n, 1, 30, 8); for (let i = 0; i < n; i++) { const ang = Math.random() * 6.28, r = 2 + Math.random() * 6; HC.Items.dropAt(HC.Items.random(0.6), new THREE.Vector3(at.x + Math.cos(ang) * r, at.y, at.z + Math.sin(ang) * r), 0); } } break;
      case 'clear': if (host) { const r = lim(A.r, 1, 300, 30); en().forEach(x => { if (x.alive && !x.boss && x.type !== 'watcher' && x.pos.distanceTo(at) < r) x.takeHit(1e9, 1e9, at, e.byPid); }); } break;
      case 'killall': if (host) en().forEach(x => { if (x.alive && !x.boss && x.type !== 'watcher') x.takeHit(1e9, 1e9, x.pos, e.byPid); }); break;
      case 'bosskill': if (host && G().activeBoss) { const b = G().bossE[G().activeBoss]; if (b && b.alive) b.takeHit(1e9, 1e9, b.pos, e.byPid); } break;
      case 'resetworld': a.resetEnemies(); a.message(`${e.by} called the dead back.`); break;
      case 'peace': G().peace = !G().peace; a.message(G().peace ? `${e.by} froze every enemy.` : 'The enemies stir again.'); break;
      case 'slowmo': G().timeScale = G().timeScale === 0.4 ? 1 : 0.4; a.message(G().timeScale < 1 ? 'Time slows...' : 'Time flows again.'); break;
      case 'fog': G().fogMul = lim(A.mul, 0.1, 4, 1); break;
      case 'bell': a.ringBell(); break;
      case 'time': G().setTime(parseFloat(A.tod) || 0.5); a.message(e.by + ' turned the sky.'); break;
      case 'bloodmoon': if (host) G().event({ t: 'moon', on: !G().bloodMoon }); break;
      case 'clearloot': HC.Items.clearLoot(); break;
      case 'flag': if (host && A.k) G().event({ t: 'flag', k: String(A.k).slice(0, 32), v: String(A.v) !== '0', msg: `${e.by} bent fate: ${A.k} ${String(A.v) !== '0' ? 'on' : 'off'}.` }); break;
      case 'kick':
        if (mine) AC.kicked(A.reason === 'banned' ? 'You have been banished by ' + e.by + '.' : `${e.by} removed you from the journey.${A.reason ? ' Reason: ' + A.reason : ''}`);
        else if (Net.mode === 'host') setTimeout(() => Net.conns.forEach(v => { if (targets.includes(v.pid)) try { v.conn.close(); } catch (x) { } }), 600);
        break;
    }
    if (e.op !== 'announce' && e.byPid === Net.pid) consoleLog(`${(CMDS[e.op] || {}).label || e.op}: done${targets.length ? ' (' + targets.map(id => (G().players.get(id) || {}).name).filter(Boolean).join(', ') + ')' : ''}.`);
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
    if (HC.Items && !HC.Items.loaded && !AC.invLoading) { AC.invLoading = true; HC.Items.load().then(() => HC.Items.startTrades()); }
    if (!AC.passed) { AC.passed = true; show('gate', false); if (!(G() && (G().started || G().booting)) && $('lobby').classList.contains('hidden')) show('title'); }
  }
  function gateShow() { show('gate'); show('title', false); show('lobby', false); }

  function renderBadges() {
    const p = AC.profile, t = tagOf(p);
    $('whoBadge').innerHTML = p && p.name ? `Signed in as <b>${esc(p.name)}</b>${t ? ` <span class="rtag" style="color:${esc(t.color)}">${esc(t.tag)}</span>` : ''}` : '';
    ['btnMaker', 'btnMaker2'].forEach(id => { show(id, AC.canPanel()); $(id).textContent = AC.isAdmin() ? (id === 'btnMaker' ? 'Maker Panel' : 'Maker Panel [F8]') : (id === 'btnMaker' ? 'Commands' : 'Commands [F8]'); });
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
    if (!AC.canPanel()) return;
    if (!AC.isAdmin()) tab = 'console';
    document.exitPointerLock && document.exitPointerLock();
    show('pause', false); show('makerPanel'); renderPanel();
  };
  AC.closePanel = () => { show('makerPanel', false); if (G() && G().started && !G().ended && api()) api().lock(); };
  $('btnMaker').onclick = AC.openPanel; $('btnMaker2').onclick = AC.openPanel;
  $('mkClose').onclick = AC.closePanel;
  document.querySelectorAll('#makerPanel [data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; renderPanel(); });
  addEventListener('keydown', e => {
    if (e.code === 'F8' && AC.canPanel()) { e.preventDefault(); $('makerPanel').classList.contains('hidden') ? AC.openPanel() : AC.closePanel(); }
    else if (e.code === 'Escape' && !$('makerPanel').classList.contains('hidden')) { e.preventDefault(); AC.closePanel(); }
  });

  const roleOptions = sel => `<option value="">- none -</option>` + Object.values(AC.roles).map(r => `<option value="${esc(r.id)}" ${r.id === sel ? 'selected' : ''}>${esc(r.name)}</option>`).join('');
  const randCode = () => Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
  const busy = async (fn) => { try { await fn(); } catch (e) { alertMsg(e.message === 'wrong' ? 'Refused.' : (e.message || String(e))); } renderPanel(); };
  function alertMsg(t) { $('mkMsg').textContent = t; clearTimeout(AC.msgT); AC.msgT = setTimeout(() => $('mkMsg').textContent = '', 5000); }

  async function renderPanel() {
    if (!AC.isAdmin()) tab = 'console';
    document.querySelectorAll('#makerPanel [data-tab]').forEach(b => { b.classList.toggle('sel', b.dataset.tab === tab); b.classList.toggle('hidden', !AC.isAdmin() && b.dataset.tab !== 'console'); });
    $('mkTitle').textContent = AC.isAdmin() ? 'Maker Panel' : 'Commands';
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
      const roles = Object.values(AC.roles), cmds = Object.keys(CMDS).filter(c => !CMDS[c].adminOnly && !CMDS[c].makerOnly);
      body.innerHTML = `<p class="small">A role is a set of commands. Give roles to players on the Players tab. Admins can always use everything.</p>
        <div class="rolenew"><input id="mkRoleName" placeholder="New role name (e.g. Moderator)" maxlength="24"> <input id="mkRoleColor" type="color" value="#7aa0d0"> <button id="mkRoleAdd">Create role</button></div>
        ${roles.map(r => `<div class="role" data-r="${esc(r.id)}"><div class="rhead"><input class="rname" value="${esc(r.name)}" maxlength="24"> <input class="rcolor" type="color" value="${esc(r.color || '#c9a35a')}">
          <button class="rsave">Save</button> <button class="rdel">Delete</button></div>
          <div class="rcmds">${cmds.map(c => `<label class="chk" title="${esc(CMDS[c].desc)}"><input type="checkbox" value="${c}" ${(r.commands || []).includes(c) ? 'checked' : ''}> ${esc(CMDS[c].label)}</label>`).join('')}</div></div>`).join('') || '<p class="small">No roles yet.</p>'}`;
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
    if (tab === 'console') renderCommands(body);
  }

  // ---------------------------------------------------------------- the command menu: pick players, press a command
  const picked = new Set();
  let cmdFilter = '', acctName = '';
  function renderCommands(body) {
    const players = [...(G() && G().started ? G().players.values() : [])];
    [...picked].forEach(id => { if (!players.find(p => p.id === id)) picked.delete(id); });
    const mine = Object.keys(CMDS).filter(c => AC.can(c) && (!cmdFilter || (CMDS[c].label + ' ' + CMDS[c].desc + ' ' + c).toLowerCase().includes(cmdFilter.toLowerCase())));
    const cats = [...new Set(mine.map(c => CMDS[c].cat))];
    const field = (c, p) => {
      const id = `cp_${c}_${p.k}`;
      if (p.type === 'num') return `<label class="cpar">${esc(p.label)} <input id="${id}" class="num" type="number" step="any" min="${p.min}" max="${p.max}" value="${p.def}"></label>`;
      if (p.type === 'text') return `<input id="${id}" class="ctext" placeholder="${esc(p.label)}" maxlength="140" value="${esc(p.def || '')}">`;
      const opts = typeof p.opts === 'function' ? p.opts() : p.opts;
      return `<select id="${id}" title="${esc(p.label)}">${opts.map(([v, n]) => `<option value="${esc(v)}" ${String(v) === String(p.def) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
    };
    body.innerHTML = `<div class="cmdui">
      <div class="cmdside">
        <h3>Players here</h3>
        ${players.length ? `<button class="pk ${picked.size === players.length ? 'on' : ''}" data-pall>Everyone</button>` +
          players.map(p => `<button class="pk ${picked.has(p.id) ? 'on' : ''}" data-pid="${esc(p.id)}">${esc(p.name)}${p.local ? ' <span class="small">(you)</span>' : ''}${p.downed ? ' <span class="small">(fallen)</span>' : ''}</button>`).join('')
          : '<p class="small">Start or join a journey to use player and world commands here.</p>'}
        <h3>Any account</h3>
        <input id="cmdAcct" placeholder="Name (for mute / ban)" maxlength="14" value="${esc(acctName)}" list="cmdNames"><datalist id="cmdNames"></datalist>
        <p class="small">Mute, ban and rank commands use the players picked above, or this name.</p>
      </div>
      <div class="cmdmain">
        <input id="cmdFind" placeholder="Search commands..." value="${esc(cmdFilter)}">
        ${cats.map(cat => `<h3>${esc(cat)}</h3><div class="cmdgrid">${mine.filter(c => CMDS[c].cat === cat).map(c => {
          const C = CMDS[c];
          return `<div class="cmd ${C.danger ? 'danger' : ''}" title="${esc(C.desc)}"><div class="chead"><b>${esc(C.label)}</b><span class="small">${esc(C.desc)}</span></div>
            <div class="cbody">${(C.params || []).map(p => field(c, p)).join('')}<button data-run="${c}">${C.target === 'none' ? 'Run' : C.target === 'account' ? 'Apply' : 'Do it'}</button></div></div>`;
        }).join('')}</div>`).join('') || '<p class="small">No commands match.</p>'}
        <h3>Log</h3><pre id="mkConsoleLog" class="console"></pre>
        <input id="mkConsoleIn" placeholder="Or type a command: /heal all" autocomplete="off">
      </div></div>`;
    $('mkConsoleLog').textContent = consoleLines.join('\n'); $('mkConsoleLog').scrollTop = 1e9;
    body.querySelectorAll('[data-pid]').forEach(b => b.onclick = () => { picked.has(b.dataset.pid) ? picked.delete(b.dataset.pid) : picked.add(b.dataset.pid); renderCommands(body); });
    const all = body.querySelector('[data-pall]'); if (all) all.onclick = () => { if (picked.size === players.length) picked.clear(); else players.forEach(p => picked.add(p.id)); renderCommands(body); };
    $('cmdFind').oninput = e => { cmdFilter = e.target.value; clearTimeout(AC.cfT); AC.cfT = setTimeout(() => { renderCommands(body); const f = $('cmdFind'); f.focus(); f.setSelectionRange(f.value.length, f.value.length); }, 200); };
    $('cmdAcct').oninput = e => { acctName = e.target.value.trim(); };
    if (AC.isAdmin()) O.listUsers().then(us => { const dl = $('cmdNames'); if (dl) dl.innerHTML = us.filter(u => u.name).map(u => `<option value="${esc(u.name)}">`).join(''); }).catch(() => { });
    body.querySelectorAll('[data-run]').forEach(b => b.onclick = async () => {
      const c = b.dataset.run, C = CMDS[c], args = {};
      (C.params || []).forEach(p => { const el = $(`cp_${c}_${p.k}`); if (el) args[p.k] = el.value; });
      let pids = [...picked].filter(id => players.find(p => p.id === id));
      if (!pids.length && C.target === 'players' && C.self && Net.pid) pids = [Net.pid];   // nobody picked: use it on yourself
      const names = C.target === 'account' ? (pids.length ? pids.map(id => G().players.get(id).name) : acctName ? [acctName] : []) : [];
      if (C.danger && !confirm(`${C.label}: are you sure?`)) return;
      if (C.one && pids.length > 1) return consoleLog(`${C.label}: pick just one player.`);
      consoleLog(`> ${C.label}${pids.length && C.target === 'players' ? ' -> ' + pids.map(id => G().players.get(id).name).join(', ') : names.length ? ' -> ' + names.join(', ') : ''}`);
      await AC.exec(c, { pids, names }, args);
    });
    $('mkConsoleIn').onkeydown = e => { if (e.key === 'Enter') { const v = e.target.value.trim(); e.target.value = ''; if (v) { consoleLog('> ' + v); AC.run(v.replace(/^\//, '')); } } };
  }

  AC.boot();
})();
