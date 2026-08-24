/**
 * ACCEPTANCE — `06-F32`/`28-F4`: the gate on a surface with no subject and no role.
 *
 * ⚠ **§C IS THE POINT OF THIS FILE, and it is aimed at a mistake the DESIGN made.**
 * `plans/storefront/design.md` §2.4 proposes one mechanism — *"every storefront procedure
 * declares the capability it is gated on, and the server refuses to boot otherwise"*. `28-F4`'s
 * closing bullet retires exactly that formulation: *"'an ungated or unentitled procedure is a
 * boot failure' is therefore wrong … what boot can see is a missing DECLARATION."* Entitlement is
 * a per-org runtime fact (`28-F5`) and a boot check has no org to resolve against.
 *
 * A build that implemented only the declaration half would LOOK complete — every procedure
 * labelled, a boot assertion that passes, a clean `seams:check` — and would never check a single
 * tenant's entitlement. §C is the assertion that both halves happen, because no structural rail
 * in this repo can see the difference.
 */
import { describe, expect, it } from "vitest";
import {
  type Capability,
  type EntitlementSource,
  entitled,
  STOREFRONT_CAPABILITY,
} from "../entitlement.js";
import { originIdentity } from "../identity.js";
import { createStorefrontOrigin, type LamportSource } from "../origin.js";
import { inMemoryOutbox } from "../outbox.js";
import { createPlacement, NotEntitledError } from "../placement.js";
import {
  assertEveryProcedureDeclaresEntitlement,
  ENTITLEMENT_EXEMPT,
  storefrontRouter,
} from "../router.js";

const ORG = "org-karachi";
const OTHER_ORG = "org-lahore";

const lamport = (): LamportSource => {
  let next = 0;
  return {
    reserve: async (n) => {
      const first = next;
      next += n;
      return first;
    },
  };
};

let ids = 0;
const placement = (source: EntitlementSource) =>
  createPlacement({
    origin: createStorefrontOrigin({
      identity: originIdentity({
        org_id: ORG,
        branch_id: "branch-clifton",
        device_id: "device-storefront-clifton",
      }),
      lamport: lamport(),
      clock: () => 1_755_000_000_000,
      newId: () => `0193b0f0-0000-7000-8000-${String(++ids).padStart(12, "0")}`,
    }),
    outbox: inMemoryOutbox(),
    entitlement: source,
  });

const CART = {
  order_id: "order-sf-1",
  lines: [{ line_id: "line-1", item_id: "item-burger", qty: 1, unit_price_paisa: 45_000 }],
};

