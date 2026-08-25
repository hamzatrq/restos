// Acceptance tests — `01-F87`'s `config` artifact on a DEVICE: the wire frame, the accumulator,
// the store, and the `00 §7` (e) resolution a till reads.
//
// FRs: `01-F87` (a)/(b), `01-F75`, `01-F76`, `01-F77`, `01-F56`, `01-F17`, `00 §7` (d)/(e),
// `16-F1`, `16-F27`, `02-F63`, `05-F33`.
//
// ⚠ **AUTHORED ALONGSIDE THE IMPLEMENTATION** under founder ruling **R66** (tests beside the code
// for `plans/v0.md`'s four gaps; this is gap 3 — *"somewhere for tax rates to live"*). AGENTS.md §7
// records that R66 is carried into no FR. See `packages/domain/src/__acceptance__/
// config-plane.test.ts`'s header for the full statement of what that costs.
//
// ── EVERY ASSERTION RUNS THE WHOLE HOP, AND THAT IS THIS PACKAGE'S OWN MEASURED LESSON ────────
//
// `catalog-fetch.ts`'s `toEntry` dropped `prices` and `station`, and **failed 0 of 579 tests**,
// because the two halves were each covered and nothing covered the JOIN: `catalog-pricing.test.ts`
// called `store.catalog.apply()` directly and never crossed the reshape, and
// `catalog-fetch.test.ts` did not contain the word *price*. So the tests below go
// **wire frame → `parseMessage` → `accept()` → `store.config.apply()` → `store.config.resolve()`**
// and assert on the resolved VALUE. An assertion on `update.entries[0].value` would pass against a
// store that dropped the row, which is the same mistake one layer down.
//
// ── WHAT THIS FILE DELIBERATELY DOES NOT ASSERT ───────────────────────────────────────────────
//
//   · **The per-key SCHEMAS and DEFAULTS.** They are `@restos/domain/config`'s and are asserted
//     there; re-asserting them here would be a second copy of a declaration `18 §2` keeps single.
//   · **THE FOLD BAN.** Structural, and asserted in `fold-config-ban.test.ts`.
//   · **The gateway's SERVE path.** It needs a real Postgres and lives beside its own suite.

import { parseMessage } from "@restos/sync-protocol";
import { describe, expect, it } from "vitest";
import {
  createConfigFetch,
  type DeviceStore,
  openStore,
  type WireConfigResponse,
} from "../index.js";

const ORG = "01980000-0000-7000-8000-0000000000a1";
const BRANCH = "01980000-0000-7000-8000-00000000b001";

const device = (): DeviceStore =>
  openStore({ path: ":memory:", identity: { org_id: ORG, branch_id: BRANCH, device_id: "dev-1" } });

/**
 * A `reference_response` for `config`, PARSED THROUGH THE PRODUCTION CODEC.
 *
 * Not a hand-built object: `01-F75` types `entries[]` per resource and the FRAME is where a
 * cross-resource payload is made unrepresentable, so a fixture that skipped `parseMessage` would
 * assert against a shape the wire may not even carry — and would go on passing after a schema
 * change that broke every real device.
 */
const frame = (body: {
  form: "snapshot" | "delta";
  version: number;
  base_version?: number;
  entries: readonly { key: string; value?: unknown; deleted?: boolean }[];
  complete?: boolean;
  next_from?: number;
  org_id?: string;
}): WireConfigResponse => {
  const parsed = parseMessage({
    v: 2,
    kind: "reference_response",
    resource: "config",
    scope: { org_id: body.org_id ?? ORG, branch_id: null },
    form: body.form,
    version: body.version,
    ...(body.base_version === undefined ? {} : { base_version: body.base_version }),
    entries: body.entries,
    complete: body.complete ?? true,
    next_from: body.next_from ?? 0,
  });
  if (parsed.kind !== "reference_response" || parsed.resource !== "config") {
    throw new Error("fixture did not parse as a config reference_response");
  }
  return parsed;
};

