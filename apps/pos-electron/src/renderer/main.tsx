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
