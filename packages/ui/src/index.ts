// Spec: specs/21-ux-system.md (system) + specs/27-design-language.md (visual language).
// A CLOSED vocabulary (Commandment 6): app code composes these, never raw primitives.
export * from "./components/index";
// 27-F19's KDS opt-in and 27-F67's training inversion are the same mechanism, so it ships
// as one: a host app wraps its tree in <ThemeProvider polarity> and every component follows.
export { inverse, ThemeProvider, type ThemeProviderProps, useColor, usePolarity } from "./theme";
export * from "./tokens/index";
