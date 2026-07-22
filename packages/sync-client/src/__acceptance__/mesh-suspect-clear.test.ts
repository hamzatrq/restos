// Acceptance tests — T-01-08 oracle round, owed pin 1 of the T-01-12 close
// (plans/wave-0/t-01-12-fix-round.md, carried item 1: the R-a rider landed in
// the fix round and SURVIVED delta review; the oracle owes it a named pin).
// Authored from the fix-round rulings + HUB-ELECTION.md + specs/01-kernel-sync.md
// (01-F13) + specs/DECISIONS.md (DEC-SYNC-009) ONLY (24 §3 step 2: read-only to
// any implementing session). Existing mesh pins (mesh-session.test.ts,
// mesh-review.test.ts, relay-fix-round.test.ts) are untouched and stay binding.
//
// GREEN-PIN (regression): the R-a mesh election law is LANDED behaviour —
//   clearing a currently-suspected device on its inbound frame re-runs the
//   election IN THE SAME DISPATCH: a false-promoted follower re-adopts the true
//   hub on the suspect's next frame, never waiting for a visibility event (in
//   the pinned scenario NO visibility event ever fires — a wedge here is the
//   deterministic heal-boundary split-brain the rider repaired, which stalled
//   every relayed-cloud-ack forward with it, DEC-SYNC-009/19 §5); and AT MOST
//   ONE clear-side recompute runs per suspicion episode (later frames from the
//   cleared device trigger no further election work — observed as exactly one
//   hello per episode and an undisturbed follower session).
//
// Constant-independence (carried item 1, explicit): the law is pinned across
// SEVERAL silence-window lengths — including values that are NOT multiples of
// HEARTBEAT_INTERVAL_MS or HUB_LOSS_TIMEOUT_MS — so the pin can never be
// satisfied by the 2000 | 6000 divisibility coincidence that produced the
// original split-brain. The suspect end is a SCRIPTED peer (the established
// rawPeer idiom): a real two-mesh heal-boundary variant is hostage to the
// deferred carried-item-3 residual (a suspect the real hub has ALREADY dropped
// sends no further frames — ruled at the transport/H-01 rung, not here), while
// the law under pin is purely the suspecting device's state machine.
import { createSim, type Sim } from "@restos/testing";
import { describe, expect, it } from "vitest";
import { HUB_LOSS_TIMEOUT_MS } from "../index.js";
import {
  helloAck,
  LOSSLESS,
  type MeshDevice,
  meshDevice,
  type RawPeer,
  rawPeer,
  wirePing,
} from "./mesh-builders.js";

/** Frames of one kind delivered to the scripted peer so far. */
const receivedOf = (peer: RawPeer, kind: string): number =>
  peer.received.filter((r) => r.message.kind === kind).length;

/**
 * Bring the mesh device to a connected follower of the scripted hub, then feed
 * `keepAliveRounds` hub pings at heartbeat cadence. Returns nothing — state is
 * asserted by the caller.
 */
const connectAndKeepAlive = (
  sim: Sim,
  device: MeshDevice,
  hub: RawPeer,
  session_id: string,
  keepAliveRounds: number,
): void => {
  sim.runFor(100); // device sees the scripted peer, computes it the winner, hellos it
  expect(device.session.status().hub_id).toBe(hub.info.device_id);
  hub.transport.send(device.info.device_id, helloAck(session_id, true, 0));
  sim.runFor(50); // hello_ack delivered — connected, loss check armed
  for (let i = 0; i < keepAliveRounds; i++) {
    hub.transport.send(device.info.device_id, wirePing(sim.now()));
    sim.runFor(2_000);
  }
};

/**
 * One full suspicion episode against the scripted hub: silence for `windowMs`
 * (the device falsely promotes itself), then ONE resume frame (a hub ping).
 * Asserts the R-a law and returns the pong count observed for the resume frame.
 */
