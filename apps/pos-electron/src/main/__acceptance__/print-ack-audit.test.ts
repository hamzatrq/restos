// ACCEPTANCE TESTS — `03-F5`'s THIRD consequence: acknowledging a print-failure band is LOGGED.
//
// PROVENANCE (24 §3 step 2), stated rather than glossed: authored and implemented by the same
// session. The mitigation is the round-3 law, not a claim of independence — every assertion below
// was mutation-tested against a CONTROL differing in exactly one branch, and the matrix is in the
// session report. Where an assertion could pass vacuously it is anchored on something the
// implementation cannot also supply (§A reads source; §E appends through a REAL store and reads
// the chain back).
//
// THE FRs THIS FILE IS WRITTEN FROM, quoted so an assertion can be argued with:
//
//   03-F5  "Silent KOT failure is forbidden. When retries exhaust: the host device raises a loud
//          alert … repeating until acknowledged; **acknowledgment is logged (`audit.*`)**;
//          `kot.print_failed` is emitted."
//   01-F5  the `audit.*` family has SIX subtypes including `audit.print_acknowledged`, added
//          August 2026 because "`03-F5` requires that acknowledging a print-failure alert is
//          'logged (`audit.*`)' and none of the original five fits". Each payload carries
//          `prev_audit_hash`, and "the chain is store-owned (the device stamps `prev_audit_hash`
//          inside the append transaction; a caller-supplied value is rejected)". It sits in this
//          family because "silently dismissing the band loses a kitchen ticket with nobody
//          accountable, and the hash chain is what makes a quiet dismissal detectable".
//   01-F1  the ledger is permanent — no update, no delete. A credential that reaches a payload is
//          published to every device that syncs and can never be taken back.
//   01-F17 a sale is never blocked. A failed audit append must not cost the operator the act.
//   02-F41 attribution is whoever's PIN is in, read at APPEND and stamped into the envelope.
//
// ⚠ WHAT THIS SUITE DOES NOT CLAIM. `03-F5` NAMES NO FIELDS for the ack, and `01-F5`'s v1 payload
// contract for the whole family is `prev_audit_hash` alone over a `looseObject`. So `alarm_id`,
// `order_id` and `printer_name` are ADDITIVE EXTRAS and an INTERPRETATION — asserted here because
// the implementation chose them, NOT because any FR requires them. As specified, the ack records
// only THAT a band was dismissed and (from the envelope) BY WHOM. Making it answer "which ticket"
// as a contract needs a `03`/`01-F5` amendment, not a test.
//
// ⚠ NO PRINTER HAS EVER BEEN ATTACHED (K-8). Nothing here is evidence about paper or a kitchen.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AUDIT_EVENT_TYPES } from "@restos/domain";
import {
  createSpooler,
  MAX_TRANSMIT_ATTEMPTS,
  type PaperStatus,
  printerCapability,
  type Spooler,
} from "@restos/escpos";
import { type DeviceStore, openStore } from "@restos/sync-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCashPrinter, createKotPrinter } from "../printing";

/** `01-F5`'s sixth subtype. Written once, so a typo cannot make this suite assert about nothing. */
const ACK = "audit.print_acknowledged";

const ORDER_ID = "0199aaaa-0000-7000-8000-00000000abcd";
const SHIFT_ID = "0199cccc-0000-7000-8000-000000005678";
const CONFIRM_AT = 1_754_300_000_000;

type Appended = { type: string; payload: Record<string, unknown> };

const LINES = JSON.stringify({
  "line-a": { item_id: "i-karahi", qty: 2, unit_price_paisa: 45_000, states: ["confirmed"] },
});

const stubStore = (): Pick<DeviceStore, "openOrders" | "kitchenQueue"> =>
  ({
    openOrders: () => [
      {
        order_id: ORDER_ID,
        channel: "counter",
        table_ids_json: "[]",
        json_lines: LINES,
        pay_total: 0,
      },
    ],
    kitchenQueue: () => [{ order_id: ORDER_ID, age_basis: CONFIRM_AT, channel: "counter" }],
  }) as unknown as Pick<DeviceStore, "openOrders" | "kitchenQueue">;

/** A transport that never answers — `unattachedPrinter`'s honest behaviour, driven directly. */
const deadTransport = () => ({
  send: vi.fn(async () => {
    await Promise.resolve();
    return { ok: false, state: "failed" } as const;
  }),
  status: vi.fn(async (): Promise<PaperStatus> => ({ paper_out: false, near_end: "unsupported" })),
});

