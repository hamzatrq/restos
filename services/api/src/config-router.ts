/**
 * `14-F43`..`14-F48` — the layer-2 configuration surface, as two gated procedures.
 *
 * **Both are built with `authorized("config.manage")`**, which is the point of the whole change:
 * `assertEveryProcedureIsGated` refuses to boot a host carrying an ungated procedure, and until
 * `14-F43` there was no configuration action for it to be gated on — so R55's tax cells, R60's
 * commission and R63's thresholds were *"unbuildable and unbootable"*, not merely unbuilt. Neither
 * exemption list changed and neither may: `PUBLIC_PROCEDURES` would put an org's tax rates on the
 * open internet, and `SESSION_ONLY_PROCEDURES` is for procedures reading the CALLER'S OWN identity,
 * which an org's approval thresholds are not.
 *
 * **NEITHER PROCEDURE TAKES A `branch_id`, and here that is `01-F87`'s scope rather than
 * `device-router.ts`'s security argument.** Every setting in this block is ORG-scoped — `14-F43`
 * says so in terms (*"every setting in this block is org-scoped rather than branch-scoped, so
 * §9.6's ruling does not transfer"*) and `01-F87` puts the artifact on `branch_id: null`. Stating
 * no branch resolves `can()`'s scope to `null`, which `rolesAt` matches against org-wide
 * assignments only, so a branch-scoped owner is refused outright. **The cost is stated and it is
 * the intended one**: a branch-scoped owner cannot set an org-wide tax rate, which is the correct
 * answer rather than a limitation.
 *
 * ## The order of the two writes, and why it is the opposite of `device-router.ts`'s
 *
 * There the registry write goes FIRST, because a failure between the two must leave a dead till
 * rather than a live one. Here the **artifact goes first too**, and for `publishEdits`' catalog
 * reasoning rather than that one: `01-F87` (a) makes the ledger record carry *"the `01-F76`
 * artifact version this change produced"*, so the version has to exist before the record can name
 * it. A failure between them leaves a **published setting with no history row** — recoverable, and
 * visible the moment `20 §4.2`'s Auditor refolds — where the reverse would leave a history row
 * naming a version that was never published, which `01-F1` forbids correcting in place.
 */

import { CONFIG_KEYS, isConfigKey } from "@restos/domain/config";
import { z } from "zod";
import { type ConfigRow, ConfigRowSchema } from "./config.js";
import { authorized } from "./trpc.js";

const saveInput = z.object({
  /**
   * The rows to change. `min(1)` because an empty save is not a version (`publishConfig` refuses
   * it too) and a surface that minted one would fill `14-F3`'s history with edits that edited
   * nothing.
   */
  entries: z.array(ConfigRowSchema).min(1),
});

/**
 * The value a key held BEFORE this save, out of the org's current artifact.
 *
 * `null` means *the key was on its declared default* — `01-F87` (a)'s own encoding, which is what
 * makes a first configuration (`null → v`) and a reset (`v → null`) both statable.
 */
const valueBefore = (
  entries: readonly { key: string; value?: unknown }[],
  key: string,
): unknown => {
  const row = entries.find((entry) => entry.key === key);
  return row === undefined ? null : (row.value ?? null);
};

export const configProcedures = {
  /**
   * `14-F45`'s grid source, and the read that closes the gate this whole plane was built for: a
   * cloud surface can now resolve an org's tax posture, its charge-rounding step and its
   * thresholds, so `12-F9`'s owner summary and a storefront total can agree with the till.
   *
   * It returns the artifact as the DEVICE would receive it — see `ConfigPlane.read`.
   */
  read: authorized("config.manage").query(async ({ ctx }) => ctx.config.read(ctx.subject.org_id)),

  /**
   * `14-F43`'s write — `14-F48`'s refusals happen at the gateway's `publishConfig`, one
   * declaration, and arrive here as its own refusal message.
   *
   * ⚠ **The `before` values are read BEFORE the save and from the SAME artifact the device holds.**
   * Reading them after would record `after → after` on every row; reading them from a staging table
   * would be `14-F3`'s own named defect one module over (*"`before_ref` must be the state a device
   * actually has, never the staging table's opinion of it"*).
   */
  save: authorized("config.manage")
    .input(saveInput)
    .mutation(async ({ ctx, input }) => {
      const org_id = ctx.subject.org_id;
      const now = ctx.now();
      const current = await ctx.config.read(org_id);
      // The reshape drops an `undefined` rather than carrying it, which `exactOptionalPropertyTypes`
      // makes a type error and which matters beyond the compiler: `01-F87` (b) treats a `value` of
      // `undefined` on an unmarked row as a malformed known key, so a carried `undefined` would
      // refuse the org's whole artifact at every till. It copies every field the schema declares
      // and adds none — `catalog-fetch.ts`'s `toEntry` is this repo's measured lesson about what a
      // lossy reshape costs (0 of 579 tests, every synced tile unsellable).
      const rows: ConfigRow[] = input.entries.map((entry) => ({
        key: entry.key,
        ...(entry.value === undefined ? {} : { value: entry.value }),
        ...(entry.deleted === undefined ? {} : { deleted: entry.deleted }),
      }));
      const version = await ctx.config.save(org_id, rows, {
        actor_user_id: ctx.subject.user_id,
        now,
      });

      /**
       * `01-F87` (a) — one `config.changed` per changed KEY.
       *
       * **Sequential and not `Promise.all`**, because `01-F62` orders this store on
       * `server_received_at` with an arrival tiebreak: a parallel append leaves the tiebreak
       * deciding the order of one owner's edits, and `14-F3` renders them in that order.
       *
       * ⚠ **A FAILURE HERE DOES NOT UNDO THE SAVE and must not** — the artifact is already
       * serving every till in the org, and `01-F1` forbids deleting the history rows that did
       * land. The residual is named rather than hidden: a save whose history is partly written is
       * visible to `20 §4.2`'s Auditor and to `14-F3`'s own reader, and it is the direction the
       * ordering above was chosen for.
       */
      for (const entry of rows) {
        // An UNKNOWN key cannot reach here — `publishConfig` refused the save above — so this is
        // the compiler's narrowing rather than a second check. `layer` comes from the registry and
        // never from the request: `01-F87` (a) makes it a required, closed field precisely because
        // `config.changed` spans layers (`15-F25` routes an org's suspension through it, which is
        // layer 1) and a reader that cannot tell them apart can neither render history nor scope
        // an isolation check.
        if (!isConfigKey(entry.key)) continue;
        await ctx.config.recordChange({
          org_id,
          key: entry.key,
          layer: CONFIG_KEYS[entry.key].layer,
          version,
          before: valueBefore(current.entries, entry.key),
          // A RESET states `null` — *the key is back on its declared default* — which is the other
          // half of `01-F87` (a)'s two statable transitions.
          after: entry.deleted === true ? null : (entry.value ?? null),
          actor_user_id: ctx.subject.user_id,
          server_received_at: now,
        });
      }
      return { version };
    }),
};
