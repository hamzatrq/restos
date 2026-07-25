// T-01-07 gateway core (plans/wave-0/kernel-tasks.md T-01-07; owning spec 01 §3):
// cloud merge with per-org global_seq (01-F3), idempotent push ingest + per-ORIGIN
// high-water ack (01-F8), persist-before-ack (01-F2 cloud side), branch-stream
// fan-out + catchup paging (01-F9/01-F34), quarantine storage (01-F37; registry
// parse at the merge boundary, 01-F4). Per-device sessions remain the default;
// additionally a relay-AUTHORIZED session (T-01-09: token hub_relay claim AND an
// unrevoked hub-eligible registry row — neither alone) may push same-org/branch
// peers' events verbatim — attested, never re-authored — with lamport contiguity
// tracked per ORIGIN device (DEC-SYNC-009, T-01-12; supersedes DEC-SYNC-004's
// blanket no-proxy rule). T-01-09 auth at every boundary: hello = jose signature
// + injected-clock expiry + claims/hello consistency + registry authority
// (01-F25/01-F27, 18 §4/§5); every later operation re-checks revocation
// (rejection, never quarantine; 01-F42 purge on a revoked hello); relayed
// origins are registry-checked at the merge boundary (`origin_unregistered` /
// `origin_revoked` — the DEC-SYNC-009 F6 hole). Transport-free: the socket
// adapter (server.ts) owns the wire codec; every outbound message is a decoded
// ProtocolMessage through the sink.
import {
  type EventEnvelopeT,
  HUB_ELIGIBLE_CLASSES,
  newId,
  parseEvent,
  refundRemainderExceeded,
} from "@restos/domain";
import { negotiateCompression, type ProtocolMessage, parseMessage } from "@restos/sync-protocol";
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { DEVICE_TOKEN_TTL_MS, issueDeviceToken, verifyDeviceToken } from "./auth.js";
import { AuthRejectedError, ProtocolViolationError, type QuarantineReason } from "./errors.js";
import { type DeviceRegistryRow, readRegistryRow, recordTokenExpiry } from "./registry.js";

/**
 * Revocation eviction bound (01-F48 / DEC-AUTH-002): a revoked device leaves the mesh
 * within this window wherever any path reaches it, rather than at its next voluntary
 * contact. Exported so fleet health and operators can state the guarantee.
 */
export const REVOCATION_SWEEP_INTERVAL_MS = 10_000;

/** Exported binding constant (T-01-07 catchup contract). */
export const CATCHUP_PAGE_SIZE = 500;

export type Clock = { now(): number };
export type GatewayDb = PostgresJsDatabase<Record<string, unknown>>;
export type GatewayConnection = {
  handle(message: ProtocolMessage): Promise<void>;
  close(): void;
};
export type Gateway = {
  connect(sink: (message: ProtocolMessage) => void): GatewayConnection;
  close(): Promise<void>;
  /**
   * Evict every live session whose device is now revoked (01-F48 / DEC-AUTH-002).
   * Revocation previously took effect only at a device's next VOLUNTARY contact, so
   * a revoked tablet holding an open session kept participating indefinitely. Driving
   * this pass at most every REVOCATION_SWEEP_INTERVAL_MS gives the ≤ 30 s bound; the
   * drive mechanism (timer, LISTEN/NOTIFY, or an in-process hook after revokeDevice)
   * is the host's choice. Fail-CLOSED: if revocation state cannot be read, sessions
   * are dropped rather than kept — the opposite direction from expiry, which fails
   * open toward the device keeping its ability to sell.
   */
  sweepRevocations(): Promise<void>;
};

type Sink = (message: ProtocolMessage) => void;
type SessionState = {
  sessionId: string;
  orgId: string;
  branchId: string;
  deviceId: string;
  /**
   * Hub-relay GRANT, composed at hello (T-01-09; DEC-SYNC-009): token claim
   * hub_relay AND the session's unrevoked registry row has a hub-eligible class
   * (01-F13/01-F39). The claim alone grants nothing (registry veto); registry
   * eligibility alone grants nothing (claim required, 18 §5).
   */
  relayAuthorized: boolean;
  /**
   * DRAIN mode (T-01-18; 01-F47's "sole purpose" clause made operative). True while
   * an expired-but-unrevoked device is admitted PUSH-ONLY: it may upload its backlog
   * and take a renewal, but every READ — catch-up, fan-out — is refused, because
   * reads are where customer data leaks (00 §5.4) and a credential the cloud no
   * longer fully trusts must not read. The same instinct as the revoked-reader fix.
   * Cleared the moment the renewal is minted, on this same session. The device keeps
   * selling and persisting locally throughout (01-F17) — nothing here blocks a sale.
   */
  draining: boolean;
};
type ConnectionRecord = { sink: Sink; session: SessionState | null; open: boolean };
type WireEvent = Extract<ProtocolMessage, { kind: "event_batch" }>["events"][number];
type HelloMessage = Extract<ProtocolMessage, { kind: "hello" }>;
type PushMessage = Extract<ProtocolMessage, { kind: "push" }>;
type CatchupRequest = Extract<ProtocolMessage, { kind: "catchup_request" }>;

/** 01-F40 named seam: identity at v1 — slice predicates are Wave 1. */
const sliceFilter = (_session: SessionState, batch: readonly WireEvent[]): readonly WireEvent[] =>
  batch;

const toNumber = (value: unknown): number => Number(value);

/** Canonical JSON (sorted keys) so jsonb round-trips compare content-equal. */
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
};

/** Content identity for dedupe (01-F8): ignore the two cloud-stamped values. */
const sameContent = (stored: unknown, incoming: EventEnvelopeT): boolean => {
  const strip = (envelope: Record<string, unknown>): Record<string, unknown> => {
    const { server_received_at: _srv, global_seq: _gseq, ...rest } = envelope;
    return rest;
  };
  return (
    canonical(strip(stored as Record<string, unknown>)) ===
    canonical(strip(incoming as unknown as Record<string, unknown>))
  );
};

const registryValid = (envelope: EventEnvelopeT): boolean => {
  try {
    parseEvent(envelope);
    return true;
  } catch {
    return false;
  }
};

/** The transaction/database read surface the invariant seam needs (tx and db both satisfy it). */
type SqlExecutor = Pick<GatewayDb, "execute">;

/**
 * T-01-08 invariant seam — the merge pipeline's step 3.5 (DEC-SYNC-007 accepted):
 * the gateway enforces only fold-FREE, PROVABLE invariants inline at merge. v1
 * implements exactly one rule — the refund cap (01-F29 as amended July 2026:
 * parents resolve by ATTEMPT id, never envelope id — one intent may legitimately
 * exist under two envelope ids, which fragments any id-keyed cap; T-01-08
 * oracle-round ruling 1) — and returns null for every non-refund type: sale-path
 * events are never invariant-checked (01-F17). Runs only for events that
 * survived identity + registry + dedupe + the contiguity gate, i.e. events about
 * to merge. Reads run inside the merge transaction, so rows merged earlier in
 * THIS batch are visible — the in-batch case resolves identically to the
 * multi-push case (01-F31); the org-counter FOR UPDATE lock serializes merges,
 * so a concurrent refund on another session sees this one committed.
 */
