# RestOS — screen map and information architecture

**Derived, not invented.** Every screen below exists because a task in
`role-task-inventories.md` needs it, and every task there cites a resolving FR. A screen
with no task is a defect in this document, not a feature — `21 §5` complains about exactly
that failure mode, so this file states the task for each surface and nothing appears
without one.

Governing laws: `27` (design language), `21` (UX system), `18 §6` (two-plane), `00 §5`
(offline). Where this document and a spec disagree, **the spec wins and this file is
wrong**.

---

## 1. The shell law — what "depth one" actually means

`27-F1` caps layout depth at ONE. That is a statement about *navigation*, and it has a
concrete shell consequence that is easy to get wrong:

> **Every operational app is a fixed set of peer surfaces, all reachable in one act from a
> chrome that never moves, never reorders, and never changes with context.**

Three corollaries that decide the shell:

- **Lateral ≠ depth.** Persistent tabs, and paging within one flat list (`03-F46`), are
  lateral moves and do not spend the depth budget. A tab bar with 5 fixed tabs is depth
  one. A tab whose *contents* require another navigation act to reach a primary action is
  depth two and is banned.
- **The chrome is positional memory, so it is immutable.** `27-F4` makes adding, removing
  or reordering an item on an operational grid a **breaking change**. That applies to the
  shell first: a tab that appears only when a condition holds destroys the muscle memory of
  every operator who learned the layout without it. **Conditional surfaces are disabled in
  place, never absent** — greyed with the reason, holding their position.
- **Nothing is behind a menu.** No hamburger, no overflow, no "More". `27-F2`'s finding
  (nearly half of field subjects did not know content existed below the fold) applies to
  hidden navigation with more force than to hidden content: an operator who cannot read
  cannot discover a labelled menu at all.

**The shell is therefore: a fixed tab rail + a status strip + the work surface.** Nothing
else is chrome.

### 1.1 The status strip is the honesty surface

`00 §5.7` and `12-F8` require sync honesty; `27-F11d` puts S1 alarms in a band that must
not take the screen. Both land in one persistent strip, and it is the only chrome that
changes:

| Slot | Shows | Law |
|---|---|---|
| Identity | who is logged in, which device, which station | `02-F19` attribution |
| Connection | LAN / hub / cloud state — **three separate facts, never one "online" dot** | `00 §5.7` |
| Alarm band | S1 only; persistent, loud, un-dismissable without attributed ack | `27-F11d`, `03-F5` |
| Business day | open / closed, and the day it is | `01-F45` 05:00 cutover |

**Why three connection facts and not one:** a device can be LAN-connected with a healthy
hub and no WAN — which is the *normal* operating state, not an error — and the operator
must not be told anything is wrong. A single dot forces that state to be either a lie or an
alarm. This is the honesty rule doing real work, not decoration.

**Alarm concurrency (gap G13, unbounded today):** the band shows **one** S1 at a time —
the oldest unacknowledged — with a count of the rest. Six causes at 20:40 must not become
six bands, because a band that fills the screen has become the screen, which `27-F11d`
forbids.

---

## 2. What determines what goes on a screen

Four filters, applied in this order. They are the reason the inventories below are short.

1. **Does a task need it?** (`role-task-inventories.md`). No task, no pixel.
2. **Does the operator have to act on it, or only know it?** Act → work surface. Know →
   status strip or nothing. Most "dashboard" content fails this and belongs in doc 12/13,
   not on an operational screen.
3. **Is it computed or read?** `27-F24`: the system computes, the operator reads. Any
   number the operator would otherwise derive is wrong to show un-derived — ASER 2023 puts
   arithmetic ability at **9.5%** against ~60% numeral recognition.
4. **Does it survive the surface's channel budget?** Glass: `27-F14`'s 3+1 colours. Paper:
   `27-F55`'s four channels. A screen designed at the colour budget cannot be printed
   without redesign, which is why the KOT carries **less** than the pass ticket (`27-F55`).

---

## 3. Wave 1 — the two apps that ship

### 3.1 `pos-electron` — the counter

