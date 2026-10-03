// V-Pong client: menu, settings, online play with prediction, practice vs. computer, rendering, sound.
import { W, H, BALL_R, PAD_W, PAD_H, padY, obstacles, vArms, cloneState, advance, clampPad, missSkip, Match } from './sim.js';

const VERSION = '0.2.0';
const $ = id => document.getElementById(id);
const COLORS = ['#ff4f7a', '#4fd2ff', '#5be3a1', '#ffc94f', '#b77bff', '#ff8a3d'];

// ---------------- Settings ----------------
const DEFAULTS = { name: '', color: COLORS[0], control: 'relativ', sens: 1.3, points: 7, sound: true, vibrate: true, ping: true, installHint: true, paddle: 'v', mitte: false };
let S = { ...DEFAULTS };
try { S = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('vpong-settings') || '{}') }; } catch {}
const saveSettings = () => { try { localStorage.setItem('vpong-settings', JSON.stringify(S)); } catch {} };

function settingsUI() {
  $('sName').value = S.name; $('sControl').value = S.control; $('sSens').value = S.sens; $('sPoints').value = S.points;
  $('sSound').checked = S.sound; $('sVibrate').checked = S.vibrate; $('sPing').checked = S.ping; $('sInstall').checked = S.installHint;
  $('sPaddle').value = S.paddle; $('sMitte').checked = S.mitte;
  const sw = $('sColor'); sw.innerHTML = '';
  for (const c of COLORS) {
    const b = document.createElement('button'); b.style.background = c; b.setAttribute('aria-label', 'Farbe ' + c);
    b.setAttribute('aria-pressed', String(c === S.color));
    b.onclick = () => { S.color = c; saveSettings(); settingsUI(); };
    sw.append(b);
  }
}
$('sName').oninput = e => { S.name = e.target.value.trim(); saveSettings(); };
$('sControl').onchange = e => { S.control = e.target.value; saveSettings(); };
$('sSens').oninput = e => { S.sens = +e.target.value; saveSettings(); };
$('sPoints').onchange = e => { S.points = +e.target.value; saveSettings(); };
$('sSound').onchange = e => { S.sound = e.target.checked; saveSettings(); };
$('sVibrate').onchange = e => { S.vibrate = e.target.checked; saveSettings(); };
$('sPing').onchange = e => { S.ping = e.target.checked; saveSettings(); };
$('sPaddle').onchange = e => { S.paddle = e.target.value; saveSettings(); };
$('sMitte').onchange = e => { S.mitte = e.target.checked; saveSettings(); };
$('sInstall').onchange = e => { S.installHint = e.target.checked; S.installLater = 0; saveSettings(); updateInstallCard(); };

// ---------------- «Als App installieren» – only while running in the browser ----------------
// Chrome/Edge/Samsung offer a real install dialog (beforeinstallprompt) → one button. iPhone/Firefox have none → short steps.
let installEvent = null;
const isInstalled = () => ['standalone', 'fullscreen', 'minimal-ui'].some(m => matchMedia(`(display-mode: ${m})`).matches) || navigator.standalone === true;
function installSteps() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1))
    return 'Unten auf «Teilen» tippen (Quadrat mit Pfeil nach oben) → «Zum Home-Bildschirm».';
  if (/Android/.test(ua)) {
    if (/SamsungBrowser/.test(ua)) return 'Menü ☰ unten rechts → «Seite hinzufügen zu» → «Startbildschirm».';
    if (/Firefox/.test(ua)) return 'Menü ⋮ → «Installieren».';
    return 'Menü ⋮ oben rechts → «App installieren» bzw. «Zum Startbildschirm hinzufügen».';
  }
  if (/Edg\//.test(ua)) return 'In der Adressleiste rechts auf das App-Symbol klicken → «Installieren».';
  if (/Chrome\//.test(ua)) return 'In der Adressleiste rechts auf das Installieren-Symbol klicken.';
  return 'Im Browser-Menü «App installieren» bzw. «Zum Startbildschirm» wählen.';
}
function updateInstallCard() {
  const show = !isInstalled() && S.installHint && !(S.installLater > Date.now());
  $('installCard').hidden = !show; if (!show) return;
  $('installBtn').hidden = !installEvent;
  $('installText').textContent = installEvent ? 'Startet im Vollbild mit eigenem Symbol, wie ein richtiges Spiel.' : installSteps();
}
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; updateInstallCard(); });
addEventListener('appinstalled', () => { installEvent = null; updateInstallCard(); });
$('installBtn').onclick = async () => {
  if (!installEvent) return;
  installEvent.prompt();
  try { await installEvent.userChoice; } catch {}
  installEvent = null; updateInstallCard();
};
$('installLater').onclick = () => { S.installLater = Date.now() + 3 * 864e5; saveSettings(); updateInstallCard(); };   // 3 days quiet

