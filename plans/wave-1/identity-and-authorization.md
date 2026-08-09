# S-0 — identity and authorization (`domain`, `sync-client`, `pos-electron`)

> **⚠ This plan is not the wave's scope.** It unblocks `02-F20`'s approval family; the LOCAL
> half of that family has since shipped and the REMOTE half (doc 05) is unplanned — `apps/manager`
> is a scaffold stub. Four Wave-1 modules have no plan at all. See
> `wave-1-scope-reconciliation.md`.

**Status:** APPROVED by the orchestrator (lead call, August 2026). The founder ruled the *shape*
— **A-narrow: PIN session plus a minimal staff registry, nothing else from doc 11**
(`service-surface.md §2.3`). This plan settles the design questions that ruling leaves, none of
which need a second founder pass because each is either specified already or has a governing
precedent in the corpus.

**Unblocks:** `service-surface.md` S-3/S-5/S-6 (the Cash and Me screens), `backoffice-catalog.md`
B-1 (whose Q1 is answered here), and `02-F20`'s entire approval family.

**FRs:** `01-F26` (User × Role × location, PIN Argon2id, idle auto-lock, Appendix A is the seed),
`01-F27` (server-side authz; device tokens carry device identity only), `01-F28` (offline PIN
verify against synced hashes; roles propagate as reference data), `02-F20` (manager escalation),
`02-F22` (the role guard), `02-F23` (own-shifts-only), `02-F41` (attribution is whoever's PIN is
in), `02-F38` (a requester never sees approve for their own request).

---

## 1. Nothing here is invented — the stack is already pinned

`18 §` specifies this module more tightly than most:

- *"Authorization is a single **`can(user, action, scope)`** helper generated from the `domain`
  permission matrix — **inline role checks are banned**."*
- *"`jose` for device/session tokens … **`argon2` for PIN hashes**."*
- `01-F26` names `restaurant-os.md` **Appendix A** as the seed matrix.

So S-0a is a **derivation**: encode Appendix A as data, expose `can()`, and ban the inline check.
Commandment 2 is satisfied without a spec PR.

---

## 2. The design decision the seed matrix forces: `can()` is NOT a boolean

Reading Appendix A row by row, the cells hold **three** distinct values, not two:

| Cell | Meaning | Example row |
|---|---|---|
| `✔` | allowed outright | *Create order / print KOT* — Cashier |
| `—` / `✖` | refused | *Day open / close, cash count* — Cashier |
| **`needs Mgr PIN`** | **allowed only with a manager's credential presented at the point of action** | *Void after KOT printed* — Cashier |

**A boolean `can()` destroys the third value**, and the third value is the one `02-F20` is built
on — *"Manager escalation required for: void after KOT, comp, discount above org threshold, price
override. Two equivalent authorization paths: local manager PIN on the POS; remote approval via
manager console. First response wins."* If `can()` returns `false` for a cashier voiding after
KOT, the caller has no way to distinguish "never" from "not without a manager", and the only
paths left are to re-introduce the inline role check `18 §` bans, or to hard-code the escalation
list somewhere else — which is the same matrix, written twice, drifting apart.

**Ruling: `can()` returns a three-valued `Decision`.**

```
type Decision =
  | { kind: "allow" }
  | { kind: "deny";     reason: string }
  | { kind: "escalate"; satisfiedBy: "manager_pin" | "remote_approval"; reason: string }
```

`escalate` is what `02-F20`'s two equivalent paths both resolve. It is also what makes `02-F38`
enforceable server-side: a requester's own approval attempt is a `deny`, distinct from the
`escalate` that invited an approver in the first place.

### 2.1 Report scope is a second predicate, not a fourth `Decision` case

Appendix A's *View sales reports* row holds **scopes**, not permissions: *own shift only* ·
*own branch* · *stock reports* · *everything*. Folding those into `Decision` would make every
caller pattern-match on a case that only one action uses. They get their own narrow helper —
`reportScope(user, branch) → "own_shift" | "own_branch" | "org"` — which is what `02-F23`'s
own-shifts-only rule and the cashier's `Me` tab both read.

