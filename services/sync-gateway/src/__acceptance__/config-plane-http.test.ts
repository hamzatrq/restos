// Acceptance tests — `01-F87`'s configuration plane at the GATEWAY: the `/internal` writer, the
// refusals `14-F48` puts there, and the device serve path `01-F75` gives it.
//
// PROVENANCE: `01-F87` (a)/(b), `01-F75` (the frames, the one-entry-per-changed-key delta, the
// continuation clause), `01-F76` (the artifact key), `01-F77` (omitted, never `0`), `14-F48` (the
// enumerated refusals), `02 §Layer 2` + `02-F60` (iii) (commission never reaches a till), `01-F62`
// (the event is org-scoped and is a different carrier), `18 §4` (one writer service per table).
//
// ⚠ **AUTHORED ALONGSIDE THE IMPLEMENTATION**, which `20 §4.3` normally forbids on a protected
// path. Founder ruling **R66** puts tests beside the code for `plans/v0.md`'s four gaps and this is
// gap 3 (*"somewhere for tax rates to live"*); AGENTS.md §7 records that R66 is carried into no FR.
// `catalog-publish-http.test.ts` carries the same note for the same reason. Stated, not hidden.
//
// ⚠ This suite needs Docker (Testcontainers). By design it FAILS LOUDLY rather than skipping
// (`T-01-07`): a green run with no database is worse than a red one.
//
// WHAT THIS FILE IS FOR. Every test ends by asking the question that matters — **can a device
// fetch what was just saved, and is it the value the owner typed?** — because `01-F87`'s whole
// argument for an artifact over an event stream is *knowing you hold all of it*, and a writer
// nothing can read from is this wave's named defect (`L8`) on the plane that carries tax rates.

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { configPage, configVersion } from "../config.js";
import { orgEventHistory } from "../org-events.js";
import { buildServer } from "../server.js";
import { closeDb, type Db, openDb, TEST_TOKEN_SECRET, testDatabaseUrl } from "./helpers.js";

/** ≥ 32 bytes, the floor `server.ts` enforces on this credential (`18 §5`). */
const PUBLISH_SECRET = "internal-publish-credential-for-the-acceptance-suite";

type Http = { status: number; body: Record<string, unknown> };

let db: Db;
let base: string;
let unconfigured: string;
let servers: { close(): Promise<void> }[];

