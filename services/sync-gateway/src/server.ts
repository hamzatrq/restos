// T-01-07 thin socket adapter (in scope, NOT acceptance-gated — boot-smoke only;
// real-socket behavior is H-01-D's D2 rung). 18 §5 stack: Fastify +
// @fastify/websocket with pino logging; env via the packages/config defineEnv
// factory (crash at boot on invalid env). The wire codec lives HERE — the
// gateway core is transport-free: frame → decodeMessage → conn.handle; sink →
// encodeMessage → socket.send; decode/handle errors → log + socket close
// (no error wire kind exists in the closed PROTOCOL.md set, assumption 10).
import { pathToFileURL } from "node:url";
import websocket from "@fastify/websocket";
import { defineEnv } from "@restos/config";
import { createFrameCodec } from "@restos/sync-protocol";
import { drizzle } from "drizzle-orm/postgres-js";
import Fastify, { type FastifyInstance } from "fastify";
import { createGateway, REVOCATION_SWEEP_INTERVAL_MS } from "./gateway.js";
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
  registerPublishRoutes(app, { db, publishSecret });

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

export const start = async (): Promise<FastifyInstance> => {
  const env = defineEnv({
    DATABASE_URL: (raw) => {
      if (raw === undefined || raw === "") throw new Error("required (postgres connection URL)");
      return raw;
    },
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
    PORT: (raw) => {
      const port = Number(raw ?? "8080");
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
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
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  return app;
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  start().catch((error: unknown) => {
    // Crash at boot on invalid env / failed bind (18 §5) — loud, never degraded.
    console.error(error);
    process.exit(1);
  });
}
