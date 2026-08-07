/**
 * **THE SEAM BETWEEN A PUBLISHED MENU AND A TILL.**
 *
 * `services/api` shipped B-3/B-4 with a working staged-edit store, `14-F28` day-end scheduling and
 * a publish path — all of it built against `CatalogPublisher` and `LedgerAppender` PORTS whose only
 * implementations were `createMemoryCatalogPublisher` and `createMemoryLedgerAppender`. So an owner
 * could author a menu, schedule it, watch it publish, read it back, and **nothing reached a
 * device.** Every gate was green. That is this wave's named defect (AGENTS.md: "a correct subsystem
 * with no seam to the product", nine instances) in its most product-visible form.
 *
 * The lesson of the prior instances is that the fix needs an **assertion aimed at the seam**, not
 * only a fix — and specifically that "mutate the SEAM, not the logic": delete the call site and see
 * whether anything reddens. So this file asks exactly one question and asks it out of process:
 *
 *   **when an owner saves a priced menu entry with `apply_when: "now"`, does an HTTP request
 *   carrying that entry actually arrive at the sync gateway?**
 *
 * It answers it by running the DECLARED `scripts.start` over a real socket against a real gateway
 * peer (`fake-gateway.ts` — a real HTTP server on loopback speaking the `/internal` contract), and
 * inspecting what that peer received. **The decisive mutant is `server.ts` swapping either port
 * back to its `createMemory*` stub**: the process still boots, still logs in, still answers
 * `catalog.published` with the entry it just saved, and still refuses unauthenticated requests —
 * and the gateway receives nothing. Only the assertions below can tell those two worlds apart.
 *
 * ⚠ **`testTimeout` is 30 s in `vitest.config.ts` and that is not slack** — this spawns a
 * subprocess and hashes a password at `01-F61`'s Argon2id floor.
 *
 * FRs: `01-F52` (catalog is reference data edited only via back office), `01-F60` (the price grid
 * this ships), `01-F62` (`catalog.changed` is org-scoped), `14-F3` (the history record),
 * `14-F28` (apply-now vs day-end). Founder ruling: `plans/wave-1/catalog-transport.md` §6 Q1.
 */

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { hashPin } from "@restos/domain";
import superjson from "superjson";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LISTENING_PREFIX } from "../server.js";
import { type FakeGateway, startFakeGateway } from "./fake-gateway.js";

const PKG_DIR = resolve(import.meta.dirname, "..", "..");

const ORG = "org-gateway-seam";
const EMAIL = "owner@gateway-seam.test";
const PASSWORD = "a-bootstrap-owner-password";
const SECRET = "gateway-seam-acceptance-session-secret-not-a-real-one";
const BRANCH = "branch-seam";

/**
 * `01-F60`'s grid, complete for the one enabled `(branch, channel)` pair. Complete on purpose: a
 * fixture that were incomplete could not distinguish "the publish never left" from "the publish
 * left and was refused", which is the `F60`-amendment trap the round-3 law records by name.
 */
const ENTRY = {
  kind: "item",
  id: "item-chicken-karahi",
  name: "Chicken Karahi",
  prices: [{ branch_id: BRANCH, channel: "counter", price_paisa: 145_000 }],
};

type Spawned = {
  readonly base: string;
  readonly kill: () => void;
  readonly exit: Promise<{ code: number | null; err: string }>;
};

const spawnStart = (
  script: string,
  env: Record<string, string | undefined>,
): { child: ReturnType<typeof spawn>; out: () => string; err: () => string } => {
  const child = spawn(script, {
    shell: true,
    cwd: PKG_DIR,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PATH: `${join(PKG_DIR, "node_modules", ".bin")}:${process.env.PATH ?? ""}`,
      PORT: "0",
      SESSION_SECRET: SECRET,
      ...env,
    } as NodeJS.ProcessEnv,
  });
  let out = "";
  let err = "";
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    out += chunk;
  });
  child.stderr?.on("data", (chunk: string) => {
    err += chunk;
  });
  return { child, out: () => out, err: () => err };
};

