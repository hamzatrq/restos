import type { EventEnvelopeT } from "@restos/domain";
import type { ProtocolMessage } from "@restos/sync-protocol/messages";
import type { CloudTransport, CloudTransportHandlers } from "@restos/sync-protocol/transport";
import type { OriginIdentity } from "./identity.js";
import type { Outbox } from "./outbox.js";

/**
 * `06-F36` (c)/(d)/(e) — **the drain. The half of `06-F30` that makes an accepted order reach a
 * restaurant.**
 *
 * Reproduced on a real stack before this file existed: three carts, three `200 {"order_id":…}`
 * responses, and `select device_id, count(*)` over the gateway's ledger returning **zero rows**.
 * The till's Orders tab read *"No new orders from the website or WhatsApp."* Every part of the
 * path was correct and nothing connected them — `L8` in `AGENTS.md`, this module's turn.
 *
 * ⚠ **THIS IS NOT A SECOND PROTOCOL, AND THAT IS THE WHOLE DESIGN CONSTRAINT.** It speaks the
 * `hello` / `push` / `push_ack` that `01-F8` defines and every device already uses, over the same
 * `CloudTransport` seam and the same `createWsCloudTransport` adapter `apps/pos-electron` dials
 * with. `06-F30`'s strongest argument for making the storefront a registered device was that the
 * kernel then needs **no new message kind** — inventing an HTTP ingest route beside `/sync` would
 * throw that away and leave two readings of one wire, which diverge.
 *
 * ⚠ **AND IT IS NOT `createCloudSession`, which is a measurement rather than a preference.** That
 * session takes a `DeviceStore`: **44 members**, twenty of them folds (`openOrders`,
 * `kitchenQueue`, `availability`, `shifts`, `days`, `customers`…). The drain uses **four**
 * (`identity`, `nextBatch`, `advanceTo`, `status().own_high_water`). Constructing the other forty
 * would give a public, internet-facing cloud service the branch mirror `06-F30` forbids it in
 * terms: *"the origin holds no branch slice: it appends and pushes, and it never folds a branch
 * stream"*. What is reused is the SHAPE — drain from the checkpoint, `push` with the batch's last
 * lamport as the watermark, advance only on `push_ack`, chain the next page — and the wire.
 */

/**
 * `06-F36` (c) — the outbox page per push.
 *
 * The same value `packages/sync-client`'s cloud session uses, and deliberately a local constant
 * rather than an import: this service depends on `@restos/sync-protocol` (the wire) and not on
 * `@restos/sync-client` (a device's storage layer), and reaching into the device package for one
 * number would drag `better-sqlite3` into a cloud service's dependency graph. Id-dedupe makes an
 * overlapping re-push free (`01-F8`), so the two drifting apart costs nothing.
 */
export const STOREFRONT_PUSH_BATCH_MAX = 500;

export type Uplink = {
  start: () => void;
  stop: () => void;
  /**
   * `06-F36` (e) — an order was durably persisted; push it now.
   *
   * ⚠ **A drain with no wake is a drain that runs at connect and never again, and this product has
   * already shipped exactly that.** `apps/pos-electron` carried `CloudSession.notifyAppended` with
   * zero production callers: five events durably appended, the gateway's ledger at **0 rows**, and
   * the whole replication path correct with nothing to trigger it. `server.ts` subscribes this to
   * the outbox's `onPut`, and `uplink.test.ts` §C is the assertion — because a seam this shape is
   * invisible to `seams:check` (a supplied member is not an exercised one).
   */
  notifyAppended: () => void;
  /** `00 §5.7` — what this uplink actually knows, never a constant. */
  status: () => UplinkStatus;
};

export type UplinkStatus = {
  connected: boolean;
  /** The highest lamport the gateway has durably merged for this origin, or null. */
  last_push_ack: number | null;
  /**
   * `01-F42`/`01-F48` — this origin has been REVOKED and the gateway said so. Terminal for the
   * session: nothing this origin pushes will ever be admitted again.
   */
  revoked: boolean;
};

