/**
 * **`14-F41`'s ACTOR and `01-F71` (b)'s ORG on the pairing mint — asserted, because a mutation run
 * said neither was.**
 *
 * ⚠ **This is NOT an oracle**, and it is filed here rather than in `__acceptance__/` for exactly the
 * reason `packages/domain/src/export-permission.test.ts` gives for its own placement: the FR, the
 * procedure and this assertion were written in one change, so a hand-written assertion sitting
 * beside the independently-authored oracles would be a claim about authorship the corpus can no
 * longer check (`20 §4.3`, `24-F5`). The independent oracle for the half these procedures drive is
 * `services/sync-gateway/src/__acceptance__/pairing-claim.test.ts`, authored from spec text by a
 * session that wrote no implementation.
 *
 * ## The measurement that produced it
 *
 * Two mutants, each exactly one branch, run against the FULL `services/api` suite with the pairing
 * work committed as the control (**403/403 green, `REAL_EXIT=0`** read from a marker written inside
 * the log):
 *
 *     BO8 — the mint's `actor_user_id` becomes a constant, not `ctx.subject.user_id`  → 0 of 403
 *     BO9 — the mint's `org_id` is read from the REQUEST, falling back to the subject → 0 of 403
 *
 * **BO9 is the one that matters and it is `01-F71` (b) verbatim** — *"the org is taken from the
 * authenticated SUBJECT and never from the request"* — on an act that mints a device credential.
 * `__acceptance__/tenant-isolation.test.ts` §3 sweeps every mutating procedure as tenant A with
 * B-flavoured inputs and re-snapshots *what B can observe*; a pairing minted into B's org is not in
 * that snapshot, because the snapshot predates this procedure. So the sweep is correct and blind,
 * which is the shape `01-F71` insists a test be written for: *"each point carries a test that FAILS
 * when that point alone is removed. Reading is not evidence and neither is a green suite."*
 *
 * **BO8 is `14-F41`'s own clause** — *"the ACTOR is the owner who ISSUED the code"* — and the actor
 * is the entire reason this act belongs on an authenticated screen rather than on the shell command
 * that already existed (`14-F30`: *"registration today is an operator command on the service host
 * with no authenticated user, so the only actor it could write is `null`"*). It is stored on the
 * pending row today and becomes `device.registered`'s attribution the day `01 §4`'s missing payload
 * schema lands, so a wrong value here is a wrong value in an append-only store later.
 *
 * ## Why the port is a RECORDER and not a fake gateway
 *
 * Both properties are about **what the resolver passed**, and a fake gateway would only show what
 * survived a round trip. `01-F71` draws the same distinction for the day ledger: *"the difference
 * between 'the answer was scoped' and 'the request was scoped' is exactly enforcement point (b),
 * and only one of the two is visible in a response body."*
 */

import { hashPin } from "@restos/domain";
import superjson from "superjson";
import { beforeAll, describe, expect, it } from "vitest";
import type { DeviceDirectory } from "./devices.js";
import { createApiServer } from "./server.js";
import { createMemoryUserStore, type UserRecord } from "./users.js";

const ORG = "org-pairing-authority";
const OTHER_ORG = "org-somebody-else";
const BRANCH = "branch-pairing-authority";
const SECRET = "pairing-authority-session-secret-not-a-real-one";
const PASSWORD = "a-bootstrap-owner-password";
const OWNER_ID = "user-owner-pairing";

let clock = 1_800_000_000_000;
const now = (): number => (clock += 1_000);

/** Everything the resolver handed the port, in order. This is the evidence. */
const minted: {
  org_id: string;
  branch_id: string;
  device_class: string;
  display_name: string;
  actor_user_id: string;
  now: number;
}[] = [];

/**
 * A recording port. Deliberately **not defensive** — it accepts whatever org it is handed, exactly
 * as a Postgres row would, so the enforcement point under test is the SERVICE's and not this
 * fixture's (`tenant-isolation.test.ts`'s rule 1, applied here).
 */
const recorder = (): DeviceDirectory => ({
  list: async () => [],
  mintPairing: async (input) => {
    minted.push({ ...input });
    return { code: "12345678", device_id: "device-minted", expires_at: input.now + 900_000 };
  },
  pairings: async () => [],
  cancelPairing: async () => ({ cancelled: true }),
  revoke: async () => {
    throw new Error("not used here");
  },
  recordRevocation: async () => {
    throw new Error("not used here");
  },
  revocations: async () => [],
});

