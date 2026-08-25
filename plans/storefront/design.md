# Storefront — online ordering on the restaurant's own website

**Status:** design, not approved. No code, no spec edit, nothing staged.
**Authority:** `restaurant-os.md` §8 (waves) → `specs/00-platform-overview.md` §5–§7 → `specs/01-kernel-sync.md` (ledger, envelope, scope, reference data) → `specs/06-storefront.md` (29 FRs, the contract) → `specs/02-pos-app.md` (`02-F9` inbox, `02-F42` channel, `02-F58` tender channel) → `specs/09-rider-dispatch.md` → `specs/28-tenancy.md` → this document.
**Rulings applied:** **R34** (*follow the mainstream, steal like an artist*) — every structural choice below names the product it is taken from. **R1** (storefront follows the service floor) — this is a design for when it is sequenced, not a claim that it is next. **R5** (take-rate dropped) — which deletes an FR, see §0.4.

---

## 0. Measured starting point

All measurements taken **2026-08-24** on `1beafcf`, with `grep -a`, comment-blind where a count is claimed.

**0.1 The module.** `apps/storefront` is `package.json` + `CLAUDE.md` + `src/index.ts`, whose entire content is `export {};`. Two lines. Nothing to preserve, nothing to migrate.

**0.2 What already exists and must not be rebuilt.**

