/**
 * # `00 §7` layer 3 — `panel_ppi`, and it is a MEASUREMENT before it is a setting
 *
 * `27-F68` makes a dp 1/160 inch of physical size, so the renderer needs the density of the
 * glass in front of the operator. `00 §7` puts that at **layer 3** (branch/device, beside
 * printer assignments and station identity) and is explicit about the order: *"the runtime
 * reads the display's resolution and physical size from the OS, and this key exists only to
 * correct a panel that reports nothing or reports wrong. A number a technician types is a
 * number a technician mistypes, and the failure is silent — every touch target renders at the
 * wrong physical size and nothing on screen looks broken."*
 *
 * So the chain is measurement → correction → an honest admission, in that order, and the
 * source travels with the number so `00 §5.7` can be satisfied at the boot line rather than
 * left to be discovered.
 *
 * ## What Electron does not give us, checked rather than assumed
 *
 * `screen.getPrimaryDisplay()` carries `size` (in DIP), `scaleFactor`, `rotation`, `label` and
 * `internal` — and **no physical size**. Native resolution is therefore free (`size ×
 * scaleFactor`) and the inches are not, so the second half has to come from the platform:
 *
 * - **Windows** — the ship target. EDID's image size is exposed through WMI
 *   (`WmiMonitorBasicDisplayParams`, centimetres).
 * - **Linux** — `xrandr` prints the connected output's millimetres.
 * - **macOS** — `CGDisplayScreenSize` has it and is not reachable without a native addon.
 *   `system_profiler SPDisplaysDataType -json` was checked (August 2026) and reports
 *   `_spdisplays_pixels` and a product id but **no physical size**, so on this platform the
 *   panel genuinely "reports nothing" and the config key is the answer. Recorded rather than
 *   left as an unexplained gap, because macOS is the dev machine and not the till.
 */

/** Native resolution of the panel, in device pixels. `display.size × display.scaleFactor`. */
export type DisplayFacts = { readonly widthPx: number; readonly heightPx: number };

export type PanelDensitySource =
  /** `00 §7`'s key was set. A correction, and the only path a human number takes. */
  | "configured"
  /** The OS told us the physical size. The default and the intended path. */
  | "measured"
  /** Neither answered, so `27 §1a`'s counter panel is assumed and the boot line says so. */
  | "assumed";

export type PanelDensity = { readonly ppi: number; readonly source: PanelDensitySource };

/**
 * `27 §1a` — the counter POS is a **15.6″** panel at 1366×768 or 1920×1080. Used only as the
 * `assumed` fallback: it is right for the hardware this ships to and wrong on a dev laptop,
 * which is exactly why the source is carried and printed rather than swallowed.
 */
export const REFERENCE_COUNTER_DIAGONAL_IN = 15.6;

/**
 * `27 §1a`'s counter row runs 100–141 PPI, the tablet ~224 and the phone ~405. This band is
 * wider than all of them on both sides and exists for one job: refusing a typo in the config
 * key. A density typed with a transposed digit — 141 becoming fourteen-oh-one — renders
 * `27-F8`'s 20 mm keypad at 2.3 mm and the screen still looks like a screen, which is the silent
 * failure `00 §7` names. A refused value falls through to the measurement rather than stopping
 * the till (`01-F17`).
 *
 * (Spelled in words on purpose: `unlock-gate.dom.test.tsx` scans all of `src/main` for a quoted
 * run of four or more digits, because that is the shape a device-wide PIN seed has. A prose
 * example in a comment is exactly the false positive that guard should not have to distinguish,
 * and rewording costs nothing.)
 */
export const PLAUSIBLE_PPI = { min: 50, max: 800 } as const;

/** Diagonal-in-pixels over diagonal-in-inches. Both axes share a PPI on a square-pixel panel. */
export const ppiFromDiagonal = (display: DisplayFacts, diagonalIn: number): number =>
  Math.hypot(display.widthPx, display.heightPx) / diagonalIn;