/** The whole hop: frames in, applied artifact out. */
const receive = (
  store: DeviceStore,
  have: number,
  ...frames: readonly WireConfigResponse[]
): ReturnType<DeviceStore["config"]["apply"]> => {
  const fetch = createConfigFetch(have);
  let last: ReturnType<DeviceStore["config"]["apply"]> | null = null;
  for (const f of frames) {
    const step = fetch.accept(f);
    if (!step.done) continue;
    if (step.update === null) {
      last = {
        applied: false,
        reason: "malformed",
        version: store.config.version(),
        key: "",
        detail: "accumulator refused the fetch",
      };
      continue;
    }
    last = store.config.apply(step.update);
  }
  if (last === null) throw new Error("no frame completed the fetch");
  return last;
};

const TAX_16 = {
  default: { posture: "exclusive", rate_bps: 1600 },
  by_tender: [{ tender: "card", cell: { posture: "exclusive", rate_bps: 800 } }],
};

describe("§A — 01-F87 (b): a device with no artifact holds DECLARED DEFAULTS and never blocks", () => {
  it("A1 01-F87 (b)/01-F17/00 §5.1: before any contact, every key resolves to its build default", () => {
    // *"A device that has never received the artifact uses the declared default and never
    // blocks"* — the alternative is a till that cannot act until the WAN has been up once, which
    // is the `00 §5.1` breach `00 §7` (d) exists to prevent.
    const store = device();
    expect(store.config.version()).toBe(0);
    expect(store.config.resolve("tax.posture_matrix").value.default).toEqual({
      posture: "none",
      rate_bps: 0,
    });
    expect(store.config.resolve("charge.rounding_paisa").value).toBe(100);
    expect(store.config.resolve("paid_out.approval_threshold_paisa").value).toBe(0);
  });

  it("A3 00 §7 (e): a key CONFIGURED to its own default VALUE still resolves `configured`", () => {
    // ⚠ **ADDED BECAUSE THE MUTANT SURVIVED (round-3 law, mutant C3).** An implementation deriving
    // `source` by COMPARING the held value against the declared default passes every other
    // assertion in this file — the §B fixtures all configure a value that differs from the default
    // (1000 against 100), so the comparison and the truth agree there. It dies only on the owner
    // who deliberately sets the rounding step to Rs 1: she HAS configured it, and a device
    // reporting `default` for her tells an operator *the owner never set this* about a value she
    // chose. `packages/domain`'s §C2 holds the same property one layer down; this is the device
    // hop, and reading the suite would not have found the gap — running the mutant did.
    const store = device();
    receive(
      store,
      0,
      frame({
        form: "snapshot",
        version: 2,
        entries: [{ key: "charge.rounding_paisa", value: 100 }],
      }),
    );
    expect(store.config.resolve("charge.rounding_paisa")).toEqual({
      value: 100,
      source: "configured",
    });
    expect([...store.config.keysOnDefault()]).not.toContain("charge.rounding_paisa");
  });

  it("A2 00 §7 (e): and it can SAY so — every key is named as still on its default", () => {
    const store = device();
    expect([...store.config.keysOnDefault()]).toContain("tax.posture_matrix");
    expect([...store.config.keysOnDefault()]).toContain("charge.rounding_paisa");
    expect(store.config.unknownKeys()).toEqual([]);
  });
});

