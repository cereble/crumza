import { COLOR_NAMES, DEFAULT_INPUTS, type Hue, type Kit, LABEL, type Mode, recipe, STAND_INS } from './recipe.ts';

const num = (value: number, places = 4): string => String(Number(value.toFixed(places)));

// Luminance work happens in CIE XYZ (D65): its y channel is the WCAG relative luminance, and scaling x, y and z
// together darkens a colour without changing its hue. White there is (0.95046, 1, 1.08906).
const WHITE = { x: '0.95046', y: '1', z: '1.08906' } as const;
const SAFE_Y = 'max(y, 0.0001)';
// A step from 0 to 1 at the threshold: 1 for a colour that carries dark labels, 0 for white labels.
const darkLabels = (threshold: number): string => `clamp(0, (y - ${num(threshold)}) * 10000, 1)`;
const xyz = (from: string, channel: (c: 'x' | 'y' | 'z') => string): string =>
  `color(from ${from} xyz-d65 ${channel('x')} ${channel('y')} ${channel('z')})`;
const towardWhite = (from: string, t: string): string => xyz(from, (c) => `calc(${c} + (${WHITE[c]} - ${c}) * ${t})`);

/** The recipe as CSS: every operation becomes a formula the browser evaluates where the colour is used. */
class CssKit implements Kit<string> {
  readonly shared = new Map<string, string>();

  input(name: string, fallback?: string): string {
    return fallback === undefined ? `var(--cz-brand-${name})` : `var(--cz-brand-${name}, ${fallback})`;
  }

  share(name: string, value: string): string {
    this.shared.set(`--_cz-${name}`, value);
    return `var(--_cz-${name})`;
  }

  tone(from: string, l: number | null, chroma: readonly [number, number] | null): string {
    const c = chroma ? `min(c * ${num(chroma[0], 3)}, ${num(chroma[1], 3)})` : 'c';
    return `oklch(from ${from} ${l === null ? 'l' : num(l)} ${c} h)`;
  }

  lift(from: string, min: number): string {
    return `oklch(from ${from} max(l, ${num(min)}) c h)`;
  }

  mix(a: string, b: string, weight: number): string {
    return `color-mix(in oklab, ${a}, ${b} ${num(weight * 100, 3)}%)`;
  }

  clip(from: string): string {
    return `color(from ${from} srgb-linear clamp(0, r, 1) clamp(0, g, 1) clamp(0, b, 1))`;
  }

  atMost(from: string, y: number): string {
    return xyz(from, (c) => `calc(${c} * min(1, ${num(y)} / ${SAFE_Y}))`);
  }

  atLeast(from: string, y: number): string {
    return towardWhite(from, `max(0, (${num(y)} - y) / max(1 - y, 0.0001))`);
  }

  fill(from: string, mode: Mode): string {
    // Under white labels the fill darkens to at most LABEL.white; a light colour (dark labels) stays as it is.
    const k = `min(1, max(${num(LABEL.white)} / ${SAFE_Y}, (y - ${num(LABEL.dark)}) * 10000))`;
    const darkened = xyz(from, (c) => `calc(${c} * ${k})`);
    if (mode === 'light') return darkened;
    // On a dark page a white-label fill also keeps 3:1 against the page, lightening toward white if it must.
    return towardWhite(darkened, `max(0, (${num(LABEL.floor)} - y) / max(1 - y, 0.0001))`);
  }

  hover(fill: string): string {
    const dark = darkLabels(LABEL.split);
    const lighter = num(LABEL.lighter);
    const spread = num(1 - LABEL.lighter - LABEL.darker);
    return xyz(
      fill,
      (c) => `calc(${c} * ${num(LABEL.darker)} + ${dark} * (${c} * ${spread} + ${WHITE[c]} * ${lighter}))`,
    );
  }

  label(fill: string): string {
    const dark = darkLabels(LABEL.split);
    return xyz(fill, (c) => `calc(${WHITE[c]} + ${dark} * (${c} * ${num(LABEL.ink)} / ${SAFE_Y} - ${WHITE[c]}))`);
  }
}

/**
 * The stylesheet that turns `--cz-brand-*` variables into every colour scale, live. Defaults come first, on `:root`.
 * The formulas are restated wherever a brand may change: the root, `[data-cz-theme]`, and any element whose inline
 * style sets a brand variable. A stand-in colour (secondary, accent) left unset falls back to the scale it stands
 * in for, because its formulas are then invalid and `var()` takes the fallback.
 */
export function brandSheet(): string {
  const kit = new CssKit();
  const light = recipe(kit, 'light');
  const dark = recipe(kit, 'dark');
  const lines: string[] = [];
  for (const name of COLOR_NAMES) {
    const stand = STAND_INS[name as Hue];
    const write = (property: string, value: string, fallback: string): void => {
      if (!stand) {
        lines.push(`  ${property}: ${value};`);
        return;
      }
      const raw = property.replace('--cz-', '--_cz-raw-');
      lines.push(`  ${raw}: ${value};`, `  ${property}: var(${raw}, ${fallback});`);
    };
    const l = light[name];
    const d = dark[name];
    l.steps.forEach((step, i) => {
      write(`--cz-${name}-${i + 1}`, `light-dark(${step}, ${d.steps[i]})`, `var(--cz-${stand ?? name}-${i + 1})`);
    });
    write(`--cz-on-${name}`, `light-dark(${l.on}, ${d.on})`, `var(--cz-on-${stand ?? name})`);
  }
  const defaults = Object.entries(DEFAULT_INPUTS)
    .map(([name, value]) => `  --cz-brand-${name}: ${value};`)
    .join('\n');
  const shared = [...kit.shared].map(([property, value]) => `  ${property}: ${value};`).join('\n');
  const scope = ':where(:root, [data-cz-theme], [style*="--cz-brand-"])';
  return [
    '/* Generated by scripts/build.ts from src/brand/recipe.ts. Do not edit. */',
    `:root {\n${defaults}\n}`,
    `${scope} {\n${shared}\n${lines.join('\n')}\n}`,
    '',
  ].join('\n');
}
