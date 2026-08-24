# Table-side order taking — design

**Planning only. No code, no spec edits.** Owning specs: `04-waiter-app.md`, `02-pos-app.md`.
Every measurement below is dated and was taken on `main` at `1beafcf`, 2026-08-24, with `grep -a`.

## 0. What this is, in one paragraph

The founder asked for an order-taker tablet as a webapp. **The tablet cannot be a device in the
ledger's sense, and it does not need to be.** It is a *terminal of the till*: the browser renders
and captures, the till (which already holds `01-F65`'s identity, `01-F64`'s store and `01-F72`'s
LAN credential) verifies the waiter's PIN and appends. That is `05-F28`'s three-way choice answered
with a fourth option, exactly as `05-F32` answered it with a fourth option one module over.
Everything else in this document follows from that.

**Two builds, in this order.**

| | Build 1 — **the order pad** | Build 2 — **the floor** |
|---|---|---|
| What a waiter can do | Open an order against a table *number*, ring lines, fire to kitchen, add lines to an open check | See a table map, seat, move an order between tables, merge two tables, flag needs-bill, clear |
| New event types | **zero** | zero (all four are already `01 §4` vocabulary) |
| New payload schemas | **zero** | `table.state_changed`, `order.merged` — both doc 01 acts (`01-F4`) |
| New kernel work | **none** | none, *if* `01-F87`'s config carrier exists by then |
| Blocked on | nothing in the kernel | `01-F87`'s config artifact (also owed to tax, R70 rounding, R71 campaigns — `plans/v0.md` gap 3) |

Build 1 is the value: a waiter stops walking to the till, and the kitchen gets a typed, attributed
ticket instead of a shouted one. Build 2 is what makes it *table service* rather than an order pad,
and it is deliberately second because its blocker is shared with three other v0 items and will be
paid off by them.

---

## 1. The constraint, resolved first

### 1.1 The wall, restated with its measurement

`01-F62` fixes the org-scoped event set at **five** types (`catalog.changed`,
`device.registered`/`revoked`, `user.changed`, `config.changed`) and gives the test: *"an event type
is org-scoped when its only legitimate emitter is the cloud plane."* Every event an order pad
produces — `order.created`, `order.line_added`, `order.confirmed`, `order.table_assigned`,
`order.line_state_changed`, `audit.*` — is **branch-scoped**, and a branch-scoped envelope carries
`branch_id`, `device_id`, `branch_created_at` and `time_basis`, *stamped at append by an originating
device*. `05-F28` measured the same wall for the manager console and named its consequence: a
cloud-plane surface "cannot legally emit ANY event doc 05 owns", and building one anyway would be
"a correct subsystem whose only write is impossible."

A browser cannot become an originating device either, and the reason is not policy, it is the wire.
Measured in `packages/sync-client/src/transport-ws.ts:436`: the branch LAN listener is
`createHttpsServer({ cert, key, ca, requestCert: true, rejectUnauthorized: true })`, and admission is
a roster fingerprint pin on the peer's **client certificate** (`01-F72` (a), `01-F74` (c)). A browser
holds no client certificate and cannot be given one — the TLS stack has no access to a key a page
generated. A connection from a browser reaches `https.on("tlsClientError")` and is closed. **The
mesh port is structurally closed to browsers and must not be opened.**

### 1.2 The four resolutions, costed

**(a) Paired browser device with its own store and identity — REFUSED.** It requires either an
amendment to `01-F72` (an application-layer proof-of-possession beside the TLS one) *or* dropping to
the cloud path. `packages/sync-client/src/transport-rn.ts` already took the second road for the
manager and wrote down why: `createWsLanTransport` is a WebSocket **server** on `ws` + `node:net`,
"React Native has a client only, and no phone can accept an inbound socket on a shop LAN anyway."
A cloud-only order pad is `00 §5.1` and commandment 4 broken for an in-branch feature — the exact
breach `apps/pass-kds/src/main/mesh.ts` was built to close. Dead as posed. *(The application-layer
variant is live and is decision 3 below.)*

**(b) React Native app — REFUSED for now, on the founder's own most recent ruling.** `05-F31` (R49,
August 2026) deleted `apps/manager`'s Expo host and stated the reason: two TypeScript versions,
`apps/manager` outside the root tsconfig program, EAS builds, and **"zero `packages/ui` components
exist for RN, so an RN surface breaches commandment 6 in a file whose own header admits it."**
Measured today: `packages/ui/src/components/index.ts` exports **22** components, all React-DOM.
An RN waiter app reuses **none** of them, gets no `layout:check` rail, and `18 §12` gives RN one
tool (Maestro on the `00 §4` rig) and **there is no rig** — so nothing would execute
`storage-op-sqlite.ts` either. *What (b) would buy, and it is real:* full offline capture, and a
consumer for `packages/sync-client/src/rn.ts` + `storage-op-sqlite.ts`, which `05-F31` predicts will
become unreached exports by subtraction the day `apps/manager` is deleted. Keep that in view: if the
founder ever wants BYOD phones, this is the road, and the kernel door is already built.

