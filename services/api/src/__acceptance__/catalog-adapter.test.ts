/**
 * The adapter binding B-4's two ports to `services/sync-gateway` — the contract half.
 *
 * `catalog-gateway-seam.test.ts` answers "does a saved menu leave the process at all"; this file
 * answers the questions that only matter once it does: **what exactly goes on the wire, what comes
 * back, and what happens when one of the two writes fails while the other has already committed.**
 * Both are needed and neither substitutes for the other — AGENTS.md measured that split directly
 * ("removing the store from the shipped construction failed 1 of 160 tests; making its `put` a
 * no-op failed 4, and the seam assertion stayed green").
 *
 * Everything here drives a **real HTTP server on loopback** (`fake-gateway.ts`), never a stubbed
 * `fetch`: the claim under test is that a request was formed, addressed, credentialed and
 * serialized correctly, and a function double cannot fail for any of those reasons.
 *
 * FRs: `01-F52`, `01-F60`, `01-F62`, `14-F3`, `14-F8`. Founder ruling:
 * `plans/wave-1/catalog-transport.md` §6 Q1.
 */

import { BUSINESS_DAY_CUTOVER_HOUR_DEFAULT } from "@restos/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryStagedEditStore } from "../catalog.js";
import { createGatewayCatalogPublisher, createGatewayLedgerAppender } from "../gateway-client.js";
import { type CatalogDeps, publishEdits, stageEdit } from "../publish.js";
import { type FakeGateway, startFakeGateway } from "./fake-gateway.js";

const ORG = "org-adapter";
const BRANCH = "branch-adapter";
const ACTOR = "user-ali";
const NOW = 1_785_000_000_000;

const ENABLED = { branches: [BRANCH], channels: ["counter", "foodpanda"] as const };

const priced = (id: string, counter: number, panda: number) => ({
  kind: "item",
  id,
  name: `Item ${id}`,
  prices: [
    { branch_id: BRANCH, channel: "counter" as const, price_paisa: counter },
    { branch_id: BRANCH, channel: "foodpanda" as const, price_paisa: panda },
  ],
});