const checkInvariants = async (
  tx: SqlExecutor,
  session: SessionState,
  envelope: EventEnvelopeT,
): Promise<QuarantineReason | null> => {
  if (envelope.type !== "payment.refunded") return null;
  // Registry parse already succeeded (step 2): the amended 01-F29 payload carries
  // amount_paisa, its OWN settlement_attempt_id (01-F31) and payment_attempt_id.
  const payload = envelope.payload as {
    amount_paisa: number;
    settlement_attempt_id: string;
    payment_attempt_id: string;
  };
  // The parent: the merged payment.recorded whose settlement_attempt_id equals
  // the refund's payment_attempt_id. Not (yet) merged — never seen, or itself
  // quarantined — is UNPROVABLE: the refund passes through (DEC-SYNC-007; a sale
  // is never blocked, 01-F17; the Auditor's refold owns the rest, T-01-11).
  const parentRows = await tx.execute(
    sql`select envelope from kernel.events
        where org_id = ${session.orgId}
          and envelope->>'type' = 'payment.recorded'
          and envelope->'payload'->>'settlement_attempt_id' = ${payload.payment_attempt_id}
        order by global_seq asc limit 1`,
  );
  const parentRow = [...parentRows][0];
  if (parentRow === undefined) return null;
  const parentPayload = (parentRow.envelope as { payload: { amount_paisa: number } }).payload;
  // Prior refunds naming the same parent, totalled over UNIQUE refund attempt
  // keys (01-F31 unique-keyed sums — an envelope-keyed Σ would double-count
  // exactly the way 01-F29's parenthetical warns). First merged wins per key.
  const priorRows = await tx.execute(
    sql`select envelope from kernel.events
        where org_id = ${session.orgId}
          and envelope->>'type' = 'payment.refunded'
          and envelope->'payload'->>'payment_attempt_id' = ${payload.payment_attempt_id}
        order by global_seq asc`,
  );
  const uniquePriors = new Map<string, number>();
  for (const row of [...priorRows]) {
    const prior = (
      row.envelope as { payload: { amount_paisa: number; settlement_attempt_id: string } }
    ).payload;
    if (!uniquePriors.has(prior.settlement_attempt_id)) {
      uniquePriors.set(prior.settlement_attempt_id, Number(prior.amount_paisa));
    }
  }
  // A refund whose OWN attempt key is already merged is the same intent
  // re-expressed under a second envelope id — it adds no new money and merges
  // without a cap check (its key already counted once, 01-F31/01-F29).
  if (uniquePriors.has(payload.settlement_attempt_id)) return null;
  let priorTotal = 0;
  for (const amount of uniquePriors.values()) priorTotal += amount;
  // The decision is exactly the domain rule's output — no re-implemented
  // arithmetic at the call site (01-F30, T-01-08 law 7).
  try {
    return refundRemainderExceeded({
      payment_amount_paisa: Number(parentPayload.amount_paisa),
      prior_refunds_total_paisa: priorTotal,
      this_refund_paisa: Number(payload.amount_paisa),
    })
      ? "invariant_violation"
      : null;
  } catch (error) {
    // Fix round F-1 (ruled, plans/wave-0/t-01-08-fix-round.md): an
    // unrepresentable prior-Σ is a PROVABLE violation, not an unprovable case —
    // if Σ(priors) alone exceeds 2^53−1 paisa it necessarily exceeds any
    // schema-valid payment_amount_paisa (the registry's integer cap is 2^53−1),
    // so the remainder is negative by pure magnitude. The domain fn's surface
    // stays as pinned (it rightly throws on unsafe args); letting that
    // RangeError escape here would abort the WHOLE push — tx rollback, no
    // quarantine row, no watermark advance, the origin's outbox re-pushing the
    // same refund forever (the DEC-SYNC-005 wedge class). Quarantine instead.
    if (error instanceof RangeError) return "invariant_violation";
    throw error;
  }
};

type MergedEvent = { envelope: EventEnvelopeT; globalSeq: number; serverReceivedAt: number };
/** deviceId = the quarantine row's attribution (fix round F2): identity-mismatch
 * rows carry the SESSION device — the only authenticated identity; content-class
 * rows of identity-valid envelopes carry the ORIGIN (DEC-SYNC-005). */
type QuarantinedEvent = { envelope: EventEnvelopeT; reason: QuarantineReason; deviceId: string };

