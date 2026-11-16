import { animate, EASE_OUT } from './animate.ts';
import { calm, type Disposer, inBrowser } from './env.ts';
import { SPRING, Spring, springEasing } from './spring.ts';

/**
 * Rolls the text of `element` to `value`: the old value slides out, the new one slides in from the side it came
 * from. Only the new value is read out. Resolves when the new value has landed.
 */
export async function roll(element: HTMLElement, value: string | number): Promise<void> {
  const next = String(value);
  const previous = element.dataset.value ?? element.textContent ?? '';
  if (previous === next) return;
  element.dataset.value = next;
  if (calm(element)) {
    element.textContent = next;
    return;
  }
  const up = Number.parseFloat(next) >= Number.parseFloat(previous) || Number.isNaN(Number.parseFloat(next));
  const leaving = document.createElement('span');
  const arriving = document.createElement('span');
  leaving.textContent = previous;
  leaving.setAttribute('aria-hidden', 'true');
  arriving.textContent = next;
  element.classList.add('cz-roll');
  element.replaceChildren(leaving, arriving);
  leaving.animate(
    { translate: ['0 0', `0 ${up ? '-100%' : '100%'}`], opacity: [1, 0] },
    { duration: 260, easing: EASE_OUT, fill: 'forwards' },
  );
  await animate(
    arriving,
    { translate: [`0 ${up ? '100%' : '-100%'}`, '0 0'], opacity: [0, 1] },
    { ...springEasing(SPRING.snappy), fill: 'backwards' },
  );
  if (element.dataset.value === next) element.replaceChildren(next);
}

export interface CountOptions {
  /** Formats each frame's value; the default rounds to a whole number. */
  readonly format?: (value: number) => string;
  /** Starting value; defaults to the number currently shown. */
  readonly from?: number;
}

/** Counts the number shown in `element` up or down to `to` on a spring. Returns a function that stops it. */
export function countTo(element: HTMLElement, to: number, options: CountOptions = {}): Disposer {
  const format = options.format ?? ((value: number) => Math.round(value).toLocaleString());
  const from = options.from ?? (Number.parseFloat((element.textContent ?? '').replace(/[^\d.-]/g, '')) || 0);
  const spring = new Spring(from, {
    config: SPRING.smooth,
    precision: Math.max(0.001, Math.abs(to - from) / 10_000),
    onUpdate: (value) => {
      element.textContent = format(value);
    },
  });
  spring.to(to);
  return () => spring.stop();
}

/** A short, damped shake for a value that cannot be taken. */
export function shake(element: Element): Promise<void> {
  return animate(
    element,
    {
      transform: [
        'translateX(0)',
        'translateX(-6px)',
        'translateX(5px)',
        'translateX(-3px)',
        'translateX(2px)',
        'translateX(0)',
      ],
    },
    { duration: 380, easing: 'ease-out' },
  );
}

/**
 * A soft light that follows the pointer over elements matching `selector`, through --cz-mx and --cz-my.
 * One listener for the whole page, throttled to animation frames.
 */
export function spotlight(selector: string, root: Document | HTMLElement = document): Disposer {
  if (!inBrowser) return () => {};
  let pending: { element: HTMLElement; x: number; y: number } | null = null;
  let frame = 0;
  const flush = (): void => {
    frame = 0;
    if (!pending) return;
    const { element, x, y } = pending;
    pending = null;
    const rect = element.getBoundingClientRect();
    element.style.setProperty('--cz-mx', `${x - rect.left}px`);
    element.style.setProperty('--cz-my', `${y - rect.top}px`);
  };
  const controller = new AbortController();
  root.addEventListener(
    'pointermove',
    (event) => {
      const { target, clientX, clientY } = event as PointerEvent;
      const element = target instanceof Element ? target.closest(selector) : null;
      if (!(element instanceof HTMLElement)) return;
      pending = { element, x: clientX, y: clientY };
      frame ||= requestAnimationFrame(flush);
    },
    { passive: true, signal: controller.signal },
  );
  return () => {
    controller.abort();
    cancelAnimationFrame(frame);
  };
}
