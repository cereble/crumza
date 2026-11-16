# Working on Crumza

- Layout: `packages/ui` (`@crumza/ui`: stylesheet, `brand`, `motion` and `behaviors`) and `apps/docs` (component
  documentation and the browser tests). pnpm workspace, TypeScript run directly by Node 22.18 or later.
- Brand: `--cz-brand-*` variables in, every colour scale out, computed live by the browser. The recipe is written once
  in `packages/ui/src/brand/recipe.ts` and runs twice: as CSS (`css.ts`, generated into `styles/brand.css`) and as
  numbers (`brand.ts`, `defineBrand`). The browser tests check the two agree.
- Base look (IP, 2026-11-13): Mochi, with no borders and no shadows. Layers separate by tone, overlays by tint,
  inversion or a dimmed page; focus shows the way hover does, never as a ring. Corners are rounded, squircle or sharp.
  Glass may return later as an optional style.
- Type: 14 and 12 px, one 24 px display size for leading numbers only. Weights 400 and 500. Sentence case, no
  capitals, no letter spacing. Controls 28, 32 and 40 px; side padding 1.5 to 2 times the top.
- Motion: real springs from `SPRING` in `packages/ui/src/motion/spring.ts`; the CSS spring tokens are generated from
  it. Distances and size changes are multiplied by `--cz-travel`, so reduced motion drops them. Keyboard changes land
  at once.
- Use logical properties (`inset-inline-*`, `padding-inline-*`, `text-align: start`) and `--cz-dir` for movement
  with a side, so right-to-left pages mirror. Component colours read `--cz-tone-*` so `data-tone` reaches them.
- Generated files, never edited by hand: `packages/ui/src/styles/brand.css` (from the brand recipe) and
  `springs.css` (from `SPRING`).
- Prefer native elements and CSS. No headless runtime dependency without explicit approval.
- Run `pnpm validate` before delivery: Biome, build, types, unit tests, then the browser tests in Chromium and
  WebKit. The browser tests fail on any border, shadow, focus ring, off-scale type, weak contrast or invisible focus.
- Tests: only ones that pin down core behaviour; none for copy or layout trivia.
- Do not commit, push or publish without explicit approval. Never copy reference repositories, credentials or private plans into this public repository.
- Examples and installation instructions must match real exports. Use `Crumza` and `@crumza/ui` exactly. No em
  dashes in code or documentation.
