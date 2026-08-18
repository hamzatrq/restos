/**
 * `14-F14`'s user CRUD as five gated procedures, and `user.changed` with a PRODUCER at last.
 *
 * **Every one is built with `authorized("user.manage")`** (`14-F39`, owner-only), which is what
 * makes the surface legal at all: `assertEveryProcedureIsGated` refuses to boot a host carrying an
 * ungated procedure, and until `14-F39` the matrix named no user action for it to be gated on —
 * so `14-F14` *"cannot be built or booted"*, the same wall `14-F30` found in front of the device
 * list one §3 block down. **Neither exemption list changed and neither may:**
 * `PUBLIC_PROCEDURES` would put an org's staff roster and a PIN-reset button on the open internet,
 * and `SESSION_ONLY_PROCEDURES` is for procedures reading the CALLER'S OWN identity, which the
 * people who may sell in a restaurant are not.
 *
 * **NO PROCEDURE TAKES AN `org_id`** (`01-F71` (b)): it is resolved from `ctx.subject` and a body
 * that states one reaches no code path, because `trpc.ts`'s `scopeShape` strips unknown keys.
 *
 * ⚠ **`deactivate` STATES A `branch_id` AND `device-router.ts` DELIBERATELY DOES NOT — the two are
 * not in tension.** That file records why a device revocation must not carry one: this service
 * learns a device's branch only by reading the registry, and that read happens *inside* the
 * revocation, so a branch check would land after the destructive act. Here the branch is not a fact
 * to be looked up, it is **part of the act**: `11-F22` makes participation per-(person, branch) and
 * the request is "make her inactive at Tariq Road". `trpc.ts` then scopes `can()` to that branch,
 * which is `01-F26` working as intended and strictly narrower than stating nothing — an org-wide
 * owner passes either way, and a branch-scoped subject is judged at the branch she named rather
 * than being admitted somewhere unstated.
 *
 * **Write FIRST, attribute SECOND, on `device-router.ts`'s recorded direction.** A failure between
 * them leaves a real roster change with no ledger row (`14-F2` short one record); the reverse
 * leaves a history row saying a cashier was let go while she goes on selling, and `01-F1` forbids
 * deleting the claim. The asymmetry is the same one, one surface over.
 *
 * ⚠ **WHAT IS NOT HERE AND IS OWED, named so it is not mistaken for complete.** `14-F14` also lists
 * *"per-user permission overrides within matrix bounds"* — nothing in this product models one and
 * no FR states their shape, so building them would be inventing policy (commandment 2). There is no
 * RE-ACTIVATION procedure either: R32 makes it a two-step act (flip the status, then set a PIN) and
 * requires the skipped second step to fail LEGIBLY, which is a device unlock-flow behaviour this
 * surface cannot supply on its own. And `14-F15`'s per-user login and audit history is a read this
 * action already gates and nothing yet serves.
 */

import { hashPin } from "@restos/domain";
import { z } from "zod";
import { authorized } from "./trpc.js";
import { UserChangedPayload } from "./user-directory.js";

/**
 * `01-F26`'s pair as an owner states it. **No `status`** — `11-F22` makes participation the
 * writer's (`active` where newly assigned, carried over where she already was), because a client
 * that could state it could create a cashier who is `inactive` on her first shift.
 */
const assignmentInput = z.object({
  role: z.string().min(1),
  branch_id: z.union([z.string().min(1), z.null()]),
});

const createInput = z.object({
  display_name: z.string().min(1),
  /**
   * `null` for R30's till-only cashier: *"a cashier who only uses the till needs no email; email is
   * required only for BACK-OFFICE access."* An owner made to invent one *"puts a wrong address
   * permanently into a directory `11-F20` never deletes from"*. `min(1)` because `""` is an
   * invented address rather than an absent one.
   */
  email: z.union([z.string().min(1), z.null()]),
  assignments: z.array(assignmentInput),
});

const assignmentsInput = z.object({
  user_id: z.string().min(1),
  assignments: z.array(assignmentInput),
});

/**
 * `14-F14`'s PIN set/reset. **It takes the PLAINTEXT and this service hashes it** — R29 rules that
 * the owner types her cashier's PIN and tells her, so a plaintext necessarily crosses from the
 * browser to here; `11-F21` puts the Argon2id call at ONE site (`domain`'s `hashPin`, at `01-F61`'s
 * cost floor) and the gateway's `setPinCredential` takes a hash. **This is the boundary the
 * plaintext stops at**, which is why the `/internal/users/pin` route refuses a `pin` field by name.
 */
