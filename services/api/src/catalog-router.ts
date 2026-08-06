/**
 * B-3 + B-4 — the catalog procedures (`plans/wave-1/backoffice-catalog.md` §4.2, §4.3).
 *
 * **Every procedure here is built with `authorized(...)`, and that is what makes it legal.**
 * `assertEveryProcedureIsGated` refuses to boot a host carrying one that is not, so a procedure
 * added below without a gate stops the service rather than answering the request.
 *
 * The action is `catalog.edit_menu_prices` on all of them, READS INCLUDED, and that is a
 * decision rather than laziness. Appendix A has no catalog-READ row and `PERMISSION_ACTIONS` has
 * no read action; inventing one would be inventing policy (Commandment 2), and putting the reads
 * on `SESSION_ONLY_PROCEDURES` would exempt an org-scoped read of the whole menu from the matrix
 * entirely — that list is for procedures reading the CALLER'S OWN identity. So the editor's reads
 * are gated by the edit action they exist to serve, which is `14-F1`'s "role-gated per the
 * permission matrix" read at its narrowest. The cost is stated: a branch manager cannot read the
 * menu through this router even though Appendix A denies her only the EDIT. When a read action is
 * specified, these three move to it.
 *
 * The `01-F52` scope is the ORG, so no procedure takes a `branch_id`: the catalog is org-scoped
 * and byte-identical everywhere, with the branch axis living inside the price grid as DATA
 * (`01-F60`, founder ruling). A `branch_id` here would suggest a per-branch catalog, which is the
 * error that ruling exists to prevent.
 */

import { CatalogEntryWire } from "@restos/sync-protocol";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { assertSavable, type CatalogEntry } from "./catalog.js";
import { type CatalogRuntime, publishEdits, stageEdit } from "./publish.js";
import { authorized } from "./trpc.js";

/**
 * A writer-side refusal is the OWNER'S mistake, not the server's — `400`, and carrying the
 * message, because `01-F60`'s refusal is required to name the entry, the branch and the channel,
 * and a client that renders "save failed" has thrown away the only actionable part.
 */
const refuse = (error: unknown): never => {
  if (error instanceof RangeError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message, cause: error });
  }
  throw error;
};

/**
 * `14-F28`'s two timings, resolved. `now` publishes here; `day_end` goes to the staging store and
 * waits for the `01-F46` boundary, visible and cancellable until it lands.
 *
 * ONE function for both entry points (save and archive) so the default cannot be right in one and
 * wrong in the other.
 */
const applyOrStage = async (
  runtime: CatalogRuntime,
  org_id: string,
  actor_user_id: string,
  entry: CatalogEntry,
  apply_when: "day_end" | "now" | undefined,
): Promise<{
  edit_id: string;
  apply_when: "day_end" | "now";
  lands_at: number;
  version: number | null;
}> => {
  const edit = stageEdit(runtime, { org_id, actor_user_id, entry, apply_when });
  const immediate = edit.apply_when === "now";
  const version = immediate ? await publishEdits(runtime, org_id, [edit]) : null;
  if (!immediate) await runtime.staged.stage(edit);
  return {
    edit_id: edit.edit_id,
    apply_when: edit.apply_when,
    lands_at: edit.lands_at,
    version,
  };
};

/**
 * `14-F28` — the owner's choice per edit. **Optional on the wire and defaulted to `day_end` by
 * the server**, so a client that omits it gets the safe timing rather than the breaking one.
 * `27-F4`: a grid that moves under a cashier mid-shift is a breaking change.
 */
const applyWhen = z.enum(["day_end", "now"]).optional();

const saveInput = z.object({ entry: CatalogEntryWire, apply_when: applyWhen });

const archiveInput = z.object({
  kind: z.string().min(1),
  id: z.string().min(1),
  apply_when: applyWhen,
});

const cancelInput = z.object({ edit_id: z.string().min(1) });

/**
 * A plain record of procedures rather than a `router(...)`, so `router.ts` can mount them beside
 * B-2's `editMenuPrices` probe in the one `catalog` namespace. That probe is not dead code to be
 * tidied away: the B-2 acceptance suite uses it as its authorization fixture in fifteen
 * assertions, and it is read-only to this session (`24 §3`).
 */
