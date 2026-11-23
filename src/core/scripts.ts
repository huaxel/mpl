// Script itemization as libraqm 0.10.5 does it for matplotlib 3.11 (raqm.c _raqm_resolve_scripts, _raqm_itemize): text is
// shaped in runs of one script (and one face), so HarfBuzz applies GSUB and kerning only inside a run. "ΔT" in Inter is
// two runs, Greek and Latin, and Δ does not kern with T although Inter's kerning classes pair them.
import { SCRIPT_BUCKETS, SCRIPT_RANGES } from './data/unicode-scripts.ts';

/** A Unicode script as mpl tells them apart (scripts/gen_unicode_scripts.py): the ones the baked faces carry, and Other. */
export type Script = (typeof SCRIPT_BUCKETS)[number];

let starts: Int32Array = new Int32Array(0);
let kinds: readonly Script[] = [];
function table(): void {
  if (starts.length > 0) return;
  const parts = SCRIPT_RANGES.split(',');
  const s = new Int32Array(parts.length), k: Script[] = [];
  let at = 0;
  parts.forEach((p, i) => {
    at += parseInt(p.slice(0, -1), 16);
    s[i] = at;
    k.push(SCRIPT_BUCKETS[Number(p.slice(-1))]);
  });
  starts = s; kinds = k;
}

/** _raqm_unicode_script: hb_unicode_script, with nonspacing marks (Mn) as Inherited. */
export function unicodeScript(cp: number): Script {
  table();
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= cp) lo = mid; else hi = mid - 1;
  }
  return kinds[lo];
}

// raqm's paired_chars: an even index opens, the next odd one closes
const PAIRED = [0x0028, 0x0029, 0x003c, 0x003e, 0x005b, 0x005d, 0x007b, 0x007d, 0x00ab, 0x00bb, 0x2018, 0x2019, 0x201c, 0x201d,
  0x2039, 0x203a, 0x3008, 0x3009, 0x300a, 0x300b, 0x300c, 0x300d, 0x300e, 0x300f, 0x3010, 0x3011, 0x3014, 0x3015, 0x3016, 0x3017,
  0x3018, 0x3019, 0x301a, 0x301b];

/**
 * _raqm_resolve_scripts, one script per code point of `chars`: a Common or Inherited character takes the script before it
 * (a closing bracket its opening bracket's), characters before the first real script take that script, and whatever is
 * still Common or Inherited then takes the script of the character after it.
 */
export function resolveScripts(chars: readonly string[]): Script[] {
  const n = chars.length;
  const sc: Script[] = chars.map((ch) => unicodeScript(Number(ch.codePointAt(0))));
  const stackScript: Script[] = [], stackPair: number[] = [];
  let lastScriptIndex = -1, lastSetIndex = -1;
  let lastScript: Script = 'Other';   // HB_SCRIPT_INVALID: never read before lastScriptIndex is set
  for (let i = 0; i < n; i++) {
    if (sc[i] === 'Common' && lastScriptIndex !== -1) {
      const pair = PAIRED.indexOf(Number(chars[i].codePointAt(0)));
      if (pair >= 0 && (pair & 1) === 0) {
        sc[i] = lastScript; lastSetIndex = i;
        stackScript.push(sc[i]); stackPair.push(pair);
      } else if (pair >= 0) {
        // a closing bracket: pop to its opening one (which stays on the stack)
        while (stackPair.length > 0 && stackPair[stackPair.length - 1] !== (pair & ~1)) { stackPair.pop(); stackScript.pop(); }
        if (stackPair.length > 0) { sc[i] = stackScript[stackScript.length - 1]; lastScript = sc[i]; } else sc[i] = lastScript;
        lastSetIndex = i;
      } else {
        sc[i] = lastScript; lastSetIndex = i;
      }
    } else if (sc[i] === 'Inherited' && lastScriptIndex !== -1) {
      sc[i] = lastScript; lastSetIndex = i;
    } else {
      for (let j = lastSetIndex + 1; j < i; j++) sc[j] = sc[i];
      lastScript = sc[i]; lastScriptIndex = i; lastSetIndex = i;
    }
  }
  for (let i = n - 2; i >= 0; i--) if (sc[i] === 'Inherited' || sc[i] === 'Common') sc[i] = sc[i + 1];
  return sc;
}
