/**
 * `01-F87` + `14-F43`..`14-F48` — the layer-2 configuration surface on the CLOUD plane.
 *
 * Two questions, and they are different questions:
 *
 *   §A–§C **the gate and the record** — who may write (`14-F43`'s `config.manage`, owner-only),
 *          whose org it lands in (`01-F71` (b)), and what `01-F87` (a) requires the ledger row to
 *          carry. Driven through `server.inject`-equivalent HTTP against a host this file builds.
 *   §D    **THE ADAPTER** — does `createGatewayConfigPlane` put the right request on the wire?
 *
 * ⚠ **§D IS NOT THE SEAM, AND ITS FIRST VERSION CLAIMED IT WAS — measured, mutant C7, 0 of 418.**
 * This file builds its OWN host with `createApiServer({ config: createGatewayConfigPlane(…) })`,
 * so `server.ts` swapping that adapter for `unconfiguredConfigPlane()` leaves every assertion here
 * GREEN: a test that supplies the wiring cannot observe whether the product supplies it. That is
 * this wave's named defect (`L8`) reproduced inside the fix for it, and only mutation found it —
 * reading the file did not. **The real seam assertion is in `device-seam.test.ts`**, which drives
 * the DECLARED `scripts.start` out of process and asks what the PEER received; the header
 * correction is kept rather than quietly rewritten, because a false claim about which test holds a
 * protection retires the assertion the next session would otherwise write (`L11`).
 *
 * ⚠ **AUTHORED ALONGSIDE THE IMPLEMENTATION** under founder ruling **R66** (tests beside the code
 * for `plans/v0.md`'s four gaps; this is gap 3). AGENTS.md §7 records that R66 is carried into no
 * FR. Stated, not hidden — `packages/domain/src/__acceptance__/config-plane.test.ts`'s header
 * carries the full form of what that costs.
 *
 * ── WHAT THIS FILE DELIBERATELY DOES NOT ASSERT ──────────────────────────────────────────────
 *
 *   · **`14-F48`'s refusals.** They live at `publishConfig` in `services/sync-gateway`, which is
 *     `14-F48`'s ONE declaration, and are asserted there against real Postgres. Reproducing them
 *     in the fake gateway would let this suite pass on its own opinion of them, and `14-F48`'s
 *     closing note measures what a second, silently-disagreeing copy costs: **0 of 95 tests.**
 *   · **The `cloud_only` audience filter.** Same reason, same place (`configPage`).
 *   · **Any key's schema or default.** `@restos/domain/config`'s, asserted there.
 *
 * FRs: `01-F87` (a)/(b), `14-F43` (the action, owner-only), `14-F45`/`14-F47` (the surfaces),
 * `01-F71` (b) (the org comes from the subject), `01-F62` (`config.changed` is org-scoped),
 * `18 §5` (`assertEveryProcedureIsGated`).
 */

import { hashPin, type Role } from "@restos/domain";
import { CONFIG_KEYS } from "@restos/domain/config";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGatewayConfigPlane } from "../gateway-client.js";
import { createApiServer } from "../server.js";
import { createMemoryUserStore, type UserRecord } from "../users.js";
import { type FakeGateway, startFakeGateway } from "./fake-gateway.js";

const ORG = "org-config-api";
const BRANCH = "branch-config-api";
const SECRET = "config-plane-acceptance-session-secret-not-a-real-one";
const PASSWORD = "a-config-plane-owner-password";

const TAX_16 = {
  default: { posture: "exclusive", rate_bps: 1600 },
  by_tender: [{ tender: "card", cell: { posture: "exclusive", rate_bps: 800 } }],
};

let gateway: FakeGateway;
let app: FastifyInstance;
/** Bearer tokens, one per role — the whole `14-F43` cell row is exercised, not just the owner. */
const tokens: Record<string, string> = {};

