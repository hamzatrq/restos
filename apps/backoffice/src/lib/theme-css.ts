/**
 * `18 §7` — *"Design tokens come from `packages/ui`'s tokens export — web consumes tokens, not RN
 * components."* This is the one place that consumption happens.
 *
 * The doc-27 manifest is JSON read by a TypeScript module; Tailwind is CSS. Copying the hexes into
 * `globals.css` would satisfy the letter of the rule and break its point on the first repaint —
 * `plans/wave-1/palette-repaint.md` exists because that palette moves. So the CSS custom properties
 * are GENERATED from the manifest at render, emitted once in the root layout, and `globals.css`
 * only ever refers to them by name. A token that changes value changes this app with no edit here.
 *
 * Both polarities ship, because `packages/ui` gates every `27-F21` pairing in both and the back
 * office is a desk surface where the operator's own OS preference should win. `27-F19`'s
 * light-by-default law is about the COUNTER; this is not one.
 */

import { colorDark, color as colorLight, tokens, typography } from "@restos/ui/tokens";

const block = (palette: Record<string, string>): string =>
  Object.entries(palette)
    .map(([name, value]) => `--rx-${name}:${value};`)
    .join("");

/**
 * `27-F26` — the typeface, taken from the manifest rather than left to the browser's default.
 *
 * This app consumed the COLOUR half of the tokens export and silently skipped the type half, so
 * `27-F26` ("IBM Plex Sans, chosen on fail-safe defaults — tabular digits and distinct `I`/`l`
 * with no feature flags; Roboto BANNED for numerals") was declared in the manifest, re-derived by
 * `packages/ui`'s `tokens.test.ts` on every commit, and true of no pixel on this screen. `18 §7`
 * says web consumes the tokens export; consuming a third of it is how a design language becomes
 * a document nobody renders.
 *
 * `$family` is the manifest's own family handle, deliberately separate from the composite
 * `text-*` styles — reading it is not the `27-F42` decomposition that rule forbids, which is
 * about assembling a size/line-height pairing the system never designed.
 *
 * **No webfont is bundled and none is fetched.** The token's own fallback chain ends at
 * `system-ui`, so a machine without IBM Plex Sans installed renders the system face — which is
 * what this app did before, now stated by the token instead of by omission. Shipping a webfont
 * is a dependency and a build-time download for an internal tool, which `24-F23` does not buy.
 */
const family = tokens.typography.$family;

/**
 * `27-F42` — **the type SCALE, and it is the half of the manifest this app was still not
 * rendering.**
 *
 * The colour half arrived first and `$family` second; the four composite styles stayed a JSON
 * file. So every size on these screens came from Tailwind's own scale — `text-sm`, `text-xs`,
 * `text-base` — which is a *different* system's decomposed primitives, i.e. exactly the
 * "consumers assemble pairings the system never designed" that `27-F42` names. The screens then
 * used roughly one of them, which is what `plans/wave-1/design-direction.md` calls the biggest
 * unused lever.
 *
 * Each style is emitted as its four parts under one name so `globals.css` can bind them to a
 * single Tailwind font-size utility. **The four are never spendable apart** — there is no
 * `--rx-text-*-size` consumer anywhere that does not also take the other three, which is what
 * keeps this a composite token rather than four primitives with a shared prefix.
 *
 * ⚠ **The set is FOUR and a dense back office needs six.** There is no display style for a
 * wordmark and no caption style below `text-label`'s 14 px, so the sign-in headline and every
 * metadata line here still come from Tailwind's scale. That is a `packages/ui` gap, recorded in
 * `apps/backoffice/CLAUDE.md`, not something to paper over with a fifth local size.
 */
const typeBlock = (): string =>
  Object.entries(typography)
    .map(
      ([name, style]) =>
        `--rx-${name}-size:${style.fontSize}px;` +
        `--rx-${name}-line:${style.lineHeight}px;` +
        `--rx-${name}-weight:${style.fontWeight};` +
        `--rx-${name}-tracking:${style.letterSpacing};`,
    )
    .join("");

/**
 * `:root` carries the light palette; the dark one is applied under the viewer's OS preference and
 * under an explicit `.dark` class, so a future in-app toggle needs no change here.
 *
 * The type scale is polarity-independent and is emitted once.
 */
export const themeCss = (): string =>
  `:root{${block(colorLight)}--rx-fontFamily-default:${family};${typeBlock()}}` +
  `@media (prefers-color-scheme: dark){:root:not(.light){${block(colorDark)}}}` +
  `.dark{${block(colorDark)}}`;
