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

import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveAging } from "@restos/device-config";
import { addPaisa, paisa } from "@restos/domain";
import { type DeviceStore, openStore } from "@restos/sync-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CAMPAIGNS_ENV,
  CAMPAIGNS_VERSION_ENV,
  type CampaignArtifact,
  campaignCitationFor,
  campaignOffersFor,
  deviceCampaignArtifact,
  resolveCampaignArtifact,
  stampCampaignVersion,
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

/**
 * A source read with its COMMENTS REMOVED — `L5`: a mention is not a use, and a grep that counts
 * mentions is a proxy for the evidence rather than the evidence.
 *
 * ⚠ **IT WAS WRITTEN BECAUSE THE FIRST DRAFT OF §H FAILED ON ITS OWN PROSE.** The tripwire and the
 * no-count assertion both matched the explanatory comments in `Counter.tsx` — which quote the very
 * strings they forbid, because a comment that says *what was removed and why* has to name it. A
 * filter that tests only a line's LEADING characters does not see a continuation line inside a
 * block comment, so it stripped nothing that mattered — and it fails silently, in the flattering
 * direction. This walks the two comment forms properly. Strings are NOT
 * stripped, deliberately: `type: "loyalty.reward_redeemed"` is exactly the producer being looked
 * for, so a stripper that lost string literals would make the tripwire vacuous.
 */
const codeOf = (text: string): string => {
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (text.startsWith("//", i)) {
      const end = text.indexOf("\n", i);
      i = end === -1 ? text.length : end;
    } else if (text.startsWith("/*", i)) {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 2;
    } else {
      out += text[i];
      i += 1;
    }
  }
  return out;
};

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

