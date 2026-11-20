"""Erzeugt die Schriften für den PDF-Export (src/assets/pdf-fonts/).

Die PDF-Ausgabe soll echten, markierbaren Text enthalten. Dafür bettet die App
Schriften ein und setzt den Lernzettel vorher im Browser mit genau denselben
Dateien, damit Zeilenumbrüche und Positionen übereinstimmen. Damit das schlank
bleibt, werden die Schriften hier auf die Zeichen beschnitten, die in deutschen
Lernzetteln vorkommen (Latein, Griechisch, Satzzeichen, Pfeile, Mathe-Zeichen,
Kästchen …), und ohne Hinting und ohne OpenType-Features gespeichert – so gibt
es keine Kerning- oder Ligatur-Unterschiede zwischen Browser und PDF.

- Sans: Inter (OFL-1.1) – aus OTF/CFF nach TrueType umgewandelt
- Sym:  DejaVu Sans (Bitstream-Vera-Lizenz) – nur Zeichen, die Inter fehlen
- Mono: JetBrains Mono (OFL-1.1)

Aufruf: python3 scripts/make-pdf-fonts.py  (braucht fontTools und die Schriften
aus den Debian-Paketen fonts-inter, fonts-dejavu-core und fonts-jetbrains-mono)
"""

from pathlib import Path

from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont, newTable

OUT = Path(__file__).resolve().parent.parent / "src" / "assets" / "pdf-fonts"
INTER = Path("/usr/share/fonts/opentype/inter")
DEJAVU = Path("/usr/share/fonts/truetype/dejavu")
JETBRAINS = Path("/usr/share/fonts/truetype/jetbrains-mono")

RANGES = [
    (0x20, 0x7E), (0xA0, 0x17F), (0x192, 0x192), (0x218, 0x21B), (0x2C6, 0x2DD),
    (0x300, 0x36F), (0x370, 0x3FF), (0x2000, 0x206F), (0x2070, 0x209F), (0x20A0, 0x20CF),
    (0x2100, 0x218F), (0x2190, 0x23FF), (0x2460, 0x24FF), (0x2500, 0x27EF),
    (0x2900, 0x297F), (0x2B00, 0x2BFF), (0xFFFD, 0xFFFD),
]
MONO_RANGES = [(0x20, 0x7E), (0xA0, 0x17F), (0x2000, 0x206F), (0x20A0, 0x20CF), (0x2190, 0x21FF), (0x2500, 0x257F)]


def codepoints(ranges):
    return {cp for lo, hi in ranges for cp in range(lo, hi + 1)}


def otf_to_ttf(font: TTFont) -> None:
    """Wandelt CFF-Umrisse in TrueType-Umrisse (quadratische Kurven) um."""
    order = font.getGlyphOrder()
    glyphs = font.getGlyphSet()
    glyf = newTable("glyf")
    glyf.glyphOrder = order
    glyf.glyphs = {}
    for name in order:
        pen = TTGlyphPen(glyphs)
        glyphs[name].draw(Cu2QuPen(pen, max_err=1.0, reverse_direction=True))
        glyf.glyphs[name] = pen.glyph()
    font["glyf"] = glyf
    font["loca"] = newTable("loca")
    font["maxp"] = newTable("maxp")
    font["maxp"].tableVersion = 0x00010000
    for attr in ("maxZones", "maxTwilightPoints", "maxStorage", "maxFunctionDefs", "maxInstructionDefs",
                 "maxStackElements", "maxSizeOfInstructions", "maxComponentElements"):
        setattr(font["maxp"], attr, 0)
    font["maxp"].maxZones = 1
    font["post"].formatType = 3.0
    font["post"].extraNames = []
    font["post"].mapping = {}
    font["post"].glyphOrder = None
    font["head"].glyphDataFormat = 0
    del font["CFF "]
    if "VORG" in font:
        del font["VORG"]
    font.sfntVersion = "\x00\x01\x00\x00"
    font.recalcBBoxes = True


def subset(font: TTFont, cps) -> None:
    opts = Options()
    opts.layout_features = []
    opts.hinting = False
    opts.drop_tables += ["GSUB", "GPOS", "GDEF", "kern", "DSIG", "STAT", "MVAR", "HVAR", "fvar", "gvar"]
    opts.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]  # inkl. Lizenzhinweis
    opts.notdef_outline = True
    opts.glyph_names = False
    sub = Subsetter(opts)
    sub.populate(unicodes=cps)
    sub.subset(font)


def save(font: TTFont, name: str) -> None:
    # Jede Glyphe auf 4 Byte auffüllen: pdf-libs Teilmengen-Bildung (fontkit) schreibt eine kurze
    # loca-Tabelle und verliert sonst bei ungerader Länge ein Byte – die Glyphe wäre im PDF unsichtbar.
    font["glyf"].padding = 4
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / name
    font.save(path)
    print(f"{name}: {path.stat().st_size // 1024} KB, {len(font.getBestCmap())} Zeichen")


wanted = codepoints(RANGES)
inter_cmap = set()
for src, dst in [("Inter-Regular.otf", "sans-regular.ttf"), ("Inter-Bold.otf", "sans-bold.ttf"),
                 ("Inter-Italic.otf", "sans-italic.ttf"), ("Inter-BoldItalic.otf", "sans-bolditalic.ttf")]:
    f = TTFont(INTER / src)
    subset(f, wanted)
    otf_to_ttf(f)
    inter_cmap |= set(f.getBestCmap())
    save(f, dst)

sym = TTFont(DEJAVU / "DejaVuSans.ttf")
subset(sym, wanted - inter_cmap)
save(sym, "sym-regular.ttf")

for src, dst in [("JetBrainsMono-Regular.ttf", "mono-regular.ttf"), ("JetBrainsMono-Bold.ttf", "mono-bold.ttf")]:
    f = TTFont(JETBRAINS / src)
    subset(f, codepoints(MONO_RANGES))
    save(f, dst)
