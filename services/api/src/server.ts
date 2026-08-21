/**
 * The Fastify + tRPC host (`18 §5`: Fastify, tRPC v11 for first-party clients, superjson;
 * plain REST only for third-party webhooks, of which this service has none yet).
 *
 * `createApiServer` takes everything it depends on — the store, the signing secret, the clock —
 * because `18 §4` puts the clock at the composition root and `18 §5` bans `process.env` outside
 * the `defineEnv` module. `main()` at the bottom is that composition root.
 */

import { pathToFileURL } from "node:url";
import { defineEnv, redactedDsn } from "@restos/config";
import {
  BUSINESS_DAY_CUTOVER_HOUR_DEFAULT,
  ORDER_CHANNELS,
  type OrderChannel,
} from "@restos/domain";
import { type CreateFastifyContextOptions, fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import Fastify, { type FastifyInstance } from "fastify";
import { createMemoryStagedEditStore } from "./catalog.js";
import { type DeviceDirectory, unconfiguredDeviceDirectory } from "./devices.js";
import { type ExportRequests, unconfiguredExportRequests } from "./exports.js";
import {
  createGatewayCatalogPublisher,
  createGatewayDayLedger,
  createGatewayDeviceDirectory,
  createGatewayLedgerAppender,
  createGatewayTenancyDirectory,
  createGatewayUserDirectory,
} from "./gateway-client.js";
import { type DayLedger, unconfiguredDayLedger } from "./ledger.js";
import {
  type CatalogDeps,
  createCatalogRuntime,
  createDayEndScheduler,
  createMemoryCatalogPublisher,
  createMemoryLedgerAppender,
} from "./publish.js";
import { appRouter, assertEveryProcedureIsGated } from "./router.js";
import { type TenancyDirectory, unconfiguredTenancyDirectory } from "./tenancy.js";
import type { ApiContext } from "./trpc.js";
import { type UserDirectory, unconfiguredUserDirectory } from "./user-directory.js";
import { createMemoryUserStore, type UserRecord, type UserStore } from "./users.js";
import { createPostgresUserStore } from "./users-postgres.js";

export type ApiServerOptions = {
  readonly store: UserStore;
  readonly sessionSecret: string;
  /** Injected (`18 §4`). `main()` supplies the real one; the suite supplies a fixed instant. */
  readonly now: () => number;
  /**
   * B-3/B-4's dependencies. Optional here and REQUIRED once resolved, which is the narrow shape
   * this needs to be: `start()` always passes one built from env — and a host that omits it (the
   * B-2 suite, which predates the catalog and exercises only authorization) still boots.
   *
   * ⚠ **This said the "unsupplied optional seam" the CI rail catches "cannot form", and that was
   * FALSE when written.** Rule B examined only factories declared under `packages/`, and it
   * additionally required a call site to IMPORT the factory — `createApiServer` fails both tests,
   * being declared in `services/` and constructed 195 lines below in this same file's `start()`.
   * The seam was invisible twice over. Both holes were closed on 2026-08-10 and the claim is true
   * now: delete `catalog` from the `createApiServer({ … })` call and `pnpm seams:check` reddens by
   * name (measured). Recorded rather than silently corrected — a comment promising a protection
   * that does not exist is what stops someone writing the assertion by hand.
   *
   * The fallback is deliberately UNUSABLE for saving rather than convenient. See
   * `unconfiguredCatalog`.
   */
  readonly catalog?: CatalogDeps;
  /**
   * `14-F12`/`14-F13`'s device surface. Optional here for `catalog`'s reason — the B-2 suite
   * predates it and still has to boot — and REQUIRED once resolved.
   *
   * **The fallback is `unconfiguredDeviceDirectory`, which refuses every call**, not a memory stub.
   * AGENTS.md measured the stub shape as invisible to every rail we have ("Rule B asks whether an
   * optional member is *supplied*, never whether what was supplied is *real*"), and on this surface
   * a stub means a revoke button that reports success and stops nothing — on the one screen whose
   * entire subject is a stolen tablet.
   */
  readonly devices?: DeviceDirectory;
  /**
   * `12-F10`'s ledger reader. Optional here for `devices`' reason — suites that predate the
   * summary still have to boot — and REQUIRED once resolved.
   *
   * **The fallback is `unconfiguredDayLedger`, which refuses every read**, not a memory stub. On
   * this surface a stub answering `[]` is the most dangerous shape in the file: it renders a
   * complete, confident, entirely wrong summary — `Rs 0`, no shifts, no variance — for a
   * restaurant that traded normally, and nothing about the screen says anything is missing.
   */
  readonly ledger?: DayLedger;
  /**
   * `01-F68`/`01-F69`'s naming directory. Optional here for `devices`' reason — suites that predate
   * it still have to boot — and REQUIRED once resolved.
   *
   * **The fallback is `unconfiguredTenancyDirectory`, which refuses every read**, not a memory stub,
   * and on this surface the stub is the most dangerous shape in the file for a reason none of the
   * others share: *"unnamed org, no branches" is the correct answer for every tenant in this
   * deployment today*, because the directory tables have no writer yet. A stub returning it would be
   * indistinguishable from a working implementation now, and would go on being indistinguishable
   * after provisioning landed — a naming surface permanently frozen at "unnamed", with every gate
   * green.
   */
  readonly tenancy?: TenancyDirectory;
  /**
   * `14-F14`'s user CRUD. Optional here for `devices`' reason — suites that predate it still have
   * to boot — and REQUIRED once resolved.
   *
   * **The fallback is `unconfiguredUserDirectory`, which refuses every call**, not a memory stub.
   * A stub here is the shape AGENTS.md measures as invisible to every rail ("a stub is a supply"),
   * and on this surface it means an owner told she created a cashier who exists nowhere, or shown
   * an empty roster for a restaurant that has staff — a claim about who may sell, under `11-F20`,
   * which never deletes a person record.
   */
  readonly users?: UserDirectory;
  /**
   * `22-F16`'s owner-triggered export. Optional here for `devices`' reason — suites that predate it
   * still have to boot — and **REQUIRED once resolved**.
   *
   * **The fallback is `unconfiguredExportRequests`, which refuses every call**, not a memory stub.
   * `22-N3` has the owner watching a progress STATE rather than a spinner, so a stub renders a
   * screen that looks exactly right over a job that is not running — the "supplied with a stub"
   * shape AGENTS.md measures as invisible to every rail we have, on a surface whose subject is a
   * copy of the whole ledger.
   *
   * @unreached-owed **NOTHING SUPPLIES THIS, AND THE DEBT IS THE SEAM RATHER THAN THE PORT.**
   * `start()` deliberately passes no `exports`, so a real deployment refuses every export request
   * loudly and `pnpm -C services/jobs export-org --org <id> --out <dir>` is how a bundle is
   * generated today. Two things are owed and neither could be invented here without taking a
   * decision this change may not take: a **durable request record** — `22 §5`'s `governance_requests`
   * entity, which `18 §4` gives exactly one writer service while this plane creates the row and the
   * worker advances it to `ready`, so the writer is an open question — and the **enqueue** that
   * makes pulling the trigger run the job. `owner-export.test.ts`'s header names the same gap from
   * the other side and assigns it to *"whoever wires the queue"*, with a hand-written assertion.
   */
  readonly exports?: ExportRequests;
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
  const devices = options.devices ?? unconfiguredDeviceDirectory();
  const ledger = options.ledger ?? unconfiguredDayLedger();
  const tenancy = options.tenancy ?? unconfiguredTenancyDirectory();
  const users = options.users ?? unconfiguredUserDirectory();
  const exportRequests = options.exports ?? unconfiguredExportRequests();

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
        devices,
        ledger,
        tenancy,
        users,
        exports: exportRequests,
      }),
    },
  });

  return app;
};

