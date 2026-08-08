/**
 * **`"fetch failed"` REACHED AN OPERATOR VERBATIM.**
 *
 * `catalog.published` and `catalog.history` proxy to `services/sync-gateway`. With the gateway
 * down, `fetch` rejects with Node's undici `TypeError` whose entire message is the string
 * `"fetch failed"`; tRPC normalises an unrecognised throw into `INTERNAL_SERVER_ERROR` and carries
 * that message through, and the back office renders exactly those two words. It is true of nothing
 * an operator can act on: not what failed, not whether it is their fault, not what to do.
 * `00 §5.7`'s honesty rule is not satisfied by a true-but-useless string, and `18 §5`'s taxonomy
 * already has the right slot — `IntegrationError` (external system, retriable flag).
 *
 * **What this file asserts, and the mutant each assertion owns.** Every test below is written so
 * that it fails for exactly one reason:
 *
 *   1. the failure is not `INTERNAL_SERVER_ERROR` — mutant: map it back to a 500
 *   2. the message names the DEPENDENCY — mutant: drop the name from the sentence
 *   3. the message is not `"fetch failed"` and does not reduce to it — mutant: rethrow the raw error
 *   4. the retriable flag reaches the client as DATA — mutant: stop lifting it in `errorFormatter`
 *   5. the underlying cause survives — mutant: `new Error(nice)` with no `cause` (`24-F15`)
 *   6. a peer REFUSAL is untouched — mutant: wrap every gateway error as infrastructure, which
 *      would tell an owner to wait out an outage while `01-F60` waits for them to fix a price
 *
 * Assertion 6 is the control this file needs most: without it, "map transport failures" is
 * indistinguishable from "map every gateway error", and the second is worse than the bug.
 */

import { createServer, type Server } from "node:http";
import { hashPin } from "@restos/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMemoryStagedEditStore } from "../catalog.js";
import { IntegrationError } from "../errors.js";
import { createGatewayCatalogPublisher, createGatewayLedgerAppender } from "../gateway-client.js";
import { createApiServer } from "../server.js";
import { createMemoryUserStore } from "../users.js";

const ORG = "org-unreachable";
const EMAIL = "owner@unreachable.test";
const PASSWORD = "an-owner-password-for-the-unreachable-suite";
const SECRET = "gateway-unreachable-acceptance-session-secret";

/**
 * A port with nothing behind it. Bound and released, so the number is real and the connection is
 * refused rather than routed somewhere unrelated — an arbitrary constant risks colliding with a
 * service the developer happens to be running, which would turn this suite green for the wrong
 * reason.
 */
const closedPort = async (): Promise<number> => {
  const probe = createServer();
  await new Promise<void>((done) => probe.listen(0, "127.0.0.1", done));
  const address = probe.address();
  if (address === null || typeof address === "string") throw new Error("no ephemeral port");
  await new Promise<void>((done, fail) => {
    probe.close((error) => (error === undefined ? done() : fail(error)));
  });
  return address.port;
};

/** A gateway that IS reachable and answers `400` with `01-F60`'s message — the control peer. */
const startRefusingGateway = async (
  message: string,
): Promise<{ url: string; close: () => Promise<void> }> => {
  const server: Server = createServer((_req, res) => {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: message }));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("refusing gateway not bound");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((done, fail) => {
        server.close((error) => (error === undefined ? done() : fail(error)));
      }),
  };
};

const TOKEN = "a-service-credential-of-at-least-thirty-two-bytes";

type Injected = { status: number; body: Record<string, unknown> };

