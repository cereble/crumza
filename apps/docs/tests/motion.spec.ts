import { expect, type Page, test } from '@playwright/test';
import { openDocs, pause } from './page.ts';

const scrollTo = (page: Page, id: string) => page.locator(`#${id}`).scrollIntoViewIfNeeded();

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await openDocs(page);
});

// Any page error fails the test that caused it.
test.afterEach(() => expect(errors).toEqual([]));

// Motion in flight is recorded inside the page, frame by frame, right from the action that starts it; where things
// land is waited for. A slow machine then only takes longer, it never misses the moment.
const settles = { timeout: 3000 } as const;

test('the plate stretches while travelling, then lands on the choice', async ({ page }) => {
  await scrollTo(page, 'segmented');
  const travel = await page.evaluate(async () => {
    const segmented = document.querySelector('#segmented .cz-segmented') as HTMLElement;
    const plate = segmented.querySelector('.cz-glide') as HTMLElement;
    const year = [...segmented.querySelectorAll('label')].at(-1) as HTMLElement;
    const start = plate.getBoundingClientRect().width;
    year.click();
    let widest = 0;
    const until = performance.now() + 600;
    while (performance.now() < until) {
      widest = Math.max(widest, plate.getBoundingClientRect().width);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return { start, widest, end: year.getBoundingClientRect().width };
  });
  // On the way it is wider than both where it started and where it lands.
  expect(travel.widest).toBeGreaterThan(Math.max(travel.start, travel.end) + 4);
  const segmented = page.locator('#segmented .cz-segmented').first();
  const landed = () =>
    segmented.evaluate((s) => {
      const plate = s.querySelector('.cz-glide')?.getBoundingClientRect();
      const year = [...s.querySelectorAll('label')].at(-1)?.getBoundingClientRect();
      return plate && year ? Math.abs(plate.left - year.left) + Math.abs(plate.width - year.width) : 99;
    });
  await expect.poll(landed, settles).toBeLessThan(1);
});

test('tabs: the plate follows hover and returns; the panel slides in', async ({ page }) => {
  await scrollTo(page, 'tabs');
  const at = (id: string) =>
    page.evaluate((tab) => {
      const plate = document.querySelector('.cz-tabs-list .cz-glide')?.getBoundingClientRect();
      const target = document.getElementById(tab)?.getBoundingClientRect();
      return plate && target ? Math.abs(plate.left - target.left) < 1 : false;
    }, id);
  await page.hover('#tab-3');
  await expect.poll(() => at('tab-3'), settles).toBe(true);
  await page.mouse.move(5, 5);
  await expect.poll(() => at('tab-1'), settles).toBe(true);
  const sliding = await page.evaluate(() => {
    (document.getElementById('tab-2') as HTMLElement).click();
    return document.getElementById('panel-2')?.getAnimations().length ?? 0;
  });
  expect(sliding).toBeGreaterThan(0);
});

test('a menu grows out of its button and one plate follows the rows', async ({ page }) => {
  await scrollTo(page, 'menu');
  const smallest = await page.evaluate(async () => {
    const menu = document.getElementById('menu-actions') as HTMLElement;
    (document.querySelector('[popovertarget="menu-actions"]') as HTMLElement).click();
    let least = 1;
    const until = performance.now() + 300;
    while (performance.now() < until) {
      least = Math.min(least, Number(getComputedStyle(menu).scale) || 1);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return least;
  });
  expect(smallest).toBeLessThan(1);
  const chevron = () =>
    page.evaluate(
      () => getComputedStyle(document.querySelector('[popovertarget="menu-actions"] .cz-chevron') as Element).rotate,
    );
  await expect.poll(chevron, settles).toContain('180');
  await page.hover('#menu-actions .cz-menu-item >> nth=2');
  const under = () =>
    page.evaluate(() => {
      const plate = document.querySelector('#menu-actions .cz-glide');
      const row = document.querySelectorAll('#menu-actions .cz-menu-item')[2];
      return (
        !!plate?.hasAttribute('data-shown') &&
        Math.abs((plate?.getBoundingClientRect().top ?? 0) - (row?.getBoundingClientRect().top ?? 9)) < 1
      );
    });
  await expect.poll(under, settles).toBe(true);
});

test('a dialog grows out of its button and shrinks back, then opens again', async ({ page }) => {
  await scrollTo(page, 'dialog');
  const transform = () =>
    page.evaluate(() => getComputedStyle(document.getElementById('delete-dialog') as Element).transform);
  const open = () => page.evaluate(() => (document.getElementById('delete-dialog') as HTMLDialogElement).open);
  await page.evaluate(() => (document.getElementById('delete-dialog') as HTMLDialogElement).close());
  const grew = await page.evaluate(async () => {
    const dialog = document.getElementById('delete-dialog') as HTMLElement;
    (document.querySelector('[commandfor="delete-dialog"]') as HTMLElement).click();
    let moved = false;
    const until = performance.now() + 300;
    while (performance.now() < until && !moved) {
      moved = getComputedStyle(dialog).transform !== 'none';
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return moved;
  });
  expect(grew).toBe(true);
  await expect.poll(transform, settles).toBe('none');
  // Escape starts the shrink back into its button; the dialog stays open until it lands.
  const stillOpen = await page.evaluate(() => {
    const dialog = document.getElementById('delete-dialog') as HTMLDialogElement;
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    return dialog.open;
  });
  expect(stillOpen).toBe(true);
  await expect.poll(open, settles).toBe(false);
  await page.click('[commandfor="delete-dialog"] >> nth=1');
  const opacity = () =>
    page.evaluate(() => getComputedStyle(document.getElementById('delete-dialog') as Element).opacity);
  await expect.poll(opacity, settles).toBe('1');
});

test('a sheet slides in, follows a drag and is thrown away', async ({ page }) => {
  await scrollTo(page, 'sheet');
  const drag = () =>
    page.evaluate(() =>
      Number.parseFloat(document.getElementById('sheet-bottom')?.style.getPropertyValue('--cz-drag') ?? '0'),
    );
  const furthest = await page.evaluate(async () => {
    const sheet = document.getElementById('sheet-bottom') as HTMLElement;
    (document.querySelector('[commandfor="sheet-bottom"]') as HTMLElement).click();
    let most = 0;
    const until = performance.now() + 300;
    while (performance.now() < until) {
      most = Math.max(most, Number.parseFloat(sheet.style.getPropertyValue('--cz-drag') || '0'));
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return most;
  });
  expect(furthest).toBeGreaterThan(20);
  await expect.poll(drag, settles).toBeLessThan(1);
  const grabber = await page.locator('#sheet-bottom .cz-sheet-grabber').boundingBox();
  if (!grabber) throw new Error('no grabber');
  await page.mouse.move(grabber.x + 18, grabber.y + 2);
  await page.mouse.down();
  for (let y = 0; y <= 240; y += 40) await page.mouse.move(grabber.x + 18, grabber.y + 2 + y, { steps: 2 });
  expect(await drag()).toBeGreaterThan(150);
  await page.mouse.up();
  const open = () => page.evaluate(() => (document.getElementById('sheet-bottom') as HTMLDialogElement).open);
  await expect.poll(open, settles).toBe(false);
});

test('the command palette opens with the shortcut, filters and chooses', async ({ page }) => {
  const open = () => page.evaluate(() => (document.getElementById('command') as HTMLDialogElement).open);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
  await expect.poll(open, settles).toBe(true);
  await page.keyboard.type('inv');
  const shown = () =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('#command .cz-command-item')]
        .filter((item) => !item.hidden)
        .map((item) => item.dataset.value),
    );
  await expect.poll(shown, settles).toEqual(['invoices', 'invite']);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect.poll(open, settles).toBe(false);
  await expect(page.locator('.cz-toast-text', { hasText: 'Invite a member chosen' })).toHaveCount(1);
});

test('the combobox filters, inks the match and chooses', async ({ page }) => {
  await scrollTo(page, 'combobox');
  await page.fill('#city-input', 'pu');
  const visible = () =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('#city-list .cz-option')]
        .filter((option) => !option.hidden)
        .map((option) => option.textContent?.trim()),
    );
  await expect.poll(visible, settles).toEqual(['Pune']);
  await expect(page.locator('#city-list mark').first()).toHaveText('Pu');
  await page.keyboard.press('Enter');
  await expect(page.locator('#city-input')).toHaveValue('Pune');
});