const pinInput = z.object({
  user_id: z.string().min(1),
  pin: z.string().min(1),
});

const deactivateInput = z.object({
  user_id: z.string().min(1),
  /** `null` addresses `01-F26`'s org-wide assignment, not "all branches" (`11-F22`). */
  branch_id: z.union([z.string().min(1), z.null()]),
});

export const userProcedures = {
  /** `14-F14`'s roster — this org's people, in `01-F61`'s explicit grid order. */
  list: authorized("user.manage").query(async ({ ctx }) => ctx.users.list(ctx.subject.org_id)),

  create: authorized("user.manage")
    .input(createInput)
    .mutation(async ({ ctx, input }) => {
      const org_id = ctx.subject.org_id;
      // ONE reading of the injected clock (`18 §4`) for the act and its record, on `publishEdits`'
      // rule: one act must not be split into two instants, or a history row and the write it
      // describes disagree about when "the" change happened.
      const now = ctx.now();
      const minted = await ctx.users.create({
        org_id,
        display_name: input.display_name,
        email: input.email,
        assignments: input.assignments,
        actor_user_id: ctx.subject.user_id,
        now,
      });
      await ctx.users.recordChange({
        org_id,
        actor_user_id: ctx.subject.user_id,
        server_received_at: now,
        payload: UserChangedPayload.parse({ act: "created", user_id: minted.user_id }),
      });
      return minted;
    }),

  setAssignments: authorized("user.manage")
    .input(assignmentsInput)
    .mutation(async ({ ctx, input }) => {
      const org_id = ctx.subject.org_id;
      const now = ctx.now();
      await ctx.users.setAssignments({
        org_id,
        user_id: input.user_id,
        assignments: input.assignments,
        actor_user_id: ctx.subject.user_id,
        now,
      });
      await ctx.users.recordChange({
        org_id,
        actor_user_id: ctx.subject.user_id,
        server_received_at: now,
        payload: UserChangedPayload.parse({
          act: "assignments_changed",
          user_id: input.user_id,
        }),
      });
    }),

  setPin: authorized("user.manage")
    .input(pinInput)
    .mutation(async ({ ctx, input }) => {
      const org_id = ctx.subject.org_id;
      const now = ctx.now();
      await ctx.users.setPin({
        org_id,
        user_id: input.user_id,
        // The one Argon2id call this act makes. Nothing downstream sees `input.pin` again, and
        // nothing returns it: `14-F14` says a PIN is "never displayed", so the response carries the
        // act's outcome and no credential in either form.
        pin_hash: await hashPin(input.pin),
        actor_user_id: ctx.subject.user_id,
        now,
      });
      await ctx.users.recordChange({
        org_id,
        actor_user_id: ctx.subject.user_id,
        server_received_at: now,
        payload: UserChangedPayload.parse({ act: "pin_reset", user_id: input.user_id }),
      });
    }),

  /**
   * `14-F14`'s deactivation — *"preserves historical attribution"*, so the person record stays and
   * her name still renders on last month's orders (`11-F20`, `11-F22`, R26).
   *
   * **There is no `activate` twin**, and that is not symmetry missed: R32 makes re-activation a
   * two-step act whose skipped second step must fail legibly, and half of that legibility is the
   * device's unlock flow. `11-F22`'s vocabulary is closed at two, so the status this sends is the
   * only one this procedure can mean.
   */
  deactivate: authorized("user.manage")
    .input(deactivateInput)
    .mutation(async ({ ctx, input }) => {
      const org_id = ctx.subject.org_id;
      const now = ctx.now();
      await ctx.users.setStatus({
        org_id,
        user_id: input.user_id,
        branch_id: input.branch_id,
        status: "inactive",
        actor_user_id: ctx.subject.user_id,
        now,
      });
      await ctx.users.recordChange({
        org_id,
        actor_user_id: ctx.subject.user_id,
        server_received_at: now,
        payload: UserChangedPayload.parse({
          act: "deactivated",
          user_id: input.user_id,
          branch_id: input.branch_id,
        }),
      });
    }),
};
