# Crumza

A UI framework that turns a brand into a complete, accessible interface. Set one colour and every colour follows,
live, in light and dark mode, each kept readable. It is CSS first and works with any framework or none. No borders and
no shadows: layers separate by tone, overlays by tint or a dimmed page, and everything moves on real springs.

| Folder                       | What it is                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| [`packages/ui`](packages/ui) | `@crumza/ui`: the stylesheet, the brand recipe, the motion module and the behaviours.      |
| [`apps/docs`](apps/docs)     | The component documentation, and the browser tests that hold every component to the rules. |

## Quick start

```sh
pnpm add @crumza/ui
```

```html
<link rel="stylesheet" href="node_modules/@crumza/ui/dist/crumza.min.css">

<style>
  :root {
    --cz-brand-primary: #245c46;
  }
</style>

<button class="cz-button" data-variant="solid" type="button">Save changes</button>

<script type="module">
  import { enhance } from '@crumza/ui/behaviors';
  enhance();
</script>
```

The markup works on its own. `enhance()` adds the motion and the keyboard handling, and returns one function that
undoes it all.

## Your brand is a few variables

| Variable                                             | What it sets                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| `--cz-brand-primary`                                 | The brand colour. The greys take its hue.                         |
| `--cz-brand-secondary`, `--cz-brand-accent`          | More brand colours; without them, the greys and the primary.      |
| `--cz-brand-danger`, `-warning`, `-success`, `-info` | Status colours.                                                   |
| `--cz-brand-paper`, `--cz-brand-ink`                 | The brand's own page and text colours.                            |
| `--cz-brand-<any>-dark`                              | Any of the above for dark mode; without it, a light tone of each. |

The browser computes every scale from these, live: change a variable and the page follows. Set them on `:root` for
the whole page, or in the inline style of any element to brand just that part of it.

Every scale has twelve steps per mode (pages, soft fills, lines, outlines, solid fills and text), with promises: text
reads at 4.5:1 on every soft background, strong text at 7:1, outlines at 3:1, and labels at 4.5:1 on their fill. The
exact brand colour is kept wherever its labels can read on it. `@crumza/ui/brand` runs the same recipe in JavaScript,
for checking a guideline or for anything that is not a web page.

## The rules every component keeps

- No borders, no shadows, no focus rings. Focus shows the way hover does.
- Two type sizes, 14 and 12 px, with one 24 px display size for numbers that lead a page. Weights 400 and 500.
- Control heights of 28, 32 and 40 px. Side padding is 1.5 to 2 times the top.
- Corners are rounded, squircle or sharp: `data-cz-corners` on any element.
- Light and dark: `data-mode` on any element, or the system setting.
- Reduced motion keeps fades and drops all travel. Forced colours (Windows High Contrast) draws edges and focus rings.
  Right-to-left pages mirror.

The browser tests in `apps/docs/tests` check these rules on every element, in Chromium and WebKit.

## Browser support

Chrome and Edge 123, Safari 18 and Firefox 128 or later. Newer features are used where they exist and replaced where
they do not: squircle corners fall back to round ones, anchor positioning and invoker commands fall back to script,
and the customisable select falls back to the system list.

## Development

Node 22.18 or later and pnpm.

```sh
pnpm install
pnpm validate   # Biome, build, types, unit tests, then the browser tests
pnpm build      # packages/ui/dist and apps/docs/dist
```

Open `apps/docs/index.html` in a browser after a build.

## Status

`0.1.0-beta.0`. React components come next, built on these classes and behaviours.

MIT licensed.
