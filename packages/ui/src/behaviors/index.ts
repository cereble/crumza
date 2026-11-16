import { type Disposer, spotlight, tooltips } from '../motion/index.ts';
import { busyGuard, chip, clearButton, codeInput, combobox, numberField, segmented, slider } from './controls.ts';
import { alert, chatLog, composer, keys, stat, table } from './display.ts';
import { combine } from './dom.ts';
import { accordion, pagination, tabs, toolbar } from './navigation.ts';
import { commandPalette, contextMenu, dialog, hoverCard, menu, popover, sheet } from './overlays.ts';
import { themeToggle } from './theme.ts';

export {
  type ButtonState,
  busyGuard,
  chip,
  clearButton,
  codeInput,
  combobox,
  numberField,
  segmented,
  setButtonState,
  setCodeState,
  setInvalid,
  slider,
} from './controls.ts';
export { alert, chatLog, composer, keys, stat, table } from './display.ts';
export { combine, emit, labelOf } from './dom.ts';
export { accordion, nav, pagination, tabs, toolbar } from './navigation.ts';
export {
  commandPalette,
  contextMenu,
  dialog,
  hoverCard,
  menu,
  popover,
  type SelectDetail,
  sheet,
} from './overlays.ts';
export { type Corners, currentMode, type Mode, setCorners, setMode, themeScript, themeToggle } from './theme.ts';

const byId = (id: string | undefined): HTMLElement | null => (id ? document.getElementById(id) : null);

/**
 * Wires every Crumza component found under `root` to its behaviour and returns one function that undoes it all.
 * The markup works without it; this adds the motion and the keyboard.
 */
export function enhance(root: ParentNode = document): Disposer {
  const disposers: Disposer[] = [];
  const each = <T extends HTMLElement>(selector: string, attach: (element: T) => Disposer): void => {
    for (const element of root.querySelectorAll<T>(selector)) disposers.push(attach(element));
  };
  each('.cz-segmented', segmented);
  each('.cz-chip', chip);
  each('.cz-slider-wrap', slider);
  each<HTMLButtonElement>('.cz-input-clear', clearButton);
  each('.cz-number', numberField);
  each('.cz-code', codeInput);
  each('.cz-combobox', combobox);
  each('.cz-tabs-list', tabs);
  each('.cz-accordion', accordion);
  each('.cz-toolbar', toolbar);
  each('.cz-pagination', pagination);
  each('.cz-popover', popover);
  each('.cz-menu', menu);
  each<HTMLDialogElement>('dialog.cz-dialog', dialog);
  each<HTMLDialogElement>('dialog.cz-sheet', sheet);
  each<HTMLDialogElement>('dialog.cz-command', (element) => commandPalette(element));
  each('[data-tips]', (element) => tooltips(element).destroy);
  each('.cz-table-scroll', table);
  each('.cz-alert', alert);
  each('.cz-stat', stat);
  each<HTMLFormElement>('form.cz-composer', composer);
  each('.cz-chat', chatLog);
  each('.cz-theme-toggle', themeToggle);
  each('[data-cz-contextmenu]', (region) => {
    const target = byId(region.dataset.czContextmenu);
    return target ? contextMenu(region, target) : () => {};
  });
  each('[data-cz-hovercard]', (trigger) => {
    const card = byId(trigger.dataset.czHovercard);
    return card ? hoverCard(trigger, card) : () => {};
  });
  const page = root instanceof Document ? root : document;
  disposers.push(keys(page), busyGuard(page), spotlight('a.cz-card, button.cz-card'));
  return combine(disposers);
}
