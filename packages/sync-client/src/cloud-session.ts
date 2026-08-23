// Cloud session (T-01-06 contract (b); 01-F8/F9/F11/F34/F37): one device's cloud
// uplink over an injected CloudTransport — the WAN mirror of the LAN mesh follower
// (mesh-session.ts). On connect it hellos, drains the cloud outbox to the gateway's
// push_ack (THE outbox write-checkpoint, 19 §5 — store.advanceTo, unlike the volatile
// LAN cursor of T-01-05 which never moves it), catches the branch stream up from the
// EXCLUSIVE global_seq cursor (global_seq starts at 1, so 0 = everything), applies live
// event_batch fan-out — origin-inclusive, so a device learns its own events' global_seq
// and converges to cloud order (01-F34) — and surfaces quarantine notices in status().
// Per-device cloud sessions remain the default; ADDITIONALLY, when the mesh session
// signals it is acting hub (store relay seam) AND the gateway advertised
// relay_authorized on hello_ack, this session relays held same-branch peers' events
// upward verbatim, one origin per push, and records the per-origin cloud acks for the
// mesh to propagate back over LAN (DEC-SYNC-009, T-01-12 — supersedes DEC-SYNC-004's
// no-proxy rule; the hub never advances the ORIGIN's checkpoint, only the origin does).
// Deterministic: no Date.now/newId and no self-scheduled timers — it acts
// only in response to transport edges (onUp/onDown), inbound wire messages and the
// store's relay-drain signal; reconnect/backoff is the transport's job (the sim-cloud
// double fires onUp/onDown, the real WS adapter schedules reconnect through its own
// clock).
import { type DeviceClass, type EventEnvelopeT, UnknownEventTypeError } from "@restos/domain";
// The portable subpaths rather than the package ROOT: the root re-exports `compression.ts`,
// whose `node:zlib` import a React Native program cannot even TYPE — and this session runs on
// the manager's phone (`05-F29`). A type-only import still loads the target module graph.
import type { ProtocolMessage } from "@restos/sync-protocol/messages";
import type {
  Clock,
  CloudTransport,
  CloudTransportHandlers,
} from "@restos/sync-protocol/transport";
import { type CatalogFetch, createCatalogFetch } from "./catalog-fetch.js";
import { type DeviceStore, DivergentDuplicateError, type PageItem } from "./device-store.js";
import { createDeviceRosterFetch, type DeviceRosterFetch } from "./roster-fetch.js";
import { createStaffFetch, type StaffFetch } from "./staff-fetch.js";

/** Cloud outbox drain page per push (contract (b)); id-dedupe makes overlap free (01-F8). */
export const CLOUD_PUSH_BATCH_MAX = 500;

/** A merged wire event: an envelope carrying its two cloud stamps (server_received_at + global_seq). */
type WireEvent = Extract<ProtocolMessage, { kind: "event_batch" }>["events"][number];

/**
 * Machine-readable blocked-cursor reasons (DEC-SYNC-011). Snake_case tokens for
 * fleet health (doc 15) to alert on — never a rendered message, and never anything
 * derived from a payload: payloads carry customer PII (00 §5.4) and fleet health
 * persists whatever it is given.
 *
 * On classifiability (the question the oracle round settled): at the point the cursor
 * stops, every DETERMINISTIC device-store rejection is permanent by construction —
 * transience only ever arrives from infrastructure (SQLITE_BUSY, disk full, fsync).
 * The two cases DEC-SYNC-011 names are cleanly separable by error class; the rest —
 * identity mismatch, lamport collision, bad global_seq, and genuine infra faults —
 * are not separable by class and share `ingest_failed`. That is deliberate: nothing
 * here claims "this is permanent", because the clearing rule (report on stop, clear
 * on advance) is correct for both, and a `permanent` flag could not be derived
 * honestly today without typed errors the store does not throw.
 */
export type BlockedReason = "unknown_event_type" | "schema_invalid" | "ingest_failed";

/**
 * The blocked-cursor report (DEC-SYNC-011). Present iff the contiguous-prefix cursor
 * is stopped; `null` when catch-up is flowing.
 *
 * Why this exists: a permanent rejection — an event type this build does not know, a
 * payload from a newer schema — is not divergence and not quarantinable at the device,
 * so the cursor simply stops. It used to stop SILENTLY: the device sat at a fixed
 * `last_global_seq`, `connected: true`, looking merely idle while it had permanently
 * stopped receiving the branch's events, and the honesty UI (00 §5.7) lied by omission.
 *
 * `event_type` is always present: `EventEnvelope.type` is `z.string().min(1)`, so the
 * protocol layer has already rejected any event that lacks one — a typeless blocking
 * event is unreachable here, not merely unhandled.
 *
 * This is a property of the CURSOR, not of the connection: it survives a disconnect
 * (the blockage is still there when the link returns) and clears only when the cursor
 * actually advances past the blocking sequence.
 */
export type BlockedCursor = {
  global_seq: number;
  event_type: string;
  reason: BlockedReason;
};

/**
 * Classify an ingest rejection into a machine-readable reason (DEC-SYNC-011).
 *
 * Only the two cases the decision names are separable by error class. `ZodError` is
 * matched by NAME rather than `instanceof` because a payload schema and the envelope
 * schema may come from different zod instances across package boundaries, where
 * `instanceof` silently fails and would quietly demote every schema rejection to the
 * catch-all. Everything else — identity mismatch, lamport collision, bad global_seq,
 * and genuine infrastructure faults — shares `ingest_failed`: they are not separable
 * by class, and claiming otherwise would be a guess encoded as a fact.
 */
const classifyBlock = (error: unknown): BlockedReason => {
  if (error instanceof UnknownEventTypeError) return "unknown_event_type";
  if (error instanceof Error && (error.name === "ZodError" || error.name === "$ZodError")) {
    return "schema_invalid";
  }
  return "ingest_failed";
};

export type CloudSessionStatus = {
  connected: boolean;
  last_push_ack: number | null;
  last_global_seq: number | null;
  quarantined: readonly { event_id: string; reason: string }[];
  /** DEC-SYNC-011: where the cursor is stuck and why; null when flowing. */
  blocked: BlockedCursor | null;
  /**
   * `01-F56` + DEC-SYNC-011 for the catalog: a refused update is OBSERVABLE, never silent.
   * Null when the catalog is healthy. `have_version` is what the device actually holds, so a
   * support surface can say "stuck at version 7" rather than only "stuck".
   *
   * This exists because a catalog that has quietly stopped updating is indistinguishable from
   * a catalog nobody has edited — the failure surfaces days later as a mispriced item, which is
   * exactly the shape `01-F56` refuses the delta to prevent.
   */
  catalog_refusal: { reason: string; have_version: number } | null;
  /**
   * `01-F56` + `01-F76` for the ROSTER — `catalog_refusal`'s shape one artifact key over, and a
   * SECOND slot rather than a shared one because the two have different remedies and a surface
   * that conflates them sends staff to the wrong fix (`00 §5.7`).
   *
   * A roster that has quietly stopped updating is indistinguishable from a roster nobody has
   * edited, and here the user-visible symptom is a cashier whose PIN stopped working — so
   * "stuck" alone sends a manager to the wrong problem, which is why `have_version` is what the
   * device actually holds.
   *
   * The reasons are `01-F56`'s (`stale` is not surfaced — see the response arm) plus `divergent`
   * plus `01-F76`'s `foreign_artifact`.
   */
  staff_refusal: { reason: string; have_version: number } | null;
  /**
   * `01-F56` + `01-F76` for `01-F81`'s BRANCH DEVICE ROSTER — a THIRD slot, on the same argument
   * that made the second one: a roster of DEVICES and a roster of PEOPLE have different remedies,
   * and here the symptom is a till that has silently stopped learning who its branch's peers are.
   * `01-F74` (d) admits an OLD roster, so this is never a reason to refuse the LAN.
   *
   * ⚠ **NOTHING READS THIS SLOT, AND THIS COMMENT CLAIMED OTHERWISE.** It said the slot *"is the
   * only way a human finds out"* that the artifact `01-F72`'s admission rests on stopped moving —
   * a present-tense claim about a `00 §5.7` surface that does not exist. Measured 2026-08-23,
   * comment-blind, across `apps/`, `packages/` and `services/`: the ONLY production reader of any
   * refusal slot on this type is `apps/pos-electron/src/main/sync.ts:124`, which reads
   * `catalog_refusal`. `staff_refusal` has no reader — pre-existing, and its own comment above is
   * careful not to claim one — and `device_roster_refusal` has none.
   *
   * **What is true:** the slot is produced correctly and observably by the response arm below, and
   * the CONSUMER is owed — one honesty-strip chip per artifact, alongside `staff_refusal`'s, on
   * `catalogRefusal`'s shipped chain (`Uplink` → `GatewayDeps` → `deviceState()`). Until it lands,
   * a roster that has quietly stopped moving is visible to a test and to nobody else.
   *
   * This is corrected in place rather than quietly deleted because this repo has now recorded four
   * shipped comments promising a protection that did not exist, and the cost is always the same:
   * a protection claimed in prose retires the hand-written assertion the next session would
   * otherwise write.
   */
  device_roster_refusal: { reason: string; have_version: number } | null;
};

