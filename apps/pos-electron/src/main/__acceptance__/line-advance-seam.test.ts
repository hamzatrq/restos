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

  it("triggers the in_prep edge from kot.printed, and from NOTHING ELSE on that callback", () => {
    // The KOT printer's `append` callback carries three event types — `kot.printed`,
    // `kot.print_failed` and `audit.print_acknowledged`. Advancing a line because a ticket FAILED
    // to print is the exact inversion of `02-F31`, and `01-F1` makes it permanent, so the guard on
    // the type is load-bearing rather than defensive.
    const kotCall = mainSrc.slice(mainSrc.indexOf("createKotPrinter({"));
    const args = kotCall.slice(0, kotCall.indexOf("\n  });"));
    expect(args).toContain("lines.kotPrinted(order_id)");
    expect(args).toContain('type === "kot.printed"');
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
  /** The shape `index.ts` builds: one `append` callback, three event types through it. */
  const kotCallback = (tier: "T1" | "T2") => {
    const appended: { type: string; payload: LineStateChangedPayload }[] = [];
    const lines = createLineAdvance({
      store: { openOrders: () => [orderAt("confirmed")] } as never,
      tier: () => tier,
      append: (type, payload) => appended.push({ type, payload }),
    });
    // Verbatim the branch in `index.ts`'s `createKotPrinter({ append })`.
    const onPrintEvent = (type: string, payload: Record<string, unknown>): void => {
      if (type === "kot.printed") {
        const order_id = payload.order_id;
        if (typeof order_id === "string") lines.kotPrinted(order_id);
      }
    };
    return { appended, onPrintEvent };
  };

  it("a FAILED print advances nothing", () => {
    const r = kotCallback("T1");
    r.onPrintEvent("kot.print_failed", { order_id: ORDER_ID, printer_name: "TH230" });
    r.onPrintEvent("audit.print_acknowledged", { alarm_id: "x", order_id: ORDER_ID });
    expect(r.appended).toHaveLength(0);
    // Not vacuous: the SAME rig advances on the real event.
    r.onPrintEvent("kot.printed", { order_id: ORDER_ID });
    expect(r.appended).toHaveLength(1);
    expect(r.appended[0]?.payload.state).toBe("in_prep");
  });

  it("the tier gate is read through the callback, not around it", () => {
    const r = kotCallback("T2");
    r.onPrintEvent("kot.printed", { order_id: ORDER_ID });
    expect(r.appended).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — ANTI-SCOPE. `02-F31`'s settlement half is BLOCKED and must not be drawn.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 02-F31/01 §4 — the settlement trigger is BLOCKED and absent", () => {
  const mainSrc = readSrc("index.ts");
  const moduleSrc = readSrc("line-advance.ts");

  it("no settlement path calls the line advance", () => {
    // `02-F31` requires settlement → `served` AND forbids fabricating `ready`, while `01 §4` and
    // `LEGAL_NEXT` reach `served` only from `ready`. Wiring a trigger anyway gives one of two bad
    // outcomes: a permanently illegal edge on every settled order, or — worse, because it looks
    // finished — a call site that advances nothing and turns the gap into a green suite.
    //
    // **If a later session closes the conflict, this test is the reminder that the trigger is now
    // owed** — delete it in the same PR that builds settlement, and not before. The same shape as
    // `orders-tab.dom.test.tsx` §E for `C20`/`C32`.
    const settleHandler = mainSrc.slice(
      mainSrc.indexOf('confirm.data.type === "payment.recorded"'),
    );
    expect(settleHandler.slice(0, 400)).not.toContain("lines.");
    expect(mainSrc).not.toContain('"served"');
    // A `LineAdvance` with a third method would be a settlement path by another name.
    const lines = createLineAdvance({
      store: { openOrders: () => [] } as never,
      tier: () => "T1",
      append: () => {},
    });
    expect(Object.keys(lines).sort()).toEqual(["confirmed", "kotPrinted"]);
  });

  it("the module records WHY, so the next reader does not rediscover it as a bug", () => {
    // An owed item filed with no reason is one nobody re-checks — `01-F56`'s catalog refusal sat
    // for a wave behind "no FR exists" when the FR did exist. The conflict, the three candidate
    // resolutions and the reason none is a session's call are in the module, not only in a commit.
    expect(moduleSrc).toContain("in_prep → served");
    expect(moduleSrc).toContain("LEGAL_NEXT.in_prep");
    // The delivery rule is part of the blocked half and is named rather than quietly dropped.
    expect(moduleSrc).toContain("rider-driven only");
  });
});