**(c) Thin client of the till, over the branch LAN — RECOMMENDED.** The tablet is a browser. It
holds no ledger, no device identity and no credential material beyond a session. Every act travels
to the till as an **intent**; the till verifies, authorizes and appends. The envelope's `device_id`
is the till's; the envelope's `actor_user_id` is the **waiter's**.

**(d) The naming that makes (c) legal rather than a loophole.** The two-plane law has two planes and
this is neither. It is a *remote renderer of a local-plane device* — the relationship the Electron
renderer already has with `main` over IPC, stretched over a wire. `18 §9` already makes main the
trusted side; commandment 5 says operational screens read and write through `sync-client` only, and
they do — in the till's main process, which is where the store is. The browser has no data layer at
all, which is a stronger property than the one commandment 5 asks for. **This wants a spec PR to
`18 §6`** (which today lists `waiter` on the local plane as a `sync-client` host) and to `04 §8`,
in the shape `05-F31` used. It is not a commandment-5 amendment and must not be written as one.

### 1.3 The seam already exists, and its own comment is the warning

`apps/pos-electron/src/main/gateway.ts:1138` is `createVerifiedAppend({ store })`, whose signature is
`(actor_user_id: string, req: unknown) => AppendResult`. It stamps the till's identity and an actor
the caller has *just verified*, takes no `session` dep so it cannot move one, and writes
`actor_user_id` verbatim so an empty string is refused one layer down. It was built for `05-F29`'s
two-identity problem (`02-F41`: actor unchanged, approver recorded) and is wired at
`main/index.ts:1359`. **It is exactly the append a waiter terminal needs.**

Its header also names the trap, and it names it against us:

> "An optional `actor_user_id` on `AppendRequest`. That field crosses the IPC bridge, so a
> compromised renderer could name its own actor. `18 §9` makes main the trusted side precisely so
> this cannot be expressed."

A tablet on the shop Wi-Fi is *more* untrusted than the renderer. So the actor may never arrive on
the wire as a claim. **The till must verify the waiter itself** — Argon2id against the staff registry
it already holds (`01-F26`/`01-F28`, `packages/sync-client/src/pin-session.ts`), with `01-F61`'s
per-(device, user) lockout — and hold the resulting identity **server-side, bound to the connection**.
The tablet gets an opaque session handle and never a user id it could edit.

Authorization is unchanged and already built: `apps/pos-electron/src/main/authorize.ts` maps every
event type to a `PERMISSION_ACTIONS` entry and runs `can()` before the ledger is touched
(commandment 8). A terminal request goes through the same gate as a renderer request, because it is
the same gate.

### 1.4 What (c) costs, stated rather than discovered

1. **`04-F6`'s local persistence is not delivered.** Its words are *"lines are persisted locally as
   events before UI ack (`01-F2`) — a dying battery never loses a captured order."* Under (c) the
   durable point is the till, one device over. `01-F2`'s property survives *as a system* — the ack
   still follows durable persistence — but the tablet is not the thing that persists. **Doc 04 must
   be amended**; this is not a detail to leave implied. Decision 4 is what the amendment says.
2. **No till, no pad.** A branch with a dead till is not trading anyway, but the pad's availability
   is now the till's availability and it should say so on the honesty strip (`00 §5.7`).
3. **The ledger cannot tell two handhelds apart.** `01-F5`'s audit chain is per-device; ten tablets
   are one device. The attribution that matters — `02-F41`, whose PIN is in — is intact and is per
   waiter. What is lost is *which glass*, which nothing in the corpus asks for.
4. **A second listener on the branch LAN.** This is the serious one; §2.2.

### 1.5 What (c) *deletes*, which is larger than it looks

`04-F16`/`04-F17` build a scoped sync slice with a hub-side subscription filter, and `04 §8` calls it
**"the single kernel change this module needs."** Under (c) the tablet holds nothing, so the
privacy property those FRs engineer is structural: no payment events, no cash, no shift, no other
waiter's detail, no customer file, no history — because there is no store. `01-F41`'s reassignment
backfill is likewise moot. **The whole of `04 §3`'s scoped-slice section and `04-F4`'s proposed
`01 §9.2` kernel amendment are not needed for this build.** They come back only with option (b).

---