const call = async (
  origin: string,
  method: "GET" | "POST",
  path: string,
  init: { token?: string | undefined; body?: unknown } = {},
): Promise<Http> => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.token !== undefined) headers.authorization = `Bearer ${init.token}`;
  const response = await fetch(`${origin}${path}`, {
    method,
    headers,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
};

/**
 * The credential is a THREE-state field — a valid one, a wrong one, and NONE — and `NO_TOKEN` is
 * the sentinel that makes the third expressible at all.
 *
 * ⚠ **IT IS NOT A DEFAULT PARAMETER, AND THAT IS THIS SERVICE'S OWN RECORDED DEFECT.**
 * `services/sync-gateway/CLAUDE.md` measures `signup.test.ts` §A as *unsatisfiable by any
 * implementation* because its wrapper is `signupOverHttp(body, token = PUBLISH_SECRET)` — so
 * `signupOverHttp(request, undefined)` sends the VALID credential and is byte-identical to the
 * call the same test requires to answer 200. One request, one credential, two required answers.
 * **This suite reproduced that exact defect on its first run** (§B9 reported `expected 200 to be
 * 401`), which is the harness catching itself rather than a reviewer catching it later.
 */
const NO_TOKEN = Symbol("no credential offered");

const save = (
  org_id: string,
  entries: readonly { key: string; value?: unknown; deleted?: boolean }[],
  token: string | typeof NO_TOKEN = PUBLISH_SECRET,
) =>
  call(base, "POST", "/internal/config/publish", {
    ...(token === NO_TOKEN ? {} : { token }),
    body: { org_id, entries, actor_user_id: "user-ayesha", now: 1_785_000_000_000 },
  });

/** A fresh org per test: these tables are append-only, so isolation is by key, never by truncate. */
let n = 0;
const freshOrg = (): string => {
  n += 1;
  return `org-config-http-${Date.now()}-${n}`;
};

const TAX_16 = {
  default: { posture: "exclusive", rate_bps: 1600 },
  by_tender: [{ tender: "card", cell: { posture: "exclusive", rate_bps: 800 } }],
};

beforeAll(async () => {
  db = openDb();
  const app = buildServer(
    testDatabaseUrl(),
    TEST_TOKEN_SECRET,
    undefined,
    undefined,
    PUBLISH_SECRET,
  );
  // A deployment that declared no credential. Its own instance, because the question is what
  // `buildServer` does with `undefined`.
  const bare = buildServer(testDatabaseUrl(), TEST_TOKEN_SECRET);
  base = await app.listen({ port: 0, host: "127.0.0.1" });
  unconfigured = await bare.listen({ port: 0, host: "127.0.0.1" });
  servers = [app, bare];
}, 60_000);

afterAll(async () => {
  for (const server of servers ?? []) await server.close();
  if (db !== undefined) await closeDb(db);
});

describe("§A — 01-F87: the writer publishes and a DEVICE can fetch it", () => {
  it("A1 01-F87/plans/v0.md gap 3: an owner's tax rate reaches the till's own read path", async () => {
    // **THE test this whole plane exists for.** Before it, `apps/pos-electron` read
    // `RESTOS_TAX_POSTURE` per DEVICE and nothing cloud-side could resolve an org's posture at all.
    const org = freshOrg();
    const response = await save(org, [
      { key: "tax.posture_matrix", value: TAX_16 },
      { key: "charge.rounding_paisa", value: 1000 },
    ]);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toEqual({ version: 1 });

    // `configPage(db, org, 0, 0)` is what a device's `reference_request` runs, so this is the
    // till's own read path and not an inspection of the writer's internals.
    const page = await configPage(db, org, 0, 0);
    expect(page.form).toBe("snapshot");
    expect(page.version).toBe(1);
    expect(page.entries).toEqual([
      { key: "charge.rounding_paisa", value: 1000 },
      { key: "tax.posture_matrix", value: TAX_16 },
    ]);
  });

  it("A2 01-F87/01-F77: an org that has published nothing answers version 0 and an empty snapshot", async () => {
    // `01-F87` (b)'s specified state, not an error: the device holds every key on its declared
    // build default and never blocks (`01-F17`, `00 §5.1`). `hello_ack` OMITS the key entirely,
    // which is `01-F77`'s omitted-never-zero rule and is asserted in §E.
    const page = await configPage(db, freshOrg(), 0, 0);
    expect(page).toEqual({
      form: "snapshot",
      version: 0,
      entries: [],
      complete: true,
      next_from: 0,
    });
  });

  it("A3 01-F52's precedent: the version advances monotonically and the fold is the NEWEST per key", async () => {
    const org = freshOrg();
    expect((await save(org, [{ key: "charge.rounding_paisa", value: 100 }])).body).toEqual({
      version: 1,
    });
    expect((await save(org, [{ key: "tax.posture_matrix", value: TAX_16 }])).body).toEqual({
      version: 2,
    });
    expect((await save(org, [{ key: "charge.rounding_paisa", value: 1000 }])).body).toEqual({
      version: 3,
    });
    expect(await configVersion(db, org)).toBe(3);

    const page = await configPage(db, org, 0, 0);
    expect(page.entries).toEqual([
      // The NEWEST value, not three copies of the key.
      { key: "charge.rounding_paisa", value: 1000 },
      { key: "tax.posture_matrix", value: TAX_16 },
    ]);
  });

  it("A4 01-F75: a DELTA carries ONE entry per CHANGED key — the fold, not the publication log", async () => {
    // `01-F75`'s clause, and `staff.ts` records what the other reading costs: replaying every
    // published row hands the device a publication log rather than the state it asked for, and on
    // a credential-bearing resource that is a leak. Here it is redundancy — and the rule is
    // uniform across resources by that FR's own instruction.
    const org = freshOrg();
    await save(org, [{ key: "charge.rounding_paisa", value: 100 }]); // v1
    await save(org, [{ key: "charge.rounding_paisa", value: 1000 }]); // v2
    await save(org, [{ key: "tax.posture_matrix", value: TAX_16 }]); // v3

    const delta = await configPage(db, org, 1, 0);
    expect(delta.form).toBe("delta");
    expect(delta.base_version).toBe(1);
    expect(delta.version).toBe(3);
    // TWO rows, not three: `charge.rounding_paisa` changed twice in the window and travels once.
    expect(delta.entries).toEqual([
      { key: "charge.rounding_paisa", value: 1000 },
      { key: "tax.posture_matrix", value: TAX_16 },
    ]);
  });

  it("A5 01-F75/01-F87 (b): a RESET travels as a MARKED entry, never as an absence", async () => {
    const org = freshOrg();
    await save(org, [{ key: "charge.rounding_paisa", value: 1000 }]);
    await save(org, [{ key: "charge.rounding_paisa", deleted: true }]);

    const page = await configPage(db, org, 0, 0);
    expect(page.entries).toEqual([{ key: "charge.rounding_paisa", deleted: true }]);
    // And in a DELTA, where the mark is the only thing that can state the reset at all.
    const delta = await configPage(db, org, 1, 0);
    expect(delta.form).toBe("delta");
    expect(delta.entries).toEqual([{ key: "charge.rounding_paisa", deleted: true }]);
  });

  it("A6 01-F75: a device already AT the current version gets an empty delta, not a snapshot", async () => {
    const org = freshOrg();
    await save(org, [{ key: "charge.rounding_paisa", value: 1000 }]);
    const page = await configPage(db, org, 1, 0);
    expect(page).toEqual({
      form: "delta",
      version: 1,
      base_version: 1,
      entries: [],
      complete: true,
      next_from: 0,
    });
  });
});

describe("§B — 14-F48: the refusals, at the WRITER, and NOTHING is stored", () => {
  const refused = async (
    org: string,
    entries: readonly { key: string; value?: unknown; deleted?: boolean }[],
    match: RegExp,
  ) => {
    const before = await configVersion(db, org);
    const response = await save(org, entries);
    expect(response.status, JSON.stringify(response.body)).toBe(400);
    expect(String(response.body.error)).toMatch(match);
    // **The half that matters.** A refusal that still wrote a version would put the org's whole
    // configuration behind a bad row at every till (`01-F87` (b)).
    expect(await configVersion(db, org)).toBe(before);
  };

  it("B1 01-F87 (a)/14-F48: an UNKNOWN key is refused — a typo is caught once, not frozen for ever", async () => {
    // `01-F60`'s move for prices and `01-F85`'s for tenders: *"a typo is caught once at a failed
    // save instead of frozen forever in an append-only ledger."*
    await refused(
      freshOrg(),
      [{ key: "tax.posture_matrxi", value: TAX_16 }],
      /not a setting this build declares/,
    );
  });

  it("B2 14-F48 (g)/(h)/16-F27: an empty cell and a `none` cell carrying a rate are both refused", async () => {
    const org = freshOrg();
    await refused(
      org,
      [{ key: "tax.posture_matrix", value: { default: { posture: "exclusive" }, by_tender: [] } }],
      /16-F27|14-F48 \(g\)/,
    );
    await refused(
      org,
      [
        {
          key: "tax.posture_matrix",
          value: { default: { posture: "none", rate_bps: 1600 }, by_tender: [] },
        },
      ],
      /14-F48 \(h\)/,
    );
  });

  it("B3 14-F48 (i)/00 §6: a rate that is not an integer in basis points is refused, and NAMED", async () => {
    await refused(
      freshOrg(),
      [
        {
          key: "tax.posture_matrix",
          value: { default: { posture: "exclusive", rate_bps: 0.16 }, by_tender: [] },
        },
      ],
      /0\.16/,
    );
  });

  it("B4 14-F48: an IMPLAUSIBLE rate SAVES — the surface refuses what is not a rate, never what is unusual", async () => {
    // `14-F48`'s own *"what it does not refuse"* clause, which answers `16 §9.9`: any threshold of
    // implausibility is the vendor deciding what tax is legal, which is the rule-pack model R55
    // overruled. **This is a CONTROL** — without it §B could be satisfied by a writer that refused
    // everything.
    const org = freshOrg();
    const response = await save(org, [
      {
        key: "tax.posture_matrix",
        value: { default: { posture: "exclusive", rate_bps: 9999 }, by_tender: [] },
      },
    ]);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect((await configPage(db, org, 0, 0)).entries[0]).toMatchObject({
      key: "tax.posture_matrix",
    });
  });

  it("B5 02-F63 (c): a sub-rupee charge granularity is refused — the measured 01-F17 break", async () => {
    await refused(freshOrg(), [{ key: "charge.rounding_paisa", value: 1 }], /02-F63 \(c\)/);
  });

  it("B6 14-F48 (l)/(m): a nameless or duplicate provider, and a negative threshold, are refused", async () => {
    const org = freshOrg();
    await refused(
      org,
      [
        {
          key: "commission.by_provider",
          value: [
            { provider: "HBL", rate_bps: 150 },
            { provider: "hbl", rate_bps: 200 },
          ],
        },
      ],
      /duplicate provider name/,
    );
    await refused(org, [{ key: "paid_out.approval_threshold_paisa", value: -1 }], /negative/);
  });

  it("B7 01-F75/01-F34: TWO rows for one key in one save are refused", async () => {
    // Two rows for one setting let ARRAY POSITION decide a tax rate, which is `01-F34`'s hazard
    // arriving through a settings screen.
    await refused(
      freshOrg(),
      [
        { key: "charge.rounding_paisa", value: 100 },
        { key: "charge.rounding_paisa", value: 1000 },
      ],
      /unique within/,
    );
  });

  it("B8 01-F87: an EMPTY change set is not a version", async () => {
    const response = await save(freshOrg(), []);
    expect(response.status).toBe(400);
  });

  it("B9 18 §5: the credential is the control — /internal is fail-CLOSED without one", async () => {
    const org = freshOrg();
    expect((await save(org, [{ key: "charge.rounding_paisa", value: 100 }], NO_TOKEN)).status).toBe(
      401,
    );
    expect((await save(org, [{ key: "charge.rounding_paisa", value: 100 }], "wrong")).status).toBe(
      401,
    );
    // A deployment that configured NO credential answers 503 on every /internal route rather than
    // skipping the check — otherwise an unconfigured production gateway accepts settings from
    // anyone who can reach the port.
    const bare = await call(unconfigured, "POST", "/internal/config/publish", {
      token: PUBLISH_SECRET,
      body: {
        org_id: org,
        entries: [{ key: "charge.rounding_paisa", value: 100 }],
        actor_user_id: null,
        now: 1,
      },
    });
    expect(bare.status).toBe(503);
    expect(await configVersion(db, org)).toBe(0);
  });
});

describe("§C — 02 §Layer 2 / 02-F60 (iii): the commission rate NEVER reaches a till", () => {
  it("C1 02 §Layer 2: a `cloud_only` key is stored, and withheld from the device page", async () => {
    // *"cloud-plane reporting only, **never sent to the till** and never a term in any drawer
    // figure"*. The value is the owner's and is kept; what is refused is putting a negotiated bank
    // rate on every counter in the org.
    const org = freshOrg();
    const response = await save(org, [
      { key: "commission.by_provider", value: [{ provider: "HBL", rate_bps: 175 }] },
      { key: "charge.rounding_paisa", value: 1000 },
    ]);
    expect(response.status, JSON.stringify(response.body)).toBe(200);

    const page = await configPage(db, org, 0, 0);
    expect(page.entries).toEqual([{ key: "charge.rounding_paisa", value: 1000 }]);
    expect(page.entries.map((entry) => entry.key)).not.toContain("commission.by_provider");
    // ANTI-VACUITY: the row IS stored — this is a serve-path filter, not a dropped write.
    expect(page.version).toBe(1);
  });

  it("C2 01-F56/01-F76: a commission-only edit still BUMPS the version, and the device refetches", async () => {
    // The stated cost of filtering one artifact rather than minting two: a device notices it is
    // behind, refetches and receives bytes identical to what it held. That buys the property
    // `01-F87` chose a version number FOR — *knowing you hold all of it* — and the alternative, a
    // second version per audience, is `01-F76`'s concatenated key by another route.
    const org = freshOrg();
    await save(org, [{ key: "charge.rounding_paisa", value: 1000 }]);
    const before = await configPage(db, org, 0, 0);
    await save(org, [
      { key: "commission.by_provider", value: [{ provider: "UBL", rate_bps: 200 }] },
    ]);
    const after = await configPage(db, org, 0, 0);

    expect(after.version).toBe(before.version + 1);
    expect(after.entries).toEqual(before.entries);
  });

  it("C3 01-F87 (b): an UNKNOWN key is NOT withheld — the device owns that disposition", async () => {
    // The distinction the filter rests on. Withholding on *"not a device key"* alone would
    // silently drop a key a NEWER writer stored, and `01-F87` (b) gives the device the disposition
    // for that case (ignore it, the cloud is newer) — which it cannot exercise for bytes it never
    // receives. Written straight to the table, because the WRITER refuses an unknown key by
    // design (§B1) and this is the forward-skew case a newer cloud produces.
    const org = freshOrg();
    await save(org, [{ key: "charge.rounding_paisa", value: 1000 }]);
    await db.execute(
      sql`insert into kernel.config_entries (org_id, version, key, value, deleted)
          values (${org}, 2, 'loyalty.stamp_card_size', '8'::jsonb, 0)`,
    );
    await db.execute(
      sql`insert into kernel.config_versions (org_id, version, published_at, actor_user_id)
          values (${org}, 2, 1785000000001, null)`,
    );

    const page = await configPage(db, org, 0, 0);
    expect(page.entries.map((entry) => entry.key)).toContain("loyalty.stamp_card_size");
  });
});

describe("§D — 01-F62/01-F87 (a): the EVENT is a different carrier and lands in a different store", () => {
  it("D1 01-F87: `publishConfig` writes NO event — the ledger record is the API's act", async () => {
    // `01-F87` (a) divides the plane: `config.changed` carries the CHANGE and the artifact carries
    // the VALUE. This service is the artifact's writer; the event is appended by `services/api`,
    // which has the authenticated actor `14-F3` requires and `15-F27` records a shell cannot
    // supply. A gateway that emitted one here would create a second producer of one fact.
    const org = freshOrg();
    await save(org, [{ key: "charge.rounding_paisa", value: 1000 }]);
    expect(await orgEventHistory(db, org)).toEqual([]);
  });

  it("D2 01-F62/01-F4: `config.changed` IS accepted by the org-scoped store, with its payload", async () => {
    // The other half: the type is org-scoped under `01-F62` and now has a payload schema, so a
    // layer-2 change is auditable rather than a runtime error — which `00 §7` (f) measured as the
    // state before this change.
    const org = freshOrg();
    const response = await call(base, "POST", "/internal/org-events", {
      token: PUBLISH_SECRET,
      body: {
        org_id: org,
        type: "config.changed",
        actor_user_id: "user-ayesha",
        server_received_at: 1_785_000_000_000,
        payload: {
          key: "charge.rounding_paisa",
          layer: 2,
          version: 1,
          before: null,
          after: 1000,
        },
      },
    });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const history = await orgEventHistory(db, org);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ type: "config.changed", actor_user_id: "user-ayesha" });
  });
});

