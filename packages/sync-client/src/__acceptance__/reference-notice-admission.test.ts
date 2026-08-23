// `01-F81` (e) + `01-F17` — THE TWO THINGS A `reference_notice` MAY NOT DO: ask for a key this
// session was never advertised, and page for ever against a server that is not paging.
//
// ⚠ **THIS FILE IS IMPLEMENTER-AUTHORED AND IS NOT AN ORACLE.** `24 §3` disqualifies the session
// that writes an implementation from writing its acceptance tests, and the `01-F81` oracle is
// `device-roster-distribution.test.ts`, authored from spec text by another session. This is the
// hand-written assertion `AGENTS.md` requires for two defects no rail can see — both were found by
// adversarial review of `6932c85`, both reproduced against the shipped session before a line was
// changed, and both are recorded here with the numbers rather than the belief.
//
// ── WHY IT EXISTS: THE TWO MEASUREMENTS ────────────────────────────────────────────────────────
//
// **(1) `01-F81` (e)'s MUST held on ONE of two entry points.** That clause requires that "a device
// MUST NOT request an artifact key the session's `hello_ack` did not advertise, **for any
// resource**", and says it is written that way "so it is assertable rather than assumed". It was
// assumed. `hello_ack` obeyed it by construction (an omitted key returns `undefined` and
// `reconcile*` returns early); `reference_notice` compared against nothing. Measured 2026-08-23
// against the tree at `6932c85`:
//
//   · `hello_ack { reference_versions: [staff@2] }` → `device_roster` requests: **0** (correct)
//   · then `reference_notice { resource: "device_roster", version: 1 }` → requests: **1**
//   · `hello_ack` with NO `reference_versions`, then one notice per resource →
//     `staff`: **1**, `catalog`: **1**, `device_roster`: **1**
//
//   The window is `01-F77`'s own omitted-never-zero rule, which the same file relies on correctly
//   one function away: a gateway omits a key until the org has published something for it
//   (`services/sync-gateway/src/gateway.ts` builds `reference_versions` from `> 0` versions), so a
//   session that connects before a branch's first publish is advertised nothing — and then receives
//   the notice announcing that very first publish.
//
//   ⚠ **The live harm today is nil and that is not the reason to assert it.** A request for a key
//   is refused only by a gateway that does not serve the resource, and such a gateway emits no
//   notice for it either, so no shipped pair of peers reaches the refusal. The MUST is a checkable
//   property of the CLIENT; a property enforced on one of two entry points is this repo's
//   most-recorded shape.
//
//   ⚠ **AND ONLY HALF OF IT IS CLOSED — DELIBERATELY, WITH THE MEASUREMENT.** `hello_ack` has two
//   different absences: a `reference_versions` array with a key MISSING, and no `reference_versions`
//   field at all (the gateway omits it when it has zero keys, "which is what an org that has
//   published nothing has"). The first is the state (e) argues from and is now DROPPED. The second
//   is HONOURED, because the strict reading costs a shipped capability to close a refusal no
//   shipped peer can produce: a till connected to an org before its FIRST publish would drop the
//   notice announcing that publish and every later one, since the field stays absent for the whole
//   connection — the `v0 → v20` live path `plans/wave-1/running-the-stack.md` records as run end to
//   end. Measured: the strict reading also reddens TWO anchors in `staff-session.test.ts`, an
//   oracle authored from `01-F75`/`01-F76`/`01-F77` text by a session that wrote no implementation,
//   which encode `helloAck({})` + own-branch notice ⇒ fetch. Weakening an oracle anchor to pass is
//   forbidden, so the open half is reported for a ruling on (e) and asserted as-is below.
//
// **(2) `no_progress` was aimed one case away, in three copies.** The non-progress condition is
// `next_from <= 0` alone — a continuation echoes `next_from` as `from`, and every `request*` omits
// `from` when it is `0`, so the server sees a fresh first-page request and answers identically.
// All three arms also required `entries.length === 0`. Measured 2026-08-23 against a scripted
// gateway answering `{ complete: false, next_from: 0, entries: [one row] }` on every request:
//
//   · `device_roster`: **300** rounds, `device_roster_refusal` **null**
//   · `staff`:         **300** rounds, `staff_refusal`         **null**
//   · `catalog`:       **300** rounds, `catalog_refusal`       **null**
//
//   300 is where the probe harness stopped, not where the device did. The `staff` arm's own comment
//   already stated the purpose the condition only half met: "an unbounded receive-path loop is one
//   of the few things in this session that could stop a till selling … a hot loop against
//   credential storage".
//
// ── WHAT THIS FILE DOES NOT CLAIM ──────────────────────────────────────────────────────────────
//
//   · It asserts nothing about the SIGNATURE (`01-F81` (b)) — see `device-roster-apply.test.ts`.
//   · It does not close the neighbouring non-progress case: a cursor stuck at a NON-ZERO value
//     loops identically, and closing that needs the accumulators to remember their last cursor.
//     Named in `cloud-session.ts` at `noForwardProgress`, asserted nowhere, owed.
//   · It asserts nothing about whether a REFUSAL reaches a human. `device_roster_refusal` and
//     `staff_refusal` have zero production readers (measured 2026-08-23, comment-blind); the
//     consumer is owed and is recorded on the type.
//
// ── MUTATION MATRIX (round-3 law) — every row is the FULL package suite ─────────────────────────
//
//   CONTROL (this tree): 918 passed / 919. The one red is `device-roster-distribution.test.ts` §4,
//   deliberate and pre-existing (`setLanCredential` has no shipping caller until `01-F80` pairing).
//   Every "pre-existing" column below EXCLUDES it.
//
//   | # | mutant (exactly one branch of `cloud-session.ts`)             | kills here | pre-existing |
//   |---|--------------------------------------------------------------|-----------:|-------------:|
//   | A | all three notice arms un-gated (the shipped state)           |          5 |            0 |
//   | A1| only the `device_roster` arm un-gated                        |          4 |            0 |
//   | A2| `wasAdvertised` returns `true` always — a SUPPLIED stub       |          5 |            0 |
//   | A3| `hello_ack` MERGES the advertised set instead of replacing    |          2 |            2 |
//   | A4| `onDown` no longer clears the set                            |          1 |            0 |
//   | A5| match on `resource` only, not the whole `01-F76` key         |          1 |            0 |
//   | A6| the STRICT reading of (e): an absent field advertises nothing |          1 |            2 |
//   | B | `no_progress` also requires an empty page — THE shipped bug   |          3 |            0 |
//   | B2| CONTROL: `noForwardProgress` always true (paging deleted)     |          2 |            1 |
//   | C | swap the `device_roster` foreign/ignore check order          |          0 |            0 |
//   | C2| swap the `staff` foreign/ignore check order                  |          0 |            0 |
//
//   **Read row B first: the shipped defect failed ZERO of the 915 tests that already existed.**
//   **Row A2 is the seam control** — a guard that is present, called and inert dies exactly as the
//   missing guard does, so these assertions are about behaviour and not about a call site.
//   **Row B2 is the over-reach control** — an implementation that refused everything would satisfy
//   the three `no_progress` assertions, and it kills the paging control instead.
//   **Rows A3 and A6 are the two that reach the `staff-session.test.ts` ORACLE**, which is how the
//   open half above was measured rather than argued: A6 IS the strict reading, and it reddens two
//   anchors authored from spec text by a session that wrote no implementation.
//   **Rows C and C2 kill nothing and CANNOT** — see the ordering comment in `cloud-session.ts`.

