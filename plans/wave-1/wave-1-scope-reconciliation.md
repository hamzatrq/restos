# Wave 1 — scope reconciliation: what the corpus says, what `plans/` covers, and the delta

**Finding, August 2026.** Not a plan, not a task, and **not a licence to build anything named
below.** This file exists because the Wave-1 plans have been read as the Wave-1 scope, and they
are not: `plans/` is **downstream** of `restaurant-os.md` Part I, and nobody re-derived it.

**Read this before treating `plans/wave-1/` as a checklist.** Every plan in this directory is
accurate about the area it covers. None of them claims to cover the wave, and together they do
not.

---

## 1. The authority chain, and which document is the source

The authority-order block — byte-identical in `restaurant-os.md` and `specs/00-platform-overview.md`,
enforced by `pnpm docs:lint` — is explicit about who owns a wave:

> (1) `restaurant-os.md` Part I for vision, **waves**, and settled product laws; (2) `specs/00` §5
> + `specs/21-ux-system.md` for cross-cutting UX/offline/performance; (3) the owning module spec
> for its normative behavior …

`plans/` is not in that list at all. It is a working artefact derived from the specs, one area at
a time, each written to answer *"what do we build next in this module"* — never *"is the wave
covered"*. **A derived document was mistaken for the source.** That is the whole finding; the
table in §4 is just its size.

`restaurant-os.md` §8 defines the wave (`restaurant-os.md:120`):

> **Wave 1 — Service:** ops fabric T1/T2, payments/shifts, aging timers, availability, manager
> alarms+approvals, nightly owner summary, **plus POS quick-entry for phone and foodpanda orders**
> (channel-tagged, ≤30 s — so the "one queue, all channels" law holds from the first pilot day).
> *A restaurant can run on it.*

`specs/00` §1's module table assigns the wave per module, and `specs/00:43` fixes what the
assignment means:

> A module's wave is when its **first production slice ships to a dev-pilot restaurant**; most
> modules keep growing afterward.

That sentence is the measuring stick used below. It is deliberately not "the package exists" or
"the tests are green" — by that test a scaffold stub has shipped nothing, and so has a correct,
fully-tested module that no host constructs.

## 2. The seven named items, measured

| # | `restaurant-os.md` §8 names | State, August 2026 | Evidence |
|---|---|---|---|
| 1 | ops fabric **T1** | **Built** — counter loop end to end behind real auth | `apps/pos-electron`, AGENTS.md's C4→C5→C9→settle |
| 1 | ops fabric **T2** | **Not built** — the pass screen is the T2 tier | `apps/pass-kds` is a 2-line stub; `specs/03:56` "Pass screen (T2)"; `03-F16` ready-marking has no surface |
| 2 | payments/shifts | **Built** — S-1..S-7 all in code with suites | `service-surface.md`, and AGENTS.md's own re-measurement |
| 3 | aging timers | **Not on any screen** | `packages/ui/src/components/AgeBadge.tsx:26,54` — `@unreached-owed`, `03-F47`, blocked on `apps/pass-kds`; `TicketCard.tsx:36` the same |
| 4 | availability | **Kernel half built, no producer** | schema + fold + `01-F57`'s supersedes-link + `availability` table + acceptance suite all exist in `packages/domain` / `packages/sync-client`; **`02-F7`'s "toggle from any POS screen" does not exist** — `packages/ui`'s `Tile` can *render* an 86'd item, nothing can *86* one |
| 5 | manager **alarms** | **Not built** — and easy to over-credit | the counter has `03-F5`'s print-failure band (`AlarmBand`); `05-F1`..`05-F4` are the *console's* late-order and print-failure alarms on the manager's phone, and `apps/manager` is a stub. Two different surfaces; only one exists |
| 5 | manager **approvals** | **Local half built, remote absent** | `02-F20` local manager-PIN is live on the counter (see `05-F8`, corrected this round); the doc-05 remote path is unbuilt |
| 6 | nightly owner summary | **Not built** | `apps/owner` and `services/intelligence` are both stubs; `12-F9` has no producer |
| 7 | POS quick-entry, phone + foodpanda | **Not built** | `Counter.tsx:119` hardcodes `COUNTER_CHANNEL`; `:324` appends it. `02-F30` (foodpanda, ≤30 s) and `02-F28` (phone, ≤30 s) have no surface. `foodpanda` **is** a priced channel and the Orders inbox knows it bypasses accept — the *channel* exists, the *entry* does not |

