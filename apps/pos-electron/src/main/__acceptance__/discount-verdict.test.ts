/**
 * # `02-F20` / `02-F61` — `discount.recorded` IS AUTHORIZABLE, AND WHICH ROW IT LANDS ON
 *
 * `02-F61` measured this as *"specified and unbuilt"*: `discount.recorded` had **no row** in
 * `WRITE_ACTIONS`, so `01-F27`'s fail-closed default DENIED it for every role including owner.
 * `authorize.ts` recorded why in its own words — no `canDiscount` predicate, no threshold — and
 * named the fix as owed to `domain`. Both have landed; this file is the seam between them.
 *
 * **`permissions.test.ts` owns the CELLS and `discount-authorization.test.ts` owns the CHOICE.**
 * What is only true here is that a request arriving over the renderer's channel reaches that
 * choice at all, with a base taken from THIS DEVICE's fold and never from the payload.
 */

import type { DeviceStore } from "@restos/sync-client";
import { describe, expect, it, vi } from "vitest";
import { authorizeWrites, DISCOUNT_APPROVAL_THRESHOLD_BPS } from "../authorize";

const ORG = "00000000-0000-7000-8000-000000000001";
const BRANCH = "00000000-0000-7000-8000-000000000002";
const ORDER_ID = "0199aaaa-0000-7000-8000-00000000abcd";
const BILL = 100_000;

type Role = "cashier" | "branch_manager" | "storekeeper" | "owner";

const rig = (
  role: Role,
  over: {
    total?: number | null;
    thresholdBps?: number | undefined;
    resolver?: ((id: string) => number | null) | undefined;
    omitResolver?: boolean;
    omitThreshold?: boolean;
  } = {},
) => {
  const appended: { type: string }[] = [];
  const store = {
    identity: { org_id: ORG, branch_id: BRANCH, device_id: "dev-1" },
    staff: {
      lookup: () => ({
        user_id: "u",
        pin_hash: "argon2id$stub",
        display_name: "Stub",
        status: "active",
        assignments: [{ role, branch_id: BRANCH }],
      }),
    },
  } as unknown as Pick<DeviceStore, "identity" | "staff">;
  return {
    appended,
    writes: authorizeWrites({
      writes: {
        append: vi.fn((req: unknown) => {
          appended.push(req as { type: string });
          return { id: "evt-1" };
        }),
        addLine: vi.fn(() => ({ id: "evt-2" })),
        toggleAvailability: vi.fn(() => ({ id: "evt-3" })),
        recordCustomer: vi.fn(() => ({ id: "evt-4" })),
      },
      store,
      session: () => ({ user_id: "u", display_name: "Stub" }),
      paidOutApprovalThresholdPaisa: 200_000,
      ...(over.omitThreshold === true
        ? {}
        : { discountApprovalThresholdBps: over.thresholdBps ?? DISCOUNT_APPROVAL_THRESHOLD_BPS }),
      ...(over.omitResolver === true
        ? {}
        : {
            orderTotalPaisa:
              over.resolver ?? (() => (over.total === undefined ? BILL : over.total)),
          }),
    }),
  };
};

let n = 0;
const discount = (amount_paisa: number, over: Record<string, unknown> = {}) => {
  n += 1;
  return {
    type: "discount.recorded",
    payload: {
      order_id: ORDER_ID,
      amount_paisa,
      reason: "Goodwill",
      approver_user_id: null,
      adjustment_attempt_id: `0199bbbb-0000-7000-8000-${String(n).padStart(12, "0")}`,
      ...over,
    },
    refs: ["0199aaaa-0000-7000-8000-00000000ff02"],
  };
};

describe("§A 02-F61 — the act exists in the matrix now, and lands on the right row", () => {
  it("a small discount is a cashier's own act and reaches the ledger", () => {
    // MUTATION THIS CATCHES: the branch removed — the shipped product before this work — where
    // this DENIES for every role and `02-F61`'s surface cannot exist.
    const t = rig("cashier");
    expect(() => t.writes.append(discount(5_000))).not.toThrow();
    expect(t.appended).toHaveLength(1);
  });

  it("a large one is refused as ESCALATE, not as DENY, and names the credential", () => {
    // The distinction is the feature: `02-F20`'s pad can only be offered for an `escalate`, and a
    // `deny` leaves the cashier with a refusal that has no route out (`27-F5`).
    const t = rig("cashier");
    let refusal: { outcome?: string; satisfied_by?: string[] } | undefined;
    try {
      t.writes.append(discount(50_000));
    } catch (e) {
      refusal = (e as { refusal?: typeof refusal }).refusal;
    }
    expect(refusal?.outcome).toBe("escalate");
    expect(refusal?.satisfied_by).toContain("branch_manager");
    expect(t.appended, "01-F1 — an unescalated write never lands").toHaveLength(0);
  });

  it("a manager discounts either side of the threshold; a storekeeper reaches neither", () => {
    expect(() => rig("branch_manager").writes.append(discount(50_000))).not.toThrow();
    expect(() => rig("storekeeper").writes.append(discount(1))).toThrow();
  });
});

