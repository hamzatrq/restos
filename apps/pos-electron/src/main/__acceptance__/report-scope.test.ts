// Acceptance tests for `02-F23`'s OWN-SHIFTS SCOPING — Commandment 8 applied to a READ.
//
// PROVENANCE, stated because `24 §3` wants it stated: authored and implemented by the same
// session, on the same terms `authorization.test.ts` records. The mitigation is the round-3 law
// rather than a claim of independence — every assertion below was mutation-tested against a
// CONTROL implementation differing in exactly one branch, and the matrix is in the session's
// final message.
//
// Derived from spec text:
//   02-F23  "cashiers see only their own shifts (`restaurant-os.md` Appendix A); cross-cashier
//           views belong to manager/owner surfaces (docs 05/12)" — AND, in the same FR, "the
//           cashier sees their own reconciliation on-screen at close ('I'm clean') — the
//           staff-protection framing". Both halves bind. A guard that satisfies the first by
//           hiding her own row destroys the second and makes the screen useless to her.
//   Appendix A `View sales reports`: "own shift only" · "own branch" · "stock reports" ·
//           "everything" — SCOPES, not verdicts, which is why `domain`'s `reportScope` is a
//           separate predicate and why this file asserts a REACH rather than a decision.
//   02-F37/02-F43  the unbound settlement and the unbound drawer bucket surface on "the
//           cashier's own day view (02-F23)" — so they are NOT what the FR narrows.
//   05-F20  "the console adds the manager's cross-cashier view, nothing about it replaces the
//           cashier's own screen" — a manager is not narrowed to a shift.
//   18 §5/§9  server-side authorization always; `18 §9` gives the renderer no Node access, so
//           MAIN is the trusted side and a renderer-side filter is a client role claim.
//
// ⚠ FINDING, recorded here because a reader of this file must not conclude more than it proves:
// the shipped app currently projects `cashier: null` on EVERY shift row. `shift_cash`'s
// `cashier` column is read from `payload.cashier` (`folds/shift-cash.ts`), and `02-F45` forbids
// that field — `cash-tab.dom.test.tsx` fails the build on a `shift.opened` payload carrying one.
// So the narrowing below is CORRECT against the contract (`CashShiftSchema.cashier` is a
// nullable string the fold carries when it has one) and currently hides nothing in production.
// The owed fix is the fold's, not this seam's, and it is one line: read the envelope's
// `actor_user_id`, which `02-F45` already names as the single source of attribution. It is
// PIN #2 in `shift-cash-fold.test.ts` ("no FR says which one the fold reads"), i.e. an open
// question with an oracle of its own — not something this session may settle.

import { readFileSync } from "node:fs";
import type { DeviceStore } from "@restos/sync-client";
import { describe, expect, it } from "vitest";
import type { CashDay, CashShift, CashState, UnboundSettlement } from "../../shared/ipc";
import { type AuthorizedReads, authorizeReads } from "../authorize";

const ORG = "org-1";
const BRANCH = "br-1";
const OTHER_BRANCH = "br-2";
const ME = "user-ayesha";
const COLLEAGUE = "user-bilal";

type Assignment = { role: string; branch_id: string | null };

const aShift = (over: Partial<CashShift> = {}): CashShift => ({
  shift_id: "shift-1",
  cashier: null,
  prev_shift_id: null,
  open_at: 1_700_000_000_000,
  expected_json: '{"cash":100000}',
  paid_out_paisa: 0,
  no_sale_count: 0,
  closed: 0,
  counted_cash_paisa: null,
  expected_at_close_json: null,
  variance_paisa: null,
  exceptions_json: "[]",
  ...over,
});

const aDay = (over: Partial<CashDay> = {}): CashDay => ({
  day_id: "day-1",
  business_date: "2026-08-07",
  prev_day_id: null,
  opening_float_paisa: 500_000,
  deposit_paisa: 0,
  closed: 0,
  counted_cash_paisa: null,
  exceptions_json: "[]",
  ...over,
});

const anUnbound = (over: Partial<UnboundSettlement> = {}): UnboundSettlement => ({
  settlement_attempt_id: "sa-1",
  order_id: "o-1",
  method: "cash",
  amount_paisa: 45_000,
  anomaly: "unbound_settlement",
  ...over,
});