export type CloudSession = {
  start(): void;
  stop(): void;
  /** Host-app fast path (01-F15): an event was durably appended — push it now. */
  notifyAppended(): void;
  status(): CloudSessionStatus;
};

export const createCloudSession = (options: {
  store: DeviceStore;
  transport: CloudTransport;
  // Injected for signature parity with the mesh. The session still schedules NO TIMERS of its own
  // (assumption 12 — reconnect lives in the transport), which is the property the header claims and
  // the one that matters. ⚠ It is no longer unused: `01-F81`'s roster apply stamps `received_at`
  // with `clock.now()` — the arrival wall clock `lan-roster.ts` asks for, so `00 §5.7` can say how
  // long since the cloud last named this branch's peers. That is a READ of injected time, which
  // keeps the session deterministic under a virtual clock; it is never branch time and never
  // reaches a fold (`01-F34`, `01-F43`).
  clock: Clock;
  device_class: DeviceClass;
  token: string;
}): CloudSession => {
  const { store, transport, clock, device_class, token } = options;

  let running = false;
  let connected = false;
  let lastPushAck: number | null = null;
  const quarantined: { event_id: string; reason: string }[] = [];
  /** DEC-SYNC-011: null while catch-up flows; set to where and why the cursor stopped. */
  let blockedCursor: BlockedCursor | null = null;
  /**
   * T-C4 — the in-flight catalog fetch, or null. Volatile on purpose: a fetch belongs to ONE
   * connection, and a snapshot half-accumulated on a session that then dropped must never be
   * completed with pages from the next one. Cleared on disconnect for exactly that reason.
   */
  let catalogFetch: CatalogFetch | null = null;
  /**
   * DEC-SYNC-011 applied to the catalog: a refusal is OBSERVABLE, not silent. `01-F56` makes an
   * out-of-order delta a first-class refusal, and B2 of the oracle round recorded that half of
   * it was unbuilt — the delta was dropped with nothing surfaced to device health (`15`). A
   * catalog that has silently stopped updating looks exactly like a catalog nobody has edited.
   */
  let catalogRefusal: { reason: string; have_version: number } | null = null;
  /**
   * Retries spent on the CURRENT fetch. `01-F17` says a sale is never blocked, and an unbounded
   * receive-path loop is one of the few things in this session that could break that: each
   * iteration costs the gateway a fold over the org's whole entry table, so a buggy or hostile
   * server could turn one till into a hot loop against org-scoped state. Three refusals is
   * enough for a transient disagreement and few enough to stop being a loop; the device then
   * reports the refusal and waits for the next `hello_ack`, which is the mechanism that repairs
   * everything else here anyway.
   */
  let catalogRetries = 0;
  const CATALOG_MAX_RETRIES = 3;
  /**
   * The ROSTER's three, and they are three SEPARATE variables on purpose (`01-F76`: "a device
   * holds one version *per key*, not one version"). The likeliest implementation error in this
   * step is one `fetch` variable and one refusal slot copied from the catalog: `reconcile*`
   * returns early while a fetch is in flight, so a shared slot would make a roster fetch cancel a
   * menu fetch whenever an owner edits both — which is what an owner does on the day she opens.
   */
  let staffFetch: StaffFetch | null = null;
  let staffRefusal: { reason: string; have_version: number } | null = null;
  let staffRetries = 0;
  const STAFF_MAX_RETRIES = 3;
  /**
   * `01-F81`'s three, separate for the reason directly above: `01-F76` says a device holds one
   * version PER KEY, and `device_roster` is a different key from `staff` even though both are this
   * branch's. Sharing a fetch slot would make an owner's roster edit cancel a staff fetch.
   */
  let deviceRosterFetch: DeviceRosterFetch | null = null;
  let deviceRosterRefusal: { reason: string; have_version: number } | null = null;
  let deviceRosterRetries = 0;
  const DEVICE_ROSTER_MAX_RETRIES = 3;
  /**
   * **NO FORWARD PROGRESS on an incomplete page — ONE declaration, for every resource** (`01-F17`).
   *
   * A continuation echoes `next_from` as `from`, and `requestCatalog`/`requestStaff`/
   * `requestDeviceRoster` all OMIT `from` when it is `0`. So an incomplete page carrying
   * `next_from <= 0` produces a request byte-identical to the first-page request, the server
   * answers it identically, and the device asks again: an unbounded receive-path loop, which the
   * `staff` arm's own comment already names as *"one of the few things in this session that could
   * stop a till selling … a hot loop against credential storage"*.
   *
   * ⚠ **THE ENTRY COUNT IS NOT PART OF THE CONDITION, AND ALL THREE ARMS SAID IT WAS.** Each read
   * `next_from <= 0 && entries.length === 0`, so a server answering `{ complete: false,
   * next_from: 0, entries: [one row] }` was judged to be making progress. Measured 2026-08-23
   * against the shipped session, one probe per resource: `device_roster` **300** rounds,
   * `staff` **300**, `catalog` **300** — 300 being where the harness stopped, not the device —
   * with the refusal slot `null` in all three, so nothing reached `00 §5.7` either. The rows
   * accumulate in the fetch accumulator and the CURSOR is what never moves; a page that carries
   * entries and no cursor is the same non-progress wearing a payload.
   *
   * ⚠ **THE NEIGHBOURING CASE THIS DOES NOT CLOSE, named rather than left to be discovered:** a
   * cursor stuck at a NON-ZERO value (`next_from: 5` on every page) loops identically, because the
   * device echoes 5 for ever. Closing it needs the accumulator to remember the last cursor and
   * refuse a non-increasing one — a change to all three `*-fetch.ts` step types, which is a
   * separate act. What is closed here is `next_from <= 0`, which is the reset-to-start case and the
   * one reproduced above.
   *
   * ⚠ **AND THE LARGER ONE, ON THE LEDGER PATH: `catchup_response` HAS NO FORWARD-PROGRESS GUARD
   * OF ANY KIND.** This declaration says "for every resource" and it means every REFERENCE
   * resource; the `catchup_response` arm in `dispatch` is a bare
   * `if (!message.complete) sendCatchup(message.next_from)`, with no condition on `next_from` at
   * all — so it is not the non-zero-cursor case above but a superset of it, and it is on the path
   * that carries the LEDGER rather than reference data. Measured 2026-08-23 against this session:
   * a server answering `{ complete: false, next_from: 7, events: [] }` to every request produced
   * **300** rounds of `catchup_request { from_global_seq: 7 }` — 300 being the harness cap, not the
   * device's — with nothing refused and nothing observable. Same `01-F17` hazard, wider blast
   * radius. **Deliberately NOT fixed in the change that wrote this paragraph**: it is a separate
   * act with its own adversarial review (commandment 10), and closing it wants the same "remember
   * the last cursor" mechanism as the case above rather than a fourth ad-hoc condition. Stated
   * here, at the declaration that owns the class, so the next reader of "no forward progress" is
   * not told this file already covers it.
   */
  const noForwardProgress = (response: { next_from: number }): boolean => response.next_from <= 0;

  // ---- hub-relay state (DEC-SYNC-009, T-01-12; all volatile) ---------------
  // relayAuthorized: the gateway's hello_ack advertisement — without it this
  // session NEVER pushes third-party events (an unadvertised attempt would
  // quarantine device_mismatch and poison the session's own watermark).
  let relayAuthorized = false;
  // relayRequested: latched by the mesh's relay-drain signal even while the WAN
  // is down, so a reconnect (hello_ack) resumes the relay (R5/R6 heal shape).
  // Cleared when the mesh leaves hub duty (fix round F4, DEC-SYNC-006):
  // followers never relay, even across a WAN bounce whose hello_ack would
  // otherwise resume a stale latch.
  let relayRequested = false;
  // Per-origin relay cursor: last cloud-acked watermark per origin, from
  // per-origin push_acks. Session-local; a fresh session re-relays from zero
  // and id-dedupe absorbs the overlap (01-F8).
  const relayAcked = new Map<string, number>();
  // Volatile per-origin suppression (T-01-09 fix round F1(b), ruled): origins
  // the gateway's origin-registry gate refused — a quarantine_notice with
  // reason origin_unregistered|origin_revoked stops relay of THAT origin for
  // the session's life (its events earn no ack, so re-pushing loops forever).
  // Cleared on hello_ack: a fresh session retries once → re-noticed →
  // re-suppressed (bounded, not livelock).
  const suppressedOrigins = new Set<string>();
  let unsubscribeRelay: (() => void) | null = null;
  let unsubscribeRelayCancel: (() => void) | null = null;

  // ---- device → cloud ------------------------------------------------------

  /**
   * Store a renewal without letting a storage fault take the session down with it
   * (01-F47/01-F17). The device keeps working on the credential it already holds; the
   * cloud will offer another renewal on the next connection.
   */
  const persistRenewal = (renewed: string): void => {
    try {
      store.setDeviceToken(renewed);
    } catch {
      // Deliberately swallowed: losing a renewal costs one connection's worth of
      // credential freshness, while throwing here costs the whole session.
    }
  };

  const sendHello = (): void => {
    const st = store.status();
    transport.send({
      v: 2,
      kind: "hello",
      device_id: store.identity.device_id,
      device_class,
      branch_id: store.identity.branch_id,
      // The PERSISTED renewal if the cloud has ever issued one, else the token this
      // session was constructed with (01-F47). Reading it here rather than caching at
      // construction is what makes renewal take effect on the very next connection.
      token: store.deviceToken() ?? token,
      last_global_seq: st.last_global_seq ?? 0,
      own_high_water: st.own_high_water ?? 0,
      // Advertise that this build can DECODE compressed frames (DEC-SYNC-010). It is
      // only half the contract — the gateway must also grant it in hello_ack, and
      // absent a grant this connection stays plain JSON for its whole life. That
      // both-ends rule is what makes the rollout safe in either direction.
      accepts_compression: true,
    });
  };

  const sendCatchup = (from_global_seq: number): void => {
    transport.send({ v: 2, kind: "catchup_request", from_global_seq });
  };

  /**
   * T-C4 — start (or continue) a catalog fetch (`01-F9`, `01-F52`..`01-F56`).
   *
   * The device is the one that decides it is behind: it compares the version the server
   * advertised against its own and asks. It never waits to be told, which is what makes this
   * work for a device that has been offline for a week and could not have heard an
   * announcement it was not connected for.
   */
  const requestCatalog = (have_version: number, from = 0, at_version?: number): void => {
    transport.send({
      v: 2,
      kind: "reference_request",
      // `01-F75`/`01-F76` — the frame names the ARTIFACT it is about. The catalog stays
      // ORG-scoped (`01-F52`: "byte-identical everywhere"), so `branch_id` is null; the org comes
      // from this store's own bound identity and never from a parameter, because `01-F71` (e)
      // has the SERVER derive the key from the session and refuse a request stating another.
      resource: "catalog",
      scope: { org_id: store.identity.org_id, branch_id: null },
      have_version,
      ...(from === 0 ? {} : { from }),
      ...(at_version === undefined ? {} : { at_version }),
    });
  };

  /**
   * `01-F77` — this device's catalog version out of `hello_ack`'s per-artifact set.
   *
   * The set replaced the single `catalog_version` number because a version means nothing without
   * the `(resource, scope)` it counts (`01-F76`). Absence is the same signal it always was: an
   * artifact the org has published nothing for is OMITTED, never sent as `0`, so the device
   * simply never asks — which is right both for an empty org and for a gateway that does not
   * serve the resource.
   */
  const catalogVersionIn = (
    keys: Extract<ProtocolMessage, { kind: "hello_ack" }>["reference_versions"],
  ): number | undefined =>
    keys?.find((key) => key.resource === "catalog" && key.scope.org_id === store.identity.org_id)
      ?.version;

  /**
   * Compare and fetch if behind. The ONE place that decides a fetch is needed, called from both
   * `hello_ack` (the correctness path — every reconnection reconciles) and `catalog_notice`
   * (the freshness path — a live edit does not wait for a reconnect).
   */
  const reconcileCatalog = (serverVersion: number | undefined): void => {
    if (serverVersion === undefined) return; // an older gateway that serves no catalog
    /**
     * **A FETCH IN FLIGHT IS NEVER RESTARTED.** This used to overwrite `catalogFetch`
     * unconditionally, and the gateway broadcasts a notice to every org session on publish — so
     * a notice landing between pages destroyed the accumulated pages and started a second,
     * concurrent request chain. The next `complete` page, belonging to the ORIGINAL chain, then
     * landed in the FRESH accumulator and committed a tail-only snapshot at the full version.
     * Half the menu missing from the till, `catalog_refusal` null, and permanent — because the
     * early return below then sees parity forever. Only the org's next edit could repair it.
     *
     * Letting the running fetch finish is correct rather than merely safe: it is already
     * pinned to a version, and if a newer one exists the very next `hello_ack` reconciles.
     * Dropping a notice costs freshness and never correctness — the property the whole design
     * rests on.
     */
    if (catalogFetch !== null) return;
    const have = store.catalog.version();
    if (serverVersion <= have) return;
    // A fresh accumulator per fetch. A half-accumulated snapshot from a dead session must
    // never merge with pages from the next one — that would splice two menus together and
    // commit the result under one version number, which is undetectable at the till.
    catalogFetch = createCatalogFetch(have);
    catalogRetries = 0;
    requestCatalog(have);
  };

  /**
   * `01-F76` — **this device's own BRANCH artifact key**, assembled here and never echoed from a
   * frame. The org comes from the authenticated session and the branch from the device's own
   * identity; a device that repeated a scope it was told would be stating a client role claim
   * (commandment 8), and under R25 the roster's scope IS its credential blast radius, so the field
   * is the whole ruling.
   *
   * ⚠ **Renamed from the `…StaffKey` pair when `01-F81` added `device_roster`, which is
   * branch-scoped too (`01-F76`: one scope shape, `branch_id` non-null).** One assembly, not two:
   * a second copy of the same three lines is one fact declared twice, free to drift, and this
   * repo's `catalog.enabled` finding is the worked example of what that costs.
   */
  const ownBranchKey = (): { org_id: string; branch_id: string } => ({
    org_id: store.identity.org_id,
    branch_id: store.identity.branch_id,
  });

  const isOwnBranchKey = (scope: { org_id: string; branch_id: string | null }): boolean =>
    scope.org_id === store.identity.org_id && scope.branch_id === store.identity.branch_id;

  /** Start (or continue) a roster fetch (`01-F75`/`01-F76`/`01-F77`). */
  const requestStaff = (have_version: number, from = 0, at_version?: number): void => {
    transport.send({
      v: 2,
      kind: "reference_request",
      resource: "staff",
      scope: ownBranchKey(),
      have_version,
      ...(from === 0 ? {} : { from }),
      ...(at_version === undefined ? {} : { at_version }),
    });
  };

  /**
   * `01-F77` — this device's roster version out of `hello_ack`'s per-artifact set, matched on the
   * WHOLE key. A device at another branch of the same org has its own `staff` key in that array
   * (fan-out is keyed by the artifact key), so matching on `resource` alone would fetch a roster
   * this device must refuse.
   *
   * Absence is the same signal it is for the catalog: an artifact the org has published nothing
   * for is OMITTED, never sent as `0`, so the device simply never asks — a `?? 0` here would have
   * every till in the fleet asking a gateway that has nothing to answer with, for ever.
   */
  const staffVersionIn = (
    keys: Extract<ProtocolMessage, { kind: "hello_ack" }>["reference_versions"],
  ): number | undefined =>
    keys?.find((key) => key.resource === "staff" && isOwnBranchKey(key.scope))?.version;

  /**
   * Compare and fetch if behind — the ONE place that decides a roster fetch is needed, called
   * from both `hello_ack` (the correctness path: every reconnection reconciles, including for a
   * device offline a week that could not have heard an announcement) and `reference_notice` (the
   * freshness path). `reconcileCatalog`'s reasoning holds unchanged, including why a fetch in
   * flight is never restarted.
   */
  const reconcileStaff = (serverVersion: number | undefined): void => {
    if (serverVersion === undefined) return; // the org has published no roster for this branch
    if (staffFetch !== null) return;
    const have = store.staff.version();
    if (serverVersion <= have) return;
    staffFetch = createStaffFetch(have);
    staffRetries = 0;
    requestStaff(have);
  };

  /**
   * `01-F81` (a)/(e) — start (or continue) a BRANCH DEVICE ROSTER fetch.
   *
   * `requestStaff`'s frame one resource over, and deliberately the SAME triple: `01-F74` (b)'s
   * smuggling ban survives its own unblocking, so the roster rides `01-F75`'s own member and never
   * a `reference_response` typed for another resource. The scope is this device's own branch key,
   * assembled from its bound identity and never echoed from a frame (commandment 8).
   */
  const requestDeviceRoster = (have_version: number, from = 0, at_version?: number): void => {
    transport.send({
      v: 2,
      kind: "reference_request",
      resource: "device_roster",
      scope: ownBranchKey(),
      have_version,
      ...(from === 0 ? {} : { from }),
      ...(at_version === undefined ? {} : { at_version }),
    });
  };

  /**
   * `01-F77`/`01-F81` (e) — this device's roster version out of `hello_ack`'s per-artifact set,
   * matched on the WHOLE key.
   *
   * ⚠ **`undefined` here is what makes the staged rollout work, and it is ONE OF TWO ENTRY POINTS
   * `01-F81` (e) governs — not the whole of it.** A gateway that does not serve `device_roster`
   * OMITS the key (`01-F77`: omitted, never `0`), so this returns `undefined` and the device NEVER
   * ASKS — and `01-F81` (e) makes a request for an unserved resource a client that ignored the
   * advertisement, which earns a session-killing refusal by default. A `?? 0` here would have every
   * till in the fleet asking a gateway that cannot answer, and losing its session for it.
   *
   * ⚠ **This comment said "the whole of `01-F81` (e)" and that was FALSE WHEN WRITTEN — and its
   * correction then claimed a protection that is NOT here either, so read the second half
   * carefully.** The other entry point is `reference_notice`, which reaches `reconcileDeviceRoster`
   * — and `reconcileStaff`, and `reconcileCatalog` — with **no reference to what this session
   * advertised**. That is still true, and it is now DELIBERATE rather than an oversight: a
   * membership guard on that path shipped on 2026-08-23 (`0073f69`) and was reverted the same day,
   * because `hello_ack.reference_versions` does not carry the fact (e) is about — it is built per
   * key from published versions, so "key missing" reads far more often as *"nothing published for
   * this key yet"* than as *"this gateway does not serve the resource"*. **The measurement, the two
   * alternatives that fail, and the one-field wire amendment that is owed are all at the
   * `reference_notice` arm in `dispatch`**; do not re-derive them from this sentence.
   *
   * So the class that IS closed here: **the `hello_ack` path, by construction** — an omitted key
   * returns `undefined` and `reconcile*` returns early, so this session never asks at hello for a
   * key it was not advertised. The class that is NOT closed, named rather than left to be
   * discovered: **the notice path**, which is not closeable from the client until the wire states
   * a served-resource set.
   */
  const deviceRosterVersionIn = (
    keys: Extract<ProtocolMessage, { kind: "hello_ack" }>["reference_versions"],
  ): number | undefined =>
    keys?.find((key) => key.resource === "device_roster" && isOwnBranchKey(key.scope))?.version;

  /**
   * Compare and fetch if behind — the ONE place that decides a roster fetch is needed, called from
   * both `hello_ack` (the correctness path) and `reference_notice` (the freshness path).
   * `reconcileCatalog`'s reasoning holds unchanged, including why a fetch in flight is never
   * restarted.
   */
  const reconcileDeviceRoster = (serverVersion: number | undefined): void => {
    if (serverVersion === undefined) return; // a gateway that does not serve this resource
    if (deviceRosterFetch !== null) return;
    const have = store.lanRoster.version();
    if (serverVersion <= have) return;
    deviceRosterFetch = createDeviceRosterFetch(have);
    deviceRosterRetries = 0;
    requestDeviceRoster(have);
  };

  /**
   * Drain the cloud outbox from the write-checkpoint onward (01-F8/01-F15). nextBatch
   * pages from acked_watermark — the cloud checkpoint — so this is correct here, unlike
   * the LAN cursor of T-01-05 fix-round 1. No pending events → send nothing; the cloud
   * answers with no push_ack and the session simply re-pushes on the next trigger.
   */
  const drainPush = (): void => {
    if (!connected) return;
    const events = store.nextBatch(CLOUD_PUSH_BATCH_MAX);
    const last = events.at(-1);
    if (last === undefined) return;
    transport.send({ v: 2, kind: "push", events, watermark: last.lamport_seq });
  };

  /**
   * Relay one origin's pending tail upward: its held events past the per-origin
   * relay cursor, lamport order, ONE origin per push (T-01-12 ruling — the
   * scalar push_ack answers that origin). Verbatim envelopes from the held
   * branch window — attested, never re-authored (01-F1).
   */
  const relayPushFor = (origin: string, held: readonly EventEnvelopeT[]): void => {
    const from = (relayAcked.get(origin) ?? -1) + 1;
    const pending = held.filter((e) => e.lamport_seq >= from).slice(0, CLOUD_PUSH_BATCH_MAX);
    const last = pending.at(-1);
    if (last === undefined) return;
    transport.send({ v: 2, kind: "push", events: [...pending], watermark: last.lamport_seq });
  };

  /**
   * Relay drain (DEC-SYNC-009): candidate rule (T-01-12, implementer-proposed —
   * flagged for oracle review): EVERY same-branch peer origin present in the
   * held branch window with events past its relay cursor. A device with its own
   * WAN session may be relayed too — gateway id-dedupe keeps the merged log
   * exactly-once (R4 green pin), and the per-origin ack is idempotent.
   */
  const relayDrain = (originFilter?: string): void => {
    if (!connected || !relayAuthorized || !relayRequested) return;
    const own = store.identity.device_id;
    const byOrigin = new Map<string, EventEnvelopeT[]>();
    for (const e of store.readAllEvents()) {
      // readAllEvents is (device_id, lamport_seq)-sorted — per-origin order holds.
      if (e.device_id === own) continue;
      if (suppressedOrigins.has(e.device_id)) continue; // gate-refused this session (F1(b))
      if (originFilter !== undefined && e.device_id !== originFilter) continue;
      const held = byOrigin.get(e.device_id);
      if (held === undefined) byOrigin.set(e.device_id, [e]);
      else held.push(e);
    }
    for (const [origin, held] of byOrigin) relayPushFor(origin, held);
  };

  // ---- cloud → device ------------------------------------------------------

  /**
   * Apply a merged batch (live fan-out or a catchup page): split the two cloud stamps
   * off each wire event and ingest it. Own events return via origin-inclusive fan-out
   * and take the store's duplicate-id adoption path (01-F34).
   *
   * The pull cursor advances ONLY through a contiguous prefix of events that actually
   * landed. A transient ingest failure stops the advance, so catchup re-delivers that
   * event; previously the cursor moved to the batch maximum regardless and the failed
   * event was skipped forever (01-F9/01-F34 convergence hole). A divergent duplicate is
   * the one failure that is permanently known-bad — its id is already stored, so
   * re-fetching cannot help; it is surfaced in status() and the cursor passes it rather
   * than wedging the pull (01-F17). setLastGlobalSeq is a raw write — monotonicity here.
   */
  const applyEvents = (events: readonly WireEvent[]): void => {
    if (events.length === 0) return;
    // Persist the WHOLE page in ONE ingest-path transaction (T-01-16, 26 §6.4 — one
    // fsync, not one per event) via store.ingestPage's per-event savepoint isolation.
    // The ordered per-item results drive the SAME contiguous-prefix cursor law the
    // per-event loop had: a divergent duplicate is surfaced + PASSED, any other
    // failure stops the advance, so a re-fetch re-delivers it (01-F9/F17/F34).
    const items: PageItem[] = events.map((e) => {
      const { global_seq, ...envelope } = e;
      return global_seq === undefined ? { envelope } : { envelope, global_seq };
    });
    const results = store.ingestPage(items);
    const priorBlock = blockedCursor;
    let advanceTo = -1;
    let blocked = false;
    // Did THIS page apply the event we were previously stuck on? Only that clears the
    // block. Adversarial-review B2: `applyEvents` serves live `event_batch` as well as
    // `catchup_response`, so a clean live batch used to clear the report AND advance
    // the cursor past the blockage — one sale on another terminal, and the blocking
    // event was never requested again. That is the "never skip" rule inverted.
    let landedBlocking = false;
    // DEC-SYNC-011: the FIRST non-landed event is where the cursor stops, so it is the
    // one reported. Previously this whole classification was thrown away — the local
    // `blocked` flag correctly stopped the advance and then told nobody, which is the
    // silence this task removes.
    let report: BlockedCursor | null = null;
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result === undefined) continue; // results is 1:1 with items — defensive only
      const global_seq = events[i]?.global_seq;
      let landed = true;
      if (!result.ok) {
        if (result.error instanceof DivergentDuplicateError) {
          // The other permanent failure, and deliberately NOT a blocked cursor: its id
          // is already stored, so re-fetching cannot help and the cursor PASSES it. It
          // is surfaced here instead (01-F17 — never wedge the pull).
          quarantined.push({ event_id: result.error.eventId, reason: "divergent_duplicate" });
        } else {
          landed = false; // did not land — the cursor must not pass it
          if (report === null && global_seq !== undefined) {
            // Only a SEQUENCED blocking event is recorded. An event with no global_seq
            // has nothing the cursor could be held below and nothing catch-up could
            // re-request by, so recording it would give a block that disables its own
            // clamp AND can never clear (`landedBlocking` compares against a null).
            // The cursor still does not pass it — `blocked` already stopped the
            // advance — so this is strictly the reporting decision.
            report = {
              global_seq,
              // Guaranteed present by the protocol schema (EventEnvelope.type is
              // z.string().min(1)) — a typeless event never reaches this layer.
              event_type: String((events[i] as { type?: unknown } | undefined)?.type ?? ""),
              reason: classifyBlock(result.error),
            };
          }
        }
      }
      if (!landed) blocked = true;
      if (landed && global_seq !== undefined && global_seq === priorBlock?.global_seq) {
        landedBlocking = true;
      }
      if (!landed) blocked = true;
      if (!blocked && global_seq !== undefined && global_seq > advanceTo) advanceTo = global_seq;
    }
    // Resolve the block BEFORE the cursor moves. A page that blocks re-reports where it
    // stopped; a page that does not can only clear a standing block by having actually
    // APPLIED the blocking event — not merely by being clean. A live fan-out batch at
    // seq 1000 says nothing about seq 500.
    if (report !== null) blockedCursor = report;
    else if (priorBlock !== null && landedBlocking) blockedCursor = null;
    // The cursor may never sit at or above a standing blockage — and if it ALREADY
    // does, it is REWOUND to just below it. That rewind is the fix for the fatal case:
    // `applyEvents` serves live fan-out as well as catch-up, so a sale on another
    // terminal at seq 20001 can push the cursor there while this device is still
    // catching up at 5000. Without the rewind, `blockingSeq - 1` could never exceed the
    // cursor, so it froze for the life of the process AND the block could never clear,
    // because catch-up re-issued from 20001 and never re-delivered the blocking event.
    // Rewinding is safe and cheap: re-delivered events dedupe by id (01-F8), and it is
    // also HONEST — discovering a blockage below the cursor means the cursor was
    // claiming ground the device does not actually hold.
    //
    // The cursor is deliberately NOT a contiguous prefix: with sliced sync (01-F40) a
    // scoped device's global_seq stream is legitimately sparse, so demanding contiguity
    // would freeze every waiter tablet. Highest-delivered is the right rule.
    const stopBefore = blockedCursor?.global_seq ?? null;
    const current = store.status().last_global_seq ?? 0;
    if (stopBefore !== null) {
      const ceiling = stopBefore - 1;
      if (advanceTo > ceiling) advanceTo = ceiling;
      if (current > ceiling && ceiling >= 0) store.setLastGlobalSeq(ceiling);
    }
    if (advanceTo >= 0 && advanceTo > (store.status().last_global_seq ?? 0)) {
      store.setLastGlobalSeq(advanceTo);
    }
  };

  const dispatch = (message: ProtocolMessage): void => {
    switch (message.kind) {
      case "hello_ack": {
        connected = true;
        // Silent renewal (01-F47). Persisted immediately, so an expiry that arrives
        // while the device is offline is already covered by the time it reconnects.
        // Dropping this — as the first cut did — makes expiry TERMINAL: at TTL every
        // device enters drain mode at once, and a hub in that state strands its branch.
        //
        // Guarded: a persistence failure (full or read-only disk on a POS terminal)
        // must not abort the rest of this handler. Unguarded it threw before
        // `drainPush`/`sendCatchup` ran, so the session did nothing, reconnected, and
        // presented the same expired token — an indefinite reconnect loop, each turn
        // costing the cloud a signature and a registry write. The session continues on
        // the token it already holds; failing to STORE a renewal must not also cost the
        // device the connection it just established (01-F17).
        if (message.renewed_token !== undefined) persistRenewal(message.renewed_token);
        // The gateway's relay advertisement (DEC-SYNC-009): absent = never relay.
        relayAuthorized = message.relay_authorized === true;
        // A FRESH session retries suppressed origins once — re-noticed →
        // re-suppressed; a re-registered origin resumes (F1(b), bounded).
        suppressedOrigins.clear();
        drainPush(); // drain the outbox tail (paged from the cloud checkpoint)
        // Exclusive cursor: global_seq starts at 1, so last_global_seq ?? 0 = "send
        // everything"; catchup_response pages via next_from while complete === false.
        sendCatchup(store.status().last_global_seq ?? 0);
        relayDrain(); // resume any latched relay work across a reconnect (DEC-SYNC-009)
        // T-C4 — THE catalog correctness mechanism (01-F9, now `01-F77`'s per-artifact set).
        // Comparing versions here is what makes every reconnection reconcile, so a device that
        // missed every notice while it was offline still converges the moment it comes back. The
        // push is only latency.
        reconcileCatalog(catalogVersionIn(message.reference_versions));
        // `01-F77` again, for the ROSTER, and the same sentence is the whole design: a notice is
        // exactly the kind of message a lossy link drops, so a design that reconciled the roster
        // only on a pushed notice gives a till nobody can sign in to after a lossy week.
        reconcileStaff(staffVersionIn(message.reference_versions));
        // `01-F81` (e) — and the same sentence a THIRD time, because the negotiation IS the answer
        // for the new member: this device asks for `device_roster` only if this session advertised
        // it, and every reconnection reconciles the key whether or not a notice ever arrived.
        reconcileDeviceRoster(deviceRosterVersionIn(message.reference_versions));
        return;
      }
      case "push_ack": {
        // Two carriers land here, and they must NOT be confused. A renewal on an ack
        // that names ANOTHER device belongs to that relayed origin — adopting it would
        // give the hub a peer's credential. Only an ack for this device (or one with no
        // origin named) is our own renewal (01-F47).
        if (message.renewed_token !== undefined) {
          const forOrigin = message.origin_device_id;
          if (forOrigin === undefined || forOrigin === store.identity.device_id) {
            persistRenewal(message.renewed_token);
          } else {
            store.noteRelayedRenewal(forOrigin, message.renewed_token);
          }
        }
        const origin = message.origin_device_id;
        if (origin !== undefined && origin !== store.identity.device_id) {
          // Per-ORIGIN relay ack (DEC-SYNC-009): record it for the mesh to
          // propagate over LAN — NEVER this session's own write-checkpoint
          // (the hub only guarantees delivery; the origin owns its outbox).
          const prev = relayAcked.get(origin) ?? -1;
          if (message.acked_watermark > prev) {
            relayAcked.set(origin, message.acked_watermark);
            store.noteRelayedCloudAck(origin, message.acked_watermark);
            relayDrain(origin); // chain the next relay page for this origin
          }
          return;
        }
        // T-01-08 owed pin F3-ext (mesh F3's shape, 19 §5): an own-stream cloud
        // ack beyond own appended high water — the wiped-device DR rejoin, where
        // quarantine slots from the pre-wipe life keep the cloud watermark high
        // (lamport_conflict fills, DEC-SYNC-005) while the reborn store holds
        // almost nothing — is IGNORED, never thrown out of the transport
        // dispatch: the checkpoint never claims unappended slots, the poison
        // value never touches the ack bookkeeping, and the session keeps
        // processing later genuine acks.
        const ownHigh = store.status().own_high_water;
        if (ownHigh === null || message.acked_watermark > ownHigh) return;
        if (lastPushAck === null || message.acked_watermark > lastPushAck) {
          lastPushAck = message.acked_watermark;
          store.advanceTo(message.acked_watermark); // THE cloud write-checkpoint (19 §5)
          drainPush(); // chain the next page past the ack — drains a > 500 backlog
        }
        return;
      }
      case "event_batch": {
        applyEvents(message.events);
        return;
      }
      case "catchup_response": {
        applyEvents(message.events);
        if (!message.complete) sendCatchup(message.next_from); // page onward (01-F9)
        return;
      }
      case "reference_notice": {
        // FRESHNESS ONLY. The system is correct if every one of these is dropped — a menu edit
        // then waits for the next reconnect instead of landing live, and `hello_ack` reconciles
        // it. That is deliberate: a notice is exactly the kind of message a lossy link loses,
        // so nothing is allowed to depend on one arriving.
        //
        // ⚠ **`01-F81` (e) IS NOT ASSERTABLE ON THIS PATH, AND A GUARD THAT CLAIMED IT WAS SHIPPED
        // IN `0073f69` AND WAS REVERTED BEFORE IT LEFT THIS MACHINE (2026-08-23).** The clause
        // reads *"a device MUST NOT request an artifact key the session's `hello_ack` did not
        // advertise, for any resource"*, and the obvious reading — gate each arm below on
        // membership of `hello_ack.reference_versions` — is wrong, because **the wire does not
        // carry the fact (e) is about.** `01-F77`'s advertisement conflates two different facts:
        // *"this gateway serves resource R"* and *"key K has a published artifact"*.
        // `services/sync-gateway/src/gateway.ts` builds the field PER KEY, from
        // `catalogVersionAtHello > 0` and `staffVersionAtHello > 0`, and omits the whole field only
        // when EVERY key is empty — and it says so in its own words at that site, calling an
        // omitted key *"indistinguishable from a gateway that does not serve the resource"*. (e)
        // is a rule about the FIRST fact; the wire only carries the second. So "field present, key
        // missing" is NOT the staged-rollout state (e) argues from. It is, far more often, **"this
        // key has published nothing yet"** — which is by construction the key whose first notice
        // matters most.
        //
        // Measured against the guarded tree, one probe per row (`hello_ack` → notice → requests):
        //
        //   · `[catalog@4]` + the branch's FIRST `staff` publish → **0** requests, against **1**
        //     without the guard.
        //   · `[staff@3]` + the org's FIRST `catalog` publish → **0**, against **1**.
        //   · `[staff@3]` + TWENTY catalog publishes v1..v20, one till connected and idle
        //     throughout → **0** requests and the till still at catalog **v0**, against 20 and
        //     v20. That is the `v0 → v20` live path `plans/wave-1/running-the-stack.md` records as
        //     run end to end, dead for the LIFE of the connection for any org whose branch has a
        //     published staff roster (`publish-http.ts`'s `/internal/users*` routes are the
        //     shipping writer that fills `kernel.staff_versions`).
        //   · the STAFF twin of that row → **0** requests and an EMPTY `store.staff`, which is the
        //     identity registry the unlock grid is built from (`01-F26`/`01-F28`): a branch's first
        //     cashier would never appear on the till until something dropped the socket.
        //
        // **Both alternatives fail for a structural reason, recorded so neither is re-attempted.**
        // Honouring absence only until the first field-carrying `hello_ack` does not help — the
        // harmful case has the field PRESENT. Making the gateway always send the field is strictly
        // worse — it would send `[]`, and the first publish of any key still arrives after the
        // advertisement was made. **The advertised set is a snapshot at connect time, and the key
        // whose freshness matters most is the one that did not exist yet.**
        //
        // ⚠ **(e)'s RESIDUAL IS A SERVER'S REFUSAL, NOT A CLIENT'S DROP, AND THE GUARD INHERITED
        // THE JUSTIFICATION WITHOUT THE PRECONDITION.** (e) bounds the cost as *"a session lost
        // that way costs a reconnect and `hello_ack` reconciles every key on the next one"*. A
        // client-side drop produces neither: no refusal slot is set (and no refusal slot has a
        // production reader except `catalogRefusal`), and `transport-ws.ts` reconnects only on
        // `close`/`error` with no keepalive re-hello — so nothing ends the outage. Unbounded, and
        // silent.
        //
        // **WHERE (e) IS STILL ENFORCED: the `hello_ack` path, by construction.** `catalogVersionIn`
        // / `staffVersionIn` / `deviceRosterVersionIn` return `undefined` for an omitted key and
        // every `reconcile*` returns early on it, so this session never asks for a key it was not
        // advertised AT HELLO. The notice path cannot enforce it without deleting `01-F75`'s
        // freshness path.
        //
        // ⚠ **OWED AS A SPEC ACT AND DELIBERATELY NOT ATTEMPTED HERE: a one-field wire amendment to
        // `01-F77`/`01-F81` (e)** — `hello_ack` stating the SERVED RESOURCE SET as a fact distinct
        // from the per-key versions. With that field (e) becomes assertable on this path and this
        // comment becomes a guard. Doc 01 is AT its `23-F3` line cap (359 lines against ~350), so
        // the amendment needs room made for it first; and a wire field invented by a client is the
        // `01-F4`-shaped error one layer down.
        if (message.resource === "catalog") {
          reconcileCatalog(message.version);
          return;
        }
        // `01-F76` — one version PER KEY: a notice for another branch's roster is about an
        // artifact this device does not hold and starts nothing. No refusal is recorded for it
        // either: a notice carries no artifact, so there is nothing that could have been applied
        // silently, and `foreign_artifact` is the name for a refused ARTIFACT (below). This is a
        // SCOPE test and never (e)'s membership test — the two were conflated by the reverted
        // guard, and only this one is decidable from what the wire carries.
        if (message.resource === "device_roster") {
          if (isOwnBranchKey(message.scope)) reconcileDeviceRoster(message.version);
          return;
        }
        if (isOwnBranchKey(message.scope)) reconcileStaff(message.version);
        return;
      }
      case "reference_response": {
        if (message.resource === "device_roster") {
          /**
           * `01-F76`'s device-side refusal, before "a fetch we did not start". On THIS artifact a
           * mis-routed roster is another branch's admission list applied as our own, and the
           * refusal is what stops the scope being decoration.
           *
           * ⚠ **THE ORDER IS NOT WHAT THE `staff` ARM SAYS IT IS, AND THIS ARM INHERITED THE CLAIM
           * VERBATIM.** That comment says the dangerous case is a mis-routed artifact arriving
           * *while a fetch IS in flight* and that ordering the ignore first would answer the clause
           * one case away. Disproved by mutation 2026-08-23: swapping the two checks kills **0**
           * tests, and cannot kill any, because with a fetch in flight the ignore does not fire —
           * ignore-first still reaches the foreign check before `accept()`. The order decides one
           * thing only: whether the refusal is OBSERVABLE when NO fetch is in flight (a server
           * volunteering a foreign artifact unasked). Refusing loudly there is right — that is the
           * routing failure `01-F76` names, and it is exactly the case a device cannot otherwise
           * see — but the ordering is asserted by NOTHING, in either arm. A refusal-observability
           * assertion for the no-fetch-in-flight case is owed on both.
           */
          if (!isOwnBranchKey(message.scope)) {
            deviceRosterRefusal = {
              reason: "foreign_artifact",
              have_version: store.lanRoster.version(),
            };
            return;
          }
          // A frame for a fetch we did not start — a late page from a previous connection, or a
          // server volunteering one. Ignored rather than applied: applying it would splice pages
          // from two different fetches into one commit.
          if (deviceRosterFetch === null) return;
          const rosterStep = deviceRosterFetch.accept(message);
          if (!rosterStep.done) {
            // NO FORWARD PROGRESS means the server is not paging (`01-F17`, and `no_progress` is
            // `catalog-fetch`'s token rather than one invented here — see the `staff` arm).
            // The condition is `noForwardProgress`'s, declared once for all three resources: this
            // arm shipped a copy that also required an EMPTY page and therefore looped for ever on
            // a page that carried rows. See that declaration for the measurement.
            if (noForwardProgress(message)) {
              deviceRosterFetch = null;
              deviceRosterRefusal = {
                reason: "no_progress",
                have_version: store.lanRoster.version(),
              };
              return;
            }
            requestDeviceRoster(
              rosterStep.fetchMore.have_version,
              rosterStep.fetchMore.from,
              rosterStep.fetchMore.at_version,
            );
            return;
          }
          deviceRosterFetch = null;
          if (rosterStep.update === null) return;
          /**
           * ⚠ **THE APPLY, AND THE ONE THING IT DOES NOT DO.** `01-F81` (b) puts SIGNATURE
           * VERIFICATION here — at apply, over the assembled artifact — and it is **not
           * implemented**, because (c) pins the verifying key **at pairing** (`01-F80` (f)) and no
           * device holds one: `01-F80`'s claim endpoint is unbuilt and `setLanCredential` has no
           * shipping caller. A verifier written now would refuse every artifact for want of a key
           * nothing can supply, which is a correct implementation that blocks this transport.
           *
           * What `01-F81` (d) DID close is that an unsigned roster is unrepresentable on the wire,
           * so the bytes are carried on every frame and only the check is owed. What it did NOT
           * close is stated here rather than left implied: **this line believes what it is told.**
           * The bound is `01-F75` (ii)/(iii)'s — the reference-data channel has ONE leg, the
           * cloud's, authenticated end to end, and a hub relays no reference data of any kind,
           * which is the same argument that lets `staff` carry Argon2id credentials here unsigned —
           * plus `01-F72` (d): `createLanMesh` refuses at the CREDENTIAL gate, so today this
           * artifact is an admission input on no shipped path. Both facts die in the same change,
           * the one that lands `01-F80`'s pairing, so that is the change the verifier lands with.
           *
           * ⚠ **AND NO GATEWAY SERVES THIS RESOURCE, SO THIS LINE HAS NEVER RUN IN PRODUCTION.**
           * `lanRoster.apply` now has a shipping caller — this one — and its CALLEE does not exist:
           * `services/sync-gateway/src/gateway.ts` builds `hello_ack.reference_versions` from
           * `catalog` and `staff` only, emits no `device_roster` notice, and throws
           * `ProtocolViolationError` on a `device_roster` request (its own comment says so). So the
           * device half is complete and the artifact cannot arrive: **the blocking callee is the
           * gateway SERVE PATH**, which needs the signer `01-F81` (b)/(c) specifies. Stated here
           * because "has a shipping caller" reads as "reaches the product", and on this artifact it
           * does not — this repo's most-recorded defect with the arrow pointing the other way.
           *
           * `received_at` is the ARRIVAL wall clock and never `signature.signed_at`: `lan-roster`
           * measures "how long since the cloud last told us who is on this branch", and `01-F81`
           * (b) gives `signed_at` to `00 §5.7`'s display and nothing else — never to a fold and
           * never to an ordering decision (`01-F34`, law 1).
           */
          const rosterResult = store.lanRoster.apply(rosterStep.update, clock.now());
          if (rosterResult.applied) {
            deviceRosterRefusal = null;
            deviceRosterRetries = 0;
            return;
          }
          if (rosterResult.reason === "needs_snapshot") {
            // The belt to the server's brace: it decided a delta was constructible and this device
            // disagrees about the base. Ask again from where we actually are — BOUNDED, because
            // the frame cannot REQUEST a form and a server answering with the same bad delta would
            // be asked for ever.
            deviceRosterRefusal = {
              reason: rosterResult.reason,
              have_version: rosterResult.version,
            };
            if (deviceRosterRetries >= DEVICE_ROSTER_MAX_RETRIES) return;
            deviceRosterRetries += 1;
            deviceRosterFetch = createDeviceRosterFetch(rosterResult.version);
            requestDeviceRoster(rosterResult.version);
            return;
          }
          // `stale` is not a fault — it means a redelivery of something we already hold — so only
          // the real refusals are surfaced (`01-F56` + DEC-SYNC-011, the `staff` arm's reasoning).
          if (rosterResult.reason !== "stale") {
            deviceRosterRefusal = {
              reason: rosterResult.reason,
              have_version: rosterResult.version,
            };
          }
          return;
        }
        if (message.resource === "staff") {
          /**
           * `01-F76`'s device-side refusal, checked BEFORE "a fetch we did not start". Without the
           * refusal the scope is decoration: a mis-routed roster applies silently as version N,
           * every later comparison agrees with itself, and the divergence `01-F56` exists to
           * detect is undetectable by construction.
           *
           * It is the BELT to `01-F71` (e)'s brace (the server derives the key from the session
           * and refuses a request stating another), never a substitute for it — commandment 8.
           *
           * ⚠ **THIS COMMENT USED TO NAME THE WRONG CASE AS THE DANGEROUS ONE, AND THE `01-F81`
           * ARM ABOVE COPIED IT VERBATIM.** It said the dangerous case is a mis-routed roster
           * arriving *while a fetch IS in flight*, and that ordering the ignore first would answer
           * the clause one case away. Disproved by mutation 2026-08-23: swapping the two checks
           * kills **0** tests, and cannot — with a fetch in flight the ignore does not fire either
           * way, so both orders reach the foreign check before `accept()`. The order decides only
           * whether the refusal is OBSERVABLE when NO fetch is in flight, i.e. a server
           * volunteering a foreign artifact unasked; that is the right behaviour and it is
           * asserted by nothing. The assertion is owed on both arms.
           */
          if (!isOwnBranchKey(message.scope)) {
            staffRefusal = {
              reason: "foreign_artifact",
              have_version: store.staff.version(),
            };
            return;
          }
          // A frame for a fetch we did not start — a late page from a previous connection, or a
          // server volunteering one. Ignored rather than applied: applying it would splice pages
          // from two different fetches into one commit, and on this artifact the commit is a set
          // of credentials.
          if (staffFetch === null) return;
          const staffStep = staffFetch.accept(message);
          if (!staffStep.done) {
            // NO FORWARD PROGRESS means the server is not paging. `01-F17`: an unbounded
            // receive-path loop is one of the few things in this session that could stop a till
            // selling, and each iteration costs the gateway a fold over the branch's whole entry
            // table — a hot loop against credential storage.
            //
            // ⚠ `no_progress` is `catalog-fetch`'s own token and is NOT in the vocabulary
            // `01-F76` closes (`stale`/`needs_snapshot`/`malformed`/`divergent`/
            // `foreign_artifact`). It is used rather than invented-anew because one word for one
            // condition across both artifacts is what stops a fleet dashboard needing two, and
            // it is reported as a finding rather than treated as settled.
            //
            // ⚠ **THE COMMENT ABOVE STATED THE PURPOSE AND THE CONDITION BELOW ONLY HALF MET IT.**
            // It also required an EMPTY page, so a server answering `{ complete: false,
            // next_from: 0, entries: [one row] }` produced exactly the hot loop against credential
            // storage this paragraph names — 300 measured rounds, refusal `null`. `noForwardProgress`
            // is now one declaration for all three resources; see it for the measurement.
            if (noForwardProgress(message)) {
              staffFetch = null;
              staffRefusal = { reason: "no_progress", have_version: store.staff.version() };
              return;
            }
            requestStaff(
              staffStep.fetchMore.have_version,
              staffStep.fetchMore.from,
              staffStep.fetchMore.at_version,
            );
            return;
          }
          staffFetch = null;
          if (staffStep.update === null) return;
          const staffResult = store.staff.apply(staffStep.update);
          if (staffResult.applied) {
            staffRefusal = null;
            staffRetries = 0;
            return;
          }
          if (staffResult.reason === "needs_snapshot") {
            // The belt to the server's braces: it decided a delta was constructible and this
            // device disagrees about the base. Ask again from where we actually are — BOUNDED by
            // a counter, because the frame has no way to REQUEST a form, so nothing here forces
            // a snapshot and a server answering with the same bad delta would be asked forever.
            staffRefusal = { reason: staffResult.reason, have_version: staffResult.version };
            if (staffRetries >= STAFF_MAX_RETRIES) return;
            staffRetries += 1;
            staffFetch = createStaffFetch(staffResult.version);
            requestStaff(staffResult.version);
            return;
          }
          // `01-F56` + DEC-SYNC-011: a refusal is OBSERVABLE. `stale` is not a fault — it means
          // a redelivery of something we already hold — so only the real refusals are surfaced,
          // and a device that reported one every time it was current would send a manager to
          // look for a problem that does not exist.
          if (staffResult.reason !== "stale") {
            staffRefusal = { reason: staffResult.reason, have_version: staffResult.version };
          }
          return;
        }
        // A frame for a fetch we did not start — a late page from a previous connection, or a
        // server volunteering one. Ignored rather than applied: applying it would splice pages
        // from two different fetches into one commit.
        if (catalogFetch === null) return;
        const step = catalogFetch.accept(message);
        if (!step.done) {
          // NO FORWARD PROGRESS means the server is not paging. Without this a `next_from` that
          // never advances is an unbounded request loop with `pending` growing on the till —
          // which is what shipped: the condition also required an EMPTY page, so a page carrying
          // one row grew `pending` unboundedly with the cursor pinned at 0 (300 measured rounds).
          // `noForwardProgress` is the ORIGIN of this token and now its one declaration; the two
          // roster arms above inherited both the token and the defect from this line.
          if (noForwardProgress(message)) {
            catalogFetch = null;
            catalogRefusal = { reason: "no_progress", have_version: store.catalog.version() };
            return;
          }
          requestCatalog(
            step.fetchMore.have_version,
            step.fetchMore.from,
            step.fetchMore.at_version,
          );
          return;
        }
        catalogFetch = null;
        if (step.update === null) return;
        const result = store.catalog.apply(step.update);
        if (result.applied) {
          catalogRefusal = null;
          catalogRetries = 0;
          return;
        }
        // `01-F56` + DEC-SYNC-011: a refusal is OBSERVABLE. `stale` is not a fault — it means a
        // redelivery we already have — so only the three real refusals are surfaced.
        if (result.reason === "needs_snapshot") {
          // The belt to the server's braces: it decided a delta was constructible and this
          // device disagrees about the base. Ask again from where we actually are.
          //
          // BOUNDED BY A COUNTER, not "by construction" as an earlier comment claimed — the
          // frame has no way to REQUEST a form, so nothing here forces a snapshot and a server
          // that keeps answering with the same bad delta would be asked forever. `01-F56`'s
          // text is "the device asks for a snapshot instead"; the protocol cannot express that
          // request, so the honest fallback is to stop asking and say so.
          catalogRefusal = { reason: result.reason, have_version: result.version };
          if (catalogRetries >= CATALOG_MAX_RETRIES) return;
          catalogRetries += 1;
          catalogFetch = createCatalogFetch(result.version);
          requestCatalog(result.version);
          return;
        }
        if (result.reason !== "stale") {
          catalogRefusal = { reason: result.reason, have_version: result.version };
        }
        return;
      }
      case "quarantine_notice": {
        quarantined.push({ event_id: message.event_id, reason: message.reason });
        // T-01-08 (01-F37 "originating device notified" / PROTOCOL.md:
        // quarantine_notice → origin device): when the quarantined event is a
        // HELD PEER's — the relay shape, where the live cloud notice terminates
        // at this pushing hub session — record it on the store seam for the
        // mesh to forward over the LAN. The WAN-less origin has no cloud
        // session; the hub's LAN forward is its only notification path
        // (at-least-once — the gateway's durable outbox redelivers on the
        // origin's next own hello, DEC-SYNC-008).
        const held = store.readAllEvents().find((e) => e.id === message.event_id);
        if (held !== undefined && held.device_id !== store.identity.device_id) {
          // F1(b) (T-01-09 fix round, ruled): an origin the gateway's registry
          // gate refused stops relaying for this session's life — its events
          // can never ack, so every re-push is a wasted loop iteration.
          if (message.reason === "origin_unregistered" || message.reason === "origin_revoked") {
            suppressedOrigins.add(held.device_id);
          }
          // 01-F48's LAN half, as far as the hub can observe it: the cloud has told us
          // This origin is REVOKED. LAN eviction is no longer this line's job — the roster
          // owns it (01-F74) and the transport enforces it — but one thing still is: a revoked
          // device must not be handed a CREDENTIAL. The hub re-forwards a pending relayed
          // renewal on every heartbeat by design (01-F47, so a tablet that was off the LAN can
          // still renew), so without this drop a token minted moments before its device was
          // revoked would keep being offered to it.
          if (message.reason === "origin_revoked") store.clearRelayedRenewal(held.device_id);
          store.noteRelayedQuarantineNotice(held.device_id, {
            event_id: message.event_id,
            reason: message.reason,
          });
        }
        return;
      }
      default:
        return; // hello/push/catchup_request are device→cloud; ping/pong/purge unused here
    }
  };

  const handlers: CloudTransportHandlers = {
    onUp: () => {
      if (running) sendHello();
    },
    onDown: () => {
      connected = false;
      // A fetch belongs to ONE connection. Dropping the accumulator here is what stops a
      // snapshot half-received on a dead session being completed with pages from the next one
      // — which would splice two menus together and commit the result under one version
      // number, undetectable at the till. The next hello_ack starts a fresh fetch if needed.
      catalogFetch = null;
      catalogRetries = 0;
      // Same rule for the roster, and `01-F75`'s cost is the same one artifact over: a half
      // received roster completed with pages from the NEXT connection splices two rosters under
      // one version number, which is undetectable at the till and decides who may open a shift.
      // `staffRefusal` deliberately SURVIVES the disconnect — like `blocked`, it is a property of
      // the artifact and the refusal is still true when the link returns (R28: an old roster
      // admits, so nothing already landed is touched either).
      staffFetch = null;
      staffRetries = 0;
      // And a third time for `01-F81`'s device roster, whose splice would decide who may be
      // ADMITTED to the branch LAN. `deviceRosterRefusal` survives the disconnect for
      // `staffRefusal`'s reason.
      deviceRosterFetch = null;
      deviceRosterRetries = 0;
    },
    onMessage: (message) => {
      if (running) dispatch(message);
    },
  };

  return {
    start() {
      if (running) return;
      running = true;
      // The mesh (acting hub) signals over the store seam when it ingests
      // follower events (DEC-SYNC-009): latch the request — the flag survives a
      // WAN-down window so hello_ack resumes the relay — and drain if possible.
      unsubscribeRelay = store.onRelayDrainRequested(() => {
        if (!running) return;
        relayRequested = true;
        relayDrain();
      });
      // Fix round F4 (DEC-SYNC-006): the mesh signals over the same seam when
      // it leaves hub duty (hub→follower demotion, or stop) — clear the latch
      // so no later hello_ack resumes relaying from a demoted device.
      unsubscribeRelayCancel = store.onRelayDrainCancelled(() => {
        relayRequested = false;
      });
      transport.start(handlers);
    },

    stop() {
      if (!running) return;
      running = false;
      connected = false;
      if (unsubscribeRelay !== null) {
        unsubscribeRelay();
        unsubscribeRelay = null;
      }
      if (unsubscribeRelayCancel !== null) {
        unsubscribeRelayCancel();
        unsubscribeRelayCancel = null;
      }
      transport.stop();
    },

    notifyAppended() {
      if (!running) return;
      drainPush();
    },

    status() {
      return {
        connected,
        last_push_ack: lastPushAck,
        last_global_seq: store.status().last_global_seq,
        quarantined: [...quarantined],
        // A property of the CURSOR, not the connection (01-F11 / 00 §5.7): it is
        // reported alongside `connected: true` on a live link, and it survives a
        // disconnect, because the blockage is still there when the link returns. The
        // two have different remedies — ship a build that understands the event vs
        // restore the network — so a UI that conflates them sends staff to the wrong fix.
        blocked: blockedCursor === null ? null : { ...blockedCursor },
        // Like `blocked`, a property of the CATALOG rather than of the connection: it survives
        // a disconnect because the refusal is still true when the link returns, and it clears
        // only when an update actually applies.
        catalog_refusal: catalogRefusal === null ? null : { ...catalogRefusal },
        // Two slots, never one: a roster problem and a menu problem have different remedies, and
        // `01-F56` makes each observable in device health on its own key (`01-F76`).
        staff_refusal: staffRefusal === null ? null : { ...staffRefusal },
        // Three slots, never two: `01-F81`'s roster of DEVICES is a different artifact from
        // `01-F28`'s roster of PEOPLE, and a surface that conflated them would send an operator
        // hunting a PIN problem when what stopped was LAN admission.
        device_roster_refusal: deviceRosterRefusal === null ? null : { ...deviceRosterRefusal },
      };
    },
  };
};
