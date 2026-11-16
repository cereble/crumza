import {
  animate,
  byKeyboard,
  calm,
  closeTo,
  type Disposer,
  glide,
  openFrom,
  SPRING,
  Spring,
  springEasing,
  uniqueId,
} from '../motion/index.ts';
import {
  anchor,
  anchors,
  closest,
  combine,
  emit,
  labelOf,
  noop,
  onCommand,
  origin,
  outside,
  placeBelow,
} from './dom.ts';

/** What `cz:select` carries: the chosen element, its `data-value` (or label) and its visible label. */
export interface SelectDetail {
  readonly item: HTMLElement;
  readonly value: string;
  readonly label: string;
}

const selected = (item: HTMLElement): SelectDetail => {
  const label = labelOf(item);
  return { item, value: item.dataset.value ?? label, label };
};

const opener = (popover: HTMLElement): HTMLElement | null =>
  popover.id ? document.querySelector<HTMLElement>(`[popovertarget="${CSS.escape(popover.id)}"]`) : null;

/**
 * A popover grows out of the side of its trigger and settles its children one after another. Its trigger shows
 * `data-open` while it is open, so a chevron can turn.
 */
export function popover(root: HTMLElement): Disposer {
  [...root.children].forEach((child, i) => {
    if (child instanceof HTMLElement && !child.classList.contains('cz-glide')) {
      child.style.setProperty('--cz-index', String(i));
    }
  });
  const trigger = opener(root);
  const controller = new AbortController();
  const { signal } = controller;
  root.addEventListener(
    'beforetoggle',
    (event) => {
      if ((event as ToggleEvent).newState !== 'open' || !trigger || 'at' in root.dataset) return;
      root.style.setProperty('--cz-origin', origin(trigger, 260));
    },
    { signal },
  );
  root.addEventListener(
    'toggle',
    (event) => {
      const open = (event as ToggleEvent).newState === 'open';
      trigger?.toggleAttribute('data-open', open);
      if (open && trigger && !('at' in root.dataset)) placeBelow(trigger, root);
    },
    { signal },
  );
  return () => controller.abort();
}

/**
 * A menu (`[role=menu]` popover of `[role=menuitem]`): one plate under the pointer and the arrow keys, Home and End.
 * Opening moves focus into it: onto the first item from the keyboard, onto the menu itself otherwise, so arrow
 * keys work at once. Tab closes it; choosing an item closes it and fires `cz:select` with a `SelectDetail`.
 */
export function menu(root: HTMLElement): Disposer {
  const items = (): HTMLElement[] =>
    [...root.querySelectorAll<HTMLElement>('[role="menuitem"]')].filter((item) => !item.matches(':disabled'));
  const plate = glide(root, { items: '[role="menuitem"]' });
  const controller = new AbortController();
  const { signal } = controller;
  root.addEventListener(
    'toggle',
    (event) => {
      if ((event as ToggleEvent).newState !== 'open') plate.hide();
      else if (byKeyboard()) items()[0]?.focus();
      else {
        if (!root.hasAttribute('tabindex')) root.tabIndex = -1;
        root.focus({ preventScroll: true });
      }
    },
    { signal },
  );
  root.addEventListener(
    'keydown',
    (event) => {
      const list = items();
      const index = list.indexOf(document.activeElement as HTMLElement);
      const next =
        event.key === 'ArrowDown'
          ? list[(index + 1) % list.length]
          : event.key === 'ArrowUp'
            ? list[index < 0 ? list.length - 1 : (index - 1 + list.length) % list.length]
            : event.key === 'Home'
              ? list[0]
              : event.key === 'End'
                ? list.at(-1)
                : undefined;
      if (next) {
        event.preventDefault();
        next.focus();
      } else if (event.key === 'Tab') root.hidePopover();
    },
    { signal },
  );
  root.addEventListener(
    'click',
    (event) => {
      const item = closest(event.target, '[role="menuitem"]');
      if (!item) return;
      root.hidePopover();
      emit(root, 'cz:select', selected(item));
    },
    { signal },
  );
  return combine([() => controller.abort(), plate.destroy]);
}