describe("§B — the WHOLE HOP: a published rate reaches the till and resolves as `configured`", () => {
  it("B1 01-F87: wire frame → accept → apply → resolve, and the RATE is what the owner typed", () => {
    // **The `catalog-fetch.ts` regression shape.** A `toEntry` that dropped `value` would pass any
    // assertion on the accumulator's output and fail here, because this reads the resolved cell.
    const store = device();
    const result = receive(
      store,
      0,
      frame({
        form: "snapshot",
        version: 4,
        entries: [
          { key: "tax.posture_matrix", value: TAX_16 },
          { key: "charge.rounding_paisa", value: 1000 },
        ],
      }),
    );
    expect(result.applied).toBe(true);
    expect(store.config.version()).toBe(4);

    const tax = store.config.resolve("tax.posture_matrix");
    expect(tax.source).toBe("configured");
    expect(tax.value.default).toEqual({ posture: "exclusive", rate_bps: 1600 });
    // `16-F27`'s per-tender override survives the hop — the field that makes R55's *"cash and card
    // are taxed differently in this market"* representable at all.
    expect(tax.value.by_tender).toEqual([
      { tender: "card", cell: { posture: "exclusive", rate_bps: 800 } },
    ]);

    expect(store.config.resolve("charge.rounding_paisa")).toEqual({
      value: 1000,
      source: "configured",
    });
    // A key the org did NOT publish stays on its default, with the source that says so.
    expect(store.config.resolve("paid_out.approval_threshold_paisa")).toEqual({
      value: 0,
      source: "default",
    });
    expect([...store.config.keysOnDefault()]).toContain("paid_out.approval_threshold_paisa");
    expect([...store.config.keysOnDefault()]).not.toContain("tax.posture_matrix");
  });

  it("B2 01-F56: a DELTA moves one key and leaves the others alone", () => {
    const store = device();
    receive(
      store,
      0,
      frame({
        form: "snapshot",
        version: 4,
        entries: [{ key: "tax.posture_matrix", value: TAX_16 }],
      }),
    );
    const result = receive(
      store,
      4,
      frame({
        form: "delta",
        version: 5,
        base_version: 4,
        entries: [{ key: "paid_out.approval_threshold_paisa", value: 500_000 }],
      }),
    );
    expect(result).toEqual({ applied: true, version: 5 });
    // The key the delta did NOT name is unchanged — a delta carries one row per CHANGED key, so
    // an absent key is unchanged and never a reset (which is why a reset has to be a marked row).
    expect(store.config.resolve("tax.posture_matrix").value.default.rate_bps).toBe(1600);
    expect(store.config.resolve("paid_out.approval_threshold_paisa").value).toBe(500_000);
  });

  it("B3 01-F75/01-F87 (b): a MARKED row is a RESET — the key returns to its declared default", () => {
    // The transition `01-F87` (a) types as `v → null`. Without a marked row a delta has no way to
    // state it at all, which is why `01-F75` refuses a removals list for every resource.
    const store = device();
    receive(
      store,
      0,
      frame({
        form: "snapshot",
        version: 1,
        entries: [{ key: "charge.rounding_paisa", value: 1000 }],
      }),
    );
    expect(store.config.resolve("charge.rounding_paisa").source).toBe("configured");

    receive(
      store,
      1,
      frame({
        form: "delta",
        version: 2,
        base_version: 1,
        entries: [{ key: "charge.rounding_paisa", deleted: true }],
      }),
    );
    expect(store.config.resolve("charge.rounding_paisa")).toEqual({
      value: 100,
      source: "default",
    });
    expect([...store.config.keysOnDefault()]).toContain("charge.rounding_paisa");
  });

  it("B4 01-F75/01-F56: a PAGED snapshot applies ATOMICALLY — a half artifact is never held", () => {
    // `01-F87` measures layer 2 as a handful of scalars so this will not page in practice; the
    // property is asserted anyway, because `01-F75` makes paging part of the frame vocabulary for
    // EVERY resource and an arm that assumed one page would fail silently the first time a module
    // doc added enough keys to split one.
    const store = device();
    const fetch = createConfigFetch(0);
    const first = fetch.accept(
      frame({
        form: "snapshot",
        version: 7,
        entries: [{ key: "tax.posture_matrix", value: TAX_16 }],
        complete: false,
        next_from: 1,
      }),
    );
    expect(first.done).toBe(false);
    // Nothing has been applied yet — the device holds nothing, not half.
    expect(store.config.version()).toBe(0);
    expect(store.config.resolve("tax.posture_matrix").source).toBe("default");

    const second = fetch.accept(
      frame({
        form: "snapshot",
        version: 7,
        entries: [{ key: "charge.rounding_paisa", value: 1000 }],
        complete: true,
      }),
    );
    expect(second.done).toBe(true);
    if (!second.done || second.update === null) throw new Error("expected a completed update");
    expect(store.config.apply(second.update)).toEqual({ applied: true, version: 7 });
    // BOTH pages landed, in ONE commit.
    expect(store.config.resolve("tax.posture_matrix").source).toBe("configured");
    expect(store.config.resolve("charge.rounding_paisa").value).toBe(1000);
  });
});

