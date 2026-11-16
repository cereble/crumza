import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { type BrandColor, type BrandInput, brandStyle, defineBrand } from '../src/brand/brand.ts';
import { contrast, parseColor } from '../src/brand/color.ts';
import { COLOR_NAMES, type Mode } from '../src/brand/recipe.ts';

const seeds = [
  '#245c46', // crumza green
  '#fe4f05', // playarka orange
  '#6c8c76', // dangos sage
  '#2a78d6', // a blue white labels just miss
  '#2b4cac', // stofy blue
  '#dcb798', // kidamau sand
  '#facc15', // yellow
  '#84cc16', // lime
  '#00ffff', // cyan
  '#ff00ff', // magenta
  '#e11d48', // rose
  '#1e3a8a', // navy
  '#808080', // mid grey
  '#000000',
  '#ffffff',
];
const modes: readonly Mode[] = ['light', 'dark'];

// Mochi, the default brand: its own paper and ink in both modes.
const MOCHI: BrandInput = {
  primary: '#66736c',
  paper: '#fafaf9',
  ink: '#2e3431',
  danger: '#94625a',
  dark: { primary: '#b4c1ba', paper: '#1d201f', ink: '#e9ecea', danger: '#cba29d' },
};

const step = (s: readonly string[], n: number): string => {
  const value = s[n - 1];
  if (value === undefined) throw new Error(`no step ${n}`);
  return value;
};

/** The promises every scale makes, for every colour name, in both modes. */
function guarantees(color: BrandColor, mode: Mode, name: string): void {
  const s = color[mode];
  const at = `${name} ${mode}`;
  for (const bg of [1, 2, 3, 4, 5]) {
    assert.ok(contrast(step(s, 11), step(s, bg)) >= 4.5, `${at}: step 11 on step ${bg}`);
  }
  for (const bg of [1, 2]) assert.ok(contrast(step(s, 12), step(s, bg)) >= 7, `${at}: step 12 on step ${bg}`);
  assert.ok(contrast(color.on[mode], step(s, 9)) >= 4.5, `${at}: label on the fill`);
  assert.ok(contrast(color.on[mode], step(s, 10)) >= 4.5, `${at}: label on the hover`);
  for (const bg of [1, 2]) assert.ok(contrast(step(s, 8), step(s, bg)) >= 3, `${at}: outline on step ${bg}`);
  const l = s.slice(0, 7).map((hex) => parseColor(hex).l);
  for (let i = 1; i < l.length; i++) {
    const prev = l[i - 1] ?? 0;
    const next = l[i] ?? 0;
    assert.ok(mode === 'light' ? next < prev : next > prev, `${at}: step ${i + 1} steps away from the page`);
  }
}

describe('contrast', () => {
  test('matches the WCAG 2 reference values', () => {
    assert.equal(contrast('#ffffff', '#000000'), 21);
    assert.ok(Math.abs(contrast('#777777', '#ffffff') - 4.48) < 0.01);
  });

  test('is not rounded, so a pair just under a threshold fails it', () => {
    assert.ok(contrast('#797951', '#ffffff') < 4.5);
  });
});

describe('every colour of every brand becomes a readable scale', () => {
  for (const seed of seeds) {
    const brand = defineBrand({ primary: seed });
    for (const mode of modes) {
      test(`${seed} ${mode}`, () => {
        for (const name of COLOR_NAMES) guarantees(brand.colors[name], mode, name);
      });
    }
  }

  const variants: Record<string, BrandInput> = {
    mochi: MOCHI,
    'own paper and ink': {
      primary: '#2b4cac',
      paper: '#f8f7f4',
      ink: '#35423b',
      dark: { paper: '#141615', ink: '#e8ebe9' },
    },
    'a pale ink, deepened': { primary: '#245c46', ink: '#8a8f8c' },
    'every hue given': { primary: '#245c46', secondary: '#c2410c', accent: '#7c3aed', info: '#0891b2' },
    'dark seeds of their own': { primary: '#245c46', dark: { primary: '#7fd1ae', danger: '#ff8a80' } },
  };
  for (const [label, input] of Object.entries(variants)) {
    const brand = defineBrand(input);
    for (const mode of modes) {
      test(`${label} ${mode}`, () => {
        for (const name of COLOR_NAMES) guarantees(brand.colors[name], mode, name);
      });
    }
  }
});

