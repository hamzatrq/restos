# Customer records & loyalty — design

**Status: PLAN. No code, no spec edit.** Owning specs read in full: `specs/17-marketing-loyalty.md`
(20 FRs), `specs/01-kernel-sync.md` (`01-F23`/`01-F24` customer file, `01-F75`/`01-F76`/`01-F87`
reference data, `01-F62` scopes), plus `02-F10`/`02-F14`/`02-F27`/`02-F47`/`02-F60`/`02-F63`,
`22-F13`/`22-F14`/`22-F26`, `06-F9`/`06-F11`, `07-F18`, `28-F7`, `DEC-CUST-001`, `DEC-DATA-001`,
`DEC-MONEY-005`, `DEC-MONEY-010`, and rulings R38, R55, R58, R60, R63, R70, **R71**.

---

## 0. The brief's premise is stale, and the correction changes what is left to build

The brief says *"`registry.ts` declares 2 `customer.*` payload schemas and **no surface anywhere
consumes them**"*. The first half holds; the second stopped being true. Measured 2026-08-24,
comment-blind, symbol-precise:

| What | Where | State |
|---|---|---|
| Payload schemas | `packages/domain/src/registry.ts:946,950` | `customer.created`, `customer.address_added` — the only two |
| Normalizer (dialled → `01-F23` key) | `apps/pos-electron/src/main/customer-phone.ts` | ships; `+92` country default is a flagged interpretation |
| Device fold #7 | `packages/sync-client/src/folds/customer-file.ts` (204 lines) | ships, **with per-field merge rules declared** (`01-F34`) |
| Fold reached in production | `device-store.ts:826` (catch-up), `:921` (append), projected at `:1322` | ships |
| Lookup + emit | `gateway.ts` `lookupCustomer` / `recordCustomer`; wired at `main/index.ts:1836,1847` | ships |
| Counter surface | `Counter.tsx` phone strip + caller card | ships |
| Permission action | `permissions.ts` `"customer.record"` (`02-F47`) | ships |
| Tests | 5 renderer `.dom.test.tsx` suites (50 `it(`), 4 kernel suites (63 `it(`) | 113 assertions |

**So the customer model is not a blank page — it is a built, converged, tested kernel with one
hole.** That hole is the whole of what the other three modules need, and it is not mine:

> `apps/pos-electron/src/shared/ipc.ts:768` — *"`order.created`'s payload declares `order_id`,
> `channel`, `order_type?` and `table_id?` and nothing else, and `01 §4`'s order family has no
> `order.customer_linked` — so **no event in the corpus can say which customer an order is for**."*

Everything else in this design is downstream of that one sentence.

---

## 1. The customer record — I add nothing to it

**Ruled, and not re-opened here.** `01-F23`: one identity per org, keyed by normalized E.164;
merging two identities is an event; history preserved. `01-F24`: org-scoped absolutely,
cross-branch shared. `02-F47`: `customer.record`, cashier ✔, one action for both event types.
`registry.ts`: `name` required-and-nullable (`null` = *no name stated*, `06-F11`'s first sight;
absent = a writer forgot); `phone_e164` validated as E.164 at the **writer**, never normalized in a
fold, because a normalizer in a fold is a policy in a fold (`01-F34`).

**Silent, and left silent.** No `customer_id` exists anywhere in the corpus. No second phone, no
household, no tier, no tags, no birthday. `17 §1` says this module *"introduces **no new data
capture**"*, and I hold to it literally: **this design adds zero fields to the customer record.**
That is deliberate and it is the answer to the shared-dependency problem in the brief — three
modules cannot invent three models if the model is closed and the only thing anyone may ask for is
a *link*.

**Proposed, `proposed`, and not implemented against.** `customer.merged` and
`customer.phone_verified` are `01 §4` vocabulary with no payload schema, so `01-F4` keeps them
unemittable; `DEC-CUST-001` (merge conflict UX) is `proposed`, and the shipped fold is deliberately
built so that **no answer it can take is foreclosed**: divergent names are all retained,
`name` projects `null`, `customer_name_divergence` is raised, and nothing picks a winner. Loyalty
needs no merge to ship.

### 1a. The phone key is not unique in practice, and for loyalty that is correct

A family shares a number; one person has two. `01-F23` decides both by definition rather than by
accident: two creates carrying one number **are** one identity, and one person with two numbers
**is** two identities.

- **For loyalty this is the right semantics and needs no fix.** A shared number accrues together —
  which is exactly what a physical punch card in a household drawer already does. The reward is a
  bearer benefit attached to a key, not a claim about a person.
- **For three neighbours it is a real defect and I report it rather than fixing it.**
  (i) **Khata** (`02-F14`): a receivable against a household, and `01-F30`'s khata clause has no
  way to say which member owes it. (ii) **Consent** (`07-F18`): one member replies STOP and the
  whole household is suppressed, permanently unless someone explicitly re-opts-in — `17-F5` says
  *"no role can override; no exception path exists in code"*, so this is by design and cannot be
  worked around. (iii) **Per-person analytics** (doc 13): unavailable, and any figure presented as
  per-person would be false.