describe("an unreachable sync gateway is an IntegrationError, not `fetch failed` (00 §5.7, 18 §5)", () => {
  let deadUrl: string;

  beforeAll(async () => {
    deadUrl = `http://127.0.0.1:${await closedPort()}`;
  });

  describe("the adapter (`gateway-client.ts`) — where the transport failure is named", () => {
    it("raises an IntegrationError naming the dependency, flagged retriable, with the cause kept", async () => {
      const publisher = createGatewayCatalogPublisher({ base_url: deadUrl, token: TOKEN });

      const raised: unknown = await publisher.published(ORG).then(
        () => null,
        (error: unknown) => error,
      );

      // 1 + 2: the taxonomy slot, and the dependency named in the sentence a human reads.
      expect(raised).toBeInstanceOf(IntegrationError);
      const error = raised as IntegrationError;
      expect(error.dependency).toBe("sync gateway");
      expect(error.message).toContain("sync gateway");
      // The ADDRESS, because "which gateway" is the next question after "which dependency", and a
      // three-process stack has exactly one wrong answer to it.
      expect(error.message).toContain(deadUrl);

      // 3: the raw string is not what an operator is handed. `not.toBe` alone would pass on a
      // message that merely appended a period to it, so the assertion is about substance.
      expect(error.message).not.toBe("fetch failed");
      expect(error.message.length).toBeGreaterThan(80);
      // It says the state is infrastructural rather than a rejected edit — the distinction the
      // operator actually needs in order to stop looking for a typo.
      expect(error.message).toMatch(/infrastructure state/i);

      // 4: the flag, as a property rather than a phrase.
      expect(error.retriable).toBe(true);

      // 5 (`24-F15`): the diagnosis is carried, not swallowed. `fetch failed` is now INSIDE the
      // cause chain, where it belongs, and the real reason is one link deeper.
      const cause = error.cause;
      expect(cause).toBeInstanceOf(Error);
      expect((cause as Error).message).toBe("fetch failed");
      expect(error.message).toContain("ECONNREFUSED");
    });

    it("does the same for the ledger read `14-F3` renders (both proxied procedures, not one)", async () => {
      const ledger = createGatewayLedgerAppender({ base_url: deadUrl, token: TOKEN });
      const raised: unknown = await ledger.history(ORG).then(
        () => null,
        (error: unknown) => error,
      );
      expect(raised).toBeInstanceOf(IntegrationError);
      expect((raised as IntegrationError).message).toContain("sync gateway");
    });

    it("writes are covered too — a publish that never left the process says so", async () => {
      const publisher = createGatewayCatalogPublisher({ base_url: deadUrl, token: TOKEN });
      const raised: unknown = await publisher
        .publish(ORG, [], { actor_user_id: null, now: 1, enabled: { branches: [], channels: [] } })
        .then(
          () => null,
          (error: unknown) => error,
        );
      expect(raised).toBeInstanceOf(IntegrationError);
      // "Nothing was changed" is a claim this path is entitled to make and the 500 was not.
      expect((raised as IntegrationError).message).toMatch(/nothing was changed/i);
    });

    /**
     * **THE CONTROL.** A gateway that ANSWERS and says no is not an outage. `01-F60`'s refusal is
     * the one actionable error in this path and it must reach the owner unchanged — an
     * implementation that wrapped every gateway error as infrastructure would pass every assertion
     * above and fail this one alone.
     */
    it("leaves a peer REFUSAL alone — a 400 is the owner's business, not an infrastructure state", async () => {
      const detail =
        "entry 3 (item/biryani) is not sellable — no price for branch b1, channel foodpanda";
      const peer = await startRefusingGateway(detail);
      try {
        const publisher = createGatewayCatalogPublisher({ base_url: peer.url, token: TOKEN });
        const raised: unknown = await publisher.published(ORG).then(
          () => null,
          (error: unknown) => error,
        );
        expect(raised).toBeInstanceOf(Error);
        expect(raised).not.toBeInstanceOf(IntegrationError);
        expect((raised as Error).message).toContain(detail);
        expect((raised as Error).message).not.toMatch(/infrastructure state/i);
      } finally {
        await peer.close();
      }
    });
  });

  describe("the API boundary (`trpc.ts`) — what the back office actually receives", () => {
    let app: Awaited<ReturnType<typeof createApiServer>>;
    let token: string;

    beforeAll(async () => {
      const link = { base_url: deadUrl, token: TOKEN };
      app = await createApiServer({
        store: createMemoryUserStore([
          {
            user_id: `owner:${ORG}`,
            org_id: ORG,
            email: EMAIL,
            password_hash: await hashPin(PASSWORD),
            assignments: [{ role: "owner", branch_id: null }],
          },
        ]),
        sessionSecret: SECRET,
        now: () => 1_760_000_000_000,
        catalog: {
          staged: createMemoryStagedEditStore(),
          publisher: createGatewayCatalogPublisher(link),
          ledger: createGatewayLedgerAppender(link),
          enabled: { branches: ["b1"], channels: ["counter"] },
          now: () => 1_760_000_000_000,
          cutover_hour: 5,
        },
      });

      const login = await app.inject({
        method: "POST",
        url: "/trpc/auth.login",
        payload: { json: { email: EMAIL, password: PASSWORD } },
      });
      token = (JSON.parse(login.body) as { result: { data: { json: { token: string } } } }).result
        .data.json.token;
      // No per-hook timeout: this inherits `vitest.config.ts`'s 120 s `hookTimeout`, and the 30 s
      // override that used to sit here is why the package went red in a full `pnpm test --force
      // --continue` on 2026-08-08 while passing 137/137 alone. This hook pays `01-F61`'s Argon2id
      // cost TWICE — once hashing the fixture owner, once logging in — and under nine sibling
      // packages competing for cores that exceeded 30 s. It is the same measured failure the
      // config header already documents for `startable.test.ts` (62 s against a 60 s budget),
      // which is why the package budget is 120 s; a local override silently opted back out of it.
      // Nothing is weakened: no assertion changed, and a hook that genuinely hangs still fails.
    });

    afterAll(async () => {
      await app?.close();
    });

    const call = async (procedure: string): Promise<Injected> => {
      const res = await app.inject({
        method: "GET",
        url: `/trpc/${procedure}`,
        headers: { authorization: `Bearer ${token}` },
      });
      return { status: res.statusCode, body: JSON.parse(res.body) as Record<string, unknown> };
    };

    const errorOf = (
      body: Record<string, unknown>,
    ): { message: string; data: Record<string, unknown> } => {
      const json = (body.error as { json?: { message?: string; data?: Record<string, unknown> } })
        .json;
      return { message: json?.message ?? "", data: json?.data ?? {} };
    };

    it("catalog.published answers SERVICE_UNAVAILABLE, not INTERNAL_SERVER_ERROR", async () => {
      const rpc = await call("catalog.published");
      // HTTP 503 is what a retry policy reads; the code is what a client reads. Both, because the
      // mutant that matters here restores a 500 and a 500 says THIS service is broken.
      expect(rpc.status).toBe(503);
      const { data } = errorOf(rpc.body);
      expect(data.code).toBe("SERVICE_UNAVAILABLE");
      expect(data.code).not.toBe("INTERNAL_SERVER_ERROR");
    });

    it("the operator's sentence names the dependency and is not `fetch failed`", async () => {
      const { message } = errorOf((await call("catalog.published")).body);
      expect(message).not.toBe("fetch failed");
      expect(message).toContain("sync gateway");
      expect(message).toContain(deadUrl);
      expect(message).toMatch(/infrastructure state/i);
    });

    it("carries `retriable` and the dependency as DATA, so no client parses the sentence", async () => {
      const { data } = errorOf((await call("catalog.published")).body);
      expect(data.integration).toEqual({ dependency: "sync gateway", retriable: true });
    });

    it("catalog.history — the other proxied read — behaves identically", async () => {
      const rpc = await call("catalog.history");
      expect(rpc.status).toBe(503);
      const { message, data } = errorOf(rpc.body);
      expect(data.code).toBe("SERVICE_UNAVAILABLE");
      expect(message).toContain("sync gateway");
    });

    /**
     * The boundary must not have become a blanket catch. `catalog.pending` reads the in-memory
     * staging store and touches no peer at all; if it started answering 503 the middleware would be
     * mapping something it has no business mapping.
     */
    it("does not touch a procedure that never leaves the process", async () => {
      const rpc = await call("catalog.pending");
      expect(rpc.status).toBe(200);
    });

    /** And authorization refusals keep their own code and their own lifted data (`02-F20`). */
    it("leaves the authz refusal shape intact — the other errorFormatter branch still fires", async () => {
      const res = await app.inject({ method: "GET", url: "/trpc/catalog.published" });
      const { data } = errorOf(JSON.parse(res.body) as Record<string, unknown>);
      expect(data.code).toBe("UNAUTHORIZED");
      expect(data.integration).toBeUndefined();
    });
  });
});
