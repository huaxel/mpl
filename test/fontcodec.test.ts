// Per-face font modules: the encoding is lossless, and the registry never substitutes a face.
// Runs in its own process against mpl/core so the registry starts empty (lean entry).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { decodeFace, decodeTables, decodeVlq, FACE_CATALOG } from '../src/core/fontcodec.ts';
import { FACE_LOADS, FontNotLoadedError, registerFonts, registeredFonts, subplots } from '../src/core.ts';
import { allFonts, dejavuSans, dejavuSansBold, interMedium, interRegular } from '../src/fonts/all.ts';
import { encodeFace } from '../scripts/encode_fonts.ts';

// 1. lossless: each face decodes to exactly the JSON scripts/gen_fonts.py baked before the split
//    (sha256 of JSON.stringify of the original src/core/data/fonts/<name>.ts object, at 3e8352f; the Inter faces re-baked
//    with General Punctuation, Arrows, Geometric Shapes and check marks, then ≥ ≤ ∞ ≈ ≠ (#71), then Superscripts and
//    Subscripts and ¹ (#94), then Greek and Coptic, then Letterlike Symbols (all faces) and Inter's Mathematical Operators, from Inter v4.0: each the sha256 of JSON.stringify(build/fonts/<face>.json), scripts/gen_fonts.py's own output)
const BAKED_SHA256: Readonly<Record<string, string>> = {
  'dejavu-sans': '88b6b1eecae3ba10297c6d06d6df25f3f52613767c599681036f4b27a8b7b27e',
  'dejavu-sans-bold': 'f75d5ae067dbe0b89cd0423fa4cdadacd15c9e99ac8748ad780458e9c70eb2a3',
  'dejavu-serif': 'b1d3b4765d6ba9c8235015f61dc2fa594a735ce57c2c0c183e61b16288be98ea',
  'dejavu-serif-bold': '87b2870ca216abb2a276dfc0b656d7f3282e117e670ba5cad69a8e3da21ce117',
  'inter-regular': '5b77f57986a20d4744a8ef9e449d5d4863878fdd731076d6111812b5b130e104',
  'inter-medium': '0ff642ca2cf41c3c9db8147fb22b01c4267c650817a538791245d9f4b69c8332',
  'inter-semibold': '2016d598dd48ae07fb85e221eb5687a626432e534ed0d6af3a335a12ea186240',
  'inter-bold': 'a6af2a7091aa11a5f055239a66ace07a08e3e399b53d733ae42f35e2c46c4dac',
};
assert.equal(allFonts.length, FACE_CATALOG.length);
FACE_CATALOG.forEach((e, i) => {
  const b = allFonts[i];
  assert.equal(b.id, e.id, `allFonts[${i}] is ${e.id}`);
  const d = decodeFace(b, e), json = JSON.stringify(d);
  assert.equal(createHash('sha256').update(json).digest('hex'), BAKED_SHA256[e.module], `${e.module}: decodes to the baked data`);
  assert.deepEqual(encodeFace(d, e), b, `${e.module}: re-encodes to the committed module`);
  // the tables getFace loads (Maps, glyphs decoded on first use) hold exactly decodeFace's data
  const t = decodeTables(b);
  assert.deepEqual(new Map(Object.entries(d.cmap)), t.cmap, `${e.module}: cmap`);
  assert.deepEqual(d.cover, t.cover, `${e.module}: cover`);
  assert.deepEqual(new Map(Object.entries(d.glyphs).map(([k, v]) => [Number(k), v])), t.glyphs, `${e.module}: glyphs`);
  assert.deepEqual(new Map(Object.entries(d.kern).map(([k, v]) => { const [l, r] = k.split(','); return [Number(l) * 65536 + Number(r), v]; })), t.kern, `${e.module}: kern`);
  for (const [name, rec, lazy] of [['outlines', d.outlines, t.outlines], ['offsets', d.offsets, t.offsets]] as const) {
    assert.deepEqual(lazy.gids(), Object.keys(rec).map(Number), `${e.module}: ${name} gids`);
    for (const [g, v] of Object.entries(rec)) assert.deepEqual(lazy.get(Number(g)), { kind: 'some', value: v }, `${e.module}: ${name} ${g}`);
    assert.deepEqual(lazy.get(1 << 20), { kind: 'none' }, `${e.module}: ${name} absent gid`);
  }
});
// VLQ: signs, multi-digit values, the 32-bit range, and corrupt input
const vlq = (xs: readonly number[]): string => encodeFace({ ...decodeFace(allFonts[0], FACE_CATALOG[0]), cover: [], kern: {}, cmap: {}, glyphs: {}, outlines: {}, offsets: { 1: [xs] } }, FACE_CATALOG[0]).offsets;
const edge = [0, 1, -1, 15, -16, 16, 511, -512, 1023, 65535, -65536, 2 ** 31 - 1, -(2 ** 31 - 1)];
assert.deepEqual([...decodeVlq(vlq(edge))].slice(3), edge, 'VLQ round-trips edge values');
assert.throws(() => decodeVlq('A!'), /bad VLQ character/);
assert.throws(() => decodeVlq('g'), /truncated VLQ/);