describe("§C — 01-F87 (b): an unknown key is IGNORED, a malformed KNOWN key refuses the WHOLE artifact", () => {
  it("C1 01-F87 (b): a key this build does not know is ignored, reported, and costs nothing", () => {
    // *"An unknown key means the CLOUD is newer, so refusing punishes a device for the cloud's
    // progress and produces the stopped-till-through-a-validator `01-F75` names."*
    const store = device();
    const result = receive(
      store,
      0,
      frame({
        form: "snapshot",
        version: 2,
        entries: [
          { key: "charge.rounding_paisa", value: 1000 },
          { key: "loyalty.stamp_card_size", value: 8 },
        ],
      }),
    );
    expect(result).toEqual({ applied: true, version: 2 });
    expect(store.config.resolve("charge.rounding_paisa").value).toBe(1000);
    // …and health can say the cloud is ahead of this build, which a silent ignore cannot.
    expect(store.config.unknownKeys()).toEqual(["loyalty.stamp_card_size"]);
  });

  it("C2 01-F87 (b): ONE malformed known key refuses the artifact and the till KEEPS WHAT IT HELD", () => {
    // **The row that matters, and the one `17-F22` cites when it refuses to put campaigns in this
    // artifact.** The refusal is brutal on purpose; what makes it survivable is the other half of
    // (b) — *"a refused artifact leaves every key at the version the device already holds, or on
    // its default"* — so the till goes on selling (`01-F17`).
    const store = device();
    receive(
      store,
      0,
      frame({
        form: "snapshot",
        version: 3,
        entries: [{ key: "charge.rounding_paisa", value: 1000 }],
      }),
    );

    const result = receive(
      store,
      3,
      frame({
        form: "snapshot",
        version: 4,
        entries: [
          { key: "charge.rounding_paisa", value: 500 },
          // `02-F63` (c): a step that is not a whole number of rupees.
          { key: "paid_out.approval_threshold_paisa", value: -1 },
        ],
      }),
    );
    expect(result.applied).toBe(false);
    if (result.applied) return;
    expect(result.reason).toBe("malformed");
    // `01-F56` requires the refusal to be observable, and the KEY is what makes it actionable.
    expect(result).toMatchObject({ key: "paid_out.approval_threshold_paisa" });

    // The GOOD row in the refused artifact did NOT land — a partial apply is a device holding
    // half an org's configuration under one version number.
    expect(store.config.version()).toBe(3);
    expect(store.config.resolve("charge.rounding_paisa").value).toBe(1000);
  });

  it("C3 01-F17: nothing on this path throws, whatever arrives", () => {
    const store = device();
    for (const value of [null, "1600", { rate_bps: 1600 }, [], 0.5]) {
      expect(() =>
        store.config.apply({
          kind: "snapshot",
          version: 2,
          entries: [{ key: "tax.posture_matrix", value }],
        }),
      ).not.toThrow();
    }
    // …and after every one of them the till still holds a usable configuration.
    expect(store.config.resolve("charge.rounding_paisa").value).toBe(100);
  });
});

