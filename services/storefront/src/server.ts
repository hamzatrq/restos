import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { redactedDsn } from "@restos/config";
import { createWsCloudTransport, wallClock } from "@restos/sync-client";
import { TRPCError } from "@trpc/server";
import { type CreateFastifyContextOptions, fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import Fastify from "fastify";
import { createGatewayCatalog, type GatewayLink, type StorefrontCatalog } from "./catalog.js";
import { type Capability, type EntitlementSource, STOREFRONT_CAPABILITY } from "./entitlement.js";
import { type OriginIdentity, resolveOriginIdentity } from "./identity.js";
import { pendingMigrations } from "./migrate.js";
import { createStorefrontOrigin, type LamportSource } from "./origin.js";
import type { Outbox } from "./outbox.js";
import { createPostgresOutbox } from "./outbox-postgres.js";
import { createPlacement } from "./placement.js";
import {
  assertEveryProcedureDeclaresEntitlement,
  type StorefrontContext,
  storefrontRouter,
} from "./router.js";
import { createUplink } from "./uplink.js";

/**
 * `06-F32` — the storefront service host.
 *
 * ⚠ **THIS FILE EXISTS BECAUSE `L8` KEEPS HAPPENING.** The register's later shapes include *a
 * service with no `dev`/`start` script, so a whole plane had never run as a process* — measured
 * on `services/sync-gateway`, which had `test` and a `build` stub and could not be started at
 * all. A correct origin, a correct gate and a correct outbox with nothing able to host them is
 * the same defect one module over, and `__acceptance__/startable.test.ts` spawns the DECLARED
 * script so that this stops being true silently.
 */

export type ServerOptions = {
  readonly port?: number;
  /**
   * ⚠ **REQUIRED, deliberately, and not an optional seam with a default.**
   *
   * `seams:check` Rule B asks whether an *optional* member is supplied and never whether the
   * supply is REAL — a stub IS a supply — so an `outbox?: Outbox` defaulting to `inMemoryOutbox`
   * would be the measured blind spot exactly: every gate green, every test passing, and a
   * customer's order lost on the next restart.
   *
   * ⚠ **THE SENTENCE THAT STOOD HERE WAS FALSE, and it is `L11` in this file.** It read *"making
   * it required moves the failure to compile time, which is the only place a rail can see it"* —
   * but required-ness proves a value is **passed**, never that it is **used**. Measured by the
   * adversarial review (2026-08-24): replacing `outbox: options.outbox` with `inMemoryOutbox()`
   * inside `createStorefrontServer` passed **31 of 31** tests, `typecheck` and `seams:check`, so a
   * deployment could hand over a real Postgres outbox and have it silently discarded. The
   * assertion that actually holds it is `server-seam.test.ts` §A, which drives real HTTP and reads
   * the outbox the server was HANDED; the required option is the weaker half, not the mechanism.
   */
  readonly outbox: Outbox;
  readonly entitlement: EntitlementSource;
  readonly lamport: LamportSource;
  /**
   * ⚠ **REQUIRED, for `outbox`'s reason and one more (`06-F33`).** The price on a storefront line
   * comes from here or the customer sets it, which is the defect this option exists to make
   * impossible; a default would be a supply `seams:check` cannot tell from the real thing.
   */
  readonly catalog: StorefrontCatalog;
};

/**
 * `06-F1`/`06-F34` (a) — **the whole tenant resolution, and it is a comparison rather than a
 * lookup.**
 *
 * `06-F30` fixes one origin per `(org, branch)` per process, so the only tenant this deployment
 * can legally write is the one it was configured as. The host therefore resolves to exactly one
 * org or to nothing, and nothing is a **neutral** 404 that names no org and no reason — `06-F1`:
 * *"never another org's data"*, and a 404 that explains itself is a tenant-existence oracle.
 *
 * The port is stripped because a `Host` header carries one (`example.pk:8080`) whenever the
 * service is not on 443, and a deployment that answers on a port would otherwise never match.
 */
export const orgForHost = (identity: OriginIdentity, host: string | undefined): string | null => {
  if (host === undefined) return null;
  const bare = host.toLowerCase().replace(/:\d+$/, "");
  return bare === identity.public_host ? identity.org_id : null;
};

export const createStorefrontServer = (options: ServerOptions) => {
  // Refuse to build a host at all if any procedure names no capability (`06-F32` (i)).
  assertEveryProcedureDeclaresEntitlement(storefrontRouter);

  const identity = resolveOriginIdentity(process.env);
  const origin = createStorefrontOrigin({
    identity,
    lamport: options.lamport,
    clock: () => Date.now(),
    catalog: options.catalog,
    newId: () => randomUUID(),
  });
  const placement = createPlacement({
    origin,
    outbox: options.outbox,
    entitlement: options.entitlement,
  });

  const app = Fastify({ logger: false });
  app.get("/health", async () => ({ ok: true }));

  /**
   * ⚠ **THE ROUTER IS SERVED, AND FOR A WHOLE REVIEW CYCLE IT WAS NOT.** `06-F32` requires this
   * service to have *"its own tRPC router"*; the first version built one, passed it to the boot
   * assertion and **mounted it on nothing**, so every ordering path answered 404 and the entire
   * spine — placement, origin, outbox, entitlement — executed only under vitest. `seams:check` was
   * clean throughout (every export is imported by something), which is `L8` in the shape no rail
   * can see. `server-seam.test.ts` drives a REAL HTTP request through this mount for that reason.
   */
  app.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: storefrontRouter,
      createContext: ({ req }: CreateFastifyContextOptions): StorefrontContext => {
        const org_id = orgForHost(identity, req.headers.host);
        if (org_id === null) {
          throw new TRPCError({ code: "NOT_FOUND", message: "not found" });
        }
        return { org_id, placement };
      },
      /**
       * `06-F37` (b)'s other half — **the refusal a customer no longer sees has to go SOMEWHERE.**
       *
       * The formatter in `router.ts` collapses every unauthored message to one neutral sentence;
       * without this, the named errors `06-F34` (b) exists to produce would be constructed, thrown
       * and then destroyed, and an isolation failure would leave no trace anywhere. `error.cause`
       * carries the original — operator-facing, on stderr, never on the wire.
       */
      onError: (opts: { error: Error & { cause?: unknown }; path?: string | undefined }) => {
        const { error, path } = opts;
        console.error(
          `storefront refusal on ${path ?? "(no procedure)"}: ${error.name}: ${error.message}` +
            (error.cause === undefined ? "" : ` — cause: ${String(error.cause)}`),
        );
      },
    },
  });

  return {
    app,
    identity,
    placement,
    listen: async (): Promise<number> => {
      await app.listen({ port: options.port ?? 0, host: "127.0.0.1" });
      const address = app.server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      // The load-bearing boot line: it names the origin identity and the clock ruling, because
      // `T12`'s join key has three ends and no error message, and a storefront pushing under the
      // wrong (org, branch) reports success at every layer.
      console.log(
        `storefront: origin ${identity.org_id}/${identity.branch_id} as ${identity.device_id} ` +
          `(class ${identity.device_class}, 06-F31 clock permanently branch_provisional) ` +
          // `06-F34` (a) belongs on this line for `T12`'s reason: a storefront answering the
          // wrong vhost 404s every real customer and reports a clean boot.
          `serving https://${identity.public_host}/trpc on :${port}`,
      );
      return port;
    },
    close: () => app.close(),
  };
};

