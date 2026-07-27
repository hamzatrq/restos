# Catalog transport — plan

**Planning artefact, July 2026.** Owning spec: `specs/01-kernel-sync.md` (`01-F9`, `01-F21`,
`01-F52`..`01-F56`). Also binding: `14-F28` (menu-edit timing), `01-F49` (training branches),
`DEC-SYNC-011` (blocked cursors are observable).

**Status: NOT APPROVED. Do not implement from this file yet.** It touches two protected paths
(`sync-protocol`, `sync-client`) and asks two questions only the founder can answer (§6).

---

## 1. Where we actually are

`packages/sync-client/src/catalog.ts` implements the **device side** of `01-F52`..`01-F56`:
versioned snapshots and deltas, tombstone deletes, monotonic application, an out-of-order delta
refused with `needs_snapshot`, and display-only resolution that degrades to the item id rather
than blocking a sale.

**Nothing delivers anything to it.** There is no producer, no wire frame, no server endpoint.
The store is exercised only by its own tests. Concretely: the POS grid can render only what a
test hands it, and `apps/pos-electron`'s gateway takes a `CatalogResolver` seam that today has
no implementation behind it.

## 2. The finding that reshapes this task

`01-F9` reads: *"a device subscribes to its branch's merged stream **(plus org-scope reference
data)** over WebSocket"*. The parenthesis is the whole catalog delivery story in the spec, and
it is doing more work than it looks like.

**The gateway has no org-scope read path at all.** Every device read is branch-filtered:

```sql
-- services/sync-gateway/src/gateway.ts:1101
select global_seq, server_received_at, envelope from kernel.events
where org_id = ${session.orgId} and branch_id = ${session.branchId}
  and global_seq > ${message.from_global_seq}
```

Live fan-out is scoped the same way. So the catalog cannot arrive by "just reading the stream" —
there is no stream a device is on that carries org-scoped rows. This is not a defect in the
gateway (branch scoping is `01-F13` and a security property, closed again by `sec-F1`); it is a
capability `01-F9` promised and nobody has built.

That rules out the cheap implementation and forces an explicit design.

## 3. The design

### 3.1 `catalog.changed` is an audit event, NOT the device's delivery mechanism

`01-F52`: *"`catalog.changed` announces that a new version exists; **it does not carry the
catalog**"*, and *"catalog is REFERENCE DATA, not ledger"*. `14 §` emits it with actor and
before/after refs — that is an **audit record** whose consumer is the back-office history view
(`14-F6` price history), and it lives in the org's cloud ledger.

Making devices depend on *consuming* that event would require writing an org-scoped event into
every branch's stream, which contradicts `01-F52`'s "not ledger" in the same breath as
satisfying it. So:

> **The device never consumes `catalog.changed`.** It learns its catalog is stale by comparing
> versions, and fetches over a dedicated frame pair.

This also means the transport works for a device that has been offline for a week and has no
hope of replaying an announcement it was not connected for.

### 3.2 Version-on-hello is the correctness mechanism; the notice is only latency

**`hello_ack` gains `catalog_version`** — the org's current authoritative version. The device
compares it with `catalogStore.version()` and requests if behind. That single addition makes the
transport correct with no push at all: every reconnection reconciles.

**A `catalog_notice` frame** (server→device, org-scoped, carries only the new version number)
covers the case where the version changes *during* a live session, so a menu edit does not wait
for the next reconnect. It is a freshness optimisation and the system is correct without it —
which is the property that matters, because a notice is exactly the kind of message that gets
dropped on a lossy link.

### 3.3 Two new frames

```
catalog_request  { v, kind, have_version }        device → server
catalog_response { v, kind: "snapshot" | "delta", ... }   server → device
```

The server decides snapshot vs delta from `have_version`: a delta if it can construct one from
that exact base, a snapshot otherwise (including `have_version: 0`, and including the case where
the base is too old to reconstruct). **The device's existing `needs_snapshot` refusal then
becomes the belt to that braces** — it is what happens if the server gets this wrong, and it is
already implemented and tested.

Paging: a large org's catalog will exceed one frame. `catchup_response` already solves this
shape with `complete` + `next_from`; the catalog response should copy that vocabulary rather
than invent a second paging idiom. **A snapshot must apply atomically** — the device must not
hold half a menu — so paged snapshot chunks accumulate and commit on the final page.

### 3.4 `14-F28` day-end timing resolves server-side, and the device stays dumb

