import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import Fastify from "fastify";
import { type Capability, type EntitlementSource, STOREFRONT_CAPABILITY } from "./entitlement.js";
import { resolveOriginIdentity } from "./identity.js";
import { createStorefrontOrigin, type LamportSource } from "./origin.js";
import { inMemoryOutbox, type Outbox } from "./outbox.js";
import { createPlacement } from "./placement.js";
import { assertEveryProcedureDeclaresEntitlement, storefrontRouter } from "./router.js";

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
   * customer's order lost on the next restart. Making it required moves the failure to compile
   * time, which is the only place a rail can see it.
   */
  readonly outbox: Outbox;
  readonly entitlement: EntitlementSource;
  readonly lamport: LamportSource;
};

export const createStorefrontServer = (options: ServerOptions) => {
  // Refuse to build a host at all if any procedure names no capability (`06-F32` (i)).
  assertEveryProcedureDeclaresEntitlement(storefrontRouter);

  const identity = resolveOriginIdentity(process.env);
  const origin = createStorefrontOrigin({
    identity,
    lamport: options.lamport,
    clock: () => Date.now(),
    newId: () => randomUUID(),
  });
  const placement = createPlacement({
    origin,
    outbox: options.outbox,
    entitlement: options.entitlement,
  });

  const app = Fastify({ logger: false });
  app.get("/health", async () => ({ ok: true }));

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
          `(class ${identity.device_class}, 06-F31 clock permanently branch_provisional) on :${port}`,
      );
      return port;
    },
    close: () => app.close(),
  };
};

/**
 * A start path that runs. ⚠ It supplies the IN-MEMORY outbox and a process-local lamport counter,
 * and it says so on stderr every time, because `06-F30`'s durable half and its single-writer
 * advisory lock are **owed**. This is a development host: a real deployment must pass the
 * Postgres outbox, and the warning is here rather than in a doc because AGENTS.md `L11` records
 * what a protection claimed in prose does to the next reader.
 */
const devEntitlement: EntitlementSource = async (org_id) =>
  org_id === process.env.RESTOS_ORG_ID
    ? { capabilities: new Set<Capability>([STOREFRONT_CAPABILITY]) }
    : null;

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error(
    "storefront: ⚠ DEV HOST — in-memory outbox and a process-local lamport counter. 06-F30's " +
      "durable outbox and its per-(org,branch) advisory lock are OWED; do not deploy this. " +
      "A restart loses every order this process accepted.",
  );
  let next = 0;
  const lamport: LamportSource = {
    reserve: async (count) => {
      const first = next;
      next += count;
      return first;
    },
  };
  const server = createStorefrontServer({
    outbox: inMemoryOutbox(),
    entitlement: devEntitlement,
    lamport,
    port: Number(process.env.PORT ?? 0),
  });
  await server.listen();
}
