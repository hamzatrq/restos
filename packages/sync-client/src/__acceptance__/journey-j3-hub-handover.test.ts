// JOURNEY J3 — "branch time survives a hub handover" (the regression test OWED since
// `e85f9a5`, per `plans/wave-0/sec-review-followups.md` § "Owed regression test").
//
// THE FAILURE THIS PINS. On winning election a device called `setBranchTimeOffset(0)`
// unconditionally, and the hub's heartbeat published `clock.now()` — its RAW clock. A
// handover therefore re-anchored the WHOLE BRANCH onto whatever the new hub's clock
// said:
//
//   counter terminal is hub, clock reads 2026; orders stamp branch_created_at ~2026
//   counter reboots; per 01-F13 a kitchen display is elected hub within 10 s
//   that display's clock is stuck in 2029 → branch time becomes 2029
//   kitchen age = now(2029) − stamp(2026) = every open order shows as ~3 YEARS old
//
// Reachable on any counter reboot. **291 green tests missed it** because not one
// exercised a handover between devices whose clocks differ — while every hub in every
// suite happened to sit at offset 0, both halves of the bug were invisible.
//
// Both halves are pinned separately below, because either one alone silently undoes
// the other:
//   (a) a newly-elected hub RETAINS the offset it already measured;
//   (b) the heartbeat publishes BRANCH time (clock.now() + offset), not the raw clock.
//
// Authored from specs/01-kernel-sync.md (01-F43 as amended — "branch time is a
// property of the BRANCH, not of whichever device currently serves it; the hub SERVES
// the clock, it does not define it"; 01-F13 election/re-election; 01-F44 basis;
// 01-F17) and specs/DECISIONS.md (DEC-TIME-001) ONLY — never from an implementation
// (24 §3 step 2: read-only to the implementing session).
import { createSim } from "@restos/testing";
import { describe, expect, it } from "vitest";
import { REELECTION_BUDGET_MS } from "../index.js";
import { orderConfirmed, orderCreated } from "./builders.js";
import {
  appendAt,
  branchTimeStatus,
  closeMesh,
  LOSSLESS,
  timeMeshDevice,
} from "./time-builders.js";

const MINUTE = 60_000;
const YEAR_MS = 365 * 24 * 60 * MINUTE;

/** One-way LAN delay is 5 ms under LOSSLESS; the errors under test are YEARS. */
const TOLERANCE_MS = 50;

const closeTo = (actual: number, expected: number, tolerance = TOLERANCE_MS): void => {
  expect(
    Math.abs(actual - expected),
    `${actual} within ${tolerance} of ${expected}`,
  ).toBeLessThanOrEqual(tolerance);
};

const ticketAgeBasis = (
  device: ReturnType<typeof timeMeshDevice>,
  order_id: string,
): number | undefined =>
  device.store.kitchenQueue().find((row) => row.order_id === order_id)?.age_basis;