const entitledOrgs =
  (...orgs: string[]): EntitlementSource =>
  async (org_id) =>
    orgs.includes(org_id) ? { capabilities: new Set<Capability>([STOREFRONT_CAPABILITY]) } : null;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — 06-F32 (i): BOOT sees a DECLARATION.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 06-F32 — every procedure declares a capability or is exempt, checked at boot", () => {
  it("the shipped router passes", () => {
    expect(() => assertEveryProcedureDeclaresEntitlement(storefrontRouter)).not.toThrow();
  });

  it("a router with an undeclared procedure is REFUSED — the failing case is reachable", () => {
    // Takes the router as a parameter for this reason: a check that can only ever be pointed at
    // the one correct router is a check nothing has verified (`services/api` records the lesson).
    const rogue = {
      _def: { procedures: { placeOrder: { _def: { meta: undefined } } } },
    };
    expect(() => assertEveryProcedureDeclaresEntitlement(rogue)).toThrow(/06-F32/);
  });

  it("the exemption list is NAMED and small — `health` resolves no org", () => {
    expect([...ENTITLEMENT_EXEMPT]).toEqual(["health"]);
  });

  it("28-F4: the capability is 15-F5's channel flag, not a per-procedure key", () => {
    // "Minting a capability name to give a procedure something to declare would be inventing the
    // vocabulary this clause closes." Both writing procedures declare the SAME one.
    const metas = Object.entries(storefrontRouter._def.procedures)
      .filter(([name]) => !ENTITLEMENT_EXEMPT.has(name))
      .map(([, p]) => (p as { _def: { meta?: { entitlement?: string } } })._def.meta?.entitlement);
    expect(metas.length).toBeGreaterThan(1);
    expect(new Set(metas)).toEqual(new Set([STOREFRONT_CAPABILITY]));
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — 28-F4: an absent record is REFUSED, and default-allow is the dangerous reading.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 28-F4/28-F6 — entitlement resolves from the org's record", () => {
  it("an entitled org is entitled", async () => {
    expect(await entitled(entitledOrgs(ORG), ORG, STOREFRONT_CAPABILITY)).toBe(true);
  });

  it("an org with NO record is NOT entitled — default-allow would publish a storefront for every tenant", async () => {
    expect(await entitled(entitledOrgs(ORG), OTHER_ORG, STOREFRONT_CAPABILITY)).toBe(false);
  });

  it("a record that does not carry the flag is not entitled", async () => {
    const source: EntitlementSource = async () => ({ capabilities: new Set<Capability>() });
    expect(await entitled(source, ORG, STOREFRONT_CAPABILITY)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — THE CASE THAT MATTERS: declaring is not checking.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 06-F32 (ii)/28-F4 — the RUNTIME resolution actually happens, and nothing else proves it", () => {
  it("an unentitled org's order is REFUSED and NOTHING is written to the ledger", async () => {
    // The whole point. §A can pass against a service that resolves entitlement nowhere; this
    // cannot. And the ledger assertion is the second half: a refusal that still appended would
    // be permanent under `01-F1`.
    const outbox = inMemoryOutbox();
    const p = createPlacement({
      origin: createStorefrontOrigin({
        identity: originIdentity({
          org_id: OTHER_ORG,
          branch_id: "branch-x",
          device_id: "device-x",
        }),
        lamport: lamport(),
        clock: () => 1,
        newId: () => "0193b0f0-0000-7000-8000-0000000000ff",
      }),
      outbox,
      entitlement: entitledOrgs(ORG),
    });
    await expect(p.place(OTHER_ORG, CART)).rejects.toBeInstanceOf(NotEntitledError);
    expect(outbox.all(), "an unentitled order must reach no ledger at all").toHaveLength(0);
  });

  it("an entitled org's order IS written — the gate refuses, it does not refuse everything", async () => {
    // The control. Without it, an implementation that threw unconditionally would pass the test
    // above and prove nothing about attribution.
    const result = await placement(entitledOrgs(ORG)).place(ORG, CART);
    expect(result.order_id).toBe(CART.order_id);
  });

  it("06-F19's CANCEL is gated too — a second door into the same ledger", async () => {
    await expect(
      placement(entitledOrgs(ORG)).cancel(OTHER_ORG, { order_id: "o1", reason: "changed my mind" }),
    ).rejects.toBeInstanceOf(NotEntitledError);
  });

  it("06-F1/00 §5.4: an org_id in the REQUEST BODY cannot move the tenant", async () => {
    /**
     * ⚠ **ADDED AFTER A SURVIVING MUTANT, and it is the most dangerous one in the matrix.**
     *
     * Replacing `ctx.org_id` with `input.org_id ?? ctx.org_id` in `router.ts` killed NOTHING —
     * 29/29 green — because no fixture in this suite had ever sent an `org_id` in a request body.
     * That is `L10`'s shape exactly: the mechanism (host-based tenant resolution, `06-F1`) was
     * built correctly and never aimed at the case that matters, which is a public unauthenticated
     * form field deciding which tenant's ledger gets written.
     *
     * It is asserted at the ROUTER's input schema rather than only at `placement`, because that
     * is where the mutant lived: a body key that the schema does not declare must not survive
     * into a call, and an entitled org placing an order "as" another org is a cross-tenant write
     * with a form field for a key (`00 §5.4` makes org scoping absolute).
     */
    const schema = (
      storefrontRouter._def.procedures.placeOrder as {
        _def: { inputs: Array<{ parse: (v: unknown) => unknown }> };
      }
    )._def.inputs[0];
    const parsed = schema?.parse({
      order_id: "order-1",
      lines: CART.lines,
      org_id: OTHER_ORG,
    }) as Record<string, unknown>;
    expect(
      parsed.org_id,
      "06-F1 resolves the tenant from the HOST; an org_id accepted from a public request body " +
        "is a cross-tenant write with a form field for a key",
    ).toBeUndefined();
  });

  it("28-F4: the refusal is COMMERCIAL and says so — it is not an authorization failure", async () => {
    // "Fusing them makes a lapsed subscription and an unauthorised cashier the same refusal to
    // every caller and every log line." The message is the only place that distinction survives.
    await expect(placement(entitledOrgs(ORG)).place(OTHER_ORG, CART)).rejects.toThrow(/28-F4/);
  });
});
