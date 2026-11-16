import { animate, cancelAnimations, EASE_IN, EASE_IN_OUT, EASE_OUT } from './animate.ts';
import { calm } from './env.ts';
import { SPRING, springEasing } from './spring.ts';

interface Extent {
  readonly height: string;
  readonly paddingTop: string;
  readonly paddingBottom: string;
}

const NOTHING: Extent = { height: '0px', paddingTop: '0px', paddingBottom: '0px' };

// The computed height follows the element's own box-sizing, so animating it next to the padding lands exactly on
// the size the element has at rest.
function extent(element: HTMLElement): Extent {
  const { height, paddingTop, paddingBottom } = getComputedStyle(element);
  return { height, paddingTop, paddingBottom };
}

/** Opens an element from nothing on a spring, padding included. Leftover animations are cleared first. */
export async function expand(element: HTMLElement): Promise<void> {
  cancelAnimations(element);
  if (calm(element)) return;
  const full = extent(element);
  element.style.overflow = 'hidden';
  await Promise.all([
    animate(element, [{ ...NOTHING }, { ...full }], springEasing(SPRING.smooth)),
    animate(element, { opacity: [0, 1], translate: ['0 -4px', '0 0'] }, { duration: 260, easing: EASE_OUT }),
  ]);
  element.style.removeProperty('overflow');
}

/**
 * Closes an element to nothing, quicker than it opened. It stays closed until the caller hides or removes it;
 * the next `expand` clears it.
 */
export async function collapse(element: HTMLElement): Promise<void> {
  if (calm(element)) return;
  const full = extent(element);
  element.style.overflow = 'hidden';
  await Promise.all([
    animate(element, [{ ...full }, { ...NOTHING }], { duration: 220, easing: EASE_IN_OUT, fill: 'forwards' }),
    animate(element, { opacity: [1, 0] }, { duration: 140, easing: EASE_IN, fill: 'forwards' }),
  ]);
}

/**
 * Runs `change`, which reorders `items` in the DOM, and slides each item from its old place to its new one.
 * Resolves when every item has landed.
 */
export async function reorder(items: readonly HTMLElement[], change: () => void): Promise<void> {
  const before = items.map((item) => item.getBoundingClientRect().top);
  change();
  const after = items.map((item) => item.getBoundingClientRect().top);
  const spring = springEasing(SPRING.smooth);
  await Promise.all(
    items.map((item, i) => {
      const dy = (before[i] ?? 0) - (after[i] ?? 0);
      return Math.abs(dy) > 0.5 ? animate(item, { transform: [`translateY(${dy}px)`, 'none'] }, spring) : undefined;
    }),
  );
}

/**
 * Runs `change`, which changes an element's content, and springs its width from the old size to the new one.
 * Resolves when the width has settled.
 */
export async function resize(element: HTMLElement, change: () => void): Promise<void> {
  const from = element.offsetWidth;
  change();
  const to = element.offsetWidth;
  if (Math.abs(from - to) < 1) return;
  await animate(element, { width: [`${from}px`, `${to}px`] }, springEasing(SPRING.snappy));
}
