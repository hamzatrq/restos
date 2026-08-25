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

import { DEVICE_CLASSES, DisplayName } from "@restos/domain";
import { z } from "zod";
import { withActors } from "./devices.js";
import { authorized } from "./trpc.js";

const revokeInput = z.object({ device_id: z.string().min(1) });

/**
 * `01-F80` (a) / `14-F41` — *"The form asks three facts and no more."*
 *
 * ⚠ **`device_id` is absent and there is nowhere to put one.** `01-F80` (a) mints it; a caller
 * that could supply one would be choosing an identity `01-F68` never reuses.
 *
 * ⚠ **`branch_id` IS taken here, and `14-F30`'s §9.6 ordering point is why it is safe where
 * `revoke`'s was not.** This file's header records that `revoke` refuses a `branch_id` because this
 * service learns a device's branch only by reading the registry, so a caller-stated branch would be
 * checked *after* the destructive act. The mint has no such problem: the branch is an INPUT to the
 * act rather than a fact about an existing row, so `trpc.ts`'s middleware scopes
 * `can("device.manage")` to the branch the caller named **before the code is minted** — which is
 * exactly what `14-F41` requires ("the branch is checked before the code is minted, because a check
 * that runs after the mint authorizes nothing and the credential already exists").
 */
const mintInput = z.object({
  branch_id: z.string().min(1),
  /**
   * `01-F39`'s vocabulary, from `packages/domain` and never redeclared. It is a *vendor* string and
   * `14-F38` forbids rendering it — the screen offers "connect a till" / "connect a kitchen screen"
   * and maps to this here, so the closed set has one declaration and the words have another.
   */
  device_class: z.enum(DEVICE_CLASSES),
  /** `01-F70`, required at registration, through `packages/domain`'s one authority. */
  display_name: DisplayName,
});

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
   * `14-F41` — the waiting rows, beside `list`'s device rows.
   *
   * **Two reads and no join**, because they are two different kinds of thing and `14-F41` says so:
   * *"Before a claim there is no device"*, and *"the waiting row BECOMES `14-F12`'s device row"*.
   * A screen that merged them would render a fleet containing tills that do not exist — the
   * `00 §5.7` failure of showing something as present when it is only expected.
   */
  pairings: authorized("device.manage").query(async ({ ctx }) => {
    return ctx.devices.pairings(ctx.subject.org_id);
  }),

  /**
   * `01-F80` (a) / `14-F41` — **mint a pairing code.**
   *
   * This is the act that lets an owner put a till on the floor without anybody holding a shell on
   * the service host. Until it landed, `provision-device` was the only path and `28-F13` recorded
   * where a self-onboarded restaurant stopped: *an org, an owner, and no way to reach a till.*
   *
   * **The code is returned and never stored on this plane either.** `14-F41` requires no ability of
   * the cloud to reproduce a live code, so there is no read that can fetch it back; the way out of
   * a lost code is to mint another, which kills the first (`01-F80` (c)).
   *
   * ⚠ **It emits NO event, and `14-F41` is explicit that this is blocked one layer down rather than
   * chosen.** That FR names this act as what unblocks `device.registered` — the authenticated
   * moment an audit trail wants — and then records that the type has **no payload schema in
   * `packages/domain`**, so `01-F4` makes the emit a build-time *and* runtime error: unbuildable,
   * not unbuilt. The actor is carried to the gateway and stored on the pending row, so the emit has
   * an actor the day that schema lands; adding the event here would need the doc-01 act first
   * (`14 §9.12` records that its ROUTING is stated in two documents that do not agree).
   */
  mintPairing: authorized("device.manage")
    .input(mintInput)
    .mutation(async ({ ctx, input }) => {
      return ctx.devices.mintPairing({
        org_id: ctx.subject.org_id,
        branch_id: input.branch_id,
        device_class: input.device_class,
        display_name: input.display_name,
        // Commandment 8: the SUBJECT's id. A client-supplied actor is a role claim in another
        // costume, and this is the field `14-F41` says an audit trail wants.
        actor_user_id: ctx.subject.user_id,
        // ONE reading, so `01-F80` (c)'s fifteen minutes are measured from this act's instant
        // rather than from whenever the writer happened to run (`18 §4`).
        now: ctx.now(),
      });
    }),

  /**
   * `14-F41` — **cancel an unclaimed code, and it is NOT revocation.**
   *
   * The FR's own sentence is the whole specification: *"Before a claim there is no device:
   * cancelling an unclaimed code destroys a credential nobody holds, emits nothing, and may be
   * repeated freely. After a claim the act is `14-F13`'s revocation, which is permanent."*
   *
   * **So this appends nothing**, unlike `revoke` beside it — there is no device to attribute a
   * `device.revoked` to, and writing one would put a permanent record of a till being switched off
   * where no till ever existed (`01-F1`). `cancelled: false` means a claim beat the press, and the
   * screen must then say the device is real and that removing it is the other, permanent act.
   */
  cancelPairing: authorized("device.manage")
    .input(revokeInput)
    .mutation(async ({ ctx, input }) => {
      const outcome = await ctx.devices.cancelPairing(ctx.subject.org_id, input.device_id);
      return { device_id: input.device_id, cancelled: outcome.cancelled };
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
