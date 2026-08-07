/**
 * The Fastify + tRPC host (`18 §5`: Fastify, tRPC v11 for first-party clients, superjson;
 * plain REST only for third-party webhooks, of which this service has none yet).
 *
 * `createApiServer` takes everything it depends on — the store, the signing secret, the clock —
 * because `18 §4` puts the clock at the composition root and `18 §5` bans `process.env` outside
 * the `defineEnv` module. `main()` at the bottom is that composition root.
 */

import { pathToFileURL } from "node:url";
import { defineEnv } from "@restos/config";
import { BUSINESS_DAY_CUTOVER_HOUR_DEFAULT } from "@restos/domain";
import { type CreateFastifyContextOptions, fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import Fastify, { type FastifyInstance } from "fastify";
import { createMemoryStagedEditStore } from "./catalog.js";
import { createGatewayCatalogPublisher, createGatewayLedgerAppender } from "./gateway-client.js";
import {
  type CatalogDeps,
  createCatalogRuntime,
  createDayEndScheduler,
  createMemoryCatalogPublisher,
  createMemoryLedgerAppender,
} from "./publish.js";
import { appRouter, assertEveryProcedureIsGated } from "./router.js";
import type { ApiContext } from "./trpc.js";
import { createMemoryUserStore, type UserRecord, type UserStore } from "./users.js";

export type ApiServerOptions = {
  readonly store: UserStore;
  readonly sessionSecret: string;
  /** Injected (`18 §4`). `main()` supplies the real one; the suite supplies a fixed instant. */
  readonly now: () => number;
  /**
   * B-3/B-4's dependencies. Optional here and REQUIRED once resolved, which is the narrow shape
   * this needs to be: `start()` always passes one built from env, so the "unsupplied optional
   * seam" the CI rail catches cannot form — and a host that omits it (the B-2 suite, which
   * predates the catalog and exercises only authorization) still boots.
   *
   * The fallback is deliberately UNUSABLE for saving rather than convenient. See
   * `unconfiguredCatalog`.
   */
  readonly catalog?: CatalogDeps;
};

/**
 * The fallback when a host declares no catalog dependencies. **Its enabled set is empty, and that
 * is the fail-closed direction, not an oversight** — `assertSavable` refuses an empty set outright
 * rather than treating it as "nothing to check", so a deployment that never stated its
 * `(branch, channel)` pairs cannot save a menu at all.
 *
 * The alternative — a plausible default like "one branch, all channels" — would let an owner
 * publish a menu priced against branches that do not exist, and `01-F53` would freeze whatever it
 * guessed. `01-F60` refuses a fallback price for the same reason this refuses a fallback set.
 */
const unconfiguredCatalog = (now: () => number): CatalogDeps => ({
  staged: createMemoryStagedEditStore(),
  publisher: createMemoryCatalogPublisher(),
  ledger: createMemoryLedgerAppender(),
  enabled: { branches: [], channels: [] },
  now,
  cutover_hour: BUSINESS_DAY_CUTOVER_HOUR_DEFAULT,
});

/**
 * The ONLY credential read off the wire. Anything else a client sends about who it is — a role
 * header, an actor id, an org — reaches no code path: `ApiContext` has nowhere to put it.
 */
const bearerOf = (header: string | undefined): string | null => {
  if (header === undefined) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match === null ? null : (match[1] as string);
};

export const createApiServer = async (options: ApiServerOptions): Promise<FastifyInstance> => {
  // Before anything can be served. A procedure with no `can()` check and no recorded exemption
  // stops the host from coming up — this wave's recurring defect, refused at the door.
  assertEveryProcedureIsGated(appRouter);

  const app = Fastify({ logger: false });

  // ONE runtime for the host, not one per request: the day-end scheduler and the staged-edit
  // store have to be the same objects across every request, or a cancel would reach a different
  // pending set than the sweep reads (`14-F28`).
  const catalog = createCatalogRuntime(options.catalog ?? unconfiguredCatalog(options.now));

  await app.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext: ({ req }: CreateFastifyContextOptions): ApiContext => ({
        store: options.store,
        sessionSecret: options.sessionSecret,
        now: options.now,
        bearer: bearerOf(req.headers.authorization),
        catalog,
      }),
    },
  });

  return app;
};

