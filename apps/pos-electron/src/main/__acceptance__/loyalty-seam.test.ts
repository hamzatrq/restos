// Acceptance tests — **`02-F64`'s link and `17-F24`'s campaign arm AS THE PRODUCT REACHES THEM.**
//
// This file exists for the defect `AGENTS.md` records fifteen times: a correct subsystem with no
// seam to the product. Everything under test here is correct and mutation-proved one package over
// — `packages/domain`'s `campaign-model.test.ts` owns the arithmetic, `packages/sync-client`'s
// `customer-orders-*.test.ts` own the fold — and NONE of that is evidence that a cashier's till
// ever calls any of it.
//
// **`pnpm seams:check` sees exactly one of the four seams below** (Rule B watches
// `AuthorizedWritesDeps.campaignCitation`, an optional member of an options bag on a factory
// shipping code already calls). It cannot see the other three: a method on a returned object is
// neither an unreached export nor an optional member, and *a port supplied with a STUB is still a
// supply*. So they are written by hand, and each one names the mutant it kills.
//
// ⚠ **§D IS A SOURCE READ AND SAYS SO.** `main/index.ts` builds an Electron app at module scope and
// no suite in this package can import it, so the guard on "does the host wire this" is a string
// match — the same weak instrument `line-advance-seam.test.ts` §A and `catalog-health-seam.test.ts`
// §C already use, and it is weak in a known way: it proves the call site exists and nothing about
// what it passes.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveAging } from "@restos/device-config";
import { type DeviceStore, openStore } from "@restos/sync-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CAMPAIGNS_ENV,
  CAMPAIGNS_VERSION_ENV,
  type CampaignArtifact,
  campaignCitationFor,
  resolveCampaignArtifact,
} from "../campaigns";
import { createGateway, type GatewayDeps } from "../gateway";

const IDENTITY = {
  org_id: "00000000-0000-7000-8000-0000000000d1",
  branch_id: "00000000-0000-7000-8000-0000000000d2",
  device_id: "00000000-0000-7000-8000-0000000000d3",
} as const;

const PHONE = "+923001234567";
const DIALLED = "03001234567";

let dir: string;
let store: DeviceStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "restos-loyalty-seam-"));
  store = openStore({ path: join(dir, "device.db"), identity: IDENTITY });
});
afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

/** `17-F14`'s programme: every 10th order, free item, whole org, no minimum. */
const LOYALTY_ROW = {
  campaign_id: "camp-loyalty",
  kind: "account_loyalty",
  status: "active",
  valid_from: null,
  valid_to: null,
  branches: null,
  channels: [],
  item_scope: null,
  min_order_paisa: 0,
  benefit: { form: "free_item", value: 0, item_id: "item-coffee", cap_paisa: null },
  proof: "none",
  code: null,
  use_limit: "unlimited",
  requires_customer: true,
  every_n: 10,
} as const;

/** R71's own case: 50% off, capped at PKR 10,000. */
const BANK_ROW = {
  ...LOYALTY_ROW,
  campaign_id: "camp-bank",
  kind: "auto_deal",
  benefit: { form: "percent_bps", value: 5000, item_id: null, cap_paisa: 1_000_000 },
  requires_customer: false,
  every_n: null,
} as const;

const artifactOf = (rows: readonly object[], version = 3): CampaignArtifact =>
  resolveCampaignArtifact({
    [CAMPAIGNS_ENV]: JSON.stringify(rows),
    [CAMPAIGNS_VERSION_ENV]: String(version),
  });

const gatewayOver = (over: Partial<GatewayDeps> = {}) =>
  createGateway({
    store,
    catalog: () => null,
    menu: () => [],
    priceOf: () => 45_000,
    actor: "Counter 1",
    session: () => ({ user_id: "user-ayesha", display_name: "Ayesha" }),
    deviceLabel: "Counter 1",
    training: false,
    reachability: () => ({ lan: "ok", hub: "ok", cloud: "ok" }),
    blockedCursor: () => null,
    catalogRefusal: () => null,
    businessDay: () => "2026-08-24",
    panelPpi: () => 100.5,
    aging: resolveAging(undefined).thresholdsFor,
    panelFit: () => null,
    campaigns: () => artifactOf([LOYALTY_ROW]),
    ...over,
  });

