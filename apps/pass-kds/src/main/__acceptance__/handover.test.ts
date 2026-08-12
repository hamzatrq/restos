// ACCEPTANCE TESTS — `03-F52`: the pass screen's HANDOVER act, and the serve-signal assignment.
//
// **AUTHORED FROM SPEC TEXT ONLY** (`24 §3` step 2). The author of this file wrote no production
// code for `03-F52` and is disqualified from implementing it. Every claim below is traced to a
// quoted FR; where a reading had to be chosen the choice is NAMED as a choice and the alternative
// is stated (`24 §3b`), so an implementer who disagrees can argue with the sentence rather than
// guess at the assertion.
//
// ───────────────────────────────────────────────────────────────────────────────────────────────
// THE FR, quoted in the clauses this file holds:
//
//   03-F52  "Who marks `served` is a role assignment at layer 2 … and the act is an explicit
//           HANDOVER, never a widening of the ready-mark and never a widening of settlement."
//
//   03-F52  "**The owners:** `settlement` … `pass` … `counter` … `waiter`. **`kds` is deliberately
//           NOT an owner** … As in `03-F24` the emitted event is identical regardless of owner —
//           `order.line_state_changed` to `served`, no owner field, no `source:` tag, no second
//           event type … Surfaces without the assignment are read-only for `served`."
//
//   03-F52  "**The act is separate from the ready-mark, and that separation is the FR.** One press
//           of DONE emits `ready` and only `ready` (`03-F16`/`03-F19`) … A DONE that emitted both
//           would blank the screen at the start of the work the screen exists for."
//
//   03-F52  "**It marks only lines already `ready`, and walks only `ready → served`.** The
//           `in_prep → served` edge exists for `DEC-HW-002`'s no-pass case alone; reaching `served`
//           from the pass by any route that skips `ready` destroys `03-F26`'s prep-time sample and
//           `03-F15`'s assembly count, and **a shortest-path walk over `LEGAL_NEXT` finds exactly
//           that route**. Lines still `in_prep` are untouched and the ticket stays on the pass …
//           One press marks every remaining `ready` line at once."
//
//   03-F52  "**Dine-in, takeaway and pickup only.** Delivery is `picked_up → delivered`,
//           rider-driven (`01 §4`), or the counter's on-behalf entry (`09-F8`); a delivery ticket
//           bumped DONE gets its ready-marks and stays on the pass. The filter is an **allowlist**
//           on the order's own `order_type`, matching `02-F31`'s: `order_type` is an open string,
//           so a denylist marks an unrecognised value `served`, terminally and permanently under
//           `01-F35`/`01-F1`."
//
//   03-F52  "Where the key is unset the default is derived from `02-F31`'s own detection rule over
//           the branch device roster (the capability set, `DEC-HW-003` (b)), and where the roster
//           cannot be read the surface REPORTS the assumption on its boot line rather than
//           presenting it as configured (`00 §5.7`)."
//
//   03-F52  "**One declaration, no per-app fallback.** The assignment is a single org value read by
//           every surface … An assignment naming a surface this product does not ship is refused
//           when it is configured, with the offending value named."
//
//   03-F17  "An order leaves the queue when all its lines reach a terminal service state."
//   02-F31  "no `ready` state is fabricated" — and `03-F26`'s reason for it.
//   01 §4   `ready → served` is the canonical edge, verbatim. Nothing here changes `LEGAL_NEXT`.
//
// ───────────────────────────────────────────────────────────────────────────────────────────────
// ⚠ THE CONTRACT THIS SUITE PINS, WRITTEN OUT SO THE IMPLEMENTER IS NOT GUESSING AT NAMES.
//
// (1) The assignment is declared **ONCE**, in `@restos/device-config`
//     (`packages/device-config/src/serve-signal.ts`, re-exported from `src/index.ts`):
//
//       SERVE_SIGNAL_OWNERS = ["settlement", "pass", "counter", "waiter"] as const
//       type ServeSignalOwner  = (typeof SERVE_SIGNAL_OWNERS)[number]
//       SERVE_SIGNAL_OWNER_ENV = "RESTOS_SERVE_SIGNAL_OWNER"
//       type ServeSignalSource = "derived" | "configured" | "assumed" | "refused"
//       type ServeSignalPolicy = { owner: ServeSignalOwner; source: ServeSignalSource;
//                                  refused: string | null }
//       resolveServeSignal({ roster: readonly DeviceClass[] | null;
//                            configured: string | undefined }): ServeSignalPolicy
//       describeServeSignal(policy): string
//
//     **It is NOT `apps/pass-kds/src/main/serve-signal.ts`, and that departs from the sibling this
//     module is otherwise modelled on** (`ready-signal.ts`). The reason is the FR's own clause:
//     `02-F31`'s settlement half must read the SAME value (*"the till emits on settlement because
//     the branch's serve-signal owner is `settlement`"*), `18 §2` states *"Apps NEVER import …
//     other apps"* as a MUST, and `DEC-ARCH-001` rules EXTRACT at the moment a module acquires its
//     second consumer. A copy in each app is precisely the *"two surfaces each carrying their own
//     default"* the FR names, and `@restos/device-config` exists because that exact edge was drawn
//     wrong once already between these two apps. A thin re-export from `apps/pass-kds/src/main/`
//     is harmless and this suite neither needs nor forbids one.
//
// (2) `apps/pass-kds/src/main/serve-mark.ts`, the sibling of `ready-mark.ts`:
//
//       serveEdgesFor(order: { order_id: string; order_type: string | null; json_lines: string })
//         : LineStateChangedPayload | null      // ONE payload — one hop, `ready → served`
//       type ServeMarkDeps = { store: Pick<DeviceStore, "openOrders">;
//                              policy: () => ServeSignalPolicy;
//                              append: (type, payload) => void }
//       createServeMark(deps): { handOver: (order_id: string) => ServeMarkResult }
//
//     `handOver` takes **no `line_ids`**: `03-F52` makes the act order-level only (*"One press
//     marks every remaining `ready` line at once"*), unlike `03-F16`'s per-line ready-mark.
//     `ServeMarkResult` must carry `{ ok: false, reason: "not_the_owner", owner }` for the
//     assignment refusal; every OTHER refusal's reason string is the implementer's, and this suite
//     asserts only that it is not `"not_the_owner"` — see §C.
//
// (3) `pass-queue.ts`'s `PassTicket` gains `handoverable: boolean`, the exact sibling of
//     `bumpable`, computed on the TRUSTED side for the reason `bumpable`'s own comment gives.
//
// ───────────────────────────────────────────────────────────────────────────────────────────────
// ⚠ WHAT THIS SUITE DELIBERATELY DOES **NOT** PIN, so a correct implementation cannot be blocked:
//
//   - **Which owner is assumed when the roster is unreadable.** The FR requires the surface to
//     REPORT the assumption; it does not name the value, and the two candidates are both arguable
//     (`settlement` keeps `02-F31` byte-identical today; `pass` keeps a freshly-installed pass
//     screen from being inert, which is `ready-signal.ts`'s recorded argument for its own default).
//     §A asserts the SOURCE and the boot line, never the value.
//   - **The roster derivation for a `waiter`-only branch.** `04-F14` is unbuilt; guessing would be
//     inventing policy (commandment 2).
//   - **`preds`.** `serveEdgesFor` cannot build the head set for the reason `line-advance.ts`
//     measures at length (`json_lines` carries no head edge ids), so a terminal edge leaves
//     `terminal_regression` flags. §E asserts the fold's *projected state* and the absence of
//     `illegal_transition`, which is the class the cloud Auditor pages on — never an empty
//     anomaly map, which would be RED under a correct implementation.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  describeServeSignal,
  resolveAging,
  resolveServeSignal,
  SERVE_SIGNAL_OWNER_ENV,
  SERVE_SIGNAL_OWNERS,
  type ServeSignalPolicy,
} from "@restos/device-config";
import { LEGAL_NEXT } from "@restos/domain";
import { type DeviceStore, openStore } from "@restos/sync-client";
import { afterEach, describe, expect, it } from "vitest";
import { passQueue } from "../pass-queue";
import { createReadyMark, type LineStateChangedPayload, walkTo } from "../ready-mark";
import { resolveReadySignal } from "../ready-signal";
import { createServeMark, serveEdgesFor } from "../serve-mark";

