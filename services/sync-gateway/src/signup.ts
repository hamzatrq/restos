// **`28-F13` — THE SELF-SERVE SIGNUP ACT: ONE ACT, TWO RECORDS, AND IT REFUSES TO INVENT A THIRD.**
//
// `28-F13`: *"The act creates exactly two records: the org (`01-F68`, `display_name` as typed,
// status `active` per `15-F25`) and one user carrying the org-wide assignment `{ role: owner,
// branch_id: null }`"*, and *"The two records are one act. If the owner cannot be created the org
// must not stand … Atomicity is enforced at the writer, not by a foreign key — `01-F68` forbids one,
// permanently."* Founder rulings **R17** (self-serve onboarding for 5–10 pooled pilots) and **R40**
// (*"a restaurant signs itself up and reaches an org … with nobody touching a terminal"*, which
// *"retires `create-org.ts` as the onboarding path (it survives as an operator tool)"*).
//
// (The `seams:check` marker token is deliberately not spelled out anywhere in this file. A marker in
// a FILE HEADER covers every export in the module — `create-org.ts`, `create-owner.ts`,
// `migrate.ts`, `registry.ts`, `provision-device.ts` and `revoke-device.ts` each carry this warning
// and an agent reproduced the mistake anyway after reading one of them.)
//
// **THIS MODULE DECIDES NOTHING ABOUT AN ORG OR AN OWNER. IT ORDERS TWO EXISTING WRITERS AND WRAPS
// THEM IN ONE TRANSACTION.** `28-F13`'s last clause is the reason: *"The self-serve act is a THIRD
// writer of these same two records beside `15-F27`'s declared steps and `15-F1`'s console; two
// writers of one fact disagreeing silently is this corpus's most-repeated defect."* So `createOrg`
// and `createOwner` are called — the same functions `pnpm -C services/sync-gateway create-org` and
// `create-owner` call, not copies of them — and every refusal, every default and every field they
// decide is inherited rather than restated. `03-F40`'s two sensor bit layouts is this corpus's own
// record of what a second interpretation costs.
//
// What that inheritance buys, named so a later edit cannot quietly drop it: `15-F25`'s `active` on
// provisioning and the refusal of a `--status` argument; `01-F68`'s minted, never-reused `org_id`;
// `11-F20`'s required minimum WHOLE including `01-F61`'s `grid_ordinal` at 0; `01-F26`'s org-wide
// `{ role: owner, branch_id: null }` with `11-F22`'s participation STATED rather than defaulted;
// `15-F26`'s first-owner rule (`orgHasOwner`, so a self-onboarded org cannot later acquire a second
// "first" owner from the staffed command); `15-F27`'s *a password is never an input* and the minted
// 192-bit secret hashed with `01-F26`'s single hashing story at `01-F61`'s cost floor.
//
// **IT EMITS NO EVENT** (`28-F14`): *"At the instant the org is created the signer-up is not yet a
// user of any org — the user record is an OUTPUT of the act, not an input — so
// `OrgEvent.actor_user_id` could only be `null`, permanently, in an append-only store (`01-F1`)."*
// `15-F27` refused exactly that for the shell commands and `create-org.ts`/`tenancy.ts` carry the
// reasoning verbatim. It is also unbuildable rather than merely unwanted: `28-F14` measures that
// `config.changed` has **no payload schema in `packages/domain`**, so under `01-F4` the emit throws.
//
// **IT CREATES NO BRANCH AND REGISTERS NO DEVICE, AND BOTH ARE REFUSALS RATHER THAN OMISSIONS.**
// `28-F13`: `01-F69` needs a `display_name`, a `type` and a `class` — *"three facts a signup form
// has not asked for. Minting a 'Main Branch' is precisely the guess that `01-F65` and `01-F67`
// refuse elsewhere"* — so the first branch is `14-F26`'s wizard. And `01-F25`'s back-office pairing
// code is one clause with no format, TTL, rate limit or claim protocol anywhere in the corpus
// (`plans/saas-pivot/plan-of-record.md` A3 lists specifying it as OWED to doc 01), so a device
// admitted here would be an admission credential minted by a form. `28-F13`: *"THE PATH TERMINATES
// AT THE ORG AND ITS OWNER."*
//
// ⚠ **WHAT THIS ACT DOES NOT REACH, and it is R40's own list rather than this module's opinion.**
// R40 names four destinations — org, branch, owner login, device pairing code — and the corpus
// specifies one of them and blocks the other three (`28-F13`'s two ⚠ clauses, `28 §9.6`, `28 §9.21`,
// `28 §9.26`). Nothing here is a public surface: this route is reachable only by a holder of the
// service credential, so **the act is self-serve and its DOOR is not**. `28-F15` forbids a public
// signup surface without a named admission control; `plans/saas-pivot/plan-of-record.md` **R46**
// picks the KIND (a vendor invite code) and no FR yet specifies one, which is what that FR requires
// before the surface exists. `services/api/src/__acceptance__/signup-admission.test.ts` is the
// tripwire that keeps the tenant plane's one public door at `auth.login` until it does.
//
// ⚠ **THE INITIAL SECRET IS `15-F27`'s, NOT R47's, AND THE DIFFERENCE IS STATED RATHER THAN
// SMOOTHED OVER.** `plans/saas-pivot/plan-of-record.md` R47 rules that the owner *sets her own
// password on a single-use token* and *"retires `create-owner.ts`'s print-to-stdout as the delivery
// mechanism"*. That token needs a redemption surface, and `28 §9.21` records that `15-F26`'s
// single-use expiring set-credential link **has none anywhere in this product**; its TTL, its format
// and its single-use protocol are specified nowhere, and the surface that would redeem it is public
// by construction (its caller has no account yet), which is the door `28-F15` holds shut. So what
// ships here is `15-F27`'s minted initial PASSWORD — *strictly smaller* than R47 and *strictly
// larger* than nothing — and R47's token is additive on a surface that does not exist yet. It is
// stated because a residual recorded only in a plan is one the next session re-derives.

