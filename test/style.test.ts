// .mplstyle text as matplotlib reads it (_rc_params_in_file + rcsetup validators): the validate_stringlist keys split on
// commas, and a double-quoted value loses its quotes. font.family from a sheet, an rc string and an rc list draw the same
// figure (fixture font_family_string_list is matplotlib's drawing of the rc string).
import assert from 'node:assert/strict';
import { DEFAULTS } from '../src/core/rc.ts';
import { parseStyle } from '../src/core/style.ts';
import { registerFonts } from '../src/core/fonts.ts';
import { allFonts } from '../src/fonts/all.ts';
import { subplots } from '../src/index.ts';
import type { SubplotsKwargs } from '../src/index.ts';

registerFonts(...allFonts);
const parsed = (text: string): ReadonlyMap<string, unknown> => {
  const r = parseStyle(text);
  if (!r.ok) assert.fail(r.error);
  return r.value;
};

// matplotlib's default font.family is the list ['sans-serif']
assert.deepEqual(DEFAULTS.get('font.family'), ['sans-serif']);

const layer = parsed([
  'font.family: Inter, DejaVu Sans',
  'font.sans-serif: Inter, , DejaVu Sans,',     // empty items drop, as validate_stringlist drops them
  'font.serif: DejaVu Serif',
  'font.monospace: DejaVu Sans Mono, monospace',
  'keymap.save: s, ctrl+s',
  'animation.ffmpeg_args:',
  'axes.titlelocation: "left"',
].join('\n'));
assert.deepEqual(layer.get('font.family'), ['Inter', 'DejaVu Sans']);
assert.deepEqual(layer.get('font.sans-serif'), ['Inter', 'DejaVu Sans']);
assert.deepEqual(layer.get('font.serif'), ['DejaVu Serif']);
assert.deepEqual(layer.get('font.monospace'), ['DejaVu Sans Mono', 'monospace']);
assert.deepEqual(layer.get('keymap.save'), ['s', 'ctrl+s']);
assert.deepEqual(layer.get('animation.ffmpeg_args'), []);
assert.equal(layer.get('axes.titlelocation'), 'left');
// one name is a one-item list; a comment after it is not part of it
assert.deepEqual(parsed('font.family: Inter  # dashboards').get('font.family'), ['Inter']);

// the same chain from a sheet, an rc string and an rc list: Inter first, DejaVu Sans for what Inter lacks (∀ ∈ ∇ ⇄)
const draw = (opts: SubplotsKwargs): string => {
  const [fig, ax] = subplots(opts);
  ax.plot([1, 2, 3], [2, 7, 5], { label: '∀x ∈ A' });
  ax.legend();
  ax.set_title('∇·E ⇄ ρ/ε₀, Δt ≈ 5 μs');
  return fig.toSVG();
};
const list = draw({ rc: { 'font.family': ['Inter', 'DejaVu Sans'] } });
assert.equal(draw({ style: 'font.family: Inter, DejaVu Sans' }), list, '.mplstyle font.family is a list');
assert.equal(draw({ style: 'font.family: "Inter, DejaVu Sans"' }), list, 'a double-quoted value loses its quotes');
assert.equal(draw({ rc: { 'font.family': 'Inter, DejaVu Sans' } }), list, 'an rc string splits as validate_stringlist splits it');
assert.notEqual(draw({ rc: { 'font.family': ['DejaVu Sans'] } }), list, 'and it is not the DejaVu-only drawing');
console.log('style: validate_stringlist keys split on commas, quoted values unquoted, font.family sheet = rc string = rc list');