const src = (file: string): string =>
  readFileSync(new URL(`../${file}`, import.meta.url).pathname, "utf8");

// ── A. `02-F64` — the link has a PRODUCER, and it normalizes at the writer ────────────────────

describe("§A 02-F64 — the emitter for the event four features waited on", () => {
  it("`linkCustomer` appends `order.customer_linked` with 01-F23's KEY, not the digits pressed", () => {
    // `registry.ts` puts normalization at the WRITER: the renderer sends `03001234567` and the
    // ledger must hold `+923001234567`, or `02-F28`'s repeat customer is invisible to the screen
    // built to find her while every unit test passes.
    const gateway = gatewayOver();
    gateway.linkCustomer({ order_id: "ord-1", dialled: DIALLED });

    const row = store.customerOrders().find((r) => r.phone_e164 === PHONE);
    expect(row, "the link must be readable back through the fold this device runs").toBeDefined();
    expect(row?.linked_orders.map((o) => o.order_id)).toEqual(["ord-1"]);
  });

  it("`02-F41`/`02-F45` — the actor rides the ENVELOPE and is never copied into the payload", () => {
    const gateway = gatewayOver();
    const { id } = gateway.linkCustomer({ order_id: "ord-1", dialled: DIALLED });
    const envelope = store.readAllEvents().find((e) => e.id === id);
    expect(envelope?.actor_user_id).toBe("user-ayesha");
    expect(Object.keys(envelope?.payload as object).sort()).toEqual(["order_id", "phone_e164"]);
  });

  it("⚠ `01-F17` — an unusable number REFUSES THE LINK AND NOTHING ELSE", () => {
    // Commandment 4. The throw must not be read as a sale being blocked: `registry.ts` says it in
    // terms for the customer file, and `02-F64` inherits it. The order is appended by a different
    // call and is untouched here.
    const gateway = gatewayOver();
    expect(() => gateway.linkCustomer({ order_id: "ord-1", dialled: "12" })).toThrow(/01-F23/);
    expect(store.customerOrders()).toEqual([]);
    // And the order path still works afterwards — the refusal left nothing wedged.
    expect(() => gateway.linkCustomer({ order_id: "ord-1", dialled: DIALLED })).not.toThrow();
  });
});

// ── B. `17-F17` — the reward is RENDERED, from the fold and the artifact together ─────────────

