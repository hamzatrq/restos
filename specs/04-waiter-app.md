# 04 — Waiter Handheld

**Module spec — Draft 1, July 2026** · Parent: `00-platform-overview.md` (conventions §5–§7 inherited), `01-kernel-sync.md`. T3 surface, Wave 4.

## 1. Purpose & scope

Tableside ordering for T3 full-mesh restaurants: waiters capture orders at the table straight to KOT, track table states, see live availability, and get notified when their tables' food is ready. ~~Runs on cheap Android phones **including waiter-owned BYOD devices** — the app must be a good guest on a low-end personal phone: tiny install, low RAM, no access to data the waiter has no business holding.~~ **⚠ SUPERSEDED by `04-F26` (landscape tablet, not a phone) and `04-F21` (a terminal, not a device that holds data) — read those, not this paragraph.**

~~Expo React Native, sharing `packages/domain` + `packages/sync-client` with the fleet.~~ **⚠ SUPERSEDED by `04-F21`: the pad is a browser terminal of the till and hosts no `sync-client`.** Not offered below T3; nothing in T1/T2 depends on it (tiers degrade gracefully, concept §4.1). The handheld deliberately does less than the POS. On it: capture, table state, ready signals, availability view. Not on it, by design:

- settlement and split/merge bills (counter, doc 02);
- void/comp/discount approval (manager, docs 02/05);
- cash, shift, and day flows (docs 02/05);
- customer-file browsing or reporting beyond the waiter's own attribution view.

## 2. Position in platform

- **Depends on:** kernel (doc 01) — LAN mesh participation, PIN auth, catalog/availability reference data; the confirm→KOT path (doc 02 02-F8 semantics, doc 03 printing).
- **References:** doc 03 (ready signals, waiter-on-pickup ownership, ETA publication), doc 05 (floor state consumes table states defined here), doc 02 (settlement at the counter; needs-bill signaling), doc 15 (BYOD update channels).
- **Events emitted:** `order.created / line_added / line_removed / confirmed / note_added / table_assigned`, `order.line_state_changed` (`ready` when waiter-on-pickup owns the signal; `served`), `table.state_changed` (extension, §5), `availability.changed` (if permitted), `audit.*`.
- **Events consumed:** `availability.changed`, `order.line_state_changed`, `order.confirmed` (own tables), settlement state on own tables, `eta.estimates_published` (doc 03), reference-data versions.

## 3. Functional requirements

**Device & identity**
- 04-F1 ~~Registration via the standard one-time pairing code (01-F25), device class `handheld`.~~ **⚠ NOT APPLICABLE under `04-F21`** — a terminal is not a paired device; `04-F22` is its admission.  Original text: Registration via the standard one-time pairing code (01-F25), device class `handheld`. BYOD and restaurant-owned shared handhelds are both supported.
- 04-F2 A shared handheld allows any waiter-role PIN of the branch; a BYOD device may be limited to its owner's credential only (layer-2 choice). Idle auto-lock applies as on every shared device (01-F26).
- 04-F3 Per-waiter attribution: every line, note, and state change carries the waiter's user id from the PIN session. Per-waiter sales/tips reporting reads from this attribution (doc 12) — no extra entry, ever.
- 04-F4 **⚠ NOT NEEDED under `04-F21` — a terminal holds no slice, so there is no kernel amendment to propose. Retained, unstruck, because it returns verbatim if a native app is ever ruled.** Scoped-slice devices (04-F16) are excluded from hub election and from serving cold-start peers — they cannot satisfy 01-F14. This is a kernel amendment this doc formally proposes against 01 §9.2.
- 04-F5 Revocation (stolen/left-employment phone): back-office revoke cuts cloud and LAN participation at next contact and flags the device branch-wide (01-F25); the local slice is remote-wiped on next app start.

