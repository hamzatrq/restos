import { color, ThemeProvider, typography } from "@restos/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root — the renderer cannot mount");

/**
 * `27-F26` — the primary typeface, applied to the DOCUMENT rather than left to each component.
 *
 * Found by looking, August 2026: the unlock surface — the first screen anyone sees, 20–60x a
 * shift (`01-F26`) — rendered its staff names, its PIN marks and its refusal line in the
 * browser's default SERIF, because `packages/ui` sets `fontFamily` per component and `App.tsx`
 * composes those with plain `<div>`/`<p>` that inherit from `body`, which named no family at
 * all. `27-F26` picks IBM Plex Sans on **fail-safe defaults** — tabular digits and a distinct
 * `I`/`l` with no feature flags — and a serif fallback is precisely the failure that choice
 * exists to prevent, on the one surface where the payload is digits.
 *
 * The base surface is set here for the same reason: `AppShell` paints `bgColor-surface`, but
 * the unlock gate sits OVER the shell (`02-F18` — a locked device shows only the unlock
 * screen), so on that surface the page itself is what the operator sees. It was bare white.
 *
 * Light, per `27-F19`, matching the provider below. `27-F67`'s training inversion happens
 * inside `AppShell`, which paints its own full-height surface over this one.
 *
 * ⚠ **WHAT THIS DOES NOT DO: DELIVER THE TYPEFACE. NO WEBFONT IS BUNDLED.** The token's chain
 * is `'IBM Plex Sans', system-ui, sans-serif`, so this names Plex and then renders whatever the
 * machine already has — SF Pro on the Mac these screenshots came from, **Segoe UI on the Windows
 * till this app actually ships to**. The renderer's CSP is `'self'`, so no external font URL can
 * ever load; delivering it means committing the woff2 files as a local asset.
 *
 * **That is a real gap and not a cosmetic one**, which is why it is written here rather than
 * left to be discovered. `27-F26` did not pick Plex on taste — it picked it on *fail-safe
 * defaults*, "tabular digits and distinct `I`/`l` with **no feature flags**". Segoe UI gives
 * neither without opting in: its figures are proportional by default, so a column of money does
 * not align, on the one surface (`27-F25`) where digits are the operational payload.
 *
 * **Not bundled here deliberately, on process rather than preference.** `18 §15` makes adding an
 * asset a reviewed step — "PR adds it to §14 with one line of justification; **senior
 * approves**" — and a session fixing a layout blocker cannot approve its own dependency. The
 * matching call was made in `apps/backoffice` for the same reason, so both planes are honest in
 * the same direction. **Owed, and named in `apps/pos-electron/CLAUDE.md`.**
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
      27-F19 — LIGHT is the default on every surface, and the counter is the surface the
      evidence is strongest about: positive polarity wins on acuity at small character sizes,
      which is exactly where a POS lives. Dark is a per-site KDS opt-in and is set here, on
      the host, rather than anywhere a component can reach.

      27-F67 then inverts this for a training branch, inside AppShell. Nothing here has to
      know that; the shell reads the polarity in force and flips it.
    */}
    {/*
      `App`, not `Counter`: `02-F18`'s lock is a surface OVER the whole app (screen-map §3.1),
      so it has to be inside the theme and outside every screen.
    */}
    <ThemeProvider polarity="light">
      <App />
    </ThemeProvider>
  </StrictMode>,
);
