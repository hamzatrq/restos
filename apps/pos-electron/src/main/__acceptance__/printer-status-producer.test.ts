// ACCEPTANCE TESTS — `03-F11`'s `printer.status_changed` gets a PRODUCER on the till.
//
// Authored from spec text ONLY (24 §3 step 2; read-only to the implementing session). `printing.ts`
// was read as a CONTRACT — its deps bag, its `append` seam, its `pump()` — never as an
// implementation of this event: at the time of writing a symbol-precise `grep -a
// "printer.status_changed" apps services packages` found the type in comments and specs only, with
// no producer and no consumer anywhere in the product.
//
// THE FRs, QUOTED:
//
//   03-F11 "`printer.status_changed` (extension) emitted on online/offline transitions per
//          registered printer — feeds doc 05 alarms and doc 15 fleet health."
//   03-F54 (August 2026) its payload — `printer_name` (non-empty) and `status`, a CLOSED
//          two-member set `online | offline`; "A `stalled` job is NOT an offline transition";
//          "the prior state is assumed `online`, so a first failure IS a transition and a first
//          success is NOT"; "emitted by the device that owns the transport … the same host that
//          already appends `kot.print_failed` through the same seam, so this adds a producer and
//          not a path."
//   03-F41 "a stalled printer is holding the job, not dropping it — so `03-F4`'s retry must not
//          re-transmit"; a stall "never counts toward the 3-attempt budget".
//   03-F4  retry 3 attempts over 30 s on transport failure, then stop.
//   05-F3  `printer.status_changed(offline)` raises on the manager console.
//   01-F4  an invalid payload is a runtime error — so what this producer emits must PARSE.
//   01-F1  the ledger is permanent: an event appended per attempt can never be thinned out.
//
// ── WHY THIS SUITE EXISTS AT ALL, in one sentence ──────────────────────────────────────────────
//
// AGENTS.md names this wave's recurring defect as "a correct subsystem with no seam to the
// product", and records that `seams:check` is structurally blind to a MISSING PRODUCER because a
// key in an object literal is not an export — `audit.print_acknowledged` sat in the registry with
// nothing emitting it, and `printer.status_changed` has sat in `01 §4` since July with no schema
// and no emitter. A schema alone would leave it in exactly that state; §B and §C below are the
// hand-written assertion the rail cannot supply.
//
// ── ONE PINNED INTERPRETATION ──────────────────────────────────────────────────────────────────
//
// **The observable evidence of "offline" on this device is a job reaching `03-F4`'s terminal
// `failed`, and of "online" a job reaching `printed`.** The transport is exercised only by jobs,
// so there is no other signal a till has. The SIMPLER ALTERNATIVE — emit on each failed transmit
// ATTEMPT — is refused: it appends up to three events per job permanently (`01-F1`) for one
// printer going down, and `03-F4` spends its whole budget precisely because a single failed
// attempt is not yet evidence of anything. This suite therefore drives whole budgets, never single
// attempts, and asserts the COUNT (tests 3 and 4) rather than mere presence.

import { parseEvent } from "@restos/domain";
import {
  createSpooler,
  MAX_TRANSMIT_ATTEMPTS,
  type PaperStatus,
  printerCapability,
  type SpoolerTransport,
} from "@restos/escpos";
import { describe, expect, it } from "vitest";
import { createKotPrinter } from "../printing";

const STATUS = "printer.status_changed";
const MODEL = "TH230";

const ORDER_1 = "0199aaaa-0000-7000-8000-000000000001";
const ORDER_2 = "0199aaaa-0000-7000-8000-000000000002";
const ORDER_3 = "0199aaaa-0000-7000-8000-000000000003";
const CONFIRM_AT = 1_770_000_000_000;

type Appended = { type: string; payload: Record<string, unknown> };

const LINES = JSON.stringify({
  "line-a": { item_id: "i-karahi", qty: 2, unit_price_paisa: 45_000, states: ["confirmed"] },
});

const stubStore = () =>
  ({
    openOrders: () =>
      [ORDER_1, ORDER_2, ORDER_3].map((order_id) => ({
        order_id,
        channel: "counter",
        table_ids_json: "[]",
        json_lines: LINES,
        pay_total: 0,
      })),
    kitchenQueue: () =>
      [ORDER_1, ORDER_2, ORDER_3].map((order_id) => ({
        order_id,
        age_basis: CONFIRM_AT,
        channel: "counter",
      })),
  }) as unknown as Parameters<typeof createKotPrinter>[0]["store"];

