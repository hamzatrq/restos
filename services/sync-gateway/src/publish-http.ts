import { timingSafeEqual } from "node:crypto";
import { DisplayName, PersonAssignment } from "@restos/domain";
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
import { listBranches, listUsers, readOrg } from "./tenancy.js";
import { createPerson, setPersonAssignments, setPersonPin, setPersonStatus } from "./user-crud.js";

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

/* ── `14-F14`'s USER CRUD, arriving from `services/api` on behalf of an AUTHENTICATED owner ───── */

/**
 * `01-F26`'s `(role, location)` pair as a caller states it.
 *
 * **No `status`, and `strictObject` refuses one BY NAME.** Participation is `11-F22`'s and the
 * writer decides it — `active` where she is newly assigned, carried over where she already was —
 * because a caller that could state it could create a cashier who is `inactive` on her first shift,
 * and could silently return a departed one to `active` by re-sending her old assignment.
 *
 * ⚠ **THE ROLE IS `packages/domain`'s OWN DECLARATION, REACHED ONE LAYER EARLIER — AND IT WAS A
 * BARE STRING UNTIL A TYPO CAME BACK AS A `500` (August 2026).** This comment used to argue that
 * *"the role is a bare string HERE and is judged by `PersonRecord.shape.assignments` at the
 * writer"*, because a second `z.enum` at the wire would be a second copy of a closed set (`18 §2`).
 * The premise is right and the conclusion did not follow: `PersonAssignment.shape.role` **is** that
 * one declaration — the same schema object, not a copy — so reaching it here costs no second
 * interpretation and buys the class of the refusal. Left as a bare string, `cashierr` parsed
 * happily, travelled to `PersonRecord.shape.assignments.parse` inside the writer, and threw a
 * `ZodError`, which `refusalStatus` maps to **500** — an owner told her back office had an internal
 * fault when she had mistyped a role. This is exactly the move `display_name` below already makes
 * with `DisplayName`, and its recorded reason ("a `400` naming the field instead of a `500`
 * carrying a `ZodError` from inside `insertUser`") is this one verbatim.
 *
 * **`refusalStatus` was deliberately NOT widened to map every `ZodError` to 400**, which is the
 * one-line alternative: the writer also parses **stored rows** through the same schemas
 * (`assignmentsOf`, `lockedAssignments`, `publishStaffRoster`), so a row that predates `0012`'s
 * backfill would then be reported to the caller as a bad request. A storage fault told as a caller
 * mistake sends the operator to fix the wrong thing, which is `00 §5.7`'s complaint about the
 * unnamed 500 with the sign flipped.
 */
const AssignmentWire = z.strictObject({
  role: PersonAssignment.shape.role,
  branch_id: z.union([z.string().min(1), z.null()]),
});

/**
 * `now` and `actor_user_id` on every write, and they are not decoration.
 *
 * `now` is the CALLER's instant for `/internal/catalog/publish`'s recorded reason — `services/api`
 * takes ONE reading per act and uses it for the write and for `14-F2`'s ledger record, so one act
 * cannot be split into two instants. `actor_user_id` is what `kernel.staff_versions` stores as the
 * publisher of the version; it is nullable because that column is, and because a caller with no
 * authenticated human (a future operator command) must not be forced to invent one.
 */
const actOf = {
  now: z.number().int(),
  actor_user_id: z.union([z.string().min(1), z.null()]),
};

/**
 * `14-F14`'s create.
 *
 * `display_name` is `packages/domain`'s `DisplayName` — the SAME declaration `PersonRecord` parses
 * through, reached one layer earlier so an empty or unrenderable name comes back as a `400` naming
 * the field instead of a `500` carrying a `ZodError` from inside `insertUser` (`refusalStatus`'s own
 * rule: a caller's mistake returns 400 with the message intact). `email` is nullable because R30
 * says a till-only cashier needs none, and `min(1)` because `""` is an invented address rather than
 * an absent one.
 *
 * ⚠ **`user_id` and `grid_ordinal` are ABSENT and `strictObject` refuses them by name.** `01-F61`
 * bans a derived grid order and requires new members to APPEND, so only the writer — reading the
 * org's current maximum inside the same transaction — can assign one; two owners in two browser
 * tabs supplying their own would collide, and `listUsers`'s fallback to `user_id asc` is the exact
 * derived ordering the FR forbids.
 */