describe("J3/01-F43 — branch time survives a hub HANDOVER (01-F13 re-election)", () => {
  it("J3/01-F43/01-F13: three devices, raw clocks 19 YEARS apart; hub elected, order stamped, hub lost, re-elected — the already-stamped order's computed age is UNCHANGED across the handover", () => {
    const sim = createSim({ seed: 1_741 });
    sim.lan.policy(LOSSLESS);

    // The founder's threat model: any device's clock may be arbitrarily wrong, in
    // either direction. The two hub candidates are 19 years apart, which is what makes
    // the two possible branch-time anchors distinguishable at all.
    const counter = timeMeshDevice(sim, "dev-a-counter", 12 * YEAR_MS, "counter_electron");
    const backup = timeMeshDevice(sim, "dev-b-backup", -7 * YEAR_MS, "counter_rn");
    const waiter = timeMeshDevice(sim, "dev-z-waiter", 3 * YEAR_MS, "waiter"); // never eligible
    const devices = [counter, backup, waiter];
    for (const d of devices) d.session.start();
    sim.runFor(REELECTION_BUDGET_MS); // elect + acquire offsets

    expect(counter.session.status().state).toBe("hub");
    expect(backup.session.status().state).toBe("follower");
    const offsetUnderFirstHub = branchTimeStatus(backup.store).offset_ms;
    closeTo(offsetUnderFirstHub, counter.skew_ms - backup.skew_ms);
    expect(branchTimeStatus(backup.store).basis).toBe("branch");

    // An order is confirmed on the backup terminal, stamped in BRANCH time.
    const confirmedAtTrue = sim.now();
    appendAt(backup, orderCreated("O-handover"));
    appendAt(backup, orderConfirmed("O-handover"));
    sim.runFor(3 * MINUTE);

    const basisBefore = ticketAgeBasis(backup, "O-handover");
    expect(basisBefore, "the confirmed order is on the kitchen queue").toBeDefined();
    if (basisBefore === undefined) throw new Error("unreachable: asserted defined above");
    const ageBefore = backup.branchNow() - basisBefore;
    closeTo(ageBefore, sim.now() - confirmedAtTrue, 2 * TOLERANCE_MS);

    // ── THE HANDOVER. The counter reboots; 01-F13 re-elects within 10 s. ────────
    sim.lan.disconnect("dev-a-counter");
    sim.runFor(REELECTION_BUDGET_MS);
    expect(backup.session.status().state, "the backup terminal is the new hub").toBe("hub");

    // (a) THE NEW HUB RETAINS ITS MEASURED OFFSET. Branch time is a property of the
    //     BRANCH; the hub serves it, it does not redefine it.
    //     [catches: reverting `const held = store.branchTimeStatus();
    //     store.setBranchTimeOffset(held.basis === "branch" ? held.offset_ms : 0);`
    //     back to the unconditional `store.setBranchTimeOffset(0)` — the offset drops
    //     to 0 and branch time teleports onto this device's raw clock.]
    closeTo(branchTimeStatus(backup.store).offset_ms, offsetUnderFirstHub);
    expect(branchTimeStatus(backup.store).basis).toBe("branch");

    // (b) THE PRODUCT-VISIBLE PROPERTY: the age of an order stamped BEFORE the
    //     handover is unchanged by it. This is what the expediter is looking at.
    const basisAfter = ticketAgeBasis(backup, "O-handover");
    expect(basisAfter, "the ticket survives the handover").toBe(basisBefore);
    const ageAfter = backup.branchNow() - (basisAfter ?? 0);
    closeTo(ageAfter, sim.now() - confirmedAtTrue, 2 * TOLERANCE_MS);

    // …stated as the discontinuity it would otherwise be: without the fix the age
    // jumps by the two hubs' clock difference — 19 years on an open ticket. The
    // elapsed virtual time across the handover is bounded by what this test ran.
    expect(
      Math.abs(ageAfter - ageBefore),
      "no discontinuity at the handover (the whole point of e85f9a5)",
    ).toBeLessThanOrEqual(REELECTION_BUDGET_MS + 2 * TOLERANCE_MS);
    expect(Math.abs(counter.skew_ms - backup.skew_ms)).toBeGreaterThan(18 * YEAR_MS);

    closeMesh(devices);
  });

  it("J3/01-F43: a THIRD device following the NEW hub still measures the ORIGINAL branch anchor — the heartbeat publishes BRANCH time, not the new hub's raw clock", () => {
    // This is the second half of `e85f9a5`, and it is the half that is silently undone
    // if only the retention half lands: the new hub could hold the right offset and
    // still broadcast `clock.now()`, re-anchoring every follower one heartbeat later.
    const sim = createSim({ seed: 1_742 });
    sim.lan.policy(LOSSLESS);

    const counter = timeMeshDevice(sim, "dev-a-counter", 12 * YEAR_MS, "counter_electron");
    const backup = timeMeshDevice(sim, "dev-b-backup", -7 * YEAR_MS, "counter_rn");
    const display = timeMeshDevice(sim, "dev-c-display", 4 * YEAR_MS + 33 * MINUTE, "kitchen");
    const devices = [counter, backup, display];
    for (const d of devices) d.session.start();
    sim.runFor(REELECTION_BUDGET_MS);

    expect(counter.session.status().state).toBe("hub");
    closeTo(branchTimeStatus(display.store).offset_ms, counter.skew_ms - display.skew_ms);

    // An order confirmed under the FIRST hub, on the display's queue.
    const confirmedAtTrue = sim.now();
    appendAt(backup, orderCreated("O-third"));
    appendAt(backup, orderConfirmed("O-third"));
    sim.runFor(2 * MINUTE);
    const basis = ticketAgeBasis(display, "O-third");
    expect(basis, "the confirm reached the display over LAN").toBeDefined();
    if (basis === undefined) throw new Error("unreachable: asserted defined above");

    // ── HANDOVER: counter reboots, `dev-b-backup` becomes hub (counter_rn outranks
    //    kitchen, 01-F13). The display is now a follower of a DIFFERENT device.
    sim.lan.disconnect("dev-a-counter");
    sim.runFor(REELECTION_BUDGET_MS);
    expect(backup.session.status().state).toBe("hub");
    expect(display.session.status().state).toBe("follower");
    expect(display.session.status().hub_id).toBe("dev-b-backup");

    // THE PIN. The display re-measures against the NEW hub's heartbeat. If that
    // heartbeat carried the new hub's RAW clock the display's offset would become
    // `backup.skew − display.skew`; it must still be `counter.skew − display.skew`,
    // because branch time did not change — only who serves it did.
    // [catches: reverting `send(device_id, { v: 1, kind: "ping", t: clock.now() +
    // branchOffset() })` back to `t: clock.now()`.]
    closeTo(branchTimeStatus(display.store).offset_ms, counter.skew_ms - display.skew_ms);
    expect(
      Math.abs(branchTimeStatus(display.store).offset_ms - (backup.skew_ms - display.skew_ms)),
      "and it is NOT anchored on the new hub's raw clock",
    ).toBeGreaterThan(18 * YEAR_MS);

    // …and therefore the open ticket's age on the display is still the true elapsed
    // time. A raw-clock heartbeat would have thrown it out by 19 years.
    closeTo(display.branchNow() - basis, sim.now() - confirmedAtTrue, 3 * TOLERANCE_MS);

    // Branch time stays SHARED across the handover: the two survivors agree.
    closeTo(backup.branchNow(), display.branchNow(), 2 * TOLERANCE_MS);

    closeMesh(devices);
  });

  it("J3/01-F43/01-F13: the ROUND TRIP — the rebooted counter rejoins and wins election back, and branch time is STILL the same anchor; no second jump", () => {
    // A handover is rarely one-way in a restaurant: the counter reboots and comes
    // back. Each transition is an opportunity to re-anchor, so continuity has to hold
    // for the whole cycle, not just the first leg.
    const sim = createSim({ seed: 1_743 });
    sim.lan.policy(LOSSLESS);

    const counter = timeMeshDevice(sim, "dev-a-counter", 12 * YEAR_MS, "counter_electron");
    const backup = timeMeshDevice(sim, "dev-b-backup", -7 * YEAR_MS, "counter_rn");
    const display = timeMeshDevice(sim, "dev-c-display", -2 * YEAR_MS, "kitchen");
    const devices = [counter, backup, display];
    for (const d of devices) d.session.start();
    sim.runFor(REELECTION_BUDGET_MS);

    const confirmedAtTrue = sim.now();
    appendAt(backup, orderCreated("O-round"));
    appendAt(backup, orderConfirmed("O-round"));
    sim.runFor(MINUTE);
    const basis = ticketAgeBasis(display, "O-round");
    expect(basis).toBeDefined();
    if (basis === undefined) throw new Error("unreachable: asserted defined above");

    // Out…
    sim.lan.disconnect("dev-a-counter");
    sim.runFor(REELECTION_BUDGET_MS);
    expect(backup.session.status().state).toBe("hub");
    const midAge = display.branchNow() - basis;
    closeTo(midAge, sim.now() - confirmedAtTrue, 3 * TOLERANCE_MS);

    // …and back. The counter outranks the backup, so it takes the hub role again.
    sim.lan.reconnect("dev-a-counter");
    sim.runFor(REELECTION_BUDGET_MS);
    expect(counter.session.status().state).toBe("hub");
    expect(backup.session.status().state).toBe("follower");

    // The branch's clock is the SAME one it has been all along, and every device still
    // computes the true elapsed age for a ticket confirmed two hub generations ago.
    closeTo(branchTimeStatus(display.store).offset_ms, counter.skew_ms - display.skew_ms);
    closeTo(branchTimeStatus(backup.store).offset_ms, counter.skew_ms - backup.skew_ms);
    closeTo(display.branchNow() - basis, sim.now() - confirmedAtTrue, 3 * TOLERANCE_MS);
    closeTo(backup.branchNow(), display.branchNow(), 2 * TOLERANCE_MS);

    closeMesh(devices);
  });
});
