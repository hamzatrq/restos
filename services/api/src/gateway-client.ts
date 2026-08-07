/**
 * **THE ADAPTER `publish.ts` SAID WAS OWED.** Before this file, `CatalogPublisher` and
 * `LedgerAppender` had only `createMemoryCatalogPublisher` / `createMemoryLedgerAppender` behind
 * them, so an owner could author a menu, schedule it under `14-F28`, watch it publish — and
 * **nothing reached a device.** That is this wave's named defect (AGENTS.md) in its most
 * product-visible form: a correct subsystem with no seam to the product.
 *
 * **The architecture is ruled, not chosen here** (`plans/wave-1/catalog-transport.md` §6 Q1,
 * founder ruling July 2026): *the API publishes, the gateway serves.* Two services, one truth.
 *
 *   - the API sends a **versioned, immutable published snapshot** to the gateway over a contract;
 *   - the gateway **never parses menu structure** and so cannot grow an opinion about it;
 *   - `18 §4` — every table owns exactly one writer service, and for `kernel.catalog_*` and
 *     `kernel.org_events` that service is `sync-gateway`. This module therefore holds **no
 *     database handle**, which is the property the ruling was protecting.
 *
 * **What was chosen here: HTTP with a service bearer credential, and nothing else.** The
 * alternatives and why they lose:
 *
 *   - *`services/api` writes the gateway's tables directly* — two writer services for one table
 *     (`18 §4`), and the exact database coupling the ruling rejected, merely pointing the other
 *     way. An API-side migration would then break device sync with no contract to catch it.
 *   - *a queue or an outbox with retries* — `24-F23`. A publish is owner-initiated, low-rate and
 *     already retryable by pressing save again; a broker buys durability nobody asked for and
 *     costs a third piece of infrastructure to run and to reason about.
 *   - *the gateway calls the API* — inverts the dependency so the serving side has to know when
 *     the authoring side has news, which is the polling problem the founder ruling deleted.
 *
 * **Not transactional, and this module does not pretend otherwise.** `publishEdits` publishes the
 * artifact and then appends `catalog.changed`, over two requests to two endpoints. A failure
 * between them leaves the menu published and the history row missing — devices get the right
 * menu, `14-F3` loses one row. That direction is chosen: the reverse (history first) would leave a
 * history claiming a version no device can fetch, and `01-F1` forbids deleting the claim. B-4 named
 * the non-atomicity; the acceptance suite asserts what actually happens rather than papering it.
 */

import { z } from "zod";
import type { CatalogEntry } from "./catalog.js";
import type { CatalogPublisher, LedgerAppender, LedgerRecord } from "./publish.js";

/**
 * Where the gateway is and how to prove we may talk to it.
 *
 * **Both required.** An optional credential is the "unsupplied optional seam" `pnpm seams:check`
 * exists to catch — and worse here than usual, because the failure mode of an unauthenticated
 * publish surface is a stranger writing the org's menu. No `fetch` injection point either: the
 * suite drives a real loopback server, which is the only thing that proves an HTTP request was
 * actually formed.
 */
export type GatewayLink = {
  /** e.g. `http://sync-gateway:8080`. Trailing slashes are tolerated. */
  readonly base_url: string;
  /** Presented as `Authorization: Bearer`. `18 §5`: read from env at the composition root only. */
  readonly token: string;
};

const PublishResponse = z.object({ version: z.number().int().positive() });

const PublishedResponse = z.object({
  version: z.number().int().nonnegative(),
  entries: z.array(z.unknown()),
});

/**
 * `14-F3`'s history as the gateway stores it. Parsed rather than cast because this crosses a
 * service boundary: an unparsed body would let a gateway-side rename reach `14-F3`'s screen as
 * `undefined` rendered beside a real date, which is the failure that looks like data rather than
 * like a bug.
 */
const OrgEventResponse = z.object({
  events: z.array(
    z.object({
      org_id: z.string(),
      type: z.string(),
      actor_user_id: z.union([z.string(), z.null()]),
      server_received_at: z.number().int(),
      /**
       * **Unparsed HERE, on purpose.** The `01-F62` store holds the whole org-scoped set —
       * `device.registered`, `user.changed`, `config.changed` — and each has its own payload. A
       * schema that demanded `catalog.changed`'s shape of every row would make `14-F3`'s history
       * throw the first time a device was registered in the org: the FILTER has to run before the
       * payload is judged, which is why the two are separate schemas rather than one.
       */
      payload: z.unknown(),
    }),
  ),
});

/** `14-F3`'s row, judged only after the type filter has selected it. */
const CatalogChangedPayload = z.object({
  entity: z.string(),
  entity_id: z.string(),
  version: z.number().int(),
  before_ref: z.union([z.string(), z.null()]),
  after_ref: z.union([z.string(), z.null()]),
  price_changes: z.array(
    z.object({
      branch_id: z.string(),
      channel: z.string(),
      before_paisa: z.union([z.number().int(), z.null()]),
      after_paisa: z.union([z.number().int(), z.null()]),
    }),
  ),
});

const ErrorBody = z.object({ error: z.string() });

const endpoint = (link: GatewayLink, path: string): string =>
  `${link.base_url.replace(/\/+$/, "")}${path}`;

const authHeaders = (link: GatewayLink): Record<string, string> => ({
  authorization: `Bearer ${link.token}`,
  "content-type": "application/json",
});

