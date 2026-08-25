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

import {
  type AreaMembership,
  BASE_UNITS,
  type CountUnits,
  type InventoryItem,
  ITEM_TYPES,
  type MenuRecipe,
  type Recipe,
  type ValueQtyPair,
} from "@restos/inventory";
import { z } from "zod";
import type { CatalogEntry } from "./catalog.js";
import {
  type DeviceDirectory,
  type DeviceRecord,
  type DeviceRevocationRecord,
  DeviceRevokedPayload,
} from "./devices.js";
import { IntegrationError } from "./errors.js";
import {
  AreaMembershipWire,
  InventoryItemWire,
  type InventoryReference,
  MenuRecipeWire,
  RecipeWire,
} from "./inventory.js";
import type { DayLedger } from "./ledger.js";
import type { CatalogPublisher, LedgerAppender, LedgerRecord } from "./publish.js";
import type { TenancyDirectory } from "./tenancy.js";
import type { UserDirectory } from "./user-directory.js";

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

/**
 * `12-F10`'s window, as the gateway answers it. **Only the seven envelope fields the fold is
 * allowed to read** — `global_seq`, `lamport_seq`, `device_created_at` and `server_received_at` are
 * absent from the row schema, so `01-F34`'s ban is enforced by the WIRE and not only by the fold's
 * own discipline: an ordering field cannot reach a projected value if it never crosses the
 * boundary. `z.object` strips unknown keys, so a gateway that started sending one would find it
 * dropped here rather than quietly available to the next person editing `summary.ts`.
 */
const LedgerWindowResponse = z.object({
  events: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      branch_id: z.string(),
      branch_created_at: z.number().int(),
      time_basis: z.string(),
      actor_user_id: z.union([z.string(), z.null()]),
      payload: z.record(z.string(), z.unknown()),
    }),
  ),
  truncated: z.boolean(),
  /** `12-F8`. The ONE `server_received_at` that crosses, and it never reaches the fold. */
  latest_arrival_ms: z.union([z.number().int(), z.null()]),
});

/** `14-F12`'s list as the gateway's registry answers it. Parsed, for `OrgEventResponse`'s reason. */
const DeviceListResponse = z.object({
  devices: z.array(
    z.object({
      device_id: z.string(),
      branch_id: z.string(),
      device_class: z.string(),
      /**
       * `01-F70`. **`.nullable()` and not `.optional()`, and the difference is the whole
       * assertion.** A gateway that stopped SENDING the field would satisfy `.optional()` silently
       * and every till would render as unnamed with nothing anywhere reporting a fault — which is
       * `21-F15`'s failure mode arriving as data. Present-and-null is the honest UNNAMED row;
       * absent is a contract break and is refused here.
       */
      display_name: z.union([z.string(), z.null()]),
      revoked_at: z.union([z.number().int(), z.null()]),
      token_expires_at: z.union([z.number().int(), z.null()]),
    }),
  ),
});

/**
 * `01-F68`/`01-F69`'s directory as the gateway answers it.
 *
 * `org: null` is the UNNAMED org and is NOT an error — see `tenancy.ts`. It is parsed rather than
 * cast for `OrgEventResponse`'s reason: this crosses a service boundary, and an unparsed body would
 * let a gateway-side rename reach an owner's screen as `undefined` rendered in a name slot, which is
 * exactly the "renders as data rather than as a bug" failure `21-F15` is about.
 */
const TenancyResponse = z.object({
  org: z.union([
    z.object({
      org_id: z.string(),
      display_name: z.string(),
      status: z.string(),
      created_at: z.number().int(),
    }),
    z.null(),
  ]),
  branches: z.array(
    z.object({
      branch_id: z.string(),
      org_id: z.string(),
      display_name: z.string(),
      branch_type: z.string(),
      branch_class: z.string(),
      created_at: z.number().int(),
    }),
  ),
});

/**
 * `revokeRegisteredDevice`'s outcome, verbatim.
 *
 * `already` is parsed rather than defaulted, and the difference is the whole point: a client that
 * treated a missing `already` as `false` would tell an owner she had just revoked a device somebody
 * else killed last Tuesday — and would then append a `device.revoked` naming her for it.
 */
const DeviceRevokeResponse = z.object({
  branch_id: z.string(),
  device_class: z.string(),
  revoked_at: z.number().int(),
  already: z.boolean(),
});

