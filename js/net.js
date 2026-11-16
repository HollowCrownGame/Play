// THE HOLLOW CROWN - co-op transport over WebRTC (PeerJS). Host-authoritative star topology.
(function () {
  const N = HC.Net = { mode: 'solo', pid: 'p0', conns: new Map(), handler: null, peer: null };
  const PREFIX = 'hollowcrown-v1-';
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const code = () => Array.from({ length: 5 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');

  N.available = () => typeof Peer !== 'undefined';
  N.isHost = () => N.mode !== 'client';

  N.host = function (cb) {
    if (!N.available()) return cb.error('Networking library failed to load (are you offline?)');
    const c = code();
    const peer = new Peer(PREFIX + c, { debug: 0 });
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
        if (!prev && N.conns.size >= 3) { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 300); return; }
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

  N.join = function (c, cb) {
    if (!N.available()) return cb.error('Networking library failed to load (are you offline?)');
    const peer = new Peer(undefined, { debug: 0 });
    N.peer = peer; N.mode = 'client';
    let opened = false;
    peer.on('open', () => {
      if (N.hostConn) return; // PeerJS can re-fire 'open' after a signalling reconnect
      const conn = peer.connect(PREFIX + c.toUpperCase(), { reliable: true });
      N.hostConn = conn;
      conn.on('open', () => { opened = true; cb.ready(); });
      conn.on('data', m => {
        if (m.t === 'welcome') N.pid = m.pid;
        if (m.t === 'full') cb.error('That journey already has four travelers.');
        N.handler && N.handler(m, 'p0');
      });
      conn.on('close', () => N.handler && N.handler({ t: 'hostLost' }, 'p0'));
      setTimeout(() => { if (!opened) cb.error('No journey found with that code.'); }, 9000);
    });
    peer.on('error', e => cb.error(e.type === 'peer-unavailable' ? 'No journey found with that code.' : 'Connection error: ' + e.type));
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
