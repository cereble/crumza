/*
 * The brand recipe: how a few brand colours become every colour the interface uses. It is written once against
 * `Kit`, and runs twice: as CSS formulas the browser evaluates live (css.ts), and as numbers (brand.ts) for checks
 * and for anything that is not a web page. Both follow these exact steps, so they agree.
 *
 * Backgrounds are mixes of the page with a tint of the colour, so they always step away from the brand's own paper.
 * Everything that must be read (text, outlines, fills under labels, the labels) is set by WCAG luminance, so its
 * contrast is exact, not estimated.
 */

export type Mode = 'light' | 'dark';

export const MODES: readonly Mode[] = ['light', 'dark'];

/** Colours with a hue of their own. */
export const HUES = ['primary', 'secondary', 'accent', 'danger', 'warning', 'success', 'info'] as const;
export type Hue = (typeof HUES)[number];

/** Every colour scale, in the order they are written out. */
export const COLOR_NAMES = [
  'primary',
  'secondary',
  'accent',
  'neutral',
  'danger',
  'warning',
  'success',
  'info',
] as const;
export type ColorName = (typeof COLOR_NAMES)[number];

/** Inputs that may be left out, and the scale that stands in for them. */
export const STAND_INS: Readonly<Partial<Record<Hue, ColorName>>> = { secondary: 'neutral', accent: 'primary' };

/** The brand colours a page starts with: Mochi, with clear status colours. */
export const DEFAULT_INPUTS: Readonly<Record<string, string>> = {
  primary: '#66736c',
  danger: '#94625a',
  warning: '#f59e0b',
  success: '#16a34a',
  info: '#2563eb',
};

export type Chroma = readonly [factor: number, cap: number];

/** The operations the recipe is written in. */
export interface Kit<C> {
  /** A brand input; `fallback` stands in when it is not set. */
  input(name: string, fallback?: C): C;
  /** Names a value so later formulas can share it. */
  share(name: string, value: C): C;
  /** Keeps the hue; sets lightness (null keeps it) and limits chroma to min(c * factor, cap). */
  tone(from: C, l: number | null, chroma: Chroma | null): C;
  /** Raises lightness to at least `min`. */
  lift(from: C, min: number): C;
  /** `color-mix(in oklab, a, b weight)`, weight from 0 to 1. */
  mix(a: C, b: C, weight: number): C;
  /** Clips to the sRGB range, so luminance is measured on the colour that will be shown. */
  clip(from: C): C;
  /** Darkens, keeping the hue, until luminance is at most `y`. */
  atMost(from: C, y: number): C;
  /** Lightens toward white until luminance is at least `y`. */
  atLeast(from: C, y: number): C;
  /** A solid fill its label can read on: white labels on deep colours, dark ones on light colours. */
  fill(from: C, mode: Mode): C;
  /** A fill's hover, moved away from its label so the label only reads better. */
  hover(fill: C): C;
  /** The label colour on a fill. */
  label(fill: C): C;
}

export interface Scale<C> {
  /** Twelve steps: 1-2 pages, 3-5 soft fills, 6-7 quiet lines, 8 outlines, 9-10 fill and hover, 11-12 text. */
  readonly steps: readonly C[];
  /** The label colour on steps 9 and 10. */
  readonly on: C;
}

// Mochi's dark primary is its light primary lifted to this lightness; every colour follows the same rule.
const DARK_LIFT = 0.8;

// Without a paper and ink of its own, a brand gets near-greys in the hue of its primary.
const PAPER: Record<Mode, [number, Chroma]> = { light: [0.985, [0.07, 0.003]], dark: [0.24, [0.25, 0.006]] };
const INK: Record<Mode, [number, Chroma]> = { light: [0.318, [0.5, 0.012]], dark: [0.94, [0.22, 0.005]] };

// Lightness distances of steps 1 to 7 from the page, and the page and ink they were measured on.
const OFFSETS: Record<Mode, readonly number[]> = {
  light: [0.004, 0.012, 0.032, 0.052, 0.076, 0.107, 0.148],
  dark: [0.006, 0.03, 0.069, 0.097, 0.128, 0.168, 0.224],
};
const REFERENCE_PAGE: Record<Mode, number> = { light: 0.985, dark: 0.24 };
const REFERENCE_SPAN: Record<Mode, number> = { light: 0.667, dark: 0.7 };

// Background tints: the lightness of the tint each step leans toward, and its chroma per step.
const TINT_L: Record<Mode, number> = { light: 0.5, dark: 0.85 };
const TINT_CHROMA: Record<Mode, readonly Chroma[]> = {
  light: [
    [0.06, 0.012],
    [0.11, 0.022],
    [0.17, 0.04],
    [0.23, 0.055],
    [0.3, 0.07],
    [0.38, 0.085],
    [0.48, 0.1],
  ],
  dark: [
    [0.12, 0.02],
    [0.16, 0.03],
    [0.24, 0.05],
    [0.3, 0.062],
    [0.36, 0.074],
    [0.42, 0.088],
    [0.5, 0.1],
  ],
};