**Operator:** standing, one hand occupied most of the time, interrupted continuously,
plausibly a non-reader, and the person the system is protecting (`02-F23`).

**Tab rail — 5 fixed surfaces, never more:**

| Tab | Task(s) | Primary information | Why it earns a tab |
|---|---|---|---|
| **Order** | C3–C10 | The item grid + the cart | The default. ~150–300 visits/shift; everything else is an interruption from here |
| **Orders** | C12, C14, C20 | Open + parked orders, and the cloud-order queue | Chronological, paged (`03-F46`). Cloud orders arrive with an S2 chime and must be *reachable*, not modal |
| **Pay** | C11, C13 | Amount due, tender, change | Separate surface because `27-F8` puts numeric entry at **126 dp** — it cannot share a layout with 76 dp tiles |
| **Cash** | C1, C2, C15–C18 | Drawer, paid-outs, shift open/close | Low frequency, high consequence. Isolated so a mis-tap on the Order tab can never reach it |
| **Me** | C19 | Own reconciliation, own day, clock state | `02-F23`'s "I'm clean". A protection surface, not an admin one |

**The Order surface, in detail** — it is the most important screen in the product:

- **Grid.** Flat, paged, ~88 tiles on the founder's 15.6″ hardware (`27-F11a`), category
  strip as a **lateral** filter and not a drill-down. **The grid must be complete without
  search** (conflict C3's resolution): search is an escape hatch (`21 §5`), and an escape
  hatch is not a required path — but that only holds if everything sellable is reachable by
  tile.
- **Cart.** Always visible, never a separate screen, never collapsed. It is the operator's
  working memory and `27-F5` forbids controls that change with context.
- **Totals.** Computed and final at all times (`27-F24`). No subtotal the operator is
  expected to add to anything.
- **What is NOT here:** ETAs (`03 §3` forbids kitchen ETA display and the counter should
  not promise what the kitchen won't commit to), inventory levels (`01-F17` — a sale is
  never blocked by inventory math, so showing the number invites blocking it socially),
  and any approval control for the operator's own request (**gap G16** — stated here so it
  becomes an anti-scope test).

**Screen-level laws that bite here:**
- `27-F9`: void/refund is never adjacent to add-item. The counter is a wet-hand surface too
  — cash, condensation, hand-washing.
- `27-F11d`: the S1 band never takes the cart. A half-built order survives every alarm.
- `01-F17`: nothing on this screen may block completing a sale. If a subsystem is down the
  sale completes and the *strip* says so.

### 3.2 `pass-kds` — the kitchen

**First:** for most deployments this app does not exist. `27-F11e` makes paper the primary
kitchen interface and the pass screen **optional**. The printed KOT is specified in
`03-F30`..`03-F45` and `27 §2b`, and it is the deliverable that matters more.

**Where the screen exists, it is a 22″ panel** (`27-F11f`) and it has **one surface**, not
a tab rail. A cook glancing for one second cannot navigate.

| Region | Shows | Law |
|---|---|---|
| Queue | 3 tickets, chronological, **page 1 always holds the oldest** | `03-F13`, `03-F46` |
| Per ticket | identifier, age colour, item lines with quantity **left-adjacent** to the name, modifiers indented, notes emphasised | `03-F3`, `27-F57`, `27-F59` |
| Action | bump / line-done at **96 dp**, un-bump **not adjacent** | `27-F8` kitchen row, `27-F9` |

**What is deliberately absent, and this is the strongest anti-scope statement in the
corpus** (`03-F23`): no auto-prioritisation, no reordering, no "cook this next", at any
tier, ever. **Sequencing is visibility only. The chef decides.** Treat this as the model
for every other module's temptation to be helpful.

Also absent: ETAs (`03 §3`), prices (`03-F32` — structurally, the KOT data model has no
money field at all), and any station's lines but this one's (`03-F18`).

---

## 4. The connection map

Operational apps are **not** a graph — that is the point of depth one. The only edges are:

```
                      ┌──────────────── the ledger ────────────────┐
                      │  (every edge below is an EVENT, not a nav) │
                      └────────────────────────────────────────────┘

  pos-electron ──order.confirmed──▶ printer (KOT)  ──paper──▶ cook
       │                     └────▶ pass-kds (if it exists)
       │
       ├──payment.recorded──▶ receipt printer
       ├──approval.requested──▶ manager (S2 on manager console)
       └──kot.print_failed──▶ ITS OWN S1 band  ◀── the failure lands where the human is
```

**The rule this encodes:** screens do not navigate to each other; they observe the same
ledger. There is no "go to the kitchen screen" action anywhere, because there is no
handoff — there is an append. That is what makes offline-first work at the UX layer rather
than only at the storage layer.

**The one exception is the alarm**, and it is deliberate: `03-F5`'s print failure raises on
the **host device** (the counter), not in the kitchen — because in a printer-only kitchen
nobody in the kitchen has a screen to be told on, and the cashier is the person who can
act (`27-F11g`). The signal goes where the *responder* is, never where the *fault* is.

---

## 5. What gets no screen at all

Recording these prevents them being built by drift:

| Not a screen | Why | Instead |
|---|---|---|
| A kitchen "settings" surface | The cook is the least likely to read and the most likely to mis-tap | Layer-3 config on the device, back office owns it |
| A cashier-facing report | `02-F23` is a protection view, not analytics | Doc 12/13, on the owner's own device |
| An "online/offline" modal | Offline is the normal state, not an event | Status strip, three facts |
| A cloud-order popup | Interrupts a cart, which `27-F11d` forbids | S2 chime + count badge on the Orders tab |
| Inventory levels on the POS | `01-F17` — never block a sale | Doc 10, manager's surface |
| Anything behind a hamburger | Undiscoverable to a non-reader | Nothing. If it matters it is a tab; if it isn't a tab it doesn't exist |

---

## 6. The component vocabulary this implies

`packages/ui` is a **closed vocabulary** (Commandment 6). The screens above need exactly
these, and each gets a Storybook entry with its posture, its target size, and its
low-literacy story:

**Primitives (posture-typed, not size-typed):** `Tile` (76 dp counter / 96 dp kitchen /
64 dp handheld — the posture is a prop, the number is not), `KeypadKey` (126 dp),
`TabRail`, `StatusStrip`, `AlarmBand`.

**Composites:** `ItemGrid` (flat, paged, capacity derived from surface — never a fixed
count, `27-F2`), `Cart`, `TicketCard`, `AgeBadge` (fixed-minute thresholds, `03-F47`),
`MoneyValue` (Western numerals, computed-final, never an operand — `27-F24`),
`QuantityItemLine` (the quantity-adjacent law, `27-F57`, shared by screen and paper),
`ConnectionFacts` (three, never one).

**The rule that makes the vocabulary hold:** a component that can be configured into
violating a law is not a closed vocabulary. `Tile` must not accept an arbitrary size;
`AgeBadge` must not accept an arbitrary colour; `MoneyValue` must not accept a
partially-computed number. **Storybook is where that is demonstrated, per story, and it is
also where the low-literacy claim gets tested** — every story states what it expects a
non-reader to be able to do with it, which is what `27-F35`'s ≥85% comprehension gate will
be run against.

---

## 7. Open — decided by the pilot or the founder, not here

1. **Station routing's wave** (`03-F18`, flagged in doc 03): currently Wave 4, and it is
   the largest low-literacy lever in the product. Founder call.
2. **Training mode** (gap G1, `27-F52`): reaches the kernel — staff either train on live
   tickets and pollute an append-only ledger, or don't train. Needs an architectural
   answer, and it blocks `21-F11` RITE rounds having anywhere to run.
3. **Light vs dark on the KDS** (`27 §9`): pilot-decided.
4. **The one-handed counter posture** is unaccounted for in `27-F8`'s table — the cashier
   holds cash, a handset or a card most of the time, and the table assumes two hands.
5. **Quick-tag cap** (gap G10): `02-F6` allows unbounded org-configured tags, which breaks
   `27-F2` paging and `27-F6` tiles-only. Needs a bound.