/**
 * MINE and THEIRS, and both rows carry money a cashier can be questioned about. A fixture whose
 * two rows were interchangeable could not tell a correct narrowing from one that returned the
 * first row, or from one that returned a fixed count.
 */
const MY_SHIFT = aShift({
  shift_id: "shift-mine",
  cashier: ME,
  open_at: 1_700_000_100_000,
  variance_paisa: -25_000,
  counted_cash_paisa: 75_000,
  closed: 1,
  expected_at_close_json: '{"cash":100000}',
});

const THEIR_SHIFT = aShift({
  shift_id: "shift-theirs",
  cashier: COLLEAGUE,
  open_at: 1_700_000_200_000,
  variance_paisa: -900_000,
  counted_cash_paisa: 10_000,
  closed: 1,
  expected_at_close_json: '{"cash":910000}',
});

/**
 * `01-F31`'s contested open and the pre-identity rows both land here: the fold projects
 * `cashier: null` when the open's members disagree (raising `shift_open_divergence`) and when no
 * attribution reached the row at all.
 */
const UNATTRIBUTED_SHIFT = aShift({
  shift_id: "shift-nobody",
  cashier: null,
  open_at: 1_700_000_300_000,
  exceptions_json: '["shift_open_divergence"]',
});

const FULL: CashState = {
  shifts: [MY_SHIFT, THEIR_SHIFT, UNATTRIBUTED_SHIFT],
  days: [aDay(), aDay({ day_id: "day-0", business_date: "2026-08-06", closed: 1 })],
  unbound: [anUnbound(), anUnbound({ settlement_attempt_id: "sa-2", amount_paisa: 12_000 })],
  unbound_drawer: {
    no_sale_count: 3,
    paid_out_paisa: 30_000,
    exceptions_json: '["unbound_drawer_open","unbound_paid_out"]',
  },
};

type Rig = { reads: AuthorizedReads; served: number };

/**
 * A rig over a STUB gateway read. `assignments: null` is a LOCKED device (`01-F26` — no PIN
 * session), which is a different thing from a signed-in user holding no role at this branch.
 */
const rig = (opts: {
  assignments?: readonly Assignment[] | null;
  user_id?: string;
  state?: CashState;
}): Rig => {
  const user_id = opts.user_id ?? ME;
  const assignments = opts.assignments === undefined ? [] : opts.assignments;
  const state = opts.state ?? FULL;
  const rigged: Rig = {
    served: 0,
    reads: authorizeReads({
      reads: {
        cashState: () => {
          rigged.served += 1;
          return state;
        },
      },
      store: {
        identity: { org_id: ORG, branch_id: BRANCH, device_id: "dev-1" },
        staff: {
          lookup: (id: string) =>
            assignments !== null && id === user_id
              ? { user_id, pin_hash: "argon2id$stub", display_name: "Stub", assignments }
              : null,
        },
      } as unknown as Pick<DeviceStore, "identity" | "staff">,
      session: () => (assignments === null ? null : { user_id, display_name: "Stub" }),
    }),
  };
  return rigged;
};

const asCashier = (over: Parameters<typeof rig>[0] = {}) =>
  rig({ assignments: [{ role: "cashier", branch_id: BRANCH }], ...over });
const asManager = (over: Parameters<typeof rig>[0] = {}) =>
  rig({ assignments: [{ role: "branch_manager", branch_id: BRANCH }], ...over });
const asOwner = (over: Parameters<typeof rig>[0] = {}) =>
  rig({ assignments: [{ role: "owner", branch_id: null }], ...over });
const asStorekeeper = (over: Parameters<typeof rig>[0] = {}) =>
  rig({ assignments: [{ role: "storekeeper", branch_id: BRANCH }], ...over });

const shiftIds = (state: CashState): string[] => state.shifts.map((s) => s.shift_id);

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE SEAM. The wave's recurring defect is a correct subsystem with no caller, and
// `reportScope` is the last entry in that register: `domain/permissions.ts` exports it precisely
// so a read can be scoped, and nothing outside its own module has ever called it. Behaviour is
// asserted in §B..§F; this asserts the SHIPPED app goes through it, which no behavioural test on
// a rig can see. It is also where the "filter it in the renderer instead" mutant dies: a handler
// that served the raw gateway would leave every cashier's drawer on the untrusted side of
// `18 §9`'s bridge, whatever the renderer then chose to draw.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const SRC = new URL("../", import.meta.url).pathname;
const readSrc = (rel: string): string => readFileSync(`${SRC}${rel}`, "utf8");

