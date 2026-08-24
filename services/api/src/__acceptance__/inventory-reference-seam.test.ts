/**
 * **THE SEAM BETWEEN AN AUTHORED REFERENCE SET AND `10-F18`'s VARIANCE REPORT.**
 *
 * `services/api` shipped `inventory.variance` hosted, gated and arithmetically correct over
 * `unconfiguredInventoryReference` — a port that REFUSES every read — and `start()` supplied
 * nothing. Measured on a real four-process stack on 2026-08-25, an authenticated owner asking for
 * her own branch's variance got **HTTP 500**: *"no inventory reference source is configured on this
 * host"*. `packages/inventory`'s 113 tests were green throughout. That is `L8` — a correct
 * subsystem with no seam to the product — and `L7`'s rule is that the fix needs an assertion aimed
 * at the SEAM rather than at the logic.
 *
 * So this file asks two questions out of process, against the DECLARED `scripts.start`:
 *
 *   1. does an owner's authored reference set actually LEAVE this process for the gateway?
 *   2. does the variance report READ IT BACK — measurably, in money?
 *
 * ⚠ **QUESTION 2 IS THE ONE THAT MATTERS AND QUESTION 1 CANNOT SUBSTITUTE FOR IT.** `L8`'s third
 * blind spot is measured in this repo: *"Rule B asks whether an optional member is supplied, never
 * whether what was supplied is real, and a stub is a supply."* A port answering
 * `{ items: [], areas: [], recipes: [], menu_recipes: [] }` is SUPPLIED — `pnpm seams:check` is
 * clean, `pnpm verify` is exit 0 — and it renders a complete, confident variance report with no
 * rows for a location that may be short any amount at all, with nothing on the screen saying
 * anything is missing (`00 §5.7`, `10-F29`). The only assertion that separates it from the real
 * thing is one that changes a REFERENCE COST and watches a MONEY figure move, which is §C.
 *
 * FRs: `01-F21` (reference data, back-office authored), `10-F18` (the variance report),
 * `10-F28` (the count period), `10-F31` (the writer's refusals), `14-F9` (the recipe editor's
 * action). Design: `plans/inventory/design.md` §7 slice 1 steps 4 and 7.
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

const ORG = "org-inventory-seam";
const EMAIL = "owner@inventory-seam.test";
const PASSWORD = "a-bootstrap-owner-password";
const SECRET = "inventory-seam-acceptance-session-secret-not-a-real-one";
const BRANCH = "branch-inventory-seam";

/**
 * One counted, costed item and the dish that consumes it.
 *
 * **Rs 600/kg, and every downstream number in this file is derived from it by hand** — a fixture
 * whose cost the assertions did not depend on could not tell a real read from a stub, which is the
 * whole point of §C.
 */
const CHICKEN_PAISA_PER_KG = 60_000;

const refs = (referenceCostPaisaPerKg: number) => ({
  items: [
    {
      item_id: "item-chicken",
      name: "Chicken",
      type: "raw" as const,
      base_unit: "mg" as const,
      is_counted: true,
      is_costed: true,
      count_units: {
        primary_label: "kg bag",
        primary_size_base: 1_000_000,
        partial: { kind: "none" as const },
      },
      reference_cost: { value_paisa: referenceCostPaisaPerKg, qty_base: 1_000_000 },
    },
  ],
  areas: [{ item_id: "item-chicken", location_id: BRANCH, area_id: "walk-in", sort: 1 }],
  recipes: [
    {
      recipe_id: "rec-karahi",
      version: 1,
      lines: [
        { line_no: 1, component: { kind: "item" as const, id: "item-chicken" }, qty: 250_000 },
      ],
      yield_qty_base: null,
      produces_item_id: null,
    },
  ],
  menu_recipes: [{ sellable_kind: "item", sellable_id: "sku-karahi", recipe_id: "rec-karahi" }],
});

