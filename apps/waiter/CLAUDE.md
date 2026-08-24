# @restos/waiter

**Owning spec: `specs/04-waiter-app.md` — read it before modifying anything here (AGENTS.md routing).**

**Build 1 of `plans/waiter/design.md` landed August 2026 and was returned DO NOT SHIP by adversarial
review; the fixes are `04-F27`..`04-F32` and are written up below.** ~~T3 BYOD handheld. Scoped sync slice
(01-F39) — never hub, never full branch window.~~ **⚠ SUPERSEDED by `04-F21` and `04-F26`, and both
halves of that line are now wrong rather than merely dated:** this is a **landscape tablet**, not a
BYOD phone, and it is a **browser terminal of the till**, not a device with a slice. It holds no
store, no device identity and no ledger — so `04-F16`/`04-F17`'s scoped-slice privacy engineering is
structural here rather than built, and `04-F4`'s proposed kernel amendment is not needed.

## What it is, in one sentence

The till serves this bundle over TLS on its own port; the tablet signs each request with a key the
browser will not export; the till verifies the waiter's PIN, authorizes the act against the same
permission matrix the counter uses, and appends with the **waiter** on the envelope and its **own**
`device_id`. `05-F28`'s fourth option, for the reason `05-F32` took it one module over.

## Running it

```
pnpm -C apps/waiter build                       # produces dist/
RESTOS_TERMINAL_CERT=<cert.pem> \
RESTOS_TERMINAL_KEY=<key.pem> \
RESTOS_TERMINAL_BUNDLE=<repo>/apps/waiter/dist \
RESTOS_DEV_PIN=<digits> pnpm -C apps/pos-electron start
```

The till prints a one-time **enrolment code** on its boot line; the operator types it into the pad
once. Without `RESTOS_TERMINAL_CERT`/`_KEY` **nothing listens** and the till says so — `04-F22` (a):
absent means OFF, never absent means plaintext.

## ⚠ THE BLOCKER IS NOT IN THE KERNEL, AND THE DESIGN UNDERSTATED IT

`plans/waiter/design.md` is right that build 1 needs **zero** new event types, payload schemas or
kernel work. It is also true that build 1 cannot reach a pilot, and the reason is `04-F22` (a):
serving TLS is one thing, a **browser trusting it** is another. That is a founder call between a
cloud-issued publicly-trusted certificate (zero tablet setup; costs a DNS zone, an ACME DNS-01
pipeline and a renewal that needs WAN) and an org root CA installed per tablet (no cloud work,
works offline forever; costs a manual step, a permanent browser warning and a root CA on staff
glass).

**Neither can be borrowed from `01-F73`'s branch PKI, and this is the measurement that matters:**
`store.setLanCredential` has **no shipping caller**, so `lanCredential()` is `null` on every till
and `createLanMesh` returns `unmeshed("not paired — no LAN credential")`. The design's own opening
paragraph says the till "already holds `01-F72`'s LAN credential". It does not. `packages/lan-pki`
is entirely `@unreached-owed` and `01-F25`'s pairing is v1.

## What is deliberately not built

- **`04-F20`'s own-attribution day view.** It is a *protection* surface — the waiter's "I'm clean" —
  and one showing the wrong day is worse than an honestly missing one. Owed, named, not half-built.
- **`table.state_changed` and the table roster** — build 2, and both are blocked: the type has no
  payload schema (`01-F4` makes it unemittable) and the roster is a layer-2 config key whose
  carrier (`01-F87`) is unbuilt and already owed to three other cells.
- **Coursing and seat assignment.** Doc 04 contains no occurrence of *course* or *fire*, doc 03
  promises a KOT that may group by course, and nothing in the product can supply one. Inventing
  either is commandment 2. Recorded in `04-F26` as a finding for doc 03's layout owner.
- **A `waiter` role.** `04-F23` rules it out for build 1 and states what that does not close.

## ⚠ THIS SURFACE HAS NO `layout:check` ROW AND HAS NEVER BEEN MEASURED IN BLINK