/**
 * ⚠ **DEV-ONLY ENTITLEMENT, AND THE PREVIOUS VERSION BREACHED `28-F5` (a) IN SHIPPING CODE.**
 *
 * It read `process.env.RESTOS_ORG_ID` to decide whether an org was entitled — a **layer-1 fact
 * about a tenant read from the process environment on the cloud plane**, which that clause bans by
 * name, on a path `pnpm start` runs. The env read is gone; what remains is a switch about this
 * DEPLOYMENT rather than a lookup about a tenant, and `06-F34` (a) is what makes that true: only
 * `identity.org_id` can reach the gate at all, so the comparison below has one possible answer.
 *
 * ⚠ **IT IS STILL NOT A REAL RESOLVER, AND THAT IS NAMED RATHER THAN HIDDEN.** `28-F6`'s record
 * has **no writer anywhere** — `28-F4` measures it: *"nothing writes a flag; `15-F5`'s console
 * does not exist and `15-F27`'s declared provisioning steps include no flag or entitlement
 * command"* — and where the durable copy lives is explicitly undecided (`28-F6`, `28 §9.4`).
 * Building a store here would be inventing that shape (commandment 2), so the honest state is: a
 * real deployment passes a real `EntitlementSource` (the option is required), this one is a
 * development stub, and the stderr warning below **names it**, which the previous warning did not.
 */
