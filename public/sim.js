// Shared game simulation – the SAME file runs in the Durable Object (authoritative) and in the browser
// (prediction + practice mode). Fixed time step, field in abstract units (portrait: bottom = side 0, top = side 1).
export const W = 600, H = 1000;
export const BALL_R = 12, PAD_W = 120, PAD_H = 16, PAD_Y = 70;
export const STEP_MS = 1000 / 120;
const V0 = 520, VMAX = 1150, SPEEDUP = 1.045, MAX_ANGLE = 1.0, MIN_VY = 0.28;
const SERVE_MS = 1200, START_MS = 1800;

export const padY = side => (side === 0 ? H - PAD_Y : PAD_Y);
const faceY = side => (side === 0 ? padY(0) - PAD_H / 2 - BALL_R : padY(1) + PAD_H / 2 + BALL_R);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const clampPad = x => clamp(x, PAD_W / 2, W - PAD_W / 2);

// The «V» in the middle: two thick bars meeting in an apex; `open` = side the V opens to (+1 right, -1 left),
// flips after every point so nobody is permanently favoured.
export function obstacles(open) {
  const cx = W / 2, cy = H / 2, r = 7, ax = cx - open * 55;
  return [
    { ax, ay: cy, bx: cx + open * 75, by: cy - 115, r },
    { ax, ay: cy, bx: cx + open * 75, by: cy + 115, r },
  ];
}

export function newState(now) {
  return { t: now, phase: 'wait', until: 0, ball: { x: W / 2, y: H / 2, vx: 0, vy: 0 }, score: [0, 0], open: 1, winner: -1 };
}
export const cloneState = s => ({ ...s, ball: { ...s.ball }, score: [...s.score] });

// one fixed step; padAt(side, t) gives the paddle x at time t; ev(event) receives wall/obstacle/contact/out events
function step(s, padAt, emit, skip) {
  s.t += STEP_MS;
  const ev = e => emit({ t: s.t, ...e });     // every event carries its time (clients dedupe sounds with it)
  if (s.phase === 'serve' && s.t >= s.until) s.phase = 'play';
  if (s.phase !== 'play') return;
  const dt = STEP_MS / 1000, b = s.ball, px = b.x, py = b.y;
  b.x += b.vx * dt; b.y += b.vy * dt;
  if (b.x < BALL_R) { b.x = 2 * BALL_R - b.x; b.vx = Math.abs(b.vx); ev({ type: 'wall' }); }
  else if (b.x > W - BALL_R) { b.x = 2 * (W - BALL_R) - b.x; b.vx = -Math.abs(b.vx); ev({ type: 'wall' }); }
  let bounced = false;
  for (const c of obstacles(s.open)) bounced = capsule(b, c) || bounced;
  if (bounced) { minVertical(b); ev({ type: 'obstacle' }); }
  for (const side of [0, 1]) {
    if (side === 0 ? b.vy <= 0 : b.vy >= 0) continue;
    const face = faceY(side);
    if (!(side === 0 ? py <= face && b.y > face : py >= face && b.y < face)) continue;
    const f = (face - py) / (b.y - py), tc = s.t - STEP_MS + f * STEP_MS, cx = px + (b.x - px) * f;
    if (skip && skip(side, tc)) continue;
    const ballIn = { x: cx, y: face, vx: b.vx, vy: b.vy };
    const reach = PAD_W / 2 + BALL_R * 0.8, off = (cx - padAt(side, tc)) / reach, hit = Math.abs(off) <= 1;
    if (hit) {
      const sp = Math.min(Math.hypot(b.vx, b.vy) * SPEEDUP, VMAX), a = off * MAX_ANGLE, rest = (1 - f) * dt;
      b.vx = sp * Math.sin(a); b.vy = (side === 0 ? -1 : 1) * sp * Math.cos(a);
      b.x = cx + b.vx * rest; b.y = face + b.vy * rest;
    }
    ev({ type: 'contact', side, t: tc, hit, ballIn, ball: hit ? { x: cx, y: face, vx: b.vx, vy: b.vy } : null });
  }
  if (b.y > H + 3 * BALL_R) { s.phase = 'out'; ev({ type: 'out', side: 0, t: s.t }); }
  else if (b.y < -3 * BALL_R) { s.phase = 'out'; ev({ type: 'out', side: 1, t: s.t }); }
}

