// ACCEPTANCE TESTS — `05 §8`'s FULL BRANCH SLICE: the console's alarms come out of a REAL LEDGER.
//
// Authored from spec text ONLY (`24 §3` step 2; read-only to the implementing session). No
// implementation of the wiring was read; none exists in this tree. What DOES exist and is quoted
// here as the thing being replaced is `home.ts`'s current `branchSnapshot()`, which returns
// `reachable: false` unconditionally and is honest about being a measurement rather than a stub.
//
//   `05 §8`  — "Same `packages/sync-client`; **the manager device holds a normal full branch
//              slice** (trusted role — doc 04's scoped-slice mechanism is not used here)."
//   `05 §5`  — "**Materialized (device):** active alarm list, pending approval queue … **No
//              console-only source-of-truth entities — everything folds from the ledger**, so a
//              reinstalled phone reconstructs its state completely (`01-F6`)."
//   `05-N5`  — "The approval queue and alarm list **survive app kill/restart without loss** —
//              they are folds over the branch stream, re-derived on start (`01-F6`)."
//   `05-F1`  — the late-order alarm "naming order, channel, table, and **age**".
//   `05-F22` — "when the branch is unreachable, the console **says so plainly** … and never
//              renders stale state as live."
//   `05-F23` — "while the branch is offline, the console shows the alarm gap honestly instead of
//              implying calm."
//   `05-F29` — RULED: this app is the manager surface, and **"the grant travels over the CLOUD
//              path, not the LAN mesh"**.
//   `01-F39` — the `manager` device class; NOT hub-eligible.
//   `01-F43` — branch time is stamped at APPEND and travels inside the event.
//   `18 §8`  — "Storage: `op-sqlite` **via `sync-client` only**"; manager stays pure-JS installable.
//
// ══ THE ONE THING THIS FILE EXISTS TO PREVENT ══════════════════════════════════════════════════
//
// A console that renders alarms from a fixture. AGENTS.md's recurring defect, on the surface where
// it would be least visible: an alarm list is *supposed* to be short and is *supposed* to change,
// so a hand-made one looks exactly like a working one, and the manager cannot tell by looking.
//
// §B is where the teeth are and none of its assertions can be satisfied by a constant:
//   · the alarm's AGE is computed from a `branch_created_at` this test chose when it appended the
//     confirm — so a hardcoded number is wrong by construction, not merely unproven;
//   · appending a SECOND late order to the same store grows the list, so an implementation
//     returning a fixed array reddens no matter what the fixture contains;
//   · the snapshot's rows are compared against `store.kitchenQueue()` / `store.openOrders()`
//     computed independently by the test, so a padded, filtered or invented row reddens.
//
// ══ WHAT THESE ASSERTIONS CAN AND CANNOT SEE — read this before quoting a green run ════════════
//
// CAN see: the real `packages/sync-client` store, the real merge fold, the real `alarmsFrom`
// derivation, and the real composition function the screen calls. §B opens a genuine SQLite
// database on disk, appends genuine kernel events through `store.append()`, and reads the alarm
// list back out of the fold. Nothing in §B is a mock.
//
// CANNOT see: **a phone.** Vitest runs under Node with the `better-sqlite3` driver, so §B proves
// the manager's *logic* over a real ledger and says nothing about whether
// `@op-engineering/op-sqlite` opens on Android. `18 §12` gives React Native one testing tool —
// Maestro on the `00 §4` office rig — and there is no rig here. It also cannot see React: this
// package has no component renderer (`apps/manager/vitest.config.ts` explains why), so *"the
// alarm is on the glass"* is not asserted anywhere in this repository. §C reads the shipped
// composition as SOURCE, which catches a wiring that was never made and cannot catch a wiring
// that was made wrongly.
//
// ⚠ AND THE HONEST ARM MUST SURVIVE. `05-F22`/`05-F23` are not a fallback to be deleted once the
// store lands — a manager at home with the branch WAN down must still be told the alarm state is
// UNKNOWN. §D is that assertion, and it must go on passing forever.
//
// ── THE MUTATION MATRIX (round-3 law) ───────────────────────────────────────────────────────────
//
// Measured against a trial implementation that took this file to 16/16, then reverted. The
// PRE-EXISTING column is the finding and it is the same number every time: **this package's 46
// existing tests catch NONE of these**, which is the state that let `branchSnapshot()` return a
// constant for as long as it has.
//
//                                                                     this file   pre-existing 46
//   M9  the snapshot returns a hand-made alarm fixture ............... 5 killed        0
//   M10 the snapshot is unconditionally unreachable (SHIPPED TODAY) .. 8 killed        0
//   M11 the age uses the device clock, not the store's offset ........ 1 killed        0
//   M12 the branch slice is read once and cached ..................... 4 killed        0
//   M13 nothing syncs the store (no cloud session) ................... 1 killed        0
//   M13b a session is constructed and never started .................. 1 killed        0
//   M14 the phone announces itself as `kitchen` (01-F39) ............. 1 killed        0
//   M15 the app reaches the sync-client ROOT barrel .................. 1 killed        0
//
// ⚠ M13 SURVIVED THE FIRST DRAFT OF THIS FILE, killing 0 of 62. The assertion read
// `expect(app).toContain("createCloudSession")` and the mutant renamed only the CALL — the import
// still named the symbol, so a store that opens and never syncs passed the test written to catch
// it. Fixed at the line that says so. It is recorded here rather than quietly repaired because it
// is this repo's own named defect (*"A MENTION IS NOT A USE"*) reproducing inside the suite
// written to enforce the discipline — the round-3 law's exact shape, three files later.

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveAging } from "@restos/device-config/aging";
import { newId } from "@restos/domain";
import {
  createNodeStorageAdapter,
  type DeviceStore,
  openStore,
  type StoreIdentity,
} from "@restos/sync-client";
import { afterEach, describe, expect, it } from "vitest";
import { alarmsFrom } from "../alarms.js";
import { type BranchSource, branchSnapshotFrom, managerHome } from "../home.js";

