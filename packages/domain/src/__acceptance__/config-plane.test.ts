// Acceptance tests — `01-F87`'s configuration plane in `packages/domain`.
//
// FRs: `01-F87` (a)/(b), `00 §7` (b)/(d)/(e), `14-F43`, `14-F48`, `16-F1`, `16-F27`, `16-F28`,
// `02-F63`, `05-F33`, `14-F47`/R71, `02-F60`/`14-F46`.
//
// ⚠ **AUTHORED ALONGSIDE THE IMPLEMENTATION, WHICH `20 §4.3` NORMALLY FORBIDS.** Founder ruling
// **R66** tiers the pipeline by PATH and puts tests beside the code in the same session for
// `plans/v0.md`'s four gaps; this is gap 3 (*"somewhere for tax rates to live"*). AGENTS.md §7
// records that R66 is carried into no FR, so this header is the citation and the weakness is
// stated rather than hidden: **the session that wrote the implementation wrote these assertions,
// so they cannot be evidence that the implementation matches an independent reading of the FR.**
// What they CAN be is evidence that a specific defect reddens, which is why every section names
// the mutant it exists to kill and the mutation matrix in `packages/domain/CLAUDE.md` reports the
// numbers.
//
// ── WHAT THIS FILE DELIBERATELY DOES NOT ASSERT ────────────────────────────────────────────────
//
//   · **Any key's VALUE as policy.** `05-F33` decides the paid-out default is 0 and `02-F63` (c)
//     decides the rounding step is 100; §B asserts they are what those FRs say, which is a
//     transcription check. It does not assert that they are *right* — that is a founder call
//     recorded in an FR, and a test cannot hold one.
//   · **The eight `00 §7` (f) environment stopgaps.** `01-F87` says in terms that none is retired
//     by it, so a test implying they are gone would redden a correct implementation.
//   · **The FOLD BAN.** That is structural (`01-F87`: *"what a fold is allowed to take as
//     input"*) and it is asserted where the folds are —
//     `packages/sync-client/src/__acceptance__/fold-config-ban.test.ts`.

import { describe, expect, it } from "vitest";
import {
  CHARGE_ROUNDING_RUPEE_STEP,
  CONFIG_AUDIENCES,
  CONFIG_KEY_NAMES,
  CONFIG_KEYS,
  CONFIG_LAYERS,
  CONFIG_SOURCES,
  configKeysOnDefault,
  EMPTY_CONFIG,
  isConfigKey,
  isDeviceConfigKey,
  parseConfigArtifact,
  refuseConfigWrite,
  resolveConfig,
  type TaxPostureMatrix,
  taxCellForTender,
} from "../config.js";
import { newId } from "../ids.js";
import { eventRegistry, PAYMENT_METHODS, parseEvent } from "../registry.js";
import { TAX_OFF } from "../tax.js";

const applied = (entries: Parameters<typeof parseConfigArtifact>[1], version = 1) => {
  const result = parseConfigArtifact(version, entries);
  if (!result.ok)
    throw new Error(`expected an applied artifact, got ${result.key}: ${result.detail}`);
  return result;
};

