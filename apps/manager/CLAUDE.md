# @restos/manager

**Owning spec: `specs/05-manager-console.md` — read it before modifying anything here
(AGENTS.md routing). Read `05-F29` FIRST; it decides what this package is.**

- Manager's own phone. Expo RN, Android + iOS. Full branch slice, never hub-eligible (`01-F39`).
- **The platform question is CLOSED.** `05-F29` ruled resolution (a): this app is the manager
  surface, because only a device holding a `01-F26` PIN session can author `approval.granted`
  with the approver on the envelope (`02-F41`). A cloud-plane web console cannot legally emit
  **any** event this module owns — `05-F28` has the measurement, and it stands.
- **⚠ THE SCREEN IS NO LONGER ONLY A PROBE (August 2026). It holds a REAL branch slice.**
  `18 §4`'s storage adapter landed (`packages/sync-client/src/storage.ts` + `rn.ts`), so this app
  opens a real device store on `@op-engineering/op-sqlite`, fills it over the cloud path
  (`05-F29`), and draws `05-F1`/`05-F3`'s alarms off the real fold — order, channel, table, age,
  printer. `src/branch.ts` is the composition root; `src/home.ts` stays import-pure so its model is
  still testable under Node. The probes are still on the screen below the alarms; they measure a
  runtime, not a product surface.
  **Measured: `pnpm -C apps/manager bundle:check` → 699 modules, 2.6 MB Hermes bytecode, exit 0.**
- **⚠ WHAT IS STILL SEEDED — read `src/branch.ts`'s header before calling this finished.** Identity
  and the device credential come from `EXPO_PUBLIC_*`, i.e. from the BUILD: `01-F25`'s pairing
  screen does not exist and `provision-device` needs shell access on the gateway host, which a
  phone has not. `18 §8` wants `expo-secure-store` for the token; adding it before there is any way
  to FILL it would be a correct subsystem with no seam. And there is **no PIN session** here, so
  this device reads the branch and can author nothing — `05-F30`'s ack still has no producer.
- **`05-F1`/`05-F3`/`05-F4`'s alarm DERIVATION landed August 2026 (`src/alarms.ts`), with
  `05-F22`/`05-F23`'s home model (`src/home.ts`) and 46 acceptance tests.** Both are pure; the
  bundle is **682** modules / 2.49 MB of Hermes bytecode — **re-measured 2026-08-12 after
  `alarms.ts` gained a VALUE import of `@restos/domain` (`ALARM_ACK_KINDS`), and it did not move**,
  because `probe.ts` already pulls that package. **What is on the screen is one row: the honesty
  line.** The alarm CARDS are owed — see blocker 2 below — and they would be unreachable code today
  anyway, because `managerHomeNow()` cannot return `known: true` while no plane carries a branch
  queue.
- **`05-F2`'s acknowledgment is EXPRESSIBLE as of August 2026, and this app CONSUMES it.** ⚠ This
  bullet read *"not merely unbuilt, it is UNEMITTABLE: `01-F5` closes the `audit.*` family at six
  subtypes and none is an alarm ack, so `01-F4` refuses the emit"* — true when written, and it was
  the right call not to guess. `05-F30` ruled the **seventh** subtype, `audit.alarm_acknowledged`,
  and `packages/domain` now carries its schema, so **the alarms this app raises are no longer
  permanent**: an ack in the stream clears its alarm, matched on `05-F30`'s three facts
  (`alarm_kind`, `order_id`, `printer_name`) and never on a composed alarm id.
  **The PRODUCER is owed and is the storage port below, not a missing screen.** `05-F29` requires
  the manager DEVICE to append it (`01-F62` names `audit.*` as its worked example of a
  branch-scoped type, so no server may mint one), and `openStore` still binds `better-sqlite3`.
  So the seam exists and the writer does not — which is the honest asymmetry, not a stub.
- **`05-F3`'s second trigger is HALF built.** `printer.status_changed` gained a payload (`03-F54`)
  and a real producer on the till, and it was driven end to end on 2026-08-12: two orders sent to a
  dead printer produced **two `kot.print_failed` and exactly ONE `printer.status_changed(offline)`**
  in a real device ledger. What the console does with it is a **founder call** `05-F30` records and
  `alarms.ts` deliberately does not guess — that alarm has no order to name and only one exit.

