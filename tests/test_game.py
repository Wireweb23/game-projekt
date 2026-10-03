"""Browser-Test V-Pong: Üben + Online zu zweit (zwei getrennte Browser-Kontexte) gegen einen laufenden Server.
    npx wrangler@4 dev --port 8787        (lokal)   oder   GAME_URL=https://… python tests/test_game.py   (live)"""
import os, sys, time
from playwright.sync_api import sync_playwright

URL = os.environ.get('GAME_URL', 'http://127.0.0.1:8787/')
fails = []
def check(ok, msg):
    print(('OK   ' if ok else 'FEHL ') + msg)
    if not ok: fails.append(msg)

# perfect defender: paddle follows the predicted ball every 16 ms (stops when window.__lazy is set)
FOLLOW = """() => { setInterval(() => { const g = window.__vpong.game; if (!g || window.__lazy) return;
  const s = g.mode === 'practice' ? g.m.s : (g.snap && g.offset !== null ? g.predict(g.base(), g.serverNow()) : null);
  if (s) g.myX = Math.max(60, Math.min(540, s.ball.x)); }, 16); }"""
G = "window.__vpong.game"

with sync_playwright() as pw:
    b = pw.chromium.launch()
    errs = []
    def page(w=390, h=844):
        p = b.new_context(viewport={'width': w, 'height': h}, has_touch=True).new_page()
        p.on('pageerror', lambda e: errs.append(str(e)[:200])); return p

    # --- Üben gegen Computer ---
    p = page(); p.goto(URL); p.wait_for_selector('#menu:not([hidden])')
    check('Version' in p.inner_text('#version'), 'Hauptmenü mit Version')
    p.click('text=Üben gegen Computer'); p.wait_for_function(f"{G}.m.s.phase === 'play'", timeout=8000)
    cfg = p.evaluate(f"{G}.m.s.cfg")
    check(cfg == {'pad': 'v', 'mitte': False}, f'Standard-Regeln: V-Schläger, ohne Mitte ({cfg})')
    # measured in one go inside the page: during a serve the ball rests on purpose (y = 710 / 290)
    y0, y1 = p.evaluate(f"new Promise(r => {{ const a = {G}.m.s.ball.y; setTimeout(() => r([a, {G}.m.s.ball.y]), 100); }})")
    check(y0 != y1, f'Üben: Ball fliegt ({round(y0)} → {round(y1)} in 0.1 s)')
    p.click('#leaveBtn'); p.wait_for_selector('#menu:not([hidden])')
    p.click('text=Einstellungen'); p.fill('#sName', 'Testerin'); p.click('text=Fertig')
    p.reload(); check(p.evaluate("JSON.parse(localStorage.getItem('vpong-settings')).name") == 'Testerin', 'Einstellungen bleiben nach Neuladen')

    # --- Hinweis «Als App installieren» ---
    p = page(); p.goto(URL); p.wait_for_selector('#menu:not([hidden])')
    check(p.is_visible('#installCard') and p.is_hidden('#installBtn') and len(p.inner_text('#installText')) > 20,
          f'im Browser: Installations-Hinweis mit Anleitung («{p.inner_text("#installText")[:45]}…»)')
    p.evaluate("() => { window.__prompted = 0; const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = () => { window.__prompted++; }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); dispatchEvent(e); }")
    check(p.is_visible('#installBtn'), 'Browser bietet Installation an: Knopf «Installieren» erscheint')
    p.click('#installBtn'); p.wait_for_timeout(200)
    check(p.evaluate('window.__prompted') == 1, '«Installieren» öffnet den Installations-Dialog des Browsers')
    p.click('#installLater'); p.reload(); p.wait_for_selector('#menu:not([hidden])')
    check(p.is_hidden('#installCard'), '«Später»: Hinweis bleibt auch nach Neuladen weg')
    p.click('text=Einstellungen'); p.uncheck('#sInstall'); p.check('#sInstall'); p.click('text=Fertig')
    check(p.is_visible('#installCard'), 'Einstellung «Hinweis zeigen» holt ihn zurück')
    q = b.new_context(); q.add_init_script("""const mm = window.matchMedia.bind(window);
        window.matchMedia = s => s.includes('display-mode: fullscreen') ? { matches: true, media: s, addEventListener() {}, removeEventListener() {} } : mm(s);""")
    q = q.new_page(); q.goto(URL); q.wait_for_selector('#menu:not([hidden])')
    check(q.is_hidden('#installCard'), 'als App gestartet: kein Hinweis')

    # --- Online: A erstellt, B tritt per Link bei ---
    A = page(); A.goto(URL)
    A.evaluate("localStorage.setItem('vpong-settings', JSON.stringify({ paddle: 'strich', mitte: true, points: 5 }))"); A.reload()
    A.click('text=Spiel erstellen'); A.wait_for_function("/^\\d{4}$/.test(document.getElementById('lobbyCode').textContent)")
    A.wait_for_selector('text=Warte auf Gegner', timeout=10000)
    code = A.inner_text('#lobbyCode')
    B = page(1280, 800); B.goto(URL + '?raum=' + code)
    A.wait_for_function(f"{G}.snap && {G}.snap.s.phase !== 'wait'", timeout=10000)
    check(A.is_hidden('#lobby'), f'Raum {code}: Gegner beigetreten, Lobby verschwindet')
    check(A.evaluate(f"{G}.me") == 0 and B.evaluate(f"{G}.me") == 1, 'Seiten verteilt (A unten, B oben – jeder sieht sich unten)')
    rb = B.evaluate(f"[{G}.snap.s.cfg, {G}.rules.points]")
    check(rb == [{'pad': 'strich', 'mitte': True}, 5], f'Regeln des Erstellers gelten auch beim Beitretenden: {rb}')
    A.wait_for_timeout(1500)
    ping = A.evaluate(f"{G}.rtts.map(r => r.rtt)")
    check(len(ping) >= 3, f'Ping gemessen: {[round(x) for x in ping[-5:]]} ms')
    A.evaluate(f"{G}.myX = 111"); t0 = time.time()
    B.wait_for_function(f"Math.abs({G}.snap.p[0] - 111) < 0.5", timeout=3000)
    check(True, f'Schläger von A kommt bei B an ({round((time.time() - t0) * 1000)} ms inkl. Testverzögerung)')
    # beide verteidigen perfekt → kein Punkt; dann verteidigt B nicht mehr → A punktet
    A.evaluate(FOLLOW); B.evaluate(FOLLOW); A.wait_for_timeout(9000)
    sA = A.evaluate(f"{G}.snap.s.score"); hits = A.evaluate(f"{G}.snap.s.phase")
    check(sA == [0, 0], f'9 s perfekt verteidigt: kein Punkt ({sA}) – keine falschen Tore durch Verzögerung')
    B.evaluate("window.__lazy = true; window.__vpong.game.myX = 60");
    A.wait_for_function(f"{G}.snap.s.score[0] >= 1", timeout=15000)
    check(B.evaluate(f"{G}.snap.s.score") == A.evaluate(f"{G}.snap.s.score"), f'B verteidigt nicht: A punktet, beide sehen {A.evaluate(f"{G}.snap.s.score")}')
    # Fehlerfälle
    C = page(); C.goto(URL + '?raum=' + code); C.wait_for_selector('text=Der Raum ist schon voll', timeout=8000)
    check(True, 'dritter Spieler: «Der Raum ist schon voll»')
    D = page(); D.goto(URL); D.click('text=Beitreten'); D.fill('#joinCode', '0000' if code != '0000' else '0001'); D.click('#joinBtn')
    D.wait_for_selector('text=Raum nicht gefunden', timeout=8000); check(True, 'falscher Code: «Raum nicht gefunden»')
    # B verlässt → A sieht Pause
    B.click('#leaveBtn'); A.wait_for_function(f"{G}.snap.s.phase === 'pause'", timeout=5000)
    check('ist weg' in A.inner_text('#banner'), f'Gegner weg: «{A.inner_text("#banner")}»')
    check(not errs, f'keine Seitenfehler {errs[:2]}')
    b.close()
print('FEHLER:' if fails else 'Alle Prüfungen bestanden.', *fails, sep='\n  ')
sys.exit(1 if fails else 0)
