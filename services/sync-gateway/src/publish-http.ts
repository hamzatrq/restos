import { timingSafeEqual } from "node:crypto";
import { CatalogEntryWire } from "@restos/sync-protocol";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { type CatalogEntry, catalogPage, publishCatalog } from "./catalog.js";
import { readDayWindow } from "./day-ledger.js";
import { appendOrgEvent, orgEventHistory } from "./org-events.js";
import { listDevices } from "./registry.js";
// `revoke-device.ts` carries a main-module entry guard, so importing it runs nothing. Reaching for
// the CLI's own function is the point — see the route below.
import { revokeRegisteredDevice } from "./revoke-device.js";

/**
 * **THE SEAM THE FOUNDER RULED INTO EXISTENCE: the API publishes, the gateway serves**
 * (`plans/wave-1/catalog-transport.md` §6 Q1).
 *
 * `services/api` had a working staged-edit store, `14-F28` scheduling and a publish path built
 * against `CatalogPublisher` and `LedgerAppender` PORTS with in-memory implementations — so an
 * owner could author a menu, schedule it, publish it, and nothing reached a device. This module is
 * the other end of those two ports.
 *
 * **Why HTTP with a service credential and not something else.** The rejected alternative in the
 * ruling is the gateway reading the API's tables, which "buys one copy of the menu at the cost of
 * coupling two services at the database — the thing a service boundary exists to prevent". The
 * mirror image loses for the same reason: giving `services/api` a Drizzle handle on
 * `kernel.catalog_*` would make two services write one table, which `18 §4` forbids in exactly
 * these words. A queue or a retry framework loses on `24-F23` — a menu publish is owner-initiated,
 * low-rate, and already retryable by pressing save again, so the durability a broker buys is
 * durability nobody asked for, at the cost of a third piece of infrastructure to run. What is left
 * is a request over a contract, and that is what this is.
 *
 * **`/internal` is a routing statement, not a security control.** The credential is the control;
 * the prefix says this surface is peer-to-peer and belongs behind whatever fronts the deployment,
 * so nobody reads a 401 here as a device-facing refusal (`01-F47` device tokens reach `/sync` and
 * nothing else — a device credential is not accepted here and this credential is not accepted
 * there).
 *
 * **The gateway still never parses menu structure.** Entries pass through to `publishCatalog`,
 * which validates them against `CatalogEntryWire` — the schema the DEVICE wire enforces — and
 * against `01-F60` completeness. Neither rule is re-stated here, and this module contains no
 * knowledge of what an item is.
 */

/**
 * `01-F60`'s enabled `(branch, channel)` grid, supplied per publish.
 *
 * **Required, and refused when absent** — the founder's July 2026 ruling, which `publishCatalog`
 * also enforces at runtime through a cast. Restated at the wire because this is where a JavaScript
 * caller with no types actually arrives: an HTTP body that simply omits the field would otherwise
 * reach `publishCatalog` as `undefined` and be refused there with a message about a field the
 * caller never saw a schema for.
 */
const EnabledPairsWire = z.object({
  branches: z.array(z.string().min(1)),
  channels: z.array(z.string().min(1)),
});

const CatalogPublishRequest = z.object({
  org_id: z.string().min(1),
  entries: z.array(CatalogEntryWire).min(1),
  actor_user_id: z.union([z.string().min(1), z.null()]),
  /**
   * The CALLER's instant, not this server's, and that is deliberate. `services/api`'s
   * `publishEdits` takes ONE `deps.now()` reading and uses it for both the artifact and every
   * `catalog.changed` it appends, so a `14-F8` bulk edit's history rows cannot disagree about when
   * "the" edit happened. A gateway that stamped its own clock would split that one instant into
   * two and reintroduce exactly that disagreement. `01-F62` makes it legitimate: the emitter is the
   * cloud plane, which is the one place a clock is not a threat.
   */
  now: z.number().int(),
  enabled: EnabledPairsWire,
});

const OrgEventRequest = z.strictObject({
  org_id: z.string().min(1),
  type: z.string().min(1),
  actor_user_id: z.union([z.string().min(1), z.null()]),
  server_received_at: z.number().int(),
  payload: z.unknown(),
});

const OrgQuery = z.object({ org_id: z.string().min(1) });

/**
 * `14-F13`'s revocation, arriving from `services/api` on behalf of an AUTHENTICATED owner.
 *
 * **No actor field, deliberately.** The registry stores provisioning bookkeeping and not event
 * history (T-01-09), so attribution does not belong in this write — it belongs on the
 * `device.revoked` org-scoped event, which `services/api` appends through `/internal/org-events`
 * because `01-F62` puts that emission on the doc 14 emitter. Accepting an actor here would create a
 * second place attribution could be recorded and a first place it could be recorded *only*.
 */
