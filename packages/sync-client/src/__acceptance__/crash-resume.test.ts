// Acceptance tests — T-01-03 crash-resume seed (20 §2.6 D1 form), authored from
// the kernel-tasks binding contract + specs/01/20 only (24 §3 step 2).
// Handles are abandoned WITHOUT close() — reopen must recover via WAL with zero
// confirmed loss (01-F2), no lamport gap or reuse (01-F3), identical re-drain
// (01-F8). The SIGKILL child harness is the nightly 20 §2.6 rung (see plan).

import { describe, expect, it } from "vitest";
import { openStore } from "../index.js";
import { appendInput, identity, seededRng, tempDbPath } from "./builders.js";

describe("crash resume (20 §2.6 seed)", () => {
  it("01-F2/20 §2.6: every event confirmed before an abrupt abandon survives reopen, gap-free", () => {
    const id = identity();
    const path = tempDbPath();
    let store = openStore({ path, identity: id });
    const confirmedIds = Array.from({ length: 7 }, () => store.append(appendInput(id)).id);
    // abrupt abandon: no close()
    store = openStore({ path, identity: id });
    const events = store.readOwnEvents();
    expect(events.map((e) => e.id)).toEqual(confirmedIds);
    expect(events.map((e) => e.lamport_seq)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    store.close();
  });

  it("01-F3: after reopen the next append continues the lamport sequence — no gap, no reuse", () => {
    const id = identity();
    const path = tempDbPath();
    let store = openStore({ path, identity: id });
    store.append(appendInput(id));
    store.append(appendInput(id));
    store = openStore({ path, identity: id });
    expect(store.append(appendInput(id)).lamport_seq).toBe(2);
    store.close();
  });

  it("01-F8/20 §2.6: the unacked tail re-drains identically after reopen — same events, same order, checkpoint intact", () => {
    const id = identity();
    const path = tempDbPath();
    let store = openStore({ path, identity: id });
    const confirmed = Array.from({ length: 5 }, () => store.append(appendInput(id)));
    store.advanceTo(1);
    store = openStore({ path, identity: id });
    expect(store.status().acked_watermark).toBe(1);
    expect(store.nextBatch(100).map((e) => e.id)).toEqual(confirmed.slice(2).map((e) => e.id));
    store.close();
  });

  it("01-F2/01-F3/20 §2.6: a seeded run of append/ack cycles across abrupt reopens never loses a confirmed event nor leaves a gap", () => {
    const id = identity();
    const path = tempDbPath();
    const rng = seededRng(0x01f2);
    const confirmedIds: string[] = [];
    let store = openStore({ path, identity: id });
    for (let op = 0; op < 120; op++) {
      const roll = rng();
      if (roll < 0.6) {
        confirmedIds.push(store.append(appendInput(id)).id);
      } else if (roll < 0.8) {
        const high = store.status().own_high_water;
        if (high !== null) store.advanceTo(Math.floor(rng() * (high + 1)));
      } else {
        store = openStore({ path, identity: id }); // abrupt abandon + reopen
      }
    }
    store = openStore({ path, identity: id });
    const events = store.readOwnEvents();
    expect(events.map((e) => e.id)).toEqual(confirmedIds);
    expect(events.map((e) => e.lamport_seq)).toEqual(confirmedIds.map((_, i) => i));
    store.close();
  });
});
