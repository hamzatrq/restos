# @restos/domain

## What this package is

`domain` is the **sacred single source of truth** (`18 §2`) for the whole platform. Every
event schema, entity/config schema, the branded money and quantity number types, and the
pure legality/conservation rules are **declared here exactly once**. It has **no I/O, no
sync, no storage, no clock** — nothing but pure TypeScript types and pure functions. Every
other package (sync-client, sync-protocol, gateway, the apps) imports these definitions
rather than restating them; redeclaring a domain type anywhere else is a violation, not a
convenience (`.claude/rules/protected-paths.md`). Owning specs: `01-kernel-sync.md §4` and
`00 §6`.

## Where it sits

`domain` is the innermost ring of the kernel. Both planes depend on it: the **device plane**
(`sync-client`, the offline event store and fold engine) and the **cloud plane** (gateway,
Auditor, tRPC). Because it is the shared vocabulary that both planes must agree on
byte-for-byte, it takes on **no runtime dependencies of its own** beyond `zod` (schema
parsing), `@noble/hashes` (pure-JS sync SHA-256, usable on React Native and in the
synchronous append path where `node:crypto`/WebCrypto are not), and `uuidv7` (id minting).

## File-by-file

| File | Responsibility | Key exports |
|---|---|---|
| `index.ts` | Public barrel — the entire declared-once surface | (re-exports everything below) |
| `money.ts` | Branded integer money/quantity types + the arithmetic helpers | `Paisa`/`Milligrams`/`Millilitres`/`Units`, `paisa`/`mg`/`ml`/`units`, `addPaisa`/`subPaisa`/`sumPaisa`/`splitPaisa`/`applyRateBps` |
| `canonical.ts` | Deterministic byte-pinned JSON serializer | `canonicalJson` |
| `payload-hash.ts` | Clock-neutral tiebreak hash for merge rules | `payloadHash` |
| `audit.ts` | Audit hash-chain compute + verify (`01-F5`) | `auditEventHash`, `verifyAuditChain`, `VerifyAuditChainResult` |
| `envelope.ts` | The canonical event envelope schema (`01-F3`) | `EventEnvelope` (zod), `EventEnvelopeT`, `parseEnvelope` |
| `registry.ts` | The `01 §4` typed event catalog + parse gate | `eventRegistry`, `parseEvent`, `ParsedEvent`, `KnownEventType`, `AUDIT_EVENT_TYPES`, `AuditEventType`, `isAuditEvent`, `UnknownEventTypeError` |
| `states.ts` | Order-line state machine + legality table | `ORDER_LINE_STATES`, `OrderLineState`, `TERMINAL_LINE_STATES`, `LEGAL_NEXT`, `applyLineState`, `LineStateResult` |
| `invariants.ts` | Executable money-conservation invariants (`01-F29/F30`) | `refundRemainderExceeded`, `settledConservationResidualPaisa`, `RefundRemainderArgs`, `SettledConservationArgs` |
| `product-constants.ts` | Four **DECISION PENDING** founder-owned merge-policy constants | `CONTESTED_LINE_BILLABLE`, `AVAILABILITY_FALSE_WINS`, `KOT_TWO_HEAD_TABLE_HEADER`, `EXCESS_TENDER_IS_EXCEPTION` |
| `device-classes.ts` | Fixed device-class slice + hub-election priority | `DEVICE_CLASSES`, `DeviceClass`, `HUB_ELIGIBLE_CLASSES` |
| `ids.ts` | Single platform id source | `newId` |

## Major functions & types

### Money helpers — `money.ts` (`DEC-MONEY-005`, `T-01-13`, `00 §6`)

Money is **integer paisas**, quantities are **integer mg/ml/units**. The branded types
(`Paisa` etc.) are compile-time-only phantoms; the **runtime** guard `asInt` rejects any
value that is not a non-negative safe integer.

- `paisa(n: number): Paisa` — brands `n`, throwing `RangeError` if it is negative or not a
  safe integer. Same for `mg`/`ml`/`units`.
- `addPaisa(a, b)`, `subPaisa(a, b)` — plain integer +/−, re-guarded. `subPaisa` **throws on
  a negative result** (that is deliberate — see invariants below for where subtraction must
  instead be allowed to go negative).
- `sumPaisa(values): Paisa` — accumulates in **`bigint`** and throws past
  `Number.MAX_SAFE_INTEGER` rather than silently drifting a double.
- `splitPaisa(total, n): Paisa[]` — split into `n` integer parts. **Largest-remainder,
  first-parts** rounding: with `q = floor(total/n)`, `r = total % n`, the first `r` parts
  get `q+1` and the rest `q`. Deterministic, order-stable, `max − min ≤ 1`, and the parts
  **sum back to `total` exactly** (no rounding leak). Float-free.
