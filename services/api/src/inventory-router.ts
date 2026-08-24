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

import { referenceRefusals } from "@restos/inventory";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  InventoryReferenceInput,
  StockScopeRefusal,
  stockBranchScope,
  stockReport,
  toReferenceData,
} from "./inventory.js";
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
   * `01-F21`/`14-F9` — author the org's inventory reference set.
   *
   * **`catalog.edit_recipes`, and no action is minted.** It ships in `PERMISSION_ACTIONS` already
   * (owner-only), it is the action `14-F9`'s recipe editor is named for, and `10-F31`'s two scope
   * flags and `10-F29`'s count units are reference data on the same records. Minting a second
   * action for "the same owner edits the same records through a different field" would be
   * inventing policy (commandment 2) and would differ in nothing an implementation can observe —
   * `02-F47`'s own argument for not splitting `customer.record`.
   *
   * ⚠ **THE REFUSALS RUN HERE, AT THE WRITER, AND NOWHERE ELSE.** `10-F31`'s R1–R5 — an
   * `is_counted` item that is not `is_costed`, an uncostable recipe leaf, a cycle, a missing
   * component, a duplicate item — are `referenceRefusals`' job, and this is the only place they
   * are enforced. That is `14-F29`/`01-F60`'s precedent and it is load-bearing rather than
   * stylistic: a REPORT that repaired an incomplete reference set would be guessing at exactly the
   * values R5 forbids it to guess, and the owner is standing here with the fix one keystroke away.
   *
   * ⚠ **It refuses the WHOLE set or accepts the whole set.** A partial publish would leave a
   * recipe pointing at an item that was refused, which is `01-F56`'s `malformed` arriving as a
   * dangling reference instead of a refusal.
   *
   * ⚠ **There is no back-office SCREEN for this yet** (slice 1 step 5). An owner authors through
   * the API. Named rather than left to look intentional.
   */
  saveReference: authorized("catalog.edit_recipes")
    .input(InventoryReferenceInput)
    .mutation(async ({ ctx, input }) => {
      const refs = toReferenceData(input);
      const refusals = referenceRefusals(refs);
      if (refusals.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          // Every refusal names its own FR — commandment 2: a refusal with no FR is invented
          // policy — and the SUBJECT, because `10-F31`'s dish gate IS the repair queue and a
          // refusal an owner cannot act on is a refusal she will route around.
          message: refusals.map((r) => `${r.fr} ${r.code}: ${r.subject} — ${r.detail}`).join("; "),
        });
      }
      return {
        version: await ctx.inventory.publish(ctx.subject.org_id, refs, {
          actor_user_id: ctx.subject.user_id,
          now: ctx.now(),
        }),
      };
    }),

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

      // ⚠ **THE READER IS ASKED FOR THE NARROWING'S ANSWER, NEVER FOR THE INPUT'S BRANCH.** The
      // first draft passed `[input.branch_id]` straight through, which looks identical and is not:
      // the narrowing then had nothing to lock, and mutation measured it at **0 of 402** kills.
      // `summary-router.ts` states the principle — the middleware answers *may this happen*, only
      // the resolver answers *how wide is the answer* — and this is where that answer has to be
      // read for it to mean anything.
      let branch_ids: readonly string[];
      try {
        branch_ids = stockBranchScope(ctx.subject, input.branch_id);
      } catch (error) {
        if (error instanceof StockScopeRefusal) {
          throw new TRPCError({ code: "FORBIDDEN", message: error.message, cause: error });
        }
        throw error;
      }

      const [refs, window] = await Promise.all([
        ctx.inventory.read(org_id),
        ctx.ledger.read({ org_id, branch_ids, from_ms, to_ms }),
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
