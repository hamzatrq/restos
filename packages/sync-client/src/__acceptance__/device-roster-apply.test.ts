// `01-F81` — THE CONTENT LEG OF THE ROSTER HOP: what the gateway sent is what the store holds.
//
// ⚠ **THIS FILE IS IMPLEMENTER-AUTHORED AND IS NOT AN ORACLE.** `24 §3` disqualifies the session
// that writes an implementation from writing its acceptance tests, and the `01-F81` oracle is
// `device-roster-distribution.test.ts`, authored from spec text by another session. This is the
// hand-written assertion `AGENTS.md` requires for a blind spot no rail can see, and it exists
// because of a MEASUREMENT rather than a hunch:
//
//   · deleting the `store.lanRoster.apply(…)` call site from `cloud-session.ts` failed **1** of
//     the 904 tests in this package — the oracle's §4 seam grep, alone.
//   · putting the call site BACK and passing it an INERT payload (an empty snapshot at the same
//     version, so the version advances and not one device is ever admitted) failed **0**.
//
// That second number is this repo's most-recorded defect, exactly as `AGENTS.md` states it: "a
// seam test alone blesses a decorative object". `catalog-fetch.ts`'s `toEntry` dropping `prices`
// and `station` failed 0 of 579 tests for the same reason — the seam existed, the reshape lost
// fields, and no assertion crossed the hop. On THIS artifact the equivalent loss is a branch whose
// tills fetch a roster of peers and admit none of them, with a healthy version number on the strip.
//
// ── WHAT THIS FILE DOES NOT CLAIM ──────────────────────────────────────────────────────────────
//
// It asserts nothing about the SIGNATURE. `01-F81` (b)'s verification is not implemented and the
// reason is recorded at the apply site and in `roster-fetch.ts`'s header: (c) pins the verifying
// key at pairing (`01-F80` (f)) and no device holds one. The verifier and its matrix — a tampered
// entry, a relabelled version, a mismatched base, a foreign branch key, a missing domain-separation
// prefix, and an artifact signed by the org ISSUER rather than the roster-signing key — are OWED to
// a `01-F81` verifier oracle, which must land with `01-F80`'s pairing and not later.

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

const DEVICE_ID = "till-counter-apply";
const PEER_ID = "aaa-pass-kitchen";
const GONE_ID = "zzz-retired-tablet";
const SCOPE = { org_id: ORG, branch_id: BRANCH } as const;

const fingerprint = (seed: string): string => createHash("sha256").update(seed).digest("hex");

/** Well-FORMED and not valid — nothing on this device verifies it yet. See the header. */
const SIGNATURE = {
  alg: "ES256" as const,
  signed_at: 1_756_000_000_000,
  value: Buffer.alloc(64, 7).toString("base64"),
};

const entry = (device_id: string, over: Record<string, unknown> = {}) => ({
  device_id,
  device_class: "counter_electron",
  cert_sha256: fingerprint(device_id),
  revoked: false,
  ...over,
});

const response = (over: Record<string, unknown>) => ({
  v: PROTOCOL_VERSION,
  kind: "reference_response",
  resource: "device_roster",
  scope: SCOPE,
  form: "snapshot",
  complete: true,
  next_from: 0,
  entries: [],
  signature: SIGNATURE,
  ...over,
});

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
      handlers = null;
    },
    send(message) {
      sent.push(message);
    },
  };
  return {
    transport,
    sent,
    deliver(message: unknown) {
      handlers?.onMessage(parseMessage(message));
    },
  };
};

const rosterRequests = (sent: readonly ProtocolMessage[]) =>
  sent.filter(
    (m) =>
      m.kind === "reference_request" &&
      (m as unknown as { resource: string }).resource === "device_roster",
  ) as unknown as { have_version: number; from?: number; at_version?: number }[];

/** A session already told the gateway serves `device_roster` at `version`. */
const connected = (version: number) => {
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
    reference_versions: [{ resource: "device_roster", scope: SCOPE, version }],
  });
  return { cloud, store, session };
};

