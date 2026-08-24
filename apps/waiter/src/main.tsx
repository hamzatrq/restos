import { color, installFontFaces, PanelRoot, ThemeProvider, typography } from "@restos/ui";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Enrol } from "./Enrol";
import { Pad } from "./Pad";
import { createTerminalClient } from "./terminal-client";

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root — the pad cannot mount");

/**
 * `27-F26` — the typeface as BYTES, applied to the document exactly as the counter's own host does.
 * Naming a family the tablet does not have is not shipping it, and an Android tablet has neither
 * IBM Plex nor anything with tabular digits by default: `system-ui` and `sans-serif` both resolve
 * to Roboto there, which `27-F26` bans by name.
 */
installFontFaces();
const base = typography["text-body"];
document.body.style.fontFamily = base.fontFamily;
document.body.style.fontSize = `${base.fontSize}px`;
document.body.style.lineHeight = `${base.lineHeight}px`;
document.body.style.color = color["fgColor-default"];
document.body.style.background = color["bgColor-surface"];

const client = createTerminalClient(window.location.origin);

/**
 * `27-F68` — a dp is 1/160 inch of PHYSICAL size, so the panel's density has to come from
 * somewhere. On the counter that is `main/panel-density.ts`, which asks the platform.
 *
 * A BROWSER CANNOT ASK. There is no web API for a display's physical size: `devicePixelRatio` is a
 * ratio and `screen.width` is in CSS pixels. So this is the ASSUMED branch of `27-F68`'s resolution
 * order, and the counter's own guide is explicit about what that costs — assuming the wrong
 * diagonal renders every `27-F8` target at a fraction of its ergonomic size **and nothing on screen
 * looks wrong**.
 *
 * The number is `27 §1a`'s ~10.1-inch tablet row rather than the counter's, because this surface
 * only ever runs on that class (`04-F26`), and guessing the panel LARGER is the direction `27-F68`
 * (b) forbids by name — it shrinks targets below the floor. **It is a PIN, not a measurement.** The
 * honest fix is a layer-3 key the operator sets, which is owed work named in the session report.
 */
const ASSUMED_PANEL_PPI = 224;

const Root = (): React.JSX.Element => {
  const [enrolled, setEnrolled] = useState<boolean | null>(null);
  useEffect(() => {
    // `04-F22` (b) — an enrolled tablet has a key it cannot export and a terminal id the till
    // knows. An unenrolled one can do nothing at all until an operator reads it a code.
    void client.enrol("").then(() => setEnrolled(client.enrolled()));
  }, []);
  if (enrolled === null) return <></>;
  return enrolled ? (
    <Pad client={client} />
  ) : (
    <Enrol client={client} onDone={() => setEnrolled(true)} />
  );
};

createRoot(root).render(
  <StrictMode>
    {/*
      `27-F19` — light, matching the counter. `27-F68`/`PanelRoot` is what makes a dp a physical
      size: a 10.1" tablet is ~224 PPI against the counter's ~100, so without this every `27-F8`
      target renders at under half its ergonomic size and NOTHING on the screen looks wrong.
    */}
    <ThemeProvider polarity="light">
      <PanelRoot panelPpi={ASSUMED_PANEL_PPI}>
        <Root />
      </PanelRoot>
    </ThemeProvider>
  </StrictMode>,
);