// circle vs. thick segment: push out along the normal, reflect if moving into it
function capsule(b, c) {
  const dx = c.bx - c.ax, dy = c.by - c.ay;
  const u = clamp(((b.x - c.ax) * dx + (b.y - c.ay) * dy) / (dx * dx + dy * dy), 0, 1);
  const qx = c.ax + u * dx, qy = c.ay + u * dy, R = BALL_R + c.r;
  let nx = b.x - qx, ny = b.y - qy; const d = Math.hypot(nx, ny);
  if (d >= R || d === 0) return false;
  nx /= d; ny /= d; b.x = qx + nx * R; b.y = qy + ny * R;
  const vn = b.vx * nx + b.vy * ny;
  if (vn >= 0) return false;
  b.vx -= 2 * vn * nx; b.vy -= 2 * vn * ny;
  return true;
}
// after a strange V bounce the ball must still travel towards a goal (no endless wall-to-wall ping)
function minVertical(b) {
  const sp = Math.hypot(b.vx, b.vy), min = sp * MIN_VY;
  if (Math.abs(b.vy) >= min) return;
  b.vy = (b.vy < 0 ? -1 : 1) * min;
  b.vx = Math.sign(b.vx || 1) * Math.sqrt(sp * sp - min * min);
}

export function advance(s, toT, padAt, ev = () => {}, skip = null) {
  while (s.t + STEP_MS <= toT) step(s, padAt, ev, skip);
  return s;
}

// ---- Match: rules around the physics (serve, score, client reports). Used by the server AND by practice mode ----
export class Match {
  constructor(points = 7) {
    this.points = points; this.s = newState(0); this.hist = [[], []];
    this.contact = [null, null]; this.pending = null; this.ack = [0, 0];
    this.hold = 300;            // ms a goal waits for the defender's own hit report (lag compensation)
    this.onGoal = () => {}; this.onEvent = null; this.pointAt = 0;
    this.padAt = (side, t) => {
      const h = this.hist[side]; if (!h.length) return W / 2;
      for (let i = h.length - 1; i >= 0; i--) if (h[i].at <= t) return h[i].x;
      return h[0].x;
    };
  }
  setPad(side, x, at) {
    const h = this.hist[side]; h.push({ at, x: clampPad(x) });
    while (h.length > 2 && h[1].at < at - 2000) h.shift();
  }
  pad(side) { const h = this.hist[side]; return h.length ? h[h.length - 1].x : W / 2; }
  start(now) {
    const keep = this.s.open; this.s = newState(now); this.s.open = keep;
    this.contact = [null, null]; this.pending = null;
    this.serve(Math.random() < 0.5 ? 0 : 1, now, START_MS);
  }
  serve(toward, now, wait = SERVE_MS) {
    const s = this.s, a = (Math.random() - 0.5) * 0.7, dir = toward === 0 ? 1 : -1;
    s.ball = { x: W / 2 + (Math.random() - 0.5) * 160, y: H / 2 + dir * 210, vx: V0 * Math.sin(a), vy: dir * V0 * Math.cos(a) };
    s.phase = 'serve'; s.until = now + wait; s.t = now;
  }
  // only a running match pauses – before the second player ever came it stays «wait»
  pause(now) { if (this.s.phase !== 'over' && this.s.phase !== 'wait') { this.s.phase = 'pause'; this.s.t = now; this.pending = null; } }
  tick(now) {
    const s = this.s;
    if (s.phase === 'wait' || s.phase === 'pause' || s.phase === 'over') { s.t = now; return; }
    advance(s, now, this.padAt, e => this.event(e, now));
    if (this.pending && now >= this.pending.final) {
      const loser = this.pending.side, winner = 1 - loser; this.pending = null;
      s.score[winner]++; this.pointAt = now; this.onGoal(winner);
      if (s.score[winner] >= this.points) { s.phase = 'over'; s.winner = winner; }
      else { s.open = -s.open; this.serve(loser, now); }
    }
  }
  event(e, now) {
    if (e.type === 'contact') this.contact[e.side] = { t: e.t, hit: e.hit, ballIn: e.ballIn };
    if (e.type === 'out') this.pending = { side: e.side, final: now + this.hold };
    if (this.onEvent) this.onEvent(e);
  }
  // The defender's client decided hit/miss with its REAL paddle position (no lag) – it wins, within limits.
  report(side, r, now) {
    this.ack[side] = r.ct;
    const c = this.contact[side], o = this.contact[1 - side], s = this.s;
    // too late (point already decided), unknown contact, or the rally went on at the other end meanwhile → ignore
    if (!c || Math.abs(c.t - r.ct) > 400 || (o && o.t > c.t) || this.pointAt > c.t || s.phase === 'over') return;
    if (r.hit) {
      const b = r.ball; if (!b || !isFinite(b.x + b.y + b.vx + b.vy) || Math.hypot(b.vx, b.vy) > VMAX * 1.01) return;
      s.t = r.ct; s.ball = { x: b.x, y: b.y, vx: b.vx, vy: b.vy }; s.phase = 'play'; this.pending = null;
      this.contact[side] = { ...c, t: r.ct, hit: true };
      advance(s, now, this.padAt, e => this.event(e, now));
    } else if (c.hit) {
      s.t = c.t; s.ball = { ...c.ballIn }; s.phase = 'play'; this.pending = null;
      this.contact[side] = { ...c, hit: false };
      advance(s, now, this.padAt, e => this.event(e, now), (sd, t) => sd === side && Math.abs(t - c.t) < 40);
    }
  }
}
