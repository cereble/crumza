import { calm, collapse, countTo, type Disposer, glide, reorder } from '../motion/index.ts';
import { closest, combine, emit, noop } from './dom.ts';

/**
 * A table in `.cz-table-scroll`: one wash glides over the row under the pointer. A `.cz-table-sort` button in a
 * header sorts by that column (as numbers when the header has `data-num`), and the rows slide to their new places.
 */
export function table(root: HTMLElement): Disposer {
  const plate = glide(root, { items: 'tbody tr', className: 'cz-glide-over' });
  const controller = new AbortController();
  root.addEventListener(
    'click',
    (event) => {
      const button = closest(event.target, '.cz-table-sort');
      const cell = button?.closest('th');
      const body = root.querySelector('tbody');
      if (!button || !cell || !body) return;
      const column = [...(cell.parentElement?.children ?? [])].indexOf(cell);
      const numeric = cell.hasAttribute('data-num');
      const direction = cell.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';
      for (const other of root.querySelectorAll('th[aria-sort]')) other.removeAttribute('aria-sort');
      cell.setAttribute('aria-sort', direction);
      const value = (row: HTMLTableRowElement): string => {
        const target = row.cells[column];
        return target?.dataset.value ?? target?.textContent?.trim() ?? '';
      };
      const number = (text: string): number => Number.parseFloat(text.replace(/[^\d.-]/g, '')) || 0;
      const rows = [...body.rows];
      const sorted = rows.slice().sort((a, b) => {
        const order = numeric ? number(value(a)) - number(value(b)) : value(a).localeCompare(value(b));
        return direction === 'ascending' ? order : -order;
      });
      void reorder(rows, () => body.append(...sorted));
    },
    { signal: controller.signal },
  );
  return combine([() => controller.abort(), plate.destroy]);
}

/** Keys drawn with `.cz-kbd[data-key]` press down on the page while that key is held for real. */
export function keys(root: Document | HTMLElement = document): Disposer {
  const name = (event: KeyboardEvent): string => (event.key.length === 1 ? event.key.toLowerCase() : event.key);
  const press = (key: string, down: boolean): void => {
    for (const element of root.querySelectorAll(`.cz-kbd[data-key="${CSS.escape(key)}"]`)) {
      element.toggleAttribute('data-pressed', down);
    }
  };
  const releaseAll = (): void => {
    for (const element of root.querySelectorAll('.cz-kbd[data-pressed]')) element.removeAttribute('data-pressed');
  };
  const controller = new AbortController();
  const { signal } = controller;
  window.addEventListener('keydown', (event) => press(name(event), true), { signal });
  window.addEventListener(
    'keyup',
    (event) => {
      press(name(event), false);
      // macOS sends no keyup for other keys while Meta is held.
      if (event.key === 'Meta') releaseAll();
    },
    { signal },
  );
  window.addEventListener('blur', releaseAll, { signal });
  return () => controller.abort();
}

/** An alert with a `.cz-alert-close` button folds away when dismissed, and fires `cz:dismiss` first. */
export function alert(root: HTMLElement): Disposer {
  const close = root.querySelector<HTMLButtonElement>('.cz-alert-close');
  if (!close) return noop;
  const controller = new AbortController();
  close.addEventListener(
    'click',
    async () => {
      emit(root, 'cz:dismiss', {});
      const gap = Number.parseFloat(getComputedStyle(root.parentElement ?? root).rowGap) || 0;
      if (!calm(root)) root.animate({ marginBottom: ['0px', `${-gap}px`] }, { duration: 220, fill: 'forwards' });
      await collapse(root);
      root.remove();
    },
    { signal: controller.signal },
  );
  return () => controller.abort();
}

/** A stat counts up to its `data-value` and draws its sparkline the first time it comes into view. */
export function stat(root: HTMLElement): Disposer {
  const value = root.querySelector<HTMLElement>('.cz-stat-value');
  const target = Number.parseFloat(value?.dataset.value ?? '');
  const prefix = value?.dataset.prefix ?? '';
  const suffix = value?.dataset.suffix ?? '';
  const places = Number.parseInt(value?.dataset.places ?? '0', 10);
  const format = (n: number): string =>
    `${prefix}${n.toLocaleString(undefined, { minimumFractionDigits: places, maximumFractionDigits: places })}${suffix}`;
  let stopCount: Disposer = noop;
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      root.dataset.shown = '';
      if (value && Number.isFinite(target)) stopCount = countTo(value, target, { from: 0, format });
    },
    { threshold: 0.5 },
  );
  observer.observe(root);
  return () => {
    observer.disconnect();
    stopCount();
  };
}

/**
 * A chat composer (`form.cz-composer` with a textarea and a submit button): the button wakes up once there is text,
 * Enter sends and Shift+Enter starts a new line. Sending fires `cz:send` with the text and clears the box.
 */
export function composer(form: HTMLFormElement): Disposer {
  const field = form.querySelector('textarea');
  const send = form.querySelector<HTMLButtonElement>('button[type="submit"], button:not([type])');
  if (!field) return noop;
  const sync = (): void => {
    if (send) send.disabled = field.value.trim() === '';
  };
  const controller = new AbortController();
  const { signal } = controller;
  field.addEventListener('input', sync, { signal });
  field.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      form.requestSubmit();
    },
    { signal },
  );
  form.addEventListener(
    'submit',
    (event) => {
      event.preventDefault();
      const text = field.value.trim();
      if (!text) return;
      emit(form, 'cz:send', { text });
      field.value = '';
      sync();
      field.focus();
    },
    { signal },
  );
  sync();
  return () => controller.abort();
}

/** A chat log (`.cz-chat`) follows new messages down, unless the reader has scrolled up to read. */
export function chatLog(root: HTMLElement): Disposer {
  let near = true;
  const controller = new AbortController();
  root.addEventListener(
    'scroll',
    () => {
      near = root.scrollHeight - root.scrollTop - root.clientHeight < 48;
    },
    { passive: true, signal: controller.signal },
  );
  const observer = new MutationObserver(() => {
    if (near) root.scrollTo({ top: root.scrollHeight, behavior: calm(root) ? 'auto' : 'smooth' });
  });
  observer.observe(root, { childList: true });
  return () => {
    controller.abort();
    observer.disconnect();
  };
}
