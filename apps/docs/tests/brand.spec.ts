import { type BrandInput, brandStyle, COLOR_NAMES, defineBrand, type Mode } from '@crumza/ui/brand';
import { expect, type Page, test } from '@playwright/test';
import { openDocs } from './page.ts';

const BRANDS: Record<string, BrandInput> = {
  mochi: { primary: '#66736c' },
  green: { primary: '#245c46' },
  orange: { primary: '#fe4f05', danger: '#e11d48' },
  yellow: { primary: '#facc15', secondary: '#7c3aed' },
  blue: { primary: '#2a78d6', accent: '#e11d48', paper: '#f8f7f4', ink: '#35423b', dark: { primary: '#2b4cac' } },
};

/** Every colour the stylesheet resolves for the page's brand, as #rrggbb, read through a canvas. */
const resolved = (page: Page): Promise<Record<string, string>> =>
  page.evaluate((names) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const probe = document.createElement('div');
    document.body.append(probe);
    const out: Record<string, string> = {};
    for (const name of names) {
      for (const step of [...Array.from({ length: 12 }, (_, i) => `${name}-${i + 1}`), `on-${name}`]) {
        probe.style.color = `var(--cz-${step})`;
        if (!context) continue;
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = getComputedStyle(probe).color;
        context.fillRect(0, 0, 1, 1);
        const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data;
        out[step] = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
      }
    }
    probe.remove();
    return out;
  }, COLOR_NAMES);

const channels = (hex: string): number[] => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));

for (const [label, input] of Object.entries(BRANDS)) {
  test(`the stylesheet computes the script's colours: ${label}`, async ({ page }) => {
    await openDocs(page);
    await page.evaluate((style) => {
      for (const [property, value] of Object.entries(style))
        document.documentElement.style.setProperty(property, value);
    }, brandStyle(input));
    const brand = defineBrand(input);
    for (const mode of ['light', 'dark'] as Mode[]) {
      await page.evaluate((m) => {
        document.documentElement.dataset.mode = m;
      }, mode);
      const css = await resolved(page);
      const off: string[] = [];
      for (const name of COLOR_NAMES) {
        const color = brand.colors[name];
        const expected = [...color[mode], color.on[mode]];
        const steps = [...Array.from({ length: 12 }, (_, i) => `${name}-${i + 1}`), `on-${name}`];
        steps.forEach((step, i) => {
          const a = channels(css[step] ?? '#000000');
          const b = channels(expected[i] ?? '#ffffff');
          // A byte or two of rounding between browser and script; nothing a person could see.
          if (a.some((v, k) => Math.abs(v - (b[k] ?? 0)) > 3))
            off.push(`${mode} ${step}: css ${css[step]} script ${expected[i]}`);
        });
      }
      expect(off).toEqual([]);
    }
  });
}

test('a brand set on one element re-colours only that element', async ({ page }) => {
  await openDocs(page);
  const fills = await page.evaluate(() => {
    const make = (style: string): HTMLElement => {
      const holder = document.createElement('div');
      holder.setAttribute('style', style);
      holder.innerHTML = '<button class="cz-button" data-variant="solid" type="button">Go</button>';
      document.body.append(holder);
      return holder.querySelector('button') as HTMLElement;
    };
    const plain = make('');
    const branded = make('--cz-brand-primary: #e11d48');
    const hex = (element: Element): string => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return '';
      context.fillStyle = getComputedStyle(element).backgroundColor;
      context.fillRect(0, 0, 1, 1);
      const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data;
      return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    };
    return [hex(plain), hex(branded)];
  });
  expect(fills).toEqual([
    defineBrand(BRANDS.mochi as BrandInput).colors.primary.light[8],
    defineBrand({ primary: '#e11d48' }).colors.primary.light[8],
  ]);
});