// Readable steps: a starting lightness and chroma, then a luminance bound that makes the contrast exact.
// Light pages are read with dark text (at most), dark pages with light text (at least).
interface Readable {
  readonly l: Record<Mode, number>;
  readonly chroma: Chroma;
  readonly y: Record<Mode, number>;
}
const OUTLINE: Readable = { l: { light: 0.62, dark: 0.58 }, chroma: [0.6, 0.14], y: { light: 0.24, dark: 0.21 } };
const TEXT: Readable = { l: { light: 0.46, dark: 0.83 }, chroma: [0.9, 0.2], y: { light: 0.1, dark: 0.55 } };
const STRONG: Readable = { l: { light: 0.25, dark: 0.93 }, chroma: [0.45, 0.07], y: { light: 0.018, dark: 0.78 } };
// Neutral text and outlines come from the paper-to-ink line; strong text is the ink, darkened only if it must be.
const NEUTRAL_MIX = { outline: 0.5, fill: 0.62, text: 0.77 } as const;
const INK_BOUND: Record<Mode, number> = { light: 0.085, dark: 0.45 };

const bound = <C>(kit: Kit<C>, from: C, mode: Mode, y: number): C =>
  mode === 'light' ? kit.atMost(from, y) : kit.atLeast(from, y);

/** The seed of a hue in a mode: the colour given for that mode, or the light one lifted for dark pages. */
function seed<C>(kit: Kit<C>, name: Hue, mode: Mode): C {
  const light = kit.share(`${name}-light`, kit.input(name));
  if (mode === 'light') return light;
  return kit.share(`${name}-dark`, kit.input(`${name}-dark`, kit.lift(light, DARK_LIFT)));
}

/** The page and ink of a mode: the brand's own, or near-greys in its primary's hue. */
function paperAndInk<C>(kit: Kit<C>, mode: Mode): { readonly paper: C; readonly ink: C } {
  const primary = kit.input('primary');
  const suffix = mode === 'dark' ? '-dark' : '';
  const [paperL, paperChroma] = PAPER[mode];
  const [inkL, inkChroma] = INK[mode];
  return {
    paper: kit.share(`paper-${mode}`, kit.input(`paper${suffix}`, kit.tone(primary, paperL, paperChroma))),
    ink: kit.share(`ink-${mode}`, kit.input(`ink${suffix}`, kit.tone(primary, inkL, inkChroma))),
  };
}

function neutralScale<C>(kit: Kit<C>, mode: Mode, paper: C, ink: C): Scale<C> {
  const along = (weight: number): C => kit.mix(paper, ink, weight);
  const backgrounds = OFFSETS[mode].map((offset, i) => (i === 0 ? paper : along(offset / REFERENCE_SPAN[mode])));
  const fill = kit.share(`neutral-fill-${mode}`, kit.fill(along(NEUTRAL_MIX.fill), mode));
  return {
    steps: [
      ...backgrounds,
      bound(kit, along(NEUTRAL_MIX.outline), mode, OUTLINE.y[mode]),
      fill,
      kit.hover(fill),
      bound(kit, along(NEUTRAL_MIX.text), mode, TEXT.y[mode]),
      bound(kit, ink, mode, INK_BOUND[mode]),
    ],
    on: kit.label(fill),
  };
}

function hueScale<C>(kit: Kit<C>, name: Hue, mode: Mode, paper: C): Scale<C> {
  const base = seed(kit, name, mode);
  const span = Math.abs(REFERENCE_PAGE[mode] - TINT_L[mode]);
  const backgrounds = OFFSETS[mode].map((offset, i) => {
    // The tint carries the step's chroma divided by its weight, so the mix lands on exactly that chroma.
    const weight = offset / span;
    const [factor, cap] = TINT_CHROMA[mode][i] ?? [0, 0];
    return kit.mix(paper, kit.tone(base, TINT_L[mode], [factor / weight, cap / weight]), weight);
  });
  const readable = (step: Readable): C =>
    bound(kit, kit.clip(kit.tone(base, step.l[mode], step.chroma)), mode, step.y[mode]);
  const fill = kit.share(`${name}-fill-${mode}`, kit.fill(kit.clip(base), mode));
  return {
    steps: [...backgrounds, readable(OUTLINE), fill, kit.hover(fill), readable(TEXT), readable(STRONG)],
    on: kit.label(fill),
  };
}

/** Every scale for one mode. Stand-in colours (secondary, accent) are computed as if given; callers swap them. */
export function recipe<C>(kit: Kit<C>, mode: Mode): Record<ColorName, Scale<C>> {
  const { paper, ink } = paperAndInk(kit, mode);
  const scales = { neutral: neutralScale(kit, mode, paper, ink) } as Record<ColorName, Scale<C>>;
  for (const name of HUES) scales[name] = hueScale(kit, name, mode, paper);
  return scales;
}

/** Thresholds shared by both kits, so CSS and script decide alike. */
export const LABEL = {
  /** A colour lighter than this luminance carries dark labels; darker ones carry white. */
  dark: 0.36,
  /** The most luminance a fill under white labels may have: 4.55:1. */
  white: 0.181,
  /** The least luminance a fill on a dark page may have: 3:1 against it. */
  floor: 0.15,
  /** Between a white-label fill and a dark-label one, for telling them apart once made. */
  split: 0.27,
  /** A dark label's luminance. */
  ink: 0.009,
  /** Hover moves: lighter toward white, darker by scaling. */
  lighter: 0.12,
  darker: 0.82,
} as const;
