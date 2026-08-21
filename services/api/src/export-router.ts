/**
 * `22-F16` / R38 — the owner triggers an export of HER OWN org, and of nothing else.
 *
 * **All three procedures are built with `authorized("export.request")`** (`22-F23`, owner-only), so
 * `assertEveryProcedureIsGated` sees them and **neither exemption list changed**: an org's complete
 * event log is not the caller's own identity, and putting it on `PUBLIC_PROCEDURES` needs no
 * explanation.
 *
 * ## `01-F71` (f) (iii) — the org comes from the SUBJECT, on every one of them
 *
 * Not one procedure below takes an `org_id`, and `requestExport` takes no input at all. `28-F5` (b):
 * *"There is no tenant-context header, no `?org=` on a tenant API and no impersonation shortcut
 * through one."* An export id is a CAPABILITY — it names a bundle holding a whole restaurant's
 * ledger — so `get` is called with `ctx.subject.org_id` as its first argument and the store cannot
 * be asked a question that is not about the caller's tenant.
 *
 * ## No `branch_id`, deliberately, and it is the same reasoning `device-router.ts` recorded
 *
 * `trpc.ts` scopes `can()` from the RAW input, so stating a branch would look like `01-F26` done
 * properly. It is wrong here for a reason specific to this surface: `22-F16`'s bundle is the ORG's
 * complete event log and has no branch axis at all, so a branch on the request could only ever
 * narrow the AUTHORIZATION and never the answer — an owner assigned to one branch would pass a
 * check about that branch and receive the whole estate. Stating no branch resolves the scope to
 * `null`, which matches org-wide assignments only, and `22-F23`'s cells make this owner-only in any
 * case. That is the narrow direction; widening later is additive.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { authorized } from "./trpc.js";

/**
 * **Input `{}` and not `.optional()`, and unknown keys are STRIPPED rather than refused.** A
 * caller that sends `{ org_id: "…" }` loses it here, before anything resolver-shaped sees it — the
 * same posture `scopeInput` already takes for `role` and `assignments` one file over. Refusing the
 * request outright would also be correct and is not chosen: `01-F71` (b)'s rule is that a stated
 * org changes NOTHING, and silently having no effect is the strongest form of that.
 */
const noInput = z.object({});

const statusInput = z.object({ export_id: z.string().min(1) });

export const exportProcedures = {
  /**
   * `22-F16`'s trigger. Returns the id and `22-N3`'s state, which is what a screen renders while
   * the job runs.
   *
   * ⚠ **It records a request; it does not start a job.** The enqueue into `services/jobs` is OWED
   * and is named in `exports.ts` — with no `exports` dependency supplied by `start()`, this
   * procedure refuses in a real deployment rather than reporting a queued export nobody is
   * preparing.
   */
  requestExport: authorized("export.request")
    .input(noInput)
    .mutation(async ({ ctx }) => {
      const record = await ctx.exports.request({
        // `01-F71` (f) (iii): the subject's org, never the request's.
        org_id: ctx.subject.org_id,
        // `22-F16`'s "audited" half, as far as this product can currently take it (`22-F23`).
        requested_by_user_id: ctx.subject.user_id,
        // `18 §4` — the clock is injected at the composition root and read here, never `Date.now()`.
        requested_at: ctx.now(),
      });
      return { export_id: record.export_id, state: record.state };
    }),

  /**
   * `22-N3` — *"owner sees progress state, never a spinner."*
   *
   * **A foreign or unknown id is `NOT_FOUND` and the two are deliberately indistinguishable.**
   * Answering `FORBIDDEN` for an id that exists in another org and `NOT_FOUND` for one that exists
   * nowhere would turn this into an export-id oracle — the same enumeration argument `auth.login`
   * already makes for "no such account" versus "wrong password", and it matters more here because
   * the thing being probed for is a bundle of somebody else's ledger.
   */
  exportStatus: authorized("export.request")
    .input(statusInput)
    .query(async ({ ctx, input }) => {
      const record = await ctx.exports.get(ctx.subject.org_id, input.export_id);
      if (record === null) {
        throw new TRPCError({ code: "NOT_FOUND", message: "no such export for this org" });
      }
      return record;
    }),

  /**
   * Every export this org has asked for. It exists so `22-N3`'s progress surface has a list to
   * render, and because a port method with no caller is this wave's recurring defect in miniature
   * (AGENTS.md) — `ExportRequests.list` would otherwise be a member nothing reaches.
   */
  exports: authorized("export.request")
    .input(noInput)
    .query(async ({ ctx }) => ctx.exports.list(ctx.subject.org_id)),
};