import { createHash } from "node:crypto";
import type {
  CloudTransport,
  CloudTransportHandlers,
  ProtocolMessage,
} from "@restos/sync-protocol";
import { PROTOCOL_VERSION, parseMessage } from "@restos/sync-protocol";
import { describe, expect, it } from "vitest";
import { createCloudSession, openStore, wallClock } from "../index.js";
import { BRANCH, meshIdentity, ORG } from "./mesh-builders.js";

const DEVICE_ID = "till-notice-admission";
const BRANCH_SCOPE = { org_id: ORG, branch_id: BRANCH } as const;
const ORG_SCOPE = { org_id: ORG, branch_id: null } as const;

const fingerprint = (seed: string): string => createHash("sha256").update(seed).digest("hex");

/** Well-FORMED and not valid — nothing on this device verifies it yet (`01-F81` (b)). */
const SIGNATURE = {
  alg: "ES256" as const,
  signed_at: 1_756_000_000_000,
  value: Buffer.alloc(64, 7).toString("base64"),
};

/** A scripted cloud uplink: records what the session SENT, delivers what a test scripts. */
const scriptedCloud = () => {
  const sent: ProtocolMessage[] = [];
  let handlers: CloudTransportHandlers | null = null;
  const transport: CloudTransport = {
    start(h) {
      handlers = h;
      h.onUp();
    },
    stop() {
      handlers?.onDown();
      handlers = null;
    },
    send(message) {
      sent.push(message);
    },
  };
  return {
    transport,
    sent,
    /** A WAN bounce: the link drops and comes back, without the session being stopped. */
    bounce() {
      handlers?.onDown();
      handlers?.onUp();
    },
    deliver(message: unknown) {
      handlers?.onMessage(parseMessage(message));
    },
  };
};

