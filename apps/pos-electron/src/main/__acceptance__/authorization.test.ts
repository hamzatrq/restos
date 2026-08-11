// Acceptance tests for COMMANDMENT 8 on the counter — the POS's first production call into the
// `domain` permission matrix.
//
// PROVENANCE, stated because `24 §3` wants it stated: authored and implemented by the same
// session. The mitigation is the round-3 law rather than a claim of independence — every
// assertion below was mutation-tested against a CONTROL implementation differing in exactly one
// branch, and the matrix is reported in the session's final message. Where a test could pass
// vacuously it is anchored on something the implementation cannot also supply (§A reads source
// and asserts against BOTH directions of the same wiring; §G and §H assert the outcome VALUE,
// not merely that something was refused).
//
// Derived from spec text:
//   02-F22  day open/close + float entry require manager/owner permission; a cashier session
//           cannot execute them. Shift open/close is per CASHIER and deliberately not covered.
//   02-F20  manager escalation for void-after-KOT, comp, discount above threshold, price
//           override — TWO equivalent paths, so `escalate` is a third outcome and not a refusal.
//   02-F26  paid-outs; 05-F19 above the org threshold requires approval.
//   02-F38  a requester never approves their own request — refused SERVER-SIDE, not merely
//           hidden ("a client that renders it anyway must still fail").
//   02-F43  drawer events are never blocked; 02-F21 they are logged and counted.
//   01-F27  authorization on every operation; a device identity is never a user identity.
//   18 §5/§9  server-side authorization always; the renderer is the untrusted end of the bridge.

import { readFileSync } from "node:fs";
import type { DeviceStore } from "@restos/sync-client";
import { describe, expect, it, vi } from "vitest";
import { resolveAging } from "../../../../pass-kds/src/main/aging";
import {
  type AuthorizedWrites,
  authorizeWrites,
  PAID_OUT_APPROVAL_THRESHOLD_PAISA,
  type WriteRefusal,
} from "../authorize";
import { createGateway } from "../gateway";

const ORG = "org-1";
const BRANCH = "br-1";
const OTHER_BRANCH = "br-2";
const ME = "user-me";

type Assignment = { role: string; branch_id: string | null };

type Rig = {
  writes: AuthorizedWrites;
  appended: unknown[];
  lines: unknown[];
};

/**
 * A rig over a STUB gateway, so a permitted write is observable as a delegation and a refused
 * one as a delegation that never happened. `assignments: null` is a LOCKED device (`01-F26` —
 * no PIN session), which is a different thing from a signed-in user holding no role.
 */
const rig = (opts: {
  assignments?: readonly Assignment[] | null;
  user_id?: string;
  org_id?: string;
  threshold?: number;
}): Rig => {
  const appended: unknown[] = [];
  const lines: unknown[] = [];
  const user_id = opts.user_id ?? ME;
  const assignments = opts.assignments === undefined ? [] : opts.assignments;
  const store = {
    identity: { org_id: opts.org_id ?? ORG, branch_id: BRANCH, device_id: "dev-1" },
    staff: {
      lookup: (id: string) =>
        assignments !== null && id === user_id
          ? { user_id, pin_hash: "argon2id$stub", display_name: "Stub", assignments }
          : null,
    },
  } as unknown as Pick<DeviceStore, "identity" | "staff">;
  return {
    appended,
    lines,
    writes: authorizeWrites({
      writes: {
        append: vi.fn((req: unknown) => {
          appended.push(req);
          return { id: "evt-1" };
        }),
        addLine: vi.fn((req: unknown) => {
          lines.push(req);
          return { id: "evt-2" };
        }),
        // `02-F7`/`02-F46` — the third guarded write channel (August 2026).
        toggleAvailability: vi.fn(() => ({ id: "evt-3" })),
        // `02-F27`/`02-F47` — the fourth (August 2026).
        recordCustomer: vi.fn(() => ({ id: "evt-4" })),
      },
      store,
      session: () => (assignments === null ? null : { user_id, display_name: "Stub" }),
      paidOutApprovalThresholdPaisa: opts.threshold ?? PAID_OUT_APPROVAL_THRESHOLD_PAISA,
    }),
  };
};

