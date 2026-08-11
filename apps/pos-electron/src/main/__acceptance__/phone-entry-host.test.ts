// SEAM ASSERTIONS for `02-F27`/`02-F28` — **written from a MUTATION RESULT, not from a reading.**
//
// PROVENANCE (`24 §3`): written by the IMPLEMENTER, deliberately and on precedent.
// `__acceptance__/phone-entry-seam.test.ts` and `renderer/phone-entry.dom.test.tsx` are the
// independent oracle for this feature and are read-only to this session; they prove the SEAM
// behaves. This file proves the shipped APPLICATION reaches it, which is a different claim and the
// one this wave keeps losing. Same instrument, same justification and the same section names as
// `availability-seam.test.ts` §G/§H, `line-advance-seam.test.ts` §A and `print-ack-audit.test.ts`
// §A — each of which exists because a mutant survived.
//
// ── THE FOUR SURVIVORS, MEASURED RATHER THAN IMAGINED ───────────────────────────────────────
//
// With the feature complete and all 782 `pos-electron` tests green, four SEAM mutants — each one
// deleting a wire rather than changing a rule — killed **nothing**:
//
//   M1  `Counter.tsx` never calls `recordCustomer`      → 782/782 pass. `02-F27`'s inline
//                                                          creation becomes decorative: the
//                                                          `Save caller` tile is drawn, tapped,
//                                                          and files nobody.
//   M2  `index.ts` binds the channel to the RAW gateway → 782/782 pass. Commandment 8 bypassed;
//                                                          `customer.created` reaches the ledger
//                                                          with no matrix verdict at all.
//   M3  the preload stops serving `lookupCustomer`      → 782/782 pass.
//   M4  `index.ts` registers no lookup handler          → 782/782 pass.
//
// For contrast, and it is the contrast that shows these are the right four: the mutants that
// change a RULE all die to the oracle — a second normalizer at the writer kills 2 tests, and
// deleting `customer.created`'s `WRITE_ACTIONS` row kills 1. The logic is well covered. The WIRES
// were covered by nothing, which is `AGENTS.md`'s named defect exactly: *"tests exercise a module
// directly and nothing asserts the application reaches it"*.
//
// ── WHAT A SOURCE READ CAN AND CANNOT DO, SAID PLAINLY ──────────────────────────────────────
//
// §A and §B are SOURCE READS. `main/index.ts` builds an Electron app at module scope and no suite
// in this package can import it, so this is the only instrument available — the same admission
// `availability-seam.test.ts` §G makes about itself. It is weak: it cannot tell a wired handler
// from a commented-out one. §C is therefore BEHAVIOURAL and drives the shipped `Counter` through
// its own control, because M1 — the one that makes the feature decorative — is the survivor worth
// killing properly rather than by grep.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = (rel: string): string => readFileSync(new URL(rel, import.meta.url).pathname, "utf8");

const INDEX = src("../index.ts");
const PRELOAD = src("../../preload/index.ts");

