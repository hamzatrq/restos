# @restos/manager

**Owning spec: `specs/05-manager-console.md` — read it before modifying anything here (AGENTS.md routing). Read `05-F28` FIRST; it decides what this package can be.**

- Manager's own phone. Full branch slice, never hub-eligible.
- This package is still a scaffold stub. **It is not stubbed for lack of effort** — see below.

## ⚠ THE CORE SLICE IS BLOCKED ON A PLATFORM QUESTION, NOT ON WORK (`05-F28`, August 2026)

A session sent to build "the Wave-1 core slice" here will reach for a responsive web console on
the cloud plane — `18 §6` lists **"manager-remote"** under the cloud plane, `apps/backoffice` is a
working Next.js + tRPC template two directories away, and `services/api` already boot-enforces
commandment 8 (`assertEveryProcedureIsGated`). **That surface cannot deliver `05-F6`, and the
reason is a kernel law rather than a missing endpoint.**

`01-F62` requires `branch_id`, `branch_created_at` and `time_basis` on every branch-scoped
envelope, *"stamped at append by an originating **device**"*, and fixes the org-scoped set at five
types. **Every event this module owns is branch-scoped** — `approval.granted / denied`,
`channel.*`, `day.*`, `cash.deposit_recorded`, `availability.changed`, and `audit.*` for `05-F2`'s
acknowledgment. `01-F62` names `audit.*` as its own worked example of a type that stays
branch-scoped *because the emitter is a device*. `services/sync-gateway`'s `appendOrgEvent` refuses
all of them at the writer, and the cloud's branch-event table is written only by the merge gateway
from a device `push`. So a browser has **no sanctioned way to record a manager's decision.**

**Do not build the read-only web console as this module's core.** It is buildable in a day and it
would be AGENTS.md's recurring defect shipped on purpose: a correct subsystem whose only write is
impossible. `05-F28` names the three candidate resolutions (RN device app · a `01-F62` amendment ·
the console decides and the POS records) and says the choice is a founder call.

## What HAS landed, and what is still missing upstream of any resolution

- **`05-F7`'s three payload schemas exist now** (`packages/domain/src/registry.ts`,
  `__acceptance__/approval-schemas.test.ts`). Before August 2026 `01 §4` listed
  `approval.requested / granted / denied` and `packages/domain` carried no schema, so `01-F4` made
  every emit an `UnknownEventTypeError` — the remote path was **unbuildable**, not merely unbuilt.
- **`approval.granted` carries two separately-required identities** (`approver_user_id` **and**
  `requester_user_id`) so `02-F41`'s property survives a remote implementation. Locally that
  property is held by a *mechanism* — `apps/pos-electron` builds a SECOND `createPinSession`
  because `unlock()` MOVES the session — and a remote grant crosses a plane where there is no
  session to move, so the schema is the only thing holding it. `02-F38`'s equal-identity refusal is
  deliberately **not** duplicated into the schema; it is `can()`'s, and the oracle's §B control
  says so out loud so nobody "fixes" it into two readings of one rule.
- **Nothing emits `approval.requested`.** `apps/pos-electron` resolves an `02-F20` escalation
  entirely in-process and never announces it, so the queue this module renders has **no producer**
  under any of the three resolutions. That is the first thing to build whichever way the ruling
  goes.
- **The four escalatable WRITES still have no payload schema** — `void.recorded`, `comp.recorded`,
  `discount.recorded`, `order.line_price_overridden` — so `05-F19`'s paid-out is the only act an
  approval can currently complete. `approval-schemas.test.ts` §D is a tripwire that fails when they
  land, so whoever lands them is told at that moment that doc 05's path is newly completable.

## What was measured and is NOT a blocker

- `approval.grant` is **already** in `PERMISSION_ACTIONS` (`branch_manager`/`owner` allow), and
  `can()` already refuses a self-approval by comparing `scope.requested_by_user_id` against the
  subject (`02-F38`). Commandment 8 needs no new action for the approval half.
- Branch events **do** reach the cloud: `packages/sync-client`'s `cloud-session.ts` drains the
  outbox as `push` and `services/sync-gateway`'s `gateway.ts` ingests it, so `kot.print_failed`
  from a till is in cloud Postgres today. What is missing for `05-F1`/`05-F3` is only a
  `/internal` **read** route — a small, unblocked piece of work, and `01-F7` ("the cloud maintains
  per-module read models") is the FR that sanctions it.
- `packages/ui` is consumed by `apps/backoffice` as **tokens only**, never components. If a surface
  is built here, that is the established web precedent, not the counter's closed vocabulary.

## The portrait problem, recorded so it is not rediscovered

There is **no portrait layout anywhere in this product**. `packages/ui`'s `surfaceModeFor` resolves
`27 §1a`'s 6.5″ phone (69 × 150 mm) to `compact`, and `compact` is the *counter's* small-glass
arrangement — its tab rail turns **vertical**, which does not fit 69 mm of width.
`apps/pos-electron`'s layout gate says the same from the other side: `phone-6.5` "is deliberately
absent and must stay absent until a portrait layout exists … it fails two COMPOSITION checks, and
those bind regardless of `ships`." Whoever builds this module builds the first genuinely portrait
surface, and `27-F11b` ("the phone is where ~6 per page actually applies", ~12 comfortable tiles)
is the sizing input.