Item 7 is the one worth pausing on: it is the only item in §8 the founder set off with **"plus"**
and gave a reason for in the same sentence — *"so the 'one queue, all channels' law holds from
the first pilot day"* (design law 4, `restaurant-os.md:26`). It is also the item furthest from
any plan.

## 3. What `plans/wave-1/` actually covers

Six area plans, and they are good:

| Plan | Module | Status |
|---|---|---|
| `channel-pricing-and-the-counter-loop.md` | 02 — counter loop, per-`(branch, channel)` pricing | APPROVED |
| `service-surface.md` | 02 — shifts, cash, day open/close | APPROVED |
| `kot-printing.md` | 03 — **printing only** | APPROVED |
| `backoffice-catalog.md` | 14 — catalog editor + publish path | DRAFT |
| `identity-and-authorization.md` | 01-F26..F28 — PIN session, staff registry | APPROVED |
| `palette-repaint.md` | 27 — design language | ruling record |

Plus briefs, findings and inventories (`*-test-brief.md`, `oracle-round*-findings.md`,
`role-task-inventories.md`, `screen-map.md`, `running-the-stack.md`, `research/`).

**None of these is wrong.** `kot-printing.md` says "KOT printing" on the tin and delivers it;
it never claimed the pass screen. The failure is that six correct area plans were read as a
covering set.

## 4. The delta, by module

Measured against `specs/00` §1's Wave-1 rows. "Stub" means the package contains exactly
`CLAUDE.md`, `package.json` and a 2-line `src/index.ts` reading
`// Scaffold stub — implementation arrives via plans/ tasks (24 §9)`.

| Doc | `00 §1` wave | Plan in `plans/wave-1/`? | Code | Reading |
|---|---|---|---|---|
| 02 POS | 1 | yes, two | built | **Nearly covered.** `02-F28`/`02-F30` quick-entry and `02-F7`'s availability toggle are in no plan |
| 03 Printing / pass / KDS / aging | 1 | **half** — printing only | printing built; `apps/pass-kds` stub | **Half-planned, and it does not read that way.** The Wave-1 slice is "printing + pass screen" (`specs/03:3`); one plan covers one half |
| 05 Manager console | **1 core** / 4 full | **none** | `apps/manager` stub | Unplanned |
| 08 Foodpanda | **1 manual** / 4 API | **none** | `services/foodpanda` stub | Unplanned — but see §5, the Wave-1 obligation is mostly a POS surface |
| 12 Owner app | **1 basic** / 4 full | **none** | `apps/owner` stub | Unplanned. Wave-1 slice is "nightly auto-summary + live view" (`specs/12:13`) |
| 13 Intelligence | 4 (**foundations from 1**) | **none** | `services/intelligence` stub | Unplanned, and the narrowest of the four — see §5 |
| 14 Back office | 1+ | yes | built | Covered |
| 15 Platform admin | 1+ | **none** | `apps/platform-admin` stub | See §5 — partly served by CLI, genuinely ambiguous |
| 27 Design language | 1 | yes | built | Covered |

**So the delta is larger than "four modules with no plan", though that count is right.** Four
Wave-1 modules have no plan (05, 08, 12, 13). Add to them: doc 15 with a caveat, doc 03's
unplanned half, and three named items (aging, availability, quick-entry) that fall *inside*
modules that do have plans and were therefore invisible to a per-module reading. The
module-by-module view and the item-by-item view each miss things the other catches, which is
probably why this went unnoticed.

## 5. What is deliberately deferred, what is unplanned, and what I cannot tell

This distinction is the part most likely to be got wrong in either direction, so it is stated
per item rather than summarised.

**Genuinely smaller than the stub suggests — the module is a stub but the Wave-1 obligation is
not the module:**

- **08 (foodpanda).** `specs/08:9` scopes Mode 1 as *"a 30-second channel-tagged order entry on
  POS. The UI lives in doc 02; this doc owns the mapping model and channel semantics"*, and
  `08:12` says the module *"runs as `services/foodpanda` (driver host) **plus** the POS
  quick-entry surface"*. The Wave-1 deliverable is therefore mostly item 7 above — a POS screen —
  and the cloud driver is Wave 4's API mode. A stub `services/foodpanda` is much less alarming
  than the row implies; **an absent quick-entry screen is the real gap, and it belongs to doc 02.**