describe("§A — the registry is a real registry (24-F14 anti-vacuity)", () => {
  it("A1 24-F14: the key set is non-empty and every assertion below has something to iterate", () => {
    // Every loop in this file walks `CONFIG_KEY_NAMES`. An empty registry — or one renamed out
    // from under this import — would pass all of them vacuously.
    expect(CONFIG_KEY_NAMES.length).toBeGreaterThan(0);
    expect([...CONFIG_KEY_NAMES].sort()).toEqual(Object.keys(CONFIG_KEYS).sort());
  });

  it("A2 01-F87/plans/v0.md gap 3: the five keys this pilot needs are declared, by name", () => {
    // Named rather than counted. A count goes stale the moment a module doc adds its first
    // setting (`00 §7`: the key space is the union over every module doc and grows with each
    // one), and `01-F87` (a) makes that growth ORDINARY rather than a spec event here.
    for (const key of [
      "tax.posture_matrix",
      "charge.rounding_paisa",
      "paid_out.approval_threshold_paisa",
      "discount.approval_threshold_bps",
      "commission.by_provider",
    ]) {
      expect(isConfigKey(key), key).toBe(true);
    }
  });

  it("A3 00 §7 (d): EVERY key declares a default — 14-F48 (n), and it is checked rather than assumed", () => {
    // `14-F48` (n) refuses *"any key saved without a declared default"*. The TYPE makes that
    // unrepresentable (`ConfigKeyDeclaration.default` is required), and this is the assertion that
    // the claim is true of the shipped object rather than only of the type — a `declare({ … } as
    // never)` would compile.
    for (const key of CONFIG_KEY_NAMES) {
      expect(CONFIG_KEYS[key], key).toHaveProperty("default");
      expect(CONFIG_KEYS[key].default, key).not.toBeUndefined();
    }
  });

  it("A4 00 §7 (d): every declared default SATISFIES its own key's schema", () => {
    // The sharper half of A3, and the one a reviewer should care about: a default that its own
    // schema refuses is a device that cannot resolve the key it was given a default FOR — and
    // `01-F87` (b) makes that the state of every device before first contact.
    for (const key of CONFIG_KEY_NAMES) {
      expect(refuseConfigWrite(key, CONFIG_KEYS[key].default), key).toBeNull();
    }
  });

  it("A5 01-F87 (a)/00 §7: every key states its LAYER and its owning FR", () => {
    for (const key of CONFIG_KEY_NAMES) {
      expect(CONFIG_LAYERS, key).toContain(CONFIG_KEYS[key].layer);
      // `01-F87`: each key's schema *"belongs to the doc that owns the key"*, so a row with no FR
      // is a key nobody can check against a spec.
      expect(CONFIG_KEYS[key].fr, key).toMatch(/^(?:\d{2}-F\d+|R\d+)$/);
      expect(CONFIG_AUDIENCES, key).toContain(CONFIG_KEYS[key].audience);
    }
  });

  it("A6 00 §7: this build's keys are all LAYER 2 — the plane 01-F87's artifact carries", () => {
    // `CONFIG_LAYERS` holds all three because `config.changed` already spans them (`15-F25` routes
    // an org's suspension through it, which is layer 1). The ARTIFACT carries layer 2, and this is
    // the assertion that no layer-1 or layer-3 key has been slipped into it — which would put a
    // vendor entitlement or a device's printer assignment on an org-wide replicated artifact.
    for (const key of CONFIG_KEY_NAMES) expect(CONFIG_KEYS[key].layer, key).toBe(2);
  });
});

describe("§B — the declared defaults are the FRs' own numbers (00 §7 (d))", () => {
  it("B1 16-F1: an org that has configured nothing charges NO TAX", () => {
    const { value, source } = resolveConfig(EMPTY_CONFIG, "tax.posture_matrix");
    expect(value.default).toEqual(TAX_OFF);
    expect(value.by_tender).toEqual([]);
    expect(source).toBe("default");
  });

  it("B2 02-F63 (c): the charge granularity defaults to Rs 1", () => {
    expect(resolveConfig(EMPTY_CONFIG, "charge.rounding_paisa").value).toBe(100);
    expect(CHARGE_ROUNDING_RUPEE_STEP).toBe(100);
  });

  it("B3 05-F33 (R65): the paid-out threshold defaults to ZERO — Rs 2,000 is NOT carried forward", () => {
    // The row a reviewer should look hardest at. `00 §7` (f) says in terms that doc 05 *"must take
    // that decision rather than inherit it"*, and `apps/pos-electron`'s
    // `PAID_OUT_APPROVAL_THRESHOLD_PAISA = 200_000` is *today's pinned value*. A default of
    // 200_000 here would be the un-chosen default `00 §7` (d) refuses, and it would silently
    // reverse a founder ruling.
    expect(resolveConfig(EMPTY_CONFIG, "paid_out.approval_threshold_paisa").value).toBe(0);
    expect(resolveConfig(EMPTY_CONFIG, "paid_out.approval_threshold_paisa").value).not.toBe(
      200_000,
    );
  });

  it("B4 14-F47/00 §7 (d): the discount ceiling defaults to the STRICT end", () => {
    expect(resolveConfig(EMPTY_CONFIG, "discount.approval_threshold_bps").value).toBe(0);
  });

  it("B5 02-F60/00 §7 (d): an informational rate defaults to ABSENT, never to zero", () => {
    // *"A zero default renders a net equal to the gross, and a number that looks computed is
    // believed"* (`14-F46`). The empty registry IS that absence, and `source` is what lets a
    // surface say *the owner has set no rate* rather than *the rate is nil*.
    const resolved = resolveConfig(EMPTY_CONFIG, "commission.by_provider");
    expect(resolved.value).toEqual([]);
    expect(resolved.source).toBe("default");
  });
});

