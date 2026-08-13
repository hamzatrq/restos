// T-01-07 thin socket adapter (in scope, NOT acceptance-gated — boot-smoke only;
// real-socket behavior is H-01-D's D2 rung). 18 §5 stack: Fastify +
// @fastify/websocket with pino logging; env via the packages/config defineEnv
// factory (crash at boot on invalid env). The wire codec lives HERE — the
// gateway core is transport-free: frame → decodeMessage → conn.handle; sink →
// encodeMessage → socket.send; decode/handle errors → log + socket close
// (no error wire kind exists in the closed PROTOCOL.md set, assumption 10).
import { pathToFileURL } from "node:url";
import websocket from "@fastify/websocket";
import { defineEnv, redactedDsn } from "@restos/config";
import { createFrameCodec } from "@restos/sync-protocol";
import { drizzle } from "drizzle-orm/postgres-js";
import Fastify, { type FastifyInstance } from "fastify";
import { DATABASE_URL_DEFAULT } from "./database-url.js";
import { createGateway, REVOCATION_SWEEP_INTERVAL_MS } from "./gateway.js";
import { pendingMigrations } from "./migrate.js";
import { registerPublishRoutes } from "./publish-http.js";

export const buildServer = (
  databaseUrl: string,
  tokenSecret: string,
  issuer?: string,
  audience?: string,
  /**
   * The `/internal` publish credential (`plans/wave-1/catalog-transport.md` §6 Q1 — the API
   * publishes, the gateway serves). `undefined` means the deployment declared none, and every
   * `/internal` route then answers 503: fail-closed, so an unconfigured gateway cannot be handed a
   * menu by anyone who can reach the port. See `registerPublishRoutes`.
   */
  publishSecret?: string,
): FastifyInstance => {
  const app = Fastify({ logger: true });
  const db = drizzle(databaseUrl);
  // The real clock is injected at the composition root only (18 §4); the
  // device-token verification key arrives here from env (T-01-09, 18 §5).
  const gateway = createGateway({
    db,
    clock: { now: () => Date.now() },
    // issuer/audience bind tokens to THIS deployment (01-F47). Adversarial-review B3:
    // the gateway supported them and the composition root never passed them, so a
    // staging token validated against production — the capability existed and the
    // shipped artifact did not exhibit it.
    auth: {
      token_secret: tokenSecret,
      ...(issuer === undefined ? {} : { issuer }),
      ...(audience === undefined ? {} : { audience }),
    },
  });

  // 01-F48 / DEC-AUTH-002: the ≤30 s eviction bound is a property of the RUNNING
  // server, not of an exported method. Adversarial-review B3: `sweepRevocations` was
  // called by nothing outside tests, so revocation still waited for the device's next
  // voluntary contact — exactly the defect the decision exists to close. Errors are
  // swallowed per tick (the sweep is itself fail-closed internally) so a transient DB
  // fault cannot kill the timer and silently retire the guarantee.
  const sweep = setInterval(() => {
    void gateway.sweepRevocations().catch((error: unknown) => {
      app.log.error({ err: error }, "revocation sweep failed (01-F48); retrying next tick");
    });
  }, REVOCATION_SWEEP_INTERVAL_MS);
  sweep.unref();

  // The back office's publish surface (`01-F52` "edited only via back office"; `01-F62` for the
  // audit half). It is registered on the SAME Fastify instance as `/sync` on purpose: the founder
  // ruling is that this service is the one writer of the catalog tables (`18 §4`), and a second
  // process writing them would be the coupling the ruling exists to prevent, one hop further out.
  // `notifyCatalogVersion` is THE seam that was missing: the method existed, was tested, and had
  // no production caller, so a menu published while a till was connected reached it only on the
  // till's next reconnect (`plans/wave-1/catalog-transport.md` T-C3). Passing the gateway's method
  // rather than the gateway keeps this module the only thing that knows a gateway exists.
  registerPublishRoutes(app, {
    db,
    publishSecret,
    notifyCatalogVersion: (org_id, version) => {
      gateway.notifyCatalogVersion(org_id, version);
    },
  });

  void app.register(websocket);
  void app.register(async (instance) => {
    instance.get("/sync", { websocket: true }, (socket) => {
      // PER-CONNECTION framing (DEC-SYNC-010, T-01-19). One codec per live socket,
      // starting plain and upgraded only when this connection's hello_ack actually
      // grants it — so the wire format follows the handshake, never the frame.
      let codec = createFrameCodec(undefined);
      const conn = gateway.connect(
        (message) => {
          // Adopt AFTER sending the ack: the ack itself must cross plain, because the
          // client's decoder is still plain when it arrives.
          const frame = codec.encode(message);
          socket.send(frame);
          if (message.kind === "hello_ack" && message.compression !== undefined) {
            codec = createFrameCodec(message.compression);
          }
        },
        // 01-F48: an eviction the peer cannot observe is not a refusal. Closing the
        // socket is what makes the device notice and reconnect (where it will be
        // refused at hello, or purged).
        () => {
          socket.close();
        },
      );
      socket.on("message", (raw: Buffer, isBinary: boolean) => {
        // The transport's own text/binary distinction carries the framing. Passing
        // everything as text (the previous `raw.toString("utf8")`) would make a
        // compressed frame indistinguishable from mojibake and force magic-number
        // sniffing, which DEC-SYNC-010 forbids.
        const frame: string | Uint8Array = isBinary ? new Uint8Array(raw) : raw.toString("utf8");
        void (async () => conn.handle(codec.decode(frame)))().catch((error: unknown) => {
          instance.log.error({ err: error }, "sync session terminated (decode/handle error)");
          conn.close();
          socket.close();
        });
      });
      socket.on("close", () => {
        conn.close();
      });
    });
  });

  app.addHook("onClose", async () => {
    clearInterval(sweep);
    await gateway.close();
    await db.$client.end({ timeout: 5 });
  });
  return app;
};