const MINUTE = 60_000;
/** `DEFAULT_AGING_THRESHOLDS.dine_in` is `{ amberAt: 10, redAt: 20 }` — 40 min is unambiguously red. */
const LATE_MINUTES = 40;
const AGING = resolveAging(undefined);

const dirs: string[] = [];
const stores: DeviceStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) {
    try {
      store.close();
    } catch {
      // a test closed it already
    }
  }
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const identityOf = (): StoreIdentity => ({
  org_id: newId(),
  branch_id: newId(),
  device_id: newId(),
});

/** A REAL device store on a REAL disk — `05 §8`'s "normal full branch slice", nothing simulated. */
const realStore = (identity: StoreIdentity): DeviceStore => {
  const dir = mkdtempSync(join(tmpdir(), "restos-manager-slice-"));
  dirs.push(dir);
  const store = openStore({
    adapter: createNodeStorageAdapter({ path: join(dir, "device.db") }),
    identity,
  });
  stores.push(store);
  return store;
};

/**
 * One confirmed, unready order, aged exactly `minutesOld` at `now`.
 *
 * The stamps go in through `device_created_at`, which `01-F43` turns into `branch_created_at` at
 * append — so the age this test asserts is arithmetic the LEDGER did, not a number the test and
 * the implementation both happen to hold.
 */
const lateOrder = (
  store: DeviceStore,
  identity: StoreIdentity,
  now: number,
  minutesOld: number,
) => {
  const order_id = newId();
  const at = now - minutesOld * MINUTE;
  const append = (type: string, payload: Record<string, unknown>, when: number): void => {
    store.append({
      id: newId(),
      org_id: identity.org_id,
      branch_id: identity.branch_id,
      device_id: identity.device_id,
      actor_user_id: null,
      device_created_at: when,
      type,
      schema_version: 1,
      payload,
      refs: [],
    });
  };
  append("order.created", { order_id, order_type: "dine_in", channel: "counter" }, at - 1);
  append(
    "order.line_added",
    { order_id, line_id: "line-1", item_id: "item-karahi", qty: 1, unit_price_paisa: 50_000 },
    at - 1,
  );
  append("order.confirmed", { order_id }, at);
  return order_id;
};