describe("the CatalogPublisher / LedgerAppender adapters speak the gateway's contract", () => {
  let gateway: FakeGateway;
  let deps: CatalogDeps;

  beforeEach(async () => {
    gateway = await startFakeGateway();
    const link = { base_url: gateway.url, token: gateway.token };
    deps = {
      staged: createMemoryStagedEditStore(),
      publisher: createGatewayCatalogPublisher(link),
      ledger: createGatewayLedgerAppender(link),
      enabled: { branches: ENABLED.branches, channels: [...ENABLED.channels] },
      now: () => NOW,
      cutover_hour: BUSINESS_DAY_CUTOVER_HOUR_DEFAULT,
    };
  });

  afterEach(async () => {
    await gateway.close();
  });

  it("posts publishCatalog's own argument list, so the adapter is a binding and not a redesign", async () => {
    const version = await deps.publisher.publish(ORG, [priced("a", 100, 120)], {
      actor_user_id: ACTOR,
      now: NOW,
      enabled: deps.enabled,
    });
    expect(version).toBe(1);

    expect(gateway.received).toEqual([
      {
        path: "/internal/catalog/publish",
        body: {
          org_id: ORG,
          entries: [priced("a", 100, 120)],
          actor_user_id: ACTOR,
          // ONE reading, the caller's — `publishEdits` uses the same instant for the artifact and
          // for every `catalog.changed`, so a gateway stamping its own clock would split it.
          now: NOW,
          enabled: { branches: [BRANCH], channels: ["counter", "foodpanda"] },
        },
      },
    ]);
  });

  it("advances the published version monotonically across publishes (01-F52)", async () => {
    const opts = { actor_user_id: ACTOR, now: NOW, enabled: deps.enabled };
    expect(await deps.publisher.publish(ORG, [priced("a", 100, 120)], opts)).toBe(1);
    expect(await deps.publisher.publish(ORG, [priced("b", 200, 240)], opts)).toBe(2);
    expect(await deps.publisher.publish(ORG, [priced("a", 150, 180)], opts)).toBe(3);
    expect((await deps.publisher.published(ORG)).version).toBe(3);
  });

  it("reads the published snapshot back over the wire, not from a local copy", async () => {
    await deps.publisher.publish(ORG, [priced("a", 100, 120)], {
      actor_user_id: ACTOR,
      now: NOW,
      enabled: deps.enabled,
    });
    const before = gateway.received.length;
    const published = await deps.publisher.published(ORG);
    expect(published).toEqual({ version: 1, entries: [priced("a", 100, 120)] });
    // A publisher that answered from a `Map` it kept alongside would return the same object and
    // send nothing. This is the only assertion that separates them.
    expect(gateway.received.length).toBe(before + 1);
    expect(gateway.received.at(-1)?.path).toBe("/internal/catalog/published");
  });

  it("carries the writer's 01-F60 refusal verbatim to the caller", async () => {
    const message =
      "publishCatalog: entry 0 (item/item-a) is not sellable — no price for branch " +
      "branch-adapter, channel foodpanda (01-F60).";
    gateway.refuseWith("/internal/catalog/publish", 400, message);
    await expect(
      deps.publisher.publish(ORG, [priced("a", 100, 120)], {
        actor_user_id: ACTOR,
        now: NOW,
        enabled: deps.enabled,
      }),
    ).rejects.toThrow(message);
  });

  it("names the deployment fault when the credential is refused, so a 401 is not read as a bad menu", async () => {
    gateway.refuseWith("/internal/catalog/publish", 401, "unauthorized");
    await expect(
      deps.publisher.publish(ORG, [priced("a", 100, 120)], {
        actor_user_id: ACTOR,
        now: NOW,
        enabled: deps.enabled,
      }),
    ).rejects.toThrow(/SYNC_GATEWAY_TOKEN.*PUBLISH_TOKEN/s);
  });

  it("round-trips 14-F3's history through the 01-F62 org-scoped store", async () => {
    const edit = stageEdit(deps, {
      org_id: ORG,
      actor_user_id: ACTOR,
      entry: priced("a", 45_000, 48_000),
      apply_when: "now",
    });
    await publishEdits(deps, ORG, [edit]);

    const history = await deps.ledger.history(ORG);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      type: "catalog.changed",
      org_id: ORG,
      actor_user_id: ACTOR,
      server_received_at: NOW,
      payload: {
        entity: "item",
        entity_id: "a",
        version: 1,
        before_ref: null,
        price_changes: [
          { branch_id: BRANCH, channel: "counter", before_paisa: null, after_paisa: 45_000 },
          { branch_id: BRANCH, channel: "foodpanda", before_paisa: null, after_paisa: 48_000 },
        ],
      },
    });
    // `01-F62`: no branch fields on an org-scoped event, on the wire or on the way back.
    expect(history[0]).not.toHaveProperty("branch_id");
    expect(history[0]).not.toHaveProperty("branch_created_at");
    expect(history[0]).not.toHaveProperty("time_basis");
  });

  it("keeps 01-F62's other org-scoped types out of 14-F3's price history", async () => {
    // The org-scoped store holds `catalog.changed`, `device.registered / revoked`, `user.changed`
    // and `config.changed`. A history read that returned all of them would render a device
    // registration as a price change, with `entity` and `version` undefined beside a real date.
    await fetch(`${gateway.url}/internal/org-events`, {
      method: "POST",
      headers: { authorization: `Bearer ${gateway.token}`, "content-type": "application/json" },
      body: JSON.stringify({
        org_id: ORG,
        type: "device.registered",
        actor_user_id: ACTOR,
        server_received_at: NOW,
        payload: { device_id: "device-1" },
      }),
    });
    const edit = stageEdit(deps, {
      org_id: ORG,
      actor_user_id: ACTOR,
      entry: priced("a", 100, 120),
      apply_when: "now",
    });
    await publishEdits(deps, ORG, [edit]);

    const history = await deps.ledger.history(ORG);
    expect(history.map((record) => record.type)).toEqual(["catalog.changed"]);
  });

  it("writes one catalog.changed PER ENTRY, so 14-F8 history stays per-item", async () => {
    const edits = ["a", "b", "c"].map((id) =>
      stageEdit(deps, {
        org_id: ORG,
        actor_user_id: ACTOR,
        entry: priced(id, 100, 120),
        apply_when: "now",
      }),
    );
    expect(await publishEdits(deps, ORG, edits)).toBe(1);

    // ONE artifact publish, THREE audit records — a bulk edit is one version and three rows.
    expect(gateway.publishes()).toHaveLength(1);
    expect(gateway.orgEvents()).toHaveLength(3);
    expect((await deps.ledger.history(ORG)).map((r) => r.payload.entity_id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  /**
   * **THE NON-ATOMICITY, ASSERTED RATHER THAN PAPERED OVER.** B-4 named it: the artifact and the
   * audit record are two writes to two stores over two requests, and nothing makes them one
   * transaction. The honest statement of what happens is a test, and the alternative — a comment
   * saying "these should be atomic" — is how a wrong mental model survives review.
   *
   * The direction is chosen, not accidental: publish first means a failure leaves devices with the
   * right menu and `14-F3` missing one row. History-first would leave a history row claiming a
   * version no device can fetch, and `01-F1` forbids deleting the claim afterwards.
   */
  it("leaves the menu PUBLISHED when the audit append fails — they are not one transaction", async () => {
    gateway.refuseWith("/internal/org-events", 500, "org event store unavailable");
    const edit = stageEdit(deps, {
      org_id: ORG,
      actor_user_id: ACTOR,
      entry: priced("a", 100, 120),
      apply_when: "now",
    });

    await expect(publishEdits(deps, ORG, [edit])).rejects.toThrow(/org event store unavailable/);

    // The artifact stands: version 1 is published and a device fetching now gets the entry.
    expect(await deps.publisher.published(ORG)).toEqual({
      version: 1,
      entries: [priced("a", 100, 120)],
    });
    // And the history is short by exactly that row. This is the accepted cost, stated.
    expect(await deps.ledger.history(ORG)).toEqual([]);
  });

  it("publishes NOTHING when the artifact write fails, so no history claims a version that does not exist", async () => {
    gateway.refuseWith("/internal/catalog/publish", 500, "catalog store unavailable");
    const edit = stageEdit(deps, {
      org_id: ORG,
      actor_user_id: ACTOR,
      entry: priced("a", 100, 120),
      apply_when: "now",
    });

    await expect(publishEdits(deps, ORG, [edit])).rejects.toThrow(/catalog store unavailable/);
    expect(await deps.publisher.published(ORG)).toEqual({ version: 0, entries: [] });
    expect(await deps.ledger.history(ORG)).toEqual([]);
    expect(gateway.orgEvents()).toEqual([]);
  });
});
