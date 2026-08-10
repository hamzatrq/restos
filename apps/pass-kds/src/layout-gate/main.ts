import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow } from "electron";
import { measureSurface, type SurfaceReport } from "../../../pos-electron/src/layout-gate/probe";
import { PASS_WINDOW_OPTIONS } from "../main/window-options";
import { ticketsPerPage } from "../shared/ticket-capacity";

/**
 * # `pnpm -C apps/pass-kds layout:check` — the pass screen's half of the layout rail
 *
 * `AGENTS.md`: *"a surface the gate does not render is a surface with no layout coverage at all,
 * and that fixture gap is the single most repeated finding in this repo."* Nine layout defects
 * have been found by launching an app and looking, and **zero** by the suites — because
 * `.dom.test.tsx` runs under happy-dom, which performs no layout, so every
 * `getBoundingClientRect` is zeroes and the strongest thing a renderer suite can say is *"the
 * ticket is in the document"*.
 *
 * This opens a real `BrowserWindow` from the app's **real** `PASS_WINDOW_OPTIONS` (imported, not
 * copied — a gate measuring its own literal proves only that its literal is right), mounts the
 * shipped renderer against `layout-gate/preload.ts`, and measures in Blink.
 *
 * ## ⚠ `measureSurface` IS IMPORTED FROM `apps/pos-electron`, AND THAT IS THE POINT
 *
 * The probe is ~450 lines of clipping-ancestor walk, ink extents and hit testing, and copying it
 * would give the repo **two interpretations of "is this control on the screen"**. That is the
 * defect `turbo.json` cuts a package cycle to avoid (*"two interpretations of one command set is
 * the defect the shared module exists to prevent"*) and that `03-F40`'s two incompatible sensor
 * bit layouts is the corpus's own instance of. It is a pure function — it is serialised with
 * `Function.prototype.toString()` and run inside the page, so it has no imports of its own — and
 * a divergence between two copies would show up as one app passing a check the other fails on the
 * same defect.
 *
 * **What it costs, stated:** this gate depends on a file in an app this one does not declare a
 * dependency on. The honest fix is a shared layout-gate module and it is a cross-app refactor with
 * `apps/pos-electron`'s own gate in its blast radius (`24 §3b` — scheduled work, not a drive-by).
 * **OWED**, and it is the same debt `main/index.ts` records for `panel-density.ts`.
 *
 * ## WHAT THIS GATE DOES **NOT** CATCH — do not read a green run as "the screen is right"
 *
 * 1. **Main is a stub.** It says nothing about the IPC contract, Zod validation at the plane
 *    boundary, or whether the shipped preload serves the same channels. `__acceptance__/` owns
 *    that, and `pass-seam.test.ts` is the hand-written assertion no rail can make.
 * 2. **It only sees the states the fixture produces**, which is the boundary that has cost this
 *    repo real defects twice. Three states are scripted (owner / read-only / empty) and each has a
 *    `24-F14` presence check below; a state nobody scripted is a state nobody measures. **Not
 *    scripted:** a ticket whose lines are all contested, a 40-order rush (`03-N4`), `27-F67`'s
 *    training inversion, and `27-F19`'s dark KDS opt-in, which does not exist yet.
 * 3. **It does not judge legibility, contrast or typography.** `27-F27`'s angular cap-height —
 *    the one measurement a KDS actually turns on — is **not measured by anything here**, and that
 *    is the largest gap in this rail. A ticket can be perfectly composed and unreadable at 1.5 m.
 * 4. **One DPI, one platform.** Every panel is SIMULATED on this host. The real 22" panel, and
 *    `27 §1a`'s ~224-PPI tablet, are measured by nothing.
 * 5. **`27-F4`'s positional contract is invisible to it.** Controls may be reordered freely.
 */

const HERE = fileURLToPath(new URL(".", import.meta.url));

