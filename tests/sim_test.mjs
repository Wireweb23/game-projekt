// Physik-Test ohne Browser: 20 Spiele Computer gegen Computer, plus Lag-Ausgleich (Bericht des Verteidigers)
import { Match, advance, cloneState, W, H, obstacles } from '../public/sim.js';
let fails = 0; const check = (ok, msg) => { console.log((ok ? 'OK   ' : 'FEHL ') + msg); if (!ok) fails++; };

// 1) Spiele mit fehlbaren Computer-Schlägern: endet jedes Spiel? bleibt der Ball nie hängen? trifft er das V?
let games = 0, obst = 0, maxRally = 0, stuck = 0, outside = 0;
for (let g = 0; g < 20; g++) {
  const m = new Match(7); m.hold = 0; let t = 0, lastHit = 0, rally = 0;
  m.onEvent = e => { if (e.type === 'obstacle') obst++; if (e.type === 'contact' && e.hit) { rally++; lastHit = e.t; maxRally = Math.max(maxRally, rally); } if (e.type === 'out') rally = 0; };
  m.start(0); const target = [W / 2, W / 2];
  while (m.s.phase !== 'over' && t < 30 * 60 * 1000) {
    t += 16;
    for (const side of [0, 1]) {
      const s = m.s; if (t % 96 < 16) { const c = cloneState(s); let x = null;
        advance(c, c.t + 2500, () => -1e4, e => { if (x === null && e.type === 'contact' && e.side === side) x = e.ballIn.x; });
        target[side] = x === null ? W / 2 : x + (Math.random() - 0.5) * 150; }
      const cur = m.pad(side), sp = 640 * 0.016; m.setPad(side, cur + Math.max(-sp, Math.min(sp, target[side] - cur)), t);
    }
    m.tick(t);
    const b = m.s.ball; if (m.s.phase === 'play' && (b.x < 0 || b.x > W)) outside++;
    if (m.s.phase === 'play' && t - Math.max(lastHit, m.s.until) > 15000) { stuck++; m.serve(0, t); }
  }
  if (m.s.phase === 'over') games++;
}
check(games === 20, `20 Spiele zu Ende gespielt (${games})`);
check(stuck === 0, `Ball nie > 15 s ohne Schläger-Kontakt (hängend: ${stuck})`);
check(outside === 0, `Ball nie ausserhalb des Felds (${outside})`);
check(obst > 50, `Ball prallt am V ab (${obst}×), längster Ballwechsel ${maxRally}`);

// 2) gleiche Eingaben → gleiche Bahn (Server und Handy rechnen identisch)
const a = new Match(); a.s.phase = 'play'; a.s.t = 0; a.s.ball = { x: 300, y: 300, vx: 210, vy: 480 };
const b = cloneState(a.s); advance(a.s, 5000, () => 300); advance(b, 5000, () => 300);
check(a.s.ball.x === b.ball.x && a.s.ball.y === b.ball.y, 'deterministisch: zwei Rechnungen ergeben exakt dieselbe Position');

// 3) Lag-Ausgleich: Server sieht den Schläger noch daneben (Verzögerung), der Verteidiger trifft auf seinem Bildschirm
const m = new Match(7); m.s.phase = 'play'; m.s.t = 0; m.s.ball = { x: 100, y: 700, vx: 0, vy: 600 };
m.setPad(0, 500, 0);                                        // Server: Schläger weit weg
let contact = null; m.onEvent = e => { if (e.type === 'contact' && e.side === 0) contact = e; };
m.tick(600);
check(contact && !contact.hit && m.s.phase === 'out' && m.pending, 'Server allein: verpasst → Tor vorgemerkt (noch nicht gezählt)');
const hitBall = { x: contact.ballIn.x, y: contact.ballIn.y, vx: 0, vy: -630 };
m.report(0, { ct: contact.t, hit: true, ball: hitBall }, 650);
check(m.s.phase === 'play' && m.s.ball.vy < 0 && !m.pending && m.s.score[1] === 0, 'Bericht «getroffen» des Verteidigers: Tor aufgehoben, Ball fliegt zurück');
const m2 = new Match(7); m2.s.phase = 'play'; m2.s.t = 0; m2.s.ball = { x: 100, y: 700, vx: 0, vy: 600 }; m2.setPad(0, 500, 0);
m2.onEvent = e => { if (e.type === 'contact') contact = e; }; m2.tick(600); m2.tick(1000);
m2.report(0, { ct: contact.t, hit: true, ball: hitBall }, 1000);
check(m2.s.score[1] === 1, 'zu später Bericht (Punkt schon entschieden): wird ignoriert');
process.exit(fails ? 1 : 0);