/**
 * `01-F80` (a)'s mint reply. The `code` crosses this boundary exactly once and is stored nowhere on
 * this side either — it goes to the screen that shows it and is gone on the next render.
 */
const MintedPairingResponse = z.object({
  code: z.string(),
  device_id: z.string(),
  expires_at: z.number().int(),
});

/** `14-F41`'s waiting rows, as the gateway's pending-pairing table answers them. Parsed, for
 * `OrgEventResponse`'s reason: this crosses a service boundary. */
const PairingListResponse = z.object({
  pairings: z.array(
    z.object({
      device_id: z.string(),
      branch_id: z.string(),
      device_class: z.string(),
      display_name: z.string(),
      minted_at: z.number().int(),
      expires_at: z.number().int(),
    }),
  ),
});

const CancelPairingResponse = z.object({ cancelled: z.boolean() });

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

/** How this dependency is named to an operator. One name, so the sentence cannot drift by route. */
const DEPENDENCY = "sync gateway";

/**
 * The message and every `cause` beneath it. Node's undici gives `TypeError: fetch failed` and puts
 * `connect ECONNREFUSED 127.0.0.1:8080` — the only part with any information in it — one `cause`
 * deeper. Measured, both for a closed port and for an unresolvable host. The depth bound guards
 * against a cycle, not against length: a real chain here is two links.
 */
const causeChain = (error: unknown): string => {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== undefined && current !== null; depth++) {
    parts.push(current instanceof Error ? current.message : String(current));
    current = current instanceof Error ? current.cause : undefined;
  }
  return parts.filter((part) => part !== "").join(" ← ");
};

/**
 * **`fetch` itself failing is a different kind of event from the gateway saying no, and this is
 * where the two stop being the same string.**
 *
 * A rejected `fetch` means the peer was never reached: no request was served, nothing changed, and
 * the caller did nothing wrong. Left alone it reaches the operator as `"fetch failed"` — tRPC
 * normalises an unrecognised throw to `INTERNAL_SERVER_ERROR` and carries the message through —
 * which names no dependency, assigns no fault, and suggests no action. `00 §5.7`'s honesty rule is
 * not satisfied by a true-but-useless string.
 *
 * So it becomes an `IntegrationError` (`18 §5`) that says WHICH system, WHERE it was expected, WHY
 * the attempt failed, and that the state is infrastructural and retriable. **The cause is carried,
 * never swallowed** (`24-F15`): `trpc.ts` logs the whole chain and the sentence is only what the
 * human reads.
 *
 * Non-2xx responses do NOT come here — `refuse` already carries the gateway's own message, and
 * `01-F60`'s "entry 3 (item/biryani) is not sellable" is the owner's business, not an outage.
 */
const reach = async (
  link: GatewayLink,
  url: string | URL,
  init: RequestInit,
  what: string,
): Promise<Response> => {
  try {
    return await fetch(url, init);
  } catch (cause: unknown) {
    throw new IntegrationError(
      DEPENDENCY,
      `${what}: the ${DEPENDENCY} at ${link.base_url} could not be reached ` +
        `(${causeChain(cause)}). Nothing was changed and nothing was rejected — this is an ` +
        `infrastructure state, not a problem with the menu or with this request. Check that ` +
        `services/sync-gateway is running and that SYNC_GATEWAY_URL points at it, then try again.`,
      { retriable: true, cause },
    );
  }
};

const postJson = async (
  link: GatewayLink,
  path: string,
  body: unknown,
  what: string,
): Promise<unknown> => {
  const response = await reach(
    link,
    endpoint(link, path),
    { method: "POST", headers: authHeaders(link), body: JSON.stringify(body) },
    what,
  );
  if (!response.ok) await refuse(response, what);
  return response.json();
};

const getQuery = async (
  link: GatewayLink,
  path: string,
  params: Readonly<Record<string, string>>,
  what: string,
): Promise<unknown> => {
  const url = new URL(endpoint(link, path));
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await reach(link, url, { headers: authHeaders(link) }, what);
  if (!response.ok) await refuse(response, what);
  return response.json();
};