/**
 * The boot seed. **STUB, and the plan says so:** users/PINs are `14-F11`+, excluded from this
 * plan's scope ("Admission has not landed, so a device registry would have nothing to register"),
 * so there is no surface that creates the FIRST owner and no table to create them in. Until B-3
 * backs `UserStore` with Drizzle, one owner may be declared in env.
 *
 * Absent env leaves the store EMPTY and the service still boots and serves — nobody can log in,
 * which is the fail-closed direction. The alternative, a default credential, is how a
 * restaurant's money ends up behind `admin/admin`.
 */
const bootstrapUsers = (env: {
  BOOTSTRAP_OWNER_EMAIL: string | undefined;
  BOOTSTRAP_OWNER_PASSWORD_HASH: string | undefined;
  BOOTSTRAP_ORG_ID: string | undefined;
}): UserRecord[] => {
  const { BOOTSTRAP_OWNER_EMAIL, BOOTSTRAP_OWNER_PASSWORD_HASH, BOOTSTRAP_ORG_ID } = env;
  if (!BOOTSTRAP_OWNER_EMAIL || !BOOTSTRAP_OWNER_PASSWORD_HASH || !BOOTSTRAP_ORG_ID) return [];
  return [
    {
      user_id: `bootstrap-owner:${BOOTSTRAP_ORG_ID}`,
      org_id: BOOTSTRAP_ORG_ID,
      email: BOOTSTRAP_OWNER_EMAIL,
      // A `domain` `hashPin` PHC string. Never a plaintext password — the env would then hold
      // the credential itself, and `01-F1`'s reasoning about permanence applies to a deploy
      // config just as it does to the ledger.
      password_hash: BOOTSTRAP_OWNER_PASSWORD_HASH,
      assignments: [{ role: "owner", branch_id: null }],
    },
  ];
};

const optional = (raw: string | undefined): string | undefined =>
  raw === undefined || raw === "" ? undefined : raw;

const list = (raw: string | undefined): readonly string[] =>
  raw === undefined
    ? []
    : raw
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part !== "");

/**
 * How often the day-end sweep runs. A minute, because the boundary is a wall-clock instant an
 * edit is compared against rather than a timer it rides: a sweep that is late publishes the same
 * edits, one sweep later. Nothing here schedules AT the boundary, which is what makes a cancel
 * arriving at 04:59:59 still work.
 */
const DAY_END_SWEEP_MS = 60_000;

/**
 * The boot line's prefix, exported so the startability test matches THIS string rather than a
 * hand-copy of it. A copied literal is how an oracle ends up asserting against a symbol nobody
 * ships (round-3 law, `K-3`): rename the message and a copy keeps passing against a server that
 * no longer says it.
 */
export const LISTENING_PREFIX = "@restos/api listening on ";