const ORG = "0199aaaa-0000-7000-8000-000000000001";
const BRANCH = "0199aaaa-0000-7000-8000-000000000002";
const DEVICE = "0199aaaa-0000-7000-8000-000000000004";
const ORDER = "0199cccc-0000-7000-8000-00000000abcd";

const dirs: string[] = [];
const freshStore = (): DeviceStore => {
  const dir = mkdtempSync(join(tmpdir(), "handover-"));
  dirs.push(dir);
  return openStore({
    path: join(dir, "device.db"),
    identity: { org_id: ORG, branch_id: BRANCH, device_id: DEVICE },
  });
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

let seq = 0;
const uuid = (): string => `0199dddd-0000-7000-8000-${String(++seq).padStart(12, "0")}`;

const append = (store: DeviceStore, type: string, payload: unknown): void => {
  store.append({
    id: uuid(),
    org_id: ORG,
    branch_id: BRANCH,
    device_id: DEVICE,
    actor_user_id: null,
    device_created_at: 1_000,
    type,
    schema_version: 1,
    payload,
    refs: [],
  });
};

/** `01 §4`'s chain, walked one line at a time so a ticket can hold lines at DIFFERENT states. */
const CHAIN = ["placed", "confirmed", "in_prep", "ready", "served"] as const;
type ChainState = (typeof CHAIN)[number];

/**
 * A confirmed order in a REAL store whose lines sit wherever the fixture says.
 *
 * Per-line rather than per-order because `03-F52`'s hardest case is a MIXED ticket, and a fixture
 * that could only put every line in one state is exactly the shape the FR warns about:
 * *"`line-advance-seam.test.ts`'s rig sits at `in_prep`, the one state a T2 branch never occupies
 * at settlement"*.
 */
const seedOrder = (
  store: DeviceStore,
  spec: { readonly order_type?: string; readonly lines: Readonly<Record<string, ChainState>> },
): void => {
  append(store, "order.created", {
    order_id: ORDER,
    channel: "counter",
    ...(spec.order_type === undefined ? {} : { order_type: spec.order_type }),
  });
  for (const line_id of Object.keys(spec.lines)) {
    append(store, "order.line_added", {
      order_id: ORDER,
      line_id,
      item_id: "item-karahi",
      qty: 1,
      unit_price_paisa: 45_000,
    });
  }
  append(store, "order.confirmed", { order_id: ORDER });
  // One event per (from → to) hop, carrying every line that takes that hop — the same shape the
  // shipped emitters write, so nothing here is a state the fold could not have reached honestly.
  for (let i = 1; i < CHAIN.length; i += 1) {
    const from = CHAIN[i - 1] as ChainState;
    const to = CHAIN[i] as ChainState;
    const taking = Object.entries(spec.lines)
      .filter(([, target]) => CHAIN.indexOf(target) >= i)
      .map(([line_id]) => line_id);
    if (taking.length === 0) continue;
    append(store, "order.line_state_changed", {
      order_id: ORDER,
      line_ids: taking,
      state: to,
      line_context: Object.fromEntries(
        taking.map((line_id) => [line_id, { to, from_states: [from], preds: [] }]),
      ),
    });
  }
};

const statesOf = (store: DeviceStore): Record<string, string[]> => {
  const row = store.openOrders().find((o) => o.order_id === ORDER);
  const cells = JSON.parse(row?.json_lines ?? "{}") as Record<string, { states: string[] }>;
  return Object.fromEntries(Object.entries(cells).map(([id, c]) => [id, c.states]));
};

const anomalyValues = (store: DeviceStore): string[] => {
  const row = store.openOrders().find((o) => o.order_id === ORDER);
  const cells = JSON.parse(row?.json_lines ?? "{}") as Record<
    string,
    { anomalies?: Record<string, string> }
  >;
  return Object.values(cells).flatMap((c) => Object.values(c.anomalies ?? {}));
};

/** The assignment as this suite drives it: explicit, `configured`, never a default under test. */
const owned = (owner: string): ServeSignalPolicy =>
  resolveServeSignal({ roster: null, configured: owner });

/** The handover, wired to a real store — the same construction `main/index.ts` must make. */
const handOverOn = (store: DeviceStore, owner = "pass") => {
  const emitted: LineStateChangedPayload[] = [];
  const serve = createServeMark({
    store,
    policy: () => owned(owner),
    append: (type, payload) => {
      emitted.push(payload);
      append(store, type, payload);
    },
  });
  return { serve, emitted };
};

/** `03-F16`'s DONE on the same store, so §F can prove the two acts are separate. */
const doneOn = (store: DeviceStore) => {
  const emitted: LineStateChangedPayload[] = [];
  const mark = createReadyMark({
    store,
    policy: () => resolveReadySignal("pass"),
    append: (type, payload) => {
      emitted.push(payload);
      append(store, type, payload);
    },
  });
  return { mark, emitted };
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE ASSIGNMENT. `03-F52`'s four owners, the one that is deliberately absent, and the
//      derivation `02-F31`'s detection rule supplies when nobody has configured anything.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 03-F52 — serve-signal ownership", () => {
  it("the owner set is EXACTLY the FR's four, and `kds` is not one of them", () => {
    // > **The owners:** `settlement` … `pass` … `counter` … `waiter`. **`kds` is deliberately NOT
    // > an owner**: a station cook hands food to a pass, never to a customer.
    //
    // Asserted as a SET rather than as an array so a re-ordering is not a failure, and asserted
    // exhaustively rather than by membership: the whole content of this clause is which values the
    // key admits, and a fifth admitted value is a configuration the product does not offer.
    expect(new Set(SERVE_SIGNAL_OWNERS)).toEqual(
      new Set(["settlement", "pass", "counter", "waiter"]),
    );
    expect(SERVE_SIGNAL_OWNERS).toHaveLength(4);
    expect([...SERVE_SIGNAL_OWNERS]).not.toContain("kds");
  });

  it("`kds` is REFUSED when configured, and the refusal names the value (00 §5.7)", () => {
    // The dangerous implementation is the one that copies `READY_SIGNAL_OWNERS` — where `kds` IS a
    // member — and re-uses it here. It would type-check, resolve, and quietly let a station cook's
    // bump surface own the claim that food reached a customer.
    const refused = resolveServeSignal({ roster: null, configured: "kds" });
    expect(refused.source).toBe("refused");
    expect(refused.refused).toBe("kds");
    expect(refused.owner).not.toBe("kds");
    const words = describeServeSignal(refused);
    expect(words).toContain("kds");
    expect(words).toContain(SERVE_SIGNAL_OWNER_ENV);
  });

  it("every owner the FR names is spellable, and a typo is refused rather than coerced", () => {
    for (const owner of SERVE_SIGNAL_OWNERS) {
      const policy = resolveServeSignal({ roster: null, configured: owner });
      expect(policy.source).toBe("configured");
      expect(policy.owner).toBe(owner);
      expect(policy.refused).toBeNull();
      expect(describeServeSignal(policy)).toContain(owner);
    }
    const typo = resolveServeSignal({ roster: null, configured: "passs" });
    expect(typo.source).toBe("refused");
    expect(typo.refused).toBe("passs");
    // `01-F17`'s spirit — a typo in a layer-2 key must not take a screen off the wall mid-service.
    // The value it falls back to is not asserted here (see this file's header); that it is a LEGAL
    // owner, and that the operator is told, is.
    expect([...SERVE_SIGNAL_OWNERS]).toContain(typo.owner);
  });

  it("02-F31's detection rule DERIVES the default from the roster", () => {
    // > Where the key is unset the default is derived from `02-F31`'s own detection rule over the
    // > branch device roster (the capability set, `DEC-HW-003` (b))
    //
    // `02-F31`: *"detection: the branch device registry contains no pass/KDS/waiter device"*. A
    // branch with no such device has nothing that can signal handover, so settlement is the only
    // producer there can be; a branch with a kitchen device has the surface the FR assigns it to.
    const alone = resolveServeSignal({ roster: [], configured: undefined });
    expect(alone).toEqual({ owner: "settlement", source: "derived", refused: null });
    const withPass = resolveServeSignal({ roster: ["kitchen"], configured: undefined });
    expect(withPass).toEqual({ owner: "pass", source: "derived", refused: null });
    // A CONFIGURED value is a correction and beats the derivation — otherwise the key is
    // decorative, and `03-F52` calls it *"a role assignment at layer 2"* rather than a readout.
    expect(resolveServeSignal({ roster: [], configured: "pass" })).toEqual({
      owner: "pass",
      source: "configured",
      refused: null,
    });
  });

  it("00 §5.7 — an unreadable roster is REPORTED as an assumption, never as configuration", () => {
    // > and where the roster cannot be read the surface REPORTS the assumption on its boot line
    // > rather than presenting it as configured (`00 §5.7`)
    //
    // `roster: null` is every host today: `01-F62` keeps `device.registered` out of every branch
    // stream, so `02-F31`'s detection rule cannot run on a device. The owner it lands on is NOT
    // asserted (header); that it is not dressed up as an answer somebody gave, is.
    const assumed = resolveServeSignal({ roster: null, configured: undefined });
    expect(assumed.source).toBe("assumed");
    expect(assumed.refused).toBeNull();
    const words = describeServeSignal(assumed);
    expect(words).toContain("ASSUMED");
    expect(words).toContain(assumed.owner);
    expect(words).toContain(SERVE_SIGNAL_OWNER_ENV);
    // …and a derived or configured line does NOT claim an assumption, or the word means nothing.
    expect(
      describeServeSignal(resolveServeSignal({ roster: [], configured: undefined })),
    ).not.toContain("ASSUMED");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — THE WALK. `ready → served` and nothing else, and the shortest-path route the FR names by
//      name as the thing that must not happen.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 03-F52 — it walks only `ready → served`", () => {
  it("the kernel's own table offers the SKIP, which is why this is a rule and not an accident", () => {
    // > reaching `served` from the pass by any route that skips `ready` destroys `03-F26`'s
    // > prep-time sample and `03-F15`'s assembly count, and **a shortest-path walk over
    // > `LEGAL_NEXT` finds exactly that route**.
    //
    // Asserted against the SHIPPED `walkTo` — the one `ready-mark.ts` exports and a helpful
    // session would reach for — so this is the trap demonstrated rather than described. If
    // `DEC-HW-002`'s edge is ever withdrawn, this row is what says the trap has gone.
    expect(LEGAL_NEXT.ready).toContain("served");
    expect(LEGAL_NEXT.in_prep).toContain("served");
    expect(walkTo("ready", "served")).toEqual(["served"]);
    expect(walkTo("in_prep", "served")).toEqual(["served"]);
    // …and from `confirmed` the BFS returns a two-hop route that never touches `ready` at all.
    expect(walkTo("confirmed", "served")).toEqual(["in_prep", "served"]);
    expect(walkTo("confirmed", "served")).not.toContain("ready");
  });

  it("a MIXED ticket moves only its `ready` lines — in_prep and confirmed are untouched", () => {
    // ⚠ THE ASSERTION THIS WHOLE FILE IS BUILT AROUND, and the fixture the FR demands: the one
    // state `line-advance-seam.test.ts`'s rig never occupies.
    //
    // > **It marks only lines already `ready`** … Lines still `in_prep` are untouched and the
    // > ticket stays on the pass … One press marks every remaining `ready` line at once.
    //
    // **INTERPRETATION, named as one.** "Untouched" is read as *the other lines are left where
    // they are while the ready ones move* — the reading under which the word "untouched" has work
    // to do, and the reading `03-F24`'s canonical rule supplies (*"an owner's order-level mark
    // simply marks all remaining lines at once"*, here narrowed by the FR's own "only lines
    // already `ready`"). **The alternative** is that a partially-ready ticket refuses the press
    // entirely; it is not taken because it makes "untouched" vacuous — under it nothing is touched
    // — and because the FR gives the consequence of the press as *"the ticket stays on the pass"*,
    // which is a statement about `03-F17` and not about a refusal.
    const store = freshStore();
    seedOrder(store, {
      order_type: "dine_in",
      lines: { L0: "ready", L1: "in_prep", L2: "confirmed" },
    });
    expect(statesOf(store)).toEqual({ L0: ["ready"], L1: ["in_prep"], L2: ["confirmed"] });

    const { serve, emitted } = handOverOn(store);
    const result = serve.handOver(ORDER);

    expect(result.ok).toBe(true);
    // ONE event, `served`, naming ONE line. An implementation that walked would emit two events
    // (`confirmed → in_prep`, then `in_prep → served`) and move all three lines.
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.state).toBe("served");
    expect(Object.keys(emitted[0]?.line_context ?? {})).toEqual(["L0"]);
    // `from_states` is the state the fold actually projects — never a claim about a state the
    // branch did not reach, which `01-F1` would make permanent.
    expect(emitted[0]?.line_context.L0?.from_states).toEqual(["ready"]);
    expect(emitted[0]?.line_context.L0?.to).toBe("served");

    // THE ANCHOR: the REAL merge engine's answer, not this module's.
    expect(statesOf(store)).toEqual({ L0: ["served"], L1: ["in_prep"], L2: ["confirmed"] });
  });

  it("a ticket with NO ready line appends nothing at all", () => {
    // The negative half of the row above, on a ticket identical in every other respect. Without
    // it, an implementation that marked every line `served` regardless of state would pass the
    // mixed row only by luck of which line was checked first.
    const store = freshStore();
    seedOrder(store, { order_type: "dine_in", lines: { L0: "in_prep", L1: "confirmed" } });
    const { serve, emitted } = handOverOn(store);
    expect(serve.handOver(ORDER).ok).toBe(false);
    expect(emitted).toEqual([]);
    expect(statesOf(store)).toEqual({ L0: ["in_prep"], L1: ["confirmed"] });
  });

  it("an ALREADY-SERVED line is not re-marked, and it does not make the press succeed", () => {
    // `served` is terminal (`01-F35`). A second edge onto it is at best noise in an append-only
    // ledger and at worst an `illegal_transition` flag; either way the press has nothing to do.
    const store = freshStore();
    seedOrder(store, { order_type: "dine_in", lines: { L0: "served", L1: "in_prep" } });
    const { serve, emitted } = handOverOn(store);
    expect(serve.handOver(ORDER).ok).toBe(false);
    expect(emitted).toEqual([]);
    // …and the control: add ONE ready line to the same shape and the press fires, naming only it.
    const live = freshStore();
    seedOrder(live, { order_type: "dine_in", lines: { L0: "served", L1: "ready" } });
    const second = handOverOn(live);
    expect(second.serve.handOver(ORDER).ok).toBe(true);
    expect(Object.keys(second.emitted[0]?.line_context ?? {})).toEqual(["L1"]);
  });

  it("serveEdgesFor is pure — it decides from a projection and needs no store", () => {
    // The policy as one drivable function, so the branch a test exercises is the branch that
    // ships (`K-3`'s dead-oracle defect: an oracle asserting against its own copy).
    const cells = {
      A: { item_id: "i", qty: 1, unit_price_paisa: 1, states: ["ready"] },
      B: { item_id: "i", qty: 1, unit_price_paisa: 1, states: ["in_prep"] },
      C: { item_id: "i", qty: 1, unit_price_paisa: 1, states: ["served"] },
      // `01-F31` — a contested line has no single projected state and is not this emitter's to
      // decide. *"A fold never picks a winner"*, and neither may the thing reading it.
      D: { item_id: "i", qty: 1, unit_price_paisa: 1, states: ["ready", "voided"] },
    };
    const payload = serveEdgesFor({
      order_id: ORDER,
      order_type: "dine_in",
      json_lines: JSON.stringify(cells),
    });
    expect(payload?.state).toBe("served");
    expect(Object.keys(payload?.line_context ?? {})).toEqual(["A"]);
    expect(payload?.line_ids).toEqual(["A"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — THE ALLOWLIST. Three named modes in; everything else out, including a value nobody has
//      seen before. `01-F35` makes the wrong answer here permanent.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 03-F52 — dine-in, takeaway and pickup ONLY", () => {
  const pressOn = (order_type: string | undefined) => {
    const store = freshStore();
    seedOrder(store, {
      ...(order_type === undefined ? {} : { order_type }),
      lines: { L0: "ready", L1: "ready" },
    });
    const { serve, emitted } = handOverOn(store);
    return { store, result: serve.handOver(ORDER), emitted };
  };

  it("the three modes 01 §4 sends to `served` all hand over", () => {
    for (const order_type of ["dine_in", "takeaway", "pickup"]) {
      const { result, emitted, store } = pressOn(order_type);
      expect(result.ok, order_type).toBe(true);
      expect(emitted, order_type).toHaveLength(1);
      expect(statesOf(store)).toEqual({ L0: ["served"], L1: ["served"] });
    }
  });

  it("a DELIVERY ticket is refused — and refused for the TYPE, not for anything else", () => {
    // > Delivery is `picked_up → delivered`, rider-driven (`01 §4`), or the counter's on-behalf
    // > entry (`09-F8`); a delivery ticket bumped DONE gets its ready-marks and stays on the pass.
    //
    // ⚠ **THE CONTROL IS THE POINT.** Every line on this fixture is `ready`, the owner is `pass`,
    // and the order is on the device — so the ONLY thing that can refuse it is the allowlist.
    // Without the control, "refused" would be indistinguishable from "refused because there was
    // nothing to mark", which is the exact defect `AGENTS.md` records against `F60`'s amendment
    // test (*"could not distinguish 'refused for the right reason' from any refusal"*).
    const delivery = pressOn("delivery");
    expect(delivery.result.ok).toBe(false);
    expect(delivery.emitted).toEqual([]);
    expect(statesOf(delivery.store)).toEqual({ L0: ["ready"], L1: ["ready"] });
    // Not the OWNERSHIP refusal wearing a different hat — the assignment is `pass` throughout.
    // The reason string beyond that is the implementer's; only this discrimination is pinned.
    expect(delivery.result.ok === false && delivery.result.reason).not.toBe("not_the_owner");
    // THE CONTROL: the same fixture, one field different, must succeed.
    expect(pressOn("dine_in").result.ok).toBe(true);
  });

  it("an UNRECOGNISED order type is refused — the allowlist, not a denylist", () => {
    // > The filter is an **allowlist** on the order's own `order_type` … `order_type` is an open
    // > string, so a denylist marks an unrecognised value `served`, terminally and permanently
    // > under `01-F35`/`01-F1`.
    //
    // ⚠ **THIS IS THE ROW A DENYLIST PASSES EVERY OTHER TEST WITHOUT.** `order_type !== "delivery"`
    // satisfies the three-modes row AND the delivery row above; it fails only here. Two spellings
    // are driven: a variant of a word the product already knows, and a mode it has never seen.
    for (const order_type of ["Delivery", "kerbside"]) {
      const odd = pressOn(order_type);
      expect(odd.result.ok, order_type).toBe(false);
      expect(odd.emitted, order_type).toEqual([]);
      expect(statesOf(odd.store)).toEqual({ L0: ["ready"], L1: ["ready"] });
    }
  });

  it("an ABSENT order type is refused too — an unknown is not a blessing (00 §5.7)", () => {
    // `registry.ts` has `order_type` optional, so absence is constructible and is a third case
    // rather than a spelling of the second. An allowlist refuses it for the same reason.
    const missing = pressOn(undefined);
    expect(missing.result.ok).toBe(false);
    expect(missing.emitted).toEqual([]);
  });

  it("serveEdgesFor carries the allowlist itself, so no host can forget it", () => {
    // The gate is INSIDE the pure function, not around it at the call site — `line-advance.ts`'s
    // own recorded lesson (*"a gate in the host is a gate no test can drive"*, measured on M10).
    const cells = JSON.stringify({
      A: { item_id: "i", qty: 1, unit_price_paisa: 1, states: ["ready"] },
    });
    expect(
      serveEdgesFor({ order_id: ORDER, order_type: "delivery", json_lines: cells }),
    ).toBeNull();
    expect(serveEdgesFor({ order_id: ORDER, order_type: null, json_lines: cells })).toBeNull();
    expect(
      serveEdgesFor({ order_id: ORDER, order_type: "dine_in", json_lines: cells }),
    ).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — THE ASSIGNMENT ENFORCED IN MAIN. `03-F52`: *"Surfaces without the assignment are read-only
//      for `served`."* This is the authorization, and it is a refusal.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 03-F52 — a surface without the assignment appends nothing", () => {
  it("every owner that is not `pass` leaves the ledger where it was", () => {
    for (const owner of ["settlement", "counter", "waiter"]) {
      const store = freshStore();
      seedOrder(store, { order_type: "dine_in", lines: { L0: "ready" } });
      const { serve, emitted } = handOverOn(store, owner);
      const result = serve.handOver(ORDER);
      expect(result, owner).toEqual({ ok: false, reason: "not_the_owner", owner });
      expect(emitted, owner).toEqual([]);
      expect(statesOf(store), owner).toEqual({ L0: ["ready"] });
    }
  });

  it("the assignment is re-read on EVERY call, not captured at construction", () => {
    // A value captured when the object was built would freeze this device on whatever was set at
    // boot, and `03-F52` calls the assignment *"a single org value read by every surface"* — a
    // value that will one day arrive over a config plane. The getter is the seam.
    const store = freshStore();
    seedOrder(store, { order_type: "dine_in", lines: { L0: "ready" } });
    let owner = "settlement";
    const serve = createServeMark({
      store,
      policy: () => owned(owner),
      append: (type, payload) => append(store, type, payload),
    });
    expect(serve.handOver(ORDER).ok).toBe(false);
    owner = "pass";
    expect(serve.handOver(ORDER).ok).toBe(true);
  });

  it("an order this device does not hold is a no-op, never a throw (01-F17)", () => {
    const store = freshStore();
    const { serve, emitted } = handOverOn(store);
    expect(() => serve.handOver("no-such-order")).not.toThrow();
    expect(serve.handOver("no-such-order").ok).toBe(false);
    expect(emitted).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — THE FOLD, AND `03-F17`. The queue drains the day the event arrives.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§E 03-F17 — the ticket leaves the pass", () => {
  const queue = (store: DeviceStore) =>
    passQueue({ store, name: (id) => id, aging: resolveAging(undefined), now: () => 60_000 });

  it("a fully-ready dine-in ticket is OFF the pass after one press", () => {
    // The whole reason `03-F52` exists: *"a pass screen that accumulates for ever after one
    // service is not a degraded surface, it is an unusable one."* This is that sentence, measured.
    const store = freshStore();
    seedOrder(store, { order_type: "dine_in", lines: { L0: "ready", L1: "ready" } });
    expect(queue(store)).toHaveLength(1);

    expect(handOverOn(store).serve.handOver(ORDER).ok).toBe(true);

    expect(statesOf(store)).toEqual({ L0: ["served"], L1: ["served"] });
    expect(queue(store)).toEqual([]);
  });

  it("a PARTLY handed-over ticket stays — the FR's own words, through the real fold", () => {
    // > Lines still `in_prep` are untouched and **the ticket stays on the pass** — a partially-
    // > ready order has not been handed over.
    const store = freshStore();
    seedOrder(store, { order_type: "dine_in", lines: { L0: "ready", L1: "in_prep" } });
    handOverOn(store).serve.handOver(ORDER);
    expect(queue(store)).toHaveLength(1);
    expect(queue(store)[0]?.lines.find((l) => l.line_id === "L1")?.state).toBe("in_prep");
  });

  it("the emitted edge raises no ILLEGAL_TRANSITION in the real merge engine", () => {
    // The anchor against a payload this module believes is legal and the kernel does not.
    //
    // ⚠ It is `illegal_transition` specifically and NOT an empty anomaly map, because `preds: []`
    // on a TERMINAL edge leaves the preceding non-terminal heads unretired and `projectLine` flags
    // them `terminal_regression` — measured and reasoned at length on `line-advance.ts`'s
    // `advanceEdgesFor`, and excluded by name from the cloud Auditor. Asserting `{}` here would be
    // RED under a correct implementation, which is the failure this suite is warned about twice.
    const store = freshStore();
    seedOrder(store, { order_type: "takeaway", lines: { L0: "ready" } });
    handOverOn(store).serve.handOver(ORDER);
    expect(statesOf(store)).toEqual({ L0: ["served"] });
    expect(anomalyValues(store)).not.toContain("illegal_transition");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §F — THE SEPARATION. *"One press of DONE emits `ready` and only `ready`."*
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§F 03-F52 — DONE is not HANDOVER", () => {
  it("DONE on a mixed ticket reaches `ready` and NEVER `served`", () => {
    // > A DONE that emitted both would blank the screen at the start of the work the screen exists
    // > for, and would make `03-F19`'s two-minute undo window meaningless against a terminal state.
    //
    // The tempting implementation is the one that closes `03-F17` in a single control, and it
    // leaves every other assertion in this file green.
    const store = freshStore();
    seedOrder(store, {
      order_type: "dine_in",
      lines: { L0: "ready", L1: "in_prep", L2: "confirmed" },
    });
    const { mark, emitted } = doneOn(store);
    expect(mark.mark(ORDER, null).ok).toBe(true);
    expect(emitted.map((e) => e.state)).not.toContain("served");
    for (const payload of emitted) {
      for (const ctx of Object.values(payload.line_context)) expect(ctx.to).not.toBe("served");
    }
    expect(statesOf(store)).toEqual({ L0: ["ready"], L1: ["ready"], L2: ["ready"] });
    // …and the ticket is still on the pass, which is the point of the separation.
    expect(
      passQueue({ store, name: (id) => id, aging: resolveAging(undefined), now: () => 60_000 }),
    ).toHaveLength(1);
  });

  it("a DELIVERY ticket bumped DONE still gets its ready-marks", () => {
    // > a delivery ticket bumped DONE gets its ready-marks and stays on the pass
    //
    // The delivery exclusion belongs to HANDOVER and to nothing else. An implementation that put
    // the allowlist on the ready-mark would take the bump control away from every delivery ticket
    // in the kitchen — food nobody could mark cooked.
    const store = freshStore();
    seedOrder(store, { order_type: "delivery", lines: { L0: "in_prep", L1: "in_prep" } });
    expect(doneOn(store).mark.mark(ORDER, null).ok).toBe(true);
    expect(statesOf(store)).toEqual({ L0: ["ready"], L1: ["ready"] });
    // …and it stays on the pass, because handover refuses it.
    expect(handOverOn(store).serve.handOver(ORDER).ok).toBe(false);
    expect(
      passQueue({ store, name: (id) => id, aging: resolveAging(undefined), now: () => 60_000 }),
    ).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §G — `handoverable`, the trusted-side answer to *"is there a control on this card?"*
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§G 27-F5 — the card knows whether the handover is live", () => {
  const ticket = (spec: Parameters<typeof seedOrder>[1]) => {
    const store = freshStore();
    seedOrder(store, spec);
    return passQueue({
      store,
      name: (id) => id,
      aging: resolveAging(undefined),
      now: () => 60_000,
    })[0];
  };

  it("true only where the press would actually do something", () => {
    // `27-F5` — no inert primary controls. Computed here rather than in the renderer for
    // `bumpable`'s own recorded reason: *"the control the operator sees and the act main will
    // perform cannot disagree"*, and commandment 8 — a renderer deciding this is a client claim.
    expect(
      ticket({ order_type: "dine_in", lines: { L0: "ready", L1: "in_prep" } })?.handoverable,
    ).toBe(true);
    expect(ticket({ order_type: "takeaway", lines: { L0: "ready" } })?.handoverable).toBe(true);
    expect(ticket({ order_type: "pickup", lines: { L0: "ready" } })?.handoverable).toBe(true);
  });

  it("false where the emitter would refuse — and for each of the three reasons separately", () => {
    // Three fixtures rather than one, because a `handoverable` that only checked the states would
    // pass a delivery ticket and a `handoverable` that only checked the type would pass a ticket
    // with nothing ready. Each row is the other's control.
    expect(
      ticket({ order_type: "dine_in", lines: { L0: "in_prep", L1: "confirmed" } })?.handoverable,
    ).toBe(false);
    expect(
      ticket({ order_type: "delivery", lines: { L0: "ready", L1: "ready" } })?.handoverable,
    ).toBe(false);
    expect(ticket({ order_type: "kerbside", lines: { L0: "ready" } })?.handoverable).toBe(false);
    expect(ticket({ lines: { L0: "ready" } })?.handoverable).toBe(false);
  });

  it("`bumpable` and `handoverable` are DIFFERENT questions on the same card", () => {
    // A fully-ready dine-in ticket has nothing left to bump and everything left to hand over; a
    // fresh one is the inverse. An implementation that aliased the two would pass every row above
    // that happened to agree, and this is the pair where they cannot.
    const ready = ticket({ order_type: "dine_in", lines: { L0: "ready", L1: "ready" } });
    expect(ready?.bumpable).toBe(false);
    expect(ready?.handoverable).toBe(true);
    const fresh = ticket({ order_type: "dine_in", lines: { L0: "confirmed", L1: "confirmed" } });
    expect(fresh?.bumpable).toBe(true);
    expect(fresh?.handoverable).toBe(false);
  });
});