/**
 * The boot seed. **STUB, and `15-F26` names it as one:** *"one owner assembled at boot from
 * `BOOTSTRAP_OWNER_EMAIL` / `_PASSWORD_HASH` / `BOOTSTRAP_ORG_ID` into a process-local store that
 * dies with the process. That is a stopgap standing in a provisioning step's place."*
 *
 * **It is no longer the only path, and it is no longer the DEFAULT one for a real deployment** —
 * see `resolveUserStore`. It is kept because it is the documented quickstart (`README.md`,
 * `ops/env/cloud.env.example`) and because a laptop with no Postgres must still be able to open the
 * back office.
 *
 * Absent env leaves the store EMPTY and the service still boots and serves — nobody can log in,
 * which is the fail-closed direction. The alternative, a default credential, is how a
 * restaurant's money ends up behind `admin/admin`.
 */
const bootstrapUsers = (env: {
  BOOTSTRAP_OWNER_EMAIL: string | undefined;
  BOOTSTRAP_OWNER_PASSWORD_HASH: string | undefined;
  BOOTSTRAP_ORG_ID: string | undefined;
  BOOTSTRAP_OWNER_NAME: string | undefined;
}): UserRecord[] => {
  const { BOOTSTRAP_OWNER_EMAIL, BOOTSTRAP_OWNER_PASSWORD_HASH, BOOTSTRAP_ORG_ID } = env;
  if (!BOOTSTRAP_OWNER_EMAIL || !BOOTSTRAP_OWNER_PASSWORD_HASH || !BOOTSTRAP_ORG_ID) return [];
  return [
    {
      user_id: `bootstrap-owner:${BOOTSTRAP_ORG_ID}`,
      org_id: BOOTSTRAP_ORG_ID,
      email: BOOTSTRAP_OWNER_EMAIL,
      /**
       * `11-F20` — the seeded owner's name, if the operator supplied one.
       *
       * **Deliberately NOT a fourth required variable, and deliberately NOT defaulted.** Required
       * would break every deployment and every host that sets the existing three, to enforce an FR
       * whose real writer (`14-F14`'s user CRUD, `15-F26`'s provisioning) does not exist here — this
       * seed is `15-F26`'s own "stopgap standing in a provisioning step's place". Defaulted would be
       * worse: "Owner" or the email's local part is a name the product invented for a person, which
       * is precisely what `21-F15` forbids. Absent means the name slot renders `21-F15`'s stated
       * unnamed treatment, which is true.
       */
      ...(env.BOOTSTRAP_OWNER_NAME ? { display_name: env.BOOTSTRAP_OWNER_NAME } : {}),
      // A `domain` `hashPin` PHC string. Never a plaintext password — the env would then hold
      // the credential itself, and `01-F1`'s reasoning about permanence applies to a deploy
      // config just as it does to the ledger.
      password_hash: BOOTSTRAP_OWNER_PASSWORD_HASH,
      assignments: [{ role: "owner", branch_id: null }],
    },
  ];
};