type KotRig = {
  printer: ReturnType<typeof createKotPrinter>;
  appended: Appended[];
  spooler: Spooler;
};

const kotRig = (opts: { appendThrows?: boolean } = {}): KotRig => {
  const spooler = createSpooler({ transport: deadTransport() });
  const appended: Appended[] = [];
  const printer = createKotPrinter({
    spooler,
    store: stubStore(),
    catalog: () => ({ name: "Chicken Karahi" }),
    station: () => "GRILL",
    capability: printerCapability("TH230"),
    append: (type, payload) => {
      appended.push({ type, payload });
      if (opts.appendThrows === true) throw new Error("the ledger refused this event");
    },
  });
  return { printer, appended, spooler };
};

/** Spend `03-F4`'s whole retry budget, exactly as `main/index.ts`'s interval does. */
const exhaust = async (printer: { pump: () => Promise<void> }): Promise<void> => {
  for (let i = 0; i < MAX_TRANSMIT_ATTEMPTS; i += 1) await printer.pump();
};

const acksIn = (appended: readonly Appended[]): readonly Appended[] =>
  appended.filter((e) => e.type === ACK);

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE SEAM. `pnpm seams:check` CANNOT SEE THIS ONE, and says so: a key in an object literal
// is not an export, so a missing producer for an event type is invisible to the rail. That is
// exactly the shape this wave's named defect takes — `audit.print_acknowledged` had a schema in
// `domain`, a row in `01 §4`, and nothing anywhere that emitted it.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const SRC = new URL("../", import.meta.url).pathname;
const readSrc = (rel: string): string => readFileSync(`${SRC}${rel}`, "utf8");