## ⚠ Do not build the console yet, and do not build it against a stub

⚠ **BLOCKER 1 IS CLOSED (August 2026) AND IS KEPT HERE AS THE WORKED EXAMPLE, struck rather than
deleted.** It read: *"`packages/sync-client` cannot open a store on this platform … `05-N5`
requires the approval queue to survive app kill/restart … there is nothing to re-derive from, so
the queue cannot be built correctly here today at all."* True when written, and the right call not
to fake it. `18 §4`'s adapter closed it: this app opens a real store, and `05-N5`'s re-derivation
is asserted over a real file that is closed and reopened. **Blocker 2 stands.**

1. ~~`packages/sync-client` cannot open a store on this platform.~~ **CLOSED.** The port is
   `packages/sync-client/src/storage.ts`; the RN driver is `storage-op-sqlite.ts`; the door is
   `@restos/sync-client/rn`. ⚠ **op-sqlite is a TurboModule, so this app needs a custom dev client
   / EAS build from now on — Expo Go cannot run it.** That is a constraint on the developer LOOP,
   not on the shipped app (`18 §1`/`§8` put every Expo app on dev clients + EAS anyway), and
   `18 §14` already allowlists the package. If *"pure-JS installable"* was ever meant to mean
   *"runs in Expo Go"*, that reading and `18 §4`'s *"RN: `@op-engineering/op-sqlite`"* cannot both
   stand — a founder call, reported rather than worked around.
2. **`packages/ui` ships no RN components.** `18 §2` specifies it as an "RN component kit +
   design tokens (web consumes tokens only)" and **the repo built the inverse** — all 18
   exported components render React DOM (`packages/ui/src/components/*.tsx`). `21-F2` bans raw
   `react-native` primitives in app code, "allowed only inside `packages/ui`", so there is no
   `21-F2`-compliant way to draw a product surface here. `src/App.tsx` breaches that rule
   deliberately, in one file, with the reason in its header — because a diagnostic is not a
   feature screen and the alternative was to prove nothing.

Also still true and worth re-reading before designing anything: **there is no portrait layout
anywhere in this product.** `packages/ui`'s `surfaceModeFor` resolves `27 §1a`'s 6.5″ phone
(69 × 150 mm) to `compact`, which is the *counter's* small-glass arrangement — its tab rail
turns vertical, which does not fit 69 mm of width. `apps/pos-electron`'s layout gate keeps
`phone-6.5` out for the same reason. Whoever builds this module builds the first genuinely
portrait surface, and `27-F11b` (~12 comfortable tiles) is the sizing input.

## The storage port: BUILT (August 2026). This section is the brief it was built from.

⚠ **It is kept because the measurement below is what made the work small, and because the count
is worth re-taking if the port ever grows.** What it asked for exists:
`packages/sync-client/src/storage.ts` is the port, `storage-node.ts` and `storage-op-sqlite.ts`
are the two drivers, `store.ts` keeps the `{ path }` arm every existing caller passes, and
`@restos/sync-client/rn` is the door this app uses. **One thing it got wrong and is corrected
here rather than silently: it proposed promoting `catalog.ts`/`staff.ts`/`pin-attempts.ts`'
private `Db` type. Those three were left alone** — they still take `db as never` — because
widening their `unknown`-valued statement types to the port's `SqlValue` tuples would have
touched three files for no behaviour, which `24 §3b` calls a drive-by.

The surface an adapter must cover, measured 2026-08-11 and unchanged:

- `new Database(path, options)` — one construction
- `db.pragma(...)` ×3 — `journal_mode = WAL`, `synchronous = FULL`, `foreign_keys = ON`
- `db.exec(SCHEMA)` ×1
- `db.prepare<Params, Row>(sql)` ×40, driving `.run()` ×26, `.get()` ×21, `.all()` ×10
- `db.transaction(fn)` ×7 — **synchronous** transactions; `01-F2`/`00 §5.2` require the write
  durable *before* the UI acks, so an async-only driver changes the durability contract, not
  just the syntax
