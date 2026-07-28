import { createContext, type ReactNode, useContext, useMemo } from "react";
import { type ColorName, type Polarity, palette } from "./tokens/index";

/**
 * Polarity as runtime state, which two FRs need and neither had.
 *
 * `27-F19` makes **light the default on every surface** and dark a per-site **KDS opt-in**.
 * The evidence points the way most kitchen software does not: positive polarity wins on
 * acuity and proofreading, and the advantage is largest at small character sizes — which is
 * exactly where the counter POS lives. Every commercial KDS ships dark and no study supports
 * it, so 27-F19 files that as a pilot A/B rather than a decision. **An A/B is not runnable
 * while every component imports one hard-coded record**, which is what they all did.
 *
 * `27-F67` then needs the same machinery for a different reason: a training session renders
 * the OPPOSITE polarity to its surface's normal one, because that is the only "visibly
 * different surface tint" (`27-F63`) that survives `27-F21`. The two base surfaces measure
 * **14.31:1** apart, and every pairing in both sets is already independently gated.
 *
 * Both palettes are gated by the same tests, so switching is safe by construction rather
 * than by inspection — that is the property that makes this a context and not a prop drilled
 * through thirteen components.
 */
const PolarityContext = createContext<Polarity>("light");

export type ThemeProviderProps = {
  /** 27-F19 — light unless this surface is a KDS panel that has opted in. */
  polarity?: Polarity | undefined;
  children: ReactNode;
};

export const ThemeProvider = ({ polarity = "light", children }: ThemeProviderProps) => (
  <PolarityContext.Provider value={polarity}>{children}</PolarityContext.Provider>
);

/** The polarity in force. Read it to INVERT it (27-F67); never to branch on a colour. */
export const usePolarity = (): Polarity => useContext(PolarityContext);

/**
 * The colour record for the polarity in force.
 *
 * Deliberately the same shape as the old static `color` export, so a component's token
 * lookups are unchanged and the `discipline` guards — which resolve token NAMES out of
 * string literals and const maps, not the identifier they are indexed on — keep seeing every
 * one of them.
 */
export const useColor = (): Record<ColorName, string> => palette[useContext(PolarityContext)];

/** The opposite polarity. `27-F67`'s training treatment, and the only sanctioned caller. */
export const inverse = (p: Polarity): Polarity => (p === "light" ? "dark" : "light");

/**
 * Both palettes as a flat list, for a surface that must render a swatch of each. Memoised
 * only to keep referential identity stable across renders; there is no cost to compute.
 */
export const usePalettes = (): Record<Polarity, Record<ColorName, string>> =>
  useMemo(() => palette, []);