const getJson = async (
  link: GatewayLink,
  path: string,
  org_id: string,
  what: string,
): Promise<unknown> => getQuery(link, path, { org_id }, what);

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
 * `DeviceDirectory`, bound to the gateway — `14-F12`'s list and `14-F13`'s kill switch.
 *
 * **Two endpoints on two tables, deliberately, and the split is `01-F62`'s.** `list`/`revoke` reach
 * `/internal/devices*`, which is the device registry: `revoked_at` is what `01-F48`'s ≤30 s sweep
 * reads, so that write — and only that write — is what actually stops a till. `recordRevocation`/
 * `revocations` reach `/internal/org-events`, the org-scoped store, because T-01-09 puts
 * `device.registered / revoked` **emission** on this doc-14 emitter rather than on the kernel's
 * registry seam, and `14-F13`'s actor has nowhere else to live.
 *
 * `history` on `LedgerAppender` filters that same endpoint to `catalog.changed`; this filters it to
 * `device.revoked`. Same reason the filter is here and not a query parameter — a filter the caller
 * states is a filter the caller can forget, and this store holds `01-F62`'s whole set.
 */
export const createGatewayDeviceDirectory = (link: GatewayLink): DeviceDirectory => ({
  list: async (org_id) => {
    const body = await getJson(link, "/internal/devices", org_id, "device list");
    return DeviceListResponse.parse(body).devices as readonly DeviceRecord[];
  },
  /**
   * `01-F80` (a)'s mint, `14-F41`'s create task.
   *
   * `now` and `actor_user_id` ride because that surface's `actOf` requires them, and the first is
   * load-bearing rather than conventional: `01-F80` (c)'s fifteen minutes are measured from the
   * act's instant, so the CALLER's one reading is what the TTL is stamped against.
   */
  mintPairing: async (input) => {
    const body = await postJson(
      link,
      "/internal/devices/pairing-codes",
      {
        org_id: input.org_id,
        branch_id: input.branch_id,
        device_class: input.device_class,
        display_name: input.display_name,
        actor_user_id: input.actor_user_id,
        now: input.now,
      },
      "pairing code",
    );
    return MintedPairingResponse.parse(body);
  },
  pairings: async (org_id) => {
    const body = await getJson(link, "/internal/devices/pairings", org_id, "waiting pairings");
    return PairingListResponse.parse(body).pairings;
  },
  cancelPairing: async (org_id, device_id) => {
    const body = await postJson(
      link,
      "/internal/devices/pairings/cancel",
      { org_id, device_id },
      "cancel pairing",
    );
    return CancelPairingResponse.parse(body);
  },
  revoke: async (org_id, device_id) => {
    const body = await postJson(
      link,
      "/internal/devices/revoke",
      { org_id, device_id },
      "device revoke",
    );
    return DeviceRevokeResponse.parse(body);
  },
  recordRevocation: async (record) => {
    await postJson(
      link,
      "/internal/org-events",
      {
        org_id: record.org_id,
        // Sent rather than assumed, so the gateway's `01-F62` scope check is the one that decides
        // and not this client's confidence — the same rule `createGatewayLedgerAppender` follows.
        type: "device.revoked",
        actor_user_id: record.actor_user_id,
        server_received_at: record.server_received_at,
        payload: {
          device_id: record.device_id,
          branch_id: record.branch_id,
          device_class: record.device_class,
        },
      },
      "device revocation record",
    );
  },
  revocations: async (org_id) => {
    const body = await getJson(link, "/internal/org-events", org_id, "device revocations");
    return OrgEventResponse.parse(body)
      .events.filter((event) => event.type === "device.revoked")
      .map(
        (event): DeviceRevocationRecord => ({
          device_id: DeviceRevokedPayload.parse(event.payload).device_id,
          actor_user_id: event.actor_user_id,
          server_received_at: event.server_received_at,
        }),
      );
  },
});

/**
 * `14-F14`'s roster as the gateway's `kernel.users` answers it. Parsed, for `OrgEventResponse`'s
 * reason — this crosses a service boundary, and an unparsed body would let a gateway-side rename
 * reach an owner's staff screen as `undefined` in a name slot, which reads as data rather than as a
 * bug.
 *
 * **`z.object` strips, and the strip is load-bearing here.** `listUsers` also returns `org_id` and
 * `created_at`; neither belongs on this plane (`created_at` is registry bookkeeping on the
 * provisioning clock, which `packages/domain`'s `tenancy.ts` says in terms *"no fold may read"*),
 * and dropping them at the boundary is `createGatewayTenancyDirectory`'s established posture. There
 * is deliberately no `pin_hash` or `password_hash` member to strip — the gateway never selects
 * either (`11-F23`), so this schema's silence about them is the second half of a bound rather than
 * a first line of defence.
 */