// 2. the registry starts empty; DejaVu Sans must be registered for a default figure
assert.deepEqual(registeredFonts(), []);
const draw = (rc: Readonly<Record<string, unknown>>, title: string, kw: Readonly<Record<string, unknown>>): string => {
  const [fig, ax] = subplots({ rc });
  ax.plot([1, 2, 3], [1, 4, 9]); ax.set_title(title, kw);
  return fig.toSVG();
};
const err = (f: () => unknown): FontNotLoadedError => {
  try { f(); } catch (e) { if (e instanceof FontNotLoadedError) return e; throw e; }
  assert.fail('expected FontNotLoadedError');
};
assert.equal(err(() => draw({}, 'default', {})).face, 'DejaVu Sans:400', 'default figure needs dejavuSans registered');
registerFonts(dejavuSans);
assert.ok(draw({}, 'default', {}).includes('<svg'), 'a default figure renders once dejavuSans is registered');
assert.deepEqual(FACE_LOADS.map((l) => l.id), ['DejaVu Sans:400'], 'and decodes only DejaVu Sans');

// a face that is not registered fails, typed and with the import to add; nothing is drawn instead
const bold = err(() => draw({}, 'bold', { fontweight: 'bold' }));
assert.equal(bold.face, 'DejaVu Sans:700'); assert.equal(bold.module, 'mpl/fonts/dejavu-sans-bold'); assert.equal(bold.binding, 'dejavuSansBold');
assert.match(bold.message, /import \{ dejavuSansBold \} from 'mpl\/fonts\/dejavu-sans-bold';/);
assert.equal(err(() => draw({ 'font.family': 'serif' }, 'serif', {})).face, 'DejaVu Serif:400', 'generic serif resolves to DejaVu Serif, never back to sans');
// selection runs over every shipped face: with only Inter Regular registered, weight 500 still selects
// Inter Medium (as matplotlib would) and fails, rather than drawing the nearest registered weight
registerFonts(interRegular);
assert.ok(draw({ 'font.family': 'Inter' }, 'inter', {}).includes('<svg'));
assert.equal(err(() => draw({ 'font.family': 'Inter' }, 'medium', { fontweight: 500 })).face, 'Inter:500');
registerFonts(interMedium, dejavuSansBold, interMedium);
assert.ok(draw({ 'font.family': 'Inter' }, 'medium', { fontweight: 500 }).includes('<svg'));
assert.ok(draw({}, 'bold', { fontweight: 'bold' }).includes('<svg'));
assert.deepEqual(registeredFonts(), ['DejaVu Sans:400', 'DejaVu Sans:700', 'Inter:400', 'Inter:500'], 'registered once each, catalog order');
// families mpl does not ship fall through the list exactly as before (matplotlib's fallback)
assert.ok(draw({ 'font.family': ['Comic Sans MS', 'sans-serif'] }, 'fallback', {}).includes('<svg'));
console.log(`font modules: ${FACE_CATALOG.length} faces decode to the baked data exactly; unregistered faces fail with FontNotLoadedError`);
