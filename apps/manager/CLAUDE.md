# @restos/manager

**Owning spec: `specs/05-manager-console.md` — read it before modifying anything here
(AGENTS.md routing). Read `05-F29` FIRST; it decides what this package is.**

- Manager's own phone. Expo RN, Android + iOS. Full branch slice, never hub-eligible (`01-F39`).
- **The platform question is CLOSED.** `05-F29` ruled resolution (a): this app is the manager
  surface, because only a device holding a `01-F26` PIN session can author `approval.granted`
  with the approver on the envelope (`02-F41`). A cloud-plane web console cannot legally emit
  **any** event this module owns — `05-F28` has the measurement, and it stands.
- **This app is a running Expo project with ONE screen, and that screen is a FEASIBILITY PROBE,
  not the console.** `pnpm -C apps/manager start` is real. What it renders is `src/probe.ts`'s
  measurements, for the reasons under "still blocked" below.
- **`05-F1`/`05-F3`/`05-F4`'s alarm DERIVATION landed August 2026 (`src/alarms.ts`), with
  `05-F22`/`05-F23`'s home model (`src/home.ts`) and 31 acceptance tests.** Both are pure; the
  bundle went 680 → **682** modules, i.e. exactly the two files, because every kernel import in
  them is `import type` and is erased. **What is on the screen is one row: the honesty line.** The
  alarm CARDS are owed — see blocker 2 below — and they would be unreachable code today anyway,
  because `managerHomeNow()` cannot return `known: true` while no plane carries a branch queue.
  **`05-F2`'s acknowledgment is not merely unbuilt, it is UNEMITTABLE:** `01-F5` closes the
  `audit.*` family at six subtypes (`packages/domain/src/registry.ts:797`) and none is an alarm
  ack, so `01-F4` refuses the emit. That is the same shape `audit.print_acknowledged` was in
  before it was added for `03-F5` — one FR over, still open, and a protected-path spec PR.

## ⚠ Do not build the console yet, and do not build it against a stub

Two things are missing, and neither is work this app can do inside its own directory. Building
a queue screen against hand-made data would be AGENTS.md's recurring defect shipped on purpose.

1. **`packages/sync-client` cannot open a store on this platform.** See the next section.
   `05-N5` requires the approval queue to "survive app kill/restart without loss — they are
   folds over the branch stream, re-derived on start (`01-F6`)". There is nothing to re-derive
   from, so the queue cannot be built correctly here today at all.
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

## The storage port: what is needed, and how much already exists

`openStore` (`packages/sync-client/src/device-store.ts:446`) takes a `path` and constructs
`new Database(path)` from **better-sqlite3** directly — a Node/Electron native addon that
cannot load under Hermes. It is the **only** production file in the package that imports it.
Everything downstream of that one import is portable, which is why the bundle proof below
works at all.

The surface an adapter must cover, measured 2026-08-11:

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
`db as never` rather than using it. So the work is not "invent a port", it is: promote that
type to one exported declaration, add `pragma` / `exec` / `close`, and let `openStore` accept
an injected `Db` instead of a `path`. `@op-engineering/op-sqlite` is already on `18 §14`'s
allowlist and offers a synchronous API, but it does **not** offer better-sqlite3's
prepared-statement object model or `.transaction()`, so the adapter is a real (small) shim.

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
- **`@restos/sync-client/fold-engine` reaches RN and the native addon does not.**
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