// ---------------- Screens ----------------
const SCREENS = ['menu', 'lobby', 'join', 'settings', 'over'];
function show(name) {
  for (const s of SCREENS) $(s).hidden = s !== name;
  $('hud').hidden = name !== null && name !== 'over';
}
document.addEventListener('click', e => {
  const go = e.target.closest('[data-go]')?.dataset.go; if (!go) return;
  audioUnlock();
  if (go === 'menu') { game?.stop(); show('menu'); }
  else if (go === 'settings') { settingsUI(); show('settings'); }
  else if (go === 'join') { $('joinErr').textContent = ''; show('join'); $('joinCode').focus(); }
  else if (go === 'create') createGame();
  else if (go === 'practice') { game?.stop(); game = new Game('practice'); show(null); }
});
$('joinBtn').onclick = () => joinGame($('joinCode').value.trim());
$('joinCode').onkeydown = e => { if (e.key === 'Enter') joinGame($('joinCode').value.trim()); };
$('leaveBtn').onclick = () => { game?.stop(); show('menu'); history.replaceState(null, '', location.pathname); };
$('overMenu').onclick = () => { game?.stop(); show('menu'); };
$('againBtn').onclick = () => game?.again();
$('shareBtn').onclick = async () => {
  const code = $('lobbyCode').textContent, url = `${location.origin}${location.pathname}?raum=${code}`;
  try { if (navigator.share) return await navigator.share({ title: 'V-Pong', text: `Spiel mit mir V-Pong! Code ${code}`, url }); } catch { return; }
  try { await navigator.clipboard.writeText(url); $('lobbyText').textContent = 'Link kopiert – schick ihn deinem Gegner'; } catch { $('lobbyText').textContent = url; }
};

let game = null;
const rulesText = (cfg, pts) => `${cfg.pad === 'v' ? 'V-Schläger' : 'Strich'} · ${cfg.mitte ? 'mit' : 'ohne'} Mitte · bis ${pts}`;
function createGame() {
  game?.stop();
  const code = String(Math.floor(1000 + Math.random() * 9000));
  $('lobbyCode').textContent = code; $('lobbyText').textContent = 'Verbinde …'; $('lobbyRules').textContent = rulesText({ pad: S.paddle, mitte: S.mitte }, S.points); show('lobby');
  game = new Game('online', { code, create: true });
}
function joinGame(code) {
  if (!/^\d{4}$/.test(code)) { $('joinErr').textContent = 'Bitte den 4-stelligen Code eingeben'; return; }
  game?.stop(); $('joinErr').textContent = 'Verbinde …';
  game = new Game('online', { code, create: false });
}

// ---------------- Sound ----------------
let AC = null;
function audioUnlock() { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch {} }
function beep(freq, dur = 0.05, type = 'square', vol = 0.06) {
  if (!S.sound || !AC) return;
  const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime;
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(AC.destination); o.start(t); o.stop(t + dur);
}
const SOUND = { wall: () => beep(300), obstacle: () => beep(720, 0.06, 'triangle', 0.09), hit: () => beep(520, 0.06),
  point: () => { beep(440, 0.12, 'sine', 0.1); setTimeout(() => beep(330, 0.18, 'sine', 0.1), 110); } };

// ---------------- Canvas ----------------
const cv = $('field'), ctx = cv.getContext('2d');
let view = { s: 1, ox: 0, oy: 0, dpr: 1 };
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), cw = innerWidth, ch = innerHeight;
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
  const s = Math.min(cw / W, ch / H) * 0.96;
  view = { s, ox: (cw - W * s) / 2, oy: (ch - H * s) / 2, dpr };
}
addEventListener('resize', resize); resize();

