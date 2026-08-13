# S-0a / S-0b / S-0c — acceptance test authorship brief (identity & authorization)

**For the test-authoring sessions only.** `24 §3` step 2: written by a **different session from
the implementer**, from **spec text only**, committed **red** before implementation begins.

`packages/domain` and `packages/sync-client` are **protected paths** (`20 §4.4`). S-0b is auth,
which is separately protected under Commandment 10.

## Read these, and nothing else

- `specs/01-kernel-sync.md` — **`01-F26`** (User × Role × location; PIN Argon2id; idle auto-lock;
  *"the permission matrix from `restaurant-os.md` Appendix A is the seed; roles are permission
  sets, not apps"*), **`01-F27`** (server-side authz; device tokens carry device identity ONLY),
  **`01-F28`** (offline PIN verify against synced credential hashes; roles propagate as reference
  data), `01-F5` (audit subtypes — `audit.login` already exists), `01-F21` (the reference-data
  chain), `01-F25`/`01-F47` (device registration and tokens — the *other* factor).
- `restaurant-os.md` **Appendix A** — the seed matrix itself. Read the cells literally.
- `specs/02-pos-app.md` — `02-F20` (manager escalation, two equivalent paths, first response
  wins), `02-F21`, `02-F22` (the role guard), `02-F23` (own-shifts-only), `02-F38` (a requester
  never sees approve for their own request), `02-F41` (attribution is whoever's PIN is in).
- `specs/18-engineering-handbook.md` — the `Auth` and `Backend` bullets. They pin `argon2`,
  `jose`, and **`can(user, action, scope)` as a single helper with inline role checks BANNED**.
- `specs/00-platform-overview.md §5.1` (offline law) and `§5.6`.

## ⚠ Do NOT read

- **`plans/wave-1/identity-and-authorization.md`.** It is the implementation design — the
  `Decision` shape, the action list, the task split. A test author who reads it writes same-mind
  tests wearing the costume of independent ones: the evidentiary basis (independently authored
  tests catch 25% of faults vs 14%) evaporates while the process still reports as followed.
- **`plans/wave-1/service-surface.md`** and `AGENTS.md`'s owed list — both carry a session's
  analysis rather than the contract.
- Any implementation of these FRs. **None exists** — there is no PIN session, no staff registry,
  and no permission matrix anywhere in the repo. If you find one, stop and report it.

**The FRs are sufficient. If they are not, that is a defect in the FRs and you should say so
rather than go looking.**

## The three tasks

Take **one per session**.

| Task | FRs | What it is |
|---|---|---|
| **S-0a** | `01-F26`, `02-F20`, `02-F22`, `02-F23`, `02-F38`, Appendix A, `18 §` | The permission matrix as data + the `can()` helper + report scoping |
| **S-0b** | `01-F26`, `01-F27`, `01-F28`, `01-F21`, `01-F5` | PIN hashing/verification, offline, the staff registry as reference data, idle auto-lock |
| **S-0c** | `02-F41`, `01-F28` | The unlock surface and `actor_user_id` reaching the envelope |

## The traps — each is a test

**1. THE MATRIX CELLS HOLD THREE VALUES, NOT TWO. This is the highest-value test here.**
Read Appendix A literally. *Void after KOT printed* under Cashier does not say `—`; it says
**`needs Mgr PIN`**. So does *Comp item*, *Discount > X%*. A helper that answers **boolean**
collapses `needs Mgr PIN` into either "allowed" (a cashier voids unsupervised — a leakage vector)
or "refused" (`02-F20`'s escalation path becomes unreachable and the feature cannot exist).

Assert all three outcomes distinctly. The strongest form of this test asserts that a cashier
voiding after KOT is **neither** simply allowed **nor** simply refused — because that is the
assertion a boolean implementation cannot satisfy no matter how it is written.

**2. `02-F38` must be refused SERVER-SIDE, not merely hidden.** The FR is explicit: the control
is absent from the requester's screen **and** refused by the matrix — *"a client that renders it
anyway must still fail"*. A test that only asserts the button is missing tests the weaker half.
Assert the authorization call itself refuses a requester approving their own request.

**3. Offline is the whole point of `01-F28`.** A test that verifies a PIN with a live cloud
session proves nothing about the FR. The assertion that matters: verification succeeds **with no
network available at all**, against synced hashes already on the device. If your test can pass
while a network call happens, it is not testing `01-F28`.

**4. `01-F27` says device tokens carry device identity ONLY.** Assert that a device token alone
authorises no *user* action, and that a user identity alone (no registered device) authorises
nothing either. These are two different axes on purpose; a test that conflates them would bless
an implementation where a shoulder-surfed 4-digit PIN becomes a remote credential.

**5. A raw PIN must never be stored, logged, or appear in an event payload.** `01-F1` makes the
ledger permanent — a PIN written into an event cannot be redacted later. Assert the stored form
is an Argon2id hash and assert the PIN string appears nowhere in what gets appended.

**6. `audit.login` already exists in `01-F5`'s subtypes.** Login is an audit event from day one —
successes and failures both. Do not invent a new event type for it (Commandment 2).

**7. Attribution (`02-F41`).** Whoever's PIN is in is the actor; there is no "acting for". Assert
the emitted envelope's `actor_user_id` is the unlocked user — and note that it is currently
hardcoded `null` at `apps/pos-electron/src/main/index.ts:200`, so a test asserting a real value is
legitimately red today.

## The bar

Read `plans/wave-1/oracle-round-2-findings.md §C` before starting. Its three test-authorship
patterns each recurred *inside the work that was fixing them*: assertions reducing to
`expect(0 < 3).toBe(true)`; an assertion wrapped in an `if` so a regression ran zero expectations;
a file header claiming coverage the file did not contain.

For this task specifically:

- **A negative test must be able to fail.** Assert what a refusal NAMES — the action, the role —
  not merely that something threw or returned false.
- **Do not assert the matrix against itself.** Pin Appendix A's cells literally, from the
  appendix. `expect(MATRIX.cashier).toEqual(MATRIX.cashier)` is the shape to avoid.
- **No timing-dependent PIN tests.** Argon2id is deliberately slow; assert behaviour, not duration.
- **Security tests must be able to fail.** "The hash is not the PIN" is trivially true of any
  string transformation — assert the *verification* round-trips and that a wrong PIN is rejected.

## When you are done

Commit **red**, with the failing run captured. Run `pnpm test --force --continue` from the repo
root — `--force` because a cached turbo run has produced a false green here, `--continue` because
turbo kills a failing task's siblings.

Name anything the FRs left genuinely ambiguous. Filling a gap with a plausible assumption is how
a test ends up written to pass.