/**
 * **WHO CAN LOG IN, RESOLVED FROM EXACTLY ONE SOURCE** (`15-F26`, `15-F27`, `11-F20`).
 *
 * `pnpm -C services/sync-gateway create-owner` persists a real owner with an Argon2id credential
 * into `kernel.users` (`0011`), and until this function existed **this service ignored it
 * entirely**: the login path served `BOOTSTRAP_OWNER_*` out of a `Map`. So a tenant could be
 * provisioned and nobody in it could sign in, and every restart wiped every account — AGENTS.md's
 * recurring defect on the SaaS's front door.
 *
 * ## `DATABASE_URL` and `BOOTSTRAP_OWNER_*` are MUTUALLY EXCLUSIVE, and both set is a boot CRASH
 *
 * The obvious shape — the table first, the env seed as a fallback — was rejected, and not on
 * tidiness:
 *
 *   - **It is two sources for one fact**, which is the drift `catalog.enabled` was just consolidated
 *     to remove (`ENABLED_*` versus `NEXT_PUBLIC_ENABLED_*`, one screen up in this file's own
 *     history). Here the two sources disagree about *who may enter the product*.
 *   - **The fallback would be a permanent backdoor.** An env-declared owner exists in no
 *     `kernel.users` row, so `pnpm -C services/sync-gateway list-tenancy` cannot report it,
 *     `14-F14`'s CRUD could never deactivate it, and `15-F3`'s audit trail would attribute its acts
 *     to an account the directory has never heard of. `15-F26` allows the stopgap *instead of*
 *     provisioning, never *beside* it.
 *   - **A precedence rule is silent by construction.** Whichever way it fell, an operator who left
 *     the old three variables in a shared env file would get a working login and no way to tell
 *     which account they were using — and `ops/env/cloud.env.example` is ONE file read by all four
 *     units, so that is the likely state rather than an exotic one.
 *
 * So the refusal is loud, at boot, naming both halves and the command that replaces them. That is
 * `SESSION_SECRET`'s and `ENABLED_CHANNELS`'s posture in this same file: a configuration a human can
 * still fix is fixed at boot, never at 3am through a symptom.
 *
 * **Neither configured stays fail-CLOSED and is not a crash**: the host boots, serves, refuses
 * every credential, and says so on its boot line. A default credential is the one thing that must
 * never appear here.
 */
