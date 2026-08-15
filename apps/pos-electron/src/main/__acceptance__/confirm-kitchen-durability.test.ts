// ACCEPTANCE TESTS — `02-F55`: whether the kitchen has this order's lines is a DURABLE fact, and
// the host is the one that has to say so.
//
// PROVENANCE (`24 §3` step 2): **authored by a session that implemented none of it.** No
// implementation of the producer exists to have been read, because there is none — that is the
// defect. `main/gateway.ts`, `main/printing.ts` and `renderer/Counter.tsx` as they stand today WERE
// read, because this file is written about a measured defect in them and a suite that cannot
// describe the defect cannot tell a fix from a rewrite. Nothing outside `__acceptance__/` was
// changed to make any assertion below pass; every one in §B, §C and §E is RED on purpose.
//
// ── THE DEFECT, AS MEASURED ON THE RUNNING TILL (second dress rehearsal, August 2026) ────────
//
// **11 `order.confirmed` rows for 6 orders**, all permanent (`01-F1`). The guard is
// `Counter.tsx:615`'s `lastSent` — ONE slot of React state — and its intended durable sibling
// `kitchenOf` (`Counter.tsx:199`) reads `OpenOrder.kitchen`, a field **no producer anywhere
// supplies**, so it degrades to `"none"` for ever and the guard is the single slot alone. It was
// defeated three ways, each reproduced by hand:
//
//   (i)   switch between two open orders and back — one slot holds one order;
//   (ii)  a shift handover — a new session re-mounts the tree;
//   (iii) an app restart — React state does not survive a process.
//
// The first blocker was REPORTED FIXED after `confirm-idempotence.dom.test.tsx` went green. That
// file is a good suite and it is not at fault: it stubs the bridge, so it asserts what the SCREEN
// does when the host tells it the truth, and stays green against a host that never says anything.
// This file is the other half — the host — and it is the wave's named defect (`AGENTS.md`: a
// correct subsystem with no seam to the product) in the shape that keeps surviving: **the correct
// component was on the screen and nothing fed it.**
//
// ── THE SPEC TEXT THIS FILE IS WRITTEN FROM, quoted so an assertion can be argued with ───────
//
//   02-F55  "The surface distinguishes THREE states … (i) nothing to send; (ii) the kitchen has
//           not been told; (iii) the kitchen has it and owes nothing."
//   02-F55  "The separating fact is 'lines this device has not yet committed to paper for this
//           order', and it is projected by MAIN … The renderer may not re-derive it: a renderer
//           flag is defeated by a relaunch and by `02-F11`'s second terminal … It crosses
//           `18 §9`'s bridge as a projected field on the open-order row beside `confirmed_at`."
//   02-F55  "In state (iii) no second `order.confirmed` is originated."
//   02-F55  "In state (ii) the press must still reach the kitchen, and `03-F55`'s addendum
//           mechanism is UNTOUCHED … what this FR forbids is the second EVENT in the state where
//           nothing is owed, never the second CHIT."
//   02-F9   "idempotent — at most one confirm per order id; KOT jobs created exactly once."
//   03-F55  "committed" means A JOB EXISTS; "the device's record of what it has committed is the
//           durable spool (`03-F4`), and it must survive the power cut that FR is written about.
//           A record held only in the process is defeated by a relaunch."
//   03-F55  a station reached for the FIRST time by an addition gets an ordinary KOT, not an
//           addendum; where a station has nothing uncommitted, NOTHING is created.
//   03-F4   the spool is durable — "a crash or power loss … never drops it".
//   02-F13  a settlement splits across methods, so money arriving does not end the order.
//   01-F1   append-only: three confirms for one order are three permanent rows, uncorrectable.
//   01-F17  a sale is never blocked; `01-F54` degrade to what you know, never drop.
//
// ── WHAT THIS FILE PINS THAT THE FRs DO NOT — declared, not discovered (`24 §3b`) ────────────
//
// If the implementer needs any of these different, that is a **FINDING to report to this test
// session**, not an edit to this file.
//
//  1. **The field is `OpenOrder.kitchen`, valued `"none" | "sent" | "owed"`.** Not invented here:
//     `renderer/Counter.tsx:173`/`:199` already declares and reads exactly this, and the committed
//     `confirm-idempotence.dom.test.tsx` already pins it. `02-F55` fixes the three states and puts
//     the field on the open-order row; a SECOND vocabulary for one fact would fork the contract
//     between the two halves of the same fix, which is how this defect got here.
//  2. **The producer lives inside the bridge — `createGateway` — and derives the fact from durable
//     state this fixture hands it.** `02-F55` says the field crosses `18 §9`'s bridge on the
//     open-order row and `gateway.ts`'s own header calls itself "the only place that touches the
//     store". WHICH durable source is deliberately NOT pinned: the fixture supplies the real
//     device store (a fold-derived field passes through `openOrders()`) AND the real spooler AND
//     the real KOT printer (a main-process projection off `03-F4`'s spool reads either), so both
//     mechanisms `02-F55` leaves open are served. Any dep the gateway asks for that this fixture
//     does not hold raises a NAMED error rather than degrading — see `depsOver`.
//  3. **Nothing about wording, colour or which control changes.** `00 §5.6` binds the words and
//     `27-F4` binds the geometry; `confirm-idempotence.dom.test.tsx` owns the glass. This file
//     asserts only the FACT the glass is entitled to read.
//
// ── EVERY SECTION IS AIMED AT A PLAUSIBLE WRONG IMPLEMENTATION (the round-3 law) ─────────────
//
//   §A  CONTROLS. The confirm still reaches paper, and the DURABLE half already works — so a red
//       in §B is attributable to the missing projection and not to a spool that forgot.
//   §B  **THE DANGEROUS CASE: the fact must survive.** §B3 is the restart, §B4 is two open orders
//       (the single-slot defeat), §B5 is the shift handover. An implementation that re-derives in
//       the renderer, or caches per mount, passes nothing here.
//   §C  **THE ADDENDUM.** A guard keyed on `order_id` alone re-opens the lost-lines defect
//       `03-F55` was written about. §C points straight at it: after a restart, a NEW line must
//       move the order back to `owed` and the press must reach the kitchen.
//   §D  the resting states — nothing rung, and rung but never confirmed.
//   §E  `confirmed_at` is NOT this field. The tempting shortcut (it already crosses the bridge)
//       passes every idempotence case and silently loses the naan.
//
// ── MUTATION MATRIX (the round-3 law: report the numbers, do not claim the tests bite) ───────
//
// Run OUT OF TREE — a scratchpad copy of this app with `node_modules` symlinked — because this
// session authored the tests and edits no implementation. The **CONTROL is a plausible fix in
// three branches**: `KotPrinter` gains a `kitchenFor(order_id)` projection computed from
// `spooler.jobs()`'s `03-F55` coverage; `GatewayDeps` gains the printer; `openOrders()` projects
// the field and `OpenOrderSchema` declares it. Each mutant is exactly one branch off that control,
// and both new suites (17 + 13 = 30 assertions) ran every time.
//
//   CONTROL (a plausible fix)                                   30/30 PASS   killed: none
//   S2  the gateway projection dropped — THE SEAM               20/30        killed: 10 (all of §B, §C1/§C3/§C4, §E)
//   S3  keyed on the ORDER alone — "it has a confirm ⇒ sent"    26/30        killed: §C1 §C3 §E1 §E2
//   S4  a single slot in MAIN — the measured defect one plane over  21/30    killed: §B3–§B6, §C1 §C3 §C4, §E1 §E2
//   S6a the resend band re-raised at launch (a DIFFERENT fix)   30/30 PASS   killed: none
//   S8  NEGATIVE CONTROL — a real refactor of `kitchenFor`      30/30 PASS   killed: none
//
// **CONTROL 30/30 is the number that matters most**: a correct implementation is not blocked by
// anything here, which is the other half of `24 §3`'s law. **S8 is what makes every red row mean
// anything** — a genuine one-branch restructuring of the very function under test reddens nothing.
// **S3 against S4 is the attribution**: they kill overlapping-but-different sets, so "the fact is
// per ORDER's uncommitted lines" and "the fact is DURABLE" are two properties and neither
// assertion group subsumes the other. **S6a is the evidence for pin 2's other half** — an
// implementation that solves the sibling blocker by re-raising bands at launch passes this file
// untouched, so nothing here forces one shape of the other fix.
//
// Measured in-tree at authoring time: **10 of 17 RED**, and `pnpm -C apps/pos-electron exec vitest
// run src/main/__acceptance__` is `859 tests, 15 failed` — every failure in this file and its
// sibling, no pre-existing test disturbed.
//
// ⚠ **NO PRINTER HAS EVER BEEN ATTACHED** (K-8 owed in full). Every "restart" below is `close()`
// and a second open over the same directory, and every "chit" is bytes handed to an object.
// Nothing here is evidence about paper, about a cook, or about a real plug-pull.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveAging } from "@restos/device-config";
import {
  createSpooler,
  MAX_TRANSMIT_ATTEMPTS,
  type PaperStatus,
  printerCapability,
  type Spooler,
} from "@restos/escpos";
import { type DeviceStore, openStore } from "@restos/sync-client";
import { afterEach, describe, expect, it } from "vitest";
import { createGateway, type Gateway, type GatewayDeps } from "../gateway";
import { type OpenJobStore, openJobStore } from "../job-store";
import { createKotPrinter, type KotPrinter } from "../printing";

