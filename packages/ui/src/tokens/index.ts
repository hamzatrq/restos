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
export type TypeName = "text-numeric-hero" | "text-numeric-primary" | "text-body" | "text-label";

export const typography = Object.fromEntries(
  Object.entries(manifest.typography).filter(([k]) => !k.startsWith("$")),
) as unknown as Record<TypeName, TypeStyle>;

/** A missing token is a bug, not an `undefined` — fail loudly at the point of use. */
const must = <K extends string, T>(g: Record<K, T>, k: K): T => {
  const v = g[k];
  if (v === undefined) throw new Error(`token "${k}" is not in the manifest (see TOKENS.md)`);
  return v;
};

/** 27-F8 — a component takes a POSTURE, never a size. This type is what enforces it. */
export type Posture = "counter" | "keypad" | "kitchen" | "handheld" | "floor";
export const targetFor = (p: Posture): number => must(touch, `touch-${p}` as TouchName);

/**
 * 27-F27 — KDS type is specified in cap-millimetres at a stated viewing distance, never in
 * dp, because the same dp renders 2.3× larger on a 32" 69-PPI panel than on a phone.
 */
export const capHeightMm = (
  arcmin: number,
  distanceMm: number = must(kds, "kds-reference-distance-mm"),
): number => 2 * distanceMm * Math.tan(arcmin / 60 / 2 / (180 / Math.PI));

export { manifest as tokens };