const startListening = async (
  script: string,
  env: Record<string, string | undefined>,
): Promise<Spawned> => {
  const { child, out, err } = spawnStart(script, env);
  const kill = (): void => {
    if (child.pid === undefined || child.exitCode !== null) return;
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  };
  const exit = new Promise<{ code: number | null; err: string }>((done) => {
    child.on("exit", (code) => done({ code, err: err() }));
  });
  const address = await new Promise<string>((done, fail) => {
    const timer = setTimeout(() => {
      kill();
      fail(new Error(`no boot line within 25 s.\nstdout:\n${out()}\nstderr:\n${err()}`));
    }, 25_000);
    child.stdout?.on("data", () => {
      const line = out()
        .split("\n")
        .find((candidate) => candidate.startsWith(LISTENING_PREFIX));
      if (line === undefined) return;
      clearTimeout(timer);
      done(line.slice(LISTENING_PREFIX.length).trim());
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      fail(new Error(`exited with ${String(code)} before listening.\nstderr:\n${err()}`));
    });
  });
  return { base: `http://127.0.0.1:${new URL(address).port}`, kill, exit };
};

type Rpc = { status: number; body: Record<string, unknown> };

const mutate = async (
  base: string,
  path: string,
  input: unknown,
  headers: Record<string, string> = {},
): Promise<Rpc> => {
  const res = await fetch(`${base}/trpc/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(superjson.serialize(input)),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

const query = async (base: string, path: string, headers: Record<string, string>): Promise<Rpc> => {
  const res = await fetch(`${base}/trpc/${path}`, { headers });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

const dataOf = (rpc: Rpc): unknown =>
  (rpc.body.result as { data?: { json?: unknown } } | undefined)?.data?.json;

describe("a published menu reaches the sync gateway (the seam, out of process)", () => {
  let gateway: FakeGateway;
  let running: Spawned;
  let script: string;
  let auth: Record<string, string>;

  beforeAll(async () => {
    const raw = await readFile(join(PKG_DIR, "package.json"), "utf8");
    const declared = (JSON.parse(raw) as { scripts?: Record<string, string> }).scripts?.start;
    if (declared === undefined) throw new Error("package.json declares no `start` script");
    script = declared;

    gateway = await startFakeGateway();
    running = await startListening(script, {
      BOOTSTRAP_OWNER_EMAIL: EMAIL,
      BOOTSTRAP_OWNER_PASSWORD_HASH: await hashPin(PASSWORD),
      BOOTSTRAP_ORG_ID: ORG,
      ENABLED_BRANCHES: BRANCH,
      ENABLED_CHANNELS: "counter",
      SYNC_GATEWAY_URL: gateway.url,
      SYNC_GATEWAY_TOKEN: gateway.token,
    });

    const login = await mutate(running.base, "auth.login", { email: EMAIL, password: PASSWORD });
    const { token } = dataOf(login) as { token: string };
    auth = { authorization: `Bearer ${token}` };
  }, 60_000);

  afterAll(async () => {
    running?.kill();
    await gateway?.close();
  });

  /**
   * THE assertion. Everything else in this file supports it.
   *
   * `apply_when: "now"` because `14-F28`'s other branch stages the edit and publishes nothing —
   * a test written against the default would assert "no request arrived" and pass under every
   * mutant there is.
   */
  it("puts the saved entry on the wire to the gateway (01-F52, 14-F28 apply-now)", async () => {
    const saved = await mutate(
      running.base,
      "catalog.save",
      { entry: ENTRY, apply_when: "now" },
      auth,
    );
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(dataOf(saved)).toMatchObject({ apply_when: "now", version: 1 });

    const publishes = gateway.publishes();
    expect(
      publishes.length,
      "the gateway received NO publish — the composition root is publishing into a stub, " +
        "which is exactly the defect this file exists to catch",
    ).toBe(1);

    const [published] = publishes as [{ org_id: string; entries: unknown[]; enabled: unknown }];
    expect(published.org_id).toBe(ORG);
    // The ENTRY, priced, byte-for-byte — not merely "a request happened". An adapter that posted
    // an empty body, or the entry with its price grid dropped, would satisfy a count assertion.
    expect(published.entries).toEqual([ENTRY]);
    // `01-F60`'s enabled set travels WITH the publish, because the completeness check is the
    // writer's guarantee and the writer cannot run it against a set it was not given.
    expect(published.enabled).toEqual({ branches: [BRANCH], channels: ["counter"] });
  });

  /**
   * `01-F62`'s half. The artifact and the audit record are two different writes to two different
   * stores, and a seam test that watched only the first would bless a back office whose `14-F3`
   * history was permanently empty.
   */
  it("appends the org-scoped catalog.changed beside it (01-F62, 14-F3)", () => {
    const events = gateway.orgEvents();
    expect(events.length, "no catalog.changed reached the org-scoped store").toBe(1);
    const [event] = events as [{ org_id: string; type: string; payload: unknown }];
    expect(event.type).toBe("catalog.changed");
    expect(event.org_id).toBe(ORG);
    expect(event.payload).toMatchObject({
      entity: "item",
      entity_id: ENTRY.id,
      version: 1,
      // `14-F3`'s "450 → 480": a brand-new entry has nothing to change FROM, so every cell reads
      // `null → price` and `before_ref` is null.
      before_ref: null,
      price_changes: [
        { branch_id: BRANCH, channel: "counter", before_paisa: null, after_paisa: 145_000 },
      ],
    });
    // `01-F62`: an org-scoped event carries NO branch fields. The rejected alternative (a) put a
    // server value into `branch_created_at`; nothing on the wire may reintroduce it.
    expect(Object.keys(event as object)).not.toContain("branch_id");
    expect(event.payload as object).not.toHaveProperty("branch_id");
  });

  /**
   * The round trip. `catalog.published` is what `14-F29`'s editor prefills from and what B-4 calls
   * for `before_ref` — reading it back THROUGH the adapter proves the read half is bound too, not
   * only the write half. A publisher whose `published` still pointed at a local `Map` would answer
   * this correctly from the wrong store, and the count check below is what separates them.
   */
  it("reads the published artifact back from the gateway, not from a local copy", async () => {
    const before = gateway.received.length;
    const published = await query(running.base, "catalog.published", auth);
    expect(published.status, JSON.stringify(published.body)).toBe(200);
    expect(dataOf(published)).toMatchObject({ version: 1, entries: [ENTRY] });
    expect(gateway.received.length, "the read never left the process").toBeGreaterThan(before);
  });

  /**
   * `01-F60`'s refusal has to reach the OWNER. The gateway is the writer and therefore the
   * authority; an adapter that swallowed a 400 into "publish failed" would throw away the only
   * actionable part of the message — which entry, which branch, which channel.
   */
  it("surfaces the writer's refusal verbatim, so the owner can act on it", async () => {
    gateway.refuseWith(
      "/internal/catalog/publish",
      400,
      "publishCatalog: entry 0 (item/item-daal) is not sellable — no price for branch " +
        `${BRANCH}, channel counter (01-F60).`,
    );
    const saved = await mutate(
      running.base,
      "catalog.save",
      {
        entry: { ...ENTRY, id: "item-daal", name: "Daal" },
        apply_when: "now",
      },
      auth,
    );
    expect(saved.status).not.toBe(200);
    expect(JSON.stringify(saved.body)).toContain("channel counter (01-F60)");
  });

  /**
   * **Fail-closed at boot.** The alternative — boot happily and fall back to the in-memory stub —
   * is the defect itself as a supported deployment mode: everything looks healthy and no menu ever
   * ships. `SESSION_SECRET` set the precedent that a missing dependency is a crash.
   */
  it("refuses to boot with nowhere to publish to", async () => {
    const { child, err } = spawnStart(script, {
      BOOTSTRAP_ORG_ID: ORG,
      ENABLED_BRANCHES: BRANCH,
      ENABLED_CHANNELS: "counter",
      SYNC_GATEWAY_URL: undefined,
      SYNC_GATEWAY_TOKEN: gateway.token,
    });
    const result = await new Promise<{ code: number | null; text: string }>((done) => {
      child.on("exit", (code) => done({ code, text: err() }));
    });
    expect(result.code, `expected a boot refusal; stderr was:\n${result.text}`).not.toBe(0);
    expect(result.text).toContain("SYNC_GATEWAY_URL");
  }, 30_000);
});