describe("§B Commandment 8 — the BASE is this device's fold, never the payload", () => {
  it("the resolver is asked for the order the payload names", () => {
    const asked: string[] = [];
    const t = rig("cashier", {
      resolver: (id) => {
        asked.push(id);
        return BILL;
      },
    });
    t.writes.append(discount(5_000));
    expect(asked).toEqual([ORDER_ID]);
  });

  it("⚠ a payload that ships its own total cannot move the verdict", () => {
    // **THE ASSERTION THIS SECTION EXISTS FOR.** If the base came from the request, a cashier's
    // renderer could make any discount read as within-threshold by inflating one number — which is
    // `02-F20`'s manager PIN deleted by a field, on the untrusted side of `18 §9`'s bridge.
    //
    // MUTATION THIS CATCHES: `payload.order_total_paisa ?? limits.orderTotalPaisa(...)`, which is
    // the shape a session writes when the resolver looks like a fallback.
    const t = rig("cashier", { total: BILL });
    expect(() =>
      t.writes.append(
        discount(50_000, { order_total_paisa: 100_000_000, total_paisa: 100_000_000 }),
      ),
    ).toThrow();
    expect(t.appended).toHaveLength(0);
  });

  it("an order this device has no row for is DENIED, not defaulted", () => {
    // `01-F60`'s precedent: the answer that cannot be right is the permissive one.
    const t = rig("owner", { total: null });
    expect(() => t.writes.append(discount(1))).toThrow();
    expect(t.appended).toHaveLength(0);
  });
});

describe("§C the inputs FAIL CLOSED when a host does not supply them", () => {
  it("no threshold and no resolver each DENY — even for an owner", () => {
    // They are `.optional()` on the deps bag, which `canPayOut`'s threshold could never be. The
    // difference is the failure DIRECTION, and it is asserted rather than argued: absent means
    // `deny` here, where absent would have meant "never escalate" one field up.
    //
    // MUTATION THIS CATCHES: either guard replaced by a default — `?? 0` on the threshold makes
    // every discount escalate (loud, survivable), and `?? Number.MAX_SAFE_INTEGER` makes every
    // discount a cashier's own act (silent, permanent).
    expect(() => rig("owner", { omitThreshold: true }).writes.append(discount(1))).toThrow();
    expect(() => rig("owner", { omitResolver: true }).writes.append(discount(1))).toThrow();
  });

  it("a malformed amount is refused rather than measured", () => {
    for (const bad of [undefined, "500", -1, 1.5])
      expect(() => rig("owner").writes.append(discount(0, { amount_paisa: bad }))).toThrow();
  });
});

describe("§D the threshold pin", () => {
  it("is a RATE in basis points, and 1000 bps is 10%", () => {
    // PINNED not specified — Appendix A writes `X%` and no FR supplies `X`; R63 rules the number
    // is the owner's and moves it to `00 §7` layer 2 with `PAID_OUT_APPROVAL_THRESHOLD_PAISA`.
    // Pinned here so that move is a deliberate act and not a silent drift.
    expect(DISCOUNT_APPROVAL_THRESHOLD_BPS).toBe(1000);
    // At exactly 10% of a Rs 1,000 bill: within (Appendix A writes `≤ X%`).
    expect(() => rig("cashier").writes.append(discount(10_000))).not.toThrow();
    expect(() => rig("cashier").writes.append(discount(10_001))).toThrow();
  });

  it("is passed EXPLICITLY by the host, never defaulted inside authorize.ts", () => {
    // A different threshold changes the verdict, which is what proves the constant is an input
    // rather than a decoration. MUTATION THIS CATCHES: the branch reading the module constant
    // directly, which would make the dep a lie and `00 §7`'s config plane unreachable.
    const t = rig("cashier", { thresholdBps: 10_000 });
    expect(() => t.writes.append(discount(99_000)), "99% is within a 100% threshold").not.toThrow();
  });
});
