// Shaping oracle: glyph ids (cmap + GSUB) and 26.6 pen positions (FT advances + HarfBuzz kerning)
// against matplotlib's FT2Font._layout, per face, size and dpi. Text goes through measure(), which splits it into libraqm's
// script runs (Latin next to Greek shapes as two runs) before shaping each.
import { readFileSync } from 'node:fs';
import { faceById, registerFonts } from '../src/core/fonts.ts';
import { measure } from '../src/core/text.ts';
import { allFonts } from '../src/fonts/all.ts';
registerFonts(...allFonts);
const cases = JSON.parse(readFileSync(new URL('../fixtures/ref/_layout.json', import.meta.url), 'utf8'));
const bad = new Map();
for (const c of cases) {
  const face = faceById(c.face);
  const glyphs = measure(c.s, c.size, c.dpi, face).runs.flatMap((r) => r.glyphs);
  const g = glyphs.map((q) => q.gid), pens = glyphs.map((q) => q.dx * 64);
  const ok = g.length === c.g.length && g.every((v, i) => v === c.g[i]) && pens.every((v, i) => v === c.x[i]);
  if (!ok) { bad.set(c.face, (bad.get(c.face) || 0) + 1); if ((bad.get(c.face) || 0) <= 3) console.log(`MISMATCH ${c.face} ${c.size}pt@${c.dpi} ${JSON.stringify(c.s)}\n  gids ${JSON.stringify(g)}\n  want ${JSON.stringify(c.g)}\n  pens ${JSON.stringify(pens)}\n  want ${JSON.stringify(c.x)}`); }
}
const nbad = [...bad.values()].reduce((a, b) => a + b, 0);
console.log(`fonts: ${cases.length - nbad}/${cases.length} layouts match FT2Font._layout${nbad ? ' ' + JSON.stringify(Object.fromEntries(bad)) : ''}`);
if (nbad) process.exitCode = 1;