const IDENTITY = { org_id: "org-1", branch_id: "br-1", device_id: "dev-1" } as const;

const KARAHI = "i-karahi";
const TIKKA = "i-tikka";
const NAAN = "i-naan";

/** Two stations, so `03-F2`'s fan-out is real and §C can add a line to a station that has one. */
const STATIONS: Record<string, string> = { [KARAHI]: "GRILL", [TIKKA]: "GRILL", [NAAN]: "TANDOOR" };
const NAMES: Record<string, string> = {
  [KARAHI]: "Chicken Karahi",
  [TIKKA]: "Chicken Tikka",
  [NAAN]: "Garlic Naan",
};
const PRICES: Record<string, number> = { [KARAHI]: 45_000, [TIKKA]: 52_000, [NAAN]: 5_000 };

const PAPER_IN: PaperStatus = { paper_out: false, near_end: "unsupported" };

/**
 * `02-F55`'s three states, as `renderer/Counter.tsx:173` already declares them. See pin 1.
 */
type KitchenState = "none" | "sent" | "owed";

/**
 * The state as the RENDERER would read it — `Counter.tsx:199` verbatim, including its degrade.
 *
 * Written as the shipped reader rather than as a bare property access so that a host supplying
 * nothing produces `"none"` here exactly as it does on the glass: the assertions below then fail
 * on the STATE the cashier would have seen, not on `undefined`, and the failure message says what
 * she would have been able to do about it.
 */
