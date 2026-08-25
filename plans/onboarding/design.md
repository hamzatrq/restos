# The self-serve onboarding funnel — design

**Status: design only. No production code, no spec changes. August 2026.**
**Basis:** `specs/28` (tenancy), `specs/14` (back office), `specs/01` (`01-F25`, `01-F65`, `01-F69`,
`01-F70`, `01-F73`, `01-F80`, `01-F87`), `specs/15` (`15-F8`, `15-F10`, `15-F26`, `15-F27`),
`plans/saas-pivot/plan-of-record.md` (R17, R29, R30, R34, R37, R40, R43, R46, R47, R62, R63, R65,
R70, R75, R76, R79), `plans/inventory/design.md` §10.1 and
`plans/saas-pivot/mvp-plan.md` §3/§5/§10. Every state-of-the-tree claim below is **measured
2026-08-25** and dated at the point it is made, on this repo's own rule that a measurement has a
shelf life.

**What this document is:** the walk a restaurant takes alone, from *I heard about this* to *my till
is selling* — the order, the screens, where the data comes from, what breaks, and the founder calls
that block it. **What it is not:** a task list (that is `plans/saas-pivot/mvp-plan.md` §3, and this
document points at its A-items rather than renumbering them), and not a re-derivation of the
sequence — `28 §4`'s walk *"signup → provision → attest → live"* is the **one** place that sequence
is stated and this document does not restate it, it designs the surfaces it lands on.

⚠ **One correction to the brief that routed this work.** It cites *"R79's ruling — the owner authors
recipes, and the RestOS team uses the same editor on her behalf"*. R79 in the plan of record is
**loyalty forms**; the ruling quoted is **founder decision 2** in `plans/inventory/design.md` §10.1.
The shape the brief is reaching for is real and is used in §5 below under its correct citation. It is
recorded rather than silently fixed because a ruling cited by the wrong id is a ruling an audit by id
cannot find — the plan of record says exactly this of R65.

---

## 0. The test, and the honest answer today

> **A restaurant owner, no training, nobody from RestOS on the phone, gets from *I heard about this*
> to *my till is selling*.**

The walk, with today's verdict against each step. **Measured 2026-08-25.**

| # | She does | Verdict today | Why |
|---|---|---|---|
| 1 | Hears about RestOS, wants to try it | **Impossible alone** | R46 makes an invite code the door; nobody can issue one — the issuing surface is doc 15's and owed (`28 §9.27`) |
| 2 | Fills in a signup form | **No surface** | `services/api/src/router.ts:33` — `PUBLIC_PROCEDURES` has exactly one member, `auth.login`. The act ships (`signup.ts`) behind `PUBLISH_TOKEN` on `/internal/signup` |
| 3 | Sets her own password | **No surface** | `14-F42`/`28-F24` specify it (R47); nothing in the tree redeems a token, and **nothing in this product writes a password hash except `create-owner.ts:216`** |
| 4 | Signs in to the back office | Works | `apps/backoffice` + `auth.login` + Argon2id, shipped |
| 5 | Creates her first branch | **Shell command** | `pnpm -C services/sync-gateway create-branch`. No procedure, no screen |
| 6 | Puts her menu in | Works, by typing | `apps/backoffice` catalog editor is real; a 20-entry menu has been authored through it in a browser. No import of any kind exists |
| 7 | Adds her cashiers and their PINs | Works | `14-F14` create/setPin/deactivate ship on `services/api` and the staff screen |
| 8 | Puts a till on the floor | **Shell command, and a terminal on the till** | `provision-device.ts`; `RESTOS_ORG_ID`/`_BRANCH_ID`/`_DEVICE_ID`/`_DEVICE_TOKEN`/`RESTOS_CLOUD_URL` are environment keys on the machine |
| 9 | Routes food to a kitchen | **Environment** | `main/station-routing.ts` reads the env; no screen |
| 10 | Sets tax, rounding, tenders | **Nowhere, and no carrier** | `RESTOS_TAX_POSTURE` / `RESTOS_TAX_RATE_BPS` are read from `process.env` on the till; `packages/sync-protocol/src/messages.ts` carries `catalog`, `staff`, `device_roster` and **not `config`** — `01-F87`'s carrier is decided and unbuilt |
| 11 | Works a go-live checklist | **No surface** | `14-F26`/`14-F27` are both unbuilt; `28-F25` (R62) decided *who works it*, and a decided blocker is not a cleared one |
| 12 | Rings the first real order | Works | The counter runs end to end and has, repeatedly |

**Four things make the walk impossible today, and not one of them is the screen you would build
first.**

1. **The door does not exist and cannot be opened by anyone.** R46 picked the control; `28 §9.27`
   records that its issuing surface, format, length and TTL are all owed to doc 15. A vendor who
   cannot issue a code is an admission control satisfied by a comment — `28-F23`'s own objection.
2. **Somebody still has to touch the till's machine.** Pairing (`01-F80`) removes the *identity*
   keys, and it does not remove `RESTOS_CLOUD_URL` (`apps/pos-electron/src/main/index.ts:746`). A
   pairing code does not commission a till that does not know where the cloud is. Founder decision 9.
3. **The deployment cannot serve tenant #2.** `services/api/src/server.ts:484` reads
   `ENABLED_BRANCHES` / `ENABLED_CHANNELS` from the process environment, and `BOOTSTRAP_ORG_ID`
   beside them. The enabled `(branch, channel)` set is `01-F60`'s **price key**, so an org whose
   branch is not in one process's env has no priced menu at all. **A funnel whose output is a second
   org is unservable until A16 lands** — `mvp-plan.md` says *"sequence it BEFORE the surfaces"* and
   this is the document that agrees loudest.
4. **Exactly one human per org can ever hold a back-office login.**
   `services/sync-gateway/src/user-crud.ts:317` hashes a 256-bit secret that is *"generated, hashed
   and DISCARDED"*, and its own comment states the consequence: *"a person created here cannot sign
   in to the back office"*. `create-owner` refuses a second owner (`orgHasOwner`). There is no
   password change or reset anywhere — a repo-wide search for `changePassword|setPassword|
   resetPassword` returns two React `useState` setters in `auth-gate.tsx` and nothing else. So the
   funnel's actor is one person with one credential, forever. §7 and founder decisions 4 and 5.

**Everything else in the walk is buildable now**, and most of it is a screen over a procedure that
already exists or over a CLI action that already separates its argv parsing from its act (`mvp-plan`
§5 row 4 measured that lift-readiness across all seven commands).

---

## 1. What the category does, and what we take (R34)

> *"Follow the mainstream and global giants in this industry. do not try to create from scratch.
> steal like an artist."* — R34. **Borrowed: layout, affordance, flow. Invented: nothing here.**

### 1.1 What converges, and is therefore ours to take

