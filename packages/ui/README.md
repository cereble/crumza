# @crumza/ui

Crumza's components as CSS classes, with a motion module and behaviours that bring them to life. No borders and no
shadows: every layer is paper with a little more or less ink in it. Everything moves on real springs.

```js
import '@crumza/ui/crumza.css';
import { enhance } from '@crumza/ui/behaviors';

const undo = enhance(); // wires every component on the page; call undo() to remove it all
```

```css
:root {
  --cz-brand-primary: #245c46; /* every colour follows, live */
}
```

## Entry points

| Import                                               | What it is                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------- |
| `@crumza/ui/crumza.css`, `@crumza/ui/crumza.min.css` | Every component, in the `crumza` cascade layer, so app styles always win. |
| `@crumza/ui/behaviors`                               | `enhance()` and one function per component, each returning a disposer.    |
| `@crumza/ui/motion`                                  | The motion module the behaviours are built on, for your own components.   |
| `@crumza/ui/brand`                                   | The brand recipe in JavaScript: `defineBrand`, `brandStyle`, `brandCss`.  |

Nothing touches `window` or `document` until it is called, so everything is safe to import during server rendering.

## Brand

Set `--cz-brand-*` variables and the stylesheet computes every colour from them, live, in light and dark mode:

| Variable                                             | What it sets                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| `--cz-brand-primary`                                 | The brand colour. The greys take its hue. Default: Mochi's.       |
| `--cz-brand-secondary`, `--cz-brand-accent`          | More brand colours; without them, the greys and the primary.      |
| `--cz-brand-danger`, `-warning`, `-success`, `-info` | Status colours.                                                   |
| `--cz-brand-paper`, `--cz-brand-ink`                 | The brand's own page and text colours.                            |
| `--cz-brand-<any>-dark`                              | Any of the above for dark mode; without it, a light tone of each. |

They work on `:root`, on any element whose inline style sets one, and inside `[data-cz-theme]`. Out come twelve steps
per colour, `--cz-<colour>-1` to `--cz-<colour>-12`, and `--cz-on-<colour>` for labels on steps 9 and 10:

| Steps    | Use                                                                           |
| -------- | ----------------------------------------------------------------------------- |
| 1 and 2  | Pages. Neutral step 1 is the paper.                                           |
| 3 to 5   | Soft fills, from resting to hover to pressed.                                 |
| 6 and 7  | Quiet separations.                                                            |
| 8        | Outlines, 3:1 on steps 1 and 2.                                               |
| 9 and 10 | Solid fills and their hover. Step 9 is the brand colour wherever labels read. |
| 11       | Text, 4.5:1 on steps 1 to 5.                                                  |
| 12       | Strong text, 7:1 on steps 1 and 2. Neutral step 12 is the ink.                |

How: backgrounds mix the page with a tint of the colour, so they step away from the brand's own paper. Everything that
must be read is set by WCAG luminance in CSS relative colour syntax, so its contrast is exact, not estimated.

`@crumza/ui/brand` runs the same recipe in JavaScript. `defineBrand({ primary: '#2a78d6' })` returns every step as
hex, and warns where a guideline colour had to move (here, white labels read 4.42:1 on `#2a78d6`, so the fill is a
shade deeper). `brandStyle(input)` returns the variables for an inline style, and `brandCss(input)` returns them as a
rule.

## Attributes

| Attribute                                                                | Where                    | Effect                                                                               |
| ------------------------------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------ |
| `data-mode="light \| dark"`                                              | Any element              | The mode for that subtree. Without it, the system's.                                 |
| `data-cz-corners="rounded \| squircle \| sharp"`                         | Any element              | The corner style for that subtree.                                                   |
| `data-tone="primary \| neutral \| danger \| warning \| success \| info"` | Any element              | The colour of buttons, badges, checks, switches, sliders, progress and links inside. |
| `data-motion="reduce"`                                                   | Any element              | Reduced motion for that subtree, as the system setting does for the page.            |
| `dir="rtl"`                                                              | Any element              | Mirrors switches, sliders, fields, toasts and arrows.                                |
| `data-variant`, `data-size`                                              | Buttons, badges, avatars | `solid`, `soft`, `ghost`; `sm`, `lg`.                                                |
| `data-icon-motion="nudge \| turn \| tilt"`                               | Buttons                  | The icon's move on hover.                                                            |