const kitchenOf = (row: unknown): KitchenState =>
  (row as { readonly kitchen?: KitchenState }).kitchen ?? "none";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/**
 * One process's worth of till, over a directory that outlives it.
 *
 * REAL device store, REAL `03-F4` job store, REAL spooler, REAL KOT printer, REAL gateway. Nothing
 * about the kitchen fact is computed by this fixture — every answer below is read back out of the
 * product's own objects, because a fixture that computed it would bless an implementation that
 * computed nothing (`orders-seam.test.ts` states the same rule one seam over).
 */
type Till = {
  readonly store: DeviceStore;
  readonly jobs: OpenJobStore;
  readonly spooler: Spooler;
  readonly kot: KotPrinter;
  readonly gateway: Gateway;
  /** Every document the transport was handed by THIS process. */
  readonly sent: Uint8Array[];
  /** Ledger events of one type, read back from the real store. */
  readonly events: (type: string) => readonly { payload: Record<string, unknown> }[];
  /** The open-order row the bridge would hand the renderer. */
  readonly row: (order_id: string) => unknown;
  readonly kitchen: (order_id: string) => KitchenState;
  /** `main/index.ts`'s `CHANNELS.append` branch: the ledger first, then the kitchen handoff. */
  readonly sendToKitchen: (order_id: string) => void;
  readonly close: () => void;
};

/** Whoever's PIN is in (`02-F41`), mutable so §B5 can hand the till over mid-shift. */
type Session = { user_id: string; display_name: string };

/**
 * The gateway's deps, over the real objects — and a Proxy that REFUSES to answer a question this
 * fixture was not built to answer.
 *
 * Pin 2 leaves the producer's input open on purpose, so the fixture supplies all three durable
 * sources a producer could plausibly read (`store`, `spooler`, `kot`). If the implementation
 * reaches for a fourth, the gateway gets a named error here instead of `undefined` — which would
 * otherwise degrade to `"none"` and red §B with a message about a missing kitchen state rather
 * than about a missing dependency. Symbols pass through untouched: vitest, Zod and `structured
 * clone` all probe them, and a fixture that threw on `Symbol.toPrimitive` would fail for reasons
 * that have nothing to do with `02-F55`.
 */
