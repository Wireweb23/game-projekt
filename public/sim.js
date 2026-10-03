// Shared game simulation – the SAME file runs in the Durable Object (authoritative) and in the browser
// (prediction + practice mode). Fixed time step, field in abstract units (portrait: bottom = side 0, top = side 1).
export const W = 600, H = 1000;
export const BALL_R = 12, PAD_W = 120, PAD_H = 16, PAD_Y = 70;
export const V_HALF = 60, V_DEPTH = 40, V_R = 7;      // V paddle: half width, depth (tips → apex), bar radius
export const STEP_MS = 1000 / 120;
const V0 = 520, VMAX = 1150, SPEEDUP = 1.045, MAX_ANGLE = 1.0, MIN_VY = 0.28;
const SERVE_MS = 1200, START_MS = 1800;
export const DEFAULT_CFG = { pad: 'v', mitte: false };   // rules of a match – chosen by the creator, same for both

export const padY = side => (side === 0 ? H - PAD_Y : PAD_Y);
const faceY = side => (side === 0 ? padY(0) - PAD_H / 2 - BALL_R : padY(1) + PAD_H / 2 + BALL_R);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const clampPad = x => clamp(x, PAD_W / 2, W - PAD_W / 2);

// V paddle: opening towards the opponent, apex towards the own goal → the ball drops into the inner walls
export function vArms(side, x) {
  const dir = side === 0 ? 1 : -1, apexY = padY(side) + dir * V_DEPTH / 2, tipY = padY(side) - dir * V_DEPTH / 2;
  return [
    { ax: x, ay: apexY, bx: x - V_HALF, by: tipY, r: V_R },
    { ax: x, ay: apexY, bx: x + V_HALF, by: tipY, r: V_R },
  ];
}
const vZone = side => {     // y band in which the ball can touch the V paddle of this side
  const a = padY(side) - V_DEPTH / 2 - V_R - BALL_R, b = padY(side) + V_DEPTH / 2 + V_R + BALL_R;
  return side === 0 ? { enter: a, behind: b } : { enter: b, behind: a };
};

// optional obstacle in the middle (setting «Hindernis in der Mitte»): a V lying sideways, opening flips after every point
export function obstacles(s) {
  if (!s.cfg || !s.cfg.mitte) return [];
  const cx = W / 2, cy = H / 2, r = 7, ax = cx - s.open * 55;
  return [
    { ax, ay: cy, bx: cx + s.open * 75, by: cy - 115, r },
    { ax, ay: cy, bx: cx + s.open * 75, by: cy + 115, r },
  ];
}

export function newState(now, cfg = DEFAULT_CFG) {
  return { t: now, phase: 'wait', until: 0, ball: { x: W / 2, y: H / 2, vx: 0, vy: 0 }, score: [0, 0], open: 1, winner: -1,
    cfg: { ...DEFAULT_CFG, ...cfg }, zone: [null, null] };
}
export const cloneState = s => ({ ...s, ball: { ...s.ball }, score: [...s.score],
  zone: (s.zone || [null, null]).map(z => z && { ...z, ballIn: { ...z.ballIn } }) });

// one fixed step; padAt(side, t) gives the paddle x at time t; emit(event) receives wall/obstacle/paddle/contact/out events.
// skip(side, t) = true → that paddle is ignored (used to replay a reported miss).
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
  for (const c of obstacles(s)) bounced = capsule(b, c) || bounced;
  if (bounced) { minVertical(b); ev({ type: 'obstacle' }); }
  for (const side of [0, 1]) (s.cfg.pad === 'v' ? vPaddle : flatPaddle)(s, side, px, py, padAt, ev, skip);
  if (b.y > H + 3 * BALL_R) { s.phase = 'out'; s.zone = [null, null]; ev({ type: 'out', side: 0 }); }
  else if (b.y < -3 * BALL_R) { s.phase = 'out'; s.zone = [null, null]; ev({ type: 'out', side: 1 }); }
}