const user = async (
  user_id: string,
  role: Role,
  branch_id: string | null,
): Promise<UserRecord> => ({
  user_id,
  org_id: ORG,
  email: `${user_id}@config-plane.test`,
  display_name: user_id,
  password_hash: await hashPin(PASSWORD),
  assignments: [{ role, branch_id, status: "active" }],
});

const rpc = async (
  path: string,
  init: { token?: string | undefined; input?: unknown; method?: "GET" | "POST" } = {},
): Promise<{ status: number; body: Record<string, unknown> }> => {
  const method = init.method ?? "POST";
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.token !== undefined) headers.authorization = `Bearer ${init.token}`;
  const response = await app.inject({
    method,
    url: `/trpc/${path}`,
    headers,
    ...(method === "POST" ? { payload: JSON.stringify({ json: init.input ?? {} }) } : {}),
  });
  return { status: response.statusCode, body: response.json() as Record<string, unknown> };
};

const dataOf = (body: Record<string, unknown>): unknown =>
  (body.result as { data?: { json?: unknown } } | undefined)?.data?.json;

beforeAll(async () => {
  gateway = await startFakeGateway();
  const people = await Promise.all([
    user("ayesha-owner", "owner", null),
    user("hina-manager", "branch_manager", BRANCH),
    user("bilal-cashier", "cashier", BRANCH),
    user("kamran-store", "storekeeper", BRANCH),
    // `01-F26`'s org-wide manager: the shape that REACHES the cell rather than being refused by
    // scope resolution first. `services/api`'s own A11/E4 findings record that every non-owner
    // subject being branch-scoped left a permission cell with NO coverage at all, twice.
    user("org-wide-manager", "branch_manager", null),
  ]);
  app = await createApiServer({
    store: createMemoryUserStore(people),
    sessionSecret: SECRET,
    now: () => 1_785_000_000_000,
    config: createGatewayConfigPlane({ base_url: gateway.url, token: gateway.token }),
  });
  for (const person of people) {
    const login = await rpc("auth.login", { input: { email: person.email, password: PASSWORD } });
    const { token } = dataOf(login.body) as { token: string };
    tokens[person.user_id] = token;
  }
}, 60_000);

afterAll(async () => {
  await app?.close();
  await gateway?.close();
});