| Convention | Who does it | What we take |
|---|---|---|
| **A setup list that is the home screen after first login**, items with live state, worked in any order over days | Toast (*"Your Setup Guide"* on first Toast Web login, ~14 days to go-live), Square (guided onboarding), Foodics | §2.3 — the wizard **is** the checklist, and it is the landing page of a new org |
| **A device is created in the back office and the device then claims a short code** | Square (device code: six letters, **5-minute** expiry, entered on the terminal), Loyverse (create a POS row named and assigned to a store, the device then activates against it) | §3.7/§3.8 exactly. `01-F80` is this convention with our own numbers (8 digits, 15 min) and our own reason — the code is read down a phone in this market, not typed off a screen in the same room |
| **The DEVICE picks nothing** — its id, its class and its store are fixed where it was created | Square, Loyverse, Foodics (activation takes an account number + device number issued elsewhere) | `01-F80` (a)'s *"the owner mints, the device claims, the device chooses nothing"* is the mainstream position, not an unusual one |
| **A menu template the restaurant fills in and the vendor loads** | Toast (spreadsheet templates via Google Sheets/Excel, then a vendor menu review) | §4 option 3 — and note the vendor step Toast keeps in the loop even on its *self-service* tier |
| **Import from a file or a photo, then a REVIEW screen** | Square's generative menu path; a whole tier of import vendors on PDF/photo extraction claiming ~95% accuracy with a human approval step | §4 — the review grid is the product; the extractor is interchangeable |
| **A "test mode" you leave deliberately** | Toast (go-live = exit test mode) | Founder decision 7 — our nearest mechanism is `01-F49`'s `training` branch class |
| **Days, not minutes** | Petpooja: most single outlets billing within **1–3 days** of hardware setup, 1–2 weeks for five outlets; Toast: 14 days incl. hardware shipping | §2.5 — the funnel is designed for **three sittings**, not one, and resumability is a first-class feature rather than a courtesy |

### 1.2 What we deliberately do not take

- **A sales-led kickoff call as a step in the flow.** Toast's self-service tier still has one, and it
  is where their menu review lives. R17 says the founder is the introduction at 5–10 pilots — that is
  §5's territory, not a screen. Modelling the call as a funnel step would build a surface for a
  conversation.
- **Anything that gates selling.** The commercial gate a SaaS funnel reaches for by habit — no
  trading until payments, or plan, or verification is done — is forbidden here in three places:
  `28-F8` (nothing commercial may reach a sale), `01-F17` (a sale is never blocked) and `28-F25`'s
  last reading, *"go-live is a state word, not an interlock"*. Our checklist is the last screen
  before trading and must never be a door.
- **Hardware-first ordering.** Toast ships hardware then configures. R37 has pilots start
  **printerless** and `DEC-HW-001` already amended `15-F10` so a branch that declares no printer
  generates no printer row. Our funnel's hardware step is *optional by construction*.

### 1.3 Where there is nobody to copy

- **An invite code as the front door.** Every giant runs an open funnel because their cost of a junk
  signup is a row. Ours is permanent (`01-F68` never reuses an `org_id`, `28-F15`). So §3.1's screen
  has no convergent model and is designed from the FR.
- **A code read *aloud* to a person in another room.** Square's six letters are typed by the person
  holding the terminal, usually beside the screen that minted them. `14-F41` states our case:
  *"unambiguous aloud, not merely unambiguous on screen"*, which is why `01-F80` (b) is digits.

