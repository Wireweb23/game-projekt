// Physik-Test ohne Browser: Computer gegen Computer in allen Regel-Kombinationen, V-Abprall, Lag-Ausgleich
import { Match, advance, cloneState, newState, W, H, padY } from '../public/sim.js';
let fails = 0; const check = (ok, msg) => { console.log((ok ? 'OK   ' : 'FEHL ') + msg); if (!ok) fails++; };

// 1) ganze Spiele mit fehlbaren Computer-Schlägern
for (const cfg of [{ pad: 'v', mitte: false }, { pad: 'v', mitte: true }, { pad: 'strich', mitte: false }, { pad: 'strich', mitte: true }]) {
  let games = 0, obst = 0, pads = 0, maxRally = 0, stuck = 0, outside = 0, double = 0;
  for (let g = 0; g < 12; g++) {
    const m = new Match(7, cfg); m.hold = 0; let t = 0, lastHit = 0, rally = 0, inV = 0;
    m.onEvent = e => {
      if (e.type === 'obstacle') obst++;
      if (e.type === 'paddle') { pads++; if (++inV === 2) double++; }
      if (e.type === 'contact') { inV = 0; if (e.hit) { rally++; lastHit = e.t; maxRally = Math.max(maxRally, rally); } }
      if (e.type === 'out') rally = 0;
    };
    m.start(0); const target = [W / 2, W / 2];
    while (m.s.phase !== 'over' && t < 30 * 60 * 1000) {
      t += 16;
      for (const side of [0, 1]) {
        if (t % 96 < 16) { const c = cloneState(m.s); let x = null;
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
  const name = `${cfg.pad}${cfg.mitte ? ' + Mitte' : ''}`;
  check(games === 12 && stuck === 0 && outside === 0, `${name}: 12 Spiele fertig, Ball nie hängend/ausserhalb (${games}/${stuck}/${outside}), längster Wechsel ${maxRally}`);
  if (cfg.mitte) check(obst > 30, `${name}: Ball prallt am Mittel-Hindernis ab (${obst}×)`);
  else check(obst === 0, `${name}: kein Mittel-Hindernis (${obst} Abpraller)`);
  if (cfg.pad === 'v') check(double > 0, `${name}: Doppel-Abpraller im V kommen vor (${double} von ${pads} Wand-Berührungen)`);
}

// 2) V-Schläger: Ball fällt senkrecht auf die linke Innenwand → kommt schräg zurück, nicht senkrecht
const vs = newState(0, { pad: 'v' }); vs.phase = 'play'; vs.ball = { x: 300 - 30, y: 700, vx: 0, vy: 600 };
let vc = null; advance(vs, 1500, () => 300, e => { if (e.type === 'contact' && !vc) vc = e; });
check(vc && vc.hit && vc.ball.vy < 0 && Math.abs(vc.ball.vx) > 200, `V: senkrechter Ball auf die Innenwand kommt schräg zurück (vx ${vc && Math.round(vc.ball.vx)}, vy ${vc && Math.round(vc.ball.vy)})`);
const vm = newState(0, { pad: 'v' }); vm.phase = 'play'; vm.ball = { x: 300, y: 700, vx: 0, vy: 600 };
let vmc = null; advance(vm, 1500, () => 500, e => { if (e.type === 'contact' && !vmc) vmc = e; });
check(vmc && !vmc.hit, 'V: Schläger weit weg → Kontakt «verpasst»');

// 3) gleiche Eingaben → gleiche Bahn (Server und Handy rechnen identisch)
const a = new Match(); a.s.phase = 'play'; a.s.t = 0; a.s.ball = { x: 300, y: 300, vx: 210, vy: 480 };
const b2 = cloneState(a.s); advance(a.s, 5000, () => 300); advance(b2, 5000, () => 300);
check(a.s.ball.x === b2.ball.x && a.s.ball.y === b2.ball.y, 'deterministisch: zwei Rechnungen ergeben exakt dieselbe Position');

// 4) Lag-Ausgleich für beide Schläger: Server sieht den Schläger daneben, der Verteidiger trifft auf seinem Bildschirm
for (const pad of ['strich', 'v']) {
  const m = new Match(7, { pad }); m.s.phase = 'play'; m.s.t = 0; m.s.ball = { x: 100, y: 700, vx: 0, vy: 600 };
  m.setPad(0, 500, 0);
  let contact = null; m.onEvent = e => { if (e.type === 'contact' && e.side === 0) contact = e; };
  m.tick(700);
  check(contact && !contact.hit && m.s.phase === 'out' && m.pending, `${pad}: Server allein verpasst → Tor vorgemerkt, noch nicht gezählt`);
  // what the defender computed with its paddle at x = 100
  const own = newState(0, { pad }); own.phase = 'play'; own.ball = { x: 100, y: 700, vx: 0, vy: 600 };
  let mine = null; advance(own, 700, () => 100, e => { if (e.type === 'contact' && e.side === 0 && !mine) mine = e; });
  m.report(0, { ct: mine.t, hit: true, ball: mine.ball }, 720);
  check(mine.hit && m.s.phase === 'play' && m.s.ball.vy < 0 && !m.pending && m.s.score[1] === 0, `${pad}: Bericht «getroffen»: Tor aufgehoben, Ball fliegt zurück`);
  // the opposite: server saw a hit, the defender missed on its screen
  const m3 = new Match(7, { pad }); m3.s.phase = 'play'; m3.s.t = 0; m3.s.ball = { x: 100, y: 700, vx: 0, vy: 600 }; m3.setPad(0, 100, 0);
  let c3 = null; m3.onEvent = e => { if (e.type === 'contact' && e.side === 0) c3 = e; }; m3.tick(700);
  m3.report(0, { ct: c3.t, hit: false }, 720);
  check(c3.hit && (m3.s.phase === 'out' || m3.s.ball.y > padY(0)) && m3.s.ball.vy > 0, `${pad}: Bericht «verpasst»: Ball fliegt doch ins Tor`);
}
const m2 = new Match(7, { pad: 'strich' }); m2.s.phase = 'play'; m2.s.t = 0; m2.s.ball = { x: 100, y: 700, vx: 0, vy: 600 }; m2.setPad(0, 500, 0);
let c2 = null; m2.onEvent = e => { if (e.type === 'contact') c2 = e; }; m2.tick(700); m2.tick(1100);
m2.report(0, { ct: c2.t, hit: true, ball: { x: 100, y: 900, vx: 0, vy: -630 } }, 1100);
check(m2.s.score[1] === 1, 'zu später Bericht (Punkt schon entschieden): wird ignoriert');
process.exit(fails ? 1 : 0);
