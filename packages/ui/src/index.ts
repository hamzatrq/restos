// Spec: specs/21-ux-system.md (system) + specs/27-design-language.md (visual language).
// A CLOSED vocabulary (Commandment 6): app code composes these, never raw primitives.
export * from "./components/index";
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
  usePhysicalSize,
} from "./physical";
// 27-F19's KDS opt-in and 27-F67's training inversion are the same mechanism, so it ships
// as one: a host app wraps its tree in <ThemeProvider polarity> and every component follows.
export { inverse, ThemeProvider, type ThemeProviderProps, useColor, usePolarity } from "./theme";
export * from "./tokens/index";