| Thing | Measured state |
|---|---|
| `storefront` as a price key | **Real.** `ORDER_CHANNELS` (`packages/domain/src/registry.ts:40`) is `counter · phone · storefront · whatsapp · foodpanda`, closed, and `order.created.channel` is required. `services/api/src/catalog.ts:224` iterates `enabled.channels` when building the price grid, so an owner can already type a storefront price per branch. ⚠ The enabled set is one **process-wide env value** (`ENABLED_CHANNELS` on `services/api`), not a per-org record — `28-F20`'s measured gap, inherited not created here. |
| `02-F9`'s inbox — **Accept** | **Ships.** `OrdersSurface.tsx` renders the inbox first on the Orders tab, keyed on `isCloudInbox` = `channel ∈ {storefront, whatsapp} ∧ confirmed_at === null`; `apps/pos-electron/src/renderer/Counter.tsx:2255` wires `onAccept`. The membership predicate already names our channel. |
| `02-F9`'s inbox — **Reject** | **Does not exist.** ⚠ **The brief is wrong here and so is `01-F84`.** Both say `order.rejected` has a producer. A repo-wide `grep -a '"order.rejected"'` over `apps/`, `services/`, `packages/` returns the schema declaration (`packages/domain/src/registry.ts:233`), the fold's inert case (`packages/sync-client/src/folds/merge.ts:930`) and test files — **zero production emitters**. `apps/pos-electron/src/renderer/OrdersSurface.tsx:17` says so in shipped prose: *"No Reject control is drawn, because a control that cannot succeed is worse than an absent one."* That comment's stated blocker (no payload schema) **has since cleared**; the control was never added. So `02-F9`'s till half is **half** there. |
| `order.rejected` schema | **Exists.** `{ order_id, reason }` (`packages/domain/src/registry.ts:233`), `reason` a closed 3-member `ORDER_REJECTION_REASONS` = `closed · item_unavailable · out_of_delivery_range`, transcribed from `06-F20`. |
| `order.cancelled` schema | **Absent.** `payloadSchemas` holds **41** keys (34 business + 7 `audit.*`) and this is not one, so `01-F4` makes it *unemittable*, not merely unbuilt. `01-F84` rules the payload (`{order_id, reason}`, reason open free text) — **spec-closed, code-owed**. |
| `customer.*` | **Two schemas, no surface.** `customer.created {phone_e164, name│null}` and `customer.address_added {phone_e164, address_id, address_text}`. `customer.phone_verified` is **deliberately unregistered** (`packages/domain/src/registry.ts:936`) — so `06-F12`'s OTP event is unemittable today, by decision. |
| `metering.usage_recorded` | **Absent, and should stay absent.** R5 drops the take-rate: *"flat subscription only, no metering build."* **`06-F22` is superseded** and is cut from this plan (§8.3). |
| Phone normalisation | `apps/pos-electron/src/main/customer-phone.ts`, 73 lines, `03XXXXXXXXX → +92…`. Its own header says the normaliser should move to `packages/domain` *"when a second writer lands"* and names `06-F11`'s storefront as that writer. **We are the trigger.** |
| Cloud branch stream | **Exists.** `kernel.events` in the gateway's Postgres, written by the merge path from device pushes. A cloud read model for the status page has a source. |
| Branch liveness | **Does not exist.** `services/sync-gateway/src/registry.ts:151` refuses to invent a `last_seen` and says so: *"no heartbeat table exists."* `06-F18`'s 120 s staleness threshold has **no data source**. The one honest liveness fact that ships is the gateway's in-process **live-session registry** (`services/sync-gateway/src/gateway.ts:1454` fans a notice to an org's sessions; revocation drops them) — "is a till of this branch connected right now", which is a better signal than a stamped timestamp and is per-process. |

**0.3 The hard gates any design here must pass.**

- `PUBLIC_PROCEDURES` on `services/api` = **`{ "auth.login" }`**, and `assertEveryProcedureIsGated` (`services/api/src/router.ts:271`) **refuses to boot** a host carrying an ungated procedure. `services/api/src/__acceptance__/signup-admission.test.ts` is a deliberate tripwire against widening that set.
- `DEVICE_CLASSES` = **6** (`counter_electron · counter_rn · kitchen · manager · waiter · rider`) and `registerDevice` (`services/sync-gateway/src/registry.ts:82`) refuses anything else with a `01-F39` message. (⚠ **This gate was CLEARED by the work this document designed** — `01-F39` gained `storefront_cloud` in August 2026 and `DEVICE_CLASSES` is **7**; §2 row 2 is the ✔. Kept as the design-time measurement it was, marked because it is written in the present tense.)
- `TIME_BASES` = **`branch · branch_provisional`**; `packages/domain/src/envelope.ts:29`: *"`server` is NOT one of these — a device cannot know server time at append."*
- `MESSAGE_KINDS` = **16** literals (`05-F28` still calls it *"a closed 14-member vocabulary"* — stale by the two `reference_*` additions).
- `ROLES` = **4** (`cashier · branch_manager · storekeeper · owner`). A customer is not one and must never become one.
- `packages/sync-client/src/folds/merge.ts:930`: `order.rejected` is consumed and **projection-inert** — *"a rejected order goes on appearing in every till's `open_orders`"* — and the comment states why that is undecided rather than unbuilt: **`01 §4`'s canonical order states carry no `rejected` at all; its exit states are `voided / cancelled`.**

**0.4 What R5 and `05-F32` delete from doc 06 before we start.** `06-F22` (metering) is dead under R5. `06-F16`'s card gateway stays interface-only. `06-F17a`'s auto-accept survives but is now the *mainstream default* rather than the exception (§1). Nothing else in doc 06 is superseded, and this plan does not narrow an FR without saying so.

---

## 1. What we copy, and from whom (R34)

The mainstream converges hard here, and the convergence is the argument. Nine structural choices, each with the product it is taken from and the alternative rejected.

| Choice | Copied from | Rejected, and why |
|---|---|---|
| **Orders land in a queue on the POS, not in an email or a separate tablet** | **Toast Orders Hub** — online orders *"land in Orders Hub for review before they fire to the kitchen"*; **Square Online** — *"incoming orders will be sent directly to the Orders tab."* | A dedicated storefront tablet — foodpanda's own model, which `08-F11` already refuses to promise away. A second screen on the counter is the re-keying we exist to delete. |
| **Two acceptance modes, org-configurable, per channel** | **Toast**: *"Approve manually"* vs *"Send orders directly to the kitchen"*. **Otter**: auto- vs manual-accept **set per channel** — *"auto-accept for direct website orders while using manual accept for delivery platforms."* | A single hard-coded policy. `06-F17a` already specifies exactly this pair; the industry's per-channel split is the reason it is a setting and not a ruling. |
| **Manual accept is the launch DEFAULT, auto-accept is the setting** | Inverts Otter's recommendation deliberately — see §3.4. Otter's own reason for auto-accept is *"missed tickets… a tablet went to sleep"*; ours is that a COD order from an unverified phone is a real cost and `02-F9`'s accept is the only human gate we have (§4.2). | Auto-accept by default. The industry consensus is right for a card-prepaid market and wrong for a COD one — the failure mode changes from *a missed ticket* to *a delivered order nobody ordered*. |
| **KOT prints only after acceptance, never before** | **Toast** (auto-firing is a per-device setting, orders fire *when a device is configured to*), **Square** (routes to the kitchen printer after the POS has the order). | Nothing to reject — `02-F9` and `03` already say it. Named so the auto-accept setting is not read as *"print on arrival."* |
| **A truthful five-state customer status page** | **Toast Orders Hub's five statuses** — Needs Approval · Scheduled · Active · Order Ready · Completed. | An ETA countdown before the restaurant has acknowledged the order. `06-F17`'s ladder already refuses it and Toast's own first status is *Needs Approval*, i.e. the giant does not claim confirmation either. |
| **A pickup CODE matched at handover, not a name shouted** | **Toast**'s *Order Ready* text; the code on both the status page and the KOT (`06-F8`). | Name-calling at a counter. Free to build, removes a class of wrong-bag handover. |
| **OTP on the phone number before a first COD order** | **Petpooja / DotPe** — *"a quick OTP confirms it, with the order landing in the kitchen through Petpooja POS"*; the Shopify ecosystem's whole *"OTP — CoD Order Verification"* app category exists for South-Asian COD abuse. | Western products (Toast, Square, ChowNow) do **not** OTP, because the card is the verification. Copying them here copies a control we do not have. ⚠ We cannot build OTP in slice 1 (§4.2) — this row records what the mainstream does, and §8 records what we ship instead. |
| **Bank-transfer-with-reference as a first-class prepaid method** | **Raast P2M**, which is now real infrastructure, not a plan: SBP reports **2.6 m merchants onboarded on Raast P2M by Q3 FY26** and P2M transactions moving **36.3 m → 55.9 m in a single quarter**; QR merchant payments **87.3 m transactions, +41% QoQ**. Every Pakistani bank was required to support Read/Scan Raast QR, Request-to-Pay and push-to-alias by **March 2024**. | A card gateway at launch. `06-F16` already defers it; §4.3 states what it would actually cost, which is not engineering. |
| **The restaurant's own branding on the customer surface, the instrument fixed everywhere else** | **Square Online / Toast Online Ordering**, both per-merchant themed. | Nothing — `27-F76` (c) already carves customer surfaces out by name and points at `18 §7`. Recorded so nobody re-litigates it. |

**One thing we deliberately do not copy: aggregation.** ChowNow/Otter's headline feature is consolidating Uber Eats + DoorDash + web into one feed. Doc 08 owns aggregators here and `08-F11` already rules the foodpanda tablet stays. The storefront is one door, not a hub.

---

## 2. Which plane — the wall, and the way through it

This is the first question, not the last, and it decides everything else in this document.

**2.1 The wall, stated precisely.** `01-F62` requires `branch_id`, `branch_created_at` and `time_basis` on every branch-scoped envelope, *"stamped at append by an originating **device**"*, and fixes the org-scoped set at five types (`catalog.changed`, `device.registered/revoked`, `user.changed`, `config.changed`). `order.created` is not one of them and cannot be — its legitimate emitters include every till in the country, so it fails `01-F62`'s own discriminant (*"org-scoped when its only legitimate emitter is the cloud plane"*). A customer's browser is not a device, holds no `01-F47` token, has no branch clock and has no `actor_user_id`. **A browser cannot append.** This is the same wall `05-F28` measured for the manager console.

**2.2 Doc 06 already picked an answer, and it was written before the wall existed.** `06 §8`: *"customers are not kernel devices — the storefront service holds a single cloud device identity per `00 §6` envelope and emits on customers' behalf."* Doc 06 is Draft 1, **July 2026**; `01-F62` is **August 2026**. That tech note is not marked as affected and **is in tension with the FR that now governs it** — not fatally (see 2.3), but the tension is unrecorded and this document is the first place it is written down. It is also under-specified in three ways the wall makes load-bearing: *"a single cloud device identity"* (one per platform? per org? per branch? — the envelope needs a `branch_id`), no device class (`DEVICE_CLASSES` refuses one), and no answer for `branch_created_at`.

**2.3 Three resolutions. This plan recommends (A).**

**(A) A cloud storefront ORIGIN — the storefront service is a registered device, one per (org, branch), and appends `order.created` itself.**

- *What it needs.* (i) A **seventh `DEVICE_CLASSES` member** — a doc-01 act on `01-F39`, because `registerDevice` refuses anything else. (ii) A doc-01 clause sanctioning a **permanently `branch_provisional`** origin: `01-F43` frames offset-0 as the transient state of a device *"with no hub contact yet"*, and a cloud origin never acquires an offset. (iii) Per-(org, branch) durable `lamport_seq` counters and an outbox in the storefront's own Postgres — `packages/sync-client`'s store is SQLite-shaped, so this is a second, small implementation of the push half, not a reuse.
- *Why the clock objection does not bite.* `01-F45`'s basis precedence already **demotes** `branch_provisional` stamps below `branch` ones wherever a fold selects among time-carrying members, and every duration this product computes anchors on `order.confirmed` (`03-F25`), which the **till** emits with `branch` basis. So the cloud origin never supplies a value any timer reads. It is a marked-provisional stamp doing exactly what the marker was invented for.
- *Why it is not `05-F29`'s rejected option (b).* That option amended `01-F62` so a **cloud user's** decision had an envelope, dissolving the scope test. This amends nothing in `01-F62`: the event stays branch-scoped and is emitted **by a device**, which happens to live in a data centre. The discriminant survives intact — ask *"could a device legitimately emit this?"* and the answer for `order.created` was always yes.
- *The measured argument that decides it.* **The shipped counter already presumes (A).** `isCloudInbox` reads candidates out of `store.openOrders()` — the till's fold of its **branch stream**. An order can only appear there if it is already in that stream. `02-F9`'s inbox as built cannot see an order that lives only in a cloud table. And `00 §5.1` says it in the platform's own words: *"cloud-originated orders **queue for the branch and enter** the moment connectivity returns."*
- *What (A) buys.* Every one of doc 06's lifecycle FRs becomes a ledger act exactly as written: `06-F19` cancel, `06-F20` reject, `06-F27` auto-close, and — the one the brief flags — **the storefront becomes `order.cancelled`'s named producer**, closing the half `01-F84` left owed.
- *What (A) costs, stated.* A branch's ledger acquires an origin the branch cannot see, power-cycle or walk to. `01-F64`'s store binding, `01-F66`'s single-instance lock and `01-F72`'s LAN PKI are all device-shaped protections that do not apply to it, so it needs its own: one writer process per (org, branch) or a Postgres advisory lock, since two storefront processes sharing a lamport counter is `01-F66` in a data centre.

**(B) Till-originated — the cloud holds a pending queue outside the ledger; the cashier's accept appends `order.created` + lines + `order.confirmed` in one act.**

- *Attraction.* Zero kernel change. It is `05-F32`'s shape (*the console renders, the till decides*) applied to orders, and it is honest: the branch takes the order.
- *Cost 1, and it is decisive.* **`order.cancelled` and `order.rejected` lose their producers again.** A customer cancelling before accept cancels something that was never in the ledger, so there is nothing to cancel; a reject names an `order_id` with no `order.created`, which `26 §3`'s sidecar keys on and no projection can hold. The brief's own hope — *"you may be the reason `order.cancelled` becomes emittable"* — dies under (B).
- *Cost 2.* A new `packages/sync-protocol` kind (17th) to carry the pending queue down, or a fourth `01-F75` reference resource — and reference resources are **versioned, signed artifacts** (`01-F76`, `01-F81`), which a mutable per-instance order queue is not. So: a new kind, which `05-F28` already prices as a real cost.
- *Cost 3.* `02-F9`'s inbox is rebuilt to read a non-fold source, and the arrival-count badge, the aging escalation and `02-F51`'s recall all stop sharing one projection.

**(C) Amend `01-F62`.** Rejected on `05-F29` (b)'s reasoning verbatim: the FR's discriminant *is* "scope follows emitter", so letting the cloud emit branch-scoped events leaves the test with no content and turns every later *"can the server just write it?"* (doc 08 ingest, doc 09, doc 13, doc 16) into a judgement call.

**2.4 Where the code lives, and the plane the two-plane law does not have.**

`18 §6` puts the storefront on the **cloud plane** and says *"TanStack Query v5 + tRPC client is the only data layer."* That collides with a hard gate: `services/api` hosts exactly one public procedure and a boot assertion plus a tripwire test defend the number. **A public customer surface is neither of commandment 5's two planes** — the local plane has a device and the cloud plane has an authenticated subject; a customer has neither. Naming this is half the work.

Proposal: **a separate service, `services/storefront`, with its own tRPC router and its own boot assertion.** It keeps `18 §6`'s data layer, keeps `services/api`'s public set at one, and gets a gate that is *not* `can()`:

> **Every storefront procedure declares the capability it is gated on, and the server refuses to boot otherwise** — the same shape as `assertEveryProcedureIsGated`, with `entitled(org, capability)` in place of `can(role, action)`.

That is not an invention: `28-F4` rules entitlement *"composes **with** `can()`; it is not an action in `PERMISSION_ACTIONS`"*, and `28-F6` puts a **storefront flag** in the entitlement record while warning that the gate must land **with its first capability consumer, never before**. The storefront is that consumer. So commandment 8 is satisfied without minting a permission action (which `14-F30` makes a doc-14 spec act) and without a `customer` role. The org is resolved from the **host** (`06-F1`), so unlike `28-F4`'s login there *is* a subject org and entitlement is structurally possible.

`apps/storefront` stays the Next.js app: rendering, theme, cart. It talks to `services/storefront` and to nothing else.

---

## 3. The confirm policy — the model

**3.1 The ladder.** Three planes hold three different facts and the customer is told which one she is looking at. This is `06-F17` unchanged; what is new is naming the writer of each edge.

| Customer sees | The fact underneath | Who writes it | Ships? |
|---|---|---|---|
| **received** | `order.created` is in the ledger, cloud-side. It claims nothing about the branch. | storefront origin (A) | needs (A) |
| **queued — not seen yet** | no till of this branch holds a live session (`06-F18`) | derived, no event | needs a liveness source (§0.2) |
| **confirmed** | `order.confirmed` | the till, `02-F9` Accept | **ships** |
| **preparing** | first `kot.printed` or any line `in_prep` — a **display label, not a state** (`06-F17`) | till / pass | ships |
| **ready** | all lines ready | `apps/pass-kds` DONE | ships |
| **rejected** | `order.rejected` + closed reason | the till, `02-F9` Reject | **owed** (§0.2) |
| **cancelled by you** | `order.cancelled`, `actor_user_id` = null | storefront origin, on the customer's tap (`06-F19`) | schema owed (`01-F84`) |
| **closed — nobody accepted it** | `order.cancelled`, `actor_user_id` = null, reason states the window | storefront origin, on the `06-F20` timer (`06-F27`) | schema owed |
| **dispatched / delivered** | `rider.picked_up` / `rider.delivered` | doc 09 — **unbuilt** | §5 |

**3.2 `actor_user_id: null` is the honest answer twice over, and `01-F84` already blessed it** — *"which also covers `06-F27`'s auto-close, where there is no human and `null` is the honest answer rather than a gap."* A customer is not a user; inventing a synthetic one would put a fictional person on a permanent record (`01-F1`) and would be `02-F41`'s attribution hole wearing a service account.

**3.3 The three races, and what the ledger records.**

- **Customer cancels while the cashier accepts.** Both events land; neither is lost (`01-F1`, `01-F20`). `01-F35`'s terminal-state monotonicity resolves it *if* the fold knows `cancelled` is terminal — and today the fold knows nothing: `order.cancelled` has no schema and `order.rejected` is projection-inert. **A merge rule is owed**, and `26 §7` makes that an oracle-pinned decision, not an implementer's. The till surface must therefore assume it can be told *"this order was cancelled after you accepted it"* and show that plainly; the food may already be cooking, which is `06-F19`'s phone-call clause arriving from the other direction.
- **`order.rejected` has no state to land on.** `01 §4`'s canonical vocabulary has exit states `voided / cancelled` and no `rejected`. Two ways out and both are spec acts: fold `rejected` onto **`cancelled`** (an existing state, the event still records *why* and *by whom*), or **add `rejected`** to `01 §4` (commandment 2 says a state lives there or nowhere). Founder decision 3.
- **An item is 86'd between placement and accept.** `06-F27` routes it through `02-F9`'s line-resolution path, and `02-F9` is explicit that removing the line is *"the only partial-confirmation mechanism."* Post-`02-F49` that removal is pre-confirm, so it is a plain `order.line_removed` with no approver — correct, and it means the accept surface needs a per-line remove control it does not have today.

**3.4 Auto-accept: specified, and OFF at launch.** `06-F17a` permits it and `06-F27` already suspends it while the branch is sync-stale or over the unconfirmed cap. We build the setting and ship it **off**, against the industry default (Otter, Toast), for one reason: in a card-prepaid market an unattended accept costs a missed ticket, and in a COD market it costs a cooked and delivered order that nobody ordered. With no OTP (§4.2) the cashier's accept is the **only** human gate in the system. Founder decision 5.

**3.5 Backpressure.** `06-F27`'s per-branch cap on unconfirmed orders (default 10) is cheap and should ship in slice 1 — it is a `count(*)` on the cloud read model, and it is the only thing standing between a Friday rush and a queue nobody can work through. `06-F23`'s rate limits (per-IP; per-phone ≤ 5 orders/hour) ride Redis, which is already on `18 §14`'s allowlist via `services/jobs`, so no `18 §15` event.

---

## 4. Payment — COD, a bank reference, and what prepaid actually costs

**4.1 The market fact, measured.** Pakistani e-commerce runs on **60–70% cash on delivery** — the figure reported through 2025–26 by Business Recorder and Startup.pk, both writing about the same gap between SBP's rails and merchant behaviour, against a digital rail that is genuinely arriving: Raast P2M at **2.6 m onboarded merchants** and **55.9 m transactions in Q3 FY26**, QR merchant payments **+41% QoQ**. So the answer is **both, in this order**: COD is the default and always available; a bank-reference prepay is offered beside it and will matter more every quarter.

**4.2 COD / cash-at-counter — free.** It requires **nothing new in the money path.** The storefront records no payment. The customer pays the cashier (pickup) or the rider (delivery), and the branch emits `payment.recorded` with `method: cash` at settlement — `PAYMENT_METHODS` already carries it and `R55` makes the tender set org-extensible anyway. `06-F15` states this rule and it is the right one: *"the storefront never asserts payment success it cannot verify."*

The abuse exposure is real and it lands entirely on `06-F12`'s OTP — **which we cannot build.** `customer.phone_verified` is deliberately unregistered (`packages/domain/src/registry.ts:936`, on `DEC-CUST-001` being *proposed*), `services/whatsapp` is a stub, and no `SmsProvider` exists anywhere in the tree. So slice 1 has three defences instead, and they should be stated to the founder as a package rather than discovered: (i) `06-F23`'s per-phone and per-IP rate limits; (ii) **manual accept** (§3.4) — a fake order costs one tap to reject, not one delivery; (iii) `06-F24`'s `cod_blocked` flag on the customer file, set from the POS after a no-show. `06-F24`'s first-order COD cap is layer-2 and cheap. Founder decision 4.

**4.3 RAAST / bank transfer with a reference — cheap, and now more real than when `06-F15` was written.** The branch's Raast alias, IBAN and QR are layer-2 config (`06 §7` already lists them). The storefront shows them, the customer transfers in her own banking app and types the reference string, and the order carries a storefront-side `payment_intent { method, reference }` — **not a ledger event**, exactly as `06-F15` says. The manager verifies against the bank statement and emits `payment.recorded` with `method: raast` at settlement. Zero kernel work; one config screen; one field on the checkout.

⚠ **What it does not give you: automatic verification.** Raast's Request-to-Pay would, and RTP is a bank/PSP capability, not a merchant one — which is exactly `06 §9` Q6, unchanged and still correctly open.

**4.4 Prepaid by card is not an engineering task.** `06-F16` fixes the `PaymentGatewayProvider` interface and defers the implementation, and the deferral is right for reasons no sprint can close:

- **Who holds the money.** If a restaurant's own PSP account receives it, we need per-tenant merchant onboarding (KYC, settlement account, chargeback liability) as part of `14-F26`'s branch wizard, and the storefront needs per-org gateway credentials. If **RestOS** receives it and pays out, RestOS is operating as a payment aggregator — a licensed posture, a float, a payout ledger and a tax position. That is a **company** decision (founder decision 6).
- **The two-writers problem, again.** A gateway webhook asserting payment cloud-side and a branch emitting `payment.recorded` are two writers of one money fact — this corpus's most-repeated defect, on the money path, under `01-F1`. Any card design must name which one the ledger believes **before** any code.
- **`02-F58` bites.** The tender channel carries the tax rate (R55) and is chosen *before* the bill prints. A card prepay fixes the tender channel at checkout, which is fine — but it means the storefront must compute a tax-inclusive total, and that lands in §4.5.

**4.5 The total the customer sees — one computation, or an honest subtotal.** `02-F58` puts tax inside `billed_total`, keyed on the **tender channel**, chosen before the unpaid bill prints. On the storefront the customer picks cash-vs-transfer at checkout, so the choice naturally arrives early — the FR's move works in our favour. The hazard is that the **cloud** would then compute a number the **till** also computes: two implementations of one money fact.

The answer is one implementation and one source: `packages/domain/src/tax.ts` (`taxSnapshot`, `TAX_POSTURES`) is pure and already a dependency of `services/api`, and the rate reaches devices as `01-F87`'s **fourth `01-F75` reference resource**. The storefront reads the same artifact by the same version key (`01-F76`) and calls the same function.

⚠ **Hard dependency: that carrier does not exist yet.** `plans/v0.md` gap 3 records the tax cell as env-seeded per device and unaudited; `01-F87` is spec-closed and nothing is built. Until it lands the storefront can honestly display **subtotal + delivery fee** and state that tax is added on the bill — acceptable for pickup, **not** acceptable for delivery, where the customer must know the number before the rider knocks. Founder decision 7.

---

## 5. Delivery — what a storefront can ship with doc 09 unbuilt

**5.1 What doc 09 actually gates.** It owns the rider *entity*, dispatch, and COD settlement against a rider. It is entirely unbuilt: `apps/rider` is a stub, and `ROLES` has no `rider` member, so `09-F1`'s *"a rider is a user with role `rider`"* is not merely unimplemented — it is unexpressible. `01 §4` is stricter still: the delivery terminal path `picked_up → delivered` is **"rider-driven only — never advanced by payment/settlement"**, so with no rider, a delivery order **cannot reach a terminal service state at all.**

**5.2 So there are exactly three honest slices, and the difference between them is what the status page may say.**

| Slice | What the customer gets | Cost |
|---|---|---|
| **Pickup only** | complete, truthful lifecycle to `ready` + a pickup code; nothing is degraded | a Pakistani restaurant's delivery volume is the majority of its off-premise trade. We ship an online ordering product that does not do the main thing. |
| **Pickup + delivery, no tracking** (recommended) | `received → confirmed → preparing → **ready**` and then the page says, plainly, *"on its way — we can't track it; call the branch"* with the number. COD collected at the door, settled at the counter when the boy returns, via `02-F51` recall + cash tender. | The order sits at `ready` in the branch's own queue **for ever** — nothing emits `served`, nothing emits `rider.*`. The pass queue accumulates finished delivery orders and no fold can clear them. That is a real operational wart and it must be shown to the founder as one, not discovered by a cook. |
| **Delivery with dispatch** | the full `06-F17` ladder | doc 09: a role, a device class, an app, four event schemas (`rider.*` has **none** registered), and settlement. Not a slice — a module. |

**5.3 The two things delivery needs that are not doc 09's and must be built here.** (i) An **address** on the order — `customer.address_added` ships as a schema and the storefront is its first writer (`06-F9`); the rider reads it (`09-F10`) but nothing joins an order to an address today, which is the same missing link `plans/inventory/design.md` records for the customer file (row 2 of its §1 table): **`order.created` is `{order_id, channel, order_type?, table_id?}` and cannot name a customer.** That link is doc 02's act, it is already owed, and delivery cannot ship without it. (ii) A **delivery fee and minimum order value** per branch — layer-2 config, shown before checkout (`06-F9`). A fee is a money line on the bill and there is no line type for it; the cheap answer is a catalog entry priced per `(branch, storefront)` like anything else, which `01-F60` already supports and which keeps the fee inside `billed_total` with no kernel change.

Founder decision 2.

---

## 6. What we need from the CRM plan (we design nothing)

Stated as requirements on `plans/crm-loyalty/`, not as a model here. The OTP *sender* is `plans/messaging/`'s (doc 07), not the CRM plan's — two different dependencies that both land on `06-F12`.

1. **The key.** `01-F23`'s E.164 phone, and the **normaliser** must move to `packages/domain` — `customer-phone.ts`'s own header says it moves *"when a second writer lands"* and names `06-F11` as the writer. If it does not move, one human becomes two customer files across two writers, permanently (`01-F1`).
2. **Guest-first identity.** A storefront customer supplies a phone and a name and nothing else. `customer.created`'s `name` is already `required-and-nullable` for exactly this case.
3. **An order→customer link.** Not ours to invent, and **nothing can name a customer on an order today.** `02-F10` (search open orders by customer phone) and `02-F14` (khata requires a linked customer) already presuppose it. Delivery is unbuildable without it.
4. **A verification state, and its event.** `customer.phone_verified` is unregistered by decision. If the CRM plan does not register it, `06-F12` stays unbuildable and slice 1's OTP stays cut.
5. **Saved addresses**, keyed by phone, with `address_id` a minted business key — the schema already says this.
6. **`cod_blocked`** as a customer-file flag set from the POS (`06-F24`). It has no home in any schema today.
7. **PII posture.** Phone, name, street address, from an unauthenticated public form. `DEC-DATA-001` (crypto-shredding) is *proposed*; doc 22 owns erasure. We introduce no mechanism and no new store beyond what CRM decides.

**We need one thing the CRM plan may not think to provide: a customer record created by a surface with no logged-in user.** Every existing `customer.*` writer is a cashier at a till with a PIN session. Ours has `actor_user_id: null`. If the CRM model assumes an actor, it will not fit.

---

## 7. Identity, theme and the customer law

`27-F76` (c) carves customer surfaces out by name and points at `18 §7`'s per-org theme layer; `06-F29` (a founder ruling, July 2026) puts the customer law in docs 06 and 07 rather than under `21 §5`, because a customer is *"untrained, one-time, on their own unknown phone."* So:

- **Theme = CSS variables from org branding config** (logo, one accent colour, photos), light/dark, Tailwind, **no shadcn in the customer bundle** (`18 §7`). Tokens still come from `packages/ui`'s token export — the customer bundle consumes tokens, not components, so **commandment 6's closed vocabulary does not import RN/Electron components into a phone browser.**
- **What carries across from the staff law, per `06-F29`:** `27-F22`/`27-F23` (Western digits, `Rs` symbol-first, no operational decimals) and `27-F24` (nobody does mental arithmetic — the delivery fee, the minimum shortfall and the total are all computed and shown). Touch targets follow `27-F8`'s **handheld row, 64 dp / 10.2 mm, as a FLOOR not a target**.
- **`06-F3`/`00 §5.6`: English-only UI, Unicode user content.** An Urdu customer name and an Urdu address must round-trip the form, the ledger, the status page and the rider's screen. ⚠ **They must not reach the KOT.** `03-F8`'s ruling rests on the premise that *"no Wave-1 input path can put non-Latin text on a ticket"*, and `02-F50` records what breaks it: the encoder hard-refuses (`raster_font_unavailable`) and **the whole ticket is lost — the sale completes and the food is never cooked.** The storefront is the first input path in this product that can produce Urdu at scale. Slice 1 therefore prints **no customer-supplied free text** on the KOT: the pickup code and the item lines only, with the name and address on the counter screen and on the (Latin-safe) receipt path. This is a constraint discovered here, and it is the single most likely way a storefront build silently stops a kitchen.
- **`06-F25`** (per-org OpenGraph/share preview, menu indexed, cart/checkout/status not) is small and matters — every one of these links is pasted into WhatsApp.
- **`06-N1`**: menu LCP < 2.5 s on mid-range Android over 4G, < 200 KB gzipped for menu + cart. That budget is the reason the theme is CSS variables and not a component library.

---

## 8. Scope — the smallest useful slice

**8.1 Slice 1 — "the menu is online, and orders reach the till."** One org, one branch, pickup, COD, manual accept.

1. Host → org resolution (`06-F1`), neutral 404 on an unknown host. Subdomain only; custom domains deferred.
2. Menu rendered from the published catalog artifact at the storefront price cell (`01-F60`, `(branch, storefront)`), ISR-cached on `(org, branch, catalog_version)` per `06 §8`; `availability.changed` overlaid live from the cloud branch stream (`06-F5`).
3. Cart (client-only, Zustand per `18 §6`), prices captured at add-to-cart (`06-F6`, `01-F18`).
4. Checkout: name + phone (normalised by the moved `packages/domain` normaliser), pickup, cash at counter. **No OTP** (§4.2).
5. `services/storefront` appends `order.created` + `order.line_added × n` as the (A) origin, with the captured prices written verbatim — **the till never re-resolves them** (`01-F53`).
6. `02-F9` inbox: Accept ships. **Build Reject** — the reason picker over the closed 3-member set, the append, and the merge disposition (§3.3, decision 3).
7. Status page: cloud read model over `kernel.events`, polled (SSE later, `06-F21`), states per §3.1, `06-F18` honesty from the live-session registry, `06-F27` cap and auto-close.
8. Customer cancel before confirm → `order.cancelled` (schema owed).
9. Settlement unchanged: cashier recalls the order (`02-F51`) and tenders cash.

**8.2 Slice 2.** Delivery (address, fee, minimum, the order→customer link), RAAST reference prepay, `06-F24`'s COD flag and cap, multi-branch selection (`06-F2`), OTP if doc 07 has landed.

**8.3 Explicitly cut, with the reason.** `06-F22` metering — **dead under R5**. `06-F16` card gateway — decision 6. `06-F7`/`06-F28` QR dine-in — it needs table QR generation in doc 14 *and* a settlement-handoff policy, and it is the mode a pilot needs least. `06-F14` WhatsApp handoff tokens — doc 07 is a stub. Custom domains + TLS provisioning — doc 15. `06-F9`'s polygon zones — `06 §9` Q1 already defers them. Scheduled/future orders — no FR anywhere; do not invent one (commandment 2).

**8.4 What slice 1 makes true that is not true today, beyond the storefront.** `order.cancelled` gets its first producer (`01-F84`'s owed half). `order.rejected` stops being a producer-less schema and gets its consumer in the same slice — which is R57's recorded cost being paid off rather than deepened. `28-F6`'s entitlement gate lands **with** its first capability consumer, which is the only way that FR permits it to land.

---

## 9. Spec acts owed before code

Nothing below is a gap this plan fills with plausible behaviour; each is an act on the owning doc, in the order it is needed. **Five of the eleven are on protected paths** (commandment 10 — `domain`, `sync-client`, `sync-protocol`) and take an adversarial review in a separate agent context (`20 §4.4`).

| # | Act | Owner | Why it blocks | Protected |
|---|---|---|---|---|
| 1 | `order.cancelled` payload in `packages/domain` | `01-F84` — **already ruled**, code-owed | `01-F4` makes the emit throw; no cancel and no auto-close without it | ✔ |
| 2 | A **seventh `DEVICE_CLASSES`** member for a cloud order origin | doc 01, `01-F39` | `registerDevice` refuses; resolution (A) cannot register | ✔ |
| 3 | A clause sanctioning a **permanently `branch_provisional`** origin and confirming no fold may prefer it | doc 01, `01-F43`/`01-F45` | `01-F43` frames offset-0 as transient; a cloud origin never acquires an offset | — |
| 4 | The **merge disposition** for `order.cancelled` and `order.rejected` | doc 01 / `26 §7`, oracle-pinned | both are projection-inert today; a rejected order stays in every till's `open_orders` for ever | ✔ |
| 5 | **`rejected`: a state, or folded onto `cancelled`** | `01 §4` | `01 §4`'s exit states are `voided / cancelled`; there is nothing for `order.rejected` to land on | ✔ |
| 6 | The **order→customer link** on `order.created` | doc 02 (already owed; `02-F10`, `02-F14` presuppose it) | delivery, khata and phone search are all unbuildable without it | ✔ |
| 7 | Move `normalizeDialledPhone` into `packages/domain`, with the country default stated as `00 §7` config | doc 01 / doc 14 | two writers, two keys, one human as two customer files under `01-F1` | ✔ |
| 8 | `01-F87`'s **fourth reference resource** actually carrying the tax cell | doc 01 — ruled, unbuilt | the storefront cannot show a tax-inclusive total honestly (§4.5) | — |
| 9 | The storefront's **boot-asserted entitlement gate** and `28-F6`'s storefront flag | doc 28 (`28-F4`, `28-F6`) | commandment 8 on a surface with no subject and no role | — |
| 10 | A **third plane** named in `18 §6`, or an explicit clause putting a public no-subject surface on the cloud plane | doc 18 | commandment 5 has two planes and a customer fits neither | — |
| 11 | Mark `06 §8`'s *"single cloud device identity"* tech note as decided by resolution (A), per (org, branch) | doc 06 | it predates `01-F62` and is silently in tension with it (§2.2) | — |

**Owed but not blocking slice 1:** `customer.phone_verified` (blocks `06-F12` only); the `SmsProvider` / doc 07 sender; `rider.*` schemas (all four missing) and the `rider` role; `06-F18`'s branch-liveness source if the live-session registry proves insufficient across multiple gateway processes.

---

## 10. Build sequence and how it is tested

**Sequence.** (i) Spec acts 1–5 and 9–11 — they are the whole of the risk and none of them is code. (ii) `services/storefront`: origin identity, lamport/outbox, push to the gateway, one `order.created` reaching a real till's inbox — **that is the milestone, and it is provable in a day of running processes** on top of `plans/wave-1/running-the-stack.md`'s four. (iii) The Reject control on the counter. (iv) `apps/storefront`: menu, cart, checkout. (v) Status page + `06-F18` + `06-F27`. (vi) Theme layer.

**Testing notes, aimed at this repo's own recorded failures.**

- **`24 §3`'s authorship split is TIERED by R66**, and the tiering matters here: the eleven acts in §9 that touch `packages/domain`, `packages/sync-client` or `packages/sync-protocol` get separately-authored acceptance tests and an adversarial review; the storefront app and service do not, **provided the implementing session mutation-proves its own suite** (`20 §2.14`). Either way the session that wrote this plan is disqualified as its own test author.
- **The mutation this design most needs is the seam, not the logic.** The recurring defect (fifteen instances) is a correct subsystem the product does not reach. The specific mutant to run here: **stub the ledger push** in `services/storefront` and confirm something reddens. If a storefront with an in-memory order table passes the suite, the suite proves nothing — that is precisely the measured shape of the publish-adapter blind spot AGENTS.md records (*"a port supplied with a stub"*), and `seams:check` is structurally blind to it.
- **`02-F9`'s inbox has no integration coverage today and will not acquire it by accident.** The gateway proves fan-out with two synthetic sessions in one process. A test that a storefront-originated `order.created` appears in a real till's `openOrders()` fold has to be written by hand.
- **The layout gate does not see this app.** `pnpm layout:check` opens a `BrowserWindow` from the counter's real options; a customer's phone browser is measured by nothing. `06-N1`'s LCP budget and `27-F8`'s handheld floor need their own measurement or they are aspirations.
- **`grep -a` and `--force --continue`** as everywhere else; a single green run is not evidence.

---

## 11. Open questions we cannot answer here

1. **Multi-process branch liveness.** The live-session registry is per gateway process. Two gateway processes behind a load balancer and `06-F18` lies in one direction or the other. Not a storefront problem to solve alone.
2. **`06 §9` Q1–Q6 stand unchanged** — delivery-zone geometry, branch auto-routing, gateway selection, pickup ETA source, status-link longevity, RAAST verification automation. This plan neither answers nor reopens them.
3. **Whether the storefront's `order.created` should carry the catalog and config artifact versions it priced against.** `looseObject` permits additive fields, so it is legal without a schema change — which is exactly why it should be an FR clause rather than a quiet addition.
4. **Reprint/receipt for a storefront order.** `06-F26`'s hosted summary *"is not a fiscal receipt"*; whether an FBR-fiscalised order (doc 16) may be sold through a surface that never prints one at the moment of sale is a doc-16 question we have not asked.

---

## 12. Founder decisions

Eight. Each is a real either/or with the cost of both answers.

**1. Which plane writes the order.**
- **(A) A cloud storefront origin device** — a seventh device class, a permanently-provisional clock, per-(org,branch) lamport state. *Cost:* two doc-01 spec acts on a protected path, and a branch ledger acquires an origin nobody can walk to.
- **(B) The till originates at accept** — zero kernel change. *Cost:* `order.cancelled` and `order.rejected` lose their producers again (a cancel before accept cancels nothing that exists), a 17th `sync-protocol` kind, and `02-F9`'s shipped inbox is rebuilt to read a non-fold source.
- *Recommendation: (A).* The shipped inbox already presumes it, `00 §5.1` describes it, and it is the only answer that makes `01-F84`'s owed producer real.

**2. Delivery in the first slice, or pickup only.**
- **Pickup only** — a complete, truthful product. *Cost:* we ship online ordering that does not do the thing most Pakistani off-premise volume is.
- **Delivery with no tracking** — COD at the door, settled at the counter. *Cost:* a delivery order can never leave `ready` (`01 §4`: the terminal path is rider-driven only), so the pass queue accumulates finished orders no fold can clear, and the status page must say *"we can't track it"* out loud.

**3. What `order.rejected` folds to.**
- **Fold onto `cancelled`** — an exit state that already exists; the event still records the reason and the actor. *Cost:* two different acts read as one state in every report; a rejection and a customer cancellation become indistinguishable to a fold.
- **Add `rejected` to `01 §4`** — precise. *Cost:* a canonical-state change, every fold and surface that enumerates states, and a permanent widening for one channel's benefit.

**4. Launch without OTP.**
- **Ship without it** — rate limits + manual accept + `cod_blocked`. *Cost:* `06-F12` is a stated non-conformance, and prank COD orders are one accept away from a real delivery.
- **Block the storefront until doc 07's sender exists** — conformant. *Cost:* the storefront waits on a module that is a two-line stub, i.e. it does not ship this year.

**5. Auto-accept: default on or default off.**
- **Off (recommended)** — the cashier's accept is the only human gate we have. *Cost:* a missed tablet is a missed order; every mainstream product warns about exactly this.
- **On** — matches Otter/Toast for direct web orders and never loses a ticket. *Cost:* in a COD market an unattended accept cooks and delivers food nobody ordered, and `06-F27`'s suspensions only cover the *stale* and *over-cap* cases.

**6. Who holds prepaid money.**
- **RAAST reference only, into the restaurant's own account** — RestOS never touches money. *Cost:* manual verification per order; no automatic refunds; card is off the table.
- **RestOS collects via a PSP and pays out** — one integration, every tenant covered. *Cost:* a licensed aggregator posture, a float, a payout ledger, chargeback liability, and `28-F22`'s *"no payment-gated service"* line gets a great deal harder to hold.

**7. What total the storefront shows before `01-F87`'s config carrier lands.**
- **Subtotal + fee, tax stated as added on the bill.** *Cost:* fine for pickup, wrong for delivery — a customer paying cash at the door must know the number.
- **Wait for the carrier and show a tax-inclusive total computed by `packages/domain`.** *Cost:* the storefront's start date moves behind a doc-01 build that is currently unscheduled.

**8. Tenant routing at pilot scale.**
- **`{org-slug}.restos.pk` subdomains from day one** (`06-F1`). *Cost:* wildcard DNS + wildcard TLS + an org slug field nothing currently holds.
- **A path prefix (`/r/{org-slug}`) for the pilots, subdomains later.** *Cost:* a URL change on printed and pasted links later, which `06-N6`'s laminated-QR promise makes expensive precisely once.
