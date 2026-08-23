// `01-F75` + `01-F17` — THE TWO THINGS A `reference_notice` MUST DO: reach the device for the key
// it names, and never page for ever against a server that is not paging.
//
// ⚠ **THIS FILE IS IMPLEMENTER-AUTHORED AND IS NOT AN ORACLE.** `24 §3` disqualifies the session
// that writes an implementation from writing its acceptance tests, and the `01-F81` oracle is
// `device-roster-distribution.test.ts`, authored from spec text by another session. This is the
// hand-written assertion `AGENTS.md` requires for defects no rail can see — every number below was
// measured against a running session before a line of it was written.
//
// ⚠ **THIS FILE ONCE ASSERTED THE OPPOSITE OF WHAT IT NOW ASSERTS, AND THE REVERSAL IS THE POINT.**
// `0073f69` gated all three notice arms on membership of `hello_ack.reference_versions`, and this
// file pinned that — one case titled *"a key OMITTED from a stated advertisement is dropped too"*.
// Adversarial review returned **DO NOT SHIP** and the commit never left the machine. The
// assertions were INVERTED rather than deleted, on `oracle-round-2-findings.md` §C's own law: a
// test pinning measured-false behaviour retires the assertion the next session would otherwise
// write, so this file has to end up asserting the corrected behaviour with the reason in it.
//
// ── WHY THE GUARD WAS WRONG: `01-F77`'s ADVERTISEMENT CARRIES A DIFFERENT FACT ─────────────────
//
// `01-F81` (e) reads *"a device MUST NOT request an artifact key the session's `hello_ack` did not
// advertise, **for any resource**"*, and it argues from the staged-rollout state: a gateway that
// does not SERVE a resource omits its key. But `services/sync-gateway/src/gateway.ts` builds the
// field PER KEY from `catalogVersionAtHello > 0` and `staffVersionAtHello > 0`, and omits the whole
// field only when EVERY key is empty. It says so in its own words at that site, calling an omitted
// key *"indistinguishable from a gateway that does not serve the resource"*. So the advertisement
// conflates two facts — *"this gateway serves resource R"* and *"key K has a published artifact"* —
// and the wire carries only the second. **"Field present, key missing" is therefore not the
// rollout case at all; it is, far more often, "this key has published nothing YET"** — which is by
// construction the key whose first notice matters most.
//
// Probes against the guarded tree, against the same probes on the tree before it (`6932c85`):
//
//   | probe | `hello_ack.reference_versions` | notice                        | guarded | before |
//   |-------|--------------------------------|-------------------------------|--------:|-------:|
//   | P1    | `[catalog@4]`                  | branch's FIRST `staff` publish |      0 |      1 |
//   | P2    | `[staff@3]`                    | org's FIRST `catalog` publish  |      0 |      1 |
//   | P3    | *(field absent)*               | `catalog` v1                   |      1 |      1 |
//   | P7    | `[staff@3]`                    | TWENTY catalog publishes v1..20|      0 |     20 |
//
//   P7 is the finding in one line: the till stayed at catalog **v0** through all twenty, so the
//   `v0 → v20` live path `plans/wave-1/running-the-stack.md` records as run end to end was DEAD for
//   the life of the connection — for any org whose branch has a published staff roster.
//   `services/sync-gateway/src/publish-http.ts`'s `/internal/users*` routes (`announce:
//   notifyStaffVersion`) are the shipping writer that fills `kernel.staff_versions`; it survived
//   the runbook only because that seeds staff from env and leaves the table empty.
//   **P7s, the staff twin, is the sharper one**: `store.staff` is the identity registry the unlock
//   grid is built from (`apps/pos-electron/src/main/index.ts` calls `store.staff.list()`), so a
//   branch's FIRST cashier never appeared on the till.
//
// ⚠ **AND (e)'s RESIDUAL IS A SERVER'S REFUSAL, NOT A CLIENT'S DROP.** (e) bounds the cost as *"a
// session lost that way costs a reconnect and `hello_ack` reconciles every key on the next one"*.
// A client-side drop produces neither: no refusal slot is set (and no refusal slot has a production
// reader except `catalog_refusal`), and `transport-ws.ts` reconnects only on `close`/`error` with
// no keepalive re-hello. The guard inherited the justification without the precondition, and the
// outage was unbounded and silent instead of one reconnect.
//
// **Both alternatives fail structurally and neither is to be re-attempted.** Honouring absence only
// until the first field-carrying `hello_ack` does not help — the harmful case has the field
// PRESENT. Making the gateway always send the field is strictly worse — it would send `[]`, and the
// first publish of any key still arrives after the advertisement was made. **The advertised set is
// a snapshot at connect time, and the key whose freshness matters most is the one that did not
// exist yet.**
//
// **WHERE (e) IS STILL ENFORCED, and asserted below rather than assumed: the `hello_ack` path, by
// construction.** An omitted key returns `undefined` from `catalogVersionIn`/`staffVersionIn`/
// `deviceRosterVersionIn` and every `reconcile*` returns early on it. **A one-field wire amendment
// to `01-F77`/`01-F81` (e) — `hello_ack` stating the SERVED RESOURCE SET as a fact distinct from
// the per-key versions — is OWED as a spec act**, and is not attempted from here: doc 01 is at its
// `23-F3` line cap, and a wire field invented by a client is the `01-F4`-shaped error one layer
// down.
//
// ── THE SECOND DEFECT THIS FILE OWNS: `no_progress` WAS AIMED ONE CASE AWAY, IN THREE COPIES ────
//
// The non-progress condition is `next_from <= 0` alone — a continuation echoes `next_from` as
// `from`, and every `request*` omits `from` when it is `0`, so the server sees a fresh first-page
// request and answers it identically. All three arms also required `entries.length === 0`.
// Measured against a scripted gateway answering `{ complete: false, next_from: 0, entries: [one
// row] }` on every request: `device_roster` **300** rounds with `device_roster_refusal` **null**,
// `staff` **300** with `staff_refusal` **null**, `catalog` **300** with `catalog_refusal` **null**
// — 300 being where the probe harness stopped, not where the device did. That fix is `0073f69`'s
// and is KEPT; only the `01-F81` (e) guard was reverted.
//
// ── WHAT THIS FILE DOES NOT CLAIM ──────────────────────────────────────────────────────────────
//
//   · It asserts nothing about the SIGNATURE (`01-F81` (b)) — see `device-roster-apply.test.ts`.
//   · It does not close either neighbouring non-progress case, both named at `noForwardProgress`:
//     a cursor stuck at a NON-ZERO value, and `catchup_response`, which has no forward-progress
//     guard of ANY kind (measured: **300** rounds of `catchup_request { from_global_seq: 7 }`
//     against `{ complete: false, next_from: 7, events: [] }`). The second is the LEDGER path and
//     is a separate act with its own review.
//   · It asserts nothing about whether a REFUSAL reaches a human. `device_roster_refusal` and
//     `staff_refusal` have zero production readers (measured, comment-blind); the consumer is owed
//     and is recorded on the type.
//
// ── MUTATION MATRIX (round-3 law) — every row is the FULL package suite ─────────────────────────
//
//   CONTROL (this tree): 919 passed / 920. The one red is `device-roster-distribution.test.ts` §4,
//   deliberate and pre-existing (`setLanCredential` has no shipping caller until `01-F80` pairing).
//   Every "pre-existing" column below EXCLUDES it.
//
//   | # | mutant (exactly one branch of `cloud-session.ts`)               | kills here | pre-existing |
//   |---|----------------------------------------------------------------|-----------:|-------------:|
//   | A | RE-ADD the reverted guard to all three notice arms — `0073f69`  |          4 |            0 |
//   | A1| RE-ADD it to the `catalog` arm ONLY                             |          2 |            0 |
//   | A2| RE-ADD it to the `staff` arm ONLY                               |          2 |            0 |
//   | A3| the `device_roster` arm drops `isOwnBranchKey` — `01-F76` gone  |          1 |            0 |
//   | A4| every notice arm muted (`reconcile*` never called from here)    |          6 |            6 |
//   | A5| `deviceRosterVersionIn` matches on SCOPE only, not the whole key|          1 |            1 |
//   | B | `no_progress` also requires an empty page — the fixed defect     |          3 |            0 |
//   | B2| CONTROL: `noForwardProgress` always true (paging deleted)       |          1 |            1 |
//
//   **Row A is the regression this file exists for** — the reverted commit, re-applied verbatim:
//   it kills P1, P2, P7 and P7s and NOTHING ELSE in 919 tests, which is the measurement that says
//   the defect was invisible to every suite that existed when it shipped.
//   **A1 and A2 are the attribution controls.** Each guards ONE arm, and each kills exactly the two
//   rows on that arm's axis — A1 → P2 + P7 (catalog), A2 → P1 + P7s (staff) — so the kill count in
//   row A is four distinct properties and not one assertion counted four times.
//   **Row A4 is the over-reach control**: an implementation that dropped EVERY notice satisfies no
//   assertion here (6 killed) and reddens **five** anchors in `staff-session.test.ts`, an ORACLE
//   authored from `01-F75`/`01-F76`/`01-F77` text by a session that wrote no implementation. That is
//   what stops the P-rows being read as "any fetch will do".
//   **Row A5 is the class that IS closed** — `01-F81` (e) on the `hello_ack` path. It kills the
//   assertion below AND the `01-F81` (e) anchor in the `device-roster-distribution.test.ts` oracle,
//   so both halves of (e) are named here: the enforceable one is asserted, the unenforceable one is
//   argued and left open with the wire amendment it needs.
//   **Row B2 is the paging over-reach control**, unchanged from `0073f69`.

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

