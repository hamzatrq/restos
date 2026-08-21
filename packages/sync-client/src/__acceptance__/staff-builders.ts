// Acceptance-test builders — STEP 7 of `plans/saas-pivot/staff-over-the-wire.md`:
// the device fetches and applies the branch staff roster.
//
// AUTHORED FROM SPEC TEXT ONLY (24 §3 step 2 — read-only to the implementing session).
// The sources are `01-F56`, `01-F61`, `01-F75`, `01-F76`, `01-F77`, `01-F78`, `11-F20`,
// `11-F21`, `11-F22`, `01-F17`, `01-F28`, and rulings R25/R26/R27/R28/R29/R31 in
// `plans/saas-pivot/plan-of-record.md` §0. No implementation was read for the ASSERTIONS;
// the shipped `catalog-fetch.ts` / `cloud-session.ts` were read only to learn the SEAM
// names step 7's plan says the roster copies, which is what makes this suite addressable.
//
// ⚠ **NOTHING HERE HAND-COPIES THE WIRE SCHEMA.** `K-3`'s recorded failure was an oracle
// that declared the interface it existed to deliver and then asserted against a hand-copy,
// leaving both oracle symbols dead. Every frame below is built by `parseMessage` from
// `@restos/sync-protocol` and is therefore the frame the protocol layer actually produces —
// a fixture that stops parsing is a fixture that has stopped describing the wire, loudly.
// It is also what anchors every refusal test: a frame that reaches an assertion has parsed
// (the step-5 review's measured trap — 19 of 53 refusals passing for free against a codec
// where the kind did not exist).

import type {
  CloudTransport,
  CloudTransportHandlers,
  ProtocolMessage,
} from "@restos/sync-protocol";
import { parseMessage } from "@restos/sync-protocol";
import { createSim } from "@restos/testing";
import {
  type CloudSession,
  type CloudSessionStatus,
  createCloudSession,
  type DeviceStore,
  openStore,
} from "../index.js";
import { must } from "./builders.js";

// ───────────────────────────────────────────────────────────────────────────────
// The people. Four of them, and the SPREAD between the three orderings is the whole
// point of the fixture (`K-4`'s recorded failure: ~90 renders that varied everything
// except the input that mattered).
//
//   user_id asc  : bilal   · ayesha · hina   · zainab   ← the WIRE order (the gateway
//                                                          pages `order by user_id`)
//   display asc  : ayesha  · bilal  · hina   · zainab
//   grid_ordinal : zainab  · ayesha · hina   · bilal    ← `01-F61`'s CONTRACT order
//
// No two of those agree on a single position, so an implementation that orders by
// `user_id`, by name, or by arrival order is distinguishable from one that reads
// `grid_ordinal` — which is exactly the defect `01-F61` records its own first build
// shipping ("invisible to a test that only re-renders the same roster").
// ───────────────────────────────────────────────────────────────────────────────

/** Real PINs for the two members that carry a credential. Never a hash, never stored. */
export const PIN = {
  zainab: "4821",
  ayesha: "1379",
  hina: "9264",
  bilal: "5507",
} as const;

/**
 * Real Argon2id PHC hashes at `PIN_ARGON2ID_PARAMS`, minted by `packages/domain`'s `hashPin`
 * and pinned as literals rather than hashed per run: `01-F61`'s floor is 19 MiB × 2 passes in
 * pure JS, so hashing three PINs in a `beforeAll` costs seconds for no assertion. Each one
 * verifies against `verifyPin`, which is what the seam test needs — a fixture that only LOOKS
 * like a hash cannot tell "the hash survived the reshape" from "a string survived the reshape".
 */