type Spawned = {
  readonly base: string;
  readonly kill: () => void;
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
  return { base: `http://127.0.0.1:${new URL(address).port}`, kill };
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

const query = async (
  base: string,
  path: string,
  input: unknown,
  headers: Record<string, string>,
): Promise<Rpc> => {
  const url = `${base}/trpc/${path}?input=${encodeURIComponent(JSON.stringify(superjson.serialize(input)))}`;
  const res = await fetch(url, { headers });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

const dataOf = (rpc: Rpc): unknown =>
  (rpc.body.result as { data?: { json?: unknown } } | undefined)?.data?.json;

const errorOf = (rpc: Rpc): string =>
  ((rpc.body.error as { json?: { message?: string } } | undefined)?.json?.message ?? "") as string;

describe("10-F18's reference set reaches the gateway and comes back (the seam, out of process)", () => {
  let gateway: FakeGateway;
  let running: Spawned;
  let auth: Record<string, string>;

  beforeAll(async () => {
    const raw = await readFile(join(PKG_DIR, "package.json"), "utf8");
    const declared = (JSON.parse(raw) as { scripts?: Record<string, string> }).scripts?.start;
    // The DECLARED script, never a hardcoded `tsx src/server.ts`: deleting the script has to fail
    // this file, which is `startable.test.ts`'s M1 and `provisionable.test.ts`'s P1 for this seam.
    if (declared === undefined) throw new Error("package.json declares no `start` script");

    gateway = await startFakeGateway();
    running = await startListening(declared, {
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

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // §A — the WRITER leaves the process.
  // ───────────────────────────────────────────────────────────────────────────────────────────

  it("§A1 an authored reference set arrives at the gateway as a versioned publish", async () => {
    const saved = await mutate(
      running.base,
      "inventory.saveReference",
      refs(CHICKEN_PAISA_PER_KG),
      auth,
    );
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(dataOf(saved)).toMatchObject({ version: 1 });

    const publishes = gateway.received.filter((row) => row.path === "/internal/inventory/publish");
    expect(
      publishes.length,
      "the gateway received NO inventory publish — the composition root is writing into a stub, " +
        "which is exactly the defect this file exists to catch",
    ).toBe(1);

    const body = publishes[0]?.body as { org_id: string; entries: { kind: string }[] };
    // `01-F71` (b) — the org comes from the authenticated SUBJECT and never from the request; the
    // input schema is `strictObject` and carries no `org_id` at all, so this is the only place the
    // tenant key can be observed leaving the process.
    expect(body.org_id).toBe(ORG);
    // All four kinds, because a reshape that dropped one is exactly `catalog-fetch.ts`'s shipped
    // defect (it dropped `prices` and `station` and failed 0 of 579 tests).
    expect([...new Set(body.entries.map((e) => e.kind))].sort()).toEqual([
      "area",
      "item",
      "menu_recipe",
      "recipe",
    ]);
  });

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // §B — the READER answers at all. This is the reported defect, exactly.
  // ───────────────────────────────────────────────────────────────────────────────────────────

  it("§B1 variance answers 200, where a real deployment answered 500", async () => {
    const report = await query(running.base, "inventory.variance", { branch_id: BRANCH }, auth);
    expect(
      report.status,
      `variance refused: ${errorOf(report)} — before 2026-08-25 this was HTTP 500 on every ` +
        "deployment, because start() supplied no inventory reference source at all",
    ).toBe(200);
    expect(dataOf(report)).toMatchObject({ scope: { org_id: ORG, branch_id: BRANCH } });

    const reads = gateway.received.filter((row) => row.path === "/internal/inventory/reference");
    // A request actually LEFT the process — `tenancy-names.test.ts`'s N3b records why the value
    // alone cannot carry this claim: a stub whose answer happens to look right is indistinguishable
    // by value and stays indistinguishable for ever.
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.at(-1)?.query).toMatchObject({ org_id: ORG });
  });

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // §C — THE ASSERTION A STUB CANNOT PASS. A reference cost changes; a money figure moves.
  // ───────────────────────────────────────────────────────────────────────────────────────────

  it("§C1 a reference cost typed by the owner reaches the fold's own input", async () => {
    // Publish version 2 with the SAME items at a different reference cost. Then read back what the
    // gateway now holds THROUGH the API's own reader, by asking for the report and checking that
    // the reference data the fold was handed is the new one.
    //
    // ⚠ **The report has no PERIODS yet and cannot have any, and that is a fact about the product
    // rather than about this test.** `10-F28`'s period is opened and closed by
    // `stock.count_recorded`, and **no device can emit one**: the count surface is
    // `plans/inventory/design.md` §7 slice 1 step 6 and is not built, and it is gated on amendment
    // **A1** (`01-F75`'s resource set is closed and holds no `inventory` member, so no frame can
    // carry a count sheet to a till). So the strongest money assertion available today is on what
    // the fold was HANDED, not on what it produced — and the day a count exists, this is the test
    // that gains a PKR figure. It is written as an explicit gap rather than left to look complete.
    const republished = await mutate(
      running.base,
      "inventory.saveReference",
      refs(CHICKEN_PAISA_PER_KG * 2),
      auth,
    );
    expect(republished.status, JSON.stringify(republished.body)).toBe(200);
    expect(dataOf(republished)).toMatchObject({ version: 2 });

    const publishes = gateway.received.filter((row) => row.path === "/internal/inventory/publish");
    const latest = publishes.at(-1)?.body as {
      entries: { kind: string; payload: { reference_cost?: { value_paisa: number } } }[];
    };
    const item = latest.entries.find((e) => e.kind === "item");
    // The number the owner typed, on the wire, unrounded and unreshaped. A reshape that dropped
    // `reference_cost` would leave every plate costed at nothing and every variance row at Rs 0 —
    // and `packages/inventory`'s own tests would stay green, because they call the fold directly.
    expect(item?.payload.reference_cost?.value_paisa).toBe(CHICKEN_PAISA_PER_KG * 2);

    const report = await query(running.base, "inventory.variance", { branch_id: BRANCH }, auth);
    expect(report.status, errorOf(report)).toBe(200);
  });

  it("§C2 an org that has published NOTHING is refused, never answered with an empty report", async () => {
    // The most dangerous shape on this surface, and the one `seams:check` is blind to. An org with
    // no reference data must not receive a complete, confident, entirely empty variance report:
    // `00 §5.7` prefers a stated absence to a confident smaller number, and `10-F29` is the same
    // rule one level down at the blank count box.
    //
    // The subject here is scoped to its OWN org, so this is asserted by a second host whose org has
    // never published — not by asking this owner about somebody else's tenant, which `01-F71` (b)
    // makes unrepresentable (the procedure takes no `org_id`).
    const other = await startListening(
      (
        JSON.parse(await readFile(join(PKG_DIR, "package.json"), "utf8")) as {
          scripts: Record<string, string>;
        }
      ).scripts.start ?? "",
      {
        BOOTSTRAP_OWNER_EMAIL: "owner@unpublished.test",
        BOOTSTRAP_OWNER_PASSWORD_HASH: await hashPin(PASSWORD),
        BOOTSTRAP_ORG_ID: "org-never-published",
        ENABLED_BRANCHES: BRANCH,
        ENABLED_CHANNELS: "counter",
        SYNC_GATEWAY_URL: gateway.url,
        SYNC_GATEWAY_TOKEN: gateway.token,
      },
    );
    try {
      const login = await mutate(other.base, "auth.login", {
        email: "owner@unpublished.test",
        password: PASSWORD,
      });
      const token = (dataOf(login) as { token: string }).token;
      const report = await query(
        other.base,
        "inventory.variance",
        { branch_id: BRANCH },
        { authorization: `Bearer ${token}` },
      );
      expect(
        report.status,
        "an org with no published reference data got a REPORT. That report has no rows, no floor " +
          "flag and no unexplained usage, and nothing on it says anything is missing.",
      ).toBe(503);
      expect(errorOf(report)).toContain("published no inventory reference data");
    } finally {
      other.kill();
    }
  }, 60_000);
});