- `db.close()` ×1

**A port shape already exists and is already proven — it is just private and triplicated.**
`catalog.ts:153`, `staff.ts` and `pin-attempts.ts` each declare a **byte-identical** local
structural type:

```ts
type Db = {
  prepare(sql: string): {
    run(...a: unknown[]): unknown;
    get(...a: unknown[]): unknown;
    all(...a: unknown[]): unknown[];
  };
  transaction<T extends (...a: never[]) => unknown>(fn: T): T;
};
```

Three sub-stores already run against that abstraction; `device-store.ts` passes them
`db as never` rather than using it. `@op-engineering/op-sqlite` is already on `18 §14`'s
allowlist and offers a synchronous API, but it does **not** offer better-sqlite3's
prepared-statement object model or `.transaction()`, so the adapter is a real (small) shim.

**What that shim actually cost, now that it exists:** op-sqlite has exactly ONE synchronous
primitive, `executeSync` — its `transaction()` and `prepareStatement().execute()` both return
Promises — so `BEGIN`/`SAVEPOINT`/`RELEASE`/`ROLLBACK TO` are hand-rolled, and so is a SQL-script
splitter, because op-sqlite compiles one statement per call while the device schema is one string
with `--` comments and a semicolon inside a string literal. Statements are also not really
*prepared* on RN: a performance property, not a correctness one, and recorded rather than hidden.

⚠ **`packages/sync-client` is a protected path (commandment 10). That change needs senior
review and it is a `24 §3` task with its own acceptance tests, not a drive-by from this app.**

## Measured facts about this toolchain (2026-08-11) — do not re-derive these the hard way

- **TypeScript 7.0.2 breaks the Expo CLI, and this app therefore pins `typescript@5.9.3` in
  its own devDependencies while the rest of the repo stays on 7.0.2.** TS7 is the Go port;
  `ts.sys`, `ts.readConfigFile` and `ts.parseJsonConfigFileContent` are all `undefined`.
  `@expo/cli` calls all three to read the project tsconfig, so every expo command dies with
  `TypeError: Cannot read properties of undefined (reading 'getCurrentDirectory')`.
  **Deleting `tsconfig.json` does not avoid it** — `expo start` auto-generates one when it
  sees `.ts` sources and then crashes reading the file it just wrote, so the app could be
  bundled (`expo export` skips that step) but never RUN. `@expo/cli` resolves TypeScript from
  the project directory, so the local 5.x is what makes the toolchain work at all.
  ⚠ **This wants ratifying.** `typescript` is already on `18 §14`'s allowlist so no new
  package is added, but two compiler versions in one repo is a `18 §15` governance call, and
  the app is typechecked by 5.9.3 rather than by the version everything else uses.
- **This app cannot share the root `tsconfig.json` program.** RN's ambient `setTimeout`
  returns `number`; `@types/node`'s returns a `Timeout` object. One `tsc` program has one
  global scope, so pulling RN in re-typed `setTimeout` everywhere and broke two unrelated
  files (`services/api/src/server.ts:337`, `services/sync-gateway/src/server.ts:61`, both
  `.unref()`). Root tsconfig now excludes `apps/manager`; **root `pnpm typecheck` runs both
  programs** so this app cannot go silently unchecked.
- **Metro needs the `.js` → `.ts` fallback in `metro.config.js`.** The kernel packages import
  each other as `"./folds/customer-file.js"` naming `customer-file.ts` — correct TypeScript,
  unresolvable by Metro. The resolver tries the original specifier first.