export const createGateway = ({
  db,
  clock,
  auth,
}: {
  db: GatewayDb;
  clock: Clock;
  /**
   * REQUIRED (T-01-09): the device-token verification key (jose HS256, 18 §5).
   * T-01-18 adds four OPTIONAL knobs (01-F47 / DEC-AUTH-001). `issuer`/`audience`
   * are enforced only when set, so an unbound deployment is unchanged; `ttl_ms` is
   * the minted lifetime (90-day default) and `renew_below_ms` the remaining-life
   * threshold under which a session is silently re-issued. The threshold must NOT
   * be "always": renewing on every hello would destroy issuance determinism, which
   * the committed golden fixtures depend on.
   */
  auth: {
    token_secret: string;
    issuer?: string;
    audience?: string;
    ttl_ms?: number;
    renew_below_ms?: number;
  };
}): Gateway => {
  const branchSets = new Map<string, Set<ConnectionRecord>>();
  const branchKey = (orgId: string, branchId: string): string => JSON.stringify([orgId, branchId]);

  const joinFanout = (record: ConnectionRecord, session: SessionState): void => {
    const key = branchKey(session.orgId, session.branchId);
    const set = branchSets.get(key) ?? new Set();
    set.add(record);
    branchSets.set(key, set);
  };

  const leaveFanout = (record: ConnectionRecord): void => {
    if (record.session === null) return;
    branchSets.get(branchKey(record.session.orgId, record.session.branchId))?.delete(record);
  };

  /**
   * sec-F1 read-side revocation (audit-1 finding #1 HIGH / T-01-09 fix docket
   * F3): requireUnrevoked is a WRITE-block — it fires only on push/catchup, so a
   * device that just RECEIVES (a pure reader that never pushes) is never
   * re-checked and would keep receiving the whole branch stream after revocation
   * (a confidentiality breach; 01-F25/01-F42 kill switch, registry authority
   * 18 §5). The READ path closes it here, at fan-out delivery time. Mechanism =
   * candidate (a): a single BATCHED registry read per push (not per peer, not on
   * the per-send path), run POST-COMMIT alongside fan-out — its cost is one
   * round-trip independent of peer count and never touches the hot merge path
   * (the merge has already committed; a sale is never blocked, 01-F17). A
   * revoked peer is caught before any event bytes reach it. NOTE (implied
   * policy): eviction is LAZY — a revoked reader leaves branchSets on the next
   * fan-out to its branch, not the instant revokeDevice runs; there is no leak
   * (the next push evicts it before delivering), but an eager kill would need a
   * revokeDevice→gateway eviction hook (a cross-module change; candidate DEC on
   * eviction-latency SLA).
   */
  const revokedDeviceIds = async (
    orgId: string,
    deviceIds: readonly string[],
  ): Promise<Set<string>> => {
    if (deviceIds.length === 0) return new Set();
    const rows = await db.execute(
      sql`select device_id from kernel.device_registry
          where org_id = ${orgId} and device_id in ${deviceIds} and revoked_at is not null`,
    );
    return new Set([...rows].map((row) => String(row.device_id)));
  };

  const tokenTtlMs = auth.ttl_ms ?? DEVICE_TOKEN_TTL_MS;
  /** Default renewal threshold: the last third of life. Injectable via auth.renew_below_ms. */
  const renewBelowMs = auth.renew_below_ms ?? Math.floor(tokenTtlMs / 3);

  /**
   * Mint a renewal for a device whose recorded life is running out, and record the
   * new expiry (01-F47). Returns undefined when no renewal is due — that absence is
   * load-bearing: minting on every hello would destroy issuance determinism, which
   * the committed golden fixtures depend on.
   *
   * REVOCATION IS CHECKED BY THE CALLER via the registry row it passes — a renewal
   * must never extend a revoked device.
   *
   * NOR MAY IT ESCALATE. The renewed capability is the INTERSECTION of what the old
   * credential already carried and what the registry still allows: `priorHubRelay &&
   * registry-class-eligible`. Both halves are load-bearing and fail in opposite
   * directions — taking the registry alone would silently PROMOTE an ordinary
   * terminal to a relay-capable one just by renewing it, and taking the prior claim
   * alone would let a device demoted out of hub eligibility keep relaying forever.
   * A RELAYED origin has no prior claim visible to the cloud (its token never
   * arrives), so it renews with no relay capability at all — the conservative
   * direction, and correct: the device being relayed FOR is by definition not the hub.
   */
  const mintRenewal = async (
    executor: { execute: GatewayDb["execute"] },
    orgId: string,
    branchId: string,
    deviceId: string,
    registry: DeviceRegistryRow,
    currentExpiry: number | null,
    force: boolean,
    priorHubRelay: boolean,
  ): Promise<string | undefined> => {
    if (registry.revoked_at !== null) return undefined;
    const due = force || (currentExpiry !== null && currentExpiry - clock.now() < renewBelowMs);
    if (!due) return undefined;
    const expiresAt = clock.now() + tokenTtlMs;
    const token = await issueDeviceToken(
      {
        org_id: orgId,
        branch_id: branchId,
        device_id: deviceId,
        hub_relay:
          priorHubRelay &&
          (HUB_ELIGIBLE_CLASSES as readonly string[]).includes(registry.device_class),
      },
      auth.token_secret,
      {
        now: clock.now(),
        ttl_ms: tokenTtlMs,
        ...(auth.issuer === undefined ? {} : { issuer: auth.issuer }),
        ...(auth.audience === undefined ? {} : { audience: auth.audience }),
      },
    );
    await recordTokenExpiry(executor, orgId, deviceId, expiresAt);
    return token;
  };

  const handleHello = async (record: ConnectionRecord, message: HelloMessage): Promise<void> => {
    if (record.session !== null) {
      throw new ProtocolViolationError("second hello on an open session");
    }
    // T-01-09 hello law (01-F25/01-F27; 18 §4/§5), in order: (1) signature under
    // token_secret — the unsigned dev-token shape is RETIRED and rejects here;
    // (2) expiry against the INJECTED clock; (3) claims must match the hello
    // identity (T-01-07 consistency law carried over); (4) the REGISTRY is the
    // authority — an unrevoked (org, device) row whose branch equals the claim.
    const claims = await verifyDeviceToken(message.token, auth.token_secret, {
      ...(auth.issuer === undefined ? {} : { issuer: auth.issuer }),
      ...(auth.audience === undefined ? {} : { audience: auth.audience }),
    });
    if (claims === null) {
      throw new AuthRejectedError("device token failed verification (01-F27, 18 §5)");
    }
    // Expiry binds at ADMISSION, not only at issuance (01-F47 / DEC-AUTH-001). A
    // token with no expiry at all is refused: admitting one would leave every
    // credential minted before this rule valid forever, and the decision would buy
    // nothing. Note the ORDER — an expired token does NOT reject here; it falls
    // through to the registry read, because expiry and revocation have opposite
    // outcomes (drain-and-renew vs purge) and only the registry can tell them apart.
    if (claims.expires_at === undefined) {
      throw new AuthRejectedError(
        "device token carries no expiry (01-F47 — expiry binds at admission; " +
          "an unexpiring credential is never admitted)",
      );
    }
    const expired = claims.expires_at <= clock.now();
    if (claims.device_id !== message.device_id || claims.branch_id !== message.branch_id) {
      throw new AuthRejectedError("token claims do not match hello identity (01-F27)");
    }
    const registry = await readRegistryRow(db, claims.org_id, claims.device_id);
    if (registry === undefined) {
      // Unregistered ≠ revoked: no purge — there is nothing provisioned to wipe.
      throw new AuthRejectedError("device is not registered (01-F25; registry authority, 18 §5)");
    }
    if (registry.revoked_at !== null) {
      // 01-F42/01-F25: purge_command { scope: "all" } through the sink and NO
      // session — re-sent on EVERY hello while revoked (at-least-once; no
      // purge-ack wire kind exists in the closed PROTOCOL.md set).
      record.sink(parseMessage({ v: 1, kind: "purge_command", scope: "all" }));
      throw new AuthRejectedError("device is revoked (01-F25/01-F42)");
    }
    if (registry.branch_id !== claims.branch_id) {
      throw new AuthRejectedError(
        "registry branch does not match the claimed branch (01-F25, 18 §5)",
      );
    }
    // Relay grant (T-01-09; DEC-SYNC-009 "authenticated as branch hub"): claim
    // ∧ registry hub-eligible class — the hello's client-declared device_class
    // never grants anything (01-F39/01-F40, 18 §5).
    const relayAuthorized =
      claims.hub_relay &&
      (HUB_ELIGIBLE_CLASSES as readonly string[]).includes(registry.device_class);
    const rows = await db.execute(
      sql`select acked_watermark from kernel.device_watermarks
          where org_id = ${claims.org_id} and device_id = ${claims.device_id}`,
    );
    const watermarkRow = [...rows][0];
    const resumeFrom = watermarkRow === undefined ? 0 : toNumber(watermarkRow.acked_watermark) + 1;
    const session: SessionState = {
      sessionId: newId(),
      orgId: claims.org_id,
      branchId: claims.branch_id,
      deviceId: claims.device_id,
      relayAuthorized,
      draining: expired,
    };
    record.session = session;
    // A draining session does NOT join fan-out: fan-out is a read (01-F47 sole
    // purpose). It joins once its renewal lands, in the push_ack path.
    if (!expired) joinFanout(record, session);
    // Silent renewal for a session whose credential is still VALID but running low
    // (01-F47). A DRAINING session is deliberately excluded: its renewal rides the
    // ack of the push it was admitted to make, so that the read refusals are
    // observable in between. If it rode hello_ack there would be no drain mode at all.
    // Per-connection framing (DEC-SYNC-010, T-01-19). The server accepts whenever the
    // client advertises: this build can always decode, so the only reason to decline
    // would be a peer that cannot — and that peer simply does not advertise.
    const negotiated = negotiateCompression(message, true);
    const renewedToken = expired
      ? undefined
      : await mintRenewal(
          db,
          claims.org_id,
          claims.branch_id,
          claims.device_id,
          registry,
          claims.expires_at,
          false,
          claims.hub_relay,
        );
    record.sink(
      parseMessage({
        v: 1,
        kind: "hello_ack",
        session_id: session.sessionId,
        hub: false,
        resume_from: resumeFrom,
        ...(renewedToken === undefined ? {} : { renewed_token: renewedToken }),
        // DEC-SYNC-010: granted iff the client advertised AND this server accepts.
        // Absent means plain JSON for the life of this connection — the property that
        // stops a newly-deployed gateway sending frames an un-updated device cannot
        // parse, which in this product is a terminal that silently stops receiving orders.
        ...(negotiated === undefined ? {} : { compression: negotiated }),
        // Advertised ONLY when the grant holds (DEC-SYNC-009 / T-01-09): the
        // client-side gate for relaying — absent otherwise, keeping plain
        // sessions (and the committed XP transcript) byte-identical.
        ...(relayAuthorized ? { relay_authorized: true } : {}),
      }),
    );
    // T-01-08 hello-time notice drain (DEC-SYNC-008): AFTER hello_ack, this
    // device's undelivered notice rows are sent and then marked — the "origin
    // offline at notice time" path (a WAN-less origin's first own hello, or the
    // crash-before-mark window). At-least-once: duplicates at the client are
    // legal; a marked row is never redelivered on a later hello.
    const pendingNotices = [
      ...(await db.execute(
        // Superseded rows are skipped (T-01-21, review #7): if this device's claimed
        // event later merged legitimately, telling its origin "rejected" would be a
        // durable lie about an event that IS in the merged log — and one redelivered
        // on every subsequent hello. The join is on the full widened key so one
        // device's superseded row never suppresses another device's live notice for
        // the same claimed id.
        sql`select n.id, n.claimed_event_id, n.reason from kernel.quarantine_notices n
            where n.org_id = ${session.orgId} and n.device_id = ${session.deviceId}
              and n.delivered_at is null
              and not exists (
                select 1 from kernel.quarantine q
                where q.org_id = n.org_id and q.claimed_event_id = n.claimed_event_id
                  and q.device_id = n.device_id and q.superseded_at is not null
              )
            order by n.created_at asc, n.claimed_event_id asc`,
      )),
    ];
    for (const row of pendingNotices) {
      record.sink(
        parseMessage({
          v: 1,
          kind: "quarantine_notice",
          event_id: String(row.claimed_event_id),
          reason: String(row.reason),
        }),
      );
    }
    if (pendingNotices.length > 0) {
      await db.execute(
        sql`update kernel.quarantine_notices set delivered_at = ${clock.now()}
            where id in ${pendingNotices.map((row) => String(row.id))}`,
      );
    }
  };

  /** Per-origin contiguity state within one push transaction (DEC-SYNC-009). */
  type StreamState = { storedThrough: number; through: number; extraFilled: Set<number> };

  /**
   * T-01-09 per-operation revocation binding (01-F25/01-F27/01-F42): revocation
   * takes effect on the NEXT operation of an already-open session — push and
   * catchup_request re-check the registry and REJECT (nothing persisted, no
   * quarantine row: a revoked principal has no legitimate outbox). A revoked
   * HUB loses everything including relay by the same gate.
   */
  const requireUnrevoked = async (session: SessionState): Promise<void> => {
    const row = await readRegistryRow(db, session.orgId, session.deviceId);
    if (row === undefined || row.revoked_at !== null) {
      throw new AuthRejectedError("device revoked — operation rejected (01-F25/01-F27/01-F42)");
    }
  };

  const handlePush = async (
    record: ConnectionRecord,
    session: SessionState,
    message: PushMessage,
  ): Promise<void> => {
    await requireUnrevoked(session);
    // One transaction for the whole batch (01-F3 step 5): counter lock, event
    // inserts, quarantine inserts, and the watermark updates commit atomically.
    const outcome = await db.transaction(async (tx) => {
      // Per-org counter row, created on first contact, locked FOR UPDATE and
      // held to commit — merges serialize per org (assumption 2; law 4).
      await tx.execute(
        sql`insert into kernel.org_sequences (org_id, next_global_seq)
            values (${session.orgId}, 1) on conflict (org_id) do nothing`,
      );
      const counterRows = await tx.execute(
        sql`select next_global_seq from kernel.org_sequences
            where org_id = ${session.orgId} for update`,
      );
      let nextSeq = toNumber([...counterRows][0]?.next_global_seq);

      // Contiguity is tracked per ORIGIN device, not per session (DEC-SYNC-009):
      // slots 0..through are persisted (merged OR quarantined — assumption 3);
      // extraFilled holds out-of-order fills from this batch. Streams load
      // lazily; a plain own-events push materializes exactly one — the same
      // behavior as the per-session tracking this replaces.
      const streams = new Map<string, StreamState>();
      const streamOf = async (deviceId: string): Promise<StreamState> => {
        const existing = streams.get(deviceId);
        if (existing !== undefined) return existing;
        const watermarkRows = await tx.execute(
          sql`select acked_watermark from kernel.device_watermarks
              where org_id = ${session.orgId} and device_id = ${deviceId}`,
        );
        const watermarkRow = [...watermarkRows][0];
        const storedThrough =
          watermarkRow === undefined ? -1 : toNumber(watermarkRow.acked_watermark);
        const state: StreamState = {
          storedThrough,
          through: storedThrough,
          extraFilled: new Set(),
        };
        streams.set(deviceId, state);
        return state;
      };
      // The session's own stream always materializes (pre-relay behavior kept:
      // a push with nothing identity-valid still acks the session's own high).
      const ownStream = await streamOf(session.deviceId);

      const fill = (stream: StreamState, slot: number): void => {
        if (slot <= stream.through) return;
        stream.extraFilled.add(slot);
        while (stream.extraFilled.delete(stream.through + 1)) stream.through += 1;
      };

      // Dedupe view (01-F8): stored envelopes for every incoming id. Maintained
      // ACROSS the batch — every merge adds its envelope, so a repeated id
      // within one push dedupes instead of crashing on a duplicate PK
      // (fix-round amendment 1).
      const incomingIds = message.events.map((e) => e.id);
      const storedById = new Map<string, unknown>();
      if (incomingIds.length > 0) {
        const storedRows = await tx.execute(
          sql`select id, envelope from kernel.events where id in ${incomingIds}`,
        );
        for (const row of storedRows) storedById.set(String(row.id), row.envelope);
      }

      const merged: MergedEvent[] = [];
      const quarantined: QuarantinedEvent[] = [];
      // EVERY quarantine class of an identity-VALID envelope fills its ORIGIN's
      // lamport slot — the slot is durably held by the quarantine row, so the
      // watermark advances over it and the origin's outbox never wedges
      // (fix-round amendment 2, DEC-SYNC-005). Identity-MISMATCH envelopes
      // split by session kind (fix round F1): a PLAIN session keeps the law-6
      // fill of its OWN stream (pusher==author — the mismatch slot IS its own
      // outbox slot, which must not wedge on its own garbage); a RELAY-capable
      // session fills NO stream (stream = null) — a relayed mismatch's
      // lamport_seq belongs to the claimed ORIGIN's numbering, and filling the
      // hub's own slot at that number would displace the hub's genuine future
      // event there (watermark advance → lamport_conflict → durable merged-log
      // loss). Nothing wedges by not filling: the garbage was never in the
      // hub's outbox. NOTE: the row is stored verbatim only when THIS push is
      // the first to claim (org, claimed_event_id); if a foreign row already
      // pre-claimed the id, this insert no-ops (ON CONFLICT DO NOTHING) and the
      // honest event's bytes are NOT stored — the loud lamport_gap is the only
      // record (accepted cost of the loud-alarm ruling; widening the key to
      // (org, claimed_event_id, device_id) is scheduled hardening).
      //
      // T-01-11 fix round 2 (ruled, supersedes fix round 1's per-(org,
      // claimed_event_id) rule): the slot fill is tracked per (ORIGIN, slot). Fix
      // round 1 credited a slot only when THIS insert stored a row, which wedged an
      // honest WAN-less origin whose events were relayed before it registered — a
      // no-fill-class origin_unregistered row held the claimed id, so the later
      // legitimate fill no-op'd forever. Corrected inline below: an ON CONFLICT no-op
      // still credits the origin's slot UNLESS the blocking row is this same origin's
      // own row at a DIFFERENT slot (a forged id reused across two of the origin's
      // slots — the slot is durably held by no row of this origin; that alone stops
      // the watermark, keeping the fix-round-1 double-claim pin green). A no-fill-class
      // prior or a foreign pre-claim never blocks; a genuine (origin, slot) duplicate
      // re-credits via fill()'s slot<=through guard, exactly once.
      const quarantine = async (
        stream: StreamState | null,
        envelope: EventEnvelopeT,
        reason: QuarantineReason,
        deviceId: string,
      ): Promise<void> => {
        quarantined.push({ envelope, reason, deviceId });
        // First stored wins (01-F37): re-quarantine is an idempotent no-op.
        // envelope column is TEXT — the verbatim JSON string (amendment 3).
        // device_id attribution follows the stream semantics (fix round F2 of
        // t-01-12): identity-mismatch rows carry the SESSION device — the only
        // authenticated identity; content-class rows of identity-valid
        // envelopes carry the ORIGIN (DEC-SYNC-005 — slot-filling and the
        // T-01-11 Auditor gap check are per-origin).
        const stored = await tx.execute(
          sql`insert into kernel.quarantine
                (id, org_id, branch_id, device_id, claimed_event_id, reason, envelope, received_at)
              values (${newId()}, ${session.orgId}, ${session.branchId}, ${deviceId},
                ${envelope.id}, ${reason}, ${JSON.stringify(envelope)}, ${clock.now()})
              on conflict (org_id, claimed_event_id, device_id) do nothing
              returning claimed_event_id`,
        );
        // T-01-08 (DEC-SYNC-008): EVERY quarantine class writes a notice-outbox
        // row committed atomically with the quarantine row (persist-before-
        // notify, 01-F2). device_id follows the QUARANTINE row's attribution
        // (keying to an unauthenticated claimed id would let a forger spam
        // another device's notice stream). First stored wins — idempotent with
        // the quarantine row; a delivered row is never re-flagged by a re-push
        // (ON CONFLICT DO NOTHING).
        await tx.execute(
          sql`insert into kernel.quarantine_notices
                (id, org_id, branch_id, device_id, claimed_event_id, reason, created_at, delivered_at)
              values (${newId()}, ${session.orgId}, ${session.branchId}, ${deviceId},
                ${envelope.id}, ${reason}, ${clock.now()}, null)
              on conflict (org_id, claimed_event_id, device_id) do nothing`,
        );
        // Slot fill is tracked per (ORIGIN, slot). T-01-21 WIDENED the quarantine key to
        // (org, claimed_event_id, device_id), which collapses most of what the T-01-11
        // F2-amend had to reason about: a FOREIGN pre-claim can no longer block this
        // origin's insert at all, so it can no longer cost the origin its bytes OR its
        // credit. The insert can now only conflict with THIS SAME device's own row for
        // this claimed id — so the heal-in-place UPDATE is gone too (an honest origin
        // relayed before it registered simply stores its OWN correctly-attributed row
        // once it registers, rather than needing the hub's placeholder rewritten).
        //
        // The one surviving refusal is F2's genuine forgery case: this origin already
        // holds a row for this claimed id at a DIFFERENT slot — a forged id reused
        // across two of its own slots, so THIS slot is durably held by no row of this
        // origin and crediting it would fabricate coverage. Same-slot re-push is a
        // genuine duplicate and re-credits through fill()'s slot<=through guard, once.
        if (stream !== null) {
          if ([...stored].length > 0) {
            fill(stream, envelope.lamport_seq);
          } else {
            // Conflict ⇒ this device's own prior row for this claimed id.
            const blocker = [
              ...(await tx.execute(
                sql`select envelope from kernel.quarantine
                    where org_id = ${session.orgId} and claimed_event_id = ${envelope.id}
                      and device_id = ${deviceId}`,
              )),
            ][0];
            // review #3 (close-now, audit-1): the envelope column is TEXT and MAY be
            // corrupt (a disk fault, or a pre-storage-hardening row) — a bare
            // JSON.parse here throws INSIDE the push transaction and aborts the WHOLE
            // push, so the origin's outbox re-pushes the same batch forever (a
            // crash-wedge, never allowed: 01-F17). Still load-bearing after the
            // widening, though narrower: it can now only ever see this device's own
            // row. An unreadable blocker cannot PROVE the other-slot forgery, so we
            // take the conservative no-wedge direction and credit the slot below.
            let blockerEnvelope: { lamport_seq?: unknown } | undefined;
            if (blocker !== undefined) {
              try {
                blockerEnvelope = JSON.parse(String(blocker.envelope)) as {
                  lamport_seq?: unknown;
                };
              } catch {
                console.warn(
                  `[gateway] corrupt quarantine blocker envelope for org ${session.orgId} ` +
                    `claimed_event_id ${envelope.id} — treating as unprovable, crediting the slot ` +
                    "(review #3 crash-wedge guard, 01-F17)",
                );
              }
            }
            const sameOriginOtherSlot =
              blockerEnvelope !== undefined && blockerEnvelope.lamport_seq !== envelope.lamport_seq;
            if (!sameOriginOtherSlot) fill(stream, envelope.lamport_seq);
          }
        }
      };

      // The push's origin: ONE origin per relay push message (T-01-12 ruling) —
      // the first identity-valid envelope names it and the scalar push_ack
      // answers it. Falls back to the session's own stream when nothing is
      // identity-valid (pre-relay behavior).
      let origin: string | null = null;
      // Per-batch cache of relayed-origin registry lookups (T-01-09); null =
      // no row for (session org, claimed device).
      const originRows = new Map<string, DeviceRegistryRow | null>();

      for (const envelope of message.events) {
        // 1. Identity checks (authz class). The grant never crosses branch or
        // org; without it, pushing another device's events keeps the
        // superseded-rule rejection (device_mismatch — a hub must not be
        // forgeable by any session; DEC-SYNC-009 / T-01-09).
        const identityReason: QuarantineReason | null =
          envelope.org_id !== session.orgId
            ? "org_mismatch"
            : envelope.branch_id !== session.branchId
              ? "branch_mismatch"
              : envelope.device_id !== session.deviceId && !session.relayAuthorized
                ? "device_mismatch"
                : null;
        if (identityReason !== null) {
          // F2 (ruled): the row attributes to session.deviceId — the claimed
          // origin ids are unauthenticated garbage a forger controls.
          await quarantine(
            session.relayAuthorized ? null : ownStream,
            envelope,
            identityReason,
            session.deviceId,
          );
          continue;
        }
        // 1.4 Dedupe-BEFORE-the-origin-gate (T-01-09 fix round F1, ruled): an
        // id already in kernel.events with identical content acks through
        // REGARDLESS of the origin's current registry state — its identity was
        // authoritative at merge time. Gating it instead would mint a
        // quarantine row for a MERGED id (the merged-AND-quarantined
        // contradiction) and answer no ack, wedging a crash-replayed hub on
        // the same prefix forever. The fill is the same watermark credit a
        // same-content duplicate always earned (01-F8).
        const storedEarly = storedById.get(envelope.id);
        if (storedEarly !== undefined && sameContent(storedEarly, envelope)) {
          const dedupeStream = await streamOf(envelope.device_id);
          if (origin === null) origin = envelope.device_id;
          fill(dedupeStream, envelope.lamport_seq);
          continue;
        }
        // 1.5 Origin-existence (T-01-09 closes the DEC-SYNC-009 F6 hole; NEW
        // ids only — merged ids acked through at 1.4): a relayed
        // identity-valid envelope's origin must resolve to a registry
        // row for the SESSION's org AND branch (00 §5.4 — a same-id row in
        // another org, or another branch of this org, is unregistered HERE);
        // a registered-but-revoked origin stops relaying on next contact
        // (01-F25 — relay is that device's cloud participation by proxy; the
        // hub also suppresses a noticed origin session-side, fix round F1(b)).
        // Both classes: verbatim quarantine row, NO stream filled (F1 pattern —
        // the garbage was never in the hub's outbox), no phantom watermark, no
        // ack naming the origin. Attribution (F2 pattern): unregistered → the
        // SESSION device (the claimed id is registry-unbacked garbage a forger
        // controls); revoked → the ORIGIN (the identity is registry-known).
        if (envelope.device_id !== session.deviceId) {
          let originRow = originRows.get(envelope.device_id);
          if (originRow === undefined) {
            originRow = (await readRegistryRow(tx, session.orgId, envelope.device_id)) ?? null;
            originRows.set(envelope.device_id, originRow);
          }
          if (originRow === null || originRow.branch_id !== session.branchId) {
            await quarantine(null, envelope, "origin_unregistered", session.deviceId);
            continue;
          }
          if (originRow.revoked_at !== null) {
            await quarantine(null, envelope, "origin_revoked", envelope.device_id);
            continue;
          }
        }
        const stream = await streamOf(envelope.device_id);
        if (origin === null) origin = envelope.device_id;
        // 2. Registry parse (01-F4): unknown type or invalid payload → quarantine.
        if (!registryValid(envelope)) {
          await quarantine(stream, envelope, "schema_invalid", envelope.device_id);
          continue;
        }
        // 3. Dedupe divergence (01-F8): the same-content case was consumed at
        // 1.4 (before the origin gate); a stored id reaching here carries
        // DIVERGENT content → quarantine, never overwrite (01-F1 — the relay
        // capability licenses relay, never re-authoring).
        if (storedById.get(envelope.id) !== undefined) {
          await quarantine(stream, envelope, "id_content_divergence", envelope.device_id);
          continue;
        }
        // 4. Contiguity (per origin): a new id at an already-persisted slot is a
        // conflict; past the first gap nothing is stored (stop-at-gap,
        // assumption 4).
        if (envelope.lamport_seq <= stream.through) {
          await quarantine(stream, envelope, "lamport_conflict", envelope.device_id);
          continue;
        }
        if (envelope.lamport_seq !== stream.through + 1) break;
        // 3.5 (T-01-08, DEC-SYNC-007): fold-free invariant validation — placed
        // after the contiguity gate per the contract's sequencing note (it never
        // fires on a stop-at-gap-skipped or already-deduped event; only on
        // events about to merge). A violator quarantines with its ORIGIN's slot
        // filled (DEC-SYNC-005) so the ack advances and the outbox never wedges
        // (01-F17); following contiguous events in the same push still merge.
        const invariantReason = await checkInvariants(tx, session, envelope);
        if (invariantReason !== null) {
          await quarantine(stream, envelope, invariantReason, envelope.device_id);
          continue;
        }
        // 5. Merge (01-F3): cloud stamps assigned in array order under the org
        // lock. clock.now() runs OUTSIDE the savepoint scope: an infra failure
        // there aborts the whole merge (law 1 rollback — a crashed merge is not
        // a poisoned event), while a storage failure of THIS insert quarantines
        // this event only (fix-round amendment 3 — per-event savepoint; the
        // nested drizzle transaction is a postgres-js savepoint scope, the only
        // error-isolation form the driver honors inside a transaction).
        const serverReceivedAt = clock.now();
        try {
          await tx.transaction(async (sp) => {
            await sp.execute(
              sql`insert into kernel.events
                    (id, org_id, branch_id, device_id, lamport_seq, global_seq, server_received_at, envelope)
                  values (${envelope.id}, ${session.orgId}, ${session.branchId}, ${envelope.device_id},
                    ${envelope.lamport_seq}, ${nextSeq}, ${serverReceivedAt},
                    ${JSON.stringify(envelope)}::jsonb)`,
            );
          });
        } catch {
          // Bytes Postgres cannot faithfully hold (e.g. U+0000 in any string —
          // passes Zod, aborts the jsonb insert): the savepoint rolled back, so
          // siblings are isolated; quarantine verbatim, consume no global_seq.
          await quarantine(stream, envelope, "storage_reject", envelope.device_id);
          continue;
        }
        // Review #7 (ruled): this event has now legitimately merged, so any quarantine
        // row still holding its claimed id is a stale placeholder — typically the hub's
        // provisional `origin_unregistered` copy from the DEC-SYNC-009 race, stored
        // before the origin registered. It is MARKED superseded, never deleted: the
        // table is evidence of what a device tried to send, and deleting it would leave
        // an investigation a hole with no trace anything was removed (01-F1's spirit).
        // Marked rows drop out of the doc-15 live-quarantine surface and stop being
        // drained as notices — an origin must not be told its event was rejected when
        // the event is in the merged log.
        await tx.execute(
          // Org-wide for this claimed id — deliberately NOT scoped to the event's
          // author, and the adversarial review's M2 finding about that is filed rather
          // than fixed. Scoping to `device_id = envelope.device_id` looks obviously
          // right and breaks a RATIFIED requirement: the review-#7 pre-registration
          // placeholder is attributed to the relaying HUB (per the T-01-12 F2
          // attribution law), not to the origin, so an author-scoped predicate would
          // leave it live forever. Distinguishing "the hub's placeholder for THIS
          // event" from "a forger's row claiming the same id" needs a rule about the
          // STORED envelope's authorship, which is a semantic ruling, not a predicate
          // tweak. See the M2 entry in plans/wave-0/sec-review-followups.md.
          sql`update kernel.quarantine set superseded_at = ${serverReceivedAt}
              where org_id = ${session.orgId} and claimed_event_id = ${envelope.id}
                and superseded_at is null`,
        );
        merged.push({ envelope, globalSeq: nextSeq, serverReceivedAt });
        storedById.set(envelope.id, envelope); // in-batch dedupe view (amendment 1)
        nextSeq += 1;
        fill(stream, envelope.lamport_seq);
      }

      // (Quarantine + notice rows are inserted INLINE by quarantine() above —
      // T-01-11 fix round F2: the insert result gates the slot fill.)
      if (merged.length > 0) {
        await tx.execute(
          sql`update kernel.org_sequences set next_global_seq = ${nextSeq}
              where org_id = ${session.orgId}`,
        );
      }
      // Watermark upserts are keyed by the ORIGIN device (DEC-SYNC-009): the
      // origin's own future hello resumes past the relayed prefix; the hub
      // session's own row moves only when its own events moved it.
      for (const [deviceId, stream] of streams) {
        if (stream.through <= stream.storedThrough) continue;
        await tx.execute(
          sql`insert into kernel.device_watermarks (org_id, device_id, acked_watermark)
              values (${session.orgId}, ${deviceId}, ${stream.through})
              on conflict (org_id, device_id) do update
                set acked_watermark = excluded.acked_watermark`,
        );
      }
      const ackDevice = origin ?? session.deviceId;
      const ackStream = streams.get(ackDevice) ?? ownStream;
      return {
        acked: ackStream.through,
        ackOrigin: ackDevice === session.deviceId ? null : ackDevice,
        // Fix round F1 / ratified interpretation 2 (extended by T-01-09 to the
        // all-unregistered-origin relay push): a relay-authorized push where
        // NOTHING survives the identity + origin-registry gates names no origin
        // and filled no stream — it is
        // answered with NO push_ack (for a fresh hub an ack of 0 would claim
        // slot 0 held; for an established hub an ack would answer a question
        // about slots the push never asked about).
        mismatchOnlyRelay: session.relayAuthorized && origin === null && message.events.length > 0,
        merged,
        quarantined,
      };
    });

    // Commit precedes everything below (01-F2 cloud side — law 3). No push_ack
    // when nothing is contiguously persisted for the push's origin (through <
    // 0): an ack of 0 would claim slot 0 is held (fix-round amendment 4;
    // mirrors the LAN hub's acked ≥ 0 guard) — nor for a mismatch-only relay
    // push (fix round F1). A relay push is answered with THAT origin's
    // contiguous high, named by origin_device_id (per-origin ack —
    // DEC-SYNC-009; one origin per relay push message).
    if (outcome.acked >= 0 && !outcome.mismatchOnlyRelay) {
      // Two renewal carriers ride this ack (01-F47, T-01-18):
      // (a) DRAIN — this session was admitted expired and push-only; the push it
      //     was admitted to make has now merged, so it earns its renewal and the
      //     session becomes normal (it also joins fan-out from here).
      // (b) RELAY — the ack names a WAN-less ORIGIN whose token never reaches the
      //     cloud, so its remaining life is judged from the REGISTRY column and the
      //     hub forwards this ack to it over LAN. Without this, a LAN-only device
      //     could never renew and every waiter tablet would brick at 90 days.
      const renewFor =
        outcome.ackOrigin !== null && outcome.ackOrigin !== session.deviceId
          ? outcome.ackOrigin
          : session.deviceId;
      const renewRegistry = await readRegistryRow(db, session.orgId, renewFor);
      const renewed =
        renewRegistry === undefined
          ? undefined
          : await mintRenewal(
              db,
              session.orgId,
              renewRegistry.branch_id,
              renewFor,
              renewRegistry,
              renewRegistry.token_expires_at,
              // A drain session's renewal is FORCED — its credential is already
              // expired, so a threshold comparison would be meaningless.
              session.draining && renewFor === session.deviceId,
              // No escalation: the session renews with the relay capability it
              // already holds; a RELAYED origin renews with none (the cloud never
              // saw its claim, and the device being relayed for is not the hub).
              renewFor === session.deviceId ? session.relayAuthorized : false,
            );
      if (renewed !== undefined && session.draining && renewFor === session.deviceId) {
        session.draining = false;
        joinFanout(record, session); // reads resume on this same session
      }
      record.sink(
        parseMessage({
          v: 1,
          kind: "push_ack",
          acked_watermark: outcome.acked,
          ...(outcome.ackOrigin === null ? {} : { origin_device_id: outcome.ackOrigin }),
          ...(renewed === undefined ? {} : { renewed_token: renewed }),
        }),
      );
    }
    for (const q of outcome.quarantined) {
      record.sink(
        parseMessage({
          v: 1,
          kind: "quarantine_notice",
          event_id: q.envelope.id,
          reason: q.reason,
        }),
      );
    }
    // T-01-08 mark-on-send (DEC-SYNC-008; oracle-round ruling 3): a notice row
    // is marked delivered ONLY when the send went to a session authenticated AS
    // the row's device — the live send above went to the PUSHER, so only rows
    // attributed to the pusher's own device mark. A live send to a RELAYING hub
    // never marks the ORIGIN's row (marking there would degrade the WAN-less
    // origin — the exact deployment T-01-08 serves — to at-most-once via one
    // best-effort LAN forward). Post-commit best-effort: a crash before this
    // UPDATE leaves the row undelivered → redelivered on the device's next
    // hello (at-least-once, never lost). Only delivered_at ever updates.
    const sentToOwnDevice = outcome.quarantined
      .filter((q) => q.deviceId === session.deviceId)
      .map((q) => q.envelope.id);
    if (sentToOwnDevice.length > 0) {
      await db.execute(
        sql`update kernel.quarantine_notices set delivered_at = ${clock.now()}
            where org_id = ${session.orgId} and device_id = ${session.deviceId}
              and claimed_event_id in ${sentToOwnDevice} and delivered_at is null`,
      );
    }
    // Post-commit fan-out (01-F9/01-F34): one event_batch per push to every
    // (org, branch) session INCLUDING the origin (assumption 5), with the two
    // cloud stamps merged into the envelope at serve time (assumption 12).
    if (outcome.merged.length > 0) {
      const wireEvents: WireEvent[] = outcome.merged.map((m) => ({
        ...m.envelope,
        server_received_at: m.serverReceivedAt,
        global_seq: m.globalSeq,
      }));
      const set = branchSets.get(branchKey(session.orgId, session.branchId));
      if (set !== undefined) {
        const peers = [...set].filter(
          (peer): peer is ConnectionRecord & { session: SessionState } =>
            peer.open && peer.session !== null,
        );
        // sec-F1 (audit-1 #1 / T-01-09 F3): before any bytes fan out, one
        // batched registry read culls any peer revoked since it connected — the
        // read-side half of revocation the write-only requireUnrevoked misses
        // for a pure reader. A revoked peer is told to purge (01-F42, the same
        // signal a revoked hello gets) and dropped from branchSets; it receives
        // no event_batch. Still-authorized peers are served unchanged.
        const revoked = await revokedDeviceIds(
          session.orgId,
          peers.map((peer) => peer.session.deviceId),
        );
        for (const peer of peers) {
          if (revoked.has(peer.session.deviceId)) {
            peer.sink(parseMessage({ v: 1, kind: "purge_command", scope: "all" }));
            peer.open = false;
            leaveFanout(peer);
            continue;
          }
          peer.sink(
            parseMessage({
              v: 1,
              kind: "event_batch",
              events: [...sliceFilter(peer.session, wireEvents)],
            }),
          );
        }
      }
    }
  };

  const handleCatchup = async (
    record: ConnectionRecord,
    session: SessionState,
    message: CatchupRequest,
  ): Promise<void> => {
    await requireUnrevoked(session);
    // 01-F47 "sole purpose": a DRAIN session may push and take a renewal, nothing
    // more. Catch-up is a read, and reads are where customer data leaks (00 §5.4).
    // NOT a purge and NOT revocation — expiry is recoverable, so this refusal names
    // itself and the very next drain push clears it on this same session.
    if (session.draining) {
      throw new AuthRejectedError(
        "device token expired — session is in drain mode, reads are refused until the " +
          "renewal lands (01-F47 sole purpose; push to renew)",
      );
    }
    // Branch stream, exclusive cursor (assumption 6), ascending, page-capped.
    // Fetch one extra row to compute `complete` without a second query.
    const rows = await db.execute(
      sql`select global_seq, server_received_at, envelope from kernel.events
          where org_id = ${session.orgId} and branch_id = ${session.branchId}
            and global_seq > ${message.from_global_seq}
          order by global_seq asc limit ${CATCHUP_PAGE_SIZE + 1}`,
    );
    const fetched = [...rows];
    const page = fetched.slice(0, CATCHUP_PAGE_SIZE);
    const events = page.map((row) => ({
      ...(row.envelope as Record<string, unknown>),
      server_received_at: toNumber(row.server_received_at),
      global_seq: toNumber(row.global_seq),
    }));
    const last = page[page.length - 1];
    record.sink(
      parseMessage({
        v: 1,
        kind: "catchup_response",
        events,
        complete: fetched.length <= CATCHUP_PAGE_SIZE,
        next_from: last === undefined ? message.from_global_seq : toNumber(last.global_seq),
      }),
    );
  };

  const dispatch = async (record: ConnectionRecord, message: ProtocolMessage): Promise<void> => {
    if (message.kind === "hello") return handleHello(record, message);
    const session = record.session;
    if (session === null) {
      throw new ProtocolViolationError(
        `first message on a connection must be hello, got ${message.kind}`,
      );
    }
    switch (message.kind) {
      case "push":
        return handlePush(record, session, message);
      case "catchup_request":
        return handleCatchup(record, session, message);
      case "ping":
        record.sink(parseMessage({ v: 1, kind: "pong", t: message.t }));
        return;
      default:
        // hello_ack | push_ack | event_batch | catchup_response |
        // quarantine_notice | purge_command — server→device kinds never inbound.
        throw new ProtocolViolationError(
          `server→device kind ${message.kind} arriving inbound violates the session law`,
        );
    }
  };

  return {
    connect(sink) {
      const record: ConnectionRecord = { sink, session: null, open: true };
      // handle() serializes per connection (fix-round amendment 5): a frame
      // never begins processing before the previous frame settles — kills the
      // double-hello TOCTOU that could register one connection in two orgs'
      // fan-out sets (00 §5.4). A rejected frame never poisons the chain.
      let queueTail: Promise<void> = Promise.resolve();
      return {
        handle: (message) => {
          const settled = queueTail.then(() => dispatch(record, message));
          queueTail = settled.then(
            () => undefined,
            () => undefined,
          );
          return settled;
        },
        close: () => {
          if (!record.open) return;
          record.open = false;
          leaveFanout(record);
        },
      };
    },
    close() {
      branchSets.clear();
      return Promise.resolve();
    },
    async sweepRevocations() {
      // One batched read per org present in the live fan-out sets, then drop every
      // matching session (01-F48). Fail-CLOSED: a read that throws evicts the whole
      // org's sessions rather than leaving a revoked device connected — the opposite
      // direction from expiry, deliberately. Keeping a revoked device online because
      // we could not check is the failure this FR exists to prevent.
      for (const set of [...branchSets.values()]) {
        const records = [...set];
        const byOrg = new Map<string, ConnectionRecord[]>();
        for (const record of records) {
          const s = record.session;
          if (s === null) continue;
          byOrg.set(s.orgId, [...(byOrg.get(s.orgId) ?? []), record]);
        }
        for (const [orgId, orgRecords] of byOrg) {
          let revoked: Set<string>;
          // `unreadable` distinguishes "these devices are revoked" from "we could not
          // find out". Both drop the session — fail-closed refuses participation — but
          // only a PROVEN revocation may carry a purge. Adversarial-review H1: this
          // catch used to treat every device in the org as revoked AND send each one
          // `purge_command {scope:"all"}`, so a connection-pool blip would order an
          // org-wide wipe. That is fail-DESTRUCTIVE, not fail-closed; 01-F48 says
          // unreadable state means participation is refused, and a purge is not a
          // refusal. Inert today only because no client purge handler exists yet —
          // landing 01-F42's device half would have armed it into destruction of every
          // unsynced local ledger in the org.
          let unreadable = false;
          try {
            revoked = await revokedDeviceIds(
              orgId,
              orgRecords.map((r) => (r.session as SessionState).deviceId),
            );
          } catch {
            unreadable = true;
            revoked = new Set(orgRecords.map((r) => (r.session as SessionState).deviceId));
          }
          for (const record of orgRecords) {
            const s = record.session as SessionState;
            if (!revoked.has(s.deviceId)) continue;
            // 01-F42: the purge command rides a PROVEN eviction, so a device that is
            // reachable wipes now rather than at its next hello.
            if (record.open && !unreadable) {
              record.sink(parseMessage({ v: 1, kind: "purge_command", scope: "all" }));
            }
            record.open = false;
            record.session = null;
            leaveFanout(record);
          }
        }
      }
    },
  };
};
