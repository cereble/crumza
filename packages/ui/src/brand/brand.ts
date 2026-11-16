import {
  contrast,
  hexToLinear,
  type Linear,
  linearToHex,
  linearToOklch,
  luma,
  mixOklab,
  normalizeHex,
  oklchToLinear,
  parseColor,
} from './color.ts';
import {
  COLOR_NAMES,
  type ColorName,
  DEFAULT_INPUTS,
  HUES,
  type Hue,
  type Kit,
  LABEL,
  MODES,
  type Mode,
  recipe,
  type Scale,
  STAND_INS,
} from './recipe.ts';

export interface BrandFonts {
  readonly sans?: string;
  readonly display?: string;
  readonly mono?: string;
}

/** A brand guideline: one colour is enough, the rest is optional. */
export interface BrandInput {
  readonly name?: string;
  readonly primary: string;
  /** Without it, secondary is the neutral scale. */
  readonly secondary?: string;
  /** Without it, accent is the primary. */
  readonly accent?: string;
  readonly danger?: string;
  readonly warning?: string;
  readonly success?: string;
  readonly info?: string;
  /** The brand's own page and text colours. Without them, near-greys in the primary's hue. */
  readonly paper?: string;
  readonly ink?: string;
  /** Colours for dark mode. Without them, each colour is lifted to a light tone of itself. */
  readonly dark?: Partial<Record<Hue | 'paper' | 'ink', string>>;
  readonly fonts?: BrandFonts;
}

export interface BrandColor {
  /** The guideline's own colour, per mode; undefined for the neutral scale. */
  readonly brand: Readonly<Record<Mode, string>> | undefined;
  readonly light: readonly string[];
  readonly dark: readonly string[];
  /** The label colour on steps 9 and 10. */
  readonly on: Readonly<Record<Mode, string>>;
}

export interface Brand {
  readonly name: string;
  readonly colors: Readonly<Record<ColorName, BrandColor>>;
  readonly fonts: BrandFonts;
  /** Where the guideline was bent to keep the contrast promises, in plain words. */
  readonly warnings: readonly string[];
}

const clamp = (min: number, value: number, max: number): number => Math.max(min, Math.min(value, max));
const safe = (c: Linear): number => Math.max(luma(c), 1e-4);
const each = (c: Linear, f: (v: number) => number): Linear => [f(c[0]), f(c[1]), f(c[2])];
const towardWhite = (c: Linear, t: number): Linear => each(c, (v) => v + (1 - v) * t);
// 1 for a colour that carries dark labels, 0 for one that carries white labels.
const darkLabels = (c: Linear, threshold: number): number => clamp(0, (luma(c) - threshold) * 10_000, 1);

/**
 * The recipe in numbers, on linear-light sRGB: the same steps the browser takes in css.ts. Scaling and mixing
 * toward white are linear, so they give here exactly what they give in XYZ there.
 */
class NumberKit implements Kit<Linear> {
  readonly #inputs: ReadonlyMap<string, Linear>;

  constructor(inputs: ReadonlyMap<string, Linear>) {
    this.#inputs = inputs;
  }

  input(name: string, fallback?: Linear): Linear {
    const value = this.#inputs.get(name) ?? fallback;
    if (!value) throw new Error(`Crumza brand: "${name}" is needed`);
    return value;
  }

  share(_name: string, value: Linear): Linear {
    return value;
  }

  tone(from: Linear, l: number | null, chroma: readonly [number, number] | null): Linear {
    const o = linearToOklch(from);
    return oklchToLinear({ l: l ?? o.l, c: chroma ? Math.min(o.c * chroma[0], chroma[1]) : o.c, h: o.h });
  }

  lift(from: Linear, min: number): Linear {
    const o = linearToOklch(from);
    return oklchToLinear({ ...o, l: Math.max(o.l, min) });
  }

  mix(a: Linear, b: Linear, weight: number): Linear {
    return mixOklab(a, b, weight);
  }

  clip(from: Linear): Linear {
    return each(from, (v) => clamp(0, v, 1));
  }

  atMost(from: Linear, y: number): Linear {
    const k = Math.min(1, y / safe(from));
    return each(from, (v) => v * k);
  }

  atLeast(from: Linear, y: number): Linear {
    return towardWhite(from, Math.max(0, (y - luma(from)) / Math.max(1 - luma(from), 1e-4)));
  }

  fill(from: Linear, mode: Mode): Linear {
    const k = Math.min(1, Math.max(LABEL.white / safe(from), (luma(from) - LABEL.dark) * 10_000));
    const darkened = each(from, (v) => v * k);
    if (mode === 'light') return darkened;
    return towardWhite(darkened, Math.max(0, (LABEL.floor - luma(darkened)) / Math.max(1 - luma(darkened), 1e-4)));
  }

  hover(fill: Linear): Linear {
    const dark = darkLabels(fill, LABEL.split);
    const spread = 1 - LABEL.lighter - LABEL.darker;
    return each(fill, (v) => v * LABEL.darker + dark * (v * spread + LABEL.lighter));
  }

