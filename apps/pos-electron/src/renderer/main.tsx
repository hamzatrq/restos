import { ThemeProvider } from "@restos/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root — the renderer cannot mount");

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