/**
 * # THE PANELS — `DEC-HW-001`'s "whatever glass a restaurant owns", made into a sweep
 *
 * `27-F28`'s amendment is the whole reason this table is not one row: *"a restaurant brings the
 * glass it owns, so the product reports the capacity that panel yields … A 1.5-ticket panel is a
 * supported and honestly-labelled KDS, not a refused one."* So the sweep spans **69 → 487 mm** of
 * height and every row but the probe SHIPS.
 *
 * `probe-phone` is the failing case the sweep rests on, and it is here for the reason
 * `apps/pos-electron`'s `probe-below-floor` is: *"every other row is evidence that hardware WORKS,
 * and a floor is a claim about hardware that does not."* A 6.5" phone in landscape is 150 × 69 mm
 * — under one ticket's 91.3 mm — so it is where a real capacity failure shows up. **If it ever
 * goes quiet, the layout has become smaller than the FR says a ticket costs**, which is the
 * anti-rot direction.
 */
const PANELS = [
  {
    label: "pass-22",
    width: PASS_WINDOW_OPTIONS.width,
    height: PASS_WINDOW_OPTIONS.height,
    diagonalIn: 22,
    ships: true,
  },
  /** `27-F11f`'s panel at the other common resolution — same glass, `27-F11c` says same layout. */
  { label: "pass-22-hd", width: 1366, height: 768, diagonalIn: 22, ships: true },
  /** A TV on the wall with a stick PC. The cheapest way a Pakistani kitchen gets glass. */
  { label: "tv-32", width: 1920, height: 1080, diagonalIn: 32, ships: true },
  /** The laptop a restaurant already owns, stood at the pass. */
  { label: "laptop-15.6", width: 1366, height: 768, diagonalIn: 15.6, ships: true },
  /** `27 §1a`'s tablet — `27-F28`'s own "about 1.5 tickets" row. */
  { label: "tablet-10.1", width: 1366, height: 768, diagonalIn: 10.1, ships: true },
  /** The same 10.1" glass at 78% fewer pixels. `27-F11c` stated as a test: same verdicts. */
  { label: "netbook-1024", width: 1024, height: 600, diagonalIn: 10.1, ships: true },
  /** Below one ticket. The failing case — see the table header. */
  { label: "probe-phone", width: 1280, height: 720, diagonalIn: 6.5, ships: false },
] as const;

/** `03-F24` and `00 §5.7` — every state the fixture can produce, each swept on every panel. */
const STATES = ["owner", "readonly", "empty"] as const;

const SHOT_DIR = process.env["RESTOS_LAYOUT_SHOTS"];

/**
 * `27-F8`'s **kitchen** row — 96 dp = 15 mm, *"standing, wet or greasy hands, 1–2 m"*, and it is
 * set above the standing-counter minimum deliberately: this is the surface where the measured
 * 21.34% wet-hand gesture error was gathered.
 *
 * Measured in **millimetres of glass**, not pixels, because that is the whole of `27-F68`: 96 CSS
 * px fits any panel perfectly while being the wrong physical size on all but one of them.
 */
const KITCHEN_MM = 15.24;
const KITCHEN_MM_TOLERANCE = 0.5;

const failures: string[] = [];
const fail = (line: string): void => {
  failures.push(line);
};

const shoot = async (window: BrowserWindow, name: string): Promise<void> => {
  if (SHOT_DIR === undefined || SHOT_DIR === "") return;
  const image = await window.webContents.capturePage();
  writeFileSync(join(SHOT_DIR, `${name}.png`), image.toPNG());
};

/**
 * The fit checks. Deliberately the same three questions `apps/pos-electron`'s gate asks, because
 * they are the three that separate "in the document" from "on the screen":
 *
 *  - a BOX whose content is larger than it is (`OVERFLOW`),
 *  - a CONTROL cut by a clipping ancestor (`CLIPPED BY ANCESTOR`) — the check that found five
 *    sliced menu tiles while the viewport-only rail reported zero,
 *  - a CONTROL whose centre does not hit-test (`COVERED`).
 */
