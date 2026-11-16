import { animate, byKeyboard, collapse, type Disposer, expand, glide, SPRING, springEasing } from '../motion/index.ts';
import { closest, combine, emit } from './dom.ts';

/**
 * Tabs: a `[role=tablist]` of `[role=tab]` buttons with `aria-controls`. One plate rests on the chosen tab and
 * follows the pointer; the panel slides in from the side the choice moved to; arrow keys, Home and End move at once.
 */
export function tabs(list: HTMLElement): Disposer {
  const all = [...list.querySelectorAll<HTMLElement>('[role="tab"]')];
  const plate = glide(list, {
    items: '[role="tab"]',
    selected: () => list.querySelector('[aria-selected="true"]'),
    hover: true,
  });
  const panelOf = (tab: HTMLElement): HTMLElement | null =>
    document.getElementById(tab.getAttribute('aria-controls') ?? '');
  const select = (tab: HTMLElement): void => {
    const from = all.findIndex((other) => other.getAttribute('aria-selected') === 'true');
    const to = all.indexOf(tab);
    if (from === to) return;
    for (const other of all) {
      const chosen = other === tab;
      other.setAttribute('aria-selected', String(chosen));
      other.tabIndex = chosen ? 0 : -1;
      const panel = panelOf(other);
      if (panel) panel.hidden = !chosen;
    }
    const panel = panelOf(tab);
    if (panel && !byKeyboard()) {
      void animate(
        panel,
        { opacity: [0, 1], translate: [`${to > from ? 16 : -16}px 0`, '0 0'] },
        springEasing(SPRING.smooth),
      );
    }
    plate.select();
    emit(list, 'cz:change', { tab });
  };
  const controller = new AbortController();
  const { signal } = controller;
  list.addEventListener(
    'click',
    (event) => {
      const tab = closest(event.target, '[role="tab"]');
      if (tab) select(tab);
    },
    { signal },
  );
  list.addEventListener(
    'keydown',
    (event) => {
      const index = all.indexOf(document.activeElement as HTMLElement);
      if (index < 0) return;
      const rtl = getComputedStyle(list).direction === 'rtl';
      const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
      const back = rtl ? 'ArrowRight' : 'ArrowLeft';
      const next =
        event.key === forward
          ? all[(index + 1) % all.length]
          : event.key === back
            ? all[(index - 1 + all.length) % all.length]
            : event.key === 'Home'
              ? all[0]
              : event.key === 'End'
                ? all.at(-1)
                : undefined;
      if (!next) return;
      event.preventDefault();
      select(next);
      next.focus();
    },
    { signal },
  );
  return combine([() => controller.abort(), plate.destroy]);
}

/**
 * Accordion: `details` items with a `.cz-accordion-panel` after the summary. One wash glides over the headers; an
 * item opens on a spring and closes quicker. With `data-exclusive`, opening one closes the open one at the same time.
 */
export function accordion(root: HTMLElement): Disposer {
  const plate = glide(root, { items: 'summary', className: 'cz-glide-over' });
  const items = [...root.querySelectorAll<HTMLDetailsElement>(':scope > details')];
  const panelOf = (item: HTMLDetailsElement): HTMLElement | null => item.querySelector('.cz-accordion-panel');
  const busy = (item: HTMLDetailsElement): boolean => 'opening' in item.dataset || 'closing' in item.dataset;
  const open = async (item: HTMLDetailsElement): Promise<void> => {
    item.open = true;
    item.dataset.opening = '';
    const panel = panelOf(item);
    if (panel) await expand(panel);
    delete item.dataset.opening;
  };
  const close = async (item: HTMLDetailsElement): Promise<void> => {
    item.dataset.closing = '';
    const panel = panelOf(item);
    if (panel) await collapse(panel);
    item.open = false;
    if (panel) {
      for (const animation of panel.getAnimations()) animation.cancel();
      panel.style.removeProperty('overflow');
    }
    delete item.dataset.closing;
  };
  const controller = new AbortController();
  for (const item of items) {
    item.querySelector('summary')?.addEventListener(
      'click',
      (event) => {
        event.preventDefault();
        if (busy(item)) return;
        if (item.open) {
          void close(item);
          return;
        }
        if ('exclusive' in root.dataset) {
          for (const other of items) if (other !== item && other.open && !busy(other)) void close(other);
        }
        void open(item);
      },
      { signal: controller.signal },
    );
  }
  return combine([() => controller.abort(), plate.destroy]);
}

/** Any list of links or buttons marked with `aria-current`: one plate rests on the current one and follows the pointer. */
export function nav(root: HTMLElement, items = 'a, button'): Disposer {
  const plate = glide(root, {
    items,
    selected: () => root.querySelector('[aria-current]:not([aria-current="false"])'),
    hover: true,
  });
  const observer = new MutationObserver(() => plate.select());
  observer.observe(root, { subtree: true, attributeFilter: ['aria-current'] });
  return combine([() => observer.disconnect(), plate.destroy]);
}

/**
 * Pagination: `.cz-page` items, the current one with `aria-current="page"`. Links navigate on their own; buttons with
 * `data-page` move the current page here and fire `cz:page`, and the arrows (`data-step`) step through them.
 */
export function pagination(root: HTMLElement): Disposer {
  const stop = nav(root, '.cz-page:not([data-step])');
  const pages = (): HTMLElement[] => [...root.querySelectorAll<HTMLElement>('.cz-page[data-page]')];
  const prev = root.querySelector<HTMLButtonElement>('[data-step="prev"]');
  const next = root.querySelector<HTMLButtonElement>('[data-step="next"]');
  const sync = (): void => {
    const list = pages();
    const index = list.findIndex((page) => page.getAttribute('aria-current') === 'page');
    if (prev) prev.disabled = index <= 0;
    if (next) next.disabled = index < 0 || index >= list.length - 1;
  };
  const go = (page: HTMLElement | undefined): void => {
    if (!page) return;
    for (const other of pages()) {
      if (other === page) other.setAttribute('aria-current', 'page');
      else other.removeAttribute('aria-current');
    }
    sync();
    emit(root, 'cz:page', { page: page.dataset.page });
  };
  const controller = new AbortController();
  root.addEventListener(
    'click',
    (event) => {
      const target = closest(event.target, '.cz-page');
      if (!target || target instanceof HTMLAnchorElement) return;
      const list = pages();
      const index = list.findIndex((page) => page.getAttribute('aria-current') === 'page');
      if (target.dataset.step === 'prev') go(list[index - 1]);
      else if (target.dataset.step === 'next') go(list[index + 1]);
      else go(target);
    },
    { signal: controller.signal },
  );
  sync();
  return combine([() => controller.abort(), stop]);
}

/** A toolbar of quiet icon buttons sharing one plate. */
export function toolbar(root: HTMLElement): Disposer {
  return glide(root, { items: '.cz-button' }).destroy;
}