export const PIN_HASH = {
  zainab:
    "$argon2id$v=19$m=19456,t=2,p=1$yiVqlaaMU5JBi4K8PpFFwA$WQohY8u0hFAHBCZqtb4wJbJdiG/Y/9IQMz1q5MVjYsM",
  ayesha:
    "$argon2id$v=19$m=19456,t=2,p=1$g3dHExZAUlOMH0kdkeAdNg$OzERo5+IfYgFqFCuPdg9WJLgopZNfnWn0zHX3Bq8h/0",
  hina: "$argon2id$v=19$m=19456,t=2,p=1$Oke5MFChHyfu4T07FWaYwA$Bmpy9BA3yFRnx8OpGOrsniVV7+1JFO1R5cyspUYf/3U",
  bilal:
    "$argon2id$v=19$m=19456,t=2,p=1$0KwRDmkfOWj/3Lm4e6xpTg$sXXUrCRY+8pD0o5RymkYWPO3aiDklWfFG8gSkEy3OBY",
} as const;

export const USER = {
  zainab: "u-9-zainab",
  ayesha: "u-1-ayesha",
  hina: "u-5-hina",
  bilal: "u-0-bilal",
} as const;

/** One `StaffEntryWire` row. `branch_id` defaults to org-wide (`null`), which `01-F78` permits. */
export type WireStaffEntryInput = {
  user_id: string;
  display_name: string;
  grid_ordinal: number;
  status?: "active" | "inactive";
  assignments?: readonly { role: string; branch_id: string | null }[];
  pin_hash?: string;
};

export const staffEntry = (over: WireStaffEntryInput): Record<string, unknown> => ({
  user_id: over.user_id,
  display_name: over.display_name,
  grid_ordinal: over.grid_ordinal,
  status: over.status ?? "active",
  assignments: over.assignments ?? [{ role: "cashier", branch_id: null }],
  ...(over.pin_hash === undefined ? {} : { pin_hash: over.pin_hash }),
});

/**
 * The four-person branch roster as the gateway serves it: **in `user_id` order**, because that
 * is the page order `staffPage` states and `01-F61` puts the render order in the FIELD. A
 * fixture that pre-sorted by `grid_ordinal` would answer its own question.
 */
export const ROSTER = (branch_id: string): Record<string, unknown>[] => [
  staffEntry({
    user_id: USER.bilal,
    display_name: "Bilal",
    grid_ordinal: 3,
    assignments: [{ role: "cashier", branch_id }],
    pin_hash: PIN_HASH.bilal,
  }),
  staffEntry({
    user_id: USER.ayesha,
    display_name: "Ayesha",
    grid_ordinal: 1,
    assignments: [{ role: "branch_manager", branch_id }],
    pin_hash: PIN_HASH.ayesha,
  }),
  staffEntry({
    user_id: USER.hina,
    display_name: "Hina",
    grid_ordinal: 2,
    assignments: [{ role: "cashier", branch_id }],
    pin_hash: PIN_HASH.hina,
  }),
  staffEntry({
    user_id: USER.zainab,
    display_name: "Zainab",
    grid_ordinal: 0,
    // `01-F78` half one: an org-wide (`branch_id: null`) assignment REACHES every branch,
    // which is how an owner unlocks a till at a branch she does not staff.
    assignments: [{ role: "owner", branch_id: null }],
    pin_hash: PIN_HASH.zainab,
  }),
];

// ───────────────────────────────────────────────────────────────────────────────
// Frames. Every one goes through `parseMessage`.
// ───────────────────────────────────────────────────────────────────────────────

export type Scope = { org_id: string; branch_id: string | null };

export type StaffResponse = Extract<
  ProtocolMessage,
  { kind: "reference_response"; resource: "staff" }
>;

export type CatalogResponse = Extract<
  ProtocolMessage,
  { kind: "reference_response"; resource: "catalog" }
>;

/**
 * A `reference_response` for `resource: "staff"`, parsed. Returning the PARSED frame is what
 * lets the accumulator be fed the object the protocol layer produces, unmodified — the reshape
 * seam `WireCatalogResponse`'s own comment warns about ("a reshape is where a field quietly
 * goes missing", written about the reshape that then dropped `prices` and `station`).
 */