const resolveUserStore = (env: {
  DATABASE_URL: string | undefined;
  BOOTSTRAP_OWNER_EMAIL: string | undefined;
  BOOTSTRAP_OWNER_PASSWORD_HASH: string | undefined;
  BOOTSTRAP_ORG_ID: string | undefined;
  BOOTSTRAP_OWNER_NAME: string | undefined;
}): { readonly store: UserStore; readonly report: string } => {
  const seeded = (
    [
      ["BOOTSTRAP_OWNER_EMAIL", env.BOOTSTRAP_OWNER_EMAIL],
      ["BOOTSTRAP_OWNER_PASSWORD_HASH", env.BOOTSTRAP_OWNER_PASSWORD_HASH],
      ["BOOTSTRAP_ORG_ID", env.BOOTSTRAP_ORG_ID],
      ["BOOTSTRAP_OWNER_NAME", env.BOOTSTRAP_OWNER_NAME],
    ] as const
  )
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);

  if (env.DATABASE_URL !== undefined) {
    if (seeded.length > 0) {
      throw new Error(
        `DATABASE_URL is set AND ${seeded.join(", ")} ${seeded.length === 1 ? "is" : "are"} set. ` +
          "These are two answers to one question — who may sign in — and this service will not " +
          "choose between them (15-F26/15-F27). With DATABASE_URL set, accounts live in " +
          "kernel.users and are created by `pnpm -C services/sync-gateway create-owner`, which is " +
          "the only path that produces an account list-tenancy can report and 14-F14 could ever " +
          "deactivate. UNSET the BOOTSTRAP_OWNER_* variables (all of them, including " +
          "BOOTSTRAP_OWNER_NAME) and create the owner with that command. If you meant the " +
          "development seed instead, unset DATABASE_URL.",
      );
    }
    return {
      store: createPostgresUserStore(env.DATABASE_URL),
      report:
        `kernel.users at ${redactedDsn(env.DATABASE_URL)} (persistent; accounts are created by ` +
        "`pnpm -C services/sync-gateway create-owner` — 15-F26/15-F27)",
    };
  }

  const users = bootstrapUsers(env);
  return {
    store: createMemoryUserStore(users),
    report:
      users.length === 0
        ? "NONE — no DATABASE_URL and no BOOTSTRAP_OWNER_*, so nobody can log in. This is the " +
          "fail-closed direction, never a default credential. Set DATABASE_URL and run " +
          "`pnpm -C services/sync-gateway create-owner`."
        : `BOOTSTRAP_OWNER_* development seed — ONE owner, IN MEMORY, and it DIES WITH THIS ` +
          "PROCESS (15-F26 calls this a stopgap). Set DATABASE_URL instead to read kernel.users.",
  };
};

/**
 * The boot line that says WHERE accounts come from, exported for `LISTENING_PREFIX`'s reason: an
 * oracle matching a hand-copied literal is `K-3`'s dead-oracle defect (round-3 law).
 *
 * **It exists because the answer was previously unknowable from outside the process.** Three
 * deployment states — a real users table, a dev seed that evaporates on restart, and nobody at all
 * — are indistinguishable at the terminal, and the second and third are precisely the ones an
 * operator needs told. `00 §5.7`: a surface reports what is true.
 */
