import { calm } from './env.ts';

export const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
export const EASE_IN = 'cubic-bezier(0.55, 0, 1, 0.45)';
export const EASE_IN_OUT = 'cubic-bezier(0.4, 0, 0.2, 1)';

const settle = (): void => {};

/** Runs a Web Animation unless motion is calm for the element. Always resolves, also when it is cancelled. */
export function animate(
  element: Element,
  keyframes: Keyframe[] | PropertyIndexedKeyframes,
  options: KeyframeAnimationOptions,
): Promise<void> {
  if (calm(element)) return Promise.resolve();
  return element.animate(keyframes, options).finished.then(settle, settle);
}

/** Cancels every animation on the element, so its own styles show again. */
export function cancelAnimations(element: Element): void {
  for (const animation of element.getAnimations()) animation.cancel();
}