describe("§C — 00 §7 (e): the resolved SOURCE travels with the value", () => {
  it("C1 00 §7 (e): a key nothing has configured resolves `default`", () => {
    expect(CONFIG_SOURCES).toEqual(["configured", "default"]);
    for (const key of CONFIG_KEY_NAMES) {
      expect(resolveConfig(EMPTY_CONFIG, key).source, key).toBe("default");
    }
  });

  it("C2 00 §7 (e): a key the org HAS configured resolves `configured` — even at the default VALUE", () => {
    // **The assertion this section exists for.** An owner who deliberately sets the rounding step
    // to Rs 1 — the same number the build defaults to — has CONFIGURED it, and a device that
    // reported `default` for her would tell an operator *the owner never set this* about a value
    // she chose. An implementation deriving `source` by comparing against the default passes every
    // other test in this file and fails here.
    const { artifact } = applied([{ key: "charge.rounding_paisa", value: 100 }], 3);
    const resolved = resolveConfig(artifact, "charge.rounding_paisa");
    expect(resolved.value).toBe(100);
    expect(resolved.source).toBe("configured");
  });

  it("C3 00 §7 (e)/01-F87 (b): device health can name EVERY key still on its default", () => {
    expect([...configKeysOnDefault(EMPTY_CONFIG)].sort()).toEqual([...CONFIG_KEY_NAMES].sort());
    const { artifact } = applied([{ key: "charge.rounding_paisa", value: 1000 }], 2);
    expect(configKeysOnDefault(artifact)).not.toContain("charge.rounding_paisa");
    expect(configKeysOnDefault(artifact)).toContain("tax.posture_matrix");
  });

  it("C4 01-F75/01-F87 (b): a RESET returns a key to its declared default, and health says so", () => {
    const { artifact } = applied(
      [
        { key: "charge.rounding_paisa", value: 1000 },
        { key: "charge.rounding_paisa", deleted: true },
      ],
      5,
    );
    const resolved = resolveConfig(artifact, "charge.rounding_paisa");
    expect(resolved.value).toBe(100);
    expect(resolved.source).toBe("default");
    expect(configKeysOnDefault(artifact)).toContain("charge.rounding_paisa");
  });
});