const DeviceRevokeRequest = z.strictObject({
  org_id: z.string().min(1),
  device_id: z.string().min(1),
});

/**
 * `12-F10`'s window query. `branch_ids` is a comma-separated list, and its ABSENCE is what means
 * "every branch" — an empty string is refused, because a `reportScope` narrowing that resolved to
 * nothing must never widen into an org roll-up (`day-ledger.ts` states the same rule at the
 * function). `coerce` is used because query parameters are strings; `int()` is what stops
 * `from_ms=abc` becoming `NaN` and selecting nothing while reporting success.
 */
const LedgerWindowQuery = z.object({
  org_id: z.string().min(1),
  from_ms: z.coerce.number().int(),
  to_ms: z.coerce.number().int(),
  branch_ids: z.string().min(1).optional(),
});

/**
 * Constant-time bearer comparison. `timingSafeEqual` throws on a length mismatch, so the lengths
 * are compared first and a wrong-length credential is refused without ever reaching it — the
 * length leak is unavoidable and uninteresting; the byte-by-byte early return is the one worth
 * closing.
 */
const credentialMatches = (offered: string, expected: string): boolean => {
  const a = Buffer.from(offered, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
};

const bearerOf = (header: string | undefined): string | null => {
  if (header === undefined) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match === null ? null : (match[1] as string);
};

type PublishDeps = {
  /** The gateway's database handle, already open at the composition root. */
  readonly db: Parameters<typeof publishCatalog>[0];
  /**
   * The service credential this surface accepts, or `undefined` when the deployment declared none.
   *
   * **Absent is FAIL-CLOSED, never fail-open**: every route answers `503` and no publish is
   * possible. The tempting shape — skip the check when no secret is configured, "for local dev" —
   * makes an unconfigured production gateway accept a menu from anyone who can reach the port. It
   * is also the direction that hides: the product works perfectly right up until it is on the
   * internet.
   */
  readonly publishSecret: string | undefined;
  /**
   * Tell every LIVE session in the org that a new catalog version exists
   * (`plans/wave-1/catalog-transport.md` T-C3 — "the notice broadcast to an org's connected
   * sessions"; §3.2 — "a `catalog_notice` frame covers the case where the version changes
   * DURING a live session"). `01-F52`: announcing that a new version exists is the mechanism;
   * the frame carries no menu.
   *
   * **REQUIRED, not optional, and that is the whole point.** `createGateway` has shipped
   * `notifyCatalogVersion` since T-C3 with **zero production callers** — two acceptance tests and
   * nothing else — so from the day `/internal` began accepting menus until August 2026 no notice
   * was ever emitted. Measured live: with a till connected and idle, an owner pressed **Apply
   * now** in the back office, the publish returned `200`, and the device's `catalog_state` stayed
   * at version 0 with 0 rows until it was restarted. The screen that promised *"every till in the
   * organisation changes as soon as this saves"* was telling the owner something the system did
   * not do (`00 §5` — sync honesty).
   *
   * `seams:check` cannot see this class: a key in an object literal is not an export, so Rule A
   * never looked at it, and there was no options-bag member for Rule B to find unsupplied. An
   * OPTIONAL member here would have re-created exactly that hole one layer out, which is why this
   * one is required — a deployment cannot forget it and still compile.
   *
   * Correctness does not depend on it and must not: §3.2 makes version-on-`hello_ack` the
   * correctness mechanism and the notice "only latency", so a dropped notice costs freshness and
   * never correctness. That is why this is called after the publish has already been committed
   * and its failure cannot fail the publish.
   */
  readonly notifyCatalogVersion: (org_id: string, version: number) => void;
};

/** Rows per internal page. Matches `CATALOG_PAGE_SIZE`, which is what `catalogPage` serves. */
const foldPublished = async (
  db: PublishDeps["db"],
  org_id: string,
): Promise<{ version: number; entries: CatalogEntry[] }> => {
  // `catalogPage(db, org_id, 0, from)` is the SNAPSHOT fold — what a device would fetch — and it
  // pages, because a device frame is capped for 2–3 GB reference hardware (`00 §4`). The back
  // office is a cloud peer with none of that constraint and needs the whole fold to compute
  // `14-F3`'s `before_ref`, so the paging is walked HERE rather than pushed into the adapter:
  // asking `services/api` to reassemble pages would put a second copy of the paging idiom in a
  // service the ruling exists to keep ignorant of catalog mechanics.
  const first = await catalogPage(db, org_id, 0, 0);
  const entries = [...first.entries];
  let page = first;
  // Pin the version across pages, exactly as a device does: without `at_version` a publish
  // between pages would change both the version and the ordering the offset indexes into, and the
  // fold would silently mix two menus.
  while (!page.complete) {
    page = await catalogPage(db, org_id, 0, page.next_from, first.version);
    entries.push(...page.entries);
  }
  return { version: first.version, entries };
};

/**
 * `RangeError` is `publishCatalog`'s and `appendOrgEvent`'s refusal vocabulary — `01-F60`
 * incompleteness, an unservable entry, an empty change set, a branch-scoped type. Those are the
 * CALLER's mistakes and must come back as `400` with the message intact, because the message is
 * the only thing that tells an owner *which* of 4,000 rows to fix. Anything else is ours and stays
 * a `500`: turning an unexpected fault into a `400` would tell the back office the menu was bad
 * when the database was down, and the owner would go looking for a typo that is not there.
 */
const refusalStatus = (error: unknown): number => (error instanceof RangeError ? 400 : 500);

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * The two `/internal` READS take one already-parsed query parameter, so anything they throw came
 * from the DATABASE and never from the caller.
 *
 * Left uncaught it becomes Fastify's default 500 body — `{ statusCode, error: "Internal Server
 * Error", message }` — and `services/api`'s `ErrorBody` schema parses that happily, reading
 * `error` as the literal string "Internal Server Error" and dropping the `ECONNREFUSED` that names
 * the actual fault. So the operator three services away is told "Internal Server Error" about a
 * database nobody started. Naming the dependency here is what keeps that legible (`00 §5.7`).
 */
const databaseFailure = (what: string, error: unknown): string =>
  `${what}: the sync gateway could not read from its database (${causeChain(error)}). This is an ` +
  `infrastructure state on the gateway, not a rejected request.`;

/**
 * The message and every `cause` beneath it, outermost first.
 *
 * **Measured, not assumed:** `DrizzleQueryError.message` is the SQL that failed, and the
 * `connect ECONNREFUSED 127.0.0.1:5432` that actually explains it lives one `cause` deeper. Taking
 * only the top message hands the operator a query they cannot act on and discards the one sentence
 * that tells them to start Postgres. The depth bound guards against a cycle, not against length —
 * a real chain here is two links.
 */
const causeChain = (error: unknown): string => {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== undefined && current !== null; depth++) {
    parts.push(messageOf(current));
    current = current instanceof Error ? current.cause : undefined;
  }
  return parts.join(" ← ");
};

