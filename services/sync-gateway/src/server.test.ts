// T-01-07 adapter boot smoke — the contract's "one boot smoke test at most".
// The adapter is NOT acceptance-gated (real-socket behavior is H-01-D's rung),
// so no FR is claimed here; this only proves the Fastify + @fastify/websocket
// composition boots against a real database URL and shuts down cleanly.
import { expect, it } from "vitest";
import { DATABASE_URL_ENV } from "./__acceptance__/global-setup.js";
import { TEST_TOKEN_SECRET } from "./__acceptance__/helpers.js";
import { buildServer } from "./server.js";

it("boot smoke: the Fastify adapter boots against the suite database and closes cleanly", async () => {
  const url = process.env[DATABASE_URL_ENV];
  if (url === undefined || url === "") {
    throw new Error(`[T-01-07] ${DATABASE_URL_ENV} not set — global setup did not run`);
  }
  const app = buildServer(url, TEST_TOKEN_SECRET);
  const address = await app.listen({ port: 0, host: "127.0.0.1" });
  expect(address).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  await app.close();
});
