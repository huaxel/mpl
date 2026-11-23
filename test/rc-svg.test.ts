import assert from 'node:assert/strict';
import { subplots } from '../src/index.ts';
import { registerDefaultFonts } from './helpers/register-defaults.ts';
registerDefaultFonts();

// unknown rc keys raise a clear error; svg.fonttype is a known key
try {
  // oxlint-disable-next-line typescript/no-explicit-any -- intentional bad input for the test
  subplots({ rc: { 'bogus.key': 1 } as any });
  assert.fail('expected unknown rc key to throw');
} catch (e) {
  const msg = (e as Error).message;
  assert.ok(msg.includes("unknown rc key 'bogus.key'"), `message: ${msg}`);
}

// rc 'svg.fonttype' honoured by toSVG(): 'path' -> glyph outlines, 'none' -> <text>
{
  const [fig, ax] = subplots({ rc: { 'svg.fonttype': 'path' } });
  ax.text(0.5, 0.5, 'Hello', { transform: ax.transAxes });
  const svg = fig.toSVG();
  assert.ok(svg.includes('<use href="#'), 'glyph <use> elements present for path mode');
  assert.ok(!svg.includes('<text '), 'no <text> tags when svg.fonttype=path');
}
{
  const [fig, ax] = subplots({ rc: { 'svg.fonttype': 'none' } });
  ax.text(0.5, 0.5, 'Hello', { transform: ax.transAxes });
  const svg = fig.toSVG();
  assert.ok(svg.includes('<text '), '<text> elements present for svg.fonttype=none');
}
// svgChunks() and svgStream() write the same document as toSVG(), svg.fonttype included
for (const fonttype of ['path', 'none'] as const) {
  const [fig, ax] = subplots({ rc: { 'svg.fonttype': fonttype } });
  ax.plot([0, 1, 2], [1, 3, 2]);
  ax.set_title('Hello');
  const whole = fig.toSVG();
  assert.equal([...fig.svgChunks()].join(''), whole, `svgChunks() equals toSVG() with svg.fonttype=${fonttype}`);
  const reader = fig.svgStream().getReader(), parts: Uint8Array[] = [];
  for (let r = await reader.read(); !r.done; r = await reader.read()) parts.push(r.value);
  assert.equal(new TextDecoder().decode(Buffer.concat(parts)), whole, `svgStream() equals toSVG() with svg.fonttype=${fonttype}`);
}
console.log('rc/svg.fonttype: ok');


// svg.fonttype 'none' writes one <text> per Text, the whole string, and leaves its layout to the viewer, as matplotlib 3.11.2
// does (oracle run 45222524679: "θ (rad) · Φ", "Ω-resistance, Δt = 5 μs", "∀ x ∈ A", "μ ± σ" and a rotated "ΔT rot" are each
// one <text>, under font.family DejaVu Sans, ['Inter', 'DejaVu Sans'] and 'Inter, DejaVu Sans'). The script and fallback runs
// mpl shapes for PNG and glyph-path SVG must not become several <text> elements at one x: drawn by a browser, they overlap
// (mpl-web 28cd4bea, 2026-11-23). A string that needed font fallback names the faces it drew from, in order.
{ const { registerFonts } = await import('../src/core/fonts.ts'); const { allFonts } = await import('../src/fonts/all.ts'); registerFonts(...allFonts); }
for (const family of [['DejaVu Sans'], ['Inter', 'DejaVu Sans'], 'Inter, DejaVu Sans']) {
  const [fig, ax] = subplots({ rc: { 'svg.fonttype': 'none', 'font.family': family } });
  ax.set_title('Ω-resistance, Δt = 5 μs'); ax.set_xlabel('θ (rad) · Φ');
  ax.text(0.5, 0.5, '∀ x ∈ A', { transform: ax.transAxes }); ax.set_ylabel('ΔT rot (μs)');
  ax.plot([1, 2], [1, 2], { label: 'μ ± σ' }); ax.legend();
  const texts = [...fig.toSVG().matchAll(/<text ([^>]*)>([^<]*)<\/text>/g)].map((m) => ({ attrs: m[1], text: m[2] }));
  for (const s of ['Ω-resistance, Δt = 5 μs', 'θ (rad) · Φ', '∀ x ∈ A', 'ΔT rot (μs)', 'μ ± σ']) {
    const hits = texts.filter((t) => t.text === s);
    assert.equal(hits.length, 1, `${JSON.stringify(family)}: ${JSON.stringify(s)} is one <text>; got ${JSON.stringify(texts.filter((t) => s.includes(t.text) && t.text.trim() !== '' && !/^[\d.]+$/.test(t.text)).map((t) => t.text))}`);
  }
  if (family !== 'DejaVu Sans' && JSON.stringify(family) !== '["DejaVu Sans"]') {
    const forall = texts.find((t) => t.text === '∀ x ∈ A');
    assert.match(forall?.attrs ?? '', /font-family="'Inter', 'DejaVu Sans'"/, `${JSON.stringify(family)}: ∀ draws from DejaVu Sans, x from Inter`);
  }
}
console.log('rc-svg: svg.fonttype none writes one <text> per string, as matplotlib does');