describe('pages that go against their mode', () => {
  test('a dark paper in light mode is reported', () => {
    const brand = defineBrand({ primary: '#245c46', paper: '#3a3a3a' });
    assert.ok(brand.warnings.some((w) => w.includes('paper') && w.includes('light')));
  });
});

describe('brand fidelity', () => {
  test('a brand colour that already carries readable labels is kept exactly', () => {
    const brand = defineBrand({ primary: '#245C46' });
    assert.equal(step(brand.colors.primary.light, 9), '#245c46');
    assert.deepEqual(brand.colors.primary.brand, { light: '#245c46', dark: '#245c46' });
    assert.deepEqual(brand.warnings, []);
  });

  test('a brand colour no label can read on moves, says so, and stays available as the brand', () => {
    const brand = defineBrand({ primary: '#2a78d6' });
    assert.notEqual(step(brand.colors.primary.light, 9), '#2a78d6');
    assert.equal(brand.colors.primary.brand?.light, '#2a78d6');
    assert.ok(brand.warnings.some((w) => w.startsWith('primary light') && w.includes('#2a78d6')));
  });

  test('dark mode lifts each colour to a light tone of itself, unless the brand gives its own', () => {
    const lifted = defineBrand({ primary: '#66736c' });
    assert.ok(parseColor(step(lifted.colors.primary.dark, 9)).l > 0.78);
    assert.notEqual(lifted.colors.primary.on.dark, '#ffffff');
    const own = defineBrand({ primary: '#245c46', dark: { primary: '#7fd1ae' } });
    assert.equal(step(own.colors.primary.dark, 9), '#7fd1ae');
    assert.deepEqual(own.colors.primary.brand, { light: '#245c46', dark: '#7fd1ae' });
  });

  test('the brand becomes the variables the stylesheet reads', () => {
    const style = brandStyle({ primary: '#245C46', dark: { primary: '#7fd1ae' }, paper: '#fafaf9' });
    assert.deepEqual(style, {
      '--cz-brand-primary': '#245c46',
      '--cz-brand-primary-dark': '#7fd1ae',
      '--cz-brand-paper': '#fafaf9',
    });
  });

  test('labels are white on deep colours and dark on light ones', () => {
    const orange = defineBrand({ primary: '#fe4f05' });
    assert.equal(orange.colors.primary.on.light, '#ffffff');
    const yellow = defineBrand({ primary: '#facc15' });
    assert.notEqual(yellow.colors.primary.on.light, '#ffffff');
    assert.equal(step(yellow.colors.primary.light, 9), '#facc15');
  });

  test("without a paper and ink, the greys take the primary's hue", () => {
    const greys = defineBrand({ primary: '#2b4cac' }).colors.neutral.light;
    const hue = parseColor('#2b4cac').h;
    for (const n of [1, 12]) assert.ok(Math.abs(parseColor(step(greys, n)).h - hue) < 25, `step ${n}`);
  });

  test("the brand's own paper and ink become the page and the text", () => {
    const brand = defineBrand({ primary: '#6c8c76', paper: '#f8f7f4', ink: '#35423b' });
    assert.equal(step(brand.colors.neutral.light, 1), '#f8f7f4');
    assert.equal(step(brand.colors.neutral.light, 12), '#35423b');
  });

  test("colour scales start from the brand's own paper, so soft fills always step away from it", () => {
    const brand = defineBrand(MOCHI);
    for (const mode of modes) {
      const page = parseColor(step(brand.colors.neutral[mode], 1)).l;
      for (const name of ['primary', 'danger'] as const) {
        const s = brand.colors[name][mode];
        assert.ok(Math.abs(parseColor(step(s, 1)).l - page) < 0.012, `${name} ${mode} step 1`);
        assert.ok(Math.abs(parseColor(step(s, 3)).l - page) > 0.025, `${name} ${mode} step 3`);
      }
    }
  });

  test('without a secondary colour, secondary is the neutral scale', () => {
    const brand = defineBrand({ primary: '#245c46' });
    assert.deepEqual(brand.colors.secondary.light, brand.colors.neutral.light);
    const withSecondary = defineBrand({ primary: '#245c46', secondary: '#c2410c' });
    assert.equal(withSecondary.colors.secondary.brand?.light, '#c2410c');
  });

  test('fonts land on the properties the kit reads', () => {
    const style = brandStyle({ primary: '#245c46', fonts: { sans: 'Geist', mono: 'Geist Mono' } });
    assert.equal(style['--cz-font'], 'Geist');
    assert.equal(style['--cz-mono'], 'Geist Mono');
  });
});