let app: Awaited<ReturnType<typeof createApiServer>>;
let bearer = "";

const users = async (): Promise<UserRecord[]> => [
  {
    user_id: OWNER_ID,
    org_id: ORG,
    email: "owner@pairing-authority.test",
    password_hash: await hashPin(PASSWORD),
    assignments: [{ role: "owner", branch_id: null, status: "active" }],
  },
];

const post = async (path: string, input: unknown): Promise<{ status: number; body: unknown }> => {
  const response = await app.inject({
    method: "POST",
    url: `/trpc/${path}`,
    headers: { authorization: bearer, "content-type": "application/json" },
    payload: JSON.stringify(superjson.serialize(input)),
  });
  return { status: response.statusCode, body: response.json() };
};

beforeAll(async () => {
  app = await createApiServer({
    store: createMemoryUserStore(await users()),
    sessionSecret: SECRET,
    now,
    devices: recorder(),
  });
  const signedIn = await app.inject({
    method: "POST",
    url: "/trpc/auth.login",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify(
      superjson.serialize({ email: "owner@pairing-authority.test", password: PASSWORD }),
    ),
  });
  const parsed = signedIn.json() as { result: { data: { json: { token: string } } } };
  bearer = `Bearer ${parsed.result.data.json.token}`;
});

describe("14-F41/01-F71 (b) — who the mint is attributed to, and whose org it lands in", () => {
  it("14-F41: the actor is the SIGNED-IN owner, never a value the caller could choose", async () => {
    minted.length = 0;
    const reply = await post("devices.mintPairing", {
      branch_id: BRANCH,
      device_class: "counter_electron",
      display_name: "Front counter",
    });
    expect(reply.status, JSON.stringify(reply.body)).toBe(200);
    expect(
      minted.map((call) => call.actor_user_id),
      "14-F41: 'the ACTOR is the owner who ISSUED the code — the authenticated act is authorising " +
        "this device to join, which is the fact an audit trail wants'. 14-F30 records what the " +
        "absence of one costs: the shell command 'has no authenticated user, so the only actor it " +
        "could write is null', permanently, in an append-only store.",
    ).toEqual([OWNER_ID]);
  });

  it("01-F71 (b): a caller who NAMES another org mints in her own, or not at all", async () => {
    minted.length = 0;
    const reply = await post("devices.mintPairing", {
      // The field the procedure's schema does not declare. Whether it is refused by the schema or
      // ignored by the resolver is not pinned — `28-F5` (b) prefers the refusal and either is
      // legal — but the org the port is handed must never be this one.
      org_id: OTHER_ORG,
      branch_id: BRANCH,
      device_class: "counter_electron",
      display_name: "Front counter",
    });
    expect(
      minted.map((call) => call.org_id),
      "01-F71 (b): 'the org is taken from the authenticated SUBJECT and never from the request'. " +
        "01-F80 (a) makes the same point one plane over about the CLAIM — 'a caller-stated org_id " +
        "would be a client role claim' — and this is the authenticated end of the same act. A " +
        "credential minted into another tenant's org is 00 §5.4's boundary crossed by the one " +
        "surface that hands out device identities.",
    ).not.toContain(OTHER_ORG);
    if (reply.status === 200) {
      expect(
        minted.map((call) => call.org_id),
        "…and it landed in HER org",
      ).toEqual([ORG]);
    } else {
      expect(minted, "a refused over-claim mints nothing at all").toEqual([]);
    }
  });

  it("CONTROL: the recorder is genuinely reached, so the two absences above are evidence", async () => {
    minted.length = 0;
    await post("devices.mintPairing", {
      branch_id: BRANCH,
      device_class: "kitchen",
      display_name: "Kitchen screen",
    });
    expect(
      minted,
      "without this, both assertions above pass against a procedure that never calls the port",
    ).toHaveLength(1);
    expect(minted[0]?.branch_id).toBe(BRANCH);
    expect(minted[0]?.device_class).toBe("kitchen");
    expect(minted[0]?.display_name).toBe("Kitchen screen");
  });
});
