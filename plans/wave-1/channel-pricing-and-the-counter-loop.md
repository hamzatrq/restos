# Channel pricing and the counter loop — plan

**Planning artefact, July 2026.** Owning specs: `specs/01-kernel-sync.md` (`01-F18`, `01-F21`,
`01-F52`..`01-F56`, `01-F17`), `specs/02-pos-app.md` (`02-F1`..`02-F3`), `specs/14-backoffice.md`
(`14-F5`, `14-F6`). Also binding: `00 §6` (money contract), `00 §7` (config layers),
`27-F4` (positional memory), `24 §3b` (craft rules).

**Status: APPROVED July 2026.** All four founder rulings are recorded: §2 (per-channel pricing
and the prefilled editor), §7 (**branch pricing is real** — the price is keyed by
`(branch, channel)`), §3.7 (an order's type is chosen before the grid unlocks), and the process
ruling that **acceptance tests for T-2 and T-3 are authored in a separate session**.

`domain`, `sync-client` and `sync-protocol` are all protected paths (`20 §4.4`), so the `24 §3`
step-2 split binds: **acceptance tests for T-2, T-3 and T-4 must be authored by a different
session than the implementer.**

---

## 1. Where we actually are

`338b82f` gave the counter a `TenderPanel`: it can settle an order. It cannot *create* one.

`apps/pos-electron/src/renderer/Counter.tsx:113` reads `onSelect={() => {}}`. That no-op has been
noted twice — the round-2 findings called the core POS loop *"latent only because `onSelect` is
still a no-op"* — and both times it was read as unbuilt UI. **It is not unbuilt UI. It is
unbuildable UI**, and this plan exists because working out why took longer than writing the
handler would have.

`order.line_added` requires `unit_price_paisa` (`registry.ts:47`, integer, non-negative). Trace
the price back through every layer that could supply it:

| Layer | File | Fields carried |
|---|---|---|
| Gateway store | `services/sync-gateway/src/schema.ts:176` | `name`, `kitchen_name`, `parent_id`, `sort`, `deleted` |
| Wire | `packages/sync-protocol/src/messages.ts:31` | the same five |
| Device catalog | `packages/sync-client/src/catalog.ts:24` | the same five |
| IPC seam | `apps/pos-electron/src/shared/ipc.ts:118` | `id`, `label`, `unavailable`, `unavailableReason` |

**There is no price anywhere on the device path.** The counter can render a menu, hold a cart,
compute a total and take money — and it cannot add a line, because there is no number to add.

### 1.1 How a comment became a schema

`catalog.ts:31` documents the `sort` field:

> `/** Display order within its parent. NOT a price — money lives in events (01-F53). */`

`01-F53` says something different:

> *"A line's `unit_price_paisa` is captured **into the event at the moment the line is added**
> and is never **re-read** from the catalog… **The catalog supplies display text only.**"*

The FR governs what happens **after** capture: once a line exists, its money comes from the
event, so a later price edit cannot retro-price an open order and a stale catalog still bills
correctly. It says nothing about where the price comes from **at** capture — and `14-F6` ("per
variant/channel price edits emit `catalog.changed`") and `06-F6` ("prices shown are the catalog
prices for the selected branch") both make price catalog data unambiguously.

The misreading propagated to all three layers. This is round 1's pattern (a) — *the comment was
the defect* — with an unusually long blast radius: a wrong sentence in a docstring silently
removed a required field from a wire format, a Postgres table and a SQLite schema, and blocked
the highest-frequency task in the product (`C5`, ~300×/shift, the top of the cashier critical
path).

**Nothing here is a bug in code that runs.** Every layer is internally consistent and every test
passes. The defect is a field that was never added, which no test can fail on.

## 2. The founder ruling

> *"Price of any item in menu can be different. That's because of different commissions —
> usually restaurants sell items at different prices on different channels. Like maybe they sell
> item on higher price on foodpanda. A special discounted price on WhatsApp because they want
> people to use it more than foodpanda, and a different in-restaurant price."*

> *"When adding or editing an item we should give user option to configure pricing for all
> active channels. By default we fill it with same price, or have a button for same price across
> channels, or ask user to give all prices."*

Two things follow, and the second is the one that decides the schema.

**Per-channel price is load-bearing on day one, not speculative flexibility.** `14-F6` records
the *what* and never the *why*; the why is commission structure, and it makes channel pricing a
margin instrument rather than a configuration nicety. A restaurant using it deliberately steers
demand off a 25–35% aggregator onto a channel it owns.

**The editor collects every active channel's price, so the data never has a hole.** This
dissolves the hardest question in the design rather than answering it. The obvious cheap schema
is a house price plus overrides — and it carries a silent failure that `01-F53` makes permanent:
a forgotten foodpanda override sells at the in-restaurant price *while commission still takes
its cut*, invisibly at the till, frozen into an append-only ledger, surfacing months later as
thin margin nobody can attribute. Prefilling in the editor buys the same one-number onboarding
with none of that exposure. **The convenience lives in the editor; the schema stays explicit.**

## 3. The design

### 3.1 `ORDER_CHANNELS` closes, because a channel is now a price key

`order.created.channel` is `z.string().min(1)` today (`registry.ts:39`). That was tolerable while
channel was a report category. As a **price key** it is not: a typo resolves to a wrong price,
and `01-F53` freezes it.

This is verbatim the argument that closed `payment.recorded.method` one commit ago —
*"a typo'd method would not fail anywhere; it would quietly become a sixth category that no
report knows to count, in an append-only ledger where it cannot be corrected in place."* The
same asymmetry, with money attached instead of a category.

`02-F1` already names the closed set: **counter, phone, storefront, whatsapp, foodpanda.**
Closing the enum is implementing `02-F1` faithfully, not adding policy.

**It will fail on contact, and that is the point.** `packages/sync-client/src/__acceptance__/builders.ts`
lines 34, 49 and 196 all emit `channel: "dine_in"` — which is not a channel at all. `02-F1`
separates the two axes explicitly: *"types: dine-in (table), takeaway, delivery (own); channel
tags: counter, phone, storefront, WhatsApp, foodpanda."* The builders have been conflating
`order_type` with `channel` since Wave 0, and no test could notice because the field accepted any
string. Expect the enum to red several suites immediately — the same way `paid_paisa` failed two
stub-bearing suites the moment output-schema enforcement met its first real schema change.

### 3.2 The price is a (branch × channel) grid on the catalog entry

```ts
export type CatalogEntry = {
  kind: CatalogKind;
  id: string;
  name: string;
  kitchen_name?: string | null;
  parent_id?: string | null;
  sort?: number;
  /**
   * Integer paisa (`00 §6`) keyed by branch, then by channel — one cell per (branch, channel)
   * pair the org has enabled (`00 §7` layer 2). Absent on non-sellable kinds: a category has
   * no price. A single-branch org carries exactly one row.
   */
  prices?: Readonly<Record<string, Readonly<Partial<Record<OrderChannel, number>>>>>;
};
```

Four properties this shape has to have, each of which rules out an alternative:

- **Integer paisa, never a rate or a delta.** A "foodpanda = house + 30%" markup rule would put
  a rate in the catalog and a multiplication on the line-add path — and `DEC-MONEY-005` bans raw
  arithmetic on money everywhere. A markup is an **editor** affordance that computes a number the
  owner then sees and approves; it is not a stored form. (`14-F8`'s bulk % adjustment is already
  specified this way: "emitted as individual `catalog.changed` events so history stays per-item".)
- **The branch axis is DATA, and the artifact stays org-scoped.** Founder ruling: a chain really
  does price a DHA outlet above a Saddar one. The implementation that looks obvious — serve each
  branch a filtered catalog — is **wrong twice**: `01-F52`'s org scope is what lets a training
  branch mirror production read-only with no special case (`01-F49`), and per-branch responses
  would make one version number mean *different bytes on different devices*, which is the
  premise `01-F56`'s `divergent` detection rests on. So the artifact carries **every** branch's
  prices, one version, byte-identical everywhere, and the device resolves its own row from the
  `branch_id` already in its identity (`device-store.ts:78`). A device can then read other
  branches' prices — accepted, and strictly smaller than the org-wide menu it already holds.
- **Optional at the type level, required by validation.** Categories and modifier groups are not
  sellable. Making `prices` non-optional would force a meaningless number onto every folder in
  the menu tree.
- **Nested, not a composite `"branch|channel"` key.** A flat string key needs a parser, and a
  parser needs a rule for a branch id containing the separator. Two lookups cost nothing.

### 3.3 The invariant lives at the writer

`bbae677` established this for the catalog (finding A3): validation on the read path meant one
blank name became an org-wide reconnect loop, because the throw happened inside `dispatch` where
the server closes the socket. `publishCatalog` now validates each entry against
`CatalogEntryWire` before storing (`services/sync-gateway/src/catalog.ts:116`).

Price validation extends that, with one difference: **it is cross-cutting, not per-entry.**
Whether an entry prices the right cells depends on the org's branches and enabled channels,
neither of which `CatalogEntryWire` can see. So `publishCatalog` gains both sets and checks:

> every entry of a **sellable kind** (`item`, `variant`) that is **not tombstoned** carries a
> price for **every (branch, channel) pair the org has enabled**, each an integer ≥ 0.

Note that the gateway has **no branches table** — `branch_id` appears on `events`, `devices` and
`sessions`, and nowhere as a registry. Deriving the branch set from `devices` would be wrong
(a branch with no device yet is still a branch, and a revoked device must not remove one), so
the set is **passed in by the caller** alongside the enabled channels, exactly as the channel set
is. Standing up an org/branch registry is real work that belongs to doc 15, not to this plan.

Refused publishes name the offending index and channel, for the reason A3's fix already
documents: a bulk import (`15-F8`) is exactly where this arrives, and *"one of your 4,000 rows
is bad"* is not an actionable answer.

> **Drift found while writing this.** A3's fix cites that path as **`15 §42`** in three places —
> `sync-protocol/src/messages.ts:24`, `sync-gateway/src/catalog.ts:106` and
> `catalog-transport.test.ts:193`. Doc 15 has **nine** sections; `15 §42` resolves to nothing.
> The path is `15-F8` ("Menu bulk import, as a staged pipeline"). This is A17's class
> (`sec-F1` → 0 hits, Commandment 2) recurring in the commit that fixed A3. Two of the three
> files are protected paths, so it is **folded into T-3**, which touches both anyway — not
> fixed as a drive-by (`24 §3b`).

**This is what makes §2's ruling structural rather than aspirational.** The editor's prefill is a
UI behaviour that a bulk import or a future API client bypasses; the publish check is the thing
that actually holds.

### 3.4 The price is snapshotted in MAIN, never supplied by the renderer

`shared/ipc.ts:24` states the threat model plainly: *"a renderer is the untrusted end of this
bridge even though we ship it."* The `append` channel is generic and passes `payload` through
verbatim, so routing `order.line_added` through it means **the renderer supplies the money** —
and a renderer that supplies `unit_price_paisa` can supply `0`.

That is not hypothetical here. `fc2f69f` fixed a live path by which a remote origin held this
exact bridge and appended forged events under the device's identity (finding A1). The bridge is
pinned now; the principle it established is that a value the renderer must not forge gets stamped
in main. Identity, event id, lamport sequence and `branch_created_at` already are. Money is the
same class of value.

A dedicated channel, alongside the existing six:

```
renderer:  addLine({ order_id, item_id, qty })          // no money crosses
              ↓
main:      branch  = store.identity.branch_id           // this device's own branch
           order   = store.openOrders() → row.channel   // 02-F1: set at creation, never inferred
           entry   = catalog.lookup("item", item_id)
           price   = entry.prices[branch][order.channel]
           append({ type: "order.line_added",
                    payload: { order_id, line_id, item_id, qty,
                               unit_price_paisa: price } })
```

Two things this buys beyond the security argument:

- **Both resolution keys live in main and neither is in the renderer.** The order's channel is in
  `OpenOrderRow.channel`, a fold projection the renderer never sees and should not; the branch is
  in the store's identity, which the renderer has no access to at all. Doing this in the renderer
  would mean shipping the branch id, the channel, the whole price grid and the resolution rule
  across the seam so the untrusted end can perform a lookup the trusted end already can.
- **`MenuItemSchema`'s "no price" comment stays true**, and for the right reason this time. The
  grid genuinely does not need a price under this design (§3.6), so the sentence that started
  this whole problem survives — correctly scoped at last.

### 3.5 An unpriced item is not an 86'd item

If a price is missing for the order's channel, the item cannot be added. This needs stating
because it sits close to two FRs it must not be confused with.

`01-F17` says a **sale** is never blocked. It does not say every item is always addable — an 86'd
item is already precedent (`01-F22`). But `01-F59` rules that an 86'd item *stays deliberately
sellable* (`8b28a72`), and the distinction matters:

| State | Meaning | Sellable? |
|---|---|---|
| 86'd (`01-F22`) | we are out of it | **Yes, deliberately** — the price is known, `02-F31` owns the oversell path |
| Unpriced | we do not know what to charge | **No** — selling requires a number, and inventing one is worse than refusing |

`27-F4`: disabled in place, holding its position, with the reason shown. Never removed from the
grid — removing it would move every tile after it and destroy the positional memory a non-reading
operator depends on entirely.

**This path should be unreachable** given §3.3, and it is written anyway because §3.3 protects
future publishes and a device can hold a version published before the check existed. On a
greenfield deployment no such version exists; the branch is defence, and it is one `if`.

### 3.6 An order's type is chosen before the grid unlocks (founder ruling)

`02-F1` requires `order_type` at creation and forbids inferring it later. So the tap that starts
an order has to carry a type, and the question was whether to pre-select one.

**Ruled: no default.** The grid is **disabled in place with its reason** (`27-F4`) until dine-in,
takeaway or delivery is tapped. That tap creates the order and unlocks the grid.

This costs nothing against the inventory — it *is* `C4`, whose budget is ≤2 taps at ~75×/shift —
and it protects the axis that a default would quietly corrupt. `order_type` feeds tax posture
(doc 16) and channel economics (doc 12); a takeaway recorded as dine-in because the cashier did
not look at a pre-selected chip is wrong in the ledger, and `01-F1` means it can only be
corrected by a new linked event, never edited. The `§7.1` Shopify warning does not apply here:
this is not a confirmation step added to the dominant path, it is `C4` itself, and `C5`'s one-tap
budget is untouched once an order is open.

### 3.7 What is deliberately not built

- **No price on the grid tiles.** `02-F2` does not ask for one and `C5`'s budget is one tap. The
  cart carries the money, computed and final (`27-F24`). Adding price text to 88 tiles spends
  the `27-F14` colour and density budget on a number the cashier reads once, after the tap.
- **No modifier pricing.** `01-F21`'s chain runs to ModifierGroup/Modifier, but the counter has
  no modifier flow — `C7` is blocked on the §9 C3 typing conflict. A priced modifier would have
  nothing to exercise it. Additive later under `00 §6`. The founder's ruling says *"adding or
  editing an **item**"*, which this matches.
- **No back-office editor.** Doc 14 is not a Wave 1 app (`screen-map.md §3` ships two: the
  counter and the optional pass screen). §2's editor behaviour is written into `14-F29` so the
  ruling is not lost, and built when doc 14 is.
- **No KOT printing on confirm.** `C9` appends `order.confirmed`, which is what makes the queue
  row exist (`merge.ts`: "row exists iff confirmed"), so the order becomes visible to
  `kitchenQueue()` and to `pass-kds`. The printer path is doc 03 and needs hardware.

## 4. The spec PRs (Commandment 9 — these land before any code)

| FR | Doc | States |
|---|---|---|
| **`01-F60`** | `01` | The catalog carries `prices` — integer paisa per enabled channel — on sellable kinds. This is the source `01-F53` snapshots **from**; `01-F53` continues to govern everything after capture. Explicitly corrects the "catalog supplies display text only" reading that removed the field. |
| **`02-F42`** | `02` | `channel` is the closed set `02-F1` already names, and it is a **price key**: the line price resolves from the order's channel, fixed at creation and never inferred later. |
| **`14-F29`** | `14` | The item editor collects a price for **every active channel**, prefilled from a single value with a "same price across channels" action; publishing an item that does not price an active channel is refused. Extends `14-F6`. |

`00 §7` needs no change — layer 2 already lists *"channels enabled"*. This plan is the first
consumer of that key, which is worth noting: it has been declared config and read by nothing.

## 5. What has to be built

Ordered by dependency. Each task names the check that closes it (`24 §3`: done is the check
passing, never my judgement).

| # | Task | Paths | Test author |
|---|---|---|---|
| **T-1** | The three spec PRs in §4 | `specs/` | — (`pnpm verify` docs-lint) |
| **T-2** | `ORDER_CHANNELS` closed; `order.created.channel` becomes the enum; the `dine_in` drift in the builders corrected to a real channel + `order_type` | `domain` ⚠ | **separate session** |
| **T-3** | `prices` on the catalog entry at all three layers; `publishCatalog` validates every enabled (branch, channel) pair on every sellable entry; the three `15 §42` citations corrected to `15-F8` | `sync-protocol` ⚠, `sync-client` ⚠, `sync-gateway` ⚠ | **separate session** |
| **T-4** | `addLine` IPC channel; main resolves the price from its own branch + the order's channel and stamps it | `pos-electron` | same session |
| **T-5** | The counter loop: `C4` start an order (order-type gate, §3.6), `C5` add an item, `C9` send to kitchen | `pos-electron`, `ui` | same session |

⚠ = protected path, senior review mandatory, acceptance tests authored elsewhere.

## 6. What must be true when this is done

Each clause is a test, and each names the failure it exists to catch. The round-2 lesson on
clause coverage (`A12`: three claimed clauses had no test in the file) applies — **a clause
listed here and not tested is a defect in the delivery, not in this list.**

1. A device holding a catalog can add a line, and the event carries the price for **that order's
   channel** and **that device's branch** — not the counter price, when the order is a foodpanda
   order.
2. Two orders on different channels, same item, same device, same minute → **different**
   `unit_price_paisa`, each frozen at its own value.
2b. Two devices in **different branches**, same item, same channel, same published version →
   **different** `unit_price_paisa`. This is the branch ruling's whole point and the clause that
   fails if resolution reads the org default instead of the device's own row.
3. A price edit published between the two line-adds changes neither line (`01-F53`, the property
   `14-F6`'s editor promises the owner as *"open orders keep their price"*).
4. `publishCatalog` **refuses** a sellable entry that omits an enabled (branch, channel) cell,
   names the index, the branch and the channel, and leaves no partial version behind — verified
   by re-reading the version table, because A3's whole lesson is that the failure mode is a
   poisoned version, not an exception.
5. A publish that omits a price for a **non**-enabled channel, or for a branch the org does not
   have, succeeds. An org that does not do foodpanda does not carry foodpanda prices.
5b. **One version is byte-identical for every branch's device.** Two devices in different
   branches fetch the same version and receive the same artifact — the guard against
   "optimising" this later into a per-branch filtered response, which would silently break
   `01-F56`'s divergent detection (§3.2).
6. A category and a modifier group publish with no `prices` at all.
7. An unknown channel string is refused at append (`01-F4` runtime error), and the closed set is
   exactly `02-F1`'s five — asserted against the doc, not against itself.
8. An item unpriced on the order's (branch, channel) cell renders **disabled with its reason**
   and does not stop the rest of the order completing (`01-F17`), and is distinguishable in the
   DOM from an 86'd item, which stays pressable (`01-F59`).
9. The renderer cannot set a price: `addLine`'s payload has no money field, and a crafted
   `append` of `order.line_added` from the renderer is refused. **This one is adversarial** —
   A1's reviewer drove the bridge attack against a real build, and the seam tests that merely
   assert the happy path are how A15's `.nonnegative()` claim survived while executing nothing.
10. Money never crosses a float: the price is integer paisa end to end, and the line total is
    BigInt in the fold (`01-F17`, `DEC-MONEY-005`).
11. **The grid does not unlock without an order type** (§3.6): with no order open, every tile is
    disabled with its reason and fires no `onPress`; tapping a type creates the order and the
    same tile then adds a line. Asserted on the real DOM, since `ff7b750` gave `packages/ui`
    one — an attribute-grep cannot tell "disabled" from "greyed", which is exactly the
    distinction `01-F59` turns on.

## 7. The question this plan could not answer — ANSWERED

**Branch-level pricing (`06-F6`).** The FR says *"prices shown are the catalog prices **for the
selected branch**"*. This plan originally deferred it, on the reasoning that the catalog is
org-scoped by `01-F52` — deliberately and load-bearingly, since that is why a training branch
mirrors production read-only with no special case (`01-F49`) — and that a branch axis is a
second scope on the one path that has exactly one.

**Founder ruling, July 2026: it is real. A DHA outlet genuinely charges more than a Saddar one.**

The deferral reasoning was sound about the *hazard* and wrong about the *conclusion*, and the
distinction is worth keeping on the record because it is what §3.2 now encodes:

- **Serving each branch a filtered catalog would have been the second scope**, and it would have
  broken two things at once — `01-F49`'s no-special-case mirroring, and `01-F56`'s premise that a
  version number identifies one artifact, since two devices would hold different bytes at the
  same version.
- **Carrying every branch's prices inside one org-scoped artifact is a column, not a scope.** One
  version, byte-identical everywhere; the device resolves its own row from the `branch_id`
  already in its identity. Nothing about the serve path changes.

So the axis lands in `01-F60` **now**, which is the cheap moment: the schema is easy to widen
before any org has published data into it and expensive afterwards. The residual cost is that a
device can read other branches' prices — accepted explicitly, and strictly smaller than the
org-wide menu it already holds.

**What remains genuinely open** is where the org's branch list comes from at publish time. The
gateway has no branches table; `branch_id` appears on `events`, `devices` and `sessions` and
nowhere as a registry. §3.3 passes the set in from the caller rather than deriving it from
`devices` — a branch with no device yet is still a branch, and revoking a device must not delete
one. An org/branch registry belongs to doc 15 and is not built by this plan.