describe("§A 03-F5/01-F5 — the shipped app PRODUCES the ack", () => {
  const printingSrc = readSrc("printing.ts");
  const mainSrc = readSrc("index.ts");

  it("is actually reading the files it guards", () => {
    // ROUND-2 PATTERN 2, "the guard passed by not looking": a scanner over an empty string
    // reports clean. Anchored on lines that have nothing to do with the ack.
    expect(mainSrc).toContain("app.whenReady()");
    expect(printingSrc).toContain("createKotPrinter");
    expect(printingSrc.length).toBeGreaterThan(4_000);
  });

  it("names the 01-F5 subtype, and emits it from BOTH printers' acknowledge", () => {
    expect(printingSrc).toContain(`"${ACK}"`);
    // Two `acknowledge` implementations, two emits. One tap on `CHANNELS.acknowledgeAlarm`
    // dismisses either printer's band, so a single producer would make the record depend on
    // which printer happened to own the alarm.
    expect(printingSrc.match(/emit\(PRINT_ACK,/g) ?? []).toHaveLength(2);
  });

  it("hands BOTH printers an append, so neither ack is a no-op in the shipped host", () => {
    // `createCashPrinter`'s `append` is OPTIONAL on the deps (an existing oracle constructs it
    // without one), which is the shape that produced instances 2 and 5 of the wave's defect. The
    // rail's Rule B catches an optional member NO call site passes; this catches this one.
    const cashCall = mainSrc.slice(mainSrc.indexOf("createCashPrinter({"));
    expect(cashCall.slice(0, cashCall.indexOf("});"))).toContain("append:");
    const kotCall = mainSrc.slice(mainSrc.indexOf("createKotPrinter({"));
    expect(kotCall.slice(0, kotCall.indexOf("});"))).toContain("append:");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — the ack is a LEDGER FACT, not a `delete` on a Map.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 03-F5 — dismissing the band is logged", () => {
  it("emits exactly one audit.print_acknowledged when the band is acknowledged", async () => {
    const rig = kotRig();
    rig.printer.confirmed(ORDER_ID);
    await exhaust(rig.printer);

    const band = rig.printer.alarms()[0];
    expect(band, "03-F5's S1 must exist before it can be acknowledged").toBeDefined();
    // The pre-state is the assertion that makes the post-state mean something: BEFORE the tap
    // there is no ack, so a producer that emitted on `raise` would fail here rather than pass by
    // arriving early.
    expect(acksIn(rig.appended)).toHaveLength(0);

    rig.printer.acknowledge(band?.id as string);

    expect(acksIn(rig.appended)).toHaveLength(1);
    // `03-F5`: "repeating until acknowledged" — the band goes, and it is the same act.
    expect(rig.printer.alarms()).toHaveLength(0);
  });

  it("carries the interpreted extras — alarm_id, order_id, printer_name — and NOTHING else", async () => {
    const rig = kotRig();
    rig.printer.confirmed(ORDER_ID);
    await exhaust(rig.printer);
    const band = rig.printer.alarms()[0];
    rig.printer.acknowledge(band?.id as string);

    const ack = acksIn(rig.appended)[0];
    // An EXACT key set, not a subset check, and that is what makes this a credential guard as
    // well as a shape one: `01-F1` has no redaction path, so the assertion that matters is that
    // nothing NEW can appear in this payload without failing here. A `pin`, a `pin_hash` or a
    // spread of some richer record all break this line.
    expect(Object.keys(ack?.payload ?? {}).sort()).toEqual([
      "alarm_id",
      "order_id",
      "printer_name",
    ]);
    // `03-F2` fans one confirm out to N station tickets, so the job id is the finest handle that
    // exists and `order_id` alone cannot say which chit was lost.
    expect(ack?.payload.alarm_id).toBe(`${ORDER_ID}::GRILL`);
    expect(ack?.payload.order_id).toBe(ORDER_ID);
    expect(ack?.payload.printer_name).toBe("TH230");
    // `01-F5`: the chain is STORE-OWNED and "a caller-supplied value is rejected" — an append
    // carrying one is a loud refusal with nothing persisted, i.e. no ack at all.
    expect(ack?.payload).not.toHaveProperty("prev_audit_hash");
  });

  it("records nothing for a band this device does not hold, and nothing twice", async () => {
    const rig = kotRig();
    rig.printer.confirmed(ORDER_ID);
    await exhaust(rig.printer);
    const band = rig.printer.alarms()[0];

    // The IPC handler calls BOTH printers' `acknowledge` for one tap, so an unconditional emit
    // would write a second, permanent record about a band that never existed (`01-F1`).
    rig.printer.acknowledge("cash::shift_close_slip::something-else");
    expect(acksIn(rig.appended)).toHaveLength(0);

    rig.printer.acknowledge(band?.id as string);
    rig.printer.acknowledge(band?.id as string);
    expect(acksIn(rig.appended), "one dismissal is one record").toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — `01-F17`: the ledger write must never cost the operator the act.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 01-F17 — a failed audit append blocks nothing", () => {
  it("clears the repeating band even when the append throws", async () => {
    const rig = kotRig({ appendThrows: true });
    rig.printer.confirmed(ORDER_ID);
    await exhaust(rig.printer);
    const band = rig.printer.alarms()[0];
    expect(band).toBeDefined();

    // `03-F5`'s alert is "full-screen banner + repeating sound … until acknowledged". An ack that
    // only cleared it if the ledger cooperated would leave that on a counter mid-service.
    expect(() => rig.printer.acknowledge(band?.id as string)).not.toThrow();
    expect(rig.printer.alarms()).toHaveLength(0);
    // It was ATTEMPTED — the swallow is about the outcome, not about skipping the write.
    expect(acksIn(rig.appended)).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — the cash printer's band. S-7 put shift slips and day summaries on `03-F5`'s band, and one
// tap on one IPC channel dismisses either — so the record must not depend on which owned it.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D S-7 — the cash-slip band's ack is recorded too", () => {
  const cashRig = () => {
    const spooler = createSpooler({ transport: deadTransport() });
    const appended: Appended[] = [];
    const printer = createCashPrinter({
      spooler,
      store: {
        openOrders: () => [],
        shifts: () => [
          {
            shift_id: SHIFT_ID,
            cashier: "u-1",
            open_at: CONFIRM_AT,
            expected_json: "{}",
            paid_out_paisa: 0,
            no_sale_count: 0,
            closed: 1,
            counted_cash_paisa: 100,
            expected_at_close_json: JSON.stringify({ cash: 100 }),
            variance_paisa: 0,
          },
        ],
        days: () => [],
        unboundDrawer: () => ({ no_sale_count: 0, paid_out_paisa: 0, exceptions_json: "[]" }),
      } as unknown as Pick<DeviceStore, "openOrders" | "shifts" | "days" | "unboundDrawer">,
      capability: printerCapability("TH230"),
      pump: async () => {},
      append: (type, payload) => appended.push({ type, payload }),
    });
    return { printer, appended, spooler };
  };

  it("emits the ack with NO order_id — the subject is a shift, and a lie is permanent", async () => {
    const rig = cashRig();
    rig.printer.shiftClosed(SHIFT_ID);
    for (let i = 0; i < MAX_TRANSMIT_ATTEMPTS; i += 1) await rig.spooler.pump();
    rig.printer.reconcile();

    const band = rig.printer.alarms()[0];
    expect(band, "a failed cash slip raises 03-F5's band too").toBeDefined();
    rig.printer.acknowledge(band?.id as string);

    const ack = acksIn(rig.appended)[0];
    expect(ack).toBeDefined();
    // `CASH_JOB_PREFIX`'s own argument, applied to the ack: this job's subject is a shift id, and
    // writing one into a field called `order_id` is a permanent falsehood in a ledger `01-F1`
    // forbids correcting in place. `alarm_id` still says which document it was.
    expect(Object.keys(ack?.payload ?? {}).sort()).toEqual(["alarm_id", "printer_name"]);
    expect(ack?.payload.alarm_id).toBe(`cash::shift_close_slip::${SHIFT_ID}`);
  });

  it("emits nothing at all when this printer does not hold the band", () => {
    const rig = cashRig();
    rig.printer.acknowledge(`${ORDER_ID}::GRILL`);
    expect(acksIn(rig.appended)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — the event is `01-F5`'s, not one this app invented (Commandment 2), and a REAL store
// accepts it and CHAINS it. This is the section that cannot pass vacuously: it appends through
// `sync-client` and reads the hash chain back.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§E 01-F5/Commandment 2 — the subtype exists and the chain is store-owned", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  // ⚠ RE-TRANSCRIBED August 2026, from SIX to SEVEN. `01-F5` gained `audit.alarm_acknowledged`
  // for `05-F2`'s manager alarm ack (`05-F30`); this file's subject, `audit.print_acknowledged`,
  // is unchanged and is still `03-F5`'s till band. The count is a transcription of the FR, so it
  // moves when the FR moves — AGENTS.md: "when a ruling lands, grep the suites that encode the
  // old rule the same day", because a green test defending an overruled rule fails the CORRECT
  // implementation. The `toContain` above is the assertion about this file's own subject and is
  // untouched.
  it("is one of the seven declared audit subtypes — no event type is invented here", () => {
    expect(AUDIT_EVENT_TYPES).toContain(ACK);
    expect(AUDIT_EVENT_TYPES, "01-F5 says SEVEN").toHaveLength(7);
  });

  it("a real device store accepts the emitted payload and stamps the chain link", () => {
    const dir = mkdtempSync(join(tmpdir(), "restos-ack-"));
    dirs.push(dir);
    const identity = {
      org_id: "00000000-0000-7000-8000-000000000001",
      branch_id: "00000000-0000-7000-8000-000000000002",
      device_id: "00000000-0000-7000-8000-000000000003",
    };
    const store = openStore({ path: join(dir, "device.db"), identity });
    try {
      // Nothing has been audited yet, so `prev_audit_hash` must come out NULL (01-F5: "null only
      // for a device's first audit event") — which also proves the value is the store's and not
      // something this payload smuggled in.
      expect(store.auditChainHead()).toBeNull();

      // The payload the implementation emits, appended the way `gateway.append` appends it.
      const envelope = store.append({
        id: "0199dddd-0000-7000-8000-000000000009",
        org_id: identity.org_id,
        branch_id: identity.branch_id,
        device_id: identity.device_id,
        // `02-F41` — WHO comes from the envelope, which is the only field `01-F5` needs beyond
        // the chain link. This is the fact the FR's accountability argument rests on.
        actor_user_id: "u-cashier",
        device_created_at: CONFIRM_AT,
        type: ACK,
        schema_version: 1,
        payload: { alarm_id: `${ORDER_ID}::GRILL`, order_id: ORDER_ID, printer_name: "TH230" },
        refs: [],
      });

      const stored = store
        .readAllEvents()
        .find((e) => (e as { id: string }).id === envelope.id) as unknown as {
        actor_user_id: string | null;
        payload: Record<string, unknown>;
      };
      expect(stored.actor_user_id).toBe("u-cashier");
      // STORE-OWNED (01-F5). The emitter supplied none and the store put one in — `null` here,
      // because this is the device's first audit event.
      expect(stored.payload).toHaveProperty("prev_audit_hash", null);
      // The additive extras survive: `01-F5`'s schema is a `looseObject`, which is what makes
      // them legal at all.
      expect(stored.payload.order_id).toBe(ORDER_ID);
      // The chain moved, so a second dismissal will link to this one — which is the whole
      // detectability argument for putting the ack in this family.
      expect(store.auditChainHead()?.event_id).toBe(envelope.id);
    } finally {
      store.close();
    }
  });
});