const depsOver = (base: Record<string, unknown>): GatewayDeps =>
  new Proxy(base, {
    get: (target, prop) => {
      if (typeof prop === "symbol" || prop in target) return Reflect.get(target, prop);
      throw new Error(
        `GatewayDeps.${prop} — this fixture does not supply it. It hands the gateway the REAL ` +
          `device store, spooler and KOT printer (see pin 2 in this file's header), which are the ` +
          `two durable sources 02-F55 leaves open. If the producer needs a different input, that ` +
          `is a FINDING for the test-authoring session, not an edit to this file.`,
      );
    },
  }) as unknown as GatewayDeps;

const openTill = (dir: string, session: () => Session): Till => {
  const store = openStore({ path: join(dir, "device.db"), identity: IDENTITY });
  const jobs = openJobStore({ path: join(dir, "print-jobs.db") });
  const sent: Uint8Array[] = [];
  const spooler = createSpooler({
    transport: {
      send: async (document: Uint8Array) => {
        sent.push(document);
        await Promise.resolve();
        return { ok: true } as const;
      },
      status: async () => PAPER_IN,
    },
    store: jobs,
  });
  /**
   * The printer's ledger seam, deferred through a holder because the two objects are mutually
   * dependent exactly as they are in `main/index.ts`: the printer appends through the bridge
   * (`03-F5`'s `kot.print_failed`, `02-F31`'s `kot.printed`) and the bridge is handed the printer
   * so pin 2's "projection off the durable spool" mechanism has something to read. The shipped
   * host resolves the same cycle by constructing the gateway first and the printer 490 lines
   * later; a fixture cannot, and a holder is the smallest honest stand-in.
   */
  let bridge: Gateway | undefined;
  const kot = createKotPrinter({
    spooler,
    store,
    catalog: (id) => (NAMES[id] === undefined ? null : { name: NAMES[id] as string }),
    station: (id) => STATIONS[id] ?? "kitchen",
    capability: printerCapability("TH230"),
    append: (type, payload) => {
      bridge?.append({ type, payload, refs: [] });
    },
  });
  const gateway = createGateway(
    depsOver({
      store,
      spooler,
      kot,
      catalog: (id: string) => (NAMES[id] === undefined ? null : { name: NAMES[id] as string }),
      menu: () => Object.keys(NAMES).map((id) => ({ id, name: NAMES[id] as string })),
      priceOf: (id: string) => PRICES[id] ?? null,
      actor: "dev",
      session,
      deviceLabel: "Counter 1",
      training: false,
      reachability: () => ({ lan: "down", hub: "down", cloud: "down" }),
      blockedCursor: () => null,
      catalogRefusal: () => null,
      businessDay: () => "2026-08-15",
      panelPpi: () => 100.5,
      aging: resolveAging(undefined).thresholdsFor,
      panelFit: () => null,
    }),
  );
  bridge = gateway;
  const row = (order_id: string): unknown =>
    gateway.openOrders().find((r) => r.order_id === order_id);
  return {
    store,
    jobs,
    spooler,
    kot,
    gateway,
    sent,
    events: (type) =>
      store.readAllEvents().filter((e) => e.type === type) as unknown as readonly {
        payload: Record<string, unknown>;
      }[],
    row,
    kitchen: (order_id) => kitchenOf(row(order_id)),
    /**
     * The press, wired the way `main/index.ts`'s `CHANNELS.append` handler wires it: the ledger
     * append first (`01-F2` — persisted before the UI is told), then the kitchen handoff, which is
     * synchronous and `void` because `01-F17` forbids a sale waiting on a printer.
     *
     * The RENDERER's guard is deliberately not modelled. This file is about what the host knows;
     * `confirm-idempotence.dom.test.tsx` owns what the screen does with it, and re-implementing
     * its guard here would be this suite grading its own copy (`K-3`'s dead-oracle defect).
     */
    sendToKitchen: (order_id) => {
      gateway.append({ type: "order.confirmed", payload: { order_id }, refs: [] });
      kot.confirmed(order_id);
    },
    close: () => {
      store.close();
      jobs.close();
    },
  };
};

/** Drive every live job to a terminal state — `03-F4`'s whole budget, as the host's interval does. */
const settle = async (till: Till): Promise<void> => {
  for (let i = 0; i < MAX_TRANSMIT_ATTEMPTS; i += 1) await till.kot.pump();
};