The root script is `pnpm -C apps/pos-electron layout:check && pnpm -C apps/pass-kds layout:check`;
a browser served from the till has no `BrowserWindow` whose options a gate could import, so a third
row is **new rail work**. Nine layout defects in this repo were found by launching and looking and
**zero** by the suites — and `offline.dom.test.tsx` runs in happy-dom, which performs no layout at
all. **Nothing in this package is evidence that a waiter can reach a control.**

Two specific unknowns follow from that:
- **`27-F68`'s density is a PIN, not a measurement.** A browser cannot ask for a display's physical
  size (`devicePixelRatio` is a ratio; `screen.width` is CSS pixels), so `main.tsx` passes `27 §1a`'s
  ~10.1″ tablet figure. The counter's own guide measures what a wrong diagonal costs: every `27-F8`
  target at a fraction of its ergonomic size, **and nothing on screen looks wrong**.
- **`27-F27`'s angular cap-height is measured by nothing**, here as on the pass screen.

## What the design got wrong, found only by implementing it

1. **`table_id` is a SET, not a scalar.** `01-F19` lets two orders stand on one table and
   `merge.ts` refuses to pick between divergent assignments; it has projected `table_ids_json` and
   `table_conflict` since the kernel landed and `shared/ipc.ts` dropped both, so
   `order.created.table_id` reached the ledger and nothing downstream could read it back. A scalar
   would have been a fold decision taken at a plane boundary (`01-F31`).
2. **`04-F24` first said SEND is "disabled". `27-F5` forbids an inert primary control**, and `Tile`
   correspondingly never sets `disabled` — it states the reason in the accessible name and stays
   pressable. `02-F48` took the identical resolution on the counter's tender control. The FR is
   amended to **refuses-in-place**; the code was right and the spec sentence was wrong.
3. **The counter's composition does not drop in.** `AppShell` takes the counter's whole world
   (`actor`, `businessDay`, `alarms`, `onAcknowledgeAlarm`) and owns `03-F5`'s band, which belongs
   to the till; `NumericKeypad` is a **money** pad, not a PIN pad (the counter composes its PIN pad
   from `Tile`s and so does this); `Cart` wants branded `Paisa` and a billed-line shape a handheld
   has no business projecting (`04-F9`). **The closed vocabulary held. The assumption that a screen
   could be copied did not.**
4. **A chip is not the honesty requirement.** The first draft flipped `ConnectionFacts` to `down`
   and stopped there. `00 §5.7` asks the surface to say what is true of the WORK, and "a link is
   down" is not "the food you just rang is not being cooked". Caught by `offline.dom.test.tsx`,
   which could not find the sentence because there was none.

## ⚠ ONE BYTE, AND IT FAILED CLOSED IN A WAY THAT LOOKS EXACTLY LIKE AN ATTACK

