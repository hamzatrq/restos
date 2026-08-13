/**
 * `14-F12`'s device list and `14-F13`'s revocation, as two gated procedures.
 *
 * **Both are built with `authorized("device.manage")`**, which is the point of the whole change:
 * `assertEveryProcedureIsGated` refuses to boot a host carrying an ungated procedure, and until
 * `14-F30` there was no device action for it to be gated on — so this surface could not legally
 * exist. Neither exemption list changed and neither may: `PUBLIC_PROCEDURES` would put a kill
 * switch on the open internet, and `SESSION_ONLY_PROCEDURES` is for procedures reading the CALLER'S
 * OWN identity, which an org's device fleet is not.
 *
 * **NEITHER PROCEDURE TAKES A `branch_id`, and that is a security decision rather than an
 * omission.** `trpc.ts`'s middleware reads `branch_id` off the raw input to scope `can()`, and the
 * tempting shape here is to send the device's branch so a branch-scoped owner can be judged per
 * location (`01-F26`). It was written that way first and it is **wrong in a way worth recording**:
 * this service learns a device's branch only by reading the registry, and the registry read that
 * would confirm it happens inside the revocation itself — so the check lands *after* the
 * destructive act, and a caller who names a branch they hold could revoke a device at a branch they
 * do not. Stating no branch resolves the scope to `null`, which `rolesAt` matches against org-wide
 * assignments **only**: a branch-scoped subject is refused outright, before anything is written.
 * That is `trpc.ts` decision 3's fail-closed direction, and `14-N2`/doc 14 §4 both describe the
 * org-wide owner anyway. The cost is stated: a branch-scoped owner cannot revoke even at her own
 * branch. Widening that needs a registry read BEFORE the write — a `find(org_id, device_id)` on the
 * port — and is additive when a role that needs it exists.
 */

import { z } from "zod";
import { withActors } from "./devices.js";
import { authorized } from "./trpc.js";

const revokeInput = z.object({ device_id: z.string().min(1) });

export const deviceProcedures = {
  /**
   * `14-F12` — every device the org has, with `14-F13`'s revoked state and actor resolved.
   *
   * Two reads and a join (`withActors`), not one query, because the two facts live in two stores
   * for a reason `01-F48` makes load-bearing: `revoked_at` is on the registry row the eviction
   * sweep re-reads, and the actor is on an `01-F62` org-scoped event. See `devices.ts`.
   */
  list: authorized("device.manage").query(async ({ ctx }) => {
    const org_id = ctx.subject.org_id;
    const [devices, revocations] = await Promise.all([
      ctx.devices.list(org_id),
      ctx.devices.revocations(org_id),
    ]);
    return withActors(devices, revocations);
  }),

  /**
   * `14-F13` — "Revocation is immediate ('stolen tablet' flow)".
   *
   * **Order is load-bearing and it is the security direction, not the tidy one.** The registry
   * write happens FIRST and the attribution second:
   *
   *   - this way, a failure between them leaves a **dead till with an unattributed revocation** —
   *     `01-F48`'s sweep evicts it within 30 s regardless, because eviction reads `revoked_at` and
   *     never the ledger;
   *   - the reverse leaves a **live till with an attributed revocation**: a history row claiming a
   *     device was switched off while it goes on selling, which `01-F1` forbids deleting.
   *
   * It is the same reasoning `publishEdits` records for the catalog (artifact first, history
   * second), and here the asymmetry is sharper because one side of it is a stolen tablet.
   *
   * **An ALREADY-revoked device appends nothing**, and that is not an optimisation. `revokeDevice`
   * stamps only the first revocation, so the instant did not move — writing `device.revoked` with
   * today's actor would attribute last Tuesday's act to whoever pressed the button today, in a
   * store `01-F1` forbids correcting in place. The outcome carries `already` so the screen says
   * what happened instead of claiming credit. The cost is stated: a device revoked by
   * `pnpm -C services/sync-gateway revoke-device` keeps `revoked_by: null` for ever and pressing
   * revoke again does not adopt it. That is correct — "not recorded" is true and "revoked by this
   * owner" would not be.
   *
   * **There is no un-revoke procedure and there must not be** (`14-F30`): the corpus is silent
   * rather than permissive, and `01-N5`'s replacement path is a fresh `device_id`.
   */
  revoke: authorized("device.manage")
    .input(revokeInput)
    .mutation(async ({ ctx, input }) => {
      const org_id = ctx.subject.org_id;
      const outcome = await ctx.devices.revoke(org_id, input.device_id);

      if (!outcome.already) {
        await ctx.devices.recordRevocation({
          org_id,
          device_id: input.device_id,
          // The REGISTRY's branch and class, never the caller's — `01-F1` keeps this row for ever,
          // and a stale client saying `branch-2` would put a wrong fact in it permanently.
          branch_id: outcome.branch_id,
          device_class: outcome.device_class,
          // `14-F13`'s actor: the SUBJECT's id. A client-supplied actor would be a role claim in
          // another costume (Commandment 8), and this is the field the whole FR turns on.
          actor_user_id: ctx.subject.user_id,
          // `01-F62` — server time is the ordering authority for an org-scoped event, stamped once
          // here from the injected clock (`18 §4`).
          server_received_at: ctx.now(),
        });
      }

      return {
        device_id: input.device_id,
        branch_id: outcome.branch_id,
        device_class: outcome.device_class,
        revoked_at: outcome.revoked_at,
        already: outcome.already,
        revoked_by: outcome.already ? null : ctx.subject.user_id,
      };
    }),
};