`14-F28` (this month's founder ruling) makes a menu edit's application time the owner's choice,
**default day-end**, with an explicit per-edit "apply now", and pending edits *"visible and
cancellable until they land"*.

Cancellable-until-it-lands means the pending edit lives where the back office can withdraw it —
**the server**. So the write model holds the edit, applies it at the `01-F46` 05:00 boundary,
and only then bumps the version. **Devices see nothing until it lands**, and the device-side
store needs no pending-version concept.

That makes the already-built `catalog.ts` correct as-is, which is worth stating explicitly
because the tempting alternative — ship the edit with an `effective_at` and let each device
apply it at its own boundary — would have required a device-side scheduler, a second version
axis, and a clock read on the application path. It also would have been *wrong*: a device
offline across the boundary would apply an edit the owner cancelled.

**Assumption to confirm (§6 Q2).**

### 3.5 Training branches

`01-F49`/`01-F52`: catalog is **org-scoped** and a training branch mirrors it read-only. Since
the catalog is fetched by org and never by branch, a training device gets the production menu
with no special case. Worth a test, not worth a mechanism.

## 4. What has to be built

| # | Task | Files | Protected? |
|---|---|---|---|
| **T-C1** | Wire frames + `PROTOCOL.md` section: `catalog_request`, `catalog_response`, `catalog_notice`, `hello_ack.catalog_version`. Version negotiation is unchanged (`PROTOCOL_VERSION` stays 1 — these are additive and an old device simply never sends the request). | `packages/sync-protocol/src/messages.ts`, `PROTOCOL.md` | **yes** |
| **T-C2** | Server catalog store + version assignment. Where the authoritative catalog lives (§6 Q1), the snapshot/delta constructor, and delta reconstruction from an arbitrary base — including the honest "I cannot, take a snapshot" answer. | `services/sync-gateway/src/`, schema migration | no |
| **T-C3** | Gateway request handling, org-scoped, page-capped, plus the notice broadcast to an org's connected sessions. Must be a **read** in the `01-F47` sense: refused for a draining session, refused for a revoked device (`sec-F1`). | `services/sync-gateway/src/gateway.ts` | no |
| **T-C4** | Device side: `cloud-session` requests on `hello_ack` version mismatch and on notice; applies via the existing store; surfaces a stuck catalog in status per `DEC-SYNC-011`. | `packages/sync-client/src/cloud-session.ts` | **yes** |
| **T-C5** | `catalog.changed` into `packages/domain/src/registry.ts` with its payload schema. **It is in the `01 §4` list but not in the registry** (the registry seeds 15 types), so `01-F4` makes emitting it a runtime error today — which means `14`'s back office cannot record a menu edit at all. | `packages/domain/src/registry.ts` | **yes** |
| **T-C6** | Wire the real resolver into `apps/pos-electron`'s `CatalogResolver` seam, replacing the injected stub. | `apps/pos-electron/src/main/` | no |

**Session split (`24 §3` step 2):** acceptance tests for T-C1, T-C4 and T-C5 must be authored by
a different session than the implementer — all three are protected paths, and this is precisely
the debt the current oracle round exists to clear. Plan six implementation sessions and three
test-authoring sessions, not six sessions.

## 5. What must be true when this is done

Each of these is a test, not a sentiment:

1. A device with version 0 and no catalog reaches parity in one exchange.
2. A device N versions behind receives a delta; a device too far behind receives a snapshot; the
   device applies both correctly and never a delta on the wrong base.
3. **A dropped `catalog_notice` costs freshness and never correctness** — the next reconnect
   reconciles. Test by dropping every notice.
4. A snapshot spanning multiple pages either applies whole or not at all; an interrupted
   snapshot leaves the previous menu intact, not a partial one.
5. **A catalog that cannot sync never blocks a sale** (`01-F17`, `01-F54`). With the fetch
   failing on every attempt, the till still takes an order, bills it correctly from event-captured
   prices (`01-F53`), and prints.
6. A revoked device gets no catalog (`sec-F1`: revocation blocks reads).
7. A training-branch device receives the production org's catalog.
8. The catalog is still not an input to any fold (`01-F52`) — the existing structural guard must
   keep passing, and should be extended to the new code paths.
9. Two devices on the same org converge to byte-identical catalogs from different starting
   versions and different message orders.

## 6. Questions this plan cannot answer

**Q1 — Where does the authoritative catalog live?** `14 §` puts the catalog *write model* in the
back office behind tRPC (`services/api`), while the thing that must serve it to devices is
`services/sync-gateway`. Two services, one truth. Either the gateway reads the API's tables
(coupling two services at the database), or the API publishes versioned snapshots the gateway
serves (clean, and a second copy of the menu). **Recommendation: the API publishes; the gateway
serves.** A published snapshot is immutable and versioned, which is exactly what the device
protocol wants, and it keeps the gateway from growing an opinion about menu structure.

**Q2 — Confirm §3.4:** day-end edits are withheld server-side until the 05:00 boundary, so
devices only ever see landed versions. The plan assumes yes. The consequence to accept: a device
offline across the boundary applies the edit when it reconnects, not at the boundary — which is
the correct behaviour but means "applied at day-end" is true of the *org*, not of every device.

---

**Not in scope here** and deliberately left out: recipes and inventory items (`01-F21` names them
in the same chain but no device screen needs them in Wave 1), price history, and bulk-edit
preview (`14-F8`). Adding them now would be speculative — the frames are additive, so they cost
nothing to defer.
