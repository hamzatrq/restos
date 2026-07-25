# Wave 1 — Role Task Inventories

**Planning artefact — Draft 1, July 2026** · Owning spec: `specs/21-ux-system.md` §5 (role contracts). Visual layer: `specs/27-design-language.md`. Derived from `specs/01` §4 (event catalog), `02`, `03`, `04`, `05`, `09`, `12`, `10`, `11`, `restaurant-os.md` Appendix A, and `plans/wave-1/research/*.md`.

**Why this file exists.** `21 §5` states the law: *"every screen belongs to exactly one role and serves a task from that role's inventory. No screen exists without a role + task + budget. Feature tourism (surfacing capabilities to a role that doesn't need them) is a spec violation."* The inventories that law depends on were never written. Until they exist there is nothing to derive screens from, and "does this screen deserve to exist" is unanswerable. This document is the missing input to every Wave 1 UI decision.

**What this document is not.** It designs no screens, proposes no layouts, and invents no behaviour. Where a task the staff obviously perform has no FR or no event behind it, that is recorded as a gap in §10 — not filled in here (commandment 2). Where two specs disagree, the conflict is named in §9, not smoothed over. §9 and §10 are the parts of this document that require a founder ruling before Wave 1 UI work can proceed; §§2–8 are the parts that unblock it.

---

## 0. How to read this — conventions

### 0.1 The reference shift

Every frequency figure is stated against one reference, so the numbers are comparable and falsifiable:

> **Reference branch:** one T2 branch (counter + pass screen), Friday evening shift 17:00–01:00. **150 orders**, mean **4 lines/order** (≈600 lines). Channel mix ≈ 60% counter dine-in/takeaway, 15% phone, 15% foodpanda quick-entry, 10% storefront/WhatsApp. Staffing: **2 cashiers, 1 pass person, 3 kitchen, 1 manager, 2 riders**; +4 waiters at T3.

These are estimates for sizing, not measurements. `21-F10` (relevance instrumentation) exists precisely to replace them with real per-role counts from the dev pilot; **every frequency in this document should be re-derived from instrumentation before Wave 2.** Order-of-magnitude is what matters: the difference between 3×/shift and 300×/shift decides the design; the difference between 280 and 320 does not.

### 0.2 Criticality scale

A task carries one or more of:

| Code | Meaning | Test |
|---|---|---|
| **S** | **Sale-stopping** | If this fails, the restaurant cannot take, cook, or hand over an order. `01-F17` / `00 §5.1` set the bar: a sale is never blocked — so an S-task that can be blocked is a defect by construction. |
| **M** | **Money at risk** | Failure loses, misattributes, or leaks cash, or breaks a `01-F30` conservation invariant. |
| **T** | **Trust at risk** | Failure makes the system lie — to staff (stale shown as live), to a customer (an item sold that is finished), or to the ledger (an unattributed action). |
| **A** | **Annoying** | Costs seconds and goodwill. Nothing else. Secondary by definition. |

"Merely annoying" is not a dismissal — it is the criterion that decides what may be slow. A task marked **A** may cost four taps; a task marked **S** may not.

### 0.3 Budgets

- **Taps** = discrete touches from the task's normal starting state to the task being done, in the `21 §4` Maestro-step-count sense.
- Where `21 §4` or a module NFR **already names** a budget, it is cited and reused. No existing budget is restated with a different number.
- Where none exists, the proposal is marked **[proposed]** — these are exactly the numbers the design owner (`21 §8`) must rule on, and each becomes a merge criterion once ruled.
- Latency figures inherit `00 §5.3` unless the module NFR is tighter.

### 0.4 Offline

**Default is yes.** Every task is assumed to work with WAN down, indefinitely (`00 §5.1`). A "no" or "degraded" entry always states *why* and *what the honest degraded behaviour is* (`00 §5.7`). Only three causes of a legitimate "no" exist in the corpus: the task consumes something that only arrives over WAN (a cloud order that has not landed), the task is on a cloud-plane surface by design (owner app, `12 §1`), or the task is a *remote* variant of an in-branch task (`05-F22`).

### 0.5 Event citation

Events are named from the `01 §4` catalog. **A task whose event is not in that catalog is marked ⚠ and listed in §10.2.** Fourteen such event types exist today — module docs emit them, `01 §4` does not list them. That is a finding, not a licence to assume they exist.

### 0.6 Vocabulary

Task names are in the staff's words, verb-first. A cashier does not "emit `order.line_added`"; they "add a karahi to table 4". The event column carries the system's vocabulary so the two can be checked against each other — which is the entire point of pairing them.

---

## 1. The role census

`restaurant-os.md` Appendix A names eleven roles. Six were commissioned for full inventories. The census below records all of them, so that a role's absence from this document is a recorded decision rather than an oversight.

| # | Role | Owning spec | Wave | Inventory here | Device / plane |
|---|---|---|---|---|---|
| 1 | **Cashier / counter staff** | `02` | 1 | **§2 — full** | Fixed Windows terminal or counter tablet; `sync-client` plane |
| 2 | **Kitchen / pass** (chef, pass person) | `03` | 1 | **§3 — full** | Wall/pass screen + thermal printers; `sync-client` plane |
| 3 | **Branch manager** | `05` | 1 core / 4 full | **§4 — full** | Own phone (Android or iOS); `sync-client` plane |
| 4 | **Owner** | `12` | 1 basic / 4 full | **§5 — full** | Own phone; **cloud plane only** (`12 §1`) |
| 5 | **Waiter / captain** | `04` | 4 | **§6 — full** | BYOD low-end Android; scoped slice (`04-F16`) |
| 6 | **Rider** | `09` | 2 | **§7 — full** | BYOD low-end Android; cloud-only scoped slice (`09-F2`) |
| 7 | **Storekeeper / purchaser** | `10` | 3 | §8.1 — outline | Branch device (hosted on `02`/`05`) |
| 8 | **Prep / production staff** | `10` | 3 | §8.2 — outline | Shared kitchen device |
| 9 | **Call-center operator** | `02-F27..F29` | 1 / 4 | §8.3 — **unresolved role** | POS in phone-entry mode |
| 10 | **Accountant / munshi** | `11-F7`, `12-F20` | 3 | §8.4 — outline | Export consumer; no operational UI |
| 11 | **Marketing** | `17` | 4+ | §8.5 — deferred | Back office |
| 12 | **Platform admin / onboarding team** | `15` | 0–1 | §8.6 — vendor-side | Vendor tooling |
| 13 | **Customer** | `06`, `07` | 1–2 | §8.7 — **law gap** | Own phone, unmanaged |

### 1.1 Roles the specs imply that were not on the commissioned list

Five of these are genuine findings, not bookkeeping:

- **Busser / table-turner.** `04 §4` describes the flow plainly — *"table flips `cleaning` → busser taps done → `available`"* — and `04-F11` says manual taps exist for `cleaning`-done. **No such role exists in Appendix A, holds a device, or is named in any FR.** Someone performs this task on every table turn (~40×/shift at T3). See §10.1 G2.
- **Call-center operator.** `02-F27..F29` describe a person whose entire posture differs from a cashier's — headset, seated, no customers in front of them, keying a phone number — and `02-F29` (Wave 4) describes them serving *multiple branches*, i.e. sitting in no restaurant at all. Doc 02 treats this as a POS mode, not a role. Whether it is a mode or a role is undecided and decides whether it gets its own inventory. See §10.1 G9.
- **Shift lead as intermediary.** `27-F51` makes this a design requirement — *"there is a second-order usability — usability for a beneficiary via a helper — that direct-interaction heuristics do not cover"* — grounded in the CHI 2010 finding (4 months / 22 women / 110 hours) that surrogate use is the norm, not the exception, in this population. This is not a role; it is a **mode every role's tasks are performed in**. No module FR owns it. See §10.1 G12.
- **Trainee.** `27-F52` makes training mode a product requirement that *"reaches the kernel"* and is explicitly *"owed to doc 01/02"* — where nothing exists. A trainee is any role in a state that must not pollute an append-only ledger. This is the single largest gap in this document, because it applies to every inventory below. See §10.1 G1.
- **Customer.** Appendix A lists Customer as a role. `21 §5`'s law says *every* screen belongs to exactly one role with a task and a budget. The storefront (`06`) and WhatsApp (`07`) surfaces have module NFRs but **no task inventory, no entry in the `21 §4` budget table, and no touch-target law** (their device is unmanaged and unknown). Either the `21 §5` law explicitly excludes customer-facing surfaces, or an inventory is owed. See §10.1 G8.

---

## 2. CASHIER

### 2.1 Who this person is

She is standing. That single fact sets more of her design than anything else: `27-F8` puts a standing operator at a fixed terminal in the **20 mm (126 dp)** kiosk condition for high-consequence numeric entry and **12 mm (76 dp)** for menu tiles (Colle & Hiszem, Ergonomics 2004) — not the 48 dp `02-F2` still says, and not the 64 dp `21 §4` still says. She is on her feet for eight hours on a hard floor and her accuracy degrades through the shift in ways nothing in the corpus measures.

Assume she reads little. Pakistan adult literacy is 58.86%; the 2023 census gives 51.6% rural and ~47.5% rural female; 67.5% of "educated" Pakistanis are below matric. The cashier is plausibly among the *more* literate staff in the building — she handles money and answers the phone — but the research is unambiguous that this must not be assumed: on text UIs, illiterate and semiliterate subjects had **0% task completion, even with prompting**, giving up after 14.5–16 prompts (Medhi/Sagar/Toyama, ITID 2007). She reads **numerals** reliably — that finding is independently confirmed twice — and she does not do arithmetic: ~60% of rural Class 1 recognise numbers against **9.5% who can do any arithmetic** (ASER 2023, n=272,370). `27-F24` is the operative law: the system computes, she reads. Every total, every change amount, every line total arrives finished.

Her device is a Windows counter PC (Electron, the preferred branch hub per `01-F13`) or an Android counter tablet (`02 §1`), mains-powered, bolted to a spot, screen at a fixed angle in whatever light the counter has. She is interrupted continuously and by design: a queue in front of her, a phone that rings (`02-F27`), a foodpanda tablet that beeps (`02-F30`), an S2 chime for every cloud order (`02-F9`), a waiter shouting a change, a manager asking a question. Her hands are rarely both free — she is holding cash, a receipt, a phone handset, or a customer's card. **The two-handed device is operated one-handed most of the time,** which nothing in `27-F8`'s posture table currently accounts for.

She is also the person the system is protecting. `02-F23`'s framing is deliberate: at shift close she sees her own reconciliation — *"I'm clean."* Adoption depends on her believing the system is on her side, not watching her.

### 2.2 Task inventory

