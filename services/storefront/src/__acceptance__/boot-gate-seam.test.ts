/**
 * ACCEPTANCE — `06-F32` (i): **the boot assertion has a CALL SITE, and this is what proves it.**
 *
 * ⚠ **DELETING `assertEveryProcedureDeclaresEntitlement(storefrontRouter)` FROM `server.ts` KILLED
 * NOTHING — 31 passed (31), REAL_EXIT=0.** The existing §A calls the assertion *directly*, so it
 * proves the function works and says nothing about whether any host runs it; `router.ts` claims
 * the mechanism's whole value is that *"this catches it on the day the service tries to serve"*,
 * which is a claim about the call site. That is `L7` in one line: mutate the SEAM, not the logic.
 *
 * The mechanism here is a module mock that swaps ONLY `storefrontRouter` for a router carrying an
 * undeclared procedure, keeping the real assertion. So:
 *
 *   - call site present + rogue router  → `createStorefrontServer` THROWS  (this file passes)
 *   - call site deleted, or replaced by a no-op → it builds happily        (this file fails)
 *
 * It lives in its own file because `vi.mock` is module-wide, and a mocked router would silently
 * weaken every other assertion in a shared file — which is how a fix for a vacuous test becomes
 * one (`L10`).
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../router.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../router.js")>();
  const { initTRPC } = await import("@trpc/server");
  const t = initTRPC.context<{ org_id: string }>().meta<{ entitlement?: string }>().create();
  // A router shaped exactly like the shipped one except that `placeOrder` declares NO capability
  // and is on no exemption list — `06-F32` (i)'s failing case, arriving through the same import
  // the host uses. The assertion itself is the REAL one.
  return {
    ...actual,
    storefrontRouter: t.router({
      health: t.procedure.query(() => ({ ok: true })),
      placeOrder: t.procedure.mutation(() => ({ order_id: "x" })),
    }),
  };
});

const { createStorefrontServer } = await import("../server.js");
const { fixedCatalog } = await import("./catalog-fixture.js");
const { inMemoryOutbox } = await import("../outbox.js");

beforeAll(() => {
  process.env.RESTOS_ORG_ID = "org-karachi";
  process.env.RESTOS_BRANCH_ID = "branch-clifton";
  process.env.RESTOS_DEVICE_ID = "device-storefront-clifton";
  process.env.RESTOS_STOREFRONT_HOST = "burger-house.restos.pk";
});

describe("06-F32 (i) — the HOST refuses to build around an undeclared procedure", () => {
  it("createStorefrontServer THROWS, naming the FR and the procedure", () => {
    expect(() =>
      createStorefrontServer({
        outbox: inMemoryOutbox(),
        catalog: fixedCatalog({}),
        entitlement: async () => ({ status: "absent" }),
        lamport: { reserve: async () => 0 },
      }),
    ).toThrow(/06-F32.*placeOrder/s);
  });
});
