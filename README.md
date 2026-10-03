# V-Pong

Kleines Online-Pong für zwei – mit einem **V** in der Mitte, an dem der Ball in schrägen Winkeln abprallt.
Läuft im Browser und lässt sich auf Handy und PC als App installieren.

**Spielen:** https://game-projekt.firewire23.workers.dev/ (öffentlich, kein Login)

- **Spiel erstellen** → 4-stelliger Code bzw. «Link senden» → der andere tippt den Link an oder gibt den Code unter **Beitreten** ein.
- **Üben gegen Computer** geht auch offline.
- Steuerung: Finger ziehen (Handy), Maus oder Pfeiltasten / A–D (PC). Einstellungen: Name, Farbe, Steuerung,
  Empfindlichkeit, Punkte bis zum Sieg, Ton, Vibration, Ping-Anzeige.

## Aufbau

| Teil | Datei | Aufgabe |
|---|---|---|
| Physik + Regeln | `public/sim.js` | feste Zeitschritte (120/s), Ball, Wände, V, Schläger, Aufschlag, Punkte. **Dieselbe Datei** läuft auf dem Server und im Browser. |
| Spielserver | `src/worker.js` | Cloudflare Worker + Durable Object pro Raum (Code). Der Server ist Chef über Ball und Punkte, rechnet 60×/s und schickt 30×/s den Stand. |
| Spiel im Browser | `public/app.js` | Menü, Einstellungen, Zeichnen, Steuerung, Ton, Computer-Gegner. |

**Warum es sich ohne Verzögerung anfühlt** (übliches Vorgehen bei Online-Spielen):
- Eigener Schläger bewegt sich sofort; der Server erfährt die Position nur.
- Der Ball wird im Browser mit derselben Physik vom letzten Server-Stand bis «jetzt» vorausgerechnet; neue Stände
  werden weich eingeblendet statt zu springen.
- **Treffer entscheidet der Verteidiger:** Ob der Ball den eigenen Schläger trifft, entscheidet das Gerät des Verteidigers
  (es kennt die echte Schlägerposition ohne Verzögerung) und meldet es dem Server. Ein Tor zählt erst nach 300 ms, damit diese
  Meldung es noch aufheben kann. Zu späte Meldungen werden ignoriert.
- Uhrenabgleich per Ping (bester von 12 Messungen).

Gemessen 03.10.2026 (Heim-PC → Server): Ping 28–41 ms.

## Entwickeln

```bash
npx wrangler@4 dev --port 8787          # lokal, mit Raum-Server
node tests/sim_test.mjs                 # Physik + Lag-Ausgleich ohne Browser
python tests/test_game.py               # zwei Browser gegeneinander (GAME_URL=… für die Live-Seite)
npx wrangler@4 deploy                   # veröffentlichen
```
