/**
 * `12-F9`/`12-F10`/`12-F22` — the nightly owner summary, as one gated procedure.
 *
 * **Commandment 8 is enforced TWICE here and the second one is the interesting one.**
 *
 *   1. `authorized("report.sales_view")` runs `can()` before the resolver. That refuses a cashier
 *      outright: Appendix A's `View sales reports` row gives her "own shift only", and `can()`
 *      permits that reach only when `scope.subject_user_id` is her own id — a day roll-up names no
 *      single subject, so the middleware denies. It also refuses a branch manager who asks about a
 *      branch she holds no assignment at, because `rolesAt` matches nothing there.
 *
 *   2. **`reportScope` runs again INSIDE the resolver, and it decides which branches are read.**
 *      This is the half the middleware cannot do, and skipping it is invisible to every gate this
 *      repo has: a branch manager asking for *her own* branch passes `can()` correctly, and if the
 *      resolver then read the whole org she would be handed every other branch's takings with a
 *      200. The middleware answers *may this request happen*; only the resolver can answer *how
 *      wide is the answer*. `SCOPE MUTANT` in `summary.test.ts` is exactly that deletion, and it
 *      is why the narrowing is a named function rather than an inline ternary.
 *
 * **The two-plane law, stated rather than assumed (Commandment 5, `18 §6`).** The owner summary is
 * a CLOUD screen: it reaches this procedure over tRPC and TanStack Query, and `apps/owner` imports
 * no `sync-client`, holds no outbox and folds nothing locally. The fold runs here, server-side,
 * over events this service fetched from `services/sync-gateway`. `12 §5` says the same in the
 * module's own words — "the owner app stays on the cloud plane (18 §6): it does NOT run
 * `sync-client` and has no kernel outbox".
 */

import { businessDate, businessDayBoundsOfDate, reportScope } from "@restos/domain";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { summarise } from "./summary.js";
import { authorized } from "./trpc.js";

/**
 * `12-F13` — history is browsable by calendar date. Absent means the business day containing the
 * server's own clock, which is the day a summary opened at 23:40 is about.
 *
 * **Deliberately not "the last day with events".** That is a second query whose answer changes
 * under the caller between the two requests, and it would silently show a different day from the
 * one the screen's own header claims. An explicit date, or today — `00 §5.7`.
 */
const summaryInput = z.object({
  branch_id: z.string().min(1).nullish(),
  business_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "business_date must be YYYY-MM-DD (01-F46)")
    .optional(),
});

/**
 * **THE NARROWING.** Which branches this subject's answer may cover, from the permission matrix
 * and nothing else. A named export so a test can point at it and a mutant can delete it.
 *
 * `null` is "every branch in the org" — Appendix A's "everything" cell, `12-F22`'s roll-up. A
 * one-element list is Appendix A's "own branch". Every other reach refuses, including `own_shift`:
 * a cashier's reconciliation is `02-F23`'s own screen on the till and this is not it, so widening
 * her here would answer a question doc 02 already answers narrowly.
 */
export const summaryBranchScope = (
  subject: Parameters<typeof reportScope>[0],
  branch_id: string | null,
): readonly string[] | null => {
  const reach = reportScope(subject, { org_id: subject.org_id, branch_id });
  if (reach === "org") return null;
  if (reach === "own_branch" && branch_id !== null) return [branch_id];
  // Fail closed. `can()` has already refused every route that reaches here, so this is the second
  // lock on one door — and the one that survives someone adding a third caller.
  throw new TRPCError({
    code: "FORBIDDEN",
    message:
      `report.sales_view reaches "${reach}" for this subject, which cannot answer a whole ` +
      `business day (12-F10). A branch-scoped subject must name their own branch_id.`,
  });
};

export const summaryProcedures = {
  /**
   * One business day, folded. `12-F10`'s blocks that this product can answer, plus `OMISSIONS` —
   * the blocks it cannot, with the FR that decides each. The omissions travel with the answer on
   * purpose: a screen that renders only what it received cannot tell an owner what is missing, and
   * an owner who does not know that voids are unmeasured will read their absence as "no voids".
   */
  nightly: authorized("report.sales_view")
    .input(summaryInput)
    .query(async ({ ctx, input }) => {
      const org_id = ctx.subject.org_id;
      const branch_id = input.branch_id ?? null;
      const branch_ids = summaryBranchScope(ctx.subject, branch_id);

      // `01-F46` — Asia/Karachi, 05:00 cutover, resolved through `domain` so the cloud and the
      // till cannot disagree about which day a sale banks to (`18 §2`).
      const business_date = input.business_date ?? businessDate(ctx.now());
      const bounds = businessDayBoundsOfDate(business_date);

      const window = await ctx.ledger.read({
        org_id,
        branch_ids,
        from_ms: bounds.start_ms,
        to_ms: bounds.end_ms,
      });

      // The narrowing applied a SECOND time, to the rows themselves. The reader is asked for the
      // right branches and the answer is checked against the same authorization outcome, because
      // a reader that ignored the filter would leak with a 200 and nothing on this side would
      // know. It is one `filter` and it makes the scope assertion provable without a live peer.
      const permitted =
        branch_ids === null
          ? window.events
          : window.events.filter((event) => branch_ids.includes(event.branch_id));

      const summary = summarise(permitted, bounds.start_ms + 1, { truncated: window.truncated });

      return {
        ...summary,
        // `12-F8` — never presented as live. The client renders the age; the server states the
        // instant, because a client clock is not a fact this product trusts anywhere else either.
        sync: {
          latest_arrival_ms: window.latest_arrival_ms,
          server_now_ms: ctx.now(),
        },
        // What the caller actually asked for, echoed so a screen cannot mislabel its own header
        // when a request and a response race.
        scope: { org_id, branch_id, covers: branch_ids },
      };
    }),
};