- **13 (intelligence).** `13-F14a` pins the W1 foundation precisely: *"W1 — all classes appear in
  the nightly summary's 'what's odd' block (the summary push exists from W1, `12-F9`)"*. So
  doc 13's Wave-1 obligation is **inside doc 12's nightly summary** and does not require the
  service to exist as a service. One deliverable, not two.
- **15 (platform admin).** The row is "1+", meaning it starts in Wave 1 and grows with the fleet.
  Provisioning and revocation — the Wave-1-shaped part — **do exist**, as declared gateway CLI
  commands (`provision-device`, `revoke-device`). Whether "1+" is satisfied by a shell command
  on the service host, or requires the web surface `specs/15` describes, **I cannot tell from the
  corpus**, and `01-F25`'s back-office pairing code is separately noted as owed in AGENTS.md.

**Unplanned, with no text anywhere suggesting deferral was intended:**

- **05 (manager console) core** — alarms and the remote approval path. `restaurant-os.md` §8 names
  "manager alarms+approvals" outright and `00 §1` rows it "1 core".
- **12 (owner app) basic** — the nightly summary. Named outright in §8.
- **Item 7, POS quick-entry** — named outright in §8, with its rationale attached.
- **T2 / the pass screen, and aging timers with it** — named outright in §8. The aging components
  are written and carry `@unreached-owed` markers naming `apps/pass-kds` as the blocker, so this
  one is *known* at the code level and simply has no plan above it.

**I cannot tell whether these are deferred or overlooked:**

- **`02-F7`'s availability toggle.** The kernel half is unusually complete — `01-F57` went to the
  trouble of designing a convergent supersedes-link fold for concurrent toggles from three
  surfaces. That is not the shape of something abandoned. But `02-F40`'s founder ruling (July
  2026) says that in a printer-only T1/T2 kitchen, 86-ing *is* a counter action and **"no new
  mechanism is added"** — which reads as a deliberate narrowing of where the toggle lives, not of
  whether it exists. My reading is that the POS toggle is still owed and simply unplanned, but
  the ruling is close enough to the question that **a founder should confirm rather than an agent
  assume.**
- **Whether "1 core" for doc 05 means both alarms and remote approvals, or alarms first.**
  `specs/05:3` and `05:9` both group them; nothing sequences them against each other.

## 6. One item that is not Wave 1 at all, recorded so it is not swept in

`restaurant-os.md:119` puts **"LAN-first sync mesh" in Wave 0**, not Wave 1.
`packages/sync-client/src/mesh-session.ts:17` carries
`@unreached-owed NO HOST RUNS THE LAN MESH YET`, covering every export in the file; the only
constructor is a gateway spike fixture, and `apps/pos-electron/src/main/sync.ts:95-99` reports
`lan` and `hub` as `down` because *"the mesh is not wired yet"*. `01-F12`/`F13`/`F15` are
implemented and property-tested in the package.

By `00 §1`'s "first production slice ships to a dev-pilot" test this is an **open Wave 0 item**,
which AGENTS.md's "Remaining Wave 0: H-01 harness rungs + physical wall-clock (D3)" does not
list. Flagged here rather than acted on: it is doc 01's, it is Wave 0's, and re-scoping a wave is
not this finding's business. It is noted because it is the same failure in the same direction, one
wave earlier.

## 7. What to do with this

**Nothing, without a founder ruling on sequence.** Re-planning four modules is a larger act than
recording that they are unplanned, and several of the gaps above have plausible reasons to sit
late in the wave. The ask is narrower:

1. **Do not read `plans/wave-1/` as the wave's scope.** Read `restaurant-os.md` §8 and `00 §1`,
   then check what has a plan.
2. **When a plan is written or closed, re-derive against §8**, not against the other plans.
3. If you are about to record something as "owed", check it against code first — the owed lists
   have now been wrong six times in two days, always in the direction of claiming a gap that had
   already closed (`05-F8` this round, inside `specs/`). This finding is the same disease with
   the sign flipped: a scope that was smaller on paper than in the corpus, because the paper was
   derived and never re-derived.

**Kept deliberately out of scope:** what Wave 1 *should* now contain, whether any of it should
move to Wave 2, and what order the four unplanned modules take. Those are founder calls.
