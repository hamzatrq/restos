// ACCEPTANCE TESTS — `01-F12`/`01-F15`: THE APP-LEVEL WIRING OF THE PASS SCREEN'S MESH.
//
// **AUTHORED BY THE MUTATION ROUND, from mutants that SURVIVED the suite beside it**
// (`lan-mesh-join.test.ts`, 19/19). That file proves `createLanMesh` is correct and that
// `main/index.ts` CONSTRUCTS it. It does not prove that `main/index.ts` USES it, and it never
// exercises this device's OWN fast path — the direction that carries `03-F16`'s ready-mark and
// `03-F52`'s handover back to the counter. Measured against the shipped tree, every gate green:
//
//   mutant                                                        kills (pass-kds + pos-electron)
//   ────────────────────────────────────────────────────────────  ───────────────────────────────
//   `notifyChanged` stops calling `mesh.notifyAppended()`                  0 of 1011
//   this host's `notifyAppended` is a no-op                                0 of 136 (pass suite)
//   the strip goes back to two hardcoded `"down"` literals                 0 of 1011
//   `onChanged` never fires when an event arrives over the LAN             0 of 1011
//   `mesh.stop()` is dropped from `window-all-closed`                      0 of 1011
//
// The last one was proved ON THE GLASS rather than argued: with the `onChanged` mutation built and
// this app launched for real against a real `counter_electron` mesh session, an order reached the
// screen's SQLite store (`peer_events` 6 → 9, `queue` 2 → 3 rows) and the cook's screen still read
// "2 OPEN" two and a half minutes later, with the age counters frozen. That is `AGENTS.md`'s second
// recurring defect — a correct component that is not on the screen — with 1011 tests passing.
//
// Each assertion below owns exactly one mutant, was confirmed to FAIL under it, and was confirmed
// GREEN under two negative controls (the host module renamed, and a behaviour-preserving rewrite of
// `reachability()`), so they pin behaviour and not shape.
//
// ── WHY THE WIRING CHECKS READ SOURCE ─────────────────────────────────────────────────────────
//
// `main/index.ts` is an Electron entry point — importing it awaits `app.whenReady()` and opens a
// window — so no vitest process can construct it. That is precisely why this wiring has never been
// asserted, and why this app shipped for a fortnight in a state where `void boot()` threw before
// any window existed and all 136 tests stayed green. The walk strips comments first ("a mention is
// not an import") and DISCOVERS the binding name rather than assuming `mesh`.

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveAging } from "@restos/device-config";
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
import { passQueue } from "../pass-queue";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..", "..");
const INDEX = join(REPO_ROOT, "apps/pass-kds/src/main/index.ts");

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const meshBinding = (src: string): string => {
  const match = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*createLanMesh\s*\(/.exec(src);
  expect(
    match,
    "`main/index.ts` never binds the result of `createLanMesh(...)` to a name, so nothing in " +
      "`boot()` can call `notifyAppended`, `reachability` or `stop` on it.",
  ).not.toBeNull();
  return String(match?.[1]);
};

describe("§W 01-F15 — main/index.ts USES the mesh it constructs", () => {
  it("is actually reading the file it guards", () => {
    // ROUND-2 PATTERN 2: anchored on things this task did not add, so a broken path fails HERE.
    const src = stripComments(readFileSync(INDEX, "utf8"));
    expect(src).toContain("app.whenReady()");
    expect(src).toContain("createLanMesh(");
    expect(src).toContain("createPassUplink(");
  });

  it("01-F15: the change funnel calls notifyAppended — the ready-mark rides the fast path", () => {
    // ⚠ THE MUTANT THIS OWNS: delete `mesh.notifyAppended()` from `notifyChanged`. **0 of 1011.**
    // `mesh.ts` still declares the member, and the sibling suite drives it from the fixture's own
    // counter, so nothing notices. The consequence is on the OTHER device: `03-F16`'s ready-mark
    // and `03-F52`'s handover then reach the till on the 2 s heartbeat re-fan, and `01-F15` says
    // "order state changes ride this path" at "< 1 s p95".
    const src = stripComments(readFileSync(INDEX, "utf8"));
    const name = meshBinding(src);
    expect(
      new RegExp(`\\b${name}\\.notifyAppended\\s*\\(`).test(src),
      `main/index.ts constructs the mesh as \`${name}\` and never calls ` +
        `\`${name}.notifyAppended()\`. Every append path in this file already funnels through one ` +
        "function; the call belongs in it, or the cook's DONE takes up to 2 s to reach the till.",
    ).toBe(true);
  });

  it("00 §5.7: the strip the cook is shown reads lan and hub FROM the mesh", () => {
    // ⚠ THE MUTANT THIS OWNS: `lan: "down", hub: "down"` back in the device state. **0 of 1011.**
    // The sibling `§D` proves the FACTORY reports rather than asserts and says nothing about the
    // strip the renderer is handed. The dangerous direction is not `down`: it is a green LAN chip
    // above an empty queue, which is also what a quiet kitchen looks like.
    const src = stripComments(readFileSync(INDEX, "utf8"));
    const name = meshBinding(src);
    expect(
      new RegExp(`\\b${name}\\.reachability\\s*\\(`).test(src),
      `main/index.ts never reads \`${name}.reachability()\`, so the \`lan\` and \`hub\` chips are ` +
        "decided by something that is not the mesh.",
    ).toBe(true);
  });

  it("01-F17: the mesh is stopped at shutdown, so a relaunch can rebind the port", () => {
    // ⚠ THE MUTANT THIS OWNS: drop `mesh.stop()`. **0 of 1011** — and the pass suite does not even
    // go red on leaked sockets by an assertion: with the session left running it reports
    // "Tests 19 passed (19)" and exits 1 on five unhandled post-run errors, which a reader
    // summarising the count would score as a survivor.
    const src = stripComments(readFileSync(INDEX, "utf8"));
    const name = meshBinding(src);
    expect(
      new RegExp(`\\b${name}\\.stop\\s*\\(`).test(src),
      `main/index.ts never calls \`${name}.stop()\`. This screen is hub-eligible (\`01-F39\`), so ` +
        "a listen socket that outlives the app can hold the branch hub port.",
    ).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §Y — THIS DEVICE'S OWN FAST PATH, AND THE CALLBACK THAT PUTS AN ARRIVAL ON THE GLASS.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const ORG = "00000000-0000-7000-8000-000000000001";
const BRANCH = "00000000-0000-7000-8000-000000000002";
const COUNTER_ID = "zzzz-counter-till-1";

const PASS_ID = "aaaa-kitchen-pass-1";

/**
 * `01-F72` — the LAN is mutually authenticated now, so a transport cannot be constructed without a
 * credential. This is FIXTURE WIRING only: no assertion in this file was changed, added or removed
 * (`24 §3`, oracle protection). One issuer, both devices, so they admit each other.
 */
const PKI = await createTestBranchPki([
  { device_id: COUNTER_ID, device_class: "counter_electron" },
  { device_id: PASS_ID, device_class: "kitchen" },
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

/** A real `counter_electron` hub. Not a mock: real store, real transport, real sockets. */
const startCounterHub = (port: number): { store: DeviceStore; session: MeshSession } => {
  const store = openTempStore(COUNTER_ID);
  const transport = createWsLanTransport({
    admission: PKI.admissionFor(COUNTER_ID),
    listen_host: "0.0.0.0",
    listen_port: port,
    peers: [],
    clock: wallClock,
  });
  const session = createMeshSession({
    store,
    transport,
    clock: wallClock,
    device_class: "counter_electron",
    token: "hub-token",
  });
  session.start();
  cleanups.push(() => session.stop());
  return { store, session };
};

const ticketsOn = (store: DeviceStore) =>
  passQueue({
    store,
    name: (item_id) => item_id,
    aging: resolveAging(undefined),
    now: () => Date.now() + store.branchTimeStatus().offset_ms,
  });

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

describe("§Y 01-F15/03-F16 — the pass screen's own half of the fast path", () => {
  it("an event appended HERE reaches the counter < 1 s p95", async () => {
    // ⚠ THE MUTANT THIS OWNS: `notifyAppended: () => {}` on this app's host. Measured **0 of 136**
    // in the sibling suite, because every one of its latency samples is rung on the FIXTURE's
    // counter and measured arriving here — the direction this device receives, never the one it
    // sends. `mesh.ts`'s own header claims this direction ("on this device it carries the
    // ready-mark and the handover back to the counter") and nothing held it to the claim.
    //
    // p95 over a batch rather than one sample, for the reason the sibling suite records: without
    // the fast path delivery still happens, uniformly spread over the 2 s heartbeat, so a single
    // "< 1 s" sample is a coin flip and flakes in both directions.
    const hubPort = await freePort();
    const hub = startCounterHub(hubPort);
    const passStore = openTempStore(PASS_ID);
    const { createLanMesh } = await hostModule();
    const mesh = createLanMesh({
      store: passStore,
      lan: {
        listen_host: "0.0.0.0",
        listen_port: await freePort(),
        peers: [{ device_id: COUNTER_ID, host: "127.0.0.1", port: hubPort }],
      },
      onChanged: () => {},
    });
    cleanups.push(() => mesh.stop());
    expect(
      await waitFor(() => hub.session.status().peers.length > 0, CONNECT_BUDGET_MS),
    ).toBeGreaterThan(-1);

    const SAMPLES = 20;
    const latencies: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const order_id = newId();
      passStore.append(
        eventInput(PASS_ID, "order.created", {
          order_id,
          order_type: "dine_in",
          channel: "counter",
        }),
      );
      passStore.append(eventInput(PASS_ID, "order.confirmed", { order_id }));
      const startedAt = Date.now();
      mesh.notifyAppended();
      const seen = await waitFor(
        () => hub.store.kitchenQueue().some((r) => r.order_id === order_id),
        CONNECT_BUDGET_MS,
      );
      expect(seen, `event ${i + 1} of ${SAMPLES} never reached the counter at all`).toBeGreaterThan(
        -1,
      );
      latencies.push(Date.now() - startedAt);
      // A gap between appends so each is its own measurement rather than a batch riding one frame.
      await sleep(40);
    }
    latencies.sort((a, b) => a - b);
    const p95 = latencies[Math.min(latencies.length - 1, Math.ceil(0.95 * latencies.length) - 1)];
    expect(
      p95,
      `01-F15 requires "< 1 s p95" and this build's p95 over ${SAMPLES} events appended on the ` +
        `pass screen was ${p95} ms (min ${latencies[0]}, max ${latencies.at(-1)}). A p95 near 2 s ` +
        "is the signature of a host whose `notifyAppended` does nothing: the cook presses DONE and " +
        "the till learns about it on the next heartbeat window re-fan.",
    ).toBeLessThan(1_000);
  });

  it("00 §5.7: an order arriving over the LAN calls onChanged, so the cook's screen re-reads", async () => {
    // ⚠ THE MUTANT THIS OWNS: never fire `onChanged`. **0 of 1011**, because all 18 constructions
    // of `createLanMesh` across both acceptance suites pass `onChanged: () => {}`.
    //
    // MEASURED ON THE GLASS: with that mutation built and this app launched for real, an order
    // crossed the LAN into `queue` and the screen went on reading "2 OPEN" with frozen ages. This
    // app has NO periodic tick — `App.tsx` re-reads only on this callback — so the arrival is in
    // SQLite and never on the wall.
    const hubPort = await freePort();
    const hub = startCounterHub(hubPort);
    const passStore = openTempStore(PASS_ID);
    const { createLanMesh } = await hostModule();
    let changed = 0;
    const mesh = createLanMesh({
      store: passStore,
      lan: {
        listen_host: "0.0.0.0",
        listen_port: await freePort(),
        peers: [{ device_id: COUNTER_ID, host: "127.0.0.1", port: hubPort }],
      },
      onChanged: () => {
        changed += 1;
      },
    });
    cleanups.push(() => mesh.stop());
    expect(
      await waitFor(() => hub.session.status().peers.length > 0, CONNECT_BUDGET_MS),
    ).toBeGreaterThan(-1);

    const before = changed;
    const order_id = newId();
    hub.store.append(
      eventInput(COUNTER_ID, "order.created", {
        order_id,
        order_type: "dine_in",
        channel: "counter",
      }),
    );
    hub.store.append(
      eventInput(COUNTER_ID, "order.line_added", {
        order_id,
        line_id: newId(),
        item_id: "item-karahi",
        qty: 2,
        unit_price_paisa: 45000,
      }),
    );
    hub.store.append(eventInput(COUNTER_ID, "order.confirmed", { order_id }));
    hub.session.notifyAppended();

    // Necessary and not sufficient, in that order: if the ticket never arrived this test would
    // otherwise pass or fail for the wrong reason.
    expect(
      await waitFor(() => ticketsOn(passStore).some((t) => t.order_id === order_id), 10_000),
      "the counter's order never reached this screen's queue, so nothing here can say anything " +
        "about the callback",
    ).toBeGreaterThan(-1);

    expect(
      await waitFor(() => changed > before, CONNECT_BUDGET_MS),
      "a ticket arrived over the LAN and landed in this screen's queue, and `onChanged` never " +
        "fired. `main/index.ts` wires that callback to the ONLY thing that tells this renderer to " +
        "re-read — there is no periodic tick in this app — so the cook stands in front of a screen " +
        "that says nothing is to be cooked while the order is in the database in front of him.",
    ).toBeGreaterThan(-1);
  });
});