const judge = (surface: string, report: SurfaceReport, ships: boolean): void => {
  const note = ships ? fail : (line: string) => process.stdout.write(`  (probe) ${line}\n`);

  // `24-F14` — `index.html` sets `overflow: hidden` on `html`, `body` and `#root`, so the floor is
  // three on every screen this product draws. Zero means the walk has stopped working, which is
  // indistinguishable from a perfectly composed app unless it is asserted.
  if (report.controls.length > 0 && report.clippingAncestors === 0) {
    fail(`${surface}: EMPTY MATCH — controls measured and NOT ONE clipping ancestor found`);
  }

  for (const o of report.overflows) {
    note(
      `${surface}: OVERFLOW ${o.axis} — \`${o.label}\` holds ${Math.round(o.content)}dp of ` +
        `content in a ${Math.round(o.box)}dp box (overflow: ${o.overflow})`,
    );
  }

  for (const c of report.controls) {
    if (c.clippedBy !== null && c.clippedBy.worst > 1) {
      const l = c.clippedBy;
      note(
        `${surface}: CLIPPED BY ANCESTOR — \`${c.label}\` loses ${Math.round(l.worst)}px to ` +
          `\`${l.by}\` (overflow: ${l.overflow}); ${Math.round(l.visible.w)}×` +
          `${Math.round(l.visible.h)}px survives. Its centre ` +
          `${c.hitTestable ? "still hit-tests" : "does NOT hit-test"}.`,
      );
      continue;
    }
    if (!c.withinViewport) {
      note(`${surface}: CLIPPED BY VIEWPORT — \`${c.label}\` has an edge outside the window`);
      continue;
    }
    if (!c.hitTestable && !c.disabled) {
      note(`${surface}: COVERED — a tap at the centre of \`${c.label}\` lands on something else`);
    }
  }
};

