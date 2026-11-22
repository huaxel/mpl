// No argument is dropped silently (issue #86). fixtures/api_errors_oracle.json records which calls matplotlib 3.11.2 rejects
// with a TypeError (fixtures/generate_api_errors_oracle.py); mpl must reject each of them with a TypeError too. The calls
// matplotlib accepts and mpl runs are pinned pixel-exact by fixtures/ref (bar_positional_*, fill_between_y2_keyword).
import { readFileSync } from 'node:fs';
import { subplots } from '../src/index.ts';

type Case = { readonly call: readonly [string, readonly unknown[], Readonly<Record<string, unknown>>]; readonly raises: string | null; readonly note: string };
const ORACLE: { readonly cases: readonly Case[] } = JSON.parse(readFileSync(new URL('../fixtures/api_errors_oracle.json', import.meta.url), 'utf8'));
type Dyn = Record<string, (...args: unknown[]) => unknown>;

let fails = 0, checks = 0;
const check = (ok: boolean, msg: string): void => { checks++; if (!ok) { fails++; console.log(`FAIL ${msg}`); } };
/** Run one spec call the way tools/replay-core.ts does: target[method](...args, kwargs) (kwargs only when non-empty), then draw. */
const run = (method: string, args: readonly unknown[], kwargs: Readonly<Record<string, unknown>>): Error | null => {
  const [fig, ax] = subplots();
  const fn = method.startsWith('fig.') ? method.slice(4) : method;
  const target = (method.startsWith('fig.') ? fig : ax) as unknown as Dyn;
  try {
    if (typeof target[fn] !== 'function') throw new Error(`no ${method}`);
    target[fn](...args, ...(Object.keys(kwargs).length > 0 ? [kwargs] : []));
    fig.toSVG();
    return null;
  } catch (e) { return e instanceof Error ? e : new Error(String(e)); }
};
const show = (c: Case): string => `${c.call[0]}(${c.call[1].map((a) => JSON.stringify(a)).join(', ')}${Object.keys(c.call[2]).length > 0 ? `, ${JSON.stringify(c.call[2])}` : ''})`;

let rejected = 0, accepted = 0;
for (const c of ORACLE.cases) {
  const e = run(...c.call);
  if (c.raises === 'TypeError') {
    rejected++;
    check(e instanceof TypeError, `${show(c)}: matplotlib raises TypeError (${c.note}); mpl ${e === null ? 'accepted it' : `threw ${e.name}: ${e.message}`}`);
  } else if (c.raises === null) {
    accepted++;
    check(e === null, `${show(c)}: matplotlib accepts it; mpl threw ${e === null ? '' : `${e.name}: ${e.message}`}`);
  } else {
    check(false, `${show(c)}: oracle raises ${c.raises}, which this test does not map`);
  }
}

// The issue's reproducer: a positional width now stacks, labels and sizes the bars
{
  const [fig, ax] = subplots();
  const a = ax.bar(['a', 'b'], [300, 500], 0.72, { bottom: [0, 0], label: 'one' });
  const b = ax.bar(['a', 'b'], [200, 400], 0.72, { bottom: [300, 500], label: 'two' });
  ax.legend();
  fig.toSVG();
  check(a.label.kind === 'text' && a.label.text === 'one' && b.label.kind === 'text' && b.label.text === 'two', 'issue #86: labels reach the bars');
  check([...b.y].join() === '300,500' && [...a.w].join() === '0.72,0.72', `issue #86: bottom and width applied, got y=${[...b.y]} w=${[...a.w]}`);
}

// JS has no positional/keyword split, so the keyword object's slot must hold a plain object: anything else there is an
// argument mpl does not take positionally, and reading names off it would ignore it (the #86 failure)
const notKw: readonly [string, () => unknown][] = [
  ['scatter(x, y, 10)', () => subplots()[1].scatter([1], [2], 10 as never)],
  ['hist(x, 20)', () => subplots()[1].hist([1, 2, 3], 20 as never)],
  ['axhline(0.5, 0.2)', () => subplots()[1].axhline(0.5, 0.2 as never)],
  ['text(0, 0, "s", "red")', () => subplots()[1].text(0, 0, 's', 'red' as never)],
  ['legend(["a"])', () => subplots()[1].legend(['a'] as never)],
  ['imshow(Z, "gray")', () => subplots()[1].imshow([[1, 2]], 'gray' as never)],
  ['toSVG(2)', () => subplots()[0].toSVG(2 as never)],
];
for (const [what, f] of notKw) {
  try { f(); check(false, `${what}: accepted a non-object where the keyword object goes`); } catch (e) {
    check(e instanceof TypeError && /keyword arguments must be a plain object/.test((e as Error).message), `${what}: ${(e as Error).message}`);
  }
}
// methods without a keyword object reject one, instead of ignoring it (set_xlabel's fontsize was dropped)
for (const [what, f] of [
  ['set_xlabel("x", { fontsize: 20 })', () => (subplots()[1] as unknown as Dyn)['set_xlabel']?.('x', { fontsize: 20 })],
  ['set_yscale("log", { base: 2 })', () => (subplots()[1] as unknown as Dyn)['set_yscale']?.('log', { base: 2 })],
] as const) {
  try { f(); check(false, `${what}: accepted an argument it ignores`); } catch (e) {
    check(e instanceof TypeError && /takes 1 argument, but 2 arguments were given/.test((e as Error).message), `${what}: ${(e as Error).message}`);
  }
}

if (fails > 0) { console.log(`api-errors: ${fails} of ${checks} checks failed`); process.exit(1); }
console.log(`api-errors: ${checks} checks ok (${rejected} calls matplotlib 3.11.2 rejects, ${accepted} it accepts)`);