/**
 * A transport whose health this suite drives. `link_down` is `03-F4`'s transport failure;
 * `paper_out` is `03-F41`'s stall, which answers the sensor and is therefore REACHABLE.
 */
type Health = "healthy" | "link_down" | "paper_out";

const controllable = (): { transport: SpoolerTransport; set: (h: Health) => void } => {
  let health: Health = "healthy";
  return {
    set: (h) => {
      health = h;
    },
    transport: {
      send: async () => {
        await Promise.resolve();
        if (health === "healthy") return { ok: true } as const;
        if (health === "paper_out") return { ok: false, state: "stalled" } as const;
        return { ok: false, state: "failed" } as const;
      },
      status: async (): Promise<PaperStatus> => ({
        paper_out: health === "paper_out",
        near_end: "unsupported",
      }),
    },
  };
};

const rig = () => {
  const link = controllable();
  const appended: Appended[] = [];
  const printer = createKotPrinter({
    spooler: createSpooler({ transport: link.transport }),
    store: stubStore(),
    catalog: () => ({ name: "Chicken Karahi" }),
    station: () => "GRILL",
    capability: printerCapability(MODEL),
    append: (type, payload) => appended.push({ type, payload }),
  });
  return { printer, appended, set: link.set };
};

/** Spend `03-F4`'s whole retry budget, exactly as `main/index.ts`'s interval does. */
const exhaust = async (printer: { pump: () => Promise<void> }): Promise<void> => {
  for (let i = 0; i < MAX_TRANSMIT_ATTEMPTS + 1; i += 1) await printer.pump();
};

