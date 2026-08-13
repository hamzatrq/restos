// Spec: specs/21-ux-system.md (system) + specs/27-design-language.md (visual language).
// A CLOSED vocabulary (Commandment 6): app code composes these, never raw primitives.
export * from "./components/index";
// 27-F26 — the typeface as BYTES. Naming a family the machine does not have is not shipping it,
// and until August 2026 this repo contained no font file at all. `installFontFaces` is the seam
// every DOM host calls; the back office inlines `fontFaceCss()` server-side instead.
export { fontFaceCss, installFontFaces, PRIMARY_FAMILY } from "./fonts/index";
/**
 * `27 §5` — the icon vocabulary (`27-F30`..`27-F37`).
 *
 * ⚠ **`IconLabel` IS EXPORTED AND `Icon` IS NOT, AND THE ASYMMETRY IS THE POINT.** `27-F35`
 * gates this vocabulary on a ≥85% comprehension / ≤5% critical-confusion retest with real staff
 * and **that test has not been run**. Until it has, a pictogram may accompany a word and may
 * never replace one — so the pairing is reachable from app code and the bare drawing is not.
 * `ICONS` and `ICON_NAMES` stay internal for the same reason: nothing outside this package needs
 * to enumerate the set, and an enumeration is how a screen starts rendering symbols on its own.
 *
 * When the gate is run and passed, exporting `Icon` is a one-line change with a reason. Until
 * then it is a one-line hole.
 */
export { IconLabel, type IconLabelProps, type IconName } from "./icons/index";
// 27-F11c — capacity is a PHYSICAL question, so a surface is measured rather than assumed.
// 27-F68 — and a dp is a PHYSICAL size, so `PanelRoot` is the one place it becomes a pixel.
// `mmFromCssPx`/`cssPxFromMm` are gone with that ruling: they converted at the CSS reference
// 96 PPI, which inside `PanelRoot` is simply the wrong density, and a second conversion living
// beside the right one is how a layout comes out right in one place and wrong in another.
export {
  CSS_PX_PER_INCH,
  cssPxPerDp,
  PanelRoot,
  type PanelRootProps,
  type PhysicalSize,
  usePanelSize,
  usePhysicalSize,
} from "./physical";
// 27-F11c — a layout mode is a PHYSICAL question too: `27 §1a` lists four deployment surfaces
// and the product had no responsive construct of any kind. The mode is derived from measured
// millimetres, so the two counter panels are the same mode and a 24" desktop is not.
export {
  SURFACE_MODE_MIN_MM,
  type SurfaceMode,
  surfaceModeFor,
  useSurfaceMode,
  WorkSurface,
  type WorkSurfaceProps,
} from "./surface-mode";
// 27-F19's KDS opt-in and 27-F67's training inversion are the same mechanism, so it ships
// as one: a host app wraps its tree in <ThemeProvider polarity> and every component follows.
export { inverse, ThemeProvider, type ThemeProviderProps, useColor, usePolarity } from "./theme";
export * from "./tokens/index";