// classic bar: exact crossing of the face line; outgoing angle from where it hits the bar (player control)
function flatPaddle(s, side, px, py, padAt, ev, skip) {
  const b = s.ball, dt = STEP_MS / 1000;
  if (side === 0 ? b.vy <= 0 : b.vy >= 0) return;
  const face = faceY(side);
  if (!(side === 0 ? py <= face && b.y > face : py >= face && b.y < face)) return;
  const f = (face - py) / (b.y - py), tc = s.t - STEP_MS + f * STEP_MS, cx = px + (b.x - px) * f;
  if (skip && skip(side, tc)) return;
  const ballIn = { x: cx, y: face, vx: b.vx, vy: b.vy };
  const reach = PAD_W / 2 + BALL_R * 0.8, off = (cx - padAt(side, tc)) / reach, hit = Math.abs(off) <= 1;
  if (hit) {
    const sp = Math.min(Math.hypot(b.vx, b.vy) * SPEEDUP, VMAX), a = off * MAX_ANGLE, rest = (1 - f) * dt;
    b.vx = sp * Math.sin(a); b.vy = (side === 0 ? -1 : 1) * sp * Math.cos(a);
    b.x = cx + b.vx * rest; b.y = face + b.vy * rest;
  }
  ev({ type: 'contact', side, t: tc, tin: tc, hit, ballIn, ball: hit ? { x: cx, y: face, vx: b.vx, vy: b.vy } : null });
}

// V paddle: real reflections off the two inner walls (often two bounces → odd angles). The whole passage through the
// paddle band is ONE contact: decided when the ball leaves the band – forwards = hit, behind the paddle = miss.
function vPaddle(s, side, px, py, padAt, ev, skip) {
  const b = s.ball, zb = vZone(side), toward = side === 0 ? b.vy > 0 : b.vy < 0;
  let z = s.zone[side];
  if (!z) {
    const entered = side === 0 ? py <= zb.enter && b.y > zb.enter : py >= zb.enter && b.y < zb.enter;
    if (!entered || !toward || (skip && skip(side, s.t))) return;
    z = s.zone[side] = { t: s.t, ballIn: { ...b }, hits: 0 };
  }
  if (!(skip && skip(side, s.t))) {
    let hit = false;
    for (const c of vArms(side, padAt(side, s.t))) hit = capsule(b, c) || hit;
    if (hit) { z.hits++; minVertical(b); ev({ type: 'paddle', side }); }
  }
  const forward = side === 0 ? b.y < zb.enter : b.y > zb.enter, behind = side === 0 ? b.y > zb.behind : b.y < zb.behind;
  if (!forward && !behind) return;
  s.zone[side] = null;
  const hit = forward && z.hits > 0;
  if (hit) { const sp = Math.min(Math.hypot(b.vx, b.vy) * SPEEDUP, VMAX), k = sp / Math.hypot(b.vx, b.vy); b.vx *= k; b.vy *= k; }
  ev({ type: 'contact', side, tin: z.t, hit, ballIn: z.ballIn, ball: hit ? { ...b } : null });
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
// after a strange bounce the ball must still travel towards a goal (no endless wall-to-wall ping)
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
// replaying a reported miss: that paddle is ignored for the passage that started at tin
export const missSkip = (side, tin) => (sd, t) => sd === side && t >= tin - 20 && t <= tin + 600;

// ---- Match: rules around the physics (serve, score, client reports). Used by the server AND by practice mode ----
export class Match {
  constructor(points = 7, cfg = DEFAULT_CFG) {
    this.points = points; this.cfg = { ...DEFAULT_CFG, ...cfg }; this.s = newState(0, this.cfg); this.hist = [[], []];
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
    const keep = this.s.open; this.s = newState(now, this.cfg); this.s.open = keep;
    this.contact = [null, null]; this.pending = null;
    this.serve(Math.random() < 0.5 ? 0 : 1, now, START_MS);
  }
  serve(toward, now, wait = SERVE_MS) {
    const s = this.s, a = (Math.random() - 0.5) * 0.7, dir = toward === 0 ? 1 : -1;
    s.ball = { x: W / 2 + (Math.random() - 0.5) * 160, y: H / 2 + dir * 210, vx: V0 * Math.sin(a), vy: dir * V0 * Math.cos(a) };
    s.phase = 'serve'; s.until = now + wait; s.t = now; s.zone = [null, null];
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
    if (e.type === 'contact') this.contact[e.side] = { t: e.t, tin: e.tin, hit: e.hit, ballIn: e.ballIn };
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
      s.t = r.ct; s.ball = { x: b.x, y: b.y, vx: b.vx, vy: b.vy }; s.phase = 'play'; s.zone[side] = null; this.pending = null;
      this.contact[side] = { ...c, t: r.ct, hit: true };
      advance(s, now, this.padAt, e => this.event(e, now));
    } else if (c.hit) {
      s.t = c.tin; s.ball = { ...c.ballIn }; s.phase = 'play'; s.zone[side] = null; this.pending = null;
      this.contact[side] = { ...c, hit: false };
      advance(s, now, this.padAt, e => this.event(e, now), missSkip(side, c.tin));
    }
  }
}
