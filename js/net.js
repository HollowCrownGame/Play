// THE HOLLOW CROWN - co-op transport over WebRTC (PeerJS). Host-authoritative star topology.
(function () {
  const N = HC.Net = { mode: 'solo', pid: 'p0', conns: new Map(), handler: null, peer: null };
  const PREFIX = 'hollowcrown-v1-';
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const code = () => Array.from({ length: 5 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');

  N.available = () => typeof Peer !== 'undefined';
  N.isHost = () => N.mode !== 'client';

  // ICE servers: public STUN (finds a direct route) + optional TURN relay from js/net-config.js (for networks
  // that block direct device-to-device links: schools, offices, many mobile carriers)
  let iceCache = null;
  N.relay = false;
  async function iceServers() {
    if (iceCache) return iceCache;
    const cfg = window.HC_TURN || {};
    let list = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
    if (cfg.meteredApp && cfg.apiKey) {
      try {
        const r = await fetch(`https://${cfg.meteredApp}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(cfg.apiKey)}`);
        const extra = await r.json(); if (Array.isArray(extra) && extra.length) { list = list.concat(extra); N.relay = true; }
      } catch (e) { console.warn('relay credentials', e); }
    }
    if (Array.isArray(cfg.iceServers) && cfg.iceServers.length) { list = list.concat(cfg.iceServers); N.relay = true; }
    return (iceCache = list);
  }
  const peerOpts = async () => ({ debug: 0, config: { iceServers: await iceServers() } });

  N.host = async function (cb) {
    if (!N.available()) return cb.error('Networking library failed to load (are you offline?)');
    const c = code();
    const peer = new Peer(PREFIX + c, await peerOpts());
    N.peer = peer; N.mode = 'host'; N.pid = 'p0'; N.code = c;
    peer.on('open', () => cb.ready(c));
    peer.on('error', e => {
      if (e.type === 'unavailable-id') { peer.destroy(); N.host(cb); }
      else cb.error('Connection error: ' + e.type);
    });
    peer.on('connection', conn => {
      conn.on('open', () => {
        const prev = N.conns.get(conn.peer);
        if (prev) { prev.dead = true; try { prev.conn.close(); } catch (e) { } }
        if (!prev && N.conns.size >= (N.maxPlayers || 4) - 1) { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 300); return; }
        const used = new Set([...N.conns.values()].filter(v => v !== prev).map(v => v.pid));
        let slot = 1; while (used.has('p' + slot)) slot++;
        const pid = prev ? prev.pid : 'p' + slot;
        const entry = { conn, pid };
        N.conns.set(conn.peer, entry);
        conn.on('data', m => !entry.dead && N.handler && N.handler(m, pid));
        const bye = () => {
          if (entry.dead || N.conns.get(conn.peer) !== entry) return;
          entry.dead = true; N.conns.delete(conn.peer); N.handler && N.handler({ t: 'leave' }, pid);
        };
        conn.on('close', bye); conn.on('error', bye);
        N.handler && N.handler({ t: 'connect', slot }, pid);
      });
    });
  };

  N.join = async function (c, cb) {
    if (!N.available()) return cb.error('Networking library failed to load (are you offline?)');
    const peer = new Peer(undefined, await peerOpts());
    N.peer = peer; N.mode = 'client';
    let opened = false, failed = false;
    const fail = msg => { if (opened || failed) return; failed = true; cb.error(msg); };
    peer.on('open', () => {
      if (N.hostConn) return; // PeerJS can re-fire 'open' after a signalling reconnect
      cb.status && cb.status('Found the signal server. Reaching the host...');
      const conn = peer.connect(PREFIX + c.toUpperCase(), { reliable: true });
      N.hostConn = conn;
      conn.on('open', () => { opened = true; cb.ready(); });
      conn.on('data', m => {
        if (m.t === 'welcome') N.pid = m.pid;
        if (m.t === 'full') cb.error('That journey is full.');
        N.handler && N.handler(m, 'p0');
      });
      conn.on('close', () => N.handler && N.handler({ t: 'hostLost' }, 'p0'));
      // the code was valid (no 'peer-unavailable' error) but no link formed: the network blocks direct connections
      setTimeout(() => fail(N.relay
        ? 'Could not reach the host, even through the relay. Check the code and that the host is still in the lobby.'
        : 'Found the journey, but this network blocks direct connections between devices (common on school and work Wi-Fi). The Maker can switch on the relay (SETUP.md, part 6).'), 20000);
    });
    peer.on('error', e => fail(e.type === 'peer-unavailable' ? 'No journey found with that code. Check it, and that the host is still in the lobby.'
      : e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error' ? 'Could not reach the co-op signal server (the network may block it).'
      : 'Connection error: ' + e.type));
  };

  // client → host, or host → everyone
  N.send = function (m) {
    if (N.mode === 'client') { if (N.hostConn && N.hostConn.open) N.hostConn.send(m); }
    else if (N.mode === 'host') N.conns.forEach(v => v.conn.open && v.conn.send(m));
  };
  N.broadcast = function (m, exceptPid) {
    if (N.mode !== 'host') return;
    N.conns.forEach(v => { if (v.pid !== exceptPid && v.conn.open) v.conn.send(m); });
  };
  N.sendTo = function (pid, m) {
    if (N.mode !== 'host') return;
    N.conns.forEach(v => { if (v.pid === pid && v.conn.open) v.conn.send(m); });
  };
  N.close = function () {
    try { N.peer && N.peer.destroy(); } catch (e) { }
    N.conns.clear(); N.peer = null; N.hostConn = null; N.mode = 'solo'; N.pid = 'p0';
  };
})();