/**
 * **The boot lines' prefixes, exported so `__acceptance__/startable.test.ts` matches THESE strings
 * rather than hand-copies of them.** A copied literal is how an oracle ends up asserting against a
 * symbol nobody ships (round-3 law, `K-3`): rename a message and a copy keeps passing against a
 * server that no longer says it.
 *
 * `LISTENING_PREFIX` is load-bearing and not decoration: the startability test spawns the declared
 * `start` script with `PORT=0`, so the port the process actually got is knowable ONLY from this
 * line. Fastify's own pino line says the same thing in JSON; this one is the contract.
 */
export const LISTENING_PREFIX = "@restos/sync-gateway listening on ";

/** Which database this process will use — see `DATABASE_URL_DEFAULT` for why it is printed. */
export const DATABASE_PREFIX = "@restos/sync-gateway database ";

/** Whether `/internal` can accept a menu at all — see `PUBLISH_TOKEN` for why it is printed. */
export const PUBLISH_PREFIX = "@restos/sync-gateway publish surface ";

/**
 * Whether the database this process will use has had this build's migrations applied.
 *
 * **The fourth question that cost real time when it had no answer, and the one with teeth.**
 * `applyMigrations` had no runnable caller at all — no migrate script existed anywhere in the repo
 * — so a gateway pointed at an unmigrated database booted perfectly, printed three healthy lines,
 * and then answered `500` on the first request that needed a table, in *another service's* logs.
 *
 * The state is REPORTED, never acted on. Migration stays a separate deliberate act (`migrate.ts`):
 * a service that migrates its own database on boot races its own replicas, and this service's own
 * precedent for a missing dependency is `PUBLISH_TOKEN` — fail-closed, said plainly at boot, and
 * never a reason to crash the till's sync over a deploy-time concern. `00 §5.7`: the surface
 * reports what is true rather than presenting a database it cannot serve from as ready.
 */
export const SCHEMA_PREFIX = "@restos/sync-gateway schema ";