const start = async (): Promise<FastifyInstance> => {
  const env = defineEnv({
    PORT: (raw) => (raw === undefined || raw === "" ? 3001 : Number(raw)),
    SESSION_SECRET: (raw) => {
      if (raw === undefined || raw === "") throw new Error("required (session signing secret)");
      return raw;
    },
    BOOTSTRAP_OWNER_EMAIL: optional,
    BOOTSTRAP_OWNER_PASSWORD_HASH: optional,
    BOOTSTRAP_ORG_ID: optional,
    /**
     * `01-F60`'s enabled set, stated explicitly by the operator. `00 §7`'s layer-2 config plane
     * does not exist, so this is where "the caller states the set, even where that is a constant"
     * actually lands. Absent leaves it empty, and an empty set REFUSES every save (see
     * `unconfiguredCatalog`) rather than checking nothing.
     */
    ENABLED_BRANCHES: list,
    ENABLED_CHANNELS: list,
    /**
     * **Where a published menu actually goes** (`plans/wave-1/catalog-transport.md` §6 Q1, founder
     * ruling: the API publishes, the gateway serves).
     *
     * **REQUIRED, and the process refuses to boot without it — that refusal IS the fix.** Until
     * August 2026 this composition root built `createMemoryCatalogPublisher()`, so the back office
     * published into a `Map` that died with the process: an owner authored a menu, scheduled it,
     * saw it publish, and no till ever heard. Making these optional would restore exactly that —
     * the deployment that forgets them looks completely healthy and ships nothing, which is this
     * wave's named defect (AGENTS.md) and the reason it takes weeks to notice.
     *
     * The cost is stated rather than hidden: a back office cannot start without a gateway to
     * publish to. That is correct. A back office whose only irreversible act is publishing a menu
     * has nothing to offer an org it cannot publish to, and `SESSION_SECRET` above already sets the
     * precedent that a missing dependency is a crash and never a degraded mode.
     */
    SYNC_GATEWAY_URL: (raw) => {
      if (raw === undefined || raw === "") {
        throw new Error(
          "required (the sync gateway's base URL, e.g. http://sync-gateway:8080). Without it a " +
            "published menu reaches no device at all — 14-F28 lands into nothing.",
        );
      }
      return raw;
    },
    SYNC_GATEWAY_TOKEN: (raw) => {
      if (raw === undefined || raw === "") {
        throw new Error(
          "required (the /internal publish credential; the gateway's PUBLISH_TOKEN). One shared " +
            "secret — a mismatch is a 401 on every publish and a menu that never ships.",
        );
      }
      return raw;
    },
  });

  const now = (): number => Date.now();
  const link = { base_url: env.SYNC_GATEWAY_URL, token: env.SYNC_GATEWAY_TOKEN };
  const catalog: CatalogDeps = {
    staged: createMemoryStagedEditStore(),
    // **The two ports that were stubs.** Both now reach `services/sync-gateway` over the
    // `/internal` contract: `publisher` writes the versioned artifact devices fetch (`01-F52`),
    // `ledger` appends `catalog.changed` to the `01-F62` org-scoped store `14-F3` reads. Swap
    // either back to its `createMemory*` stub and the process still starts, still serves, still
    // refuses unauthenticated requests — and no menu ships. That mutant is what
    // `__acceptance__/catalog-gateway-seam.test.ts` exists to redden.
    publisher: createGatewayCatalogPublisher(link),
    ledger: createGatewayLedgerAppender(link),
    enabled: { branches: env.ENABLED_BRANCHES, channels: env.ENABLED_CHANNELS },
    now,
    cutover_hour: BUSINESS_DAY_CUTOVER_HOUR_DEFAULT,
  };

  const app = await createApiServer({
    store: createMemoryUserStore(bootstrapUsers(env)),
    sessionSecret: env.SESSION_SECRET,
    // The real clock, injected here and nowhere else (`18 §4`).
    now,
    catalog,
  });

  // `14-F28`'s day-end landing, in production. `unref` so the sweep never holds the process open.
  const sweep = setInterval(() => {
    void createDayEndScheduler(catalog)
      .runDue()
      .catch((error: unknown) => {
        // Loud, never silent: a swallowed sweep failure is a menu edit that never lands and an
        // owner who is never told, which is the shape `14-F28`'s cancellable window exists to
        // keep visible.
        console.error("day-end catalog sweep failed", error);
      });
  }, DAY_END_SWEEP_MS);
  sweep.unref();

  const address = await app.listen({ port: env.PORT, host: "0.0.0.0" });
  /**
   * **This line is load-bearing, not decoration.** `PORT=0` binds an ephemeral port, so the port
   * the process actually got is knowable only from here — and `__acceptance__/startable.test.ts`
   * spawns the run script with `PORT=0` and reads this line to find where to send its request.
   * Silence it and the startability test cannot find the server; change its shape and the test
   * says so. Fastify's `logger` stays `false` (`createApiServer`): one line at boot is the whole
   * story a `tsx` dev process needs, and request logging is a deployment concern this has none of.
   */
  console.log(`${LISTENING_PREFIX}${address}`);
  return app;
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  start().catch((error: unknown) => {
    // Crash at boot on invalid env / failed bind (`18 §5`) — loud, never degraded.
    console.error(error);
    process.exit(1);
  });
}
