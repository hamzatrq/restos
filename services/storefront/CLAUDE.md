# @restos/storefront-service

**Owning spec: `specs/06-storefront.md` — read `06-F30`..`06-F35` before touching anything here.**
Also `01-F62` (the wall), `01-F84` (`order.cancelled`), `28-F4`/`28-F6`
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

## ⚠ THE ADVERSARIAL REVIEW (2026-08-24) — three DO-NOT-SHIP defects, and what closed them

The first landing of this module was reviewed in a separate context and returned **DO NOT SHIP**.
All three defects were reproduced here before they were fixed, and every one of them was **green
in this package's own suite**, which is the fact worth carrying forward: 31 of 31 passing, `verify`
exit 0, `seams:check` clean, with a customer setting the price.

**D1 — A CUSTOMER SET THE PRICE (`06-F33`, now the FR).** `router.ts` declared `unit_price_paisa`
as a field of the public, unauthenticated request body and `origin.ts` wrote it into
`order.line_added` verbatim; **nothing in this service read a catalog at all.** Reproduced into a
real `packages/sync-client` store:

```
router input schema ACCEPTS: {"order_id":"attack-1","lines":[{"item_id":"item-burger","qty":1,"unit_price_paisa":1}]}
and zero too:               {"order_id":"attack-0","lines":[{... "unit_price_paisa":0}]}
TILL INBOX lines: {"l1":{"item_id":"item-burger","qty":1,"states":["placed"],"unit_price_paisa":1}}
```

A Rs 450 burger in a cashier's `02-F9` inbox at **1 paisa**, where her only action is Accept and
`01-F1` makes it permanent. **The suite blessed it** — `origin-seam.test.ts` §D was titled *"the
price shown is the price written, verbatim"* and asserted the defect as a feature, and the
builder's own M6 mutated the wrong direction (it proved the service does not DISCARD the client's
number, which is what makes D1 worse). Closed by resolving the price from the published catalog at
`(this branch, storefront)` — `catalog.ts`, the same read `addLine` does on a till — and by
**deleting the field from the wire type**, not validating it: `06-F33`'s *unrepresentable, not
validated*.

**D2 — THE SERVICE HAD NO ROUTE.** `server.ts` registered exactly one route, `GET /health`, and
passed `storefrontRouter` to the boot assertion and to nothing else. Measured against the running
dev host: `POST /trpc/placeOrder → 404`, `/api/trpc/placeOrder → 404`, `/placeOrder → 404`,
`/trpc → 404`. The whole spine executed only under vitest — `L8`'s sixteenth instance, with
`seams:check` clean by construction (every export is imported; the chain just terminates). Closed
by mounting the router over Fastify with a `createContext`, and asserted by `server-seam.test.ts`,
which drives **real HTTP** rather than calling the caller.

**D3 — THE GATE AND THE LEDGER DISAGREED ABOUT THE TENANT (`06-F34`).** `place(org_id, …)` used
`org_id` for entitlement only; the envelope took `deps.identity.org_id`, and nothing compared them
— `createStorefrontOrigin` did not even expose its identity. Reproduced:

```
XTENANT place() returned: xtenant
XTENANT events landed in org: [ 'org-A-victim' ]      // entitlement PASSED against 'org-B-attacker'
```

Closed twice over, deliberately: (a) the request's tenant is resolved from the `Host` and can only
ever be this origin's org — anything else is a neutral 404 (`06-F1`); (b) `place`/`cancel` refuse a
mismatch by name (`CrossTenantError`) before anything is appended, which is what holds the day a
second entry point lands.