  label(fill: Linear): Linear {
    const dark = darkLabels(fill, LABEL.split);
    const ys = safe(fill);
    return each(fill, (v) => 1 + dark * ((v * LABEL.ink) / ys - 1));
  }
}

/** The inputs the brand gives, as the recipe names them: `primary`, `primary-dark`, `paper-dark` and so on. */
function inputsOf(input: BrandInput): Map<string, string> {
  const given = new Map<string, string>();
  for (const name of [...HUES, 'paper', 'ink'] as const) {
    const light = input[name];
    if (light) given.set(name, normalizeHex(light));
    const dark = input.dark?.[name];
    if (dark) given.set(`${name}-dark`, normalizeHex(dark));
  }
  return given;
}

/**
 * Brand colours in, every colour of the interface out, in light and dark mode: the same values the stylesheet
 * computes in the browser from `--cz-brand-*` variables. Use it to check a guideline, or where CSS cannot go.
 */
export function defineBrand(input: BrandInput): Brand {
  const own = inputsOf(input);
  // The page's defaults fill in what the brand leaves out, as they do in the stylesheet.
  const given = new Map([...Object.entries(DEFAULT_INPUTS), ...own]);
  const linear = new Map([...given].map(([name, hex]) => [name, hexToLinear(hex)] as const));
  // Stand-in colours run on a placeholder and are swapped for the scale they stand in for afterwards.
  for (const name of Object.keys(STAND_INS)) {
    if (!linear.has(name)) linear.set(name, [0.5, 0.5, 0.5]);
  }
  const kit = new NumberKit(linear);
  const hex = (scale: Scale<Linear>): { readonly steps: string[]; readonly on: string } => ({
    steps: scale.steps.map(linearToHex),
    on: linearToHex(scale.on),
  });
  const light = recipe(kit, 'light');
  const dark = recipe(kit, 'dark');
  const warnings: string[] = [];

  const colors = {} as Record<ColorName, BrandColor>;
  for (const name of COLOR_NAMES) {
    const stand = STAND_INS[name as Hue];
    const source = stand && !given.has(name) ? stand : name;
    const l = hex(light[source]);
    const d = hex(dark[source]);
    const hue = name !== 'neutral' && given.has(source) ? (source as Hue) : undefined;
    colors[name] = {
      brand: hue ? { light: given.get(hue) ?? '', dark: given.get(`${hue}-dark`) ?? given.get(hue) ?? '' } : undefined,
      light: l.steps,
      dark: d.steps,
      on: { light: l.on, dark: d.on },
    };
  }

  // Report where a colour the brand gave had to move so its labels read.
  for (const name of HUES) {
    const color = colors[name];
    for (const mode of MODES) {
      const wanted = own.get(mode === 'light' ? name : `${name}-dark`);
      const fill = color[mode][8];
      if (!wanted || !fill || wanted === fill) continue;
      const ratio = contrast(wanted, color.on[mode]).toFixed(2);
      warnings.push(`${name} ${mode}: labels read ${ratio}:1 on ${wanted}, so the fill is ${fill}`);
    }
  }
  for (const mode of MODES) {
    const paper = colors.neutral[mode][0] ?? '';
    const l = parseColor(paper).l;
    if (mode === 'light' ? l < 0.6 : l > 0.5) {
      warnings.push(`neutral ${mode}: the paper ${paper} is ${mode === 'light' ? 'dark' : 'light'} for ${mode} mode`);
    }
    const ink = own.get(mode === 'light' ? 'ink' : 'ink-dark');
    const strong = colors.neutral[mode][11];
    if (ink && strong && ink !== strong) {
      warnings.push(`neutral ${mode}: the ink ${ink} reads under 7:1 on the page, so strong text is ${strong}`);
    }
  }

  return { name: input.name ?? 'brand', colors, fonts: input.fonts ?? {}, warnings };
}

/** CSS custom properties: a brand's inputs, for an inline style or a rule. */
export type BrandStyle = Record<`--cz-${string}`, string>;

/**
 * The brand as the variables the stylesheet reads: `--cz-brand-*` colours and `--cz-font*` faces. Put them on any
 * element (`<html style>` for the page) and everything inside takes the brand, computed live.
 */
export function brandStyle(input: BrandInput): BrandStyle {
  const style: BrandStyle = {};
  for (const name of [...HUES, 'paper', 'ink'] as const) {
    const light = input[name];
    if (light) style[`--cz-brand-${name}`] = normalizeHex(light);
    const dark = input.dark?.[name];
    if (dark) style[`--cz-brand-${name}-dark`] = normalizeHex(dark);
  }
  const { sans, display, mono } = input.fonts ?? {};
  if (sans) style['--cz-font'] = sans;
  if (display) style['--cz-font-display'] = display;
  if (mono) style['--cz-mono'] = mono;
  return style;
}

/** The brand as one CSS rule for `selector`. */
export function brandCss(input: BrandInput, selector = ':root'): string {
  const body = Object.entries(brandStyle(input))
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n');
  return `${selector} {\n${body}\n}\n`;
}