- **`@restos/sync-client/rn` reaches RN and the native addon does not** — re-measured 2026-08-13
  after the storage adapter landed: `pnpm -C apps/manager bundle:check` → `Android Bundled …
  (699 modules)`, **2.6 MB** of Hermes bytecode, exit 0. That is the whole kernel now — the device
  store, the merge fold, the cloud session, the op-sqlite driver and the RN WebSocket transport —
  not just the pure fold subpath the line below was written about. **The 19 extra modules are the
  measurement worth keeping**: `18 §4`'s second engine cost this bundle almost nothing, because
  everything downstream of the one native import was already portable.
  ⚠ **`bundle:check` is a REAL gate and it bites**: pointing `transport-rn.ts` at
  `@restos/sync-protocol`'s root instead of its `/messages` subpath fails it outright with
  *"Unable to resolve module node:zlib"*. A `node:` import anywhere in the graph is a hard error,
  which is why this command is the cheapest RN-safety proof available here.
- **`@restos/sync-client/fold-engine` reaches RN and the native addon does not** (2026-08-11, the
  earlier measurement, kept because its METHOD note below is the reusable part).
  `pnpm -C apps/manager bundle:check` → `Android Bundled … (680 modules)`, `2.48 MB` of
  **Hermes bytecode**, exit 0. In the readable dev bundle served by `expo start`,
  `require("better-sqlite3")` / `from "better-sqlite3"` occur **0 times** while
  `emptyShiftCash` (7), `verifyPin` (11) and `argon2id` (16) are all present; the five plain
  text occurrences of the string are comments plus one runtime message. `26 §8`'s pure subpath
  does on RN exactly what it was built to do for the cloud Auditor.
  ⚠ **Measure this on the DEV bundle, not the `.hbc`.** Grepping Hermes bytecode is not
  evidence: `grep -c` counts *lines* in a near-newline-free binary, and `strings -n 6` recovers
  only 387 strings from 2.48 MB because Hermes packs its string table. Both under-report, and
  both under-report in the *reassuring* direction — a first pass here "confirmed" 0 occurrences
  of strings that are provably in the bundle.
- **`verifyPin` needs no `crypto.getRandomValues`; `hashPin` does.** `@noble/hashes`'
  `randomBytes` throws without it and Hermes does not provide it — but `verifyPin` reads its
  salt out of the stored PHC string, and `01-F28` syncs hashes *to* devices. **Enrolment does
  not happen here**, so this gap does not block `05-F29`. If an FR ever puts enrolment on this
  device, `expo-crypto` is an official `expo-*` module and already inside `18 §14`.
- **`21-F2`'s Biome `noRestrictedImports` rail does not exist.** `noRestrictedImports` appears
  in no config in this repo. The rule is unenforced — `27-F44`'s shape exactly.

## ⚠ THE OPEN QUESTION THAT DECIDES WHETHER `05-F29` IS DELIVERABLE AS SPECIFIED

**Argon2id is pure JS on the device path, and Hermes has no JIT.** `packages/domain` uses
`@noble/hashes`' `argon2id` deliberately (a node-gyp addon "would break every browser workspace
that imports `domain`"), at `01-F61`'s floor of m=19456 KiB, t=2, p=1. Measured on this repo's
x86 development machine **with** a JIT: **~460 ms to verify one PIN.**

`05-N1` budgets the machine portion of the whole approval round trip — request emitted → POS
unblocked — at **≤ 2 s p95**, and the verify is one term inside it, alongside the append and
the cloud hop. A 4× interpreter penalty on `00 §4`'s 2–3 GB Android reference device spends
the entire budget on the hash alone.

Nobody has run it on a phone. **That is what `src/probe.ts` exists to find out, and it is the
first thing to do with a device.** If it lands over budget the resolution is a spec question,
not a code one: `01-F61` fixes the cost floor precisely so it cannot be quietly lowered to make
a screen feel fast, and lowering it is a kernel change to a credential (commandment 10).

## What HAS landed upstream (verified 2026-08-11 — the older "still missing" notes were stale)

- **`05-F7`'s three payload schemas exist** (`packages/domain/src/registry.ts`).
- **`approval.granted` carries two separately-required identities** (`approver_user_id` **and**
  `requester_user_id`) so `02-F41`'s property survives a plane with no session to move.
- **`approval.requested` HAS a producer now.** `apps/pos-electron/src/main/approval-record.ts`
  emits it (`:188`), wired from `main/index.ts`. The queue this module renders has a source.
