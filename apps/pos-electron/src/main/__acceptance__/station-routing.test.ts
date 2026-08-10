// ACCEPTANCE TESTS — `03-F22` / `03-F51`: the per-station fulfilment route, as CONFIGURATION.
//
// PROVENANCE (24 §3 step 2): authored by the session that wrote `03-F51` and implemented against
// it, which is NOT the `24 §3` split. Stated rather than glossed. The mitigation is the round-3
// law: every assertion here was mutation-checked, in-tree with byte-exact backups, and the matrix
// is in the session report. A suite nobody has tried to break is a suite nobody knows the strength
// of — and the mutant that matters most is the one that makes a REAL printer failure silent.
//
// THE FRs THIS FILE IS WRITTEN FROM, quoted so an assertion can be argued with:
//
//   03-F22 "KDS may run alongside printers (screen + paper) or replace them per station —
//          layer-2 choice."
//   03-F51 "The route, per station: `paper` · `screen` · `both` … A station routed `screen`
//          enqueues no print job at all: no bytes, no attempt, no retry budget, no band, no
//          `kot.print_failed`." / "A station with no route to the kitchen is refused at
//          CONFIGURATION time, never per order … Where the branch's device roster cannot be read
//          the check reports **unverifiable** rather than passing: an unknown is not a blessing."
//          / "A refused configuration never blocks a sale and never blocks the app … It is simply
//          not applied: the branch keeps the shipped default route, `paper`."
//   00 §5.7 a surface reports what is TRUE.
//   01-F17 a sale is never blocked. Nothing in this module may throw on a bad setting.
//
// This file tests the DECISION. `station-routing-seam.test.ts` tests that the product asks it.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_FULFILMENT_ROUTE,
  describeStationRouting,
  FULFILMENT_ROUTES,
  parseStationRoutes,
  resolveStationRouting,
  STATION_ROUTES_ENV,
  validateStationRoutes,
} from "../station-routing";

// ── A. the vocabulary is 03-F22's three cases and nothing else ───────────────────────────────

describe("A. 03-F22's route vocabulary", () => {
  it("is exactly paper, screen and both", () => {
    // A fourth value would be a station with no destination, which `03-F51` refuses rather than
    // offers. Making it unspellable is what keeps the refusal in one place.
    expect([...FULFILMENT_ROUTES]).toEqual(["paper", "screen", "both"]);
  });

  it("defaults to paper, which is the product BEFORE 03-F51 existed", () => {
    // Load-bearing in two places: an org that sets nothing sees no change, and a REFUSED
    // configuration falls back to the route whose failures are LOUD (`03-F5`) rather than to one
    // that silently swallows tickets.
    expect(DEFAULT_FULFILMENT_ROUTE).toBe("paper");
  });
});

// ── B. parsing: an unreadable entry is COLLECTED, never skipped ───────────────────────────────

describe("B. parsing the 00 §7 layer-2 key", () => {
  it("reads per-station routes and the `*` default", () => {
    const parsed = parseStationRoutes("*=screen, tandoor=paper ,grill=both");
    expect(parsed.default_route).toBe("screen");
    expect(parsed.routes.get("tandoor")).toBe("paper");
    expect(parsed.routes.get("grill")).toBe("both");
    expect(parsed.malformed).toEqual([]);
    // `*` sets the default and is never itself a station — a chit for a station literally called
    // `*` is not a thing, and letting it become one would make the default unreachable.
    expect(parsed.routes.has("*")).toBe(false);
  });

  it("an unset key is the shipped default and nothing else", () => {
    const parsed = parseStationRoutes(undefined);
    expect(parsed.default_route).toBe(DEFAULT_FULFILMENT_ROUTE);
    expect(parsed.routes.size).toBe(0);
    expect(parsed.malformed).toEqual([]);
  });

  it("collects every entry it cannot read, verbatim", () => {
    // The dangerous alternative is skipping: `grill=sceen` dropped on the floor leaves the grill
    // on paper for ever with nothing said. `00 §5.7` — the true thing is "I could not read this".
    const parsed = parseStationRoutes("grill=sceen,tandoor=paper,=screen,fryer");
    expect(parsed.malformed).toEqual(["grill=sceen", "=screen", "fryer"]);
    // and the readable entry is still read, so the refusal below is about the WHOLE value
    expect(parsed.routes.get("tandoor")).toBe("paper");
  });
});

// ── C. 03-F51's configuration-time refusal ────────────────────────────────────────────────────

