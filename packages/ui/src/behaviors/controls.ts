import { calm, type Disposer, glide, roll, shake, uniqueId } from '../motion/index.ts';
import { anchor, closest, combine, emit, labelOf, noop, placeBelow } from './dom.ts';

/** A segmented control: one plate glides to the checked option. */
export function segmented(root: HTMLElement): Disposer {
  const plate = glide(root, {
    items: 'label',
    selected: () => root.querySelector('input:checked')?.closest('label'),
  });
  const controller = new AbortController();
  root.addEventListener('change', () => plate.select(), { signal: controller.signal });
  return combine([() => controller.abort(), plate.destroy]);
}

/** A chip toggles itself; its fill grows from where it was pressed. Follow it with `cz:press`. */
export function chip(root: HTMLElement): Disposer {
  const controller = new AbortController();
  const { signal } = controller;
  root.addEventListener(
    'pointerdown',
    (event) => {
      const rect = root.getBoundingClientRect();
      root.style.setProperty('--cz-cx', `${event.clientX - rect.left}px`);
      root.style.setProperty('--cz-cy', `${event.clientY - rect.top}px`);
    },
    { signal },
  );
  root.addEventListener(
    'click',
    (event) => {
      // A key press grows the fill from the centre.
      if (event.detail === 0) {
        root.style.removeProperty('--cz-cx');
        root.style.removeProperty('--cz-cy');
      }
      const pressed = root.getAttribute('aria-pressed') !== 'true';
      root.setAttribute('aria-pressed', String(pressed));
      emit(root, 'cz:press', { pressed });
    },
    { signal },
  );
  return () => controller.abort();
}

/**
 * A slider fills up to its thumb (through `--cz-value`, 0 to 1), and a value bubble rises while it is dragged or
 * moved with keys. The input already speaks its value, so the bubble is hidden from screen readers.
 */
export function slider(wrap: HTMLElement): Disposer {
  const input = wrap.querySelector<HTMLInputElement>('input[type="range"]');
  if (!input) return noop;
  const bubble = wrap.querySelector<HTMLElement>('.cz-slider-bubble');
  bubble?.setAttribute('aria-hidden', 'true');
  const set = (): void => {
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    wrap.style.setProperty('--cz-value', String((Number(input.value) - min) / (max - min || 1)));
    if (bubble) bubble.textContent = input.value;
  };
  let off = 0;
  const on = (): void => {
    window.clearTimeout(off);
    wrap.dataset.active = '';
  };
  const later = (): void => {
    window.clearTimeout(off);
    off = window.setTimeout(() => delete wrap.dataset.active, 600);
  };
  const controller = new AbortController();
  const { signal } = controller;
  input.addEventListener('input', set, { signal });
  input.addEventListener('pointerdown', on, { signal });
  input.addEventListener('pointerup', later, { signal });
  input.addEventListener('blur', later, { signal });
  input.addEventListener(
    'keydown',
    () => {
      on();
      later();
    },
    { signal },
  );
  set();
  return () => {
    controller.abort();
    window.clearTimeout(off);
  };
}

/**
 * A clear button empties the field it sits in and puts focus back. It shows only while the field has text: the
 * group carries `data-empty` otherwise.
 */
export function clearButton(button: HTMLButtonElement): Disposer {
  const group = button.parentElement;
  const input = group?.querySelector<HTMLInputElement>('.cz-input');
  if (!group || !input) return noop;
  const sync = (): void => {
    group.toggleAttribute('data-empty', input.value === '');
  };
  const controller = new AbortController();
  const { signal } = controller;
  input.addEventListener('input', sync, { signal });
  input.form?.addEventListener('reset', () => queueMicrotask(sync), { signal });
  button.addEventListener(
    'click',
    () => {
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    },
    { signal },
  );
  sync();
  return () => {
    controller.abort();
    group.removeAttribute('data-empty');
  };
}

/**
 * Marks a field's control invalid or valid with `aria-invalid`, which is what the field's look follows. Invalid
 * opens the error, adds it to the control's description, tints the control and shakes it once.
 */
