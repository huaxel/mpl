// FillBetweenPolyCollection._make_verts (matplotlib 3.11): the polygons fill_between draws, in data coordinates (pure).
// One polygon per contiguous run of `where`; each is start → (t, f1)… → end → (t, f2) reversed, with the step and
// interpolate options applied as matplotlib applies them.
import type { DrawStyle, Option } from './types.ts';
import { assertNever } from './types.ts';
import { stepped } from './steps.ts';

export type FillStep = 'pre' | 'post' | 'mid';
export type FillPolygon = { readonly x: Float64Array; readonly y: Float64Array };

/** cbook.contiguous_regions: [start, end) index pairs of the runs of true in `mask`. */
export function contiguousRegions(mask: readonly boolean[]): readonly (readonly [number, number])[] {
  const out: [number, number][] = [];
  let start = -1;
  for (let i = 0; i <= mask.length; i++) {
    const on = i < mask.length && mask[i];
    if (on && start < 0) start = i;
    if (!on && start >= 0) { out.push([start, i]); start = -1; }
  }
  return out;
}

/** np.interp(x, xp, fp) for xp sorted ascending (numpy's arr_interp, compiled_base.c, default left/right). */
export function npInterp(x: number, xp: readonly number[], fp: readonly number[]): number {
  const n = xp.length;
  if (n === 1) return fp[0];
  if (x < xp[0]) return fp[0];
  if (x > xp[n - 1]) return fp[n - 1];
  // binary_search_with_guess (a linear scan for these short arrays): the j with xp[j] <= x < xp[j + 1], or n - 1 when x is
  // the last abscissa; a NaN x compares false everywhere and lands on j = 0
  let j = 0;
  while (j < n - 1 && xp[j + 1] <= x) j++;
  if (j === n - 1) return fp[j];
  if (xp[j] === x) return fp[j];                                  // avoid a non-finite interpolation
  const slope = (fp[j + 1] - fp[j]) / (xp[j + 1] - xp[j]);
  let r = slope * (x - xp[j]) + fp[j];
  if (Number.isNaN(r)) {
    r = slope * (x - xp[j + 1]) + fp[j + 1];
    if (Number.isNaN(r) && fp[j] === fp[j + 1]) r = fp[j];
  }
  return r;
}

/** ndarray.argsort() of two or one values (the order np.interp needs): ties keep index order. */
const order = (v: readonly number[]): readonly number[] => (v.length === 2 && v[1] < v[0] ? [1, 0] : v.map((_, i) => i));

/** _get_interpolating_points: where f1 − f2 crosses 0 between t[idx − 1] and t[idx], and f1 there. */
function crossing(t: Float64Array, f1: Float64Array, f2: Float64Array, idx: number): readonly [number, number] {
  const im1 = Math.max(idx - 1, 0);
  const ts: number[] = [], diff: number[] = [], f1s: number[] = [];
  for (let i = im1; i <= idx && i < t.length; i++) { ts.push(t[i]); diff.push(f1[i] - f2[i]); f1s.push(f1[i]); }
  const o1 = order(diff);
  const rootT = npInterp(0, o1.map((i) => diff[i]), o1.map((i) => ts[i]));
  const o2 = order(ts);
  return [rootT, npInterp(rootT, o2.map((i) => ts[i]), o2.map((i) => f1s[i]))];
}

const stepStyle = (s: FillStep): DrawStyle => {
  switch (s) {
    case 'pre': return 'steps-pre';
    case 'post': return 'steps-post';
    case 'mid': return 'steps-mid';
    default: return assertNever(s);
  }
};

/** _make_verts: the polygon of each contiguous run of `where` (all of t when where is all true). */
export function fillPolygons(t: Float64Array, f1: Float64Array, f2: Float64Array, where: readonly boolean[], step: Option<FillStep>, interpolate: boolean): readonly FillPolygon[] {
  return contiguousRegions(where).map(([i0, i1]) => {
    let ts = t.subarray(i0, i1), a = f1.subarray(i0, i1), b = f2.subarray(i0, i1);
    if (step.kind === 'some') {
      const ds = stepStyle(step.value);
      const s1 = stepped(ts, a, ds), s2 = stepped(ts, b, ds);
      ts = s1.x; a = s1.y; b = s2.y;
    }
    const n = ts.length;
    const start = interpolate ? crossing(t, f1, f2, i0) : [ts[0], b[0]] as const;
    const end = interpolate ? crossing(t, f1, f2, i1) : [ts[n - 1], b[n - 1]] as const;
    const x = new Float64Array(2 * n + 2), y = new Float64Array(2 * n + 2);
    x[0] = start[0]; y[0] = start[1];
    for (let i = 0; i < n; i++) { x[1 + i] = ts[i]; y[1 + i] = a[i]; }
    x[n + 1] = end[0]; y[n + 1] = end[1];
    for (let i = 0; i < n; i++) { x[n + 2 + i] = ts[n - 1 - i]; y[n + 2 + i] = b[n - 1 - i]; }
    return { x, y };
  });
}