## 2. Build 1 — the order pad

### 2.1 Shape

Four processes today (`plans/wave-1/running-the-stack.md`); this adds **no** process. The till's
Electron main gains a second LAN listener and serves a static bundle plus a small intent API.

```
tablet browser  --wss-->  till (Electron main)  -->  createVerifiedAppend(waiter_id, intent)
   (no store)              PIN verify, can(), store.append, spooler, mesh, cloud
```

Reads are the same: the terminal subscribes to the till's own converged fold (the fold the renderer
already reads through `gateway`), so live availability (`02-F7`, shipped — `gateway.ts:790` is its
only production emitter), catalog, prices per `(branch, channel)` (`01-F60`) and line states arrive
for free and stay correct with the WAN down.

### 2.2 The LAN leg — the part that needs adversarial review

`01-F72` exists because *"every launch of either app opens an unauthenticated read-write port onto
the branch money ledger, on every interface, for anyone on the shop Wi-Fi. The customer network in a
Pakistani restaurant is the staff network."* A terminal port is a second such port. It must not be
weaker than the first, and the mesh port must not be weakened to serve it.

**Transport.** Plain `http://` is refused on three counts, not one: (i) the waiter's PIN would cross
the staff-is-customer Wi-Fi in cleartext; (ii) `http://192.168.x.x` is **not a secure context**, so
no service worker, so no cached app shell, so a tablet that reloads while the AP is rebooting has no
app at all; (iii) `crypto.subtle` is unavailable there, which forecloses option (a) later.
So: **TLS, with a certificate a browser already trusts.** Decision 2 is which kind.

**Admission.** Not mTLS (browsers cannot). Two candidates, decision 3:
- *Now:* a per-tablet enrolment secret minted at the till, shown once, stored in the browser,
  presented on every connect over TLS, plus the waiter's PIN. `01-F72` (a) refuses a bearer string
  because *"it is replayable by anyone who observed it, and on a plaintext LAN everyone observed
  it"* — the clause is aimed at a **plaintext** LAN, and TLS removes the observer. **That is a
  reading, and it is one keystroke wide**; it is flagged as such and belongs in a commandment-10
  review before a line is written, not after.
- *Better:* the tablet generates a non-extractable P-256 ECDSA keypair in WebCrypto (the same curve
  `packages/lan-pki/src/index.ts` already uses), enrols its public key at the till, and answers a
  signed nonce on every connect. Real proof of possession, not replayable, revocable from a list on
  the till. This is `01-F72`'s property achieved one layer up, and it is a doc-01 amendment.

**Blast radius, either way.** The terminal's permission set is `order.create` and nothing else
(§2.5). A stolen tablet can ring food. It cannot settle, refund, open a drawer, pay out, void after
KOT, or read cash — because `can()` refuses, on the till, before the ledger is touched.

### 2.3 Screens — copied, not invented (R34)

The mainstream floor interaction is settled and we copy it.

