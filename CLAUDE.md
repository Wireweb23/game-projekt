# game-projekt (V-Pong) – Notizen für Claude

Achtes Projekt im X-Connect-Ordner, Fun-Projekt des Nutzers (Deutsch, Schweizer Schreibweise). Siehe README.md für Aufbau.

- **Öffentlich:** Repo github.com/Wireweb23/game-projekt, Spiel https://game-projekt.firewire23.workers.dev/ – **ohne Login**
  (Nutzer-Wunsch: Kollege soll per Link rein). Nichts Sensibles/Persönliches ins Repo, Commits mit der noreply-Adresse.
- Gleiches Cloudflare-Konto wie die Toolbox (HFM), aber eigener Worker. Cloudflare Access gilt NUR für den Worker «toolbox» –
  nach jedem Deploy hier prüfen, dass `/` mit 200 (ohne Umleitung zu cloudflareaccess.com) kommt.
- Veröffentlichen: `npx wrangler@4 deploy` in diesem Ordner (hat wrangler.jsonc, kein package.json). Direkt nach dem Deploy
  lieferte die Seite einmal noch alte Dateien (vermutlich Verteilung, nicht gemessen) → Live-Test ein paar Sekunden später.
- Gratis-Plan: Durable Objects mit SQLite-Klasse (Migration `new_sqlite_classes`). Eingehende WebSocket-Nachrichten zählen
  als Anfragen (20:1) → Schläger nur bei Änderung, max. ~30/s senden.
- Spieler: meist Handy (Hochformat), auch PC. Beide Spieler in der Schweiz → locationHint `weur`.

## Etappen (mit Nutzer abgesprochen 03.10.2026)
1. **0.1.0 fertig:** Online-Pong mit V-Hindernis (V dreht nach jedem Punkt die Öffnung), Menü, Raumcode/Link, Einstellungen,
   Üben gegen Computer, installierbar (PWA), Ping-Anzeige, Verteidiger entscheidet Treffer (Lag-Ausgleich). Tests:
   `tests/sim_test.mjs` (20 KI-Spiele, Determinismus, Lag-Ausgleich), `tests/test_game.py` (2 Browser, lokal + live grün).
   Gemessen Ping Heim-PC → Server 28–41 ms. **Noch nicht am Handy / mit dem Kollegen getestet.**
2. Ballformen (Kreis → Quadrat → Dreieck) mit Drehung und eckigem Abprall.
3. Mehr Hindernisse, Feinschliff.
