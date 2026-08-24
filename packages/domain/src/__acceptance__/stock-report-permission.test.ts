/**
 * `10-F34` — `report.stock_view`, and the reason it had to exist before slice 1's own deliverable
 * could be hosted at all.
 *
 * **The gap, stated so the assertions have something to bite.** `services/api` refuses **at boot**
 * to host a procedure naming no permission action. The three shipped `stock.*` actions are all
 * WRITES, and `REPORT_REACH`'s own note records that `report.stock_view` was deliberately NOT
 * invented from Appendix A's `View sales reports` row — correctly, because that row is about sales.
 * The consequence had not been drawn: the variance report, which is the whole of `specs/10` slice 1,
 * was **unbuildable rather than merely unbuilt** — the fifth instance of the shape `02-F46`,
 * `02-F47`, `14-F30` and `14-F39` each record.
 *
 * ⚠ **§C is the section a later session is most likely to "fix" the wrong way.** The cheap way out
 * is to gate the report behind `stock.count_entry`, and it is worse than leaving it unbuilt: it
 * hands whoever may TYPE a count the authority to READ every item's unexplained usage — the exact
 * surface `10-F19`'s *hints, never accusation* exists to keep away from the people a gap would
 * otherwise accuse.
 *
 * ⚠ **AUTHORSHIP DEPARTURE, DECLARED** (`20 §4.3`). The out-of-tree mutation matrix in
 * `packages/domain/CLAUDE.md` stands in for the independence guarantee, and its negative control is
 * what stops that matrix proving nothing. A permission cell is a security parameter, so mutation
 * happened on a scratchpad copy and never in this tree (`T8`).
 */

import { describe, expect, it } from "vitest";
import {
  type AuthSubject,
  can,
  PERMISSION_ACTIONS,
  ROLES,
  type Role,
  reportScope,
  stockReportScope,
} from "../index.js";

const ORG = "org-1";
const BRANCH = "branch-1";
const OTHER = "branch-2";

const subject = (role: Role, branch_id: string | null = BRANCH): AuthSubject => ({
  user_id: `user-${role}`,
  org_id: ORG,
  assignments: [{ role, branch_id, status: "active" }],
});

const scope = (branch_id: string | null = BRANCH, org_id = ORG) => ({ org_id, branch_id });

// ── §A · the action exists and is gatable ──────────────────────────────────────────────────────

describe("§A · 10-F34 — the action exists, so slice 1's report can be hosted at all", () => {
  it("`report.stock_view` is in the closed action list", () => {
    expect(PERMISSION_ACTIONS).toContain("report.stock_view");
  });

  it("it is a SCOPED action, not a verdict — `can` resolves it through a reach", () => {
    // A verdict row would answer allow/deny with no reach, and the resolver would then have nothing
    // to narrow the answer WITH — `summary-router.ts` records what that costs one plane over.
    expect(can(subject("owner", null), "report.stock_view", scope()).outcome).toBe("allow");
    expect(stockReportScope(subject("owner", null), scope())).toBe("org");
  });
});

// ── §B · the four cells ────────────────────────────────────────────────────────────────────────

