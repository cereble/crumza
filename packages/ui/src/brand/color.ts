/** A colour in OKLCH: lightness 0 to 1, chroma from 0, hue in degrees. */
export interface Oklch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

/** Linear-light sRGB, the space luminance is measured in. Channels may leave 0 to 1 until a colour is shown. */
export type Linear = readonly [r: number, g: number, b: number];

type Triple = readonly [number, number, number];

const toLinearChannel = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toGammaChannel = (v: number): number => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

function linearToOklab([r, g, b]: Triple): Triple {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToLinear([L, a, b]: Triple): Linear {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const toLab = ({ l, c, h }: Oklch): Triple => {
  const angle = (h * Math.PI) / 180;
  return [l, c * Math.cos(angle), c * Math.sin(angle)];
};

function fromLab([l, a, b]: Triple): Oklch {
  const c = Math.hypot(a, b);
  const h = c < 1e-4 ? 0 : (Math.atan2(b, a) * 180) / Math.PI;
  return { l, c, h: h < 0 ? h + 360 : h };
}

function hexChannels(hex: string): Triple {
  const body = normalizeHex(hex).slice(1);
  const at = (i: number): number => Number.parseInt(body.slice(i, i + 2), 16) / 255;
  return [at(0), at(2), at(4)];
}

function toHexChannels(rgb: Triple): string {
  const byte = (v: number): string =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${byte(rgb[0])}${byte(rgb[1])}${byte(rgb[2])}`;
}

/** Normalises #rgb, #rrggbb, rgb() and oklch() to lowercase #rrggbb. */
export function normalizeHex(input: string): string {
  const value = input.trim().toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(value);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  if (/^#[0-9a-f]{6}$/.test(value)) return value;
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*\)$/.exec(value);
  if (rgb) return toHexChannels([Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255]);
  const lch = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*\)$/.exec(value);
  if (lch) {
    const l = Number(lch[1]) / (lch[2] === '%' ? 100 : 1);
    return linearToHex(oklchToLinear({ l, c: Number(lch[3]), h: Number(lch[4]) }));
  }
  throw new Error(`Crumza cannot read the colour "${input}". Use #rrggbb, rgb() or oklch().`);
}

export const hexToLinear = (hex: string): Linear => {
  const [r, g, b] = hexChannels(hex);
  return [toLinearChannel(r), toLinearChannel(g), toLinearChannel(b)];
};

/** The colour as a screen shows it: each channel clipped to the sRGB range and rounded to a byte. */
export const linearToHex = ([r, g, b]: Linear): string =>
  toHexChannels([toGammaChannel(r), toGammaChannel(g), toGammaChannel(b)]);

export const oklchToLinear = (color: Oklch): Linear => oklabToLinear(toLab(color));
export const linearToOklch = (color: Linear): Oklch => fromLab(linearToOklab(color));

/** `color-mix(in oklab, a, b weight)` for opaque colours, with weight from 0 to 1. */
export function mixOklab(a: Linear, b: Linear, weight: number): Linear {
  const x = linearToOklab(a);
  const y = linearToOklab(b);
  return oklabToLinear([x[0] + (y[0] - x[0]) * weight, x[1] + (y[1] - x[1]) * weight, x[2] + (y[2] - x[2]) * weight]);
}

export const parseColor = (input: string): Oklch => linearToOklch(hexToLinear(input));

/** WCAG 2 relative luminance of linear-light sRGB. */
export const luma = ([r, g, b]: Linear): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

export const luminance = (hex: string): number => luma(hexToLinear(hex));

/** WCAG 2 contrast ratio, 1 to 21, unrounded: a pair just under a threshold fails it. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Distance in OKLab, about 0.02 for a just-visible difference. */
export function distance(a: string, b: string): number {
  const x = linearToOklab(hexToLinear(a));
  const y = linearToOklab(hexToLinear(b));
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}