**F1/F2 — two seams that reddened NOTHING.** `outbox: inMemoryOutbox()` inside
`createStorefrontServer` (a real deployment's durable outbox silently discarded) and deleting
`assertEveryProcedureDeclaresEntitlement(storefrontRouter)` from boot each passed **31/31,
REAL_EXIT=0**. Both are now killed rows (M9, M11). The boot-gate assertion needed a module mock to
swap ONLY the router — `boot-gate-seam.test.ts`, in its own file because `vi.mock` is module-wide.

**F3 — `28-F3`'s corollary was unrepresentable.** `EntitlementSource` returned `Record | null`:
two states, so *"could not be read"* and *"not entitled"* were one value. Now three
(`EntitlementLookup`), with `EntitlementUnreadableError` distinct from `NotEntitledError`
(`28-F8`, `28 §4` flow item 5). The comment arguing `28-F3` *"reads like a licence to
default-allow"* is corrected in place: the FR's third bullet already decides the flag half.

**F4 — `28-F5` (a) breached in shipping code.** `devEntitlement` decided a tenant's entitlement by
comparing to `process.env.RESTOS_ORG_ID`, on a path `pnpm start` runs. The env read is gone. ⚠
**Narrowed rather than closed, and the residual is named**: `28-F6`'s record has **no writer
anywhere** (`28-F4` measures it) and where it durably lives is undecided (`28 §9.4`), so a real
resolver cannot be built here without inventing that shape (commandment 2). What ships is a
**development** source derived from this deployment's own origin identity, named as such in code,
named in the stderr warning (which previously named the outbox and the lamport counter and not
this), and named below as owed.

**F5 — the inbox this module fills has one exit.** Recorded below; `apps/pos-electron`'s
`OrdersSurface.tsx` claimed the Reject control was blocked by a missing payload schema, which
stopped being true in August 2026. Its comment is corrected (comment only) to name the real
blocker: the merge disposition, `26 §7`-pinned.

## Mutation matrix — round-3 law, out of tree (`T8`), control **59/59** green

Same harness as the first landing: the package copied to a scratchpad with `@restos/*` resolving
back into the worktree, every row restoring the whole `src` tree byte-exactly with a **sha256 of
the tree** verified after each row (the driver asserts it, and printed `all rows restored; tree
sha256 matches pristine`). Each row is the FULL package suite; `REAL_EXIT` is the runner's own.

| # | mutant (one branch) | killed |
|---|---|---|
| M1 | **D1 RESTORED — the price is a request field again AND the origin writes it** | **6** |
| M2 | the ORIGIN prefers a caller's price, schema unchanged | **1** ⚠ see below |
| M3 | the SCHEMA accepts a price again (origin still resolves) | 3 |
| M4 | `01-F60` fallback — a missing cell becomes `0` instead of a refusal | 2 |
| M5 | `01-F60` key — the CHANNEL predicate is dropped (a counter price sells online) | 1 |
| M6 | `01-F60` key — the BRANCH predicate is dropped (another branch's price sells here) | 1 |
| M7 | `01-F55` — a tombstoned item becomes sellable | 1 |
| M8 | **D2 RESTORED — the tRPC mount is deleted** | 3 |
| M9 | **⚠ SEAM — the server discards the outbox it was handed** (was **0** before this round) | 3 |
| M10 | **⚠ SEAM — the server discards the catalog it was handed** | 1 |
| M11 | **⚠ SEAM — the boot gate's CALL SITE is deleted** (was **0** before this round) | 1 |
| M12 | **D3 RESTORED — the cross-tenant check is removed** | 3 |
| M13 | `06-F1` — the host is ignored; every `Host` resolves to this org | 2 |
| M14 | `06-F1` — the host comparison becomes a SUFFIX match | 1 |
| M15 | `28-F3` — UNREADABLE collapses into `not_entitled` | 2 |
| M16 | `28-F4` — an ABSENT record defaults to ALLOW | 4 |
| M17 | commandment 4 — acknowledge BEFORE the outbox write completes | 1 |
| M18 | **⚠ NEGATIVE CONTROL — behaviour-preserving refactor of `orgForHost` + `admit`** | **0** |

**M18 is what makes the rest attributable**: a genuine restructuring of both functions under test
(a hand-rolled port strip, a `switch` in place of two `if`s) reddens nothing and reproduces the
control exactly at 59/59.

**⚠ M2 SURVIVED ITS FIRST RUN AT 59/59, AND THE TEST WAS MISSING RATHER THAN THE MUTANT WRONG.**
With the schema still stripping unknown keys, an origin that prefers `line.unit_price_paisa` never
sees one — so the mutant was *behaviour-preserving given the schema*, i.e. a second accidental
negative control, and the protection was **real but incidental**. This module recorded the same
shape once before (the builder's M13, on the org key). `price-authority.test.ts` §A now hands the
origin a line with a price cast **past** the type, which kills it. The lesson is the standing one:
an incidental protection is one refactor from being gone, and only a mutant tells you it is
incidental.

## ⚠ THE RE-REVIEW (2026-08-24) — the same defect class, one field over

The fix commit above was re-reviewed in a fresh context. All eight prior findings re-ran clean; the
verdict was still **DO NOT SHIP**, for a defect the price work had walked straight past.

**N1 — `order_id` WAS AN UNAUTHENTICATED CALLER-CHOSEN KEY (`06-F35`, now the FR).** `06-F33` made
*naming a price* unrepresentable and left *naming an order* free text. This origin holds no state
and reads none, so it emitted `order.created` + a line per request for whatever id the body named.
Reproduced over real HTTP into a real `packages/sync-client` fold:

```
place web-1 (1 × item-burger)                       -> 200
cashier accepts   (order.confirmed)
BEFORE  confirmed_at=1755000050000  lines={l1: qty 1 @ 45000}          kitchen lines_total=1
POST /trpc/placeOrder {"order_id":"web-1","lines":[{"line_id":"stranger",…,"qty":20}]}  -> 200
AFTER   lines={l1: qty 1 @ 45000, stranger: qty 20 @ 45000}  exceptions=[]  lines_total=2
```

**Rs 9,000 onto a stranger's CONFIRMED bill, no anomaly, the kitchen told to cook it, permanent
under `01-F1`** — and `06-N4` names *"id guessing"* as a probe that must return nothing. Closed the
way D1 was closed: the field is **deleted from the wire type**, the origin mints the id from the
same source it mints envelope ids from, and the response returns it. Same probe after the fix, with
the stranger handed the *real* id (which she could not have known):

```
place  -> 200 {"order_id":"0ba034a2-2ac8-4daa-96a1-95e045fd9ac0"}   (cashier accepts)
stranger names that exact id, 20 × burger -> 200 {"order_id":"f10ff117-…"}   ← her OWN order
AFTER   lines={l1: qty 1 @ 45000}   lines_total=1                            ← the bill is untouched
```

⚠ **What that does NOT close is `cancelOrder`, and `06-F35` (c) DECIDES that rather than leaving it
silent.** `06-F19` allows a cancel *"any time before `order.confirmed`"* and this origin can check
neither half — no branch slice (`06-F30`) means it cannot see the confirmation, no customer session
(`06-F12`) means it cannot see ownership. The mint kills the enumeration attack; a holder of an id
can still cancel late, and junk cancels for never-issued ids still land (inert — `26 §3`'s sidecar
keys on the payload's order id). `order-identity.test.ts` §B **pins the hole**, so the day
`06-F12`'s session or `§5`'s status read model lands, a test fails and is read.

**N2 — THE ONLY SHIPPING HOST COULD HAND A STUB CATALOG AND THE SUITE STAYED GREEN.** Replacing
`createGatewayCatalog(link, identity)` in `server.ts`'s `pnpm start` block with a stub pricing
everything at 1 paisa: **59 passed (59), REAL_EXIT=0** — while the comment three lines up asserted
*"the catalog is NOT stubbed"*. That is `L11` in the file that had just fixed `L11` for the outbox,
and it is F1 one layer out: `startable.test.ts` booted the declared script and read only `/health`,
so nothing ever placed an order **through the spawned process**. Closed by doing exactly that: a
fake gateway serving one priced entry, an order posted through the booted host, and two assertions
— the gateway was **asked** (this org, the service credential, `28-F5` (b′)) and an item the
artifact does not price is **refused**. A stub answers without asking and prices everything.

**N5 — a citation pointed at the wrong section.** `router.ts` said *"`entitlement-gate.test.ts` §D
pins both halves"* of the price strip; §D is three `CrossTenantError` tests with no price assertion
in it. Both protections were real — `price-authority.test.ts` §A owns both halves and
`entitlement-gate.test.ts` §C owns the strip for `org_id` — so this was a misdirected pointer, which
is how a live assertion gets written twice or not at all. Corrected in place.

### Re-review mutation matrix — out of tree (`T8`), control **67/67** green, `REAL_EXIT` in the log

| # | mutant (one branch) | killed |
|---|---|---|
| R1 | **N1 restored in full** — the schema takes `order_id` again and the origin writes it | 29 † |
| R1b | **N1 restored, fixtures intact** — schema `order_id?` + origin `input.order_id ?? newId()` | **4** |
| R2 | the ORIGIN prefers an `order_id` smuggled PAST the schema (the price suite's survivor shape) | **1** |
| R3 | the mint REPEATS — one key per origin, so two carts join one order | 4 |
| R4 | the ACKNOWLEDGED id is not the WRITTEN id (a status page pointing at nothing) | 8 |
| R5 | the key is DERIVED from the cart (`line_id`s joined) rather than minted | 4 |
| R6 | **⚠ SEAM (inert supply) — the shipping host hands a 1-paisa STUB catalog** (was **0**) | **1** |
| R7 | **⚠ SEAM (deleted call site) — the `catalog` argument is removed** | compile ‡ |
| R8 | the residual PIN's tripwire — cancel starts refusing ids it did not mint | 2 |
| NC1 | **⚠ NEGATIVE CONTROL — behaviour-preserving refactor of the mint + emit block** | **0** |
| NC2 | **⚠ NEGATIVE CONTROL — the dev-host lamport pinned to `0`, same block as R6** | **0** |

† R1's count is inflated and is reported as such: restoring the field also breaks every fixture that
no longer sends one, so it is not attribution. **R1b is the honest row** — it keeps the old
behaviour for a cart with no key and reddens only the four assertions aimed at this property,
including the end-to-end reproduction. ‡ R7 does not run: `ServerOptions.catalog` is required, so
`tsc` refuses it (`TS2741`). The dangerous form of a seam mutant is not the deleted argument, it is
the **inert supply** — R6 — which is what stayed green for a whole review cycle.

**NC2 is the row that makes R6 attributable**: the reviewer's own control on the *same* dev-host
block still passes 67/67, so R6's kill is the catalog line and not the fact that the block was
edited at all. **R8 is what makes the residual pin non-vacuous** — a pin that stays green when the
behaviour it pins changes is a comment with a test's name on it.

## What is OWED here, named so it is not discovered in the field

- **The durable outbox.** `outbox.ts` is a PORT and the only implementation is `inMemoryOutbox`,
  named test-support. `06-F30`'s Postgres outbox and its **per-(org, branch) advisory lock** — the
  single-writer clause, because two storefront processes sharing one lamport counter is `01-F66`'s
  defect in a data centre — are **not built**. ⚠ `seams:check` cannot see this: Rule B asks whether
  a member is *supplied*, never whether the supply is REAL. That is why `outbox` (and now `catalog`)
  is a **required** option, and why `server-seam.test.ts` asserts the events land in the outbox the
  server was HANDED — a required option proves a value was passed, never that it was used (M9).
- **The entitlement source.** `28-F6`'s record has no writer anywhere in this corpus and no decided
  home (`28 §9.4`), so the dev host ships a **development** source and a real deployment must pass
  its own. This is the one place where a stub still reaches a shipping start path, it is named on
  stderr at every boot, and it is the first thing to replace when doc 15 or doc 28 lands a writer.
- **The push client.** Nothing here yet speaks `hello`/`push` to the gateway. The protocol needs no
  new kind (that is `06-F30`'s strongest argument) but the client, the `push_ack` write-checkpoint
  and device registration via `provision-device --class storefront_cloud` are unbuilt. **So the
  outbox fills and nothing drains it** — an order placed today reaches no till until this lands.
- **`apps/storefront`** — the Next.js customer surface — is still a two-line stub, and **three**
  things travel with it: `06-F5`'s cart invalidation (which is what closes `06-F33`'s stated
  residual — the price is resolved at APPEND and `06-F6` says add-to-cart); **`06-F35` (c)'s cancel
  ownership**, which needs `06-F12`'s signed session for *whose order is this* and `§5`'s
  order-status read model for *has the branch confirmed it* (both are that surface's, neither is
  invented here, and `order-identity.test.ts` §B fails the day either lands); and the **refusal →
  HTTP status mapping**. Today `UnpricedItemsError`, `NotEntitledError`, `EntitlementUnreadableError` and
  `CrossTenantError` all reach a caller as a tRPC `INTERNAL_SERVER_ERROR`; only `06-F1`'s 404 is
  specified, and inventing codes for the rest ahead of the surface that renders them would be
  inventing policy.
- **`06-F10`'s `source` attribution** (`direct | qr | instagram | whatsapp`) is required by the FR
  on every order and is **not implemented** — it was absent from this list at the first landing too.
  `order.created`'s payload is a `looseObject`, so it is legal to add, but which fields an order
  carries is a doc-01/doc-02 act rather than a quiet addition.
- **`06-F27`'s cap and auto-close, and `06-F18`'s staleness.** Specified as cloud-side computations
  by `06-F31`; not implemented.
- **THE INBOX HAS EXACTLY ONE EXIT, AND THIS MODULE IS WHAT FILLS IT.** Three facts compose into
  one operational consequence that neither the builder nor the fold's own comment states together:
  `order.cancelled` is **projection-inert** in `packages/sync-client`'s merge fold, `order.rejected`
  has **no production emitter anywhere** (re-measured 2026-08-24: `grep -a '"order.rejected"'` over
  `apps/` + `services/` + `packages/` minus registry, fold and tests → **zero**), and `OpenOrderRow`
  carries **no created-at**, so the list cannot even sort. A customer's cancel does not clear her
  row, `06-F27`'s auto-close does not clear it, there is no Reject control, and `06-F27`'s *"drain
  oldest-first"* and `27-F7` are unsatisfiable. The merge disposition is `26 §7` oracle-pinned;
  `origin-seam.test.ts` §E pins the current honest behaviour so the day a rule lands the test fails
  and is READ rather than the cancel silently starting to work.
- **`01-F39`'s *"holds no branch slice"* clause is enforced by nothing** — `sliceFilter` in
  `services/sync-gateway` is the identity function. Inherited, but newly material: this is the first
  device class in that vocabulary belonging to a public internet-facing service, which would
  otherwise receive a full branch mirror.

## Running it

```
RESTOS_ORG_ID=…  RESTOS_BRANCH_ID=…  RESTOS_DEVICE_ID=…  RESTOS_STOREFRONT_HOST=shop.example.pk \
RESTOS_GATEWAY_URL=http://127.0.0.1:8080  RESTOS_GATEWAY_TOKEN=…  pnpm -C services/storefront start
```

It refuses to boot without **all four** identity values (`00 §5.4` admits no defaulted org; `T12`'s
join key has three ends and no error message, and `06-F34` (a) added the fourth: an origin with no
public host cannot refuse a request naming another one). It also refuses without a gateway link,
because that is where prices come from and `01-F60` admits no fallback — `01-F65`'s posture, one
service over. The boot line names the origin, its class, `06-F31`'s clock ruling **and the host it
serves**. `__acceptance__/startable.test.ts` spawns the **declared** script for all three refusals,
for the happy path, and — since the re-review — for one whole order placed **through the spawned
process** against a fake gateway, which is the only thing that can tell a real price authority from
a stub (N2).

The ordering surface is `POST /trpc/placeOrder` and `POST /trpc/cancelOrder`, and the `Host` header
decides the tenant — a request that does not name `RESTOS_STOREFRONT_HOST` gets a neutral 404.
Verified by hand against the running dev host (2026-08-24), with a fake gateway serving one priced
item and a body that tried to set the price to 1 paisa:

```
BOOT: storefront: origin org-karachi/branch-clifton as device-sf (class storefront_cloud,
      06-F31 clock permanently branch_provisional) serving https://burger-house.restos.pk/trpc on :7392
POST /trpc/placeOrder  Host: burger-house.restos.pk  →  {"result":{"data":{"order_id":"<minted>"}}}
POST /trpc/placeOrder  Host: someone-else.pk         →  404
POST /trpc/placeOrder  item with no cell             →  06-F33/01-F60: no storefront price for item-ghost …
```