const UserCreateRequest = z.strictObject({
  org_id: z.string().min(1),
  display_name: DisplayName,
  email: z.union([z.string().min(1), z.null()]),
  assignments: z.array(AssignmentWire),
  ...actOf,
});

const UserAssignmentsRequest = z.strictObject({
  org_id: z.string().min(1),
  user_id: z.string().min(1),
  assignments: z.array(AssignmentWire),
  ...actOf,
});

/**
 * `14-F14`'s PIN set/reset.
 *
 * ⚠ **IT TAKES `pin_hash` AND `strictObject` REFUSES A `pin` BY NAME.** `11-F21`: *"a PIN exists in
 * exactly two places for exactly as long as each takes — the keypad it is typed on and the argument
 * to a verify call"*, and `setPinCredential`'s header puts the Argon2id call at the caller so this
 * service grows no second hashing site and no second parameter set. The plaintext therefore stops
 * at `services/api`. The refusal is structural rather than a convention: widening this route "for
 * convenience" fails to parse instead of quietly accepting a credential over the wire.
 */
const UserPinRequest = z.strictObject({
  org_id: z.string().min(1),
  user_id: z.string().min(1),
  pin_hash: z.string().min(1),
  ...actOf,
});

/**
 * `11-F22`'s participation transition, per `(person, branch)`.
 *
 * `branch_id: null` addresses `01-F26`'s org-wide assignment, which is how every owner is stored —
 * not "all branches".
 *
 * **The status word is `PersonAssignment.shape.status`, the SAME declaration the writer parses
 * through, moved here for `AssignmentWire`'s reason and in the same change.** It was a bare string
 * with the note that the writer parses it *"BEFORE it opens its transaction … a refused word that
 * destroys no credential"* — both properties are untouched (the writer's parse stays, and it is
 * still the only declaration; this is the same object, not a copy), and what changes is that
 * `on_leave` now comes back as a `400` carrying `11-F22`'s own sentence instead of a `500` carrying
 * a `ZodError`. It is moved **with** the role rather than after it because leaving one field behind
 * is this repo's recorded pattern of closing an instance and not its class (`01-F66`).
 */
