// ACCEPTANCE TESTS — `01-F12`/`01-F13`/`01-F15`: THE PASS SCREEN JOINS THE BRANCH MESH.
//
// **AUTHORED FROM SPEC TEXT ONLY** (`24 §3` step 2). The author of this file wrote no production
// code for the host it describes and is disqualified from implementing it.
//
// ── THE SENTENCE THIS FILE EXISTS TO MAKE TRUE ────────────────────────────────────────────────
//
// `apps/pass-kds/src/main/uplink.ts` says it against itself, in a header titled *"HOW THE COUNTER'S
// ORDERS REACH THIS SCREEN — AND THE HONEST ANSWER IS 'OVER THE WAN'"*:
//
//   "A pass screen shows the **branch** order queue (`03-F13`), and the orders are appended on the
//    counter. `01-F13`/`01-F15` say those events travel over the **LAN mesh** ... **That mesh is
//    built and hosted by nothing** ... So the only path that exists is the **cloud** ... which
//    means a branch whose internet drops has a pass screen that stops learning about new orders
//    while the counter goes on selling. **That is a `00 §5.1` violation in effect and it is NOT
//    closed by this app.**"
//
// It is closed by this app and the counter together. This suite owns the pass half.
//
// ── THE AUTHORITIES, QUOTED ───────────────────────────────────────────────────────────────────
//
//   01-F12  "Devices in a branch discover each other on the LAN (mDNS; manual IP fallback) and
//           exchange events directly while WAN is down."
//   01-F13  election among hub-eligible classes, "`counter_electron` > `counter_rn` > `kitchen`;
//           ties broken by lowest device id"; "Non-hub devices connect to the hub (star)".
//   01-F15  "an event reaches all connected branch devices < 1 s p95 ... order state changes ride
//           this path."
//   01-F39  `kitchen` = "pass screen / KDS station, doc 03 — full branch window, hub-eligible".
//           So this device is a follower when a counter is present and a HUB when it is not.
//   03-F13  the pass shows the branch queue — which is why §A asserts `passQueue()`, the screen's
//           own projection, and not merely that an event landed in a table.
//   00 §5.1 "every in-branch function works with WAN down, indefinitely".
//   18 §2   "Apps NEVER import ... other apps" — why the counter is a real peer built from
//           `@restos/sync-client` here rather than an import of `apps/pos-electron`.
//   DEC-ARCH-001 (RULED) a shared implementation is EXTRACTED at the moment it acquires a second
//           consumer — the rule §E applies to the LAN configuration both apps must agree on.
//
// ── THE CONTRACT, AND WHAT IS DISCOVERED RATHER THAN PINNED ───────────────────────────────────
//
// Same shape as the counter's, because it is the same role on a different device class:
// `createLanMesh({ store, lan, onChanged })`. The FILE is discovered (§C); `device_class` is NOT a
// parameter — `uplink.ts` already hardcodes `kitchen` for the cloud session, calling it "`01-F39`'s
// own name for 'pass screen / KDS station, doc 03'", and §B's election assertion is only sharp
// because that value lives in shipped code where a mutant can reach it.
//
// **§E is the reason two suites can prove one system.** `18 §2` forbids a cross-app integration
// test, so each app is proved against a real peer of the other's class. The residual risk is the
// classic one — both halves green, the pair broken — and it lives entirely in the CONFIGURATION
// the two ends must agree about. So §E pins that there is exactly ONE declaration of it, in a
// package both apps declare as a dependency. That is `01-F60`'s enabled-set drift with the names
// changed: two declarations of one truth, silently disagreeing, every gate green.
//
// **What this suite does NOT do:** it does not require mDNS (`01-F12` names a "manual IP fallback"
// and `18 §14` lists mDNS as an OPEN item, so demanding it would red every implementation an
// implementer may legally write); it does not pin the peer-directory string format (§E parses the
// module's OWN documented example instead); it does not assert LAN peer authentication (nothing in
// the corpus rules on it — `mesh-session.ts` says its hello arm "inspects no token" — and asserting
// an unstated policy is commandment 2).

