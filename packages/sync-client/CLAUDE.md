# @restos/sync-client

**Owning spec: `specs/01-kernel-sync.md` — read it before modifying anything here (AGENTS.md routing).**

- PROTECTED PATH. Device sync engine: outbox (the canonical durable-queue core, 18 §4), folds, LAN mesh, hub election.
- Folds are pure, commutative, idempotent (01-F34) — property tests mandatory (20 §2.3).
- **IMPLEMENTED (Wave 0).** See `README.md` for the module map (device store, merge fold engine, LAN mesh/hub, cloud session). PROTECTED path — senior review on every change.

## `18 §4`'s storage adapter — TWO engines behind ONE port (August 2026)

**`18 §4` names two engines and one adapter; the implementation named one.** `device-store.ts:33`
did `import Database from "better-sqlite3"` at module scope, so *importing this package at all* was
fatal under Hermes and `18 §4`'s RN half was unreachable. The store now binds a TYPE.

| module | what it is |
|---|---|
| `storage.ts` | the port: `prepare` / `exec` / `pragma` / `transaction` / `close`, and nothing more |
| `storage-node.ts` | **the one place `better-sqlite3` is constructed** (asserted, not conventional) |
| `storage-op-sqlite.ts` | the RN driver — imports NOTHING native, so the whole contract runs in Node |
| `store.ts` | `openStore`, keeping the `{ path }` arm all 129 existing call sites pass |
| `rn.ts` | **the only import of `@op-engineering/op-sqlite` in the repo** (`18 §8`) |
| `transport-rn.ts` | a `CloudTransport` over the platform WebSocket, for a phone |

**Three properties are CORRECTNESS, not style, and a second driver is where they break.**
(1) everything SYNCHRONOUS — `01-F2`/`00 §5.2` want durability before the UI acks, and op-sqlite
offers exactly ONE synchronous primitive (`executeSync`), so `BEGIN`/`SAVEPOINT`/`RELEASE`/
`ROLLBACK TO` and the schema-script splitter are hand-rolled there. (2) `transaction` nests as a
SAVEPOINT — `26 §6.4`'s per-item page isolation. (3) `get()` returns `undefined`, never `null`.

**⚠ The mutant to re-run after any change here is the SEAM, not the logic.** Measured 2026-08-13:
deleting `nativeBinding:` from `store.ts` — which puts the Node-ABI addon in front of both Electron
tills and stops them booting — failed **0 of 694** tests, because the oracle proves the DRIVER
honours the option and nothing proved the DOOR forwards it. `__acceptance__/open-store-door.test.ts`
is the hand-written assertion that now kills it (1 of 696). Same shape, one seam out, as the
`catalog-fetch.ts` finding below.

**⚠ `transport-rn.ts` corrects a hardcoded advertisement, and that line is load-bearing.**
`cloud-session.ts:224` says `accepts_compression: true` — *"this BUILD can decode compressed
frames"* — which is false on a phone, because zstd is `node:zlib`. Uncorrected, the gateway grants
compression and the device connects, hellos, reports `connected: true` and then **silently receives
nothing for ever**. Reproduced against a real `ws` server before the fix.

## `catalog-fetch.ts` dropped the price and the station, and 579 green tests could not see it

**Found by RUNNING the four-process stack, not by reading anything** (August 2026 — the runbook is
`plans/wave-1/running-the-stack.md`). An owner priced an item at Rs 450 in the back office and
published it. It reached the till: right name, right kitchen name, right version. Every tile read
**`no price set`**.

`WireEntry` declared neither `prices` nor `station`, and `toEntry` copied neither. Everything
either side of that one function was correct — the gateway served
`prices: [{branch_id, channel: "counter", price_paisa: 45000}, …]`, `CatalogEntryWire` carried
them, `CatalogEntry` here declared them, `priceOf`/`stationOf` read them. The row that landed in
the device's `catalog` table was `{"kind":"item","id":…,"name":…,"kitchen_name":…}`.

**Why no suite saw it, and the lesson that generalises.** The two halves are each covered and
nothing covered the JOIN: `__acceptance__/catalog-pricing.test.ts` proves `priceOf` by calling
`store.catalog.apply()` **directly**, so it never crosses this seam, and
`__acceptance__/catalog-fetch.test.ts` did not contain the word *price*. AGENTS.md's named defect
of the wave, in a shape `seams:check` cannot express — `toEntry` is reached, called, and lossy.
`WireCatalogResponse`'s own doc comment already warned that *"a reshape is where a field quietly
goes missing"*, about this reshape.

**So the regression assertions run the whole hop** — wire frame → `accept()` →
`store.catalog.apply()` → `priceOf`/`stationOf`. An assertion on `update.upserts[0].prices` would
have passed against a store that dropped the column, which is the same mistake one layer down.

### Mutation matrix (round-3 law) — control 582/582 green (579 pre-existing + 3 new)

Every row is the FULL package suite, so the right-hand column is measured rather than reasoned.

| # | mutant (exactly one branch) | new 3 killed | pre-existing 579 |
|---|---|---|---|
| M1 | **`prices` dropped from `toEntry` — THE shipped bug** | 1 | **all green** |
| M2 | `station` dropped from `toEntry` | 2 (the station test and its inheritance control) | **all green** |
| M3 | only the FIRST price survives the reshape | 1 | all green |
| M4 | **CONTROL: `station: null` written through instead of collapsed to absent** | **0** | all green |

**M1 is the one to re-run after any change here**, and its right-hand column is the whole point:
the defect that made every synced menu unsellable failed **zero** of the 579 tests that already
existed. M4 is the attribution control — it is semantically equivalent under `stationOf` (which
fails `typeof === "string"` for both `null` and `undefined`), and a suite that killed it would be
over-constraining the mapping rather than defending `03-F50`.