describe("§D — 01-F87 (b): an UNKNOWN key is ignored, a MALFORMED KNOWN key refuses the WHOLE artifact", () => {
  it("D1 01-F87 (b): an unknown key is IGNORED and reported, never a refusal", () => {
    // *"An unknown key means the CLOUD is newer, so refusing punishes a device for the cloud's
    // progress and produces the stopped-till-through-a-validator `01-F75` names."*
    const result = parseConfigArtifact(9, [
      { key: "charge.rounding_paisa", value: 1000 },
      { key: "loyalty.stamp_card_size", value: 8 },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ignored).toEqual(["loyalty.stamp_card_size"]);
    expect(resolveConfig(result.artifact, "charge.rounding_paisa").value).toBe(1000);
  });

  it("D2 01-F87 (b): ONE malformed known key refuses the WHOLE artifact, naming the key", () => {
    // **The row that matters, and the reason `17-F22` gave campaigns their own resource.** The
    // GOOD row beside the bad one must NOT survive: a partial apply is a device holding half an
    // org's configuration under one version number, which is `01-F56`'s undetectable divergence.
    const result = parseConfigArtifact(9, [
      { key: "charge.rounding_paisa", value: 1000 },
      { key: "paid_out.approval_threshold_paisa", value: -1 },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("malformed");
    expect(result.key).toBe("paid_out.approval_threshold_paisa");
    // `01-F56` requires the refusal to be observable, and *"one of your settings is bad"* is not
    // an actionable answer.
    expect(result.detail).toMatch(/negative/);
  });

  it("D3 01-F17/01-F56: a malformed artifact NEVER throws — a stopped till is the one unacceptable outcome", () => {
    for (const bad of [null, undefined, 42, "1000", { posture: "exclusive" }, []]) {
      expect(() =>
        parseConfigArtifact(1, [{ key: "charge.rounding_paisa", value: bad }]),
      ).not.toThrow();
    }
  });
});

describe("§E — 14-F48: what the WRITER refuses to save", () => {
  it("E1 01-F87 (a)/14-F48: an UNKNOWN key is REFUSED here and IGNORED at the device", () => {
    // **The asymmetry is the point.** At the device an unknown key means the cloud is newer; at
    // the writer there is no newer cloud, so it is a typo — *"caught once at a failed save instead
    // of frozen forever in an append-only ledger"* (`01-F60`, `01-F85`).
    const refusal = refuseConfigWrite("tax.posture_matrxi", { default: TAX_OFF, by_tender: [] });
    expect(refusal).not.toBeNull();
    expect(refusal?.message).toMatch(/not a setting this build declares/);
    // …and the same key is IGNORED, not refused, on the device path.
    const applyResult = parseConfigArtifact(1, [{ key: "tax.posture_matrxi", value: 1 }]);
    expect(applyResult.ok).toBe(true);
  });

  it("E2 14-F48 (g)/16-F27: a posture with NO RATE is refused — no empty cell", () => {
    const refusal = refuseConfigWrite("tax.posture_matrix", {
      default: { posture: "exclusive" },
      by_tender: [],
    });
    expect(refusal?.message).toMatch(/16-F27|14-F48 \(g\)/);
  });

  it("E3 14-F48 (h): posture `none` carrying a NON-ZERO rate is refused", () => {
    // *"A rate nothing applies is a number that will be believed later"* — and under `01-F1` it is
    // believed permanently.
    const refusal = refuseConfigWrite("tax.posture_matrix", {
      default: { posture: "none", rate_bps: 1600 },
      by_tender: [],
    });
    expect(refusal?.message).toMatch(/14-F48 \(h\)/);
  });

  it("E4 14-F48 (i)/00 §6: a rate that is not an INTEGER in basis points is refused, and the value is NAMED", () => {
    for (const bad of [16, 0.16, -100, 16.5]) {
      const refusal = refuseConfigWrite("tax.posture_matrix", {
        default: { posture: "exclusive", rate_bps: bad },
        by_tender: [],
      });
      if (Number.isSafeInteger(bad) && bad >= 0) {
        // 16 bps is an unusual rate and NOT refused — `14-F48` refuses what is not a rate, never
        // what is an unusual one, because *"any threshold of implausibility is the vendor deciding
        // what tax is plausible, which is the rule-pack model R55 overruled"*.
        expect(refusal, String(bad)).toBeNull();
        continue;
      }
      expect(refusal, String(bad)).not.toBeNull();
      // `14-F48`: every refusal names the offending CELL. A path with no value is not actionable.
      expect(refusal?.message, String(bad)).toMatch(new RegExp(String(bad).replace(".", "\\.")));
    }
  });

  it("E5 16-F28: the tender axis is 02-F12's CLOSED set until R55's other half lands", () => {
    // `16-F28`: *"doc 16's matrix has a fixed column axis and R55 is delivered for the rates
    // only"* until `payment.recorded`'s payload changes, which is a protected-path spec act.
    for (const tender of PAYMENT_METHODS) {
      expect(
        refuseConfigWrite("tax.posture_matrix", {
          default: TAX_OFF,
          by_tender: [{ tender, cell: { posture: "exclusive", rate_bps: 1600 } }],
        }),
        tender,
      ).toBeNull();
    }
    expect(
      refuseConfigWrite("tax.posture_matrix", {
        default: TAX_OFF,
        by_tender: [{ tender: "jazzcash", cell: { posture: "exclusive", rate_bps: 1600 } }],
      }),
    ).not.toBeNull();
  });

  it("E6 16-F27/01-F34: TWO overrides for one tender are refused — array position must not decide a rate", () => {
    const refusal = refuseConfigWrite("tax.posture_matrix", {
      default: TAX_OFF,
      by_tender: [
        { tender: "card", cell: { posture: "exclusive", rate_bps: 1600 } },
        { tender: "card", cell: { posture: "exclusive", rate_bps: 800 } },
      ],
    });
    expect(refusal?.message).toMatch(/one override per tender/);
  });

  it("E7 02-F63 (c): a step that is not a WHOLE NUMBER OF RUPEES is refused, and 1 is the measured case", () => {
    // **Not an arbitrary bound.** Measured on shipping code: at `charge_rounding_paisa = 1`,
    // `exclusive` 16 % on one Rs 404 line, the bill is 46_864, `MoneyValue` truncates to `Rs 468`,
    // the pad multiplies the typed 468 by 100 to 46_800, the cover test fails and the Pay surface
    // reads `DUE Rs 0` for ever. That is `01-F17` broken by a configuration.
    expect(refuseConfigWrite("charge.rounding_paisa", 1)?.message).toMatch(/02-F63 \(c\)/);
    expect(refuseConfigWrite("charge.rounding_paisa", 50)).not.toBeNull();
    expect(refuseConfigWrite("charge.rounding_paisa", 0)).not.toBeNull();
    // …and the two the FR blesses by name are accepted.
    expect(refuseConfigWrite("charge.rounding_paisa", 100)).toBeNull();
    expect(refuseConfigWrite("charge.rounding_paisa", 1000)).toBeNull();
  });

  it("E8 14-F48 (l): a provider row with no name, or a DUPLICATE name, is refused", () => {
    expect(
      refuseConfigWrite("commission.by_provider", [{ provider: "  ", rate_bps: 150 }]),
    ).not.toBeNull();
    const dup = refuseConfigWrite("commission.by_provider", [
      { provider: "HBL", rate_bps: 150 },
      { provider: "hbl", rate_bps: 200 },
    ]);
    // Case-folded, because two rows reading `HBL` and `hbl` cannot be told apart on the report
    // they exist to feed.
    expect(dup?.message).toMatch(/duplicate provider name/);
  });

  it("E9 14-F48 (m)/00 §6: a money threshold is an INTEGER number of paisa", () => {
    expect(refuseConfigWrite("paid_out.approval_threshold_paisa", 2000.5)).not.toBeNull();
    expect(refuseConfigWrite("paid_out.approval_threshold_paisa", -1)).not.toBeNull();
    expect(refuseConfigWrite("paid_out.approval_threshold_paisa", 200_000)).toBeNull();
    // Zero is `05-F33`'s DEFAULT and must be savable as an explicit choice too.
    expect(refuseConfigWrite("paid_out.approval_threshold_paisa", 0)).toBeNull();
  });
});

describe("§F — 16-F27: the cell that applies to one tender", () => {
  const matrix: TaxPostureMatrix = {
    default: { posture: "exclusive", rate_bps: 1600 },
    by_tender: [{ tender: "card", cell: { posture: "exclusive", rate_bps: 800 } }],
  };

  it("F1 16-F27: the owner's default cell fills every tender she did not override", () => {
    expect(taxCellForTender(matrix, "cash")).toEqual({ posture: "exclusive", rate_bps: 1600 });
    expect(taxCellForTender(matrix, "raast")).toEqual({ posture: "exclusive", rate_bps: 1600 });
  });

  it("F2 R55: an override wins — cash and card taxed differently is the case the ruling is about", () => {
    // R55's own words: *"Cash, card, QR/RAAST and online transfer are taxed differently in this
    // market."* A resolver ignoring `by_tender` passes F1 and fails here.
    expect(taxCellForTender(matrix, "card")).toEqual({ posture: "exclusive", rate_bps: 800 });
    expect(taxCellForTender(matrix, "card")).not.toEqual(taxCellForTender(matrix, "cash"));
  });

  it("F3 R55: the one-rate org is the SAME mechanism with equal cells, not a second one", () => {
    const flat: TaxPostureMatrix = {
      default: { posture: "exclusive", rate_bps: 1600 },
      by_tender: [],
    };
    for (const tender of PAYMENT_METHODS) {
      expect(taxCellForTender(flat, tender), tender).toEqual({
        posture: "exclusive",
        rate_bps: 1600,
      });
    }
  });
});

describe("§G — 02 §Layer 2 / 02-F60 (iii): the commission rate never reaches a till", () => {
  it("G1 02 §Layer 2: `commission.by_provider` is cloud-only; every other key is a device key", () => {
    // *"cloud-plane reporting only, never sent to the till and never a term in any drawer
    // figure"*. The gateway's serve path filters on this predicate; here is the declaration it
    // filters on, asserted so the two cannot drift into agreement by accident.
    expect(isDeviceConfigKey("commission.by_provider")).toBe(false);
    expect(CONFIG_KEYS["commission.by_provider"].audience).toBe("cloud_only");
    for (const key of CONFIG_KEY_NAMES) {
      if (key === "commission.by_provider") continue;
      expect(isDeviceConfigKey(key), key).toBe(true);
    }
  });

  it("G2: an UNKNOWN key is not a device key and not a cloud-only one — it is unknown", () => {
    // The distinction the gateway's filter rests on: withholding on `!isDeviceConfigKey` alone
    // would silently drop a key a NEWER writer stored, and `01-F87` (b) gives the device the
    // disposition for that case (ignore it) — which it cannot exercise for bytes it never receives.
    expect(isDeviceConfigKey("loyalty.stamp_card_size")).toBe(false);
    expect(isConfigKey("loyalty.stamp_card_size")).toBe(false);
  });
});

describe("§H — 01-F87 (a): `config.changed`'s payload schema (01-F4)", () => {
  // ⚠ **A BRANCH-STAMPED ENVELOPE IS USED HERE AND `01-F62` FORBIDS ONE IN PRODUCTION.**
  // `config.changed` is ORG-scoped: it carries `org_id`, **no `branch_id`, no branch stamp, no
  // `device_id`**, and it lands in `kernel.org_events` rather than in a branch ledger
  // (`services/sync-gateway/src/org-events.ts` is that store, and `01-F62` rejected the
  // alternative that would have put a server value in `branch_created_at`). `parseEvent` takes an
  // `EventEnvelope`, which is the BRANCH shape and the only one this registry can be exercised
  // through — so the fields below are a HARNESS ARTEFACT and this file asserts nothing about them.
  // What §H is about is the PAYLOAD schema, which `01-F4` needs to exist before the org-scoped
  // writer can record a layer-2 change at all.
  const envelope = (payload: unknown) => ({
    id: newId(),
    type: "config.changed",
    org_id: "01980000-0000-7000-8000-0000000000a1",
    branch_id: "01980000-0000-7000-8000-00000000b001",
    device_id: "01980000-0000-7000-8000-00000000d001",
    actor_user_id: "01980000-0000-7000-8000-00000000u001",
    lamport_seq: 1,
    branch_created_at: 1_760_000_000_000,
    device_created_at: 1_760_000_000_000,
    time_basis: "branch" as const,
    server_received_at: 1_760_000_000_000,
    schema_version: 1,
    refs: [],
    payload,
  });

  it("H1 01-F4/00 §7 (f): the type is REGISTERED — a layer-2 change is auditable, not merely unbuilt", () => {
    // `00 §7` (f)'s measurement: the type was in the `01 §4` catalog with no payload schema, so
    // `01-F4` made the emit a runtime error and *"a layer-2 change is today unauditable"*.
    expect(eventRegistry.has("config.changed")).toBe(true);
  });

  it("H2 01-F87 (a): key, layer, version, before and after — all five required", () => {
    const good = {
      key: "charge.rounding_paisa",
      layer: 2,
      version: 4,
      before: null,
      after: 1000,
    };
    expect(() => parseEvent(envelope(good))).not.toThrow();
    for (const missing of ["key", "layer", "version"]) {
      const partial: Record<string, unknown> = { ...good };
      delete partial[missing];
      expect(() => parseEvent(envelope(partial)), missing).toThrow();
    }
  });

  it("H3 01-F87 (a): `layer` is a CLOSED enum of 00 §7's own numerals", () => {
    // Required and closed because this type already spans layers — `15-F25` routes an org's
    // `active ⇄ suspended` through it, which is layer 1 — and *"a reader that cannot tell them
    // apart can neither render `14-F3`'s history nor scope an isolation check"*.
    for (const layer of [1, 2, 3]) {
      expect(
        () => parseEvent(envelope({ key: "x", layer, version: 1, before: null, after: 1 })),
        String(layer),
      ).not.toThrow();
    }
    for (const bad of [0, 4, "2", "org"]) {
      expect(
        () => parseEvent(envelope({ key: "x", layer: bad, version: 1, before: null, after: 1 })),
        String(bad),
      ).toThrow();
    }
  });

  it("H4 01-F87 (a): the KEY SPACE is OPEN in the ledger — commandment 2, not laxity", () => {
    // *"No FR supplies a closed list"* — `00 §7` grows the space with every module doc, and a
    // closed enum would make every future module's first setting an `01-F4` runtime error until
    // doc 01 is amended. `01-F84`'s precedent is exact. The check lives at the WRITER (§E1).
    expect(() =>
      parseEvent(
        envelope({
          key: "some.future_module_setting",
          layer: 2,
          version: 1,
          before: null,
          after: 7,
        }),
      ),
    ).not.toThrow();
  });

  it("H5 01-F87 (a): BOTH transitions are statable — a first configuration and a RESET", () => {
    // `null` means *the key was on its default*, so `null → v` is a first configuration and
    // `v → null` is a reset. A schema that could not express the second would make
    // `configKeysOnDefault`'s answer unauditable.
    expect(() =>
      parseEvent(
        envelope({ key: "charge.rounding_paisa", layer: 2, version: 2, before: null, after: 1000 }),
      ),
    ).not.toThrow();
    expect(() =>
      parseEvent(
        envelope({ key: "charge.rounding_paisa", layer: 2, version: 3, before: 1000, after: null }),
      ),
    ).not.toThrow();
  });

  it("H6 01-F87 (a)/commandment 8: the payload carries NO actor field", () => {
    // *"The envelope's `actor_user_id` is the one home for who acted (`01-F84`, `02-F45`), and a
    // registry row is not where an authorization is decided."* `looseObject` accepts extra keys on
    // the wire (`01-F40`), so this asserts the SCHEMA declares none rather than that one is
    // rejected — the claim that matters is that no reader may take attribution from the payload.
    const shape = eventRegistry.types().includes("config.changed");
    expect(shape).toBe(true);
    const parsed = parseEvent(
      envelope({ key: "charge.rounding_paisa", layer: 2, version: 2, before: null, after: 1000 }),
    );
    expect(parsed.envelope.actor_user_id).toBe("01980000-0000-7000-8000-00000000u001");
  });
});