test('a context menu opens where the pointer is', async ({ page }) => {
  await scrollTo(page, 'context-menu');
  const area = await page.locator('[data-cz-contextmenu]').boundingBox();
  if (!area) throw new Error('no area');
  await page.mouse.click(area.x + 60, area.y + 30, { button: 'right' });
  const atPointer = async () => {
    const menu = await page.locator('#context-actions').boundingBox();
    return !!menu && Math.abs(menu.x - (area.x + 60)) < 2 && Math.abs(menu.y - (area.y + 30)) < 2;
  };
  await expect.poll(atPointer, settles).toBe(true);
});

test('a hover card waits, then grows out of its link', async ({ page }) => {
  await scrollTo(page, 'hover-card');
  const open = () => page.evaluate(() => document.getElementById('card-asha')?.matches(':popover-open'));
  // Not yet after 200 ms on the page's own clock: a passing pointer does not open it.
  const early = await page.evaluate(async () => {
    (document.querySelector('[data-cz-hovercard]') as HTMLElement).dispatchEvent(new PointerEvent('pointerenter'));
    await new Promise((resolve) => setTimeout(resolve, 200));
    return document.getElementById('card-asha')?.matches(':popover-open');
  });
  expect(early).toBe(false);
  await expect.poll(open, settles).toBe(true);
});

test('a number field rolls to the next value and shakes at its limit', async ({ page }) => {
  await scrollTo(page, 'number-field');
  const rolled = await page.evaluate(() => {
    const up = document.querySelector('#number-field .cz-number [data-step="up"]') as HTMLElement;
    up.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    up.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
    return document.querySelectorAll('#number-field .cz-number-roll').length;
  });
  expect(rolled).toBe(1);
  await expect(page.locator('#seats')).toHaveValue('4');
  await page.fill('#seats', '20');
  const shook = await page.evaluate(() => {
    const input = document.getElementById('seats') as HTMLInputElement;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    return document.querySelector('#number-field .cz-number')?.getAnimations().length ?? 0;
  });
  expect(shook).toBeGreaterThan(0);
  await expect(page.locator('#seats')).toHaveValue('20');
});

