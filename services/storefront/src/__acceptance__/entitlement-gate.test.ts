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
  entitlementFor,
  STOREFRONT_CAPABILITY,
} from "../entitlement.js";
import { originIdentity } from "../identity.js";
import { createStorefrontOrigin, type LamportSource } from "../origin.js";
import { inMemoryOutbox } from "../outbox.js";
import { CrossTenantError, createPlacement, NotEntitledError } from "../placement.js";
import {
  assertEveryProcedureDeclaresEntitlement,
  ENTITLEMENT_EXEMPT,
  storefrontRouter,
} from "../router.js";
import { fixedCatalog } from "./catalog-fixture.js";

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
        public_host: "burger-house.restos.pk",
      }),
      catalog: fixedCatalog({ "item-burger": 45_000 }),
      lamport: lamport(),
      clock: () => 1_755_000_000_000,
      newId: () => `0193b0f0-0000-7000-8000-${String(++ids).padStart(12, "0")}`,
    }),
    outbox: inMemoryOutbox(),
    entitlement: source,
  });

const CART = {
  order_id: "order-sf-1",
  lines: [{ line_id: "line-1", item_id: "item-burger", qty: 1 }],
};

const entitledOrgs =
  (...orgs: string[]): EntitlementSource =>
  async (org_id) =>
    orgs.includes(org_id)
      ? { status: "record", record: { capabilities: new Set<Capability>([STOREFRONT_CAPABILITY]) } }
      : { status: "absent" };

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
    expect(await entitlementFor(entitledOrgs(ORG), ORG, STOREFRONT_CAPABILITY)).toBe("entitled");
  });

  it("an org with NO record is NOT entitled — default-allow would publish a storefront for every tenant", async () => {
    expect(await entitlementFor(entitledOrgs(ORG), OTHER_ORG, STOREFRONT_CAPABILITY)).toBe(
      "not_entitled",
    );
  });

  it("a record that does not carry the flag is not entitled", async () => {
    const source: EntitlementSource = async () => ({
      status: "record",
      record: { capabilities: new Set<Capability>() },
    });
    expect(await entitlementFor(source, ORG, STOREFRONT_CAPABILITY)).toBe("not_entitled");
  });

  it("28-F3's corollary: UNREADABLE is its own answer, not `not_entitled`", async () => {
    /**
     * `28-F3`: *"`entitled(org, capability)` distinguishes 'this org is not entitled' from 'this
     * org's entitlement state could not be read' … a resolver that collapses them is wrong in the
     * direction that stops service."* The source type had exactly TWO inhabitants
     * (`Record | null`), so the distinction was unrepresentable and a store timeout was reported
     * to a customer as *"this restaurant does not have online ordering"* — which is false, and
     * which does not clear when the store comes back.
     */
    const unreadable: EntitlementSource = async () => ({
      status: "unreadable",
      reason: "entitlement store timed out",
    });
    expect(await entitlementFor(unreadable, ORG, STOREFRONT_CAPABILITY)).toBe("unreadable");
  });

  it("a source that THROWS is unreadable — never a finding that the org lacks the flag", async () => {
    const thrower: EntitlementSource = async () => {
      throw new Error("ECONNRESET");
    };
    expect(await entitlementFor(thrower, ORG, STOREFRONT_CAPABILITY)).toBe("unreadable");
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
          public_host: "other.restos.pk",
        }),
        catalog: fixedCatalog({ "item-burger": 45_000 }),
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
    // The origin here stamps ORG, so asking for OTHER_ORG is refused by `06-F34` (b) BEFORE the
    // commercial gate is consulted. Both refusals are correct and they are different answers;
    // §E is where the entitlement half of `cancel` is exercised on its own tenant.
    await expect(
      placement(entitledOrgs(ORG)).cancel(OTHER_ORG, { order_id: "o1", reason: "changed my mind" }),
    ).rejects.toBeInstanceOf(CrossTenantError);
  });

  it("the CANCEL door is entitlement-gated on its OWN tenant too", async () => {
    await expect(
      placement(entitledOrgs("someone-else")).cancel(ORG, {
        order_id: "o1",
        reason: "changed my mind",
      }),
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
    await expect(placement(entitledOrgs("nobody")).place(ORG, CART)).rejects.toThrow(/28-F4/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — 06-F34 (b): the tenant the GATE resolved and the tenant the ENVELOPE carries are one.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 06-F34 (b)/00 §5.4 — the gate and the ledger cannot disagree about the tenant", () => {
  /**
   * ⚠ **REPRODUCED BEFORE THE CHECK EXISTED, AND IT PASSED EVERY TEST IN THIS FILE:**
   *
   *     XTENANT place() returned: xtenant
   *     XTENANT events landed in org: [ 'org-A-victim' ]      // entitlement PASSED for org-B
   *
   * `org_id` reached only the gate; the envelope took the origin's own identity, and nothing
   * compared them — `createStorefrontOrigin` did not even expose its identity, so `placement`
   * could not have compared if it had wanted to. §C's refusals are all cases where the org is
   * UNENTITLED, so the refusal they observe is the wrong refusal.
   */
  const attackerEntitled = entitledOrgs(OTHER_ORG);

  it("an entitled OTHER org cannot place into this origin's ledger", async () => {
    const outbox = inMemoryOutbox();
    const p = createPlacement({
      origin: createStorefrontOrigin({
        identity: originIdentity({
          org_id: ORG,
          branch_id: "branch-clifton",
          device_id: "device-storefront-clifton",
          public_host: "burger-house.restos.pk",
        }),
        catalog: fixedCatalog({ "item-burger": 45_000 }),
        lamport: lamport(),
        clock: () => 1_755_000_000_000,
        newId: () => "0193b0f0-0000-7000-8000-0000000000aa",
      }),
      outbox,
      entitlement: attackerEntitled,
    });
    await expect(p.place(OTHER_ORG, CART)).rejects.toBeInstanceOf(CrossTenantError);
    expect(outbox.all(), "01-F1 makes a cross-tenant write permanent").toHaveLength(0);
  });

  it("the refusal names BOTH orgs and cites the isolation law, not the commercial one", async () => {
    // A cross-tenant write refused as `28-F4` would be read as a lapsed subscription, and the
    // deployment defect behind it would be looked for in billing.
    await expect(placement(attackerEntitled).place(OTHER_ORG, CART)).rejects.toThrow(
      /06-F34.*org-karachi/s,
    );
    await expect(placement(attackerEntitled).place(OTHER_ORG, CART)).rejects.not.toThrow(/28-F4/);
  });

  it("the origin EXPOSES the identity the comparison rests on", () => {
    // Without this the check is unwritable, which is why it was absent rather than wrong.
    const o = createStorefrontOrigin({
      identity: originIdentity({
        org_id: ORG,
        branch_id: "branch-clifton",
        device_id: "device-storefront-clifton",
        public_host: "burger-house.restos.pk",
      }),
      catalog: fixedCatalog({}),
      lamport: lamport(),
      clock: () => 1,
      newId: () => "0193b0f0-0000-7000-8000-0000000000bb",
    });
    expect(o.identity.org_id).toBe(ORG);
  });
});