/**
 * A context menu: right-click, a long press, or the Menu key on `region` opens `menu` where the pointer is, growing
 * from that point and flipping to stay on screen. It is a manual popover with its own dismissal (Escape, a press
 * or a wheel outside, resizing or leaving the window), because the browser's own would close it as the button or
 * finger lifts.
 */
export function contextMenu(region: HTMLElement, menuElement: HTMLElement): Disposer {
  menuElement.popover = 'manual';
  const isOpen = (): boolean => menuElement.matches(':popover-open');
  const openAt = (x: number, y: number): void => {
    menuElement.dataset.at = '';
    menuElement.style.setProperty('--cz-at-x', `${x}px`);
    menuElement.style.setProperty('--cz-at-y', `${y}px`);
    menuElement.style.setProperty('--cz-origin', 'top left');
    if (!isOpen()) menuElement.showPopover();
    const rect = menuElement.getBoundingClientRect();
    const flipX = x + rect.width > innerWidth - 8;
    const flipY = y + rect.height > innerHeight - 8;
    if (flipX) menuElement.style.setProperty('--cz-at-x', `${Math.max(8, x - rect.width)}px`);
    if (flipY) menuElement.style.setProperty('--cz-at-y', `${Math.max(8, y - rect.height)}px`);
    menuElement.style.setProperty('--cz-origin', `${flipY ? 'bottom' : 'top'} ${flipX ? 'right' : 'left'}`);
    region.dataset.open = '';
  };
  const close = (): void => {
    if (!isOpen()) return;
    const hadFocus = menuElement.contains(document.activeElement);
    menuElement.hidePopover();
    if (hadFocus) region.focus({ preventScroll: true });
  };
  let press = 0;
  let start = { x: 0, y: 0 };
  const cancelPress = (): void => window.clearTimeout(press);
  const controller = new AbortController();
  const { signal } = controller;
  region.addEventListener(
    'contextmenu',
    (event) => {
      event.preventDefault();
      cancelPress();
      openAt(event.clientX, event.clientY);
    },
    { signal },
  );
  region.addEventListener(
    'pointerdown',
    (event) => {
      if (event.pointerType !== 'touch') return;
      start = { x: event.clientX, y: event.clientY };
      press = window.setTimeout(() => openAt(start.x, start.y), 550);
    },
    { signal },
  );
  region.addEventListener(
    'pointermove',
    (event) => {
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) cancelPress();
    },
    { signal },
  );
  region.addEventListener('pointerup', cancelPress, { signal });
  region.addEventListener('pointercancel', cancelPress, { signal });
  region.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
      event.preventDefault();
      const rect = region.getBoundingClientRect();
      openAt(rect.left + 16, rect.top + 16);
    },
    { signal },
  );
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (isOpen() && !(event.target instanceof Node && menuElement.contains(event.target))) close();
    },
    { capture: true, signal },
  );
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || !isOpen()) return;
      event.preventDefault();
      close();
    },
    { signal },
  );
  // A wheel outside means the reader wants the page back; the page scrolling on its own does not.
  document.addEventListener(
    'wheel',
    (event) => {
      if (isOpen() && !(event.target instanceof Node && menuElement.contains(event.target))) close();
    },
    { capture: true, passive: true, signal },
  );
  for (const type of ['blur', 'resize'] as const) window.addEventListener(type, close, { signal });
  menuElement.addEventListener(
    'toggle',
    (event) => {
      if ((event as ToggleEvent).newState === 'closed') delete region.dataset.open;
    },
    { signal },
  );
  return () => {
    controller.abort();
    cancelPress();
  };
}