describe("§B 17-F17/17-F23 — `loyaltyFor` renders over two counts and the campaign", () => {
  const settleTen = () => {
    const gateway = gatewayOver();
    for (let i = 0; i < 10; i += 1) {
      gateway.linkCustomer({ order_id: `ord-${i}`, dialled: DIALLED });
      store.append({
        id: crypto.randomUUID(),
        org_id: IDENTITY.org_id,
        branch_id: IDENTITY.branch_id,
        device_id: IDENTITY.device_id,
        actor_user_id: "user-ayesha",
        device_created_at: Date.now(),
        type: "order.settlement_closed",
        schema_version: 1,
        payload: { order_id: `ord-${i}`, billed_paisa: 45_000 },
        refs: [],
      });
    }
    return gateway;
  };

  it("nine settled orders is nine — `1 more order to a reward`", () => {
    const gateway = gatewayOver();
    for (let i = 0; i < 9; i += 1) {
      gateway.linkCustomer({ order_id: `ord-${i}`, dialled: DIALLED });
      store.append({
        id: crypto.randomUUID(),
        org_id: IDENTITY.org_id,
        branch_id: IDENTITY.branch_id,
        device_id: IDENTITY.device_id,
        actor_user_id: null,
        device_created_at: Date.now(),
        type: "order.settlement_closed",
        schema_version: 1,
        payload: { order_id: `ord-${i}`, billed_paisa: 45_000 },
        refs: [],
      });
    }
    const status = gateway.loyaltyFor(PHONE);
    expect(status?.eligible).toBe(9);
    expect(status?.available).toBe(0);
    expect(status?.orders_to_next).toBe(1);
  });

  it("the tenth settled order makes a reward available, and the VERSION travels with it", () => {
    const status = settleTen().loyaltyFor(PHONE);
    expect(status?.available).toBe(1);
    expect(status?.orders_to_next).toBe(0);
    // `17-F25` — a redemption must record the rule it was taken under, and the screen must cite
    // the version it was SHOWN. A version this device invented would answer *under what rule?*
    // with a number no publisher ever minted.
    expect(status?.campaign_id).toBe("camp-loyalty");
    expect(status?.campaign_version).toBe(3);
  });

  it("⚠ AN UNSETTLED LINKED ORDER DOES NOT COUNT — `17-F15` says SETTLED orders", () => {
    const gateway = gatewayOver();
    for (let i = 0; i < 10; i += 1)
      gateway.linkCustomer({ order_id: `ord-${i}`, dialled: DIALLED });
    expect(gateway.loyaltyFor(PHONE)?.eligible).toBe(0);
  });

  it("`min_order_paisa` filters at RENDER time, not in the fold (`01-F87`)", () => {
    // Ten Rs 450 orders against a campaign demanding Rs 500 → nothing is eligible, and the FOLD is
    // byte-identical either way. The filter must live here because `min_order_paisa` is layer-2
    // configuration and a fold that read it would project a version-dependent value.
    const strict = gatewayOver({
      campaigns: () => artifactOf([{ ...LOYALTY_ROW, min_order_paisa: 50_000 }]),
    });
    settleTen();
    expect(strict.loyaltyFor(PHONE)?.eligible).toBe(0);
    expect(gatewayOver().loyaltyFor(PHONE)?.eligible).toBe(10);
  });

  it("no artifact, no account campaign, or another branch's campaign all render as `null`", () => {
    settleTen();
    expect(gatewayOver({ campaigns: () => artifactOf([]) }).loyaltyFor(PHONE)).toBe(null);
    expect(gatewayOver({ campaigns: () => artifactOf([BANK_ROW]) }).loyaltyFor(PHONE)).toBe(null);
    expect(
      gatewayOver({
        campaigns: () => artifactOf([{ ...LOYALTY_ROW, branches: ["some-other-branch"] }]),
      }).loyaltyFor(PHONE),
    ).toBe(null);
  });

  it("⚠ TWO active account programmes render `null` rather than picking one (`17-F14`)", () => {
    // `17-F14`: *"one active program per org"*. Picking between two would make the reward depend
    // on array position — `01-F34`'s defect arriving through a seed file — and a reward this
    // device cannot name unambiguously is one it must not offer.
    settleTen();
    const two = artifactOf([LOYALTY_ROW, { ...LOYALTY_ROW, campaign_id: "camp-loyalty-2" }]);
    expect(gatewayOver({ campaigns: () => two }).loyaltyFor(PHONE)).toBe(null);
  });
});

// ── C. `17-F22` — the seeded artifact, and the ONE way it differs from the tax cell ───────────

describe("§C 17-F22/01-F56 — a malformed artifact yields NO CAMPAIGNS and the till still sells", () => {
  it("unset is an empty artifact and is NOT malformed", () => {
    const a = resolveCampaignArtifact({});
    expect(a.rows).toEqual([]);
    expect(a.malformed, "an org that has published none is not a device that refused").toBe(false);
  });

  it("⚠ MALFORMED NEVER THROWS — this is the whole argument for a fifth resource", () => {
    // `tax-posture.ts` THROWS on a bad cell and the till does not start, because charging the wrong
    // tax is worse than not trading. `17-F22` makes the opposite call for campaigns, and an
    // implementation that threw here would undo the blast-radius argument the FR rests on.
    for (const raw of ["not json", "{}", '[{"campaign_id":""}]', '[{"kind":"invented"}]']) {
      const a = resolveCampaignArtifact({ [CAMPAIGNS_ENV]: raw });
      expect(a.rows, raw).toEqual([]);
      expect(a.malformed, raw).toBe(true);
    }
  });

  it("ONE bad row refuses the WHOLE artifact rather than being skipped (`01-F56`, `01-F87` (b))", () => {
    // Skipping is the tempting shape and it is wrong: an owner who published five and typed one
    // badly would get four, silently, with no way to tell that from having published four.
    const a = resolveCampaignArtifact({
      [CAMPAIGNS_ENV]: JSON.stringify([LOYALTY_ROW, { ...BANK_ROW, kind: "invented" }]),
    });
    expect(a.rows).toEqual([]);
    expect(a.malformed).toBe(true);
  });

  it("a DUPLICATE `campaign_id` refuses the artifact — `01-F75` mints them org-unique", () => {
    // Honouring the first would make WHICH campaign applied depend on array position.
    const a = resolveCampaignArtifact({
      [CAMPAIGNS_ENV]: JSON.stringify([LOYALTY_ROW, { ...LOYALTY_ROW, every_n: 5 }]),
    });
    expect(a.malformed).toBe(true);
  });
});

