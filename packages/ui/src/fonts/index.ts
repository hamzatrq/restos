/**
 * `27-F26` — **the typeface, as bytes.**
 *
 * The FR named IBM Plex Sans and this repo shipped no font file of any kind: a
 * `find` for `*.woff2|woff|ttf|otf` outside `node_modules` returned nothing, the Linux build box
 * has no IBM Plex installed, and Windows never has. So the token named a family the machine did
 * not have and every surface rendered whatever generic sans the OS picked — a different one on
 * macOS, Linux and the Windows till. That is this wave's named recurring defect (*a correct
 * subsystem with no seam to the product*) reaching the design layer: the FR is right, the token
 * names the face, and nothing delivered it.
 *
 * **It matters more than "text looks slightly different", and `27-F26` says why.** The face was
 * chosen *for numeral disambiguation on money surfaces* — tabular digits and a distinct `I`/`l`,
 * both on fail-safe defaults. Falling back throws away the exact property it was selected for.
 * Verified against these binaries rather than taken from the FR: every digit advance is 600/1000
 * em in all three weights (so the column aligns with **no** `tnum` — there is no `tnum` in the
 * font's GSUB at all, which is what "no feature flags" means), and `I` (400/414/423) and `l`
 * (272/285/294) differ in both advance and outline.
 *
 * ## Why base64 rather than `url()` to a bundled asset
 *
 * One declaration has to reach five render paths: the Electron counter, `apps/pass-kds`, the
 * Next.js back office, Storybook and `pnpm layout:check`. A data URI is the only mechanism that
 * needs no per-bundler asset plumbing and no second mechanism for the back office, which already
 * ships its tokens as an inline `<style>` rendered server-side (`theme-css.ts`) — a relative
 * `url()` inside inline CSS has no stylesheet to resolve against. It also sidesteps the question
 * of whether `default-src 'self'` matches a `file://` asset in the packaged till, and it costs
 * the till no disk round trip on a surface that is offline-first by law (`00 §5.1`).
 *
 * The cost is stated rather than hidden: ~95 KB of base64 in each bundle, and both Electron CSPs
 * gain `font-src 'self' data:` — the same allowance `img-src` already carries there. The bytes
 * are a compile-time constant of ours, never anything a user supplies.
 *
 * ## Weights and subset
 *
 * Three weights because the type scale references exactly three (400 `text-body`, 500
 * `text-label`, 600 the three `text-numeric-*`), and Latin only because commandment 7 makes the
 * UI English. User content that arrives in another script is not lost: a codepoint outside this
 * subset simply falls through to the next family in the token's stack, which is the correct
 * behaviour and the reason no `unicode-range` is declared here.
 *
 * `₨` (U+20A8) is deliberately absent and that is not a gap — `27-F23` writes `Rs` in staff UI
 * and `tokens.test.ts` pins it.
 */
import { tokens } from "../tokens/index";
import { PLEX_LATIN_400, PLEX_LATIN_500, PLEX_LATIN_600 } from "./plex-latin";

/**
 * The family the `@font-face` rules declare, taken from the manifest's own stack rather than
 * typed again here. `27-F45` makes `tokens.json` canonical, and a face declared under a name the
 * tokens do not ask for is a font that loads and is never used — invisible to every rail, because
 * both halves are individually correct. `fonts.test.ts` pins that this resolves to `IBM Plex
 * Sans`.
 */
export const PRIMARY_FAMILY: string = (tokens.typography.$family.split(",")[0] ?? "")
  .trim()
  .replace(/^["']|["']$/g, "");

/**
 * `local()` is per-weight and the NAMES are the load-bearing part.
 *
 * A machine with IBM Plex Sans installed should use its copy and skip 95 KB of decode. The
 * tempting shape — `local('IBM Plex Sans')` on all three faces — is a real bug that looks
 * correct: that string matches the *Regular* face, so on any machine with Plex installed the 500
 * and 600 rules would resolve to 400 and the whole scale would flatten, on exactly the machines
 * where the font is most likely present. These are the binaries' own name records (full name and
 * PostScript name, read from the `name` table).
 */
const LOCALS: Readonly<Record<number, readonly string[]>> = {
  400: ["IBM Plex Sans", "IBM Plex Sans Regular", "IBMPlexSans-Regular"],
  500: ["IBM Plex Sans Medium", "IBMPlexSans-Medium"],
  600: ["IBM Plex Sans SemiBold", "IBMPlexSans-SemiBold"],
};

const DATA: Readonly<Record<number, string>> = {
  400: PLEX_LATIN_400,
  500: PLEX_LATIN_500,
  600: PLEX_LATIN_600,
};

/**
 * `font-display: swap`, decided rather than defaulted.
 *
 * The font is inlined in the same CSS the parser has already read, so there is no fetch to lose
 * and in practice every value here behaves identically. The choice is therefore entirely about
 * the FAILURE mode, and on a till the failure modes are not equivalent:
 *
 * - `block` (and `auto`, which is `block`-like in Blink) renders text **invisible** for up to 3 s.
 *   A cashier who cannot read the total mid-rush is a worse outcome than one who reads it in the
 *   wrong face for a frame.
 * - `optional` gives the browser licence to decline the face for the whole page load. It would
 *   run an entire service in fallback metrics — silently discarding the one property `27-F26`
 *   selected the face for — and it would make the gate's own assertion flaky by design.
 * - `swap` is never invisible and always adopts the face once it is ready.
 *
 * Never-invisible beats never-shifted here, and `swap` is the only value that guarantees both
 * "readable at all times" and "correct once loaded".
 */
const DISPLAY = "swap";

const face = (weight: number): string =>
  `@font-face{` +
  `font-family:'${PRIMARY_FAMILY}';` +
  `font-style:normal;` +
  `font-weight:${weight};` +
  `font-display:${DISPLAY};` +
  `src:${(LOCALS[weight] ?? []).map((n) => `local('${n}')`).join(",")},` +
  `url(data:font/woff2;base64,${DATA[weight]}) format('woff2');` +
  `}`;

/**
 * The `@font-face` block, as a string, for hosts that already inline their CSS.
 *
 * Note what is NOT here: no `font-feature-settings`, no `font-variant-numeric`. `27-F26` chose
 * this face precisely so that no feature flag has to be bound and verified on every render path,
 * and adding one would contradict the FR while looking like a safety measure.
 */
export const fontFaceCss = (): string => Object.keys(DATA).map(Number).map(face).join("");

const STYLE_ID = "restos-font-faces";

/**
 * Installs the faces into a live document. Idempotent, so a host may call it from a module that
 * re-executes under HMR without stacking 95 KB per reload.
 *
 * This is the seam for the two Electron renderers and Storybook. The back office does not use it:
 * it inlines `fontFaceCss()` server-side through `theme-css.ts`, so the face is present in the
 * first byte of HTML rather than after hydration.
 */
export const installFontFaces = (): void => {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID) !== null) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = fontFaceCss();
  document.head.appendChild(style);
};
