// ACCEPTANCE TESTS — `01-F12`/`01-F15`: THE APP-LEVEL WIRING OF THE BRANCH HUB.
//
// **AUTHORED BY THE MUTATION ROUND, from four mutants that SURVIVED the suite beside it**
// (`lan-mesh-host.test.ts`, 17/17). That file proves `createLanMesh` is correct and that
// `main/index.ts` CONSTRUCTS it. It does not prove that `main/index.ts` USES what it constructed,
// and each of the four holes below was measured against the shipped tree with every gate green:
//
//   mutant                                                        kills (pass-kds + pos-electron)
//   ────────────────────────────────────────────────────────────  ───────────────────────────────
//   `notifyChanged` stops calling `mesh.notifyAppended()`                  0 of 1011
//   the strip goes back to two hardcoded `"down"` literals                 0 of 1011
//   the mesh's `peers` directory is replaced with `[]` (never dials)       0 of 1011
//   `mesh.stop()` is dropped from `will-quit`                              0 of 1011
//
// That is `AGENTS.md`'s named recurring defect one level up from where the rails look: not a
// subsystem with no seam to the product, but a seam the product holds and does not pull. The four
// assertions below each own exactly one of those mutants, and each was confirmed to FAIL under it
// and to stay GREEN under two negative controls (the host module renamed `mesh.ts` → `lan.ts`, and
// a behaviour-preserving rewrite of `reachability()`), so they pin behaviour rather than shape.
//
// ── WHY THREE OF THE FOUR READ SOURCE ─────────────────────────────────────────────────────────
//
// `main/index.ts` is an Electron entry point: importing it runs `app.whenReady()` and builds a
// `BrowserWindow`. No vitest process can construct it, which is exactly why this wiring has never
// been asserted and exactly why the wave keeps rediscovering the same defect here. The walk is
// therefore textual — and it is the shape `§C` of the suite beside this one already uses, with its
// recorded correction applied: **comments stripped first** ("a mention is not an import"), and the
// binding NAME discovered from `const <name> = createLanMesh(` rather than assumed, so a host that
// calls its mesh something else stays green.

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createMeshSession,
  createWsLanTransport,
  type DeviceStore,
  type MeshSession,
  openStore,
  wallClock,
} from "@restos/sync-client";
import { createTestBranchPki } from "@restos/testing/lan-credentials";
import { afterEach, describe, expect, it } from "vitest";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..", "..");
const INDEX = join(REPO_ROOT, "apps/pos-electron/src/main/index.ts");

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/**
 * The identifier `main/index.ts` binds its mesh to — discovered, never assumed.
 *
 * A test that hardcoded `mesh` would go RED against a correct implementation that named it
 * `branchHub`, which the round-3 law rates exactly as damaging as a vacuous one.
 */
