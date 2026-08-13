// Typed access to the doc-27 token manifest.
//
// The manifest (tokens.json) is the canonical artifact — 27-F45 makes the machine-readable
// path a FILE, never a docs site, because Material 3's and Spectrum's token docs are JS-only
// SPAs that return empty shells to agents. This module is a typed view over it, not a second
// source of truth.

import manifest from "./tokens.json" with { type: "json" };

type Entry = { value: string | number; replacement: string | null };

const values = <T extends string | number>(g: Record<string, unknown>): Record<string, T> =>
  Object.fromEntries(
    Object.entries(g)
      .filter(([k]) => !k.startsWith("$"))
      .map(([k, v]) => [k, (v as Entry).value as T]),
  ) as Record<string, T>;

// Key unions come from the manifest, so a typo in a token name is a TYPE error rather than
// an `undefined` that reaches a screen as a blank colour or a zero-width gap.
export type ColorName = Exclude<keyof typeof manifest.color, `$${string}`>;
export type SpaceName = Exclude<keyof typeof manifest.space, `$${string}`>;
export type TouchName = Exclude<keyof typeof manifest.touch, `$${string}`>;
export type KdsName = Exclude<keyof typeof manifest.kds, `$${string}`>;
export type MoneyName = Exclude<keyof typeof manifest.money, `$${string}`>;

/**
 * `27-F19` — LIGHT is the default on every surface; dark is a per-site KDS opt-in.
 *
 * The evidence is not close and it points the way most kitchen software does not: positive
 * polarity wins on acuity and proofreading for younger and older adults alike, and the
 * advantage is LARGEST at small character sizes — which is exactly where the counter POS
 * lives. Every commercial KDS ships dark and no study supports it, so `27-F19` files that as
 * a pilot A/B rather than a decision.
 *
 * That A/B was not runnable while one set of hexes existed. It is now: both polarities are
 * gated independently in the manifest — every `27-F21` pairing and every SC 1.4.11 separation
 * holds in BOTH — so a surface may switch without a component changing.
 *
 * `color` stays the default (light). `colorDark` is the opt-in, and the surfaces that take it
 * are kitchen surfaces: read at 1–2 m through steam, where a wall-mounted panel's glare
 * matters more than small-glyph acuity, and where amber-as-a-resting-state has to survive
 * 500 lux (`27-F18`). The counter keeps light; so does the handheld, which is used outdoors
 * where a dark field washes out entirely.
 */
export const color = values<string>(manifest.color) as Record<ColorName, string>;

/** The `27-F19` KDS opt-in set. Same keys, same laws, different polarity. */
export const colorDark = Object.fromEntries(
  Object.entries(manifest.color)
    .filter(([k]) => !k.startsWith("$"))
    .map(([k, v]) => [k, (v as { dark?: string; value: string }).dark ?? (v as Entry).value]),
) as Record<ColorName, string>;

/** Both polarities by name — what a theme-aware surface and every gate test resolve through. */
export const palette = { light: color, dark: colorDark } as const;
export type Polarity = keyof typeof palette;
export const space = values<number>(manifest.space) as Record<SpaceName, number>;
export const touch = values<number>(manifest.touch) as Record<TouchName, number>;
export const kds = values<number>(manifest.kds) as Record<KdsName, number>;
export const money = values<string | number>(manifest.money) as Record<MoneyName, string | number>;
/** 27-F42 — typography tokens are COMPOSITE. Take one whole; never assemble your own. */
export type TypeStyle = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  fontWeight: number;
  letterSpacing: string;
};
export type TypeName =
  | "text-numeric-display"
  | "text-numeric-hero"
  | "text-numeric-primary"
  | "text-body"
  | "text-label";

export const typography = Object.fromEntries(
  Object.entries(manifest.typography).filter(([k]) => !k.startsWith("$")),
) as unknown as Record<TypeName, TypeStyle>;

