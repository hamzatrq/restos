// Acceptance tests — T-01-16 transport: batched catch-up page persistence, the
// store seam (COVER 1, 2, and the fold-equivalence half of COVER 4). THE headline
// test guards the re-opened-bug warning of 26 §6.4.
//
// ⚠ NO WRITTEN CONTRACT. plans/wave-0/kernel-tasks.md has no T-01-16 entry — it is
// the "future task" T-01-15 punted ("transport batching + zstd (future task; see
// 26 §6.4)", kernel-tasks.md:463). Authored from SPEC TEXT ONLY (24 §3 step 2):
//   • 26 §6.4 bottleneck 1: "cloud-session.ts calls store.ingest() PER EVENT … one
//     fsync per event — 10,000 fsyncs for a full catch-up. Each ~500-event page
//     should persist and project in ONE transaction."
//   • 26 §6.4 WARNING (load-bearing): "Do NOT naively wrap the loop in a transaction.
//     The per-event structure is load-bearing: the pull cursor advances only through
//     a CONTIGUOUS PREFIX of events that actually landed, and a DivergentDuplicateError
//     must be PASSED rather than wedge the pull (01-F9/01-F34/01-F17). Batching must
//     preserve per-event failure granularity — or it re-opens a bug fixed once."
//   • 01-F17 (a sale is never blocked), 01-F1 (append-only — a divergent duplicate
//     never overwrites the stored row).
//
// ── ORACLE-PROPOSED SURFACE (binding for the implementing session; flagged for
//    ratification in the oracle report — packages/sync-client is a PROTECTED PATH,
//    senior review). The batched seam the cloud session's per-event loop collapses
//    into, ADDITIVE to store.ingest / store.ingestBatch (device-store.ts):
//
//      store.ingestPage(items: readonly PageItem[]): readonly PageResult[]
//        — persist + project the WHOLE page in ONE transaction (one fsync), with
//          PER-EVENT savepoint isolation. Returns one result PER item, IN ORDER, so
//          the caller can compute the contiguous landed prefix and surface/pass a
//          divergent duplicate — exactly the granularity the current per-event loop
//          has. A per-item failure rolls back only that item's savepoint; the good
//          prefix commits; siblings after it are still attempted. Each item is
//          `{ envelope, global_seq? }` — the same two arguments as store.ingest.
//        PageItem   = { envelope: unknown; global_seq?: number }
//        PageResult = { ok: true; stored: boolean } | { ok: false; error: unknown }
//
//      store.ingestStats(): { commits: number; events_ingested: number }
//        — the mandated work-counter observable (the T-01-14/T-01-15 foldStats
//          precedent: "one transaction per page" is NOT black-box assertable without
//          it). `commits` = count of ingest-path write-transactions committed (a
//          single store.ingest = 1; a whole store.ingestPage = 1). The bottleneck IS
//          this number: per-event catch-up of a K-event page = K commits; the batched
//          page = 1. `events_ingested` = count of newly-persisted event rows.
//
// RED-AWAITING-IMPLEMENTATION: neither method exists yet — the `batch()` guard throws
// a self-documenting missing-feature reason.

import { describe, expect, it } from "vitest";
import { type DeviceStore, DivergentDuplicateError, openStore } from "../index.js";
import {
  canonicalJson,
  identity,
  must,
  peerEnvelope,
  peerIdentity,
  tempDbPath,
} from "./builders.js";

// ── the oracle-proposed batched seam, resolved off the real store via a typed cast ──
type PageItem = { envelope: unknown; global_seq?: number };
type PageResult = { ok: true; stored: boolean } | { ok: false; error: unknown };
type BatchIngestStore = {
  ingestPage?(items: readonly PageItem[]): readonly PageResult[];
  ingestStats?(): { commits: number; events_ingested: number };
};

const batch = (store: DeviceStore): Required<BatchIngestStore> => {
  const s = store as DeviceStore & BatchIngestStore;
  if (typeof s.ingestPage !== "function" || typeof s.ingestStats !== "function") {
    throw new Error(
      "T-01-16 NOT IMPLEMENTED: store.ingestPage / store.ingestStats — the batched " +
        "one-transaction catch-up seam that preserves per-event failure granularity " +
        "(26 §6.4). RED until the transport task lands.",
    );
  }
  return s as Required<BatchIngestStore>;
};