// ---------------- Game ----------------
class Game {
  constructor(mode, opt = {}) {
    this.mode = mode; this.opt = opt; this.me = 0; this.myX = W / 2; this.oppX = W / 2;
    this.keys = new Set(); this.trail = []; this.err = { x: 0, y: 0 }; this.lastSound = 0; this.running = true;
    this.myHist = []; this.lastSend = 0; this.sentX = null; this.reported = -1e9; this.override = null;
    this.offset = null; this.rtts = []; this.snap = null; this.snapN = 0; this.meta = [null, null]; this.lastScore = null;
    this.bindInput();
    if (mode === 'practice') this.startPractice(); else this.connect();
    this.wake();
    this.frame = this.frame.bind(this); this.lastFrame = performance.now(); requestAnimationFrame(this.frame);
  }

  // ----- practice vs. computer: the same Match class the server uses, run locally -----
  startPractice() {
    this.m = new Match(S.points, { pad: S.paddle, mitte: S.mitte }); this.m.hold = 0;
    this.m.onEvent = e => this.sound(e, 0); this.aiX = W / 2; this.aiNext = 0; this.aiTarget = W / 2;
    this.m.start(performance.now());
  }
  ai(now, dt) {
    const s = this.m.s;
    if (now >= this.aiNext) {
      this.aiNext = now + 120; this.aiTarget = W / 2;
      if (s.ball.vy < 0 && (s.phase === 'play' || s.phase === 'serve')) {
        const c = cloneState(s); let x = null;
        advance(c, c.t + 2500, (sd, t) => (sd === 1 ? -1e4 : this.m.padAt(0, t)), e => { if (x === null && e.type === 'contact' && e.side === 1) x = e.ballIn.x; });
        if (x !== null) this.aiTarget = x + (Math.random() - 0.5) * 70;
      }
    }
    const sp = 640 * dt; this.aiX = clampPad(this.aiX + Math.max(-sp, Math.min(sp, this.aiTarget - this.aiX)));
  }