const UserListResponse = z.object({
  users: z.array(
    z.object({
      user_id: z.string(),
      display_name: z.string(),
      /**
       * `.nullable()` and never `.optional()`, for `DeviceListResponse.display_name`'s reason: a
       * gateway that stopped SENDING the field would satisfy `.optional()` silently and every
       * till-only cashier would look like an ordinary one. R30's absent address is present-and-null.
       */
      email: z.union([z.string(), z.null()]),
      grid_ordinal: z.number().int().nonnegative(),
      assignments: z.array(
        z.object({
          role: z.string(),
          branch_id: z.union([z.string(), z.null()]),
          status: z.string(),
        }),
      ),
    }),
  ),
});

/**
 * What `14-F14`'s create answers. **Both fields are the WRITER's** (`01-F61`): a client that minted
 * its own would collide the moment two owners saved at once, reintroducing the derived tiebreak the
 * FR forbids. Parsed rather than cast so a gateway that stopped returning one is a loud failure
 * here and not an `undefined` reaching a screen.
 */
const UserCreatedResponse = z.object({
  user_id: z.string().min(1),
  grid_ordinal: z.number().int().nonnegative(),
});

/**
 * `TenancyDirectory`, bound to the gateway's `01-F68`/`01-F69` directory tables.
 *
 * **The org id is the CALLER'S, resolved from the authenticated subject before this is ever
 * called** (`router.ts`), never from a request body — `01-F71` (b). This adapter takes it as an
 * argument and asks no questions about it, exactly as `createGatewayDeviceDirectory` and
 * `createGatewayDayLedger` do; the isolation decision is made one layer up, in one place, for all
 * three.
 *
 * **`created_at` is parsed and then DROPPED.** It is registry bookkeeping on the clock of whatever
 * provisioned the row (`packages/domain`'s `tenancy.ts` says so in terms: *"NOT branch time and no
 * fold may read it"*), and nothing on a naming surface has any use for it. Carrying it to a client
 * would put a wall-clock instant on the plane where somebody eventually renders it as though it
 * meant something — `01-F43`'s hazard on a field the corpus has already ruled unreadable. It is
 * parsed rather than ignored so that a gateway sending garbage there is still a loud failure.
 */
export const createGatewayTenancyDirectory = (link: GatewayLink): TenancyDirectory => ({
  directory: async (org_id) => {
    const body = await getJson(link, "/internal/tenancy", org_id, "tenancy directory");
    const parsed = TenancyResponse.parse(body);
    return {
      org: {
        org_id,
        // `01-F68` UNNAMED. Two nulls from one absent row, never invented separately.
        display_name: parsed.org?.display_name ?? null,
        status: parsed.org?.status ?? null,
      },
      branches: parsed.branches.map((branch) => ({
        branch_id: branch.branch_id,
        display_name: branch.display_name,
        branch_type: branch.branch_type,
        branch_class: branch.branch_class,
      })),
    };
  },
});

/**
 * `UserDirectory`, bound to the gateway — `14-F14`'s CRUD and `14-F2`'s ledger record.
 *
 * **Two endpoint families on two stores, deliberately, and the split is `01-F62`'s** — the same one
 * `createGatewayDeviceDirectory` already draws. The five writes and the read reach
 * `/internal/users*`, which is `kernel.users` plus the roster publication log a till reconciles
 * against; `recordChange` reaches `/internal/org-events`, because T-01-09 puts `user.changed`'s
 * EMISSION on this doc-14 emitter rather than on the gateway's writer seam — a shell or a service
 * credential has no authenticated user, and `14-F2`'s actor has nowhere else to live.
 *
 * **`setPin` sends a HASH.** `11-F21` keeps a PIN to *"the keypad it is typed on and the argument
 * to a verify call"*, so `user-router.ts` is where the plaintext stops and this adapter never sees
 * one — the route it posts to refuses a `pin` field by name, so a future widening fails to parse
 * rather than putting a credential on the wire.
 */