test('a code input fills its cells and confirms the right code', async ({ page }) => {
  await scrollTo(page, 'code-input');
  await page.click('#code-demo');
  await page.keyboard.type('246810');
  await expect(page.locator('#code-demo')).toHaveAttribute('data-state', 'done');
  await expect(page.locator('#code-demo .cz-code-cell span')).toHaveCount(6);
});

test('pagination moves its plate to the chosen page', async ({ page }) => {
  await scrollTo(page, 'pagination');
  await page.click('.cz-page[data-page="4"]');
  const on = () =>
    page.evaluate(() => {
      const plate = document.querySelector('.cz-pagination .cz-glide')?.getBoundingClientRect();
      const four = document.querySelector('.cz-page[data-page="4"]');
      return (
        four?.getAttribute('aria-current') === 'page' &&
        Math.abs((plate?.left ?? 0) - (four?.getBoundingClientRect().left ?? 9)) < 1
      );
    });
  await expect.poll(on, settles).toBe(true);
});

test('stats count up when they come into view', async ({ page }) => {
  await scrollTo(page, 'stat');
  await expect(page.locator('.cz-stat-value').first()).toHaveText('$48,210', settles);
  await expect(page.locator('.cz-stat').first()).toHaveAttribute('data-shown', '');
});

test('Pebble answers in the chat', async ({ page }) => {
  await scrollTo(page, 'chat');
  await page.fill('#chat-composer textarea', 'Twelve people');
  await page.keyboard.press('Enter');
  await expect(page.locator('#chat-log .cz-typing')).toHaveCount(1);
  await expect(page.locator('#chat-log .cz-message')).toHaveCount(5);
});

test('the theme switches with every colour at once and the sun becomes a moon', async ({ page }) => {
  const card = () =>
    page.evaluate(() => getComputedStyle(document.querySelector('.cz-card') as Element).backgroundColor);
  const before = await card();
  await page.click('.doc-top .cz-theme-toggle');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  // The colours flip in one step: once changed, they do not keep moving.
  await expect.poll(card, settles).not.toBe(before);
  const flipped = await card();
  await pause(400);
  expect(await card()).toBe(flipped);
  const moon = () =>
    page.evaluate(() => {
      const toggle = document.querySelector('.doc-top .cz-theme-toggle');
      const core = getComputedStyle(toggle?.querySelector('.cz-theme-core') as Element);
      return [toggle?.getAttribute('aria-pressed'), core.scale, core.getPropertyValue('--cz-cut-x').trim()];
    });
  await expect.poll(moon, settles).toEqual(['true', '1', '78%']);
});

test('a toast stays while a keyboard user is on it, and is announced', async ({ page }) => {
  await scrollTo(page, 'toast');
  await page.click('[data-toast-action="Undo"]');
  await page.locator('.cz-toast-action').focus();
  await pause(4600);
  await expect(page.locator('.cz-toast', { hasText: 'Message archived' })).toHaveCount(1);
  expect(await page.getAttribute('.cz-toaster', 'aria-live')).toBe('polite');
});

test('a toast raised over a modal dialog can still be used', async ({ page }) => {
  await scrollTo(page, 'dialog');
  await page.click('[commandfor="delete-dialog"] >> nth=0');
  await expect(page.locator('#delete-dialog')).toBeVisible();
  await page.evaluate(() => (document.querySelector('[data-toast-action="Undo"]') as HTMLElement).click());
  expect(await page.evaluate(() => !!document.querySelector('#delete-dialog .cz-toaster'))).toBe(true);
  await page.keyboard.press('Escape');
  const home = () => page.evaluate(() => !document.querySelector('.cz-toaster')?.closest('dialog'));
  await expect.poll(home, settles).toBe(true);
});

test('reduced motion lands everything at once', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1360, height: 900 } });
  const page = await context.newPage();
  await openDocs(page);
  await scrollTo(page, 'segmented');
  const segmented = page.locator('#segmented .cz-segmented').first();
  await segmented.locator('label', { hasText: 'Year' }).click();
  await pause(30);
  const landed = await segmented.evaluate((s) => {
    const plate = s.querySelector('.cz-glide')?.getBoundingClientRect();
    const year = [...s.querySelectorAll('label')].at(-1)?.getBoundingClientRect();
    return plate && year ? Math.abs(plate.left - year.left) < 1 : false;
  });
  expect(landed).toBe(true);
  // Overlays fade in place: no travel and no scale.
  await scrollTo(page, 'menu');
  await page.click('[popovertarget="menu-actions"]');
  await pause(30);
  const opening = await page.evaluate(() => {
    const style = getComputedStyle(document.getElementById('menu-actions') as Element);
    return [style.scale, style.translate];
  });
  expect(opening).toEqual(['1', '0px']);
  await context.close();
});