/**
 * A modal dialog opened by `<button commandfor="id" command="show-modal">` grows out of that button and shrinks back
 * into it on Escape, a backdrop click, a `command="close"` button or a `method=dialog` form.
 */
export function dialog(root: HTMLDialogElement): Disposer {
  let from: Element | null = null;
  const close = (value?: string): void => void closeTo(root, from, value);
  const controller = new AbortController();
  const { signal } = controller;
  onCommand(
    root,
    (command, source) => {
      if (command === 'show-modal') {
        from = source;
        void openFrom(root, source);
        return true;
      }
      if (command === 'close' || command === 'request-close') {
        close();
        return true;
      }
      return false;
    },
    signal,
  );
  root.addEventListener(
    'cancel',
    (event) => {
      event.preventDefault();
      close('cancel');
    },
    { signal },
  );
  root.addEventListener('click', (event) => event.target === root && outside(root, event) && close('cancel'), {
    signal,
  });
  root.addEventListener(
    'submit',
    (event) => {
      if ((event.target as HTMLFormElement).method !== 'dialog') return;
      event.preventDefault();
      close((event.submitter as HTMLButtonElement | null)?.value ?? '');
    },
    { signal },
  );
  return () => controller.abort();
}

const interactive = 'a, button, input, select, textarea, label, [contenteditable], [tabindex]:not([tabindex="-1"])';

/**
 * A sheet (`dialog.cz-sheet`, from the bottom or with `data-side="end"`) slides in on a spring. Drag it back to
 * dismiss: it follows the finger, resists past its resting place, the page brightens as it goes, and a quick flick
 * is enough.
 */
export function sheet(root: HTMLDialogElement): Disposer {
  const horizontal = root.dataset.side === 'end';
  let size = 0;
  const drag = new Spring(0, {
    onUpdate: (value) => {
      root.style.setProperty('--cz-drag', `${value}px`);
      root.style.setProperty('--cz-drag-progress', String(size > 0 ? Math.min(1, Math.max(0, value / size)) : 0));
    },
  });
  const measure = (): void => {
    size = horizontal ? root.offsetWidth : root.offsetHeight;
  };
  const open = (): void => {
    if (root.open) return;
    root.showModal();
    measure();
    if (calm(root)) {
      drag.jump(0);
      return;
    }
    drag.jump(size);
    drag.to(0, SPRING.smooth);
  };
  let closing = false;
  const close = async (value?: string): Promise<void> => {
    if (!root.open || closing) return;
    closing = true;
    measure();
    if (!calm(root)) await drag.to(size + 8, SPRING.snappy).settled();
    root.close(value);
    drag.jump(0);
    closing = false;
  };

  // Dragging: positive distance points toward dismissal (down, or toward the inline end).
  let pointer = -1;
  let origin = 0;
  let last = 0;
  let lastTime = 0;
  let velocity = 0;
  const along = (event: PointerEvent): number => {
    const rtl = horizontal && getComputedStyle(root).direction === 'rtl';
    const position = horizontal ? event.clientX : event.clientY;
    return rtl ? -position : position;
  };
  const controller = new AbortController();
  const { signal } = controller;
  root.addEventListener(
    'pointerdown',
    (event) => {
      const target = event.target as Element;
      const handle = target.closest('.cz-sheet-grabber');
      if (!handle && (target.closest(interactive) || (!horizontal && root.scrollTop > 0))) return;
      pointer = event.pointerId;
      measure();
      origin = along(event) - drag.value;
      last = along(event);
      lastTime = performance.now();
      velocity = 0;
      drag.stop();
      root.setPointerCapture(pointer);
      root.dataset.dragging = '';
    },
    { signal },
  );
  root.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerId !== pointer) return;
      const now = performance.now();
      const position = along(event);
      velocity = ((position - last) / Math.max(1, now - lastTime)) * 1000;
      last = position;
      lastTime = now;
      const distance = position - origin;
      drag.jump(distance < 0 ? distance * 0.2 : distance);
    },
    { signal },
  );
  const release = (event: PointerEvent): void => {
    if (event.pointerId !== pointer) return;
    pointer = -1;
    delete root.dataset.dragging;
    if (drag.value > size * 0.35 || velocity > 700) {
      drag.velocity = velocity;
      void close('drag');
    } else {
      drag.velocity = velocity;
      drag.to(0, SPRING.smooth);
    }
  };
  root.addEventListener('pointerup', release, { signal });
  root.addEventListener('pointercancel', release, { signal });
  onCommand(
    root,
    (command) => {
      if (command === 'show-modal') {
        open();
        return true;
      }
      if (command === 'close' || command === 'request-close') {
        void close();
        return true;
      }
      return false;
    },
    signal,
  );
  root.addEventListener(
    'cancel',
    (event) => {
      event.preventDefault();
      void close('cancel');
    },
    { signal },
  );
  root.addEventListener('click', (event) => event.target === root && outside(root, event) && void close('cancel'), {
    signal,
  });
  return () => {
    controller.abort();
    drag.stop();
  };
}

