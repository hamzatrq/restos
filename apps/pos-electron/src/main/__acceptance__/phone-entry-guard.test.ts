// SEAM/REFUSAL ASSERTIONS for `02-F27`/`02-F47` — **written from a MUTATION RESULT, not a reading.**
//
// PROVENANCE (`24 §3`): written by the ADVERSARY session that mutation-tested this track, which is
// a different session from both the oracle author and the implementer. Neither
// `phone-entry-seam.test.ts` nor `phone-entry.dom.test.tsx` was edited to produce it — every claim
// below is a NEW assertion for a mutant that survived all 791 `pos-electron` tests and all 478
// `domain` tests. Same instrument and the same justification as `phone-entry-host.test.ts`, which
// exists for the same reason one layer over.
//
// ── THE THREE SURVIVORS, MEASURED ────────────────────────────────────────────────────────────
//
//   P6b  `authorize.ts` — the two `guard()` calls deleted from `recordCustomer`, so the guarded
//        member delegates straight to the gateway → **791/791 pass.** Commandment 8 is gone at
//        the product's ONLY `customer.*` emitter, and every existing assertion still holds:
//        `phone-entry-seam.test.ts` §F asserts verdicts through `append` (a different member),
//        and `phone-entry-host.test.ts` §B asserts that the CHANNEL binds `writes.recordCustomer`
//        rather than `gateway.recordCustomer` — which is the wire, not the verdict. Both are
//        correct and neither can see a wrapper that wraps nothing. This is `AGENTS.md`'s own
//        named blind spot in the security direction: *"a port supplied with a STUB … Rule B asks
//        whether an optional member is supplied, never whether what was supplied is real."*
//
//   P3   `customer-phone.ts` — the local dialling form loosened from `^0\d{10}$` to `^0\d{9,10}$`
//        → **791/791 pass.** A number ONE DIGIT SHORT resolves to a key, the strip offers
//        `Save caller` for it, and `01-F1` makes that row permanent. `phone-entry-seam.test.ts`
//        §C is aimed at this exact class and misses it by construction: it tests `""`, `"0"`,
//        `"03"`, `"0300"` (four digits, an operator who has barely started) and
//        `"030012345678901"` (fifteen, too long for E.164 either way) — never the off-by-one that
//        a plausible implementation actually produces. The mechanism was built and never pointed
//        at the dangerous case, which is this round's law verbatim.
//
//   P18  `packages/domain/src/registry.ts` — `isPhoneE164` replaced with
//        `typeof value === "string"` → **791/791 pass AND 478/478 `domain` tests pass.** The
//        export is new, lives on a PROTECTED path, and its doc comment calls it *"the one place
//        the E.164 pattern is written"*; nothing in the workspace asserted it. That is instance
//        (i) of the three things `seams:check` cannot catch — *"a constant exported so a test
//        COULD assert it, and none did"* — landed on `packages/domain`.
//
// ── WHY THESE ARE ASSERTED THROUGH THE SEAM AND NOT AGAINST THE MODULES ──────────────────────
//
// `normalizeDialledPhone` and `isPhoneE164` are both directly importable, and testing them there
// would be this wave's named defect wearing a test: a module exercised directly while nothing
// asserts the application reaches it. Every claim below goes through `createGateway`'s returned
// seam and `authorizeWrites`' returned surface — the objects `main/index.ts` actually binds.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// Re-pointed at the merge of `w2/phone-entry` and `w2/consolidation`: `aging.ts` moved into
// `@restos/device-config` to close `18 §2`'s three app→app imports and the pos↔pass cycle. A
// SEMANTIC merge conflict — both branches merged clean and only `tsc` saw it.
import { resolveAging } from "@restos/device-config";
import { type DeviceStore, openStore } from "@restos/sync-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type AuthorizedWrites,
  authorizeWrites,
  PAID_OUT_APPROVAL_THRESHOLD_PAISA,
} from "../authorize";
import { createGateway, type Gateway } from "../gateway";