| # | Task (her words) | Trigger | Freq / shift (per cashier) | Crit | Events (`01 §4`) | Budget | Offline |
|---|---|---|---|---|---|---|---|
| C1 | **Unlock the till with my PIN** | Idle auto-lock; shift start; handover | 20–60 | **S** | `audit.login` (`01-F5`); `staff.clocked_in` on first unlock in window (`11-F1`, W3) | PIN ≤ 4 digits, 1 tap/digit + auto-submit; unlock render < 1 s **[proposed]**; keypad 126 dp (`27-F8`) | Yes (`01-F28`) |
| C2 | **Open my shift** | Start of shift | 1–2 | **M** | `shift.opened` | ≤ 3 taps **[proposed]** | Yes |
| C3 | **Open the day / enter the float** | First shift of the day | 0–1 | **M** | `day.opened` | ≤ 4 taps + one numeric field **[proposed]** | Yes |
| C4 | **Start an order for table 4 / takeaway / delivery** | Customer arrives or orders | ~75 | **S** | `order.created`, `order.channel_tagged`, `order.table_assigned` (`02-F1`) | ≤ 2 taps (type + table), inside the `21 §4` 2-tap grid→confirm law | Yes |
| C5 | **Add a karahi to the order** | Every item the customer says | **~300** | **S** | `order.line_added` (`02-F2/F3`) | **1 tap** for a no-modifier item; ≤ 3 taps with one modifier group **[proposed]**; feedback < 100 ms (`02-N1`, `27-F10`); tile ≥ 76 dp (`27-F8`) | Yes |
| C6 | **Find an item that isn't on the front page** | Rare item; new item; menu bigger than the grid | 10–30 | **A** | `order.line_added` | ≤ 4 keystrokes to result; results < 150 ms (`02-N2`) | Yes ⚠ **conflict** — search requires typing (`27-F6`); see §9 C3 |
| C7 | **Say "less spicy"** | Customer asks | 10–40 | **T** | `order.note_added` (`02-F6`) | ≤ 2 taps from the line, quick-tag tiles only **[proposed]** | Yes ⚠ **conflict** — `02-F6` allows free text; `27-F6` forbids it |
| C8 | **Take that off — I made a mistake** (before confirm) | Mis-tap; customer changes mind | 10–25 | **A** | `order.line_removed` (`02-F8`) | ≤ 2 taps **[proposed]**; **must not sit adjacent to C5's tiles** (`27-F9`) | Yes |
| C9 | **Send it to the kitchen** | Order complete | ~75 | **S** | `order.confirmed` → KOT jobs (`02-F8`, `03-F2`) | **The 2-tap law** (`21 §4`, `02-F2`); confirm → first byte at printer < 2 s (`02-N1`, `03-N1`) | Yes |
| C10 | **Park this order / pick it back up** | Customer steps away; terminal needed | 10–30 | **A** | `order.parked` / `order.unparked` (`02-F4`) | ≤ 2 taps each **[proposed]**; durable the instant park returns (`02-N5`) | Yes |
| C11 | **Take the money and give change** | Customer pays | ~60 | **S M** | `payment.recorded`, `order.settlement_closed` (`01-F33`) | **≤ 4 taps** (`21 §4` named); change computed and displayed, never mentally (`27-F24`); keypad 126 dp (`27-F8`); `settlement_attempt_id` per `01-F31` | Yes |
| C12 | **Part cash, part RAAST** | Customer splits payment | 5–15 | **M** | `payment.split_recorded` (`02-F13`) | `21 §4` settlement budget + ≤ 2 taps per additional method **[proposed]** | Yes |
| C13 | **Put it on his khata** | Regular customer, credit | 0–20 | **M T** | `payment.recorded {method: khata_credit}`; `customer.created` if new (`02-F14`, `01-F23`) | ≤ 4 taps after customer resolves **[proposed]** | Yes |
| C14 | **Split the bill between them** | Guests pay separately | 2–10 | **M** | `order.split` (`02-F5`) | ≤ 6 taps for an equal split **[proposed]**; money division **must** use the `DEC-MONEY-005` helper — never inline | Yes |
| C15 | **Move them to another table / join two tables** | Seating change | 2–10 | **A** | `order.table_assigned` / `order.merged` (`02-F5`) | ≤ 3 taps **[proposed]** | Yes |
| C16 | **Print the receipt** | Settlement completes | ~60 | **T** | `receipt.printed` (`02-F15/F16`) | 0 taps — automatic on settle **[proposed]** | Yes |
| C17 | **Print it again** | Customer lost it; printer jammed | 2–10 | **M T** | `receipt.reprint_requested` — *always* logged with actor (`02-F16`, fraud vector) | ≤ 2 taps from the recalled order **[proposed]** | Yes |
| C18 | **Take an order on the phone** | Phone rings | 10–25 | **S M** | `customer.created` / `customer.address_added`, `order.created`, `order.confirmed` (`02-F27`) | **≤ 30 s** total for a repeat customer (`02-F28`, `02-N3`) | Yes ⚠ typing a customer **name** conflicts with `27-F6` |
| C19 | **Accept the order that came from the website / WhatsApp** | S2 chime (`21 §5`) | 10–20 | **S T** | `order.confirmed` (idempotent, `02-F9`) | **1 tap** (`02-F9` states one-tap accept) | **Degraded** — nothing arrives while WAN is down; the *accept* itself is local. Escalates to S1 past half the confirmation window |
| C20 | **Reject it — we're out of that** | Item unavailable; closed; out of range | 1–5 | **T** | ⚠ **`order.rejected` — not in the `01 §4` catalog** (`02-F9`, `06-F20`) | ≤ 3 taps incl. reason tile (`06-F20` list) **[proposed]** | Degraded, as C19 |
| C21 | **Key in the foodpanda order** | Order shouted from the aggregator tablet | 15–25 | **S** | `order.created`, `order.channel_tagged {foodpanda}`, `order.confirmed` (`02-F30`) | **≤ 30 s** (`02-N3`); no settlement step | Yes |
| C22 | **Karahi khatam — take it off** | Kitchen says an item is finished | 2–10 | **M T** | `availability.changed` (`02-F7`, `01-F22`) | ≤ 2 taps **from any screen** (`02-F7`) **[proposed]**; propagates < 1 s LAN (`01-F15`) | Yes |
| C23 | **Cancel that dish — it's already gone to the kitchen** | Customer changes mind post-KOT | 3–10 | **M** | `approval.requested` → `approval.granted` → `void.recorded` (`02-F8/F20`, `05-F5`) | Request ≤ 3 taps + reason tile **[proposed]**; machine portion of the round trip ≤ 2 s p95 (`05-N1`) | Yes — local manager-PIN path (`05-F8`) never needs WAN |
| C24 | **Take it off the bill — it was our mistake** (comp) | Complaint; remake | 2–8 | **M** | `approval.*` → `comp.recorded` (`02-F20`) | As C23 | Yes |
| C25 | **Give them a discount** | Regular; promotion; manager says so | 5–20 | **M** | `discount.recorded`; `approval.*` above org threshold (`02-F20`) | ≤ 3 taps below threshold **[proposed]** | Yes |
| C26 | **Change the price on this line** | Negotiated price; manager instruction | 0–5 | **M** | `order.line_price_overridden` + `approval.*` (`02-F20`) | As C23 | Yes |
| C27 | **Give the money back** | Refund on a settled order | 0–5 | **M T** | `payment.refunded` (+ linked `void.recorded` / `comp.recorded`) — **manager approval always** (`01-F29`, `02-F36`) | ≤ 5 taps after recall **[proposed]**; prints a refund slip | Yes |
| C28 | **Open the drawer without a sale** | Change for a customer; correcting a miscount | 0–10 | **M T** | `cash.drawer_opened {reason: no_sale}` + `audit.drawer_opened` (`02-F21`) — classic theft vector, counted | ≤ 3 taps incl. reason **[proposed]** | Yes |
| C29 | **Pay the vegetable man out of the drawer** | Supplier or petty cash at the door | 0–5 | **M** | `cash.paid_out` + photo ref; `approval.*` above threshold (`02-F26`, `05-F19`) | ≤ 5 taps + one photo **[proposed]** | Yes — photo uploads deferred (`02 §8`) |
| C30 | **The KOT didn't print** | S1 alarm on this device (`03-F5`) | 0–5 | **S** | ack → `audit.*`; reroute → `kot.reprint_requested` (`03-F6`) | Alarm within ≤ 10 s of retry exhaustion (`03-N3`); ack ≤ 1 tap; reroute ≤ 2 taps (`03-F6`) **[proposed]** | Yes |
| C31 | **Find that order again** | "Where is my food?"; reprint; refund | 10–30 | **A** | read-only fold (`02-F10`) | ≤ 3 taps or one numeric search **[proposed]** | Yes |
| C32 | **Mark that order ready** (only when the org assigns the ready signal to counter) | Food at the pass, no pass screen | 0 or ~150 | **T** | `order.line_state_changed → ready` (`02-F33`, `03-F24`) | **1 tap** marks all remaining lines (`03-F24`) | Yes |
| C33 | **Close my shift and count the drawer** | End of shift | 1–2 | **M** | `shift.closed` (`02-F23`) — cashier sees her own reconciliation | ≤ 6 taps: one numeric field per method + confirm **[proposed]**; over/short computed, never mentally | Yes |
| C34 | **Close the day** (manager-permission; cashier executes with manager PIN) | End of trading | 0–1 | **M** | `day.closed`, `cash.deposit_recorded` (`02-F24`) — **role guard** per `02-F22` | ≤ 6 taps **[proposed]** | Yes |
| C35 | **Hand the delivery to the rider / take his cash back** *(Wave 2)* | Rider ready / rider returns | 5–20 | **M** | `rider.assigned`; `rider.settled`, `cash.deposit_recorded` (`02-F34/F35`, `09-F5/F15/F17`) | Rider settlement **≤ 3 taps** (`21 §4` named) | Yes (`09-N6`) |
| C36 | **Log what we threw away** *(Wave 3)* | Spoiled or dropped food | 0–5 | **T** | `stock.wastage_recorded` (`10-F16`; cashier permitted, logged, Appendix A) | ≤ 4 taps + optional photo **[proposed]** | Yes |

**36 tasks.** Two are out of Wave 1 (C35 dispatch/rider settlement, Wave 2; C36 wastage, Wave 3); the other 34 are Wave 1.

### 2.3 The critical path

Five tasks. Everything else in §2.2 is secondary **by definition**, and that word is load-bearing: it means a proposal that makes any of these five slower in order to improve any of the other thirty-one is rejected without further argument.

| Rank | Task | Why | The number that governs it |
|---|---|---|---|
| 1 | **C5 — add an item** | ~300×/shift/cashier. Four times more frequent than any other action she performs. | Feedback < 100 ms (`02-N1`); 1 tap; tile ≥ 76 dp |
| 2 | **C9 — send it to the kitchen** | ~75×/shift, and it is the moment the sale becomes real | The 2-tap law (`21 §4`); confirm → printer < 2 s |
| 3 | **C11 — take money, give change** | ~60×/shift, **M**, and the only task where a wrong number leaves the building | ≤ 4 taps (`21 §4`); change computed (`27-F24`); 126 dp keypad |
| 4 | **C4 — start the order** | ~75×/shift; gates 1 and 2 | ≤ 2 taps |
| 5 | **C1 — unlock** | 20–60×/shift, and it gates *everything*. A slow or unreliable unlock taxes the whole shift invisibly. | Unlock < 1 s |

Note what is **not** on this path: C19 (accept a cloud order, ~15×/shift) and C23–C27 (the entire approval family, ~15×/shift combined). They are important, high-consequence, and secondary. **This is the Shopify trap in P2 stated in advance:** Shopify moved add-to-cart behind an explicit "+" button to fix accidental adds — *"we found that having an explicit button to add-to-cart would improve user confidence by almost 2x"* — and merchants replied *"you've taken a 1/10000 problem and now you have a much higher percentage"* and *"slow AS HELL"*. **Weigh frequency × cost, not the error you can instrument.** Any confirmation dialog, any extra tap, any "are you sure" added to C5 or C9 taxes the dominant path to fix a rare error, and the field has already run that experiment for us.

### 2.4 What the cashier must NEVER see

Each item is written as a checkable prohibition. Where an FR grounds it, it is cited; where none does, it is marked **[no FR — proposed]** and belongs in a spec PR to doc 02 §7's "deliberately not configurable" list.

