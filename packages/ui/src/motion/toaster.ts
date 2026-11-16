export interface ToasterOptions {
  /** Toasts drawn in the tucked stack; older ones fade out behind. */
  readonly visible?: number;
  /** Time on screen in milliseconds. */
  readonly duration?: number;
  /** Space between toasts when the stack fans out. */
  readonly gap?: number;
}

export interface ToastOptions {
  /** Label of a single action button. */
  readonly action?: string;
  readonly onAction?: () => void;
  /** Overrides the toaster's duration for this toast. */
  readonly duration?: number;
  /** Read out at once, interrupting the screen reader, for errors that need attention. */
  readonly urgent?: boolean;
}

export interface Toast {
  readonly element: HTMLLIElement;
  dismiss(): void;
}

export interface Toaster {
  add(message: string, options?: ToastOptions): Toast;
  destroy(): void;
}

interface Entry {
  readonly element: HTMLLIElement;
  remaining: number;
  started: number;
  timer: number;
}

/** The modal dialog on top, if any: everything outside it is inert, so toasts must live inside it. */
const topModal = (): HTMLDialogElement | undefined =>
  [...document.querySelectorAll('dialog')].filter((dialog) => dialog.matches(':modal')).at(-1);

/**
 * A toast stack in `list` (an `ol`): new toasts rise from below, older ones tuck behind with a sliver showing,
 * the stack fans out while hovered or focused, and a toast swipes away toward the inline end. Timers pause while
 * the stack is open or the page is hidden. Toasts are announced politely, or at once when `urgent`. While a modal
 * dialog is open the stack moves into it, so its actions stay usable.
 */