import { createOrg } from "./create-org.js";
import { createOwner } from "./create-owner.js";
import type { GatewayDb } from "./gateway.js";
import { emailIsTaken } from "./tenancy.js";

/**
 * `28-F13`: *"The form collects exactly what those two records require and nothing more: the org's
 * `display_name`, the owner's `display_name`, the owner's email. **No branch, no tier, no plan, no
 * channel**"* — and no `org_id`, which `28 §7` lists among the things that are *"deliberately not
 * configurable, ever"* (`28-F5` (b)).
 *
 * The closed set is enforced at the wire by `strictObject` (`publish-http.ts`), so a field this
 * shape does not declare is refused **by name** rather than ignored. `create-owner.ts` records why
 * that direction matters: *"An ignored `--password` is the worst outcome available here: the
 * operator believes they set one, the command prints a different one."*
 */
export type SignupRequest = {
  readonly org_display_name: string;
  readonly owner_display_name: string;
  readonly owner_email: string;
};

export type SignupOutcome = {
  readonly org_id: string;
  readonly user_id: string;
  /**
   * The plaintext, returned so exactly one caller emits it and nothing logs it — `create-owner.ts`'s
   * discipline, one plane out. `15-F27`: the step *"mints the initial secret itself, stores only an
   * Argon2id hash at `01-F61`'s cost floor … and emits the secret once"*.
   */
  readonly initial_secret: string;
};

/**
 * Create an org and its first owner as one act.
 *
 * **ATOMICITY IS THE TRANSACTION, AND `28-F13` PUTS IT AT THE WRITER BY NAME** — *"If the owner
 * cannot be created the org must not stand … Atomicity is enforced at the writer, not by a foreign
 * key — `01-F68` forbids one, permanently."* There is no other mechanism available: the schema
 * carries no referential constraint in either direction (`0010`/`0011`), so an org whose owner
 * failed would simply stand, unadministrable, with `15-F26`'s *"no org exists that nobody can
 * administer"* broken and the `org_id` permanently spent (`01-F68` never reuses one).
 *
 * **THE EMAIL CHECK RUNS BEFORE THE MINT, AND IT IS THE ORDERING RATHER THAN THE ENFORCEMENT.**
 * `28-F13`: *"The email uniqueness check runs BEFORE the `org_id` is minted. Email is unique
 * case-folded and **globally** … minting first would abandon an `org_id` permanently and manufacture
 * one of `28-F15`'s permanent junk orgs on a keystroke a stranger cannot be blamed for."* The read
 * below is that ordering. It is **not** what makes the rule hold, and reading it as such is the
 * TOCTOU race `tenancy.ts` refuses by name (*"A check that DECIDED admission by reading first would
 * be a TOCTOU race between two operators"*): the enforcement is `users_email_lower_uq`, reached
 * through `createOwner`'s own conflict path, which stays live for the two-signups-at-once case this
 * read cannot see. Both refuse without naming the tenant they collided with — `01-F71`, and see the
 * disclosure note below.
 *
 * It also stops a foreseeable collision paying for an Argon2id hash at `01-F61`'s deliberately
 * expensive cost floor: `28-F13` calls a collision *"foreseeable and ordinary"*, and `createOwner`
 * mints and hashes the secret **before** the insert that would discover it.
 *
 * **NO REFUSAL HERE NAMES THE TENANT IT COLLIDED WITH** (`01-F71`, `28-N3`). `create-org` answers a
 * colliding `--org` with *"already exists and is called <stored name>"* — correct for an operator
 * holding the DSN and a cross-tenant oracle the moment the same sentence is served to a stranger —
 * and that path is unreachable from here precisely because the caller cannot state an `org_id`.
 * `createOwner`'s email refusal already names no org, which is the sentence this one is modelled on.
 */
export const signUp = async (
  db: GatewayDb,
  args: SignupRequest,
  now: number,
): Promise<SignupOutcome> => {
  if (await emailIsTaken(db, args.owner_email)) {
    // `RangeError` is this service's caller-mistake class (`publish-http.ts`'s `refusalStatus`, and
    // `revoke-device.ts`'s NOT-REGISTERED throw for the same reason): a taken email is a fact about
    // the request, not a fault on this gateway, and a 500 would send the caller looking for an
    // outage. The sentence names the address the caller already typed and nothing else — echoing it
    // discloses nothing they did not know, while an org name, an org id or an owner's name would be
    // the cross-tenant oracle `01-F71` forbids.
    throw new RangeError(
      `${args.owner_email} is already a login on this host — nothing was written, and no org was ` +
        "created (28-F13: the email check runs BEFORE the org_id is minted, because 01-F68 never " +
        "reuses one). Emails are unique case-folded across ALL orgs, because the login lookup " +
        "takes an email and nothing else — the org comes FROM the user record (01-F71 b).",
    );
  }

  return db.transaction(async (tx: GatewayDb) => {
    // `--org` is deliberately not forwarded: `28-F5` (b) and `28 §7` forbid a tenant-supplied org
    // identifier on any request, so the id is minted here and `createOrg`'s already-exists branch —
    // the one that would report another tenant's stored name — is unreachable from this surface.
    const { org } = await createOrg(tx, { org: undefined, name: args.org_display_name }, now);
    const owner = await createOwner(
      tx,
      { org: org.org_id, email: args.owner_email, name: args.owner_display_name },
      now,
    );
    return { org_id: org.org_id, user_id: owner.user_id, initial_secret: owner.initial_password };
  });
};
