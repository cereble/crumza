import { animate, cancelAnimations, EASE_IN, EASE_OUT } from './animate.ts';
import { calm } from './env.ts';
import { SPRING, springEasing } from './spring.ts';

/** The transform that puts `dialog` over `trigger`, shrunk to the trigger's width. */
function towards(dialog: Element, trigger: Element): string {
  const end = dialog.getBoundingClientRect();
  const start = trigger.getBoundingClientRect();
  const scale = Math.max(0.25, Math.min(1, start.width / end.width));
  const dx = start.left + start.width / 2 - (end.left + end.width / 2);
  const dy = start.top + start.height / 2 - (end.top + end.height / 2);
  return `translate(${dx}px, ${dy}px) scale(${scale})`;
}

/**
 * Opens a modal dialog that grows out of `trigger` over a dimming page. Children marked `data-stagger` settle in
 * one after another. Resolves when the dialog has landed.
 */
export async function openFrom(dialog: HTMLDialogElement, trigger?: Element | null): Promise<void> {
  if (dialog.open) return;
  cancelAnimations(dialog);
  dialog.showModal();
  if (calm(dialog) || !trigger) return;
  const growing = animate(
    dialog,
    [
      { transform: towards(dialog, trigger), filter: 'blur(6px)' },
      { transform: 'none', filter: 'blur(0)' },
    ],
    springEasing(SPRING.smooth),
  );
  dialog.animate({ opacity: [0, 1] }, { duration: 180, easing: EASE_OUT });
  dialog.animate({ opacity: [0, 1] }, { duration: 260, easing: EASE_OUT, pseudoElement: '::backdrop' });
  dialog.querySelectorAll('[data-stagger]').forEach((child, i) => {
    child.animate(
      { opacity: [0, 1], translate: ['0 6px', '0 0'] },
      { duration: 320, delay: 70 + i * 40, easing: EASE_OUT, fill: 'backwards' },
    );
  });
  await growing;
}

const closing = new WeakMap<HTMLDialogElement, Promise<void>>();

/** Shrinks a dialog back into `trigger`, then closes it with `returnValue`. A second call waits for the first. */
export function closeTo(dialog: HTMLDialogElement, trigger?: Element | null, returnValue?: string): Promise<void> {
  const pending = closing.get(dialog);
  if (pending) return pending;
  if (!dialog.open) return Promise.resolve();
  if (calm(dialog) || !trigger) {
    dialog.close(returnValue);
    return Promise.resolve();
  }
  const transform = towards(dialog, trigger);
  dialog.animate({ opacity: [1, 1, 0] }, { duration: 170, easing: EASE_IN, fill: 'forwards' });
  dialog.animate(
    { opacity: [1, 0] },
    { duration: 200, easing: EASE_IN, fill: 'forwards', pseudoElement: '::backdrop' },
  );
  const done = animate(
    dialog,
    { transform: ['none', transform], filter: ['blur(0)', 'blur(4px)'] },
    { duration: 180, easing: EASE_IN, fill: 'forwards' },
  ).then(() => {
    dialog.close(returnValue);
    for (const animation of dialog.getAnimations({ subtree: true })) animation.cancel();
    closing.delete(dialog);
  });
  closing.set(dialog, done);
  return done;
}