**Tableside capture**
- 04-F6 Order capture to KOT:
  - table pick → compact menu grid (category tabs, search) → modifiers/variants → notes/quick-tags (shared list with doc 02);
  - confirm emits `order.confirmed`; KOTs print via the branch print service (doc 03) with zero waiter-side print configuration;
  - a simple order is ≤ 2 taps from grid to confirm (00 §5.6);
  - ~~lines are persisted locally as events before UI ack (01-F2) — a dying battery never loses a captured order.~~ **⚠ AMENDED by `04-F24`: the durable point is the till, and the pad never acks a KOT it has not sent.**
- 04-F7 Live availability:
  - `availability.changed` greys items < 1 s over LAN (01-F15) — a waiter never sells a finished karahi;
  - toggling availability from the handheld is a layer-2 permission (default: view only);
  - a toggle mid-capture updates the open cart: already-added unavailable lines get a warning badge, never silent removal.
- 04-F8 Adding lines to an already-confirmed order is a fresh confirm for the new lines only (incremental KOT). Line removal post-confirm requires the void path (01 §4) and escalates to manager/counter — the handheld initiates, never approves.
- 04-F9 Scope discipline: split/merge bills and settlement are **not** on the handheld — the waiter flags `needs-bill` and the counter (doc 02) settles. Move-table is allowed (`order.table_assigned`).

**Table states**
- 04-F10 Table state machine, emitted as `table.state_changed` with actor:
  - `available` — free to seat;
  - `seated` — guests at the table, nothing ordered yet;
  - `ordered` — at least one confirmed order open;
  - `served` — all lines served;
  - `needs-bill` — guests asked to pay; surfaces at the counter (doc 02) and console (doc 05);
  - `cleaning` — settled, being turned over.
- 04-F11 Transitions are side-effects wherever possible (automation law, 00 §5.8): first `order.confirmed` on the table → `ordered`; all lines `served` → `served`; settlement at the counter → `cleaning`. Manual taps exist only for `seated`, `needs-bill`, and `cleaning`-done.
- 04-F12 The handheld shows the branch table map with states and own-section highlighting; doc 05 floor state and doc 02 render the same fold (one fold, three renderers).
  - Concurrent opens of one physical table follow 01-F19: both orders stand, the table shows a conflict badge, staff merge or reassign — nothing auto-discarded.
  - The conflict badge renders on every surface showing the table, not just the devices involved.

**Ready notifications**
- 04-F13 Ready notifications, scoped to the waiter's own tables:
  - when a line/order for one of the waiter's tables becomes `ready` (doc 03), the device notifies (sound + banner) within 2 s over LAN;
  - "own tables" = tables where this waiter created the order, plus any section assigned to them (layer-2 section assignment);
  - the waiter also sees live line progress for their tables (`in_prep` / `ready` per line, folded from `order.line_state_changed`) — the "where's my naan" glance without walking to the pass;
  - notifications dedupe per order: one chime on the first ready line, badge updates after.
- 04-F14 If ready-signal ownership (03-F24) is `waiter-on-pickup`, the pickup action on the handheld emits `order.line_state_changed` → `ready`; delivering to the table is one further tap → `served`. Under any other ownership the waiter only marks `served`.

**Quoted ETA**
- 04-F15 Once doc 03 publishes confident estimates (`eta.estimates_published`), the capture screen shows the order-level quote (03-F29 rule) so the waiter can tell the table "about 25 minutes". Below the confidence gate the field shows nothing — no fabricated estimate, ever (concept law 6).

**Scoped sync slice (design proposal answering 01 §9.2)**
- 04-F16 **⚠ NOT NEEDED under `04-F21`; see `04-F21`'s third stated cost.** A handheld may run a **scoped slice** instead of the full branch window (01-F14). Default: BYOD → scoped, restaurant-owned → org choice. The slice contains:
  - reference data: catalog, availability, quick-tags, ETA estimates, the device's permitted user credential hashes;
  - branch-wide: table map states (`table.state_changed` only — tiny);
  - full event detail only for orders this device created or on tables in the waiter's section, current business day only.