const statusEvents = (appended: readonly Appended[]): readonly Appended[] =>
  appended.filter((e) => e.type === STATUS);

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §A — the fixture is real before anything is claimed about it.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("§A the rig actually prints and actually fails", () => {
  // ROUND-2 PATTERN 2, "the guard that passed by not looking". Every count below is a count of
  // events produced by a printer that must be doing its ordinary job; if the rig silently made no
  // jobs at all, `toHaveLength(0)` would pass everywhere and this suite would assert nothing.
  it("prints a KOT on a healthy link and fails one on a dead link (03-F4)", async () => {
    const healthy = rig();
    healthy.printer.confirmed(ORDER_1);
    await healthy.printer.pump();
    expect(healthy.appended.map((e) => e.type)).toContain("kot.printed");

    const dead = rig();
    dead.set("link_down");
    dead.printer.confirmed(ORDER_1);
    await exhaust(dead.printer);
    expect(dead.appended.map((e) => e.type)).toContain("kot.print_failed");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §B — `03-F11`'s transitions, and only its transitions.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("§B 03-F11/03-F54 — the till emits printer.status_changed on a transition", () => {
  // 1. `03-F54`'s "the prior state is assumed `online`, so … a first success is NOT [a
  //    transition]". A branch whose printer works must never see this event.
  //    WRONG IMPLEMENTATION CAUGHT: treating the first observation as a transition, which appends
  //    one `online` per launch per printer, permanently, reporting no change to anyone.
  it("stays SILENT while the printer works (03-F11, 03-F54)", async () => {
    const r = rig();
    r.printer.confirmed(ORDER_1);
    await r.printer.pump();
    r.printer.confirmed(ORDER_2);
    await r.printer.pump();
    expect(statusEvents(r.appended)).toHaveLength(0);
  });

  // 2. The event `05-F3` is waiting for, with `03-F54`'s payload. `printer_name` is the capability's
  //    `model_id` — the same value `kot.print_failed` carries — so the console can raise both onto
  //    one list without joining two spellings of one printer.
  it("emits offline, naming the printer, when the link dies (03-F11, 05-F3)", async () => {
    const r = rig();
    r.set("link_down");
    r.printer.confirmed(ORDER_1);
    await exhaust(r.printer);
    expect(statusEvents(r.appended)).toHaveLength(1);
    expect(statusEvents(r.appended)[0]?.payload).toEqual({
      printer_name: MODEL,
      status: "offline",
    });
  });

  // 3. "on TRANSITIONS" — the load-bearing word. A second dead job on an already-offline printer
  //    reports nothing new.
  //    WRONG IMPLEMENTATION CAUGHT: emitting per failed job (or per failed attempt), which passes
  //    test 2 exactly and turns a bad night into an unbounded permanent event stream under
  //    `01-F1` — the ledger form of `05-F4`'s siren wall.
  it("does NOT repeat while the printer stays offline (03-F11)", async () => {
    const r = rig();
    r.set("link_down");
    r.printer.confirmed(ORDER_1);
    await exhaust(r.printer);
    r.printer.confirmed(ORDER_2);
    await exhaust(r.printer);
    r.printer.confirmed(ORDER_3);
    await exhaust(r.printer);
    expect(statusEvents(r.appended)).toHaveLength(1);
  });

  // 4. The other half of the transition, and the one doc 15's fleet health needs: the printer came
  //    back. Exactly one, and it is not a second `offline`.
  //    WRONG IMPLEMENTATION CAUGHT: a producer that only ever emits `offline` (the alarm half is
  //    the half anyone tests), leaving `05-F3`'s alarm with no evidence the trouble ended and doc
  //    15 with a fleet that only ever degrades.
  it("emits online exactly once when the printer comes back (03-F11)", async () => {
    const r = rig();
    r.set("link_down");
    r.printer.confirmed(ORDER_1);
    await exhaust(r.printer);

    r.set("healthy");
    r.printer.confirmed(ORDER_2);
    await r.printer.pump();
    r.printer.confirmed(ORDER_3);
    await r.printer.pump();

    expect(statusEvents(r.appended).map((e) => e.payload.status)).toEqual(["offline", "online"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §C — `03-F54`'s substance: a stalled printer is not an offline printer.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("§C 03-F54/03-F41 — paper-out is not an offline transition", () => {
  // 5. THE SHARPEST ASSERTION IN THIS FILE. `03-F41` separates `stalled` from `failed` because the
  //    printer ANSWERED the `DLE EOT 4` query — it is reachable, it is holding the bytes, and the
  //    remedy is a roll rather than a cable. Emitting `offline` here would fire on the most
  //    ordinary event in a kitchen and send a manager to check the wrong thing.
  //    WRONG IMPLEMENTATION CAUGHT: "any non-`printed` job state means offline", or reading the
  //    spooler's job state as a printer state. Both pass every test in §B.
  it("stays SILENT while the roll is out (03-F41, 03-F54)", async () => {
    const r = rig();
    r.set("paper_out");
    r.printer.confirmed(ORDER_1);
    await exhaust(r.printer);
    expect(statusEvents(r.appended)).toHaveLength(0);
  });

  // 6. And a reload is not an `online` transition either, because nothing ever went offline. This
  //    is the mirror of test 5 and catches the half-fix that suppresses the stall on the way down
  //    and announces recovery on the way up.
  it("stays SILENT when the roll is reloaded (03-F41, 03-F54)", async () => {
    const r = rig();
    r.set("paper_out");
    r.printer.confirmed(ORDER_1);
    await exhaust(r.printer);
    r.set("healthy");
    await r.printer.pump();
    await r.printer.pump();
    expect(statusEvents(r.appended)).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §D — `01-F4`: what this producer emits must be what the catalog accepts. Without this, the
// producer and the schema can drift and both suites stay green — which is exactly how a synced
// field gets dropped between two correct layers (AGENTS.md's `toEntry` finding).
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("§D 01-F4 — every emitted payload parses against the catalog", () => {
  it("emits payloads parseEvent accepts (01-F4, 03-F54)", async () => {
    const r = rig();
    r.set("link_down");
    r.printer.confirmed(ORDER_1);
    await exhaust(r.printer);
    r.set("healthy");
    r.printer.confirmed(ORDER_2);
    await r.printer.pump();

    const emitted = statusEvents(r.appended);
    expect(emitted).toHaveLength(2);
    for (const event of emitted) {
      expect(() =>
        parseEvent({
          id: "0199ffff-0000-7000-8000-00000000000f",
          org_id: "org-A",
          branch_id: "br-A",
          device_id: "dev-till-1",
          actor_user_id: null,
          lamport_seq: 0,
          device_created_at: CONFIRM_AT,
          branch_created_at: CONFIRM_AT,
          time_basis: "branch",
          server_received_at: null,
          type: event.type,
          schema_version: 1,
          payload: event.payload,
          refs: [],
        }),
      ).not.toThrow();
    }
  });
});