/**
 * A directory that outlives its process, and the power cut.
 *
 * `restart()` closes BOTH SQLite handles and opens both files again — which is the strongest
 * statement this suite can make without launching Electron, and is the same instrument
 * `spooler-job-store.test.ts` uses for `03-F4`'s crash clause. What it is not: a plug-pull, a
 * torn write, or WAL recovery. Those are `00 §5.2`'s physical pass and are owed in full.
 */
const bench = () => {
  const dir = mkdtempSync(join(tmpdir(), "restos-confirm-durable-"));
  dirs.push(dir);
  let session: Session = { user_id: "u-ayesha", display_name: "Ayesha" };
  let till = openTill(dir, () => session);
  return {
    till: () => till,
    handOverTo: (next: Session) => {
      session = next;
    },
    restart: () => {
      till.close();
      till = openTill(dir, () => session);
      return till;
    },
  };
};

const ORDER_A = "0199aaaa-0000-7000-8000-0000000000a1";
const ORDER_B = "0199aaaa-0000-7000-8000-0000000000b2";

/** Ring an order with one karahi (GRILL). Returns nothing; every read goes through the gateway. */
const ring = (till: Till, order_id: string, items: readonly string[]): void => {
  till.gateway.append({
    type: "order.created",
    payload: { order_id, channel: "counter", order_type: "dine_in" },
    refs: [],
  });
  for (const item of items) till.gateway.addLine({ order_id, item_id: item, qty: 1 });
};