import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { networkInterfaces, tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
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

// ⚠ THE IDS ARE THE TEST, as in the counter's suite. `01-F13` ranks by CLASS first and breaks ties
// by lowest device id. This screen's id sorts STRICTLY BELOW the counter's, so an implementation
// that ships the wrong `device_class` here — `counter_electron` copied from `apps/pos-electron`,
// the single most plausible slip when two files this similar are written in one session — wins the
// election and §B fails. With the ids the other way round it passes and proves nothing.
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

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** `01-F13` fixes re-election at "< 10 s" — the corpus's own patience for the mesh to settle. */
const CONNECT_BUDGET_MS = 10_000;

const waitFor = async (predicate: () => boolean, budgetMs: number): Promise<number> => {
  const started = Date.now();
  while (Date.now() - started < budgetMs) {
    if (predicate()) return Date.now() - started;
    await sleep(5);
  }
  return predicate() ? Date.now() - started : -1;
};

const lanAddress = (): string => {
  const found = Object.values(networkInterfaces())
    .flat()
    .find((a) => a !== undefined && a.family === "IPv4" && !a.internal);
  if (found === undefined) {
    throw new Error(
      "this machine has no non-loopback IPv4 address, so `01-F12`'s claim — devices discover each " +
        "other ON THE LAN — cannot be tested here. Failing rather than skipping: a green run on a " +
        "loopback-only host would report the branch LAN as working when it has not been exercised.",
    );
  }
  return found.address;
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

/**
 * Ring one order to `confirmed`, with a line, exactly as the counter does — INCLUDING the
 * `01-F15` fast-path call.
 *
 * ⚠ The `notifyAppended()` is load-bearing and was missing from the first draft of this file, which
 * is worth recording: without it the stand-in counter propagates only on its 2 s heartbeat, so §A's
 * p95 assertion would have measured the FIXTURE's omission and failed a correct pass-screen
 * implementation. `apps/pos-electron`'s suite is what holds the real counter to making this call;
 * here it is fixture fidelity, not the thing under test.
 */
const ringConfirmedOrder = (hub: Hub, device_id: string): string => {
  const store = hub.store;
  const order_id = newId();
  store.append(
    eventInput(device_id, "order.created", {
      order_id,
      order_type: "dine_in",
      channel: "counter",
    }),
  );
  store.append(
    eventInput(device_id, "order.line_added", {
      order_id,
      line_id: newId(),
      item_id: "item-karahi",
      qty: 2,
      unit_price_paisa: 45000,
    }),
  );
  store.append(eventInput(device_id, "order.confirmed", { order_id }));
  hub.session.notifyAppended();
  return order_id;
};

// ── discovery ────────────────────────────────────────────────────────────────────────────────

const APP_SRC = resolve(import.meta.dirname, "..", "..");
const APP_DIR = resolve(APP_SRC, "..");
const REPO_ROOT = resolve(APP_DIR, "..", "..");
const APPS_ROOT = join(REPO_ROOT, "apps");
const PACKAGES_ROOT = join(REPO_ROOT, "packages");

const SKIP_DIR = new Set(["node_modules", "dist", "out", ".next", ".turbo", ".oracle-typecheck"]);

const exists = (path: string): boolean => {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
};

const tsFilesUnder = (dir: string): string[] => {
  if (!exists(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIR.has(entry.name)) continue;
      out.push(...tsFilesUnder(join(dir, entry.name)));
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
};

const isTestFile = (file: string): boolean =>
  /\.test\.tsx?$/.test(file) || file.split(sep).includes("__acceptance__");

const rel = (path: string): string => relative(REPO_ROOT, path).split(sep).join("/");

/** Comments stripped before any count — "a mention is not an import" (`AGENTS.md`). Both apps
 * discuss the unhosted mesh at length in prose, and after the fix those comments will be rewritten
 * to say it IS hosted, which a raw substring search would read as a second construction. */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const shippedFilesIn = (root: string): string[] => tsFilesUnder(root).filter((f) => !isTestFile(f));

const meshHostFiles = (): string[] =>
  shippedFilesIn(APP_SRC)
    .filter((f) => /\bcreateMeshSession\s*\(/.test(stripComments(readFileSync(f, "utf8"))))
    .map((f) => rel(f));

/**
 * CALL SITES of `createLanMesh` in a file — the DECLARATION stripped first.
 *
 * ⚠ **THIS SHAPE WAS PUT HERE BY A MUTANT THAT SURVIVED.** The first draft asked whether any file
 * reachable from `main/index.ts` *was* the host module, and returned true the moment it saw one.
 * But `index.ts` reaches the host module by IMPORTING it, and an import is not a call — so the
 * mutant that matters most here (a correct, exported, fully-tested `createLanMesh` that `boot()`
 * never constructs) left the import in place and passed **17 of 17**. That is this wave's recurring
 * defect surviving inside the assertion written to catch it, which is the exact failure the round-3
 * law describes, and only mutation found it.
 *
 * It is also `pnpm seams:check`'s own recorded bug, one tool over: Rule B "required the caller to
 * *import* the name, so the declaring file could never be its own call site". Stripping the
 * declaration rather than excluding the declaring FILE is what keeps a host that constructs its own
 * mesh internally green, while still failing a factory nobody calls.
 */
const lanMeshCallSites = (src: string): number => {
  const withoutDeclaration = src.replace(/(?:export\s+)?const\s+createLanMesh\s*=/g, "const _d_ =");
  return (withoutDeclaration.match(/\bcreateLanMesh\s*\(/g) ?? []).length;
};

type Fact = "ok" | "degraded" | "down";

type LanMeshConfig = {
  listen_host: string;
  listen_port: number;
  peers: readonly { device_id: string; host: string; port: number }[];
};

type LanMesh = {
  reachability: () => { lan: Fact; hub: Fact };
  notifyAppended: () => void;
  stop: () => void;
};

type LanMeshModule = {
  createLanMesh: (opts: {
    store: DeviceStore;
    lan: LanMeshConfig | null | undefined;
    onChanged: () => void;
  }) => LanMesh;
};

/** ⚠ Computed specifier on purpose — a literal import of a module that does not exist yet would
 * fail `pnpm typecheck` for the whole repo, and a suite that arrives RED as a typecheck error
 * tells the implementing session nothing about what is missing (`24 §3`). */
const meshHost = async (): Promise<LanMeshModule> => {
  const hosts = meshHostFiles();
  expect(
    hosts,
    "no shipped file under apps/pass-kds/src constructs a mesh session. This screen therefore " +
      "learns about new orders ONLY over the WAN, which is what `uplink.ts`'s own header calls a " +
      "`00 §5.1` violation in effect: a branch whose internet drops has a pass screen that stops " +
      "learning about new orders while the counter goes on selling.",
  ).not.toEqual([]);
  expect(
    hosts,
    `${hosts.length} shipped files construct a mesh session (${hosts.join(", ")}). A device has ` +
      "one mesh session; two is two devices' worth of election traffic from one process.",
  ).toHaveLength(1);
  const file = join(REPO_ROOT, String(hosts[0]));
  const mod = (await import(pathToFileURL(file).href)) as Partial<LanMeshModule>;
  expect(
    typeof mod.createLanMesh,
    `${rel(file)} constructs a mesh session but does not export \`createLanMesh\`. A mesh built ` +
      "inline inside `boot()` cannot be driven by any suite — the shape that let " +
      "`createPinSession` ship with zero production callers and every gate green.",
  ).toBe("function");
  return mod as LanMeshModule;
};

// ── the real counter that stands in for apps/pos-electron ────────────────────────────────────

type Hub = { store: DeviceStore; session: MeshSession };

const cleanups: (() => void)[] = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

const openTempStore = (device_id: string): DeviceStore => {
  const dir = mkdtempSync(join(tmpdir(), "restos-lan-join-"));
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

/** A real `counter_electron` hub listening on `host:port`. Not a mock: real store, real sockets. */
const startCounterHub = (host: string, port: number): Hub => {
  const store = openTempStore(COUNTER_ID);
  const transport = createWsLanTransport({
    admission: PKI.admissionFor(COUNTER_ID),
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
  void host;
  return { store, session };
};

/** The screen's own projection (`03-F13`), read exactly as `main/index.ts` reads it. */
const ticketsOn = (store: DeviceStore) =>
  passQueue({
    store,
    name: (item_id) => item_id,
    aging: resolveAging(undefined),
    now: () => Date.now() + store.branchTimeStatus().offset_ms,
  });

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §A — THE ACCEPTANCE CRITERION, FROM THE COOK'S SIDE. An order confirmed on the counter appears
//      ON THE PASS QUEUE with no WAN anywhere in the process.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("§A 03-F13/00 §5.1 — the cook sees the counter's order with the WAN down", () => {
  it("an order.confirmed rung on the counter reaches THIS SCREEN's queue", async () => {
    // ⚠ ASSERTED ON `passQueue()`, NOT ON THE STORE. The store holding the event is necessary and
    // not sufficient: `passQueue` joins `kitchenQueue()` against `openOrders()` and DROPS a queue
    // row whose order it cannot find. A mesh that delivered `order.confirmed` but not the
    // `order.created` that precedes it would put a row in one projection, nothing on the glass,
    // and satisfy any assertion written against `readAllEvents()` or `kitchenQueue()` alone.
    const hubPort = await freePort();
    const hub = startCounterHub("0.0.0.0", hubPort);
    const passStore = openTempStore(PASS_ID);
    const { createLanMesh } = await meshHost();
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
      "the pass screen never became visible to the counter. `01-F12`'s manual-IP fallback is the " +
        "discovery mechanism this configuration uses; if the dial never lands there is no mesh.",
    ).toBeGreaterThan(-1);

    const order_id = ringConfirmedOrder(hub, COUNTER_ID);

    const arrived = await waitFor(
      () => ticketsOn(passStore).some((t) => t.order_id === order_id),
      CONNECT_BUDGET_MS,
    );
    expect(
      arrived,
      "the order never reached the pass queue. There is no gateway, no `RESTOS_CLOUD_URL` and no " +
        "cloud session in this process, so this is precisely the WAN-down state `00 §5.1` " +
        "governs — and the state `uplink.ts` names as the app's own open breach.",
    ).toBeGreaterThan(-1);

    const ticket = ticketsOn(passStore).find((t) => t.order_id === order_id);
    expect(ticket?.channel, "the card must carry the counter's channel (03-F13)").toBe("counter");
    expect(
      ticket?.lines.length,
      "the ticket reached the pass with no lines on it. A cook cannot cook a reference number — " +
        "`order.line_added` has to cross the LAN with the rest of the order.",
    ).toBe(1);
  });

  it("01-F15: the order arrives < 1 s p95 over a batch", async () => {
    // ⚠ THE FAST-PATH DISCRIMINATOR. `mesh-session.ts` re-fans its whole window to every follower
    // on each 2 s heartbeat, so an order arrives EVENTUALLY whatever the host does. MEASURED
    // against a plausible implementation with the fast path removed: 1519 ms for one order, and
    // uniform over the 2 s beat across many — so a single-sample "< 1 s" assertion is a coin flip
    // and would flake in both directions. p95 over a batch is the FR's own word and the sharp
    // discriminator: with the fast path, propagation measured ~11 ms.
    const hubPort = await freePort();
    const hub = startCounterHub("0.0.0.0", hubPort);
    const passStore = openTempStore(PASS_ID);
    const { createLanMesh } = await meshHost();
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
      const order_id = ringConfirmedOrder(hub, COUNTER_ID);
      const startedAt = Date.now();
      const seen = await waitFor(
        () => ticketsOn(passStore).some((t) => t.order_id === order_id),
        CONNECT_BUDGET_MS,
      );
      expect(seen, `order ${i + 1} of ${SAMPLES} never arrived at all`).toBeGreaterThan(-1);
      latencies.push(Date.now() - startedAt);
      await sleep(40);
    }
    latencies.sort((a, b) => a - b);
    const p95 = latencies[Math.min(latencies.length - 1, Math.ceil(0.95 * latencies.length) - 1)];
    expect(
      p95,
      `01-F15 requires "< 1 s p95"; this build's p95 over ${SAMPLES} orders was ${p95} ms ` +
        `(min ${latencies[0]}, max ${latencies.at(-1)}). A p95 near 2 s is the signature of ` +
        "delivery riding the heartbeat window re-fan instead of the fast path.",
    ).toBeLessThan(1_000);
  });

  it("01-F12: the pass reaches a hub on the branch NETWORK, not only on loopback", async () => {
    // ⚠ MEASURED FINDING. `packages/sync-client/src/transport-ws.ts` binds
    // `new WebSocketServer({ port: listen_port, host: "127.0.0.1" })` — hardcoded loopback — so a
    // hub is unreachable at its machine's own LAN address today. Verified with a control on
    // 2026-08-12: a `127.0.0.1` listener refuses a connection to this host's LAN IPv4 with
    // ECONNREFUSED; the same listener on `0.0.0.0` accepts it. A counter and a pass screen are
    // always two machines, so a mesh that only works between two processes on one box closes
    // nothing. `transport-ws.ts` is a PROTECTED PATH (`20 §4.4`) — the outcome is asserted, never
    // the bind string, because how the host gets a routable socket is a senior-reviewed call.
    const address = lanAddress();
    const hubPort = await freePort();
    const hub = startCounterHub(address, hubPort);
    const passStore = openTempStore(PASS_ID);
    const { createLanMesh } = await meshHost();
    const mesh = createLanMesh({
      store: passStore,
      lan: {
        listen_host: address,
        listen_port: await freePort(),
        peers: [{ device_id: COUNTER_ID, host: address, port: hubPort }],
      },
      onChanged: () => {},
    });
    cleanups.push(() => mesh.stop());

    expect(
      await waitFor(() => hub.session.status().peers.length > 0, CONNECT_BUDGET_MS),
      `the pass screen dialing ${address}:${hubPort} — this machine's real network address, the ` +
        "only kind a second physical device has — never reached the counter. `01-F12` places " +
        "discovery ON THE LAN.",
    ).toBeGreaterThan(-1);

    const order_id = ringConfirmedOrder(hub, COUNTER_ID);
    expect(
      await waitFor(
        () => ticketsOn(passStore).some((t) => t.order_id === order_id),
        CONNECT_BUDGET_MS,
      ),
      "the hub was reachable across the network address but no order crossed it",
    ).toBeGreaterThan(-1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §B — `01-F13`/`01-F39` THE PASS'S ROLE IN THE ELECTION.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("§B 01-F13/01-F39 — this screen is a kitchen device", () => {
  it("follows the counter even though this device's id sorts lower", async () => {
    // The aimed one. `PASS_ID` starts `aaaa-`, `COUNTER_ID` starts `zzzz-`. An implementation that
    // ships `device_class: "counter_electron"` here — copied from `apps/pos-electron`, the most
    // plausible slip when the two host modules are written together — WINS this election and takes
    // hub duty away from the till, which `01-F13` names the preferred hub. That would also make the
    // kitchen the branch time authority (`01-F43`) and its cloud uplink (`DEC-SYNC-009`), on a
    // device the deployment deliberately keeps off the internet.
    const hubPort = await freePort();
    const hub = startCounterHub("0.0.0.0", hubPort);
    const passStore = openTempStore(PASS_ID);
    const { createLanMesh } = await meshHost();
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
      await waitFor(() => hub.session.status().state === "hub", CONNECT_BUDGET_MS),
      `the counter did not take hub duty; it reports "${hub.session.status().state}". 01-F13 ` +
        "elects `counter_electron` above `kitchen` and breaks only TIES by lowest device id. If " +
        "the pass screen won this election it is not registering itself as a `kitchen` device.",
    ).toBeGreaterThan(-1);
    expect(
      hub.session.status().hub_id,
      "the counter must consider itself the hub of this two-device branch",
    ).toBe(COUNTER_ID);
    expect(
      mesh.reachability().hub,
      "with a counter serving as hub and this screen connected to it, `00 §5.7` wants `hub` " +
        "reported as reached",
    ).toBe("ok");
  });

  it("01-F39: alone on the branch it serves itself — a kitchen device is hub-eligible", async () => {
    // HUB-ELECTION.md: "Cold start: single eligible device → `solo` (acts as hub for later
    // joiners)", and `01-F39` puts `kitchen` inside the hub-eligible set. The realistic case is a
    // pass screen powered on before the till. It must not sit inert waiting, and it must not
    // refuse to start.
    const passStore = openTempStore(PASS_ID);
    const { createLanMesh } = await meshHost();
    const mesh = createLanMesh({
      store: passStore,
      lan: { listen_host: "0.0.0.0", listen_port: await freePort(), peers: [] },
      onChanged: () => {},
    });
    cleanups.push(() => mesh.stop());
    await sleep(500);
    expect(() => ticketsOn(passStore)).not.toThrow();
    expect(
      mesh.reachability().lan,
      "a kitchen device alone on the branch is hub-eligible and serving; `00 §5.7` must not " +
        "report a state this device is not in",
    ).not.toBe("ok");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §C — THE SEAM. Does the SHIPPED pass app build a mesh?
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("§C the seam — the pass app itself joins the mesh", () => {
  it("is actually reading the app it guards", () => {
    // ROUND-2 PATTERN 2: anchored on things unrelated to this work, so a broken walk fails HERE.
    const files = shippedFilesIn(APP_SRC).map((f) => rel(f));
    expect(files).toContain("apps/pass-kds/src/main/index.ts");
    expect(files).toContain("apps/pass-kds/src/main/uplink.ts");
    expect(readFileSync(join(REPO_ROOT, "apps/pass-kds/src/main/uplink.ts"), "utf8")).toContain(
      "createCloudSession({",
    );
  });

  it("a shipped module constructs both the mesh session and a LAN transport", () => {
    const hosts = meshHostFiles();
    expect(hosts).toHaveLength(1);
    expect(
      /\bcreateWsLanTransport\s*\(/.test(
        stripComments(readFileSync(join(REPO_ROOT, String(hosts[0])), "utf8")),
      ),
      `${hosts[0]} builds a mesh session but no LAN transport — a session whose transport seam ` +
        "nobody supplied has no sockets and meets no peers.",
    ).toBe(true);
  });

  it("main/index.ts REACHES it — the mesh is joined at boot, not merely joinable", () => {
    // The assertion that separates this from every prior instance of the wave's recurring defect:
    // a correct factory nothing calls is `createPinSession` with zero production callers.
    const host = String(meshHostFiles()[0]);
    const indexPath = join(REPO_ROOT, "apps/pass-kds/src/main/index.ts");
    const indexSrc = stripComments(readFileSync(indexPath, "utf8"));
    const reachable = new Set<string>([rel(indexPath)]);
    for (const spec of indexSrc.matchAll(/\bfrom\s*["'](\.[^"']+)["']/g)) {
      const target = resolve(join(indexPath, ".."), String(spec[1]));
      for (const candidate of [`${target}.ts`, `${target}.tsx`, join(target, "index.ts")]) {
        if (exists(candidate)) reachable.add(rel(candidate));
      }
    }
    const callSites = [...reachable].reduce(
      (total, f) =>
        total + lanMeshCallSites(stripComments(readFileSync(join(REPO_ROOT, f), "utf8"))),
      0,
    );
    expect(
      callSites > 0,
      `nothing main/index.ts reaches ever CALLS \`createLanMesh\` (host module: ${host}; ` +
        `${callSites} call sites found). ` +
        "`grep -arn 'createLanMesh' apps/pass-kds/src` is the closing evidence this asks for.",
    ).toBe(true);
  });

  it("the boot line stops telling the cook the cloud is the only path", () => {
    // `main/index.ts` prints, today: "uplink: cloud ... — and note it is the ONLY path: the LAN
    // ...". `00 §5.7` is about the device stating what is TRUE, and after this work that sentence
    // is false. A boot line that still says it would be the most direct kind of lie this product
    // can tell — the one printed on purpose, every launch.
    const src = readFileSync(join(REPO_ROOT, "apps/pass-kds/src/main/index.ts"), "utf8");
    expect(
      /ONLY path/.test(src),
      "apps/pass-kds/src/main/index.ts still prints that the cloud is the ONLY path by which " +
        "orders reach this screen. Once the LAN mesh is hosted that is untrue, and `00 §5.7` " +
        "makes the boot line a report rather than a slogan.",
    ).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §D — `00 §5.7` THE STRIP. `lan` and `hub` are hardcoded `"down"` in `uplink.ts` today.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("§D 00 §5.7 — lan and hub are reported, not asserted", () => {
  it("no LAN configured: down, and the screen still runs", async () => {
    const passStore = openTempStore(PASS_ID);
    const { createLanMesh } = await meshHost();
    const mesh = createLanMesh({ store: passStore, lan: null, onChanged: () => {} });
    cleanups.push(() => mesh.stop());
    expect(mesh.reachability()).toEqual({ lan: "down", hub: "down" });
    expect(() => ticketsOn(passStore)).not.toThrow();
    expect(() => mesh.stop()).not.toThrow();
  });

  it("connected to a hub: ok — from the SAME build", async () => {
    // ⚠ THE TWO-SIDED HALF. The assertion above passes against the shipped `lan: "down"` constants
    // — it IS the current code. Only both states from one build separate a report from a constant,
    // and a hardcoded `"ok"` is the same defect with the sign flipped and the more dangerous one:
    // the strip would promise a branch LAN that does not exist.
    const hubPort = await freePort();
    const hub = startCounterHub("0.0.0.0", hubPort);
    const passStore = openTempStore(PASS_ID);
    const { createLanMesh } = await meshHost();
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
    const settled = await waitFor(
      () => mesh.reachability().lan === "ok" && mesh.reachability().hub === "ok",
      CONNECT_BUDGET_MS,
    );
    expect(
      settled,
      `connected to a counter acting as hub, the strip still reports ` +
        `${JSON.stringify(mesh.reachability())}.`,
    ).toBeGreaterThan(-1);

    // ⚠ **AN `ok` THAT IS NOT BACKED BY A DELIVERED EVENT IS THE FACT LYING**, and this clause was
    // added because the suite's own throwaway implementation fell into it. `00 §5.7` asks for facts
    // that are TRUE, and a device can compute a hub, list it in `peers`, report `hub: "ok"` — and be
    // receiving nothing at all. MEASURED: a host that passed an EMPTY `token` to `createMeshSession`
    // reported `{ lan: "ok", hub: "ok" }` while its store held ZERO events, forever, with no error
    // anywhere. `hello` carries `token: z.string().min(1)` (`packages/sync-protocol/src/messages.ts`),
    // so an empty one fails `parseMessage` and the transport drops the frame in a bare `catch` — the
    // device is never admitted, and nothing on the wire, in a log or on the strip says so.
    //
    // Tying the fact to a delivered event is the only formulation that catches it, and it invents no
    // policy: it does not say what a tokenless device SHOULD do (the corpus does not rule on LAN
    // admission — `mesh-session.ts`'s own hello arm "inspects no token"), only that the strip must
    // not claim a working hub while no event can cross.
    const order_id = ringConfirmedOrder(hub, COUNTER_ID);
    expect(
      await waitFor(
        () => ticketsOn(passStore).some((t) => t.order_id === order_id),
        CONNECT_BUDGET_MS,
      ),
      "the strip reported `lan: ok` and `hub: ok` and then no order reached the pass queue.",
    ).toBeGreaterThan(-1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §E — ONE DECLARATION OF THE LAN CONFIGURATION.
//
// This is the section that makes two app-local suites add up to one branch. `18 §2` forbids the
// cross-app integration test that would otherwise prove the pair, so the residual risk is that both
// halves are green and the pair is broken — and that risk lives entirely in the configuration the
// two ends must agree about. `01-F60`'s enabled-set drift is the worked precedent: the axes the
// grid drew and the axes the writer checked were declared twice and disagreed silently, and
// restoring the second declaration failed 0 of 95 tests.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

type LanConfigModule = {
  /** The `00 §7` layer-3 keys, named by the module so a suite never hardcodes them (`IDENTITY_ENV`). */
  LAN_MESH_ENV: { listen_host: string; listen_port: string; peers: string };
  LAN_PEERS_EXAMPLE: string;
  resolveLanMesh: (env: Record<string, string | undefined>) => LanMeshConfig | null;
  describeLanMesh: (config: LanMeshConfig | null) => string;
};

type Home = { pkgName: string; pkgDir: string; file: string };

const packageSources = (): { pkgName: string; pkgDir: string; file: string; code: string }[] => {
  const out: { pkgName: string; pkgDir: string; file: string; code: string }[] = [];
  if (!exists(PACKAGES_ROOT)) return out;
  for (const entry of readdirSync(PACKAGES_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory() || SKIP_DIR.has(entry.name)) continue;
    const pkgDir = join(PACKAGES_ROOT, entry.name);
    const manifest = join(pkgDir, "package.json");
    if (!exists(manifest) || !exists(join(pkgDir, "src"))) continue;
    const pkgName = String(
      (JSON.parse(readFileSync(manifest, "utf8")) as { name?: string }).name ?? "",
    );
    for (const file of tsFilesUnder(join(pkgDir, "src"))) {
      if (isTestFile(file)) continue;
      out.push({ pkgName, pkgDir, file, code: stripComments(readFileSync(file, "utf8")) });
    }
  }
  return out;
};

/** Does this file DECLARE the symbol — exported or not? An unexported second copy is exactly the
 * failure `DEC-ARCH-001` extracted to prevent, and `seams:check` cannot see it either. */
const declaresSymbol = (code: string, name: string): boolean =>
  new RegExp(
    `^\\s*(?:export\\s+)?(?:const|let|var|class|function|async\\s+function|type|interface)\\s+${name}\\b`,
    "m",
  ).test(code);

const homeOf = (symbol: string): Home | undefined => {
  const hit = packageSources().find((c) => declaresSymbol(c.code, symbol));
  return hit === undefined
    ? undefined
    : { pkgName: hit.pkgName, pkgDir: hit.pkgDir, file: rel(hit.file) };
};

const lanConfigHome = (): Home => {
  const home = homeOf("resolveLanMesh");
  if (home === undefined) {
    throw new Error(
      "no file under packages/*/src declares `resolveLanMesh`. Both the counter and the pass " +
        "screen must resolve the SAME `00 §7` layer-3 LAN configuration, and `18 §2` forbids one " +
        "app importing another, so it cannot live in either app. DEC-ARCH-001 rules that a shared " +
        "implementation is EXTRACTED at the moment it acquires its second consumer; " +
        "`packages/device-config` already holds `resolveDeviceIdentity`, `resolveAging`, " +
        "`resolvePanelDensity` and `resolveServeSignal` for exactly this reason.",
    );
  }
  return home;
};

const lanConfigModule = async (): Promise<LanConfigModule> => {
  const home = lanConfigHome();
  const mod = (await import(home.pkgName)) as Partial<LanConfigModule>;
  expect(
    typeof mod.resolveLanMesh,
    `${home.pkgName} declares resolveLanMesh but does not export it from its public entry. A ` +
      "declaration a consumer cannot import is not an extraction.",
  ).toBe("function");
  return mod as LanConfigModule;
};

describe("§E 00 §7/DEC-ARCH-001 — one declaration of the branch LAN configuration", () => {
  it("resolveLanMesh is declared exactly once in the repo, and in a package", () => {
    const home = lanConfigHome();
    const everywhere = [
      ...packageSources()
        .filter((c) => declaresSymbol(c.code, "resolveLanMesh"))
        .map((c) => rel(c.file)),
      ...readdirSync(APPS_ROOT, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !SKIP_DIR.has(e.name))
        .flatMap((e) =>
          shippedFilesIn(join(APPS_ROOT, e.name, "src"))
            .filter((f) => declaresSymbol(stripComments(readFileSync(f, "utf8")), "resolveLanMesh"))
            .map((f) => rel(f)),
        ),
    ];
    expect(
      everywhere,
      `\`resolveLanMesh\` is declared in ${everywhere.length} file(s): ${everywhere.join(", ")}. ` +
        "Two declarations of the branch's peer directory is how the counter comes to listen on " +
        "one port while the pass dials another, with both apps' suites green — `01-F60`'s " +
        "enabled-set drift with the names changed.",
    ).toHaveLength(1);
    expect(home.file.startsWith("packages/")).toBe(true);
  });

  it("both apps DECLARE the package that owns it", () => {
    const home = lanConfigHome();
    for (const app of ["pos-electron", "pass-kds"]) {
      const manifest = JSON.parse(
        readFileSync(join(APPS_ROOT, app, "package.json"), "utf8"),
      ) as Record<string, Record<string, string> | undefined>;
      const deps = { ...(manifest.dependencies ?? {}), ...(manifest.devDependencies ?? {}) };
      expect(
        Object.keys(deps),
        `apps/${app} must declare ${home.pkgName}. A workspace package that resolves without ` +
          "being declared resolves by luck of the layout — the failure that reads as a broken " +
          "merge and is really an unlinked workspace.",
      ).toContain(home.pkgName);
    }
  });

  it("both apps RESOLVE their LAN configuration through it — neither reads the env itself", () => {
    // ⚠ SHIPPED FILES ONLY, and the reason is a measured mutant from the precedent suite: eleven
    // `apps/pos-electron` test files import `resolveAging`, so its PRODUCTION call site could be
    // deleted outright and the equivalent assertion stayed green, satisfied entirely by test
    // imports. A test import is not a device's boot.
    const home = lanConfigHome();
    for (const app of ["pos-electron", "pass-kds"]) {
      const reaches = shippedFilesIn(join(APPS_ROOT, app, "src")).some((f) =>
        /\bresolveLanMesh\s*\(/.test(stripComments(readFileSync(f, "utf8"))),
      );
      expect(
        reaches,
        `apps/${app}'s shipped code never calls resolveLanMesh (declared in ${home.pkgName}). An ` +
          `app that resolves the branch's ` +
          "LAN configuration somewhere else decides it somewhere else, and the two ends of one " +
          "mesh then disagree about the port, the bind address or the peer list with every gate " +
          "green.",
      ).toBe(true);
    }
  });

  it("00 §7: unset means NO mesh — a T1 single-till branch is the normal deployment", async () => {
    const { resolveLanMesh } = await lanConfigModule();
    expect(
      resolveLanMesh({}),
      "with no LAN keys set, `resolveLanMesh` must report that there is no mesh rather than " +
        "inventing a default port. `01-F17` and commandment 4: a single-terminal branch — the " +
        "overwhelmingly common deployment — must boot with nothing configured.",
    ).toBeNull();
  });

  it("it can parse its OWN documented example", async () => {
    // ⚠ THE FORMAT IS THE IMPLEMENTER'S CHOICE AND IS STILL TESTED. Pinning `id@host:port` here
    // would go RED against a correct implementation that chose JSON, which the round-3 law rates
    // exactly as damaging as a vacuous test. So the module exports the example an operator is
    // shown, and this asserts the parser accepts it and yields a usable directory. `00 §5.7` wants
    // the boot line to tell an operator what to type; an example that does not parse is worse than
    // none, and nothing else in the repo would ever catch that.
    const { resolveLanMesh, LAN_MESH_ENV, LAN_PEERS_EXAMPLE } = await lanConfigModule();
    expect(
      typeof LAN_PEERS_EXAMPLE,
      "`LAN_PEERS_EXAMPLE` is the documented peer-directory string. It exists so the format stays " +
        "the implementer's decision while remaining checkable, and so `describeLanMesh` has " +
        "something true to print.",
    ).toBe("string");
    const peersKey = LAN_MESH_ENV.peers;
    const portKey = LAN_MESH_ENV.listen_port;
    expect(
      typeof peersKey === "string" && typeof portKey === "string",
      "`LAN_MESH_ENV` must name the environment keys (the `IDENTITY_ENV` pattern), so a suite can " +
        "drive the resolver without hardcoding key names the implementer owns",
    ).toBe(true);
    const resolved = resolveLanMesh({
      [portKey]: "7311",
      [peersKey]: LAN_PEERS_EXAMPLE,
    });
    expect(
      resolved,
      "the module's own documented example resolved to no mesh at all",
    ).not.toBeNull();
    expect(resolved?.listen_port).toBe(7311);
    expect(
      resolved?.peers.length,
      "the documented example parsed to an EMPTY peer directory. `24-F14`: an empty match is a " +
        "failed assertion wearing a green costume — a device with no peers dials nobody.",
    ).toBeGreaterThan(0);
    for (const peer of resolved?.peers ?? []) {
      expect(typeof peer.device_id).toBe("string");
      expect(peer.device_id.length).toBeGreaterThan(0);
      expect(typeof peer.host).toBe("string");
      expect(peer.host.length).toBeGreaterThan(0);
      expect(Number.isInteger(peer.port) && peer.port > 0 && peer.port < 65_536).toBe(true);
    }
  });

  it("01-F17: a malformed peer directory REFUSES loudly and never silently half-applies", async () => {
    // The realistic operator error: one entry of three fat-fingered. `resolveDeviceIdentity` is the
    // house precedent and it REFUSES rather than falling back, with its reason stated: identity
    // keys the outbox and a typo that silently resolved to a default would be "a join key with no
    // error message". A peer directory has the same property — a device that silently dials
    // nothing looks exactly like a device whose peer is switched off.
    const { resolveLanMesh, LAN_MESH_ENV, LAN_PEERS_EXAMPLE } = await lanConfigModule();
    const peersKey = LAN_MESH_ENV.peers;
    const portKey = LAN_MESH_ENV.listen_port;
    const corrupted = `${LAN_PEERS_EXAMPLE},!!!not-a-peer!!!`;
    let refused = false;
    let result: LanMeshConfig | null = null;
    try {
      result = resolveLanMesh({ [portKey]: "7311", [peersKey]: corrupted });
    } catch {
      refused = true;
    }
    expect(
      refused || result === null,
      `\`${corrupted}\` was ACCEPTED. Either outcome is defensible — a throw at boot, as ` +
        "`resolveDeviceIdentity` does, or a null with the reason on the boot line — but silently " +
        "dropping the unreadable entry and meshing with the rest is not: the operator sees a " +
        "device that started and never learns the pass screen was never in the directory.",
    ).toBe(true);
  });

  it("01-F12: the resolved bind address is not forced to loopback", async () => {
    // The configuration half of the finding §A's LAN-address test asserts behaviourally. A resolver
    // that always answers `127.0.0.1` makes a branch LAN impossible however good the transport is.
    const { resolveLanMesh, LAN_MESH_ENV, LAN_PEERS_EXAMPLE } = await lanConfigModule();
    const resolved = resolveLanMesh({
      [LAN_MESH_ENV.listen_port]: "7311",
      [LAN_MESH_ENV.peers]: LAN_PEERS_EXAMPLE,
    });
    expect(
      resolved?.listen_host,
      "with only a port and a peer directory configured — what a branch actually sets — the bind " +
        "address resolved to loopback, so no other device on the branch can reach this hub. " +
        "`01-F12` places discovery ON THE LAN.",
    ).not.toBe("127.0.0.1");
  });

  it("00 §5.7: describeLanMesh states the configuration on the boot line", async () => {
    const { resolveLanMesh, describeLanMesh, LAN_MESH_ENV, LAN_PEERS_EXAMPLE } =
      await lanConfigModule();
    const none = describeLanMesh(null);
    expect(typeof none).toBe("string");
    expect(
      none.length,
      "a device with no mesh must SAY so at boot. `00 §5.7`'s whole point is that being wrong " +
        "about this looks exactly like being right: a pass screen with no peer directory shows an " +
        "empty queue, which is also what a quiet kitchen looks like.",
    ).toBeGreaterThan(0);
    const resolved = resolveLanMesh({
      [LAN_MESH_ENV.listen_port]: "7311",
      [LAN_MESH_ENV.peers]: LAN_PEERS_EXAMPLE,
    });
    expect(describeLanMesh(resolved)).toContain("7311");
  });
});
