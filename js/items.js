// THE HOLLOW CROWN - items: rarities, weapons, bows & arrows, potions, trinkets; the satchel (inventory),
// loot drops, the ember merchant, and the online Trading Post.
// The satchel belongs to the account (saved online in Firestore inv/{uid}, with a copy in this browser).
(function () {
  const $ = id => document.getElementById(id);
  const show = (id, on = true) => $(id).classList.toggle('hidden', !on);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const G = () => HC.Game, api = () => HC.Game && HC.Game.api, O = () => HC.Online;

  // ================================================================ catalogue
  const RAR = [
    { name: 'Common', color: '#a8a39a', mult: 1.0, glow: 0 },
    { name: 'Uncommon', color: '#5fc45a', mult: 1.12, glow: 0 },
    { name: 'Rare', color: '#4f94ff', mult: 1.26, glow: 0.35 },
    { name: 'Epic', color: '#b562ff', mult: 1.42, glow: 0.55 },
    { name: 'Legendary', color: '#ff9a1f', mult: 1.62, glow: 0.8 },
    { name: 'Mythic', color: '#ff3b3b', mult: 1.9, glow: 1.0 },
    { name: 'Unholy', color: '#e0105a', mult: 2.3, glow: 1.3, unholy: true },
    // never drops, never sold, never traded: only an admin can give it, and only admins can hold it
    { name: 'Admin', color: '#18e8ff', mult: 3, glow: 1.5, admin: true },
  ];
  const ADMIN_R = 7;
  const PERKS = {
    fire: { name: 'Burning', desc: 'Hits burn for extra fire damage.' },
    leech: { name: 'Leeching', desc: 'Heals you for 6% of the damage dealt.' },
    swift: { name: 'Swift', desc: 'Attacks 15% faster.' },
    brutal: { name: 'Brutal', desc: '+10% damage, +40% stagger.' },
    unholy: { name: 'Unholy', desc: '+15% damage and steals 4% of it as life. Wreathed in crimson.' },
  };
  // kind: weapon | use (consumable) | ammo | trinket.  r: fixed rarity for consumables/ammo
  const BASES = {
    longsword: { name: 'Longsword', kind: 'weapon', style: 'sword', model: 'sword', icon: '🗡', desc: 'Balanced and quick. Three-hit combos.' },
    greatsword: { name: 'Greatsword', kind: 'weapon', style: 'greatsword', model: 'greatsword', icon: '⚔', desc: 'Slow, sweeping and crushing.' },
    emberblade: { name: 'Ember Blade', kind: 'weapon', style: 'sword', model: 'embersword', icon: '🔥', desc: 'Forged in the eclipse. Its cuts always burn.', perk: 'fire', minR: 3 },
    dagger: { name: 'Dagger', kind: 'weapon', style: 'dagger', model: 'dagger', icon: '🔪', desc: 'Very fast, short reach, cheap on stamina.' },
    axe: { name: 'Battle Axe', kind: 'weapon', style: 'axe', model: 'axe', icon: '🪓', desc: 'Heavier hits than a sword.' },
    spear: { name: 'War Spear', kind: 'weapon', style: 'spear', model: 'spear', icon: '🔱', desc: 'Longest reach; narrow thrusts.' },
    hammer: { name: 'War Hammer', kind: 'weapon', style: 'hammer', model: 'hammer', icon: '🔨', desc: 'Huge damage and stagger. Very slow.' },
    scythe: { name: "Reaper's Scythe", kind: 'weapon', style: 'scythe', model: 'scythe', icon: '☾', desc: 'Wide, sweeping arcs that hit crowds.' },
    longbow: { name: 'Longbow', kind: 'weapon', style: 'bow', model: 'bow', icon: '🏹', desc: 'Shoots arrows where you aim. Heavy [Q] = charged shot.', ammo: true },
    crossbow: { name: 'Crossbow', kind: 'weapon', style: 'crossbow', model: 'crossbow', icon: '⌖', desc: 'Hard-hitting bolts. Heavy [Q] fires three at once. Uses arrows.', ammo: true },
    broadsword: { name: 'Knight\'s Broadsword', kind: 'weapon', style: 'sword', model: 'broadsword', icon: '🗡', desc: 'A wide, heavy-bladed arming sword. Hits a little harder than a longsword.', dmgMul: 1.12 },
    sabre: { name: 'Ashen Sabre', kind: 'weapon', style: 'sword', model: 'sabre', icon: '🗡', desc: 'A curved cavalry blade. Fast and cheap on stamina.', dmgMul: 0.95, fast: true },
    rapier: { name: 'Duelist\'s Rapier', kind: 'weapon', style: 'rapier', model: 'rapier', icon: '🤺', desc: 'Long, needle-thin thrusts with great reach.' },
    mace: { name: 'Flanged Mace', kind: 'weapon', style: 'mace', model: 'mace', icon: '🔨', desc: 'One-handed crusher. Staggers and cracks armor.' },
    greataxe: { name: 'Headsman\'s Greataxe', kind: 'weapon', style: 'greataxe', model: 'greataxe', icon: '🪓', desc: 'Enormous two-handed axe. Slow, devastating.' },
    halberd: { name: 'Halberd', kind: 'weapon', style: 'halberd', model: 'halberd', icon: '🔱', desc: 'Axe, hook and spike on a long pole. Long reach, heavy thrusts.' },
    staff: { name: 'Ember Staff', kind: 'weapon', style: 'staff', model: 'staff', icon: '✦', desc: 'Casts ember orbs (stamina, no ammo). Heavy [Q] = fire wave.' },
katana: { name: 'Moonless Katana', kind: 'weapon', style: 'katana', model: 'katana', icon: '', desc: 'Two-handed and razor fast. Long, flowing cuts.' },
    flail: { name: 'Iron Flail', kind: 'weapon', style: 'flail', model: 'flail', icon: '', desc: 'A spiked ball on a chain: wide, crushing swings.' },
    warpick: { name: 'War Pick', kind: 'weapon', style: 'warpick', model: 'warpick', icon: '', desc: 'Punches through armor: +30% damage against armored foes.' },
    club: { name: 'Nailed Club', kind: 'weapon', style: 'mace', model: 'club', icon: '', desc: 'A crude cudgel studded with nails. Never better than Rare.', dmgMul: 0.85 },
    maul: { name: 'Grave Maul', kind: 'weapon', style: 'hammer', model: 'maul', icon: '', desc: 'A block of iron on a pole. The slowest, hardest blows there are.', dmgMul: 1.15 },
    cestus: { name: 'Iron Cestus', kind: 'weapon', style: 'fists', model: 'cestus', icon: '', desc: 'Studded iron over both fists. Very fast jab-cross combos.' },
    javelin: { name: 'Javelins', kind: 'weapon', style: 'javelin', model: 'javelin', icon: '', desc: 'Thrown spears. Heavy [Q] is a mighty overhand throw. No ammo needed.' },
    knives: { name: 'Throwing Knives', kind: 'weapon', style: 'knives', model: 'knife', icon: '', desc: 'Quick thrown knives. Heavy [Q] fans out three.' },
    wand: { name: 'Frostbone Wand', kind: 'weapon', style: 'wand', model: 'wand', icon: '', desc: 'Fires freezing bolts that slow whatever they hit. Heavy [Q] fires three.' },
    tome: { name: 'Grimoire of the Hollow', kind: 'weapon', style: 'tome', model: 'tome', icon: '', desc: 'Hold to gather a void orb that tears through every foe in its path. Epic or better only.' },
    sickle: { name: 'Harvest Sickle', kind: 'weapon', style: 'sickle', model: 'sickle', icon: '', desc: 'A hooked reaping blade. Fast slashes that bleed foes.' },
    crownbreaker: { name: 'Crownbreaker', kind: 'weapon', style: 'greatsword', model: 'crownbreaker', icon: '', desc: 'The blade that was meant for the King. Exists only as Unholy.', dmgMul: 1.2 },
    // ---- admin guns (stats in HC.GUNS, js/entities.js). Click / [J] fires (hold for automatics), right mouse aims, [Q] reloads
    gun_pistol: { name: 'Service Pistol', kind: 'weapon', style: 'gun', model: 'gun_pistol', icon: '', r: 7, adminOnly: true, desc: 'ADMIN ONLY. 12-round semi-automatic pistol.' },
    gun_revolver: { name: 'Revolver', kind: 'weapon', style: 'gun', model: 'gun_revolver', icon: '', r: 7, adminOnly: true, desc: 'ADMIN ONLY. Six heavy rounds. Slow and devastating.' },
    gun_deagle: { name: 'Hand Cannon', kind: 'weapon', style: 'gun', model: 'gun_deagle', icon: '', r: 7, adminOnly: true, desc: 'ADMIN ONLY. A chrome pistol that kicks like a mule.' },
    gun_smg: { name: 'Submachine Gun', kind: 'weapon', style: 'gun', model: 'gun_smg', icon: '', r: 7, adminOnly: true, desc: 'ADMIN ONLY. Hold to spray. 32-round magazine.' },
    gun_rifle: { name: 'Assault Rifle', kind: 'weapon', style: 'gun', model: 'gun_rifle', icon: '', r: 7, adminOnly: true, desc: 'ADMIN ONLY. Fully automatic, accurate, 30 rounds.' },
    gun_lmg: { name: 'Light Machine Gun', kind: 'weapon', style: 'gun', model: 'gun_lmg', icon: '', r: 7, adminOnly: true, desc: 'ADMIN ONLY. A 100-round belt. Long reload.' },
    gun_minigun: { name: 'Minigun', kind: 'weapon', style: 'gun', model: 'gun_minigun', icon: '', r: 7, adminOnly: true, desc: 'ADMIN ONLY. Spins up, then shreds everything. 300 rounds.' },
    gun_shotgun: { name: 'Pump Shotgun', kind: 'weapon', style: 'gun', model: 'gun_shotgun', icon: '', r: 7, adminOnly: true, desc: 'ADMIN ONLY. Nine pellets a shot. Brutal up close.' },
    gun_dbarrel: { name: 'Double-Barrel', kind: 'weapon', style: 'gun', model: 'gun_dbarrel', icon: '', r: 7, adminOnly: true, desc: 'ADMIN ONLY. Two shells, twelve pellets each.' },
    gun_sniper: { name: 'Sniper Rifle', kind: 'weapon', style: 'gun', model: 'gun_sniper', icon: '', r: 7, adminOnly: true, desc: 'ADMIN ONLY. Right mouse looks down the scope. Shots go through enemies.' },
    gun_rocket: { name: 'Rocket Launcher', kind: 'weapon', style: 'gun', model: 'gun_rocket', icon: '', r: 7, adminOnly: true, desc: 'ADMIN ONLY. One rocket, one huge explosion.' },
    gun_glauncher: { name: 'Grenade Launcher', kind: 'weapon', style: 'gun', model: 'gun_glauncher', icon: '', r: 7, adminOnly: true, desc: 'ADMIN ONLY. Lobs six explosive grenades.' },
    gun_plasma: { name: 'Plasma Rifle', kind: 'weapon', style: 'gun', model: 'gun_plasma', icon: '', r: 7, adminOnly: true, desc: 'ADMIN ONLY. Fires bolts of blue-white plasma.' },
    corolla: { name: '2014 Toyota Corolla E180 EU', kind: 'weapon', style: 'car', model: 'corolla', icon: '', r: 7, adminOnly: true, dmgMul: 1 / 3,   // punches hit like plain fists, not x3 Admin
      desc: 'ADMIN ONLY. Equip it and it pulls up beside you. [F] get in / out. W/S gas, brake & reverse, A/D steer, Space handbrake, H horn, V inside view. Runs over whatever is in the way.' },
    draught: { name: 'Minor Healing Draught', kind: 'use', r: 0, icon: '❤', tint: 0xb01818, heal: 0.35, desc: 'Restores 35% health.' },
    potion: { name: 'Healing Potion', kind: 'use', r: 1, icon: '❤', tint: 0xe02020, heal: 0.65, desc: 'Restores 65% health.' },
    elixir: { name: 'Supreme Elixir', kind: 'use', r: 3, icon: '❤', tint: 0xff4060, heal: 1, regen: 20, desc: 'Full health, then regenerates for 20 s.' },
    tonic: { name: 'Stamina Tonic', kind: 'use', r: 1, icon: '⚡', tint: 0x40c040, buff: 'breath', dur: 40, desc: 'Stamina refills twice as fast for 40 s.' },
    might: { name: 'Draught of Might', kind: 'use', r: 2, icon: '✊', tint: 0x9040e0, buff: 'might', dur: 60, desc: '+30% damage for 60 s.' },
    ironskin: { name: 'Ironskin Brew', kind: 'use', r: 2, icon: '🛡', tint: 0x4070e0, buff: 'iron', dur: 60, desc: 'Take 40% less damage for 60 s.' },
    embershard: { name: 'Ember Shard', kind: 'use', r: 2, icon: '◆', tint: 0xff7a30, flask: 1, desc: 'Refills one Ember Flask.' },
frostbomb: { name: 'Frost Bomb', kind: 'use', r: 2, icon: '', bomb: 40, frost: true, desc: 'Throw it: a burst of rime that slows everything nearby for 5 s.' },
    holywater: { name: 'Holy Water', kind: 'use', r: 3, icon: '', bomb: 150, holy: true, desc: 'Throw it: blessed water that sears the dead (150 damage around it).' },
    bread: { name: 'Black Bread', kind: 'use', r: 0, icon: '', regen: 25, desc: 'Slowly restores health for 25 s.' },
    wine: { name: 'Grave Wine', kind: 'use', r: 1, icon: '', heal: 0.15, buff: 'breath', dur: 60, desc: 'A little health, and stamina refills twice as fast for 60 s.' },
    firebomb: { name: 'Fire Bomb', kind: 'use', r: 1, icon: '💣', tint: 0x222018, bomb: 70, desc: 'Throw it: bursts into fire (70 damage around it).' },
    arrow: { name: 'Iron Arrows', kind: 'ammo', r: 0, icon: '➶', desc: 'Ammunition for bows and crossbows.' },
    firearrow: { name: 'Ember Arrows', kind: 'ammo', r: 2, icon: '➶', fire: true, desc: 'Burning ammunition: +40% damage. Used before iron arrows.' },
    // ---- shields: held on the left arm, used when blocking (not with bows, crossbows or staffs)
    buckler: { name: 'Round Buckler', kind: 'shield', model: 'buckler', icon: '◍', absorb: 0.08, stab: 0.95, arc: 1.6, desc: 'Small and light. Blocks cost a little less stamina.' },
    kite: { name: 'Knight\'s Kite Shield', kind: 'shield', model: 'shield', icon: '⛉', absorb: 0.03, stab: 0.65, arc: 1.9, desc: 'Carried by the Ashen knights. Stops almost everything.' },
    tower: { name: 'Ashen Tower Shield', kind: 'shield', model: 'tower', icon: '▮', absorb: 0.0, stab: 0.45, arc: 2.3, weight: 0.03, desc: 'A wall of iron. Blocks everything, slows you a little.' },
heater: { name: 'Heater Shield', kind: 'shield', model: 'heater', icon: '', absorb: 0.04, stab: 0.75, arc: 1.8, desc: 'A knight\'s painted shield. Balanced in every way.' },
    targe: { name: 'Spiked Targe', kind: 'shield', model: 'targe', icon: '', absorb: 0.06, stab: 0.85, arc: 1.7, spikes: 14, desc: 'Studded wood with a boss spike: blocking a blow hurts the attacker.' },
    // ---- armor: four slots, five sets. Heavier sets protect more but slow you a little
    leather_head: { name: 'Leather Cap', kind: 'armor', slot: 'head', set: 'leather', armor: 5, icon: '⛑', desc: 'Hardened leather. Light and quiet.' },
    leather_chest: { name: 'Leather Jerkin', kind: 'armor', slot: 'chest', set: 'leather', armor: 9, icon: '⛨', desc: 'Hardened leather. Light and quiet.' },
    leather_arms: { name: 'Leather Bracers', kind: 'armor', slot: 'arms', set: 'leather', armor: 3, icon: '✋', desc: 'Hardened leather. Light and quiet.' },
    leather_legs: { name: 'Leather Greaves', kind: 'armor', slot: 'legs', set: 'leather', armor: 5, icon: '👢', desc: 'Hardened leather. Light and quiet.' },
    chain_head: { name: 'Chain Coif', kind: 'armor', slot: 'head', set: 'chain', armor: 8, icon: '⛑', desc: 'Riveted mail. Slightly heavy.' },
    chain_chest: { name: 'Chainmail Hauberk', kind: 'armor', slot: 'chest', set: 'chain', armor: 15, icon: '⛨', desc: 'Riveted mail. Slightly heavy.' },
    chain_arms: { name: 'Chain Vambraces', kind: 'armor', slot: 'arms', set: 'chain', armor: 6, icon: '✋', desc: 'Riveted mail. Slightly heavy.' },
    chain_legs: { name: 'Chain Chausses', kind: 'armor', slot: 'legs', set: 'chain', armor: 9, icon: '👢', desc: 'Riveted mail. Slightly heavy.' },
    plate_head: { name: 'Ashen Great Helm', kind: 'armor', slot: 'head', set: 'plate', armor: 13, icon: '⛑', desc: 'Knightly plate of the Ashen Guard. Heavy.' },
    plate_chest: { name: 'Ashen Cuirass', kind: 'armor', slot: 'chest', set: 'plate', armor: 24, icon: '⛨', desc: 'Knightly plate of the Ashen Guard. Heavy.' },
    plate_arms: { name: 'Ashen Vambraces', kind: 'armor', slot: 'arms', set: 'plate', armor: 9, icon: '✋', desc: 'Knightly plate of the Ashen Guard. Heavy.' },
    hunter_head: { name: 'Hunter\'s Hood', kind: 'armor', slot: 'head', set: 'hunter', armor: 6, icon: '⛑', desc: 'Studded leather and wolf fur. Light.' },
    hunter_chest: { name: 'Studded Brigandine', kind: 'armor', slot: 'chest', set: 'hunter', armor: 11, icon: '⛨', desc: 'Studded leather and wolf fur. Light.' },
    hunter_arms: { name: 'Studded Bracers', kind: 'armor', slot: 'arms', set: 'hunter', armor: 4, icon: '✋', desc: 'Studded leather and wolf fur. Light.' },
    hunter_legs: { name: 'Studded Greaves', kind: 'armor', slot: 'legs', set: 'hunter', armor: 6, icon: '👢', desc: 'Studded leather and wolf fur. Light.' },
    bone_head: { name: 'Horned Bone Helm', kind: 'armor', slot: 'head', set: 'bone', armor: 11, icon: '⛑', desc: 'Plates of old bone bound with sinew. Medium.' },
    bone_chest: { name: 'Bonewrought Cuirass', kind: 'armor', slot: 'chest', set: 'bone', armor: 19, icon: '⛨', desc: 'Plates of old bone bound with sinew. Medium.' },
    bone_arms: { name: 'Bonewrought Vambraces', kind: 'armor', slot: 'arms', set: 'bone', armor: 7, icon: '✋', desc: 'Plates of old bone bound with sinew. Medium.' },
    bone_legs: { name: 'Bonewrought Greaves', kind: 'armor', slot: 'legs', set: 'bone', armor: 11, icon: '👢', desc: 'Plates of old bone bound with sinew. Medium.' },
    plate_legs: { name: 'Ashen Greaves', kind: 'armor', slot: 'legs', set: 'plate', armor: 14, icon: '👢', desc: 'Knightly plate of the Ashen Guard. Heavy.' },
    ring: { name: 'Ring of Vigor', kind: 'trinket', icon: '◯', stat: { hp: 18 }, desc: 'More health.' },
    haste: { name: 'Band of Haste', kind: 'trinket', icon: '➰', stat: { speed: 0.05 }, desc: 'Move faster.' },
    talisman: { name: 'Iron Talisman', kind: 'trinket', icon: '⛨', stat: { def: 0.06 }, desc: 'Take less damage.' },
    charm: { name: 'Ember Charm', kind: 'trinket', icon: '✹', stat: { dmg: 0.06 }, desc: 'Deal more damage.' },
    pendant: { name: 'Pendant of Breath', kind: 'trinket', icon: '❂', stat: { stam: 0.18 }, desc: 'Stamina refills faster.' },
    fang: { name: 'Vampire Fang', kind: 'trinket', icon: '⟆', stat: { leech: 0.025 }, desc: 'Heal from the damage you deal.' },
    coin: { name: "Gravedigger's Coin", kind: 'trinket', icon: '◉', stat: { luck: 0.2 }, desc: 'More ashes from every kill.' },
    skull: { name: 'Skull of the Pretender', kind: 'trinket', icon: '', stat: { dmg: 0.09 }, desc: 'A crowned skull that whispers. Much more damage.' },
    feather: { name: 'Raven Feather', kind: 'trinket', icon: '', stat: { speed: 0.07 }, desc: 'Light as a carrion bird. Move faster.' },
    eye: { name: 'Eye of the Watcher', kind: 'trinket', icon: '', stat: { def: 0.09 }, desc: 'It never closes. Take much less damage. Epic or better only.' },
  };
  const STAT_LABEL = { hp: v => `+${Math.round(v)} max health`, speed: v => `+${Math.round(v * 100)}% move speed`, def: v => `-${Math.round(v * 100)}% damage taken`, dmg: v => `+${Math.round(v * 100)}% damage`, stam: v => `+${Math.round(v * 100)}% stamina regen`, leech: v => `${(v * 100).toFixed(1)}% life steal`, luck: v => `+${Math.round(v * 100)}% ashes` };
  const STACK = { use: 20, ammo: 99 };
  const MAX_SLOTS = 40;

  const SLOTS = ['w', 'off', 't1', 't2', 'head', 'chest', 'arms', 'legs'], ARMOR_SLOTS = ['head', 'chest', 'arms', 'legs'];
  const WEIGHT = { leather: 0, hunter: 0, chain: 0.012, bone: 0.015, plate: 0.025 };
  const emptyEquip = () => ({ w: null, off: null, t1: null, t2: null, head: null, chest: null, arms: null, legs: null });
  const I = HC.Items = { RAR, PERKS, BASES, inv: [], equip: emptyEquip(), quick: [null, null, null, null], loaded: false };
  const B = id => BASES[id];
  const stackable = it => B(it.b) && (B(it.b).kind === 'use' || B(it.b).kind === 'ammo');
  I.stackable = stackable;
  const key = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  I.make = (b, r, n = 1, p) => {
    const base = B(b); if (!base) return null;
    if (base.r !== undefined) r = base.r;
    const [lo, hi] = I.range(b); r = Math.max(lo, Math.min(hi, r | 0));
    const it = { k: key(), b, r, n: Math.max(1, n | 0) };
    const perk = p || base.perk || (base.adminOnly ? null : base.kind === 'weapon' && r >= 6 ? 'unholy' : base.kind === 'weapon' && r >= 3 ? Object.keys(PERKS)[Math.floor(Math.random() * 4)] : null);
    if (perk) it.p = perk;
    return it;
  };
  // item pictures (rendered from the item models by tools/build_icons.py) instead of emoji
  I.icon = function (b) {
    const id = typeof b === 'string' ? b : Object.keys(BASES).find(k => BASES[k] === b), H = window.HC_ICONS;
    if (!H || H.map[id] === undefined) return '<i class="ic"></i>';
    const i = H.map[id], x = (i % H.cols) / (H.cols - 1) * 100, y = Math.floor(i / H.cols) / Math.max(1, H.rows - 1) * 100;
    return `<i class="ic" style="background-position:${x}% ${y}%"></i>`;
  };
  if (window.HC_ICONS) document.documentElement.style.setProperty('--icons', `url(${HC_ICONS.src})`), document.documentElement.style.setProperty('--icols', HC_ICONS.cols), document.documentElement.style.setProperty('--irows', HC_ICONS.rows);  // which rarities each item can come in ('locked' items have a narrow range: a club is never better than Rare,
  // the Crownbreaker only exists as Unholy; most gear can roll anything from Common to Unholy)
  const RANGES = { longsword: [0, 4], emberblade: [3, 5], hammer: [1, 6], scythe: [2, 6], crossbow: [1, 6], broadsword: [1, 5], sabre: [1, 6], rapier: [2, 6],
    greataxe: [2, 6], halberd: [1, 6], staff: [1, 6], katana: [2, 6], flail: [0, 6], warpick: [0, 5], club: [0, 2], maul: [2, 6], cestus: [0, 6], javelin: [0, 5],
    knives: [0, 6], wand: [1, 6], tome: [3, 6], sickle: [0, 4], crownbreaker: [6, 6], tower: [2, 6], targe: [1, 6], coin: [0, 3], skull: [2, 6], eye: [3, 6] };
  const SET_RANGE = { leather: [0, 3], hunter: [1, 4], chain: [1, 5], bone: [2, 6], plate: [3, 6] };
  I.adminOnly = b => !!(B(b) && B(b).adminOnly);
  I.ADMIN_R = ADMIN_R;
  I.range = b => { const base = B(b); if (!base) return [0, 6]; if (base.r !== undefined) return [base.r, base.r]; return RANGES[b] || (base.set && SET_RANGE[base.set]) || [base.minR || 0, 6]; };
  I.name = it => (B(it.b) || { name: it.b }).name;
  I.color = it => RAR[it.r || 0].color;
  I.label = it => `<span style="color:${I.color(it)}">${esc(I.name(it))}</span>${it.n > 1 ? ` <span class="small">x${it.n}</span>` : ''}`;
  I.armorVal = it => Math.round(B(it.b).armor * (1 + (it.r || 0) * 0.35));
  // what the character wears, as a short code for the network ('plate4,chain0,,leather2') and as sets for the avatar
  I.armorCode = () => ARMOR_SLOTS.map(s => { const it = I.find(I.equip[s]); return it ? B(it.b).set + (it.r || 0) : ''; }).join(',');
  I.armorVisual = code => { const p = String(code || '').split(','), v = {}; ARMOR_SLOTS.forEach((s, i) => { const m = /^([a-z]+)/.exec(p[i] || ''); v[s] = m ? m[1] : null; }); return v; };
  // the shield on your arm: how much of a blocked blow still gets through, and how much stamina blocking costs
  I.shield = () => { const it = I.find(I.equip.off); return it && B(it.b) && B(it.b).kind === 'shield' ? it : null; };
  I.shieldStats = () => {
    const it = I.shield(); if (!it) return { absorb: 0.12, stab: 1.6, arc: 1.4 };
    const b = B(it.b), m = 1 - (it.r || 0) * 0.07;
    return { absorb: b.absorb * m, stab: b.stab * m, arc: b.arc };
  };
  I.shieldCode = () => { const it = I.shield(); return it ? it.b + (it.r || 0) : ''; };
  I.shieldVisual = code => { const m = /^([a-z]+)(\d)?$/.exec(code || ''); return m && B(m[1]) ? { model: B(m[1]).model, r: +(m[2] || 0) } : null; };
  I.trinketVal = it => { const s = B(it.b).stat, k = Object.keys(s)[0]; return [k, s[k] * (1 + (it.r || 0) * 0.45)]; };

  // weapon stats for the local player: style numbers scaled by rarity and perk
  I.weapon = () => I.find(I.equip.w) || null;
  I.weaponStats = function (kind) {
    const rat = !!(HC.Game && HC.Game.api && HC.Game.api.me() && HC.Game.api.me().rat);   // a Lab Rat only bites
    const it = rat ? null : I.weapon(), base = rat ? { style: 'rat' } : it ? B(it.b) : { style: 'unarmed' }, S = HC.STYLES[base.style] || HC.STYLES.sword;   // bare hands = fists
    const s = Object.assign({}, S[kind === 'heavy' ? 'heavy' : 'light']);
    const r = it ? RAR[it.r || 0].mult : 1, p = it && it.p;
    s.dmg *= r * (p === 'brutal' ? 1.1 : p === 'unholy' ? 1.15 : 1) * (base.dmgMul || 1);
    if (base.fast) { s.dur *= 0.88; s.hit *= 0.88; s.st *= 0.85; } s.poise *= p === 'brutal' ? 1.4 : 1;
    if (p === 'swift') { s.dur *= 0.85; s.hit *= 0.85; }
    s.perk = p; s.ranged = !!S.ranged; s.style = base.style;
    return s;
  };
  I.visual = (b, r) => { const base = B(b) || B('longsword'); return { model: base.model, style: base.style, glow: RAR[r || 0].glow ? parseInt(RAR[r || 0].color.slice(1), 16) : null, amt: RAR[r || 0].glow }; };

  // sum of trinket bonuses
  I.bonus = function () {
    const out = { hp: 0, speed: 0, def: 0, dmg: 0, stam: 0, leech: 0, luck: 0, armor: 0, weight: 0 };
    ARMOR_SLOTS.forEach(s => { const it = I.find(I.equip[s]), b = it && B(it.b); if (b && b.kind === 'armor') { out.armor += I.armorVal(it); out.weight += WEIGHT[b.set] || 0; } });
    const sh = I.shield(); if (sh && B(sh.b).weight) out.weight += B(sh.b).weight;
    ['t1', 't2'].forEach(s => { const it = I.find(I.equip[s]); if (it && B(it.b).kind === 'trinket') { const [k, v] = I.trinketVal(it); out[k] += v; } });
    return out;
  };

  // ================================================================ satchel operations
  I.find = k => k ? I.inv.find(x => x.k === k) : null;
  I.count = b => I.inv.filter(x => x.b === b).reduce((s, x) => s + x.n, 0);
  I.add = function (it, quiet) {
    if (!it || !B(it.b)) return false;
    if (I.adminOnly(it.b)) { if (!amAdmin()) { if (!quiet) note('Only admins can hold that.'); return false; } it.r = ADMIN_R; }
    if (stackable(it)) {
      let left = it.n;
      I.inv.filter(x => x.b === it.b && x.r === it.r && x.n < STACK[B(it.b).kind]).forEach(x => { const m = Math.min(left, STACK[B(x.b).kind] - x.n); x.n += m; left -= m; });
      while (left > 0) {
        if (I.inv.length >= MAX_SLOTS) { if (!quiet) note('Your satchel is full.'); changed(); return false; }
        const m = Math.min(left, STACK[B(it.b).kind]); I.inv.push(Object.assign({}, it, { k: key(), n: m })); left -= m;
      }
    } else {
      if (I.inv.length >= MAX_SLOTS) { if (!quiet) note('Your satchel is full.'); return false; }
      I.inv.push(Object.assign({}, it, { k: it.k || key() }));
    }
    if (!quiet) note(`Obtained: ${I.name(it)}${it.n > 1 ? ' x' + it.n : ''} (${RAR[it.r || 0].name})`, I.color(it));
    changed(); return true;
  };
  I.remove = function (k, n = Infinity) {
    const i = I.inv.findIndex(x => x.k === k); if (i < 0) return null;
    const it = I.inv[i], take = Math.min(n, it.n);
    const out = Object.assign({}, it, { n: take });
    if (take >= it.n) { I.inv.splice(i, 1); SLOTS.forEach(s => { if (I.equip[s] === k) I.equip[s] = null; }); I.quick = I.quick.map(q => q === k ? null : q); }
    else { it.n -= take; out.k = key(); }
    changed(); return out;
  };
  I.takeBase = function (b, n = 1) {      // spend ammo etc. by base id
    for (const it of I.inv.filter(x => x.b === b)) { if (n <= 0) break; const m = Math.min(n, it.n); I.remove(it.k, m); n -= m; }
  };
  // the sound of putting something on: blades are drawn, armor clinks or creaks, everything else rustles
  function equipSound(base) {
    const A = HC.Audio; if (!A || !A.play) return;
    if (base.kind === 'weapon') A.play(base.style === 'dagger' ? 'draw_dagger' : ['sword', 'greatsword', 'axe'].includes(base.style) ? 'draw_blade' : 'equip_cloth', null, 0.7);
    else if (base.kind === 'armor') A.play(base.set === 'leather' ? 'equip_cloth' : 'equip_metal', null, 0.75);
    else A.play('equip_cloth', null, 0.5);
  }
  const amAdmin = () => !!(HC.Access && HC.Access.isAdmin && HC.Access.isAdmin());
  I.equipItem = function (k) {
    const it = I.find(k); if (!it) return;
    if (I.adminOnly(it.b) && !amAdmin()) { note('Only admins can use that.'); return; }
    const kind = B(it.b).kind;
    if (kind !== 'use' && kind !== 'ammo' && !I.isEquipped(k)) equipSound(B(it.b));
    if (kind === 'weapon') I.equip.w = k;
    else if (kind === 'armor') I.equip[B(it.b).slot] = k;
    else if (kind === 'shield') I.equip.off = k;
    else if (kind === 'trinket') {
      if (I.equip.t1 === k || I.equip.t2 === k) return;
      if (!I.equip.t1) I.equip.t1 = k; else if (!I.equip.t2) I.equip.t2 = k; else { I.equip.t2 = I.equip.t1; I.equip.t1 = k; }
    } else if (kind === 'use') { const s = I.quick.indexOf(null); I.quick[s >= 0 ? s : 0] = k; }
    changed();
  };
  I.unequip = function (k) { const it = I.find(k); if (it && HC.Audio.play) HC.Audio.play(B(it.b).kind === 'weapon' && ['sword', 'greatsword', 'axe', 'dagger'].includes(B(it.b).style) ? 'sheath' : 'equip_cloth', null, 0.6); SLOTS.forEach(s => { if (I.equip[s] === k) I.equip[s] = null; }); I.quick = I.quick.map(q => q === k ? null : q); changed(); };
  I.isEquipped = k => !!k && SLOTS.some(s => I.equip[s] === k);

  // a quick slot keeps pointing at the same kind of consumable when a stack runs out
  function refillQuick() {
    I.quick = I.quick.map(q => {
      if (!q || I.find(q)) return q;
      return null;
    });
  }
  const listeners = new Set();
  I.onChange = f => listeners.add(f);
  let saveT = null;
  function changed() {
    refillQuick();
    listeners.forEach(f => { try { f(); } catch (e) { console.error(e); } });
    if (!$('inventory').classList.contains('hidden')) renderInv();
    clearTimeout(saveT); saveT = setTimeout(I.save, 1200);
  }
  I.changed = changed;
  function note(t, color) { const a = api(); if (a && G().started) { a.message(t); } else { const m = $('tradeMsg'); if (m) m.textContent = t; } }

  // ================================================================ persistence (per account)
  const LKEY = () => 'hc_inv_' + ((O() && O().uid) || 'guest');
  function starterKit() {
    I.inv = []; I.equip = emptyEquip(); I.quick = [null, null, null, null];
    const sw = I.make('longsword', 0), bow = I.make('longbow', 0), dr = I.make('draught', 0, 3), ar = I.make('arrow', 0, 30), jk = I.make('leather_chest', 0);
    I.inv.push(sw, bow, dr, ar, jk);
    I.equip.w = sw.k; I.equip.chest = jk.k; I.quick[0] = dr.k;
  }
  function adopt(d) {
    if (!d || !Array.isArray(d.items)) return false;
    I.inv = d.items.filter(x => x && B(x.b)).slice(0, MAX_SLOTS);
    I.equip = Object.assign(emptyEquip(), d.equip || {});
    I.quick = (d.quick || [null, null, null, null]).slice(0, 4);
    return true;
  }
  I.load = async function () {
    let d = null;
    try { if (O() && O().ready && O().uid) d = await O().loadInv(); } catch (e) { console.warn('inventory load', e); }
    if (!d) { try { d = JSON.parse(localStorage.getItem(LKEY())); } catch (e) { } }
    if (!adopt(d)) { starterKit(); I.loaded = true; await I.save(); }
    I.loaded = true; changed();
  };
  I.save = async function () {
    clearTimeout(saveT);
    const d = { items: I.inv, equip: I.equip, quick: I.quick, at: Date.now() };
    try { localStorage.setItem(LKEY(), JSON.stringify(d)); } catch (e) { }
    try { if (I.loaded && O() && O().ready && O().uid) await O().saveInv(JSON.parse(JSON.stringify(d))); } catch (e) { console.warn('inventory save', e); }
  };
  addEventListener('beforeunload', () => { try { localStorage.setItem(LKEY(), JSON.stringify({ items: I.inv, equip: I.equip, quick: I.quick, at: Date.now() })); } catch (e) { } });

  // ================================================================ using items (in a journey)
  I.use = function (k) {
    const a = api(), it = I.find(k); if (!a || !it || !G().started) return;
    const me = a.me(), base = B(it.b); if (!me || me.downed || me.dead) return;
    if (base.kind === 'weapon' || base.kind === 'trinket') { I.equipItem(k); return; }
    if (base.kind !== 'use') return;
    if (base.bomb) { if (a.throwBomb(base.bomb, base.frost ? 'frost' : base.holy ? 'holy' : 'fire')) I.remove(k, 1); return; }
    if (!a.drink(() => {
      if (base.heal) me.hp = Math.min(me.maxHp, me.hp + me.maxHp * base.heal);
      if (base.regen) me.buffs.regen = base.regen;
      if (base.buff) { me.buffs[base.buff] = base.dur; a.recalc(); }
      if (base.flask) me.flasks = Math.min(me.maxFlasks, me.flasks + base.flask);
      a.floatText(base.name);
    }, base.tint)) return;
    I.remove(k, 1);
  };
  I.quickUse = i => { const k = I.quick[i]; if (k) I.use(k); else note('Nothing in quick slot ' + (i + 1) + '. Open your satchel [I] to set one.'); };
  I.ammoFor = () => I.count('firearrow') > 0 ? 'firearrow' : I.count('arrow') > 0 ? 'arrow' : null;

  // ================================================================ loot (host rolls, everyone sees, first to take it keeps it)
  const LOOT_CHANCE = { hollow: 0.2, drowned: 0.22, knight: 0.5, arbalist: 0.45, wraith: 0.45 };
  const RW = [52, 26, 13, 6, 2.5, 0.5, 0.12];
  function rollRarity(boost = 0) {
    const w = RW.map((x, i) => x * Math.pow(1 + boost, i));
    let t = Math.random() * w.reduce((s, x) => s + x, 0);
    for (let i = 0; i < w.length; i++) { t -= w[i]; if (t <= 0) return i; }
    return 0;
  }
  const WEAPONS = Object.keys(BASES).filter(b => BASES[b].kind === 'weapon' && !BASES[b].adminOnly);
  const TRINKETS = Object.keys(BASES).filter(b => BASES[b].kind === 'trinket');
  const ARMORS = Object.keys(BASES).filter(b => BASES[b].kind === 'armor');
  const SHIELDS = Object.keys(BASES).filter(b => BASES[b].kind === 'shield');
  const USES = ['draught', 'draught', 'draught', 'potion', 'potion', 'elixir', 'tonic', 'might', 'ironskin', 'embershard', 'firebomb', 'firebomb', 'frostbomb', 'holywater', 'bread', 'bread', 'wine'];
  I.random = function (boost = 0, minR = 0) {
    const roll = Math.random();
    if (roll < 0.25) return I.make(Math.random() < 0.75 ? 'arrow' : 'firearrow', 0, 6 + Math.floor(Math.random() * 14));
    if (roll < 0.55) return I.make(USES[Math.floor(Math.random() * USES.length)], 0, 1 + (Math.random() < 0.3 ? 1 : 0));
    const pool = roll < 0.74 ? WEAPONS : roll < 0.88 ? ARMORS : roll < 0.93 ? SHIELDS : TRINKETS;
    return I.make(pool[Math.floor(Math.random() * pool.length)], Math.max(minR, rollRarity(boost)));
  };
  I.rollLoot = function (e) {          // host only, on an enemy death
    const pos = e.pos;
    if (e.boss) { for (let i = 0; i < 3; i++) I.dropAt(I.random(1.2, 3), pos, i); return; }
    // the knights guarding the first great door carry kite shields: 70% chance to drop one (other knights 15%)
    if (e.type === 'knight' && Math.random() < (e.doorGuard ? 0.7 : 0.15)) I.dropAt(I.make('kite', rollRarity(0.5)), pos, 1);
    if (Math.random() < (LOOT_CHANCE[e.type] || 0)) I.dropAt(I.random(e.type === 'knight' || e.type === 'wraith' ? 0.4 : 0), pos, 0);
  };
  I.dropAt = function (it, pos, i = 0) {
    if (!it) return;
    const a = i * 2.1, x = pos.x + Math.cos(a) * (i ? 1.2 : 0.4), z = pos.z + Math.sin(a) * (i ? 1.2 : 0.4);
    const y = x > 1500 ? pos.y : HC.World.heightAt(x, z);
    G().event({ t: 'loot', id: 'L' + key(), it: { b: it.b, r: it.r, n: it.n, p: it.p || null }, pos: [x, y, z] });
  };
  const loot = new Map();
  I.onEvent = function (e) {
    if (e.t === 'loot') spawnLoot(e);
    if (e.t === 'lootTake') {
      const L = loot.get(e.id); if (!L) return;
      removeLoot(e.id);
      if (e.by === HC.Net.pid) { const it = Object.assign({}, L.it, { k: key() }); if (!it.p) delete it.p; I.add(it); HC.Audio.play((it.r || 0) >= 4 ? 'jingle_rare' : 'pickup', null, 0.7); }
    }
  };
  function spawnLoot(e) {
    if (loot.has(e.id) || !HC.scene) return;
    const it = e.it, col = new THREE.Color(RAR[it.r || 0].color);
    const g = new THREE.Group(); g.position.set(e.pos[0], e.pos[1], e.pos[2]);
    let m = HC.assets.pouch ? HC.World.clone('pouch') : new THREE.Mesh(new THREE.OctahedronGeometry(0.2), new THREE.MeshBasicMaterial({ color: col }));
    m.scale.setScalar(1.3); g.add(m);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.07, 3, 6, 1, true), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(0.6), transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.position.y = 1.5; g.add(beam);
    HC.scene.add(g);
    const L = { id: e.id, it, g, beam, pos: g.position.clone() };
    L.inter = { pos: L.pos, r: 2.2, label: () => `Pick up ${RAR[it.r || 0].name} ${I.name(it)}${it.n > 1 ? ' x' + it.n : ''}`, act: () => G().event({ t: 'lootTake', id: e.id, by: HC.Net.pid }) };
    G().inter.push(L.inter);
    loot.set(e.id, L);
  }
  function removeLoot(id) {
    const L = loot.get(id); if (!L) return;
    HC.scene.remove(L.g); const i = G().inter.indexOf(L.inter); if (i >= 0) G().inter.splice(i, 1);
    loot.delete(id);
  }
  I.clearLoot = () => [...loot.keys()].forEach(removeLoot);
  I.update = function (dt, t) { loot.forEach(L => { L.g.children[0].rotation.y += dt * 1.2; L.beam.material.opacity = 0.16 + Math.sin(t * 3) * 0.06; }); };

  // ================================================================ ember merchant (at shrines, for ashes)
  const SHOP = [['draught', 0, 1, 60], ['potion', 0, 1, 180], ['tonic', 0, 1, 150], ['firebomb', 0, 1, 140], ['arrow', 0, 20, 80], ['firearrow', 0, 10, 220],
    ['leather_head', 0, 1, 120], ['leather_chest', 0, 1, 180], ['leather_arms', 0, 1, 90], ['leather_legs', 0, 1, 120], ['chain_chest', 0, 1, 520], ['longsword', 0, 1, 150], ['dagger', 0, 1, 150], ['axe', 0, 1, 200], ['spear', 0, 1, 200], ['longbow', 0, 1, 220], ['staff', 1, 1, 450], ['hammer', 1, 1, 450], ['scythe', 1, 1, 500], ['crossbow', 1, 1, 450]];
  I.renderShop = function (el) {
    const me = api() && api().me(); if (!me || !el) return;
    el.innerHTML = `<h3>Ember merchant <span class="small">(you have ${me.ash} ashes)</span></h3><div class="shop">${SHOP.map(([b, r, n, cost], i) => {
      const base = B(b), rr = base.r !== undefined ? base.r : r;
      return `<button data-buy="${i}" ${me.ash < cost ? 'disabled' : ''} title="${esc(base.desc)}"><span style="color:${RAR[rr].color}">${I.icon(base)} ${esc(base.name)}${n > 1 ? ' x' + n : ''}</span> <span class="small">${cost}</span></button>`;
    }).join('')}</div>`;
    el.querySelectorAll('[data-buy]').forEach(btn => btn.onclick = () => {
      const [b, r, n, cost] = SHOP[+btn.dataset.buy]; if (me.ash < cost) return;
      if (I.add(I.make(b, r, n))) { me.ash -= cost; HC.Audio.play('coins', null, 0.7); }
      I.renderShop(el);
    });
  };

  // ================================================================ Odo's stall in the village: buy and sell for ashes
  const RAR_PRICE = [1, 1.8, 3.2, 6, 11, 20, 40, 0];
  const SET_PRICE = { leather: 0.8, hunter: 1.1, chain: 1.6, bone: 2.0, plate: 2.6 };
  const SLOT_PRICE = { head: 160, chest: 260, arms: 110, legs: 160 };
  const USE_PRICE = { frostbomb: 200, holywater: 320, bread: 40, wine: 120, draught: 60, potion: 180, elixir: 700, tonic: 150, might: 320, ironskin: 320, embershard: 400, firebomb: 140 };
  I.value = function (b, r = 0, n = 1) {
    const base = B(b); if (!base) return 0;
    let v = 100;
    if (base.kind === 'weapon') v = 220 * (base.dmgMul || 1);
    else if (base.kind === 'armor') v = SLOT_PRICE[base.slot] * (SET_PRICE[base.set] || 1);
    else if (base.kind === 'shield') v = { buckler: 180, kite: 380, tower: 520 }[b] || 300;
    else if (base.kind === 'trinket') v = 300;
    else if (base.kind === 'use') return (USE_PRICE[b] || 100) * n;
    else if (base.kind === 'ammo') return (b === 'firearrow' ? 15 : 4) * n;
    return Math.round(v * RAR_PRICE[Math.max(I.range(b)[0], r || 0)] / 5) * 5;
  };
  let shopTab = 'buy', stockDay = -1, stock = [];
  function rollStock() {
    // staples are always there; ten pieces of equipment change every dawn
    const day = Math.floor((G() && G().t ? G().t : 0) / 60 / ((HC.Settings.v.dayLen || 16)));
    if (day === stockDay && stock.length) return;
    stockDay = day;
    const rnd = (() => { let s = 1013904223 + day * 7919; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();
    stock = [['draught', 0, 1], ['potion', 0, 1], ['tonic', 0, 1], ['bread', 0, 1], ['wine', 0, 1], ['firebomb', 0, 1], ['frostbomb', 0, 1], ['arrow', 0, 20], ['firearrow', 0, 10], ['embershard', 0, 1],
      ['longsword', 0, 1], ['longbow', 0, 1], ['buckler', 0, 1], ['leather_chest', 0, 1], ['leather_head', 0, 1]];
    const gear = Object.keys(BASES).filter(k => ['weapon', 'armor', 'shield'].includes(BASES[k].kind) && I.range(k)[0] <= 2 && !BASES[k].adminOnly);
    for (let i = 0; i < 10; i++) {
      const b = gear[Math.floor(rnd() * gear.length)], x = rnd();
      stock.push([b, x < 0.5 ? 0 : x < 0.8 ? 1 : x < 0.95 ? 2 : 3, 1]);
    }
  }
  I.openShop = function () {
    if (!I.loaded) return;
    document.exitPointerLock && document.exitPointerLock();
    rollStock(); show('shop'); renderShopMenu();
  };
  I.closeShop = function () { show('shop', false); const a = api(); if (a && G().started && !G().ended) a.lock(); };
  $('shopClose').onclick = () => I.closeShop();
  document.querySelectorAll('#shop [data-st]').forEach(b => b.onclick = () => { shopTab = b.dataset.st; renderShopMenu(); });
  function renderShopMenu() {
    const me = api() && api().me(); if (!me) return;
    document.querySelectorAll('#shop [data-st]').forEach(b => b.classList.toggle('sel', b.dataset.st === shopTab));
    $('shopAsh').innerHTML = `You carry <b>${me.ash}</b> ashes. Fresh stock every dawn.`;
    const ware = (base, r, n, price, extra, attr) => `<div class="ware ${extra}" ${attr} title="${esc(base.desc)}"><span class="ico">${I.icon(base)}</span>
      <span class="wn"><span style="color:${RAR[base.r !== undefined ? base.r : r].color}">${esc(base.name)}${n > 1 ? ' x' + n : ''}</span><small>${RAR[base.r !== undefined ? base.r : r].name} ${{ weapon: 'weapon', armor: 'armor', shield: 'shield', use: 'consumable', ammo: 'ammo', trinket: 'trinket' }[base.kind]}</small></span>
      <span class="pr">${price}</span></div>`;
    if (shopTab === 'buy') {
      $('shopBody').innerHTML = '<div class="shopgrid">' + stock.map(([b, r, n], i) => { const p = I.value(b, r, n); return ware(B(b), r, n, p, me.ash < p ? 'poor' : '', `data-buy="${i}"`); }).join('') + '</div>';
      $('shopBody').querySelectorAll('[data-buy]').forEach(el => el.onclick = () => {
        const [b, r, n] = stock[+el.dataset.buy], p = I.value(b, r, n);
        if (me.ash < p) { $('shopMsg').textContent = 'Not enough ashes.'; return; }
        if (I.add(I.make(b, r, n))) { me.ash -= p; HC.Audio.play('coins', null, 0.7); $('shopMsg').textContent = `Bought ${B(b).name}.`; if (BASES[b].kind !== 'use' && BASES[b].kind !== 'ammo') stock.splice(+el.dataset.buy, 1); }
        renderShopMenu();
      });
    } else {
      const list = I.inv.filter(it => !I.isEquipped(it.k) && !I.adminOnly(it.b));
      $('shopBody').innerHTML = list.length ? '<div class="shopgrid">' + list.map(it => ware(B(it.b), it.r, it.n, Math.max(1, Math.round(I.value(it.b, it.r, it.n) * 0.35)), '', `data-sell="${it.k}"`)).join('') + '</div>'
        : '<p class="small">Nothing to sell (equipped things stay on you).</p>';
      $('shopBody').querySelectorAll('[data-sell]').forEach(el => el.onclick = () => {
        const it = I.find(el.dataset.sell); if (!it) return;
        const p = Math.max(1, Math.round(I.value(it.b, it.r, it.n) * 0.35));
        I.remove(it.k); me.ash += p; HC.Audio.play('coins', null, 0.6); $('shopMsg').textContent = `Sold for ${p} ashes.`;
        renderShopMenu();
      });
    }
  }

  // ================================================================ satchel UI
  let sel = null;
  I.open = function () {
    if (!I.loaded) return;
    document.exitPointerLock && document.exitPointerLock();
    show('inventory'); renderInv(); HC.Audio.play && HC.Audio.play('inv_open', null, 0.6);
  };
  I.close = function () { show('inventory', false); const a = api(); if (a && G().started && !G().ended) a.lock(); };
  const slotHtml = (k, label, hint) => {
    const it = I.find(k);
    return `<div class="eslot ${it ? '' : 'empty'}" ${it ? `data-sel="${it.k}" style="border-color:${I.color(it)}"` : ''}><small>${label}</small>${it ? `<b style="color:${I.color(it)}">${I.icon(it.b)} ${esc(I.name(it))}</b>` : `<span class="small">${hint}</span>`}</div>`;
  };
  function itemInfo(it) {
    const base = B(it.b), R = RAR[it.r || 0];
    let lines = [];
    if (base.kind === 'weapon') {
      const S = HC.STYLES[base.style], m = R.mult * (it.p === 'brutal' ? 1.1 : 1);
      lines.push(`Damage ${Math.round(S.light.dmg * m)} / heavy ${Math.round(S.heavy.dmg * m)}${S.heavy.n ? ' x' + S.heavy.n : ''}`);
      if (S.ranged && base.ammo) lines.push(`Arrows: ${I.count('arrow')} iron, ${I.count('firearrow')} ember`);
    }
    if (base.kind === 'trinket') { const [k, v] = I.trinketVal(it); lines.push(STAT_LABEL[k](v)); }
    if (base.kind === 'shield') { const m = 1 - (it.r || 0) * 0.07; lines.push(`Blocked blows: ${Math.round(base.absorb * m * 100)}% gets through, stamina cost x${(base.stab * m).toFixed(2)}`); }
    if (base.kind === 'armor') { lines.push(`Armor <b>${I.armorVal(it)}</b> (${base.slot})`); if (WEIGHT[base.set]) lines.push(`-${(WEIGHT[base.set] * 100).toFixed(1)}% move speed`); }
    if (it.p) lines.push(`<b>${PERKS[it.p].name}:</b> ${PERKS[it.p].desc}`);
    return `<h3 style="color:${R.color}">${I.icon(base)} ${esc(base.name)}${it.n > 1 ? ' x' + it.n : ''}</h3>
      <p class="small">${R.name} ${{ weapon: 'weapon', use: 'consumable', ammo: 'ammunition', trinket: 'trinket', armor: 'armor', shield: 'shield' }[base.kind]}</p>
      <p>${esc(base.desc)}</p>${lines.map(l => `<p class="small">${l}</p>`).join('')}`;
  }
  function renderInv() {
    if (sel && !I.find(sel)) sel = null;
    $('invEquip').innerHTML = slotHtml(I.equip.w, 'Weapon', 'empty') + slotHtml(I.equip.t1, 'Trinket I', 'empty') + slotHtml(I.equip.t2, 'Trinket II', 'empty') +
      slotHtml(I.equip.off, 'Shield', 'empty') + slotHtml(I.equip.head, 'Head', 'empty') + slotHtml(I.equip.chest, 'Chest', 'empty') + slotHtml(I.equip.arms, 'Arms', 'empty') + slotHtml(I.equip.legs, 'Legs', 'empty') +
      `<div class="eslot empty"><small>Armor</small><b>${I.bonus().armor}</b> <span class="small">(-${Math.round((1 - 100 / (100 + I.bonus().armor)) * 100)}% damage)</span></div>` +
      `<div class="qrow">${I.quick.map((k, i) => { const it = I.find(k); return `<div class="qslot" ${it ? `data-sel="${it.k}"` : ''}><small>${i + 1}</small>${it ? `${I.icon(it.b)}<i>${it.n}</i>` : ''}</div>`; }).join('')}</div>`;
    $('invGrid').innerHTML = I.inv.map(it => `<div class="islot ${it.k === sel ? 'sel' : ''} ${I.isEquipped(it.k) ? 'eq' : ''}" data-sel="${it.k}" style="border-color:${I.color(it)}" title="${esc(I.name(it))}">
        <span class="ico">${I.icon(it.b)}</span>${it.n > 1 ? `<i>${it.n}</i>` : ''}${I.isEquipped(it.k) ? '<em>E</em>' : ''}</div>`).join('') +
      Array.from({ length: Math.max(0, MAX_SLOTS - I.inv.length) }, () => '<div class="islot empty"></div>').join('');
    const it = I.find(sel), inGame = G() && G().started;
    $('invInfo').innerHTML = it ? itemInfo(it) + `<div class="row">
        ${['weapon', 'trinket', 'armor', 'shield'].includes(B(it.b).kind) ? (I.isEquipped(it.k) ? '<button data-do="unequip">Unequip</button>' : '<button data-do="equip">Equip</button>') : ''}
        ${B(it.b).kind === 'use' && inGame ? '<button data-do="use">Use</button>' : ''}
        ${B(it.b).kind === 'use' ? [0, 1, 2, 3].map(i => `<button data-q="${i}" class="small">Slot ${i + 1}</button>`).join('') : ''}
        ${inGame && !I.adminOnly(it.b) ? '<button data-do="drop">Drop on the ground</button>' : ''}<button data-do="destroy">Destroy</button></div>`
      : `<p class="small">${I.inv.length}/${MAX_SLOTS} slots. Click an item to see it. Weapons and trinkets: Equip. Potions: put them in a quick slot (keys 1-4).</p>`;
    document.querySelectorAll('#inventory [data-sel]').forEach(el => el.onclick = () => { sel = el.dataset.sel; renderInv(); });
    document.querySelectorAll('#invInfo [data-q]').forEach(b => b.onclick = () => { I.quick = I.quick.map(q => q === sel ? null : q); I.quick[+b.dataset.q] = sel; changed(); });
    document.querySelectorAll('#invInfo [data-do]').forEach(b => b.onclick = () => {
      const d = b.dataset.do;
      if (d === 'equip') I.equipItem(sel);
      if (d === 'unequip') I.unequip(sel);
      if (d === 'use') { I.use(sel); I.close(); }
      if (d === 'drop') { HC.Audio.play('drop_item', null, 0.7); const me = api().me(); const out = I.remove(sel); if (out) I.dropAt(out, me.pos.clone().add(new THREE.Vector3(Math.sin(me.yaw) * 1.2, 0, Math.cos(me.yaw) * 1.2)), 0); }
      if (d === 'destroy' && confirm(`Destroy ${I.name(it)}${it.n > 1 ? ' x' + it.n : ''}? It is gone for good.`)) I.remove(sel);
    });
  }
  $('invClose').onclick = () => I.close();
  $('invTrade').onclick = () => { show('inventory', false); I.openTrade(); };
  addEventListener('keydown', e => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (!$('inventory').classList.contains('hidden') && (e.code === 'KeyI' || e.code === 'Escape')) { e.preventDefault(); e.stopImmediatePropagation(); I.close(); }
    else if (!$('trade').classList.contains('hidden') && e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); I.closeTrade(); }
  }, true);

  // HUD: equipped weapon, ammo and the four quick slots (tap/click a slot to use it)
  I.hud = function () {
    const w = I.weapon(), el = $('quickbar'); if (!el) return;
    const base = w ? B(w.b) : null;
    const ammo = base && base.ammo ? `<span class="ammo">${I.count('firearrow') ? `<b style="color:${RAR[2].color}">${I.count('firearrow')}</b> + ` : ''}${I.count('arrow')} ➶</span>` : '';
    const html = `<div class="qw" style="border-color:${w ? I.color(w) : '#444'}">${base ? I.icon(base) : ''} <span>${base ? esc(base.name) : 'Fists'}</span>${ammo}</div>` +
      I.quick.map((k, i) => { const it = I.find(k); return `<div class="qs" data-qs="${i}" style="border-color:${it ? I.color(it) : '#333'}"><small>${i + 1}</small>${it ? `${I.icon(it.b)}<i>${it.n}</i>` : ''}</div>`; }).join('');
    if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; el.querySelectorAll('[data-qs]').forEach(q => q.onclick = ev => { ev.stopPropagation(); I.quickUse(+q.dataset.qs); }); }
  };

  // ================================================================ Trading Post (online, works on the title screen and in-game)
  // Offer: your items are taken out of your satchel and held in the offer. The other player accepts (gets your
  // items, hands over the ones you asked for), or declines (yours come back). Cancel any time before they answer.
  let ttab = 'new', partner = null, give = new Map(), want = new Map(), trades = [], unwatch = null;
  I.openTrade = function () {
    if (!I.loaded) return;
    document.exitPointerLock && document.exitPointerLock();
    show('trade'); renderTrade(); HC.Audio.play && HC.Audio.play('inv_open', null, 0.5);
  };
  I.closeTrade = function () { show('trade', false); const a = api(); if (a && G().started && !G().ended) a.lock(); };
  $('tradeClose').onclick = () => I.closeTrade();
  document.querySelectorAll('#trade [data-tt]').forEach(b => b.onclick = () => { ttab = b.dataset.tt; renderTrade(); });
  const tmsg = t => { $('tradeMsg').textContent = t || ''; };
  const pickList = (items, map, owner) => items.length ? items.map(it => {
    const on = map.has(it.k), eq = owner === 'me' && I.isEquipped(it.k);
    return `<div class="tpick ${on ? 'on' : ''} ${eq ? 'eq' : ''}" data-pk="${it.k}" data-own="${owner}"><span>${I.icon(it.b)} ${I.label(it)}</span>
      ${on && it.n > 1 ? `<input class="num" type="number" min="1" max="${it.n}" value="${map.get(it.k)}" data-amt="${it.k}" data-own="${owner}">` : ''}${eq ? '<span class="small">equipped</span>' : ''}</div>`;
  }).join('') : '<p class="small">Nothing.</p>';
  async function renderTrade() {
    document.querySelectorAll('#trade [data-tt]').forEach(b => b.classList.toggle('sel', b.dataset.tt === ttab));
    const body = $('tradeBody'), uid = O() && O().uid;
    const mine = trades.filter(t => t.from === uid || t.to === uid);
    const inN = mine.filter(t => t.to === uid && t.status === 'open').length;
    document.querySelector('#trade [data-tt="in"]').textContent = `Incoming${inN ? ` (${inN})` : ''}`;
    if (ttab === 'new') {
      body.innerHTML = `<div class="row"><input id="trWho" placeholder="Player name" maxlength="14" value="${esc(partner ? partner.name : '')}"><button id="trFind">Find</button></div>
        ${partner ? `<div class="tcols"><div><h3>You give</h3>${pickList(I.inv.filter(x => !I.adminOnly(x.b)), give, 'me')}</div><div><h3>You want from ${esc(partner.name)}</h3>${pickList(partner.items.filter(x => !I.adminOnly(x.b)), want, 'them')}</div></div>
        <div class="row"><input id="trNote" placeholder="Message (optional)" maxlength="80"><button id="trSend" class="big">Send offer</button></div>` : '<p class="small">Type the name of the player you want to trade with. They don\'t need to be online: they will see your offer next time they play.</p>'}`;
      $('trFind').onclick = findPartner; $('trWho').onkeydown = e => { if (e.key === 'Enter') findPartner(); };
      body.querySelectorAll('[data-pk]').forEach(el => el.onclick = ev => {
        if (ev.target.tagName === 'INPUT') return;
        const map = el.dataset.own === 'me' ? give : want, list = el.dataset.own === 'me' ? I.inv : partner.items, it = list.find(x => x.k === el.dataset.pk);
        if (!it) return;
        if (el.dataset.own === 'me' && I.isEquipped(it.k) && B(it.b).kind !== 'use') return tmsg('Unequip it first (in your satchel).');
        map.has(it.k) ? map.delete(it.k) : map.set(it.k, it.n); renderTrade();
      });
      body.querySelectorAll('[data-amt]').forEach(inp => inp.onchange = () => { const map = inp.dataset.own === 'me' ? give : want; map.set(inp.dataset.amt, Math.max(1, Math.min(+inp.max, parseInt(inp.value) || 1))); });
      if ($('trSend')) $('trSend').onclick = sendOffer;
    } else {
      const list = mine.filter(t => ttab === 'in' ? t.to === uid : t.from === uid).sort((a, b) => b.created - a.created).slice(0, 40);
      const st = { open: 'waiting', accepted: 'accepted', declined: 'declined', cancelled: 'cancelled', done: 'completed', returned: 'returned' };
      body.innerHTML = list.length ? list.map(t => {
        const other = ttab === 'in' ? t.fromName : t.toName;
        const youGet = ttab === 'in' ? t.give : t.want, youGive = ttab === 'in' ? t.want : t.give;
        const acts = ttab === 'in' && t.status === 'open' ? `<button data-acc="${t.id}">Accept</button><button data-dec="${t.id}">Decline</button>`
          : ttab === 'out' && t.status === 'open' ? `<button data-can="${t.id}">Cancel</button>` : '';
        return `<div class="toffer"><div><b>${ttab === 'in' ? 'From' : 'To'} ${esc(other)}</b> <span class="small">- ${st[t.status] || t.status}${t.note ? ' - "' + esc(t.note) + '"' : ''}</span></div>
          <div class="tcols"><div><small>You get</small>${(youGet || []).map(it => `<div>${I.icon(it.b)} ${I.label(it)}</div>`).join('') || '<div class="small">nothing</div>'}</div>
          <div><small>You give</small>${(youGive || []).map(it => `<div>${I.icon(it.b)} ${I.label(it)}</div>`).join('') || '<div class="small">nothing</div>'}</div></div><div class="row">${acts}</div></div>`;
      }).join('') : '<p class="small">No trades here yet.</p>';
      body.querySelectorAll('[data-acc]').forEach(b => b.onclick = () => accept(b.dataset.acc));
      body.querySelectorAll('[data-dec]').forEach(b => b.onclick = () => O().tradeStatus(b.dataset.dec, 'declined').catch(e => tmsg('Could not decline (' + (e.code || e.message) + ').')));
      body.querySelectorAll('[data-can]').forEach(b => b.onclick = () => O().tradeStatus(b.dataset.can, 'cancelled').catch(e => tmsg('Could not cancel (' + (e.code || e.message) + ').')));
    }
  }
  async function findPartner() {
    const n = $('trWho').value.trim(); if (!n) return;
    tmsg('Looking...');
    try {
      const u = await O().findByName(n);
      if (!u) { partner = null; tmsg(`No player named "${n}".`); return renderTrade(); }
      if (u.uid === O().uid) { tmsg('That is you.'); return; }
      const inv = await O().getInv(u.uid);
      partner = { uid: u.uid, name: u.name, items: (inv && inv.items || []).filter(x => B(x.b)) };
      give.clear(); want.clear(); tmsg('');
    } catch (e) { tmsg('Could not reach the Trading Post (' + (e.code || e.message) + ').'); }
    renderTrade();
  }
  async function sendOffer() {
    if (!partner) return;
    if (!give.size && !want.size) return tmsg('Pick something to give or to ask for.');
    const me = HC.Access && HC.Access.profile;
    const wantItems = [...want].map(([k, n]) => { const it = partner.items.find(x => x.k === k); return it && Object.assign({}, it, { n: Math.min(n, it.n) }); }).filter(Boolean);
    const giveItems = [];
    for (const [k, n] of give) { const out = I.remove(k, n); if (out) giveItems.push(out); }
    try {
      await I.save();
      await O().createTrade({ from: O().uid, fromName: me ? me.name : '?', to: partner.uid, toName: partner.name, give: giveItems, want: wantItems, note: ($('trNote').value || '').slice(0, 80), status: 'open', created: Date.now(), at: Date.now() });
      give.clear(); want.clear(); tmsg(`Offer sent to ${partner.name}. Your items are held until they answer.`); ttab = 'out';
    } catch (e) { giveItems.forEach(it => I.add(it, true)); tmsg('Could not send the offer (' + (e.code || e.message) + '). Your items are back.'); }
    renderTrade();
  }
  async function accept(id) {
    const t = trades.find(x => x.id === id); if (!t || t.status !== 'open') return;
    // you must still hold everything they asked for
    for (const w of t.want || []) { const have = I.find(w.k); if (!have || have.n < w.n) return tmsg(`You no longer have ${I.name(w)}${w.n > 1 ? ' x' + w.n : ''}.`); }
    const free = MAX_SLOTS - I.inv.length + (t.want || []).filter(w => I.find(w.k).n === w.n).length;
    if ((t.give || []).length > free) return tmsg('Your satchel is too full for this trade.');
    try {
      await O().tradeStatus(id, 'accepted');
      (t.want || []).forEach(w => I.remove(w.k, w.n));
      (t.give || []).forEach(it => I.add(Object.assign({}, it, { k: key() }), true));
      await I.save();
      tmsg(`Trade with ${t.fromName} complete.`); HC.Audio.play('pickup', null, 0.7);
    } catch (e) { tmsg('Could not accept (' + (e.code || e.message) + ').'); }
  }
  // the sender's side: collect what you asked for (accepted) or get your items back (declined / cancelled)
  async function settle(list) {
    const uid = O().uid;
    for (const t of list) {
      if (t.from !== uid || !['accepted', 'declined', 'cancelled'].includes(t.status) || t._busy) continue;
      t._busy = true;
      try {
        const next = t.status === 'accepted' ? 'done' : 'returned';
        await O().tradeStatus(t.id, next);
        const items = t.status === 'accepted' ? (t.want || []) : (t.give || []);
        items.forEach(it => I.add(Object.assign({}, it, { k: key() }), true));
        await I.save();
        note(t.status === 'accepted' ? `${t.toName} accepted your trade.` : `Your offer to ${t.toName} was ${t.status}; your items are back.`);
      } catch (e) { t._busy = false; }
    }
  }
  I.startTrades = function () {
    if (unwatch || !O() || !O().ready) return;
    let lastIn = 0;
    unwatch = O().watchTrades(list => {
      trades = list; settle(list);
      const inN = list.filter(t => t.to === O().uid && t.status === 'open').length;
      if (inN > lastIn) note(`New trade offer! Open the Trading Post to see it.`);
      lastIn = inN;
      const b = $('btnTrade'); if (b) b.textContent = inN ? `Trade (${inN})` : 'Trade';
      if (!$('trade').classList.contains('hidden') && ttab !== 'new') renderTrade();
    });
  };
  $('btnTrade').onclick = () => I.openTrade();
  $('btnBag').onclick = () => I.open();
  $('btnTrade2').onclick = () => { show('pause', false); I.openTrade(); };
  $('btnBag2').onclick = () => { show('pause', false); I.open(); };

  // admin: give an item by command
  I.give = function (b, r, n) { const it = I.make(b, r, n); if (it) I.add(it); return it; };
  I.clearAll = function () { I.inv = []; I.equip = emptyEquip(); I.quick = [null, null, null, null]; changed(); };
  I.kit = function () {
    const keep = I.inv.slice(), eq = Object.assign({}, I.equip), q = I.quick.slice();
    starterKit(); const kit = I.inv;
    I.inv = keep; I.equip = eq; I.quick = q;
    kit.forEach(it => I.add(it, true));
    if (!I.equip.w) { const w = I.inv.find(x => B(x.b).kind === 'weapon'); if (w) I.equip.w = w.k; }
    changed();
  };
  // a soft click for every menu button
  addEventListener('click', e => { const b = e.target.closest && e.target.closest('button'); if (b && HC.Audio && HC.Audio.play && !b.closest('#touchUI')) HC.Audio.play('ui_click', null, 0.35); }, true);
})();
