import { calm, inBrowser } from './env.ts';

export interface RevealOptions {
  /** Where the circle starts, in viewport pixels. */
  readonly x?: number;
  readonly y?: number;
}

// Each switch takes a number; only the latest one clears the flags, so a quick second switch keeps its reveal.
let generation = 0;

/**
 * Switches the page's theme inside `change`. Every colour lands at once, so nothing lags behind in the old theme,
 * and the new look spreads from (x, y) as a soft-edged circle that slows as it reaches the far corners.
 * Without view transitions, or under reduced motion, the switch is instant.
 */
export async function reveal(change: () => void, options: RevealOptions = {}): Promise<void> {
  if (!inBrowser) return change();
  const root = document.documentElement;
  generation += 1;
  const mine = generation;
  const flip = (): void => {
    root.dataset.czInstant = '';
    change();
    void root.offsetHeight;
  };
  const settle = (): void => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (mine !== generation) return;
        delete root.dataset.czInstant;
        delete root.dataset.czRevealing;
      }),
    );
  };
  if (calm() || typeof document.startViewTransition !== 'function') {
    flip();
    return settle();
  }
  const x = options.x ?? innerWidth / 2;
  const y = options.y ?? 0;
  const feather = 64;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + feather;
  root.style.setProperty('--cz-reveal-x', `${x}px`);
  root.style.setProperty('--cz-reveal-y', `${y}px`);
  root.dataset.czRevealing = '';
  const transition = document.startViewTransition(flip);
  try {
    await transition.ready;
    root.animate(
      { '--cz-reveal': ['0px', `${radius}px`] },
      {
        duration: 760,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'forwards',
        pseudoElement: '::view-transition-new(root)',
      },
    );
    await transition.finished;
  } catch {
    // A skipped or interrupted transition still leaves the new theme in place.
  } finally {
    settle();
  }
}