- 04-F17 **⚠ NOT NEEDED under `04-F21`, which delivers this privacy property structurally rather than by filtering.** Excluded from the scoped slice by design (privacy + storage):
  - payment and cash events;
  - shift/day events;
  - other waiters' order detail;
  - the customer file;
  - any pre-today history.
  Filtering is enforced server- and hub-side (01-F27) — the client never merely hides the data.
- 04-F18 A scoped device that loses its slice (reinstall, cache purge) re-syncs from hub or cloud in < 60 s on branch Wi-Fi — small by construction. Section reassignment mid-shift triggers slice backfill for the gained tables.

- 04-F19 **Clearing a table is the waiter's action; there is no busser role (gap G2, founder ruling July 2026).** `04 §4` said "busser taps done" while no busser existed in Appendix A, held a device, or was named in any FR — ~40 table turns a shift with no owner. **Resolved by removing the role, not by adding one:** the waiter already holds a handheld and already owns the table, so `table.state_changed → available` is a waiter action needing no new device, login or permission row. **Stated cost:** attribution records the waiter who tapped, which may not be the person who physically cleaned — acceptable because the attribution that matters here is *who asserts the table is ready to seat*, and that is a waiter judgement either way.

- 04-F20 **The waiter has an own-attribution day view — the "I'm clean" view (gap G3).** `04 §5` listed it under Data and no FR created it, while every other role's protection view has one (`02-F23` cashier, `09-F16` rider, `11-F6` staff). It shows the waiter their own tables, their own items and their own day, and nothing about anyone else. Same purpose as `02-F23`: adoption depends on staff believing the system is on their side rather than watching them, and a role that can be *questioned* by the record but cannot *read* it is being watched.

**The terminal — build 1 (August 2026). `04-F21` restates this module's premise; everything after it follows.**

- 04-F21 **THE PAD IS A TERMINAL OF THE TILL, NOT A DEVICE IN THE LEDGER'S SENSE — and the reason is the wire rather than a preference.** `01-F62` requires `branch_id`, `branch_created_at` and `time_basis` on every branch-scoped envelope, *"stamped at append by an originating device"*, and every event this module emits is branch-scoped. `05-F28` measured that wall one module over and `05-F32` answered it with a fourth option — the decision stays on the device that holds the credential. This FR takes the same option for the same reason, and adds the measurement that forecloses the alternatives: the branch LAN listener is mutual TLS pinned on the peer's **client certificate** (`01-F72` (a), `01-F74` (c)), and a browser holds no client certificate and cannot be given one. **The mesh port is structurally closed to browsers and must not be opened to serve this module.**
  - **What the pad is.** A remote renderer of a local-plane device — the relationship `18 §9` already gives the Electron renderer over IPC, stretched over a wire. It holds no store, no device identity and no credential beyond a session handle. Every act travels to the till as an **intent**; the till verifies, authorizes and appends. The envelope's `device_id` is the **till's**; the envelope's `actor_user_id` is the **waiter's** (`02-F41` — actor unchanged, and there is no "acting for").
  - **It is not a third plane and must not be written as a commandment-5 amendment.** Commandment 5 requires operational screens to read and write through `sync-client` only; they do, in the till's main process, which is where the store is. The browser has no data layer at all, which is a *stronger* property than the one commandment 5 asks for. `18 §6`'s local-plane list is amended to say so.
  - **Stated costs, none of them left to be discovered.** (i) The pad's availability IS the till's availability, and `00 §5.7`'s strip must say so rather than showing a dead control. (ii) `01-F5`'s audit chain is per-device, so ten tablets are one device: what is lost is *which glass*, which no FR asks for, and the attribution that matters (`02-F41`, per waiter) is intact. (iii) `04-F16`/`04-F17`'s scoped slice and `04-F4`'s proposed kernel amendment are **not needed** under this resolution and are marked so in place rather than deleted — a tablet holding nothing has that privacy property structurally, and they return only if this module is ever ruled back to a native app.