const developmentEntitlement =
  (identity: OriginIdentity): EntitlementSource =>
  async (org_id) =>
    org_id === identity.org_id
      ? { status: "record", record: { capabilities: new Set<Capability>([STOREFRONT_CAPABILITY]) } }
      : { status: "absent" };

/**
 * A start path that runs.
 *
 * ⚠ **THE OUTBOX AND THE UPLINK ARE BOTH REAL NOW (`06-F36`), AND THE WARNING THAT USED TO STAND
 * HERE WAS TRUE.** It read *"IN-MEMORY outbox, a process-local lamport counter … a restart loses
 * every order this process accepted"*, and it was measured on a real stack in August 2026: three
 * carts, three `200 {"order_id":…}` responses, **zero rows from this origin** in the gateway's
 * ledger, and the till's Orders tab reading *"No new orders from the website or WhatsApp."* The
 * remaining stub is the ENTITLEMENT source, and it is the only one — `28-F6`'s record still has no
 * writer anywhere.
 *
 * **The catalog is NOT stubbed** (`06-F33`): the price authority is the real published artifact,
 * read from the gateway, and a host that was not told where the gateway is refuses to start rather
 * than defaulting — `01-F65`'s posture, for the same reason. A storefront that guessed a price
 * would write it permanently (`01-F1`).
 *
 * ⚠ **THAT SENTENCE WAS A CLAIM WITH NOTHING BEHIND IT UNTIL 2026-08-24, AND IT IS `L11` IN THIS
 * FILE FOR THE SECOND TIME** (the first was `outbox`'s "moves the failure to compile time", one
 * screen up). Measured by the adversarial re-review: replacing `createGatewayCatalog(link,
 * identity)` below with an inline stub pricing every item at **1 paisa** left the suite at
 * **59 passed (59), exit 0** — `startable.test.ts` booted the declared script and read only
 * `/health`, so nothing ever placed an order through the spawned process and the prose was the
 * only thing asserting it. What holds it now is `startable.test.ts`'s *"prices from the REAL
 * gateway artifact"*: it serves one priced entry from a fake gateway, orders through the booted
 * host, and asserts both that the gateway was ASKED (with this org and the service credential)
 * and that an item the artifact does not price is REFUSED. A stub answers without asking and
 * prices everything, so it fails both.
 */
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "storefront: ⚠ DEV HOST — the entitlement source is a DEVELOPMENT STUB (28-F6's record has " +
      "no writer yet, 28-F4); a real deployment passes its own. The outbox is DURABLE and the " +
      "uplink is REAL (06-F36): an accepted order survives a restart and drains to the gateway " +
      "when it is reachable. The catalog is real too — prices come from the gateway's published " +
      "artifact (06-F33), never from a request.",
  );
  const identity = resolveOriginIdentity(process.env);
  const link: GatewayLink = {
    base_url: (process.env.RESTOS_GATEWAY_URL ?? "").trim(),
    token: (process.env.RESTOS_GATEWAY_TOKEN ?? "").trim(),
  };
  if (link.base_url === "" || link.token === "") {
    throw new Error(
      "06-F33: the storefront has no catalog to price against — set RESTOS_GATEWAY_URL and " +
        "RESTOS_GATEWAY_TOKEN. There is deliberately no default and no in-memory catalog: " +
        "01-F60 admits no price fallback, and a guessed price is permanent under 01-F1.",
    );
  }
  /**
   * `06-F36` (a) — **REQUIRED, with no default, and the reason is the defect this FR was written
   * against.** An absent `DATABASE_URL` used to mean "run on the heap and warn about it", and that
   * is precisely the configuration that returned three confirmed order ids for three orders no
   * restaurant ever saw. `06-N5` calls it a fake success. A storefront with nowhere durable to put
   * an order must not start, exactly as one with no price authority must not.
   */
  const databaseUrl = (process.env.DATABASE_URL ?? "").trim();
  if (databaseUrl === "") {
    throw new Error(
      "06-F36: the storefront has nowhere durable to put an accepted order — set DATABASE_URL " +
        "and run `pnpm -C services/storefront migrate` first. There is deliberately no default " +
        "and no in-memory fallback: an order acknowledged out of a heap is 06-N5's fake success, " +
        "and 01-F1 leaves no row for anyone to notice was missing.",
    );
  }
  /**
   * `06-F36` (c) — the uplink's own leg. Separate from `RESTOS_GATEWAY_URL` because they are two
   * protocols to the same service: that one is the `/internal` HTTP hop `06-F33` reads prices over,
   * this one is the `wss://…/sync` socket `01-F8` pushes over. One variable for both would make a
   * deployment that can PRICE but cannot DELIVER indistinguishable from a healthy one — which is
   * exactly what the reproduction looked like from outside.
   */
  const cloudUrl = (process.env.RESTOS_CLOUD_URL ?? "").trim();
  const deviceToken = (process.env.RESTOS_DEVICE_TOKEN ?? "").trim();
  if (cloudUrl === "" || deviceToken === "") {
    throw new Error(
      "06-F36: the storefront has no way to deliver an order to the branch — set " +
        "RESTOS_CLOUD_URL and RESTOS_DEVICE_TOKEN (mint one with `pnpm -C services/sync-gateway " +
        "provision-device --class storefront_cloud`). Refused at boot rather than accepting " +
        "orders into an outbox nothing drains, which is the defect 06-F36 exists to close.",
    );
  }

  const durable = await createPostgresOutbox({ database_url: databaseUrl, identity });
  const uplink = createUplink({
    identity,
    outbox: durable.outbox,
    transport: createWsCloudTransport({ url: cloudUrl, clock: wallClock }),
    token: deviceToken,
    report: (line) => console.error(line),
  });
  /**
   * `06-F36` (e) — **THE SEAM. A drain with no wake runs at connect and never again.**
   *
   * `apps/pos-electron` shipped exactly that: `CloudSession.notifyAppended` with zero production
   * callers, five events durably appended, the gateway's ledger at 0 rows, and the whole
   * replication path correct with nothing to trigger it. Deleting this ONE line leaves every
   * assertion about envelope content, durability and the wire green. `server-seam.test.ts` §E is
   * what reddens.
   */
  durable.onPut(() => uplink.notifyAppended());
  uplink.start();

  const server = createStorefrontServer({
    outbox: durable.outbox,
    entitlement: developmentEntitlement(identity),
    catalog: createGatewayCatalog(link, identity),
    lamport: durable.lamport,
    port: Number(process.env.PORT ?? 0),
  });
  await server.listen();

  // `00 §5.7` and `services/sync-gateway`'s precedent: the schema state is a line a human reads
  // while bringing the stack up, rather than a 500 later and somewhere else.
  const schema = await pendingMigrations(databaseUrl).catch(() => null);
  console.log(
    schema === null
      ? `storefront: ⚠ outbox database UNREACHABLE at ${redactedDsn(databaseUrl)} — orders are ` +
          `REFUSED until it is back (06-N5: never a fake success)`
      : schema.pending === 0
        ? `storefront: outbox schema up to date — all ${schema.total} migrations applied · ` +
          `${redactedDsn(databaseUrl)}`
        : `storefront: ⚠ outbox schema NOT MIGRATED — ${schema.pending} of ${schema.total} ` +
          `migrations unapplied. Run \`pnpm -C services/storefront migrate\``,
  );
  console.log(
    `storefront: uplink dialling ${cloudUrl} (06-F36 — push-only, holds no branch slice)`,
  );
}
