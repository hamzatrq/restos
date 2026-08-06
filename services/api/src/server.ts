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
import { type CreateFastifyContextOptions, fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import Fastify, { type FastifyInstance } from "fastify";
import { appRouter, assertEveryProcedureIsGated } from "./router.js";
import type { ApiContext } from "./trpc.js";
import { createMemoryUserStore, type UserRecord, type UserStore } from "./users.js";

export type ApiServerOptions = {
  readonly store: UserStore;
  readonly sessionSecret: string;
  /** Injected (`18 §4`). `main()` supplies the real one; the suite supplies a fixed instant. */
  readonly now: () => number;
};

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

  await app.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext: ({ req }: CreateFastifyContextOptions): ApiContext => ({
        store: options.store,
        sessionSecret: options.sessionSecret,
        now: options.now,
        bearer: bearerOf(req.headers.authorization),
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
  });

  const app = await createApiServer({
    store: createMemoryUserStore(bootstrapUsers(env)),
    sessionSecret: env.SESSION_SECRET,
    // The real clock, injected here and nowhere else (`18 §4`).
    now: () => Date.now(),
  });

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  return app;
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  start().catch((error: unknown) => {
    // Crash at boot on invalid env / failed bind (`18 §5`) — loud, never degraded.
    console.error(error);
    process.exit(1);
  });
}
