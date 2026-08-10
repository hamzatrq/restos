import { color, installFontFaces, ThemeProvider, typography } from "@restos/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root — the renderer cannot mount");

/**
 * `27-F26` — the primary typeface, applied to the DOCUMENT rather than left to each component,
 * for the reason `apps/pos-electron`'s `main.tsx` records: `packages/ui` sets `fontFamily` per
 * component, and any plain element between them inherits from `body`, which otherwise names no
 * family and renders the browser's default serif.
 *
 * ⚠ **THE FONT IS BUNDLED NOW — this block used to say it was not** (August 2026). It read *"NO
 * WEBFONT IS BUNDLED HERE EITHER … Owed, in all three"*, and on a pass screen the cost was the
 * sharpest of the three: the payload is the ticket identifier and the age, both digits, read at
 * 1–2 m, in whatever face the machine happened to have.
 *
 * `installFontFaces()` (`packages/ui`) is the one seam all three planes now call, and
 * `index.html`'s CSP gains `font-src 'self' data:` to let the base64 faces load — without it the
 * rules parse and every face is blocked, which looks exactly like success.
 *
 * This app's own `layout:check` asserts the face is LOADED on all 21 surfaces, not merely named —
 * a render path with no assertion is the shape both of this repo's recurring defects are named
 * for. What is still measured by NOTHING is `27-F27`'s angular cap-height, and the two are
 * related: a ticket can be perfectly composed, in the correct face, and unreadable at 1.5 m.
 */
installFontFaces();
const base = typography["text-body"];
document.body.style.fontFamily = base.fontFamily;
document.body.style.fontSize = `${base.fontSize}px`;
document.body.style.lineHeight = `${base.lineHeight}px`;
document.body.style.color = color["fgColor-default"];
document.body.style.background = color["bgColor-surface"];

createRoot(root).render(
  <StrictMode>
    {/*
      `27-F19` — **LIGHT, and on this surface that is the one place the evidence and the industry
      disagree.** *"Light theme is the default on every surface; dark is a per-site KDS opt-in.
      Positive polarity wins on acuity and proofreading … Recorded honestly: every commercial KDS
      ships dark and no study supports it. That is a pilot A/B (§7), not a decision to make from
      here."* `27 §9`'s first open question is this exact A/B.

      So this ships the documented default and **does not invent the opt-in**. When the pilot
      answers, the opt-in is one `polarity` prop and a `00 §7` layer-3 key — the same shape
      `panel_ppi` already takes — and every token pairing is independently gated in both
      polarities (`27-F19`, `27-F67`), so nothing else has to move.
    */}
    <ThemeProvider polarity="light">
      <App />
    </ThemeProvider>
  </StrictMode>,
);