export const catalogProcedures = {
  /**
   * **What DEVICES have** — the published artifact, not the draft. Separate from `pending` on
   * purpose and asserted separately: a screen that merged them would show an owner a menu no till
   * has, and a cancelled edit would keep appearing as though it had shipped.
   */
  published: authorized("catalog.edit_menu_prices").query(({ ctx }) =>
    ctx.catalog.publisher.published(ctx.subject.org_id),
  ),

  /** `14-F28` — pending day-end edits are visible until they land. The OTHER axis. */
  pending: authorized("catalog.edit_menu_prices").query(async ({ ctx }) =>
    (await ctx.catalog.staged.pending(ctx.subject.org_id)).map((edit) => ({
      edit_id: edit.edit_id,
      entity: edit.entry.kind,
      entity_id: edit.entry.id,
      actor_user_id: edit.actor_user_id,
      staged_at: edit.staged_at,
      apply_when: edit.apply_when,
      lands_at: edit.lands_at,
    })),
  ),

  /** `14-F3` — the change history, read from the LEDGER rather than from the catalog. */
  history: authorized("catalog.edit_menu_prices").query(({ ctx }) =>
    ctx.catalog.ledger.history(ctx.subject.org_id),
  ),

  /**
   * Save an entry. `14-F29`'s grid is the screen (B-6); this is its server half.
   *
   * Validation happens BEFORE the timing branch, so an unpriced entry is refused identically
   * whether the owner chose day-end or apply-now — the alternative lets a day-end save defer its
   * refusal to a 05:00 scheduler with nobody watching.
   */
  save: authorized("catalog.edit_menu_prices")
    .input(saveInput)
    .mutation(async ({ ctx, input }) => {
      let entry: CatalogEntry;
      try {
        entry = assertSavable(input.entry, ctx.catalog.enabled);
      } catch (error) {
        return refuse(error);
      }
      // The SUBJECT's id. `14-F3`'s history is "changed by Ali"; a client-supplied actor would be
      // a role claim in another costume (Commandment 8).
      return applyOrStage(
        ctx.catalog,
        ctx.subject.org_id,
        ctx.subject.user_id,
        entry,
        input.apply_when,
      );
    }),

  /**
   * `14-F7` — **archive, never delete.** This stages a TOMBSTONE (`01-F55`): the entry keeps its
   * name and stays resolvable by id, so a reprint of an order placed before the archive still
   * renders it, and `01-F53` froze that order's prices anyway.
   *
   * There is deliberately no procedure that removes a row. The refusal below is for an id that
   * was never published — archiving a draft is a cancel, not an archive, and answering it as an
   * archive would publish a tombstone for an entry no device has ever seen.
   */
  archive: authorized("catalog.edit_menu_prices")
    .input(archiveInput)
    .mutation(async ({ ctx, input }) => {
      const org_id = ctx.subject.org_id;
      const { entries } = await ctx.catalog.publisher.published(org_id);
      const current = entries.find((e) => e.kind === input.kind && e.id === input.id);
      if (current === undefined) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            `catalog archive: ${input.kind}/${input.id} has never been published, so there is ` +
            `nothing to tombstone (14-F7). A staged edit is cancelled, not archived.`,
        });
      }
      // The published entry, MARKED. Its name travels with it — that is the whole of `01-F55`.
      return applyOrStage(
        ctx.catalog,
        org_id,
        ctx.subject.user_id,
        { ...current, deleted: true },
        input.apply_when,
      );
    }),

  /** `14-F28` — "cancellable until they land". `cancelled: false` when it already has. */
  cancelPending: authorized("catalog.edit_menu_prices")
    .input(cancelInput)
    .mutation(async ({ ctx, input }) => ({
      cancelled: await ctx.catalog.staged.cancel(ctx.subject.org_id, input.edit_id),
    })),

  /**
   * The day-end sweep, reachable as a procedure so an operator can run it and so the acceptance
   * suite can advance the clock rather than wait six hours for a timer. `start()` also runs it on
   * an interval — that is the production path, and this is not a second one: both call the SAME
   * `scheduler.runDue()`, which re-reads the live pending set every sweep.
   *
   * Org-scoped despite the sweep being global: it returns only this caller's org's result, so a
   * back office cannot learn that another org published anything.
   */
  runDayEnd: authorized("catalog.edit_menu_prices").mutation(async ({ ctx }) => {
    const landed = await ctx.catalog.scheduler.runDue();
    const mine = landed.find((entry) => entry.org_id === ctx.subject.org_id);
    return { version: mine === undefined ? null : mine.version };
  }),
};