  // ----- online -----
  connect() {
    const { code, create } = this.opt, proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const token = sessionStorage.getItem('vpong-token-' + code) || '';
    const q = new URLSearchParams({ raum: code, token, ...(create && !this.joined ? { create: '1', punkte: String(S.points), schlaeger: S.paddle, mitte: S.mitte ? '1' : '0' } : {}) });
    const ws = this.ws = new WebSocket(`${proto}://${location.host}/ws?${q}`);
    ws.onopen = () => {
      this.send({ t: 'hello', name: S.name || (create ? 'Spieler 1' : 'Spieler 2'), color: S.color });
      for (let i = 0; i < 5; i++) setTimeout(() => this.ping(), i * 120);
      clearInterval(this.pingTimer); this.pingTimer = setInterval(() => this.ping(), 1000);
    };
    ws.onmessage = e => this.onMsg(JSON.parse(e.data));
    ws.onclose = () => {
      clearInterval(this.pingTimer);
      if (!this.running || this.failed) return;
      if (!this.joined) { $('joinErr').textContent = 'Keine Verbindung zum Server'; return; }
      this.banner('Verbindung weg – verbinde neu …');
      setTimeout(() => this.running && this.connect(), 1000);
    };
  }
  send(m) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m)); }
  ping() { this.send({ t: 'ping', c: performance.now() }); }
  serverNow() { return performance.now() + (this.offset ?? 0); }
  onMsg(m) {
    if (m.t === 'error') {
      this.failed = true;
      if (m.code === 'besetzt') return createGame();          // code taken by someone else → just pick another one
      show('join'); $('joinErr').textContent = m.code === 'voll' ? 'Der Raum ist schon voll' : 'Raum nicht gefunden – Code prüfen';
      return;
    }
    if (m.t === 'joined') {
      this.joined = true; this.me = m.side; this.rules = m; sessionStorage.setItem('vpong-token-' + this.opt.code, m.token);
      history.replaceState(null, '', `?raum=${this.opt.code}`);
      if (this.opt.create && m.side === 0 && !this.meta[1]) { $('lobbyText').textContent = 'Warte auf Gegner …'; show('lobby'); }
      else show(null);
    } else if (m.t === 'pong') {
      const now = performance.now(), rtt = now - m.c;
      this.rtts.push({ rtt, off: m.s + rtt / 2 - now }); if (this.rtts.length > 12) this.rtts.shift();
      this.offset = this.rtts.reduce((a, b) => (b.rtt < a.rtt ? b : a)).off;   // best sample = least queueing
    } else if (m.t === 'meta') {
      this.meta = m.players;
      if (this.meta[0] && this.meta[1] && !$('lobby').hidden) show(null);
    } else if (m.t === 's') {
      this.prevBase = this.snap ? this.base() : null;
      this.snap = m; this.snapN++;
    }
  }
  // what the prediction starts from: the server state – or my own hit while the server hasn't processed it yet
  base() {
    const b = cloneState(this.snap.s), o = this.override;
    if (o && this.snap.ack[this.me] < o.ct - 0.5) {
      b.zone = [...b.zone]; b.zone[this.me] = null; b.phase = 'play';
      if (o.hit) { b.t = o.ct; b.ball = { ...o.ball }; }
      else { b.t = o.tin; b.ball = { ...o.ballIn }; b.skipFrom = o.tin; }   // my miss: replay without my paddle
    } else this.override = null;
    return b;
  }
  padAtOnline = (side, t) => {
    if (side !== this.me) return this.snap.p[side];
    const h = this.myHist;
    for (let i = h.length - 1; i >= 0; i--) if (h[i].at <= t) return h[i].x;
    return h.length ? h[0].x : this.myX;
  };
  predict(base, now, evs) {
    const skip = base.skipFrom != null ? missSkip(this.me, base.skipFrom) : null;
    return advance(base, now, this.padAtOnline, evs ? e => evs.push(e) : () => {}, skip);
  }

  // ----- per frame -----
  frame(t) {
    if (!this.running) return;
    const dt = Math.min(0.05, (t - this.lastFrame) / 1000); this.lastFrame = t;
    const kv = (this.keys.has('right') ? 1 : 0) - (this.keys.has('left') ? 1 : 0);
    if (kv) this.myX = clampPad(this.myX + kv * 900 * dt * (this.me === 1 ? -1 : 1));
    let s;
    if (this.mode === 'practice') {
      const now = performance.now();
      this.m.setPad(0, this.myX, now); this.ai(now, dt); this.m.setPad(1, this.aiX, now);
      this.m.tick(now); s = this.m.s; this.oppX = this.aiX;
      this.scoreSound(s);
    } else if (this.snap && this.offset !== null) {
      const now = this.serverNow();
      this.myHist.push({ at: now, x: this.myX }); while (this.myHist.length > 2 && this.myHist[1].at < now - 2000) this.myHist.shift();
      if ((this.myX !== this.sentX && now - this.lastSend > 33) || now - this.lastSend > 300) {
        this.send({ t: 'p', x: Math.round(this.myX * 10) / 10, at: Math.round(now) }); this.sentX = this.myX; this.lastSend = now;
      }
      const evs = [];
      s = this.predict(this.base(), now, evs);
      // smooth corrections: a new server state moves the prediction → show the jump as a quickly fading offset
      if (this.prevBase) {
        const old = this.predict(this.prevBase, now), dx = old.ball.x - s.ball.x, dy = old.ball.y - s.ball.y;
        if (old.phase === s.phase && Math.hypot(dx, dy) < 150) { this.err.x += dx; this.err.y += dy; } else this.err = { x: 0, y: 0 };
        this.prevBase = null;
      }
      for (const e of evs) {
        if (e.type === 'contact' && e.side === this.me && Math.abs(e.t - this.reported) > 150) {
          this.reported = e.t;
          this.override = { ct: e.t, tin: e.tin, hit: e.hit, ball: e.ball, ballIn: e.ballIn };
          this.send({ t: 'c', ct: e.t, hit: e.hit, ball: e.ball });
        }
        if (e.t > this.lastSound && e.t <= now) this.sound(e, this.me);
      }
      this.lastSound = now;
      this.oppX += (this.snap.p[1 - this.me] - this.oppX) * Math.min(1, dt * 25);
      this.scoreSound(s);
      if (S.ping && this.rtts.length) $('ping').textContent = Math.round(this.rtts.slice(-5).map(r => r.rtt).sort((a, b) => a - b)[Math.min(2, this.rtts.slice(-5).length - 1)]) + ' ms';
    }
    if (!S.ping) $('ping').textContent = '';
    const k = Math.exp(-dt / 0.07); this.err.x *= k; this.err.y *= k;
    if (s) { this.status(s); this.draw(s); }
    requestAnimationFrame(this.frame);
  }
  sound(e, me) {
    if (e.type === 'wall') SOUND.wall();
    else if (e.type === 'obstacle') SOUND.obstacle();
    // bar: one sound per hit; V: one per wall touched inside the V (the final contact comes when it leaves the V)
    else if (e.type === 'paddle' || (e.type === 'contact' && e.hit && e.tin === e.t)) { SOUND.hit(); if (e.side === me && S.vibrate) navigator.vibrate?.(15); }
  }
  scoreSound(s) {
    const key = s.score.join(':');
    if (this.lastScore !== null && key !== this.lastScore) SOUND.point();
    this.lastScore = key;
  }
  status(s) {
    const opp = this.mode === 'practice' ? 'Computer' : this.meta[1 - this.me]?.name || 'Gegner';
    if (s.phase === 'over') {
      if ($('over').hidden) {
        const won = s.winner === this.me;
        $('overTitle').textContent = won ? 'Gewonnen!' : 'Verloren';
        $('overScore').textContent = `${s.score[this.me]} : ${s.score[1 - this.me]} gegen ${opp}`;
        $('againBtn').textContent = 'Revanche'; $('againBtn').disabled = false; show('over');
      }
      return this.banner('');
    }
    if (!$('over').hidden) show(null);
    if (s.phase === 'wait') this.banner('Warte auf Gegner …');
    else if (s.phase === 'pause') this.banner(`${opp} ist weg – warte …`);
    else if (s.phase === 'serve') this.banner(s.until - s.t > 1300 ? `gegen ${opp}
${rulesText(s.cfg, this.mode === 'practice' ? S.points : this.rules?.points)}` : '');
    else this.banner('');
  }
  banner(text) { if ($('banner').textContent !== text) $('banner').textContent = text; }
  again() {
    if (this.mode === 'practice') { this.m.start(performance.now()); show(null); return; }
    this.send({ t: 'again' }); $('againBtn').textContent = 'Warte auf Gegner …'; $('againBtn').disabled = true;
  }

  // ----- input: own paddle reacts immediately, the server only hears about it -----
  toField(cx, cy) {
    let x = (cx - view.ox) / view.s, y = (cy - view.oy) / view.s;
    if (this.me === 1) { x = W - x; y = H - y; }
    return { x, y };
  }
  bindInput() {
    // absolut: paddle sits under finger/mouse. relativ: finger drag (anywhere) or mouse movement moves it by the distance × sensitivity.
    // A mouse counts without pressing a button; a finger only while it touches.
    this.lastX = null;
    this.onDown = e => {
      audioUnlock(); this.down = true; this.lastX = e.clientX;
      if (S.control === 'absolut') this.myX = clampPad(this.toField(e.clientX, e.clientY).x);
    };
    this.onMove = e => {
      if (!this.down && e.pointerType !== 'mouse') return;
      if (S.control === 'absolut') { this.myX = clampPad(this.toField(e.clientX, e.clientY).x); return; }
      if (this.lastX !== null) this.myX = clampPad(this.myX + (e.clientX - this.lastX) / view.s * S.sens * (this.me === 1 ? -1 : 1));
      this.lastX = e.clientX;
    };
    this.onUp = e => { this.down = false; if (e.pointerType !== 'mouse') this.lastX = null; };
    this.onKey = e => {
      const k = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' }[e.key]; if (!k) return;
      e.type === 'keydown' ? this.keys.add(k) : this.keys.delete(k); e.preventDefault();
    };
    cv.addEventListener('pointerdown', this.onDown); cv.addEventListener('pointermove', this.onMove);
    addEventListener('pointerup', this.onUp); addEventListener('pointercancel', this.onUp);
    addEventListener('keydown', this.onKey); addEventListener('keyup', this.onKey);
  }
  async wake() { try { this.lock = await navigator.wakeLock?.request('screen'); } catch {} }
  stop() {
    this.running = false; clearInterval(this.pingTimer); try { this.ws?.close(); } catch {}
    cv.removeEventListener('pointerdown', this.onDown); cv.removeEventListener('pointermove', this.onMove);
    removeEventListener('pointerup', this.onUp); removeEventListener('pointercancel', this.onUp);
    removeEventListener('keydown', this.onKey); removeEventListener('keyup', this.onKey);
    try { this.lock?.release(); } catch {}
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); $('ping').textContent = ''; this.banner('');
  }

  // ----- drawing (own paddle always at the bottom: the top player sees the field turned by 180°) -----
  draw(s) {
    const { s: sc, ox, oy, dpr } = view, flip = this.me === 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#0b1020'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * ox, dpr * oy);
    // field
    ctx.fillStyle = '#10173a'; ctx.strokeStyle = '#26305a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(0, 0, W, H, 18); ctx.fill(); ctx.stroke();
    ctx.setLineDash([14, 16]); ctx.strokeStyle = '#1f2850'; ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke(); ctx.setLineDash([]);
    // scores (upright, own score in the own half)
    ctx.fillStyle = 'rgba(232,236,255,.08)'; ctx.font = '900 150px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(s.score[this.me]), W / 2, H * 0.75); ctx.fillText(String(s.score[1 - this.me]), W / 2, H * 0.25);
    if (flip) { ctx.translate(W, H); ctx.scale(-1, -1); }
    // the V
    ctx.lineCap = 'round'; ctx.strokeStyle = '#9d8cff'; ctx.shadowColor = '#7b68ff'; ctx.shadowBlur = 18;
    for (const c of obstacles(s)) { ctx.lineWidth = c.r * 2; ctx.beginPath(); ctx.moveTo(c.ax, c.ay); ctx.lineTo(c.bx, c.by); ctx.stroke(); }
    // paddles
    const myCol = S.color, oppCol = (this.mode === 'online' && this.meta[1 - this.me]?.color) || (myCol === COLORS[1] ? COLORS[0] : COLORS[1]);
    const pads = [];
    pads[this.me] = { x: this.myX, c: myCol }; pads[1 - this.me] = { x: this.oppX, c: oppCol };
    for (const side of [0, 1]) {
      ctx.fillStyle = pads[side].c; ctx.shadowColor = pads[side].c; ctx.shadowBlur = 16;
      if (s.cfg.pad === 'v') {
        const [l, r] = vArms(side, pads[side].x);
        ctx.strokeStyle = pads[side].c; ctx.lineWidth = l.r * 2; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(l.bx, l.by); ctx.lineTo(l.ax, l.ay); ctx.lineTo(r.bx, r.by); ctx.stroke();
      } else { ctx.beginPath(); ctx.roundRect(pads[side].x - PAD_W / 2, padY(side) - PAD_H / 2, PAD_W, PAD_H, PAD_H / 2); ctx.fill(); }
    }
    // ball + trail
    const bx = s.ball.x + this.err.x, by = s.ball.y + this.err.y;
    if (s.phase === 'play') { this.trail.push({ x: bx, y: by }); if (this.trail.length > 8) this.trail.shift(); } else this.trail = [];
    ctx.shadowBlur = 0;
    this.trail.forEach((p, i) => { ctx.fillStyle = `rgba(255,255,255,${(i + 1) / this.trail.length * 0.18})`; ctx.beginPath(); ctx.arc(p.x, p.y, BALL_R * (0.5 + i / 16), 0, 7); ctx.fill(); });
    if (s.phase !== 'wait') {
      ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = s.phase === 'serve' ? 6 : 20;
      ctx.globalAlpha = s.phase === 'serve' ? 0.5 + 0.5 * Math.abs(Math.sin(performance.now() / 150)) : 1;
      ctx.beginPath(); ctx.arc(bx, by, BALL_R, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.shadowBlur = 0;
  }
}

// ---------------- Start ----------------
$('version').textContent = 'Version ' + VERSION;
updateInstallCard();
const raum = new URLSearchParams(location.search).get('raum');
if (raum && /^\d{4}$/.test(raum)) { $('joinCode').value = raum; show('join'); joinGame(raum); } else show('menu');
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
window.__vpong = { get game() { return game; }, VERSION };   // for tests