const asCashier = (over: Parameters<typeof rig>[0] = {}) =>
  rig({ assignments: [{ role: "cashier", branch_id: BRANCH }], ...over });
const asManager = (over: Parameters<typeof rig>[0] = {}) =>
  rig({ assignments: [{ role: "branch_manager", branch_id: BRANCH }], ...over });
const asOwner = (over: Parameters<typeof rig>[0] = {}) =>
  rig({ assignments: [{ role: "owner", branch_id: null }], ...over });

const event = (type: string, payload: Record<string, unknown> = {}) => ({
  type,
  payload,
  refs: [],
});

/**
 * The refusal a write produced — and it FAILS LOUDLY on the two things that would otherwise pass
 * silently: a write that was ALLOWED, and a throw that came from somewhere other than the guard.
 * Without both, "expect it to throw" would be satisfied by a typo in a stub.
 */
const refusalOf = (run: () => unknown): WriteRefusal => {
  try {
    run();
  } catch (error) {
    const refusal = (error as { refusal?: WriteRefusal }).refusal;
    if (refusal === undefined) {
      throw new Error(`threw, but not an authorization refusal: ${String(error)}`);
    }
    return refusal;
  }
  throw new Error("the write was ALLOWED — no authorization refusal was raised");
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE SEAM. The wave's recurring defect is a correct subsystem with no caller, and this is
// the assertion that catches it: `domain/permissions.ts` had 89 tests, 28/28 killed mutants and
// ZERO production callers for its whole life. Behaviour is asserted in §B..§I; this asserts the
// shipped app goes through it, which no behavioural test can see.
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

describe("§A 18 §5 / 18 §9 — the shipped app REACHES the matrix", () => {
  const mainSrc = readSrc("index.ts");

  it("is actually reading the file it guards", () => {
    // ROUND-2 PATTERN 2, "the guard passed by not looking": a scanner over an empty string
    // reports clean. Anchored on lines that have nothing to do with authorization.
    expect(mainSrc).toContain("app.whenReady()");
    expect(mainSrc.length).toBeGreaterThan(4_000);
    expect(mainSrc).toContain("contextIsolation: true");
  });

  it("main/index.ts CONSTRUCTS the guard and passes the threshold EXPLICITLY", () => {
    expect(mainSrc).toMatch(/authorizeWrites\s*\(\s*\{/);
    // `05-F19` + `01-F60`'s precedent: an optional completeness input means a forgetful caller
    // silently skips the check, so the threshold is required and must be visibly supplied.
    expect(mainSrc).toMatch(
      /paidOutApprovalThresholdPaisa\s*:\s*PAID_OUT_APPROVAL_THRESHOLD_PAISA/,
    );
  });

  it("both renderer WRITE channels go through the guard, and neither reaches the raw gateway", () => {
    for (const [channel, method] of [
      ["append", "append"],
      ["addLine", "addLine"],
    ] as const) {
      const body = handlerBody(mainSrc, channel);
      expect(body, `CHANNELS.${channel} must call the authorized writes`).toContain(
        `writes.${method}(req)`,
      );
      // The other direction of the same wiring. Without it, a handler that called BOTH — or one
      // that called `gateway` and happened to mention `writes` in a comment — would pass.
      expect(body, `CHANNELS.${channel} must NOT call the unguarded gateway`).not.toContain(
        `gateway.${method}(req)`,
      );
    }
  });

  it("the KOT printer keeps the RAW gateway — a print failure is a device fact, not an act", () => {
    // The opposite mistake, and it is not hypothetical: authorizing `kot.print_failed` would
    // silence `03-F5`'s band on a locked till, which is the one moment the counter most needs to
    // learn that food is not being cooked. Appendix A has no row for it and `02-F19` does not
    // list it, so inventing one would be the `24-F23` widening this task was told to avoid.
    const printer = mainSrc.slice(mainSrc.indexOf("createKotPrinter({"));
    expect(printer).toMatch(/append:\s*\(type,\s*payload\)\s*=>\s*\{\s*\n\s*gateway\.append\(/);
  });

  it("the dev roster carries a MANAGER, or 02-F22's day open is unreachable on this device", () => {
    // Not cosmetic: `seedDevStaff` assigned every seeded member `cashier`, and the guard makes a
    // cashier unable to open the day. A roster with no manager would leave `pnpm start` with a
    // day that can never be opened, which reads as a bug in the guard rather than the FR.
    expect(mainSrc).toContain('role: "branch_manager"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — 02-F22's ROLE GUARD. "Day open/close and float entry require manager/owner permission
// (`restaurant-os.md` Appendix A) — a cashier session cannot execute them."
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 02-F22 — a cashier session cannot open or close the day", () => {
  const DAY_EVENTS = [
    ["day.opened", { day_id: "d-1", opening_float_paisa: 500_000, prev_day_id: null }],
    ["day.closed", { day_id: "d-1", counted_cash_paisa: 900_000 }],
    // `02-F24` — "manager cash count AND deposit record". The deposit is the second half of one
    // act, so it cannot be a lesser permission than the close it belongs to.
    ["cash.deposit_recorded", { day_id: "d-1", amount_paisa: 900_000 }],
  ] as const;

  it("refuses every day event for a cashier, and the ledger is never touched", () => {
    for (const [type, payload] of DAY_EVENTS) {
      const r = asCashier();
      const refusal = refusalOf(() => r.writes.append(event(type, payload)));
      expect(refusal.outcome, `${type} must be DENIED for a cashier`).toBe("deny");
      expect(refusal.action).toBe("day.open_close");
      // The float never reached an append-only ledger `01-F1` allows no edit to.
      expect(r.appended).toEqual([]);
    }
  });

  it("allows the same three for a branch manager and for an owner", () => {
    for (const [type, payload] of DAY_EVENTS) {
      for (const r of [asManager(), asOwner()]) {
        r.writes.append(event(type, payload));
        expect(r.appended).toHaveLength(1);
        expect(r.appended[0]).toMatchObject({ type });
      }
    }
  });

  it("the float ENTRY is the same act as the open — a cashier cannot smuggle one in", () => {
    // `02-F22` names "day open/close AND float entry" as one guarded pair, and the float travels
    // on `day.opened`. Asserted separately so a mapping that guarded only `day.closed` fails.
    const r = asCashier();
    expect(
      refusalOf(() => r.writes.append(event("day.opened", { opening_float_paisa: 1 }))),
    ).toMatchObject({ outcome: "deny", action: "day.open_close" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — WHAT THE GUARD MUST NOT BREAK. `02-F22`/`02-F23` put the shift in the CASHIER's own
// hands, `02-F43` forbids blocking a drawer event, and `01-F17` forbids blocking a sale. A guard
// that refused these would be a worse defect than the one it fixed.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C the counter loop still runs end to end for a cashier", () => {
  it("order → line → confirm → settle, all allowed", () => {
    const r = asCashier();
    r.writes.append(event("order.created", { order_id: "o-1" }));
    r.writes.addLine({ order_id: "o-1", item_id: "i-1", qty: 1 });
    r.writes.append(event("order.confirmed", { order_id: "o-1" }));
    r.writes.append(event("payment.recorded", { order_id: "o-1", amount_paisa: 45_000 }));
    expect(r.appended).toHaveLength(3);
    expect(r.lines).toHaveLength(1);
  });

  it("02-F22/02-F23 — she opens and closes HER OWN shift", () => {
    const r = asCashier();
    r.writes.append(event("shift.opened", { shift_id: "s-1", prev_shift_id: null }));
    r.writes.append(event("shift.closed", { shift_id: "s-1", counted_cash_paisa: 100 }));
    expect(r.appended).toHaveLength(2);
  });

  it("02-F21/02-F43 — a no-sale drawer open is never refused, for ANY till role", () => {
    // `02-F43` in terms: a refusal produces "an unbound no-sale that is stored and uncounted …
    // money vanishing … with nothing to point at". The denied role still opens the drawer, with
    // a key, and the ledger learns nothing — strictly worse than the act this permits.
    for (const r of [
      asCashier(),
      asManager(),
      asOwner(),
      rig({ assignments: [{ role: "storekeeper", branch_id: BRANCH }] }),
    ]) {
      r.writes.append(event("cash.drawer_opened", { reason: "no_sale", shift_id: null }));
      expect(r.appended).toHaveLength(1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D/§E — 01-F27: a device identity is never promoted into a user identity, and an assignment is
// held per (org, location).
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 01-F27 — a locked device is a subject with no authority", () => {
  it("refuses every write when no PIN session is in", () => {
    for (const type of ["order.created", "payment.recorded", "shift.opened", "day.opened"]) {
      const r = rig({ assignments: null });
      expect(refusalOf(() => r.writes.append(event(type, {})))).toMatchObject({ outcome: "deny" });
      expect(r.appended).toEqual([]);
    }
  });

  it("refuses addLine too — the highest-frequency write is not the exception", () => {
    const r = rig({ assignments: null });
    expect(
      refusalOf(() => r.writes.addLine({ order_id: "o-1", item_id: "i-1", qty: 1 })),
    ).toMatchObject({ outcome: "deny", action: "order.create" });
    expect(r.lines).toEqual([]);
  });
});

describe("§E 01-F26 — an assignment is per (org, location)", () => {
  it("a cashier assigned to another branch is a stranger at this one", () => {
    const r = rig({ assignments: [{ role: "cashier", branch_id: OTHER_BRANCH }] });
    expect(
      refusalOf(() => r.writes.append(event("order.created", { order_id: "o-1" }))),
    ).toMatchObject({ outcome: "deny" });
  });

  it("an org-wide assignment carries into this branch", () => {
    const r = rig({ assignments: [{ role: "cashier", branch_id: null }] });
    r.writes.append(event("order.created", { order_id: "o-1" }));
    expect(r.appended).toHaveLength(1);
  });

  it("a role string the matrix does not carry grants NOTHING (01-F48 fail-closed)", () => {
    // `StaffAssignment.role` is a plain `string` off the sync chain, so this is a real wire
    // value, not a hypothetical: it must not be coerced into the nearest column.
    const r = rig({ assignments: [{ role: "regional_manager", branch_id: BRANCH }] });
    expect(refusalOf(() => r.writes.append(event("day.opened", {})))).toMatchObject({
      outcome: "deny",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §F — 01-F27 puts authorization on EVERY operation, so an event type the matrix does not carry
// is refused rather than waved through.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§F fail-closed — an unmapped event type is refused, not passed through", () => {
  it("refuses a type with no matrix action, even for an owner", () => {
    // ⚠ `availability.changed` WAS the middle entry and is no longer unmapped: `02-F46` gave it
    // `availability.toggle` in August 2026 so `02-F7`'s counter toggle could exist at all. Left
    // in place it would be a green test defending a rule the FR overruled — the exact failure
    // `AGENTS.md` records for `catalog-pricing.test.ts:394`, which is why the suites encoding the
    // old rule were grepped the same day. `receipt.printed` replaces it: still unmapped, still an
    // `01 §4` catalogued type, so the arity and the property are unchanged.
    for (const type of ["staff.clocked_in", "receipt.printed", "catalog.changed"]) {
      const r = asOwner();
      const refusal = refusalOf(() => r.writes.append(event(type, {})));
      expect(refusal.outcome).toBe("deny");
      // `action: null` is the sentence "this type carries no permission action at all", which is
      // a different refusal from "the matrix said no" and must stay tellable apart.
      expect(refusal.action).toBeNull();
      expect(r.appended).toEqual([]);
    }
  });

  it("02-F20 — `discount.recorded` is refused, and that is a RECORDED GAP", () => {
    // The matrix carries both discount cells but nothing here can tell them apart: there is no
    // `canDiscount` predicate on `canPayOut`'s pattern and no org threshold in `00 §7` layer 2.
    // Answering anyway would be answering without the input that decides the question, which is
    // exactly why `can()` already refuses `cash.paid_out`. Pinned so the day a discount surface
    // lands, this test is what tells its author the predicate is owed first.
    expect(refusalOf(() => asOwner().writes.append(event("discount.recorded", {})))).toMatchObject({
      outcome: "deny",
      action: null,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §K — COMPOSED WITH THE REAL GATEWAY. Everything above runs the guard over a stub delegate,
// which proves the decision and not the composition. This section puts `createGateway` behind it
// — the object `main/index.ts` actually wraps — so "refused" means the STORE was never reached.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§K the guard over the real gateway — a refusal never reaches the ledger", () => {
  const realRig = (assignments: readonly Assignment[]) => {
    const appended: { type: string }[] = [];
    const store = {
      identity: { org_id: ORG, branch_id: BRANCH, device_id: "dev-1" },
      openOrders: () => [],
      kitchenQueue: () => [],
      availability: () => [],
      branchTimeStatus: () => ({
        offset_ms: 0,
        basis: "branch",
        skew_ms: null,
        skew_flagged: false,
      }),
      append: vi.fn((input: { type: string }) => {
        appended.push(input);
        return { ...input, lamport_seq: 1 };
      }),
      staff: {
        lookup: (id: string) =>
          id === ME ? { user_id: ME, pin_hash: "argon2id$stub", assignments } : null,
      },
    } as unknown as DeviceStore;
    const session = () => ({ user_id: ME, display_name: "Stub" });
    const gateway = createGateway({
      store,
      catalog: () => null,
      menu: () => [],
      priceOf: () => 45_000,
      actor: "dev",
      session,
      deviceLabel: "Counter 1",
      training: false,
      reachability: () => ({ lan: "down", hub: "down", cloud: "down" }),
      blockedCursor: () => null,
      // 01-F56/DEC-SYNC-011 — the catalog refusal, required on GatewayDeps. Healthy here: this
      // harness is about another fact, and a raised refusal would be scenery in it.
      catalogRefusal: () => null,
      businessDay: () => "2026-08-07",
      // 27-F68 — the density of the glass, required on GatewayDeps.
      panelPpi: () => 100.5,
      // `27-F11c` — required, so a host that forgets the panel-fit notice is a typecheck
      // error rather than a silent no-op. `null` = this fixture's glass clears the floor.
      // `03-F14`/`03-F47` — REQUIRED on `GatewayDeps` since `03-F25` put aging timers on the
      // counter. The SHIPPED resolver rather than a convenient constant, so a fixture that is not
      // about the thresholds still gets the product's own answers.
      aging: resolveAging(undefined).thresholdsFor,
      panelFit: () => null,
    });
    return {
      appended,
      writes: authorizeWrites({
        writes: gateway,
        store,
        session,
        paidOutApprovalThresholdPaisa: PAID_OUT_APPROVAL_THRESHOLD_PAISA,
      }),
    };
  };

  it("02-F22 — a cashier's day.opened never reaches store.append", () => {
    const r = realRig([{ role: "cashier", branch_id: BRANCH }]);
    expect(
      refusalOf(() =>
        r.writes.append(event("day.opened", { day_id: "d-1", opening_float_paisa: 500_000 })),
      ),
    ).toMatchObject({ outcome: "deny", action: "day.open_close" });
    expect(r.appended).toEqual([]);
  });

  it("a manager's day.opened lands in the ledger, stamped as usual", () => {
    // The other direction: without it, a guard that refused EVERYTHING would pass the test
    // above while taking the till off the air.
    const r = realRig([{ role: "branch_manager", branch_id: BRANCH }]);
    r.writes.append(event("day.opened", { day_id: "d-1", opening_float_paisa: 500_000 }));
    expect(r.appended).toHaveLength(1);
    expect(r.appended[0]).toMatchObject({ type: "day.opened", actor_user_id: ME });
  });

  it("a malformed request still cannot slip past — same schema on both sides of the guard", () => {
    // The guard parses with the SAME `AppendRequestSchema` the gateway parses with, so there is
    // no shape that is unreadable here and acceptable below. It is delegated unauthorized
    // precisely because the gateway is what refuses it.
    const r = realRig([{ role: "owner", branch_id: null }]);
    expect(() => r.writes.append({ payload: {} })).toThrow();
    expect(() => r.writes.append("nonsense")).toThrow();
    expect(r.appended).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §G — 02-F26 / 05-F19. THE THREE-VALUED OUTCOME, on the one path that is live today.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§G 05-F19 — a paid-out above the org threshold requires approval", () => {
  const paidOut = (amount: number) =>
    event("cash.paid_out", {
      amount_paisa: amount,
      reason: "Supplier",
      receipt_photo_ref: "ref-1",
      shift_id: "s-1",
    });

  it("below the threshold it is allowed outright", () => {
    const r = asCashier({ threshold: 200_000 });
    r.writes.append(paidOut(199_999));
    expect(r.appended).toHaveLength(1);
  });

  it("AT the threshold is still within it — 05-F19 says 'above'", () => {
    const r = asCashier({ threshold: 200_000 });
    r.writes.append(paidOut(200_000));
    expect(r.appended).toHaveLength(1);
  });

  it("above the threshold it ESCALATES — which is neither allow nor deny", () => {
    const r = asCashier({ threshold: 200_000 });
    const refusal = refusalOf(() => r.writes.append(paidOut(400_000)));
    // `05 §5`'s own worked scenario: a PKR 4,000 paid-out must escalate.
    expect(refusal.outcome, "collapsing escalate into deny makes 02-F20 unreachable").toBe(
      "escalate",
    );
    expect(refusal.outcome, "collapsing escalate into allow is the leakage vector").not.toBe(
      "allow",
    );
    expect(refusal.action).toBe("cash.paid_out");
    // `02-F20` — the escalation must NAME whose credential closes the gap, or the screen that
    // asks for a manager PIN hardcodes a role, which is `18 §`'s banned inline check in the UI.
    // Read off `approval.grant`'s row, because `05-F19` routes the excess to an approval.
    expect([...refusal.satisfied_by].sort()).toEqual(["branch_manager", "owner"]);
    expect(r.appended, "nothing reaches the ledger until the approval exists").toEqual([]);
  });

  it("a manager is above the threshold in her own right — no escalation to herself", () => {
    const r = asManager({ threshold: 200_000 });
    // `canPayOut` escalates for every till role, because the threshold narrows a cell it does
    // not widen. A manager holding `approval.grant` still cannot self-approve inline (02-F38),
    // so the escalation is real for her too and the assertion states which it is.
    expect(refusalOf(() => r.writes.append(paidOut(400_000)))).toMatchObject({
      outcome: "escalate",
    });
  });

  it("a paid-out naming NO amount is refused — the threshold cannot be skipped by omission", () => {
    // `02-F44` makes the amount required, and here it is the input the verdict turns on. The
    // answer that cannot be right is "under the threshold": that is exactly how a Rs 4,000
    // paid-out walks past the approval `05-F19` exists to require.
    const r = asCashier({ threshold: 200_000 });
    for (const bad of [{}, { amount_paisa: "400000" }, { amount_paisa: 4_000.5 }]) {
      expect(refusalOf(() => r.writes.append(event("cash.paid_out", bad)))).toMatchObject({
        outcome: "deny",
      });
    }
    expect(r.appended).toEqual([]);
  });

  it("the pinned threshold is the one the app ships, and it makes 05 §5's scenario escalate", () => {
    expect(PAID_OUT_APPROVAL_THRESHOLD_PAISA).toBe(200_000);
    const r = asCashier();
    // PKR 4,000 — `05 §5` step 1, verbatim.
    expect(refusalOf(() => r.writes.append(paidOut(400_000)))).toMatchObject({
      outcome: "escalate",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §H — 02-F20's escalation family. Mapped ahead of its events on purpose: `domain/registry.ts`
// carries no payload schema for these yet, and omitting them would make the fail-closed default
// answer `deny`, which is the collapse that makes the feature unable to exist.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§H 02-F20 — void-after-KOT, comp and price override ESCALATE for a cashier", () => {
  const FAMILY = [
    ["void.recorded", "order.void_after_kot"],
    ["comp.recorded", "order.comp_item"],
    ["order.line_price_overridden", "order.price_override"],
  ] as const;

  it("a cashier gets escalate — not allow (unsupervised leakage) and not deny (feature gone)", () => {
    for (const [type, action] of FAMILY) {
      const r = asCashier();
      const refusal = refusalOf(() => r.writes.append(event(type, { order_id: "o-1" })));
      expect(refusal.outcome, `${type} must ESCALATE for a cashier`).toBe("escalate");
      expect(refusal.action).toBe(action);
      expect([...refusal.satisfied_by].sort()).toEqual(["branch_manager", "owner"]);
      expect(r.appended).toEqual([]);
    }
  });

  it("a manager performs the same three outright — the escalation resolves to a real credential", () => {
    // This is what makes `satisfied_by` above true rather than decorative: every role it names
    // is a role this same matrix allows the action to outright.
    for (const [type] of FAMILY) {
      const r = asManager();
      r.writes.append(event(type, { order_id: "o-1" }));
      expect(r.appended).toHaveLength(1);
    }
  });

  it("a storekeeper cannot reach them at all — that is a DENY, not an escalation", () => {
    for (const [type] of FAMILY) {
      const r = rig({ assignments: [{ role: "storekeeper", branch_id: BRANCH }] });
      expect(refusalOf(() => r.writes.append(event(type, {})))).toMatchObject({ outcome: "deny" });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §I — 02-F38. "The control is absent from the requester's screen AND refused server-side by the
// `domain` permission matrix (a client that renders it anyway must still fail)."
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§I 02-F38 — a requester never approves their own request", () => {
  const grant = (requester: string) =>
    event("approval.granted", { request_id: "req-1", requester_id: requester });

  it("refuses a manager granting the approval she herself requested", () => {
    const r = asManager({ user_id: ME });
    const refusal = refusalOf(() => r.writes.append(grant(ME)));
    expect(refusal.outcome).toBe("deny");
    expect(refusal.action).toBe("approval.grant");
    expect(r.appended).toEqual([]);
  });

  it("binds the OWNER too — 02-F38 names no role exception", () => {
    const r = asOwner({ user_id: ME });
    expect(refusalOf(() => r.writes.append(grant(ME)))).toMatchObject({ outcome: "deny" });
  });

  it("the same manager may grant SOMEONE ELSE's request", () => {
    // The other direction of the same rule. Without it, an implementation that denied every
    // grant would pass the two tests above while deleting `05-F6` entirely.
    const r = asManager({ user_id: ME });
    r.writes.append(grant("user-other"));
    expect(r.appended).toHaveLength(1);
  });

  it("a grant naming NO requester is refused — the rule cannot be evaded by omission", () => {
    const r = asManager({ user_id: ME });
    expect(
      refusalOf(() => r.writes.append(event("approval.granted", { request_id: "req-1" }))),
    ).toMatchObject({ outcome: "deny" });
  });

  it("a cashier cannot grant at all — one escalates UP, never sideways", () => {
    const r = asCashier({ user_id: ME });
    expect(refusalOf(() => r.writes.append(grant("user-other")))).toMatchObject({
      outcome: "deny",
    });
  });

  it("`approval.denied` is the same act and carries the same rule", () => {
    const r = asManager({ user_id: ME });
    expect(
      refusalOf(() =>
        r.writes.append(event("approval.denied", { request_id: "req-1", requester_id: ME })),
      ),
    ).toMatchObject({ outcome: "deny", action: "approval.grant" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §J — 01-F60's precedent, at the type level: the threshold is a REQUIRED input. An optional one
// that defaulted to "never escalate" is how a completeness check gets silently skipped, and that
// failure took three weeks to surface the last time it happened.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§J 05-F19 — the threshold cannot be omitted", () => {
  it("omitting it does not compile", () => {
    const store = {
      identity: { org_id: ORG, branch_id: BRANCH, device_id: "dev-1" },
      staff: { lookup: () => null },
    } as unknown as Pick<DeviceStore, "identity" | "staff">;
    // @ts-expect-error — `paidOutApprovalThresholdPaisa` is required (01-F60's precedent).
    const writes = authorizeWrites({
      writes: {
        append: () => ({ id: "x" }),
        addLine: () => ({ id: "y" }),
        toggleAvailability: () => ({ id: "z" }),
        recordCustomer: () => ({ id: "w" }),
      },
      store,
      session: () => null,
    });
    expect(writes).toBeDefined();
  });
});