---

## 3. Scope of the narrow matrix (`24-F23` — the minimum that closes the FRs)

**Roles: the four Appendix A columns only** — `owner`, `branch_manager`, `cashier`,
`storekeeper`. The role *list* in Appendix A names eleven (waiter, rider, chef, accountant,
marketing, …) but the seed *matrix* gives four columns, and encoding rows for roles no Wave-1
action is performed by is exactly the speculative generality `24-F23` forbids. Widening is
cheap and additive; an over-general matrix shipped early is not.

**Actions: one per Appendix A row, and the ids are the SHIPPED ones.**

> **⚠ CORRECTED August 2026 — the earlier draft of this table invented its own ids** (`order.settle`,
> `void.after_kot`, `comp.item`, `discount.above_threshold`, `price.override`, `catalog.edit`) and
> the oracle independently derived ids from Appendix A's row *names*. The oracle won and shipped.
> The stale table is corrected here rather than left to be coded from — that is precisely the drift
> that made `screen-map.md`'s tab rail send a session to build the wrong screen.

Shipped in `packages/domain/src/permissions.ts` as `PERMISSION_ACTIONS`:

| Action | Cashier | Mgr | Store | Owner |
|---|---|---|---|---|
| `order.create` | allow | allow | deny | allow |
| `payment.settle` | allow | allow | deny | allow |
| `order.discount_within_threshold` | allow | allow | deny | allow |
| `order.discount_above_threshold` | **escalate** | allow | deny | allow |
| `order.void_after_kot` | **escalate** | allow | deny | allow |
| `order.comp_item` | **escalate** | allow | deny | allow |
| `order.price_override` | **escalate** | allow | deny | allow |
| `receipt.reprint` | allow | allow | deny | allow |
| `day.open_close` | deny | allow | deny | allow |
| `stock.receive` · `stock.count_entry` | deny | allow | allow | allow |
| `stock.wastage_record` | allow | allow | allow | allow |
| `catalog.edit_menu_prices` | deny | **deny** | deny | allow |
| `catalog.edit_recipes` | deny | deny | deny | allow |
| `history.edit_delete` | deny | deny | deny | **deny** |
| `approval.grant` | deny | allow | deny | allow |
| `report.sales_view` | own shift | own branch | none | org |

Three resolutions worth keeping visible:

- **`day.open_close` for a cashier is `deny`, not `escalate`.** `02-F22`'s clause *"where no
  manager device exists, the local manager-PIN path satisfies the guard"* reads like escalation and
  is not: it is a manager PIN **unlocking a session** (`02-F18`), after which the subject *is* a
  manager. `02-F20`'s in-session escalation enumerates its actions and day open is not among them.
- **`catalog.edit_menu_prices` for a branch manager is Appendix A's `optional`, shipped as `deny`.**
  No config plane exists (`00 §7` layer 2) and no FR states the default, so it **fails closed** —
  widening later is additive, while guessing the other way is an unauthorised price change frozen
  by `01-F53` in a ledger `01-F1` forbids correcting. Recorded as a finding, not settled.
- **`history.edit_delete` needed no special case.** Appendix A's hard rule (*"no role, including
  owner, can silently edit or delete historical transactions"*) falls out of the exhaustive
  `Record<Role, …>`: every row must state every cell, so owner's `deny` is written like any other.

**Deliberately NOT in scope:** per-user overrides (`01-F26` names them; nothing in Wave 1 sets
one), per-location assignment beyond a single branch scope, and the seven roles with no Appendix A
column. Each is additive.

**OWED — the cash-screen session adds these rows**, because none is an Appendix A row and none is
in the shipped `PERMISSION_ACTIONS`: `shift.open_close`, `cash.count`, `cash.drawer_no_sale`,
`cash.paid_out`, `refund.issue`. One row each, additive. **`cash.paid_out` also needs `05-F19`'s
threshold as a required explicit input** — see §7, following the founder's `01-F60` enabled-set
precedent that optional-means-skip is how silent omissions get in.