// ── D. `17-F24` — the campaign arm, judged on the TRUSTED side ────────────────────────────────

describe("§D 17-F24/Commandment 8 — the payload's `campaign_id` is a CLAIM, never a verdict", () => {
  const citations = (over: Partial<Parameters<typeof campaignCitationFor>[0]> = {}) =>
    campaignCitationFor({
      artifact: () => artifactOf([BANK_ROW]),
      openOrders: () => [{ order_id: "ord-1", channel: "counter" } as never],
      orderTotalPaisa: () => 3_000_000,
      orderHasLinkedCustomer: () => false,
      branchNowMs: () => Date.parse("2026-08-24T12:00:00+05:00"),
      branchId: () => IDENTITY.branch_id,
      ...over,
    });

  it("R71's CASE — 50% of Rs 30,000 capped at Rs 10,000 is WITHIN at the cap and OUTSIDE above it", () => {
    const at = citations()("ord-1", "camp-bank", 1_000_000);
    expect(at?.within_campaign_bounds, "at the cap is within it").toBe(true);
    const over = citations()("ord-1", "camp-bank", 1_000_001);
    expect(
      over?.within_campaign_bounds,
      "17-F12: outside its bounds the normal threshold rules apply untouched",
    ).toBe(false);
  });

  it("⚠ CITING A CAMPAIGN IS NOT BEING INSIDE IT — the two are separate fields on purpose", () => {
    // MUTATION THIS CATCHES: `within_campaign_bounds: campaign_id !== null`. That turns every
    // campaign into an unbounded pre-approval — a cashier types any amount, cites the bank promo,
    // and no manager is asked. Permanently (`01-F1`).
    const huge = citations()("ord-1", "camp-bank", 99_000_000);
    expect(huge).not.toBe(null);
    expect(huge?.within_campaign_bounds).toBe(false);
  });

  it("an UNKNOWN campaign id is `null` — the renderer cannot conjure a campaign this device lacks", () => {
    expect(citations()("ord-1", "camp-not-in-artifact", 1)).toBe(null);
    expect(citations({ artifact: () => artifactOf([]) })("ord-1", "camp-bank", 1)).toBe(null);
  });

  it("a campaign scoped to ANOTHER branch or channel is `null`", () => {
    expect(
      citations({ artifact: () => artifactOf([{ ...BANK_ROW, branches: ["elsewhere"] }]) })(
        "ord-1",
        "camp-bank",
        1,
      ),
    ).toBe(null);
    expect(
      citations({ artifact: () => artifactOf([{ ...BANK_ROW, channels: ["foodpanda"] }]) })(
        "ord-1",
        "camp-bank",
        1,
      ),
    ).toBe(null);
  });

  it("`requires_customer` reads `02-F64`'s LINK, not anything the renderer said", () => {
    const needsCustomer = () => artifactOf([{ ...BANK_ROW, requires_customer: true }]);
    expect(
      citations({ artifact: needsCustomer, orderHasLinkedCustomer: () => false })(
        "ord-1",
        "camp-bank",
        1,
      ),
    ).toBe(null);
    expect(
      citations({ artifact: needsCustomer, orderHasLinkedCustomer: () => true })(
        "ord-1",
        "camp-bank",
        1,
      )?.within_campaign_bounds,
    ).toBe(true);
  });

  it("an order this device has no row for is `null` — never a guess at its total", () => {
    expect(citations({ openOrders: () => [] })("ord-1", "camp-bank", 1)).toBe(null);
    expect(citations({ orderTotalPaisa: () => null })("ord-1", "camp-bank", 1)).toBe(null);
  });

  it("a `free_item` campaign is `null` — a bound this predicate cannot compute is not a blessing", () => {
    // `campaignBenefitPaisa` answers `null` because the value is the LINE's snapshotted price
    // (`01-F53`) and this predicate has no line. The SAFE direction: it takes the discretionary
    // path and a large one asks for a manager.
    const freebie = () =>
      artifactOf([
        { ...BANK_ROW, benefit: { form: "free_item", value: 0, item_id: "x", cap_paisa: null } },
      ]);
    expect(citations({ artifact: freebie })("ord-1", "camp-bank", 1)).toBe(null);
  });
});

