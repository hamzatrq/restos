/**
 * # `02-F20` + Appendix A's two discount rows — `canDiscount`
 *
 * `apps/pos-electron/src/main/authorize.ts` recorded this predicate as OWED to `domain` in its own
 * words, and `02-F61` repeats it as the reason a discount is *"specified and unbuilt"*: the matrix
 * carries `order.discount_within_threshold` and `order.discount_above_threshold` and nothing could
 * tell them apart, so `discount.recorded` hit the fail-closed default and was DENIED for every
 * role including owner.
 *
 * > | Discount ≤ X% (configurable) | ✔ | ✔ | — | ✔ |
 * > | Discount > X%                | needs Mgr PIN | ✔ | — | ✔ |
 *
 * The rows are transcribed in `permissions.ts` and swept by `permissions.test.ts`. **What this
 * file owns is the CHOICE between them**, which is the only thing `canDiscount` adds.
 */

import { describe, expect, it } from "vitest";
import { type AuthScope, type AuthSubject, canDiscount } from "../permissions";

const ORG = "org-1";
const BRANCH = "branch-1";
const scope: AuthScope = { org_id: ORG, branch_id: BRANCH };

const who = (role: AuthSubject["assignments"][number]["role"]): AuthSubject => ({
  org_id: ORG,
  user_id: `user-${role}`,
  assignments: [{ role, branch_id: BRANCH, status: "active" }],
});

/** Rs 1,000 bill, 10% threshold — so Rs 100 is AT the boundary and Rs 101 is over it. */
const BILL = 100_000;
const BPS = 1000;
const ask = (amount_paisa: number, subject = who("cashier")) =>
  canDiscount(subject, scope, {
    amount_paisa,
    order_total_paisa: BILL,
    threshold_bps: BPS,
    // `17-F24` made `campaign` REQUIRED. Every case in this file is a DISCRETIONARY discount, so
    // `null` is the value that leaves each assertion meaning exactly what it meant before.
    campaign: null,
  });

describe("§A — the amount chooses WHICH ROW, and that is the whole predicate", () => {
  it("a discount within the threshold is the cashier's own act", () => {
    expect(ask(5_000)).toMatchObject({
      outcome: "allow",
      action: "order.discount_within_threshold",
    });
  });

  it("a discount above it ESCALATES for a cashier, and names who can close the gap", () => {
    // MUTATION THIS CATCHES: the comparison inverted, or the two actions swapped — either of which
    // makes a large discount a cashier's unsupervised act, permanently (`01-F1`).
    const verdict = ask(20_000);
    expect(verdict).toMatchObject({
      outcome: "escalate",
      action: "order.discount_above_threshold",
    });
    expect(verdict.satisfied_by, "02-F20's pad needs a credential to name").toContain(
      "branch_manager",
    );
  });

  it("AT the threshold is WITHIN it — Appendix A writes `≤ X%` and `> X%`", () => {
    // The boundary, both sides, one paisa apart. MUTATION THIS CATCHES: `<` for `<=`, which turns
    // a round 10% discount into a manager interrupt on every bill that lands on it.
    expect(ask(10_000).outcome, "exactly 10% of Rs 1,000").toBe("allow");
    expect(ask(10_001).outcome, "one paisa over").toBe("escalate");
  });

  it("the threshold is a RATE, so the same amount decides differently on a different bill", () => {
    // MUTATION THIS CATCHES: treating `threshold_bps` as paisa — which reads plausibly (it is what
    // `canPayOut` next door does) and makes the rule a fixed rupee cap on every bill in the shop.
    const big = canDiscount(who("cashier"), scope, {
      amount_paisa: 20_000,
      order_total_paisa: 1_000_000,
      threshold_bps: BPS,
      campaign: null,
    });
    expect(big.outcome, "Rs 200 off Rs 10,000 is 2%, well within").toBe("allow");
    expect(ask(20_000).outcome, "the same Rs 200 off Rs 1,000 is 20%").toBe("escalate");
  });
});