export const registerPublishRoutes = (app: FastifyInstance, deps: PublishDeps): void => {
  app.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/internal/")) return;
    if (deps.publishSecret === undefined) {
      request.log.error(
        "an /internal publish request arrived and no PUBLISH_TOKEN is configured — refusing " +
          "(fail-closed). Until it is set this gateway can serve no menu it was not already given.",
      );
      await reply.code(503).send({ error: "publish surface not configured (no PUBLISH_TOKEN)" });
      return;
    }
    const offered = bearerOf(request.headers.authorization);
    if (offered === null || !credentialMatches(offered, deps.publishSecret)) {
      await reply.code(401).send({ error: "unauthorized" });
    }
  });

  app.post("/internal/catalog/publish", async (request, reply) => {
    const parsed = CatalogPublishRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: `catalog publish: ${z.prettifyError(parsed.error)}` });
    }
    const { org_id, entries, actor_user_id, now, enabled } = parsed.data;
    try {
      const version = await publishCatalog(deps.db, org_id, entries as CatalogEntry[], {
        actor_user_id,
        now,
        enabled,
      });
      // AFTER the publish is committed, and never in front of the reply's failure path: the
      // artifact is what a device fetches, so a notice for a version that did not land would send
      // every till in the org after a menu that does not exist. Ordered this way the worst case is
      // a landed version nobody was told about, which `hello_ack` reconciles on the next connect.
      deps.notifyCatalogVersion(org_id, version);
      return reply.code(200).send({ version });
    } catch (error: unknown) {
      return reply.code(refusalStatus(error)).send({ error: messageOf(error) });
    }
  });

  app.get("/internal/catalog/published", async (request, reply) => {
    const parsed = OrgQuery.safeParse(request.query);
    if (!parsed.success)
      return reply.code(400).send({ error: "catalog published: org_id required" });
    try {
      return reply.code(200).send(await foldPublished(deps.db, parsed.data.org_id));
    } catch (error: unknown) {
      request.log.error({ err: error }, "catalog published: database read failed");
      return reply.code(500).send({ error: databaseFailure("catalog published", error) });
    }
  });

  app.post("/internal/org-events", async (request, reply) => {
    const parsed = OrgEventRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: `org event: ${z.prettifyError(parsed.error)}` });
    }
    try {
      await appendOrgEvent(deps.db, parsed.data);
      return reply.code(200).send({});
    } catch (error: unknown) {
      return reply.code(refusalStatus(error)).send({ error: messageOf(error) });
    }
  });

  app.get("/internal/org-events", async (request, reply) => {
    const parsed = OrgQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "org events: org_id required" });
    try {
      return reply.code(200).send({ events: await orgEventHistory(deps.db, parsed.data.org_id) });
    } catch (error: unknown) {
      request.log.error({ err: error }, "org events: database read failed");
      return reply.code(500).send({ error: databaseFailure("org events", error) });
    }
  });

  /** `14-F12`'s per-branch device list, as far as this table can honestly answer it. */
  app.get("/internal/devices", async (request, reply) => {
    const parsed = OrgQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "devices: org_id required" });
    try {
      return reply.code(200).send({ devices: await listDevices(deps.db, parsed.data.org_id) });
    } catch (error: unknown) {
      request.log.error({ err: error }, "devices: database read failed");
      return reply.code(500).send({ error: databaseFailure("devices", error) });
    }
  });

  /**
   * `14-F13` — the kill switch, reachable from an authenticated back-office screen at last.
   *
   * **It calls `revokeRegisteredDevice`, the SAME function `pnpm … revoke-device` calls**, and that
   * is the load-bearing part rather than convenience. Two paths to one act means two readings of
   * "revoked": the read-before-write that refuses an unknown `device_id` (a mistyped id matches no
   * rows, returns `void` and reports success over a till that is still selling), the already-revoked
   * branch that refuses to move the original instant, and the post-write re-read. A second
   * implementation here would drift from all three, and `03-F40`'s two sensor bit layouts is this
   * corpus's own record of what that costs.
   *
   * `01-F48`'s enforcement is untouched and is not re-stated: the running gateway's
   * `sweepRevocations` re-reads the registry, so a revocation written *here* evicts a live session
   * within the same bound a CLI one does. This route sets `revoked_at`; nothing else changes.
   */
  app.post("/internal/devices/revoke", async (request, reply) => {
    const parsed = DeviceRevokeRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: `device revoke: ${z.prettifyError(parsed.error)}` });
    }
    try {
      const outcome = await revokeRegisteredDevice(deps.db, {
        org: parsed.data.org_id,
        device: parsed.data.device_id,
      });
      return reply.code(200).send(outcome);
    } catch (error: unknown) {
      return reply.code(refusalStatus(error)).send({ error: messageOf(error) });
    }
  });

  /**
   * `12-F10` — one business day of the merged org log, for the nightly owner summary.
   *
   * **This route SERVES rows and interprets none of them.** No fold, no money, no notion of a
   * business day: the caller states the window in milliseconds and `services/api` — where the
   * `can()` check that decides how wide the answer may be already lives — does the rest. Same
   * split as the catalog: *the API publishes, the gateway serves*, one surface over.
   *
   * The projected row carries **only** the seven envelope fields `01-F34` permits a fold to read.
   * `global_seq`, `lamport_seq`, `device_created_at` and `server_received_at` never cross, so an
   * ordering field cannot reach a projected value even by accident on the far side — which is a
   * stronger guarantee than the fold's own discipline, because it survives the next person editing
   * `summary.ts`. `latest_arrival_ms` is the one exception and it is a scalar about the ORG's
   * freshness (`12-F8`), never attachable to an event.
   */
  app.get("/internal/ledger/window", async (request, reply) => {
    const parsed = LedgerWindowQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: `day ledger: ${z.prettifyError(parsed.error)}` });
    }
    const { org_id, from_ms, to_ms, branch_ids } = parsed.data;
    try {
      const result = await readDayWindow(deps.db, {
        org_id,
        // Absent ⇒ every branch. A present-but-empty value cannot occur: the schema pins
        // `min(1)`, so `branch_ids=` is a 400 rather than a silent org-wide widening.
        branch_ids: branch_ids === undefined ? null : branch_ids.split(","),
        from_ms,
        to_ms,
      });
      return reply.code(200).send(result);
    } catch (error: unknown) {
      request.log.error({ err: error }, "day ledger: window read failed");
      return reply.code(refusalStatus(error)).send({ error: databaseFailure("day ledger", error) });
    }
  });
};