/** The handler body for one channel, so an assertion cannot match a different handler's wiring. */
const handlerBody = (channel: string): string => {
  const at = INDEX.indexOf(`CHANNELS.${channel}`);
  expect(at, `no ${channel} channel is wired in index.ts at all`).toBeGreaterThan(-1);
  return INDEX.slice(at, at + 400);
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE SHIPPED HOST WIRES BOTH CHANNELS (the M3 and M4 survivors)
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 02-F27 — main serves the customer file and the preload can reach it", () => {
  it("registers a handler for the LOOKUP channel", () => {
    // M4. Without this the renderer's `lookupCustomer` rejects on every keystroke, the caller
    // strip never answers, and `02-F28`'s repeat customer is invisible — while every test passes.
    expect(INDEX).toMatch(/ipcMain\.handle\(\s*CHANNELS\.lookupCustomer/);
    expect(handlerBody("lookupCustomer")).toMatch(/gateway\.lookupCustomer\(/);
  });

  it("registers a handler for the RECORD channel", () => {
    expect(INDEX).toMatch(/ipcMain\.handle\(\s*CHANNELS\.recordCustomer/);
  });

  it("the preload bridge serves both", () => {
    // M3, and the other half of one seam: main can wire a channel and the renderer still never
    // reach it. Both members are OPTIONAL on `RestosBridge` (three older oracle harnesses close
    // with `satisfies RestosBridge`), so the TYPE cannot carry this — which is precisely the hole
    // `RestosBridge.toggleAvailability` records for itself, one channel over.
    expect(PRELOAD).toMatch(/lookupCustomer:\s*\(dialled\)\s*=>\s*ipcRenderer\.invoke/);
    expect(PRELOAD).toMatch(/recordCustomer:\s*\(req\)\s*=>\s*ipcRenderer\.invoke/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — COMMANDMENT 8 IS ON THE WIRE, NOT ONLY IN THE WRAPPER (the M2 survivor)
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B commandment 8 / 02-F47 — the record channel is bound to the AUTHORIZED writes", () => {
  it("binds `writes.recordCustomer`, never the raw gateway", () => {
    // M2, and it is the most dangerous of the four because it looks correct in review: the guard
    // exists, is tested, and simply is not on the path. `phone-entry-seam.test.ts` §F asserts the
    // WRAPPER's verdict and would keep passing — it tests `authorizeWrites`, not the wiring.
    // `01-F24` scopes customer data and `02-F47` decides who may write it; a handler wired
    // straight to the gateway appends `customer.created` for a storekeeper, or for a LOCKED
    // device, with no verdict asked.
    const body = handlerBody("recordCustomer");
    expect(body).toMatch(/writes\.recordCustomer\(req\)/);
    expect(body).not.toMatch(/gateway\.recordCustomer/);
  });

  it("the LOOKUP is deliberately NOT wrapped, and that asymmetry is asserted rather than assumed", () => {
    // The anti-scope half. A reader who saw `writes.` above could "fix" the read to match, so the
    // reason is pinned here: `authorizeReads` narrows exactly one seam because exactly one FR asks
    // for a narrowing (`02-F23`, "cashiers see only their own shifts"). No FR scopes the customer
    // file below the org, `01-F24` already scopes it TO the org, and `openOrders`/`menu`/
    // `kitchenQueue` are served unwrapped for the same reason. This test fails the day someone
    // routes it through `reads` without an FR — which is the moment that decision needs stating.
    expect(handlerBody("lookupCustomer")).not.toMatch(/reads\.lookupCustomer/);
  });

  it("notifies the renderer after a record, so the caller she just filed is KNOWN", () => {
    // The fold moved and the caller strip is reading it. Without this the surface goes on saying
    // "New caller" for the customer it has just created, and the operator taps Save again — a
    // second permanent row for one human (`01-F1`), caused by the screen not updating.
    expect(handlerBody("recordCustomer")).toMatch(/notifyChanged\(\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — THE SCREEN ACTUALLY CALLS IT (the M1 survivor, killed BEHAVIOURALLY)
//
// This is the one the oracle could not cover and it is not the oracle's fault: `phone-entry.dom
// .test.tsx` §D constrains the SHAPE of what is written *if something is* — deliberately, because
// no FR decides whether an unknown caller is filed automatically or on an explicit tap. That
// leaves "nothing is ever written" passing, and it is exactly the state M1 produces.
//
// The behavioural kill lives in `renderer/phone-entry-save.dom.test.tsx` — it must, because a
// happy-dom render is the only place this package can press a control — and that file carries the
// argument in full. What is left here is the half a DOM test cannot state: that the renderer sends
// the DIALLED digits and never `01-F23`'s key.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 02-F27 — `Save caller` reaches the trusted side", () => {
  it("Counter.tsx calls the bridge's `recordCustomer`, and normalizes nothing", () => {
    const counter = src("../../renderer/Counter.tsx");
    expect(counter).toMatch(/window\.restos\.recordCustomer\?\.\(/);
    // The renderer must NOT normalize: `01-F23`'s key is the writer's, and a second writer of it
    // on the untrusted end of `18 §9`'s bridge is how one customer becomes two identities.
    expect(counter).not.toMatch(/phone_e164:\s*[`"']\+/);
    // ⚠ **A THIRD ASSERTION STOOD HERE UNTIL THE ADVERSARY SESSION'S NEGATIVE CONTROL REDDENED
    // ON IT** (August 2026). It read
    // `expect(counter).toMatch(/recordCustomer\?\.\(\{\s*dialled,\s*name:\s*null\s*\}\)/)` and
    // matched the SHORTHAND PROPERTY in the source, so renaming the renderer's state variable —
    // `dialled` → `keyedDigits`, emitting the identical object — failed this file while all 790
    // other tests stayed green. That is `24 §3`'s second corollary exactly: a test that reddens
    // under a correct implementation is as damaging as a vacuous one, because the next session
    // reads a red and looks for a defect that is not there.
    //
    // It was REMOVED rather than loosened, on the evidence: `renderer/phone-entry-save.dom.test
    // .tsx` asserts `toMatchObject({ dialled: DIALLED, name: null })` on what actually crosses the
    // bridge, and every mutant this line killed (the call site deleted; the renderer normalizing;
    // `name: ""` for `name: null`) is killed by that behavioural assertion too — measured, all
    // three. It had no unique true kill and one unique false one. What remains above is the only
    // claim a source read can make that a DOM render cannot: the absence of a normalizer.
  });
});
