# 16 — Tax Module (FBR/PRA Compliance Add-on)

**Module spec — Draft 1, July 2026** · Parent: `00-platform-overview.md` (conventions §5–§7 inherited), `01-kernel-sync.md` (event contracts). Seed: `restaurant-os.md` Appendix F — carried over unchanged unless amended here. Wave: **amended August 2026 (founder rulings R39/R55)** — the **posture engine is MVP scope** and ships with doc 02; the **compliance add-on stays on demand**, post-pilot, built when the first documented customer commits (`16-F34`).

## 1. Purpose & scope

Two distinct jobs on one module boundary:

1. **Tax posture engine** (all orgs, free): what tax the system charges and prints, configured per channel and per payment method. Off by default. Internal "true" numbers are always complete regardless of external reporting posture — decisions are never made on partial data. **Amended August 2026 (founder rulings R55/R54/R58):** the matrix **and its rates** are the owner's own configuration (`16-F27`); the axis the owner extends is the **tender channel**, never `02-F42`'s order channel (`16-F28`); tax sits **inside** `billed_total` (`16-F31`); and the tender channel that picks the cell is chosen **before the unpaid bill prints** (`16-F32`).
2. **Compliance add-on** (paid, per org): when enabled, fully faithful — real-time invoice fiscalization to FBR IMS + PRA e-invoicing, FBR invoice number + QR on the receipt, correct rate handling, store-and-forward for offline periods, returns-ready reports.

- **Who uses it:** owner (posture configuration via doc 14), platform admin (rule packs, enablement, fiscal fleet health via doc 15), external accountant (return exports). Staff never interact with it — fiscalization is invisible at the counter.
- **Runs on:** `services/tax` (cloud) + a POS-side fiscal queue component inside doc 02 hosts + receipt-pipeline integration in doc 03.
- **Tiers/profiles:** all; orthogonal to hardware tier.

**Legal red line (`restaurant-os.md` Appendix F, verbatim and binding):** "the product never implements sales suppression, dual-billing, or under-reporting mechanics in the compliant path, and never markets concealment as a feature." Tax-optional means the owner controls what the system charges and reports; the compliant module, when on, is honest end-to-end.

## 2. Position in platform

- **Events consumed:** `payment.recorded / split_recorded`, `order.created / channel_tagged`, `void.recorded`, `comp.recorded`, `discount.recorded` (credit-note triggers), `config.changed` (posture/rule-pack changes).
- **Events emitted:** `fiscal.*` family — added to the 01 §4 catalog by this spec (§5).
- **Integrates:** doc 02 (settlement path hosts the synchronous attempt + local queue; **and, since R58, the tender-channel choice that selects the posture cell before the bill prints — `16-F32`**), doc 03 (receipt blocks: FBR invoice number + QR render), doc 12 (tax summaries for the owner), doc 14 (posture matrix UI, needs-review queue), doc 15 (add-on enablement, credential provisioning, fiscal fleet health).
- **External:** tax authority APIs (FBR IMS, PRA e-IMS, SRB, KPRA RIMS, ICT — REST/local-utility, permitted third-party exception per 00 §3), one per certified adapter (§3 Authority adapter model). Infra: BullMQ store-and-forward queue (00 §3) + local SQLite queue on POS.

## 3. Functional requirements