describe("§A — 14-F43: `config.manage` is OWNER-ONLY, and every cell is exercised", () => {
  it("A1 14-F43: the owner may read and save", async () => {
    const read = await rpc("config.read", { token: tokens["ayesha-owner"], method: "GET" });
    expect(read.status, JSON.stringify(read.body)).toBe(200);

    const save = await rpc("config.save", {
      token: tokens["ayesha-owner"],
      input: { entries: [{ key: "tax.posture_matrix", value: TAX_16 }] },
    });
    expect(save.status, JSON.stringify(save.body)).toBe(200);
    expect(dataOf(save.body)).toEqual({ version: 1 });
  });

  it("A2 14-F43: a BRANCH-SCOPED owner is refused — a real property, and NOT evidence about the cell", async () => {
    // ⚠ **THIS TEST DOES NOT EXERCISE THE PERMISSION CELL AND ITS TITLE SAYS SO.** `config.save`
    // states no `branch_id` (`14-F43`: every setting in this block is org-scoped), so `branchOf`
    // resolves `null`, `rolesAt` drops a branch assignment, and the 403 arrives from **scope
    // resolution before any cell is read**. This package has measured that hole twice — A11 on
    // `device.manage` and E4 on `export.request`, both of which passed with the cell WIDENED
    // because every non-owner subject in the file was branch-scoped — so §A3 is the assertion that
    // reaches the cell and this one is only about scope.
    //
    // The property it does hold is worth holding: a branch-scoped OWNER cannot set an org-wide
    // tax rate, which `14-F43` calls the correct answer rather than a limitation.
    const branchOwner = await user("dha-owner", "owner", BRANCH);
    const scoped = await createApiServer({
      store: createMemoryUserStore([branchOwner]),
      sessionSecret: SECRET,
      now: () => 1_785_000_000_000,
      config: createGatewayConfigPlane({ base_url: gateway.url, token: gateway.token }),
    });
    try {
      const login = await scoped.inject({
        method: "POST",
        url: "/trpc/auth.login",
        headers: { "content-type": "application/json" },
        payload: JSON.stringify({
          json: { email: branchOwner.email, password: PASSWORD },
        }),
      });
      const token = (login.json() as { result: { data: { json: { token: string } } } }).result.data
        .json.token;
      const save = await scoped.inject({
        method: "POST",
        url: "/trpc/config.save",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        payload: JSON.stringify({
          json: { entries: [{ key: "charge.rounding_paisa", value: 1000 }] },
        }),
      });
      expect(save.statusCode).toBe(403);
    } finally {
      await scoped.close();
    }
  });

  it("A3 14-F43: an ORG-WIDE branch manager is refused — the cell itself, not scope resolution", async () => {
    // **THE ROW A REVIEWER SHOULD LOOK HARDEST AT.** `14-F43` pins owner-only as a contestable
    // INTERPRETATION: R63's words are *"the owner or ops lead"* and `ROLES` has no ops lead, and
    // doc 14 §9.1 leaves a manager's back-office reach explicitly undecided. This is the mutant
    // `branch_manager: "allow"` measured against a subject that actually reaches the cell.
    const save = await rpc("config.save", {
      token: tokens["org-wide-manager"],
      input: { entries: [{ key: "charge.rounding_paisa", value: 1000 }] },
    });
    expect(save.status).toBe(403);
    const read = await rpc("config.read", { token: tokens["org-wide-manager"], method: "GET" });
    expect(read.status).toBe(403);
  });

  it("A4 14-F43: cashier, storekeeper and branch manager are all refused", async () => {
    for (const who of ["bilal-cashier", "kamran-store", "hina-manager"]) {
      const save = await rpc("config.save", {
        token: tokens[who],
        input: { entries: [{ key: "charge.rounding_paisa", value: 1000 }] },
      });
      expect(save.status, who).toBe(403);
    }
  });

  it("A5 18 §5: an UNAUTHENTICATED caller reaches neither procedure", async () => {
    // Neither exemption list changed and neither may: `PUBLIC_PROCEDURES` would put an org's tax
    // rates on the open internet, and `SESSION_ONLY_PROCEDURES` is for procedures reading the
    // CALLER'S OWN identity, which an org's approval thresholds are not.
    expect((await rpc("config.read", { method: "GET" })).status).toBe(401);
    expect(
      (
        await rpc("config.save", {
          input: { entries: [{ key: "charge.rounding_paisa", value: 100 }] },
        })
      ).status,
    ).toBe(401);
  });
});