const requestsFor = (sent: readonly ProtocolMessage[], resource: string): number =>
  sent.filter(
    (m) =>
      m.kind === "reference_request" &&
      (m as unknown as { resource: string }).resource === resource,
  ).length;

/** A live session whose `hello_ack` advertised exactly `keys` (pass `undefined` for the field's absence). */
const connected = (keys?: readonly { resource: string; scope: unknown; version: number }[]) => {
  const cloud = scriptedCloud();
  const store = openStore({ path: ":memory:", identity: meshIdentity(DEVICE_ID) });
  const session = createCloudSession({
    store,
    transport: cloud.transport,
    clock: wallClock,
    device_class: "counter_electron",
    token: "cloud-token-not-under-test",
  });
  session.start();
  cloud.deliver({
    v: PROTOCOL_VERSION,
    kind: "hello_ack",
    session_id: "s-1",
    hub: false,
    resume_from: 0,
    ...(keys === undefined ? {} : { reference_versions: keys }),
  });
  return { cloud, store, session };
};

const notice = (resource: string, scope: unknown, version: number) => ({
  v: PROTOCOL_VERSION,
  kind: "reference_notice",
  resource,
  scope,
  version,
});

const helloAck = (keys?: readonly { resource: string; scope: unknown; version: number }[]) => ({
  v: PROTOCOL_VERSION,
  kind: "hello_ack",
  session_id: "s-n",
  hub: false,
  resume_from: 0,
  ...(keys === undefined ? {} : { reference_versions: keys }),
});

const rosterRow = (seed: string) => ({
  device_id: seed,
  device_class: "counter_electron",
  cert_sha256: fingerprint(seed),
  revoked: false,
});

const staffRow = (seed: string) => ({
  user_id: seed,
  display_name: `Cashier ${seed}`,
  grid_ordinal: 1,
  status: "active",
  assignments: [{ role: "cashier", branch_id: BRANCH }],
});

const catalogRow = (seed: string) => ({
  kind: "item",
  id: seed,
  name: `Item ${seed}`,
  deleted: false,
});

/**
 * Land a COMPLETE snapshot so no fetch is left in flight. Without this every control below is
 * vacuous: `reconcile*` returns early while a fetch is running ("a fetch in flight is never
 * restarted"), so a notice would produce no request whatever the advertisement said, and the
 * assertion would pass against an implementation with no guard at all.
 */
const landSnapshot = (
  cloud: { deliver(m: unknown): void },
  resource: "device_roster" | "staff" | "catalog",
  scope: unknown,
  version: number,
) => {
  const entries =
    resource === "device_roster"
      ? [rosterRow(`seed-${version}`)]
      : resource === "staff"
        ? [staffRow(`seed-${version}`)]
        : [catalogRow(`seed-${version}`)];
  cloud.deliver({
    v: PROTOCOL_VERSION,
    kind: "reference_response",
    resource,
    scope,
    form: "snapshot",
    version,
    complete: true,
    next_from: 0,
    entries,
    ...(resource === "device_roster" ? { signature: SIGNATURE } : {}),
  });
};

