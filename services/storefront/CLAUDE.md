# @restos/storefront-service

**Owning spec: `specs/06-storefront.md` — read `06-F30`, `06-F31`, `06-F32` before touching
anything here.** Also `01-F62` (the wall), `01-F84` (`order.cancelled`), `28-F4`/`28-F6`
(entitlement), `02-F9` (the till's inbox this feeds).

## What this is, in one paragraph

The hosted storefront's **cloud ORIGIN**: a registered device, one per (org, branch), that appends
`order.created` + `order.line_added` on a customer's behalf and pushes them into the branch
stream. A customer's browser is not a device — no `01-F47` token, no branch clock, no
`actor_user_id` — and `01-F62` requires all three stamped at append **by a device**. So the
service holds the identity.

## ⚠ `01-F62` IS NOT AMENDED, AND THIS IS THE THING THE NEXT READER WILL GET WRONG

This is **not** `05-F29`'s rejected option (b). That option amended `01-F62` so a *cloud user's*
decision had a legal envelope, which dissolves the FR's own discriminant. Here the discriminant
survives untouched — *"org-scoped when its only legitimate emitter is the cloud plane"* — and
`order.created`'s legitimate emitters have always included every till in the country. The event
was branch-scoped before this service and is branch-scoped after it. **What was missing was a
device, not a scope.** `01-F39`'s `storefront_cloud` clause says the same thing from the other end,
and `identity.ts` carries it in code. If you find yourself explaining that "the wall was broken",
re-read `06-F30`.

## The decisive measurement (re-verified 2026-08-24 on `a00ff6b`)

`apps/pos-electron/src/renderer/OrdersSurface.tsx:57` — `isCloudInbox` reads candidates from
`store.openOrders()`, the till's fold of its **branch stream**. So `02-F9`'s shipped inbox
**cannot see** an order living only in a cloud table, and `00 §5.1` says it in the platform's own
words: cloud-originated orders *"queue for the branch and enter the moment connectivity returns"*.
That is why the origin appends to the ledger rather than to a cloud queue.

`origin-seam.test.ts` §E is that claim executed: this origin's real envelopes are ingested into a
**real** `packages/sync-client` device store and the order is asserted to arrive in `openOrders()`
as an unconfirmed `storefront` row — `isCloudInbox`'s exact predicate. Delete §E and this whole
service could be decorative with every other test green (`L8`).

## Mutation matrix — round-3 law, out of tree, control **31/31** green

Mutated **OUT OF THE TREE** (`T8`): the entitlement gate is a security parameter, and an agent
killed between "weaken" and "revert" would strand a default-allow credential with every test
green. The package was copied to a scratchpad with `@restos/*` symlinks repointed at the worktree;
every row restores byte-exactly and is **sha256-verified after** by the driver itself. Each mutant
differs in exactly ONE branch. Every row is the FULL package suite.

| # | mutant (exactly one branch) | killed |
|---|---|---|
| M1 | `06-F31` — the origin claims `branch` basis (`01-F45` precedence defeated) | 1 |
| M2 | `02-F45`/`01-F84` — the origin invents a service user for `actor_user_id` | 1 |
| M3 | **`01-F62` — the origin stamps no `branch_id` (the browser-can-append fantasy)** | **16** |
| M4 | `01-F3` — lamport reserved PER EVENT, so a batch can leave a hole | 3 |
| M5 | `02-F42` — `channel` follows `order_type`, i.e. a caller-chosen price list | 1 |
| M6 | `01-F18`/`01-F53` — the captured price is dropped, so the till must re-resolve | 2 |
| M7 | `01-F17`/`02-F63` — the origin writes a TOTAL (two writers on the money path) | 1 |
| M8 | **⚠ THE SEAM — commandment 4: acknowledge BEFORE the outbox is durable** | **1** |
| M9 | **⚠ THE SEAM — the outbox is never called at all (a decorative subsystem)** | **1** |
| M10 | `28-F4` — an ABSENT entitlement record defaults to ALLOW | 4 |
| M11 | **⚠ `06-F32` (ii) — DECLARED but never CHECKED (the design's own reading)** | **2** |
| M12 | `06-F32` (i) — a procedure declares no capability and boot admits it | 1 |
| M13b | `06-F1` — the input schema stops STRIPPING, so a body `org_id` survives | 1 |
| M13 | `06-F1` — org read from the request body | **0 — INERT, see below** |
| M14 | `T12`/`00 §5.4` — an unconfigured origin DEFAULTS its org instead of refusing | 1 |
| M15 | `06-F30` — the device class is `counter_electron`, not the cloud origin | 2 |
| M16 | **⚠ NEGATIVE CONTROL — behaviour-preserving refactor of `stamp()`** | **0** |

**M16 is what makes every other row mean anything:** a genuine restructuring of the function under
test (two locals lifted out and used) reddens **nothing** and reproduces the control exactly. Without
it the kill counts prove nothing about attribution.

**⚠ M8 SURVIVED ON ITS FIRST RUN, AND THE TEST WAS WRONG RATHER THAN THE MUTANT.** The durability
test recorded a marker at the TOP of a spy `put` and asserted `["put:3", "acked"]` — which measures
when `put` was **called**, not when it **completed**. `void deps.outbox.put(...)` in place of
`await` therefore passed 29/29. Rewritten to hold the outbox open on a deferred promise and assert
`place` is still pending, it kills. **Reading the test could not find this; running the mutant did**
(`L10`). This is the wave's own defect reproduced inside the fix for it, one more time.

**⚠ M13 IS INERT AND THAT IS A MEASUREMENT, NOT AN EXCUSE.** Zod's `z.object` **strips** unknown
keys (verified directly: `z.object` parse of `{order_id, org_id}` yields `['order_id']`;
`z.looseObject` yields both), so `input.org_id` is always `undefined` and the mutant's `??`
fallback always fires — it is behaviour-preserving, i.e. a *second, accidental negative control*.
The protection is therefore **real but incidental**. M13b removes the stripping, which is the
mutant that actually reaches the property, and the test added for it kills. ⚠ **Do not "simplify"
the input schemas to `looseObject`**: the tenant is resolved from the HOST (`06-F1`) and a public
unauthenticated body key that could move it is a cross-tenant write with a form field for a key
(`00 §5.4`).

## What is OWED here, named so it is not discovered in the field

- **The durable outbox.** `outbox.ts` is a PORT and the only implementation is `inMemoryOutbox`,
  which is named test-support and says so. `06-F30`'s Postgres outbox and its **per-(org, branch)
  advisory lock** — the single-writer clause, because two storefront processes sharing one lamport
  counter is `01-F66`'s defect in a data centre — are **not built**. `server.ts`'s dev host prints
  a warning to stderr on every start. ⚠ `seams:check` cannot see this: Rule B asks whether a member
  is *supplied*, never whether the supply is REAL, and a stub is a supply. That is why `outbox` is a
  **required** option rather than an optional one with a default — it moves the failure to compile
  time, the only place a rail can see it.
- **The push client.** Nothing here yet speaks `hello`/`push` to the gateway. The protocol needs no
  new kind (that is `06-F30`'s strongest argument) but the client, the `push_ack` write-checkpoint
  and device registration via `provision-device --class storefront_cloud` are unbuilt.
- **`apps/storefront`** — the Next.js customer surface — is still a two-line stub. Menu, cart,
  checkout, the `06-F17` status page and `06-F25`'s share preview are all unbuilt.
- **`06-F27`'s cap and auto-close, and `06-F18`'s staleness.** Specified as cloud-side computations
  by `06-F31`; not implemented.
- **The merge disposition** for `order.cancelled` (`06-F31`, `26 §7`): a cancelled or auto-closed
  order **still appears in every till's inbox**. Projection-inert is the honest current state, not a
  settled rule, and `origin-seam.test.ts` §E pins it so the day a rule lands the test fails and is
  read rather than the cancel silently starting to work.
- **The inbox cannot order itself** (`06-F31`): `OpenOrderRow` carries no created-at, so
  `06-F27`'s *"drain oldest-first"* and `27-F7` are unsatisfiable until `packages/sync-client` gains
  the field. Shipping this module is what makes that visible.

## Running it

```
RESTOS_ORG_ID=… RESTOS_BRANCH_ID=… RESTOS_DEVICE_ID=… pnpm -C services/storefront start
```

It refuses to boot without all three (`00 §5.4` admits no defaulted org; `T12`'s join key has three
ends and no error message). The boot line names the origin, its class and `06-F31`'s clock ruling.
`__acceptance__/startable.test.ts` spawns the **declared** script so that "this service can be
started" stops being an assumption.