Custom properties a page may set: `--cz-value` (0 to 1) on `.cz-progress`, and `--cz-index` to stagger items such as
the theme toggle's rays or an avatar group.

## Fields

A field is a `div` with a `<label for>`, so hints, errors and buttons never become part of the control's name:

```html
<div class="cz-field">
  <label class="cz-field-label" for="email">Email</label>
  <input class="cz-input" id="email" type="email" aria-describedby="email-hint">
  <span class="cz-field-hint" id="email-hint">We never share it.</span>
  <span class="cz-field-reveal"><span class="cz-field-error">Enter a full email address.</span></span>
</div>
```

`setInvalid(field, true)` sets `aria-invalid` on the control, adds the error to its description, opens the error and
shakes the control once. The look follows `aria-invalid`, so a server-rendered invalid field shows its error too.

## Behaviours

`enhance()` wires all of these; each can also be called on its own.

- Controls: `segmented`, `chip`, `slider`, `clearButton`, `numberField`, `codeInput`, `combobox`, plus
  `setInvalid`, `setCodeState`, `setButtonState` and `busyGuard`.
- Navigation: `tabs`, `accordion`, `nav`, `pagination`, `toolbar`.
- Overlays: `popover`, `menu`, `contextMenu`, `dialog`, `sheet`, `commandPalette`, `hoverCard`.
- Display: `table`, `alert`, `stat`, `keys`, `composer`, `chatLog`.
- Theme: `setMode`, `currentMode`, `setCorners`, `themeToggle`, and `themeScript`, an inline script for the document
  head that sets the remembered mode and corners before the first paint.

Events bubble from the component:

| Event         | Detail                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------- |
| `cz:select`   | Menus, the context menu, the command palette and the combobox: `{ item, value, label }`. |
| `cz:change`   | Tabs: `{ tab }`.                                                                         |
| `cz:press`    | Chips: `{ pressed }`.                                                                    |
| `cz:page`     | Pagination: `{ page }`.                                                                  |
| `cz:complete` | Code input: `{ value }`.                                                                 |
| `cz:send`     | Chat composer: `{ text }`.                                                               |
| `cz:dismiss`  | Alerts, before they fold away.                                                           |

## Motion

- `Spring`: keeps its velocity when its target changes mid-flight; all springs share one animation frame loop.
- `SPRING`: the named springs. The CSS tokens `--cz-snappy`, `--cz-smooth`, `--cz-lively` and `--cz-pop` are generated
  from them, so script and stylesheet move alike.
- `springEasing(config)`: a spring as a CSS `linear()` easing for the Web Animations API.
- `glide(host, options)`: one plate for hover and selection that stretches as it travels.
- `tooltips`, `toaster`, `openFrom` and `closeTo`, `expand` and `collapse`, `reorder`, `resize`, `roll`, `countTo`,
  `shake`, `spotlight`, `reveal`.
- `calm(element?)`: true under reduced motion. Every effect lands at once when it is.

Every effect returns a Promise that resolves when it has landed; every setup returns a disposer.

## Accessibility

- Focus is always visible without a ring: each control shows it the way it shows hover, and a plate deepens under a
  focused choice.
- Toasts are announced politely, or at once with `urgent`. Their timers pause while hovered or focused, and while a
  modal dialog is open they move into it so their actions stay usable.
- Tooltips can be hovered. Menus take focus when they open, from the keyboard or from assistive technology.
- Forced colours draws edges, rings and highlights. Reduced motion drops every distance and size change.