const UserStatusRequest = z.strictObject({
  org_id: z.string().min(1),
  user_id: z.string().min(1),
  branch_id: z.union([z.string().min(1), z.null()]),
  status: PersonAssignment.shape.status,
  ...actOf,
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

  /**
   * **`01-F68`/`01-F69`'s TENANCY DIRECTORY — one org's own record and its branches.**
   *
   * One route for both, and that is the shape rather than two: they are read together by every
   * surface that needs either (a shell that names the restaurant is the same render as a selector
   * that names its branches), the pair is one org's *directory*, and splitting them would make a
   * back-office screen take two round trips to answer one question about one tenant.
   *
   * **`org: null` is `01-F68`'s UNNAMED and it is a 200, not a 404.** The FR: *"An org with events
   * and no record is UNNAMED, not invalid … it folds, syncs, prints and settles exactly as any
   * other."* A 404 here would tell `services/api` the tenant does not exist, which is false of every
   * org in this deployment today — the tables have no writer yet — and would turn a naming gap into
   * an outage. `21-F15` decides what the SCREEN does with the null; this route only reports it.
   *
   * **It reads and interprets nothing else.** No count, no "primary branch", no derived status: the
   * rows as stored, parsed through `packages/domain`'s records so the closed sets have exactly one
   * interpretation (`schema.ts` stores them with no CHECK for precisely that reason).
   */
  app.get("/internal/tenancy", async (request, reply) => {
    const parsed = OrgQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "tenancy: org_id required" });
    const { org_id } = parsed.data;
    try {
      const [org, branches] = await Promise.all([
        readOrg(deps.db, org_id),
        listBranches(deps.db, org_id),
      ]);
      return reply.code(200).send({ org: org ?? null, branches });
    } catch (error: unknown) {
      request.log.error({ err: error }, "tenancy: database read failed");
      return reply.code(500).send({ error: databaseFailure("tenancy", error) });
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
   * **`14-F14`'s USER CRUD — five routes, one writer, and the first shipping caller `staff.ts` has
   * ever had.**
   *
   * They sit beside the seven above (⚠ this said EIGHT; counted off the `app.post`/`app.get` calls
   * registered before this block, it is seven — catalog publish, catalog published, org-events in
   * and out, tenancy, devices, device revoke) and behind the same `PUBLISH_TOKEN` and the same
   * fail-closed
   * `503`, on `/internal/devices/revoke`'s recorded terms and with the same honest limit: **this
   * service authorizes SERVICES, never people.** The person-level gate is `14-F39`'s
   * `can("user.manage")`, owner-only, in `services/api` — so a holder of this credential bypasses
   * the matrix entirely here, exactly as it can for the device kill switch. What makes that
   * defensible on this surface is the same three-part argument recorded for revocation, and its
   * FIRST leg is what does the work: `services/api` refuses at boot to host an ungated procedure,
   * so every path a human can reach passes `can()` first.
   *
   * **They emit no event, and that is the split `device.revoked` already ships** (T-01-09,
   * `01-F62`): `user.changed` is org-scoped, its only legitimate emitter is the cloud plane, and
   * this seam has no authenticated user to attribute one to — `revoke-device.ts` and `tenancy.ts`
   * both record that an unattributed row in an append-only store *"is worse than none because it
   * reads like one"*. `services/api` appends it through `/internal/org-events` above, with
   * `14-F2`'s actor on it.
   *
   * **The writer never re-implements a rule this service already owns.** `user-crud.ts` composes
   * `insertUser` (`01-F26` completeness), `setPinCredential` (`11-F21`), `setUserStatus` (`11-F22`
   * + R32) and `publishStaffRoster` (`01-F75`, `01-F78`); nothing about a person is decided in this
   * file, exactly as nothing about a menu is.
   */
  app.post("/internal/users", async (request, reply) => {
    const parsed = UserCreateRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: `create user: ${z.prettifyError(parsed.error)}` });
    }
    try {
      return reply.code(200).send(await createPerson(deps.db, parsed.data));
    } catch (error: unknown) {
      return reply.code(refusalStatus(error)).send({ error: messageOf(error) });
    }
  });

  app.post("/internal/users/assignments", async (request, reply) => {
    const parsed = UserAssignmentsRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: `set assignments: ${z.prettifyError(parsed.error)}` });
    }
    try {
      await setPersonAssignments(deps.db, parsed.data);
      return reply.code(200).send({});
    } catch (error: unknown) {
      return reply.code(refusalStatus(error)).send({ error: messageOf(error) });
    }
  });

  app.post("/internal/users/pin", async (request, reply) => {
    const parsed = UserPinRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: `set pin: ${z.prettifyError(parsed.error)}` });
    }
    try {
      await setPersonPin(deps.db, parsed.data);
      return reply.code(200).send({});
    } catch (error: unknown) {
      return reply.code(refusalStatus(error)).send({ error: messageOf(error) });
    }
  });

  app.post("/internal/users/status", async (request, reply) => {
    const parsed = UserStatusRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: `set status: ${z.prettifyError(parsed.error)}` });
    }
    try {
      await setPersonStatus(deps.db, parsed.data);
      return reply.code(200).send({});
    } catch (error: unknown) {
      return reply.code(refusalStatus(error)).send({ error: messageOf(error) });
    }
  });

  /**
   * `14-F14`'s read — one org's people in `01-F61`'s explicit grid order.
   *
   * `listUsers` directly, with no projection of its own: that reader already declines to select
   * `password_hash` (*"a credential that never leaves the row it lives in cannot be printed by
   * accident"*) and already keeps a null email null rather than the four-letter string `"null"`
   * (R30). A second SELECT here would be a second chance to get both wrong. It never joins to
   * `kernel.user_credentials` either — `11-F23` chose a separate table precisely so a lookup
   * *cannot* return a PIN hash "because it does not join to it", and spending that structural bound
   * on a list surface is what makes it a discipline again.
   */
  app.get("/internal/users", async (request, reply) => {
    const parsed = OrgQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "users: org_id required" });
    try {
      return reply.code(200).send({ users: await listUsers(deps.db, parsed.data.org_id) });
    } catch (error: unknown) {
      request.log.error({ err: error }, "users: database read failed");
      return reply.code(500).send({ error: databaseFailure("users", error) });
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
