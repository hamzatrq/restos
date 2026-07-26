# POS shell — what building against the real kernel surfaced

Wiring `apps/pos-electron` to `sync-client` for the first time. Three findings, all of them
the kind that only appear when two layers actually meet.

## F1 — There is no catalog on the device. At all. **Blocks the POS grid.**

`01-F21` specifies a versioned catalog chain, and `03-F38` adds a `kitchen_name` to it. But
`grep -rn catalog packages/sync-client/src` returns **one test file and no implementation**.
The device read models carry line ids, quantities and paisa — never words:

```ts
type BilledLineCell = { qty: number; unit_price_paisa: number; states: string[] };
```

That absence is *correct* for the folds. A projected value that embedded a name would depend
on catalog state at fold time, which is precisely the `01-F34` break law 1 exists to prevent.
But it means **the POS grid cannot render an item name or a price today**, and neither can
the KOT. The gateway takes a `CatalogResolver` as an injected seam so the shell is buildable
now, and a missing entry renders the line id rather than throwing (`01-F17` — a sale is never
blocked, and an unnamed line the cashier can still see beats a screen that will not render).

**This is the largest single Wave-1 gap and it is not a UI task.** It needs: catalog storage
in `sync-client`, the `01-F21` version chain, org-scope pull (`01-F9` "plus org-scope
reference data"), and a decision about what a device does with a line whose catalog version
it has not yet received.

## F2 — The blocked cursor is not on `status()`, so the honesty UI cannot be built from the store

`DEC-SYNC-011` reads: *"a blocked cursor is **observable** — `status()` carries the blocking
`global_seq`, the rejected event type, and a machine-readable reason."*

It does not. `SyncStatus` (device store) is four fields — `queue_depth`, `own_high_water`,
`acked_watermark`, `last_global_seq`. The blocked cursor lives on **`CloudSessionStatus`**.

Not a bug — the cursor genuinely belongs to the cloud session — but the decision's own
wording sends an implementer to the wrong object, and a device with no cloud session
(LAN-only under `DEC-SYNC-009`) has no cursor to report at all. The gateway takes it as an
injected getter. **`DEC-SYNC-011`'s wording should be corrected to say `CloudSessionStatus`.**

## F3 — `billedEffectiveFromJsonLines` was not exported from the package index

`26 §8` and the `T-01-11` F4 ruling are emphatic that fold logic is never reimplemented
outside the merge engine — the Auditor's mirror of this exact sum was deleted because two
implementations of one total turn a money anomaly into a false conservation finding. But the
function was exported from `folds/merge.ts` and only its **types** were re-exported from
`src/index.ts`, so a host app reaching for it had no legal path and the obvious move was to
sum `json_lines` itself.

Now exported as a value. **`packages/sync-client` is a protected path — this wants senior
review.**

## Also worth recording

- **The queue projection carries no line detail** (6 pinned keys: `order_id`, `confirm_at`,
  `channel`, `age_basis`, `lines_ready`, `lines_total`). Ticket bodies join from the order
  projection by id. Correct — duplicating lines into the queue fold would be two projections
  of one truth — but it means a KDS renders from *two* read models, not one.
- **`age_basis` is a timestamp, not minutes.** Elapsed minutes are derived in the host app
  from branch time (`wallClock.now() + offset_ms`), which is legitimate display arithmetic
  and explicitly *not* a fold reading a clock (`01-F34`). Tested both ways, including a
  device an hour fast, which must not report every ticket as an hour old.
- **`OpenOrderRow` has no `reference` field** — no human-facing order number exists yet. The
  shell truncates the order id, which is fine for a dev build and unacceptable at a counter
  where staff shout the number across a pass. Doc 02 owes an order-reference scheme.
