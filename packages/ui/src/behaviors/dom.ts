import type { Disposer } from '../motion/env.ts';

export const noop: Disposer = () => {};

/** The nearest ancestor of an event target that matches `selector`. */
export function closest<T extends Element = HTMLElement>(target: EventTarget | null, selector: string): T | null {
  return target instanceof Element ? target.closest<T>(selector) : null;
}

/** Dispatches a bubbling custom event, such as `cz:select`, for apps to follow. */
export function emit<T>(target: EventTarget, type: string, detail: T): void {
  target.dispatchEvent(new CustomEvent<T>(type, { bubbles: true, detail }));
}

/** The visible label of an item: its own text, without key hints, captions or hidden decoration. */
export function labelOf(item: Element): string {
  let text = '';
  for (const node of item.childNodes) {
    if (node.nodeType === 3) text += node.textContent ?? '';
    else if (node instanceof Element && !node.matches('.cz-menu-hint, .cz-kbd, svg, [aria-hidden="true"]')) {
      text += node.textContent ?? '';
    }
  }
  return text.replace(/\s+/g, ' ').trim();
}

/** True on a right-to-left page or subtree. */
export const rtl = (element: Element): boolean => getComputedStyle(element).direction === 'rtl';

/** One disposer for many, run in reverse order of setup. */
export function combine(disposers: Disposer[]): Disposer {
  return () => {
    for (const dispose of disposers.splice(0).reverse()) dispose();
  };
}

/** True where CSS anchor positioning works; elsewhere overlays are placed by script. */
export const anchors = (): boolean => typeof CSS !== 'undefined' && CSS.supports('anchor-name: --a');

let anchorIds = 0;

/** Ties a floating element to its anchor with a unique anchor name, so several on a page never mix. */
export function anchor(target: HTMLElement, floating: HTMLElement): void {
  if (!target.style.getPropertyValue('anchor-name')) {
    anchorIds += 1;
    target.style.setProperty('anchor-name', `--cz-anchor-${anchorIds}`);
  }
  floating.style.setProperty('position-anchor', target.style.getPropertyValue('anchor-name'));
}

/**
 * Places a floating element under its anchor by script, for browsers without anchor positioning. It lines up with
 * the anchor's inline start, so on a right-to-left page it hangs from the right edge.
 */
export function placeBelow(target: Element, floating: HTMLElement, gap = 4): void {
  if (anchors()) return;
  const rect = target.getBoundingClientRect();
  const width = floating.offsetWidth;
  const start = rtl(target) ? rect.right - width : rect.left;
  Object.assign(floating.style, {
    position: 'fixed',
    margin: '0',
    top: `${rect.bottom + gap}px`,
    left: `${Math.max(8, Math.min(start, innerWidth - width - 8))}px`,
  });
}

/** The corner a floating element grows from: the anchor's side, top or bottom by where there is room. */
export function origin(target: Element, room: number): string {
  const rect = target.getBoundingClientRect();
  return `${rect.bottom + room < innerHeight ? 'top' : 'bottom'} ${rtl(target) ? 'right' : 'left'}`;
}

interface CommandEventLike extends Event {
  readonly command: string;
  readonly source: Element | null;
}

/** True where `commandfor` buttons open and close dialogs natively. */
export const invokers = (): boolean =>
  typeof HTMLButtonElement !== 'undefined' && 'commandForElement' in HTMLButtonElement.prototype;

/**
 * Calls `handle` for invoker commands aimed at `target` (`<button commandfor="id" command="show-modal">`), natively
 * where browsers support invoker commands and by a click listener elsewhere.
 */
export function onCommand(
  target: HTMLElement,
  handle: (command: string, source: Element | null) => boolean,
  signal: AbortSignal,
): void {
  target.addEventListener(
    'command',
    (event) => {
      const { command, source } = event as CommandEventLike;
      if (handle(command, source)) event.preventDefault();
    },
    { signal },
  );
  if (invokers() || !target.id) return;
  document.addEventListener(
    'click',
    (event) => {
      const button = closest(event.target, `[commandfor="${CSS.escape(target.id)}"]`);
      if (button) handle(button.getAttribute('command') ?? '', button);
    },
    { signal },
  );
}

/** True when a click landed outside the element's box, as on a dialog's backdrop. */
export function outside(element: Element, event: MouseEvent): boolean {
  const rect = element.getBoundingClientRect();
  return (
    event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom
  );
}