const ok = (r: PageResult | undefined): { ok: true; stored: boolean } => {
  const rr = must(r);
  if (!rr.ok) throw new Error("expected an ok PageResult, got a failure");
  return rr;
};
const failed = (r: PageResult | undefined): { ok: false; error: unknown } => {
  const rr = must(r);
  if (rr.ok) throw new Error("expected a failed PageResult, got ok");
  return rr;
};

const orderPayload = (order_id: string) => ({ order_id, channel: "dine_in" });
const ids = (store: DeviceStore): Set<string> => new Set(store.readAllEvents().map((e) => e.id));

describe("T-01-16 batched page — THE per-event-granularity guard (26 §6.4 warning; 01-F17/01-F1/01-F9)", () => {
  it("26 §6.4: a mid-page DIVERGENT DUPLICATE is PASSED, the good prefix stays durable, the suffix continues, all in ONE transaction — no rollback, no wedge", () => {
    const id = identity();
    const path = tempDbPath();
    const store = openStore({ path, identity: id });

    // A peer event already stored with content V1 (payload order O-v1).
    const peerA = { ...peerIdentity(id), device_id: "peer-a" };
    store.ingest(peerEnvelope(peerA, 0, { id: "poison", payload: orderPayload("O-v1") }));

    // A catch-up page whose middle item (index 2) reuses that id with DIVERGENT
    // content (order O-v2) — the DivergentDuplicateError case 26 §6.4 forbids
    // wedging on. The four flanking items are fresh peer events that MUST land.
    const peerB = { ...peerIdentity(id), device_id: "peer-b" };
    const page: PageItem[] = [
      {
        envelope: peerEnvelope(peerB, 0, { id: "g0", payload: orderPayload("O0") }),
        global_seq: 1,
      },
      {
        envelope: peerEnvelope(peerB, 1, { id: "g1", payload: orderPayload("O1") }),
        global_seq: 2,
      },
      {
        envelope: peerEnvelope(peerA, 0, { id: "poison", payload: orderPayload("O-v2") }),
        global_seq: 3,
      },
      {
        envelope: peerEnvelope(peerB, 2, { id: "g3", payload: orderPayload("O3") }),
        global_seq: 4,
      },
      {
        envelope: peerEnvelope(peerB, 3, { id: "g4", payload: orderPayload("O4") }),
        global_seq: 5,
      },
    ];

    const commitsBefore = batch(store).ingestStats().commits;
    const results = batch(store).ingestPage(page);
    const commitsAfter = batch(store).ingestStats().commits;

    // per-event granularity: the four good items land; the poison surfaces as a
    // DivergentDuplicateError naming the reused id — PASSED, not thrown out of the page.
    expect(ok(results[0]).stored).toBe(true);
    expect(ok(results[1]).stored).toBe(true);
    const poisonResult = failed(results[2]);
    expect(poisonResult.error).toBeInstanceOf(DivergentDuplicateError);
    expect((poisonResult.error as DivergentDuplicateError).eventId).toBe("poison");
    expect(ok(results[3]).stored).toBe(true);
    expect(ok(results[4]).stored).toBe(true);

    // ONE transaction for the whole page (the 26 §6.4 fix — not five).
    expect(commitsAfter - commitsBefore).toBe(1);
    expect(batch(store).ingestStats().events_ingested).toBe(5); // poison(1) + g0,g1,g3,g4

    // the divergent duplicate NEVER overwrote the stored row (append-only, 01-F1).
    const storedPoison = must(store.readAllEvents().find((e) => e.id === "poison"));
    expect((storedPoison.payload as { order_id: string }).order_id).toBe("O-v1");

    // DURABILITY: abandon WITHOUT close(), reopen — the good prefix AND suffix are
    // committed (the poison did not roll them back). Persist-before-return (01-F2).
    const reopened = openStore({ path, identity: id });
    const survived = ids(reopened);
    for (const g of ["g0", "g1", "g3", "g4", "poison"]) expect(survived.has(g)).toBe(true);
    // NOT WEDGED: the store keeps accepting events after the passed poison (01-F17).
    expect(
      reopened.ingest(peerEnvelope(peerB, 4, { id: "g5", payload: orderPayload("O5") })),
    ).toEqual({
      stored: true,
    });
    reopened.close();
    store.close();
  });

  it("26 §6.4/01-F9: ingestPage returns one result PER item IN ORDER — a non-divergent per-event failure isolates to its savepoint, the good prefix commits, the failed event never persists (the caller can then STOP the cursor at it)", () => {
    const id = identity();
    const store = openStore({ path: ":memory:", identity: id });
    const peerB = { ...peerIdentity(id), device_id: "peer-b" };

    // index 2 is an IDENTITY-MISMATCH envelope (wrong branch) — store.ingest throws a
    // plain Error (NOT a DivergentDuplicateError). It must not land and must not abort
    // its siblings; the caller reads the ordered results to find the first non-landed
    // event and stops the cursor there (COVER 2 — the contiguous-prefix cursor rule).
    const wrongBranch = { ...peerB, branch_id: "some-other-branch" };
    const page: PageItem[] = [
      { envelope: peerEnvelope(peerB, 0, { id: "h0", payload: orderPayload("H0") }) },
      { envelope: peerEnvelope(peerB, 1, { id: "h1", payload: orderPayload("H1") }) },
      { envelope: peerEnvelope(wrongBranch, 2, { id: "h2", payload: orderPayload("H2") }) },
      { envelope: peerEnvelope(peerB, 3, { id: "h3", payload: orderPayload("H3") }) },
    ];

    const results = batch(store).ingestPage(page);
    expect(results).toHaveLength(4);
    expect(ok(results[0]).stored).toBe(true);
    expect(ok(results[1]).stored).toBe(true);
    const bad = failed(results[2]);
    expect(bad.error).toBeInstanceOf(Error);
    expect(bad.error).not.toBeInstanceOf(DivergentDuplicateError); // a stop, not a pass
    expect(ok(results[3]).stored).toBe(true); // sibling after the failure still attempted

    const held = ids(store);
    for (const g of ["h0", "h1", "h3"]) expect(held.has(g)).toBe(true);
    expect(held.has("h2")).toBe(false); // the failed event never persisted
    store.close();
  });
});

