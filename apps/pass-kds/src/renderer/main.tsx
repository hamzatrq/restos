import { color, ThemeProvider, typography } from "@restos/ui";
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
 * ⚠ **NO WEBFONT IS BUNDLED HERE EITHER.** The token chain is `'IBM Plex Sans', system-ui,
 * sans-serif`, so this names Plex and renders whatever the machine already has. `27-F26` picked
 * Plex on *fail-safe defaults* — tabular digits and a distinct `I`/`l` with no feature flags —
 * and on a pass screen the payload is the ticket identifier and the age, both digits, read at
 * 1–2 m. Left unbundled on **process**: `18 §15` makes a new asset a senior-approved step, and
 * `apps/pos-electron` and `apps/backoffice` both made the same call. **Owed, in all three.**
 */
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
