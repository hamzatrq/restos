import type { ReactNode } from "react";
import { useColor } from "../theme";
import { type ColorName, space } from "../tokens/index";

/**
 * `27-F43` — **the fill/foreground pairing is STRUCTURAL, not prose.**
 *
 * The FR asks for two things: `on-*` pairing *names* and a `<Surface>` *component*. Only the
 * naming half had shipped, and the FR is explicit about why that is not enough — "the name
 * carries the intent; THE COMPONENT MAKES IT STRUCTURAL. Leaving the pairing in prose produced
 * a publicly-reported failure that remains unfixed years later."
 *
 * The concrete failure here, measured: `fgColor-status-fault` on `bgColor-status-fault` is
 * **1.00:1** — the same colour. Nothing stopped a component composing exactly that, because
 * every component picks its foreground out of the flat global `color` record by hand and the
 * record has no opinion about which pairs make sense together.
 *
 * So this component takes the fill and **derives** the foreground from the manifest's own
 * `pairsWith` declaration. There is deliberately no way to pass a mismatched pair: `fg` is a
 * literal type computed per-fill, so `{ fill: "bgColor-status-fault", fg: "fgColor-status-fault" }`
 * is a compile error rather than an unreadable label at a counter.
 *
 * Only fills the manifest actually pairs are accepted. A neutral surface has no `pairsWith`
 * because its foreground is a role choice — body vs muted vs disabled — and inventing a
 * pairing for it here would be this file asserting a design decision doc 27 has not made.
 */

/**
 * The manifest's declared pairings, restated as LITERAL types.
 *
 * It has to be restated rather than derived: `resolveJsonModule` widens every string in
 * `tokens.json` to `string`, so `typeof tokens.color[K]["pairsWith"]` is `string` and a type
 * built on it accepts every combination — which is the exact bug this component exists to
 * prevent, and it is what the first draft of this file shipped.
 *
 * The restatement is checked against the manifest in `tokens/tokens.test.ts`, so a pairing
 * added or changed there fails a test rather than silently missing from this union.
 */
// @unreached-owed The legal fill/foreground pairs, restated for the type system. No shipped
// screen renders a `Surface` yet (the counter builds from `AppShell`, `Cart`, `ItemGrid`,
// `TenderPanel`, `Tile`), so both this table and the component below are waiting on the screens
// `plans/wave-1/screen-map.md` still owes. `tokens.test.ts` checks the table against the manifest.
export const PAIRING = {
  "bgColor-status-abnormal": "fgColor-on-status-abnormal",
  "bgColor-status-fault": "fgColor-on-status-fault",
  "bgColor-status-confirmed": "fgColor-on-status-confirmed",
  "bgColor-interactive": "fgColor-on-interactive",
  "bgColor-inverse": "fgColor-on-inverse",
} as const satisfies Partial<Record<ColorName, ColorName>>;

export type PairedFill = keyof typeof PAIRING;

/**
 * A fill and its ONE legal foreground, as a discriminated union. Written as a distributive
 * conditional so each member carries its own `fg` literal — a single
 * `{ fill: PairedFill; fg: ColorName }` would accept every combination, which is the bug.
 */
type Pairing<K extends PairedFill = PairedFill> = K extends K
  ? { fill: K; fg: (typeof PAIRING)[K] }
  : never;

export type SurfaceProps = Pairing & {
  children?: ReactNode;
  /** Rendered element. A surface is not inherently interactive, so the default is a `div`. */
  as?: "div" | "span";
  padding?: keyof typeof space;
};

/**
 * The runtime half is trivial on purpose — the contract is the type. What this function must
 * NOT do is accept a foreground and trust it, which is why `fg` is read for its name only and
 * the value is resolved from the manifest.
 */
// @unreached-owed With `PAIRING` above — no shipped screen renders a `Surface` yet.
export const Surface = ({ fill, fg, children, as = "div", padding }: SurfaceProps) => {
  const color = useColor();
  const Tag = as;
  return (
    <Tag
      style={{
        background: color[fill],
        color: color[fg],
        ...(padding ? { padding: space[padding] } : {}),
      }}
    >
      {children}
    </Tag>
  );
};