/**
 * Turn a non-2xx into a thrown Error that an owner can act on.
 *
 * **The gateway's message is carried verbatim, and that is the whole point of this function.**
 * `01-F60`'s refusal names the offending entry and the missing `(branch, channel)` cell — *"entry
 * 3 (item/biryani) is not sellable — no price for branch b1, channel foodpanda"*. A generic
 * "publish failed" would turn the one actionable error in this path into a shrug, and the owner
 * would go looking through 4,000 rows by hand.
 *
 * A `401` or `503` is a DEPLOYMENT fault, not the owner's, and says so: the failure this wave keeps
 * producing is a menu that silently never ships, so the message names the env key to set.
 */
const refuse = async (response: Response, what: string): Promise<never> => {
  const raw: unknown = await response.json().catch(() => null);
  const parsed = ErrorBody.safeParse(raw);
  const detail = parsed.success ? parsed.data.error : `HTTP ${response.status}`;
  if (response.status === 401 || response.status === 503) {
    throw new Error(
      `${what}: the sync gateway refused this service's credential (${response.status}: ` +
        `${detail}). The menu did NOT reach any device. Check SYNC_GATEWAY_TOKEN here and ` +
        `PUBLISH_TOKEN there — they are one shared credential and a mismatch fails silently in ` +
        `every direction except this one.`,
    );
  }
  throw new Error(`${what}: ${detail}`);
};

const postJson = async (
  link: GatewayLink,
  path: string,
  body: unknown,
  what: string,
): Promise<unknown> => {
  const response = await fetch(endpoint(link, path), {
    method: "POST",
    headers: authHeaders(link),
    body: JSON.stringify(body),
  });
  if (!response.ok) await refuse(response, what);
  return response.json();
};

const getJson = async (
  link: GatewayLink,
  path: string,
  org_id: string,
  what: string,
): Promise<unknown> => {
  const url = new URL(endpoint(link, path));
  url.searchParams.set("org_id", org_id);
  const response = await fetch(url, { headers: authHeaders(link) });
  if (!response.ok) await refuse(response, what);
  return response.json();
};

/**
 * `CatalogPublisher`, bound to a real gateway.
 *
 * `publish` is `POST /internal/catalog/publish`, whose body is `publishCatalog`'s argument list —
 * same names, same meanings — because `publish.ts` shaped the port against that signature so the
 * adapter would be a binding and not a redesign. `01-F60`'s `enabled` set travels with every
 * publish: the completeness check stays at the WRITER (the guarantee), and the editor's own
 * refusal stays a convenience.
 *
 * `published` is the SNAPSHOT fold — what a device would fetch — which `publish.ts` requires
 * because `14-F3`'s `before_ref` must be the state a device actually has, never the staging
 * table's opinion of it.
 */
export const createGatewayCatalogPublisher = (link: GatewayLink): CatalogPublisher => ({
  publish: async (org_id, entries, opts) => {
    const body = await postJson(
      link,
      "/internal/catalog/publish",
      {
        org_id,
        entries,
        actor_user_id: opts.actor_user_id,
        now: opts.now,
        enabled: { branches: opts.enabled.branches, channels: opts.enabled.channels },
      },
      "catalog publish",
    );
    return PublishResponse.parse(body).version;
  },
  published: async (org_id) => {
    const body = await getJson(link, "/internal/catalog/published", org_id, "catalog published");
    const parsed = PublishedResponse.parse(body);
    // Entries cross back as the gateway stored them — opaque rows it never interpreted. They are
    // re-typed, not re-validated: `CatalogEntryWire` already refused anything else at the writer,
    // and a second copy of that schema here is the third-copy problem `18 §2` names.
    return { version: parsed.version, entries: parsed.entries as readonly CatalogEntry[] };
  },
});

/**
 * `LedgerAppender`, bound to the gateway's `01-F62` org-scoped store.
 *
 * `catalog.changed` is org-scoped: `org_id`, **no `branch_id`, no branch stamp**, ordered by
 * `server_received_at` (`01-F18`). It never enters a branch stream and no device folds it — which
 * is exactly why it now has a legal home, and why this adapter mints no envelope. The record's
 * `type` is sent rather than assumed, so the gateway's `01-F62` scope check is the one that
 * decides, not this client's confidence.
 */
export const createGatewayLedgerAppender = (link: GatewayLink): LedgerAppender => ({
  append: async (record) => {
    await postJson(
      link,
      "/internal/org-events",
      {
        org_id: record.org_id,
        type: record.type,
        actor_user_id: record.actor_user_id,
        server_received_at: record.server_received_at,
        payload: record.payload,
      },
      "catalog history append",
    );
  },
  history: async (org_id) => {
    const body = await getJson(link, "/internal/org-events", org_id, "catalog history");
    // The org-scoped store holds `01-F62`'s whole set — `device.registered`, `user.changed` and
    // the rest will land beside these. `14-F3` is the CATALOG history, so the filter is here and
    // not a query parameter: a filter the caller states is a filter the caller can forget.
    return OrgEventResponse.parse(body)
      .events.filter((event) => event.type === "catalog.changed")
      .map((event): LedgerRecord => {
        const payload = CatalogChangedPayload.parse(event.payload);
        return {
          type: "catalog.changed",
          org_id: event.org_id,
          actor_user_id: event.actor_user_id,
          server_received_at: event.server_received_at,
          payload: {
            entity: payload.entity,
            entity_id: payload.entity_id,
            version: payload.version,
            before_ref: payload.before_ref,
            after_ref: payload.after_ref,
            price_changes: payload.price_changes as LedgerRecord["payload"]["price_changes"],
          },
        };
      });
  },
});