- `applyRateBps(amount, bps): Paisa` — apply an integer basis-point rate (`1700` = 17%).
  **Round-half-up**, computed integer-exactly in `bigint` as `(amount*bps + 5000) / 10000`
  — the naive float path is off-by-one because `amount*bps` routinely exceeds 2^53. No upper
  cap on `bps` (markups over 100% are legal). Overflow throws.

These are the helpers that must land before any tax/discount/split-bill code, so those
modules never hand-roll money arithmetic.

### `canonicalJson(value: unknown): string` — `canonical.ts`

The **one** serializer. Object keys are sorted by UTF-16 code unit at every depth, with no
insignificant whitespace, and it mirrors exactly what `JSON.stringify` drops (`undefined`,
functions, symbols → omitted keys / `null` array elements). **Why it exists:** the audit
hash and every determinism/tiebreak hash are taken over *these exact bytes*, so a value
hashed in memory equals the same value re-serialized after a SQLite/Postgres round-trip, and
a future non-JS refold implementation on another host can be required to produce
byte-identical output. Without a canonical form, two hosts serializing the same event in
different key order would compute different hashes and the chain would falsely "break".

### `payloadHash(payload: unknown): string` — `payload-hash.ts`

SHA-256 (lowercase hex) over `canonicalJson(payload)`. This is the platform's **clock-neutral
tiebreak** primitive (`T-01-15`, `01-F34`). **Why min-envelope-id is banned as a tiebreak:**
ids are UUIDv7, whose leading 48 bits are the minting device's wall clock, so "pick the
minimum id" is secretly "pick the earliest wall clock" — smuggling a device clock into a
merge that is required to read no ordering metadata. Merge rules that need a deterministic
default among concurrent values select by **min `payloadHash`** instead.

### The event registry — `registry.ts` (`01-F4`/`01-F5`, catalog `01 §4`)

- `parseEvent(value): ParsedEvent` — validates the envelope, then looks the `type` up in the
  catalog and validates the payload against its zod schema. An **unknown type throws
  `UnknownEventTypeError`** — producing or parsing an off-catalog event is an error, never
  silent acceptance.
- `eventRegistry.has(type)` / `.types()` — membership + enumeration of the **operational**
  (fold-consumed) catalog only.
- Payload schemas are `z.looseObject` — required fields are law, extra fields pass through
  for additive schema evolution (`00 §6`).

The **operational** catalog: `order.created`, `order.confirmed`, `order.line_added`,
`order.table_assigned`, `order.line_state_changed`, `payment.recorded`, `payment.refunded`,
`order.settlement_closed`, `kot.printed`. Money-carrying shapes to note:

- **`payment.recorded`** — `{ order_id, amount_paisa, method, settlement_attempt_id, purpose }`.
  `settlement_attempt_id` is the idempotency key (double-taps cannot double-record, `01-F31`);
  `purpose` is `"settles_order" | "repays_receivable"` — the khata discriminator that keeps a
  settlement and its later repayment from double-counting (`DEC-MONEY-007`).
- **`payment.refunded`** — `{ order_id, amount_paisa, method, settlement_attempt_id,
  payment_attempt_id }`. `order_id` is **carried** (never resolved through the parent —
  `01-F29` late-resolving-entity fix); `settlement_attempt_id` here is the refund's **own**
  idempotency key; `payment_attempt_id` references the **parent** payment's
  `settlement_attempt_id` (the cap resolves parents by attempt id, never envelope id).

The **audit** family (`audit.login`, `audit.drawer_opened`, `audit.reprint`,
`audit.threshold_override`, `audit.settings_changed`) is kept deliberately **out** of
`KnownEventType` because audit events fold to nothing; their only v1 payload contract is
`prev_audit_hash: string | null`. `isAuditEvent(type)` / `AUDIT_EVENT_TYPES` gate them.

### The line-state machine — `states.ts` (`01-F34`/`F35`, `01 §4`)

- `ORDER_LINE_STATES` — `placed → confirmed → in_prep → ready →` then a terminal service state: `served` (dine-in/takeaway, terminal) **or** `picked_up → delivered` (delivery),
  plus exits `voided`/`cancelled`. `settled` is **not** a line state (it closes the money side).
- `LEGAL_NEXT` — the canonical transition table, exported as the legality predicate the
  merge fold consumes. Legality is a pure function of an edge's own payload (`from_states → to`),
  **judged against this table, never against comparator/merge position.** Terminals map to `[]`.
- `applyLineState(current, next): LineStateResult` — pure fold step: a terminal never regresses
  (`anomaly: "terminal_regression"`), an illegal jump never applies (`anomaly:
  "illegal_transition"`), otherwise `{ state: next, applied: true }`.

### Conservation invariants — `invariants.ts` (`01-F29`/`F30`, executable per spec)

Declared once so the gateway's merge-time refund cap and the Auditor's refold sweep call the
**same** arithmetic. Both use plain integer math (not branded `subPaisa`) precisely because
their interior subtraction **must be allowed to go negative** — unprovable refunds can merge
before their parent (`01-F17`/`DEC-SYNC-007`).