describe("01-F81 (e) — a notice for a key `hello_ack` did not advertise starts NOTHING", () => {
  it("device_roster: advertised `staff` only, noticed `device_roster` — no request is sent", () => {
    const { cloud, store, session } = connected([
      { resource: "staff", scope: BRANCH_SCOPE, version: 2 },
    ]);
    try {
      expect(
        requestsFor(cloud.sent, "device_roster"),
        "the `hello_ack` path already obeyed (e): an omitted key is `undefined` and reconciles nothing",
      ).toBe(0);

      cloud.deliver(notice("device_roster", BRANCH_SCOPE, 1));

      expect(
        requestsFor(cloud.sent, "device_roster"),
        "01-F81 (e): a device MUST NOT request an artifact key the session's `hello_ack` did not " +
          "advertise, FOR ANY RESOURCE — and a notice names a key, it does not advertise one. " +
          "Dropping it costs freshness and never correctness: the next `hello_ack` reconciles " +
          "every key the gateway serves (`01-F77`)",
      ).toBe(0);

      session.stop();
    } finally {
      store.close();
    }
  });

  it("catalog and staff: a key OMITTED from a stated advertisement is dropped too — (e) is 'for any resource'", () => {
    const { cloud, store, session } = connected([
      { resource: "device_roster", scope: BRANCH_SCOPE, version: 1 },
    ]);
    try {
      landSnapshot(cloud, "device_roster", BRANCH_SCOPE, 1);
      const before = {
        staff: requestsFor(cloud.sent, "staff"),
        catalog: requestsFor(cloud.sent, "catalog"),
      };

      cloud.deliver(notice("staff", BRANCH_SCOPE, 5));
      cloud.deliver(notice("catalog", ORG_SCOPE, 5));

      expect(
        [
          requestsFor(cloud.sent, "staff") - before.staff,
          requestsFor(cloud.sent, "catalog") - before.catalog,
        ],
        "01-F81 (e) is 'for ANY resource' — the roster is not a special case, and a gateway that " +
          "stated its keys and omitted these two has not offered them",
      ).toEqual([0, 0]);

      session.stop();
    } finally {
      store.close();
    }
  });

  it("⚠ PINS THE OPEN HALF: a `hello_ack` with NO `reference_versions` AT ALL still honours a notice", () => {
    // **THIS ASSERTS WHAT THE CODE DOES, AND THE CODE DOES NOT ENFORCE THE MUST HERE.** Read the
    // header and `cloud-session.ts`'s `advertisedKeys` declaration before changing it: the strict
    // reading of `01-F81` (e) would make all three of these `0`, and it would also kill the live
    // catalog delta for every org before its first publish and redden two `staff-session.test.ts`
    // anchors. This test exists so that a ruling on (e) has to come THROUGH it — flipping the
    // behaviour reddens a named assertion rather than silently changing what a till does.
    const { cloud, store, session } = connected(undefined);
    try {
      cloud.deliver(notice("staff", BRANCH_SCOPE, 1));
      cloud.deliver(notice("catalog", ORG_SCOPE, 1));
      cloud.deliver(notice("device_roster", BRANCH_SCOPE, 1));

      expect(
        [
          requestsFor(cloud.sent, "staff"),
          requestsFor(cloud.sent, "catalog"),
          requestsFor(cloud.sent, "device_roster"),
        ],
        "OPEN, not settled: no advertisement was made, so `01-F81` (e)'s 'a client that ignored " +
          "the advertisement' has none to have ignored. `01-F75`'s freshness path is what would be " +
          "lost, and the refusal it would avoid is one no shipped gateway can produce",
      ).toEqual([1, 1, 1]);

      session.stop();
    } finally {
      store.close();
    }
  });

  it("the guard is a MEMBERSHIP test, not a mute: an ADVERTISED key still fetches on a notice", () => {
    // THE CONTROL. Without it, an implementation that dropped EVERY notice would pass both
    // assertions above — and would delete `01-F75`'s freshness path, which is the whole reason a
    // notice exists. One branch apart from them.
    const { cloud, store, session } = connected([
      { resource: "device_roster", scope: BRANCH_SCOPE, version: 1 },
      { resource: "staff", scope: BRANCH_SCOPE, version: 1 },
      { resource: "catalog", scope: ORG_SCOPE, version: 1 },
    ]);
    try {
      landSnapshot(cloud, "device_roster", BRANCH_SCOPE, 1);
      landSnapshot(cloud, "staff", BRANCH_SCOPE, 1);
      landSnapshot(cloud, "catalog", ORG_SCOPE, 1);
      const after = {
        roster: requestsFor(cloud.sent, "device_roster"),
        staff: requestsFor(cloud.sent, "staff"),
        catalog: requestsFor(cloud.sent, "catalog"),
      };

      cloud.deliver(notice("device_roster", BRANCH_SCOPE, 7));
      cloud.deliver(notice("staff", BRANCH_SCOPE, 7));
      cloud.deliver(notice("catalog", ORG_SCOPE, 7));

      expect(
        [
          requestsFor(cloud.sent, "device_roster") - after.roster,
          requestsFor(cloud.sent, "staff") - after.staff,
          requestsFor(cloud.sent, "catalog") - after.catalog,
        ],
        "01-F75's freshness path survives the guard: a key this session WAS advertised is fetched " +
          "on the notice, without waiting for a reconnect",
      ).toEqual([1, 1, 1]);

      session.stop();
    } finally {
      store.close();
    }
  });

  it("01-F76: an advertisement is matched on the WHOLE key — another branch's roster is not one", () => {
    const { cloud, store, session } = connected([
      {
        resource: "device_roster",
        scope: { org_id: ORG, branch_id: "branch-elsewhere" },
        version: 5,
      },
    ]);
    try {
      cloud.deliver(notice("device_roster", BRANCH_SCOPE, 5));
      expect(
        requestsFor(cloud.sent, "device_roster"),
        "01-F76: a version means nothing without the `(resource, scope)` it counts, so matching on " +
          "`resource` alone would let a fan-out key for a sibling branch authorize this device's " +
          "own request",
      ).toBe(0);

      session.stop();
    } finally {
      store.close();
    }
  });

  it("a later `hello_ack` REPLACES the advertised set — it does not merge with the last one", () => {
    const { cloud, store, session } = connected([
      { resource: "device_roster", scope: BRANCH_SCOPE, version: 1 },
    ]);
    try {
      landSnapshot(cloud, "device_roster", BRANCH_SCOPE, 1);
      const baseline = requestsFor(cloud.sent, "device_roster");

      // A gateway that has stopped serving the resource (a rollback mid-fleet) states the keys it
      // still has, and this one is not among them.
      cloud.deliver(helloAck([{ resource: "staff", scope: BRANCH_SCOPE, version: 1 }]));
      cloud.deliver(notice("device_roster", BRANCH_SCOPE, 9));

      expect(
        requestsFor(cloud.sent, "device_roster"),
        "01-F81 (e): `?? []` and not 'keep the previous set'. Carrying a superseded " +
          "advertisement forward is how a device asks a gateway for a key that gateway has just " +
          "stopped offering it",
      ).toBe(baseline);

      session.stop();
    } finally {
      store.close();
    }
  });

  it("an advertisement belongs to ONE connection — a WAN bounce clears it", () => {
    const { cloud, store, session } = connected([
      { resource: "device_roster", scope: BRANCH_SCOPE, version: 1 },
    ]);
    try {
      landSnapshot(cloud, "device_roster", BRANCH_SCOPE, 1);
      const baseline = requestsFor(cloud.sent, "device_roster");

      cloud.bounce(); // onDown → onUp: the link is back and no `hello_ack` has landed yet
      cloud.deliver(notice("device_roster", BRANCH_SCOPE, 9));

      expect(
        requestsFor(cloud.sent, "device_roster"),
        "01-F81 (e): the NEXT session's `hello_ack` states what it serves, and until it lands this " +
          "session has been advertised nothing",
      ).toBe(baseline);

      session.stop();
    } finally {
      store.close();
    }
  });
});

