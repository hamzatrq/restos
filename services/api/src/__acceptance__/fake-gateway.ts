/**
 * A REAL HTTP server speaking `sync-gateway`'s `/internal` publish contract, over a real loopback
 * socket, recording every request body it receives.
 *
 * **Why a real socket and not a stubbed `fetch`.** The thing under test is an *adapter* — the
 * question it exists to answer is "did an HTTP request actually leave this process, carrying the
 * right bytes, with the right credential". A function-level `fetch` double answers a different
 * question (did we call a function we ourselves injected) and would keep passing after the URL,
 * the method, the header or the serialization broke. It is also the reason `GatewayLink` has no
 * `fetch` member: an injection point nothing in production supplies is the "unsupplied optional
 * seam" `pnpm seams:check` was built for.
 *
 * **What this fake does NOT do, deliberately: enforce `01-F60`.** It stores what it is given, the
 * same way `createMemoryCatalogPublisher` does and for the same recorded reason — the completeness
 * check belongs to the real writer, and a second copy here would let the suite pass on this file's
 * opinion of the rule. The real refusal is asserted against real Postgres in
 * `services/sync-gateway/src/__acceptance__/catalog-publish-http.test.ts`; what is asserted HERE
 * is that the refusal reaches the owner, driven by `refuseWith` below.
 */

import { createServer, type Server } from "node:http";
import type { EnabledPairs } from "../catalog.js";
import {
  createMemoryCatalogPublisher,
  createMemoryLedgerAppender,
  type LedgerRecord,
} from "../publish.js";

export type Recorded = { readonly path: string; readonly body: unknown };

export type FakeGateway = {
  readonly url: string;
  readonly token: string;
  /** Every `/internal` request that got past the credential check, in arrival order. */
  readonly received: readonly Recorded[];
  /** Publishes recorded on this org, newest last — the "did the menu actually ship" question. */
  publishes(): readonly { org_id: string; entries: readonly unknown[]; enabled: unknown }[];
  /** `01-F62` org-scoped appends recorded, in arrival order. */
  orgEvents(): readonly { org_id: string; type: string; payload: unknown }[];
  /** Make the next N responses on `path` a refusal, to drive the adapter's error path. */
  refuseWith(path: string, status: number, message: string): void;
  close(): Promise<void>;
};

const TOKEN = "fake-gateway-service-credential-at-least-32-bytes-long";

export const startFakeGateway = async (): Promise<FakeGateway> => {
  const publisher = createMemoryCatalogPublisher();
  const ledger = createMemoryLedgerAppender();
  const received: Recorded[] = [];
  const refusals = new Map<string, { status: number; message: string }>();

  const server: Server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const send = (status: number, body: unknown): void => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };

      if (req.headers.authorization !== `Bearer ${TOKEN}`) {
        send(401, { error: "unauthorized" });
        return;
      }

      const refusal = refusals.get(url.pathname);
      if (refusal !== undefined) {
        refusals.delete(url.pathname);
        send(refusal.status, { error: refusal.message });
        return;
      }

      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const raw = Buffer.concat(chunks).toString("utf8");
      const body: unknown = raw === "" ? null : JSON.parse(raw);
      received.push({ path: url.pathname, body });

      const org_id = url.searchParams.get("org_id") ?? "";
      if (req.method === "POST" && url.pathname === "/internal/catalog/publish") {
        const input = body as {
          org_id: string;
          entries: never[];
          actor_user_id: string | null;
          now: number;
          // The port's own type, not a hand-copy of its shape: `channels` became `02-F42`'s
          // closed set when `catalog.enabled` put `EnabledPairs` on the wire, and a restated
          // `string[]` here would have gone on compiling against a contract that had moved.
          enabled: EnabledPairs;
        };
        send(200, {
          version: await publisher.publish(input.org_id, input.entries, {
            actor_user_id: input.actor_user_id,
            now: input.now,
            enabled: input.enabled,
          }),
        });
        return;
      }
      if (req.method === "GET" && url.pathname === "/internal/catalog/published") {
        send(200, await publisher.published(org_id));
        return;
      }
      if (req.method === "POST" && url.pathname === "/internal/org-events") {
        // Stored as SENT, `type` included — the org-scoped store holds `01-F62`'s whole set, and
        // an adapter that read it back unfiltered would put a `device.registered` row into
        // `14-F3`'s price history. Forcing the type here would hide exactly that.
        //
        // The `01-F62` scope REFUSAL is the real gateway's (`appendOrgEvent`), asserted against
        // real Postgres in its own suite; duplicating it here would make this suite pass on this
        // file's opinion of the rule.
        await ledger.append(body as LedgerRecord);
        send(200, {});
        return;
      }
      if (req.method === "GET" && url.pathname === "/internal/org-events") {
        send(200, { events: await ledger.history(org_id) });
        return;
      }
      send(404, { error: `no route ${req.method ?? "?"} ${url.pathname}` });
    })().catch((error: unknown) => {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: String(error) }));
    });
  });

  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("fake gateway did not bind");

  return {
    url: `http://127.0.0.1:${address.port}`,
    token: TOKEN,
    received,
    publishes: () =>
      received
        .filter((entry) => entry.path === "/internal/catalog/publish")
        .map((entry) => entry.body as { org_id: string; entries: unknown[]; enabled: unknown }),
    orgEvents: () =>
      received
        .filter((entry) => entry.path === "/internal/org-events" && entry.body !== null)
        .map((entry) => entry.body as { org_id: string; type: string; payload: unknown }),
    refuseWith: (path, status, message) => {
      refusals.set(path, { status, message });
    },
    close: () =>
      new Promise<void>((done, fail) => {
        server.close((error) => (error === undefined ? done() : fail(error)));
      }),
  };
};