/**
 * A command palette (`dialog.cz-command`): ⌘K or Ctrl+K opens it from anywhere. Typing filters the items by their
 * text and `data-keywords`, the box resizes on a spring, and one plate follows the pointer and the arrow keys.
 * Choosing fires `cz:select` with a `SelectDetail`.
 */
export function commandPalette(root: HTMLDialogElement, options: { readonly shortcut?: string } = {}): Disposer {
  const { shortcut = 'k' } = options;
  const input = root.querySelector<HTMLInputElement>('.cz-command-search input');
  const list = root.querySelector<HTMLElement>('.cz-command-list');
  if (!input || !list) return noop;
  const items = [...list.querySelectorAll<HTMLElement>('.cz-command-item')];
  const groups = [...list.querySelectorAll<HTMLElement>('.cz-command-group')];
  const empty = list.querySelector<HTMLElement>('.cz-command-empty');
  list.id ||= uniqueId('cz-command-list');
  list.setAttribute('role', 'listbox');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-controls', list.id);
  input.setAttribute('aria-expanded', 'true');
  for (const item of items) {
    item.id ||= uniqueId('cz-command-item');
    item.setAttribute('role', 'option');
  }
  const text = new Map(items.map((item) => [item, `${labelOf(item)} ${item.dataset.keywords ?? ''}`.toLowerCase()]));
  const plate = glide(list, { items: '.cz-command-item:not([hidden])' });

  let active: HTMLElement | null = null;
  const visible = (): HTMLElement[] => items.filter((item) => !item.hidden);
  const activate = (item: HTMLElement | null, scroll = true): void => {
    active = item;
    if (!item) {
      input.removeAttribute('aria-activedescendant');
      plate.hide();
      return;
    }
    input.setAttribute('aria-activedescendant', item.id);
    plate.moveTo(item);
    if (scroll) item.scrollIntoView({ block: 'nearest' });
  };
  const filter = (): void => {
    const before = root.offsetHeight;
    const words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    for (const item of items) item.hidden = !words.every((word) => text.get(item)?.includes(word));
    for (const group of groups) group.hidden = !group.querySelector('.cz-command-item:not([hidden])');
    const shown = visible();
    if (empty) empty.hidden = shown.length > 0;
    activate(shown[0] ?? null, false);
    list.scrollTop = 0;
    const after = root.offsetHeight;
    if (Math.abs(after - before) > 1 && root.open) {
      void animate(root, { height: [`${before}px`, `${after}px`] }, springEasing(SPRING.snappy));
    }
  };
  let from: Element | null = null;
  const open = (source: Element | null): void => {
    if (root.open) return;
    from = source;
    input.value = '';
    filter();
    void openFrom(root, source);
    input.focus();
  };
  const close = (value?: string): void => void closeTo(root, from, value);
  const choose = (item: HTMLElement): void => {
    const detail = selected(item);
    emit(root, 'cz:select', detail);
    close(detail.value);
  };

  const controller = new AbortController();
  const { signal } = controller;
  onCommand(
    root,
    (command, source) => {
      if (command !== 'show-modal') return false;
      open(source);
      return true;
    },
    signal,
  );
  document.addEventListener(
    'keydown',
    (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== shortcut) return;
      event.preventDefault();
      if (root.open) close();
      else open(null);
    },
    { signal },
  );
  input.addEventListener('input', filter, { signal });
  input.addEventListener(
    'keydown',
    (event) => {
      const shown = visible();
      const index = active ? shown.indexOf(active) : -1;
      const next =
        event.key === 'ArrowDown'
          ? shown[(index + 1) % shown.length]
          : event.key === 'ArrowUp'
            ? shown[index < 0 ? shown.length - 1 : (index - 1 + shown.length) % shown.length]
            : undefined;
      if (next) {
        event.preventDefault();
        activate(next);
      } else if (event.key === 'Enter' && active) {
        event.preventDefault();
        choose(active);
      }
    },
    { signal },
  );
  list.addEventListener(
    'pointermove',
    (event) => {
      const item = closest(event.target, '.cz-command-item');
      if (item && item !== active) activate(item, false);
    },
    { signal },
  );
  list.addEventListener(
    'click',
    (event) => {
      const item = closest(event.target, '.cz-command-item');
      if (item) choose(item);
    },
    { signal },
  );
  root.addEventListener(
    'cancel',
    (event) => {
      event.preventDefault();
      close('cancel');
    },
    { signal },
  );
  root.addEventListener('click', (event) => event.target === root && outside(root, event) && close('cancel'), {
    signal,
  });
  return combine([() => controller.abort(), plate.destroy]);
}