describe("01-F75 — a `reference_notice` starts a fetch for the key it names, whatever `hello_ack` advertised", () => {
  it("P1 — the branch's FIRST `staff` publish reaches a till whose `hello_ack` carried only `catalog`", () => {
    // REGRESSION. Under `0073f69` this was 0: the gateway omits the `staff` key while
    // `staffVersion === 0` (`gateway.ts`, `staffVersionAtHello > 0`), so the very publish that
    // creates the roster is the one the guard dropped.
    const { cloud, store, session } = connected([
      { resource: "catalog", scope: ORG_SCOPE, version: 4 },
    ]);
    try {
      const before = requestsFor(cloud.sent, "staff");

      cloud.deliver(notice("staff", BRANCH_SCOPE, 1));

      expect(
        requestsFor(cloud.sent, "staff") - before,
        "`01-F75`: the notice is the FRESHNESS path and a key absent from `hello_ack` is far more " +
          "often 'nothing published for it yet' than 'this gateway does not serve it' — the " +
          "advertisement is built per key from published versions and cannot tell the two apart",
      ).toBe(1);

      session.stop();
    } finally {
      store.close();
    }
  });

  it("P2 — the org's FIRST `catalog` publish reaches a till whose `hello_ack` carried only `staff`", () => {
    // REGRESSION, the other axis: 0 under `0073f69`.
    const { cloud, store, session } = connected([
      { resource: "staff", scope: BRANCH_SCOPE, version: 3 },
    ]);
    try {
      const before = requestsFor(cloud.sent, "catalog");

      cloud.deliver(notice("catalog", ORG_SCOPE, 1));

      expect(
        requestsFor(cloud.sent, "catalog") - before,
        "`01-F52`/`01-F75`: an org's first menu publish must reach a till already connected — the " +
          "back office promises 'every till in the organisation changes as soon as this saves'",
      ).toBe(1);

      session.stop();
    } finally {
      store.close();
    }
  });

  it("P7 — twenty catalog publishes move a CONNECTED, idle till v0 → v20 with no reconnect", () => {
    // THE FINDING IN ONE TEST. Under `0073f69` this was 0 requests and version 0 — the live delta
    // path dead for the life of the connection, for any org whose branch has a published roster.
    const { cloud, store, session } = connected([
      { resource: "staff", scope: BRANCH_SCOPE, version: 3 },
    ]);
    try {
      const before = requestsFor(cloud.sent, "catalog");
      for (let v = 1; v <= 20; v += 1) {
        cloud.deliver(notice("catalog", ORG_SCOPE, v));
        // A gateway answers only a fetch the device actually started, so a dropped notice leaves
        // nothing to serve — which is exactly how the guarded till stayed at v0 in silence.
        if (requestsFor(cloud.sent, "catalog") > before + (v - 1)) {
          landSnapshot(cloud, "catalog", ORG_SCOPE, v);
        }
      }

      expect(
        [requestsFor(cloud.sent, "catalog") - before, store.catalog.version()],
        "`plans/wave-1/running-the-stack.md` records this run end to end: a menu authored one " +
          "entry at a time, a till connected and idle throughout, v0 → v20 with no restart",
      ).toEqual([20, 20]);

      session.stop();
    } finally {
      store.close();
    }
  });

  it("P7s — the STAFF twin of P7: a branch's first cashier reaches the unlock grid without a reconnect", () => {
    // The sharper half of the same defect. `store.staff` is the identity registry
    // (`apps/pos-electron/src/main/index.ts` builds the unlock grid from `store.staff.list()`),
    // so under `0073f69` a branch's first cashier could not sign in until something dropped the
    // socket — and nothing would, since a dropped notice sets no refusal and forces no reconnect.
    const { cloud, store, session } = connected([
      { resource: "catalog", scope: ORG_SCOPE, version: 4 },
    ]);
    try {
      const before = requestsFor(cloud.sent, "staff");
      for (let v = 1; v <= 20; v += 1) {
        cloud.deliver(notice("staff", BRANCH_SCOPE, v));
        if (requestsFor(cloud.sent, "staff") > before + (v - 1)) {
          landSnapshot(cloud, "staff", BRANCH_SCOPE, v);
        }
      }

      expect(
        [
          requestsFor(cloud.sent, "staff") - before,
          store.staff.version(),
          store.staff.list().length,
        ],
        "`01-F26`/`01-F28`: the roster the till identifies people from is reference data on this " +
          "same path, so a notice dropped here is a cashier who cannot sign in",
      ).toEqual([20, 20, 1]);

      session.stop();
    } finally {
      store.close();
    }
  });

  it("P3 — a `hello_ack` with NO `reference_versions` at all honours a notice, on every resource", () => {
    // Unchanged by the revert (it was the one case `0073f69` carved out), and kept because it is
    // the state of an org that has published NOTHING: the gateway omits the whole field, and the
    // first publish of any key is announced on this path.
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
        "the gateway omits the field entirely when it holds zero keys, 'which is what an org that " +
          "has published nothing has' — so this is the empty org's first publish",
      ).toEqual([1, 1, 1]);

      session.stop();
    } finally {
      store.close();
    }
  });

  it("an ADVERTISED key still fetches on a notice — the freshness path is not resource-specific", () => {
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
        "`01-F75`: a later version on a key the device already holds is fetched on the notice, " +
          "without waiting for a reconnect",
      ).toEqual([1, 1, 1]);

      session.stop();
    } finally {
      store.close();
    }
  });

  it("01-F76 — the ONE test this path CAN decide: a notice for ANOTHER branch's roster starts nothing", () => {
    // The scope test survives the revert and the membership test does not, and the difference is
    // what the wire carries. `scope` is ON the notice, so "this artifact is not mine" is decidable
    // from the message itself; "this gateway does not serve the resource" is not, because the only
    // field that could say so counts PUBLISHED VERSIONS. The reverted guard conflated the two.
    const { cloud, store, session } = connected([
      { resource: "device_roster", scope: BRANCH_SCOPE, version: 1 },
    ]);
    try {
      landSnapshot(cloud, "device_roster", BRANCH_SCOPE, 1);
      const baseline = requestsFor(cloud.sent, "device_roster");

      cloud.deliver(notice("device_roster", { org_id: ORG, branch_id: "branch-elsewhere" }, 9));

      expect(
        requestsFor(cloud.sent, "device_roster"),
        "`01-F76`: a version means nothing without the `(resource, scope)` it counts — a sibling " +
          "branch's roster is an artifact this device does not hold and starts nothing",
      ).toBe(baseline);

      session.stop();
    } finally {
      store.close();
    }
  });

  it("01-F81 (e) IS enforced where it is enforceable: an omitted key is never asked for AT HELLO", () => {
    // THE CLASS THAT IS CLOSED, asserted rather than claimed in prose — this repo's own most
    // recorded failure is a protection stated in a comment that retires the assertion nobody then
    // wrote. `hello_ack` omitting a key returns `undefined` from `*VersionIn` and `reconcile*`
    // returns early, so no request leaves the device for it. `01-F77`: OMITTED, never `0` — a
    // `?? 0` here would have every till in the fleet asking a gateway that cannot answer.
    const { cloud, store, session } = connected([
      { resource: "staff", scope: BRANCH_SCOPE, version: 2 },
    ]);
    try {
      expect(
        [requestsFor(cloud.sent, "device_roster"), requestsFor(cloud.sent, "catalog")],
        "`01-F81` (e) on the `hello_ack` path: a device MUST NOT request an artifact key the " +
          "session's `hello_ack` did not advertise. This half needs no guard — an omitted key is " +
          "`undefined` and reconciles nothing — and the NOTICE half is not closeable from here " +
          "until the wire states a served-resource set (see `cloud-session.ts`)",
      ).toEqual([0, 0]);

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