export function setInvalid(field: HTMLElement, invalid: boolean, options: { readonly shake?: boolean } = {}): void {
  const control = field.querySelector<HTMLElement>('input, textarea, select');
  if (!control) return;
  control.setAttribute('aria-invalid', String(invalid));
  const error = field.querySelector<HTMLElement>('.cz-field-error');
  if (error) {
    error.id ||= uniqueId('cz-error');
    const ids = (control.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((id) => id && id !== error.id);
    if (invalid) ids.push(error.id);
    if (ids.length > 0) control.setAttribute('aria-describedby', ids.join(' '));
    else control.removeAttribute('aria-describedby');
  }
  if (invalid && options.shake !== false) void shake(control);
}

export type ButtonState = 'busy' | 'done' | null;

/**
 * Shows a button's progress. Busy swaps the label for a spinner and ignores presses, from the keyboard too; done
 * draws a check; null goes back to the label.
 */
export function setButtonState(button: HTMLElement, state: ButtonState): void {
  if (state) button.dataset.state = state;
  else delete button.dataset.state;
  button.toggleAttribute('aria-busy', state === 'busy');
  if (state === 'busy') button.setAttribute('aria-disabled', 'true');
  else button.removeAttribute('aria-disabled');
}

/** Swallows presses on busy buttons, once for the whole page. */
export function busyGuard(root: Document | HTMLElement = document): Disposer {
  const controller = new AbortController();
  root.addEventListener(
    'click',
    (event) => {
      if (!closest(event.target, '.cz-button[data-state="busy"]')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    { capture: true, signal: controller.signal },
  );
  return () => controller.abort();
}

const decimals = (step: number): number => (String(step).split('.')[1] ?? '').length;

/**
 * A number field: steppers repeat while held, faster the longer they are held; arrow keys step and Shift steps by
 * ten. The visible value rolls to the next number; at a limit the field shakes and that stepper rests.
 */
export function numberField(root: HTMLElement): Disposer {
  const input = root.querySelector<HTMLInputElement>('input');
  if (!input) return noop;
  const down = root.querySelector<HTMLButtonElement>('[data-step="down"]');
  const up = root.querySelector<HTMLButtonElement>('[data-step="up"]');
  const number = (value: string, fallback: number): number => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const min = number(input.min, Number.NEGATIVE_INFINITY);
  const max = number(input.max, Number.POSITIVE_INFINITY);
  const step = number(input.step, 1);
  const places = decimals(step);
  const read = (): number => number(input.value, 0);
  const clamp = (value: number): number => Math.min(max, Math.max(min, value));
  const format = (value: number): string => value.toFixed(places);
  const sync = (): void => {
    const value = read();
    if (down) down.disabled = value <= min;
    if (up) up.disabled = value >= max;
  };

  let shown: HTMLElement | null = null;
  let settle = 0;
  const show = (text: string): void => {
    if (calm(root)) {
      input.value = text;
      return;
    }
    if (!shown) {
      shown = document.createElement('span');
      shown.className = 'cz-number-roll';
      shown.setAttribute('aria-hidden', 'true');
      shown.textContent = input.value;
      root.append(shown);
    }
    root.dataset.rolling = '';
    roll(shown, text);
    input.value = text;
    window.clearTimeout(settle);
    settle = window.setTimeout(() => {
      delete root.dataset.rolling;
      shown?.remove();
      shown = null;
    }, 420);
  };
  const nudge = (direction: 1 | -1, times = 1): boolean => {
    const current = read();
    const next = clamp(Number((current + direction * step * times).toFixed(places)));
    if (next === current) {
      void shake(root);
      return false;
    }
    show(format(next));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    sync();
    return true;
  };

  let repeat = 0;
  const stop = (): void => window.clearTimeout(repeat);
  const hold = (direction: 1 | -1, wait: number): void => {
    repeat = window.setTimeout(() => {
      if (nudge(direction)) hold(direction, Math.max(35, wait * 0.8));
    }, wait);
  };
  const controller = new AbortController();
  const { signal } = controller;
  for (const [button, direction] of [
    [down, -1],
    [up, 1],
  ] as const) {
    if (!button) continue;
    button.addEventListener(
      'pointerdown',
      (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        nudge(direction);
        hold(direction, 400);
      },
      { signal },
    );
    for (const type of ['pointerup', 'pointerleave', 'pointercancel'] as const) {
      button.addEventListener(type, stop, { signal });
    }
    button.addEventListener('click', (event) => event.detail === 0 && nudge(direction), { signal });
  }
  input.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      nudge(event.key === 'ArrowUp' ? 1 : -1, event.shiftKey ? 10 : 1);
    },
    { signal },
  );
  input.addEventListener('input', sync, { signal });
  input.addEventListener(
    'blur',
    () => {
      input.value = format(clamp(read()));
      sync();
    },
    { signal },
  );
  sync();
  return () => {
    controller.abort();
    stop();
    window.clearTimeout(settle);
  };
}

/**
 * A code input: one real input under a row of cells, so paste and one-time-code autofill work. Each character pops
 * into its cell; a full code fires `cz:complete`. Show the result with `setCodeState`.
 */
export function codeInput(root: HTMLElement): Disposer {
  const input = root.querySelector<HTMLInputElement>('input');
  const cells = [...root.querySelectorAll<HTMLElement>('.cz-code-cell')];
  if (!input || cells.length === 0) return noop;
  for (const [i, cell] of cells.entries()) cell.style.setProperty('--cz-index', String(i));
  input.maxLength = cells.length;
  const digits = input.inputMode === 'numeric';
  let shown = '';
  const render = (): void => {
    const value = (digits ? input.value.replace(/\D/g, '') : input.value.replace(/\s/g, '')).slice(0, cells.length);
    if (value !== input.value) input.value = value;
    cells.forEach((cell, i) => {
      const char = value[i] ?? '';
      if ((shown[i] ?? '') !== char) {
        const glyph = document.createElement('span');
        glyph.textContent = char;
        cell.replaceChildren(...(char ? [glyph] : []));
      }
      cell.toggleAttribute('data-active', i === value.length);
    });
    shown = value;
    if (root.dataset.state === 'error' && value.length < cells.length) delete root.dataset.state;
    if (value.length === cells.length) emit(root, 'cz:complete', { value });
  };
  const toEnd = (): void => input.setSelectionRange(input.value.length, input.value.length);
  const controller = new AbortController();
  const { signal } = controller;
  input.addEventListener('input', render, { signal });
  input.addEventListener('pointerup', toEnd, { signal });
  input.addEventListener(
    'focus',
    () => {
      root.dataset.focus = '';
      toEnd();
    },
    { signal },
  );
  input.addEventListener('blur', () => delete root.dataset.focus, { signal });
  render();
  return () => controller.abort();
}

/** Shows a code input's result: done turns it green; error shakes it, then clears it for another try. */
export function setCodeState(root: HTMLElement, state: 'done' | 'error' | null): void {
  if (state) root.dataset.state = state;
  else delete root.dataset.state;
  if (state !== 'error') return;
  void shake(root).then(() => {
    window.setTimeout(() => {
      const input = root.querySelector<HTMLInputElement>('input');
      if (!input || root.dataset.state !== 'error') return;
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, 500);
  });
}

/**
 * A combobox: `input[role=combobox]` with `aria-controls` naming a `popover` listbox of `[role=option]` items.
 * Typing filters the options and inks the matched part; arrow keys and the pointer move one plate; Enter or a click
 * chooses and fires `cz:select` with the option as `item`, its value and its label.
 */
export function combobox(root: HTMLElement): Disposer {
  const input = root.querySelector<HTMLInputElement>('input[role="combobox"]');
  const list = input ? document.getElementById(input.getAttribute('aria-controls') ?? '') : null;
  if (!input || !list) return noop;
  const toggle = root.querySelector<HTMLButtonElement>('.cz-combobox-toggle');
  const options = [...list.querySelectorAll<HTMLElement>('[role="option"]')];
  const empty = list.querySelector<HTMLElement>('.cz-option-empty');
  const textOf = (option: HTMLElement): HTMLElement => option.querySelector('.cz-option-label') ?? option;
  const labels = new Map(options.map((option) => [option, labelOf(textOf(option))]));
  for (const option of options) option.id ||= uniqueId('cz-option');
  anchor(input, list);
  const plate = glide(list, { items: '[role="option"]:not([hidden])' });

  let active: HTMLElement | null = null;
  const visible = (): HTMLElement[] => options.filter((option) => !option.hidden);
  const activate = (option: HTMLElement | null, scroll = true): void => {
    active = option;
    if (!option) {
      input.removeAttribute('aria-activedescendant');
      plate.hide();
      return;
    }
    input.setAttribute('aria-activedescendant', option.id);
    plate.moveTo(option);
    if (scroll) option.scrollIntoView({ block: 'nearest' });
  };
  const isOpen = (): boolean => list.matches(':popover-open');
  const open = (): void => {
    if (isOpen()) return;
    list.style.setProperty('min-width', `${input.offsetWidth}px`);
    list.showPopover();
    placeBelow(input, list);
    root.dataset.open = '';
    input.setAttribute('aria-expanded', 'true');
  };
  const close = (): void => {
    if (!isOpen()) return;
    list.hidePopover();
    delete root.dataset.open;
    input.setAttribute('aria-expanded', 'false');
    activate(null);
  };
  const filter = (): void => {
    const query = input.value.trim().toLowerCase();
    for (const option of options) {
      const label = labels.get(option) ?? '';
      const at = query ? label.toLowerCase().indexOf(query) : -1;
      option.hidden = query !== '' && at < 0;
      const text = textOf(option);
      if (at < 0) {
        text.textContent = label;
        continue;
      }
      const mark = document.createElement('mark');
      mark.textContent = label.slice(at, at + query.length);
      text.replaceChildren(label.slice(0, at), mark, label.slice(at + query.length));
    }
    const shown = visible();
    if (empty) empty.hidden = shown.length > 0;
    activate(shown[0] ?? null, false);
  };
  const choose = (option: HTMLElement): void => {
    for (const other of options) other.setAttribute('aria-selected', String(other === option));
    input.value = labels.get(option) ?? '';
    close();
    filter();
    const label = labels.get(option) ?? '';
    emit(root, 'cz:select', { item: option, value: option.dataset.value ?? label, label });
  };
  const move = (by: 1 | -1): void => {
    const shown = visible();
    if (shown.length === 0) return;
    const index = active ? shown.indexOf(active) : -1;
    const next = index < 0 ? (by > 0 ? 0 : shown.length - 1) : (index + by + shown.length) % shown.length;
    activate(shown[next] ?? null);
  };

  const controller = new AbortController();
  const { signal } = controller;
  input.addEventListener(
    'input',
    () => {
      open();
      filter();
    },
    { signal },
  );
  input.addEventListener(
    'keydown',
    (event) => {
      switch (event.key) {
        case 'ArrowDown':
        case 'ArrowUp':
          event.preventDefault();
          if (!isOpen()) {
            open();
            filter();
          } else move(event.key === 'ArrowDown' ? 1 : -1);
          break;
        case 'Enter':
          if (isOpen() && active) {
            event.preventDefault();
            choose(active);
          }
          break;
        case 'Escape':
          if (isOpen()) {
            event.preventDefault();
            close();
          } else if (input.value) {
            input.value = '';
            filter();
          }
          break;
        case 'Tab':
          close();
          break;
      }
    },
    { signal },
  );
  input.addEventListener('blur', close, { signal });
  list.addEventListener('pointerdown', (event) => event.preventDefault(), { signal });
  list.addEventListener(
    'pointermove',
    (event) => {
      const option = closest(event.target, '[role="option"]');
      if (option && option !== active) activate(option, false);
    },
    { signal },
  );
  list.addEventListener(
    'click',
    (event) => {
      const option = closest(event.target, '[role="option"]');
      if (option) choose(option);
    },
    { signal },
  );
  toggle?.addEventListener('pointerdown', (event) => event.preventDefault(), { signal });
  toggle?.addEventListener(
    'click',
    () => {
      if (isOpen()) {
        close();
        return;
      }
      input.focus();
      open();
      filter();
    },
    { signal },
  );
  return combine([() => controller.abort(), plate.destroy]);
}
