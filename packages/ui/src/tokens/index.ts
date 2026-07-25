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

export const color = values<string>(manifest.color);
export const space = values<number>(manifest.space);
export const touch = values<number>(manifest.touch);
export const kds = values<number>(manifest.kds);
export const money = values<string | number>(manifest.money);
export const typography = Object.fromEntries(
  Object.entries(manifest.typography).filter(([k]) => !k.startsWith("$")),
);

/** A missing token is a bug, not an `undefined` — fail loudly at the point of use. */
const must = <T>(g: Record<string, T>, k: string): T => {
  const v = g[k];
  if (v === undefined) throw new Error(`token "${k}" is not in the manifest (see TOKENS.md)`);
  return v;
};

/** 27-F8 — a component takes a POSTURE, never a size. This type is what enforces it. */
export type Posture = "counter" | "keypad" | "kitchen" | "handheld" | "floor";
export const targetFor = (p: Posture): number => must(touch, `touch-${p}`);

/**
 * 27-F27 — KDS type is specified in cap-millimetres at a stated viewing distance, never in
 * dp, because the same dp renders 2.3× larger on a 32" 69-PPI panel than on a phone.
 */
export const capHeightMm = (
  arcmin: number,
  distanceMm: number = must(kds, "kds-reference-distance-mm"),
): number => 2 * distanceMm * Math.tan(arcmin / 60 / 2 / (180 / Math.PI));

export { manifest as tokens };