- **The second case — one person, two numbers — is the one the corpus already has an answer for**
  and it is `customer.merged`, blocked on `DEC-CUST-001`. Until it lands, loyalty progress does not
  follow a customer across her two numbers. That is a visible, explainable failure (*"we have you
  under your other number"*), which is the survivable direction.

### 1b. PII — what is ruled, and the one lever doc 22 explicitly declines to pull

`22-F14`: erasure over an append-only ledger is **crypto-shredding** — PII fields envelope-encrypted
at write with a per-customer data key, destroyed on `governance.erasure_executed`. The ledger is
never rewritten. `22-F13` keeps kernel events forever with PII fields redactable; the customer-file
read model lives for the life of the org with PII redacted and the identity key tombstoned.

`22-F26` (R38): **erasure is DEFERRED for every org uniformly, and it is a decision, not an
oversight.** Its (b) clause is the one that binds this module, verbatim:

> *"`packages/domain` implements no such wrapper, and `customer.created` (`phone_e164`, `name`) and
> `customer.address_added` (`phone_e164`, `address_text`) write a customer's phone number, name and
> street address into the ledger **in cleartext**. `01-F1` makes that permanent — a later erasure
> design cannot crypto-shred a key that was never used … **One lever exists and this FR
> deliberately does not pull it: a deployment could decline to write those fields until the wrapper
> ships, which is a product call about phone and delivery orders (`02-F27`, `06-F9`) and not doc
> 22's to take."*

**That product call is this module's to surface, because loyalty is the feature whose entire
purpose is to grow that volume.** A counter that records a caller now and then records every repeat
customer for a loyalty programme writes an un-erasable PII corpus at a rate set by how well the
feature works. Founder decision 1. **I invent no retention or erasure policy here** — `22-F26` (e)
already flags that `DEC-DATA-001` is dated *pre-pilot* while R38 defers past it, two live dates for
one decision, and that conflict belongs to whoever owns that row.

---

## 2. The order→customer link — what I need, and the act that supplies it

**Not mine (founder ruling: doc 02's slice).** I state the requirement, both shapes and their
costs, and name the acts. Two written FRs already depend on it — `02-F10` (open orders searchable
by customer phone) and `02-F14` (khata requires a linked customer) — so this is a debt the corpus
already carries, not a thing loyalty invents.

**What loyalty needs, minimally:** for a given `phone_e164`, the set of `order_id`s that are that
customer's *and* have an `order.settlement_closed`. Nothing more. No name, no address, no history
join.

**Shape A — an optional field on `order.created`.** `customer_phone_e164?`, additive under
`looseObject` and `00 §6`, zero new event types, zero `01 §4` act. *Cost:* the link can only ever be
made **at creation**, and both dependent FRs need it later — `02-F14`'s khata is decided at
settlement (a walk-in who says *"put it on my tab"* after eating) and `17-F17`'s POS flow is *"phone
lookup → reward visible → apply"* mid-order. Shape A therefore satisfies `02-F27`'s phone-order path
and neither of the two FRs that motivated the field.

**Shape B — one new branch-scoped type, `order.customer_linked { order_id, phone_e164 }`.** Works at
any point in an order's life, keys on a payload value, folds as a G-set of linked phones per order
with `01-F31`'s disposition if two distinct phones are linked (both retained, contested, anomaly, no
winner). `order.created` gains nothing. *Cost:* an `01 §4` catalog addition — a doc-01 spec act plus
a `packages/domain` payload schema on a protected path (commandment 10), which `01-F84`
(`order.cancelled`) shows is the expensive kind of change.

**Recommendation: Shape B**, because Shape A cannot express the two cases the corpus already
committed to, and a link that must be re-stated at creation is a link a cashier will not make.
Founder decision 4. Either way the acts are: a doc-02 FR amending `02-F27`/`02-F10`/`02-F14`, and
(Shape B) a doc-01 `01 §4` catalog act + schema.

**⚠ One property the link must have and neither shape gives free:** it must not become a second
source for the customer's identity. The link carries `phone_e164` — `01-F23`'s key itself, exactly
as `customer.address_added` does (`26 §4`'s late-resolving-entity trap) — and never a handle to a
create event, so an order links even if its `customer.created` never arrives.

---

## 3. Two loyalty mechanisms, not one — and the corpus bans the founder's by name

This is the sharpest finding in the round. `17-F15` reads:

> *"Progress is derived from settled orders on the customer file — org-wide, all channels, **no
> punch cards**, no manual adjustment."*

The founder asked for punch cards in terms: *"many restaurants specially coffee shops have printed
cards … when customers have ordered certain number of times then they can claim free coffee."*

They are not the same object and collapsing them is how this gets built wrong:

| | **Account loyalty** (`17-F14`/`F15` as written) | **Bearer card** (the founder's coffee shop) |
|---|---|---|
| Identity | `01-F23`'s phone key | **the card itself** — no customer record at all |
| Progress | derived from settled orders in the ledger | physical stamps on paper, invisible to us |
| Needs §2's link | **yes** | no |
| Fraud model | replay/partition (solvable) | forgery + photocopy (**not** solvable at the till) |
| Works for a walk-in who gives no number | no | **yes** |
| What we can verify | everything | **nothing** — we record an attestation |

A coffee shop's card works precisely *because* it asks nobody for a phone number at 08:00. Account
loyalty cannot serve that customer, and a bearer card cannot serve a phone-order customer who never
touches paper. **Ship both; they share one event vocabulary and one campaign model, and they differ
in exactly one field (`phone_e164` present or `null`).**

**The amendment to `17-F15` is narrow and must stay narrow:** *derived progress* remains the only
mechanism for **account** loyalty — no manual stamp, no adjustment, no counter a manager can type
into. A bearer card is a **campaign kind**, not a second progress mechanism. Written any wider, the
FR's real protection (*nobody can hand-edit a loyalty balance*) is lost. Founder decision 2.

---

## 4. The loyalty counter under standing law 1 — arithmetic, never a sequence

*"Every Nth order → reward"* reads as a sequence, and a sequence is illegal: `01-F34` forbids a
device fold reading **any** ordering metadata, and `01-F87` forbids a fold reading configuration at
all — so a fold may neither order the orders nor divide by `N`. Both constraints are satisfied by
one move: **the fold projects two counts and the division happens elsewhere.**

**Projection, per `phone_e164` (an eighth device fold, `loyalty_progress`):**

- `qualifying_orders` — a **G-set** of `order_id`s having (a) §2's link to this phone and (b) an
  `order.settlement_closed`, each carrying that act's **attested** `billed_paisa` (`01-F63`'s
  snapshot — a payload value, never re-derived). Set membership: commutative, idempotent,
  order-free, and duplicate delivery collapses.
- `redemptions` — a **unique-keyed map** by `adjustment_attempt_id` (`01-F31`/`01-F83`) →
  `{ campaign_id, orders_consumed }`. Members diverging in any field mark the key disputed,
  contribute **zero**, raise an anomaly, and are all retained. A fold never picks a winner.
- `orders_consumed_total` — Σ of that map's `orders_consumed`, accumulated in **BigInt** (standing
  law 3; a running double lets delivery order decide an outcome).
- `exceptions` — sorted G-set. `loyalty_overdrawn` when `orders_consumed_total` exceeds
  `|qualifying_orders|`.

**Render-time, reading the campaign artifact (`01-F87`'s explicit carve-out: a rendering computed at
display time reads configuration freely, the shipped precedent being `03-F14`/`03-F47`'s aging
thresholds in `AgeBadge`):**

```
eligible   = |{ o ∈ qualifying_orders : o.billed_paisa ≥ campaign.min_order_paisa }|
available  = floor( (eligible − orders_consumed_total) / campaign.every_n )
```

**⚠ The break is one keystroke away and `01-F87` names it: memoizing that rendering into a
materialized state table.** At that moment the value stops being recomputed per frame and becomes a
projected one, and two tills at different artifact versions project different rewards. The counter
is a render. Write that in the code, not only here.

**Why `orders_consumed` and not a "reset":** `17-F17` says the counter *"resets by event,
append-only"*, and a reset is a sequence-dependent idea. Consuming `N` is the same fact stated as
arithmetic, and it survives `N` changing: a redemption at `N = 10` consumed ten orders and stays
consuming ten forever, exactly as `01-F53` freezes a price and `01-F85` snapshots a tender's
posture. **This is what stops an owner changing `N` from 10 to 8 and silently re-awarding every
customer in the org a free coffee, permanently, in a ledger `01-F1` forbids correcting.**

**Partition, and it is `17-F13`'s ruled disposition rather than a new one.** Two tills each see ten
qualifying orders and zero consumed; both redeem. On merge the set holds ten and consumed is twenty
→ `available` is negative → `loyalty_overdrawn` raised for the manager surface, **both discounts
stand**, and no sale was ever blocked (`01-F17`, `01-F20`, `17-F13`). Detection is a predicate over
the delivered set, so it is order-free too.

**Bearer redemptions carry `phone_e164: null` and `orders_consumed: 0`** — no account counter moves,
because the counter was paper. `null` is a stated fact and `undefined` is a writer who forgot, on
the registry's own standing rule.

**What can and cannot count.** `17-F15` says org-wide, all channels. Measured: `08-F2` has
aggregator orders reach settlement **writing no customer file at all**, so foodpanda orders cannot
be linked and cannot count — the question answers itself for now, and if doc 08 ever links them
it becomes a real one (a discount on an order the aggregator already discounted).

---

## 5. Campaign definitions — the model

`17 §3`'s own automation-law register classifies *"Campaigns, segments, loyalty program
definitions"* as **configuration, not facts**, and `17 §7` puts campaign definitions at **layer 2
(org)**. The corpus has therefore already answered the two hardest questions about them, and this
design reads that answer rather than inventing one.

### 5a. The row (an artifact row, typed and validated at the WRITER per `01-F75`)

```
campaign_id        org-unique, minted at the writer
kind               auto_deal | coupon | bearer_card | account_loyalty     (CLOSED at the writer)
status             active | paused | completed          (a departure is a MARK, never an absence)
valid_from/to      business-day bounds, Asia/Karachi 05:00 (01-F46)
branches           null = whole org; else branch ids     (branch axis as DATA, 01-F60/01-F87)
channels           subset of 02-F42's ORDER_CHANNELS; empty = every enabled channel
item_scope         null = whole order; else catalog entry ids (01-F21)
min_order_paisa    integer paisa
benefit            { form: percent_bps | amount_paisa | free_item,
                     value: integer,           -- bps or paisa or a catalog entry id
                     cap_paisa: integer | null }
tender_requirement null | { tender_ids[], attested_label }        -- §6
proof              none | code | bearer_card | attested
code               null | uppercase base32 + one check character (17-F10, unchanged)
use_limit          unlimited | once_per_order | once_per_customer
requires_customer  boolean
every_n            null | integer                       -- account_loyalty only
```

**Money obeys `DEC-MONEY-005` without exception:** percentage as integer **basis points**, cap as
integer **paisa**, computed with `applyRateBps` then `min(cap)` — never a float, never a division.
`benefit.form: free_item` resolves through the catalog and yields the line's own snapshotted
`unit_price_paisa` (`01-F53`), so a free coffee is worth what the coffee was rung at, not what the
menu says today.

**Two named refusals.** There is no `budget_paisa` and no `max_redemptions` on the row: an
org-global counter is a *distributed* limit, and enforcing one offline would either block a sale
(commandment 4) or be a number that is always wrong. `17-F13` already rules the shape — append,
merge, flag, never block — and a cap that can only be reported after the fact must be presented as
a report, not as a control. And there is **no `effective_at`**: `01-F75` specifies no scheduling
field, and `01-F87` reads §9.5/R31/`14-F36` as putting application time on the **act** (a change
scheduled for 18:00 publishes at 18:00), so a second field would be a second answer to one question.

### 5b. The carrier — a **fifth `01-F75` resource**, `campaign`, org-scoped

`01-F75`'s resource set is CLOSED at four (`catalog`, `staff`, `device_roster`, `config`) and *"each
future member is an amendment to this clause plus its own golden fixture; none may be added by an
implementation."* This design **answers the carrier question explicitly** and names the act.

**The answer: a fifth member, `campaign`, `01-F76` scope `{ org_id, branch_id: null }`.** Not a key
inside `config`. The reason is blast radius, and it is `01-F87`'s own rule turned on itself:

> `01-F87` (b): *"An UNKNOWN key is ignored; a **MALFORMED known key refuses the whole artifact**."*

A campaign set is authored by an owner, is unbounded in cardinality, and changes weekly. Riding it
inside `config` means **one bad campaign row refuses the org's tax posture, its charge-rounding
granularity and its discount threshold at every till** — the three seeds `plans/v0.md` gap 3 already
names. `01-F87` argues its own carrier's size explicitly (*"the whole of layer 2 is a handful of
scalars and two small tables"*); campaigns are neither. A separate resource keeps `01-F56`'s
`malformed` scoped to the thing that was malformed.

Everything else is inherited unchanged and costs **zero new message kinds**: the `reference_request`
/ `reference_response` / `reference_notice` triple, `01-F71` (e)'s serve-path enforcement (the key
comes from the session; a stated one is refused, never clamped), `at_version`-is-a-continuation,
`have_version` deltas carrying one entry per changed id at the greatest version ≤ target,
`01-F56`'s monotonic apply, `01-F76`'s device-side `foreign_artifact` refusal, and `01-F75`'s
named-producer rule (the publish path mints the version **and** fans out the notice — written down
because the catalog's own fan-out shipped with zero production callers). `form: "snapshot"` may be
the only form this resource ever answers and that is legal, not a gap.

**The artifact carries no credential and no PII**, so `01-F87`'s org-scope reasoning transfers
intact and `01-F81`'s signature question is not re-opened. **One consequence for `17-F10`:
unique-per-customer coupon batches do NOT travel in the artifact** — a phone→code table on a till
is exactly the credential-shaped blast radius `01-F76` scopes `staff` to a branch to avoid. The
artifact carries the batch's *rule*; the code itself is the bearer token, checksum-validated offline
and arbitrated at merge.

**The act:** an amendment to `01-F75`'s closed-set clause + a golden fixture (`20 §2.7`), plus the
row schema in `packages/domain`. Both are protected-path work.

### 5c. This closes `28 §9.25`, which doc 28 routes to doc 17 by name

*"Is marketing/loyalty enablement distributed to a branch, and how?"* — `28-F7` excludes it from
entitlement and names the shape it suspects: *"if a disabled module publishes no campaign reference
data the branch-side absence is total."* With campaigns as their own resource that shape is exact
and needs no flag: **`01-F77`'s omitted-never-zero rule already makes an org that has published no
campaigns indistinguishable from a gateway that does not serve the resource — in both cases the
device simply never asks.** So there is no enablement bit to distribute, no cache, no TTL, no
staleness policy and nothing commercial anywhere near `01-F17`'s sale (`28-F8`).

### 5d. Offline, and `17-N3`'s 100 ms

The till holds the artifact; validation is a synchronous read of its own store — no WAN, no hub, no
clock, no ordering metadata, on the `settlement-guard.ts`/`DEC-MONEY-009` pattern already shipping.
A device that has never received the artifact has **no campaigns**, which is the safe direction and
never blocks a sale. Compare the market: **Square Loyalty requires points from offline payments to
be manually linked after reconnect.** We must not copy that; `17-F13` already rules the opposite and
commandment 4 forbids it.

---

## 6. The bank-card case — attestation, and an axis nothing in the corpus has

*"50% off if you use Visa Signature, capped at PKR 10,000."* Three findings, all measured.

**(a) The till cannot see the card, permanently, by ruling.** R60/`02-F60`: the card terminal is the
bank's third-party Android device, *"RestOS never drives it"*, the cashier keys the amount into the
bank's machine and it prints its own slip. The Pakistani specialists solve this the only other way
— IPS Pakistan's discount-management system reads the scheme and issuing bank off the terminal *"the
moment a card is tapped"* — **and that route is closed to us by R60.** So the cashier attests the
card, or bank promos are not a campaign at all.

**(b) There is no issuer axis anywhere in the corpus, and the one that exists is the wrong one.**
`PAYMENT_METHODS` in `registry.ts:43` is still the fixed five (`cash`, `card`, `raast`,
`khata_credit`, `aggregator_receivable`); R55/`01-F85` makes it an owner-extended seed set —
spec-closed, code owed. R60 keys commission on **(org, provider)** = the *acquiring* bank whose
machine sits on the counter. A bank promo keys on the **issuing** bank × card **product tier** —
*Visa Signature* is a product of an issuer, and it is a different axis. `02 §9.6` is open on whether
an acquirer is even its own tender channel or an attribute beneath `card`, and it says the answer
*"must be settled before the layer-2 surface is built"*. **A Visa Signature campaign is not
expressible today and cannot be until that question is answered plus an issuer/tier axis is
minted.** Founder decision 5.

**(c) R58 creates a stranded-discount trap and the fix is R58's own machinery.** R58 puts the tender
channel *before* the unpaid receipt prints and says *"sometimes people change the mode after
choosing"*. A campaign discount applied at bill time against `card` and then settled in cash is a
`discount.recorded` that `01-F1` forbids deleting, and `01 §4` has **no `discount.reversed`**.
**So a tender-conditional campaign discount is recorded at the SETTLEMENT act, never at bill time.**
Before settlement it is a *quote* on the pre-bill — which is exactly the two-totals document R58
already requires (*"some restaurants … show both total amounts showing so user can choose"*), so
this reuses shipped reasoning instead of inventing a reversal event.

---

## 7. The proof problem — what the cashier does, what the ledger records

The founder's actual concern: *"would also be very bad if the person at reception have to ask
Manager's approval for things which can simply have proof attached like the card with receipt."*

**The ledger records an ATTESTATION, not a verification, and the design must say so out loud.**
Three fields on the redemption, and each answers a different question a reviewer will ask:

| Field | Question it answers | Where it lives |
|---|---|---|
| `campaign_id` + `campaign_version` | *under what rule?* | `discount.recorded` (additive, `looseObject`) |
| `proof_kind` + `proof_ref` | *what did she hold in her hand?* | `loyalty.reward_redeemed` |
| envelope `actor_user_id` | *who attested?* | already there (`02-F41`/`02-F45`) — never a payload copy |

**The physical half is the part that makes it audit-able and it is a procedure, not code:** the
surrendered card staples to the receipt copy, and the end-of-day report says *"6 bearer redemptions
recorded on this till"*. Six cards in the drawer and six rows is a reconciliation a branch manager
can do in ten seconds without having stood there when it happened. That is precisely what the
founder described, made checkable.

**The honest limit, stated because a design that hides it will be trusted too far.** Attestation
without verification means a cashier can give a free coffee to a friend and record a card that never
existed. The control is **statistical and after the fact** — a cashier whose redemption rate is
three times the branch's — never preventive. **R77's vocabulary discipline binds here as it does for
stock:** the report says *unmatched redemptions*, and the words **shrinkage, loss, theft, missing**
are banned. Every alert is on a sustained same-signed run, never one day, because measurement error
is zero-mean and flips while a pattern does not.

**The alternative, refused with its argument recorded:** require a manager PIN on every campaign
redemption. That is exactly what the founder called bad and what R71 ruled against, and `02-F46`'s
own argument applies unchanged — `27-F11e` makes a branch with no manager on the floor the common
deployment, so a control whose only holder may not be in the building is a control that does not
exist.

---

## 8. Authorization — R71's predicate routing, and what I do NOT mint

R71 turns `17-F12` live: *"Campaign discounts are pre-approved by the campaign definition: within
its bounds, no manager approval"* — and it *routes the predicate* rather than inventing a mechanism.

**Measured 2026-08-24, `packages/domain/src/permissions.ts:867`:** `canDiscount` is **per-act**,
comparing one `amount_paisa` against `threshold_bps × order_total_paisa` by BigInt
cross-multiplication. **Neither half of R71 is built** — not the cumulative base, not the campaign
arm — and no FR in any spec carries R71 yet (`grep -arn cumulativ specs/` returns two unrelated
hits). So R71 is a live ruling with no FR and no code.

**What loyalty needs from that predicate, stated as a dependency because the cumulative half is doc
02's:**

1. **A campaign arm.** `canDiscount` gains an optional campaign input; a discount citing a campaign
   whose computed amount is **within** `benefit.cap_paisa` and whose scope matches takes the
   `order.discount_within_threshold` row **regardless of magnitude** — that is the whole of R71's
   Rs 10,000 case. Outside its bounds it falls through to the discretionary predicate untouched,
   which is `17-F12`'s own last clause.
2. **No new permission action.** The money outcome is identical to a within-threshold discount, and
   `02-F47`'s reasoning binds: *two actions whose cells are identical differ in nothing an
   implementation can observe*. `loyalty.reward_redeemed` is authorized by the same act as the
   `discount.recorded` it accompanies, on `02-F47`'s one-action-for-both precedent.
3. **Campaign authoring in the back office needs `config.manage`** — `14-F43`, owner-only, a pinned
   interpretation, **spec-closed and code-owed** (measured: not in `PERMISSION_ACTIONS` today, which
   ships 27). Campaigns are configuration by `17 §3`'s own register, so they inherit it. **I mint
   nothing.** `services/api` refuses at boot to host an ungated procedure, so the authoring surface
   cannot be booted until `14-F43` lands — a dependency, not a blocker I can route around.
4. **The fold may branch on the PRESENCE of `campaign_id`, never on its VALUE.** `01-F85` bans a
   fold arm keyed on an owner-typed id, because a renamed tender would change a projected value.
   Presence is not value: renaming a campaign changes nothing a fold sees. This distinction is
   load-bearing — R71's cumulative running total must exclude campaign discounts, which means the
   fold must partition them, which means it must read that field. Write the distinction down at the
   fold, or the next reader deletes the arm citing `01-F85`.

---

## 9. The two-plane wall — dissolved, not fought

`01-F62` fixes the org-scoped event set at **five types** (`catalog.changed`,
`device.registered`, `device.revoked`, `user.changed`, `config.changed`) and requires every other
envelope to carry `branch_id`, `device_id`, `branch_created_at` and `time_basis`, stamped by an
originating **device**. That is the wall doc 05's manager console hit (`05-F28`): a cloud web page
cannot legally emit a branch-scoped event.

`17 §5` declares `campaign.created / activated / paused / completed` as new `01 §4` types. **Emitted
from the back office they would each need to join `01-F62`'s org-scoped set — a doc-01 act, four
types wide.** The alternative is better and is the corpus's own classification:

**Campaign definitions are configuration (`17 §3`, `17 §7`), so they take `01-F87`'s carrier pair
unchanged: `config.changed` carries the change, the `campaign` artifact carries the value, and no
fold reads either.** `config.changed` is already org-scoped and already legal from a cloud plane;
its payload (`01-F87` (a)) is `key` / `layer` / `version` / `before` / `after` with an **open** key
space by design, so a campaign lifecycle change states itself with no new type at all. Doc 17's
four `campaign.*` definition events become redundant and should be **withdrawn** in the same
amendment that adds the resource — one act, both halves, on `01-F81`'s precedent for not letting a
name land ahead of the thing that serves it.

**What stays as events, and they are branch-scoped and device-emitted, so no wall:**
`loyalty.reward_redeemed` (a till act) and `discount.recorded` + `campaign_id` (already `01 §4`
vocabulary, already emitted by the till).

**What must be DELETED rather than built: `loyalty.reward_earned`.** `17-F15` says progress is
*derived* and then says crossing the threshold *emits* an event. A derivation is not an act: every
device would compute the crossing independently and every one would emit, or one would and the
others would not, and either way a projected value would depend on which device folded first —
standing law 1's break. §4's arithmetic makes the event unnecessary: the reward is available exactly
when the counts say so. **An event nobody can legitimately emit is worse than a missing one**, and
this one has no producer that is not a fold. Recorded as an amendment owed to `17-F15`.

---

## 10. What R34 says — the mainstream, and where we deliberately differ

| Product | Identity | Progress | Punch cards | Offline |
|---|---|---|---|---|
| **Square Loyalty** | phone number at the register / online / invoice | points only | **none — everything converts to points** | points from offline payments must be **manually linked** after reconnect |
| **Toast Loyalty** | phone **or** email, chosen per restaurant | per **dollar** or per **visit** (owner picks) | visit-based only | not surfaced |
| **PAR Punchh** | account across POS + app + web | points, plus **visit-based cards**; "Offers" is the umbrella for coupon / reward / card / campaign outcome | yes, visit-based | offline+online touchpoints, POS-integrated |
| **Como Sense** | member account | classic punch card (buy 8, 9th free) and custom punch card (%, fixed) | **yes, first-class**, with validity = overlap of a general window and a receipt-relative window | POS-integrated (Revel) |
| **Foodics** (KSA/GCC, closest market analogue) | customer file | points **or punch cards**; reward = discount amount or menu item | yes | not surfaced |

**Copied, and from whom.** Phone number as the enrollment key and the identity — **Square and
Toast**, unanimous, and it is `01-F23` already. Owner picks **spend-based or visit-based** — Toast;
we take visit-based only (`17-F14`), which is the founder's case and the smaller build. Reward as
*free item* **or** *percentage/amount* — Como's classic-vs-custom punch card split, taken verbatim
into `benefit.form`. **Validity as an overlap of windows** — Como; taken as `valid_from/to` on the
campaign intersected with the redemption's own moment. Coupon **checksum for typo detection** —
already `17-F10`, and it is what Punchh/Voucherify do. **"Offers" as one umbrella over coupon,
reward, deal and card** — Punchh; taken as one `campaign` row with a `kind` discriminator rather
than four tables, which is also what keeps the artifact to one resource.

**Refused, with the reason.** *Points currencies, tiers and expiry* — `17 §1` excludes them and
Square's own "everything becomes points" is the shape that then needs a points-expiry policy, a
liability account and a legal footnote; the founder asked for free coffee after ten. *Square's
offline behaviour* — deferring loyalty accrual until reconnect is a commandment-4 breach here, and
`17-F13` already ruled append-and-merge. *Reading the card at the terminal* — IPS Pakistan's model,
closed to us by R60 (§6a).

---

## 11. Sequencing, and what is NOT v0

`plans/v0.md`'s rule: *if a pilot can open tomorrow without it, it is not v0.* **Loyalty is not
v0.** But one slice of this design is load-bearing for something already shipped, and it is small:

- **Now, and independent of everything else:** the `campaign` arm of `canDiscount` plus
  `campaign_id` + `campaign_version` on `discount.recorded`. This is the half of R71 that stops the
  cumulative threshold — once it is built — from making the *second* bank promo on one order
  escalate, which R71 calls the outcome the founder called stupid. It needs no customer link, no
  loyalty fold and no new event type. `plans/v0.md` gap 3 already lists R71's campaigns as an
  env-seeded, unaudited seed alongside the tax cell and the rounding granularity, and `01-F87`'s
  carrier deletes all three together.
- **Blocked on §2's link (doc 02):** account loyalty, `02-F10`'s search by phone, `02-F14`'s khata,
  `02-F27`'s order history and *repeat last order*. Four features, one field.
- **Blocked on the `01-F75` amendment + golden fixture:** any campaign reaching a till as data
  rather than as a seed.
- **Blocked on doc 07 (not live) and out of scope here:** every broadcast FR — `17-F1`..`17-F9`,
  `17-F16`, `17-F18`..`17-F20`, segments, quiet hours, metering, lift. `17 §1` puts this module at
  Wave 4 *"requires docs 06 and 07 live"*, and neither is.

---

## 12. The contract the other three plans consume

**CRM owns the customer model. Everything below is what a dependent plan may ASK FOR, not design.**

- **Loyalty (this doc)** needs: §2's order→customer link. Nothing else. It adds **zero** fields to
  the customer record.
- **Website ordering (doc 06)** already has its answer and must not re-invent one: `06-F11` writes
  `customer.created` on first sight with `name: null`, `06-F9` writes `customer.address_added` with
  a minted `address_id`. Both schemas ship. It needs §2's link for order history, and it must use
  `01-F23`'s E.164 key normalized **at its own writer** — a second normalizer keys one number two
  ways and makes one human two rows, permanently.
- **WhatsApp / Instagram (doc 07)** owns `customer.opted_in` / `customer.opted_out` **solely**
  (`07-F18`); no other module may emit them, and this one consumes the suppression read model
  without writing around it. It needs §2's link for reorder confirms.
- **Anyone wanting a field the customer record does not have** states it here as a dependency. It
  does not add one locally, because `01-F23` is one identity per org and a local field is a second
  model in disguise.

---

## The founder decisions I need

**1. PII: record customers now, or hold until the crypto wrapper ships?**
`22-F26` (b) names this lever and declines to pull it, calling it *"a product call about phone and
delivery orders, and not doc 22's to take."* Loyalty is the feature that multiplies the volume.
**(a) Record now:** loyalty, khata, phone orders and delivery all work at the pilot; every phone,
name and address written before `22-F14`'s envelope encryption ships is **permanently
un-erasable** — `01-F1` makes it so, and the fallback is field-level redaction with hash-chain
carve-outs, the alternative `DEC-DATA-001` exists to avoid. **(b) Hold:** no customer file, so no
loyalty, no khata, no delivery address and no repeat-caller lookup — four shipped surfaces go dark
— and the wrapper is `§9.3`'s open spike, which R38 deferred past the pilot precisely because
nobody has costed it.

**2. Punch cards: bearer cards as a campaign kind, or account loyalty only?**
`17-F15` bans punch cards **by name**; you asked for them by name. **(a) Both:** the coffee shop's
real artifact works, a walk-in who gives no number is served, and it needs no customer record — at
the cost of a mechanism the till **cannot verify at all** (§7) and a narrow amendment to `17-F15`.
**(b) Account only:** every redemption is provable from the ledger and forgery is impossible — at
the cost that the customer must give a phone number at 08:00 to get her tenth coffee, which is the
transaction the printed card exists to avoid, and the module then serves phone-order customers and
almost nobody else.

**3. If bearer cards ship: serialized or plain?**
**(a) Serialized** (a printed number the cashier keys): a duplicate serial is a detectable anomaly
at merge, exactly `17-F13`'s coupon shape, and the day's rows are reconcilable card-by-card — at
the cost of variable-data printing and ~6 keystrokes inside a workflow `02-F28` measures in
30 seconds. **(b) Plain** (what coffee shops actually print today): free, instant, and a photocopy
is **indistinguishable from the real thing forever**; the only control is the physical card in the
drawer and the statistical report in §7.

**4. The order→customer link: one new event type, or an optional field on `order.created`?**
**(a) `order.customer_linked`** (§2 Shape B): works at any point in an order's life, so `02-F14`'s
khata-after-eating and `17-F17`'s mid-order redemption both work — at the cost of an `01 §4`
catalog act plus a protected-path schema and review. **(b) `order.created.customer_phone_e164?`**:
additive, free, no new type, reviewable in an afternoon — at the cost that the link can **only** be
made at order creation, which satisfies `02-F27`'s phone path and neither of the two FRs that
asked for the field; adding the late case later means doing (a) anyway, on top.

**5. Bank-card promos: attested card tier now, or discretionary discount until the tender axis is
settled?**
**(a) Attest now:** the cashier picks *"Visa Signature"* from a campaign's list and the discount is
campaign-attributed, capped and reconcilable — at the cost of minting an **issuer × product-tier**
axis that exists nowhere in the corpus (R60 keys commission on the *acquirer*, a different bank),
pre-empting `02 §9.6` which says it *"must be settled before the layer-2 surface is built"*, and a
wrong guess is a config migration across live orgs. **(b) Defer:** a bank promo is a discretionary
discount with a typed reason. Measured against R71's own numbers this mostly still works without a
manager PIN — 50% of a bill is exactly at a 50% threshold, and `canDiscount` reads `≤` as within —
so the workflow survives; what is lost is the **cap** (nothing enforces Rs 10,000), the
**attribution** (no way to reconcile against the bank), and the **control** (the same tap gives 50%
to anyone).

**6. Does the bank reimburse the discount?**
Not publicly documented for Pakistan — SBP fixes MDR at 1.5–2.5% and caps debit IRF at 0.5%, and
who bears a promotional discount is per bank–merchant agreement. It changes the money model, so it
is a question about your market rather than about software. **(a) The restaurant bears it:** a
campaign discount is a discount, `01-F30` subtracts it, and this design is complete as written.
**(b) The bank reimburses:** the discount is simultaneously a **receivable**, which needs a
settlement method on `01-F85`'s owner-extended set (the shape `aggregator_receivable` already has),
a reconciliation against the bank's own settlement file, and a doc-01 conservation clause — a
materially larger build that must be known **before** the first campaign is recorded, because
`01-F1` makes the first thousand rows permanent.

**7. Consent capture at the counter — now, or when doc 07 lands?**
`07-F18` owns `customer.opted_in` / `customer.opted_out` **solely** and doc 07 is not live.
**(a) Capture now:** the pilot's customer file is messageable the day WhatsApp ships — at the cost
of an act on the 30-second counter path (`02-F28`) and this module emitting a family it does not
own, which `07-F18` forbids in terms, so it needs doc 07's amendment first. **(b) Capture later:**
zero cost today and the pilot's entire accumulated customer file is **un-messageable**, because
`17-F5` makes opt-in the precondition with no override and no exception path in code — every one of
those customers must be re-asked in person.