export const staffResponse = (over: {
  scope: { org_id: string; branch_id: string };
  form?: "snapshot" | "delta";
  version?: number;
  base_version?: number;
  entries?: readonly Record<string, unknown>[];
  complete?: boolean;
  next_from?: number;
}): StaffResponse => {
  const parsed = parseMessage({
    v: 2,
    kind: "reference_response",
    resource: "staff",
    scope: over.scope,
    form: over.form ?? "snapshot",
    version: over.version ?? 1,
    ...(over.base_version === undefined ? {} : { base_version: over.base_version }),
    entries: over.entries ?? [],
    complete: over.complete ?? true,
    next_from: over.next_from ?? 0,
  });
  if (parsed.kind !== "reference_response" || parsed.resource !== "staff") {
    throw new Error("builder produced a frame that is not a staff reference_response");
  }
  return parsed;
};

export const catalogResponse = (over: {
  org_id: string;
  version?: number;
  entries?: readonly Record<string, unknown>[];
  complete?: boolean;
  next_from?: number;
}): CatalogResponse => {
  const parsed = parseMessage({
    v: 2,
    kind: "reference_response",
    resource: "catalog",
    scope: { org_id: over.org_id, branch_id: null },
    form: "snapshot",
    version: over.version ?? 1,
    entries: over.entries ?? [],
    complete: over.complete ?? true,
    next_from: over.next_from ?? 0,
  });
  if (parsed.kind !== "reference_response" || parsed.resource !== "catalog") {
    throw new Error("builder produced a frame that is not a catalog reference_response");
  }
  return parsed;
};

/** `01-F77`'s per-artifact version set. Omitted keys are the "published nothing" signal. */
export const helloAck = (over: {
  session_id?: string;
  reference_versions?: readonly Record<string, unknown>[];
}): Record<string, unknown> => ({
  v: 2,
  kind: "hello_ack",
  session_id: over.session_id ?? "step-7",
  hub: false,
  resume_from: 0,
  ...(over.reference_versions === undefined ? {} : { reference_versions: over.reference_versions }),
});

export const staffKey = (scope: { org_id: string; branch_id: string }, version: number) => ({
  resource: "staff",
  scope,
  version,
});

export const catalogKey = (org_id: string, version: number) => ({
  resource: "catalog",
  scope: { org_id, branch_id: null },
  version,
});

export const staffNotice = (
  scope: { org_id: string; branch_id: string },
  version: number,
): Record<string, unknown> => ({
  v: 2,
  kind: "reference_notice",
  resource: "staff",
  scope,
  version,
});

export const catalogNotice = (org_id: string, version: number): Record<string, unknown> => ({
  v: 2,
  kind: "reference_notice",
  resource: "catalog",
  scope: { org_id, branch_id: null },
  version,
});

// ───────────────────────────────────────────────────────────────────────────────
// The scripted cloud end — the `catchup-blocked-status.test.ts` idiom, and it is the only
// harness available: `packages/testing`'s sim-cloud has FOUR cases (`hello`, `push`,
// `catchup_request`, `ping`) and no reference-data support of any kind, which step 10 of the
// plan owns. Playing the gateway by hand at the wire surface is therefore not a shortcut here,
// it is the whole of the coverage — and every frame still passes `parseMessage`.
// ───────────────────────────────────────────────────────────────────────────────

export const scriptedCloud = () => {
  let handlers: CloudTransportHandlers | null = null;
  const sent: ProtocolMessage[] = [];
  const transport: CloudTransport = {
    start(h) {
      handlers = h;
    },
    stop() {
      handlers = null;
    },
    send(message) {
      sent.push(parseMessage(message));
    },
  };
  return {
    transport,
    sent,
    up: () => must(handlers, "started transport").onUp(),
    down: () => must(handlers, "started transport").onDown(),
    deliver: (raw: unknown) => must(handlers, "started transport").onMessage(parseMessage(raw)),
    /** Deliver an ALREADY-PARSED frame (the builders above return one). */
    push: (message: ProtocolMessage) => must(handlers, "started transport").onMessage(message),
  };
};

