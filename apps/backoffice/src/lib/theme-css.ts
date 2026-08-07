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

import { colorDark, color as colorLight } from "@restos/ui/tokens";

const block = (palette: Record<string, string>): string =>
  Object.entries(palette)
    .map(([name, value]) => `--rx-${name}:${value};`)
    .join("");

/**
 * `:root` carries the light palette; the dark one is applied under the viewer's OS preference and
 * under an explicit `.dark` class, so a future in-app toggle needs no change here.
 */
export const themeCss = (): string =>
  `:root{${block(colorLight)}}` +
  `@media (prefers-color-scheme: dark){:root:not(.light){${block(colorDark)}}}` +
  `.dark{${block(colorDark)}}`;