/**
 * A hover card: after a short wait on `trigger`, or at once when focus lands on it, `card` (a `popover="manual"`)
 * grows out of it. It stays while the pointer is on either, and leaves after a grace period or on Escape.
 */
export function hoverCard(
  trigger: HTMLElement,
  card: HTMLElement,
  options: { readonly delay?: number; readonly grace?: number } = {},
): Disposer {
  const { delay = 500, grace = 250 } = options;
  anchor(trigger, card);
  trigger.setAttribute('aria-expanded', 'false');
  let wait = 0;
  let leave = 0;
  const show = (): void => {
    window.clearTimeout(leave);
    if (card.matches(':popover-open')) return;
    card.style.setProperty('--cz-origin', origin(trigger, 220));
    card.showPopover();
    if (!anchors()) placeBelow(trigger, card, 6);
    trigger.setAttribute('aria-expanded', 'true');
  };
  const hide = (): void => {
    window.clearTimeout(wait);
    if (!card.matches(':popover-open')) return;
    card.hidePopover();
    trigger.setAttribute('aria-expanded', 'false');
  };
  const later = (): void => {
    window.clearTimeout(wait);
    window.clearTimeout(leave);
    leave = window.setTimeout(hide, grace);
  };
  const controller = new AbortController();
  const { signal } = controller;
  trigger.addEventListener(
    'pointerenter',
    () => {
      window.clearTimeout(leave);
      wait = window.setTimeout(show, delay);
    },
    { signal },
  );
  trigger.addEventListener('pointerleave', later, { signal });
  card.addEventListener('pointerenter', () => window.clearTimeout(leave), { signal });
  card.addEventListener('pointerleave', later, { signal });
  trigger.addEventListener('focus', () => trigger.matches(':focus-visible') && show(), { signal });
  trigger.addEventListener('blur', later, { signal });
  document.addEventListener('keydown', (event) => event.key === 'Escape' && hide(), { signal });
  return () => {
    controller.abort();
    window.clearTimeout(wait);
    window.clearTimeout(leave);
  };
}