describe("C. 03-F51 — a station with no route is refused when it is CONFIGURED", () => {
  const verdict = (configured: string | undefined, kitchen_screen: boolean | null) =>
    validateStationRoutes({ parsed: parseStationRoutes(configured), kitchen_screen });

  it("refuses a screen-only station at a branch with no pass screen and no KDS", () => {
    // THE case the FR was written for. Those lines would be cooked by nobody, and the counter
    // would never learn — a job that is never enqueued can never raise `03-F5`.
    const v = verdict("*=paper,tandoor=screen", false);
    expect(v.ok).toBe(false);
    if (v.ok) throw new Error("unreachable");
    expect(v.stations).toEqual(["tandoor"]);
    expect(v.reason).toContain("no route to the kitchen");
  });

  it("names the DEFAULT as an offender when the default itself is screen-only", () => {
    // `*=screen` is the whole configuration a printerless restaurant writes, so it is the entry
    // most likely to be wrong and must be nameable in the refusal.
    const v = verdict("*=screen", false);
    expect(v.ok).toBe(false);
    if (v.ok) throw new Error("unreachable");
    expect(v.stations).toEqual(["*"]);
  });

  it("does NOT refuse `both` — 03-F22's first case still prints, so its lines reach a cook", () => {
    expect(verdict("*=both", false)).toEqual({ ok: true, verified: true });
  });

  it("accepts screen-only where a pass screen or KDS IS registered", () => {
    expect(verdict("*=screen", true)).toEqual({ ok: true, verified: true });
  });

  it("refuses the WHOLE value when any entry is unreadable, rather than applying half of it", () => {
    const v = verdict("grill=sceen,tandoor=paper", true);
    expect(v.ok).toBe(false);
    if (v.ok) throw new Error("unreachable");
    expect(v.stations).toEqual(["grill=sceen"]);
    expect(v.reason).toContain(STATION_ROUTES_ENV);
  });

  it("an UNKNOWN roster is a third outcome and NOT a pass — 03-F51's 'not a blessing'", () => {
    // This is every shipped device today: `02-F31`'s registry reaches none (`01-F62`). Reporting
    // it as verified is the dishonesty `00 §5.7` forbids; refusing on it would make every
    // screen-only branch unconfigurable, which is this work's own harm inverted.
    const v = verdict("*=paper,grill=screen", null);
    expect(v).toEqual({ ok: true, verified: false, unverified: ["grill"] });
  });

  it("an unknown roster with NO screen-only station is fully verified", () => {
    // Nothing to be unsure about: every station prints, so the roster cannot change the answer.
    expect(verdict("*=paper,grill=both", null)).toEqual({ ok: true, verified: true });
  });
});

// ── D. resolution: a refusal is NOT APPLIED and never throws (01-F17) ────────────────────────

describe("D. resolving — 01-F17, a bad setting costs no sale and no app", () => {
  it("a refused configuration falls back to paper everywhere and reports why", () => {
    const routing = resolveStationRouting({ configured: "*=screen", kitchen_screen: false });
    expect(routing.source).toBe("refused");
    expect(routing.verdict.ok).toBe(false);
    // NOT applied. The station the operator tried to silence still prints, because paper that
    // cannot print says so within 45 s and a screen that does not exist says nothing, ever.
    expect(routing.routeFor("tandoor")).toBe("paper");
    expect(routing.routesToPaper("tandoor")).toBe(true);
  });

  it("applies an accepted configuration per station, and `both` still takes paper", () => {
    const routing = resolveStationRouting({
      configured: "*=screen,tandoor=paper,grill=both",
      kitchen_screen: true,
    });
    expect(routing.source).toBe("configured");
    expect(routing.routesToPaper("tandoor")).toBe(true);
    expect(routing.routesToPaper("grill")).toBe(true);
    // The unnamed station takes the default, which here is the screen.
    expect(routing.routesToPaper("fryer")).toBe(false);
  });

  it("an unset key leaves every station printing — no existing branch changes behaviour", () => {
    const routing = resolveStationRouting({ configured: undefined, kitchen_screen: null });
    expect(routing.source).toBe("default");
    expect(routing.routesToPaper("anything at all")).toBe(true);
  });

  it("never throws on any input, however malformed", () => {
    // `01-F17` at the seam: a typo in a setting may not take a till off the counter.
    for (const bad of ["", "   ", "=", ",,,", "a=b=c", "*=", "*=SCREEN", "grill=screen;fryer"]) {
      expect(() => resolveStationRouting({ configured: bad, kitchen_screen: false })).not.toThrow();
    }
    // `*=SCREEN` is not `*=screen`: the vocabulary is exact, so a case slip is REFUSED and
    // reported rather than coerced into a route the operator did not type.
    const shouty = resolveStationRouting({ configured: "*=SCREEN", kitchen_screen: true });
    expect(shouty.source).toBe("refused");
  });
});

// ── E. the boot line says the thing that is invisible from the screen (00 §5.7) ───────────────

describe("E. 00 §5.7 — the boot line", () => {
  it("a REFUSED configuration says it was not applied, and names the offenders", () => {
    const line = describeStationRouting(
      resolveStationRouting({ configured: "*=paper,grill=screen", kitchen_screen: false }),
    );
    expect(line).toContain("REFUSED");
    expect(line).toContain("NOT APPLIED");
    expect(line).toContain("grill");
    // The operator has to know the fallback is loud, or a band they did not expect reads as a
    // second fault rather than as this one.
    expect(line).toContain("03-F5");
  });

  it("an UNVERIFIED screen-only station is named, and the line says 03-F5 cannot warn", () => {
    // The quietest failure in the whole feature: a station routed to glass nobody is watching
    // produces no job, so `03-F5` is structurally unable to fire. The boot line is the only place
    // this can be said, so it must say it.
    const line = describeStationRouting(
      resolveStationRouting({ configured: "grill=screen", kitchen_screen: null }),
    );
    expect(line).toContain("NOT VERIFIED");
    expect(line).toContain("grill");
    expect(line).toMatch(/never created can never fail|cannot warn/);
  });

  it("names the environment variable an operator has to set, exactly once and correctly", () => {
    const line = describeStationRouting(
      resolveStationRouting({ configured: undefined, kitchen_screen: null }),
    );
    // `hardware-tier.ts`'s reason: the name appears in a line the operator is asked to act on,
    // and a name that disagreed with itself across two files sends them to set the wrong one.
    expect(line).toContain(STATION_ROUTES_ENV);
    expect(STATION_ROUTES_ENV).toBe("RESTOS_STATION_ROUTES");
  });
});