/** A missing token is a bug, not an `undefined` — fail loudly at the point of use. */
const must = <K extends string, T>(g: Record<K, T>, k: K): T => {
  const v = g[k];
  if (v === undefined) throw new Error(`token "${k}" is not in the manifest (see TOKENS.md)`);
  return v;
};

/**
 * 27-F8 — a component takes a POSTURE, never a size. This type is what enforces it.
 *
 * `floor` is deliberately NOT a member. 27-F8 lists it as "absolute floor, anything — 48 dp",
 * which is a permission, not a design intent: a control that has nowhere better to be may sit
 * there. While it was a peer in this union, `<ItemGrid posture="floor">` typechecked and
 * rendered a 48 dp counter grid where 27-F8 requires 76 — and `pageCapacity` then validated
 * the violation, because it checks a tile against whatever posture it was handed.
 */
export type Posture = "counter" | "keypad" | "kitchen" | "handheld";

/**
 * The floor, reachable only where a size is asked for directly — never where a POSTURE is.
 * ItemGrid's page buttons and Cart's remove control legitimately sit here.
 */
export type TouchFloor = "floor";

export const targetFor = (p: Posture | TouchFloor): number =>
  must(touch, `touch-${p}` as TouchName);

/**
 * 27-F11c — "Physical size, never resolution, sets capacity. Extra pixels buy sharpness; only
 * inches buy room. Design in millimetres, render in pixels."
 *
 * The manifest has always carried an `mm` column beside every posture's dp value; this typed
 * view dropped it, which left nothing in the package able to express a physical size at all.
 * That is why `pageCapacity` could report 91 tiles for a 1366×768 15.6″ panel and 180 for the
 * 1920×1080 one — the same physical surface, both listed in `27 §1a`'s hardware table.
 */
export const targetMm = (p: Posture | TouchFloor): number => {
  const entry = (manifest.touch as Record<string, { mm?: number }>)[`touch-${p}`];
  const mm = entry?.mm;
  if (mm === undefined) throw new Error(`touch-${p} carries no mm in the manifest (see TOKENS.md)`);
  return mm;
};

/**
 * `27-F68` — **a dp is 1/160 inch of PHYSICAL size.** This is the whole of the definition, and
 * it lives here because it is a TOKEN-layer fact: it is the density that generates both columns
 * of `27-F8`'s posture table and every cell of `27 §1a`'s hardware table.
 *
 * It is deliberately not `96`. `dp ≡ CSS px` holds only on a 160-PPI panel, is stated nowhere in
 * doc 21 or doc 27, and does not fit `27 §1a`'s own hardware: the counter runs at 100–141 PPI,
 * where this package's 126 dp keypad key is **79–111 px** and not 126. Spending a dp as a CSS
 * pixel drew every touch target in the product at the wrong physical size — measured at 1366×768
 * (100.5 PPI) as a 528 px keypad in a 498 px work area. `physical.tsx` is where this constant is
 * turned into pixels, and `PanelRoot` is the ONE place that turn happens.
 */
export const DP_PER_INCH = 160;

/**
 * dp → mm at the 160-dpi density that DEFINES a dp. The one conversion the package uses, so a
 * spacing token can be spent on a physical layout without a second arithmetic appearing.
 */
export const mmFromDp = (dp: number): number => (dp / DP_PER_INCH) * 25.4;

/**
 * 27-F27 — KDS type is specified in cap-millimetres at a stated viewing distance, never in
 * dp, because the same dp renders 2.3× larger on a 32" 69-PPI panel than on a phone.
 */
// @unreached-owed `27-F27` is a KDS law, and there is no KDS (`apps/pass-kds` is a one-file stub).
// The counter is a touch surface at arm's length and sizes type in dp; this arrives with the pass
// screen, where the viewing distance is metres and dp stops meaning anything.
export const capHeightMm = (
  arcmin: number,
  distanceMm: number = must(kds, "kds-reference-distance-mm"),
): number => 2 * distanceMm * Math.tan(arcmin / 60 / 2 / (180 / Math.PI));

export { manifest as tokens };
