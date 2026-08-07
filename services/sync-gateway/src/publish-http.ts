import { timingSafeEqual } from "node:crypto";
import { CatalogEntryWire } from "@restos/sync-protocol";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { type CatalogEntry, catalogPage, publishCatalog } from "./catalog.js";
import { appendOrgEvent, orgEventHistory } from "./org-events.js";

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
      return reply.code(200).send({ version });
    } catch (error: unknown) {
      return reply.code(refusalStatus(error)).send({ error: messageOf(error) });
    }
  });

  app.get("/internal/catalog/published", async (request, reply) => {
    const parsed = OrgQuery.safeParse(request.query);
    if (!parsed.success)
      return reply.code(400).send({ error: "catalog published: org_id required" });
    return reply.code(200).send(await foldPublished(deps.db, parsed.data.org_id));
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
    return reply.code(200).send({ events: await orgEventHistory(deps.db, parsed.data.org_id) });
  });
};