`signedBytes` was first written joining the nonce and the body with a **separator**, and the space
in that separator was silently a **NUL**. Both ends had the same source shape and different bytes,
so every honest signature was rejected: `verify` returned false with byte-identical keys, digests
and signature strings, and the only way to find it was `cat -A`. That function's own header had
predicted the failure mode in advance ("a signature over a *different* string than the one the
tablet signed fails closed but for the wrong reason — which is a bug that looks exactly like an
attack"). It is **length-prefixed** now, on both ends, because a prefix has no character anyone can
get invisibly wrong and it removes the concatenation ambiguity a separator carries whenever the
separator can occur in the nonce.

Two smaller traps from the same hunt, worth keeping:
- **`grep` without `-a` printed NOTHING** for `signedBytes` in a file full of `⚠` and `—` while
  `sed` showed it — `T5`, live, in the middle of the investigation it would have derailed.
- **Comparing the first 20 bytes of two SPKIs proves nothing**: that prefix is the P-256 algorithm
  OID and is identical for every such key. Compare the whole thing or compare nothing.

## ⚠ THE ADVERSARIAL REVIEW OF BUILD 1 — SEVEN DEFECTS, AND TWO OF THEM WROTE PERMANENT WRONG MONEY

Build 1 was returned **DO NOT SHIP**. Every defect below was **reproduced before it was fixed**, and
each fix carries an assertion that dies when the defect is put back (matrix below). Six are the
review's; **the second is the audit's** — the review asked for every guard `Gateway.append` applies
to be checked against the terminal's path, and what that turned up was not a guard at all.

**1. `02-F49`'s CONFIRM BOUNDARY DID NOT APPLY TO THIS SURFACE (`04-F27`).** The guard had exactly
ONE call site — inside `Gateway.append`, the *renderer's* method — while `createVerifiedAppend`
built its own envelope beside it. Driven over one real store with the real matrix and the real
verified appends, the counter and the pad in the same test:

```
GATEWAY TOTAL BEFORE: {"total":45000,"lines":1,"confirmed_at":1787588304821}
COUNTER REFUSED: order.line_removed refused (02-F49): order 01a03490… is already CONFIRMED
PAD RESULT: {"ok":true,"order_id":"01a03490…"}
LEDGER order.line_removed COUNT: 1
GATEWAY TOTAL AFTER PAD REMOVAL: {"total":0,"lines":0,"confirmed_at":1787588304821}
```

Rs 450 of confirmed, cooking food off the bill, permanently (`01-F1`), with no `01-F30` term that
would ever show it. **The fix is structural rather than a second call**: `gateway.ts`'s
`checkedAppend` is the one road both producers travel, and the actor is the only thing either
supplies. `addLine`/`createVerifiedAddLine` were the same fork one function over and were unified
the same way. After the fix the identical probe reads `{"ok":false,"reason":"refused"}`, count 0,
total 45000 — and the refusal carries `02-F49`'s way out to the tablet.

**2. THE PAD'S CONFIRM REACHED NO CONSEQUENCE AT ALL — found by the audit, not by the review.**
`03-F2`'s kitchen handoff, `02-F31`'s line advance and the counter's own re-read all lived inside
the renderer's IPC handler, and `kot.confirmed` had exactly one call site there. So a waiter's SEND
appended `order.confirmed` and **no KOT was ever spooled**: the lines were on the bill, the pad said
the till held them, and no station had been told. That is `04-F24`'s one load-bearing ack — *"a KOT
that has not reached the spooler is food that is not being cooked"* — false on this surface from the
first order. The consequences are one named function now, and the terminal is handed the same one
the handler calls.

**3. THE PAD BLOCKED A SALE `01-F59` REQUIRES IT TO ALLOW (`04-F28`).** `MenuRow` dropped
`sold_out`, so the tap gate read the till's *display* verdict and refused an 86'd item — while the
till accepts the identical `add_line` for it. Two taps on a sold-out tile captured nothing. It
refuses only the unpriced case now (`01-F60`), and where a future greying reason is neither, the
error runs toward OFFERING and letting the till refuse with its own sentence.

**4. A DROPPED CONFIRM RE-RANG EVERY LINE (`04-F29`).** SEND cleared its captured rows only when
the confirm answered, so a lost response left every landed line pending and the waiter — with no
ticket in the kitchen — pressed SEND again: `{"appended":[naan×2, naan×2],"confirms":2}`. Four naan
on the ledger and on the KOT. Rows are trimmed on their own `ok` now and the confirm is owed
separately, read back from the till's own converged state. **The residual is named, not closed:** a
lost *answer* to a line that DID land is sent again on the next press, because `order.line_added`
has no idempotency key the way `01-F31` gives a settlement one.

**5. THERE WAS NO SIGN-OUT (`04-F30`).** `Terminal.signOut` and the wire's `sign_out` op both
existed and this app called neither, so the only exit was `01-F26`'s ten-minute idle lock and a
tablet handed on inside that window attributed the next waiter's orders to the last —
permanently. The control is on the tables screen, tells the till, and discards captured-but-unsent
lines rather than carrying one waiter's work into another's session.

**6. ONE TABLET PER BOOT, AND NO WAY TO REVOKE (`04-F31`).** `mintEnrolmentCode` had one call site
(the boot line) and the code is single-use with a five-minute life; `enrolments()` and `revoke()`
had **zero** callers of any kind — the register's `revokeDevice` instance repeated, invisible to
`seams:check` because both are object members rather than exports. `pad` / `pad enrol` /
`pad revoke <id>` on the till's console. ⚠ **TTY-only**: a packaged, double-clicked till has no
console, so there the boot line's single code is still the only enrolment there is.

**7. THE PAD COULD STOP THE TILL (`04-F32`).** A port already bound raised `error` on an emitter
with no listener — an uncaught exception in the main process, reproduced as `EADDRINUSE`, exit 7 —
and certificate material that will not parse threw *synchronously* out of `createHttpsServer`, out
of `counterBoot` and into `fatal`, which exits non-zero saying *"The device store could not be
opened"*. Both are "no pad" now, logged, and the till goes on selling (`01-F17`).

## Mutation matrix — THE REVIEW ROUND (August 2026)

Control: `apps/pos-electron` **1426 pass / 5 env-red (1431)** — the five are
`startup-integrity.test.ts` spawning real Electron with no X display, an environment prerequisite
(`T-01-07`), red on the untouched tree too. `apps/waiter` **14/14**. Every mutant is exactly one
behavioural branch applied to a **committed** tree, so `git checkout --` restores byte-exactly even
if a run is killed (`T8`'s concern met by the commit rather than by a trap a SIGKILL would skip);
the driver refuses a no-op mutant. **Both package suites run whole under every row**, and the
columns are kills **above** the control.

| # | mutant (exactly one branch) | pos | waiter | what dies |
|---|---|---|---|---|
| M1 | **THE GUARD DELETED** — `02-F49` stops refusing on the one road | **8** | 0 | A1, A2, B1, C3 **+ 4 pre-existing** (`line-correction-seam`, `line-removal-guard-scope`) |
| M2 | **THE DEFECT VERBATIM** — the terminal's append builds its own envelope again | **4** | 0 | A1, A2, B2, C3 |
| M3 | **THE COPY** — the guard called a SECOND time instead of once on the shared road | **1** | 0 | B1 |
| M4 | **THE CONSEQUENCE SEAM STUBBED** — `onAppended: () => {}` | **3** | 0 | D1, D2, D3 |
| M5 | **THE TERMINAL GOES SILENT** — a confirm causes nothing | **2** | 0 | C1, C2 |
| M6 | **THE KITCHEN HANDOFF LEAVES THE SHARED FUNCTION** | **2** | 0 | D3 **+ 1 pre-existing** (`aggregator-settlement` §H) |
| M7 | **THE PAD BLOCKS AN 86 AGAIN** — `01-F59`/`01-F17` | 0 | **2** | A3, B1 |
| M8 | **NO TRIM** — a landed row stays pending (`04-F29`'s defect) | 0 | **3** | A1, A3, A4 |
| M9 | **THE OWED CONFIRM DROPPED** — SEND goes quiet after a lost answer | 0 | **1** | A6 — **and 0 on its first run; see below** |
| M10 | **THE SIGN-OUT REMOVED** — `04-F30` undone | 0 | **2** | C1, C2 |
| M11 | **THE PEM THROW RESTORED** — a malformed certificate stops the till | **3** | 0 | A1, A2, A3 |
| M12 | **NO `error` LISTENER** — the uncaught `EADDRINUSE` returns | **3** | 0 | B0 (**driven, on a real socket**), B1, B2 |
| M13 | **THE CONSOLE UNWIRED** — the operator's three acts unreachable again | **2** | 0 | D1, D2 |
| M14 | **REVOKE NEVER REACHES THE SERVER** — the answer is a sentence and nothing else | **1** | 0 | C3 |
| N1 | **NEGATIVE CONTROL** — a real restructuring of `checkedAppend` | **0** | **0** | — |
| N2 | **NEGATIVE CONTROL** — a real restructuring of the pad's `sendable` | **0** | **0** | — |

**N1 and N2 are what make every red row mean anything**: genuine restructurings of the two functions
most of this work lives in (the shared append's envelope construction; SEND's enablement, split into
two named locals) redden **nothing**, so the suites hold behaviour rather than shape.

**M1 against M2 is the attribution for the fix's SHAPE, and it is the pair to re-run after any change
here.** M1 kills the two pre-existing `02-F49` suites as well, because with the guard gone the
COUNTER stops refusing too — that is the boundary itself. M2 leaves those four green and kills only
the terminal's, because the counter is *still* guarded and the pad is not: the two mutants differ in
exactly which producer travels the guarded road, which is the whole of `04-F27`.

**M3 is the structural row and the reason `B1` exists.** Adding a SECOND `assertRemovableLine` call
inside the verified append is behaviourally identical — every behavioural assertion stays green — and
it re-opens the class this fix closed, because the next guard added to one road would again be absent
from the other. **One assertion separates a shared road from a copy.**

**M4 and M5 are the two halves of the consequence seam and neither subsumes the other.** M4 is the
HOST forgetting (a source read, weak and named as such: `main/index.ts` builds an Electron app at
module scope and no suite here can import it); M5 is the MODULE forgetting, and it is behavioural.
That is AGENTS.md's *"you need BOTH properties"* split landing on one argument.

**M12's B0 is the row worth keeping honest about instruments.** B1 and B2 are source reads; B0 binds
a real port twice with real TLS material and asserts the SECOND server survives, reports
`EADDRINUSE`, and leaves the first one serving. Before the fix that was an uncaught exception and
exit 7.

**⚠ M9 SURVIVED AT 0 KILLS ON ITS FIRST RUN, and the case it exposed is `03-F55`'s defect at the
pad.** Every fixture in the send-loop suite left the till holding lines it had never confirmed, so
SEND's third leg — *the till holds unconfirmed lines* — covered them all and the pad's own
owed-confirm flag was doing nothing any assertion could see. The case only that flag covers is the
SECOND round (`04-F8`'s incremental KOT): the order is already confirmed, the till answers "nothing
owed", and a station has no ticket for the lines just sent. `A6` drives exactly that, and M9 kills it
now. Reading the suite did not find this; running the mutant did.

## Mutation matrix — BUILD 1 (kept as history; the control below is the PRE-review tree)

Control: `apps/pos-electron` **1390 pass / 5 env-red (1395)** — the five are
`startup-integrity.test.ts` spawning real Electron, an environment prerequisite (`T-01-07`), and
they are red on the untouched tree too. `apps/waiter` **4/4**. Every mutant is exactly one
behavioural branch applied to a **committed** tree, so `git checkout --` restores byte-exactly even
if the run is killed (`T8`'s concern, met by the commit rather than by a trap a SIGKILL would
skip); the driver refuses a no-op mutant and verifies the restore. Both package suites run whole
under every row, and the columns are kills **above** the control.

| # | mutant (exactly one branch) | pos | waiter | what dies |
|---|---|---|---|---|
| M1 | **THE SEAM** — the host never constructs the terminal | **5** | 0 | §H only |
| M2 | **THE ACTOR** — `appendAs` reads the till's live session | **2** | 0 | H2, H2b |
| M3 | **THE ACTOR, line half** — `addLineAs` reads the session | **1** | 0 | H2 |
| M4 | **GATE 1 dropped** — `04-F23`'s closed event set stops narrowing | **1** | 0 | C2 |
| M5 | **GATE 2 dropped** — the matrix verdict is thrown away | **3** | 0 | C3, C4, I9 |
| M6 | **REPLAY** — the nonce survives its first use | **1** | 0 | I3 |
| M7 | **THE ACT IS NOT SIGNED** — body binding removed at BOTH ends | **1** | 0 | I4 |
| M8 | **TLS OPTIONAL** — the listener comes up with no certificate | **1** | 0 | G1 |
| M9 | **THE TABLET PICKS THE PRICE KEY** — `channel` off the intent | **1** | 0 | D1 |
| M10 | **`04-F24` UNDONE** — SEND fires while the till is unreachable | 0 | **1** | A1 |
| M11 | **NEGATIVE CONTROL** — a real refactor of `resolve` and `tableOf` | **0** | **0** | — |

**M11 is what makes every red row mean anything**: a genuine restructuring of the functions under
test reddens nothing, so the suite holds behaviour rather than shape.

**M1's right-hand column is the number to remember, and it is `L8` demonstrated.** The terminal
built, correct, tested and unreached leaves **1384 of 1395** tests green — every behavioural
assertion in that work included, because they construct their own terminal. Only the source-reading
seam tests separate the wired product from a decorative one.

⚠ **THE M1 ROW SAID `5` AND `1384 of 1394`, AND BOTH WERE WRONG — corrected from the adversarial
review's own re-count (H1, H2, H3, H4, H5 and H2b, i.e. SIX; and the package total was 1395, not
1394).** This session did **not** re-run that mutant, so the corrected figures are the reviewer's
measurement and not this file's — which is worth saying rather than silently adopting, because a
number with no run behind it is exactly what produced the wrong one (`L1`).

**⚠ M2 SURVIVED ITS FIRST RUN AT 0 KILLS, and that is the most useful row here.** §H2 read the
whole of `main/index.ts` for `appendAs: createVerifiedAppend(` and passed under a mutant pointing
the TERMINAL's `appendAs` at the session-reading gateway — because `recordApprovals` wires an
**identical line** twenty lines up for `05-F29`'s grant. The round-3 law's shape on this session's
own work: the mechanism was built correctly and aimed one call site away. `terminalWiring()` now
reads only the `createTerminal({…})` block, with a `24-F14` throw if the block cannot be found, and
**H2b asserts the narrowing bites** (the file holds more than one such line; the window holds
exactly one). Reading the suite did not find this; running the mutant did.

**⚠ M7's FIRST DRAFT KILLED 5 AND PROVED NOTHING.** Changing only the server left the honest client
still signing the body, so every request failed — a mutant that does not reproduce the defect. The
defect is a *protocol* where the signature authenticates the connection rather than the act, so it
needs both ends; re-run properly it kills exactly **I4**.

**M4's kill count of 1 is a stated weakness rather than a clean result.** Gate 1 is largely masked
by the intent union: `act` refuses an unknown `kind` as `malformed` before authorization is asked,
so only C2 exercises the closed event set directly. That is defence in depth working as designed —
and it means **if the intent vocabulary is ever widened, gate 1 becomes the only barrier and one
assertion guards it.** Widen the union and add rows to C2 in the same change.

**M2/M3's columns record the same limit `line-advance-seam.test.ts` §A already carries:** `index.ts`
builds an Electron app at module scope, so no suite here can import it and the actor-at-the-seam
property is guarded by a **source read** and by nothing behavioural. Named as weak rather than
dressed up.

## Owed, named rather than left to look intentional

- **Enrolments and sessions are process-local.** A till restart signs every pad out and un-enrols
  every tablet. Sessions being process-local is *correct* (`01-F26` — a relaunch is a locked
  device, and a handle outliving its issuing process is the bearer credential `01-F72` (a)
  refuses); **enrolments being process-local is not**, and persisting them needs a `device-store`
  table, which is a protected path. This is the sharpest owed item.
- **The enrolment code is a BOOT LINE, not a screen** — and since the review round the console
  can mint the NEXT one (`pad enrol`), list what is admitted (`pad`) and revoke one
  (`pad revoke <id>`), which is what makes a second tablet possible without a restart (`04-F31`).
  ⚠ **TTY-only**: a packaged, double-clicked till has no console and therefore none of the three.
  `14-F13`'s device list is where an owner-facing enrolment belongs and it is still owed.
- **`04-F22` (a)'s HONESTY-STRIP CLAUSE IS NOT BUILT, and the FR now says so.** A till with no
  certificate reports the pad's absence on its BOOT LINE and nowhere else. What shipped instead is
  that the port can no longer fail silently (`04-F32`), and what the strip should say when it is
  built is a chip only where a pad is CONFIGURED and not serving — `27-F16` forbids the base-case
  spend, and most tills have no pad. Cost, measured: a `DeviceState` field, a `packages/ui` peer of
  `PanelHealth`, and a required `padHealth` on `GatewayDeps`, which is a compile error in the 15
  files that construct a gateway.
- **`01-F5`'s `audit.login` is not written for a pad sign-in.** A waiter authenticating at a tablet
  HAS logged in, so this is a genuine gap rather than a wrong record; the sink hardcodes the till's
  own device and the subtype question is `01-F5`'s.
- **`04-F13`'s ready notifications, `03-F52`'s serve control and `04-F19`'s clear** all need
  layer-2 keys with no carrier, and the pad polls rather than being pushed to.
- **`services`/`packages` placement.** `18 §2` allows `services → packages` only and says nothing
  about an app hosting a server; the terminal port lives in `apps/pos-electron`. The auditor's
  landing already took a named cross-boundary import and recorded the move as owed — the open
  question is recorded in `plans/waiter/design.md` §6.1 and is not repeated silently here.