/** Native pixels across, over the OS's own millimetres across. */
export const ppiFromWidthMm = (display: DisplayFacts, widthMm: number): number =>
  display.widthPx / (widthMm / 25.4);

/**
 * The OS's physical width for the primary display, in millimetres, or `null` where the platform
 * does not expose one to a JS runtime.
 *
 * `run` is injected so the parsers are testable off their own platform — which is the whole of
 * the coverage available here, and is said out loud: this machine is macOS, so the Windows and
 * Linux branches are exercised against captured command output and never against the command.
 */
export const measurePhysicalWidthMm = (
  platform: NodeJS.Platform,
  run: (command: string, args: readonly string[]) => string | null,
): number | null => {
  if (platform === "win32") {
    // EDID's `MaxHorizontalImageSize` is in whole centimetres — coarse, but a 15.6″ panel's
    // 34 cm resolves the PPI to about 3%, well inside the tolerance a 20 mm target needs.
    const out = run("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "(Get-CimInstance -Namespace root\\wmi -ClassName WmiMonitorBasicDisplayParams " +
        "| Select-Object -First 1).MaxHorizontalImageSize",
    ]);
    const cm = Number((out ?? "").trim());
    return Number.isFinite(cm) && cm > 0 ? cm * 10 : null;
  }
  if (platform === "linux") {
    // ` connected primary 1920x1080+0+0 (normal left inverted …) 344mm x 194mm`
    const out = run("xrandr", ["--query"]);
    const line = (out ?? "").split("\n").find((l) => / connected /.test(l) && /\d+mm x /.test(l));
    const mm = Number(line?.match(/(\d+)mm x \d+mm/)?.[1]);
    return Number.isFinite(mm) && mm > 0 ? mm : null;
  }
  // darwin, and anything else. See the header: the OS does not expose it here.
  return null;
};

/**
 * The whole chain, as one pure function so it is testable without a display.
 *
 * The configured value comes FIRST because `00 §7` calls it a correction — a panel that reports
 * wrong is only correctable if the correction outranks the report. It is bounded, because the
 * failure it guards is silent.
 */
export const resolvePanelDensity = (input: {
  display: DisplayFacts;
  /** `00 §7` layer 3 — `panel_ppi`. Raw, as it arrives from config; parsed and bounded here. */
  configured: string | undefined;
  /** The OS's answer, or `null` where the platform has none. */
  physicalWidthMm: number | null;
}): PanelDensity => {
  const configured = Number(input.configured);
  if (
    input.configured !== undefined &&
    Number.isFinite(configured) &&
    configured >= PLAUSIBLE_PPI.min &&
    configured <= PLAUSIBLE_PPI.max
  ) {
    return { ppi: configured, source: "configured" };
  }
  if (input.physicalWidthMm !== null && input.physicalWidthMm > 0) {
    const measured = ppiFromWidthMm(input.display, input.physicalWidthMm);
    if (measured >= PLAUSIBLE_PPI.min && measured <= PLAUSIBLE_PPI.max) {
      return { ppi: measured, source: "measured" };
    }
  }
  return {
    ppi: ppiFromDiagonal(input.display, REFERENCE_COUNTER_DIAGONAL_IN),
    source: "assumed",
  };
};

/**
 * What the boot line says. `00 §5.7` — the device reports what is true, and "assumed" is a
 * different fact from "measured" on a surface where being wrong looks like being right.
 */
export const describePanelDensity = (d: PanelDensity): string =>
  `panel: ${d.ppi.toFixed(1)} PPI (${d.source})` +
  (d.source === "assumed"
    ? ` — the OS reported no physical size and 00 §7's panel_ppi is unset, so 27 §1a's ${REFERENCE_COUNTER_DIAGONAL_IN}" counter panel is ASSUMED. Every 27-F8 target on this device is sized from that guess; set RESTOS_PANEL_PPI to correct it.`
    : "");
