"""Oracle for text shaping: FT2Font._layout glyph ids and 26.6 pen positions per face/size/dpi."""
import json, os, random
import matplotlib.ft2font as ft, matplotlib
MPL = os.path.join(os.path.dirname(matplotlib.__file__), "mpl-data", "fonts", "ttf")
I = "/usr/share/fonts/opentype/inter"
FACES = {"DejaVu Sans:400": f"{MPL}/DejaVuSans.ttf", "DejaVu Sans:700": f"{MPL}/DejaVuSans-Bold.ttf",
         "DejaVu Serif:400": f"{MPL}/DejaVuSerif.ttf", "DejaVu Serif:700": f"{MPL}/DejaVuSerif-Bold.ttf",
         "Inter:400": f"{I}/Inter-Regular.otf", "Inter:500": f"{I}/Inter-Medium.otf", "Inter:600": f"{I}/Inter-SemiBold.otf", "Inter:700": f"{I}/Inter-Bold.otf"}
CHARS = [chr(c) for c in range(0x20, 0x7F)] + list("−×µ²³√°±·—–…→←↑↓•’‘“”")
FIXED = ["Latency held through the evening peak", "16:50 · 10:30 → 11:00", "1x2 3×4 (A) [B] A-B-C --> <-- AVAT To Ty Wa", "office affluent fi fl ffi",
         "North America 11.2M · 94% cached", "p50 14.6 ms", "“quoted” ‘single’ it’s", "HTTP/2 GET /api/v1 — 200 OK…", "2026-10-18 21:00", "−3.5e+06"]
# Latin next to Greek (the letters every baked face carries, U+0391-U+03C9): libraqm shapes each script run on its own, so no
# kerning or GSUB crosses a Latin/Greek boundary; brackets, spaces and digits take a neighbour's script (src/core/scripts.ts)
MIXED = ["ΔT = 5 K, Δt", "AΔ TΛ VΛ Tα Υa AΥ ΥA LΥ", "Γa ΓA Γ. (Γ) Τo ΤO TΟ Pα Fα Yα", "α-β ΔT=5 x Δy 1Δ Δ1 —Υ Υ— ‘Υ’ “Ω”",
         "(ΑV) [Tα] {ΥA} (A(Υ)V) Ω-resistance", "μ ± σ, Δt = 5 μs (µs)", "office ΔT affine fi→Δ"]
rnd = random.Random(7)
out = []
for fid, path in FACES.items():
    f = ft.FT2Font(path)
    strings = FIXED + MIXED + ["".join(rnd.choice(CHARS) for _ in range(rnd.randint(1, 24))) for _ in range(60)]
    for size, dpi in [(10, 100), (9, 240), (8.5, 120), (14, 144), (28, 240), (7, 72)]:
        f.set_size(size, dpi)
        for s in strings:
            it = f._layout(s, flags=ft.LoadFlags.NO_HINTING)
            out.append(dict(face=fid, size=size, dpi=dpi, s=s, g=[i.glyph_index for i in it], x=[round(i.x * 64) for i in it]))
json.dump(out, open(os.path.join(os.path.dirname(__file__), "ref", "_layout.json"), "w"))
print(len(out), "layouts")