describe("§D — 01-F56: monotone apply and divergence detection", () => {
  it("D1 01-F56: an OLDER delta is refused as `stale`", () => {
    const store = device();
    receive(
      store,
      0,
      frame({
        form: "snapshot",
        version: 5,
        entries: [{ key: "charge.rounding_paisa", value: 1000 }],
      }),
    );
    const result = store.config.apply({
      kind: "delta",
      from_version: 3,
      version: 4,
      entries: [{ key: "charge.rounding_paisa", value: 100 }],
    });
    expect(result).toEqual({ applied: false, reason: "stale", version: 5 });
    expect(store.config.resolve("charge.rounding_paisa").value).toBe(1000);
  });

  it("D2 01-F56: a delta whose BASE does not match asks for a snapshot rather than guessing", () => {
    const store = device();
    receive(
      store,
      0,
      frame({
        form: "snapshot",
        version: 5,
        entries: [{ key: "charge.rounding_paisa", value: 1000 }],
      }),
    );
    const result = store.config.apply({
      kind: "delta",
      from_version: 4,
      version: 6,
      entries: [{ key: "charge.rounding_paisa", value: 100 }],
    });
    expect(result).toEqual({ applied: false, reason: "needs_snapshot", version: 5 });
  });

  it("D3 01-F56: a snapshot AT the held version is applied — it is the device's only self-heal", () => {
    // Refusing it would leave a device that is wrong at N wrong until the org next edits a
    // setting, while `version()` keeps reporting a number that looks correct. On this artifact
    // "wrong at N" is a wrong tax rate.
    const store = device();
    receive(
      store,
      0,
      frame({
        form: "snapshot",
        version: 5,
        entries: [{ key: "charge.rounding_paisa", value: 100 }],
      }),
    );
    const result = receive(
      store,
      5,
      frame({
        form: "snapshot",
        version: 5,
        entries: [{ key: "charge.rounding_paisa", value: 1000 }],
      }),
    );
    expect(result).toEqual({ applied: true, version: 5 });
    expect(store.config.resolve("charge.rounding_paisa").value).toBe(1000);
  });

  it("D4 01-F56: two DIFFERENT deltas at one version are DIVERGENT — the device drops to defaults", () => {
    // *"Two tills charging different tax at one version number"* is what this detects. Refusal
    // alone cannot fix it (both sit at N holding different settings, each having refused the
    // other as a duplicate), so the device drops to 0 — every key back on its declared default,
    // still trading — until a snapshot re-establishes what N means.
    const store = device();
    receive(
      store,
      0,
      frame({
        form: "snapshot",
        version: 1,
        entries: [{ key: "charge.rounding_paisa", value: 100 }],
      }),
    );
    const first = store.config.apply({
      kind: "delta",
      from_version: 1,
      version: 2,
      entries: [{ key: "charge.rounding_paisa", value: 1000 }],
    });
    expect(first).toEqual({ applied: true, version: 2 });

    const competitor = store.config.apply({
      kind: "delta",
      from_version: 1,
      version: 2,
      entries: [{ key: "charge.rounding_paisa", value: 100 }],
    });
    expect(competitor).toEqual({ applied: false, reason: "divergent", version: 0 });
    expect(store.config.version()).toBe(0);
    // `01-F87` (b) + `01-F17`: dropping to defaults is a TRADING till, not a stopped one.
    expect(store.config.resolve("charge.rounding_paisa")).toEqual({
      value: 100,
      source: "default",
    });
  });

  it("D5 01-F56: a byte-identical replay of the same delta is `stale`, never `divergent`", () => {
    // The control for D4. A suite that could not tell a redelivery from a competitor would send a
    // manager to look for a problem that does not exist (`00 §5.7`).
    const store = device();
    receive(
      store,
      0,
      frame({
        form: "snapshot",
        version: 1,
        entries: [{ key: "charge.rounding_paisa", value: 100 }],
      }),
    );
    const update = {
      kind: "delta" as const,
      from_version: 1,
      version: 2,
      entries: [{ key: "charge.rounding_paisa", value: 1000 }],
    };
    expect(store.config.apply(update)).toEqual({ applied: true, version: 2 });
    expect(store.config.apply(update)).toEqual({ applied: false, reason: "stale", version: 2 });
    expect(store.config.resolve("charge.rounding_paisa").value).toBe(1000);
  });

  it("D6 01-F56: two devices reaching one version by DIFFERENT routes hold identical bytes", () => {
    // The property divergence detection rests on: a snapshot here and a delta there must produce
    // the same stored artifact, or `last_form` comparisons are noise. A store that kept rows in
    // arrival order rather than sorted would pass every assertion above and fail this one.
    const viaSnapshot = device();
    receive(
      viaSnapshot,
      0,
      frame({
        form: "snapshot",
        version: 2,
        entries: [
          { key: "tax.posture_matrix", value: TAX_16 },
          { key: "charge.rounding_paisa", value: 1000 },
        ],
      }),
    );

    const viaDelta = device();
    receive(
      viaDelta,
      0,
      frame({
        form: "snapshot",
        version: 1,
        entries: [{ key: "charge.rounding_paisa", value: 1000 }],
      }),
    );
    receive(
      viaDelta,
      1,
      frame({
        form: "delta",
        version: 2,
        base_version: 1,
        entries: [{ key: "tax.posture_matrix", value: TAX_16 }],
      }),
    );

    expect(viaDelta.config.version()).toBe(viaSnapshot.config.version());
    for (const key of ["tax.posture_matrix", "charge.rounding_paisa"] as const) {
      expect(viaDelta.config.resolve(key), key).toEqual(viaSnapshot.config.resolve(key));
    }
    expect([...viaDelta.config.keysOnDefault()]).toEqual([...viaSnapshot.config.keysOnDefault()]);
  });
});