const runEpisode = (
  sim: Sim,
  device: MeshDevice,
  hub: RawPeer,
  windowMs: number,
  nextSessionId: string,
): void => {
  const hubId = hub.info.device_id;
  // Silence: the hub stops sending. The loss check fires at idle ≥
  // HUB_LOSS_TIMEOUT_MS → the hub is suspected → the device promotes itself
  // (visible.size > 0, so state "hub" — the false-promotion precondition).
  sim.runFor(windowMs);
  expect(device.session.status().state).toBe("hub");
  expect(device.session.status().hub_id).toBe(device.info.device_id);

  const hellosBefore = receivedOf(hub, "hello");
  const pongsBefore = receivedOf(hub, "pong");

  // THE PINNED LAW (R-a): the suspect's next inbound frame clears suspicion and
  // re-runs the election in the SAME dispatch — no visibility event, no timer.
  hub.transport.send(device.info.device_id, wirePing(sim.now()));
  sim.runFor(10); // one 5 ms LAN hop + dispatch; no mesh timer period fits in 10 ms
  expect(device.session.status().state).toBe("follower");
  expect(device.session.status().hub_id).toBe(hubId);
  // The re-adoption hello left in the same dispatch as the clear.
  expect(receivedOf(hub, "hello")).toBe(hellosBefore + 1);
  // The frame BODY ran under the re-adopted state (recompute precedes the body):
  // a hub ping is answered with a pong, proving liveness was refreshed too.
  expect(receivedOf(hub, "pong")).toBe(pongsBefore + 1);

  // Complete the re-adopted handshake, then keep pinging: suspicion was cleared
  // ONCE — later frames from the cleared device run ZERO further election work.
  hub.transport.send(device.info.device_id, helloAck(nextSessionId, true, 0));
  sim.runFor(50);
  for (let i = 0; i < 3; i++) {
    hub.transport.send(device.info.device_id, wirePing(sim.now()));
    sim.runFor(2_000);
  }
  // ≤ 1 clear-side recompute per episode: exactly the one re-adoption hello —
  // a recompute storm (or a torn-down-and-rebuilt follower session) would
  // re-hello. The follower session is undisturbed.
  expect(receivedOf(hub, "hello")).toBe(hellosBefore + 1);
  expect(device.session.status().state).toBe("follower");
  expect(device.session.status().hub_id).toBe(hubId);
};

// Silence windows straddle HUB_LOSS_TIMEOUT_MS and deliberately include values
// that are NOT multiples of the 2 000 ms heartbeat or the 6 000 ms loss timeout:
// the law must hold for EVERY window long enough to trigger suspicion (idle at
// silence start is ≈ 2 000 ms, so suspicion fires ≈ window-start + 4 000 ms).
const WINDOWS_MS = [4_200, 5_000, HUB_LOSS_TIMEOUT_MS, 7_300, 9_000] as const;

describe("R-a — clearing a suspect on its inbound frame re-runs the election in the same dispatch (01-F13 / HUB-ELECTION.md / DEC-SYNC-009; t-01-12 fix round carried item 1)", () => {
  it.each([...WINDOWS_MS])(
    "01-F13/HUB-ELECTION.md/DEC-SYNC-009: after a %d ms silence window falsely promotes the follower, the suspected true hub's NEXT frame re-adopts it in the same dispatch — one hello, one recompute, no visibility event needed",
    (windowMs) => {
      const sim = createSim({ seed: 1_800 + windowMs });
      sim.lan.policy(LOSSLESS); // deterministic 5 ms hops, zero chaos
      const b = meshDevice(sim, "dev-b", "counter_electron");
      b.session.start();
      sim.runFor(100); // cold start: solo
      // The scripted true hub: same class, lexicographically lower id — outranks.
      const a = rawPeer(sim, "dev-a", "counter_electron");
      connectAndKeepAlive(sim, b, a, `suspect-clear-${windowMs}-s1`, 3);
      expect(b.session.status().state).toBe("follower");

      runEpisode(sim, b, a, windowMs, `suspect-clear-${windowMs}-s2`);

      b.session.stop();
      b.store.close();
    },
  );

  it("01-F13/HUB-ELECTION.md: per-EPISODE semantics — a second suspicion episode against the same device gets its own single clear-side recompute (re-suspect → re-adopt again, exactly one further hello)", () => {
    const sim = createSim({ seed: 1_899 });
    sim.lan.policy(LOSSLESS);
    const b = meshDevice(sim, "dev-b", "counter_electron");
    b.session.start();
    sim.runFor(100);
    const a = rawPeer(sim, "dev-a", "counter_electron");
    connectAndKeepAlive(sim, b, a, "episodes-s1", 3);

    // Episode 1 (a non-multiple window), then episode 2 (a different length):
    // each episode re-suspects, each re-adopts on the first frame, each spends
    // exactly one clear-side recompute — the set-based suspicion state resets
    // per episode, it is not a one-shot.
    runEpisode(sim, b, a, 6_700, "episodes-s2");
    runEpisode(sim, b, a, 4_300, "episodes-s3");

    b.session.stop();
    b.store.close();
  });
});
