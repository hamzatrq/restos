// THE SEAM for `02-F31`'s line auto-advance — does the SHIPPED app reach the emitter?
//
// **This file exists because of the wave's named defect**, in the one shape `pnpm seams:check`
// says out loud that it cannot see: **a missing PRODUCER for an event type**. Rule A wants an
// unreached export and Rule B an unsupplied optional; `order.line_state_changed` is neither — it
// is a key in an object literal — which is exactly how `audit.print_acknowledged` sat in the
// registry with nothing emitting it. `line-advance.test.ts` proves the emitter builds correct
// edges and the kernel accepts them; it constructs its own wiring, so it stays green against a
// host that never calls it, and every line in the product would still sit at `placed`.
//
// So the assertions here are about `index.ts` and nothing else. Two of them read source, which is
// a weak instrument and is used only where nothing better exists: `main/index.ts` builds an
// Electron app at module scope and cannot be imported in a unit test (no suite in this package
// does), which is the same constraint `print-ack-audit.test.ts` §A works under and the same
// answer it reached. §B is not a source read — it drives the real construction shape through a
// harness and measures behaviour.
//
// PROVENANCE: written alongside the implementation, like `orders-seam.test.ts` beside it, and
// owed the same independent oracle pass.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createLineAdvance, type LineStateChangedPayload } from "../line-advance";

const SRC = new URL("../", import.meta.url).pathname;
const readSrc = (rel: string): string => readFileSync(`${SRC}${rel}`, "utf8");

const ORDER_ID = "0199aaaa-0000-7000-8000-00000000abcd";
const LINE_A = "0199aaaa-0000-7000-8000-00000000ff01";