const decode = (bytes: Uint8Array): string =>
  [...bytes].map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : " ")).join("");

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — CONTROLS. Nothing here is a claim about the defect; these are what make §B attributable.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A CONTROL — the press reaches paper, and the DURABLE half already works", () => {
  it("§A1 03-F2/03-F55 — one press, one chit, carrying the line that was rung", async () => {
    const b = bench();
    ring(b.till(), ORDER_A, [KARAHI]);
    b.till().sendToKitchen(ORDER_A);
    await settle(b.till());

    expect(b.till().sent).toHaveLength(1);
    expect(decode(b.till().sent[0] as Uint8Array)).toContain("Chicken Karahi");
  });

  it("§A2 03-F55 — a second press with nothing new creates NO second chit", async () => {
    // In-process, the case that already works. If this ever reddens, the spool's coverage record
    // has broken and every verdict in §B and §C is about something else.
    const b = bench();
    ring(b.till(), ORDER_A, [KARAHI]);
    b.till().sendToKitchen(ORDER_A);
    await settle(b.till());
    b.till().sendToKitchen(ORDER_A);
    await settle(b.till());

    expect(b.till().sent).toHaveLength(1);
    expect(b.till().spooler.jobs()).toHaveLength(1);
  });

  it("§A3 03-F4/03-F55 — the COVERAGE survives a restart, so the fact exists to be projected", async () => {
    // THE CONTROL THAT MATTERS MOST. `03-F55` already made "which lines this device committed"
    // durable; the second blocker is that nothing tells the operator. This proves the durable
    // record is intact across the restart, so a red in §B3 is a missing PROJECTION and cannot be
    // waved off as a spool that forgot.
    const b = bench();
    ring(b.till(), ORDER_A, [KARAHI]);
    b.till().sendToKitchen(ORDER_A);
    await settle(b.till());

    const after = b.restart();
    expect(after.spooler.jobs()).toHaveLength(1);
    after.sendToKitchen(ORDER_A);
    await settle(after);
    // Nothing new was rung, so the second process must print nothing at all: "no bytes, no spooled
    // job, no attempt, no retry budget, no band, no `kot.print_failed`" (`03-F55`).
    expect(after.sent).toHaveLength(0);
    expect(after.spooler.jobs()).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — THE DANGEROUS CASE. The three defeats measured on the running till, plus the resting one.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 02-F55 — the host says whether the kitchen has this order, and keeps saying it", () => {
  it("§B1 — before the press, the kitchen has NOT been told", () => {
    const b = bench();
    ring(b.till(), ORDER_A, [KARAHI]);
    // State (ii). Anything but `"sent"` is correct here; the assertion is that the press is not
    // refused, which `02-F55` puts as "nothing is refused that has anything to send".
    expect(b.till().kitchen(ORDER_A)).not.toBe("sent");
  });

  it("§B2 — after the press and the chit, the host says the kitchen HAS it", async () => {
    const b = bench();
    ring(b.till(), ORDER_A, [KARAHI]);
    b.till().sendToKitchen(ORDER_A);
    await settle(b.till());

    expect(
      b.till().kitchen(ORDER_A),
      "02-F55 state (iii): the chit is on the spool and the bridge still hands the renderer no " +
        "way to know it. This is the field `Counter.tsx:199` reads and nothing produces.",
    ).toBe("sent");
  });

  it("§B3 (iii) 02-F55/03-F55 — THE RESTART. The fact is still there in the next process", async () => {
    // The measured defeat, and the bar this fix is held to: not "the test goes green" but "the
    // guard still holds after the app restarts". A React slot cannot pass this and neither can a
    // main-process cache built at construction — only a value derived from what is on disk.
    const b = bench();
    ring(b.till(), ORDER_A, [KARAHI]);
    b.till().sendToKitchen(ORDER_A);
    await settle(b.till());
    expect(b.till().kitchen(ORDER_A)).toBe("sent");

    const after = b.restart();
    expect(
      after.kitchen(ORDER_A),
      "02-F55: a relaunched till reports an order whose ticket is on `03-F4`'s durable spool as " +
        "one the kitchen has never been told about — so the cashier presses again and 01-F1 keeps " +
        "the second row for ever.",
    ).toBe("sent");
  });

  it("§B4 (i) 02-F11/02-F55 — TWO open orders, each with its OWN answer", async () => {
    // The single-slot defeat, stated as a property rather than as a sequence of taps: `lastSent`
    // holds one order, so sending A and then B forgets A. A host fact is per ORDER, and this is
    // the assertion that a one-slot fix — anywhere, in either process — cannot satisfy.
    const b = bench();
    ring(b.till(), ORDER_A, [KARAHI]);
    ring(b.till(), ORDER_B, [TIKKA]);

    b.till().sendToKitchen(ORDER_A);
    await settle(b.till());
    expect(b.till().kitchen(ORDER_A)).toBe("sent");
    // B has been rung and never sent — the control that stops a blanket "everything is sent".
    expect(b.till().kitchen(ORDER_B)).not.toBe("sent");

    b.till().sendToKitchen(ORDER_B);
    await settle(b.till());
    expect(b.till().kitchen(ORDER_B)).toBe("sent");
    expect(
      b.till().kitchen(ORDER_A),
      "02-F55: sending a SECOND order made the first one look unsent again — one slot, two orders",
    ).toBe("sent");
  });

  it("§B5 (ii) 02-F41/02-F55 — a shift handover does not un-send the kitchen's ticket", async () => {
    // `02-F54` ends a session in one control and `02-F41` makes attribution whoever's PIN is in,
    // so a handover is an ordinary mid-service event, not an exotic one. What the KITCHEN holds is
    // a fact about the branch (`02-F11`), not about who is signed in — an implementation that
    // keyed the fact to the session would hand the arriving cashier a ticket to send again.
    const b = bench();
    ring(b.till(), ORDER_A, [KARAHI]);
    b.till().sendToKitchen(ORDER_A);
    await settle(b.till());

    b.handOverTo({ user_id: "u-hina", display_name: "Hina" });
    expect(b.till().kitchen(ORDER_A)).toBe("sent");
    // …and across the restart that a handover at close of shift usually comes with.
    expect(b.restart().kitchen(ORDER_A)).toBe("sent");
  });

  it("§B6 02-F13/02-F55 — a PARTIAL settlement does not change what the kitchen holds", async () => {
    // `02-F13` splits a bill across methods and `02-F51` keeps the cart until the money side
    // CLOSES, so a half-tendered order is still open and still on the glass. Money and paper are
    // different facts; an implementation that read "settled" as "sent" would answer the wrong
    // question, and would answer it wrongly in the direction that swallows a press.
    const b = bench();
    ring(b.till(), ORDER_A, [KARAHI]);
    b.till().sendToKitchen(ORDER_A);
    await settle(b.till());
    b.till().gateway.append({
      type: "payment.recorded",
      payload: {
        order_id: ORDER_A,
        amount_paisa: 20_000,
        method: "cash",
        // `01-F31`'s idempotency key — required, and a partial tender is a genuine attempt.
        settlement_attempt_id: "0199aaaa-0000-7000-8000-0000000000f1",
        // `DEC-MONEY-007` — this money is against the bill, not a khata repayment.
        purpose: "settles_order",
        shift_id: null,
      },
      refs: [],
    });

    expect(b.till().kitchen(ORDER_A)).toBe("sent");
    expect(b.restart().kitchen(ORDER_A)).toBe("sent");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — THE ADDENDUM. The assertion pointed straight at a guard keyed on `order_id` alone.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 03-F55/02-F55 — a line added after the confirm still reaches the kitchen", () => {
  it("§C1 — a NEW line after a restart moves the order back to OWED", async () => {
    // **THE ANTI-FIX ASSERTION.** The cheapest durable guard is "this order has an
    // `order.confirmed`, so refuse" — it passes every idempotence case in §B, survives every
    // restart, and re-opens the exact silent loss `03-F55` was written about: the naan is on the
    // bill (`01-F53`) and nobody in the kitchen has been told.
    const b = bench();
    ring(b.till(), ORDER_A, [KARAHI]);
    b.till().sendToKitchen(ORDER_A);
    await settle(b.till());

    const after = b.restart();
    expect(after.kitchen(ORDER_A)).toBe("sent");
    after.gateway.addLine({ order_id: ORDER_A, item_id: NAAN, qty: 1 });

    expect(
      after.kitchen(ORDER_A),
      "02-F55/03-F55: an order owing the kitchen a chit reads as owing it nothing — the state " +
        "that swallows the press and loses the dish",
    ).toBe("owed");
  });

  it("§C2 — and the press is NOT swallowed: the new line reaches paper on its own chit", async () => {
    // `02-F55`: "what this FR forbids is the second EVENT in the state where nothing is owed,
    // never the second CHIT. One is a permanent false record and the other is a dish somebody is
    // waiting for." So the OUTCOME, not the event count: bytes crossed the transport.
    const b = bench();
    ring(b.till(), ORDER_A, [KARAHI]);
    b.till().sendToKitchen(ORDER_A);
    await settle(b.till());

    const after = b.restart();
    after.gateway.addLine({ order_id: ORDER_A, item_id: NAAN, qty: 1 });
    after.sendToKitchen(ORDER_A);
    await settle(after);

    expect(after.sent).toHaveLength(1);
    const chit = decode(after.sent[0] as Uint8Array);
    expect(chit).toContain("Garlic Naan");
    // The lines already on paper are never cooked twice (`03-F55`) — and the naan is a TANDOOR
    // line, so this is also `03-F55`'s "a station reached for the first time by an addition".
    expect(chit).not.toContain("Chicken Karahi");
  });

  it("§C3 — the SAME station's addition also reaches paper, and reads OWED first", async () => {
    // The naan opens a new station; a tikka does not. A guard that special-cased "an untouched
    // station" would pass §C2 and still swallow the ordinary case — one more karahi at the grill.
    const b = bench();
    ring(b.till(), ORDER_A, [KARAHI]);
    b.till().sendToKitchen(ORDER_A);
    await settle(b.till());

    const after = b.restart();
    after.gateway.addLine({ order_id: ORDER_A, item_id: TIKKA, qty: 1 });
    expect(after.kitchen(ORDER_A)).toBe("owed");

    after.sendToKitchen(ORDER_A);
    await settle(after);
    expect(after.sent).toHaveLength(1);
    expect(decode(after.sent[0] as Uint8Array)).toContain("Chicken Tikka");
  });

  it("§C4 — once the addendum is committed, the order reads SENT again", async () => {
    // The loop closes. Without this, an implementation could satisfy §C1 by never returning to
    // `"sent"` after the first addition — which reopens the duplicate-confirm defect for every
    // order that was ever amended.
    const b = bench();
    ring(b.till(), ORDER_A, [KARAHI]);
    b.till().sendToKitchen(ORDER_A);
    await settle(b.till());
    b.till().gateway.addLine({ order_id: ORDER_A, item_id: NAAN, qty: 1 });
    b.till().sendToKitchen(ORDER_A);
    await settle(b.till());

    expect(b.till().kitchen(ORDER_A)).toBe("sent");
    expect(b.restart().kitchen(ORDER_A)).toBe("sent");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — the resting states. `02-F55`'s (i) and (ii), so "sent" cannot be produced by a constant.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 02-F55 — the states that are NOT (iii)", () => {
  it("§D1 — an order rung and never confirmed never reads SENT, restart or not", () => {
    const b = bench();
    ring(b.till(), ORDER_A, [KARAHI, NAAN]);
    expect(b.till().kitchen(ORDER_A)).not.toBe("sent");
    expect(b.restart().kitchen(ORDER_A)).not.toBe("sent");
  });

  it("§D2 01-F17/02-F55 — an order with no lines at all is not reported as sent", () => {
    // An empty order has committed nothing, so it cannot be in state (iii). Aimed at the shape
    // "no station owes anything ⇒ sent", which is true of an order that has never been rung and
    // would grey the control on a fresh ticket — `27-F5`'s own failure mode.
    const b = bench();
    b.till().gateway.append({
      type: "order.created",
      payload: { order_id: ORDER_A, channel: "counter", order_type: "dine_in" },
      refs: [],
    });
    expect(b.till().kitchen(ORDER_A)).not.toBe("sent");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — `confirmed_at` is not this field, and the ledger is not either.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§E 03-F55 — the confirm anchor answers a different question", () => {
  it("§E1 — an order can carry a confirm anchor AND owe the kitchen a chit", async () => {
    // `03-F55`'s whole finding, as one row. `confirmed_at` already crosses the bridge, which makes
    // it the tempting field to key on — and `02-F55` names it: "confirmed_at is NOT that field and
    // cannot stand in for it". Both facts are read off the SAME row, so an implementation that
    // aliased them fails here and nowhere else.
    const b = bench();
    ring(b.till(), ORDER_A, [KARAHI]);
    b.till().sendToKitchen(ORDER_A);
    await settle(b.till());
    const after = b.restart();
    after.gateway.addLine({ order_id: ORDER_A, item_id: NAAN, qty: 1 });

    const row = after.row(ORDER_A) as { confirmed_at?: number | null };
    expect(typeof row.confirmed_at).toBe("number");
    expect(after.kitchen(ORDER_A)).toBe("owed");
  });

  it("§E2 01-F1 — the ledger already holding one confirm is not the same fact as the spool", async () => {
    // A device whose own ledger holds two confirms must go on folding both (`01-F37`/`01-F17`), so
    // this asserts nothing about the row COUNT — `confirm-idempotence.dom.test.tsx` owns the
    // origination guard. What it asserts is that the two are read separately: one `order.confirmed`
    // exists and the order is nonetheless OWED, so "has a confirm event" is not the projection.
    const b = bench();
    ring(b.till(), ORDER_A, [KARAHI]);
    b.till().sendToKitchen(ORDER_A);
    await settle(b.till());
    const after = b.restart();
    after.gateway.addLine({ order_id: ORDER_A, item_id: TIKKA, qty: 1 });

    expect(after.events("order.confirmed")).toHaveLength(1);
    expect(after.kitchen(ORDER_A)).toBe("owed");
  });
});

// ── DEFERRED — what this suite could NOT assert, and who owns it ─────────────────────────────
//
// * **The RENDERER's guard, and the triple-tap.** Three presses inside one tick, before any read
//   returns, cannot be seen by a host fact — the fold has not moved between them. That is
//   `confirm-idempotence.dom.test.tsx` §B's, and this file deliberately does not model it: two
//   suites owning one guard is how the first fix came to be reported closed.
// * **The wiring in `main/index.ts`.** It builds an Electron app at module scope and no suite in
//   this package can import it (`startup-integrity.test.ts`'s header, `line-advance-seam.test.ts`
//   §A). This file drives `createGateway` directly, so it proves the BRIDGE carries the fact and
//   not that the shipped process constructs the bridge that way. The instrument that could is a
//   launched binary; `startup-integrity.test.ts` is this package's precedent for one, and a
//   `02-F55` rung of it is OWED.
// * **`02-F11`'s second terminal.** `02-F55` names it beside the relaunch, and it is unreachable:
//   `01-F15`'s LAN mesh is hosted by nothing and `01-F66` now refuses a second process on one
//   store, so two tills cannot be run at all. The property this file CAN state — that the fact is
//   on disk rather than in a process — is the same one that will serve the second terminal when
//   there is one.
// * **What the glass SAYS.** No wording, no colour, no control geometry (`00 §5.6`, `27-F4`,
//   `27-F5`). Pin 3.
// * **A spool written by the PREVIOUS version**, whose rows carry no `covers`. `printing.ts`
//   declares that unknown coverage HONOURS THE PAPER, so such an order can never leave `"sent"`
//   and an addition to it still does not print — a residual `03-F55` states and this suite would
//   have to forge a legacy row to reach. Owed to whoever writes that migration, if one is needed.
// * **K-8.** No printer has printed any of this.