export const USER_STORE_PREFIX = "@restos/api accounts: ";

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
 * `02-F42`'s CLOSED channel set, enforced at BOOT. An unknown channel crashes the process the way
 * a missing `SESSION_SECRET` does — loud, never degraded (`18 §5`).
 *
 * **This check used to live in `apps/backoffice/src/lib/env.ts` and moved here in August 2026**,
 * when `catalog.enabled` made this service the authority for `01-F60`'s enabled set. Leaving it
 * behind would have deleted it: the back office no longer reads a channel list, so the only
 * remaining refusal would have been `CatalogEntryWire`'s at SAVE — after an owner had already
 * drawn a `dine_in` column, typed prices into it and pressed save. `01-F60` looks a price up by
 * the ORDER's channel, so such a column matches no lookup that can ever happen and every item in
 * it reads as unpriced on every real channel. Boot is the moment the operator can still fix it.
 */
const channels = (raw: string | undefined): readonly OrderChannel[] => {
  const named = list(raw);
  const unknown = named.filter((name) => !(ORDER_CHANNELS as readonly string[]).includes(name));
  if (unknown.length > 0) {
    throw new Error(
      `not an 02-F42 order channel: ${unknown.join(", ")}. Known: ${ORDER_CHANNELS.join(", ")}. ` +
        "A channel is a PRICE KEY (01-F60), not an order type (02-F1).",
    );
  }
  return named as readonly OrderChannel[];
};

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
    /**
     * **Where accounts live** — `kernel.users` (`0011`), written by
     * `pnpm -C services/sync-gateway create-owner` and read here on the login path (`15-F26`,
     * `15-F27`, `11-F20`). See `resolveUserStore`, which also refuses this beside `BOOTSTRAP_*`.
     *
     * **OPTIONAL, and deliberately WITHOUT the default `services/sync-gateway` gives it.** A
     * default here would silently point a fresh checkout at `localhost:5432` and turn "nobody can
     * log in" into "the wrong database has no users", which reads identically and is harder to
     * diagnose. `services/jobs` refuses to boot without it for the same family of reason; this one
     * cannot go that far without breaking the documented `BOOTSTRAP_*` quickstart.
     *
     * The connection is LAZY (`users-postgres.ts`), so a wrong DSN is a named 503 on the first
     * login rather than a boot crash — `services/sync-gateway`'s established posture for a database
     * dependency, and the reason a gateway outage never stops a till selling.
     */
    DATABASE_URL: optional,
    BOOTSTRAP_OWNER_EMAIL: optional,
    BOOTSTRAP_OWNER_PASSWORD_HASH: optional,
    BOOTSTRAP_ORG_ID: optional,
    /** `11-F20`'s name on the seeded owner. Optional — see `bootstrapUsers`. */
    BOOTSTRAP_OWNER_NAME: optional,
    /**
     * `01-F60`'s enabled set, stated explicitly by the operator. `00 §7`'s layer-2 config plane
     * does not exist, so this is where "the caller states the set, even where that is a constant"
     * actually lands. Absent leaves it empty, and an empty set REFUSES every save (see
     * `unconfiguredCatalog`) rather than checking nothing.
     *
     * **This is now the ONLY declaration of the set** (August 2026). `catalog.enabled` serves it
     * to `apps/backoffice`, which deleted its own `NEXT_PUBLIC_ENABLED_*` copy — the two could
     * disagree, and a grid drawn on axes the writer does not check publishes a menu whose every
     * tile reads `no price set` on the till with all four processes reporting success.
     */
    ENABLED_BRANCHES: list,
    ENABLED_CHANNELS: channels,
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

  // `14-F12`/`14-F13`, over the SAME `/internal` link the catalog uses. Swap it for
  // `unconfiguredDeviceDirectory()` and the process still starts, still serves, still gates — and
  // every device request refuses loudly rather than lying, which is the mutant
  // `__acceptance__/device-seam.test.ts` exists to redden.
  const devices: DeviceDirectory = createGatewayDeviceDirectory(link);

  // `12-F10`. Same `/internal` link again. Swap it for `unconfiguredDayLedger()` and the process
  // still starts, still serves, still gates — and every summary request refuses loudly instead of
  // rendering `Rs 0` over a day that traded. That mutant is `summary-seam.test.ts`'s S3.
  const ledger: DayLedger = createGatewayDayLedger(link);

  // `01-F68`/`01-F69`. Same `/internal` link again. Swap it for `unconfiguredTenancyDirectory()` and
  // the process still starts, still serves, still gates — and every name slot in the product goes
  // permanently unnamed while looking exactly like the correct answer, because nothing writes the
  // directory tables yet. That mutant is `tenancy-names.test.ts`'s N3.
  const tenancy: TenancyDirectory = createGatewayTenancyDirectory(link);

  // `14-F14`. Same `/internal` link again. Swap it for `unconfiguredUserDirectory()` and the
  // process still starts, still serves, still gates — and every act on the staff roster refuses
  // loudly instead of reporting a cashier this deployment never wrote. ⚠ **This one is NOT the
  // login store**, which is `resolveUserStore` below: that reads `kernel.users` directly for
  // `01-F27`'s per-request subject lookup and must keep working with the gateway down
  // (`startable.test.ts` boots this service against a CLOSED gateway port and drives `whoami`).
  // This writes the same table THROUGH the gateway, because `18 §4` gives it exactly one writer
  // service and that service is not this one.
  const userDirectory: UserDirectory = createGatewayUserDirectory(link);

  // **WHO CAN LOG IN** (`15-F26`/`15-F27`). `DATABASE_URL` set ⇒ `kernel.users`, the rows
  // `pnpm -C services/sync-gateway create-owner` writes; absent ⇒ the `BOOTSTRAP_OWNER_*` seed that
  // dies with this process. Both set is refused at boot — see `resolveUserStore`. Swap this back to
  // `createMemoryUserStore(bootstrapUsers(env))` and the process still starts, still serves, still
  // gates, still publishes a menu — and every account a tenant was provisioned with is invisible.
  const users = resolveUserStore(env);

  const app = await createApiServer({
    store: users.store,
    sessionSecret: env.SESSION_SECRET,
    // The real clock, injected here and nowhere else (`18 §4`).
    now,
    catalog,
    devices,
    ledger,
    tenancy,
    users: userDirectory,
  });

  // `14-F28`'s day-end landing, in production, **for every tenant on this host** — and this is the
  // ONLY sanctioned caller of the unscoped `runDue()` (`01-F71`; `catalog.runDayEnd` takes the
  // org-scoped `runDueForOrg`). It is the platform's own schedule, running under no subject's
  // authority, which is what makes an every-org sweep legitimate here and a cross-tenant write
  // anywhere a request can reach.
  //
  // ⚠ **`14-F28`'s promise to a tenant whose owner never presses anything now rests entirely on
  // this line**, and on a `createMemoryStagedEditStore` that dies with the process — so a pending
  // day-end edit still does not survive a restart, and a host that never runs `start()` never
  // lands one. Both are pre-existing (the durable store is owed with the back office's Drizzle
  // schema) and both are stated here because scoping the procedure removed the accidental second
  // path. `18 §5` puts scheduled work on a BullMQ repeatable in `services/jobs`; this interval
  // predates that and is owed the move.
  //
  // `unref` so the sweep never holds the process open.
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
  /**
   * **The second boot line, and it is the one that would have caught this defect.** For months this
   * process printed `listening on …` over a user store that was three environment variables in a
   * `Map`, and nothing it printed distinguished that from a real accounts table — so "the owner we
   * provisioned cannot sign in" had to be discovered by failing to sign in. `services/sync-gateway`
   * already prints four lines for exactly this reason. On **stdout**, beside the line above:
   * `startable.test.ts` asserts the running process writes nothing to stderr.
   */
  console.log(`${USER_STORE_PREFIX}${users.report}`);
  return app;
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  start().catch((error: unknown) => {
    // Crash at boot on invalid env / failed bind (`18 §5`) — loud, never degraded.
    console.error(error);
    process.exit(1);
  });
}