describe("§B — the rows themselves, read off the matrix and not re-decided here", () => {
  it("a manager and an owner discount outright on both sides of the threshold", () => {
    for (const role of ["branch_manager", "owner"] as const) {
      expect(ask(5_000, who(role)).outcome).toBe("allow");
      expect(ask(50_000, who(role)).outcome, `${role} above threshold`).toBe("allow");
    }
  });

  it("a storekeeper is `—` on both rows and reaches neither", () => {
    expect(ask(1, who("storekeeper")).outcome).toBe("deny");
    expect(ask(50_000, who("storekeeper")).outcome).toBe("deny");
  });

  it("fails closed across orgs and with no assignment at this branch", () => {
    expect(
      canDiscount({ ...who("owner"), org_id: "other-org" }, scope, {
        amount_paisa: 1,
        order_total_paisa: BILL,
        threshold_bps: BPS,
        campaign: null,
      }).outcome,
    ).toBe("deny");
    expect(
      ask(1, { org_id: ORG, user_id: "u", assignments: [] }).outcome,
      "01-F27 — no assignment is no authority",
    ).toBe("deny");
  });
});

describe("§C — the arithmetic, which is money and therefore load-bearing", () => {
  it("a discount against a ZERO bill is above any percentage, and refuses", () => {
    // No special case in the implementation: `amount × 10000 > 0` for every positive amount. Pinned
    // because the alternative reading — a zero base means "within" — hands a cashier an unbounded
    // unsupervised discount on exactly the order where nothing is owed.
    const verdict = canDiscount(who("cashier"), scope, {
      amount_paisa: 1,
      order_total_paisa: 0,
      threshold_bps: BPS,
      campaign: null,
    });
    expect(verdict.outcome).toBe("escalate");
  });

  it("a ZERO discount is within, on a zero bill and on a real one — the harmless direction", () => {
    expect(
      canDiscount(who("cashier"), scope, {
        amount_paisa: 0,
        order_total_paisa: 0,
        threshold_bps: BPS,
        campaign: null,
      }).outcome,
    ).toBe("allow");
    expect(ask(0).outcome).toBe("allow");
  });

  it("is EXACT past 2^53 — the cross-multiplication is BigInt, and a `number` one MIS-AUTHORIZES", () => {
    // Standing law 3: a PRODUCT leaves the exact-integer range far sooner than a sum does, and a
    // double product rounds SILENTLY. Both sides here are products — `amount × 10000` and
    // `threshold × total` — so the comparison itself is where the precision goes.
    //
    // ⚠ **THIS ASSERTION WAS VACUOUS IN ITS FIRST DRAFT AND ONLY MUTATION FOUND THAT.** It probed
    // one paisa either side of a 10% boundary at 2^53, which reads like the sharp case and is not:
    // at bps 1000 the two products differ by more than the double spacing there, so the `number`
    // implementation agreed with the exact one on every value tried and SURVIVED the mutant. The
    // values below are a searched counterexample, not a guessed one.
    //
    // **It fails in the dangerous direction**, which is why it is worth a test at all: exact
    // arithmetic puts this discount ABOVE the threshold (escalate — a manager must approve), and
    // the `number` form puts it WITHIN (allow — the cashier's own unsupervised act). A rounding
    // error deciding an authorization, silently, on an append-only ledger.
    //
    // The magnitudes are absurd for a restaurant and that is not a defect in the test: the guard
    // is about the ARITHMETIC, not about a bill anyone will ring, exactly as `billedCellPaisa`
    // argues one package over. There is no realistic-magnitude counterexample to find — which is
    // precisely what makes this class of defect survive review.
    const total = 9_007_199_103_302_857;
    const amount = 6_305_039_372_312;
    const verdict = canDiscount(who("cashier"), scope, {
      amount_paisa: amount,
      order_total_paisa: total,
      threshold_bps: 7,
      campaign: null,
    });
    expect(verdict.outcome, "exact says above the threshold; a double says within it").toBe(
      "escalate",
    );
  });
});
