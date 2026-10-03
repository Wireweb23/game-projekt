"""Erzeugt public/icon-192.png und icon-512.png (V-Form + Ball + zwei Schläger) – einmal laufen lassen."""
import pathlib
from PIL import Image, ImageDraw

OUT = pathlib.Path(__file__).resolve().parent.parent / 'public'

def icon(n, k=1.0):
    """k < 1: Motiv verkleinert in die Mitte (maskable – Android schneidet bis auf einen Kreis mit 80 % Durchmesser weg)."""
    S = n * 4                                    # 4× zeichnen, dann verkleinern = glatte Kanten
    img = Image.new('RGB', (S, S), (11, 16, 32))
    m = Image.new('RGB', (S, S), (11, 16, 32)); d = ImageDraw.Draw(m); u = S / 100
    v = (157, 140, 255)
    d.line([(34 * u, 50 * u), (62 * u, 30 * u)], fill=v, width=int(7 * u))
    d.line([(34 * u, 50 * u), (62 * u, 70 * u)], fill=v, width=int(7 * u))
    for x, y in ((34, 50), (62, 30), (62, 70)):
        d.ellipse([(x - 3.5) * u, (y - 3.5) * u, (x + 3.5) * u, (y + 3.5) * u], fill=v)
    d.rounded_rectangle([30 * u, 82 * u, 70 * u, 88 * u], radius=3 * u, fill=(255, 79, 122))
    d.rounded_rectangle([30 * u, 12 * u, 70 * u, 18 * u], radius=3 * u, fill=(79, 210, 255))
    d.ellipse([66 * u, 44 * u, 78 * u, 56 * u], fill=(255, 255, 255))
    z = int(S * k); img.paste(m.resize((z, z), Image.LANCZOS), ((S - z) // 2, (S - z) // 2))
    return img.resize((n, n), Image.LANCZOS)

for n in (192, 512):
    icon(n).save(OUT / f'icon-{n}.png')
    icon(n, 0.85).save(OUT / f'icon-maskable-{n}.png'); print('icon', n, '+ maskable')