const meshBinding = (src: string): string => {
  const match = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*createLanMesh\s*\(/.exec(src);
  expect(
    match,
    "`main/index.ts` never binds the result of `createLanMesh(...)` to a name, so nothing in " +
      "`boot()` can call `notifyAppended`, `reachability` or `stop` on it. The mesh would then be " +
      "constructed and dropped on the floor — `AGENTS.md`'s recurring defect with the construction " +
      "present, which is the one shape `pnpm seams:check` reports as reached.",
  ).not.toBeNull();
  return String(match?.[1]);
};

describe("§W 01-F15 — main/index.ts USES the mesh it constructs", () => {
  it("is actually reading the file it guards", () => {
    // ROUND-2 PATTERN 2, "the guard passed by not looking": anchored on things this task did not
    // add, so a broken path or a broken comment-stripper fails HERE and not silently below.
    const src = stripComments(readFileSync(INDEX, "utf8"));
    expect(src).toContain("app.whenReady()");
    expect(src).toContain("createLanMesh(");
    expect(src).toContain("createUplink(");
  });

  it("01-F15: the change funnel calls notifyAppended — the fast path, not the heartbeat", () => {
    // ⚠ THE MUTANT THIS OWNS: delete `mesh.notifyAppended()` from `notifyChanged`. Measured on the
    // shipped tree, that fails **0 of 1011** tests — `mesh.ts` still declares the member, so the
    // sibling suite's `§C` text check (which reads the HOST module) stays green, and both suites
    // drive `notifyAppended()` themselves from the test body. The product consequence is `01-F15`:
    // a confirmed order then reaches the pass screen on `mesh-session.ts`'s 2 s window re-fan
    // instead of at the instant it is durable, and the FR says "< 1 s p95".
    const src = stripComments(readFileSync(INDEX, "utf8"));
    const name = meshBinding(src);
    expect(
      new RegExp(`\\b${name}\\.notifyAppended\\s*\\(`).test(src),
      `main/index.ts constructs the mesh as \`${name}\` and never calls ` +
        `\`${name}.notifyAppended()\`. \`01-F15\` makes LAN propagation a FAST PATH — "an event ` +
        'reaches all connected branch devices < 1 s p95" — and without this call delivery waits ' +
        "for the next 2 s heartbeat re-fan, measured at 1519 ms for a single order. Every append " +
        "path in this file already funnels through one function; the call belongs in it.",
    ).toBe(true);
  });

  it("00 §5.7: the strip the renderer is handed reads lan and hub FROM the mesh", () => {
    // ⚠ THE MUTANT THIS OWNS: compose the device state as
    // `{ lan: "down", hub: "down", ...uplink.reachability() }`. Measured: **0 of 1011**. The
    // sibling suite's `§D` proves `createLanMesh().reachability()` reports rather than asserts, and
    // its "shipped strip stops hardcoding" guard exempts any file with a single literal pair — so
    // the honesty strip on the real glass can go back to two constants with every gate green. That
    // is the defect `00 §5.7` is written against, and the earlier version of this line shipped for
    // a year.
    const src = stripComments(readFileSync(INDEX, "utf8"));
    const name = meshBinding(src);
    expect(
      new RegExp(`\\b${name}\\.reachability\\s*\\(`).test(src),
      `main/index.ts never reads \`${name}.reachability()\`, so the \`lan\` and \`hub\` chips on ` +
        "`00 §5.7`'s honesty strip are decided by something that is not the mesh. A constant is " +
        "not a report — and the dangerous direction is not `down`, it is a green dot on a branch " +
        "LAN that is not there.",
    ).toBe(true);
  });

  it("01-F17: the mesh is stopped at shutdown, so the next launch can rebind its hub port", () => {
    // ⚠ THE MUTANT THIS OWNS: drop `mesh.stop()` from the `will-quit` handler. Measured: **0 of
    // 1011** — the sibling suite's `stop()` test calls `mesh.stop()` from the test body, which
    // proves the METHOD releases the socket and says nothing about anybody calling it. A listen
    // socket that outlives the app holds the branch hub port, and the next launch of the till binds
    // nothing while reporting itself meshed.
    const src = stripComments(readFileSync(INDEX, "utf8"));
    const name = meshBinding(src);
    expect(
      new RegExp(`\\b${name}\\.stop\\s*\\(`).test(src),
      `main/index.ts never calls \`${name}.stop()\`. The mesh owns a WebSocketServer and dial ` +
        "retry timers; leaving them alive past shutdown holds the hub port and the next launch " +
        "cannot bind it.",
    ).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §X — `01-F12` THE DIRECTORY IS DIALED. The counter is not only dialable; it dials.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const ORG = "00000000-0000-7000-8000-000000000001";
const BRANCH = "00000000-0000-7000-8000-000000000002";
const COUNTER_ID = "zzzz-counter-till-1";
const KITCHEN_ID = "aaaa-kitchen-pass-1";

/**
 * `01-F72` — the LAN is mutually authenticated now, so a transport cannot be constructed without a
 * credential. This is FIXTURE WIRING only: no assertion in this file was changed, added or removed
 * (`24 §3`, oracle protection). One issuer, both devices, so they admit each other.
 */
const PKI = await createTestBranchPki([
  { device_id: COUNTER_ID, device_class: "counter_electron" },
  { device_id: KITCHEN_ID, device_class: "kitchen" },
]);

/**
 * `01-F72`/`01-F73`/`01-F74` — PAIR the device. A store with no credential does not mesh at
 * all (`01-F72` (d), fail closed) and a store with no roster admits nobody, so without this
 * every convergence assertion below would fail for the right reason at the wrong layer.
 *
 * FIXTURE WIRING ONLY: no assertion in this file was changed, added or removed (`24 §3`).
 */
const pairDevice = (s: DeviceStore, device_id: string): void => {
  const me = PKI.devices.find((d) => d.device_id === device_id);
  if (me === undefined) throw new Error(`no test credential for ${device_id}`);
  s.setLanCredential(me.credential);
  s.lanRoster.apply(
    {
      kind: "snapshot",
      version: 1,
      entries: PKI.devices.map((d) => ({
        device_id: d.device_id,
        device_class: d.device_class,
        cert_sha256: d.cert_sha256,
        revoked: false,
      })),
    },
    Date.now(),
  );
};

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const waitFor = async (predicate: () => boolean, budgetMs: number): Promise<number> => {
  const started = Date.now();
  while (Date.now() - started < budgetMs) {
    if (predicate()) return Date.now() - started;
    await sleep(5);
  }
  return predicate() ? Date.now() - started : -1;
};

/** `01-F13` fixes re-election at "< 10 s" — the corpus's own patience for the mesh to settle. */
const CONNECT_BUDGET_MS = 10_000;

const openTempStore = (device_id: string): DeviceStore => {
  const dir = mkdtempSync(join(tmpdir(), "restos-lan-wiring-"));
  const store = openStore({
    path: join(dir, "device.db"),
    identity: { org_id: ORG, branch_id: BRANCH, device_id },
  });
  pairDevice(store, device_id);
  cleanups.push(() => {
    try {
      store.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  return store;
};

const freePort = async (): Promise<number> => {
  const { createServer } = await import("node:net");
  return await new Promise<number>((res, rej) => {
    const s = createServer();
    s.on("error", rej);
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      const port = typeof addr === "object" && addr !== null ? addr.port : 0;
      s.close(() => res(port));
    });
  });
};

const newId = (): string => crypto.randomUUID();

const eventInput = (device_id: string, type: string, payload: Record<string, unknown>) => ({
  id: newId(),
  org_id: ORG,
  branch_id: BRANCH,
  device_id,
  actor_user_id: null,
  device_created_at: Date.now(),
  type,
  schema_version: 1,
  payload,
  refs: [],
});

/** A `kitchen` peer that LISTENS and dials nobody — so only the counter's dial can connect them. */
const startListeningKitchen = (port: number): { store: DeviceStore; session: MeshSession } => {
  const store = openTempStore(KITCHEN_ID);
  const transport = createWsLanTransport({
    admission: PKI.admissionFor(KITCHEN_ID),
    listen_host: "0.0.0.0",
    listen_port: port,
    peers: [],
    clock: wallClock,
  });
  const session = createMeshSession({
    store,
    transport,
    clock: wallClock,
    device_class: "kitchen",
    token: "peer-token",
  });
  session.start();
  cleanups.push(() => session.stop());
  return { store, session };
};

/**
 * The mesh host module, DISCOVERED from `main/index.ts`'s own import rather than pinned.
 *
 * ⚠ The sibling suite records why: `24 §3b` leaves the file an implementer's choice, and a suite
 * that hardcoded `../mesh` would go RED against a correct implementation that put the host in
 * `main/sync.ts` or renamed it — which the round-3 law rates exactly as damaging as a vacuous test.
 * Confirmed with a negative control: renaming `mesh.ts` to `lan.ts` and repointing the import
 * leaves every assertion in this file green. Reading it off `index.ts` is also sharper than a
 * directory walk — the module under test is BY DEFINITION the one the app imports.
 */
const hostModule = async (): Promise<{
  createLanMesh: (opts: {
    store: DeviceStore;
    lan: { listen_host: string; listen_port: number; peers: readonly LanPeer[] } | null | undefined;
    onChanged: () => void;
  }) => { reachability: () => unknown; notifyAppended: () => void; stop: () => void };
}> => {
  const src = stripComments(readFileSync(INDEX, "utf8"));
  const match = /import\s*\{[^}]*\bcreateLanMesh\b[^}]*\}\s*from\s*["'](\.[^"']+)["']/.exec(src);
  expect(
    match,
    "`main/index.ts` does not import `createLanMesh` from a relative module, so this suite cannot " +
      "find the host the app actually builds. It deliberately does not fall back to a hardcoded " +
      "path: a suite that tested a module the app does not import would be the wave's recurring " +
      "defect wearing a test.",
  ).not.toBeNull();
  const target = resolve(join(INDEX, ".."), String(match?.[1]));
  const file = [`${target}.ts`, join(target, "index.ts")].find((c) => existsSync(c));
  expect(
    file,
    `main/index.ts imports ${String(match?.[1])} and no such module exists`,
  ).toBeDefined();
  return (await import(pathToFileURL(String(file)).href)) as never;
};

type LanPeer = { device_id: string; host: string; port: number };

describe("§X 01-F12 — the counter dials the peers its directory names", () => {
  it("an order crosses to a kitchen device that only LISTENS", async () => {
    // ⚠ THE MUTANT THIS OWNS: `peers: []` in place of `lan.peers` in the counter's host. Measured:
    // **0 of 1011**. Every delivery test in the sibling suite hands the counter a peer-free config
    // and lets the kitchen dial IN — so the counter's use of `01-F12`'s manual-IP directory is
    // exercised by exactly one test there, which asserts only that an unreachable entry does not
    // block the till, and a mesh that never dials satisfies that too.
    //
    // `resolveLanMesh` REFUSES a peer directory it cannot parse and `§E` of the sibling suite pins
    // that. This is the other half: that the directory, once parsed, is handed to the transport.
    // A branch where the till holds the addresses — the natural setup when the pass screen has the
    // fixed IP — otherwise never meets, with both apps' suites green.
    const kitchenPort = await freePort();
    const kitchen = startListeningKitchen(kitchenPort);
    const counterStore = openTempStore(COUNTER_ID);
    const { createLanMesh } = await hostModule();
    const mesh = createLanMesh({
      store: counterStore,
      lan: {
        listen_host: "0.0.0.0",
        listen_port: await freePort(),
        peers: [{ device_id: KITCHEN_ID, host: "127.0.0.1", port: kitchenPort }],
      },
      onChanged: () => {},
    });
    cleanups.push(() => mesh.stop());

    expect(
      await waitFor(() => kitchen.session.status().hub_id === COUNTER_ID, CONNECT_BUDGET_MS),
      "the kitchen device never saw the counter. It listens and dials nobody, so the only way " +
        "this branch can form is the counter dialing the directory `01-F12` calls the manual-IP " +
        "fallback. A host that ignores `lan.peers` reaches this line and no further.",
    ).toBeGreaterThan(-1);

    const order_id = newId();
    counterStore.append(
      eventInput(COUNTER_ID, "order.created", {
        order_id,
        order_type: "dine_in",
        channel: "counter",
      }),
    );
    counterStore.append(eventInput(COUNTER_ID, "order.confirmed", { order_id }));
    mesh.notifyAppended();
    expect(
      await waitFor(
        () => kitchen.store.kitchenQueue().some((r) => r.order_id === order_id),
        CONNECT_BUDGET_MS,
      ),
      "the counter dialed the kitchen and then no order crossed the link it opened",
    ).toBeGreaterThan(-1);
  });

  it("01-F15/00 §5.7: an event arriving over the LAN calls onChanged, so the screen re-reads", async () => {
    // ⚠ THE MUTANT THIS OWNS: never fire `onChanged`. Measured: **0 of 1011**, because all 18
    // constructions of `createLanMesh` across both acceptance suites pass `onChanged: () => {}` —
    // the callback is in every signature and observed by nothing.
    //
    // MEASURED ON THE GLASS, not argued: with that mutation built and the real `apps/pass-kds`
    // binary launched against a real counter-class mesh session, a third order reached the
    // screen's SQLite store (`peer_events` 6 → 9, `queue` 2 → 3 rows) and the cook's screen still
    // read "2 OPEN" two and a half minutes later, ages frozen. `AGENTS.md`'s second recurring
    // defect — a correct component that is not on the screen — with every suite green.
    const kitchenPort = await freePort();
    const kitchen = startListeningKitchen(kitchenPort);
    const counterStore = openTempStore(COUNTER_ID);
    const { createLanMesh } = await hostModule();

    // The counter is the one under test here too: it must notice events that ARRIVE, not only the
    // ones it appends. The kitchen rings, the counter must re-read.
    let changed = 0;
    const mesh = createLanMesh({
      store: counterStore,
      lan: {
        listen_host: "0.0.0.0",
        listen_port: await freePort(),
        peers: [{ device_id: KITCHEN_ID, host: "127.0.0.1", port: kitchenPort }],
      },
      onChanged: () => {
        changed += 1;
      },
    });
    cleanups.push(() => mesh.stop());
    expect(
      await waitFor(() => kitchen.session.status().hub_id === COUNTER_ID, CONNECT_BUDGET_MS),
    ).toBeGreaterThan(-1);

    const before = changed;
    const order_id = newId();
    kitchen.store.append(
      eventInput(KITCHEN_ID, "order.created", {
        order_id,
        order_type: "dine_in",
        channel: "counter",
      }),
    );
    kitchen.store.append(eventInput(KITCHEN_ID, "order.confirmed", { order_id }));
    kitchen.session.notifyAppended();

    expect(
      await waitFor(
        () => counterStore.kitchenQueue().some((r) => r.order_id === order_id),
        CONNECT_BUDGET_MS,
      ),
      "the kitchen's event never reached the counter's store, so this test cannot say anything " +
        "about the callback — it would pass vacuously if it only waited on `changed`",
    ).toBeGreaterThan(-1);

    expect(
      await waitFor(() => changed > before, CONNECT_BUDGET_MS),
      "an event arrived over the LAN and landed in this device's store, and `onChanged` never " +
        "fired. `main/index.ts` wires that callback to the only thing that tells the renderer to " +
        "re-read, so the row is in SQLite and never on the glass: the ticket a cook is waiting " +
        "for, or the ready-mark a cashier is waiting for, invisible until something else happens " +
        "to repaint.",
    ).toBeGreaterThan(-1);
  });
});