export type UplinkDeps = {
  readonly identity: OriginIdentity;
  readonly outbox: Outbox;
  readonly transport: CloudTransport;
  /** The `01-F47` device token. Renewals arrive on the wire and supersede it for this process. */
  readonly token: string;
  /**
   * Where an operator finds out. Separate from `console` so a test can read it, and REQUIRED
   * rather than defaulted: an uplink that swallows a revocation or a quarantine notice is
   * `00 §5.7`'s honesty failure, and a default `() => {}` is how one ships.
   */
  readonly report: (line: string) => void;
};

export const createUplink = (deps: UplinkDeps): Uplink => {
  const { identity, outbox, transport, report } = deps;

  let running = false;
  let connected = false;
  let lastPushAck: number | null = null;
  let revoked = false;
  /**
   * `01-F47`'s silent renewal, held for this process's life and used by every subsequent `hello`.
   *
   * Not persisted, and that is a decision with a reason rather than an omission: a push-only
   * origin whose token expires is admitted by the gateway in **drain mode** — which is the only
   * mode it ever wanted — and handed a FORCED renewal on that very `hello_ack`. So this origin
   * cannot brick at TTL the way a device that needs to READ can, which is the failure `01-F47`'s
   * persistence clause exists to prevent. What a restart costs is one extra renewal, not service.
   */
  let token = deps.token;
  /**
   * One push in flight at a time. `pending()` is a database read, so an unguarded drain triggered
   * by both a `put` and a `push_ack` would interleave two reads and push the same page twice —
   * harmless on the wire (`01-F8` id-dedupe) and a needless round trip against the outbox.
   */
  let draining = false;
  let drainAgain = false;

  const drain = (): void => {
    if (!running || !connected || revoked) return;
    if (draining) {
      drainAgain = true;
      return;
    }
    draining = true;
    void (async () => {
      try {
        const pending = await outbox.pending();
        const page = pending.slice(0, STOREFRONT_PUSH_BATCH_MAX);
        const last = page.at(-1);
        // Nothing pending is the normal state, not an error: the outbox is empty most of the day.
        if (last !== undefined && connected) {
          transport.send({
            v: 2,
            kind: "push",
            events: page as EventEnvelopeT[],
            // The batch's own last slot. `01-F8`'s contiguity is per origin, so a watermark past
            // what this page carries would claim slots the gateway has not seen.
            watermark: last.lamport_seq,
          });
        }
      } catch (error: unknown) {
        // ⚠ NEVER THROWN ONWARD. The outbox is Postgres and Postgres goes away; a read failure
        // here must cost this drain attempt and nothing else. `01-F17`/commandment 4: the accept
        // path stays open, the rows stay durable, and the next wake or reconnect tries again.
        report(`storefront uplink: outbox read failed, will retry — ${String(error)}`);
      } finally {
        draining = false;
        if (drainAgain) {
          drainAgain = false;
          drain();
        }
      }
    })();
  };

  const sendHello = (): void => {
    transport.send({
      v: 2,
      kind: "hello",
      device_id: identity.device_id,
      device_class: identity.device_class,
      branch_id: identity.branch_id,
      token,
      /**
       * `06-F36` (c) — **PUSH-ONLY, and these two zeroes are where that is declared.**
       *
       * This origin holds no branch slice (`06-F30`), so it has no `global_seq` cursor to resume
       * from and never sends a `catchup_request`. The gateway ignores both fields on `hello` (it
       * computes `resume_from` from its own `device_watermarks`), so they are this end's honest
       * statement of what it holds: nothing.
       */
      last_global_seq: 0,
      own_high_water: 0,
      // Not advertised: a push-only origin receives almost nothing worth compressing, and
      // `DEC-SYNC-010`'s grant only holds if both ends opt in — so declining is a whole
      // negotiation this service does not have to be right about.
    });
  };

  const dispatch = (message: ProtocolMessage): void => {
    switch (message.kind) {
      case "hello_ack": {
        connected = true;
        if (message.renewed_token !== undefined) token = message.renewed_token;
        // `06-F36` (c): NO `catchup_request` and no reference reconciliation. This origin resolves
        // prices over HTTP against the published artifact (`06-F33`) and folds nothing.
        drain();
        return;
      }
      case "push_ack": {
        /**
         * `06-F36` (d) / `19 §5` — THE write-checkpoint, and the only thing that clears the outbox.
         *
         * An ack naming ANOTHER origin is a relayed one (`DEC-SYNC-009`) and is not this origin's
         * checkpoint. This service relays nothing and can only ever be relayed, so such an ack
         * should never arrive; adopting one would mark this origin's rows acked on the strength of
         * a different device's merge.
         */
        const origin = message.origin_device_id;
        if (origin !== undefined && origin !== identity.device_id) return;
        if (message.renewed_token !== undefined) token = message.renewed_token;
        const acked = message.acked_watermark;
        if (lastPushAck !== null && acked <= lastPushAck) return;
        lastPushAck = acked;
        void (async () => {
          try {
            await outbox.ack(acked);
          } catch (error: unknown) {
            // The rows stay unacked and re-push; `01-F8`'s id-dedupe makes that free. Losing the
            // checkpoint write must never lose the connection (`01-F17`).
            report(`storefront uplink: checkpoint write failed, will re-push — ${String(error)}`);
            return;
          }
          drain(); // chain the next page past the ack — drains a backlog over 500
        })();
        return;
      }
      case "purge_command": {
        /**
         * `01-F42`/`01-F48` — this origin is REVOKED. Stop pushing: every later attempt is refused
         * and re-presenting the same credential on every reconnect is a hot loop against the
         * gateway's registry.
         *
         * ⚠ **WHAT IT DOES NOT DO, named rather than left to be discovered: it does not close the
         * ORDERING DOOR.** `POST /trpc/placeOrder` goes on accepting carts into a durable outbox
         * that will never drain, which is this file's own defect one state over. Closing it is a
         * refusal a customer sees, and which refusal a customer sees is `06-F37` (c)'s owed
         * mapping and `06-F27`'s backpressure — a decision for the surface that renders it. The
         * rows are safe (`01-F1` — nothing is deleted) and `01-N5`'s replacement path is a fresh
         * `device_id`, whose outbox is this same table under a new identity.
         */
        revoked = true;
        connected = false;
        report(
          `storefront uplink: ⚠ THIS ORIGIN IS REVOKED (01-F25/01-F42). Device ` +
            `${identity.device_id} for ${identity.org_id}/${identity.branch_id} pushes nothing ` +
            `further, and orders accepted from here will not reach the branch. The HTTP door is ` +
            `still open — stop this process.`,
        );
        transport.stop();
        return;
      }
      case "quarantine_notice": {
        // `00 §5.7`: a refused event is OBSERVABLE. Silence here is how an order that the gateway
        // rejected looks exactly like an order it accepted.
        report(`storefront uplink: gateway quarantined an event — ${JSON.stringify(message)}`);
        return;
      }
      default:
        /**
         * `06-F36` (c) — **`event_batch` lands here and is DROPPED, which is the FR rather than
         * laziness.** The gateway's `joinFanout` puts every session on the branch fan-out and its
         * `sliceFilter` is the identity function (`01-F39`'s slice predicate is unbuilt), so this
         * socket really does receive the branch's events. `06-F30` forbids this origin a branch
         * slice, so they are not stored, not folded and not counted. ⚠ The wasted bandwidth is
         * inherited and is recorded in `services/storefront/CLAUDE.md`; it cannot be fixed from
         * this end.
         */
        return;
    }
  };

  const handlers: CloudTransportHandlers = {
    onUp: () => {
      if (!running || revoked) return;
      sendHello();
    },
    onDown: () => {
      connected = false;
      // Nothing else. Reconnect is the transport's job (`createWsCloudTransport` schedules it
      // through its injected clock), the outbox is durable, and an offline branch is the NORMAL
      // state — `00 §5.1`: cloud-originated orders "queue for the branch and enter the moment
      // connectivity returns".
    },
    onMessage: dispatch,
  };

  return {
    start: () => {
      if (running) return;
      running = true;
      transport.start(handlers);
    },
    stop: () => {
      if (!running) return;
      running = false;
      connected = false;
      transport.stop();
    },
    notifyAppended: drain,
    status: () => ({ connected, last_push_ack: lastPushAck, revoked }),
  };
};
