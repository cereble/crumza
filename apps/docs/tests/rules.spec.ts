import { expect, type Page, test } from '@playwright/test';
import { openDocs, pause } from './page.ts';

const LABELLED = [
  '.cz-button:not([data-icon])',
  '.cz-chip',
  '.cz-tab',
  '.cz-menu-item',
  '.cz-segmented > label',
  '.doc-nav a',
  '.cz-toast-action',
  '.cz-badge',
  '.cz-accordion summary',
  '.cz-table-sort',
  '.cz-page:not([data-step])',
  '.cz-option',
  '.cz-command-item',
].join(', ');

interface Audit {
  borders: string[];
  shadows: string[];
  sizes: string[];
  display: string[];
  weights: string[];
  caps: string[];
  ratios: string[];
}

/** Everything drawn on the page right now, against the house rules. */
const audit = (page: Page): Promise<Audit> =>
  page.evaluate((labelled) => {
    const out: Audit = { borders: [], shadows: [], sizes: [], display: [], weights: [], caps: [], ratios: [] };
    const name = (el: Element) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`;
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('svg')) continue;
      for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
        if (cs[`border${side}Style`] !== 'none' && Number.parseFloat(cs[`border${side}Width`]) > 0) {
          out.borders.push(name(el));
          break;
        }
      }
      if (cs.boxShadow !== 'none' || cs.textShadow !== 'none' || cs.filter.includes('drop-shadow'))
        out.shadows.push(name(el));
      const text = [...el.childNodes].some((node) => node.nodeType === 3 && node.textContent?.trim());
      if (!text) continue;
      if (cs.fontSize === '24px') out.display.push(name(el));
      else if (cs.fontSize !== '14px' && cs.fontSize !== '12px') out.sizes.push(`${name(el)} ${cs.fontSize}`);
      if (cs.fontWeight !== '400' && cs.fontWeight !== '500') out.weights.push(`${name(el)} ${cs.fontWeight}`);
      if (cs.textTransform !== 'none' || (cs.letterSpacing !== 'normal' && cs.letterSpacing !== '0px'))
        out.caps.push(name(el));
    }
    for (const el of document.querySelectorAll<HTMLElement>(labelled)) {
      const height = el.offsetHeight;
      if (!height || getComputedStyle(el).display === 'none') continue;
      const cs = getComputedStyle(el);
      const ratio = Number.parseFloat(cs.paddingInlineStart) / ((height - Number.parseFloat(cs.lineHeight)) / 2);
      if (!(ratio >= 1.5 && ratio <= 2.01)) out.ratios.push(`${name(el)} ${ratio.toFixed(2)}`);
    }
    return out;
  }, LABELLED);

const clean = (found: Audit): Record<string, string[]> => {
  const rest = {
    ...found,
    display: found.display.filter((el) => !el.includes('cz-stat-value')),
  };
  return Object.fromEntries(Object.entries(rest).filter(([, list]) => list.length > 0));
};

test('every surface and overlay keeps the house rules', async ({ page }) => {
  await openDocs(page);
  const seen: Record<string, string[]>[] = [clean(await audit(page))];
  const check = async (open: () => Promise<void>, close: () => Promise<void>) => {
    await open();
    await pause(450);
    seen.push(clean(await audit(page)));
    await close();
    await pause(450);
  };
  const pressEscape = () => page.keyboard.press('Escape');
  await check(() => page.click('[popovertarget="menu-actions"]'), pressEscape);
  await check(() => page.click('[commandfor="delete-dialog"] >> nth=0'), pressEscape);
  await check(() => page.click('[commandfor="sheet-bottom"]'), pressEscape);
  await check(() => page.click('[commandfor="command"]'), pressEscape);
  await check(() => page.fill('#city-input', 'pu'), pressEscape);
  await check(() => page.click('[data-cz-contextmenu]', { button: 'right' }), pressEscape);
  await check(
    async () => {
      await page.hover('[data-cz-hovercard]');
      await pause(400);
    },
    () => page.mouse.move(5, 5),
  );
  await check(
    () => page.click('#toast-three'),
    async () => {},
  );
  const problems = Object.assign({}, ...seen);
  expect(problems).toEqual({});
});

test('every Tab stop shows focus without a ring', async ({ page }) => {
  test.setTimeout(120_000);
  await openDocs(page);
  const invisible: string[] = [];
  for (let i = 0; i < 140; i++) {
    await page.keyboard.press('Tab');
    await pause(80);
    const result = await page.evaluate(() => {
      const el = document.activeElement;
      // A slider shows focus on its thumb, a pseudo-element computed styles cannot read.
      if (!(el instanceof HTMLElement) || el === document.body || el.matches('.cz-slider')) return null;
      const root = document.documentElement;
      root.dataset.czInstant = '';
      // Some controls show focus on what stands for them: a segment's label, a number or composer box, a code cell.
      const stand = el.closest<HTMLElement>('.cz-segmented label, .cz-number, .cz-composer, .cz-code');
      const target = stand?.matches('.cz-code')
        ? (stand.querySelector<HTMLElement>('[data-active]') ?? stand)
        : (stand ?? el);
      const box = target.getBoundingClientRect();
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      const props = ['backgroundColor', 'color', 'scale', 'translate', 'rotate', 'backgroundSize', 'opacity'] as const;
      // What shows, the control's own look and any plate under it, with focus and without.
      const read = (): string => {
        const own = props.map((p) => getComputedStyle(target)[p]).join('|');
        const plates = [...document.querySelectorAll('.cz-glide[data-shown]')]
          .filter((plate) => {
            const r = plate.getBoundingClientRect();
            return cx > r.left && cx < r.right && cy > r.top && cy < r.bottom;
          })
          .map((plate) => getComputedStyle(plate).backgroundColor);
        return `${own}|${plates.join(',')}`;
      };
      const style = getComputedStyle(target);
      const ring = style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0;
      const focused = read();
      el.blur();
      const blurred = read();
      el.focus({ focusVisible: true } as FocusOptions);
      delete root.dataset.czInstant;
      return { name: target.outerHTML.slice(0, 80), ring, same: focused === blurred };
    });
    if (result && (result.ring || result.same)) invisible.push(result.name);
  }
  expect([...new Set(invisible)]).toEqual([]);
});

test('text reads on every surface it sits on, in both modes', async ({ page }) => {
  for (const mode of ['light', 'dark'] as const) {
    await openDocs(page, mode);
    const failing = await page.evaluate(() => {
      // Resolves a colour role to sRGB by painting it, then measures WCAG contrast.
      const probe = document.createElement('div');
      document.body.append(probe);
      const rgb = (color: string): number[] => {
        probe.style.color = color;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return [0, 0, 0];
        context.fillStyle = getComputedStyle(probe).color;
        context.fillRect(0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
      };
      const luminance = (c: number[]): number => {
        const [r = 0, g = 0, b = 0] = c.map((v) => {
          const x = v / 255;
          return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const ratio = (a: string, b: string): number => {
        const [x, y] = [luminance(rgb(a)), luminance(rgb(b))];
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
      };
      const out: string[] = [];
      const surfaces: [string, string][] = [
        ['page', 'body'],
        ['card', '.cz-card'],
        ['popover', '.cz-popover'],
        ['dialog', '.cz-dialog'],
      ];
      for (const [name, selector] of surfaces) {
        const host = document.querySelector(selector);
        if (!host) continue;
        probe.remove();
        host.append(probe);
        const value = (role: string): string => getComputedStyle(probe).getPropertyValue(role).trim();
        const page = name === 'page' ? value('--cz-page') : getComputedStyle(host).backgroundColor;
        const pairs: [string, string, string][] = [
          ['ink-2', value('--cz-ink-2'), page],
          ['placeholder on field', value('--cz-placeholder'), value('--cz-field')],
          ['placeholder on field hover', value('--cz-placeholder'), value('--cz-field-hover')],
        ];
        for (const [label, fg, bg] of pairs) {
          const r = ratio(fg, bg);
          if (r < 4.5) out.push(`${name}: ${label} ${r.toFixed(2)}`);
        }
      }
      probe.remove();
      return out;
    });
    expect(failing, mode).toEqual([]);
  }
});

test('a nested mode keeps the tone around it', async ({ page }) => {
  await openDocs(page);
  const colours = await page.evaluate(() => {
    const fixture = document.createElement('div');
    fixture.innerHTML =
      '<button class="cz-button" id="plain-danger" data-tone="danger">A</button>' +
      '<div data-tone="danger"><div data-mode="light"><button class="cz-button" id="nested-danger">B</button></div></div>';
    document.body.append(fixture);
    const bg = (id: string): string => getComputedStyle(document.getElementById(id) as Element).backgroundColor;
    const result = [bg('plain-danger'), bg('nested-danger')];
    fixture.remove();
    return result;
  });
  expect(colours[1]).toBe(colours[0]);
});

test('right to left: controls, fields and toasts mirror', async ({ page }) => {
  await openDocs(page);
  await page.evaluate(() => {
    document.documentElement.dir = 'rtl';
  });
  // The switch thumbs spring to their mirrored places.
  await pause(800);
  const mirrored = await page.evaluate(() => {
    const box = (el: Element | null | undefined) => el?.getBoundingClientRect();
    const switches = [...document.querySelectorAll<HTMLInputElement>('.cz-switch > input')];
    const thumb = (on: boolean) => {
      const input = switches.find((s) => s.checked === on);
      return input ? getComputedStyle(input, '::after') : null;
    };
    const group = document.querySelector('.cz-input-group');
    const icon = box(group?.querySelector(':scope > svg'));
    const input = box(group?.querySelector('.cz-input'));
    const toaster = box(document.querySelector('.cz-toaster'));
    return {
      thumbStartsRight: thumb(false)?.right,
      checkedMovesLeft: thumb(true)?.translate,
      iconOnRight: !!icon && !!input && icon.right > input.right - 40,
      toasterOnLeft: !!toaster && toaster.right < innerWidth / 2,
    };
  });
  expect(mirrored.thumbStartsRight).toBe('2px');
  expect(mirrored.checkedMovesLeft).toContain('-14px');
  expect(mirrored.iconOnRight).toBe(true);
  expect(mirrored.toasterOnLeft).toBe(true);
});

test('forced colours: focus rings, edges and checked states show', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'forced colours can only be emulated in Chromium');
  await page.emulateMedia({ forcedColors: 'active' });
  await openDocs(page);
  const result = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll<HTMLInputElement>('.cz-box > input[type="checkbox"]')];
    const on = boxes.find((box) => box.checked);
    const off = boxes.find((box) => !box.checked && !box.indeterminate);
    const button = document.querySelector<HTMLElement>('.cz-button');
    const edge = button ? getComputedStyle(button).outlineStyle : 'none';
    button?.focus({ focusVisible: true } as FocusOptions);
    const ring = button ? Number.parseFloat(getComputedStyle(button).outlineWidth) : 0;
    return {
      checkedDiffers: !!on && !!off && getComputedStyle(on).backgroundColor !== getComputedStyle(off).backgroundColor,
      edge,
      ring,
    };
  });
  expect(result.checkedDiffers).toBe(true);
  expect(result.edge).toBe('solid');
  expect(result.ring).toBe(2);
});

test('nothing on a phone scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDocs(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