describe("01-F17 — a server that is not paging is refused, on every resource", () => {
  /**
   * Drives one resource's fetch and returns how many requests the device sent before it stopped.
   * The scripted server answers every request with an INCOMPLETE page carrying `next_from: 0` and
   * one row — the shape all three arms judged to be progress.
   */
  const pageForever = (
    resource: "device_roster" | "staff" | "catalog",
    scope: unknown,
    page: (i: number) => unknown,
  ) => {
    const { cloud, store, session } = connected([
      { resource, scope, version: 9 } as { resource: string; scope: unknown; version: number },
    ]);
    let rounds = 0;
    for (let i = 0; i < 300; i += 1) {
      const before = requestsFor(cloud.sent, resource);
      cloud.deliver(page(i));
      if (requestsFor(cloud.sent, resource) === before) break;
      rounds += 1;
    }
    const status = session.status();
    session.stop();
    store.close();
    return { rounds, status };
  };

  it("device_roster: a page with rows and `next_from: 0` is `no_progress`, not progress", () => {
    const { rounds, status } = pageForever("device_roster", BRANCH_SCOPE, (i) => ({
      v: PROTOCOL_VERSION,
      kind: "reference_response",
      resource: "device_roster",
      scope: BRANCH_SCOPE,
      form: "snapshot",
      version: 9,
      complete: false,
      next_from: 0,
      entries: [
        {
          device_id: `peer-${i}`,
          device_class: "counter_electron",
          cert_sha256: fingerprint(`peer-${i}`),
          revoked: false,
        },
      ],
      signature: SIGNATURE,
    }));

    expect(
      rounds,
      "01-F17: the device asks ONCE more and stops. A continuation echoes `next_from` as `from` " +
        "and `from: 0` is omitted, so this request is byte-identical to the first page's — the " +
        "rows are a payload on a cursor that never moves",
    ).toBe(0);
    expect(
      status.device_roster_refusal,
      "01-F56 + DEC-SYNC-011: the refusal is OBSERVABLE rather than a silent stall",
    ).toEqual({ reason: "no_progress", have_version: 0 });
  });

  it("staff: the same page is `no_progress` — the arm whose own comment named the hazard", () => {
    const { rounds, status } = pageForever("staff", BRANCH_SCOPE, (i) => ({
      v: PROTOCOL_VERSION,
      kind: "reference_response",
      resource: "staff",
      scope: BRANCH_SCOPE,
      form: "snapshot",
      version: 9,
      complete: false,
      next_from: 0,
      entries: [
        {
          user_id: `u-${i}`,
          display_name: `Cashier ${i}`,
          grid_ordinal: i + 1,
          status: "active",
          assignments: [{ role: "cashier", branch_id: BRANCH }],
        },
      ],
    }));

    expect(
      rounds,
      "01-F17: 'an unbounded receive-path loop is one of the few things in this session that " +
        "could stop a till selling … a hot loop against credential storage' — that comment shipped " +
        "beside a condition that required an EMPTY page",
    ).toBe(0);
    expect(status.staff_refusal).toEqual({ reason: "no_progress", have_version: 0 });
  });

  it("catalog: the same page is `no_progress` — the arm the token was inherited from", () => {
    const { rounds, status } = pageForever("catalog", ORG_SCOPE, (i) => ({
      v: PROTOCOL_VERSION,
      kind: "reference_response",
      resource: "catalog",
      scope: ORG_SCOPE,
      form: "snapshot",
      version: 9,
      complete: false,
      next_from: 0,
      entries: [{ kind: "item", id: `e-${i}`, name: `Item ${i}`, deleted: false }],
    }));

    expect(rounds, "01-F17: `pending` does not grow one page per round for ever").toBe(0);
    expect(status.catalog_refusal).toEqual({ reason: "no_progress", have_version: 0 });
  });

  it("THE CONTROL: a page that DOES advance the cursor is paged, not refused", () => {
    // One branch apart from the three above. Without it, `noForwardProgress` returning `true`
    // unconditionally would pass every assertion in this describe while deleting paging entirely —
    // and a paged snapshot is the case `01-F56`'s atomicity exists for.
    const { cloud, store, session } = connected([
      { resource: "device_roster", scope: BRANCH_SCOPE, version: 9 },
    ]);
    try {
      const before = requestsFor(cloud.sent, "device_roster");
      cloud.deliver({
        v: PROTOCOL_VERSION,
        kind: "reference_response",
        resource: "device_roster",
        scope: BRANCH_SCOPE,
        form: "snapshot",
        version: 9,
        complete: false,
        next_from: 1,
        entries: [
          {
            device_id: "peer-paged",
            device_class: "counter_electron",
            cert_sha256: fingerprint("peer-paged"),
            revoked: false,
          },
        ],
        signature: SIGNATURE,
      });
      expect(
        requestsFor(cloud.sent, "device_roster") - before,
        "a cursor that MOVED is the server paging: the device asks for the next page",
      ).toBe(1);
      expect(
        session.status().device_roster_refusal,
        "and nothing is refused — `no_progress` on a paging server would stall every fetch of an " +
          "artifact bigger than one frame",
      ).toBeNull();

      session.stop();
    } finally {
      store.close();
    }
  });
});