describe("01-F81 — a fetched roster reaches the store with every fact the wire carried", () => {
  it("01-F81 (a)/01-F74 (a): all four facts survive the hop, and `admit` answers from them", () => {
    const { cloud, store, session } = connected(3);
    try {
      cloud.deliver(
        response({
          version: 3,
          entries: [entry(DEVICE_ID), entry(PEER_ID, { device_class: "kitchen_display" })],
        }),
      );

      expect(store.lanRoster.version(), "the applied version is the artifact's").toBe(3);
      expect(
        store.lanRoster.list().map((row) => ({ ...row })),
        "01-F74 (a)'s four facts, per row — a reshape that dropped `device_class` or `cert_sha256` " +
          "here is `catalog-fetch.ts`'s measured defect on the artifact that decides admission",
      ).toEqual([
        {
          device_id: PEER_ID,
          device_class: "kitchen_display",
          cert_sha256: fingerprint(PEER_ID),
          revoked: false,
        },
        {
          device_id: DEVICE_ID,
          device_class: "counter_electron",
          cert_sha256: fingerprint(DEVICE_ID),
          revoked: false,
        },
      ]);
      expect(
        store.lanRoster.admit(fingerprint(PEER_ID)),
        "01-F72/01-F74: THE admission decision, answered from the fetched artifact",
      ).toEqual({ device_id: PEER_ID, device_class: "kitchen_display" });
      expect(
        store.lanRoster.ageMs(Date.now()),
        "01-F74 (d)/`createLanMesh`'s third gate reads `ageMs`: `null` is a roster never received, " +
          "and it is what refuses the mesh on every launch today",
      ).not.toBeNull();

      session.stop();
    } finally {
      store.close();
    }
  });

  it("01-F81 (a)/01-F56: a paged snapshot commits ATOMICALLY — half a roster is never held", () => {
    const { cloud, store, session } = connected(4);
    try {
      cloud.deliver(
        response({ version: 4, complete: false, next_from: 1, entries: [entry(DEVICE_ID)] }),
      );
      expect(store.lanRoster.version(), "nothing commits until the last page lands").toBe(0);
      expect(store.lanRoster.list()).toEqual([]);

      const continuation = rosterRequests(cloud.sent).at(-1);
      expect(continuation?.from, "the device pages onward from `next_from`").toBe(1);
      expect(
        continuation?.at_version,
        "01-F56: the continuation is pinned to page 1's version, or a publish between pages " +
          "splices two rosters under one number",
      ).toBe(4);

      cloud.deliver(
        response({ version: 4, complete: true, next_from: 0, entries: [entry(PEER_ID)] }),
      );
      expect(store.lanRoster.version()).toBe(4);
      expect(
        store.lanRoster
          .list()
          .map((row) => row.device_id)
          .sort(),
      ).toEqual([PEER_ID, DEVICE_ID]);

      session.stop();
    } finally {
      store.close();
    }
  });

  it("01-F81 (a)/01-F75: a DELTA carries a departure as a MARKED entry — the peer stays, refused", () => {
    const { cloud, store, session } = connected(1);
    try {
      cloud.deliver(response({ version: 1, entries: [entry(DEVICE_ID), entry(GONE_ID)] }));
      expect(store.lanRoster.admit(fingerprint(GONE_ID))).not.toBeNull();

      cloud.deliver({
        v: PROTOCOL_VERSION,
        kind: "reference_notice",
        resource: "device_roster",
        scope: SCOPE,
        version: 2,
      });
      cloud.deliver(
        response({
          form: "delta",
          version: 2,
          base_version: 1,
          entries: [entry(GONE_ID, { revoked: true })],
        }),
      );

      expect(store.lanRoster.version(), "the notice is the freshness path and it fetched").toBe(2);
      expect(
        store.lanRoster.list().find((row) => row.device_id === GONE_ID)?.revoked,
        "01-F81 (a): the mark IS the revocation field — an absence is a change a delta cannot state",
      ).toBe(true);
      expect(
        store.lanRoster.admit(fingerprint(GONE_ID)),
        "01-F48: presence is not admission",
      ).toBeNull();
      expect(
        store.lanRoster.admit(fingerprint(DEVICE_ID)),
        "a delta upserts what changed and leaves the rest — this device is still admissible",
      ).not.toBeNull();

      session.stop();
    } finally {
      store.close();
    }
  });

  it("01-F76: a roster scoped to ANOTHER branch is refused and applies nothing", () => {
    const { cloud, store, session } = connected(3);
    try {
      cloud.deliver(
        response({
          scope: { org_id: ORG, branch_id: "branch-somebody-else" },
          version: 3,
          entries: [entry("intruder-till")],
        }),
      );
      expect(store.lanRoster.version(), "a mis-routed artifact applies nothing").toBe(0);
      expect(store.lanRoster.list()).toEqual([]);
      expect(
        session.status().device_roster_refusal,
        "01-F56 + DEC-SYNC-011: the refusal is OBSERVABLE — a foreign key is a routing failure and " +
          "not a bad row, so it carries its own reason",
      ).toEqual({ reason: "foreign_artifact", have_version: 0 });

      session.stop();
    } finally {
      store.close();
    }
  });
});