// ── E. THE SEAMS. Each one names the mutant it kills. ─────────────────────────────────────────

describe("§E — the shipped host WIRES all of it (the L8 assertions no rail can make)", () => {
  it("SEAM 1 — `main/index.ts` supplies the REAL campaign resolver to BOTH write guards", () => {
    // MUTANT: delete `campaignCitation: campaignCitations` from either `authorizeWrites` call.
    // `seams:check` Rule B catches the first (an optional member no call site passes) and would
    // NOT catch a second construction left behind — which is exactly how a discount the escalation
    // path judged pre-approved and the write path judged discretionary would ship.
    const mainSrc = src("index.ts");
    const sites = mainSrc.split("campaignCitation: campaignCitations").length - 1;
    expect(sites, "both authorizeWrites constructions must get the SAME resolver").toBe(2);
    expect(mainSrc).toContain("campaignCitationFor({");
  });

  it("SEAM 2 — the resolver is built from the DEVICE's artifact, not a literal", () => {
    // MUTANT: `artifact: () => ({ rows: [], version: 0, malformed: false })`. Typechecks, supplies
    // the member, satisfies Rule B, and no campaign discount is ever pre-approved anywhere.
    const mainSrc = src("index.ts");
    expect(mainSrc).toContain("artifact: deviceCampaignArtifact");
    expect(mainSrc).toContain("campaigns: deviceCampaignArtifact");
  });

  it("SEAM 3 — `Counter.tsx` emits the link at `startOrder`, through the bridge", () => {
    // MUTANT: delete the `linkCustomer` call. The event type, its schema, its `WRITE_ACTIONS` row,
    // its guard, its fold and its store method all still exist and every one of their tests stays
    // green — and no order in the product is ever linked to a customer, which is the exact state
    // `shared/ipc.ts` recorded for the life of the gap.
    const counterSrc = readFileSync(
      new URL("../../renderer/Counter.tsx", import.meta.url).pathname,
      "utf8",
    );
    expect(counterSrc).toContain("window.restos.linkCustomer?.({ order_id, dialled })");
    expect(counterSrc, "17-F17's reward line must read the seam").toContain(
      "window.restos.loyaltyFor?.(phone)",
    );
  });

  it("SEAM 4 — main HANDLES both channels, and the link push moves the fold the screen reads", () => {
    const mainSrc = src("index.ts");
    expect(mainSrc).toContain("CHANNELS.linkCustomer");
    expect(mainSrc).toContain("CHANNELS.loyaltyFor");
    // The link must go through the AUTHORIZED surface — `writes.linkCustomer`, never
    // `gateway.linkCustomer`. A renderer-originated append reaching the ledger with no matrix
    // verdict is the Commandment-8 bypass `authorize.ts`'s `Pick` exists to make impossible.
    expect(mainSrc).toContain("writes.linkCustomer(req)");
    expect(mainSrc).not.toContain("gateway.linkCustomer");
  });
});