describe("§B · 10-F34 — the four cells, three of them a pinned interpretation", () => {
  it("owner reaches the whole ORG — Appendix A's 'everything'", () => {
    expect(stockReportScope(subject("owner", null), scope())).toBe("org");
    expect(stockReportScope(subject("owner", null), scope(OTHER))).toBe("org");
  });

  it("storekeeper reaches her OWN BRANCH — the one cell Appendix A states, in words", () => {
    expect(stockReportScope(subject("storekeeper"), scope())).toBe("own_branch");
    // …and not another branch's, because `rolesAt` matches nothing there.
    expect(stockReportScope(subject("storekeeper"), scope(OTHER))).toBe("none");
  });

  it("branch manager reaches her OWN BRANCH — 10 §2 routes the alerts to her console", () => {
    expect(stockReportScope(subject("branch_manager"), scope())).toBe("own_branch");
    expect(stockReportScope(subject("branch_manager"), scope(OTHER))).toBe("none");
  });

  it("⚠ THE CASHIER REACHES NOTHING, AND 10-F19 IS WHY", () => {
    // Not Appendix A — she has "own shift only" there, for SALES. A variance report names
    // unexplained usage per item, and a `10-F28` period is not a shift, so there is nothing to
    // narrow to. This is the cell most likely to be widened by someone reading Appendix A alone.
    expect(stockReportScope(subject("cashier"), scope())).toBe("none");
    expect(can(subject("cashier"), "report.stock_view", scope()).outcome).toBe("deny");
  });

  it("the two reach tables CROSS OVER on the storekeeper, which is why they are two tables", () => {
    // Her SALES reach is `none` and her STOCK reach is `own_branch`. One table read twice could not
    // express that, and a widening of `reportScope` would have handed her the sales reports
    // Appendix A explicitly withholds.
    expect(reportScope(subject("storekeeper"), scope())).toBe("none");
    expect(stockReportScope(subject("storekeeper"), scope())).toBe("own_branch");
    // And the cashier crosses the other way: sales `own_shift`, stock `none`.
    expect(reportScope(subject("cashier"), scope())).toBe("own_shift");
    expect(stockReportScope(subject("cashier"), scope())).toBe("none");
  });

  it("every role has a cell — a role with no row would fail closed and silently", () => {
    for (const role of ROLES) {
      expect(["none", "own_shift", "own_branch", "org"]).toContain(
        stockReportScope(subject(role, role === "owner" ? null : BRANCH), scope()),
      );
    }
  });
});

// ── §C · the refusals that hold in every direction ─────────────────────────────────────────────

describe("§C · 10-F34 — it fails closed on tenancy, on assignment and on participation", () => {
  it("a subject from ANOTHER ORG reaches nothing, before any role reasoning", () => {
    // `01-F71` (a): the matrix refuses when the subject's org differs from the scope's, first.
    expect(stockReportScope(subject("owner", null), scope(null, "org-2"))).toBe("none");
    expect(can(subject("owner", null), "report.stock_view", scope(null, "org-2")).outcome).toBe(
      "deny",
    );
  });

  it("an INACTIVE assignment participates in nothing (11-F22)", () => {
    const departed: AuthSubject = {
      user_id: "user-departed",
      org_id: ORG,
      assignments: [{ role: "storekeeper", branch_id: BRANCH, status: "inactive" }],
    };
    expect(stockReportScope(departed, scope())).toBe("none");
    expect(can(departed, "report.stock_view", scope()).outcome).toBe("deny");
  });

  it("a subject with NO assignment anywhere reaches nothing", () => {
    const nobody: AuthSubject = { user_id: "u", org_id: ORG, assignments: [] };
    expect(stockReportScope(nobody, scope())).toBe("none");
  });

  it("two roles at one location take the WIDEST reach — Appendix A's several hats", () => {
    const both: AuthSubject = {
      user_id: "user-both",
      org_id: ORG,
      assignments: [
        { role: "cashier", branch_id: BRANCH, status: "active" },
        { role: "storekeeper", branch_id: BRANCH, status: "active" },
      ],
    };
    expect(stockReportScope(both, scope())).toBe("own_branch");
  });

  it("⚠ THE CHEAP WAY OUT IS STILL REFUSED — a write action does not gate this read", () => {
    // The mutant this kills is "gate the variance report behind `stock.count_entry`". A cashier is
    // DENY on that action too, so a suite testing only the cashier could not tell the two
    // implementations apart; the storekeeper is the row that separates them, and she is ALLOW on
    // the write and `own_branch` on the read — different questions with different answers.
    expect(can(subject("storekeeper"), "stock.count_entry", scope()).outcome).toBe("allow");
    expect(can(subject("storekeeper"), "report.stock_view", scope()).outcome).toBe("allow");
    // The one that actually separates them: a BRANCH MANAGER may read the report and may also
    // enter a count, but the two are decided by different rows and a later narrowing of one must
    // not move the other.
    expect(can(subject("branch_manager"), "report.stock_view", scope()).outcome).toBe("allow");
    // And the cashier: allowed to log WASTAGE (Appendix A gives her that cell) and refused the
    // report. If the report were gated on a write action she happens to hold, this would flip.
    expect(can(subject("cashier"), "stock.wastage_record", scope()).outcome).toBe("allow");
    expect(can(subject("cashier"), "report.stock_view", scope()).outcome).toBe("deny");
  });
});