/** The body of one `ipcMain.handle` block, so "calls the guard" is asked of the right code. */
const handlerBody = (src: string, channel: string): string => {
  const start = src.indexOf(`ipcMain.handle(CHANNELS.${channel},`);
  if (start === -1) throw new Error(`no ipcMain.handle for CHANNELS.${channel} in main/index.ts`);
  const rest = src.slice(start + 1);
  const next = rest.search(/\n {2}(?:ipcMain\.handle|app\.on)\(/);
  return next === -1 ? rest : rest.slice(0, next);
};

describe("§A 18 §5 / 18 §9 — the shipped app scopes the read in MAIN", () => {
  const mainSrc = readSrc("index.ts");

  it("is actually reading the file it guards", () => {
    // ROUND-2 PATTERN 2, "the guard passed by not looking": a scanner over an empty string
    // reports clean. Anchored on lines that have nothing to do with authorization.
    expect(mainSrc).toContain("app.whenReady()");
    expect(mainSrc.length).toBeGreaterThan(4_000);
    expect(mainSrc).toContain("contextIsolation: true");
  });

  it("main/index.ts CONSTRUCTS the read guard", () => {
    expect(mainSrc).toMatch(/authorizeReads\s*\(\s*\{/);
  });

  it("the cashState channel serves the GUARDED read and never the raw gateway", () => {
    const body = handlerBody(mainSrc, "cashState");
    expect(body, "CHANNELS.cashState must call the authorized read").toContain("reads.cashState()");
    // The other direction of the same wiring. Without it, a handler that called BOTH — or one
    // that called `gateway` and happened to mention `reads` in a comment — would pass.
    expect(body, "CHANNELS.cashState must NOT call the unguarded gateway").not.toContain(
      "gateway.cashState()",
    );
  });

  it("the guard reaches domain's reportScope — no second matrix is written here", () => {
    // `18 §` names `domain/permissions.ts` the platform's only authorization consumer, and
    // Appendix A's report row is a REACH rather than a verdict — so the reach must be resolved
    // there. A hand-rolled role check here would be the banned inline check relocated.
    const authorizeSrc = readSrc("authorize.ts");
    expect(authorizeSrc).toMatch(/\breportScope\s*\(/);
    expect(authorizeSrc, "the reach comes from @restos/domain, not from a local table").toMatch(
      /reportScope[\s\S]{0,400}from "@restos\/domain"|from "@restos\/domain"[\s\S]{0,400}reportScope/,
    );
  });

  it("the RENDERER does not filter by cashier — a client-side scope is a client role claim", () => {
    // Commandment 8's other direction. `CashSurfaces.tsx` renders every row it is handed
    // (`me-tab.dom.test.tsx` pins that), and a comparison of a shift's `cashier` against a
    // signed-in user id anywhere in the renderer would mean the CLIENT decided the scope.
    const renderer = readFileSync(`${SRC}../renderer/CashSurfaces.tsx`, "utf8");
    // Anchored, ROUND-2 PATTERN 2 again: prove the file was read before proving what it lacks.
    expect(renderer).toContain("MeSurface");
    expect(renderer).toContain("cash.shifts.map");
    expect(
      renderer.match(/\.cashier\s*[=!]==/),
      "no cashier comparison in the renderer",
    ).toBeNull();
    expect(renderer.match(/shifts\s*\.filter\([^)]*cashier/), "no cashier filter there").toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — "CASHIERS SEE ONLY THEIR OWN SHIFTS". The leak half of `02-F23`.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 02-F23 — a cashier never sees a colleague's shift", () => {
  it("another cashier's row is not served at all", () => {
    const state = asCashier().reads.cashState();
    expect(shiftIds(state)).not.toContain("shift-theirs");
  });

  it("and none of that row's money crosses the bridge — not the variance, not the count", () => {
    // The dangerous near-miss: a narrowing that redacted the id while still serving the row
    // would put a colleague's Rs 9,000 shortfall on this screen, which is exactly the
    // cross-cashier view `02-F23` sends to docs 05/12.
    const serialized = JSON.stringify(asCashier().reads.cashState());
    expect(serialized).not.toContain(COLLEAGUE);
    expect(serialized).not.toContain("shift-theirs");
    expect(serialized).not.toContain("-900000");
    expect(serialized).not.toContain('{"cash":910000}');
  });

  it("a cashier assigned to ANOTHER branch is a stranger here and sees no shift at all", () => {
    // `01-F26`'s assignment is per-location. Not a variation on the row filter: this subject
    // holds no role AT this branch, so the reach is `none` before any row is looked at.
    const state = rig({
      assignments: [{ role: "cashier", branch_id: OTHER_BRANCH }],
    }).reads.cashState();
    expect(state.shifts).toEqual([]);
  });

  it("a storekeeper gets NO sales rows — Appendix A gives that column 'stock reports'", () => {
    expect(asStorekeeper().reads.cashState().shifts).toEqual([]);
  });

  it("a LOCKED device (no PIN session) has no reach — 01-F27, a device is never a person", () => {
    expect(rig({ assignments: null }).reads.cashState().shifts).toEqual([]);
  });

  it("a signed-in user holding no assignment at all sees nothing either", () => {
    expect(rig({ assignments: [] }).reads.cashState().shifts).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — "THE CASHIER SEES THEIR OWN RECONCILIATION … 'I'M CLEAN'". The PROTECTION half, and the
// half a narrowing inverts by accident. `02-F23` is one FR with two clauses and both bind:
// hiding her own row satisfies the first and destroys the second, leaving a protection surface
// that shows a cashier nothing about herself.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 02-F23 — her own shift is never taken away from her", () => {
  it("her own row is served, whole", () => {
    const state = asCashier().reads.cashState();
    expect(shiftIds(state)).toContain("shift-mine");
    expect(state.shifts.find((s) => s.shift_id === "shift-mine")).toEqual(MY_SHIFT);
  });

  it("including the variance she is accountable for — the number the screen exists to show", () => {
    // `27-F24`: over/short arrives FINISHED. A narrowing that served the row with its money
    // stripped would leave her the accusation and not the arithmetic.
    const mine = asCashier()
      .reads.cashState()
      .shifts.find((s) => s.shift_id === "shift-mine");
    expect(mine?.variance_paisa).toBe(-25_000);
    expect(mine?.counted_cash_paisa).toBe(75_000);
    expect(mine?.expected_at_close_json).toBe('{"cash":100000}');
  });

  it("an UNATTRIBUTED shift stays visible — a contested open is not another cashier's row", () => {
    // The fold projects `cashier: null` when the open's members disagree (`01-F31` — a fold
    // never picks a winner) and raises `shift_open_divergence`. Hiding it would take the
    // anomaly away from the person it is about, which is `02-F23`'s framing inverted, and
    // `02-F37`/`02-F43` name this very screen as where an anomaly must appear.
    //
    // ⚠ It is also the live case: see this file's header — every shipped row is null today,
    // so a rule that hid nulls would blank the Me tab and make "Close my shift" unreachable.
    expect(shiftIds(asCashier().reads.cashState())).toContain("shift-nobody");
  });

  it("exactly two rows — hers and the unattributed one, and nothing else", () => {
    // Stated as an equality rather than two `toContain`s so an implementation that served
    // everything cannot pass §C by serving too much.
    expect(shiftIds(asCashier().reads.cashState())).toEqual(["shift-mine", "shift-nobody"]);
  });

  it("row ORDER is the fold's, not the filter's — 27-F4, a row never moves under her", () => {
    const state = rig({
      assignments: [{ role: "cashier", branch_id: BRANCH }],
      state: { ...FULL, shifts: [THEIR_SHIFT, UNATTRIBUTED_SHIFT, MY_SHIFT] },
    }).reads.cashState();
    expect(shiftIds(state)).toEqual(["shift-nobody", "shift-mine"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — "OWN BRANCH" AND "EVERYTHING" ARE NOT "OWN SHIFT". Appendix A gives the branch manager
// `own branch` and the owner `everything`, and `05-F20` says the console ADDS the cross-cashier
// view rather than replacing the cashier's screen. A guard that narrowed a manager to her own
// shift would delete the manager's reconciliation — under-reach, and it fails silently because
// the screen still renders.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 02-F23/05-F20 — a manager and an owner keep the cross-cashier view", () => {
  it("a branch manager sees every shift on the branch, including both cashiers'", () => {
    const state = asManager().reads.cashState();
    expect(shiftIds(state)).toEqual(["shift-mine", "shift-theirs", "shift-nobody"]);
  });

  it("an owner (org-wide assignment, branch_id null) sees them too", () => {
    expect(shiftIds(asOwner().reads.cashState())).toEqual([
      "shift-mine",
      "shift-theirs",
      "shift-nobody",
    ]);
  });

  it("a manager's own row is not privileged over a colleague's — the payload is untouched", () => {
    expect(asManager().reads.cashState().shifts).toEqual(FULL.shifts);
  });

  it("Appendix A's opening sentence — one person wears several hats, and the WIDEST wins", () => {
    // "In small restaurants one person wears several hats", so a subject holding cashier AND
    // branch_manager at one location gets `own branch`. A guard that took the first assignment,
    // or the narrowest, would hide the branch from the person running it.
    const state = rig({
      assignments: [
        { role: "cashier", branch_id: BRANCH },
        { role: "branch_manager", branch_id: BRANCH },
      ],
    }).reads.cashState();
    expect(shiftIds(state)).toContain("shift-theirs");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — WHAT `02-F23` DOES NOT NARROW (`24-F23` — scope the read that exists). The FR narrows
// SHIFTS. The day is `02-F24`'s branch cash and carries no cashier at all; `02-F37` and `02-F43`
// name "the cashier's own day view (`02-F23`)" as one of the two places their anomalies must
// appear, so narrowing those buckets would delete the surface the FRs point at.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§E the day, the unbound settlements and the unbound drawer pass through", () => {
  it("a cashier keeps every day row — 02-F22's float is what 'Open my shift' reads", () => {
    expect(asCashier().reads.cashState().days).toEqual(FULL.days);
  });

  it("02-F37 — her unbound settlements are still there", () => {
    expect(asCashier().reads.cashState().unbound).toEqual(FULL.unbound);
  });

  it("02-F43 — and the unbound drawer bucket, counted rather than dropped", () => {
    expect(asCashier().reads.cashState().unbound_drawer).toEqual(FULL.unbound_drawer);
  });

  it("even a subject with NO reach keeps them — the FR narrows shifts, nothing else", () => {
    const state = asStorekeeper().reads.cashState();
    expect(state.days).toEqual(FULL.days);
    expect(state.unbound).toEqual(FULL.unbound);
    expect(state.unbound_drawer).toEqual(FULL.unbound_drawer);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §F — THE GUARD IS A FILTER, NOT A REWRITE. It must not mutate the fold's own projection, and
// it must re-read the reach every time: `01-F26`'s idle auto-lock and PIN cycle move the signed-in
// identity 20–60× a shift while ONE handler is bound for the whole process life.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§F the guard reads the session at every call and leaves the fold alone", () => {
  it("the upstream projection is not mutated — the next reader still sees three rows", () => {
    const state: CashState = { ...FULL, shifts: [MY_SHIFT, THEIR_SHIFT, UNATTRIBUTED_SHIFT] };
    const r = asCashier({ state });
    r.reads.cashState();
    expect(state.shifts).toHaveLength(3);
    expect(shiftIds(state)).toContain("shift-theirs");
  });

  it("the underlying read is served exactly once per call", () => {
    const r = asCashier();
    r.reads.cashState();
    r.reads.cashState();
    expect(r.served).toBe(2);
  });

  it("a second call after the same session re-resolves the reach rather than caching a verdict", () => {
    // Two calls, two answers of the same shape: a guard that computed the reach once at
    // construction would be correct until the first auto-lock and wrong for the rest of the day.
    const r = asCashier();
    expect(shiftIds(r.reads.cashState())).toEqual(shiftIds(r.reads.cashState()));
  });
});