- **All four escalatable writes have payload schemas** — `void.recorded`, `comp.recorded`,
  `discount.recorded`, `order.line_price_overridden` — so `01-F4` no longer makes them
  unemittable.
- **`createVerifiedAppend` is the seam this app will reuse** (`main/gateway.ts:753`): an append
  that takes the actor as an explicit argument instead of reading the live session, which is
  what lets a correctly-attributed grant be authored at all.

## Still owed, and not blocked by the above

- **The approval queue has no PROJECTION.** `packages/sync-client/src/folds/merge.ts:752`
  consumes `approval.requested / granted / denied` and is deliberately **projection-inert** —
  `26`'s ratified matrix declares no device projection for an approval, and `01-F36`'s
  "first response wins" needs a total order `01-F34` forbids inventing. `05 §5` says this
  device materialises the queue. **Writing that fold is a `26 §7` oracle-pinned decision and
  therefore a spec PR, not an implementation detail** — and it is the single largest piece of
  work between here and a working console.
- `01-F25`'s pairing: registration is "a one-time pairing via back office code", and the back
  office has no such screen (`14-F13`'s device list covers revocation, not issuance). The
  gateway's `provision-device` CLI needs shell access on the service host, which a manager's
  phone does not have. **A phone cannot currently be admitted without an operator running a
  command for it.**

## ⚠ THE COMPOSITION ROOT IS UNEXECUTABLE BY ANY TEST HERE, AND THREE MUTANTS LIVE IN THAT GAP

Measured by an adversarial mutation round, 2026-08-13, on the shipped code with nothing else
touched. `branch.ts` imports `@op-engineering/op-sqlite` at module scope, so **no test in this
repository can load it**, and therefore no test can CALL `attachBranchSlice()`. Everything about
that function is held by reading its source. Three mutants survive that:

| mutant | what a manager sees | kills |
|---|---|---|
| `connected: () => true` hardcoded | the console claims contact it does not have — `05-F23`'s *"never imply calm"* broken in the one direction that matters | **0 of 72** |
| `session.start()` deleted | a database that opens and is never fed: a permanently empty slice rendered as a calm kitchen | **1 of 72**, and that kill is a `/\.start\s*\(\s*\)/` regex over source, which a start through a variable would also fail |
| `App.tsx` renders no alarm rows | the alarms are derived correctly and never drawn | **0 of 72** |

The third is a different wall from the first two: `vitest.config.ts` explains why this package has
no renderer, and it is right. **Do not close any of these by weakening what they mean.** Two honest
routes exist and both are the implementer's call under `24 §3b`, not a drive-by: inject the store
opener into `attachBranchSlice` so a suite can supply a fake (this creates a Rule-B optional seam,
which is a cost, not a free win), or `vi.mock` the op-sqlite specifier — which **cannot be done
from this package today**, because `@op-engineering/op-sqlite` is a dependency of
`packages/sync-client` and does not resolve from `apps/manager` at all, so the mock cannot be keyed
against the id `rn.ts` resolves. A `resolve.alias` in this package's `vitest.config.ts` is the only
mechanism that works, and it would make the module loadable in *every* suite here.

**A related hazard, measured rather than assumed.** `@op-engineering/op-sqlite@17.2.0` does publish
a `"node"` export condition (`./node/dist/index.js`) and **it is backed by `better-sqlite3`** — the
same engine the Electron till uses, wearing the other engine's name. It cannot load today for two
independent reasons (its ESM build imports `./database` with no extension, and it declares no
`better-sqlite3` dependency, so pnpm gives it none). If either is ever fixed upstream or papered
over by hoisting, **a Node test could start passing against that shim and be quoted as evidence
about a phone.** It is not. `18 §12`'s Maestro rig is still the only thing that would be.

**`pnpm lint` cannot gate any of this either:** `biome check` exits 0 on warnings and this repo
already carries one, so deleting `App.tsx`'s `attachBranchSlice()` call while leaving the import
prints `noUnusedImports` and **still exits 0**. `pnpm seams:check` catches only the coarser version
(delete the import too → Rule A, `[no importer at all]`, exit 1).