/** The source under test, with every fact injectable so both arms are reachable. */
const source = (
  store: DeviceStore,
  opts: { connected: boolean; lastSeen: number | null; now: number },
): BranchSource => ({
  store,
  connected: () => opts.connected,
  lastSeenMs: () => opts.lastSeen,
  aging: AGING,
  now: () => opts.now,
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE SLICE IS REAL: the snapshot's rows ARE the store's rows.
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 05 §8 / 05 §5 — the reachable arm carries the LEDGER's own projections", () => {
  it("carries exactly what the store projects, computed independently on both sides", () => {
    const now = 1_770_000_000_000;
    const identity = identityOf();
    const store = realStore(identity);
    lateOrder(store, identity, now, LATE_MINUTES);

    const snapshot = branchSnapshotFrom(source(store, { connected: true, lastSeen: now, now }));
    expect(snapshot.reachable).toBe(true);
    if (!snapshot.reachable) return;

    // `05 §5`: "everything folds from the ledger". Not "resembles", not "contains" — IS.
    expect(snapshot.branch.queue).toEqual(store.kitchenQueue());
    expect(snapshot.branch.orders).toEqual(store.openOrders());
    // The control: the store is not empty, so `toEqual([])` on both sides cannot be the reason
    // this passes. Round-2 pattern 2, "the guard passed by not looking".
    expect(store.kitchenQueue().length).toBe(1);
  });

  it("asks the ledger again — a second order appended AFTER the first read shows up", () => {
    // The assertion a fixture cannot survive. An implementation that snapshots once, or that
    // returns a literal, gives the same answer to both calls.
    const now = 1_770_000_000_000;
    const identity = identityOf();
    const store = realStore(identity);
    lateOrder(store, identity, now, LATE_MINUTES);

    const before = branchSnapshotFrom(source(store, { connected: true, lastSeen: now, now }));
    lateOrder(store, identity, now, LATE_MINUTES + 5);
    const after = branchSnapshotFrom(source(store, { connected: true, lastSeen: now, now }));

    expect(before.reachable && before.branch.queue.length).toBe(1);
    expect(after.reachable && after.branch.queue.length).toBe(2);
  });

  it("survives close and reopen — 05-N5's 're-derived on start', over the same file", () => {
    // `05-N5` is the FR that makes an in-memory engine insufficient: the alarm list must come back
    // after the phone is killed. The only way to test that is to actually reopen the database.
    const now = 1_770_000_000_000;
    const identity = identityOf();
    const dir = mkdtempSync(join(tmpdir(), "restos-manager-restart-"));
    dirs.push(dir);
    const path = join(dir, "device.db");

    const first = openStore({ adapter: createNodeStorageAdapter({ path }), identity });
    lateOrder(first, identity, now, LATE_MINUTES);
    first.close();

    const second = openStore({ adapter: createNodeStorageAdapter({ path }), identity });
    stores.push(second);
    const snapshot = branchSnapshotFrom(source(second, { connected: true, lastSeen: now, now }));
    expect(snapshot.reachable && snapshot.branch.queue.length).toBe(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §B — THE ALARM IS DERIVED, NOT DECLARED. The teeth.
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 05-F1 — an alarm reaches the home model out of a real ledger", () => {
  it("raises a late-order alarm whose AGE is the ledger's arithmetic, not a literal", () => {
    const now = 1_770_000_000_000;
    const identity = identityOf();
    const store = realStore(identity);
    const order_id = lateOrder(store, identity, now, LATE_MINUTES);

    const home = managerHome(
      branchSnapshotFrom(source(store, { connected: true, lastSeen: now, now })),
      now,
    );
    expect(home.alarms.known).toBe(true);
    if (!home.alarms.known) return;
    expect(home.alarms.list.length).toBe(1);
    const alarm = home.alarms.list[0];
    expect(alarm?.order_id).toBe(order_id);
    expect(alarm?.kind).toBe("late_order");
    // `05-F1`'s "age". 40 because THIS TEST appended the confirm 40 minutes before `now` and
    // `01-F43` stamped it at append. A constant, an off-by-a-timezone, or an age read from the
    // device clock instead of branch time all produce a different number here.
    expect(alarm?.minutes).toBe(LATE_MINUTES);
    expect(alarm?.channel).toBe("counter");
  });

  it("raises NOTHING for a fresh order — the control, without which a constant list passes", () => {
    const now = 1_770_000_000_000;
    const identity = identityOf();
    const store = realStore(identity);
    lateOrder(store, identity, now, 2);

    const home = managerHome(
      branchSnapshotFrom(source(store, { connected: true, lastSeen: now, now })),
      now,
    );
    expect(home.alarms.known).toBe(true);
    expect(home.alarms.known && home.alarms.list).toEqual([]);
  });

  it("equals `alarmsFrom` over the store's own rows — the derivation is not re-implemented", () => {
    // Two derivations of one list is `03-F40`'s named defect. The snapshot must carry the INPUT
    // so the one shipped derivation runs on it; a snapshot carrying a ready-made list cannot be
    // tested for having derived it (which is why `home.ts`'s reachable arm is shaped as it is).
    const now = 1_770_000_000_000;
    const identity = identityOf();
    const store = realStore(identity);
    lateOrder(store, identity, now, LATE_MINUTES);
    lateOrder(store, identity, now, LATE_MINUTES + 11);
    lateOrder(store, identity, now, 1);

    const snapshot = branchSnapshotFrom(source(store, { connected: true, lastSeen: now, now }));
    expect(snapshot.reachable).toBe(true);
    if (!snapshot.reachable) return;
    const home = managerHome(snapshot, now);
    expect(home.alarms.known && home.alarms.list).toEqual(alarmsFrom(snapshot.branch));
    expect(home.alarms.known && home.alarms.list.length).toBe(2);
  });

  it("reads branch time through the STORE's offset, never the device clock (01-F43)", () => {
    // Standing law 2. The device clock and branch time differ here by ten minutes, which is
    // exactly the size of one aging band — so an implementation using `Date.now()` or the raw
    // injected clock for the AGE is off by ten minutes and this reddens.
    const now = 1_770_000_000_000;
    const identity = identityOf();
    const store = realStore(identity);
    lateOrder(store, identity, now, LATE_MINUTES);
    // The hub says the branch is ten minutes ahead of this phone. Every subsequent append and
    // every age must move with it.
    store.setBranchTimeOffset(10 * MINUTE);

    const snapshot = branchSnapshotFrom(source(store, { connected: true, lastSeen: now, now }));
    expect(snapshot.reachable).toBe(true);
    if (!snapshot.reachable) return;
    // The confirm was stamped BEFORE the offset was learned, so branch-now is device-now + 10 min
    // and the order is fifty minutes old in branch time, not forty.
    expect(snapshot.branch.now).toBe(now + 10 * MINUTE);
    const home = managerHome(snapshot, now);
    expect(home.alarms.known && home.alarms.list[0]?.minutes).toBe(LATE_MINUTES + 10);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §C — THE SEAM: the shipped composition opens a real store, syncs it, and is RN-safe.
// ───────────────────────────────────────────────────────────────────────────────────────────────

const SRC = new URL("../", import.meta.url);

const stripComments = (code: string): string => {
  let out = "";
  let i = 0;
  let quote: string | null = null;
  while (i < code.length) {
    const ch = code[i] as string;
    const next = code[i + 1];
    if (quote !== null) {
      out += ch;
      if (ch === "\\") {
        out += code[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < code.length && code[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < code.length && !(code[i] === "*" && code[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
};

/**
 * Every module specifier this file actually PULLS AT RUNTIME.
 *
 * `import type { … } from "x"` and `export type { … } from "x"` are erased by the bundler and are
 * therefore NOT edges — which is not a detail here, it is the mechanism `apps/manager` already
 * depends on: `alarms.ts` reaches `KitchenQueueRow` from `@restos/sync-client/fold-engine` under a
 * comment reading *"TYPE-only, and it must stay type-only"*. A walk that counted type imports
 * would report the RN app pulling `better-sqlite3` for naming a type, which is the false positive
 * that gets a correct implementation rejected.
 *
 * Conservative in the other direction, and stated: Babel also erases a plain `import { X }` whose
 * specifiers are only used as types, so a file that writes one is reported as an edge here when
 * Metro would drop it. The repo's Biome `recommended` preset writes `import type` for those, so
 * the two agree in practice; if that ever changes, this is the line to revisit.
 */
const specifiersOf = (code: string): string[] => {
  const body = stripComments(code);
  const found: string[] = [];
  const patterns = [
    /(?:^|[\s;}])(?:import|export)\s+(?!type\s)[^;]*?\sfrom\s*["']([^"']+)["']/g,
    /(?:^|[\s;}])import\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of body.matchAll(pattern)) found.push(match[1] as string);
  }
  return found;
};

/**
 * Every bare specifier the SHIPPED app reaches, following workspace packages the way Metro does.
 *
 * Rooted at `index.ts` — Expo's entry point — and NOT at this directory: a test file may import
 * whatever Node offers, and it is the PHONE's graph that matters. `@restos/*` specifiers are
 * FOLLOWED through their `package.json` `exports` map, because the whole hazard here is one
 * workspace import away: `@restos/sync-client` root reaches the Node driver and with it
 * `better-sqlite3`, while `@restos/sync-client/rn` does not, and a walk that stopped at the
 * package boundary could not tell those two apart. `apps/manager/metro.config.js` documents the
 * same resolution (`unstable_enablePackageExports`, and the `.js` → `.ts` fallback below).
 */
/**
 * ⚠ **`node:fs` PATH, NOT A `URL` — and the difference is this app's program, not a preference.**
 *
 * `react-native/src/types/globals.d.ts:463` declares its own ambient `URL`, so in THIS package's
 * TypeScript program `new URL(...)` is RN's and `readFileSync`/`existsSync`/`readdirSync` want
 * `node:url`'s. They are structurally incompatible (`URLSearchParams`' iterator gained
 * `[Symbol.dispose]`), so passing a `URL` straight to `node:fs` here is 9 `tsc` errors that no
 * implementation can clear — `pnpm -C apps/manager typecheck` is a named gate, and a suite that
 * cannot compile blocks the implementer indefinitely.
 *
 * ⚠ **THIS IS AN IMPLEMENTER'S EDIT TO A `24 §3` ORACLE FILE AND IT IS RECORDED RATHER THAN MADE
 * QUIETLY.** It changes NO assertion, no fixture and no walk: `.pathname` on a `file://` URL is
 * the absolute path, and it is the idiom this suite's sibling
 * (`packages/sync-client/src/__acceptance__/storage-adapter.test.ts`) already uses on `SRC_DIR`.
 * The one behaviour difference is percent-encoding in a repo path containing spaces, which this
 * checkout does not have. The author's own report says the four files were left with `tsc` errors
 * attributed to missing exports; these nine were a separate, pre-existing cause.
 */
const at = (url: URL): string => url.pathname;

const appGraph = (root = "index.ts"): { bare: Set<string>; files: Set<string> } => {
  const files = new Set<string>();
  const bare = new Set<string>();
  const repo = new URL("../../../", SRC);
  const queue = [new URL(root, SRC)];

  const resolveWorkspace = (specifier: string): URL | null => {
    const match = /^@restos\/([^/]+)(\/.*)?$/.exec(specifier);
    if (match === null) return null;
    const pkg = new URL(`packages/${match[1]}/package.json`, repo);
    if (!existsSync(at(pkg))) return null;
    const manifest = JSON.parse(readFileSync(at(pkg), "utf8")) as {
      exports?: Record<string, string>;
      main?: string;
    };
    const key = match[2] === undefined ? "." : `.${match[2]}`;
    const target = manifest.exports?.[key] ?? (key === "." ? manifest.main : undefined);
    if (target === undefined) throw new Error(`24-F14: ${specifier} resolves to nothing`);
    return new URL(`packages/${match[1]}/${target.replace(/^\.\//, "")}`, repo);
  };

  /**
   * Metro's resolution, not Node's. This app imports `./home` and `./App` with NO extension, and
   * the workspace packages import each other as `./x.js` naming `x.ts`; `apps/manager/
   * metro.config.js` documents both. A resolver handling only one kind stops walking at the first
   * file of the other kind and reports clean by not looking — round-2 pattern 2 exactly.
   */
  const resolveFile = (url: URL): URL => {
    const base = url.href.replace(/\.js$/, "");
    const candidates = [url, new URL(`${base}.ts`), new URL(`${base}.tsx`)];
    const found = candidates.find((candidate) => existsSync(at(candidate)));
    if (found === undefined)
      throw new Error(`24-F14: cannot resolve ${url.href} — walk is vacuous`);
    return found;
  };

  while (queue.length > 0) {
    const url = resolveFile(queue.pop() as URL);
    if (files.has(url.href)) continue;
    files.add(url.href);
    for (const specifier of specifiersOf(readFileSync(at(url), "utf8"))) {
      if (specifier.startsWith(".")) {
        queue.push(new URL(specifier.replace(/\.js$/, ".ts"), url));
        continue;
      }
      const workspace = resolveWorkspace(specifier);
      if (workspace === null) bare.add(specifier);
      else queue.push(workspace);
    }
  }
  return { bare, files };
};

/**
 * Every shipped source file in this app, comment-stripped and concatenated.
 *
 * Deliberately not one named file: whether the store opener lives in `home.ts`, in `App.tsx` or in
 * a new module is the implementer's call under `24 §3b`, and an assertion that pinned the FILE
 * would go red against a correct implementation that split it differently. What is pinned is that
 * the wiring exists SOMEWHERE the phone runs — and `__acceptance__` is excluded, because a test
 * mentioning `openRnStore` must never be able to satisfy this.
 */
const appSource = (): string => {
  const dir = new URL(".", SRC);
  const files = readdirSync(at(dir), { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => readFileSync(at(new URL(entry.name, dir)), "utf8"));
  expect(files.length).toBeGreaterThanOrEqual(4); // 24-F14: an empty read passes every `not`
  return files.map(stripComments).join("\n");
};

describe("§C the shipped composition — 18 §8, and the wiring the screen actually gets", () => {
  it("is actually walking the app (24-F14) — the control for every assertion below", () => {
    const { bare, files } = appGraph();
    expect(files.size).toBeGreaterThan(4);
    expect(bare.has("react")).toBe(true);
    // The walk crosses the workspace boundary, which is the only reason the next test can bite.
    expect([...files].some((f) => f.includes("/packages/"))).toBe(true);
  });

  it("reaches no module a phone does not have", () => {
    // The blocker this whole track exists to remove, asserted from the app's own side. `ws` and
    // `node:net` are named because the LAN mesh transport (`transport-ws.ts`) imports both, and
    // copying `apps/pass-kds/src/main/mesh.ts` — the natural worked example — brings them along.
    // `05-F29` rules the manager onto the CLOUD path anyway; this is that ruling as a test.
    const { bare } = appGraph();
    expect([...bare].filter((s) => s === "better-sqlite3")).toEqual([]);
    expect([...bare].filter((s) => s.startsWith("node:"))).toEqual([]);
    expect([...bare].filter((s) => s === "ws")).toEqual([]);
  });

  it("touches op-sqlite only through sync-client — 18 §8's 'via `sync-client` only'", () => {
    // `18 §8`: "Storage: `op-sqlite` via `sync-client` only". The app may reach the RN door; it may
    // not reach the engine. The graph walk follows `@restos/sync-client/rn` INTO the package, so
    // this is a statement about which module owns the import and not about who typed the name.
    // The graph walk deliberately does NOT carry this one: it follows `@restos/sync-client/rn`
    // INTO the package, where op-sqlite legitimately appears — that is the whole point of the
    // subpath. The property is about which layer owns the import, so it is asserted on the APP's
    // own sources.
    expect(appSource().includes("@op-engineering/op-sqlite")).toBe(false);
  });

  it("the shipped app opens a REAL store and hands it to the snapshot", () => {
    // The seam. `home.ts`'s `branchSnapshot()` returns `reachable: false` unconditionally today
    // and no store exists anywhere in this app; that is the state this assertion ends. It reads
    // SOURCE because `managerHomeNow()` cannot be CALLED here — it opens an op-sqlite database and
    // Node has no such module. Stated rather than glossed: this catches a wiring never made, and
    // it cannot catch a wiring made wrongly.
    const app = appSource();
    expect(app).toContain("openRnStore(");
    // At least one CALL, not merely the declaration — `branchSnapshotFrom = (` would not match.
    expect(app.split("branchSnapshotFrom(").length - 1).toBeGreaterThanOrEqual(1);
    // The literal that made the offline arm unconditional must be gone. It is quoted from the file
    // it retires, so this cannot pass by the string never having existed.
    expect(app).not.toContain("no branch stream on this device");
  });

  it("the store is SYNCED — a store nothing fills is an empty screen that looks calm", () => {
    // `05 §5`/`05-N5` fold "over the BRANCH stream": a device holding only its own appends has a
    // real ledger with no branch in it, which renders as a quiet kitchen. `05-F29`: "the grant
    // travels over the CLOUD path, not the LAN mesh."
    const app = appSource();
    // ⚠ A CALL, not a MENTION, and this line is where the first draft of this file failed its own
    // mutation round. It read `expect(app).toContain("createCloudSession")`, and the mutant that
    // renames the call site to `notCreateCloudSession(` — a store that opens and never syncs, the
    // exact failure this test is named for — **survived, killing 0 of 62**, because the IMPORT
    // still named the symbol. AGENTS.md: *"a MENTION IS NOT A USE — this repo has paid for that
    // three times in one week."* Four, now. Anchored on the open parenthesis, and the session is
    // required to be STARTED as well: a session constructed and never started is the same defect
    // one line later, and `mesh.ts`/`uplink.ts` both call `.start()` for that reason.
    expect(/\bcreateCloudSession\s*\(/.test(app)).toBe(true);
    expect(/\.start\s*\(\s*\)/.test(app)).toBe(true);
    // `01-F39` declares `manager` and puts it OUTSIDE the hub-eligible set. `mesh.ts` records the
    // mutant that makes this worth pinning: a file announcing itself as the wrong class wins an
    // election it should lose. Here the failure is worse — a phone claiming to be the till would
    // take branch-time authority (`01-F43`) and the branch's cloud uplink onto someone's pocket.
    expect(app).toContain('"manager"');
    expect(app).not.toContain('"counter_electron"');
    expect(app).not.toContain('"kitchen"');
  });

  it("home.ts stays PURE — the derivation is reachable without a native module", () => {
    // ⚠ MEASURED WHILE STANDING THIS SUITE UP AGAINST A TRIAL IMPLEMENTATION, and it is a real
    // constraint rather than a taste: with `home.ts` importing the RN store door at module scope,
    // **this whole file stops loading** (`Cannot find package '@op-engineering/op-sqlite'`), and
    // so does the existing `alarm-honesty.test.ts`, which imports `managerHomeNow` from it. The
    // pure/impure split is what keeps `05-F22`'s home model testable at all, and `18 §6`'s
    // "components NEVER touch SQLite or fold internals" is the same boundary one layer up.
    //
    // Rooted at `home.ts`, so the RN wiring module may import whatever a phone needs and this
    // stays true. WHERE that wiring lives is the implementer's call (`24 §3b`).
    const walk = appGraph("home.ts");
    expect(walk.files.size).toBeGreaterThan(1); // 24-F14
    expect([...walk.bare].filter((s) => s.includes("op-sqlite"))).toEqual([]);
    expect([...walk.bare].filter((s) => s === "better-sqlite3")).toEqual([]);
    expect([...walk.bare].filter((s) => s.startsWith("node:"))).toEqual([]);
  });

  // ⚠ THE ASSERTION THAT IS DELIBERATELY NOT HERE, because writing it would have been worse than
  // leaving it out. A structural check that the shipped composition contains no `reachable: false`
  // literal is UNSOUND: `05-F22` REQUIRES that literal — the offline arm is a feature, and
  // `alarm-honesty.test.ts` exists to defend it. A first draft of this file asserted exactly that
  // and passed only by accident of which file `readdirSync` returned first. The anti-constant
  // property is carried BEHAVIOURALLY instead, by §A ("asks the ledger again"), §B (the age is the
  // ledger's arithmetic) and §D ("BOTH arms are reachable from one source") — and that is the
  // whole reason those three exist.
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §D — THE HONEST ARM SURVIVES. `05-F22`/`05-F23` are not scaffolding.
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 05-F22 / 05-F23 — an unreachable branch is still a GAP, with a real store present", () => {
  it("says UNKNOWN rather than empty when the branch is out of contact", () => {
    // The state a manager is in every evening: the phone holds a full slice, and the branch has
    // not been heard from. `05 §4`: "alarm silence is labeled as unknown, not calm." An
    // implementation that reports the local fold as live once a store exists is the honesty
    // regression this work is most likely to cause.
    const now = 1_770_000_000_000;
    const identity = identityOf();
    const store = realStore(identity);
    lateOrder(store, identity, now, LATE_MINUTES);

    const snapshot = branchSnapshotFrom(
      source(store, { connected: false, lastSeen: now - 12 * MINUTE, now }),
    );
    expect(snapshot.reachable).toBe(false);
    const home = managerHome(snapshot, now);
    expect(home.alarms.known).toBe(false);
    expect(home.last_seen_seconds).toBe(12 * 60);
    expect(home.honesty.length).toBeGreaterThan(0);
  });

  it("says so plainly when the branch has NEVER been seen", () => {
    // A freshly installed phone, `05-F22`'s "never synced" end of the same sentence. It must
    // render rather than refuse (`05-N4`, commandment 4).
    const now = 1_770_000_000_000;
    const store = realStore(identityOf());
    const snapshot = branchSnapshotFrom(source(store, { connected: false, lastSeen: null, now }));
    expect(snapshot.reachable).toBe(false);
    expect(managerHome(snapshot, now).last_seen_seconds).toBeNull();
  });

  it("BOTH arms are reachable from one source — the anti-constant control", () => {
    // Without this, `reachable: false` for every input passes §D and `reachable: true` for every
    // input passes §A/§B. Each half alone blesses a constant; together they cannot.
    const now = 1_770_000_000_000;
    const identity = identityOf();
    const store = realStore(identity);
    lateOrder(store, identity, now, LATE_MINUTES);

    const up = branchSnapshotFrom(source(store, { connected: true, lastSeen: now, now }));
    const down = branchSnapshotFrom(source(store, { connected: false, lastSeen: now, now }));
    expect([up.reachable, down.reachable]).toEqual([true, false]);
  });
});