describe("§E — 01-F87/14-F45: the READ every cloud surface resolves an org's posture through", () => {
  it("E1 01-F87: `/internal/config/published` answers the artifact a device would receive", async () => {
    // The gate this plane was built to close: *"nothing in `services/api` or `services/storefront`
    // can resolve an org's posture, so the owner summary cannot tell two restaurants apart and a
    // storefront total will not match what that restaurant's till charges."*
    const org = freshOrg();
    await save(org, [
      { key: "tax.posture_matrix", value: TAX_16 },
      { key: "commission.by_provider", value: [{ provider: "HBL", rate_bps: 175 }] },
    ]);
    const response = await call(base, "GET", `/internal/config/published?org_id=${org}`, {
      token: PUBLISH_SECRET,
    });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toEqual({
      version: 1,
      // ONE answer, and it is the device's — so a cloud reader and a till resolve the SAME bytes.
      // The `cloud_only` commission row is not in it, and `14-F24`'s report will need its own read.
      entries: [{ key: "tax.posture_matrix", value: TAX_16 }],
    });
  });

  it("E2 TWO RESTAURANTS, TWO POSTURES — the pilot's actual requirement", async () => {
    // **The measurement the founder's brief is about.** Two orgs on one deployment, each with its
    // own posture, both resolvable server-side. Under the env-variable stopgap this was
    // unrepresentable: one process, one `RESTOS_TAX_POSTURE`.
    const karachi = freshOrg();
    const lahore = freshOrg();
    await save(karachi, [
      {
        key: "tax.posture_matrix",
        value: { default: { posture: "exclusive", rate_bps: 1600 }, by_tender: [] },
      },
    ]);
    await save(lahore, [
      {
        key: "tax.posture_matrix",
        value: { default: { posture: "none", rate_bps: 0 }, by_tender: [] },
      },
    ]);

    const a = await configPage(db, karachi, 0, 0);
    const b = await configPage(db, lahore, 0, 0);
    expect(a.entries).toEqual([
      {
        key: "tax.posture_matrix",
        value: { default: { posture: "exclusive", rate_bps: 1600 }, by_tender: [] },
      },
    ]);
    expect(b.entries).toEqual([
      {
        key: "tax.posture_matrix",
        value: { default: { posture: "none", rate_bps: 0 }, by_tender: [] },
      },
    ]);
    // `01-F71`: one org's settings never appear in another's artifact.
    expect(JSON.stringify(a.entries)).not.toEqual(JSON.stringify(b.entries));
  });

  it("E3 01-F75: `at_version` is a CONTINUATION, never a SELECTOR — a first page gets CURRENT", async () => {
    // `staff.ts` records what the other reading cost on a credential-bearing resource: a caller
    // naming a historical version on a FIRST page was served that historical fold. The rule is
    // uniform across resources by `01-F75`'s own instruction, so it is asserted here rather than
    // inherited.
    const org = freshOrg();
    await save(org, [{ key: "charge.rounding_paisa", value: 100 }]); // v1
    await save(org, [{ key: "charge.rounding_paisa", value: 1000 }]); // v2

    const firstPage = await configPage(db, org, 0, 0, 1);
    expect(firstPage.version).toBe(2);
    expect(firstPage.entries).toEqual([{ key: "charge.rounding_paisa", value: 1000 }]);

    // `01-F77`: a populated key never answers `version: 0`, whatever `at_version` says.
    const zeroed = await configPage(db, org, 0, 1, 0);
    expect(zeroed.version).toBe(2);
  });
});