const run = async (): Promise<void> => {
  if (SHOT_DIR !== undefined && SHOT_DIR !== "") mkdirSync(SHOT_DIR, { recursive: true });

  const window = new BrowserWindow({
    // THE SHIPPED OPTIONS, imported — not a copy.
    ...PASS_WINDOW_OPTIONS,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(HERE, "../preload/layout-gate.cjs"),
    },
  });

  let surfaces = 0;
  let controls = 0;
  let bumpControls = 0;
  let readOnlySurfaces = 0;
  let emptySurfaces = 0;
  let pagersDrawn = 0;
  let targetsMeasured = 0;

  for (const panel of PANELS) {
    window.setContentSize(panel.width, panel.height);
    await new Promise((r) => setTimeout(r, 250));

    for (const state of STATES) {
      // A reload per state rather than a re-render, so nothing inherits the previous state's
      // measurement — the same reason `apps/pos-electron` reloads between panels.
      await window.loadFile(join(HERE, "../renderer/index.html"), {
        query: { diagonalIn: String(panel.diagonalIn), state },
      });
      await new Promise((r) => setTimeout(r, 500));

      const report: SurfaceReport = await window.webContents.executeJavaScript(
        `(${measureSurface.toString()})()`,
      );
      const surface = `${panel.label} ${state}`;
      judge(surface, report, panel.ships);
      await shoot(window, `${panel.label}--${state}`);

      surfaces += 1;
      controls += report.controls.length;

      const bumps = report.controls.filter((c) => c.label.includes("DONE"));
      const pager = report.controls.filter((c) => c.label.includes("◀") || c.label.includes("▶"));
      if (pager.length > 0) pagersDrawn += 1;

      /**
       * `03-F24` — **the read-only state is a REFUSAL and this is what makes it measurable.**
       * `02-F33` says a surface without the assignment *"is read-only for states"*, and
       * `TicketCard` renders no control at all rather than a disabled one (`27-F5`). A gate that
       * only ever measured the owner state would bless a screen that ignores the assignment.
       */
      if (state === "readonly") {
        readOnlySurfaces += 1;
        if (bumps.length > 0) {
          fail(
            `${surface}: 03-F24 BROKEN — this surface does not own the ready signal and ` +
              `${bumps.length} DONE control(s) are on the screen`,
          );
        }
      }
      if (state === "empty") emptySurfaces += 1;
      if (state === "owner") {
        bumpControls += bumps.length;
        // `24-F14` — the fixture producing no bumpable ticket would retire `03-F16` from the
        // sweep silently, which is exactly what `escalationFor: () => null` did to
        // `ManagerApproval` for weeks in the other app.
        if (bumps.length === 0) {
          fail(`${surface}: EMPTY MATCH — the owner state drew NO bump control`);
        }
        // `03-F46` — twelve tickets must exceed every panel's capacity, so a pager is drawn
        // everywhere. If this stops firing the fixture has stopped covering the paged case.
        if (pager.length === 0) {
          fail(
            `${surface}: EMPTY MATCH — 12 tickets and NO pager. Either capacity grew past 12 ` +
              "tickets on this panel or 03-F46's paging stopped rendering.",
          );
        }
      }

      /**
       * **The one check that is not about fitting** — `27-F8`'s kitchen target in MILLIMETRES OF
       * GLASS, with the density read back out of the same seam the renderer was handed it on.
       *
       * Every other check asks whether a thing FITS, and 96 CSS px fits every panel here
       * perfectly while being 15 mm on exactly one of them. `27-F68` (a) forbids the pinned
       * pixel answer by name, and this row is what would catch it: a constant that is right on
       * `pass-22` is 8.7 mm on `tablet-10.1`, 43% under the floor, on a surface a cook touches
       * with wet hands.
       */
      if (state === "owner" && bumps.length > 0) {
        const mm: number | null = await window.webContents.executeJavaScript(
          `(() => {
            const el = [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === "DONE");
            if (!el) return null;
            const h = el.getBoundingClientRect().height;
            const diag = Number(new URLSearchParams(window.location.search).get("diagonalIn"));
            const px = Math.hypot(window.innerWidth * window.devicePixelRatio, window.innerHeight * window.devicePixelRatio);
            return (h * window.devicePixelRatio / (px / diag)) * 25.4;
          })()`,
        );
        if (mm === null) {
          fail(`${surface}: EMPTY MATCH — no DONE control found to measure 27-F8 against`);
        } else {
          targetsMeasured += 1;
          process.stdout.write(
            `  [${panel.label}] 96 dp kitchen target = ${mm.toFixed(2)} mm of glass\n`,
          );
          if (mm < KITCHEN_MM - KITCHEN_MM_TOLERANCE) {
            fail(
              `${surface}: 27-F8 IS BROKEN ON THE GLASS — the bump target measures ` +
                `${mm.toFixed(2)} mm and the kitchen row's floor is ${KITCHEN_MM} mm. ` +
                "27-F68 (b): the millimetres are what the FR IS; never trim them to fit.",
            );
          }
        }
      }
    }

    /**
     * `27-F28` — the capacity this panel yields, PRINTED. It is a statement and never a
     * threshold: the FR's amendment makes a 1.5-ticket panel supported and honestly labelled.
     */
    const glassMm =
      (panel.height / (Math.hypot(panel.width, panel.height) / panel.diagonalIn)) * 25.4;
    process.stdout.write(
      `  [${panel.label}] ${glassMm.toFixed(0)} mm of glass → ${ticketsPerPage(glassMm)} ticket(s) ` +
        `per page at 1.5 m (27-F28)\n`,
    );
  }

  // `24-F14` empty-match protection on the sweep itself: rename a panel or a state and this
  // hard-fails rather than reporting a clean run over nothing.
  if (surfaces < PANELS.length * STATES.length) {
    fail(`EMPTY MATCH — ${surfaces} surfaces measured, ${PANELS.length * STATES.length} expected`);
  }
  if (readOnlySurfaces === 0) fail("EMPTY MATCH — 03-F24's read-only state was never rendered");
  if (emptySurfaces === 0) fail("EMPTY MATCH — the empty queue was never rendered");
  if (bumpControls === 0) fail("EMPTY MATCH — 03-F16's bump control was never measured");
  if (pagersDrawn === 0) fail("EMPTY MATCH — 03-F46's pager was never drawn on any panel");
  if (targetsMeasured === 0) fail("EMPTY MATCH — 27-F8's kitchen target was never measured");

  process.stdout.write(
    `\npass layout: ${surfaces} surfaces, ${controls} controls, ${bumpControls} bump controls, ` +
      `${pagersDrawn} paged surfaces, ${targetsMeasured} 27-F8 targets measured\n`,
  );

  if (failures.length > 0) {
    process.stdout.write(`\nPASS LAYOUT GATE FAILED — ${failures.length} violation(s)\n`);
    for (const line of failures) process.stdout.write(`  ${line}\n`);
    app.exit(1);
    return;
  }
  process.stdout.write("\nPASS LAYOUT GATE PASSED\n");
  app.exit(0);
};

app.whenReady().then(
  () => {
    run().catch((error: unknown) => {
      // `T-01-07` — a LOUD failure, never a skip. A headless CI with no display is an environment
      // prerequisite and must look like one, not like a green run.
      process.stdout.write(`\nPASS LAYOUT GATE ERRORED: ${String(error)}\n`);
      app.exit(1);
    });
  },
  () => app.exit(1),
);
