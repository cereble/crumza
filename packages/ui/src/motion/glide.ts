import { byKeyboard, calm, trackInput } from './env.ts';
import { SPRING, Spring } from './spring.ts';

export interface GlideOptions {
  /** Selector for the items the plate moves between. */
  readonly items: string;
  /** The item the plate rests on. Without it the plate only follows the pointer and keyboard focus. */
  readonly selected?: () => Element | null | undefined;
  /** Follow the pointer and keyboard focus. Defaults to true when there is no `selected`. */
  readonly hover?: boolean;
  /** Squeeze the plate while its item is pressed. Default true. */
  readonly press?: boolean;
  /** Extra class names for the plate, such as `cz-glide-over` to draw it above striped rows. */
  readonly className?: string;
}

export interface MoveOptions {
  readonly instant?: boolean;
}

export interface Glide {
  readonly plate: HTMLElement;
  moveTo(item: Element | null | undefined, options?: MoveOptions): void;
  /** Moves to the selected item. Call it after the selection changes. */
  select(options?: MoveOptions): void;
  hide(): void;
  destroy(): void;
}

type Edge = 'left' | 'right' | 'top' | 'bottom';
type Box = Record<Edge, number>;
const EDGES: readonly Edge[] = ['left', 'right', 'top', 'bottom'];

/**
 * One plate for hover and selection that glides from item to item instead of items lighting up on their own.
 * The edge in front leads and the edge behind lags, so the plate stretches as it travels. Keyboard moves land at once.
 */
export function glide(host: HTMLElement, options: GlideOptions): Glide {
  const { items, selected, hover = !selected, press = true, className } = options;
  trackInput();

  const plate = document.createElement('span');
  plate.className = className ? `cz-glide ${className}` : 'cz-glide';
  plate.setAttribute('aria-hidden', 'true');
  host.prepend(plate);
  host.classList.add('cz-glide-host');
  if (selected) host.dataset.glide = '';

  const box: Box = { left: 0, right: 0, top: 0, bottom: 0 };
  let queued = false;
  let shown = false;
  let inside = false;
  let current: Element | null = null;

  const paint = (): void => {
    queued = false;
    plate.style.translate = `${box.left}px ${box.top}px`;
    plate.style.width = `${Math.max(0, box.right - box.left)}px`;
    plate.style.height = `${Math.max(0, box.bottom - box.top)}px`;
  };
  const edge = (key: Edge): Spring =>
    new Spring(0, {
      config: SPRING.lead,
      onUpdate: (value) => {
        box[key] = value;
        if (queued) return;
        queued = true;
        queueMicrotask(paint);
      },
    });
  const springs: Record<Edge, Spring> = {
    left: edge('left'),
    right: edge('right'),
    top: edge('top'),
    bottom: edge('bottom'),
  };

  // Boxes are measured in the host's own layout space, so a host that is still scaling in (a menu opening) gives
  // the size its items will have, not the size they have on this frame.
  const measure = (item: Element): Box => {
    const outer = host.getBoundingClientRect();
    const inner = item.getBoundingClientRect();
    const ratio = (size: number, layout: number): number => {
      const value = layout > 0 ? size / layout : 1;
      return Math.abs(value - 1) < 0.02 ? 1 : value;
    };
    const sx = ratio(outer.width, host.offsetWidth);
    const sy = ratio(outer.height, host.offsetHeight);
    const left = (inner.left - outer.left) / sx - host.clientLeft + host.scrollLeft;
    const top = (inner.top - outer.top) / sy - host.clientTop + host.scrollTop;
    return { left, top, right: left + inner.width / sx, bottom: top + inner.height / sy };
  };
  const show = (): void => {
    shown = true;
    plate.dataset.shown = '';
  };
  const hide = (): void => {
    shown = false;
    delete plate.dataset.shown;
  };
  const moveTo = (item: Element | null | undefined, { instant = false }: MoveOptions = {}): void => {
    if (!item) {
      hide();
      return;
    }
    current = item;
    const next = measure(item);
    if (!shown || instant || byKeyboard() || calm(host)) {
      for (const key of EDGES) springs[key].jump(next[key]);
      paint();
      show();
      return;
    }
    const right = next.left > springs.left.target;
    const down = next.top > springs.top.target;
    springs.right.to(next.right, right ? SPRING.lead : SPRING.lag);
    springs.left.to(next.left, right ? SPRING.lag : SPRING.lead);
    springs.bottom.to(next.bottom, down ? SPRING.lead : SPRING.lag);
    springs.top.to(next.top, down ? SPRING.lag : SPRING.lead);
  };
  const rest = (): void => (selected ? moveTo(selected()) : hide());
  const itemAt = (target: EventTarget | null): Element | null =>
    target instanceof Element ? target.closest(items) : null;
  const usable = (item: Element | null): item is Element =>
    item !== null && host.contains(item) && !item.matches(':disabled, [aria-disabled="true"]');

  const controller = new AbortController();
  const { signal } = controller;
  if (hover) {
    host.addEventListener(
      'pointerover',
      (event) => {
        inside = true;
        const item = itemAt(event.target);
        if (usable(item) && (item !== current || !shown)) moveTo(item);
      },
      { signal },
    );
    host.addEventListener(
      'pointerleave',
      () => {
        inside = false;
        rest();
      },
      { signal },
    );
    // Focus always moves the plate, however it arrived (keys, a screen reader, a switch); only keys land at once.
    host.addEventListener(
      'focusin',
      (event) => {
        const item = itemAt(event.target);
        if (usable(item)) moveTo(item, { instant: byKeyboard() });
      },
      { signal },
    );
    host.addEventListener(
      'focusout',
      (event) => {
        const next = event.relatedTarget instanceof Node ? event.relatedTarget : null;
        if (!inside && !host.contains(next)) rest();
      },
      { signal },
    );
  }
  if (press) {
    host.addEventListener(
      'pointerdown',
      (event) => {
        if (current !== null && itemAt(event.target) === current) plate.dataset.pressed = '';
      },
      { signal },
    );
    const release = (): void => {
      delete plate.dataset.pressed;
    };
    for (const type of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
      host.addEventListener(type, release, { signal });
    }
  }
  const observer = new ResizeObserver(() => {
    if (current && shown) moveTo(current, { instant: true });
  });
  observer.observe(host);
  if (selected) moveTo(selected(), { instant: true });

  return {
    plate,
    moveTo,
    hide,
    select: (moveOptions) => {
      if (selected) moveTo(selected(), moveOptions);
    },
    destroy: () => {
      controller.abort();
      observer.disconnect();
      for (const key of EDGES) springs[key].stop();
      plate.remove();
      host.classList.remove('cz-glide-host');
      delete host.dataset.glide;
    },
  };
}