- `refundRemainderExceeded({ payment_amount_paisa, prior_refunds_total_paisa,
  this_refund_paisa }): boolean` — `true` ⇔ the refund exceeds the parent's un-refunded
  remainder (`refund > payment − prior`). Exact cover is legal; one paisa over is not.
- `settledConservationResidualPaisa({ billed_paisa, tendered_paisa, refunded_paisa }): number`
  — returns `billed − (tendered − refunded)`: `> 0` is a **shortfall** (a violation once
  settled, the Auditor flags it); `0` is conserved; `< 0` is excess tender whose violation
  status is the open `EXCESS_TENDER_IS_EXCEPTION` product constant (not flagged at v1).

### The audit hash chain — `audit.ts` (`01-F5`, `01 §7`, `DEC-AUDIT-001`)

- `auditEventHash(envelope): string` — SHA-256 hex over `canonicalJson` of the envelope with
  **`server_received_at` deleted** (it is `null` on-device at emit but an integer after cloud
  merge; hashing it would make device-side and cloud-side hashes disagree and break
  cross-plane verification). Every other field, including the payload's own
  `prev_audit_hash`, is covered.
- `verifyAuditChain(events): VerifyAuditChainResult` — validates linkage of **one device's
  audit events, pre-sorted ascending by `lamport_seq`** (the caller's job — this helper does
  not sort or filter). The first event's `prev_audit_hash` must be `null`; each subsequent one
  must equal `auditEventHash(previous)`. Returns the **first** broken link or `{ ok: true }`.
  **Why a chain:** each event commits to its predecessor's hash, so any silent mutation or
  deletion of past history changes a downstream hash and is detectable — the machine-enforced
  form of the append-only-ledger commandment.

### `product-constants.ts` — four founder-owned constants (`T-01-15`, `26 §9`)

Every value here is `// DECISION PENDING` — the merge-matrix **default**, not a ratified
product call. Flag these to the founder; they are the only policy knobs in the package:

- `CONTESTED_LINE_BILLABLE = true` — a contested line (e.g. served vs voided heads) still
  counts toward billed revenue (matrix §5.4).
- `AVAILABILITY_FALSE_WINS = true` — among concurrent availability heads, `false` (86'd) wins
  (matrix §5.8).
- `KOT_TWO_HEAD_TABLE_HEADER = "TABLE CONFLICT"` — the KOT header string for a two-head-table
  order (matrix §5.10).
- `EXCESS_TENDER_IS_EXCEPTION = false` — "keep the change" is **not** flagged as an exception
  (matrix §5.3 / `DEC-MONEY-004`).

## Invariants a reviewer must hold

1. **Money is an integer number of paisas held in a JS `number` (double) — never a float
   value.** All arithmetic is integer-exact; `sumPaisa`/`applyRateBps` compute in `bigint`
   and throw rather than drift. Quantities are integer mg/ml/units. No decimals in any ledger
   (`00 §6`, commandment 3).
2. **Schemas are declared once, here.** Redeclaring any event/entity/config type or the
   money types in another package is a protected-path violation.
3. **Raw money arithmetic is lint-banned.** A GritQL rule (`DEC-MONEY-005`, `T-01-13`) forbids
   naked `+/-/*//` on paisa values elsewhere — call the `money.ts` helpers so rounding and
   overflow policy stay in one place.
4. **No clock in domain logic.** No `Date.now()`, no reading `device_created_at` for ordering,
   no id-min tiebreak (which is a disguised wall clock). Every function here is a pure function
   of its inputs; `server_received_at` is even excluded from the audit hash for the same
   reason.

## Recent kernel changes (for a cold reviewer)

- **`T-01-15` (merge model / `01-F34` rewrite).** The catalog payloads were **amended** to
  carry the fields that let folds converge with *no ordering metadata*:
  `order.table_assigned.supersedes`/`from_table_id`, `order.line_state_changed.line_context`
  (`{ to, from_states, preds }` per line), `payment.recorded.purpose`,
  `payment.refunded.order_id`/`payment_attempt_id`, and the new `order.settlement_closed`
  event. `payload-hash.ts` (clock-neutral tiebreak) and the `states.ts` legality-as-payload
  contract also arrived with this task.
- **`T-01-13` (money helpers).** `splitPaisa`/`applyRateBps` and the `bigint`
  overflow-guarded `sumPaisa` landed here, plus the runtime `asInt` guard posture (brands are
  compile-time only, so the runtime check *is* the enforcement) and the raw-arithmetic lint
  ban.
- **`T-01-09` (device auth).** Nothing in this package — auth lives elsewhere (`sync-client`
  + registry). Noted so a reviewer doesn't hunt for it here.
- **Pending product constants.** The four `product-constants.ts` values remain founder-owned
  `DECISION PENDING` defaults; none blocks the merge engine, but none is a ratified call yet.