export function toaster(list: HTMLElement, options: ToasterOptions = {}): Toaster {
  const { visible = 3, duration = 4000, gap = 8 } = options;
  const entries: Entry[] = [];
  let hovered = false;
  let focused = false;
  const open = (): boolean => hovered || focused;
  if (!list.hasAttribute('aria-live')) list.setAttribute('aria-live', 'polite');
  if (!list.hasAttribute('aria-label')) list.setAttribute('aria-label', 'Notifications');

  const layout = (): void => {
    // Read every height first, then write, so the stack costs one layout.
    const heights = entries.map((entry) => entry.element.scrollHeight);
    const front = heights[0] ?? 0;
    const fanned = open();
    let offset = 0;
    entries.forEach((entry, i) => {
      const { style } = entry.element;
      const height = heights[i] ?? 0;
      style.zIndex = String(entries.length - i);
      style.setProperty('--_cz-o', i < visible ? '1' : '0');
      if (fanned) {
        style.setProperty('--_cz-y', `${-offset}px`);
        style.setProperty('--_cz-s', '1');
        style.setProperty('--_cz-h', `${height}px`);
        offset += height + gap;
      } else {
        style.setProperty('--_cz-y', `${-i * 10}px`);
        style.setProperty('--_cz-s', String(1 - i * 0.05));
        style.setProperty('--_cz-h', `${i === 0 ? height : front}px`);
      }
      entry.element.toggleAttribute('data-behind', !fanned && i > 0);
    });
    const tucked = front + Math.min(entries.length - 1, visible - 1) * 10;
    list.style.height = `${fanned ? Math.max(0, offset - gap) : Math.max(0, tucked)}px`;
  };

  const start = (entry: Entry): void => {
    window.clearTimeout(entry.timer);
    if (open() || document.hidden) return;
    entry.started = performance.now();
    entry.timer = window.setTimeout(() => dismiss(entry), entry.remaining);
  };
  const pause = (entry: Entry): void => {
    window.clearTimeout(entry.timer);
    entry.remaining = Math.max(800, entry.remaining - (performance.now() - entry.started));
  };
  const dismiss = (entry: Entry, swiped = false): void => {
    const index = entries.indexOf(entry);
    if (index < 0) return;
    entries.splice(index, 1);
    window.clearTimeout(entry.timer);
    entry.element.dataset.leaving = swiped ? 'swipe' : '';
    window.setTimeout(() => entry.element.remove(), 320);
    layout();
  };
  const fan = (): void => {
    const was = list.hasAttribute('data-open');
    list.toggleAttribute('data-open', open());
    if (was === open()) return;
    for (const entry of entries) {
      if (open()) pause(entry);
      else start(entry);
    }
    layout();
  };

  // While a modal dialog is open, the stack lives inside it and goes home when the dialog closes.
  const home = { parent: list.parentNode, next: list.nextSibling };
  let host: HTMLDialogElement | null = null;
  const goHome = (): void => {
    host = null;
    if (home.parent && list.parentNode !== home.parent) home.parent.insertBefore(list, home.next);
  };
  const follow = (): void => {
    const modal = topModal() ?? null;
    if (modal === host) return;
    host?.removeEventListener('close', goHome);
    if (!modal) {
      goHome();
      return;
    }
    host = modal;
    modal.append(list);
    modal.addEventListener('close', goHome, { once: true });
  };

  const controller = new AbortController();
  const { signal } = controller;

  const swipe = (entry: Entry): void => {
    const { element } = entry;
    // Positive distance points toward dismissal: right, or left on a right-to-left page.
    let sign = 1;
    let startX = 0;
    let lastX = 0;
    let lastTime = 0;
    let velocity = 0;
    let dragging = false;
    element.addEventListener(
      'pointerdown',
      (event) => {
        if (event.target instanceof Element && event.target.closest('button')) return;
        dragging = true;
        sign = getComputedStyle(element).direction === 'rtl' ? -1 : 1;
        startX = lastX = event.clientX;
        lastTime = performance.now();
        velocity = 0;
        element.setPointerCapture(event.pointerId);
        element.dataset.dragging = '';
      },
      { signal },
    );
    element.addEventListener(
      'pointermove',
      (event) => {
        if (!dragging) return;
        const now = performance.now();
        velocity = ((event.clientX - lastX) * sign) / Math.max(1, now - lastTime);
        lastX = event.clientX;
        lastTime = now;
        const distance = (event.clientX - startX) * sign;
        // The wrong way the toast resists, so a mistaken drag feels heavy.
        element.style.setProperty('--_cz-dx', `${(distance > 0 ? distance : distance * 0.2) * sign}px`);
      },
      { signal },
    );
    const release = (): void => {
      if (!dragging) return;
      dragging = false;
      delete element.dataset.dragging;
      if ((lastX - startX) * sign > element.offsetWidth * 0.4 || velocity > 0.5) {
        element.style.setProperty('--_cz-dx', `${(element.offsetWidth + 40) * sign}px`);
        dismiss(entry, true);
      } else {
        element.style.setProperty('--_cz-dx', '0px');
      }
    };
    element.addEventListener('pointerup', release, { signal });
    element.addEventListener('pointercancel', release, { signal });
  };

  const add = (message: string, toastOptions: ToastOptions = {}): Toast => {
    follow();
    const element = document.createElement('li');
    element.className = 'cz-toast';
    if (toastOptions.urgent) element.setAttribute('role', 'alert');
    const text = document.createElement('span');
    text.className = 'cz-toast-text';
    text.textContent = message;
    element.append(text);
    const entry: Entry = { element, remaining: toastOptions.duration ?? duration, started: 0, timer: 0 };
    if (toastOptions.action) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cz-toast-action';
      button.textContent = toastOptions.action;
      button.addEventListener(
        'click',
        () => {
          toastOptions.onAction?.();
          dismiss(entry);
        },
        { signal },
      );
      element.append(button);
    }
    swipe(entry);
    entries.unshift(entry);
    list.append(element);
    layout();
    start(entry);
    for (const extra of entries.slice(visible + 2)) dismiss(extra);
    return { element, dismiss: () => dismiss(entry) };
  };

  list.addEventListener(
    'pointerenter',
    () => {
      hovered = true;
      fan();
    },
    { signal },
  );
  list.addEventListener(
    'pointerleave',
    () => {
      hovered = false;
      fan();
    },
    { signal },
  );
  // A keyboard user who reaches a toast gets all the time they need, as a pointer user does on hover.
  list.addEventListener(
    'focusin',
    () => {
      focused = true;
      fan();
    },
    { signal },
  );
  list.addEventListener(
    'focusout',
    (event) => {
      if (event.relatedTarget instanceof Node && list.contains(event.relatedTarget)) return;
      focused = false;
      fan();
    },
    { signal },
  );
  document.addEventListener(
    'visibilitychange',
    () => {
      for (const entry of entries) {
        if (document.hidden) pause(entry);
        else start(entry);
      }
    },
    { signal },
  );

  return {
    add,
    destroy: () => {
      controller.abort();
      host?.removeEventListener('close', goHome);
      goHome();
      for (const entry of entries.splice(0)) {
        window.clearTimeout(entry.timer);
        entry.element.remove();
      }
      list.style.removeProperty('height');
    },
  };
}
