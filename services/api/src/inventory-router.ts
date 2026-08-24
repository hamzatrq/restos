/**
 * `10-F18`'s variance report, as one gated procedure — slice 1 step 7's cloud read model.
 *
 * **Commandment 8 is enforced TWICE here and the second one is the interesting one**, exactly as
 * `summary-router.ts` records:
 *
 *   1. `authorized("report.stock_view")` runs `can()` before the resolver. That refuses a cashier
 *      outright — `10-F34` gives her no stock-report reach at all, on `10-F19`'s social licence
 *      rather than on Appendix A — and it refuses a manager who names a branch she holds no
 *      assignment at, because `rolesAt` matches nothing there.
 *   2. **`stockBranchScope` runs again INSIDE the resolver and decides which rows are read.** The
 *      middleware answers *may this request happen*; only the resolver can answer *how wide is the
 *      answer*. Skipping it is invisible to every gate this repo has, and here it would hand one
 *      branch's manager another branch's per-item unexplained usage — an accusation about people
 *      she does not employ.
 *
 * **The two-plane law, stated rather than assumed (commandment 5, `18 §6`).** The variance report
 * is a CLOUD screen: `10-F4` makes sale deduction a derived read model, `10 §8` puts the whole
 * module in the cloud service, and `plans/inventory/design.md` §5.3 draws the consequence — a
 * device cannot hold a correct expected-stock number, which is why `10-F17`'s count is BLIND. The
 * WRITES stay on the other plane and must: `stock.*` is not in `01-F62`'s org-scoped set, so every
 * one needs a device-stamped branch envelope, and **a cloud web page for the count is illegal** —
 * the exact wall `05-F28` hit for the manager console.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { StockScopeRefusal, stockReport } from "./inventory.js";
import { authorized } from "./trpc.js";

/**
 * `10-F28`'s period chain is exact only from its true baseline, so a caller names the window it
 * wants read and the answer states it back. Absent means the trailing `DEFAULT_WINDOW_DAYS`.
 *
 * **Deliberately not "since the beginning of time".** An unbounded read of an org's whole ledger is
 * a scan with no cap on a table `day-ledger.ts` already caps at 50 000 rows, and a report that
 * silently truncated would be a floor that did not say so.
 */
const DEFAULT_WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

const varianceInput = z.object({
  /**
   * `10-F1`'s location. **Required**, and it doubles as `AuthScope.branch_id` for the middleware —
   * `authorized()` reads `branch_id` off the raw input, so the field name is load-bearing rather
   * than cosmetic: a `location_id` alone would leave `can()` scoping against `null`, which is the
   * org-wide reach, and a branch manager would then pass a gate she should not.
   */
  branch_id: z.string().min(1),
  from_ms: z.number().int().optional(),
  to_ms: z.number().int().optional(),
});

export const inventoryProcedures = {
  /**
   * Every closed `10-F28` period inside the window, ranked by `10-F33` (b) in PKR — with
   * `not counted` rows named rather than zeroed, the money total flagged a floor when any row could
   * not be read, and hints only on a sustained same-signed run.
   *
   * ⚠ **It ships WITHOUT a food-cost figure and that is slice 1's own decision** (`plans/inventory/
   * design.md` §7). `10-F31`'s window gate is unreachable on day one by construction — an org has
   * to complete first — and its consumer is `12-F11`'s margin line, which renders an omission
   * today. Adding a ratio here would be R1 broken at the first surface that wanted one.
   */
  variance: authorized("report.stock_view")
    .input(varianceInput)
    .query(async ({ ctx, input }) => {
      const org_id = ctx.subject.org_id;
      const to_ms = input.to_ms ?? ctx.now();
      const from_ms = input.from_ms ?? to_ms - DEFAULT_WINDOW_DAYS * DAY_MS;

      const [refs, window] = await Promise.all([
        ctx.inventory.read(org_id),
        ctx.ledger.read({ org_id, branch_ids: [input.branch_id], from_ms, to_ms }),
      ]);

      try {
        const report = stockReport({
          subject: ctx.subject,
          location_id: input.branch_id,
          events: window.events,
          refs,
          window: { from_ms, to_ms },
        });
        return {
          ...report,
          /**
           * `12-F8` — never presented as live, and on this surface the age matters more than on
           * the summary: a variance report folded from a ledger that is a day behind reports
           * consumption that has not arrived, which reads as unexplained usage.
           */
          sync: { latest_arrival_ms: window.latest_arrival_ms, server_now_ms: ctx.now() },
          /** `10-F18` — the row cap was hit, so every total is a floor for a SECOND reason. */
          ledger_truncated: window.truncated,
          scope: { org_id, branch_id: input.branch_id },
        };
      } catch (error) {
        if (error instanceof StockScopeRefusal) {
          throw new TRPCError({ code: "FORBIDDEN", message: error.message, cause: error });
        }
        throw error;
      }
    }),
};