describe("§E — 01-F87/01-F76: the artifact is ORG-scoped and its version is DURABLE", () => {
  it("E1 01-F76: the wire pins `config` to ORG scope — a branch-scoped frame is unrepresentable", () => {
    // `01-F87` rules the scope and the codec enforces it: a branch-scoped configuration artifact
    // would make one version number mean different bytes on different devices, destroying the
    // premise `01-F56`'s divergence detection rests on.
    expect(() =>
      parseMessage({
        v: 2,
        kind: "reference_response",
        resource: "config",
        scope: { org_id: ORG, branch_id: BRANCH },
        form: "snapshot",
        version: 1,
        entries: [{ key: "charge.rounding_paisa", value: 100 }],
        complete: true,
        next_from: 0,
      }),
    ).toThrow();
  });

  it("E2 01-F75/01-F87: a row that states NEITHER a value nor a reset is unrepresentable", () => {
    // Without this the writer could emit `{ key }` alone, which reaches `parseConfigArtifact` as
    // `value: undefined` — a malformed KNOWN key — and would take the org's whole configuration
    // down at every till through `01-F87` (b)'s refusal.
    expect(() =>
      parseMessage({
        v: 2,
        kind: "reference_response",
        resource: "config",
        scope: { org_id: ORG, branch_id: null },
        form: "snapshot",
        version: 1,
        entries: [{ key: "charge.rounding_paisa" }],
        complete: true,
        next_from: 0,
      }),
    ).toThrow();
  });

  it("E3 01-F75: TWO rows for one key are unrepresentable — array position must not decide a rate", () => {
    expect(() =>
      parseMessage({
        v: 2,
        kind: "reference_response",
        resource: "config",
        scope: { org_id: ORG, branch_id: null },
        form: "snapshot",
        version: 1,
        entries: [
          { key: "charge.rounding_paisa", value: 100 },
          { key: "charge.rounding_paisa", value: 1000 },
        ],
        complete: true,
        next_from: 0,
      }),
    ).toThrow();
  });
});