**Where the category claims above come from** (read 2026-08-25, so they rot — re-read before quoting
them at a founder):
[Toast self-service onboarding guide](https://support.toasttab.com/en/article/Self-Service-Guide) ·
[Toast menu templates](https://support.toasttab.com/en/article/Building-your-Menu-Template) ·
[Square device codes](https://squareup.com/help/us/en/article/8339-set-up-device-codes) ·
[Square Terminal pairing](https://developer.squareup.com/docs/terminal-api/quickstart) ·
[Square's generative menu tooling](https://www.restaurantdive.com/news/square-adds-generative-ai-tools-for-restaurants/697069/) ·
[Loyverse: create and activate a POS](https://help.loyverse.com/help/how-create-activate-and-delete-pos) ·
[Foodics device activation](https://help.foodics.com/hc/en-us/articles/8803132375836-How-to-Activate-Foodics-One-Device) ·
[Foodics branches](https://help.foodics.com/hc/en-us/articles/4406754159634-Creating-Branches) ·
[Petpooja setup and go-live timing](https://blog.petpooja.com/industry-business-guides/petpooja-pos-local-hardware-setup-guide/) ·
[PDF/photo menu extraction, the current category claim](https://inputly.ai/blog/smart-menu-import-pdf-image-ai-restaurant-automation)

⚠ **R34 licenses their solved problems, not their assets** — nothing above is copied text, layout or
artwork, and the two places we diverge from the convention (digits not letters, 15 minutes not 5) are
divergences `01-F80` argues for in its own words.

---

## 2. The funnel's shape

### 2.1 Two thresholds, and the second one is the product's promise

**Minimum to EXIST** — an org that survives her closing the laptop:

1. the org record and its first owner (`28-F13`, one act, atomic), and
2. a password she chose, so she can come back (`28-F24`/`14-F42`).

That is the whole of it. **No branch, no menu, no device** (`28-F13` refuses to invent a branch by
name). Two screens, four fields, one password. This threshold is what makes the rest resumable, and
it is the only part of the funnel with no way back if it goes wrong (§6).

**Minimum to SELL** — derived from what the counter actually reads, not from the wizard's step list:

| # | Fact | Why it is minimal | Where it comes from |
|---|---|---|---|
| 1 | one **branch** record | the device identity binds one (`01-F64`), the price key is `(branch, channel)` (`01-F60`), staff assignments are per branch (`11-F22`) | §3.4 |
| 2 | the **enabled `(branch, channel)` set** | `01-F60` makes it a required, complete price key; the writer refuses an incomplete one | §3.4 (it is a branch fact, not a settings screen) |
| 3 | **≥1 catalog entry priced for every enabled pair** | `01-F60`/`14-F29` refuse the save otherwise; a till with no priced entry shows tiles that cannot be rung | §3.5 |
| 4 | **≥1 person with a PIN assigned to that branch** | `01-F61`'s unlock is the counter's front door; the roster reaches the till over `01-F75`'s `staff` resource (shipped) | §3.6 |
| 5 | **one paired till** | `01-F80` | §3.7/§3.8 |
| 6 | **a route to the kitchen** — a station on paper, or a pass screen | `03-F51` refuses a branch with no route at configuration time; `15-F10` as amended keeps it the one surviving hardware requirement | §3.9 |
| 7 | a **tender** the till can take | `01-F85`/`14-F44` make the set a seed the owner extends; cash is in the seed, so this is satisfied by default and is **not** a funnel step | — |

**Everything else is after the first sale**: tax posture, charge rounding (R70), loyalty form (R79),
extra channels, extra devices, extra people, printers beyond the first, the summary, thresholds
(R63/R65). That is not a scoping convenience — it is the honest reading of `28-F8` and `01-F17`, and
it is what lets a restaurant that signed up at 11am sell at 6pm.

### 2.2 The wizard's state is DERIVED, and this is the central decision

`14-F26` says *"resumable"*. The cheap implementation is a `wizard_step` cursor on the org. **Refuse
it.** Every item's state is computed from records that already exist:

```
branch          ← kernel.branches has ≥1 row for this org
menu            ← catalog entries priced for every enabled (branch, channel) pair (01-F60's own check)
people          ← kernel.users with an assignment on this branch and a pin_hash (11-F23)
till            ← kernel.device_registry row, unrevoked, for this branch
kitchen route   ← 03-F51's per-station routes for this branch
```

**Four properties fall out of that and none of them has to be built:**

- She can leave at any point and come back to a screen that is *true*, not to a cursor that claims she
  is on step 4 of 7 while her only branch was deleted.
- The wizard and `14-F27`'s checklist cannot disagree, because they are one derivation.
- `14-F27`'s *"a regressed item re-blocks the checklist"* is free for every derived item — the loss
  `28-F25` names is real but is bounded to the **attested** ones.
- There is one writer per fact, which is this corpus's most-repeated defect avoided by construction
  rather than by discipline (`14-F41` says the same of the pairing task: *"a wizard that mints codes
  its own way is that defect with a credential on it"*).

**The cost, stated:** a step that produces no observable record can never read as done — *"we don't
take card"*, *"we have no printer"*. Those are exactly the items `28-F25` sends to attestation, and
an attestation **is** a record (who, when, attested-not-observed). So the rule is: **derive where the
product observes, attest where it cannot, and never render the two alike** (`02-F53`, `28-F25`).

### 2.3 One list, two readings — the wizard *is* the checklist

`14-F26` (a resumable wizard) and `14-F27` (a go-live checklist showing live status) are the same
list of the same facts, seen once with actions on it and once with verdicts. Build one surface:

- **Before go-live** it reads as *what to do next*: each row is a task with a button.
- **At go-live** it reads as *what is true*: each row is a verdict with its source (observed /
  attested by a named person, and when).

**The alternative — a wizard that runs once and a checklist that appears at the end — is what the two
FRs literally describe, and it costs two derivations of one fact and two screens that can disagree.**
`28-F25` already forbids the disagreeing pair for a different reason (*"one checklist state per
branch, whoever advanced it"*). Stated as a reading of two FRs rather than a transcription of either.

### 2.4 Org once, then per branch

The catalog is org-scoped (`01-F52`); prices, staff, devices, stations and the checklist are per
branch. So the funnel is:

```
[org, once]      signup (the business and its owner) → she sets her password
   └── [per branch]  create branch → menu prices for its channels → people → till → kitchen route → go live
```

A second branch re-runs the branch column and inherits the menu. **This is why `14-F27`'s checklist
state is per branch (`28-F25`) and the wizard's landing page is a list of branches**, each with its
own progress — not a single global progress bar that a two-branch pilot immediately falsifies.

### 2.5 The order, and what is skippable

**Nothing after the org step is mandatory in order.** Every row is always available and every row
states its own prerequisites in her words (*"a till needs a branch first"*). The recommended path is
ordered by what unblocks the most:

```
1. branch          (unblocks everything; 30 seconds)
2. till            (the long pole: somebody must be standing at the machine)   ← can run in parallel with 3
3. menu            (the long pole in HER time)
4. people          (2 minutes per cashier)
5. kitchen route   (needs the printer to exist, or declares a screen)
6. go live         (read the list, attest the two hardware rows, start)
```

**Why the till is second and not last, against Toast's ordering:** it is the only step that needs
another human in another room, so it should start early and finish while she types the menu. `14-F27`
puts a paired device first in its own item list, and `28-F25` records that the wizard pairs a device
*before* the checklist runs and a self-onboarded tenant **can ring an order before any of this
completes** — which is the correct behaviour and must not be built out.

**Three sittings is the design target** (§1.1's category evidence): *sign up* (5 min) — *set up* (1–2
hours, mostly menu) — *go live* (10 min, the morning of). A funnel that assumes one sitting will be
abandoned in the middle of the menu, and the middle of the menu is exactly where a derived state
costs nothing and a cursor costs a support call.

---

## 3. The screens

Each screen states: **what it asks**, **what it writes**, **what it refuses**, and **what it says
when it cannot help** (`00 §5.7`, `14-F38` — name the role that can, never a control that does not
exist). Owner-facing text names no internal identifier (`14-F38`), and every form follows `14-F32`'s
rule: one task per form, named in her vocabulary, the discriminator never rendered.

### 3.1 Signup — the public door

**Host:** `28 §9.26` is open (a public route inside the tenant-plane back office, or a separate app).
**Recommendation: a route inside `apps/backoffice`**, because the redemption surface (§3.2) must land
her in a back-office session anyway and a second workspace to hand off a cookie between is a
deployment for one form. The cost is real and is `28 §9.26`'s own: an app whose every screen sits
behind `14-F1` gains two routes that do not, so the boot assertion must learn a **list**
(`14-F42`, `28-F4`) — never a widened default.

**Asks (the closed set `28-F13` fixes, plus the code):**

```
Invite code          [ 8–?? ]     ← 28-F23; format is doc 15's and unset (§9.27)
Your restaurant      [          ]  ← org display_name, as typed
Your name            [          ]  ← owner display_name
Your email           [          ]  ← the login lookup key, global, case-folded
```

No branch, no tier, no plan, no channel, no `org_id` (`28-F13`, `28-F5` (b)). **No password field** —
R47 puts it on §3.2, and a password field here would be `15-F27`'s banned input wearing a form.

**Writes:** nothing until submit; then one act, two records, atomic (`28-F13`), no event
(`28-F14`), and the invite code is checked **before** the `org_id` is minted (`28-F23`) exactly as
the email uniqueness check already is (`signup.ts`).

**Refuses:**

| Case | What she reads | Note |
|---|---|---|
| code unknown / spent / expired | *"That invite code is not usable. Ask whoever sent it for another."* | One sentence for all three: a stranger learns nothing (`28 §9.27` leaves what a refusal may say to doc 15 — **this is a recommendation, not a transcription**) |
| email already a login | the shipped sentence, which names the address and nothing else | `signup.ts` already refuses this way; it names no org (`01-F71`) |
| anything else | a named 500 | never *"try again"* over a database that is down |

⚠ **Two things this screen must do that no FR requires, both from §6's failure table.** (i) **Echo the
email back before submit** — it is the login key, there is no recovery, and a typo is a permanently
unadministrable org. (ii) Offer *"already have an account? sign in"*, because a second signup by the
same restaurant mints a second permanent org.

### 3.2 Redemption — she chooses her password

`14-F42`, `28-F24`, R47. **Unauthenticated by construction**, one-time, ends in a session.

**Asks:** a password — **twice**, and the precedent is measured rather than assumed. The staff screen
faced the same choice for a cashier's PIN and chose a masked box with no reveal, reasoning that *"the
typo costs one reset, and unmasking later is additive while the reverse is a security change"*
(`staff-screen.tsx`). The same reasoning points the other way here: this is the **only** credential in
the product with no reset path (§6), so a typo does not cost one reset, it costs the org. Two boxes,
or one box with a reveal — not one masked box.

**Shows, and this is the addition this design argues for:** *"You will sign in as `<email>`"* with a
**correct it** control. The token is the authority; the email is only the lookup key. A correction
here costs one update on a row nobody has used yet and closes the single worst failure in §6.
⚠ *This needs an FR — it changes what the redemption surface may write, and `14-F42` says only
"accepts the token, asks her to choose a password, spends the token".*

**Refuses** exactly `14-F42`'s three states, and names the role that can help — today the vendor's
operator command — and never a *"send me a new link"* control, which would promise a capability no
document owns.

### 3.3 The setup list — the wizard home

The landing page of a session whose org has no branch, and thereafter reachable from the nav. Per
`14-F31`'s precedent this is a fifth section beside menu / devices / summary / staff.

```
Sadiq Foods                                          [ + add a branch ]

  Gulberg                                              3 of 5 ready
  ├─ ✓ branch created                    Gulberg · counter and phone orders
  ├─ ✓ menu priced                       47 dishes, all priced
  ├─ ✓ people                            3 can sign in to the till
  ├─ ⧗ till                              1 waiting for its code · Counter 1
  ├─ ○ kitchen                           no station is routed anywhere        [ set it up ]
  └─ ○ ready to trade                    2 things left
```

- Every row derives (§2.2). `⧗` is a real state, not a spinner: a code was minted and nobody has
  claimed it yet, and the row states its own age (`14-F4`, `00 §5.7`).
- **No row is locked.** A prerequisite is stated in the row, never enforced by a disabled control
  (`14-F37`: a disabled control explains nothing).
- **No percentage and no confetti.** `27`'s vocabulary has no celebration component and R50 keeps
  the instrument fixed; the honest signal is *what is left*.

### 3.4 Branch

`01-F69`: a branch is a named record under exactly one org, with `01-F25`'s `type` and `01-F49`'s
`class`. `create-branch.ts` already decided the defaults and the argument is transferable to a form.

**Asks:** the branch's name, and nothing else. `01-F25`'s type and `01-F49`'s class **default** to
`branch` and `production` on `create-branch.ts`'s own stated reasoning — those are what a
restaurant's branches overwhelmingly are, and the two exceptions (a prep kitchen, a training branch)
are things an operator sets out to create rather than forgets. Both defaults are **echoed** on the
confirmation rather than hidden, because the property that matters is that a wrong one is visible at
the moment it is made.

**Asks second, and this is the one that is not in `14-F26`'s list:** *which channels this branch
sells on* — the `01-F60` price key. It belongs here rather than on a settings screen because a branch
with no channel cannot be priced and therefore cannot sell, and because `28-F20` (iii) rules the set
layer-2 data with **one** declaration and no fallback. Seed it as `counter` alone — one column,
one price per dish — and every further channel she ticks (`phone`, `foodpanda`, …) adds a price
column she must fill before she can save (`14-F29`, `14-F37`). ⚠ **The screen must say that before
she ticks**, not after: the channel checkbox is the control that decides how much typing the menu
step costs.

**Refuses:** a duplicate name in the same org — a warning, not a refusal (two *Gulberg*s is a real
restaurant's real problem, and `01-F69`'s record does not forbid it); an empty or padded name, through
`DisplayName` in `packages/domain`, which is already the one authority.

**Writes:** the branch row. **Not an event** — `config.changed` has no payload schema
(`28-F14`), so this is unbuildable rather than unbuilt, and the surface must not invent one.

### 3.5 Menu

The one long step. §4 designs the intake; the screen itself already ships (`apps/backoffice`
catalog editor, `14-F32`'s task-per-form, `14-F29`'s price grid, `14-F37`'s incomplete-price count).
**What the funnel adds is one thing: a way in that is not one dish at a time**, and one thing it must
not add: a second writer of the catalog.

The wizard row's verdict is `01-F60`'s own completeness check, read rather than re-implemented — the
same value the writer refuses against (`28-F5` (a)'s measured precedent: two declarations of the
enabled set failed **0 of 95** tests when one was restored).

### 3.6 People

`14-F14` ships. The funnel adds nothing but ordering and vocabulary: the task is *"someone who works
the till"* and it asks name, role, branch, PIN (`R29`: the owner sets the first PIN and tells her;
`R30`: no email for a till-only cashier, and `""` is an invented address rather than an absent one).

⚠ **What the wizard must SAY here, because the product cannot yet do it:** the PIN she types is the
cashier's credential and **there is no way for that cashier to change it** (`14-F40`/R33 is specified
and blocked on a wire kind). Until A14 lands, the honest sentence is the one R33's own reasoning
supplies — *you will know her PIN; change it for her when she asks* — and not silence.

### 3.7 Tills, half one — the owner mints (`14-F41`)

The create task on `14-F12`'s device list, which ships today
(`apps/backoffice/src/components/device-list.tsx`, `services/api/src/device-router.ts`, both behind
`device.manage`).

**Asks three facts and no more** (`14-F41`): the **branch** (pre-selected from the list she was
looking at, settable only within her assignment's reach), **what the device is for** (the class, in
her vocabulary — *a till at the counter*, *a screen in the kitchen* — the class string never renders),
and **the name it will be known by** (`01-F70`, required at registration because the person reading
the list later is not standing in front of the device).

**On commit:**

```
   ┌─────────────────────────────────────────────┐
   │  Counter 1 · Gulberg                        │
   │                                             │
   │       4 8 3 1   9 0 2 6                     │
   │                                             │
   │  Read this to whoever is at the till.       │
   │  On the till: “Connect this till” → type it.│
   │  It works for 15 minutes.                   │
   │                                             │
   │  [ done ]              [ cancel this code ] │
   └─────────────────────────────────────────────┘
```

and a **waiting** row joins the list under the name she typed. Design constraints, each from an FR:

- **The code renders large enough to read from arm's length** and is grouped `4831 9026` (`01-F80`
  (b)). It is spoken down a phone, so the screen also states *where it goes* — a code read to somebody
  staring at a screen with no box for it is a support call (`14-F41`).
- **A reload loses it, and the surface says so** rather than pretending the cloud can reproduce it —
  which keeps doc 01 free to store a verifier and never the secret (`01-F80` (b): Argon2id at
  `01-F61`'s cost floor, never the code). The way out costs one press: *issue a new one*, which
  **kills the previous code** (`01-F80` (c)) so one waiting row never has two live codes.
- **A claim is observed as the row changing by itself** into `14-F12`'s device row. Until then the row
  states its age; near expiry it says so; expired reads *expired* and offers another. **It never
  silently disappears** (`00 §5.7`).
- **Cancel is not revoke and the surface never blurs them** (`14-F41`). Before a claim, cancelling
  destroys a credential nobody holds and may be repeated. After a claim, the act is `14-F13`'s
  revocation and is **permanent** (`01-N5`, `14-F30`). The two controls look identical, so the surface
  states which side of the line she is on **before** she presses.

### 3.8 Tills, half two — the till claims (`01-F80` (f), (g))

**This is the half with no surface anywhere in the product, and it is the reason a restaurant cannot
put a till on the floor today without somebody who has SSH on the server.**

**The uncommissioned state.** `01-F80` (g) narrows `01-F65` by exactly one case: all three ids absent
**and** no stored pairing = UNCOMMISSIONED. The host opens **no device database** (`01-F64` binds one
at creation and there is nothing to bind to), joins no LAN, and presents the pairing surface and
nothing else. Any *other* incompleteness — one id set, a blank, a padded value — still refuses at
boot, loudly, exactly as `01-F65` says. ⚠ **This is a change to `resolveDeviceIdentity`'s contract**:
today it falls back per key to `DEV_IDENTITY` (`packages/device-config/src/device-identity.ts:79`),
which is the counter's documented dev affordance and is the one exemption `01-F65` grants. A third
resolution — *absent-and-uncommissioned* — has to be a **separate, named** function beside
`resolveDeviceIdentity` and `requireDeviceIdentity`, on `01-F65`'s own rule that a call site states
which discipline it is under.

**The screen.** Full panel, `packages/ui` only (commandment 6), and it already has every component it
needs — `NumericKeypad` (the same keypad `01-F61`'s unlock puts on this glass), `Panel`, `Readout`,
`PanelHealth`:

```
   ┌──────────────────────────────────────────────┐
   │  This till is not connected yet.             │
   │                                              │
   │  Type the 8-digit code from the back office. │
   │                                              │
   │        [ 4 8 3 1   9 0 _ _ ]                 │
   │                                              │
   │            ┌───┬───┬───┐                     │
   │            │ 1 │ 2 │ 3 │   …                 │
   └──────────────────────────────────────────────┘
```

- **No other control exists on this screen.** No settings, no server field, no *skip*. It is not a
  `01-F67` refusal-to-start (that FR forbids waiting for a human because an unattended till that waits
  is a dark till) — **pairing is attended by construction**, somebody is standing there with the code.
- **The claim carries the code and a public key and nothing else** (`01-F80` (a)). No org, no branch,
  no class, no name is typed here or sent from here.
- **The five refusals are five sentences, each with a different next action** (`01-F80` (f),
  `00 §5.7`). *"Pairing failed"* sends her nowhere:

| Refusal | What the till says | What she does |
|---|---|---|
| `unknown_code` | *"That code is not right. Check the digits and try again."* | retype |
| `expired` | *"That code has expired. Ask for a new one."* | back office issues another |
| `already_claimed` | *"That code has already been used by another till."* | back office issues another |
| `rate_limited` | *"Too many tries. Wait a minute and try again."* | wait |
| `unavailable` | *"Can't reach RestOS right now. Check the internet and try again."* | network |

- **On success one response carries everything** (`01-F80` (f)): identity, the `01-F73` certificate
  with its org issuer PEM, `01-F81`'s pinned roster-signing key, and `01-F47`'s device token — one
  act, two credentials. `packages/sync-client` already has the shape waiting: `lan-credential.ts`,
  `store.setLanCredential` and `roster-fetch.ts` all carry `@unreached-owed` markers naming this exact
  change (`cloud-session.ts:943`, `roster-fetch.ts:39`).

**The confirmation, and it is this design's own addition.** After the claim commits and before the
till is usable, it shows what it has become and asks for one acknowledgement:

```
        This till is now
        Counter 1
        Gulberg branch · Sadiq Foods

        [ that's right ]      [ that's not us ]
```

**Why:** a till paired to the wrong branch is the funnel's one **irreversible** failure (§6) — the
envelope stamps `branch_id` on every event and `01-F1` makes them permanent. The device chooses
nothing (`01-F80` (a)) so this is a **display**, not a choice, and *"that's not us"* is not an
un-pair: it says *"tell the back office to revoke this till and connect it again"*, which is
`14-F13` + a fresh `device_id` (`01-N5`). One screen, three names, and it converts a permanent
mis-attribution into a two-minute redo — but **only if it lands before the first sale**, which is
exactly why it is at the end of pairing and not in a settings screen.
⚠ *Not required by `01-F80`. It is an addition and needs its FR clause in doc 14 or doc 01.*

**What pairing still does not remove:** `RESTOS_CLOUD_URL`. `01-F73` (c) and `01-F80` (f) both reason
from *"TLS to a known endpoint"* and `cloud-url.ts:67` says *"pairing is what makes an endpoint
known"* — but the endpoint itself is read from the environment at
`apps/pos-electron/src/main/index.ts:746`. Founder decision 9.

### 3.9 Kitchen routing and the test print

`03-F51` routes each station to `paper`, `screen` or `both`; a branch with **no route at all** is a
configuration-time refusal with the offending stations named (`15-F10` as amended), because food
cannot reach a cook. `14-F11` puts a test-print button on each rule, and R37 has pilots start
printerless.

**Asks:** for each station the menu already names (`03-F50` puts `station` on the catalog entry), one
choice: *printed ticket* / *kitchen screen* / *both*. Choosing *printed* asks for the printer
(`RESTOS_PRINTER` today) and offers the test print; choosing *screen* asks nothing and the row is
satisfied by a paired pass device.

**What it must not do:** require a printer. `DEC-HW-001`'s whole amendment is that a branch which
declares no printer generates **no printer row**, so the checklist cannot hold on hardware the
restaurant does not own.

**What is honest here today:** the test print's verdict is a **human** verdict (`27-F35`'s ≥85%
comprehension gate is untested, K-8 is unrun, no printer exists in this repo). So the row reads
*"we printed a test ticket — did it come out?"* and records her answer as an attestation with her
name on it (`02-F53`, `28-F25`), never as *verified*.

### 3.10 Configuration — tax, rounding, tenders, channels, loyalty

**The screens are designable and none of them may ship before `01-F87`'s carrier.** Measured
2026-08-25: `packages/sync-protocol/src/messages.ts` carries `catalog`, `staff` and `device_roster`
and no `config`; the till reads `RESTOS_TAX_POSTURE`, `RESTOS_TAX_RATE_BPS` and its charge-rounding
granularity from `process.env` (`main/tax-posture.ts:76,79,232`). **A tax screen that saves a number
no till will ever read is `02-F37`'s "succeed and lie" on the money path** — and it is the exact
shape of this repo's recurring defect, in its most expensive location.

So the funnel's configuration step, in build order:

1. **Not in the funnel at all until `01-F87` lands.** The row reads *"tax and rounding are set by
   RestOS for now"* and names the role that can (`14-F38`). That is the honest state and it is also
   R37's: pilots start simple.
2. **When the carrier lands**, the screens are `14-F45` (the tax cell editor, `16-F2`'s matrix with a
   cell that can say *not the org's to set*), `14-F44` (the tender set — a seed she enables, disables
   and extends), R70's charge-rounding granularity (rupees or tens, per org), and `14-F47`'s two
   thresholds (paid-out approval — R65 rules the default **zero** — and the discount ceiling).
3. **Loyalty (R79) is not onboarding.** Three forms (account, bearer card, wallet pass), and the
   wallet pass is *"new scope … a genuine integration"*. A restaurant does not need it to sell on day
   one and putting it in the funnel would put an unbuilt integration in front of a first sale.

**The presets-not-knobs rule (`00 §7`) decides what this screen asks at all**: the funnel asks for the
things *the vendor cannot know* (her tax posture, her tenders, her rounding — R55/R60/R63's own
criterion) and asks for nothing else. Every other value is a preset with a reason.

### 3.11 Go live

`14-F27`'s five items, read through `28-F25`. **Measured against what the product can observe today:**

| `14-F27` item | Observable? | Source | Verdict |
|---|---|---|---|
| ≥1 device paired **and syncing** | **half** | `kernel.device_registry` has the row; **it has no last-seen column** (`registry.ts:151` refuses to invent one) and `01-F11`'s queue depth lives on the device | *paired* is observed; *syncing* is not, and must not be rendered as if it were |
| ≥1 printer passing a test print | **no** | K-8 is unrun; nothing in the cloud sees paper | attested, with her name |
| menu non-empty with required names | **yes** | `01-F60`'s completeness check, the value the writer refuses against | observed |
| opening float configured | **no carrier** | layer-3 config, `02 §7`; env today | attested until the config plane reaches a device |
| owner app connected and receiving | **meaningless now** | R49/`14-F31` made the owner app a browser surface on this same app | ⚠ owed to doc 14 — `28-F25` names it and does not decide it. **Recommendation: retire the item**, because the owner reading this screen *is* the owner app connected |

**Three rules the screen must hold** (`28-F25`, `02-F53`): an attested row reads *"you told us…"* and
never *"verified"*; it carries her `user_id` and the moment; and an attested row is rendered
**visibly differently** from an observed one — a checklist that renders them alike is *succeed and
lie* on the last screen before a restaurant starts trading.

**And it gates nothing.** Pressing *we're live* records the ceremony (`14 §4`) and changes no
admission: `28-F8` and `28-F25`'s last reading forbid a readiness state reaching a sale, and the till
has been able to sell since the moment it was paired.

---

## 4. Where the menu comes from

> *"so they can upload it all"* — the founder. This is the biggest single input in the funnel and the
> place a restaurant abandons it.

**The size of the job, measured against what a Pakistani mid-market restaurant actually has:** 60–150
sellable entries, one or two channels at onboarding, `01-F60` requiring a price per `(branch,
channel)` pair, plus `03-F50`'s station (which inherits, so blank is the norm — `14-F35`). Typing one
entry through the shipped editor is name + section + price(s); this repo has authored a 20-entry menu
through it in a browser one entry at a time, twice.

### 4.1 The five sources, honestly costed

| # | Source | What it really is | Cost | Verdict |
|---|---|---|---|---|
| 1 | **Type it** | the shipped editor | **zero — it exists** | The floor. Every other option is measured against it: ~1.5–3 hours for 100 items. That is *tolerable*, not *good* |
| 2 | **Paste a block of text** | one line per item — `Chicken Karahi 1200` — parsed into rows, then the review grid | **~3–5 days**, no new dependency, no model, no file format | **Recommended for slice 1.** Every owner already has her menu as text: a WhatsApp message, a Word file, a foodpanda listing she can copy. It converts an hour of typing into ten minutes of correcting |
| 3 | **Spreadsheet upload** | `15-F8`'s five-stage pipeline: upload → column mapping (saved as reusable templates) → validation (duplicates, price sanity, orphaned modifiers) → staged preview → commit, and re-import **diffs** | **2–3 weeks honestly** — the mapping UI and the diff are each most of a week, and validation is where the corpus's rules live | Real work. It is specified as a **vendor** tool (doc 15). Founder decision 2 decides whether the owner gets it |
| 4 | **Photograph / PDF of a printed menu** | extract → the same review grid | **~1 week for extraction on top of #2's grid**, plus an `18 §15` dependency-governance event for a vision model, a per-tenant inference cost, and a privacy call | The category's current answer (Square ships a generative menu path; a tier of vendors claim ~95% on PDF/photo). **Cheap only if #2 lands first**, because the review grid is 80% of the work and the extractor is interchangeable |
| 5 | **foodpanda menu export** | doc 08's territory; `15-F8` already names it as an input | **unknown — it is a relationship question before it is a build** | ⚠ **The highest-yield source in this market and the one nobody has scoped.** Most target pilots are already listed on foodpanda with a priced, categorised, photographed menu. Founder decision 3 |

### 4.2 The rule that makes 2, 3, 4 and 5 cheap instead of expensive

**Build the review grid once; let every producer land against it.** All four non-typing sources
produce the same thing — *rows a human has not yet approved* — and differ only in the extractor. The
grid is: proposed rows, each editable, each with its refusal stated in place (`14-F37`'s counted
incompleteness), a per-row *skip*, and one commit that goes through **the writer that already exists**
(`01-F60`'s completeness check, `14-F29`'s price grid, `14-F28`'s apply-when).

**Two writers of a catalog is this corpus's most-repeated defect with an owner's menu on it.** An
import path that inserts entries by its own route bypasses `01-F60`'s writer-side completeness and
`14-F28`'s timing, and that is how a menu arrives on a till with half its prices missing and nothing
having refused.

### 4.3 The staged-import shape is already specified — do not re-derive it

`15-F8` is a five-stage pipeline and every stage exists for a reason a first implementation forgets:
mapping templates (the second branch of a chain), duplicate and orphan validation, a **staged
preview** (nothing is written until she has seen it), and **diff on re-import** (an owner re-uploading
a corrected sheet must not double her menu). If the owner gets an importer, she gets *that* pipeline;
what changes is who operates it, not what it does.

### 4.4 The interaction nobody has looked at: R75 and a fresh org

**R75 refuses a publish that would break recipe completeness.** For onboarding this reads two ways
and the difference is a funnel-killer:

- *"A change that breaks completeness is refused"* — a fresh org has never been COMPLETE, so nothing
  breaks and a 100-item paste publishes normally. Recipes come later, and `plans/inventory/design.md`
  §5.6's completeness ramp converges.
- *"Publishing requires the recipe"* — a 100-item menu needs 100 recipes before a single price is
  live, i.e. before the till can sell anything at all.

The inventory design's own reasoning favours the first (its gate is a *window* gate over a completed
scope, and the ruling's stated cost is about *tonight's special*, not about a new tenant). **Stated
here as a reading, and flagged as founder decision 6, because getting it wrong the other way means no
self-serve restaurant ever reaches its first sale.**

### 4.5 What else the funnel has to collect, and where it comes from

| Data | Volume | Source | Cost |
|---|---|---|---|
| staff | 3–15 people | typed (`14-F14`) | fine — 2 min each, and R30 removes the email demand |
| stations | 2–4 | derived from the menu's own `station` values (`03-F50`) plus one routing choice each | fine |
| tenders | seed | `14-F44`'s seed, she toggles | fine |
| tax posture + rate | 1–2 numbers | typed, **when a carrier exists** | §3.10 |
| customers / loyalty | none at onboarding | `02-F47`/doc 17 — built by trading, never imported | correct as is |

---

## 5. What we do for a pilot, and what the product does

**The shape the corpus already ruled, one module over** (`plans/inventory/design.md` §10.1, founder
decision 2): *"The owner authors recipes in the back office. The RestOS team uses the same editor on a
pilot's behalf."* Its stated properties are what make it legitimate: **one editor** (not a vendor
tool beside an owner tool), **the same permission cell**, and **attribution per act** — `15-F9`'s
workbench survives as *the same editor with a different actor*.

**That shape transfers to onboarding wherever three conditions hold:**

1. the surface is the one the owner will use afterwards,
2. the act is attributed to a **named human** who is not the owner, and
3. the vendor's hands are a **convenience**, not the only way the act can happen.

### 5.1 Where it is legitimate

- **Menu entry.** Sitting with an owner and typing her menu into her own editor is Toast's model
  (their *self-service* tier still includes a vendor menu review) and Petpooja's (the team loads the
  menu during install). Condition 3 holds: she can type it herself.
- **Kitchen routing and the first test print.** Hardware judgement is genuinely ours at pilot scale
  and the surface is hers afterwards.
- **The introduction.** R46 already concedes the vendor is the front door at 5–10 pilots and
  `28-F23` says so in terms: R40's *self-serve* is satisfied **for the restaurant and not for the
  vendor**.

### 5.2 Where it hides a missing feature — and the measurement that proves it

**Condition 2 fails today, universally.** Measured 2026-08-25:
`services/sync-gateway/src/user-crud.ts:317` mints, hashes and **discards** a 256-bit secret for every
user created in the back office, and its own comment states the consequence — *"a person created here
cannot sign in to the back office"*. `create-owner` refuses a second owner. No password change or
reset exists anywhere in the repo.

**So "we do it on her behalf" is implemented today as: she gives us her password.** That is not a
process shortcut, it is the thing `15-F26`, `15-F27`, `15-F3` and `15-F16` are collectively written to
prevent — a shared secret the audit trail cannot separate from her own later acts, with `01-F1`
making every act under it permanent. It also silently disables the corpus's only sanctioned
cross-tenant path (`15-F15`'s consent-scoped impersonation, itself unbuildable — `28-F19`).

**The fix is small, specified, and unblocks four things at once:** extend `14-F42`'s single-use
redemption token to **any** user the owner invites, which is `15-F26`'s *"single-use, expiring
set-credential link"* read as the generic mechanism it always was. It gives us a named vendor account
inside a pilot org, gives the owner a second back-office human, answers R63's *"owner or ops lead"*
without minting a role (§7), and is the only thing standing between the product and an honest audit
trail during exactly the period when the most consequential records are written.

**Three other places the pilot hand hides a hole, named so they are not mistaken for process:**

| The hand | What it hides | Where it is owed |
|---|---|---|
| the founder WhatsApps an invite code | there is no issuing surface, no format, no TTL | `28 §9.27`, doc 15 |
| we run `provision-device` over SSH | `01-F80`'s claim endpoint | `mvp-plan` A8/A9 |
| we look in Postgres to see if a pilot is ready | `28-F25`'s vendor read has **no surface** — `15-F1`'s console does not exist | `28 §9.27` |
| we `create-owner` a replacement | there is no recovery path anywhere in the corpus | `28 §9.21` |

**The rule to carry:** a pilot hand is legitimate when it uses the product's own surface and leaves
the product's own record. When it uses `psql`, a shell command or a shared password, it is not
onboarding support — it is a missing feature with a person standing where the feature goes, and it
will be discovered at the tenth tenant rather than the first.

---

## 6. Failure modes

**The question that decides everything here is what `01-F1` actually freezes.** It freezes the
**ledger**: events, their `org_id`, their `branch_id`, their `actor_user_id`, the price snapshotted
on a line (`01-F18`). It does **not** freeze reference data or configuration — a menu price, a tax
rate, a device name and a branch name are all correctable going forward. So the sharp question for
every failure below is: *did it write an event, or only a record?*

| Failure | Recoverable? | Mechanism / cost | What this design does about it |
|---|---|---|---|
| **She abandons halfway** | **Yes, free** | state is derived (§2.2); nothing half-written exists | The default case, not an edge |
| **Email typo at signup** | **NO — today the org is unadministrable and permanent** | ⚠ *and it succeeds first*: she redeems in the session she is already in and sets a password, so nothing fails until her **next** login, days later. Then: no such login, `create-owner` refuses a second owner, no email edit exists (`user-router.ts` has create / setAssignments / setPin / deactivate and no setEmail), no reset. `01-F68` never reuses the `org_id` | §3.1 echoes it; §3.2 shows it and lets her correct it before the token is spent; founder decision 5 asks for the operator step |
| **She loses her password** | **NO** | `28 §9.21` — single-use means spent, and nothing re-mints. One owner, one password | Same fix as above. This is the highest-severity open hole in the funnel |
| **Two signups for one restaurant** | **No, but bounded** | every junk org is permanent (`28-F15`); the invite code bounds the total to codes issued (`28-F23`) | §3.1's *already have an account?*; one code = one org (`28-F23`'s stated reading) |
| **Wrong branch name / type** | **Yes** | a name is a `14-F2` settings change; a *class* change is not offered anywhere, because a training branch's isolation **is** its class (`01-F49`) | §3.4 echoes type and class on the confirmation |
| **Wrong tax rate, typed once** | **Split, and the split is the point** | the **rate** is configuration and is correctable; every order already charged under it is permanent (`01-F1`), the receipts are printed, and `01-F82`'s `billed_paisa` is attested rather than recomputed | §3.10 keeps tax **out** of the funnel until a carrier exists — an uncorrectable wrong number is worse than an absent one. Founder decision 7's training branch is the other mitigation |
| **Till paired to the wrong branch** | **NO for what it already wrote; yes for the device** | the envelope stamps `branch_id`; those events are permanent and land in the wrong branch's day, shift and reconciliation. The device is redone by revoke + a fresh `device_id` (`01-N5`, `14-F30` refuses un-revocation) | §3.8's post-claim confirmation, placed **before the first sale** — this is the whole reason it exists |
| **Two tills claim one code** | **Yes, by construction** | `01-F80` (d): first to commit wins, same key re-presenting gets the same certificate, everything else is `already_claimed` — one code, one device, never a forked store (`01-F64`, `01-F66`) | Nothing to design; the till's refusal sentence must say *another till used it* |
| **Code minted, never claimed** | **Yes** | it expires and leaves nothing (`01-F80` (c)) | The waiting row states its age and offers another |
| **Claimed, response lost** | **Yes inside the TTL, then a stranded row** | retry returns the same certificate; after the TTL the registry row is an unusable device she can see and revoke (`01-F70`'s required name is what makes that possible) | The device list must render such a row as *connected but never seen*, not as a working till |
| **Menu published with a wrong price** | **Yes forward, no backward** | `01-F18` snapshots price at line-add and never re-derives | `14-F28`'s three-way timing already covers it; the import review grid (§4.2) is where a bulk error is caught |
| **She sells before configuring anything** | **Correct behaviour** | `28-F25`, `28-F8`, `01-F17` | The funnel never blocks it and the checklist never becomes an interlock |
| **A cashier's PIN is known to the owner forever** | **No, until A14** | `14-F40`/R33 is specified and blocked on a wire kind; the cost compounds per shift and `01-F1` makes each shift permanent | §3.6 says so on the screen rather than staying silent |
| **A second tenant signs up** | **Not a tenant failure — a deployment one** | `ENABLED_BRANCHES`/`ENABLED_CHANNELS`/`BOOTSTRAP_ORG_ID` are per-process env | §0 item 3: A16 lands **before** the first self-serve signup, not after |

**The pattern worth naming:** every irreversible failure in this table is a **join key written into an
envelope** — the org, the branch, the actor. Every reversible one is a record or a number. So the
funnel's confirmation steps belong exactly where a join key is fixed: the email at signup, the branch
at pairing, the person at PIN issue. Nowhere else needs a confirmation, and a funnel that confirms
everything trains her to press through the three that matter.

---

## 7. Who onboards — and `ROLES` has no answer

`ROLES` is `cashier · branch_manager · storekeeper · owner`. There is no ops-lead and no admin, and
R63's *"the owner or ops lead sets it"* was deliberately **not** resolved by minting one. Every
onboarding permission cell is **owner-only** by three separate FR-decided actions: `device.manage`
(`14-F30`), `user.manage` (`14-F39`), `config.manage` (`14-F43`).

**So the funnel's actor is the owner, and today that is enforced by the credential rather than by the
matrix** — because hers is the only back-office login that can exist (§0 item 4). The three ways out,
with costs:

| Option | What it costs | Verdict |
|---|---|---|
| **(a) A second human with an `owner` assignment**, invited on `14-F42`'s token extended to any user | the second account is **unrestricted**: it can revoke tills, edit prices, deactivate the owner. But it is a **named** human with her own credential and her own audit trail, which is the property the corpus keeps arguing for | **Recommended.** It needs one FR (extend `14-F42`) and no matrix change, and it is `15-F26`'s existing mechanism |
| **(b) A back-office slice for `branch_manager`** | answers `14 §9`'s first open question by accident — the same trap `14-F30` refused when it pinned `device.manage` owner-only. Widening later is additive; widening wrongly is not | Refuse for now, on `14-F30`'s own reasoning |
| **(c) Mint an ops-lead role** | `28-F16` forbids the vendor half of it outright (*"a platform operator is not a tenant role"*), and a fifth role touches every Appendix A cell and every `can()` verdict | Refuse. R63 already declined it |

**What (a) does not solve and must be said:** an owner-role second account can do everything the owner
can, so *"my ops lead sets the discount ceiling but cannot revoke my tills"* is not expressible in
this product and will not be until someone answers `14 §9`'s open question. The funnel should not
pretend otherwise — it invites *a second person who can do everything you can*, in those words.

---

## 8. What this design does not close

- **The invite code's format, length, TTL, and who issues it.** Doc 15's, owed (`28 §9.27`), and
  `01-F80` warns in terms against copying the pairing code's numbers across: *"same word, two threat
  models; a shared helper is how one FR's reasoning silently becomes the other's."*
- **Recovery of anything** — password, token, email. `28 §9.21` survives R47 and this design only
  narrows it (§3.2's email echo) rather than closing it.
- **Where go-live state durably lives** (`28 §9.28`) and **who promotes a self-onboarded org into a
  rollout channel** (`28 §9.29` (b)). The screens work under either answer; the derivation does not
  care.
- **Whether a vendor who sees a wrong attestation may block go-live** (`28 §9.29` (a)). This design
  builds no veto and none may be inferred from the vendor read.
- **`14-F27` item 5** (*owner app connected*) — recommended for retirement, owed to doc 14.
- **The two-plane hop's governance:** `28-F18` (c)'s `services/api` → gateway `/internal` path still
  owes `01-F71` a clause, and every procedure this funnel adds rides it.
- **Multi-branch pricing at scale.** The funnel handles two branches; `14-F29`'s grid with eight
  branches × three channels is a different screen and a different problem.

---

## 9. Build order

Mapped onto `plans/saas-pivot/mvp-plan.md`'s A-items so nothing is renumbered. **Two of the first
four entries are not code at all, and a third needs a spec PR before its first line.**

```
0.  founder decisions                        ← §10. 4 and 5 shape step 4 · 9 shapes step 7 ·
                                                1 and 6 shape step 9 · 2, 3, 7, 8 can follow later
1.  A16  the enabled (branch,channel) set out of process.env        ← the funnel's output is unservable without it
2.  A15  permission actions for the tenancy plane (org.*/branch.*)  ← spec PR first; the wizard's first
                                                                      procedure fails to START without it
3.  doc-15 spec act: the invite code's issuing surface + parameters ← §3.1 cannot ship without it
4.  A17  signup + redemption (§3.1, §3.2)  + the email-echo clause
5.       branch procedure + screen (§3.4)           ← smallest real step; unblocks everything
6.  A8   the pairing model, cloud half (§3.7)       ← 01-F80 is written; this is the writer
7.  A9   the pairing claim, device half (§3.8)      ← the uncommissioned state, the keypad, the five
                                                      refusals, the confirmation
8.       the setup list (§3.3) — derived, one surface for 14-F26 and 14-F27
9.       menu paste-and-review (§4 option 2) on the review grid every other source will reuse
10.      kitchen routing screen (§3.9) + the go-live list's attested rows (§3.11)
11. A19  the config carrier (01-F87) → then and only then §3.10's screens
```

**Steps 6 and 7 are one build** (`mvp-plan` A-II: *"the same missing thing seen from two ends"*), both
FULL tier under commandment 10, and step 7 is the change that first opens a LAN socket onto a branch's
money ledger — its own reviewer warning, not this document's.

**What can run in parallel:** 5, 8 and 9 are ordinary back-office work on a shipped template. 6/7 are
the serialized strand and should start the day the rulings land.

---

## 10. Founder decisions

Each is a real either/or with both costs. Nothing below is a recommendation dressed as a question.

**1. Menu intake for slice 1: paste-and-review, or the spreadsheet pipeline?**
*Paste* costs 3–5 days, needs no new dependency, and converts the text every owner already has; it
handles a flat list well and modifiers badly. *Spreadsheet* (`15-F8`) costs 2–3 weeks, handles
structure, and gives us a reusable mapping template for the second and third pilots — but it is doc
15's vendor tool, so choosing it also answers decision 2 by accident.
**Cost of choosing paste:** a chain with modifier groups still types them. **Cost of choosing
spreadsheet:** the first pilot's menu is typed by hand while we build the importer.

**2. Does the OWNER get the bulk importer, or does it stay a vendor tool?**
`15-F8` puts it on the platform-admin plane. If it stays there, self-serve onboarding always has a
vendor step for any restaurant with more than ~40 items, and R40's *"nobody touching a terminal"* is
satisfied while R17's *"the founder is otherwise the onboarding process"* is not. If the owner gets
it, doc 15 needs an amendment and the surface needs the full staged pipeline rather than a file input.
**Cost either way is a spec act; the difference is which document.**

**3. foodpanda menu import: in or out?**
Most Pakistani pilots are already on foodpanda with a complete, priced, categorised menu, so this is
plausibly the single highest-yield onboarding input in this market. It is also a relationship and a
legal question before it is a build (export access, terms, and `08`'s scope), and it drags aggregator
work forward into onboarding.
**Cost of yes:** the funnel takes a dependency on a third party during the step that decides whether a
restaurant stays. **Cost of no:** every foodpanda restaurant retypes a menu it already has, and it is
the first thing an owner asks for.

**4. A second back-office login: extend `14-F42`'s token to any user, or one owner per org?**
*Extend* costs one FR and one screen, and gives a named vendor account, an ops lead, and the only
honest attribution during onboarding. *Keep one* costs nothing to build and means every pilot where we
help is a shared password, permanently attributed to the owner under `01-F1`.
**This is the highest-leverage question in this document.** §5.2 measures the current state.

**5. Owner email and password recovery: build the operator step now, or accept a dead org?**
Today a typo'd email or a lost password makes an org permanently unadministrable and its `org_id`
permanently spent. *Build now* costs a declared operator step under `15-F27`'s discipline (re-point an
owner's email; re-mint a redemption token) plus §3.2's echo. *Accept* costs one dead pilot org and a
support conversation that ends in *sign up again with a new invite code* — which at 5–10 pilots is
survivable and at 50 is not.

**6. Does R75's completeness gate apply to a fresh org's first publish?**
*No (recommended reading)* — a new org has never been COMPLETE, so nothing breaks, and recipes arrive
later on `plans/inventory/design.md` §5.6's completeness ramp. *Yes* — a 100-item menu needs 100 recipes before the till can sell one dish.
**Cost of getting it wrong in the "yes" direction: no self-serve restaurant ever reaches a first sale.**
**Cost of "no": an org can trade for weeks with no food-cost figure — which is exactly what R76 already
rules it should show: nothing, plus the list of what is blocking it.**

**7. Does a pilot's first branch start as `training` (`01-F49`), and is there a practice mode?**
Toast's model is a test mode you leave deliberately. *Training branch* means practice orders never
pollute a real ledger — which matters because `01-F1` makes a wrong tax rate or a mis-paired till
permanent — but it costs a second branch, a switch, and a menu she has to re-price for the real one
(`01-F60` keys prices by branch). *Straight to production* is one branch and a real first day, and
every mistake in it is forever.

**8. Does the vendor get a read of pilot funnel state now, or do we watch through Postgres?**
`28-F25` gives the vendor a read of go-live state and `15-F1`'s console does not exist. *Build a
minimal vendor read now* (one page, the funnel state of every org) costs a day on the platform-admin
app and is the only way we notice a pilot stuck on step 3. *Don't* means we watch pilots through
Postgres, which is §5.2's hidden-feature list growing by one.

**9. How does a till learn where the cloud is?**
Pairing removes the identity keys and not `RESTOS_CLOUD_URL`. *Compile the endpoint into the pilot
build* — zero friction, one build per deployment, and a re-pointed deployment needs a new installer.
*Ask for it on the uncommissioned screen* — one more field in front of a person who does not know
what a URL is, on the exact screen this design otherwise keeps to one input.
**Until this is answered, "nobody touches a terminal" is false at the device end whatever `01-F80`
does.**