export const createGatewayUserDirectory = (link: GatewayLink): UserDirectory => ({
  list: async (org_id) => {
    const body = await getJson(link, "/internal/users", org_id, "user list");
    return UserListResponse.parse(body).users;
  },
  create: async (args) => {
    const body = await postJson(
      link,
      "/internal/users",
      {
        org_id: args.org_id,
        display_name: args.display_name,
        email: args.email,
        assignments: args.assignments,
        now: args.now,
        actor_user_id: args.actor_user_id,
      },
      "create user",
    );
    return UserCreatedResponse.parse(body);
  },
  setAssignments: async (args) => {
    await postJson(
      link,
      "/internal/users/assignments",
      {
        org_id: args.org_id,
        user_id: args.user_id,
        assignments: args.assignments,
        now: args.now,
        actor_user_id: args.actor_user_id,
      },
      "set user assignments",
    );
  },
  setPin: async (args) => {
    await postJson(
      link,
      "/internal/users/pin",
      {
        org_id: args.org_id,
        user_id: args.user_id,
        pin_hash: args.pin_hash,
        now: args.now,
        actor_user_id: args.actor_user_id,
      },
      "set user pin",
    );
  },
  setStatus: async (args) => {
    await postJson(
      link,
      "/internal/users/status",
      {
        org_id: args.org_id,
        user_id: args.user_id,
        branch_id: args.branch_id,
        status: args.status,
        now: args.now,
        actor_user_id: args.actor_user_id,
      },
      "set user status",
    );
  },
  recordChange: async (record) => {
    await postJson(
      link,
      "/internal/org-events",
      {
        org_id: record.org_id,
        // Sent rather than assumed, so the gateway's `01-F62` scope check is the one that decides
        // and not this client's confidence — `createGatewayLedgerAppender`'s recorded rule.
        type: "user.changed",
        actor_user_id: record.actor_user_id,
        server_received_at: record.server_received_at,
        payload: record.payload,
      },
      "user change record",
    );
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

/**
 * `12-F10`'s `DayLedger`, bound to the gateway's merged org log (`01-F7`).
 *
 * **The window is `branch_created_at`, and the gateway is told so explicitly** — see `ledger.ts`
 * for why bucketing by `server_received_at` would bank an offline branch's whole evening into the
 * following business day and put the cloud in permanent disagreement with the till's own
 * `shift-cash` fold.
 *
 * **`branch_ids` travels as a REPEATED query parameter, and its absence means "all".** The
 * distinction between "no filter" and "an empty filter" is exactly the one `01-F60`'s explicit
 * zero exists for, so the gateway refuses an empty list rather than reading it as no filter — a
 * `reportScope` narrowing that arrived empty must never widen into an org roll-up.
 *
 * The response is PARSED rather than cast, for the reason `OrgEventResponse` is: this crosses a
 * service boundary, and an unparsed body would let a gateway-side rename reach an owner's screen
 * as `undefined` rendered beside a real rupee figure — the failure that looks like data rather
 * than like a bug.
 */
export const createGatewayDayLedger = (link: GatewayLink): DayLedger => ({
  read: async (window) => {
    const params: Record<string, string> = {
      org_id: window.org_id,
      from_ms: String(window.from_ms),
      to_ms: String(window.to_ms),
    };
    if (window.branch_ids !== null) params.branch_ids = window.branch_ids.join(",");
    const body = await getQuery(link, "/internal/ledger/window", params, "day ledger");
    const parsed = LedgerWindowResponse.parse(body);
    return {
      events: parsed.events,
      truncated: parsed.truncated,
      latest_arrival_ms: parsed.latest_arrival_ms,
    };
  },
});

// ── `10-F18`'s reference source ────────────────────────────────────────────────────────────────

const InventoryReferenceResponse = z.object({
  version: z.number().int().nonnegative(),
  entries: z.array(
    z.object({
      kind: z.enum(["item", "area", "recipe", "menu_recipe"]),
      id: z.string(),
      payload: z.record(z.string(), z.unknown()),
    }),
  ),
});

/**
 * `10-F18`'s reference source, over the gateway's `/internal` contract.
 *
 * ⚠ **`version: 0` IS A REFUSAL HERE AND NOT AN EMPTY SET, AND THAT IS THE WHOLE POINT OF THIS
 * FUNCTION.** An org that has published nothing has not answered the question; an empty
 * `ReferenceData` would let `stockReport` render a complete, confident variance report with NO
 * ROWS for a location that may be short any amount at all, with nothing on the screen saying
 * anything is missing (`00 §5.7`, `10-F29`, and `inventory.ts`'s own header). `01-F77`'s
 * omitted-never-zero rule is the same distinction one layer down. So an unpublished org gets the
 * same refusal `unconfiguredInventoryReference` gives — a stated absence, not a smaller number.
 */
export const createGatewayInventoryReference = (link: GatewayLink): InventoryReference => ({
  /**
   * The whole set as the org's next version.
   *
   * **Flattened to `01-F75`'s row shape here and re-assembled on the way back**, because the
   * gateway stores a publication LOG keyed by `(kind, entry_id)` and has no opinion about what a
   * recipe is. The `area` id is the composite `(item_id, location_id, area_id)` — `10-F30`'s
   * membership row has no identity of its own — and the `menu_recipe` id is
   * `(sellable_kind, sellable_id)`, which is the key `14-F9` maps FROM.
   *
   * ⚠ **BOTH ARE `JSON.stringify` OF THE TUPLE, NOT A JOINED STRING, AND THAT IS `01-F71` (d).**
   * That clause bans a separator-less/ambiguous concatenation because `("ab","c")` and
   * `("a","bc")` are distinct keys a naive join maps onto one row — here that is one item's count
   * folded into another item's. JSON is the cheapest encoding that is provably injective: the
   * separator is a comma OUTSIDE the quoted strings, and a comma inside a component is escaped by
   * the encoder rather than by a rule someone has to remember.
   *
   * ⚠ **A `\u0000` SEPARATOR WAS THE FIRST CHOICE AND POSTGRES REFUSES IT — measured, not
   * predicted.** A `text` column cannot hold a NUL byte, so the insert failed with the whole
   * statement in the message. Worth recording because NUL is the textbook "separator a caller
   * cannot type" and it is unavailable in exactly the store this key lives in.
   */
  publish: async (org_id, refs, opts) => {
    const rows = [
      ...refs.items.map((item) => ({ kind: "item" as const, id: item.item_id, payload: item })),
      ...refs.areas.map((area) => ({
        kind: "area" as const,
        id: JSON.stringify([area.item_id, area.location_id, area.area_id]),
        payload: area,
      })),
      ...refs.recipes.map((recipe) => ({
        kind: "recipe" as const,
        id: recipe.recipe_id,
        payload: recipe,
      })),
      ...refs.menu_recipes.map((mapping) => ({
        kind: "menu_recipe" as const,
        id: JSON.stringify([mapping.sellable_kind, mapping.sellable_id]),
        payload: mapping,
      })),
    ];
    const body = await postJson(
      link,
      "/internal/inventory/publish",
      { org_id, entries: rows, actor_user_id: opts.actor_user_id, now: opts.now },
      "inventory reference",
    );
    return PublishResponse.parse(body).version;
  },
  read: async (org_id) => {
    const body = await getQuery(
      link,
      "/internal/inventory/reference",
      { org_id },
      "inventory reference",
    );
    const parsed = InventoryReferenceResponse.parse(body);
    if (parsed.version === 0) {
      throw new IntegrationError(
        "inventory reference",
        "this organisation has published no inventory reference data, so 10-F18's variance " +
          "report cannot be computed. An empty answer would render a complete, confident report " +
          "with no rows for a location that may be short any amount at all (00 §5.7, 10-F29). " +
          "Author items and recipes in the back office first.",
        // NOT retriable: the same request will go on failing until an owner publishes. `18 §5`'s
        // flag is what tells a client to stop retrying, and telling one to wait out an absence of
        // DATA is the shape `gateway-unreachable.test.ts`'s control assertion exists to refuse.
        { retriable: false, cause: null },
      );
    }
    // Parsed per kind, never spread — see the header's note on `catalog-fetch.ts`.
    const items: InventoryItem[] = [];
    const areas: AreaMembership[] = [];
    const recipes: Recipe[] = [];
    const menu_recipes: MenuRecipe[] = [];
    for (const entry of parsed.entries) {
      if (entry.kind === "item") items.push(InventoryItemWire.parse(entry.payload));
      else if (entry.kind === "area") areas.push(AreaMembershipWire.parse(entry.payload));
      else if (entry.kind === "recipe") recipes.push(RecipeWire.parse(entry.payload));
      else menu_recipes.push(MenuRecipeWire.parse(entry.payload));
    }
    return { items, areas, recipes, menu_recipes };
  },
});