describe("§B — 01-F87 (a): the LEDGER record, one per changed KEY", () => {
  it("B1 01-F87 (a)/14-F2: a save writes `config.changed` — a layer-2 edit is AUDITED", async () => {
    // `00 §7` (f) measured the before-state: the type had no payload schema, so `01-F4` made the
    // emit a runtime error and *"a layer-2 change is today unauditable, not merely unbuilt"*.
    const before = gateway.orgEvents().length;
    const save = await rpc("config.save", {
      token: tokens["ayesha-owner"],
      input: {
        entries: [
          { key: "charge.rounding_paisa", value: 1000 },
          { key: "paid_out.approval_threshold_paisa", value: 500_000 },
        ],
      },
    });
    expect(save.status, JSON.stringify(save.body)).toBe(200);
    const version = (dataOf(save.body) as { version: number }).version;

    const appended = gateway.orgEvents().slice(before);
    expect(appended).toHaveLength(2);
    for (const event of appended) {
      expect(event.type).toBe("config.changed");
      expect(event.org_id).toBe(ORG);
      // `01-F87` (a): the record NAMES the artifact version it produced, so `14-F3`'s history and
      // `20 §4.2`'s refold can say which version carried a change.
      expect(event.payload).toMatchObject({ version, layer: 2 });
    }
    expect(appended.map((event) => (event.payload as { key: string }).key).sort()).toEqual([
      "charge.rounding_paisa",
      "paid_out.approval_threshold_paisa",
    ]);
  });

  it("B2 01-F87 (a): `layer` comes from the REGISTRY, never from the request", async () => {
    // A request-supplied layer would let a caller file a layer-2 edit as a layer-1 one, and
    // `01-F87` (a) makes the field required *precisely because* this type spans layers (`15-F25`
    // routes an org's suspension through it). The input schema carries no `layer` at all, so this
    // asserts the value is the declaration's.
    const before = gateway.orgEvents().length;
    await rpc("config.save", {
      token: tokens["ayesha-owner"],
      input: {
        entries: [{ key: "commission.by_provider", value: [{ provider: "HBL", rate_bps: 175 }] }],
      },
    });
    const [event] = gateway.orgEvents().slice(before);
    expect(event, "no config.changed reached the peer").toBeDefined();
    expect((event as { payload: { layer: number } }).payload.layer).toBe(
      CONFIG_KEYS["commission.by_provider"].layer,
    );
  });

  it("B3 01-F87 (a): BOTH transitions are recorded — `null → v` and `v → null`", async () => {
    // *"`null` means the key was on its default"*, so a first configuration and a RESET are both
    // statable — which is what makes `configKeysOnDefault`'s answer auditable at all.
    const org = gateway.orgEvents().length;
    await rpc("config.save", {
      token: tokens["ayesha-owner"],
      input: { entries: [{ key: "discount.approval_threshold_bps", value: 5000 }] },
    });
    const [first] = gateway.orgEvents().slice(org);
    // A key nothing had configured: `before` is `null`.
    expect(first?.payload).toMatchObject({ before: null, after: 5000 });

    const mid = gateway.orgEvents().length;
    await rpc("config.save", {
      token: tokens["ayesha-owner"],
      input: { entries: [{ key: "discount.approval_threshold_bps", deleted: true }] },
    });
    const [reset] = gateway.orgEvents().slice(mid);
    // The RESET: the value it HELD, then `null`.
    expect(reset?.payload).toMatchObject({ before: 5000, after: null });
  });

  it("B4 02-F45/01-F84: the ACTOR is the authenticated subject, and the payload carries none", async () => {
    // `14-F13`'s lesson one surface over: a shell command has no authenticated user, so the only
    // actor it could write is `null` — permanently, in an append-only store. An authenticated
    // back-office session has one, and that is what puts this write on a screen rather than a
    // terminal. The envelope is its one home (`01-F87` (a): *"no actor field"*).
    const before = gateway.orgEvents().length;
    await rpc("config.save", {
      token: tokens["ayesha-owner"],
      input: { entries: [{ key: "charge.rounding_paisa", value: 100 }] },
    });
    const [event] = gateway.orgEvents().slice(before);
    expect(event).toMatchObject({ actor_user_id: "ayesha-owner" });
    expect(event?.payload).not.toHaveProperty("actor_user_id");
  });

  it("B5 01-F71 (b): the ORG comes from the authenticated subject and never from the request", async () => {
    // A tenant-supplied org on any request is `28-F5` (b)'s named refusal. The input schema
    // declares no `org_id`; this asserts that a caller who sends one anyway does not move the
    // tenant the write lands in.
    const before = gateway.orgEvents().length;
    const save = await rpc("config.save", {
      token: tokens["ayesha-owner"],
      input: {
        org_id: "some-other-tenant",
        entries: [{ key: "charge.rounding_paisa", value: 1000 }],
      },
    });
    expect(save.status, JSON.stringify(save.body)).toBe(200);
    for (const event of gateway.orgEvents().slice(before)) expect(event.org_id).toBe(ORG);
    expect(
      gateway.received.filter((entry) => entry.path === "/internal/config/publish").at(-1)?.body,
    ).toMatchObject({ org_id: ORG });
  });
});

