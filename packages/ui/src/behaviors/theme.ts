import { type Disposer, inBrowser, reveal } from '../motion/index.ts';

export type Mode = 'light' | 'dark';
export type Corners = 'rounded' | 'squircle' | 'sharp';

const MODE_KEY = 'cz-mode';
const CORNERS_KEY = 'cz-corners';

const remember = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private windows and blocked storage: the choice simply is not remembered.
  }
};

/** The page's mode: the one set on the root, or the system's. */
export function currentMode(): Mode {
  if (!inBrowser) return 'light';
  const set = document.documentElement.dataset.mode;
  if (set === 'light' || set === 'dark') return set;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Switches the page's mode, revealed from (x, y), and remembers it. */
export function setMode(mode: Mode, from?: { readonly x: number; readonly y: number }): Promise<void> {
  remember(MODE_KEY, mode);
  return reveal(() => {
    document.documentElement.dataset.mode = mode;
    for (const toggle of document.querySelectorAll('.cz-theme-toggle')) {
      toggle.setAttribute('aria-pressed', String(mode === 'dark'));
    }
  }, from);
}

/** Switches the page's corners; every radius morphs to its new size. Remembered for next time. */
export function setCorners(corners: Corners): void {
  const root = document.documentElement;
  remember(CORNERS_KEY, corners);
  root.dataset.czMorph = '';
  root.dataset.czCorners = corners;
  window.setTimeout(() => delete root.dataset.czMorph, 600);
}

/**
 * The inline script for the document head: it sets the remembered mode and corners before the first paint, so the
 * page never flashes the wrong theme.
 */
export const themeScript: string = `try{var d=document.documentElement,m=localStorage.getItem('${MODE_KEY}'),c=localStorage.getItem('${CORNERS_KEY}');if(m)d.dataset.mode=m;if(c)d.dataset.czCorners=c}catch(e){}`;

/** A theme toggle switches light and dark, revealing the new theme from itself. */
export function themeToggle(button: HTMLElement): Disposer {
  button.setAttribute('aria-pressed', String(currentMode() === 'dark'));
  const controller = new AbortController();
  button.addEventListener(
    'click',
    () => {
      const rect = button.getBoundingClientRect();
      void setMode(currentMode() === 'dark' ? 'light' : 'dark', {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
    },
    { signal: controller.signal },
  );
  return () => controller.abort();
}
