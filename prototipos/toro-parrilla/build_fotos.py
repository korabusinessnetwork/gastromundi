#!/usr/bin/env python3
"""Recorta, redimensiona e comprime as 4 fotos do Toro; depois gera a cópia
do index.html com as imagens embutidas como data URI (para publicar como artefato)."""
import base64, io, pathlib, sys
from PIL import Image, ImageOps

SRC = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "originais")
PROTO = pathlib.Path(__file__).resolve().parent
OUT = PROTO / "fotos"
OUT.mkdir(exist_ok=True)

# nome final -> (arquivo de origem, proporção alvo, largura máxima, foco vertical 0..1,
#                espelhar na horizontal)
# Nenhuma foto é espelhada: o logo da casa usa o R invertido de propósito
# ("TOЯO"), o que dá a impressão de imagem espelhada quando não é.
JOBS = {
    "fachada.jpg": ("toro-01-fachada.jpg", 4 / 5, 1280, 0.50, False),
    "brasa.jpg":   ("toro-02-brasa.jpg",   1 / 1, 1200, 0.50, False),
    "salao.jpg":   ("toro-03-salao.jpg",   1 / 1, 1200, 0.50, False),
    "hero.jpg":    ("toro-04-hero.jpg",   16 / 9, 1600, 0.50, False),
}
MAX_BYTES = 250 * 1024


def find(name):
    hits = sorted(SRC.rglob(name))
    if not hits:
        raise SystemExit(f"não encontrei {name} em {SRC}")
    return hits[0]


def crop_to(im, ratio, focus):
    w, h = im.size
    if w / h > ratio:                      # largo demais -> corta laterais
        nw = round(h * ratio)
        x = (w - nw) // 2
        box = (x, 0, x + nw, h)
    else:                                  # alto demais -> corta topo/base
        nh = round(w / ratio)
        y = round((h - nh) * focus)
        box = (x_ := 0, y, w, y + nh)
    return im.crop(box)


def save_under(im, path, limit):
    for q in (86, 82, 78, 74, 70, 66, 62, 58):
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=q, optimize=True, progressive=True,
                subsampling=1)
        if buf.tell() <= limit:
            path.write_bytes(buf.getvalue())
            return q, buf.tell()
    path.write_bytes(buf.getvalue())
    return q, buf.tell()


report = []
for dest, (src_name, ratio, maxw, focus, espelhar) in JOBS.items():
    im = Image.open(find(src_name)).convert("RGB")
    orig = im.size
    if espelhar:
        im = ImageOps.mirror(im)
    im = crop_to(im, ratio, focus)
    if im.width > maxw:
        im = im.resize((maxw, round(maxw / ratio)), Image.LANCZOS)
    q, size = save_under(im, OUT / dest, MAX_BYTES)
    report.append(f"{dest:12} {orig[0]}x{orig[1]} -> {im.width}x{im.height}  q{q}  {size/1024:.0f} KB")

print("\n".join(report))

# ---- cópia para publicação, com data URIs ----
html = (PROTO / "index.html").read_text(encoding="utf-8")
total = 0
for dest in JOBS:
    raw = (OUT / dest).read_bytes()
    total += len(raw)
    uri = "data:image/jpeg;base64," + base64.b64encode(raw).decode()
    needle = f'src="fotos/{dest}"'
    if needle not in html:
        raise SystemExit(f"não achei {needle} no index.html")
    html = html.replace(needle, f'src="{uri}"')

pub = PROTO / "index.publicacao.html"
pub.write_text(html, encoding="utf-8")
print(f"\n{pub.name}: {len(html)/1024:.0f} KB  (fotos: {total/1024:.0f} KB)")