describe("§C — 14-F45: the READ that closes the gate this plane was built for", () => {
  it("C1 01-F87: a cloud surface can now resolve THIS org's posture", async () => {
    // The brief's own sentence: *"nothing in `services/api` or `services/storefront` can resolve an
    // org's posture, so the owner summary cannot tell two restaurants apart and a storefront total
    // will not match what that restaurant's till charges."* This is the read that answers it.
    await rpc("config.save", {
      token: tokens["ayesha-owner"],
      input: { entries: [{ key: "tax.posture_matrix", value: TAX_16 }] },
    });
    const read = await rpc("config.read", { token: tokens["ayesha-owner"], method: "GET" });
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    const artifact = dataOf(read.body) as {
      version: number;
      entries: { key: string; value?: unknown }[];
    };
    expect(artifact.version).toBeGreaterThan(0);
    expect(artifact.entries).toContainEqual({ key: "tax.posture_matrix", value: TAX_16 });
  });

  it("C2 01-F87: an EMPTY save is refused — it is not a version", async () => {
    const save = await rpc("config.save", {
      token: tokens["ayesha-owner"],
      input: { entries: [] },
    });
    expect(save.status).toBe(400);
  });
});

describe("§D — the ADAPTER: what `createGatewayConfigPlane` puts on the wire", () => {
  it("D1 01-F87: `config.save` reaches the peer with the org, the rows and the ACTOR", async () => {
    // ⚠ **THIS IS NOT THE SEAM ASSERTION.** This file hands the host the adapter, so it cannot
    // observe whether `server.ts` does — mutant C7 measured that at 0 of 418. What it holds is the
    // adapter's own contract: the request SHAPE. The seam is `device-seam.test.ts`, out of process
    // through the declared `start` script. See this file's header.
    const before = gateway.received.filter((e) => e.path === "/internal/config/publish").length;
    await rpc("config.save", {
      token: tokens["ayesha-owner"],
      input: { entries: [{ key: "charge.rounding_paisa", value: 1000 }] },
    });
    const publishes = gateway.received.filter((e) => e.path === "/internal/config/publish");
    expect(publishes.length).toBe(before + 1);
    expect(publishes.at(-1)?.body).toMatchObject({
      org_id: ORG,
      entries: [{ key: "charge.rounding_paisa", value: 1000 }],
      actor_user_id: "ayesha-owner",
    });
    // …and the artifact ACTUALLY MOVED at the peer — a request that arrived and did nothing is
    // the shape `L7` names (a seam test alone blesses a decorative object).
    expect(gateway.config(ORG).entries).toContainEqual({
      key: "charge.rounding_paisa",
      value: 1000,
    });
  });

  it("D2 01-F71 (b): `config.read` sends the SUBJECT's org as the query", async () => {
    const before = gateway.received.filter((e) => e.path === "/internal/config/published").length;
    await rpc("config.read", { token: tokens["ayesha-owner"], method: "GET" });
    const reads = gateway.received.filter((e) => e.path === "/internal/config/published");
    expect(reads.length).toBe(before + 1);
    // `01-F71` (b) again, on the READ: the org travels as a query parameter and it is the
    // subject's. For a GET the `org_id` IS the request, which is why `fake-gateway.ts` records
    // query parameters as well as bodies.
    expect(reads.at(-1)?.query).toMatchObject({ org_id: ORG });
  });

  it("D3 18 §5: an UNREACHABLE gateway is a NAMED 503, never a silent empty configuration", async () => {
    // `IntegrationError`'s whole point one surface over, and it matters more here than on the
    // menu: an empty configuration is a VALID state (`01-F87` (b)), so a read that swallowed an
    // outage would hand a caller `16-F1`'s no-tax answer for an org that charges 16 %.
    gateway.refuseWith("/internal/config/published", 500, "the gateway fell over");
    const read = await rpc("config.read", { token: tokens["ayesha-owner"], method: "GET" });
    expect(read.status).not.toBe(200);
    expect(JSON.stringify(read.body)).toMatch(/gateway fell over|config published/);
  });
});
