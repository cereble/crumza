/** Undoes a setup: removes its listeners, observers, timers and elements. */
export type Disposer = () => void;

/** False on the server. Nothing here touches `window` or `document` until it is called in a browser. */
export const inBrowser: boolean = typeof window !== 'undefined' && typeof document !== 'undefined';

let reducedMotion: MediaQueryList | undefined;

/**
 * True when motion should land at once: the system asks for less motion, or `data-motion="reduce"` is set on the
 * page or, when `element` is given, on any of its ancestors.
 */
export function calm(element?: Element | null): boolean {
  if (!inBrowser) return true;
  reducedMotion ??= window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reducedMotion.matches) return true;
  return (element ?? document.documentElement).closest('[data-motion="reduce"]') !== null;
}

let keyboard = false;
let tracking = false;

/** Starts tracking whether the last input was a key or a pointer. Safe to call many times. */
export function trackInput(): void {
  if (tracking || !inBrowser) return;
  tracking = true;
  const options: AddEventListenerOptions = { capture: true, passive: true };
  window.addEventListener('keydown', () => (keyboard = true), options);
  window.addEventListener('pointerdown', () => (keyboard = false), options);
  window.addEventListener('pointermove', () => (keyboard = false), options);
}

/** True when the last input was a key press. Keyboard-driven changes land at once instead of animating. */
export function byKeyboard(): boolean {
  trackInput();
  return keyboard;
}

let ids = 0;

/** A document-unique id with a readable prefix. */
export function uniqueId(prefix: string): string {
  ids += 1;
  return `${prefix}-${ids}`;
}
