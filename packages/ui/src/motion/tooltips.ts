import { animate, EASE_OUT } from './animate.ts';
import { trackInput, uniqueId } from './env.ts';
import { SPRING, Spring } from './spring.ts';

export interface TooltipOptions {
  /** Items that carry a tooltip; their text comes from `data-tip`. */
  readonly selector?: string;
  /** Wait before the first tooltip shows, in milliseconds. */
  readonly delay?: number;
  /** Grace period before hiding after the pointer leaves. */
  readonly grace?: number;
  /** Within this long after hiding, the next tooltip shows at once. */
  readonly skip?: number;
}

export interface Tooltips {
  show(item: HTMLElement): void;
  hide(): void;
  destroy(): void;
}

/**
 * One tooltip for a group of items that glides from item to item and resizes to each label. It waits on the first
 * hover, then follows at once; keyboard focus shows it at once; Escape hides it. The pointer can move onto the tip
 * and it stays, so it can be read at any zoom.
 */
export function tooltips(host: HTMLElement, options: TooltipOptions = {}): Tooltips {
  const { selector = '[data-tip]', delay = 450, grace = 140, skip = 300 } = options;
  trackInput();

  const tip = document.createElement('span');
  tip.className = 'cz-tip';
  tip.id = uniqueId('cz-tip');
  tip.setAttribute('role', 'tooltip');
  const label = document.createElement('span');
  label.className = 'cz-tip-label';
  tip.append(label);
  host.append(tip);
  host.classList.add('cz-tip-host');

  let visible = false;
  let hiddenAt = Number.NEGATIVE_INFINITY;
  let wait = 0;
  let leave = 0;
  let owner: HTMLElement | null = null;
  const place = { x: 0, width: 0, y: 0 };
  const paint = (): void => {
    tip.style.translate = `${place.x - place.width / 2}px ${place.y}px`;
    tip.style.width = `${place.width}px`;
  };
  const x = new Spring(0, {
    onUpdate: (value) => {
      place.x = value;
      paint();
    },
  });
  const width = new Spring(0, {
    onUpdate: (value) => {
      place.width = value;
      paint();
    },
  });

  const show = (item: HTMLElement): void => {
    window.clearTimeout(leave);
    if (owner !== item) {
      owner?.removeAttribute('aria-describedby');
      owner = item;
      item.setAttribute('aria-describedby', tip.id);
    }
    const text = item.dataset.tip ?? '';
    const changed = label.textContent !== text;
    label.textContent = text;
    const natural = label.offsetWidth;
    const outer = host.getBoundingClientRect();
    const rect = item.getBoundingClientRect();
    const center = rect.left - outer.left + rect.width / 2;
    place.y = rect.top - outer.top - tip.offsetHeight - 8;
    if (!visible) {
      visible = true;
      x.jump(center);
      width.jump(natural);
      tip.dataset.shown = '';
      return;
    }
    x.to(center, SPRING.smooth);
    width.to(natural, SPRING.smooth);
    if (changed)
      void animate(label, { opacity: [0, 1], translate: ['0 3px', '0 0'] }, { duration: 160, easing: EASE_OUT });
  };
  const hide = (): void => {
    window.clearTimeout(wait);
    if (!visible) return;
    visible = false;
    hiddenAt = performance.now();
    delete tip.dataset.shown;
    owner?.removeAttribute('aria-describedby');
    owner = null;
  };
  const itemAt = (target: EventTarget | null): HTMLElement | null => {
    const item = target instanceof Element ? target.closest(selector) : null;
    return item instanceof HTMLElement && host.contains(item) ? item : null;
  };

  const controller = new AbortController();
  const { signal } = controller;
  host.addEventListener(
    'pointerover',
    (event) => {
      const item = itemAt(event.target);
      if (!item || item === owner) return;
      window.clearTimeout(wait);
      window.clearTimeout(leave);
      if (visible || performance.now() - hiddenAt < skip) show(item);
      else wait = window.setTimeout(() => show(item), delay);
    },
    { signal },
  );
  host.addEventListener(
    'pointerout',
    (event) => {
      const item = itemAt(event.target);
      if (!item || (event.relatedTarget instanceof Node && item.contains(event.relatedTarget))) return;
      window.clearTimeout(wait);
      leave = window.setTimeout(hide, grace);
    },
    { signal },
  );
  // A click focuses its button too; only focus that shows (keys, a screen reader) brings the tip.
  host.addEventListener(
    'focusin',
    (event) => {
      const item = itemAt(event.target);
      if (item?.matches(':focus-visible')) show(item);
    },
    { signal },
  );
  tip.addEventListener('pointerenter', () => window.clearTimeout(leave), { signal });
  tip.addEventListener(
    'pointerleave',
    () => {
      window.clearTimeout(leave);
      leave = window.setTimeout(hide, grace);
    },
    { signal },
  );
  host.addEventListener('focusout', hide, { signal });
  host.addEventListener('pointerdown', hide, { signal });
  window.addEventListener('keydown', (event) => event.key === 'Escape' && hide(), { signal });

  return {
    show,
    hide,
    destroy: () => {
      controller.abort();
      window.clearTimeout(wait);
      window.clearTimeout(leave);
      x.stop();
      width.stop();
      owner?.removeAttribute('aria-describedby');
      tip.remove();
      host.classList.remove('cz-tip-host');
    },
  };
}