describe("§C2 17-F22 — `deviceCampaignArtifact` IS the door, not a name beside one", () => {
  it("⚠ THE STUB-SUPPLY MUTANT — the shipping resolver reads THIS PROCESS's environment", () => {
    /*
      ⚠ **THE SURVIVOR THIS TEST EXISTS FOR (August 2026, adversarial review).** Replacing
      `deviceCampaignArtifact`'s body with a constant — `() => EMPTY` — left **all 1,372 tests
      green**, because every suite here injects its own artifact through `CampaignCitationDeps`
      and `loyalty-seam.test.ts` §E SEAM 2 asserts only that `index.ts` NAMES this function. The
      product would then hold no campaigns on any device, for ever, with the seam rail clean and
      the name in place: *a port supplied with a stub is still a supply*, one indirection deeper.

      The only assertion that can see it is one that drives the real function against a real
      environment, which is what this is. `resolveCampaignArtifact` is pure in its input and has
      its own coverage above; what is unasserted anywhere else is that the shipping reader passes
      `process.env` to it rather than a literal.
    */
    const before = {
      rows: process.env[CAMPAIGNS_ENV],
      version: process.env[CAMPAIGNS_VERSION_ENV],
    };
    try {
      process.env[CAMPAIGNS_ENV] = JSON.stringify([BANK_ROW]);
      process.env[CAMPAIGNS_VERSION_ENV] = "7";
      const artifact = deviceCampaignArtifact();
      expect(artifact.malformed).toBe(false);
      expect(artifact.version, "the seeded version, not a literal").toBe(7);
      expect(artifact.rows.map((r) => r.campaign_id)).toEqual(["camp-bank"]);

      // ...and it is re-read on every call rather than captured at construction, which is
      // `resolveTaxCell`'s stated rule: a value read once at boot disagrees with the variable an
      // operator has since corrected.
      process.env[CAMPAIGNS_ENV] = "";
      expect(deviceCampaignArtifact().rows).toEqual([]);
    } finally {
      if (before.rows === undefined) delete process.env[CAMPAIGNS_ENV];
      else process.env[CAMPAIGNS_ENV] = before.rows;
      if (before.version === undefined) delete process.env[CAMPAIGNS_VERSION_ENV];
      else process.env[CAMPAIGNS_VERSION_ENV] = before.version;
    }
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

  /*
    ── `17-F24` AS AMENDED — THE THREE FIELDS THE ARM CANNOT RESOLVE ───────────────────────────

    ⚠ **EVERY ONE OF THESE ASSERTIONS EXISTS BECAUSE A GREEN SUITE MISSED THE CASE.** Before the
    August-2026 review this file's only two campaign fixtures set `item_scope: null`,
    `use_limit: "unlimited"` and `proof: "none"`, so the three fields were never VARIED and an
    implementation blind to all three passed all 38 tests. That is `L10`'s shape exactly — the
    mechanism built correctly and never aimed at the case that matters — and the mutant that
    proved it is recorded in `apps/pos-electron/CLAUDE.md`.

    Each test below carries its own CONTROL: the identical row with the field at its resolvable
    value, which must still be within bounds. Without the control a resolver that refused
    EVERYTHING would pass, which is the other way to be wrong here.
  */
  it("`item_scope` — a scoped campaign is REFUSED, and the control is the same row unscoped", () => {
    // THE DEFECT VERBATIM: 20% off pizzas, one Rs 500 pizza in a Rs 30,000 bill. Reading the
    // ORDER total pre-approved 20% of the whole bill — the intended bound was 20% of the pizza.
    const scoped = () => artifactOf([{ ...BANK_ROW, item_scope: ["item-pizza"] }]);
    expect(citations({ artifact: scoped })("ord-1", "camp-bank", 1)).toBe(null);
    // ...and it is refused at EVERY amount, including one inside the whole-order cap, so this is
    // a refusal of the row and not an arithmetic accident.
    expect(citations({ artifact: scoped })("ord-1", "camp-bank", 1_000_000)).toBe(null);
    // CONTROL — `item_scope: null` on the same row is within bounds at the cap.
    expect(citations()("ord-1", "camp-bank", 1_000_000)?.within_campaign_bounds).toBe(true);
    // And an EMPTY scope array is not `null`: a writer that published `item_scope: []` scoped the
    // campaign to no item, which is honoured literally exactly as `branches: []` is.
    expect(
      citations({ artifact: () => artifactOf([{ ...BANK_ROW, item_scope: [] }]) })(
        "ord-1",
        "camp-bank",
        1,
      ),
    ).toBe(null);
  });

  it("`use_limit` — a limited campaign is REFUSED, both values, with the control", () => {
    // Nothing counts prior citations, so `once_per_order` bounded nothing: measured before the
    // fix, one citation repeated 50 times, every one within bounds.
    for (const use_limit of ["once_per_order", "once_per_customer"] as const) {
      const limited = () => artifactOf([{ ...BANK_ROW, use_limit }]);
      expect(citations({ artifact: limited })("ord-1", "camp-bank", 1), use_limit).toBe(null);
    }
    // CONTROL — `unlimited` is the value the predicate can honour.
    expect(citations()("ord-1", "camp-bank", 1)?.within_campaign_bounds).toBe(true);
  });

  it("`proof` — a campaign that demands something in her hand is REFUSED, all three, with the control", () => {
    // `17-F25` makes proof an ATTESTATION and nothing in this product collects one, so a `coupon`
    // was pre-approved with no code ever entered.
    for (const proof of ["code", "bearer_card", "attested"] as const) {
      const proven = () => artifactOf([{ ...BANK_ROW, proof }]);
      expect(citations({ artifact: proven })("ord-1", "camp-bank", 1), proof).toBe(null);
    }
    // CONTROL — `none` is the value the predicate can honour.
    expect(citations()("ord-1", "camp-bank", 1)?.within_campaign_bounds).toBe(true);
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
    // ⚠ **CORRECTED, NOT WEAKENED (August 2026, `17-F27`).** This read `campaignCitationFor({`
    // — a proxy for *a resolver is constructed here from real inputs*. `17-F27` (a) added a second
    // reader of those same inputs (the offer list), and `02-F45` forbids two dependency sets for
    // one question, so the deps are a named object now and both readers are built from it. The
    // property is pinned directly rather than through the literal: ONE deps object, and BOTH
    // readers built from it. A second literal anywhere is what this asserts against.
    expect(mainSrc).toContain("campaignCitationFor(campaignDeps)");
    expect(mainSrc).toContain("campaignOffersFor(campaignDeps)");
    expect(mainSrc).not.toContain("campaignOffersFor({");
    expect(mainSrc).not.toContain("campaignCitationFor({");
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

  it("SEAM 5 — `17-F27`'s PRODUCER: the offer channel is served and the payload carries the citation", () => {
    /*
      ⚠ **THIS IS THE ASSERTION THAT DID NOT EXIST, AND ITS ABSENCE IS THE FINDING.** Before
      `17-F27`, `authorize.ts` read `payload.campaign_id`, `canDiscount` had an arm for it, and
      **nothing in the product ever set it** — measured comment-blind across every renderer, the
      back office, the manager and owner apps and `services/api`: three hits, all comments. So
      `campaign` was permanently `null`, the arm could not fire, and every function behind it was
      dead. `seams:check` is blind to it by construction (a key in an object literal is not an
      export, and every export here IS reached), which is why this is hand-written.

      MUTANT this kills: delete the citation from `Counter.tsx`'s payload, or stop passing
      `campaigns` to the surface, or drop the channel from main or the preload. Each takes the
      product back to "the arm exists and nothing can reach it" with every other test green.
    */
    const mainSrc = src("index.ts");
    expect(mainSrc).toContain("campaignOffersFor(campaignDeps)");
    /*
      ⚠ **THIS BINDING ASSERTION WAS ADDED BECAUSE A MUTANT SURVIVED WITHOUT IT, and that is the
      whole of `L10` on this round's own work.** The first draft asserted the channel NAME and the
      resolver's CONSTRUCTION as two independent strings — and a mutant that left both in place
      while answering the handler with a literal `[]` (`typeof order_id === "string" ? [] : []`)
      passed **all 1,391 tests**, because §F builds its own resolver and never crosses the host's
      wiring. That is the *port supplied with a STUB* blind spot arriving one layer up from where
      the rail looks: the resolver is reached, the channel is served, and the two are not joined.

      So the handler and the resolver are pinned TOGETHER, within one expression of each other.
    */
    expect(mainSrc, "the offers channel must be answered BY the resolver, not beside it").toMatch(
      /CHANNELS\.campaignOffers[\s\S]{0,400}?campaignOffers\(order_id\)/,
    );

    const preloadSrc = readFileSync(
      new URL("../../preload/index.ts", import.meta.url).pathname,
      "utf8",
    );
    expect(preloadSrc, "the shipped bridge must serve it").toContain("CHANNELS.campaignOffers");

    const counterSrc = codeOf(
      readFileSync(new URL("../../renderer/Counter.tsx", import.meta.url).pathname, "utf8"),
    );
    expect(counterSrc).toContain("window.restos.campaignOffers?.(order_id)");
    expect(counterSrc, "the surface must be GIVEN the offers").toContain(
      "campaigns={campaignOffers}",
    );
    expect(
      counterSrc,
      "17-F27 (b): the cited campaign must reach the discount.recorded payload",
    ).toContain("{ campaign_id: correction.campaign_id }");

    const surfaceSrc = codeOf(
      readFileSync(new URL("../../renderer/LineCorrection.tsx", import.meta.url).pathname, "utf8"),
    );
    expect(surfaceSrc, "the tile must set the citation").toContain("setCampaignId(c.campaign_id)");
    expect(surfaceSrc, "and it must travel on submit").toContain(
      'campaign_id: act === "discount" ? campaignId : null',
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

// ── F. `17-F27` (a) — THE OFFER LIST, and it is ONE resolution with the citation ──────────────

describe("§F 17-F27 — the offers a cashier may cite, resolved on the trusted side", () => {
  const deps = (over: Partial<Parameters<typeof campaignOffersFor>[0]> = {}) => ({
    artifact: () => artifactOf([BANK_ROW]),
    openOrders: () => [{ order_id: "ord-1", channel: "counter" } as never],
    orderTotalPaisa: () => 3_000_000,
    orderHasLinkedCustomer: () => false,
    branchNowMs: () => Date.parse("2026-08-24T12:00:00+05:00"),
    branchId: () => IDENTITY.branch_id,
    ...over,
  });

  it("offers the campaign that reaches this order, carrying the bound it allows", () => {
    // R71's case: 50% of Rs 30,000 capped at Rs 10,000. The bound is the CAP, not the rate.
    expect(campaignOffersFor(deps())("ord-1")).toEqual([
      { campaign_id: "camp-bank", bound_paisa: 1_000_000 },
    ]);
  });

  it("⚠ ONE RESOLUTION, NOT TWO — every offer is within bounds at its own bound, and one paisa over is not", () => {
    /*
      `02-F45`: two resolutions of one question disagree, and here the disagreement is a cashier
      offered a campaign the write guard then refuses. This is the assertion that the offer list
      and the citation are the same function — swept over a set of rows chosen to exercise every
      exit, so a second implementation that "looked right" would have to agree at every one.
    */
    const rows = [
      BANK_ROW,
      { ...BANK_ROW, campaign_id: "camp-scoped", item_scope: ["item-pizza"] },
      { ...BANK_ROW, campaign_id: "camp-limited", use_limit: "once_per_order" },
      { ...BANK_ROW, campaign_id: "camp-proof", proof: "code", kind: "coupon", code: "ABCD" },
      { ...BANK_ROW, campaign_id: "camp-elsewhere", branches: ["another-branch"] },
      { ...BANK_ROW, campaign_id: "camp-min", min_order_paisa: 9_000_000 },
      {
        ...BANK_ROW,
        campaign_id: "camp-flat",
        benefit: { form: "amount_paisa", value: 25_000, item_id: null, cap_paisa: null },
      },
    ];
    const artifact = () => artifactOf(rows);
    const offers = campaignOffersFor(deps({ artifact }))("ord-1");
    const cite = campaignCitationFor(deps({ artifact }));

    expect(offers.map((o) => o.campaign_id)).toEqual(["camp-bank", "camp-flat"]);
    for (const offer of offers) {
      expect(
        cite("ord-1", offer.campaign_id, offer.bound_paisa)?.within_campaign_bounds,
        `${offer.campaign_id} at its own offered bound`,
      ).toBe(true);
      expect(
        // `DEC-MONEY-005` — one paisa over the bound, through the domain's own adder rather than
        // a raw `+` on a money value (the GritQL ban covers money-named member expressions).
        cite("ord-1", offer.campaign_id, addPaisa(paisa(offer.bound_paisa), paisa(1)))
          ?.within_campaign_bounds,
        `${offer.campaign_id} one paisa over`,
      ).toBe(false);
    }
    // And every row NOT offered resolves to `null` at the citation — no campaign is citable that
    // was not offered, which is the direction that would put an unbounded pre-approval on screen.
    for (const row of rows) {
      if (offers.some((o) => o.campaign_id === row.campaign_id)) continue;
      expect(cite("ord-1", row.campaign_id, 1), row.campaign_id).toBe(null);
    }
  });

  it("a device with no artifact offers nothing, and an order it cannot see offers nothing", () => {
    expect(campaignOffersFor(deps({ artifact: () => artifactOf([]) }))("ord-1")).toEqual([]);
    expect(campaignOffersFor(deps({ openOrders: () => [] }))("ord-1")).toEqual([]);
  });
});

// ── G. `17-F27` (c) — THE WRITER-SIDE `campaign_version` PAIRING ──────────────────────────────

describe("§G 17-F27/17-F25 — the pairing `registry.ts` claimed before it existed", () => {
  const stamped = (rows: readonly object[] = [BANK_ROW], version = 3) =>
    stampCampaignVersion({ writes: gatewayOver(), artifact: () => artifactOf(rows, version) });

  const discount = (payload: Record<string, unknown>) => ({
    type: "discount.recorded",
    payload: {
      order_id: "ord-1",
      amount_paisa: 5_000,
      reason: "Goodwill",
      approver_user_id: null,
      adjustment_attempt_id: `att-${Math.random()}`,
      ...payload,
    },
    refs: [],
  });

  const written = (id: string) =>
    store.readAllEvents().find((e) => e.id === id)?.payload as Record<string, unknown>;

  it("a citation is PAIRED with the version this device holds", () => {
    // MEASURED BEFORE THE FIX: this event was accepted and persisted with `campaign_id` and no
    // version at all, so `17-F25`'s "under what rule?" was unanswerable, permanently (`01-F1`).
    const { id } = stamped().append(discount({ campaign_id: "camp-bank" }));
    expect(written(id)).toMatchObject({ campaign_id: "camp-bank", campaign_version: 3 });
  });

  it("⚠ THE RENDERER'S VERSION IS OVERWRITTEN, NOT TRUSTED (Commandment 8)", () => {
    // MEASURED BEFORE THE FIX: `campaign_version: 999` against an artifact at version 1 was
    // accepted and persisted verbatim.
    const { id } = stamped().append(discount({ campaign_id: "camp-bank", campaign_version: 999 }));
    expect(written(id).campaign_version).toBe(3);
  });

  it("a campaign this device does not hold cannot be paired, so the CLAIM IS DROPPED", () => {
    const { id } = stamped().append(
      discount({ campaign_id: "camp-nobody-has", campaign_version: 7 }),
    );
    const payload = written(id);
    expect(payload).not.toHaveProperty("campaign_id");
    expect(payload).not.toHaveProperty("campaign_version");
    // ...and `01-F17`: the discount itself LANDED. A campaign nobody has does not block a sale.
    expect(payload.amount_paisa).toBe(5_000);
  });

  it("a version riding ALONE is dropped — a rule with no name answers nothing either", () => {
    const { id } = stamped().append(discount({ campaign_version: 2 }));
    expect(written(id)).not.toHaveProperty("campaign_version");
  });

  it("a discretionary discount is untouched, and so is every other event type", () => {
    const { id } = stamped().append(discount({}));
    const payload = written(id);
    expect(payload).not.toHaveProperty("campaign_id");
    expect(payload).not.toHaveProperty("campaign_version");
    expect(Object.keys(payload).sort()).toEqual([
      "adjustment_attempt_id",
      "amount_paisa",
      "approver_user_id",
      "order_id",
      "reason",
    ]);

    // A `comp.recorded` carrying the same key is NOT a campaign act and must pass through
    // verbatim — `17-F24`'s arm is `canDiscount`'s alone.
    const comp = stamped().append({
      type: "comp.recorded",
      payload: {
        order_id: "ord-1",
        amount_paisa: 100,
        reason: "Kitchen error",
        approver_user_id: null,
        adjustment_attempt_id: "att-comp",
        campaign_id: "camp-bank",
      },
      refs: [],
    });
    expect(written(comp.id)).toMatchObject({ campaign_id: "camp-bank" });
    expect(written(comp.id)).not.toHaveProperty("campaign_version");
  });
});

// ── H. `17-F23` AS AMENDED — the reward line, and the tripwire that restores its count ────────

describe("§H 17-F23/00 §5.7 — no claimable count while nothing can consume one", () => {
  // COMMENT-BLIND, and §H's own header records why that had to be built rather than assumed.
  const counterSrc = codeOf(
    readFileSync(new URL("../../renderer/Counter.tsx", import.meta.url).pathname, "utf8"),
  );

  it("the caller strip renders NO count against a balance nothing decrements", () => {
    /*
      MEASURED: 50 settled linked orders read `available: 5` with `orders_consumed_total` `"0"`,
      and the strip said **"5 rewards to claim"** — to a regular who may already have taken five.
      The number is what had to go; the fact ("threshold passed") is true either way.
    */
    expect(counterSrc).not.toContain("rewards to claim");
    expect(counterSrc).not.toContain("1 reward to claim");
    expect(counterSrc).toContain("Reward threshold passed");
    // The COUNTDOWN arm is untouched and must stay — a customer who has redeemed nothing has
    // consumed nothing, so that number is correct. Removing it would be over-correcting.
    expect(counterSrc).toContain("more orders to a reward");
  });

  it("⚠ THE TRIPWIRE — the day anything here emits a redemption, this fails and the count comes back", () => {
    /*
      `17-F23` as amended says *"the day a producer lands, the count comes back"*, and no rail can
      see a producer arrive: a missing PRODUCER for an event type is one of the three things
      `seams:check` says out loud it cannot catch. So the honest rendering above is conditional on
      a fact only a grep can establish, and this is that grep.

      It is aimed at THIS APP's own source, comment-blind, and it fails LOUDLY rather than
      quietly: whoever builds `17-F17`'s *"→ apply"* is told, in this message, that the caller
      strip is now under-reporting and must be restored.
    */
    const dir = new URL("../../", import.meta.url).pathname;
    const files: string[] = [];
    const walk = (d: string) => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const full = join(d, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "__acceptance__" || entry.name === "layout-gate") continue;
          walk(full);
        } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
          files.push(full);
        }
      }
    };
    walk(dir);
    const producers = files.filter((f) =>
      codeOf(readFileSync(f, "utf8")).includes("loyalty.reward_redeemed"),
    );
    expect(
      producers,
      "17-F23: something now emits a redemption — RESTORE the claimable count on Counter.tsx's " +
        "caller strip (the `available` number), and delete this tripwire with it",
    ).toEqual([]);
  });
});