export const start = async (): Promise<FastifyInstance> => {
  const env = defineEnv({
    DATABASE_URL: (raw) => (raw === undefined || raw === "" ? DATABASE_URL_DEFAULT : raw),
    DEVICE_TOKEN_SECRET: (raw) => {
      // T-01-09: the HS256 device-token verification key (18 §5). Required —
      // the gateway cannot authenticate anyone without it (crash at boot).
      if (raw === undefined || raw === "") throw new Error("required (device-token HS256 secret)");
      // T-01-09 fix round F2: every signature 01-F27 trusts is only as strong
      // as this symmetric key — under 32 bytes is rejected at boot (18 §5).
      if (Buffer.byteLength(raw, "utf8") < 32) {
        throw new Error("must be at least 32 bytes (HS256 device-token verification key, 18 §5)");
      }
      return raw;
    },
    // 01-F47 deployment binding. OPTIONAL, not required: an unbound deployment must
    // keep working (verifyDeviceToken checks each only when configured), and making
    // them mandatory would break every existing environment at boot. Setting them is
    // what stops a token minted for staging validating against production.
    DEVICE_TOKEN_ISSUER: (raw) => (raw === undefined || raw === "" ? undefined : raw),
    DEVICE_TOKEN_AUDIENCE: (raw) => (raw === undefined || raw === "" ? undefined : raw),
    /**
     * The `/internal` publish credential `services/api` presents (founder ruling: the API
     * publishes, the gateway serves).
     *
     * **OPTIONAL, and absent is fail-CLOSED** — every `/internal` route answers 503, so a gateway
     * that was never told the credential accepts no menu at all rather than accepting one from
     * anyone. Not required at boot for the same reason `DEVICE_TOKEN_ISSUER` is not: a gateway with
     * no back office deployed beside it is a legitimate deployment, and crashing it at boot would
     * take the till's sync down to enforce a back-office concern. The loud failure lands where the
     * mistake is — `services/api` gets a 503 naming this key.
     *
     * The 32-byte floor is `DEVICE_TOKEN_SECRET`'s, for the same reason (`18 §5`): this credential
     * is the ONLY thing standing between a reachable port and the org's menu.
     */
    PUBLISH_TOKEN: (raw) => {
      if (raw === undefined || raw === "") return undefined;
      if (Buffer.byteLength(raw, "utf8") < 32) {
        throw new Error("must be at least 32 bytes (the /internal publish credential, 18 §5)");
      }
      return raw;
    },
    /**
     * `0` is legal and means "bind an ephemeral port", which is what `startable.test.ts` uses: with
     * a fixed port the test knows where the server is without reading anything the server said, and
     * the boot line stops being load-bearing. The alternative it replaced — bind a port, release
     * it, hand the number to the child — races anything else on the machine in the gap. Everything
     * outside `0..65535` is still a boot crash (`18 §5`); `services/api`'s `PORT` has always
     * accepted `0` for the same reason.
     */
    PORT: (raw) => {
      const port = Number(raw ?? "8080");
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new Error(`not a valid port: ${String(raw)}`);
      }
      return port;
    },
  });
  const app = buildServer(
    env.DATABASE_URL,
    env.DEVICE_TOKEN_SECRET,
    env.DEVICE_TOKEN_ISSUER,
    env.DEVICE_TOKEN_AUDIENCE,
    env.PUBLISH_TOKEN,
  );
  const address = await app.listen({ port: env.PORT, host: "0.0.0.0" });
  // Three facts, and each one is a question that cost real time when it had no answer. WHERE it is
  // listening (with `PORT=0` this is the only place the port exists). WHICH database it will reach
  // for — lazily, so this line is printed long before anything proves the address is reachable.
  // And WHETHER `/internal` can accept a menu at all: `PUBLISH_TOKEN` absent is fail-closed, and
  // without this line that shows up only as a 503 in another service's logs.
  console.log(`${LISTENING_PREFIX}${address}`);
  console.log(
    `${DATABASE_PREFIX}${redactedDsn(env.DATABASE_URL)} (opened lazily — an unreachable database ` +
      `surfaces on the first request that needs one, never at boot)`,
  );
  console.log(
    `${PUBLISH_PREFIX}${
      env.PUBLISH_TOKEN === undefined
        ? "DISABLED — no PUBLISH_TOKEN, so every /internal route answers 503 (fail-closed). " +
          "services/api cannot publish a menu to this gateway until it is set on both sides."
        : "enabled (PUBLISH_TOKEN configured)"
    }`,
  );
  // AFTER `listen`, and deliberately not awaited. The other three lines are facts this process
  // already holds; this one needs a round trip to a database that may not answer, and the whole
  // point of `DATABASE_URL_DEFAULT` is that an unreachable database is never a boot failure and
  // never a boot HANG — an unroutable host waits out `postgres-js`'s 30 s connect timeout, so
  // awaiting this would trade a fast boot for exactly the stall the lazy connection avoids.
  void pendingMigrations(env.DATABASE_URL)
    .then(({ pending, total }) => {
      console.log(
        `${SCHEMA_PREFIX}${
          pending === 0
            ? `up to date — all ${String(total)} migrations applied`
            : `NOT MIGRATED — ${String(pending)} of ${String(total)} migrations are unapplied. ` +
              "Run `pnpm -C services/sync-gateway migrate`; until then every request that needs a " +
              "missing table answers 500."
        }`,
      );
    })
    .catch((error: unknown) => {
      // The database could not be read at all — the same fault a request would hit, which names
      // itself precisely in that 500. Only the top message and its direct cause are printed:
      // `DrizzleQueryError.message` is the SQL, and the `ECONNREFUSED` that explains it is one
      // `cause` deeper. Nothing here prints the DSN — `startable.test.ts` asserts the password
      // never reaches stdout, and that assertion now covers this line too.
      // One LINE: the failing query is a multi-line template, and a boot line that wraps into
      // three is one an operator scrolls past.
      const flat = (text: string): string => text.replace(/\s+/g, " ").trim();
      const top = flat(error instanceof Error ? error.message : String(error));
      const cause =
        error instanceof Error && error.cause instanceof Error ? flat(error.cause.message) : "";
      console.log(
        `${SCHEMA_PREFIX}could not be checked — the database did not answer ` +
          `(${cause === "" ? top : `${top} ← ${cause}`}). See the database line above.`,
      );
    });
  return app;
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  start().catch((error: unknown) => {
    // Crash at boot on invalid env / failed bind (18 §5) — loud, never degraded.
    console.error(error);
    process.exit(1);
  });
}