export type Device = {
  id: { org_id: string; branch_id: string; device_id: string };
  store: DeviceStore;
  session: CloudSession;
  cloud: ReturnType<typeof scriptedCloud>;
};

/**
 * A connected device: real store, real cloud session, scripted wire. `identity` is FIXED rather
 * than random so a scope mismatch in a test reads as a mismatch and not as noise.
 */
export const openDevice = (over: { org_id?: string; branch_id?: string } = {}): Device => {
  const id = {
    org_id: over.org_id ?? "org-step7",
    branch_id: over.branch_id ?? "branch-gulberg",
    device_id: "till-1",
  };
  const store = openStore({ path: ":memory:", identity: id });
  const cloud = scriptedCloud();
  const session = createCloudSession({
    store,
    transport: cloud.transport,
    clock: createSim({ seed: 7 }).clock,
    device_class: "counter_electron",
    token: "cloud-token-stub",
  });
  session.start();
  cloud.up();
  return { id, store, session, cloud };
};

/** This device's own artifact key, as `01-F76` defines it: the org from the session, the branch
 *  from the device's own identity. */
export const ownScope = (d: Device) => ({ org_id: d.id.org_id, branch_id: d.id.branch_id });

// ───────────────────────────────────────────────────────────────────────────────
// Reads of the ORACLE-PROPOSED surface. Every one is a typed read with a named failure, so a
// missing feature says which clause it owes rather than throwing `undefined is not an object`.
// ───────────────────────────────────────────────────────────────────────────────

/** `01-F76`'s device-side refusal vocabulary + `01-F56`'s three. */
export const STAFF_REFUSAL_REASONS = [
  "stale",
  "needs_snapshot",
  "malformed",
  "divergent",
  "foreign_artifact",
] as const;

export type StaffRefusal = { reason: string; have_version: number };

export const readStaffRefusal = (session: CloudSession): StaffRefusal | null => {
  const status = session.status() as CloudSessionStatus & { staff_refusal?: StaffRefusal | null };
  return status.staff_refusal ?? null;
};

export const requireStaffRefusal = (session: CloudSession, what: string): StaffRefusal => {
  const refusal = readStaffRefusal(session);
  if (refusal === null) {
    throw new Error(
      "STEP 7 NOT IMPLEMENTED: `status().staff_refusal` — `01-F56` requires a refused reference " +
        "update to be OBSERVABLE in device health, and `01-F76` names `foreign_artifact` as part " +
        `of that closed vocabulary. Expected a refusal for ${what}, got none. A roster that has ` +
        "silently stopped updating is indistinguishable from a branch nobody has edited, and on " +
        "this artifact that is a cashier whose PIN stopped working with nothing on the glass.",
    );
  }
  return refusal;
};

/** Every `reference_request` this device sent for the STAFF key. */
export const staffRequests = (sent: readonly ProtocolMessage[]) =>
  sent.filter(
    (m): m is Extract<ProtocolMessage, { kind: "reference_request"; resource: "staff" }> =>
      m.kind === "reference_request" && m.resource === "staff",
  );

export const catalogRequests = (sent: readonly ProtocolMessage[]) =>
  sent.filter(
    (m): m is Extract<ProtocolMessage, { kind: "reference_request"; resource: "catalog" }> =>
      m.kind === "reference_request" && m.resource === "catalog",
  );

export const requireStaffRequest = (sent: readonly ProtocolMessage[], what: string) => {
  const request = staffRequests(sent).at(-1);
  if (request === undefined) {
    throw new Error(
      "STEP 7 NOT IMPLEMENTED: the device never sent a `reference_request` for `resource: " +
        `"staff"` +
        ` (${what}). \`01-F77\` makes \`hello_ack.reference_versions\` THE correctness mechanism ` +
        "of the reference-data transport — the device compares each key against its own stored " +
        "version and asks for the ones it is behind on — and a design that reconciles the roster " +
        "only on a pushed notice gives a till nobody can sign in to after a lossy week.",
    );
  }
  return request;
};