describe("T-01-16 batched page — ONE transaction per page (the 26 §6.4 bottleneck; the T-01-14/T-01-15 counter precedent)", () => {
  it("26 §6.4: a clean K-event page persists in exactly ONE commit — not K (the per-event fsync bottleneck removed)", () => {
    const id = identity();
    const store = openStore({ path: ":memory:", identity: id });
    const peer = { ...peerIdentity(id), device_id: "peer-bulk" };
    const K = 200;
    const page: PageItem[] = Array.from({ length: K }, (_unused, i) => ({
      envelope: peerEnvelope(peer, i, { id: `k${i}`, payload: orderPayload(`K${i}`) }),
      global_seq: i + 1,
    }));

    const before = batch(store).ingestStats();
    const results = batch(store).ingestPage(page);
    const after = batch(store).ingestStats();

    expect(results).toHaveLength(K);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(after.commits - before.commits).toBe(1); // ONE transaction for 200 events
    expect(after.events_ingested - before.events_ingested).toBe(K);
    expect(store.openOrders()).toHaveLength(K); // and all projected
    store.close();
  });
});

describe("T-01-16 batched page — fold projection is UNCHANGED by batching (the equivalence half of COVER 4; zero fold-behavior change)", () => {
  it("01-F6/01-N1: ingestPage of a page yields a byte-identical fold projection to the per-event store.ingest of the same page (batching is transparent to folds)", () => {
    const id = identity();
    const peer = { ...peerIdentity(id), device_id: "peer-eq" };
    const build = (): PageItem[] => {
      const p: PageItem[] = [];
      for (let o = 0; o < 12; o++) {
        p.push({
          envelope: peerEnvelope(peer, o, { id: `eq-${o}`, payload: orderPayload(`E${o}`) }),
          global_seq: o + 1,
        });
      }
      return p;
    };

    // twin A: the batched page path.
    const batched = openStore({ path: ":memory:", identity: id });
    batch(batched).ingestPage(build());
    // twin B: the legacy per-event path (what applyEvents does today).
    const perEvent = openStore({ path: ":memory:", identity: id });
    for (const item of build())
      perEvent.ingest(
        item.envelope,
        item.global_seq === undefined ? undefined : { global_seq: item.global_seq },
      );

    expect(canonicalJson(batched.openOrders())).toBe(canonicalJson(perEvent.openOrders()));
    expect(canonicalJson(batched.kitchenQueue())).toBe(canonicalJson(perEvent.kitchenQueue()));
    expect(canonicalJson(batched.parked())).toBe(canonicalJson(perEvent.parked()));
    batched.close();
    perEvent.close();
  });
});