const orderAt = (state: string) => ({
  order_id: ORDER_ID,
  json_lines: JSON.stringify({
    [LINE_A]: { item_id: "i-karahi", qty: 1, unit_price_paisa: 45_000, states: [state] },
  }),
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE PRODUCER EXISTS AND THE SHIPPED HOST REACHES IT.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 02-F31 — main/index.ts wires the line advance", () => {
  const mainSrc = readSrc("index.ts");

  it("is actually reading the file it guards", () => {
    // ROUND-2 PATTERN 2, "the guard passed by not looking": a scanner over an empty string reports
    // clean. Anchored on lines that have nothing to do with this work.
    expect(mainSrc).toContain("app.whenReady()");
    expect(mainSrc).toContain("createKotPrinter({");
    expect(mainSrc.length).toBeGreaterThan(20_000);
  });

  it("constructs the emitter and hands it a real store, a tier and an append", () => {
    // Sliced to the CONSTRUCTION's own closing line (`\n  });` at file indentation), not to the
    // first `});` — the inner `gateway.append({ … });` closes before the factory call does, and a
    // slice that stopped there would silently measure a third of the argument list.
    const call = mainSrc.slice(mainSrc.indexOf("createLineAdvance({"));
    const args = call.slice(0, call.indexOf("\n  });"));
    expect(args).not.toBe("");
    // All three deps are REQUIRED on `LineAdvanceDeps`, so a host that forgets one is a typecheck
    // error and this could not fail — except in the one way that matters: `append` must reach the
    // ledger. A `() => {}` here is the "port supplied with a STUB" case `seams:check` measures as
    // invisible to every rail in the repo (`audit: () => {}` was instance 4 of the wave's defect),
    // so this asserts the gateway is named inside the callback rather than merely that a callback
    // was passed.
    expect(args).toContain("store,");
    expect(args).toContain("tier:");
    expect(args).toContain("gateway.append(");
  });

  it("triggers the confirm edge from the order.confirmed append — 01 §4's precondition", () => {
    // Without this the KOT advance can never fire: `LEGAL_NEXT.placed` excludes `in_prep`.
    const handler = mainSrc.slice(mainSrc.indexOf('confirm.data.type === "order.confirmed"'));
    expect(handler.slice(0, handler.indexOf("kot.confirmed"))).toContain(
      "lines.confirmed(order_id)",
    );
  });

  it("routes the KOT printer's whole append callback into the emitter", () => {
    // That callback carries three event types — `kot.printed`, `kot.print_failed` and
    // `audit.print_acknowledged` — and §B drives the branch that tells them apart against the REAL
    // `printEvent`. THIS assertion is only that the host reaches the emitter at all; keeping the
    // two apart is what stops either half being a hand-copy of the other.
    const kotCall = mainSrc.slice(mainSrc.indexOf("createKotPrinter({"));
    const args = kotCall.slice(0, kotCall.indexOf("\n  });"));
    // The whole callback signature is passed through, so the discriminating branch lives in the
    // module §B can drive rather than in a host no test can import. That is the fix for the
    // hand-copy oracle §B documents; the assertion here is only that the pass-through exists.
    expect(args).toContain("lines.printEvent(type, payload)");
  });

  it("00 §5.7 — the tier is resolved with an explicit null roster, and reported at boot", () => {
    // `roster: null` is the finding, not an oversight: `01-F62` keeps `device.registered` out of
    // every branch stream, so `02-F31`'s detection rule cannot run on a device. Passing it
    // explicitly (rather than defaulting it inside the resolver) is what keeps the claim visible
    // at the call site, and the boot line is what keeps it visible to the operator.
    expect(mainSrc).toContain("roster: null");
    expect(mainSrc).toContain("describeHardwareTier(hardwareTier())");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — THE SEAM MEASURED AS BEHAVIOUR. The type-guard above is a string match; this is not.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 02-F31 — the KOT callback's contract, driven", () => {
  /**
   * The REAL `printEvent`, not a hand-copy of `index.ts`'s branch.
   *
   * **The first draft of this section WAS a hand-copy** — it reimplemented the `type ===
   * "kot.printed"` guard inside the test and asserted against that, which is `K-3`'s dead-oracle
   * defect: an oracle pinning its own copy of the thing it exists to pin. The mutation matrix
   * measured the consequence — deleting the guard from `index.ts` was killed by §A's *source
   * string* and by nothing behavioural, so the copy could have drifted from the product silently.
   * The guard moved into `line-advance.ts` and `index.ts` now passes the callback straight
   * through, which is why the two assertions below are real.
   */
  const kotCallback = (tier: "T1" | "T2") => {
    const appended: { type: string; payload: LineStateChangedPayload }[] = [];
    const lines = createLineAdvance({
      store: { openOrders: () => [orderAt("confirmed")] } as never,
      tier: () => tier,
      append: (type, payload) => appended.push({ type, payload }),
    });
    return { appended, lines };
  };

  it("a FAILED print advances nothing", () => {
    const r = kotCallback("T1");
    // The three types this one callback carries in the shipped host.
    r.lines.printEvent("kot.print_failed", { order_id: ORDER_ID, printer_name: "TH230" });
    r.lines.printEvent("audit.print_acknowledged", { alarm_id: "x", order_id: ORDER_ID });
    expect(r.appended).toHaveLength(0);
    // Not vacuous: the SAME rig advances on the real event.
    r.lines.printEvent("kot.printed", { order_id: ORDER_ID });
    expect(r.appended).toHaveLength(1);
    expect(r.appended[0]?.payload.state).toBe("in_prep");
  });

  it("the tier gate is read inside printEvent, not around it", () => {
    const r = kotCallback("T2");
    r.lines.printEvent("kot.printed", { order_id: ORDER_ID });
    expect(r.appended).toHaveLength(0);
  });

  it("a kot.printed with no usable order id is a no-op, never a throw (01-F17)", () => {
    const r = kotCallback("T1");
    expect(() => r.lines.printEvent("kot.printed", {})).not.toThrow();
    expect(() => r.lines.printEvent("kot.printed", null)).not.toThrow();
    expect(r.appended).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — THE SETTLEMENT SEAM. `02-F31`'s second half, unblocked by `DEC-HW-002` (August 2026).
//
// ⚠ THIS SECTION WAS AN ANTI-SCOPE GUARD AND IS NOW ITS OWN INVERSE, so what it used to assert is
// recorded here rather than lost in a diff. It was titled *"the settlement trigger is BLOCKED and
// absent"* and it asserted:
//
//   (a) the 400 characters after `confirm.data.type === "payment.recorded"` do NOT contain
//       `lines.`  — i.e. no settlement path calls the line advance;
//   (b) `index.ts` does not contain the string `"served"` anywhere;
//   (c) `LineAdvance` has exactly the two keys `["confirmed", "printEvent"]`, because "a
//       `LineAdvance` with a third method would be a settlement path by another name";
//   (d) the module still records the CONFLICT — `line-advance.ts` contains `in_prep → served`,
//       `LEGAL_NEXT.in_prep` and `rider-driven only`.
//
// Its own instruction was *"delete the guard in the same change that closes the conflict, and not
// before"*. The conflict is closed by ruling, so (a) and (c) are inverted below — the trigger must
// now be PRESENT and reachable — and (d) is kept almost unchanged, because the module must still
// carry the reasoning; only what it has to say has moved from "why this is refused" to "why this
// is legal and where the ruling stopped". (b) is dropped outright: it was a proxy for (a) and the
// string is now expected.
//
// **The inversion is not a weakening.** An anti-scope guard fails when the thing appears; this
// fails when it disappears OR when it appears without its gates, which is the strictly larger
// claim. The failure mode it now defends against is the one `line-advance.ts` called the worst
// option available: a trigger that is wired and inert, looking finished with every gate green.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 02-F31/DEC-HW-002 — the settlement trigger is PRESENT, reachable and gated", () => {
  const mainSrc = readSrc("index.ts");
  const moduleSrc = readSrc("line-advance.ts");

  it("the settlement handler reaches the line advance — the SEAM", () => {
    // The inverse of assertion (a). A source read is a weak instrument and is used here for the
    // reason this file's header gives: `main/index.ts` builds an Electron app at module scope and
    // no suite in this package can import it. Sliced from the `payment.recorded` narrowing so this
    // measures THAT handler and not some other `lines.` call elsewhere in a 20k-character file.
    const settleHandler = mainSrc.slice(
      mainSrc.indexOf('confirm.data.type === "payment.recorded"'),
    );
    const body = settleHandler.slice(0, 1400);
    expect(body).toContain("lines.settled(order_id)");
    // It hangs off the SAME narrowing the receipt does rather than adding a second one — two
    // definitions of "a payment landed" on one event is the `02-F45` shape.
    expect(body).toContain("receipts.settled(order_id)");
  });

  it("the surface carries the third method, and it is the settlement one", () => {
    // The inverse of assertion (c), which read `["confirmed", "printEvent"]` on the grounds that a
    // third method "would be a settlement path by another name". It is exactly that, and it is now
    // required rather than forbidden.
    const lines = createLineAdvance({
      store: { openOrders: () => [] } as never,
      tier: () => "T1",
      append: () => {},
    });
    expect(Object.keys(lines).sort()).toEqual(["confirmed", "printEvent", "settled"]);
  });

  it("BEHAVIOUR, not a source string — the trigger moves a real line and is really gated", () => {
    // ⚠ THE ASSERTION THAT MATTERS, and the reason it exists is measured rather than assumed:
    // mutant M10 of the producer round was killed by a source string and by NOTHING behavioural,
    // because the seam suite asserted against a hand-copy of the host's branch (`K-3`'s
    // dead-oracle defect). The source read above proves the host CALLS the emitter; this proves
    // the emitter it calls is not inert — which is the half a wired-and-inert trigger would pass.
    const rig = (tier: "T1" | "T2", order_type: string) => {
      const appended: { type: string; payload: LineStateChangedPayload }[] = [];
      const lines = createLineAdvance({
        store: {
          openOrders: () => [{ ...orderAt("in_prep"), order_type, pay_total: 45_000 }],
        } as never,
        tier: () => tier,
        append: (type, payload) => appended.push({ type, payload }),
      });
      lines.settled(ORDER_ID);
      return appended;
    };
    // It fires, and it fires with the state `02-F31` names.
    const served = rig("T1", "dine_in");
    expect(served).toHaveLength(1);
    expect(served[0]?.payload.state).toBe("served");
    // The tier gate is read INSIDE `settled`, not around it at the call site — same property §B
    // pins for `printEvent`, and the same reason: a gate in the host is a gate no test can drive.
    expect(rig("T2", "dine_in")).toHaveLength(0);
    // `01 §4`'s delivery rule, on an order identical in every other respect.
    expect(rig("T1", "delivery")).toHaveLength(0);
  });

  it("the module records WHY, so the next reader does not rediscover it as a bug", () => {
    // Assertion (d), kept. An owed item filed with no reason is one nobody re-checks — `01-F56`'s
    // catalog refusal sat for a wave behind "no FR exists" when the FR did exist. What the module
    // must now carry is the RULING and the boundary it stopped at, not the old conflict.
    expect(moduleSrc).toContain("DEC-HW-002");
    expect(moduleSrc).toContain("LEGAL_NEXT.in_prep");
    // The delivery rule is quoted from `01 §4` rather than paraphrased from `02-F31`.
    expect(moduleSrc).toContain("rider-driven only");
    // And the two live limits, so neither can be quietly closed by a session being helpful:
    // `confirmed → served` stays illegal, and the terminal edge's missing `preds` is a named,
    // measured debt rather than an unremarked side effect.
    expect(moduleSrc).toContain("terminal_regression");
  });
});