---

## 4. Identity: what a PIN session is and is not

- **Argon2id**, per `01-F26` and `18 §`. Same hashing story as July's owner-password ruling —
  one algorithm, one place, two consumers.
- **Offline-first and non-negotiable** (`01-F28`, `00 §5.1`): verification runs **on-device
  against synced credential hashes**. A branch with a dead WAN link must still unlock a till.
  Hashes and role assignments arrive as **reference data on the `01-F21` chain** — the same
  mechanism the catalog already rides (`sync-client/src/catalog.ts`), not a new transport.
- **Attribution is whoever's PIN is in** (`02-F41`) — no "acting for", ruled July 2026. The
  session sets `envelope.actor_user_id`; every event inherits it.
- **Idle auto-lock** is a device-layer setting (`01-F26`).
- **NOT in scope:** clock-in/attendance (`11-F1`, Wave 3), advances, scheduling. The ruling says
  nothing else from doc 11 and this plan holds that line.

### 4.1 The one hazard worth stating

A PIN is four digits on a shared terminal (`C1`, 20–60 unlocks a shift). It is a **convenience
credential, not a secret** — shoulder-surfing is the norm, not the exception, in a restaurant.
What makes it safe enough is that it is *paired with a registered device* (`01-F25`/`01-F47`): a
PIN alone, off-device, authorises nothing, because the device token is a separate factor the
attacker does not hold. This is why `01-F27` says device tokens carry **device identity only** —
the two halves are deliberately different axes, and collapsing them would turn a shoulder-surfed
PIN into a remote credential. Rate-limiting PIN attempts per device is therefore required, and
is the one piece of hardening this plan asks for beyond the FRs.

---

## 5. Tasks

| # | Task | Package | Tests by |
|---|---|---|---|
| **S-0a** | Appendix A as data + `can(user, action, scope)` returning the three-valued `Decision`; `reportScope()`; the four roles and thirteen actions of §3 | `domain` ⚠ | separate session |
| **S-0b** | Argon2id PIN hash/verify; offline verify against synced hashes; the staff registry as `01-F21` reference data; idle auto-lock; per-device attempt rate limiting | `domain` ⚠, `sync-client` ⚠ | separate session |
| **S-0c** | `actor_user_id` stops being hardcoded `null` (`pos-electron/src/main/index.ts:200`); the C1 unlock screen; the lock surface the screen map has no home for | `pos-electron` | separate session |

---

## 6. What must be true when this is done

1. A cashier unlocks with a PIN **with the WAN cable pulled** and every event she then emits
   carries her `actor_user_id` (`01-F28`, `02-F41`).
2. `can(cashier, "day.open_close", branch)` is `deny`; `can(cashier, "void.after_kot", branch)` is
   `escalate`; `can(manager, …)` is `allow` for both (`02-F22`, `02-F20`).
3. No inline role check exists anywhere in app code — `18 §`'s ban is enforced by a lint/arch rule,
   not by review alone (`24-F14`: a rule matching zero files must fail, so the rail cannot be
   silently disabled by a rename).
4. A wrong PIN is rate-limited per device and the failure is an `audit.login` event (`01-F5`).
5. `pnpm test --force --continue` green; `pnpm verify` exit 0.

---

## 7. Recorded, not guessed

- **Per-user overrides exist in `01-F26` and are unbuilt.** Narrow reading (§3). The first real
  override request widens the matrix additively.
- **`05-F19`'s paid-out threshold is a config value and `00 §7`'s config plane does not exist.**
  Same shape as `01-F60`'s enabled set before July's ruling. Following that precedent, the
  threshold is a **required explicit input** to the paid-out path rather than an optional one
  defaulting to "never escalate" — optional-means-skip is how the silent omission gets in.
- **`restaurant-os.md` Appendix A is the seed, and a seed is not a spec.** If the matrix and an
  FR disagree, the FR wins (`00` authority order) and the drift gets flagged.
