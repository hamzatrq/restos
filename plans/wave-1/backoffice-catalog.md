# Back office — the catalog editor and the publish path

**Planning artefact, July 2026.** Owning spec: `specs/14-backoffice.md` (`14-F1`..`14-F8`,
`14-F28`, **`14-F29`**). Also binding: `18 §5` (server-side authz), `18 §6` (the two-plane law),
`18 §7` (web UI rules), `01-F52`..`01-F56` + **`01-F60`** (the catalog and its prices),
`03-F50` (station), `00 §7` (config layers), `01-F26` (the permission matrix).

**Status: DRAFT — needs founder approval.** Founder ruled this gets built *properly* rather than
as a seed script, in answer to "`publishCatalog` has no production caller".

---

## 1. Where we actually are

```
services/api/src/index.ts        2 lines   // "Scaffold stub"
apps/backoffice/src/index.ts     2 lines   // "Scaffold stub"
```

Both are scaffolds. Meanwhile the *server* half of the catalog is complete and tested:
`publishCatalog` validates at the writer, versions atomically, serialises per org, pages
snapshots in SQL, and the device fetches over the wire on a `hello_ack` version mismatch. The
round-2 findings named the gap precisely — *"`publishCatalog` and `notifyCatalogVersion` have no
production caller"* — and every menu that has ever reached a device was seeded by hand.

**So this is not a greenfield module. It is the missing caller of a finished mechanism**, plus
the editing surface `14-F29` specifies.

## 2. Scope — and what it deliberately excludes

Doc 14 is a large document (28 FRs across catalog, recipes, users, devices, printers, tax,
onboarding). **This plan builds one path**: edit a menu → price it → publish it → a till sells
from it.

**In:** catalog CRUD over the `01-F21` chain (`14-F5`), the `14-F29` price grid, `03-F50`'s
station field, archive-not-delete (`14-F7`), change history in place (`14-F3`), and `14-F28`'s
publish timing.

**Out, and each for a stated reason:**

| Excluded | Why |
|---|---|
| Recipes (`14-F9`/`14-F10`) | Doc 10 inventory is Wave 3; a recipe editor with no deduction consuming it is a form that writes to nothing |
| Bulk import (`15-F8`) | Platform-admin surface, and the onboarding path — not the owner's daily loop |
| Users/PINs, devices, printers (`14-F11`+) | Admission (`01-F47`) has not landed, so a device registry would have nothing to register |
| Tax posture (`14-F23`) | Doc 16, layer-1 gated |
| Go-live wizard (`14-F26`/`F27`) | Composes surfaces that do not exist yet |
| Images/S3 (`14-F5`) | `27-F6` puts tiles-with-labels on the counter and no image path exists on the device; adding storage for a field nothing renders is speculative |

## 3. Two dependencies that are not built, and one that is subtler

### 3.1 The permission matrix does not exist

**Commandment 8:** *"Server-side authorization always via the `domain` permission matrix; client
role claims are never trusted."* `14-F1` role-gates the whole app, and Appendix A's seed says
menu editing is **Owner, optionally Branch Manager** — not cashier, not storekeeper.

`packages/domain/src/` has `audit`, `business-day`, `canonical`, `device-classes`, `envelope`,
`ids`, `invariants`, `money`, `payload-hash`, `product-constants`, `registry`, `states` — **and
no permission module.** `01-F26` names `restaurant-os.md` Appendix A as the seed and nothing has
consumed it.

So the commandment every session reads names a module that has never been written. It has not
bitten yet because **no cloud-plane app exists** — the POS authorises nothing (it is one
till, one actor, `02-F41`), and the gateway authorises *devices* (`01-F47`), not *users*.

**This app is the first thing that needs it**, and it needs the real one: a back office that
role-gates in the client only is precisely what Commandment 8 forbids. `domain` is a protected
path, so this is a separate-session test split of its own.

### 3.2 `14-F28`'s day-end withholding has no home

`14-F28` (founder ruling): a menu edit's application time is the owner's choice, **default
day-end**, with an explicit apply-now. `27-F4` is why — a grid that moves under a cashier
mid-shift is a breaking change.

The catalog transport already ruled where this lives, and built *around* it deliberately:

> *"`14-F28`'s day-end timing resolves ABOVE this function, not in it: a pending edit lives in
> the API… That is why devices only ever see landed versions and need no pending-version
> concept — the alternative (ship an `effective_at` and let each device apply it) would need a
> device-side scheduler, a second version axis, a clock read on the application path, and would
> apply an edit the owner had since cancelled."*

So the gateway is finished and correct, and **the pending-edit store it delegates to does not
exist.** It belongs here: `services/api` holds staged edits and calls `publishCatalog` at the
05:00 Asia/Karachi boundary (`01-F46`), or immediately on apply-now.

That implies a scheduled job. `services/jobs` is also a 2-line stub.

### 3.3 The subtle one: this app writes to TWO stores, and only one is the ledger

`14-F6` says price edits **emit `catalog.changed`**, and `01-F52` says the catalog is **reference
data, not ledger**. Both are true and they are not in tension — but the shape has to be right:

- The **catalog artifact** goes to `publishCatalog` (versioned reference data, what devices fetch).
- The **audit record** goes to the ledger as `catalog.changed` (who changed what, `14-F3`'s
  history, `14-F6`'s price history), carrying before/after **refs** and never entity bodies.

`catalog.changed` is already in the registry (`6cb7a34`) and already carries `entity`,
`entity_id`, `version`, `before_ref`, `after_ref`. **What it lacks is an `actor`** — the
round-2 findings named this (*"`catalog.changed` has no `actor`, contradicting `14 §16` and its
own comment"*) and it was not closed, because nothing emitted the event. This app is what makes
it matter: `14-F3`'s history is *"price changed by Ali, 2 Jul, 450 → 480"*, and without an actor
it renders "price changed by ???".

## 4. The design

### 4.1 Cloud plane, and the discipline is absolute

`18 §6`: TanStack Query v5 + tRPC only; **server state is never copied into a client store**; no
`sync-client` anywhere near this app. The POS is the other plane and shares nothing but `domain`
types.

This matters more than usual here because the two planes disagree about what the catalog *is*:
to the POS it is a local read-only cache resolved by id; to this app it is an editable
server-owned aggregate. Mixing them would put a device's stale snapshot behind an editor.

```
apps/backoffice (Next.js, App Router)
  └─ tRPC client + TanStack Query
       └─ services/api (Fastify + tRPC)
            ├─ authz: domain permission matrix (§3.1)      ← server side, always
            ├─ staged edits + day-end scheduler (§3.2)
            ├─ publishCatalog(...)      → versioned artifact devices fetch
            └─ append catalog.changed   → ledger audit trail (14-F3)
```

### 4.2 The price grid is the screen that matters

`14-F29`: a row per branch, a column per enabled channel, **prefilled from one number** with a
fill-across action, overrides typed on top. A five-branch org faces 25 cells per item, of which
most are equal — so the fill-across is not a convenience, it is what makes the honest schema
usable. Without it owners route around the editor, and routing around it is what a house-price
fallback would have institutionalised.

Server-side, saving refuses an item that leaves an enabled `(branch, channel)` pair unpriced —
the same rule `publishCatalog` enforces (`01-F60`), stated in both places because a bulk import
never opens this editor.

### 4.3 Tokens, not components

`18 §7`: web consumes **`packages/ui`'s token export**, not its RN components. shadcn/ui +
Tailwind v4 + `lucide-react`. This is an internal tool for a literate owner on a desktop — the
`27` low-literacy laws govern the *counter*, not this surface, and applying 76 dp tiles to a
menu editor would be a category error.

## 5. What has to be built

| # | Task | Paths | Test author |
|---|---|---|---|
| **B-1** | Permission matrix in `domain` from Appendix A; `catalog.changed` gains `actor` | `domain` ⚠ | **separate session** |
| **B-2** | `services/api`: Fastify + tRPC host, authz middleware, org-scoped context | `api` | **separate session** |
| **B-3** | Catalog read/write router + staged-edit store; `14-F7` archive-not-delete | `api` | **separate session** |
| **B-4** | Publish path: day-end scheduler + apply-now → `publishCatalog` + `catalog.changed` | `api`, `jobs` | **separate session** |
| **B-5** | `apps/backoffice` shell: Next.js, tRPC client, auth | `backoffice` | same session |
| **B-6** | The catalog editor + `14-F29` price grid + `03-F50` station | `backoffice` | same session |
| **B-7** | `14-F3` change history in place | `backoffice` | same session |

⚠ = protected path. **B-1 blocks everything**, and it is the one that needs a spec answer first
(§6).

## 6. What must be true when this is done

1. A menu edited here reaches a real till, over the wire, with no hand-seeding anywhere in the
   path — the round-2 gap closed end to end.
2. **Authorisation is server-side.** A cashier's token cannot edit a menu, asserted against the
   *API*, not the UI. A test that only checks a hidden button is the defect Commandment 8 names.
3. Saving refuses an item that leaves an enabled `(branch, channel)` pair unpriced, and says
   which — the same rule as `publishCatalog`, verified at both ends.
4. **A day-end edit is invisible to a device until the 05:00 boundary**, and an apply-now edit
   lands immediately. Asserted by fetching from a device session before and after — never by
   inspecting the staging table, since the whole point is what the device sees.
5. A staged edit that is **cancelled before the boundary never publishes** — the case the
   transport plan cites as the reason not to ship `effective_at` to devices.
6. `catalog.changed` carries an actor, and `14-F3` renders "price changed by Ali, 2 Jul,
   450 → 480" from the ledger rather than from the catalog.
7. Archiving hides an item from the grid and **keeps it resolvable** (`14-F7`, `01-F55`) — a
   reprint of an order placed before the archive still names it.
8. No `sync-client` import exists anywhere in `apps/backoffice` or `services/api` — the
   two-plane law, enforced structurally rather than by review.

## 7. Questions this plan cannot answer

**Q1 (BLOCKING B-1) — how much of the permission matrix ships now?** Appendix A is a seed table
of ~15 actions × 4 roles, and `01-F26` adds per-user overrides and per-location assignment. The
minimum this app needs is one predicate: *may this user edit the catalog for this org?* Building
the full matrix now means building a model for actions nothing performs yet; building the one
predicate means the second consumer widens it. **My inclination is the narrow one** — Appendix A
encoded as data, with exactly the predicates the callers need — but it is a `domain` change on a
protected path, so it should be ruled rather than assumed.

**Q2 — how does an owner authenticate? — RULED (founder, July 2026): email + password, our own
implementation.** `01-F47` admission covers *devices*; there was no user auth anywhere in the
corpus, and `18 §5` specifies authorisation while staying silent on authentication.

**Argon2id**, which is not a new choice — `01-F26` already specifies it for staff PINs on shared
devices, so the hashing story stays single. Sessions live in `services/api`.

What this ruling BUYS is one fewer vendor in the login path of a system holding a restaurant's
money. What it COSTS is that password reset, lockout, rate limiting and session rotation are ours
to get right, and each is a way in. They are named here so they are scoped as work rather than
discovered as gaps:

- reset flow (and the fact that a reset email is an account-takeover path if it is sloppy),
- lockout and rate limiting on the login endpoint,
- session expiry/rotation, and revocation when a user is removed,
- `audit.login` already exists in `01-F5`'s five audit subtypes — user login is an audit event
  from day one, not an afterthought.

**The POS is untouched.** `02-F41` rules attribution there is whoever's PIN is in, and this is a
cloud-plane surface (`18 §6`) that always has WAN — so nothing about this reaches the till or
`00 §5.1`'s offline law.

**Still open under this ruling:** whether a user belongs to one org or many (a vendor-onboarding
team member legitimately touches several), and whether email is the identifier at all for an
owner who has one shared phone and no email — `07`'s WhatsApp channel exists and `01-F23` keys
customers by phone, so the precedent for phone-as-identity is in the corpus already.

**Q3 — is the staged edit itself an event?** `14-F28` makes pending edits *"visible and
cancellable until they land"*. If staging is ledger state it inherits durability and audit for
free but adds event types not in `01 §4`; if it is API-owned table state it is simpler and its
history is invisible to the ledger until publish. The transport plan says only that it "lives in
the API", which does not settle which.
