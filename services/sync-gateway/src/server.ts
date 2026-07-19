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
import { decodeMessage, encodeMessage } from "@restos/sync-protocol";
import { drizzle } from "drizzle-orm/postgres-js";
import Fastify, { type FastifyInstance } from "fastify";
import { createGateway } from "./gateway.js";

export const buildServer = (databaseUrl: string): FastifyInstance => {
  const app = Fastify({ logger: true });
  const db = drizzle(databaseUrl);
  // The real clock is injected at the composition root only (18 §4).
  const gateway = createGateway({ db, clock: { now: () => Date.now() } });

  void app.register(websocket);
  void app.register(async (instance) => {
    instance.get("/sync", { websocket: true }, (socket) => {
      const conn = gateway.connect((message) => {
        socket.send(encodeMessage(message));
      });
      socket.on("message", (raw: Buffer) => {
        void (async () => conn.handle(decodeMessage(raw.toString("utf8"))))().catch(
          (error: unknown) => {
            instance.log.error({ err: error }, "sync session terminated (decode/handle error)");
            conn.close();
            socket.close();
          },
        );
      });
      socket.on("close", () => {
        conn.close();
      });
    });
  });

  app.addHook("onClose", async () => {
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
    PORT: (raw) => {
      const port = Number(raw ?? "8080");
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`not a valid port: ${String(raw)}`);
      }
      return port;
    },
  });
  const app = buildServer(env.DATABASE_URL);
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
