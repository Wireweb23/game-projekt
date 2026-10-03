// Cloudflare Worker: serves the game (static files from public/) and routes /ws?raum=1234 to that room's Durable Object.
import { Match, W } from '../public/sim.js';

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      const code = url.searchParams.get('raum') || '';
      if (!/^\d{4}$/.test(code)) return new Response('Raumcode fehlt', { status: 400 });
      // locationHint: start the room in Western Europe (players are in Switzerland)
      return env.ROOMS.get(env.ROOMS.idFromName(code), { locationHint: 'weur' }).fetch(req);
    }
    return env.ASSETS.fetch(req);
  },
};

const TICK_MS = 16, SNAP_EVERY = 2, EMPTY_RESET_MS = 60000;

// One room = one match between two players. Lives in memory while someone is connected.
export class Room {
  constructor(state, env) {
    this.players = [null, null];   // { ws, token, name, color }
    this.created = false; this.match = null; this.timer = null; this.n = 0; this.emptySince = 0;
  }

  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket erwartet', { status: 426 });
    const url = new URL(req.url), create = url.searchParams.get('create') === '1', token = url.searchParams.get('token') || '';
    const [client, ws] = Object.values(new WebSocketPair());
    ws.accept();
    const fail = code => { ws.send(JSON.stringify({ t: 'error', code })); ws.close(1000, code); return new Response(null, { status: 101, webSocket: client }); };
    if (this.created && this.isEmpty() && Date.now() - this.emptySince > EMPTY_RESET_MS) this.reset();
    let side;
    if (create) {
      if (this.created) return fail('besetzt');
      this.reset(); this.created = true;
      const q = url.searchParams;   // rules chosen by the creator, the same for both players
      this.match = new Match([5, 7, 11].includes(+q.get('punkte')) ? +q.get('punkte') : 7, { pad: q.get('schlaeger') === 'strich' ? 'strich' : 'v', mitte: q.get('mitte') === '1' });
      side = 0;
    } else {
      if (!this.created) return fail('unbekannt');
      side = this.players.findIndex(p => p && p.token === token && token);
      if (side < 0) side = this.players.findIndex(p => !p);
      if (side < 0) return fail('voll');
    }
    const p = this.players[side] = { ws, token: token || crypto.randomUUID(), name: 'Spieler ' + (side + 1), color: '' };
    ws.send(JSON.stringify({ t: 'joined', side, token: p.token, points: this.match.points, cfg: this.match.cfg }));
    ws.addEventListener('message', e => this.onMessage(side, ws, e.data));
    ws.addEventListener('close', () => this.onClose(side, ws));
    ws.addEventListener('error', () => this.onClose(side, ws));
    this.sendMeta();
    this.onPlayersChanged();
    return new Response(null, { status: 101, webSocket: client });
  }

  isEmpty() { return !this.players[0] && !this.players[1]; }
  reset() { this.players = [null, null]; this.created = false; this.match = null; this.stopLoop(); }

  onMessage(side, ws, data) {
    const p = this.players[side]; if (!p || p.ws !== ws) return;
    let m; try { m = JSON.parse(data); } catch { return; }
    const now = Date.now(), M = this.match;
    if (m.t === 'ping') ws.send(JSON.stringify({ t: 'pong', c: m.c, s: now }));
    else if (m.t === 'p') M.setPad(side, +m.x || W / 2, Math.min(+m.at || now, now));
    else if (m.t === 'c') M.report(side, m, now);
    else if (m.t === 'hello') { p.name = String(m.name || '').slice(0, 16) || p.name; p.color = String(m.color || '').slice(0, 9); this.sendMeta(); }
    else if (m.t === 'again') { p.again = true; if (M.s.phase === 'over' && this.players.every(q => q && q.again)) { this.players.forEach(q => (q.again = false)); M.start(now); } }
  }

  onClose(side, ws) {
    const p = this.players[side]; if (!p || p.ws !== ws) return;
    this.players[side] = null;
    if (this.isEmpty()) { this.emptySince = Date.now(); this.stopLoop(); return; }
    this.sendMeta(); this.onPlayersChanged();
  }

  onPlayersChanged() {
    const M = this.match, now = Date.now(), both = this.players[0] && this.players[1];
    if (both) {
      if (M.s.phase === 'wait') M.start(now);
      else if (M.s.phase === 'pause') M.serve(Math.random() < 0.5 ? 0 : 1, now, 2000);
    } else M.pause(now);
    this.startLoop();
  }

  sendMeta() {
    const msg = JSON.stringify({ t: 'meta', players: this.players.map(p => p && { name: p.name, color: p.color }) });
    for (const p of this.players) if (p) try { p.ws.send(msg); } catch {}
  }

  startLoop() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      const now = Date.now(), M = this.match; M.tick(now);
      if (++this.n % SNAP_EVERY) return;
      const msg = JSON.stringify({ t: 's', s: M.s, p: [M.pad(0), M.pad(1)], ack: M.ack });
      for (const p of this.players) if (p) try { p.ws.send(msg); } catch {}
    }, TICK_MS);
  }
  stopLoop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}
