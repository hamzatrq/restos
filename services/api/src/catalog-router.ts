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
   * **`01-F60`'s enabled `(branch, channel)` set — the axes `14-F29`'s grid is drawn on.**
   *
   * It returns `ctx.catalog.enabled`, which is *the same value* `assertSavable` refuses a save
   * against. That identity is the whole procedure: until August 2026 the set was declared twice —
   * `ENABLED_*` here and `NEXT_PUBLIC_ENABLED_*` in `apps/backoffice` — and the two could
   * disagree with nothing to notice. A grid drawn on axes the writer does not check publishes a
   * menu whose every tile reads `no price set` on the till while all four processes report
   * success (`services/api/CLAUDE.md`'s `BOOTSTRAP_ORG_ID` warning is the same class of silent
   * failure). Two copies cannot drift when there is one copy.
   *
   * **An EMPTY set travels as an empty set, and it is not permissive.** `assertSavable` refuses
   * every save when either axis is empty rather than treating an empty cross product as "nothing
   * to check" (`unconfiguredCatalog`), and this must carry that meaning to the client rather than
   * hide it: throwing here would render the back office's *unreachable* surface, which is true of
   * nothing — the service is answering, it is unconfigured, and those need different words and a
   * different action from an owner. So the honest empty answer goes on the wire and the editor
   * refuses to draw a grid on it.
   *
   * **Gated on `catalog.edit_menu_prices`, like every read in this bag**, for the reason in this
   * file's header: Appendix A has no catalog-READ row, inventing one would be inventing policy
   * (Commandment 2), and `SESSION_ONLY_PROCEDURES` is for procedures reading the CALLER'S OWN
   * identity — which org config is not. So no name joins either exemption list.
   *
   * The answer is the DEPLOYMENT's set rather than a per-org lookup, and that is stated rather
   * than implied: `00 §7`'s layer-2 config plane does not exist, so one process serves one set —
   * exactly as `ENABLED_BRANCHES` already did. It is still gated and still org-scoped in effect,
   * because `authorized(...)` requires a subject before anything is returned.
   */
  enabled: authorized("catalog.edit_menu_prices").query(({ ctx }) => ctx.catalog.enabled),

  /**
   * **What DEVICES have** — the published artifact, not the draft. Separate from `pending` on
   * purpose and asserted separately: a screen that merged them would show an owner a menu no till
   * has, and a cancelled edit would keep appearing as though it had shipped.
   */
  published: authorized("catalog.edit_menu_prices").query(({ ctx }) =>
    ctx.catalog.publisher.published(ctx.subject.org_id),
  ),

  /**
   * `14-F28` — pending day-end edits are visible until they land. The OTHER axis.
   *
   * **`name` is the DRAFT'S OWN, read off `edit.entry`, and never resolved from
   * `catalog.published`.** The row used to project identity alone, so an owner reviewing what lands
   * at 05:00 read `item / item-chicken-karahi` — a kind and a raw id — for a dish she knows by
   * name. The name was never missing: `StagedEdit.entry` is a whole `CatalogEntryWire` and carries
   * the name the owner just typed. Only this projection dropped it.
   *
   * **Resolving it from the published artifact instead is the defect this module is shaped
   * against** (see `catalog.ts`'s header: two version axes, conflating them is silent). It fails in
   * both directions and neither is visible on an item that happens to already exist:
   *
   *   - a **rename** would render the OLD name, describing the menu as it is rather than as this
   *     edit will leave it — and this list exists to answer "what lands at 05:00";
   *   - an entry **not yet published at all** has nothing to resolve against, so a brand-new item
   *     would fall back to its identifier for ever, which is the case a join cannot serve.
   *
   * **No fallback, because there is no absent case.** `CatalogEntryWire.name` is
   * `z.string().min(1)` and every staged entry is parsed through it — `save` validates its input
   * against `CatalogEntryWire` and `assertSavable` returns `safeParse`'s output, and `archive`
   * stages an already-published entry. `01-F54`'s degrade-to-identifier precedent governs a
   * *resolution* — a device holding an id whose catalog has not synced — and there is no resolution
   * here: the name arrives in the same record as the id, so no state exists where one is present
   * and the other is not. A `?? entity_id` here would be an unreachable branch dressed as a
   * safeguard, and `24 §3b` refuses error handling for implausible cases.
   */
  pending: authorized("catalog.edit_menu_prices").query(async ({ ctx }) =>
    (await ctx.catalog.staged.pending(ctx.subject.org_id)).map((edit) => ({
      edit_id: edit.edit_id,
      entity: edit.entry.kind,
      entity_id: edit.entry.id,
      name: edit.entry.name,
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