- 04-F22 **TERMINAL ADMISSION IS THREE SEPARATE THINGS — a transport, an enrolled tablet, and a person — and no listener exists without the first.** `01-F72` exists because *"every launch of either app opens an unauthenticated read-write port onto the branch money ledger, on every interface, for anyone on the shop Wi-Fi. The customer network in a Pakistani restaurant is the staff network."* A terminal port is a second such port and must not be weaker.
  - **(a) TLS, or nothing listens.** Plain `http://` is refused on three counts and only the first is about eavesdropping: the waiter's PIN would cross the staff-is-customer Wi-Fi in cleartext; a plain-HTTP private-IP origin is not a secure context, so there is no service worker and no cached app shell for a tablet that reloads while the AP is rebooting; and Web Crypto is unavailable there, which forecloses (b) entirely. **A till with no certificate material starts no terminal listener at all**, reports that on `00 §5.7`'s strip, and goes on selling (`01-F17` — the till is not degraded by the pad's absence). Absent means OFF, never absent means plaintext.
  - **⚠ (a) IS NOT CLOSED BY THIS FR AND IS BUILD 1'S REAL BLOCKER.** Serving TLS is one thing; a browser *trusting* it is another, and that is a founder call between a cloud-issued publicly-trusted certificate (zero tablet setup; costs a DNS zone, an ACME pipeline, and a renewal that needs WAN, so a branch WAN-dark past expiry loses the pad) and an org root CA installed per tablet (no cloud work, works offline forever; costs a manual step, a permanent browser warning, and a root CA on a staff tablet). **Neither can be reused from `01-F73`'s branch PKI, because that PKI is issued to no shipping till** — `store.setLanCredential` has no shipping caller, so `lanCredential()` is `null` everywhere and the LAN mesh does not run. This FR specifies the *shape* of the seam and refuses to invent the pipeline (commandment 2).
  - **(b) The tablet proves possession of a key; it never presents a bearer string.** `01-F72` (a) refuses a replayable secret. The tablet generates a **non-extractable P-256 keypair** in WebCrypto — the curve `01-F73` already uses — and enrols its public key at the till against a one-time code an operator reads off the till and types once. Every request thereafter is signed over a **single-use server nonce bound to that request's body**, so a captured request cannot be replayed and a captured log yields nothing to present. Enrolments are listed and revocable at the till. **What this does NOT defeat**, stated so no later reader over-reads it: an *active* man-in-the-middle on a connection whose certificate the operator waved through can relay the nonce and the signature and ride the session. Only (a) closes that, which is why (a) is the blocker and not the polish.
  - **(c) The person is verified BY THE TILL, and the tablet never names an actor.** The actor may never arrive on the wire as a claim: the till's verified-append header refuses an `actor_user_id` on a renderer request because *"a compromised renderer could name its own actor"*, and a tablet on the shop Wi-Fi is more untrusted than the renderer. The till verifies the PIN against the same synced registry, the same Argon2id hashes (`01-F28`) and — the load-bearing clause — the **same durable per-(device, user) counter** (`01-F61`), so failures at the pad and failures at the till count once. Verification must not move the till's own session (`02-F41`; the approver-verification seam is the precedent). The tablet receives an **opaque handle** and never a user id it could edit. `01-F26`'s idle auto-lock applies to the handle.
  - **`01-F61`'s lockout scope, read rather than widened:** with several tablets behind one till, "device" is the till, so a waiter locked out at one pad is locked out at all of them and at the counter. That is one credential with one counter and it is the correct reading; the residual — a waiter stopped mid-service by someone else's guessing — is the cost of `01-F61`'s own ruling that a lockout with no automatic end is worse, and its cooldown is what bounds it.

- 04-F23 **THE TERMINAL'S EVENT SET IS CLOSED AND NARROWER THAN ANY ROLE'S — SO BUILD 1 MINTS NO ROLE, AND THAT IS A RULING RATHER THAN A DEFERRAL.** `04-F2`/`04-F3` and `03-F52` say *waiter* throughout, `restaurant-os.md`'s seed roles name *Waiter/Captain*, and the shipped permission matrix has four columns and no such one.
  - **What build 1 actually needs is ONE action: `order.create`.** `order.created`, `order.line_added`, `order.line_removed` and `order.confirmed` all map to it, and `cashier`, `branch_manager` and `owner` already hold it. `04-F7`'s availability toggle is layer-2 and defaults to view-only, so build 1 does not need `availability.toggle` either.
  - **The narrowing a `waiter` column was wanted for is delivered by the TERMINAL, not by the role.** The pad's blast radius — *a stolen tablet can ring food; it cannot settle, refund, open a drawer, pay out, void after KOT or read cash* — comes from a closed event-type set enforced on the till **in addition to** the matrix: the terminal refuses `payment.recorded` **for an owner**. A role narrows a *person* across every surface; this narrows a *surface* across every person, and the second is what the blast-radius claim actually describes. Both gates must pass and neither substitutes for the other.
  - **⚠ What minting nothing does NOT close, stated precisely because the neighbouring case is one keystroke away (`01-F66`'s lesson).** No role in the matrix holds `order.create` without also holding the settle action. So a restaurant that wants a person who may ring and may not settle **cannot express that today**, and a waiter issued a cashier PIN in order to use the pad can still walk to the till and settle — which degrades `02-F23`'s per-cashier drawer expectation, permanently under `01-F1`. Build 1 neither requires nor causes that, because it changes no PIN issuance; it also does not fix it. **Minting `waiter` is the fix, it is a doc-14 act on a protected path (a new matrix COLUMN, not `14-F30`'s new row), and build 1 has no capability that would distinguish the column** — so it is recorded as owed here and deliberately not taken on a build that cannot exercise it.

- 04-F24 **`04-F6`'S LOCAL-PERSISTENCE CLAUSE NAMES THE TILL'S STORE, AND THE PAD NEVER ACKS A KOT IT HAS NOT SENT.** `04-F6` reads *"lines are persisted locally as events before UI ack (`01-F2`) — a dying battery never loses a captured order."* Under `04-F21` the durable point is the till, one device over: `01-F2`'s property survives **as a system** — the ack still follows durable persistence — but the tablet is not the thing that persists, and leaving that implied is how a screen comes to promise what no store is keeping.
  - **When the pad loses the branch LAN mid-order** — an AP reboot, a courtyard dead zone — it **buffers captured lines in the browser and renders them as visibly unsent** (`00 §5.7`; the shape `05-F26` already rules for a paused channel), and **SEND refuses, in place and with its reason, until the till is reachable**. A KOT that has not reached the spooler is food that is not being cooked and no screen may imply otherwise.
  - ⚠ **It REFUSES; it is not DISABLED, and the distinction is `27-F5`'s rather than a nicety.** An inert primary control is that FR's own named failure mode, and `02-F48` already took this exact resolution one surface over: the tender control stays live, at a byte-identical rect, and answers `NOTHING ENTERED` instead of greying out. So the pad's SEND keeps its position (`27-F4` — nothing moves under a waiter mid-service), states why it will not fire, and appends nothing. *This clause said "disabled" when it was written and was corrected the day an implementation met it — the two rules are one keystroke apart in English and opposite in the component library.* `01-F17` is untouched: nothing here blocks a sale, and the till goes on selling either way.
  - **The one ack that must stay truthful is the KOT's**, and the reason is measured rather than argued: `01-F66` records a till that showed `Nothing added yet` against a zero total while its database was locked, and a cashier could not tell it from a working one. A pad that acked an unsent kitchen ticket is that failure with a guest waiting at the table.

- 04-F25 **`table_id` IS THE OPERATOR'S LABEL, NORMALIZED AT THE WRITER — decided before the first order, because `01-F1` freezes it.** `order.created.table_id` and `order.table_assigned.table_id` are free strings, so whatever build 1 writes there is permanent. The label (`7`, `Roof 3`) is chosen over a synthetic id on the pattern the caller-file normalizer already argues for — *normalization belongs at the WRITER* — because history stays readable with no roster, and build 1 has no roster to draw ids from. **Stated cost:** renaming a table silently re-points its history, which a synthetic id would have avoided at the price of making every historical order unreadable without a roster snapshot. The roster itself is build 2, is a layer-2 config key whose schema this doc will declare, and waits on `01-F87`'s carrier — which is unbuilt and already owed to three other cells.

- 04-F26 **THE SURFACE IS A LANDSCAPE TABLET; THE PHONE IS NOT COVERED, AND §1's BYOD-PHONE PREMISE IS SUPERSEDED.** `27 §1a`'s ~10.1″ tablet in landscape is a shipping panel class today. A phone in portrait is **not**: the layout gate records that its phone row *"is deliberately absent and must stay absent … a portrait surface the counter has no layout for … a portrait layout is separate work"*, and the component library has no portrait arrangement to render. So `04-N1`'s APK and RAM budgets, `04-N2`'s cold start and `04-F1`'s pairing-as-a-device describe an app this module is no longer building; they are superseded by `04-F21` rather than deleted, and they return with a native app if one is ever ruled. **Nothing here weakens `27-F8`'s physical target or `27-F11c`'s clamp-and-start** — a pad below the floor degrades and says so, exactly as a till does.
  - **Coursing is not designable and is therefore not designed here.** This doc contains no occurrence of *course* or *fire*; doc 03 promises a KOT that may group by course, and nothing in the product can supply a course — there is no course field on `order.line_added`, no fire act and no held-line state in `01 §4`. Both are doc 01/02 spec acts and inventing either would be commandment 2. **Recorded as a finding for doc 03's KOT layout owner: an option exists whose input does not.** Seat-level assignment is the same shape and gets the same answer.

## 4. Key flows

**Seat → order → serve (happy path)**
1. Waiter marks table seated → captures 3 items with modifiers + a note → confirm → KOT prints at stations < 2 s → table auto-flips to `ordered`.
2. Kitchen bumps; pass assembles ("2 of 3 ready…"); order marked ready → waiter's phone chimes, names the table → waiter picks up, taps served → table `served`.
3. Guests ask for the bill → waiter taps needs-bill → counter POS surfaces it, settles, prints the receipt → table flips `cleaning` → **the waiter** taps done → `available` (04-F19 — **founder ruling July 2026: there is no busser role**).

**WAN down, LAN up**
1. Internet dies mid-rush → the handheld keeps capturing over the LAN mesh (00 §5.1).
2. Availability toggles and ready notifications keep flowing peer-to-hub (01-F15); staff notice nothing.
3. WAN returns → the hub drains the branch outbox to cloud (01-F8); no waiter-visible catch-up state.

**BYOD onboarding**
1. Manager generates a pairing code (doc 14) → waiter installs the app, enters the code → device registers class `handheld`, scoped slice on → waiter sets PIN → taking orders within 10 minutes.
2. Offboarding: back-office revoke → device loses LAN + cloud on next contact, slice wiped (04-F5).

**Void initiated tableside (failure-path discipline)**
1. Wrong item discovered after KOT → waiter requests void with reason → escalation to manager console (doc 05) or counter PIN (doc 02) → on `approval.granted`, `void.recorded` lands and the handheld reflects it. The handheld itself never approves.

**Availability race**
1. Two tables order the last karahi from two handhelds while partitioned from each other → both confirms stand (01-F16/F17 spirit: never block a sale on state math) → kitchen 86es one → item toggled off → one table gets an apology, the ledger gets the truth.

## 5. Data

- **Materialized (device, scoped):** own/section open orders + lines, branch table map, availability set, ETA cache, own-attribution day summary (my tables, my items — the waiter's "I'm clean" view).
- **Emitted:**
  - `order.created / line_added / line_removed / confirmed / note_added / table_assigned`
  - `order.line_state_changed` (`ready` per 04-F14, `served`)
  - `table.state_changed`
  - `availability.changed` (if permitted)
  - `audit.*`
- **Extensions to 01 §4 introduced by this doc:** `table.state_changed` (consumers: doc 05 floor state, doc 02 table view).
- **Consumed:** `availability.changed`, `order.line_state_changed`, `order.confirmed`, settlement state on own tables (as table-state transitions, not payment detail), `eta.estimates_published`.

## 6. Non-functional requirements (module-specific)

- 04-N1 Footprint budgets on a 2 GB Android 10 device (CI-gated against the reference phone, 00 §4):
  - APK ≤ 40 MB, installed ≤ 120 MB;
  - scoped-slice data ≤ 100 MB;
  - steady-state RAM ≤ 250 MB.
- 04-N2 Cold start ≤ 4 s to an unlocked capture screen on the low-end reference phone — tighter than the 6 s POS budget, because waiters open the app mid-conversation at the table.
- 04-N3 Ready-notification latency ≤ 2 s on LAN; capture-to-KOT inherits 00 §5.3 unchanged.
- 04-N4 Battery: a full 8-hour shift of typical duty (screen-off LAN subscription between uses) consumes ≤ 15% on the reference phone — no persistent wake locks.
- 04-N5 All of the above hold with the branch WAN down (00 §5.1).

## 7. Customizability

- **Layer 2 (org):**
  - section assignments;
  - whether waiters may toggle availability;
  - whether BYOD is permitted at all; BYOD single-credential lock (04-F2);
  - scoped-vs-full slice for restaurant-owned handhelds;
  - ready ownership (defined in doc 03);
  - quick-tag list (shared with doc 02).
- **Layer 3 (device):** grid density (compact/large), notification tone.
- **Deliberately not configurable:** widening a BYOD scoped slice to include payment/cash/customer data (never); waiter-side settlement or approval powers; attribution; the table state set (fixed vocabulary — presets, not knobs).

## 8. Tech notes

- Expo + Hermes + `op-sqlite`; dependency budget enforced in CI (bundle-size gate) — this app stays small as a feature, not an accident.
- `packages/sync-client` grows a slice-filter parameter (subscription predicate evaluated server/hub-side) — the single kernel change this module needs (04-F4, 04-F17).
- In-branch notifications ride the LAN socket (no FCM dependency on-site); FCM only as a wake-up assist when Android parks the socket in Doze.
- Distribution: Play Store + EAS update channels (doc 15); BYOD phones follow the staged-rollout rules — never force-update during service hours.
- Table map fold is shared code with docs 02/05 (`packages/domain`) — one fold, three renderers.

## 9. Open questions

1. Formal kernel amendment for the scoped slice (01 §9.2): slice predicate shape, hub-side filter enforcement cost, and backfill semantics on section reassignment.
2. Captain mode: multi-waiter section oversight and table transfer between waiters — pull from T3 pilot demand.
3. Tip capture: attribution exists; whether tips are recorded per order at settlement (doc 02) or declared per shift (doc 11) is undecided.
4. iOS BYOD support — out of scope for the fleet, but some captains carry iPhones; revisit after Wave 4 pilots.
5. Whether the handheld should show the guest-facing storefront QR (doc 06) for at-table self-service handoff — a channel question, parked with doc 06.
6. Whether ready notifications should escalate (re-chime) when food sits at the pass past a threshold — or whether that is doc 05's alarm territory.