1. **Any other cashier's shift, drawer, or reconciliation.** `02-F23` and Appendix A: *"cashiers see only their own shifts"*; cross-cashier views are manager/owner surfaces (`05-F20`, `12-F10`).
2. **Any sales report beyond her own shift.** Appendix A: *"View sales reports — own shift only."*
3. **Menu, price, recipe, or catalog editing.** `02 §1`: *"Catalog and configuration are never edited here"* — doc 14 owns it. This is also a `27-F4` matter: grid position is a compatibility contract, so an edit control at the terminal is a control that can break a compatibility contract from the till.
4. **Food cost, margin, or theoretical stock levels.** Doc 10 surfaces these to storekeeper/chef/manager; nothing in doc 02 gives them to the cashier. **[no FR — proposed]**
5. **An approve control for her own void/comp/discount.** She *requests* (`02-F20`); the grant is authorized on the manager device (`05-F6`) or by a manager PIN entered on hers. The distinction must be structural, not a permission check on an otherwise identical screen. **[no FR — proposed; `02-F20` implies but does not state it]**
6. **Any edit or delete of a recorded event.** Appendix A hard rule + `00 §5.5` + `01-F1`. There is no such control anywhere, for anyone, including the owner.
7. **Another branch's anything.** Org isolation is absolute (`00 §5.4`); branch scoping follows the permission matrix.
8. **Channel pause / throttle.** `05-F13/F14` place these on the manager console, and `05-F16` explicitly forbids pausing staff-operated channels at all — *"drowning there is a people decision, not a switch."*
9. **The analyst chat, nightly brief, exception alerts, or any owner report.** Doc 12/13 surfaces. The cashier is inside the data, not a reader of it.
10. **Autonomy-ladder proposals or approvals** (`action.proposed/approved`, doc 13). Those surface on manager console / back office / WhatsApp (`12 §1`).
11. **Rider location or route.** It does not exist (`09-N4`, concept scope law) and must not be implied by any placeholder.
12. **The raw event stream, sync internals, or conflict-resolution machinery.** She gets exactly one honest signal: outbox depth + last cloud ack (`02-F32`, `00 §5.7`), non-blocking. Not a log, not a retry queue, not a merge UI.
13. **Whole-customer-file browsing.** `02-F27` gives lookup *by the phone number of the caller in front of her*. Nothing authorises browsing every customer the org has. **[no FR — proposed; `01-F24` scopes data to the org but does not bound the cashier's read]**

### 2.5 The rush-hour scenario

> **Friday, 20:40.** Nine people at the counter, three of them ordering as a group and changing their minds. The phone has rung twice and is ringing again. The foodpanda tablet is beeping. A storefront order chimes S2 — that's the fourth unaccepted one, and the oldest just passed half its confirmation window, so it is about to escalate to **S1** (`21 §5`, `02-F9`). A waiter leans over the counter and says table 6 wants the karahi less spicy — the KOT already printed. Her hands: left hand has a five-hundred note in it, right hand is on the screen. She is on line 3 of a 7-line order.
>
> Then the grill printer goes offline. Three retries fail over 30 s (`03-F4`), and `03-F5` fires: *"the host device raises a loud alert — full-screen banner + repeating sound — naming the printer and order, repeating until acknowledged."* The host device is hers (`02 §1`, `03 §8`).

**What the system must not do to her, in order of how badly it would fail:**

1. **It must not throw away her half-built order to show her the alarm.** `03-F5` and the `21 §5` S1 law both permit a full-screen banner, and neither says what happens to the cart underneath. Seven lines of a Friday-night order are worth more than the milliseconds saved by not preserving them. **This needs a ruling** (§9 C5).
2. **It must not move anything.** Not the grid, not the confirm control, not the tab order, not one tile. `27-F4` makes grid position a compatibility contract and `21 §5` makes navigation stability a breaking-change gate — because *23 of 34 field subjects could not perform a task they knew well on a differently-arranged device*. At 20:40 she is not reading; she is executing a motor program.
3. **It must not make her type.** Not the customer's name, not a note, not a search term. Of 27 field subjects, **24 could not type a single word** (`27-F6`).
4. **It must not make her do arithmetic.** Not the change, not the split, not the discount, not the over/short. `27-F24`.
5. **It must not ask her to confirm anything on the dominant path.** See §2.3 on the Shopify finding.
6. **It must not stack four alarms.** `05-F4` disciplines the *manager's* alarm volume; nothing disciplines the POS's. Four unaccepted cloud orders, one printer, one late-order — the `21 §5` dedupe rule ("same-cause signals dedupe to one active interrupt") is per-cause, and these are six causes. **[gap — no FR bounds concurrent interrupts on the POS]**
7. **It must not put "remove line" or "void" where her thumb lands for "add item".** `27-F9`, and the counter is a wet-hand surface too (cash, glasses, spilled tea): **21.34% gesture error rate wet against 0.00% dry**, with the sensed touch point physically migrating toward the moisture.
8. **It must not block on sync.** Not for the accept, not for the confirm, not for the settlement. `00 §5.1`, `01-F17`.
9. **It must not go quiet about the printer.** Silent KOT failure is forbidden (`03-F5`) and that is correct — the alarm is not the problem. *Where the alarm lands* is.

---

## 3. KITCHEN / PASS

### 3.1 Who this person is

He is not going to touch the screen very often, and when he does his hands will be wet or greasy. This is the most hostile input environment in the building and it is quantified: **21.34% gesture error rate with wet hands against 0.00% dry**, water becomes a significant hindrance within about 20 seconds, and the sensed touch point physically migrates toward the moisture (RainCheck, ICMI '18, 4,320 gestures). Single swipes were misread as two-finger pinches. Grease, as distinct from water, has **no peer-reviewed study at all** (`27 §9.3`) — and grease is what a Pakistani kitchen actually has.

He reads the screen from **1–2 metres**, in motion, through steam, at a glance. `27-F27` specifies his type in cap-millimetres at a stated distance — never dp — with **30 arcmin for KDS primaries** as a safety factor for exactly these conditions. He is the role most likely to be a non-reader: the kitchen is where the least formally educated staff work, and the low-literacy law lands hardest here. Icons and numbers carry the screen; words are near-decorative. `27-F32`: semi-abstract line drawings, because photographs measured **worst** of five representation types.

His real interface is often **paper**. In T1 and much of T2 there is no screen in the kitchen at all — there are thermal printers and a spike of tickets (`03-F1..F3`). The pass screen is *"one cheap Android tablet at the pass"* (`03 §1`) — which `27-F28` says cannot be a KDS at all: a 10" tablet holds ~9.5 item lines at 1.5 m, about 1.5 tickets, and **more pixels change nothing because only physical height buys capacity**; 22" is the hardware floor. That contradiction is unresolved (§9 C1) and it decides whether this role has a usable screen.

Interruptions are his baseline state: he is cooking three things, a waiter is asking about table 6, a delivery just arrived at the back door, and the fryer needs attention. He looks at the screen for one second at a time, and `03-F23` is the law that respects this — **sequencing is visibility only**: no auto-prioritisation, no reordering, no "cook this next" prompts, at any tier, ever. The chef decides. This is the strongest anti-scope statement in the entire corpus and it should be treated as the model for the others.

### 3.2 Task inventory

Frequencies are for the reference shift's **pass person** (whole branch); station-level figures are given where T3 splits the work.

| # | Task (his words) | Trigger | Freq / shift | Crit | Events (`01 §4`) | Budget | Offline |
|---|---|---|---|---|---|---|---|
| K1 | **See what's cooking and what's next** | Continuous | ~continuous (a glance every 10–30 s) | **S** | *consumes* `order.confirmed`, `order.line_added`, `order.note_added` | **Glance: 1–2 s** (`21 §4`); **0 taps**; render of an incoming change < 1 s LAN (`03-N4`, `01-F15`) | Yes |
| K2 | **Read the ticket off the printer** | KOT prints | ~150 (T1/T2 printer-only kitchens) | **S** | *consumes* `kot.printed` | Confirm → first byte < 2 s (`03-N1`); notes visually emphasised (`03-F3`) | Yes — paper is the offline mode |
| K3 | **Mark this line done / bump my station** | Food is ready | **~600 lines** branch-wide; ~200/station at T3; ~150 order-level marks at the pass | **S T** | `order.line_state_changed → ready` (`03-F16`, `03-F19`) | **1 tap** (`03-F16/F19` both state one tap). ⚠ **No touch minimum exists for this surface** — see §9 C4 | Yes |
| K4 | **Un-bump — that wasn't ready** | Mis-tap (wet hands: 21% error) | 5–20 | **T** | new `order.line_state_changed` — never an edit (`03-F19`, within 2 min, logged) | ≤ 2 taps **[proposed]**; **must not be adjacent to K3** (`27-F9`) | Yes |
| K5 | **Get back the order I cleared by mistake** | Wrong bump discovered late | 2–10 | **T** | recall strip = read + a new state event (`03-F17`, last 20 orders) | ≤ 2 taps **[proposed]** | Yes |
| K6 | **Karahi khatam — stop selling it** | Ingredient runs out | 2–10 | **M T** | `availability.changed` (`03-F16`, `01-F22`) | ≤ 2 taps **[proposed]**; propagates < 1 s LAN (`01-F15`) | Yes |
| K7 | **See if this order is complete** ("2 of 3, waiting on naan") | Assembling at the pass | ~150 | **S T** | *consumes* `order.line_state_changed` across stations (`03-F15`, `03-F20`) | Glance 1–2 s; 0 taps | Yes |
| K8 | **See which order is going late** | Continuous | ~continuous | **T** | *consumes* aging fold from `order.confirmed` (`03-F14`) | 0 taps; colour + shape + position + a number (`27-F12`), on a monotonic lightness ladder (`27-F15`) | Yes |
| K9 | **Read the note on the ticket** ("less spicy") | Per order carrying one | 10–40 | **T** | *consumes* `order.note_added` (`03-F3` — visually emphasised) | 0 taps; legible at 1–2 m (`27-F27`) | Yes |
| K10 | **See only my station's work** *(T3)* | Continuous | ~continuous | **A** | station map filter (`03-F18`); own open-line count only (`03-F21`) | 0 taps | Yes |
| K11 | **Get another copy of this ticket** | Ticket lost, soaked, or torn | 2–10 | **S** | `kot.reprint_requested` (`03-F7`) | ⚠ **No FR gives the pass or station screen a reprint control** — see §10.1 G5 | Yes |
| K12 | **Record what we made** (prep/production) *(Wave 3)* | Batch of boti finished | 2–8 | **T** | `stock.production_recorded` (`10-F9`) | **2 taps** (`10-F9` states two-tap entry) | Yes |
| K13 | **Confirm tonight's prep list** *(Wave 3/4)* | Nightly suggestion | 1 | **A** | the confirmation *is* the production entry (`10-F23`) — no separate ack | ≤ 3 taps **[proposed]** | Yes |
| K14 | **Log what we threw away** *(Wave 3)* | Spoilage, burnt batch | 0–5 | **T** | `stock.wastage_recorded` (`10-F16`) | ≤ 4 taps + optional photo **[proposed]** | Yes |
| K15 | **Check what we've used today** *(Wave 3)* | Chef's own check | 0–2 | **A** | read-only consumption view (`10 §3`, Appendix D) | Glance | Yes |
| K16 | **Clock in** *(Wave 3)* | Shift start | 1–2 | **A** | `staff.clocked_in` (`11-F1`) | 1 tap on the PIN session already needed | Yes (`11-F3`) |

**16 tasks — five of them Wave 3.** The Wave 1 kitchen inventory is **eleven tasks, of which six are pure reads (K1, K2, K7, K8, K9, K10) and one (K3) is the overwhelming majority of all touches.** That is the whole role. Any Wave 1 kitchen screen that offers a twelfth capability is feature tourism under `21 §5`.

### 3.3 The critical path

| Rank | Task | Why | The number that governs it |
|---|---|---|---|
| 1 | **K3 — mark a line done** | ~600 line events branch-wide. **The only frequent touch this role makes, in the worst touch environment in the building.** | 1 tap; ≥ ? dp — **undefined, and this is the single most consequential missing number in Wave 1** (§9 C4) |
| 2 | **K1 — see what's cooking** | Continuous. The screen's entire reason to exist. | Glance 1–2 s; < 1 s to render a change; visual order **must** be work order (`27-F7`, `03-F13`) |
| 3 | **K7 — is this order complete?** | ~150×. The pass person's core judgement. | Glance 1–2 s |
| 4 | **K8 — what's going late?** | Continuous, and it is why colour exists on this screen at all | Preattentive: lightness ladder, fill-carried (`27-F15`) |
| 5 | **K6 — 86 an item** | Only 2–10×/shift, but **M**: every minute of delay sells food that does not exist across every channel | ≤ 2 taps; < 1 s propagation |

K6 is on this list on consequence, not frequency, and that is an honest exception to the "hundreds of times" rule rather than a fudge of it.

### 3.4 What the kitchen must NEVER see

1. **Any money.** No prices, no line totals, no bill total, no payment method, no discount, no COD amount. `03-F13`'s card contents are order number, channel badge, table, age, line summary — money is absent, and that absence must be enforced rather than incidental. `27-F16` reinforces it from the other direction: colour on a number means abnormal, and a bill total on a bump screen is noise competing with the aging signal. **[no FR states the prohibition — proposed for doc 03 §7]**
2. **Customer name, phone, or address.** The KOT layout (`03-F3`) has order number and table/channel. A delivery ticket does not need an address; the rider gets it (`09-F10`). **[no FR — proposed]**
3. **Any "cook this next" instruction, priority score, or reordered queue.** `03-F23`, verbatim: *"The system never dictates cook order: no auto-prioritization, no reordering of the queue, no 'cook this next' prompts — at any tier, ever."* This is the model anti-scope clause.
4. **Other stations' load.** `03-F21`: a station screen shows its own open-line count *"and nothing about other stations' load — visibility without cross-station pressure games."*
5. **ETA estimates or quoted times.** `03 §3` is explicit: the timing pipeline is defined in doc 03 but *"ETA display belongs to docs 04/06/13"* — never here. The kitchen is where estimates are *generated* (`03-F26`, silently, from ready-marks) and it is the one surface that must never display them, because a displayed target becomes a quota.
6. **Voids, comps, discounts, approvals.** Not the request, not the outcome. Post-KOT void reaches the kitchen as a physical instruction from a human, not a notification.
7. **Any report or analytics — including his own throughput.** `03-F21`'s reasoning generalises: per-person speed on a shared screen is a pressure game.
8. **Order-entry capability.** The kitchen does not create or edit orders. Availability toggle (K6) is the sole write into the order plane and it is deliberate (`01-F22`).
9. **Settings, printer configuration, or the station map.** Layer-3 device config exists (`03 §7`) but belongs to whoever installs the device, not to the person cooking. **[boundary unstated — proposed]**
10. **Sync internals.** Same rule as the cashier: one honest indicator, non-blocking, nothing more.

### 3.5 The rush-hour scenario

> **Friday, 21:15.** Twenty-two open orders. Three are red. Two of the red ones are foodpanda and one is a table that has been waiting 34 minutes because its naan was bumped by mistake at 20:50 and nobody noticed. The tandoor man is shouting for a count. There is steam across the pass and the screen has a film of grease on the lower third — the part nearest the counter, where hands rest. The pass person has a tray in his left hand. He has one finger free and about one second of attention.
>
> Twenty-two tickets. `27-F28` says a 10" tablet holds about **1.5 tickets** at 1.5 m; a 22" panel holds three. So somewhere between 19 and 20.5 of those orders are not on the screen.

**What the system must not do to him:**

1. **It must not require him to scroll to reach the oldest ticket.** `27-F2`: *"no primary action may require scrolling to reach"*, and nearly half of field subjects did not know content existed below the fold. But `03-N4` explicitly budgets for *"a queue of 40 open orders scrolls without dropped input."* **These two are in direct contradiction and the kitchen is where it bites** (§9 C2). Whatever the ruling, the design must make "the oldest ticket is reachable" true — because `27-F7` says a list's visual order must be its work order, and a work order you cannot reach is not a work order.
2. **It must not reorder the list.** Not by priority, not by station, not by "smart" anything (`03-F23`). If ticket 4 is third from the left at 21:15:00 it is third from the left at 21:15:01, unless a ticket ahead of it cleared.
3. **It must not put the un-bump next to the bump.** `27-F9`, with the wet-hand centroid shift. A mis-bump at 21:15 costs a table 34 minutes — which is exactly what already happened at 20:50 in this scenario.
4. **It must not encode "late" in hue alone.** `27-F17`: assume 1 in 20 male staff is deutan and does not know it; the naive traffic-light palette measures **ΔE00 8.2** under deuteranopia — a near-identical olive. `27-F15`: the lightness ladder, carried by the **fill**, never a dot or a thin rule, because at 1–2 m a thin stroke contributes almost nothing to the priority map.
5. **It must not rely on colour surviving the room.** `27-F18`: ambient contrast falls 86:1 → 1.3:1 at 500 lux and red desaturates first. Colour is the **third** channel — after position and number.
6. **It must not require him to read a sentence.** Icons and numerals, at 30 arcmin (`27-F27`).
7. **It must not lose his bump because the WAN is down.** `03-N5`, `00 §5.1`.
8. **It must not make him walk to the counter to reprint a lost ticket** — which, today, it does, because no FR gives him a reprint control (§10.1 G5).

---

## 4. BRANCH MANAGER

### 4.1 Who this person is

He is the only role whose device is genuinely *personal* and whose location is genuinely *unknown*. `05 §1`: the console runs on the manager's own phone and *"replaces walk-to-counter interruptions with interrupts that come to the manager."* At 21:00 on a Friday he is on the floor apologising to a table, in the kitchen counting naan, at the back door taking a delivery, or at home. `05-F22` makes remote a first-class mode, with the honesty tax attached: every screen shows last-synced age and *"branch offline — last seen 12 min ago"* is a thing it must say plainly.

He is literate and numerate — the most reliably so of the branch roles. This does **not** license text density: `27-F51` names him as the archetype of the **intermediary**, the person who operates the system on behalf of staff who cannot. He is the one holding a waiter's phone showing him where to tap, entering a PIN on a cashier's till, reading a screen aloud to a chef. Second-order usability — usability for a beneficiary via a helper — is his real job and no heuristic in the corpus covers it.

His phone is one-handed, thumb-reach, 64 dp minimum (`27-F8`), possibly iOS (`05-N3`, `05 §8` — APNs matters). He is interrupted by construction: the console's entire purpose is to interrupt him, and `05-F4` exists because the failure mode is a siren wall — *"The console must stay useful during a bad rush, not become a siren wall."*

His tasks are almost all **latency-critical and low-frequency**, which makes him the clearest case in this document where "must be fastest" is decided by consequence rather than count.

### 4.2 Task inventory

| # | Task (his words) | Trigger | Freq / shift | Crit | Events (`01 §4`) | Budget | Offline |
|---|---|---|---|---|---|---|---|
| M1 | **Approve the void** | `approval.requested` interrupt (`05-F5`) | 5–20 | **M S** | `approval.granted` / `approval.denied` (`05-F6/F7`) | Machine portion ≤ 2 s p95 (`05-N1`); **≤ 2 taps + PIN [proposed]**; card must carry enough context to decide without walking (`05-F5`) | Yes on LAN; remote needs WAN; **POS local-PIN fallback always** (`05-F8`) |
| M2 | **Approve the comp / the big discount / the price override** | Same | 5–15 | **M** | as M1, `approval_type` per `05-F7` | as M1 | as M1 |
| M3 | **Approve the paid-out** *(W4)* | `cash.paid_out` above threshold | 0–5 | **M** | `approval.*` with receipt photo inline (`05-F19`) | ≤ 3 taps + PIN **[proposed]** | as M1 |
| M4 | **Acknowledge the late-order alarm** | Order crosses red (`03-F14`) | 5–40 | **T** | `audit.*`, hash-chained (`05-F2`) | Delivery ≤ 2 s LAN (`05-N2`); ack **1 tap** **[proposed]**; never auto-dismissed (`05-F2`) | Yes on LAN |
| M5 | **Acknowledge the printer alarm** | `kot.print_failed` / `printer.status_changed(offline)` | 0–5 | **S** | `audit.*` (`05-F3`) | as M4 | Yes on LAN |
| M6 | **Glance — is the branch OK?** | Whenever he picks up the phone | 10–50 | **T** | read-only fold (`05-F21`) | **Glance 1–2 s** (`21 §4`); *"a glance, not a dashboard"* (`05-F21`) | Cached + age label (`05-F22`) |
| M7 | **Look at the floor** *(W4, T3)* | Seating question; "which table is that?" | 10–30 | **A** | *consumes* `table.state_changed` (`05-F10`) — **read-only except needs-bill ack** (`05-F11`) | Glance | Yes on LAN |
| M8 | **Check if the kitchen is drowning** *(W4)* | Reds accumulating; his own instinct | 2–10 | **T** | channel-pulse fold (`05-F12`) | Glance 1–2 s | Yes (computed on-device, `05 §8`) |
| M9 | **Pause foodpanda — we can't cope** *(W4)* | Kitchen overloaded | 0–3 | **M T** | `channel.paused` (+ `channel.resumed` by timer) (`05-F13`) | ≤ 4 taps incl. reason + auto-resume **[proposed]** | ⚠ **Degraded** — the aggregator push (`08`) needs WAN; the event is local. Honesty state unspecified |
| M10 | **Stretch the quoted times** *(W4)* | Same | 0–3 | **T** | `channel.throttled` (`05-F14`) | ≤ 4 taps **[proposed]** | as M9 |
| M11 | **Open the day** *(W4; POS fallback always)* | Start of trading | 0–1 | **M** | `day.opened` (`05-F18`, boundary `05-F17`) | ≤ 4 taps + numeric float **[proposed]** | Yes |
| M12 | **Close the day, count, record the deposit** *(W4)* | End of trading | 1 | **M** | `day.closed`, `cash.deposit_recorded` (`05-F18`) | ≤ 8 taps + numeric fields **[proposed]**; **blocked while any rider has delivered-unsettled orders** (`09-F18`) | Yes |
| M13 | **See how the cashiers came out** | Each `shift.closed` | 2–4 | **M** | *consumes* `shift.closed` (`05-F20`) — variance beyond threshold highlighted | Glance; cashier's own view unchanged (`02-F23`) | Yes on LAN |
| M14 | **Settle the rider's cash** *(W2)* | Rider returns | 1–5 | **M** | `rider.settled`, `cash.deposit_recorded` (`09-F15/F17`) | **≤ 3 taps** (`21 §4` named); manager PIN above the over/short threshold (`09-F16`) | Yes (`09-N6`) |
| M15 | **Decide what to do with the failed delivery** *(W2)* | `rider.delivery_failed` | 0–3 | **M** | re-dispatch (`rider.assigned`), convert to pickup, or void via approval (`09-F18`) | ≤ 4 taps **[proposed]**; day close blocked until decided (`09-F18`) | Yes |
| M16 | **Answer the customer's WhatsApp message** *(W2)* | Support routing (`07-F9`) | 0–20 | **T** | ⚠ **`whatsapp.inbound_received` / `outbound_sent` — not in the `01 §4` catalog** (`05-F24`) | ≤ 3 taps to reply **[proposed]**; unanswered past threshold raises an alarm (`05-F25`) | **No** — WhatsApp is a cloud rail. Degradation unspecified |
| M17 | **Walk over and approve at the till with my PIN** | Phone dead, absent, or WAN down | Inverse of M1's success rate | **M S** | `void/comp/discount.recorded` with approver (`02-F20`, `05-F8`) | ⚠ **No budget named anywhere** — see §10.1 G11 | Yes |
| M18 | **Sort out the double-opened table** | Conflict badge (`01-F19`, `04-F12`) | 0–3 | **A T** | merge or reassign via new events — nothing auto-discarded | ≤ 4 taps **[proposed]** | Yes |
| M19 | **Take an item off the menu for tonight** | Kitchen tells him | 0–5 | **M T** | `availability.changed` (`05 §2`) | ≤ 2 taps **[proposed]** | Yes |
| M20 | **Check the checklist got done** *(W3)* | Open/close ritual | 1–2 | **A** | *consumes* ⚠ `checklist.item_checked` / `checklist.completed` — **not in the `01 §4` catalog** (`11-F15/F16`) | Glance | Yes |

**20 tasks.** Wave 1 core is M1, M2, M4, M5, M6, M17, M19 — **seven tasks.** That is the entire Wave 1 manager console, and `05-F21` already says so: *"the console exists for acting in the next sixty seconds."*

### 4.3 The critical path

**The manager has no hundreds-per-shift task, and pretending otherwise would produce a worse console.** His critical path is defined by **latency under interruption** — the time between the phone buzzing in his pocket and the branch being unblocked — not by repetition. Stating this honestly is more useful than manufacturing a frequency ranking.

| Rank | Task | Why | The number that governs it |
|---|---|---|---|
| 1 | **M1/M2 — approve** | The only task where the manager's speed directly blocks a cashier and a customer | Machine portion ≤ 2 s p95 (`05-N1`); ≤ 2 taps + PIN; `05-F8` 30 s fallback timeout |
| 2 | **M6 — glance** | 10–50×/shift, the highest-frequency thing he does, and the only one that competes for the 1–2 s budget | Glance 1–2 s (`21 §4`) |
| 3 | **M4/M5 — acknowledge** | 5–45×/shift combined; ack latency decides whether the console is usable or a siren wall (`05-F4`) | ≤ 2 s delivery (`05-N2`); 1 tap |
| 4 | **M17 — walk over and approve at the till** | **The dominant path whenever his phone is in his pocket, dead, or he is off-LAN.** It is specified only as a fallback and budgeted nowhere. | ⚠ none — §10.1 G11 |
| 5 | **M14 — settle the rider** *(W2)* | **M**, and the cash goes home with a person if it is wrong | ≤ 3 taps (`21 §4` named) |

M17 deserves the explicit call-out: `05-F8` and `05-N4` correctly design for the console being absent, but a fallback that is used often is not a fallback — it is a path. If pilots show the phone is unreachable 30% of the time, M17 is the manager's second-most-important task and it has no budget, no inventory entry in doc 02, and no screen of its own.

### 4.4 What the manager must NEVER see

1. **Deep analytics, reports, exports, or trend history.** `05-F21`, verbatim: *"Deep analytics stay in doc 12 — the console exists for acting in the next sixty seconds."* The single clearest anti-scope line in the corpus after `03-F23`.
2. **Configuration of any kind.** Thresholds, printer routing, station maps, roles, menu, prices, recipes, alert settings — all doc 14. `05 §7` lists what he may adjust; everything else is somebody else's surface.
3. **A pause control for dine-in or phone entry.** `05-F16`, explicit and deliberate: staff-operated channels cannot be paused — *"drowning there is a people decision, not a switch."*
4. **An edit control on any recorded decision.** `05 §7`: *"editing any recorded decision (append-only)"* is deliberately not configurable. A denied approval stays denied; the correction is a new request.
5. **An unlogged or PIN-less approval.** `05 §7`. If the PIN step is ever skippable, the entire attribution chain (`02-F19`, `01-F5`) is decorative.
6. **Another branch.** Appendix A scopes his reports to his own branch. A multi-branch manager is a permission question doc 14 owns, not a console feature. **[boundary unstated — proposed]**
7. **Cross-org anything.** `00 §5.4`.
8. **Autonomy-ladder autonomous actions presented as his to approve, before doc 13's maturity rules allow it.** `05 §9.3` records this as open — until it closes, the console must not host a rung it has not earned.
9. **The cashier's own reconciliation screen, replacing hers.** `05-F20` is precise: the console *adds* the manager's cross-cashier view; *"nothing about it replaces the cashier's own screen."* The "I'm clean" framing belongs to her.
10. **Rider location.** Does not exist (`09-N4`).
11. **Stale state rendered as live.** `05-F22`, `00 §5.7` — and this is a *never see* in the strict sense: not "he shouldn't look at it" but "the system must never draw it."

### 4.5 The rush-hour scenario

> **Friday, 21:15.** He is standing at table 11 apologising for a 30-minute wait, phone in his left hand, his right hand on the back of a chair. In the next ninety seconds: a red late-order alarm fires for table 6 (repeating, S1); the grill printer goes offline and raises a second S1; a cashier requests a void-after-KOT on a 2,400-rupee line; a customer WhatsApp message goes unanswered past the org threshold and raises a third alarm; and his phone is at 11%.
>
> He has one thumb, a customer's face in front of him, and about four seconds.

**What the system must not do to him:**

1. **It must not present four alarms as four alarms.** `05-F4` disciplines repeated crossings of the *same* order — *"one alarm per order per threshold crossing"* — but these are four distinct causes and `21 §5`'s dedupe is by same-cause. Four simultaneous S1s on a phone screen is a siren wall, which is precisely the failure `05-F4` was written to prevent and does not currently prevent. **[gap — no FR bounds concurrent alarms across causes]**
2. **It must not make him walk to the counter to find out what the void is for.** `05-F5` requires requester, order/line refs, item names, amounts, stated reason, and context *"enough to decide without walking over."* At table 11 that requirement is the whole feature.
3. **It must not let him approve without showing him how old the data is.** `05-F9`: the remote approval card shows data age *before* he commits. A 2,400-rupee void approved against 4-minute-old state is a money decision made on fiction.
4. **It must not require both hands or a precise target.** 64 dp thumb minimum (`27-F8`), one-hand reach.
5. **It must not go silent and let that read as calm.** `05-F23`: while the branch is offline the console shows the alarm **gap** honestly — *"alarm silence is labeled as unknown, not calm."* This is one of the best lines in the corpus and it must survive into the UI unweakened.
6. **It must not die with his battery and take the branch with it.** `05-N4`: console offline costs the branch nothing; every console flow has a POS fallback. Which makes M17 a real task (§4.3), not a footnote.
7. **It must not put the deny control where his thumb lands for approve.** `27-F9` again — his hands are dry but his attention is not.

---

## 5. OWNER

### 5.1 Who this person is

He is not in the restaurant. That is the defining fact: the owner app is **cloud-fed and is not a branch-LAN participant** (`12 §1`), which means every single thing it shows him is, structurally, a claim about somewhere else at some earlier moment. `12-F8` makes the honesty non-negotiable and non-configurable: every tile shows last-synced age whenever the newest received event is older than 60 s.

He looks at his phone for **two to five seconds**, often at 23:30, often while doing something else, often having been woken by a push. The glanceability research behind `21 §4` is unambiguous: key message in 1–2 s, >70% of dashboard sessions are ~5 s, **one emphasized number per view**. `27-F25` supplies the type consequence — numbers are the operational payload and the largest element in their region.

He is literate and numerate — the one role where that is safe to assume — and he still will not read a paragraph on a phone at 23:30. `12-F12` gets this right structurally: the narrative *is* the doc 13 brief and the numbers on screen come from the same semantic-layer metrics, so brief and screen can never disagree.

He may hand the phone to someone (`12 §9.2` records lock-screen headline numbers as an open privacy question — owner phones get passed around). He may be in a car, in sunlight (`27-F20`: at 80,000 lux everything collapses to ~1.8:1 and polarity is irrelevant), or at a wedding.

And he is, by module law, a **reader**. `12-F26`: no screen in the app offers creation, edit, or deletion of operational or configuration data; the only writes are alert acknowledgements and analyst chat messages, asserted by automated test. This is the strongest anti-scope law in the corpus, already written, already testable, and it should be the template for every other role's §.4 section.

### 5.2 Task inventory

Frequency is **per day**, not per shift — the owner's rhythm is not a shift.

| # | Task (his words) | Trigger | Freq / day | Crit | Events (`01 §4`) | Budget | Offline |
|---|---|---|---|---|---|---|---|
| O1 | **How are we doing today?** | Picks up the phone | 3–15 | **A T** | *read model* over `order.*`, `payment.recorded` (`12-F5`) | **Glance 1–2 s** (`21 §4`); cached load < 2 s, cold on 4G < 5 s (`12-N1`); refresh ≤ 60 s while foregrounded | **Cloud plane** — renders from cache with an age label (`12-N3`); never blank, never a forever-spinner |
| O2 | **Is that number real, or is the branch offline?** | Every viewing of O1 | with O1 | **T** | last-received-event age (`12-F8`) | 0 taps — **always visible, not configurable** (`12 §7`) | n/a — this *is* the offline behaviour |
| O3 | **Read the nightly summary** | Push on `day.closed`, or the 23:30 deadline | 1 per branch | **A M** | *consumes* `brief.generated`; renders `12-F10`'s blocks | Push within 5 min of `brief.generated` p95 (`12-N2`); summary readable in ≤ 30 s **[proposed]** | Cached; provisional banner when the day never closed (`12-F9`) |
| O4 | **How many orders are open right now?** | Curiosity; a manager's phone call | 2–10 | **A** | `12-F6` | Glance | Cached + age |
| O5 | **Compare my branches** | Multi-branch orgs | 1–5 | **A** | `12-F7`, `12-F22` — identical tile structure regardless of org size | Glance per tile | Cached + age |
| O6 | **What's odd?** — read an exception alert | `alert.raised` push (`13`) | 0–5 | **M T** | *consumes* `alert.raised`; evidence per `12-F16` | Push visible p95 < 2 min (`12-N2`); evidence readable ≤ 15 s **[proposed]** | Cached |
| O7 | **Acknowledge it** | Having read O6 | 0–5 | **A** | **`alert.acknowledged`** — *the app's only operational write* (`12-F17`) | 1 tap **[proposed]**; idempotent queued request (`12 §5`) | Queued offline against an idempotent endpoint (`12 §5`) |
| O8 | **Which items actually make money?** *(W4)* | Weekly-ish | 0–1 | **A** | item-profitability report (`12-F19`); *"no recipe"* rather than a fabricated cost | Load < 2 s cached (`12-N1`) | Cached |
| O9 | **Send it to my accountant** *(W4)* | Month end | 0–1 | **A** | `audit.export_requested`; server-side render + signed URL (`12-F20`) | ≤ 4 taps to share **[proposed]**; no partial files, ever (`12 §4`) | **No** — server-rendered. Failure shows a retry notice |
| O10 | **Ask why today was slow** *(W4)* | Curiosity, usually at night | 0–5 | **A T** | analyst chat (`12-F23`); roman-Urdu input accepted, English answers (`07-F22`) | Streaming answer; cited chips deep-link to reports (`12-F23`) | **No** — cloud brain. `12-F24`: a refusal renders as a refusal, never re-worded into a number |
| O11 | **What does he still owe me?** (advances/baqaya) *(W3)* | Payroll; a request | 0–2 | **M** | read-only over `staff.advance_recorded/repaid` (`12-F27`) | Glance + drill-in | Cached |
| O12 | **Who turned up today?** *(W3)* | Morning | 0–1 | **A** | read-only over `staff.clocked_in/out` (`12-F28`) | Glance | Cached |

**12 tasks. One write.** The whole app.

### 5.3 The critical path

**Nothing the owner does happens hundreds of times.** His critical path is a *duration*, not a count: the **two-second glance**, and whether what he sees in it is true.

| Rank | Task | Why | The number that governs it |
|---|---|---|---|
| 1 | **O1 — today's number** | 3–15×/day, and it is the reason the app is installed | Glance 1–2 s; one emphasized number per tile (`21 §5` owner law); cached < 2 s (`12-N1`) |
| 2 | **O2 — is it true?** | Rides on every instance of O1. **If this fails, O1 is worse than useless — it is a confident lie.** | `12-F8`, non-configurable |
| 3 | **O3 — the nightly summary** | Once a day, and it is the product's main promise to the person who pays for it | Push ≤ 5 min p95 (`12-N2`) |
| 4 | **O6/O7 — alert and acknowledge** | The theft-detection value proposition, end to end | Push p95 < 2 min (`12-N2`) |

O2 outranks everything except the number it qualifies, and that ordering is deliberate: `12-F8`, `05-F22/F23`, `06-F18` and `00 §5.7` are one law seen from four surfaces, and the owner app is where breaking it is most tempting and most damaging.

### 5.4 What the owner must NEVER see — or do

The owner's anti-scope is unusual: it is not about hiding information (he may see almost everything) but about **removing the ability to act**. `12-F26` states it and tests it.

1. **Any create, edit, or delete of operational or configuration data.** `12-F26`, with an automated test asserting the API client has no mutating endpoints beyond `alert.acknowledged`, chat messages, and its own device/session lifecycle. This is the model for how every anti-scope in this document should eventually be enforced.
2. **Approving a void, comp, discount, or paid-out.** Those are manager-console interrupts (`05-F5`). If the owner wants to approve something he uses a manager-scoped surface — the owner app links out (`12 §1`).
3. **Editing history.** Appendix A hard rule: *"no role, including owner, can silently edit or delete historical transactions."* The word "including owner" is the entire theft-detection value.
4. **Configuration — thresholds, quiet hours, commission rates, users, menu, recipes.** `12-F15`: thresholds are *"configured in doc 14, never in this app."*
5. **A custom report builder or owner-defined metrics.** `12 §7`, deliberately not configurable: *"the report set — no custom report builder, no owner-defined metrics (metrics change only via the doc 13 registry)."* Doc 12 ships **exactly three reports** (`12-F19`) and that number is a design commitment, not a starting point.
6. **A fabricated number in place of a missing one.** `12-F11`: the margin line is omitted when recipe coverage is below the `13-F5` precondition — *"never guessed, never shown as zero."* `12-F24`: a "not enough data yet" answer renders as-is; the UI never re-words a refusal into a number.
7. **An interpolated or projected figure for an offline branch.** `12 §4`: *"No interpolation or projection is ever shown."*
8. **Two orgs blended in one view or one export.** `12-F3`.
9. **The raw event stream.** He gets read models and the semantic layer (`12-F21`: one number, everywhere). A raw-event view would let two numbers exist for one question, which is exactly what `12-F21` prevents.
10. **Live rider tracking or floor-level micromanagement.** No GPS exists (`09-N4`); floor state is the manager's surface (`05-F10`).
11. **Another owner's org, or platform-admin capability.** `12-F2`, `12-F3`, doc 15.

### 5.5 The rush-hour scenario

The owner's worst moment is not the rush — it is **the hour after it**, or the middle of it seen from somewhere else.

> **Friday, 21:40.** He is at a family wedding, two hours from the branch, phone in his sherwani pocket on silent-but-vibrate. It buzzes: **cash variance beyond threshold at shift close, Branch 2** (`12-F14`). He opens the app in a corridor, in bad light, with people talking to him. Branch 1's tile says *"last synced 41 minutes ago"* — its WAN died at 21:00 (`12-F8`). Branch 2's alert cites a figure and names a cashier.
>
> His instinct is to fix it from where he is standing.

**What the system must not do to him:**

1. **It must not let him act.** Not void something, not reverse something, not "correct" the variance, not message the cashier from the alert. `12-F26`. Everything the alert can offer is a link-out to the surface where a manager, at the branch, with the drawer in front of them, does it. The most valuable thing this app does at 21:40 is refuse.
2. **It must not show Branch 1's 21:00 figures as tonight's takings.** `12-F8`, `12 §4`. A frozen number with a 41-minute age label is honest; the same number without it is a lie he will act on Monday.
3. **It must not name a thief.** `12-F16` gives evidence — cited metric values, entities, window, deep link. `10-F19`'s framing generalises: attribution *hints*, never accusation — *"narrows suspicion without accusing."* An alert that reads as an accusation, sent to an owner at a wedding, ends someone's employment on a threshold.
4. **It must not require reading in bad light in a corridor.** One emphasized number (`21 §5` owner law), largest element in its region (`27-F25`), light theme (`27-F19`).
5. **It must not re-nag after he acknowledges.** `12-F17`: acked in-app stops the WhatsApp nag and vice versa. Critical alerts re-notify **once** after 30 min, then fold into the next brief (`12 §4`).
6. **It must not put headline figures on his lock screen without him choosing that** — he is about to hand this phone to a relative to show them a photo (`12-F4`, `12 §9.2`).

---

## 6. WAITER / CAPTAIN *(Wave 4)*

### 6.1 Who this person is

He is holding something. Almost always: a tray, three plates, a jug, a bill folder. The handheld is operated **one-handed with a thumb**, which is the one posture the touch literature covers well — 9.2–9.6 mm, giving `27-F8`'s **64 dp** handheld minimum, with measured error at 9.6 mm of 2.8% and **no significant accuracy gain above it**. Past ~10 mm he is buying speed, not accuracy.

The phone is **his own** (`04 §1`: BYOD explicitly supported) and probably old and cheap — hence `04-N1`'s budgets: APK ≤ 40 MB, installed ≤ 120 MB, slice ≤ 100 MB, RAM ≤ 250 MB — and `04-N4`'s battery rule: an 8-hour shift consumes ≤ 15%, no persistent wake locks. He is walking while using it, in variable light, sometimes outdoors, in noise. `04-N2` sets cold start ≤ 4 s — tighter than the POS's 6 s — with the reason stated: *"waiters open the app mid-conversation at the table."* That sentence is the whole ergonomic brief for this role.

Literacy: mixed and unassumable. He reads a table number and an item position; numerals and grid position carry him (`27-F4`, `27-F22`). `27-F6` matters acutely here — he cannot type at a table with a tray in one hand even if he can type.

He is interrupted mid-task by definition: the guest changes their mind while he is entering the order. And `04 §1` is unusually clear about what this role is *for* — *"The handheld deliberately does less than the POS"* — with an explicit not-on-it list. It is the best-scoped role in the corpus.

### 6.2 Task inventory

Frequencies per waiter, reference T3 shift (~8 tables in section, ~30 orders).

| # | Task (his words) | Trigger | Freq / shift | Crit | Events (`01 §4`) | Budget | Offline |
|---|---|---|---|---|---|---|---|
| W1 | **Seat them** | Guests sit down | 10–40 | **A** | `table.state_changed {seated}` (`04-F10/F11`) — one of only three manual transitions | ≤ 2 taps **[proposed]** | Yes (LAN) |
| W2 | **Take the order** | Guests are ready | ~30 | **S** | `order.created`, `order.line_added`, `order.confirmed` (`04-F6`) | **≤ 2 taps grid→confirm** (`04-F6`, `00 §5.6`); persisted before UI ack (`01-F2`) | Yes (LAN mesh) |
| W3 | **Add another item to the table's order** | "One more naan" | 20–60 | **S** | `order.line_added` + a fresh `order.confirmed` for the new lines — incremental KOT (`04-F8`) | 1 tap per item **[proposed]** | Yes |
| W4 | **Tell the kitchen "less spicy"** | Guest asks | 10–30 | **T** | `order.note_added` (`04-F6`, quick-tags shared with `02-F6`) | ≤ 2 taps, tiles only (`27-F6`) **[proposed]** | Yes |
| W5 | **Check the karahi is still on** | Before promising it | ~continuous | **M T** | *consumes* `availability.changed` — greys < 1 s over LAN (`04-F7`) | 0 taps; a mid-capture toggle badges the added line, **never silently removes it** (`04-F7`) | Yes |
| W6 | **Where's my naan?** | Guest asks; his own check | 20–60 | **T** | *consumes* `order.line_state_changed` per line (`04-F13`) | Glance 1–2 s | Yes |
| W7 | **Get told the food is ready** | Order/line goes `ready` | ~30 | **S T** | *consumes* `order.line_state_changed → ready` (`04-F13`) | **≤ 2 s over LAN** (`04-N3`); **one chime on the first ready line**, badge after (`04-F13` dedupe) | Yes |
| W8 | **Pick it up from the pass** *(only where ready-signal ownership = waiter-on-pickup)* | At the pass | 0 or ~30 | **T** | `order.line_state_changed → ready` (`04-F14`, `03-F24`) | 1 tap **[proposed]** | Yes |
| W9 | **I've put it on the table** | Food delivered | ~30 | **T** | `order.line_state_changed → served` (`04-F14`) | **1 tap** (`04-F14`: *"one further tap"*) | Yes |
| W10 | **They want the bill** | Guest asks | 10–40 | **S** | `table.state_changed {needs-bill}` → surfaces at counter (`02`) and console (`05`) (`04-F9/F10`) | 1 tap **[proposed]** | Yes |
| W11 | **Move them to another table** | Seating change | 0–5 | **A** | `order.table_assigned` (`04-F9` — move allowed; split/merge are not) | ≤ 3 taps **[proposed]** | Yes |
| W12 | **This is wrong — cancel it** (post-KOT) | Mistake found at the table | 0–5 | **M** | `approval.requested` → manager/counter decides → `void.recorded`. **The handheld initiates, never approves** (`04-F8`) | ≤ 3 taps + reason tile **[proposed]** | Yes — request is local; approval via LAN or counter PIN |
| W13 | **Tell them how long it'll be** | Guest asks | 10–30 | **T** | *consumes* `eta.estimates_published` (`04-F15`, `03-F29`) | Glance. **Below the confidence gate the field shows nothing — no fabricated estimate, ever** (`04-F15`, `03-F28`) | Yes (cached estimates) |
| W14 | **The table's clean** | Turnover done | 10–40 | **A** | `table.state_changed {cleaning}` → `available` (`04-F10/F11`) | 1 tap **[proposed]** | Yes ⚠ **`04 §4` assigns this to a "busser" who exists in no role list** — §10.1 G2 |
| W15 | **How did I do today?** (my tables, my items) | End of shift; his own check | 1–3 | **A** | read-only own-attribution fold (`04 §5`) | Glance | Yes ⚠ **no FR — it appears only in `04 §5` Data** — §10.1 G3 |
| W16 | **Unlock with my PIN** | Idle lock; shift start | 10–30 | **S** | `audit.login` (`04-F2`, `01-F26`) | Cold start ≤ 4 s to an unlocked capture screen (`04-N2`) | Yes (`01-F28`) |
| W17 | **Take the karahi off** *(only if the org permits)* | He learns it's finished | 0–5 | **M T** | `availability.changed` — **layer-2 permission, default view-only** (`04-F7`) | ≤ 2 taps **[proposed]** | Yes |

**17 tasks.**

### 6.3 The critical path

| Rank | Task | Why | The number that governs it |
|---|---|---|---|
| 1 | **W2/W3 — capture the order** | ~30 orders × ~4 lines = **~120 line taps/shift**, at a table, one-handed, mid-conversation | ≤ 2 taps grid→confirm (`04-F6`); 64 dp thumb targets (`27-F8`); persisted before ack (`01-F2`) |
| 2 | **W7 — the ready chime** | ~30×/shift, and it is the entire reason the waiter carries a device rather than walking to the pass | ≤ 2 s LAN (`04-N3`); dedupe per order (`04-F13`) |
| 3 | **W9 — mark served** | ~30×/shift; drives table state and the whole floor fold | 1 tap |
| 4 | **W6 — where's my naan** | 20–60×/shift; the glance that replaces the walk | Glance 1–2 s |
| 5 | **W10 — needs bill** | 10–40×/shift; the handoff to the counter, and the one thing the waiter cannot do himself (`04-F9`) | 1 tap |

### 6.4 What the waiter must NEVER see

`04 §1` already writes most of this, which is why it is the best-scoped role in the corpus. Cite it verbatim in the PR that builds these screens.

1. **Settlement and payment of any kind.** `04 §1`, `04-F9`: the waiter flags needs-bill; the counter settles.
2. **Split and merge bills.** `04 §1`, `04-F9`. Move-table is allowed; splitting money is not.
3. **Void / comp / discount approval.** `04 §1`, `04-F8`: *"the handheld initiates, never approves."*
4. **Cash, shift, and day flows.** `04 §1`.
5. **Customer-file browsing.** `04 §1`, `04-F17` — and this is enforced **server- and hub-side**, not hidden client-side: *"Filtering is enforced server- and hub-side (01-F27) — the client never merely hides the data."* That sentence is the difference between anti-scope and security.
6. **Payment and cash events, in the data slice at all.** `04-F17`. Not rendered, not synced, not present on the device.
7. **Other waiters' order detail.** `04-F17`.
8. **Any history before today.** `04-F17` — *"any pre-today history."*
9. **Reporting beyond his own attribution.** `04 §1`.
10. **A widened slice, ever.** `04 §7`, deliberately not configurable: *"widening a BYOD scoped slice to include payment/cash/customer data (never)."* The word "never" is in the spec.
11. **A fabricated ETA.** `04-F15` + `03-F28`: below the confidence gate, the field shows nothing.
12. **Hub or mesh responsibility.** `01-F39`: waiter class is *"LAN member, never hub"*; `04-F4` excludes scoped devices from hub election and from serving cold-start peers.

### 6.5 The rush-hour scenario

> **Friday, 21:30.** Six tables in his section, all seated, two mid-meal, one waiting 25 minutes on a mixed grill. He is holding four plates on his left arm. Table 3 stops him to change an order he confirmed ninety seconds ago — the KOT has already printed. His phone is at 14% and the screen is dim to save it. Two tables away, table 5 is waving for the bill. The kitchen is 20 minutes behind, so his phone has chimed four times in the last two minutes for three different tables.

**What the system must not do to him:**

1. **It must not chime four times for one order.** `04-F13`'s dedupe — one chime on the first ready line, badge updates after — is the FR that makes this role survivable, and `04 §9.6` records an open question about *re-chiming* on threshold escalation that would undo it if answered carelessly.
2. **It must not lose the order he captured when the battery dies.** `04-F6`: lines persist locally as events before UI ack — *"a dying battery never loses a captured order."*
3. **It must not need the internet.** `04 §4`: WAN dies mid-rush, the handheld keeps capturing over the LAN mesh, *"staff notice nothing."*
4. **It must not silently drop a line that just went unavailable.** `04-F7`: already-added unavailable lines get a warning badge — *"never silent removal."* At 21:30 a silently vanished line becomes a missing dish at 21:50.
5. **It must not make him type.** `27-F6`. One hand, four plates.
6. **It must not force-update the app during service.** `04 §8`, doc 15 staged rollout: *"never force-update during service hours."*
7. **It must not let him approve his own void.** `04-F8`. The pressure at table 3 with a wrong dish is exactly when the control would be used, which is exactly why it must not exist on this device.
8. **It must not require a precise target.** 64 dp minimum, thumb reach, dimmed screen.

---

## 7. RIDER *(Wave 2)*

### 7.1 Who this person is

He is outside, and that is a **hardware problem, not a palette problem** (`27-F20`, `D8`): at 80,000 lux every colour pair collapses to ~1.8:1 and light-versus-dark is irrelevant. The design answers are a brightness lock while a delivery is active, ≥1000-nit hardware, matte film, and — the one that shapes his task list — **a sun-critical payload of two or three very large glyphs**. In direct Lahore sun, the rider app is: an address, an amount, and a button.

He is on a motorbike, in a helmet, possibly in rain, with one hand at best. He is on his **own** phone (`09-F1`, BYOD, minimum Android 10), which is why `09-N3` caps the app at **< 50 MB** and demands function on *"intermittent 2G-grade connectivity."* `09-N4` forbids continuous GPS or background location outright — battery on a personal phone is respected, and no-route-optimization is a scope law.

He is very likely the least formally trained person in the system and among the least literate — and he is carrying **the most cash of anyone except the cashier**. `09-F12` is his protection: a cash header, always visible, showing the running total he owes, itemized on tap. `09-F16` completes it — over/short is attributed to him *and visible to him*, the same "I'm clean" framing as the cashier's shift close. If he does not trust that number, the whole COD model degrades into an argument at the counter.

`09-F14` sets the scope honestly: **three screens total** — order list, order detail, my cash/history — and the entire flow learnable in under 15 minutes.

### 7.2 Task inventory

Frequencies per rider, reference shift (~12 delivery orders each).

| # | Task (his words) | Trigger | Freq / shift | Crit | Events (`01 §4`) | Budget | Offline |
|---|---|---|---|---|---|---|---|
| R1 | **What have I got?** | Assignment push; before leaving | 10–30 | **S** | *consumes* `rider.assigned` (`09-F10`) — oldest first | Glance; cold start < 4 s (`09-N1`) | Yes (`09-F13`) |
| R2 | **Where am I going?** | Each delivery | ~12 | **S** | *consumes* customer address on the assigned order (`09-F10`) | Sun-legible: 2–3 very large glyphs (`27-F20`) | Yes (slice cached) |
| R3 | **How much do I collect here?** | At the door | ~12 | **M** | COD due, or **"COLLECT NOTHING"** for prepaid/RAAST/khata (`09-F10`) | Largest element in its region (`27-F25`); computed, never mental (`27-F24`) | Yes |
| R4 | **Call the customer** | Can't find the address | 3–15 | **A** | *no event* — OS dialer intent (`09-F10`); **the number is never copyable to clipboard** | 1 tap **[proposed]** | Yes (the SIM, not the app) |
| R5 | **I've got the food** | Leaving the restaurant | ~12 | **M T** | `rider.picked_up` (`09-F11`) — COD moves to "carrying" | 1 tap; feedback < 100 ms, plug-pull durable (`09-N1`) | Yes — persists locally, queues (`09-F13`) |
| R6 | **Delivered** | Handed over, cash taken | ~12 | **M T** | `rider.delivered` (`09-F11`) — COD moves to "owed"; **requires `picked_up`, no skipping** | 1 tap | Yes |
| R7 | **Nobody's answering** | Failed delivery | 0–3 | **M T** | ⚠ **`rider.delivery_failed` — not in the `01 §4` catalog** (`09-F11`, reason from a fixed list) | ≤ 3 taps incl. reason **[proposed]**; **must not sit adjacent to R6** (`27-F9`) | Yes |
| R8 | **How much am I holding?** | Continuous anxiety; before returning | 10–30 | **M** | cash header fold: delivered-unsettled + carrying (`09-F12`) | **Always visible** — 0 taps; itemized on 1 tap | Yes |
| R9 | **Did the office get my taps?** | Signal anxiety | 5–20 | **T** | sync state per event: *"synced / waiting for signal"* (`09-F13`, `00 §5.7`) | 0 taps — labelled inline, honestly | Yes — this *is* the offline surface |
| R10 | **Hand the cash back** | Return to branch | 1–3 | **M** | `rider.settled` (+ `cash.deposit_recorded`) — **initiated at the counter, not by him** (`09-F15/F17`) | **≤ 3 taps** (`21 §4` named, counter-side); rider-side is a read | Yes (`09-N6`) |
| R11 | **Am I clean?** — see my settlement result | After R10; disputes | 1–5 | **M T** | *consumes* `rider.settled` over/short, attributed (`09-F16`) | Glance | Yes |
| R12 | **Unlock with my PIN** | App open; shift start | 5–15 | **S** | `audit.login` (`09-F1`) | ≤ 4 digits; cold start < 4 s (`09-N1`) | Yes |
| R13 | **Go on duty** | Shift start | 1 | **A** | ⚠ **No FR gives the rider app this control.** `09-F4`: on-duty = clocked in on a *branch device* (`11-F1`) or toggled *at the counter* — and `09-F2` says the rider phone is never a branch-LAN member | — | — · §10.1 G6 |

**13 tasks — one of which (R13) has no mechanism.**

### 7.3 The critical path

**The rider's premise is different and it should be said plainly: nothing he does happens hundreds of times per shift.** Twelve deliveries means twelve of everything. His critical path is therefore ranked by **consequence and by hostility of context** — cash, sunlight, one hand, no signal — not by count. Ranking him by frequency would produce a design optimised for the wrong thing.

| Rank | Task | Why | The number that governs it |
|---|---|---|---|
| 1 | **R6 — delivered** | **M T.** The event that moves money from "carrying" to "owed". A lost tap is an argument at the counter and a shortfall attributed to a person. | 1 tap; < 100 ms feedback; **plug-pull durable** (`09-N1`, `01-F2`); queues offline (`09-F13`) |
| 2 | **R8 — how much am I holding** | Always on screen. It is his protection, and if he doesn't believe it he stops trusting settlement. | 0 taps, always visible (`09-F12`) |
| 3 | **R3 — how much do I collect** | At the door, in sun, one-handed, with a customer waiting. Getting this wrong is cash out of his pocket. | 2–3 very large glyphs (`27-F20`, `27-F25`) |
| 4 | **R2 — where am I going** | Same context, same constraints | as R3 |
| 5 | **R5 — picked up** | Gates R6 (`09-F11`: no skipping) | 1 tap |

### 7.4 What the rider must NEVER see

1. **Any other rider's orders, load, or cash position.** `09-F2` scopes the slice to his own assignments and his own settlement history; the dispatch view (other riders' loads) is a counter/manager surface (`09-F4`).
2. **The branch event stream.** `09-F2`: rider devices *"are not branch-LAN mesh participants and never hold the branch event stream."*
3. **Customer details after unassignment or settlement.** `09-F3`: purged at next sync; the app retains only event stubs for his own history.
4. **A copyable customer phone number.** `09-F10`: *"the number is never copyable to clipboard."* Tap-to-call only.
5. **Any menu, price, or catalog data.** He carries food, he does not sell it.
6. **His own settlement control.** `09-F15`: settlement is initiated at the counter/manager surface. He sees the result (`09-F16`), he does not close it.
7. **Cherry-picking which deliveries to settle.** `09 §7`, deliberately not configurable: settlement covers **all** delivered-unsettled orders.
8. **GPS, route, map, or a live track of himself.** `09-N4` + concept scope law. This is a "must never exist", not a "must not be shown" — and no placeholder may imply it is coming.
9. **Any intermediate delivery state he did not perform.** `09 §3`: *"No other states exist; surfaces may not invent intermediate ones (e.g. 'arriving') — the model only claims what an event proves."* The best-phrased anti-invention clause in the corpus.
10. **Payroll or wage math.** `09 §1` out-of-scope list; doc 11 owns the staff ledger.
11. **Stale state shown as current.** `09-F9`'s honesty rule applies to the dispatch surface reading *him*; the reciprocal applies to his app reading the branch.

### 7.5 The rush-hour scenario

> **Friday, 22:10.** Four orders batched to him for the same neighbourhood (`09-F7`). It is raining lightly. He is holding **6,800 rupees** in COD from two completed deliveries plus two more to collect. Order #3's customer is not answering and the address is a landmark, not a street. He is in a basement car park with no signal. He taps **delivered** on order #2 at the door — and the app shows *"waiting for signal"* (`09-F13`).
>
> Meanwhile at the counter, the dispatch surface shows *"picked up · 40 min ago · device unreachable 35 min"* (`09-F9`), and someone is about to record delivered on his behalf (`09-F8`).

**What the system must not do to him:**

1. **It must not lose the delivered tap.** `09-F13`: persisted locally first (`01-F2`), queued, pushed on any connectivity. Plug-pull durable (`09-N1`).
2. **It must not pretend it synced.** `09-F13`: each event is marked *"synced / waiting for signal"* honestly. A false green here is a shortfall in his settlement.
3. **It must not double-count when the counter records it on his behalf.** `09-F8` + `01-F35` terminal-state monotonicity: both events are retained and attributed, the fold lands on the terminal state once, the duplicate is a logged no-op. `09 §4` walks this exact case.
4. **It must not make him add up 6,800.** `27-F24`, `09-F12`.
5. **It must not put "delivery failed" next to "delivered".** `27-F9`. Wet screen, rain, one hand, and the two most consequence-divergent buttons in the app.
6. **It must not require signal to show him the address.** The slice is cached (`09-F2`); `09-N3` demands function on 2G-grade connectivity.
7. **It must not burn his battery.** `09-N4`: no continuous GPS, no background location.
8. **It must not surprise him at settlement.** If R8's number and the counter's expected number differ, he finds out while holding the cash in front of a manager. `09-N5` property-tests exactly this: for any event interleaving — offline duplicates, on-behalf entries, reassignments — expected cash equals the fold, identical on every device.

---

## 8. The other roles — outlines and open questions

These are not full inventories. Each is either out of Wave 1 or unresolved as a role, and each is listed so its absence is a recorded decision.

### 8.1 Storekeeper / purchaser *(doc 10, Wave 3)*

**Already has a budget in `21 §4` with no inventory behind it** — *"count entry ≤3/item (10-N2)"* is a named merge criterion for a role that appears nowhere in `21 §5`'s role laws. That inversion is itself a finding.

Tasks, from doc 10: photograph the supplier invoice and confirm it (`10-F13`, smart-defaults prefilled — one of only **two new habits** the whole platform asks of staff, Appendix D); do the guided count (`10-F17`: tracked items only, storage-layout order, ≤ 15 min, **≤ 3 taps per item**, resumable within the business day); send and receive transfers (`10-F11/F12` — discrepancies flagged, never silently absorbed); log wastage with a photo (`10-F16`); read the variance result (`10-F18/F19` — attribution *hints*, never accusation).

Anti-scope, unwritten but clear: no sales figures, no menu editing, no recipe editing (Appendix A: recipes are owner or vendor-onboarding only), no other locations' stock, no cost or margin data beyond the moving-average cost his own entries feed.

### 8.2 Prep / production staff *(doc 10, Wave 3)*

Two tasks, both deliberately tiny: **two-tap production entry** (`10-F9` — "made 15 kg boti from 18 kg raw"; and note `10-F9`'s own UI law: *"The word 'manufacturing' never appears in any UI"*), and **confirming tonight's prep list**, where `10-F23` makes the confirmation *itself* the production entry — no separate acknowledgment step. This role overlaps heavily with §3 (kitchen) in practice; whether it is a distinct role or a chef task is undecided.

### 8.3 Call-center operator — **unresolved role** *(doc 02, Wave 1 / Wave 4)*

`02-F27/F28` treat phone entry as a POS mode with a hard budget (≤ 30 s for a repeat customer, `02-N3`). `02-F29` (Wave 4) describes something else entirely: an operator routing orders to the *nearest branch by address zone*, told immediately if a branch is unreachable — i.e. a person sitting in no restaurant, with no counter, no drawer, no printer, and a fundamentally different screen. **The specs do not say whether this is a cashier mode or a role.** It has no row in Appendix A. Deciding it decides whether it gets an inventory. See §10.1 G9.

### 8.4 Accountant / munshi *(docs 11, 12, 14; Wave 3)*

A pure export consumer: payroll CSV per period per branch (`11-F7` — days present, shifts, overtime spans, advances taken/repaid, outstanding balance, and **no wage rates and no salary math**, deliberately), and report exports (`12-F20`). No operational UI, and probably no app at all. Listed so nobody builds one.

### 8.5 Marketing *(doc 17, Wave 4+)* — deferred, no Wave 1 surface.

### 8.6 Platform admin / vendor onboarding *(doc 15, Wave 0–1)*

Vendor-side, not restaurant staff — but it holds real screens and one load-bearing responsibility: the onboarding team writes recipes and par levels into the catalog (`10 §1`: *"owners never do recipe data entry"*), and doc 14 back office edits the menu. **`27-F4` makes grid position a compatibility contract**, so whoever edits the menu is editing a compatibility contract from a surface that has no idea it is doing so. See §10.1 G17 — this is the P6 research finding (*"the person programming in the menu can still be completely useless and make it annoying to use"*) with a spec consequence attached.

### 8.7 Customer *(docs 06, 07)* — **a hole in the `21 §5` law**

Appendix A lists Customer as a role. `21 §5` says every screen belongs to exactly one role and serves a task from that role's inventory, with a budget. The storefront and WhatsApp surfaces have module NFRs (`06-N1..N6`) but **no task inventory, no entry in the `21 §4` budget table, and no touch-target law** — their device is unmanaged, unknown, and not ours. Either `21 §5` explicitly exempts customer-facing surfaces (and says why), or doc 06/07 owe an inventory. See §10.1 G8.

---

## 9. CONFLICTS — **all ten now CLOSED (July 2026)**

> Status, in resolution order. Four of these were **self-inflicted** — doc 27 contradicted
> a doc it had not amended, which is what an amendments section is for.
>
> | # | Closed by | Ruling |
> |---|---|---|
> | C1 | `27-F11e/F11f` + `03 §1` | Paper is primary; the pass screen is **optional**, and a **22-inch panel** where present. The "cheap Android tablet" is superseded in doc 03 itself. |
> | C2 | `03-F46` | The queue **pages within** chronological order, so **the oldest ticket is always on page 1** — reaching work is never a navigation act. Paging in one flat list is lateral, not depth. |
> | C3 | `27-F6` + `21 §5` | *Required* is the operative word: search is an escape hatch, so **the grid must be complete without it**. Non-numeric typing stays banned for operational roles. |
> | C4 | `27-F8` kitchen row | **96 dp**, set deliberately above the standing-counter minimum — it is the surface where the 21.34% wet-hand error was measured, at 1–2 m. |
> | C5 | `27-F11d` | **An S1 alarm takes a BAND, never the screen.** A half-built cart is never taken from a cashier with a customer waiting. |
> | C6 | `03-F47` + `21 §5` amended | **Fixed configured minutes**, not expected-prep — a colour driven by a model that may never become confident is a colour that lies. |
> | C7 | `27-F14`..`27-F16` | The 3+1 budget is **allocated platform-wide**, once, rather than spent by whichever module ships first. |
> | C8 | `27-F2` + `27-F11a` | "6 per page" was a **phone** finding I transplanted; page capacity derives from usable area and target size. The founder's 15.6″ hardware (~88 tiles) dissolved it. |
> | C9 | `27 §8` | Learnability stays a criterion; doc 02's stale `≥48 dp` is superseded by `27-F8`. |
> | C10 | `27 §9` | Light vs dark on the KDS is **pilot-decided**, not decided here. |

### Original statements (retained — the reasoning is the record)

Each of these is two specs disagreeing. None is resolved here. Each needs a founder or design-owner ruling, and each blocks specific Wave 1 UI work.

### C1 — The pass screen is hardware that doc 27 says cannot work · **blocks all kitchen UI**

- `03 §1`: *"the **pass screen** (T2) — one cheap Android tablet at the pass"*; `03 §8`: pass and KDS are one Expo app; `03-N4`: renders on *"the 2–3 GB reference tablet."*
- `27-F28`: *"**A 10" tablet is not a KDS.** It holds ~9.5 item lines at 1.5 m — about 1.5 tickets — and more pixels change nothing, because only physical height buys capacity. **22" is the hardware floor** for a 3-ticket view."*

Doc 27 §8 lists the amendments it makes to doc 21. **It amends nothing in doc 03**, so doc 03's hardware assumption stands unchallenged in its own document while being contradicted in another. This is a hardware-procurement decision as much as a design one, and it determines whether §3's inventory has a screen to live on. *Owner: doc 03 + doc 27.*

### C2 — Scrolling is banned and budgeted for in the same corpus · **blocks the kitchen queue and the POS order list**

- `27-F2`: *"Flat paged grids, not scrolling lists, for anything actionable… **no primary action may require scrolling to reach**"* — grounded in the finding that nearly half of field subjects did not know content existed below the fold.
- `03-N4`: *"a queue of **40 open orders scrolls** without dropped input on the 2–3 GB reference tablet."*
- `03-F13`: the queue is *"strictly chronological by confirm time"*, and `27-F7` says a list's visual order **must** be its work order.

A strictly chronological 40-order queue, on a screen holding 1.5–3 tickets, with no scrolling and no reordering, is not obviously constructible. Paging within the chronological order may satisfy all three — but paging *is* a navigation act, and `27-F1` caps depth at one. **Ruling needed on whether paging within a flat list counts against the depth budget.** *Owner: doc 27 + doc 03.*

### C3 — Typing is forbidden and required · **blocks POS search, notes, and phone entry**

- `27-F6`: *"**No operational role is ever required to type non-numeric text.** Modifiers, reasons and notes are pick-lists of tiles, or voice. Of 27 field subjects, 24 could not type a single word."*
- Against it: `02-F2` item **search**; `02-F6` item notes as *"free text + org-configurable quick-tags"*; `02-F27` inline customer creation (a **name**); `09-F11` failed-delivery *"other + note"*; `10-F16` wastage optional note; `11-F17` handover *"quick-tags + optional text or voice note."*

`21 §5`'s cashier law also says *"search as escape hatch"*. The word *required* may resolve the search case (an escape hatch is not required if the grid is complete) — but that resolution needs stating, because it imposes a real constraint: **the grid must be complete without search.** The customer-name case (`02-F27`) has no escape at all, and `11-F19`'s voice alternative is specified only in doc 11. *Owner: doc 27 + docs 02/09/10/11.*

### C4 — There is no touch minimum for the surface with the worst touch conditions · **blocks the bump target**

- `21 §4`: *"Primary action targets ≥64dp — POS menu grid, **KDS bump targets**, rider status buttons."*
- `27-F8` **raises** the POS numbers (76 dp tiles, 126 dp keypad) and `27 §8` declares it amends `21 §4` — but `27-F8`'s posture table has **four rows and none of them is a kitchen screen**: counter POS, cash keypad, handheld, absolute floor.
- Meanwhile `27-F9`'s wet-hand evidence — **21.34% error wet vs 0.00% dry**, with the touch centroid physically migrating toward moisture — is *about* this surface.

So the amended law is silent exactly where the old law was explicit, on the one surface where the empirical case for large targets is strongest. **K3 (mark a line done) is the single highest-frequency touch in the kitchen and has no size floor.** *Owner: doc 27.* Related: `02-F2` still says *"big touch targets (≥ 48 dp)"*, now contradicted by `27-F8`'s 76 dp, and doc 02 was not amended.

### C5 — The S1 alarm lands on the cashier's order-entry screen · **blocks the POS interrupt design**

- `03-F5`: on print-retry exhaustion *"the host device raises a loud alert — **full-screen banner** + repeating sound — naming the printer and order… repeating until acknowledged."*
- `21 §5` interrupt law, S1: *"full-screen or persistent banner + repeating distinct sound, repeats until acknowledged, escalates to the manager console if unacknowledged 60 s."*
- The host device is the counter POS (`02 §1`, `03 §8`). The alarm fires when the kitchen is busiest, which is when the cashier is mid-order.

**No spec says what happens to the in-progress order underneath.** `27-F4`/`27-F5` (stability, no context-dependent controls) argue against anything that displaces the grid; `03-F5`'s "silent failure is forbidden" argues for maximum salience. Both are right. The ruling needed is: *on the POS specifically, is S1 full-screen or persistent-banner, and what is guaranteed about the cart?* *Owner: doc 21 §5 + doc 03.*

### C6 — Aging thresholds: fixed minutes or expected-prep-relative? · **blocks the kitchen colour model**

- `21 §5` kitchen law: *"Ticket age = color (neutral base → amber **at expected-prep** → red overdue; thresholds org-configurable; … **canonical in 03-F14, this law and that FR must match**)."*
- `03-F14`: *"neutral → amber at **X min** → red at **Y min**… X/Y are org-configurable per order type (defaults: dine-in 10/20, delivery 15/25)."*

"Expected-prep" is an ETA-derived, per-item quantity that only exists once `03-F27/F28`'s confidence gate passes — and `03 §3` forbids the kitchen from *displaying* ETAs at all. A fixed 10/20 minutes is a different model. Doc 21 asserts the two must match; they do not. *Owner: doc 21 §5 + doc 03.*

### C7 — The three-colour budget is unallocated and the first module to ship will spend it · **blocks every status component**

`27-F14` budgets **3 status colours + 1 interactive accent**, on a measured capacity of 7 with continuous degradation below it. Claimants, none of them yet assigned a slot:

| Claimant | Needs |
|---|---|
| Order aging (`03-F14`) | amber + red (neutral is base) |
| Interrupt severity (`21 §5`) | S1 / S2 / S3 |
| Table state (`04-F10`) | six states |
| Item availability (`01-F22`) | off/greyed |
| Sync honesty (`00 §5.7`, `12-F8`) | stale/offline |
| Cash variance (`02-F23`, `05-F20`) | over/short highlight |
| Stock level (`10-F21`) | below par |

`27-F12` (colour never alone — colour + shape + position + a number) and `27-F15` (monotonic lightness ladder, fill-carried) make this survivable, but **the allocation itself is undecided**, and whichever Wave 1 module ships first will fix it by accident. *Owner: doc 27 — a colour-slot allocation table is owed.*

### C8 — A 300-item menu, at depth one, six items per page · **blocks the POS grid, the most important screen in the product**

- `27-F1`: *"Maximum navigational depth on any operational screen is **ONE**. Categories are page tabs or fixed section headers, never a drill-down."*
- `27-F2`: the tested layout was **6 items per page in a 3×2 grid** — 25 s / 100% correct against a 4-level hierarchy's 65.5 s / 80%. The study's corpus was 7 pages ≈ **42 items**.
- `02-N2`: the grid must hold **300 menu items × 5 variants** within the 100 ms line-add budget.
- `27-F8`: tiles ≥ 76 dp. `27-F11`: density is bounded by target size and page size, not taste.

Category tabs are explicitly permitted at depth one, so a 300-item menu across ~12 category tabs is ~25 items per tab. At 6 per page that is 4–5 pages *within* a tab — a second paging axis. Is that depth two (banned by `27-F1`), or paging (permitted by `27-F2`)? And if a tab shows 25 items at 76 dp on a counter screen instead, is that a `27-F2` violation? **This one conflict determines the layout of the screen the cashier touches 300 times a shift.** It is the highest-priority ruling in this document. *Owner: doc 27 + doc 02.*

### C9 — `21 §4`'s learnability criterion is demoted in doc 27 but still cited in doc 02

`27 §8` demotes *"new-cashier learnability <15 min"* from merge criterion to internal target, on the grounds that published training-time claims span **20 minutes to 40 hours, all vendor or SEO content**. But `02-N6` and `09-F14` and `00 §5.6` all still state it as a requirement. Doc 27 amended doc 21; it did not amend the module docs that inherit the number. *Owner: doc 27 + docs 00/02/09.*

### C10 — Light vs dark on the KDS (recorded, already open)

`27-F19` / `27 §9.1`: evidence says light, the entire industry ships dark, no study supports the convention. Already flagged as a pilot A/B. Noted here only because §3's inventory cannot be storyboarded without knowing which. *Owner: pilot.*

---

## 10. GAPS — tasks with no FR, and events that do not exist

### 10.1 Tasks staff perform that no FR covers

| # | Gap | Evidence | Who it blocks |
|---|---|---|---|
| **G1** | **Training mode does not exist.** `27-F52` makes it a product requirement that *"reaches the kernel… This needs an architectural answer, not a UI toggle. (Owed to doc 01/02.)"* Nothing in doc 01 or 02 answers it. The research finding behind it (P5): staff either train on live tickets — polluting an append-only ledger and every report built on it — or don't train. | `27-F52`; `pos-kds-patterns.md` P5 | **Every role.** Also blocks `21-F11` RITE rounds and `27-F53`'s experienced-operator speed test, which need somewhere to run |
| **G2** | **The busser has no role.** `04 §4`: *"table flips `cleaning` → **busser taps done** → `available`"*; `04-F11` permits the manual tap. No busser exists in Appendix A, holds a device, or is named in an FR. ~40 table turns per T3 shift. | `04 §4`, `04-F10/F11`, Appendix A | Waiter (§6, W14) |
| **G3** | **The waiter's "I'm clean" view has no FR.** `04 §5` Data lists *"own-attribution day summary (my tables, my items — the waiter's 'I'm clean' view)"*. No FR creates it. Every other role's protection view has one (`02-F23`, `09-F16`, `11-F6`). | `04 §5` | Waiter (§6, W15) |
| **G4** | **No behaviour is specified for settling with no shift open.** `02-F22`: *"A shift binds subsequent cash settlements and drawer events to that cashier."* Nothing says what happens if none is open. `01-F17` forbids blocking the sale, so the event must carry *something*. | `02-F22`, `01-F17` | Cashier (§2, C2/C11) |
| **G5** | **The kitchen cannot reprint a lost ticket.** `03-F7` logs KOT reprints; no FR gives the pass or station screen a reprint control. A soaked or torn ticket means walking to the counter mid-rush. Likewise `03-F6`'s one-tap reroute is on the alert (host device), so the kitchen cannot reroute either. | `03-F5/F6/F7` | Kitchen (§3, K11) |
| **G6** | **A rider cannot go on duty from his own app.** `09-F4`: on-duty = clocked in (`11-F1`, *"on any branch device"*) **or** toggled at the counter. `09-F2`: the rider phone is never a branch-LAN member. So a rider working from home base has no self-serve path. | `09-F4`, `09-F2`, `11-F1` | Rider (§7, R13) |
| **G7** | **No touch minimum for kitchen/pass surfaces.** See §9 C4. The highest-frequency kitchen touch, in the worst input conditions, has no size floor. | `27-F8`, `21 §4` | Kitchen (§3, K3) |
| **G8** | **Customer-facing surfaces have no role/task/budget** under the `21 §5` law that claims to cover every screen. | `21 §5`, `06`, `07`, Appendix A | Storefront + WhatsApp UI (§8.7) |
| **G9** | **Call-center operator is neither a role nor clearly a mode.** `02-F29`'s Wave 4 multi-branch operator has no counter, no drawer, no printer, and no Appendix A row. | `02-F27..F29` | Wave 4 scoping (§8.3) |
| **G10** | **No bound on the quick-tag list.** `02-F6`/`04 §7` make kitchen quick-tags org-configurable with no cap. `27-F2`'s 6-per-page and `27-F6`'s tiles-only rule apply, but nothing stops an org configuring 40 tags and breaking both. | `02-F6`, `27-F2/F6` | Cashier (C7), Waiter (W4) |
| **G11** | **The manager's walk-over PIN approval has no budget.** `02-F20` and `05-F8` specify it as a fallback; `21 §4` names a budget for remote approval's machine portion (`05-N1`) but none for the human path that is used whenever the phone is unreachable. | `02-F20`, `05-F8`, `21 §4` | Manager (§4, M17) |
| **G12** | **Shift-lead-as-intermediary has no owning FR.** `27-F51` makes second-order usability a design requirement; no module doc has an FR for operating a screen on someone else's behalf (which changes PIN attribution, `02-F19`). | `27-F51` | Every role |
| **G13** | **No FR bounds concurrent interrupts on the POS.** `05-F4` disciplines manager alarm volume per order per threshold; `21 §5` dedupes same-cause signals. Six distinct causes on one counter screen at 20:40 is unbounded by both. | `21 §5`, `05-F4`, `03-F5` | Cashier (§2.5), Manager (§4.5) |
| **G14** | **86-ing has no path in a T1/printer-only kitchen.** `02-F7` gives the toggle to the POS and `03-F16` to the pass screen. A T1 kitchen has neither, so the chef must walk to the counter to stop the platform selling a finished dish across every channel. Arguably a tier consequence rather than a defect — but it is unstated. | `02-F7`, `03-F16`, `02-F31` | Kitchen (§3, K6) |
| **G15** | **The POS has no stated degraded behaviour for pause/throttle offline.** `05-F13` pausing foodpanda requires the aggregator push (doc 08), which requires WAN. What the manager sees when he pauses a channel with the WAN down is unspecified. | `05-F13`, `08` | Manager (§4, M9/M10) |
| **G16** | **No FR states that the cashier must not see an approve control for her own request.** The distinction is implied by `02-F20` and `05-F6` but never stated, which makes it unenforceable as an anti-scope test. | `02-F20`, `05-F6` | Cashier (§2.4 item 5) |
| **G17** | **Menu editing can break a compatibility contract with no gate.** `27-F4`: *"Adding, removing or reordering an item on an operational grid is a **breaking change** requiring PR justification and a dev-pilot acclimation window."* But doc 14 back-office menu editing is a **runtime org action**, not a PR — and the research (P6) records the field consequence directly. Nothing connects the two. | `27-F4`, `14`, `pos-kds-patterns.md` P6 | Cashier (the grid), Back office |

### 10.2 Events emitted by module FRs that are absent from the `01 §4` catalog

`01 §4` states that module extensions *"were declared by docs 02–15 and are **absorbed here as canonical**."* For docs 02, 03, 04, 05 and 06's `metering.usage_recorded` that absorption happened. For fourteen event types it did not. Every one of these is emitted by an FR and appears in a task inventory above.

| Event type | Emitted by | Declared as an extension in its own doc? | Task |
|---|---|---|---|
| `order.rejected` | `02-F9`, `06-F20` | Yes — `06 §2` | C20 |
| `order.cancelled` | `06-F19`, `06-F27` | Yes — `06 §2` | (customer surface) |
| `customer.phone_verified` | `06`, `07` | Yes — `06 §2` | (customer surface) |
| `rider.unassigned` | `09-F6` | Yes — `09 §2` | M15 |
| `rider.delivery_failed` | `09-F11`, `09-F18` | Yes — `09 §2` | **R7** |
| `whatsapp.inbound_received` (+ `outbound_sent`, `outbound_failed`, `template_status_changed`, `optin_recorded`, `optout_recorded`) | `07-F9`, `07 §2` | Yes — `07 §2` | M16 |
| `aggregator.order_received` | `08-F8` | Not explicitly | (C21's API sibling) |
| `stock.price_spike_flagged` | `10-F15` | *"extensions listed in §5"* — **no such list in `10 §5`** | (storekeeper) |
| `stock.low_level_flagged` | `10-F21` | as above | (storekeeper) |
| `stock.count_overdue_flagged` | `10-F20` | as above | (storekeeper) |
| `checklist.item_checked` | `11-F15` | *"extensions in §5"* — **no such list in `11 §5`** | M20 |
| `checklist.completed` | `11-F15` | as above | M20 |
| `handover.recorded` | `11-F17` | as above | (cashier shift close, W3) |
| `staff.schedule_published` | `11-F12` | as above | (manager, W3) |
| `staff.advance_acknowledged` | `11-F10` | as above | (staff self-view, W3) |

**Two distinct problems:**

1. **Absorption debt** (`order.rejected`, `order.cancelled`, `customer.phone_verified`, `rider.unassigned`, `rider.delivery_failed`, the `whatsapp.*` family). These are properly declared in their own docs under the `01 §4` extension mechanism; `01 §4` simply has not absorbed them. `01-F4` makes producing an unknown event type *"a build-time and runtime error"*, so **`02-F9`'s reject path and `09-F11`'s failed-delivery path cannot be implemented today.** `order.rejected` blocks a Wave 1 cashier task (C20); `rider.delivery_failed` blocks a Wave 2 rider task (R7).
2. **Undeclared extensions** (docs 10 and 11). Both docs say their extensions are *"listed in §5"* and **neither §5 contains such a list.** These events exist only inside FR prose. Wave 3, but the docs are internally inconsistent today.

### 10.3 One budget that exists without a role

`21 §4` names *"count entry ≤3/item (10-N2)"* as a merge criterion. Doc 21 §5 has no storekeeper role law and this document's §8.1 is an outline, not an inventory. A budget without an inventory is the mirror image of `21 §5`'s complaint about screens without tasks, and it should be resolved in the same PR that rules on §9.

---

## 11. What this document commits to, and what it does not

**It commits to:** six full role inventories (36 + 16 + 20 + 12 + 17 + 13 = **114 tasks**), each task carrying a trigger, an order-of-magnitude frequency against a stated reference shift, a criticality code, its kernel events by catalog name, a tap/time budget, and an offline verdict; a named critical path per role; a checkable anti-scope list per role; and a rush-hour scenario per role written from the research rather than from imagination.

**It does not commit to:** any screen, any layout, any component, any navigation structure. Those are derived next, from this, and each derived screen must name the role, the task number, and the budget it serves — which is `21 §5`'s law made operational.

**It cannot commit to:** the ten conflicts in §9 or the seventeen gaps in §10.1. Four of those block work that is otherwise ready to start: **C8** (the POS grid), **C4/G7** (the bump target), **C2** (the kitchen queue), **C5** (the POS interrupt) — and **10.2** blocks two shippable tasks on a missing catalog entry each.

**Every frequency in this document is an estimate.** `21-F10` (per-role usage instrumentation) exists to replace them; `27-F53` requires speed measured separately from success, at rush tempo, with an operator who has run 500 tickets; `27-F54` requires month-3 and month-6 measurement because the median study in this literature ran two weeks. **Our pilot is the study.** These inventories are the hypothesis it tests.