const IDENTITY = { org_id: "org-1", branch_id: "br-1", device_id: "dev-1" } as const;

/** The number an operator actually types — eleven digits, leading zero (`registry.ts`). */
const DIALLED = "03001234567";

/** ONE digit short. The state of the field a keystroke before she is finished. */
const ONE_SHORT = "0300123456";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const harness = (): { store: DeviceStore; gateway: Gateway } => {
  const dir = mkdtempSync(join(tmpdir(), "restos-phone-guard-"));
  dirs.push(dir);
  const store = openStore({ path: join(dir, "device.db"), identity: IDENTITY });
  const gateway = createGateway({
    store,
    catalog: () => ({ name: "Chicken Karahi" }),
    menu: () => [],
    priceOf: () => null,
    actor: "dev",
    session: () => ({ user_id: "u-ayesha", display_name: "Ayesha" }),
    deviceLabel: "Counter 1",
    training: false,
    reachability: () => ({ lan: "down", hub: "down", cloud: "down" }),
    blockedCursor: () => null,
    catalogRefusal: () => null,
    businessDay: () => "2026-08-10",
    panelPpi: () => 100.5,
    aging: resolveAging(undefined).thresholdsFor,
    panelFit: () => null,
  });
  return { store, gateway };
};

const customerEvents = (store: DeviceStore) =>
  store.readAllEvents().filter((e) => e.type.startsWith("customer."));

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — COMMANDMENT 8 IS IN THE WRAPPER, NOT ONLY ON THE WIRE (the P6b survivor)
//
// `02-F47` decides the cells; this section asserts the DEDICATED member consults them. It has to
// be the dedicated member: `recordCustomer` is the only path by which `customer.created` reaches
// the ledger in this product, and it does not go through `append`.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A commandment 8 / 02-F47 — `writes.recordCustomer` asks the matrix, it does not merely exist", () => {
  const recorded: unknown[] = [];
  const writeStub = () =>
    ({
      append: vi.fn(() => ({ id: "evt-1" })),
      addLine: vi.fn(() => ({ id: "evt-2" })),
      toggleAvailability: vi.fn(() => ({ id: "evt-3" })),
      recordCustomer: vi.fn((req: unknown) => {
        recorded.push(req);
        return { id: "evt-4" };
      }),
    }) as unknown as Parameters<typeof authorizeWrites>[0]["writes"];

  const rig = (role: string | null): AuthorizedWrites => {
    recorded.length = 0;
    return authorizeWrites({
      writes: writeStub(),
      store: {
        identity: IDENTITY,
        staff: {
          // `11-F22` (August 2026) — participation rides the (person, branch) pair and only
          // `active` participates; `subjectOf` reads it off the roster row. Ayesha is on the
          // roster here, so the stamp restates the same fixture and `role === null` is still the
          // LOCKED device.
          lookup: () =>
            role === null
              ? null
              : {
                  user_id: "u-ayesha",
                  pin_hash: "argon2id$stub",
                  display_name: "Ayesha",
                  status: "active",
                  assignments: [{ role, branch_id: "br-1" }],
                },
        },
      } as unknown as Pick<DeviceStore, "identity" | "staff">,
      session: () => (role === null ? null : { user_id: "u-ayesha", display_name: "Ayesha" }),
      paidOutApprovalThresholdPaisa: PAID_OUT_APPROVAL_THRESHOLD_PAISA,
    });
  };

  const request = { dialled: DIALLED, name: null };

  it("lets a CASHIER through — the cell `02-F47` calls load-bearing", () => {
    // The positive control, and it is what makes every refusal below attributable. Without it a
    // `recordCustomer` that threw unconditionally would satisfy all three refusals.
    expect(() => rig("cashier").recordCustomer(request)).not.toThrow();
    expect(recorded).toHaveLength(1);
  });

  it("REFUSES a storekeeper — the `—` cell, on the member the product actually calls", () => {
    // `02-F47`: *"The storekeeper cell is `—` for `order.create`'s reason: Appendix A's
    // storekeeper column is stock-only and this is a counter act."* With the guard deleted from
    // the wrapper this passes anyway, because `authorizeWrites` still RETURNS a `recordCustomer`
    // and `index.ts` still binds THAT one — the wire is right and the verdict is gone.
    expect(() => rig("storekeeper").recordCustomer(request)).toThrow();
    expect(recorded).toEqual([]);
  });

  it("REFUSES a LOCKED device (01-F27) — nobody is signed in is not the device may", () => {
    // `phone-entry-host.test.ts` §B names this outcome as the danger of the M2 wiring mutant
    // (*"appends `customer.created` for a storekeeper, or for a LOCKED device, with no verdict
    // asked"*) and asserts the wiring instead. This asserts the outcome.
    expect(() => rig(null).recordCustomer(request)).toThrow();
    expect(recorded).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — THE OFF-BY-ONE (the P3 survivor)
//
// `01-F23` + `01-F1`: a customer identity is permanent and cannot be corrected in place. The
// failure this owns is not a wild string — it is the number that is *nearly* right, which is the
// only wrong number a real operator produces.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 01-F23/01-F1 — a number one digit short is not an identity", () => {
  it("does not resolve a ten-digit local number to a key", () => {
    const { gateway } = harness();
    // She has pressed ten of eleven. If this answers with a key, the strip offers `Save caller`
    // for a human whose real number differs from the one about to be filed for ever.
    expect(gateway.lookupCustomer(ONE_SHORT).phone_e164).toBeNull();
    // And the control that makes the claim attributable: the SAME number with its last digit
    // restored must resolve, or this test would pass against a normalizer that resolves nothing.
    expect(gateway.lookupCustomer(DIALLED).phone_e164).not.toBeNull();
  });

  it("REFUSES to record it, and writes nothing while refusing", () => {
    const { store, gateway } = harness();
    expect(() => gateway.recordCustomer({ dialled: ONE_SHORT, name: null })).toThrow();
    expect(customerEvents(store)).toHaveLength(0);
  });

  it("does not resolve a TWELVE-digit local number either — the other side of the same edge", () => {
    // The over-run is as permanent as the short one and arrives the same way: one extra press.
    // `030012345678` is well within E.164's fifteen digits, so nothing downstream refuses it —
    // only this rule does.
    const { gateway } = harness();
    expect(gateway.lookupCustomer(`${DIALLED}8`).phone_e164).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — THE `+` BRANCH APPLIES THE KERNEL'S FORM (the P18 survivor)
//
// A number that arrives already in `01-F23`'s form — from `06-F11`'s storefront or doc 07's
// WhatsApp — is passed to `isPhoneE164` and to nothing else. That predicate is a new export on a
// PROTECTED path whose comment calls it *"the one place the E.164 pattern is written"*, and until
// this section it was written, exported, documented and asserted by nothing anywhere.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 01-F23 — an already-normalized number is still checked against the kernel's form", () => {
  it("accepts the form the ledger is keyed by", () => {
    const { gateway } = harness();
    expect(gateway.lookupCustomer("+923001234567").phone_e164).toBe("+923001234567");
  });

  it.each([
    ["+92300abc4567", "letters — E.164 is digits after the +"],
    ["+0923001234567", "a country code starting with 0, which E.164 forbids"],
    ["+92 300 1234567", "spaces, which registry.ts refuses rather than strips"],
    ["+", "a plus and nothing else"],
    ["+9230012345678901234", "more than E.164's fifteen digits"],
  ])("refuses %s (%s)", (candidate) => {
    // Each of these is a key no lookup will ever produce. `01-F1` makes one permanent.
    const { gateway } = harness();
    expect(gateway.lookupCustomer(candidate).phone_e164).toBeNull();
  });

  it("refuses to RECORD one too, and writes nothing", () => {
    const { store, gateway } = harness();
    expect(() => gateway.recordCustomer({ dialled: "+92300abc4567", name: null })).toThrow();
    expect(customerEvents(store)).toHaveLength(0);
  });
});