**Posture (always present)**
- 16-F1 Tax is off by default. Enabling any posture or the add-on is an explicit org action recorded as `config.changed` (audited, 01-F5).
- 16-F2 Posture matrix per channel × payment method: `none | inclusive | exclusive`, each referencing a rate from a rule pack. Rates are never free-typed by orgs. Illustrative matrix (an org's choice, not a default):

| | Cash | Card/digital | Credit (khata) |
|---|---|---|---|
| Dine-in | exclusive @ PRA-cash | exclusive @ PRA-card | exclusive @ PRA-cash |
| Storefront/WhatsApp | none | exclusive @ PRA-card | — |
| Foodpanda | per aggregator invoicing | per aggregator invoicing | — |

  ⚠ **Amended August 2026 (R55): the SHAPE of this matrix stands; its SOURCE does not.** A cell no longer *"references a rate from a rule pack"* — the owner sets it (`16-F27`), and the column axis is the tender channel of `16-F28`. The table above is unchanged and is still an org's choice rather than a default.
- 16-F3 Internal true numbers always complete: every order records full value, channel, and payment method regardless of posture; reports and intelligence (docs 12/13) always operate on the complete ledger.
- 16-F4 ~~All rates and rules live in vendor-maintained, versioned **rule packs** with effective dates (e.g. Punjab pack: PRA 16% cash / 8% card-digital under current Punjab finance legislation — statute year and rates verified against notifications at build time, never cited from this spec). Enablement scope per org (PRA-only / FBR-only / both) is set at onboarding after legal verification. All rates/rules are configuration; rule-pack updates are `config.changed` events and never rewrite past invoices.~~ **SUPERSEDED BY NAME by `16-F27` (founder ruling R55, August 2026): the owner configures his channels and the tax per channel, so *"rates are never free-typed by orgs"* is no longer the rule.** The struck text is retained verbatim for the audit trail. ⚠ **Three of its clauses survive the FR and are restated rather than deleted, because deleting an FR without moving its checks deletes the checks silently — this corpus's most-repeated defect:** (i) effective-dating, `config.changed` audit and *never rewrite past invoices* move to `16-F29`; (ii) the rule-pack machinery itself survives **for the compliance add-on only**, where `16-F20`'s certified, effective-dated packs stay authoritative and `16-F30` forbids an org-typed rate from overriding one; (iii) enablement scope per org (PRA-only / FBR-only / both) is unchanged and stays an onboarding act after legal verification.
- 16-F5 Tax is computed per line ~~at settlement~~ and snapshotted on the order (01-F18 discipline — never re-derived); integer paisas; rounding rules per authority spec, fixed at build-time verification. ⚠ **The TRIGGER is superseded by `16-F32` (R58): tax is computed when the tender channel is chosen — before the unpaid bill prints — and re-computed on every re-choice, with the snapshot taken at the settling act.** The snapshot discipline itself is unchanged and is the half that matters. ⚠ **`rounding rules per authority spec` binds the COMPLIANT path only**; the posture engine has no authority to follow and follows the money helpers instead (`16-F31`).
- 16-F6 ~~Split payments across differently-rated methods: tax apportioned by payment share per method. Provisional rule pending authority guidance (§9.1).~~ **SUPERSEDED by `16-F35` (founder ruling R59, August 2026): differently-rated tenders are two BILLS, not one apportionment.** Retained verbatim for the audit trail; §9.1 is narrowed rather than closed.

**Org-configured tax (August 2026 — founder rulings R55, R54, R58, R59, R39)**

- 16-F27 **The posture matrix is ORG configuration and the owner types the rates — `16-F4` is overruled by name.** Founder's words (R55): *"allow user or restaurant owner to add his channels and tax per channel … some preconfigured that can be turned on or off like cash and card."* **What moves is the SOURCE of a rate, not the shape of the matrix.** A cell's rate stops coming from a vendor-maintained rule pack and becomes layer-2 org configuration (`00 §7`), edited in the back office (`14-F23`), audited as `config.changed` like every other setting (`16-F1`, `14-F2`).
  - **What the market requires, stated because it is the reason the ruling exists:** cash, card, QR/RAAST and online transfer are taxed differently here, and **some orgs — typically international chains — charge one rate across all, as instructed by government**. Those are not two mechanisms. They are one matrix, filled two ways.
  - **The grid has a DEFAULT CELL and per-cell overrides.** The org sets one posture + rate that fills every cell, then overrides only the cells that differ. The one-rate org overrides nothing; the independent overrides cash, card and QR separately. Equal cells, same mechanism.
  - **Why this does NOT adopt `01-F60`'s no-fallback rule, stated because the two look alike and one is about to be cited against the other.** A missing PRICE is a number nobody can guess, so a fallback there hides a forgotten cell behind a plausible one — which is exactly why `01-F60` refuses one. A missing tax cell has a real, common and *owner-stated* answer. The `01-F60` hazard is met a different way: the default is **typed by the owner, never vendor-supplied, and rendered in every cell it fills**, so the grid shows no empty cell and no cell whose value came from nowhere. **Alternative considered and refused:** require every cell explicitly. Refused because it makes a one-rate org type 5×N identical cells to say one thing, and a grid filled by rote is how a wrong cell gets typed.
  - ⚠ **This is a knob in a corpus whose `00 §7` says modules *"must not introduce free-form configuration"*, and the conflict is named rather than glossed.** No preset can be right here: a rate is set by a government notification and by what an org's accountant tells it, and the vendor can enumerate neither. **What stays bounded is the SHAPE, not the value** — a cell is `none | inclusive | exclusive` plus an integer basis-point rate (`DEC-MONEY-005`), so this is a typed cell on a designed surface and not a free-form settings blob. A clarifying act is owed to `00 §7`; doc 16 does not edit it.
  - ⚠ **The surviving two-axis shape is a READING, not a transcription, and can be disputed by FR id.** R55 names only the tender axis. Doc 16 reads `16-F2`'s order-channel axis as untouched because the two axes are not redundant: `16-F2`'s own illustrative table taxes a foodpanda order *per aggregator invoicing* whatever tender arrives, so the order channel decides cells no tender channel can. Collapse the matrix to one axis and that row has nowhere to live. **Dispute this by citing `16-F2`.**
- 16-F28 **"Channel" names two different axes and R55 opens exactly one of them.** Doc 16's term is the **tender channel** — `02-F12`'s payment method (cash, card, bank transfer / RAAST, khata credit, and whatever the owner adds). R55's *"channels … like cash and card"* and R58's *"the waiter asks the user the channel"* are both this axis.
  - **`02-F42`'s `channel` is UNTOUCHED.** `counter | phone | storefront | whatsapp | foodpanda` remains a CLOSED set and remains `01-F60`'s per-`(branch, channel)` price key. Nothing in R55 reopens it, and a session that reads *"the owner adds his channels"* as *"the owner adds order channels"* would break a price key that `01-F60` enforces with no fallback, on every catalog entry in the org. The two readings are one keystroke apart in English and nothing alike in the code.
  - ⚠ **What this does NOT close, and it is half of R55.** Making the tender-channel set owner-extensible is a change to `02-F12` **and** to `payment.recorded`'s payload in the `01 §4` catalog — a protected path, and **not doc 16's act**. Until it lands, doc 16's matrix has a **fixed column axis** and R55 is delivered for the rates only. Doc 16 rules just two things about that axis: it **is** whatever `02-F12`'s set becomes, and **every enabled member has a cell** — an added tender channel arrives carrying `16-F27`'s default explicitly, never as an absent cell nothing renders.
- 16-F29 **Org-typed rates are effective-dated, and the version applicable to an order is pinned at order creation.** `16-F4`'s surviving discipline, restated on its new owner: a rate change is a `config.changed` event with an effective date and **never rewrites a past order**.
  - **Pinning is the new half.** The rate version an order uses resolves from the order's **creation time in branch time** (`01-F43`), never from the settlement clock. An owner who edits a rate at 20:00 cannot move a bill printed at 19:58 and settled at 20:01.
  - **The CELL may still change; the RATE VERSION may not.** Re-choosing the tender channel moves the order to a different cell of the same matrix version — that is the customer's act and is the whole point of `16-F32`. An owner's edit is a different act and reaches only orders created after it.
- 16-F30 **Where a certified adapter is enabled, its rule pack is authoritative and an org-typed rate cannot override it.** R55 hands the owner the rates on the **free posture engine**, which files nothing with anybody. It does not hand him the rates on a **compliant** path: an org typing 0% while the add-on claimed fiscal compliance would be §1's red line — *"never implements … under-reporting mechanics in the compliant path"* — breached by a settings screen rather than by code.
  - So with a certified adapter enabled for an org/branch (`16-F21`, `16-F25`), `16-F20`'s effective-dated pack entries govern the rate. Org configuration narrows to **scope** — which cells are in fiscal scope — and cannot restate a rate the pack sets. Where the pack is silent, the org's cell applies.
  - This is also what keeps `DEC-TAX-002`'s vendor exposure where that ratification left it: RestOS is the trusted renderer, and every rate it renders onto a fiscal invoice came from a certified pack.
- 16-F31 **Tax is INSIDE `billed_total` (R54), and a receipt's *Total* row is that number.** `billed_total` stops meaning *the sum of line prices* and means **what the customer pays, tax included** — one number to reconcile, so the Auditor's conservation equation (`01-F30`), the shift-cash fold and the printed *Total* all mean the same thing, and it matches how a customer reads a bill. ⚠ **The definition itself is doc 01's to amend** (`01-F30`, a protected-path spec act); doc 16 states only what doc 16 means by the term.
  - **Consequence: `inclusive` vs `exclusive` stops changing what the total MEANS.** Exclusive adds tax to the sum of line prices and includes it in the total; inclusive carves it out of prices already typed. In both, `billed_total` is what is tendered, and R39's itemised tax line is a **derivation of the snapshot, never a second total**.
  - **This needs no new conservation term, which is why it is the cheaper of the two readings.** Σ tendering payments already includes the tax the customer handed over, so `01-F30` balances unchanged. Contrast `DEC-MONEY-004`'s tip — money tendered *outside* `billed_total`, which needed a new `purpose` on `01-F31`'s discriminator before it could be recorded at all.
  - **Arithmetic:** integer paisa throughout, rate as integer basis points, `applyRateBps` for the exclusive add and `splitPaisa` for the inclusive carve-out (`DEC-MONEY-005`, commandment 3). `16-F5`'s *rounding per authority spec* returns with the adapter and binds the compliant path only.
  - ⚠ **What it BREAKS, named rather than discovered:** `01-F30`'s split-bill clause `Σ(child billed) = parent billed at split time` no longer holds once R59's sub-bills take **differently rated** tender channels — the parent's tax was computed in one cell and the children's in two. A spec act is owed to doc 01 (restate the invariant over the pre-tax subtotal, or require the split before a channel is chosen); the split mechanism itself is doc 02's. Doc 16 does not rule it — §9.7.
  - ⚠ **No tax payload field lands before `billed_total`'s definition moves** (R54, stated in the ruling). `16-F5`'s snapshot needs somewhere to live and that field is doc 01's act, so `16-F31` is spec-closed and **code-blocked**, not code-owed.
- 16-F32 **The tender channel is chosen BEFORE the unpaid bill prints, and it is changeable (R58).** Founder's words: *"before printing the unpaid receipt the waiter asks the user the channel … sometimes people change the mode after choosing."* The tender channel is therefore an **input to the bill**, not a settlement-time discovery — which is precisely what makes R54's tax-inside-the-total knowable at print time.
  - Tax is computed when the channel is chosen and **re-computed on every re-choice**, up to the settling act. `01-F53`/`01-F18`'s frozen LINE price is untouched: the line price never moved, only the tax on it.
  - **Preview versus snapshot, and the distinction is load-bearing.** Before the settling act (`01-F33`, emitted per `01-F63`) an order's tax is **derived and carries no snapshot** — a snapshot that can be recomputed is not a snapshot, and storing one would invite a fold to read it. The snapshot is taken **as part of** the settling act, and after it tax is never re-derived (`01-F18`). `16-F5`'s snapshot discipline survives whole; only its trigger moved.
  - **Consequence to state rather than let a reader find:** `billed_total` on an OPEN order can move when the customer changes their mind. Any reader of it before settlement is reading a preview, not the ledger's answer. `01-F30` is unaffected because it only runs once settled (`01-F63`).
- 16-F33 **A `bill` may present more than one total; a `receipt` presents exactly one (R58).** Founder's words: *"some restaurants also write tax for card and cash on same receipt with both total amounts showing so user can choose."* The `bill` document type (`03-F31`) may therefore carry a totals block per presented tender channel. **Doc 03 owns the block; doc 16 owns the tax rule it renders.** Four constraints, each of them a thing that goes wrong otherwise:
  - (a) **One declaration.** Every presented alternative is computed from the *same* posture matrix the settlement will use — never a second table beside the document. This corpus has already paid for the other arrangement once, when two declarations of one enabled channel set drifted silently and nothing could see it.
  - (b) **None of them is the ledger's answer** (`16-F32`). A document showing two totals is a `bill`; it is never a `receipt`, and it carries no `FISCAL_LOCKED` block (`03-F33`).
  - (c) **A settled `receipt` shows exactly one total** — the snapshot. Two totals on a receipt would be a false record of what was taken.
  - (d) **The paper bounds the count.** `03-F49` gives `bill` a 32-column floor and refuses rather than squeezes, so *which* channels are presented is layer-2 config within what the type can render. Doc 16 sets no number.
- 16-F34 **R39's boundary: correct totals and an itemised tax line; NO fiscalization.** The posture engine (`16-F1`…`16-F6`, `16-F27`…`16-F35`) ships to every org now. The compliance add-on (`16-F7`…`16-F26`) is **post-pilot**: no authority adapter is certified, nothing is submitted anywhere, and no revenue-authority device or API is integrated.
  - Stated as a refusal, because the failure mode here is a document that merely *looks* official: a document produced by the posture engine carries **no** authority invoice number, **no** fiscal QR and **no** `FISCAL_LOCKED` block — those exist only when a certified adapter injects them (`03-F33`, `16-F23`) — and no surface, receipt or sales page may state or imply that the tax was reported or the product certified.
  - **Who owns rate correctness while this is true: the org does**, because the org typed it (`16-F27`) and nothing is filed with anybody. When an adapter is certified, `16-F30` moves that back to the vendor's pack — which is the arrangement `DEC-TAX-002` was ratified against, and the reason `16-F30` is not optional.
- 16-F35 **Differently-rated tenders are two BILLS, not one apportionment (R59) — `16-F6` is superseded.** R59 divides a bill into sub-bills, each with its own tender channel, its own tax and its own total. So `16-F6`'s case — one bill, two differently-rated methods, tax apportioned by payment share — **does not arise**: within one bill there is one tender channel, therefore one cell, therefore nothing to apportion.
  - `02-F13`'s split payment across methods in one settlement survives as the case where every part lands in the **same** cell (part cash, part RAAST at one rate). **The amendment saying so is doc 02's act, not doc 16's.**
  - ⚠ **Not closed:** R59 introduces **no seat concept** and **defers equal-split**, because equal-splitting across differing tax rates needs a rule nobody has written. `02-F5`'s split-by-item stands. Doc 16 does not write that rule and must not be read as having one.

**Fiscalization (add-on on)**
- 16-F7 Every invoice in fiscal scope (per the posture matrix) MUST be fiscalized. There is no per-invoice opt-out, no unfiscalized parallel receipt, and no code path that emits a customer receipt outside the fiscal pipeline while the add-on is active.
- 16-F8 Fiscalization state machine per invoice — states, transitions, and triggers:

| From | To | Trigger |
|---|---|---|
| — | `pending` | fiscal-scope settlement recorded (queue row persisted before receipt prints) |
| `pending` | `submitted` | request sent to authority (sync attempt or queue drain) |
| `submitted` | `acknowledged` | authority returns invoice number (terminal; number + QR payload stored) |
| `submitted` | `failed(n)` | timeout, transport error, or authority rejection (response captured verbatim) |
| `failed(n)` | `submitted` | retry — exponential backoff, capped at 1 h between attempts |
| `failed(N)` | `needs_review` | attempt limit reached (default N = 10) — parked, surfaced in doc 14 |
| `needs_review` | `submitted` | manual retry after resolution (audited action) |

  `acknowledged` is the only success-terminal state; `needs_review` is never terminal — every in-scope invoice must eventually reach `acknowledged` or become a documented credit-note case. Every transition is an event, forming a per-invoice audit trail hash-chained per device (01-F5 pattern).
- 16-F9 Online path: synchronous fiscalization attempt at settlement with a hard timeout (default 2,500 ms, Layer 1). On success the receipt carries the FBR invoice number + QR (doc 03 render).
- 16-F10 Offline/timeout path: the receipt prints immediately (00 §5.3 targets intact) with the local invoice number (USIN) and a "fiscal submission pending" marker; the invoice enters the store-and-forward queue. On acknowledgment the FBR number is available on reprint and on the digital receipt (docs 06/07). Marker format and acceptability verified against FBR technical spec at build time (§9.3).
- 16-F11 Queue durability: the fiscal queue row is persisted in POS SQLite (WAL) before the receipt prints; it survives power loss and app reinstall-with-restore; draining goes POS → cloud tax service → authority; submission is idempotent (invoice id/USIN dedupe). Zero invoice loss, ever. (Instance of the canonical durable-local-queue pattern, 18 §4 — shared implementation with the sync outbox 01-F8 and print spooler 03-F4.)
- 16-F12 Post-fiscalization corrections: void/refund/adjustment after acknowledgment produces a credit note (or debit note) per authority spec, linked to the original invoice → `fiscal.credit_note_issued`. Append-only; the original invoice is never modified or resubmitted.
- 16-F13 Reconciliation: a daily job compares settled fiscal-scope orders against fiscalized invoices per branch; any gap raises `fiscal.reconciliation_gap_flagged` to doc 15 fleet health and the org back office. Target steady state: zero gap.
- 16-F14 Returns-ready reports: monthly export per authority — sales register, tax collected by rate and payment method, credit notes — CSV + PDF, aligned to FBR/PRA return line items.
- 16-F15 `needs_review` queue surfaced in back office (doc 14): resolution actions are retry and annotate; resolutions are audit events; deletion does not exist.
- 16-F16 Credit (khata) orders: the fiscal invoice is issued at receipt issuance (order completion), not at eventual khata settlement; the applicable rate for method-differentiated regimes follows the rule pack's mapping for credit sales (§9.6).
- 16-F17 Owner visibility: doc 12 shows a per-day fiscal health tile when the add-on is on — invoices fiscalized / pending / needs_review — with the same sync-honesty rules as every remote view (00 §5.7).

**Authority adapter model (add-on architecture)**

Pakistani authorities differ materially — rates, digital-payment differentials, branch-level dispensations, integration topology, offline rules (external audit, verified July 2026). The add-on therefore treats each authority as a separately certified **adapter** behind one interface; everything authority-specific lives in the adapter and its rule packs, and the fiscal pipeline (16-F7…F15) stays adapter-agnostic.

- 16-F18 One adapter interface: every authority integration implements the same contract (16-F19…F24). The state machine (16-F8), queue (16-F11), and reconciliation (16-F13) never branch on authority identity outside the adapter.
- 16-F19 Applicability resolution: the adapter and rate for an invoice resolve from org province **plus branch registration/approval status with the authority** — never province alone. SRB's special-dispensation list (approved integrated branches charge 15% on digital payments with input adjustment — verified July 2026) makes the applicable rate branch-status-dependent; rule packs MUST support branch-status-conditional rate rows.
- 16-F20 Rule-pack binding: each adapter binds versioned, effective-dated rule packs (16-F4). Rates verified July 2026 — PRA 16% cash / 8% eligible digital (effective 1 July 2026); SRB 15% standard / 8% eligible digital plus dispensation — exist only as effective-dated pack entries, never as prose or code constants.
- 16-F21 Certification status: sandbox certification is tracked per adapter × org/branch (doc 15). "Certified" = sandbox round-trip passed + legal-verification checklist signed off; both recorded as audit events.
- 16-F22 Capability declaration: each adapter declares its online/offline capabilities, including whether offline receipt issuance with the pending marker (16-F10) is legally permitted for that authority. This is an adapter capability flag certified before enablement — never a product-wide promise. Where the flag is false, the adapter defines the compliant offline behavior.
- 16-F23 Per-adapter ownership: receipt/QR format (16-F9, doc 03 blocks), correction/credit-note rules (16-F12), and reconciliation/returns export formats (16-F13/F14) are defined by the adapter, not the core module.
- 16-F24 Credentials + deployment topology: each adapter declares its topology — cloud REST client, or a local branch utility (KPRA RIMS: a local Windows utility that receives POS invoice JSON and queues while offline, or a direct public API requiring connectivity — verified July 2026). The local-utility topology is explicitly supported: a small vendor-managed Windows service deployed beside the counter POS with its own store-and-forward, monitored in doc 15 fleet health. Credential rules (16-N4) apply to both topologies.
- 16-F25 Enablement gate: the compliance add-on can be enabled for an org/branch only when the applicable authority adapter is certified for it (16-F21). Uncertified authority = add-on unavailable there, stated plainly at sale; the posture engine and core POS are unaffected.
- 16-F26 Named adapters at spec time, each separately certified:

| Adapter | Known distinctive (verified July 2026) |
|---|---|
| PRA / e-IMS (Punjab) | 16% cash / 8% eligible digital (current as of 1 Jul 2026); e-IMS invoice reporting |
| SRB (Sindh) | 15% standard / 8% eligible digital + branch special-dispensation list (15% digital with input adjustment) |
| KPRA / RIMS (KP) | dual topology: local Windows utility with offline queue, or direct public API requiring connectivity |
| ICT (Islamabad) | distinct scope and rates — pack verified at build time |
| FBR (where applicable) | federal IMS scope alongside/instead of provincial, per org registration |

**Sources (external audit, July 2026):** PRA POS Component & e-IMS manual — e.pra.punjab.gov.pk · SRB restaurant services — srb.gos.pk · KPRA RIMS technical implementation guide — kpra.gov.pk.

**Automation-law register (00 §5.8):** tax computation — side-effect of settlement; fiscal submissions — side-effect of the same; authority acknowledgments — ingestion; rule packs and posture — configuration, not facts. This module asks staff to enter nothing.

## 4. Key flows

**Flow A — Enablement**
1. Org commits to the add-on; platform admin enables the flag (doc 15).
2. Org provides its FBR/PRA registration credentials; vendor provisions endpoints + the correct rule pack.
3. A sandbox test invoice round-trips successfully (submission → acknowledgment → QR verify).
4. Owner confirms the posture matrix in doc 14 (which channels/payment methods are in fiscal scope).
5. Go live. Every step above is a `config.changed` / audit event; there is no silent enablement.

**Flow B — Settlement, online (happy path)**
1. Cashier settles the order (doc 02); tax lines computed from the snapshot rules and stored on the order.
2. Fiscal record persisted as `pending` in POS SQLite — before any print.
3. Synchronous submission to the authority with the configured timeout (default 2,500 ms).
4. `acknowledged` within the window → receipt prints with FBR invoice number + QR (doc 03).
5. Added latency ≤ timeout, on the receipt step only — order confirm and KOT timings are untouched (16-N1).

**Flow C — Settlement, offline (8 h WAN cut)**
1. Settle → `pending` persisted; the sync attempt is skipped (link known down).
2. Receipt prints immediately with USIN + "fiscal submission pending" marker.
3. On reconnect, the local queue drains through the cloud tax service in order; each invoice `submitted → acknowledged`.
4. Records updated; reprints and digital receipts (docs 06/07) now carry the FBR numbers.
5. Reconciliation job (16-F13) confirms zero gap for the day.

**Flow D — Failure / poison**
1. Authority rejects an invoice (validation error) → `failed(1)`, response captured verbatim.
2. Retries with backoff; a transient outage self-heals invisibly.
3. Persistent failure hits the attempt limit → `needs_review`, surfaced in doc 14 with the captured cause.
4. Root cause fixed (e.g. credential renewal via doc 15) → manual retry → `acknowledged`.
5. At no point was the customer-facing flow blocked or an invoice lost.

**Flow E — Void after acknowledgment**
1. Manager-PIN void (doc 02) on a fiscalized order.
2. Credit note generated per authority spec, linked to the original invoice, and submitted through the same state machine.
3. `fiscal.credit_note_issued` on acknowledgment; the original invoice is never touched.

**Flow F — Monthly return**
1. Accountant (or owner) pulls the return export for the period from doc 14.
2. Export contains the sales register, tax by rate and payment method, and credit notes — aligned to return line items.
3. Totals reconcile to the event ledger by construction (16-F13); any residual `needs_review` items are listed, not hidden.

## 5. Data

- **Entities owned:** `tax_posture` (org config — `16-F27`'s default cell plus per-cell overrides over order channel × tender channel, effective-dated per `16-F29`; layer 2, edited in doc 14, audited as `config.changed`. ⚠ **The layer-2 config plane that must host it does not exist** — measured August 2026, R63 — so `16-F27` is spec-closed and code-owed, and there is nowhere to type a rate today), `fiscal_invoices` (org, branch, order ref, USIN, state, attempts[] with request/response digests, authority invoice number, QR payload, rule-pack version), `fiscal_queue` (POS-local SQLite + cloud BullMQ mirror), `rule_packs` (versioned, effective-dated), `return_exports`, `credentials` (per-org authority registration, encrypted), `adapter_certifications` (authority adapter × org/branch: sandbox + legal-verification status, 16-F21/F25).
- **Events added to the 01 §4 catalog by this spec:** `fiscal.invoice_queued / invoice_submitted / invoice_acknowledged / submission_failed / credit_note_issued / reconciliation_gap_flagged`.
- **Events consumed:** listed in §2.
- Read models rebuildable (01-F7) except `fiscal_invoices`, which additionally mirrors authority-issued facts (numbers, timestamps) that must be retained as received.
- **Retention:** fiscal records and attempt logs are retained for the statutory audit period (≥ 6 years — confirm at build time); POS-local queue rows are never compacted before cloud acknowledgment of the drain.

## 6. Non-functional requirements

Cross-cutting NFRs inherited from 00 §5. Module-specific:

- 16-N1 Fiscalization never delays order confirm or KOT print (00 §5.3); only the settlement receipt may wait, and never longer than the configured timeout.
- 16-N2 Queue drain: 500 queued invoices (8 h offline, 01-scale rush) fiscalized < 5 min after reconnect on 4G.
- 16-N3 Clocks: authority submissions carry device time; skew > 5 min is flagged (01-N2) and `server_received_at` is stored alongside for reconciliation.
- 16-N4 Credentials encrypted at rest, org-isolated absolutely (00 §5.4); never present on branch devices — POS-side submission uses short-lived signed tokens minted by the cloud service.
- 16-N5 Authority API outage of any duration causes zero customer-facing degradation beyond the pending marker.
- 16-N6 State transitions are visible in the back-office needs-review/fiscal-health views < 1 min after they occur cloud-side.

## 7. Customizability

- **Layer 1 (platform admin):** add-on enablement per org; **rule packs and effective dates — for the compliance add-on only, since `16-F27` moved the posture engine's rates to layer 2**; sandbox/live endpoints; sync timeout; retry/backoff policy; needs-review threshold.
- **Layer 2 (org):** posture matrix (order channel × tender channel) **and its RATES (`16-F27`)**; **the enabled tender-channel set (`16-F28`, once `02-F12` opens it)**; **which tender channels a `bill` presents totals for (`16-F33`)**; org registration credentials; receipt disclosure text within the doc 03 template bounds.
- **Layer 3 (branch/device):** none.
- **Deliberately not configurable, ever:** skipping fiscalization for in-scope invoices; editing or deleting fiscal history; the state machine; the audit chain; any setting whose effect is under-reporting in the compliant path (see the red line, §1) — **which is why an org rate can never override a certified adapter's pack (`16-F30`)**; **`02-F42`'s order-channel set, which stays closed and stays `01-F60`'s price key (`16-F28`)**; **whether tax sits inside `billed_total` (`16-F31`) — one total is platform law, not a preference**.

## 8. Tech notes

- `services/tax` in the modular Node backend; one authority-adapter interface (16-F18) with per-authority REST clients generated from current specs, each gated by the build-time "regulation verification" checklist before first org enablement (rates have drifted before; assume drift).
- KPRA local-utility topology (16-F24): the branch utility ships as a vendor-managed Windows service packaged with `pos-electron` deployment, reusing the outbox durability pattern (01 §5) for its own queue; heartbeat into doc 15 fleet health.
- POS-side queue reuses the sync-client outbox pattern (01 §5) — same durability discipline, same tests (plug-pull mid-settlement is a required case in 00 §4 durability suite).
- QR rendering through `packages/escpos` (doc 03 print path); QR payload format per FBR spec.
- Submission topology decision: POS submits directly when online (to get the number onto the first printed receipt), cloud service is the drain path and fallback; final call after sandbox latency measurement (§9.2).
- FBR sandbox wired into the staging environment; rush simulation (00 §4) runs with the add-on enabled to prove 16-N1.
- Rule-pack schema in `packages/domain` (Zod), like all config.

## 9. Open questions

1. *Narrowed (R59 / 16-F35), not resolved:* apportionment across differently-rated tenders no longer arises in the posture engine — differing rates mean separate sub-bills. It survives only if a certified authority requires **one** invoice for a bill whose money arrived under differing rates, which is an adapter question (`16-F23`), not a product-wide rule.
2. Submission topology (POS-direct vs cloud-relay) — decide on sandbox latency data.
3. *Resolved (adapter model):* offline receipt marker acceptability is a per-adapter certified capability flag (16-F22), verified per authority before enablement — no longer a product-wide question.
4. *Resolved (adapter model):* additional authorities are the adapter roadmap (16-F26 named adapters); each ships when its certification gate passes (16-F25), demand-driven.
5. Whether late-arriving FBR numbers should be proactively delivered to customers via WhatsApp (doc 07) as standard behavior, or only on reprint/digital receipt.
6. Rate treatment of khata (credit) sales under the cash/card-differentiated PRA regime (16-F16) — verify the correct mapping in current notifications.
7. **`01-F30`'s split-bill invariant under R54 + R59** (`16-F31`): with tax inside `billed_total`, `Σ(child billed) = parent billed at split time` fails whenever sub-bills take differently rated channels. Doc 01 owns the invariant and doc 02 the split; the two candidate shapes are restating it over the pre-tax subtotal, or requiring the split before a channel is chosen. **Not doc 16's to rule, and not safe to leave unnamed.**
8. **The half of R55 doc 16 cannot deliver** (`16-F28`): an owner-extensible tender-channel set is a `02-F12` amendment plus a `payment.recorded` payload act in the `01 §4` catalog. Until it lands the matrix's column axis is fixed and only the rates are the owner's.
9. **What an owner-typed rate is checked against, if anything.** `16-F30` protects the compliant path; on the free posture engine nothing validates a typed rate, by design — nothing is filed, and the vendor enumerating legal rates is the rule-pack model R55 overruled. Whether the back office should nonetheless *warn* on an implausible cell (`14-F23`) is a doc 14 question and is deliberately left open here rather than answered by whoever builds the screen.