- **Petpooja Captain Ordering (India, the closest market to ours).** Waiter picks a table, the menu
  is a category-tabbed grid, KOT fires straight to the station printer, every modification is logged
  with a staff name, and the app runs over branch Wi-Fi with no internet. This is the whole of build
  1, and it is the model to follow because it is aimed at exactly our restaurants.
  ([Petpooja Captain Ordering App](https://www.petpooja.com/poss/captain-ordering-app),
  [why it reduces order errors](https://blog.petpooja.com/industry-business-guides/petpooja-captain-ordering-reduces-order-errors/))
- **Toast Go.** Handheld order-and-pay at the table; "you can take new orders in offline mode" and
  tickets still reach a hardwired KDS. We copy the *offline honesty* posture, not the card capture.
  ([Toast handheld](https://pos.toasttab.com/ca/products/handheld-pos),
  [Toast offline mode](https://support.toasttab.com/en/article/Using-Toast-in-Offline-Mode))
- **Square for Restaurants.** A table is occupied "as soon as a cover count is set, even if no items
  have been added" — the *seated-before-ordered* state that `04-F10` also names. Build 2.
  ([Square floor plan](https://squareup.com/help/us/en/article/6427-building-your-floor-plan))
- **Lightspeed Restaurant.** Move a table and transfer items between tables/seats by tap-and-drag;
  "send orders to the kitchen or bar and fire courses as needed." Build 2 and beyond.
  ([Lightspeed floor plans](https://k-series-support.lightspeedhq.com/hc/en-us/articles/1260804656689-About-floor-plans-and-tables))

**What we copy for build 1 and nothing more:** table pick → category-tabbed grid → cart → SEND.
`04-F6`'s budget stands: a simple order is ≤2 taps from grid to confirm.

**Four screens, and the tab rail is the counter's own (`packages/ui` `TabRail`, `ItemGrid`, `Cart`,
`Tile`, `NumericKeypad`, `MoneyValue`, `PanelHealth`, `ConnectionFacts`):**

| Screen | What it is |
|---|---|
| **Unlock** | `PersonTile` grid → PIN pad. `01-F61`'s lockout applies; the till is the verifier. |
| **Tables** | A grid of table labels with *open / free* and, per open table, its line count and running total. Not a map — build 2. |
| **Order** | `ItemGrid` + `Cart`, identical to the counter's, minus every money control. SEND fires `order.confirmed` and the KOT spools on the till. |
| **Me** | `04-F20`'s own-attribution day view: my tables, my items, my day, nothing about anyone else. Same argument as `02-F23` — a role that can be *questioned* by the record and cannot *read* it is being watched. |

**Panel class.** `27 §1a`'s 10.1″ Android tablet in landscape is a **shipping** panel class today
(`tablet-10.1`, `netbook-1024`, `ships: true`), because `packages/ui`'s `compact` mode became a real
arrangement in August 2026. **A phone in portrait is not** — `apps/pos-electron/src/layout-gate/main.ts:128`
records that `phone-6.5` "is deliberately absent and must stay absent … a portrait surface the
counter has no layout for … a portrait layout is separate work." The founder asked for a tablet and
that is the class the design language can actually render. Doc 04's "cheap Android phones including
BYOD" is not buildable from `packages/ui` today and should stop being the module's premise.

### 2.4 The order lifecycle across people, and who the actor is

`02-F41`: attribution is whoever's PIN is in, with no "acting for". Applied:

| Event | Actor | Emitted by | Note |
|---|---|---|---|
| `order.created` (`channel: counter`, `order_type: dine_in`, `table_id`) | waiter | till, on the tablet's intent | `02-F1` requires both axes at creation and forbids inferring later; `ORDER_TYPES` in `Counter.tsx:278` already offers `dine_in` |
| `order.line_added` | waiter | till | price snapshotted at line-add (`01-F18`), resolved per `(branch, channel)` (`01-F60`) |
| `order.confirmed` | waiter | till | KOT spools durably on the till (K-6/K-7); zero waiter-side print config, per `04-F6` |
| second `order.confirmed` for added lines | waiter | till | `04-F8`'s incremental KOT — already how the counter works |
| `order.line_state_changed → ready` | pass/kitchen | pass screen | `03-F24`'s layer-2 ownership; the pad shows it, does not own it |
| `order.line_state_changed → served` | waiter | till, on the tablet's intent | `03-F52` already names **`waiter`** as a legal serve-signal owner. Marks only `ready` lines, `ready → served` only |
| `payment.recorded`, `order.settlement_closed` | **cashier** | till, renderer | `04-F9`: settlement is not on the handheld. Two people, two identities, one order, and the ledger holds both |
| `void.recorded` post-confirm | cashier, approver recorded | till | `02-F8`/`02-F49`: post-confirm removal is a void with an approver. **The pad initiates nothing here in build 1** — the waiter walks to the till, which is `05-F27`'s budgeted walk and `05-F32`'s ruled posture one module over |

**The handoff.** The cashier already sees open orders in the counter's Orders tab; build 1 adds the
table label to that row (`02-F10` searchable by table). There is **no `needs-bill` signal in build
1** — that is `table.state_changed`, which has no payload schema. The waiter tells the cashier. That
is what a 20-table Pakistani restaurant does today and it costs nothing to keep doing.

### 2.5 The role — a real gap

Measured 2026-08-24, `packages/domain/src/permissions.ts:45`: `ROLES = ["cashier",
"branch_manager", "storekeeper", "owner"]`. **There is no `waiter`.** `04-F2` and `04-F3` assume a
"waiter-role PIN" throughout; `03-F52` names `waiter` as a signal owner; `restaurant-os.md:149`'s
seed role list names *"Waiter/Captain (handheld, T3)"* — but Appendix A's matrix has four columns and
the code implements exactly those four. So the role exists in the corpus's prose and has no column.

Giving waiters *cashier* PINs is the tempting shortcut and it is wrong in a way that is expensive to
reverse: a cashier PIN carries `payment.settle`, `cash.*`, `receipt.reprint` and `refund.issue`, so
`02-F23`'s per-cashier drawer expectation stops meaning anything the moment eight waiters hold one —
and under `01-F1` the attribution is permanent. **Mint `waiter` with `order.create` and
`availability.toggle` (layer-2, default off per `04-F7`), and nothing else.** This is a doc-14 spec
act on `14-F30`'s precedent (an FR-decided permission row does not extend the seed appendix) —
except that `14-F30` set the precedent for an *action* and this is a *role*, i.e. a new column, so it
is a slightly larger act. `permissions.ts` is a protected path (commandment 10).

### 2.6 Offline — commandment 4

The WAN is irrelevant here: the till persists locally and drains later (`01-F8`, proven end to end
through a killed gateway). The case that matters is **the tablet losing the branch LAN mid-order** —
an AP reboot, a courtyard dead zone, a walk to the roof seating.

Under (c) there are exactly two honest answers, and they are decision 4:

- **Refuse.** The pad greys out and says *"cannot reach the till"* on the `00 §5.7` strip. Nothing is
  captured, nothing is lost, `01-F2` is intact in letter and spirit, and the waiter walks to the till
  — the pre-RestOS state, for the duration. Cheap, honest, and it is what `01-F72`'s and `05-F32`'s
  posture would pick.
- **Buffer and replay.** The browser holds unsent intents in IndexedDB and replays them when the LAN
  returns, rendering them as *visibly unsent* — the shape `05-F26` already rules for a paused channel
  (*"record the local decision immediately … render the aggregator leg as a separate, visibly unsent
  fact"*) and `00 §5.7` requires. **What it buys:** the waiter keeps taking orders through an AP
  reboot. **What it costs:** the UI acks before anything is durable in a ledger — `01-F2`'s hinge, and
  `01-F66`'s recorded disaster (a till that showed `Nothing added yet` against `TOTAL Rs 0` while
  SQLite was locked) is what that failure looks like to a cashier. It also *requires* the service
  worker, so it forces decision 2 toward a browser-trusted certificate.

A middle position exists and I recommend it: **buffer, but never ack a KOT.** Lines may be captured
offline and are shown as *not sent*; **SEND is disabled while the till is unreachable**, because a
KOT that has not reached the spooler is food that is not being cooked and no screen may imply
otherwise. That keeps `01-F17` (a sale is never blocked — nothing here blocks a sale; the till still
sells) and keeps the one ack that matters truthful.

### 2.7 Table identity — decide before the first order, not after

`order.created.table_id` and `order.table_assigned.table_id` are `z.string().min(1)`. Whatever we
write there is frozen under `01-F1`. Two readings, decision 6:

- **The operator's label** (`"7"`, `"Roof 3"`), normalized at the writer — the pattern
  `main/customer-phone.ts` already uses and argues for (*"Normalization belongs at the WRITER"*).
  History stays readable with no roster. Renaming a table silently re-points history.
- **A synthetic id** from the roster. Renames are clean; every historical order becomes unreadable
  without a roster snapshot, and build 1 has no roster to draw ids from.

Build 1 needs no roster either way: the Tables screen is a grid of labels seeded per device (the
fourth such seed — `plans/v0.md` gap 3 already names three, all owed to `01-F87`), with a numeric
keypad fallback when nothing is seeded.

### 2.8 Rails and scaffolding, costed

`apps/waiter` is `export {}` (2 lines). It needs: a package with real `build`/`test`/`dev` scripts
that actually start (the recurring defect's tenth instance was a service with no `dev`); a string
catalogue for `strings:check` (`00 §5.6`, `14-F38` — no FR ids, env keys, repo paths or spec refs on
glass); `tokens:check` compliance; and **its own `layout:check`** — the root script is
`pnpm -C apps/pos-electron layout:check && pnpm -C apps/pass-kds layout:check`, so a third surface is
invisible to that rail until it adds one. ⚠ For a browser served from the till there is no
`BrowserWindow` to import options from; the gate would have to drive a real Chromium at the tablet's
CSS viewport. **That is new rail work and it should be planned as work, not assumed.** Nine layout
defects have been found by launching and looking and **zero** by the `.dom.test.tsx` suites, which
perform no layout at all.

*(Two `AGENTS.md` lines are stale and are reported, not edited: `pnpm verify` is three steps —
`verify:full` is the seven-step one; `packages/ui` exports 22 components, not 18; `02-F7`'s
availability toggle ships; `served` has a producer via settlement. Measured 2026-08-24.)*

---

## 3. Build 2 — the floor

### 3.1 What "the floor" has to be to survive contact with a restaurant

**Not a drawing tool.** Square and Lightspeed ship geometry editors because their customers have
hosts and reservation books. Petpooja's captain app works off a **table grid grouped by section**,
and that is the right target: a floor plan nobody maintains is worse than a list, because it is
*wrong* rather than *absent*. So: **a roster, not a plan** — an ordered list of table labels, each
with an optional section (`Hall`, `Roof`, `Family`), authored once in the back office and rendered as
a sectioned grid on three surfaces (`04-F12`: one fold, three renderers).

If a founder later wants geometry, it is additive: `x`, `y`, `shape` on the roster row, ignored by
every surface that does not draw.

### 3.2 Where the roster lives — already decided, and not by this plan

`01-F87` (founder rulings R55, R60, R63) rules that the configuration plane has two carriers:
`config.changed` carries the *change* (org-scoped, cloud-emitted, for `14-F3`'s history and the
Auditor's refold) and **`config` joins `01-F75`'s closed reference-resource set as its fourth
member** to carry the *value*, on the frame triple that already exists, adding **zero** message
kinds. `01-F87` (a) also says the key space is open and *"each key's declared schema — type, unit,
bounds, refusals — belongs to the doc that owns the key."*

So the table roster is **a layer-2 config key whose schema doc 04 declares**, and it needs no new
resource, no new message kind and no kernel act. What it needs is for `01-F87`'s carrier to be
**built**, which it is not (`packages/config/src` is `dsn.ts` and `index.ts`). That carrier is
already owed to the tax cell, R70's rounding granularity and R71's campaigns. **The floor is its
fourth customer, not its first, and that is the argument for build 2 being second.**

Ownership: the owner authors it in the back office (doc 14, cloud plane, tRPC — commandment 5),
because that is where `config.changed` can legally be emitted (`01-F62`). A waiter never edits it.

### 3.3 Table state — one doc-01 payload act

`table.state_changed` is `01 §4` vocabulary (absorbed from doc 04). Measured 2026-08-24:
`packages/domain/src/registry.ts` declares **no** schema for it, so under `01-F4` it is an
`UnknownEventTypeError` at emit — **unemittable, not merely unbuilt**, the state `05-F7`,
`03-F54` and `01-F84` each record one type over. It needs a payload, and that is a doc 01 act.

`04-F10`'s state set is fixed and is not ours to widen: `available`, `seated`, `ordered`, `served`,
`needs-bill`, `cleaning`. `04-F11` makes most of them side effects (first `order.confirmed` →
`ordered`; all lines `served` → `served`; settlement → `cleaning`) and leaves manual taps for
`seated`, `needs-bill` and `cleaning`-done (`04-F19`: **the waiter clears; there is no busser**).

⚠ **Two things the payload must get right, and both have precedent in this corpus:**
1. **Convergence without a clock.** Two waiters tapping one table is ordinary, not exotic. Law 1
   (`01-F34`) forbids a fold reading ordering metadata, so "latest wins" is illegal. The corpus has
   *two* worked instances of the convergent form — `order.table_assigned`'s `supersedes` DAG
   (`merge.ts:963`, with `from_table_id` so the origin is nameable) and `01-F57`'s
   `availability.changed`. **Copy that shape exactly**: each state change names the changes it
   replaces, the fold takes the maximal set, and a divergent set renders as a conflict rather than
   resolving itself.
2. **A derived state must not be a stored one.** `ordered` and `served` are folds of the order's own
   lines. `02-F45`'s rule against two sources for one fact says they should be *derived*, not
   emitted — otherwise the table says `served` and the lines say `in_prep` and nothing can say which
   is right. My reading: `table.state_changed` carries only the **asserted** states (`seated`,
   `needs-bill`, `available`), and the rest are projected. That is a narrower event than `04-F10`
   reads, and it is a reading — it belongs in the FR, argued, not in an implementation.

### 3.4 Move and merge

- **Move a table:** `order.table_assigned` with `from_table_id` and `supersedes`. **Emittable
  today**, schema present, fold present, convergent. Zero kernel work.
- **Merge two tables:** `02-F5` names `order.merged` ("child orders referencing the parent").
  Measured: **no payload schema in `registry.ts`** — unemittable, a doc 01 act, same class as
  `table.state_changed`. `02-F59` records four more doc-02 types in this state, so this is a known
  and recurring shape rather than a surprise.
- **Split a bill:** `02-F5` as amended by `02-F59` (R59) — split-by-item only; equal split is
  **deferred** because halves may carry different per-channel tax rates. It is a counter act, not a
  handheld one (`04-F9`).
- **The conflict badge (`01-F19`):** the same table opened on two devices while partitioned →
  **both orders stand**, the table shows a conflict badge, staff merge or reassign, nothing is
  auto-discarded. The fold already computes it: `merge.ts:1449` writes
  `table_conflict: tableIds.length > 1 ? 1 : 0`. `04-F12` requires the badge on **every** surface
  showing the table, not just the two involved. Under design (c) with one till this race is much
  rarer, but it does not vanish: two tills, or a mesh partition between till and pass, still produce
  it.

### 3.5 Courses and fire timing — doc 04 does **not** specify them

Measured across the corpus: `04` contains no occurrence of *course* or *fire*. Doc 03 mentions
courses **twice**, both about paper: `03 §3` ("course grouping (starters/mains) optional, off by
default") and `03-F31` (course/seat grouping as a structural difference of a document *type*), plus
a layer-2 key "course grouping on/off" in `03 §7`. `grep -arn "course" packages/domain/src
packages/escpos/src` returns **nothing** outside tests.

**So doc 03 promises a KOT that groups by course and nothing in the product can supply a course.**
There is no course field on `order.line_added`, no `fire` act, no held-line state in `01 §4`.
Coursing is therefore **not designable here** — it needs (i) a course marker on a line and (ii) a
fire act that moves held lines into `confirmed`, and both are doc 01/02 spec acts. **I am not
inventing them** (commandment 2). Recorded as a finding for whoever owns doc 03's KOT layout: an
option exists whose input does not.

Seat-level assignment (Square's "which customer ordered which dish") is the same shape and the same
answer: not in the corpus, not invented here.

---

## 4. Dependencies on other plans

**From the CRM plan (customer identity):** almost nothing, and deliberately. A dine-in table check
needs no customer. The one thing the pad may want later is **attaching an existing customer to an
open check** for loyalty (doc 17) — so the CRM model should expose *a way to look up a customer by
phone and reference her from an order*, and the reference should be whatever CRM chooses, not a
phone string this plan invents. `apps/pos-electron/src/main/customer-phone.ts` already normalizes at
the writer and states that when a second writer lands, that is the moment the normalizer moves into
`packages/domain`. **A waiter pad would be that second writer.** Flagging it so it lands in CRM's
design and not in ours.

**From doc 03 / the pass screen:** `03-F24` ready ownership and `03-F52` serve ownership are layer-2
keys that today have no carrier (§3.2). Until they do, the pad's serve control is seeded or absent.

**Owed to doc 18 by this design (spec PRs, none of them ours to make unilaterally):** `18 §2`'s tree
and `18 §6`'s plane list both describe `waiter` as an Expo `sync-client` host; `18 §8` says
"waiter/rider/owner/manager stay pure-JS installable". `05-F31` already lists three of the same
corrections owed for the manager and warns what happens when a ruling the corpus cannot cite goes
unwritten: *"a session routed here by AGENTS.md built an RN app, correctly, from the corpus."*

---

## 5. Spec acts this design needs, in order

| # | Act | Doc | Blocks |
|---|---|---|---|
| 1 | The terminal is a remote renderer of a local-plane device; name it and its trust boundary | `04`, `18 §6`/`§9` | everything |
| 2 | The `waiter` role and its two actions | `14` (+ Appendix A column) | build 1 |
| 3 | Amend `04-F6`'s local-persistence clause to the terminal's durable point | `04` | build 1 |
| 4 | Amend `04 §1`/`04-N1`/`04-N2` from "cheap Android phone, BYOD" to "landscape tablet" | `04` | build 1 |
| 5 | Terminal admission: TLS + PIN + tablet identity; enrolment and revocation | `01` (`01-F72` neighbourhood) | build 1 · **commandment 10 review** |
| 6 | Mark `04-F4`, `04-F16`, `04-F17` not-needed-under-(c) rather than deleting them | `04` | tidy |
| 7 | `table.state_changed` payload, with the `supersedes` convergent form | `01` | build 2 |
| 8 | The table-roster config key's schema | `04` (key), carried by `01-F87` | build 2 |
| 9 | `order.merged` payload | `01` | build 2 (merge only) |

Items 5, 7 and 9 touch protected paths (`sync-client`/`domain`) and need adversarial review in a
separate context (`20 §4.4`, commandment 10).

---

## 6. Open questions that are not founder decisions

1. **Does the terminal port belong in `apps/pos-electron` or in a package?** `18 §2` allows
   `services → packages` only and says nothing about an app hosting a server. The auditor's landing
   already took a named cross-service import and recorded the move as owed; do not repeat that
   silently.
2. **`01-F61`'s lockout scope is per (device, user).** With ten tablets behind one till, "device" is
   the till, so a waiter locked out on one tablet is locked out on all of them. That is arguably
   correct (it is one credential) and arguably a stopped waiter. Needs a stated reading.
3. **Does a terminal session survive a till restart?** The till restarting mid-service is the case
   `01-F66` and `ops/startup/restos-counter.bat` already contemplate. A sensible answer is: no, the
   waiter re-enters her PIN, and the pad says so.
4. **What does the pad do about `03-F5`'s printer alarm band?** The KOT spools on the till. If paper
   is out, the *waiter* is the person standing next to the guest. Doc 03 gives the band to the till.
5. **Two tills.** `01-F66` and the mesh make two tills legal; which one a tablet talks to, and what
   happens when it can see both, is undesigned. Build 1 should assume one and say so.
6. **`27-F27`'s angular cap-height is measured by nothing** — the pass screen's author already
   flagged it. A tablet held at 40 cm is a different reading distance from a 22″ pass screen at
   1.5 m and the same gap applies here.

---

## 7. Founder decisions

**1. Architecture: terminal, or native app?**
*Terminal (recommended):* one new app, 22 `packages/ui` components reused, zero kernel changes, zero
new event types, `04-F16`'s scoped-slice engineering deleted; **but** the tablet holds nothing, so a
lost LAN is a lost pad, and `04-F6` must be amended. *Native RN:* full offline capture and a consumer
for the RN kernel door that already exists (`sync-client/rn.ts`, `storage-op-sqlite.ts`); **but** it
is the toolchain R49 just deleted for the manager — zero RN UI components (commandment 6 breached by
construction), two TypeScript versions, EAS builds, no `18 §12` rig, and a portrait layout that does
not exist. *Cost of getting this wrong:* the terminal is a two-week build that can be replaced; the
RN app is a parallel component library.

**2. The certificate on the LAN leg.** *Cloud-issued, publicly trusted* — a hostname resolving to the
till's LAN IP with a real certificate delivered over the existing cloud session; this is the
[Plex `plex.direct`](https://words.filippo.io/how-plex-is-doing-https-for-all-its-users/) pattern and
it needs **zero** setup on the tablet. Cost: a DNS zone and an ACME DNS-01 pipeline on the cloud
plane, and a renewal that needs WAN roughly quarterly — a branch WAN-dark past expiry loses the pad,
so the warning must fire early and loudly. *Org root CA installed on each tablet:* no cloud work,
works fully offline forever; cost is a manual per-tablet step, a permanent Android "network may be
monitored" warning, and a root CA sitting on a staff tablet.

**3. Tablet admission: bearer enrolment secret now, or proof-of-possession first?**
*Bearer over TLS:* ships build 1 immediately; rests on the reading that `01-F72` (a)'s refusal of
bearer strings was aimed at a plaintext LAN. If that reading is wrong we have put a replayable
credential on the shop network. *WebCrypto signed nonce first:* real proof of possession, revocable,
and it is the thing `01-F72` would ask for; cost is a doc-01 amendment plus a commandment-10 review
before build 1 starts — call it two extra weeks and a protected-path review.

**4. Offline behaviour when the tablet loses the LAN.** *Refuse:* the pad greys out and says why;
`01-F2` untouched; the waiter walks. *Buffer intents and replay, with SEND disabled until the till is
reachable (recommended middle):* the waiter keeps capturing through an AP reboot and the KOT ack
stays truthful; cost is that the pad shows lines the ledger has never seen, which is exactly the
shape `01-F66`'s disaster took, so it needs the honesty strip to be right and it forces decision 2
toward a browser-trusted certificate.

**5. The `waiter` role.** *Mint it* (`order.create`, plus `availability.toggle` at layer 2): a spec
act on `permissions.ts`, a protected path, and a new Appendix A column. *Reuse `cashier`:* zero spec
work today, and it permanently destroys `02-F23`'s per-cashier drawer expectation the moment eight
waiters hold a settling credential — uncorrectable under `01-F1`.

**6. What `table_id` means, forever.** *The operator's label, normalized at the writer:* history is
readable with no roster; renaming a table re-points its history. *A synthetic id:* renames are clean;
every historical order is unreadable without a roster snapshot, and build 1 has no roster to draw ids
from. This is frozen by `01-F1` on the first order, so it is decided now or discovered later.

**7. Build order.** *Order pad first (recommended):* value in weeks, zero kernel work, and the floor's
blocker (`01-F87`'s carrier) gets paid off by tax and rounding meanwhile. *Floor first:* one coherent
"table service" release; cost is that it waits on a carrier three other v0 items are also waiting on,
and the waiter gets nothing until all of it lands.

**8. Doc 04's premise.** *Amend it* to a landscape tablet as a terminal — which means `04-F1`,
`04-F2`, `04-F4`, `04-F6`, `04-F16`, `04-F17`, `04-N1` and `04-N2` all change or become
not-applicable. *Leave doc 04 alone* and build this as a doc-02 extension called something else. The
second is cheaper today and is precisely the failure `05-F31` wrote up at length: a corpus still
ruling the superseded thing, which sent a session to build the wrong app, correctly.
