import type { Page } from '@playwright/test';

export const DOCS = new URL('../index.html', import.meta.url).href;

/** Opens the docs in a given mode and corner style, with the page settled. */
export async function openDocs(page: Page, mode: 'light' | 'dark' = 'light', corners = 'squircle'): Promise<void> {
  await page.addInitScript(
    (theme) => {
      localStorage.setItem('cz-mode', theme.mode);
      localStorage.setItem('cz-corners', theme.corners);
    },
    { mode, corners },
  );
  await page.goto(DOCS, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
}

export const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
