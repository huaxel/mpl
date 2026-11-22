"""Which calls matplotlib rejects, from matplotlib itself -> fixtures/api_errors_oracle.json (test/api-errors.test.ts).

Each case is a [method, args, kwargs] call on a fresh `fig, ax = plt.subplots()` (a "fig." prefix calls the Figure), as the
fixture specs write it; mpl's JS form is ax[method](...args, kwargs). The oracle records the exception class matplotlib
raises, or null. Signature cases call every method with one positional argument more than inspect.signature allows.
Run with matplotlib 3.11.2 (fixtures/requirements.txt): python fixtures/generate_api_errors_oracle.py
"""
import inspect, json, os, warnings
import numpy as np
import matplotlib
matplotlib.use("agg")
import matplotlib.pyplot as plt

OUT = os.path.join(os.path.dirname(__file__), "api_errors_oracle.json")

# methods mpl exposes with a fixed signature (plot/step/set_xlim/legend take *args and parse them; they are not here)
AXES = ["axhline", "axvline", "axline", "hlines", "vlines", "errorbar", "hist", "boxplot", "pie", "bar", "barh", "fill_between",
        "text", "annotate", "imshow", "scatter", "axvspan", "axhspan", "set_title", "get_title", "tick_params", "set_xlabel",
        "set_ylabel", "set_xticks", "set_yticks", "set_xticklabels", "set_yticklabels", "grid", "set_xscale", "set_yscale",
        "set_aspect", "set_box_aspect", "set_anchor", "set_xinverted", "set_yinverted", "invert_xaxis", "invert_yaxis",
        "get_xinverted", "get_yinverted", "xaxis_inverted", "yaxis_inverted", "get_xticklabels", "get_yticklabels", "twinx"]
FIGURE = ["colorbar", "subplots", "text", "suptitle", "supxlabel", "supylabel", "subplots_adjust", "autofmt_xdate", "tight_layout"]

def positional(f):
    ps = inspect.signature(inspect.unwrap(f)).parameters.values()
    if any(p.kind == p.VAR_POSITIONAL for p in ps):
        raise SystemExit(f"{f.__name__} takes *args; it has no positional limit to test")
    return [p.name for p in ps if p.kind in (p.POSITIONAL_ONLY, p.POSITIONAL_OR_KEYWORD) and p.name != "self"]

def run(method, args, kwargs):
    fig, ax = plt.subplots()
    target = fig if method.startswith("fig.") else ax
    name = method[4:] if method.startswith("fig.") else method
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            getattr(target, name)(*args, **kwargs)
            fig.canvas.draw()
        return None, None
    except Exception as e:  # the class is the oracle; the message is kept for reading only
        return type(e).__name__, str(e)
    finally:
        plt.close(fig)

cases = []
def case(method, args, kwargs=None, note=""):
    raised, msg = run(method, args, kwargs or {})
    cases.append({"call": [method, args, kwargs or {}], "raises": raised, "message": msg, "note": note})

def too_many(method, f):
    pos = positional(f)
    case(method, [0] * (len(pos) + 1), note=f"{method}({', '.join(pos)}): one positional too many")
    c = cases[-1]
    if c["raises"] != "TypeError" or "positional argument" not in c["message"]:
        raise SystemExit(f"{method}: expected the binding TypeError, got {c['raises']}: {c['message']}")
for m in AXES:
    too_many(m, getattr(matplotlib.axes.Axes, m))
for m in FIGURE:
    too_many("fig." + m, getattr(matplotlib.figure.Figure, m))

# Issue #86: bar/barh take width/bottom (height/left) positionally; a name given both ways is a TypeError
X, H = ["a", "b"], [300, 500]
case("bar", [X, H, 0.72], {"bottom": [0, 0], "label": "one"})
case("bar", [X, H, 0.72, [10, 20]], {"label": "one"})
case("bar", [X, H, 0.72], {"width": 0.3}, note="width twice")
case("bar", [X, H, 0.72, 0], {"bottom": 1}, note="bottom twice")
case("bar", [X, H, 0.72, 0, "center"], note="align is keyword-only")
case("barh", [X, H, 0.4, [1, 2]])
case("barh", [X, H, 0.4], {"height": 0.3}, note="height twice")
case("barh", [X, H, 0.4, 0, "edge"], note="align is keyword-only")
case("fill_between", [[0, 1, 2], [1, 2, 1]], {"y2": 0.5})
case("fill_between", [[0, 1, 2], [1, 2, 1], 0], {"y2": 0.5}, note="y2 twice")

# Issue #89: set_xticks(ticks, labels=None, *, minor=False, **kwargs) is set_ticks then set_ticklabels(labels, **kwargs)
T3 = [0, 1, 2]
for m in ("set_xticks", "set_yticks"):
    case(m, [T3, ["a", "b", "c"]])
    case(m, [T3], {"labels": ["a", "b", "c"], "color": "C3", "fontsize": 12})
    case(m, [T3, ["a", "b", "c"]], {"rotation": 45, "ha": "right"})
    case(m, [T3, ["a", "b"]], note="labels shorter than ticks")
    case(m, [T3, ["a", "b", "c", "d"]], note="labels longer than ticks")
    case(m, [T3], {"fontsize": 12}, note="text kwargs need labels")
    case(m, [T3, ["a", "b", "c"]], {"bogus": 1}, note="not a Text property")
    case(m, [T3, ["a", "b", "c"]], {"labels": ["d", "e", "f"]}, note="labels twice")
    case(m, [T3, 5], note="labels not iterable")

# Issue #90: spans take linestyle/ls (a bad one is matplotlib's ValueError) and zorder; bars take zorder
case("axvspan", [1, 2], {"linestyle": "zigzag"}, note="unknown linestyle")
case("axhspan", [1, 2], {"ls": "--", "zorder": 0})
case("bar", [[1, 2], [3, 4]], {"zorder": 3})

# Issue #91: legend bbox_to_anchor is a 2- or 4-tuple
case("legend", [], {"bbox_to_anchor": [0, 1.02], "loc": "lower left"})
case("legend", [], {"bbox_to_anchor": [0, 1, 0.5]}, note="3 numbers")

with open(OUT, "w") as f:
    json.dump({"matplotlib": matplotlib.__version__, "cases": cases}, f, indent=1)
    f.write("\n")
print(f"wrote {len(cases)} cases to {OUT}")
