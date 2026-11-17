// THE HOLLOW CROWN - touch controls for phones, tablets and touchscreen Chromebooks.
// Appears automatically the first time the screen is touched. Left half: a floating joystick (push all the way
// to sprint). Right half: drag to look around. Buttons send the same inputs as the keyboard/mouse.
(function () {
  const G = () => HC.Game;
  const $ = id => document.getElementById(id);
  const coarse = matchMedia('(pointer: coarse)').matches;
  let wantTouch = coarse, ui = null, stick = null, look = null;

  const key = (code, down) => dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup',
    { code, key: code === 'Enter' ? 'Enter' : code === 'Space' ? ' ' : code.replace('Key', '').toLowerCase(), bubbles: true }));
  const tap = code => { key(code, true); setTimeout(() => key(code, false), 60); };

  // [label, action, css class] - 'hold' actions stay pressed while the finger is down
  const BUTTONS = [
    ['Attack', { down: () => G().input.attack('attack') }, 'tb-attack big'],
    ['Heavy', { down: () => tap('KeyQ') }, 'tb-heavy'],
    ['Block', { down: () => { G().input.mouse.r = true; }, up: () => { G().input.mouse.r = false; } }, 'tb-block'],
    ['Roll', { down: () => tap('Space') }, 'tb-roll'],
    ['Use', { down: () => key('KeyE', true), up: () => key('KeyE', false) }, 'tb-use'],
    ['Flask', { down: () => tap('KeyR') }, 'tb-flask'],
    ['Lock', { down: () => tap('Tab') }, 'tb-lock'],
  ];
  const TOP = [
    ['Map', () => tap('KeyM')], ['Lamp', () => tap('KeyF')], ['Ping', () => tap('KeyG')],
    ['View', () => tap('KeyV')], ['Chat', () => tap('Enter')], ['☰', () => G().input.pause()],
  ];

  function build() {
    ui = document.createElement('div'); ui.id = 'touchUI';
    ui.innerHTML = `<div id="tStick" class="hidden"><div id="tKnob"></div></div>
      <div class="tTop">${TOP.map(([l], i) => `<button class="tb small" data-top="${i}">${l}</button>`).join('')}</div>
      ${BUTTONS.map(([l, , c], i) => `<button class="tb ${c}" data-b="${i}">${l}</button>`).join('')}
      <div id="tTurn">Turn your device sideways</div>`;
    document.body.appendChild(ui);
    ui.querySelectorAll('[data-b]').forEach(b => {
      const a = BUTTONS[b.dataset.b][1];
      b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (x) { } a.down && a.down(); });
      const up = e => { if (!b.classList.contains('on')) return; b.classList.remove('on'); a.up && a.up(); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    });
    ui.querySelectorAll('[data-top]').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); TOP[b.dataset.top][1](); }));

    // joystick (left part of the screen) and camera look (everywhere else)
    ui.addEventListener('pointerdown', e => {
      if (e.target.closest('.tb')) return;
      e.preventDefault();
      try { ui.setPointerCapture(e.pointerId); } catch (x) { }
      if (e.clientX < innerWidth * 0.42 && !stick) {
        stick = { id: e.pointerId, x: e.clientX, y: e.clientY };
        const s = $('tStick'); s.style.left = e.clientX + 'px'; s.style.top = e.clientY + 'px'; s.classList.remove('hidden');
      } else if (!look) look = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    ui.addEventListener('pointermove', e => {
      if (stick && e.pointerId === stick.id) {
        const R = Math.min(70, innerHeight * 0.12);
        let dx = e.clientX - stick.x, dy = e.clientY - stick.y; const m = Math.hypot(dx, dy);
        if (m > R) { dx *= R / m; dy *= R / m; }
        $('tKnob').style.transform = `translate(${dx}px, ${dy}px)`;
        const inp = G().input; inp.stick.x = dx / R; inp.stick.y = -dy / R;
        inp.keys.ShiftLeft = m > R * 1.05;           // push past the rim to sprint
      } else if (look && e.pointerId === look.id) {
        G().input.look(e.clientX - look.x, e.clientY - look.y); look.x = e.clientX; look.y = e.clientY;
      }
    });
    const end = e => {
      if (stick && e.pointerId === stick.id) {
        stick = null; const inp = G().input; inp.stick.x = inp.stick.y = 0; inp.keys.ShiftLeft = false;
        $('tKnob').style.transform = ''; $('tStick').classList.add('hidden');
      }
      if (look && e.pointerId === look.id) look = null;
    };
    ui.addEventListener('pointerup', end); ui.addEventListener('pointercancel', end);
  }

  function enable() {
    if (!G() || G().touch) return;
    G().touch = true; document.body.classList.add('touch');
    build();
  }
  addEventListener('touchstart', () => { wantTouch = true; }, { passive: true, capture: true });

  // tap to close letters / dialogue / the ember menu (they normally close with E)
  ['reader', 'dialog', 'shrineMenu'].forEach(id => $(id).addEventListener('click', e => {
    if (!wantTouch) return;
    if (id === 'shrineMenu' && e.target.closest('button')) return;
    tap('KeyE');
  }));

  // full screen + landscape when a journey starts from a touch device
  document.addEventListener('click', e => {
    if (!wantTouch || !e.target.closest('#btnSolo, #btnHost, #btnJoin, #btnStart')) return;
    const d = document.documentElement;
    try { const p = d.requestFullscreen ? d.requestFullscreen() : d.webkitRequestFullscreen && d.webkitRequestFullscreen(); if (p && p.then) p.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => { })).catch(() => { }); } catch (x) { }
  }, true);

  // show the controls only while actually playing
  function step() {
    const g = G();
    if (g && g.started && wantTouch && !g.touch) enable();
    if (ui) {
      const hide = !g.started || g.ended || g.input.overlayOpen() || !$('mapOverlay').classList.contains('hidden') || document.activeElement === $('chatIn') || !$('gate').classList.contains('hidden');
      ui.classList.toggle('hidden', hide);
      if (hide && stick) end0();
    }
  }
  (function tick() { step(); requestAnimationFrame(tick); })();
  HC.Touch = { enable: () => { wantTouch = true; step(); }, step };
  function end0() { stick = null; look = null; const inp = G().input; inp.stick.x = inp.stick.y = 0; inp.keys.ShiftLeft = false; inp.mouse.r = false; $('tStick').classList.add('hidden'); }
})();
