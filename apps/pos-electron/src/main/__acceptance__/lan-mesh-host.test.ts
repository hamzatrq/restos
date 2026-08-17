// ACCEPTANCE TESTS — `01-F12`/`01-F13`/`01-F15`: THE COUNTER HOSTS THE BRANCH HUB.
//
// **AUTHORED FROM SPEC TEXT ONLY** (`24 §3` step 2). The author of this file wrote no production
// code for the host it describes and is disqualified from implementing it. Every claim below is
// traced to a quoted FR or a ratified `DECISIONS.md` row; where a reading had to be chosen, the
// choice is named AS a choice and the simpler alternative is stated (`24 §3b`).
//
// ── THE AUTHORITIES, QUOTED SO AN ASSERTION CAN BE ARGUED WITH ────────────────────────────────
//
//   01-F12  "Devices in a branch discover each other on the LAN (mDNS; manual IP fallback) and
//           exchange events directly while WAN is down."
//
//   01-F13  "One device acts as **branch hub** (deterministic election among the hub-eligible
//           classes of 01-F39: `counter_electron` > `counter_rn` > `kitchen`; ties broken by
//           lowest device id, compared lexicographically; re-election on hub loss < 10 s).
//           Non-hub devices connect to the hub (star); the hub relays events branch-wide..."
//
//   01-F15  "LAN propagation is fast-path: an event reaches all connected branch devices < 1 s
//           p95 (00 §5.3). Availability toggles and order state changes ride this path."
//           — `order.confirmed` is an order state change, which is why it is THIS suite's event.
//
//   01-F39  hub-eligible is exactly {`counter_electron`, `counter_rn`, `kitchen`}, "listed here in
//           01-F13 election-priority order". `kitchen` = "pass screen / KDS station, doc 03".
//
//   00 §5.1 "every in-branch function works with WAN down, indefinitely; branch LAN coordination
//           keeps working" — and commandment 4: no in-branch feature may require WAN.
//
//   00 §5.7 the honesty strip: three separate facts, each true, never collapsed into one.
//
//   HUB-ELECTION.md  "Cold start: single eligible device → `solo` (acts as hub for later
//           joiners)." / "every device computes the same winner locally from the same peer set".
//
// ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────────────────────────
//
// `packages/sync-client/src/mesh-session.ts:17` carries `@unreached-owed NO HOST RUNS THE LAN MESH
// YET`, and `hub-election.ts` and `transport-ws.ts` carry the same marker. The mesh is built and
// property-tested; the only construction of a mesh session anywhere in the repo is a gateway
// acceptance spike. `apps/pass-kds/src/main/uplink.ts` states the consequence in its own header:
// the cloud is "the ONLY path", so "a branch whose internet drops has a pass screen that stops
// learning about new orders while the counter goes on selling". That is a `00 §5.1` breach in
// effect, and it is this wave's recurring defect in its purest form — a correct subsystem with no
// seam to the product.
//
// So this suite asserts the PRODUCT property, not the package's. `packages/sync-client` already
// proves the mesh converges; nothing proves the counter RUNS one.
//
// ── THE CONTRACT THIS SUITE DEFINES, AND WHY IT DEFINES ONE ───────────────────────────────────
//
// `24 §3` puts acceptance tests before implementation, so a suite that must CONSTRUCT the host has
// to name it. Named here, minimally, with the reasoning:
//
//   `createLanMesh({ store, lan, onChanged }) => { reachability(), notifyAppended(), stop() }`
//
// exported from whichever shipped module under `src/` constructs the mesh. **The FILE is
// discovered, not pinned** (§C) — an implementer may reasonably put this in `main/sync.ts` beside
// the cloud uplink or in a `main/mesh.ts` of its own, and a suite that pinned the filename would go
// RED against a correct implementation, which the round-3 law rates exactly as damaging as a
// vacuous test.
//
// **`device_class` is deliberately NOT an option.** It is a property of the DEVICE, not a
// preference — `main/sync.ts` already hardcodes `counter_electron` for the cloud session with that
// exact reasoning — and making it a parameter would move the one value `01-F13`'s election turns on
// out of shipped code and into a test fixture, where §A3's mutant could never see it.
//
// **The simpler alternative, named and rejected:** fold the mesh into the existing `createUplink`.
// Rejected because `createUplink` returns `offline()` the moment `RESTOS_CLOUD_URL` is unset, so
// the LAN mesh would be born inside a WAN-conditional branch — which is precisely the commandment-4
// breach §A4 exists to catch, and building the trap into the contract would be perverse.
//
// ── WHAT THIS SUITE DELIBERATELY DOES NOT DO ──────────────────────────────────────────────────
//
// **It does not require mDNS.** `01-F12` reads "(mDNS; manual IP fallback)", so the manual-IP
// directory is a spec-sanctioned discovery mechanism and not an invention — and `18 §14` line 197
// lists "mDNS on Android (01 §9.1 LAN transport spike will force the native-module shape)" as an
// OPEN item rather than an allowlisted dependency. Adding an mDNS package is a `18 §15` process, so
// a suite demanding it would stay RED against every implementation an implementer is permitted to
// write. The mDNS half of `01-F12` is REPORTED as owed, not asserted.
//
// **It does not pin the peer-directory STRING FORMAT.** `§E` asserts the resolver can parse its own
// documented `LAN_PEERS_EXAMPLE` and refuses a corrupted one, so the format is the implementer's
// choice and the parser is still tested. A suite that hardcoded `id@host:port` would red a correct
// implementation that chose JSON.
//
// **It does not assert LAN peer AUTHENTICATION.** `mesh-session.ts` carries the token on `hello`
// and its own comment says the arm "inspects no token"; nothing in `01-F12`/`01-F13` rules on LAN
// admission. Asserting a policy the corpus does not state would be commandment 2. Reported, not
// tested.

import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { networkInterfaces, tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
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

// ── the identities under test ────────────────────────────────────────────────────────────────
//
// ⚠ **THE IDS ARE CHOSEN SO THE ELECTION CANNOT PASS BY ACCIDENT.** `01-F13` ranks by CLASS first
// and breaks ties by "lowest device id, compared lexicographically". The kitchen's id below sorts
// STRICTLY BELOW the counter's (`a…` < `z…`), so an implementation that ignored class and sorted by
// id alone — or one that shipped the wrong `device_class` on either side — elects the KITCHEN and
// §A3 fails. With the ids the other way round both implementations agree and §A3 proves nothing.
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

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Poll until `predicate` holds, or give up. Returns elapsed ms, or -1 if it never held. */
const waitFor = async (predicate: () => boolean, budgetMs: number): Promise<number> => {
  const started = Date.now();
  while (Date.now() - started < budgetMs) {
    if (predicate()) return Date.now() - started;
    await sleep(5);
  }
  return predicate() ? Date.now() - started : -1;
};

/**
 * The machine's own non-loopback IPv4 — what a second till on the branch LAN would have to dial.
 *
 * It FAILS rather than skips when there is none (`T-01-07`'s rule for an environment prerequisite:
 * fail loudly, never skip quietly). A machine with no LAN address cannot answer a question about
 * the LAN, and a green run on such a machine would be the most dangerous outcome available.
 */
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

/** Ring one order to `confirmed` on `store` and return its id. Two events, as the counter does. */
const ringConfirmedOrder = (store: DeviceStore, device_id: string): string => {
  const order_id = newId();
  store.append(
    eventInput(device_id, "order.created", {
      order_id,
      order_type: "dine_in",
      channel: "counter",
    }),
  );
  store.append(eventInput(device_id, "order.confirmed", { order_id }));
  return order_id;
};

// ── the module under test, DISCOVERED rather than pinned ─────────────────────────────────────

const APP_SRC = resolve(import.meta.dirname, "..", "..");
const APP_DIR = resolve(APP_SRC, "..");
const REPO_ROOT = resolve(APP_DIR, "..", "..");

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

/**
 * Comments stripped before ANY count. `AGENTS.md` records this as its own measurement mistake —
 * "a mention is not an import" — and this app is full of files that name `createMeshSession` in
 * prose while importing nothing: `main/sync.ts` and `apps/pass-kds/src/main/uplink.ts` both discuss
 * the unhosted mesh at length. A raw substring search cannot tell "constructs one" from "explains
 * why it does not", and after the fix those comments will be rewritten to say the mesh IS hosted —
 * which a substring search would read as a second construction.
 */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/** Every shipped (non-test) source file in this app. */
const shippedFiles = (): string[] => tsFilesUnder(APP_SRC).filter((f) => !isTestFile(f));

/** Shipped files whose comment-stripped source CONSTRUCTS a mesh session. */
const meshHostFiles = (): string[] =>
  shippedFiles()
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

/**
 * Load the app's mesh host from whichever shipped module declares it.
 *
 * ⚠ The specifier is a VARIABLE on purpose, and it is `shared-config-extraction.test.ts`'s reason
 * verbatim: the module does not exist until this lands, and a literal `import "../mesh"` would make
 * the whole repo fail `pnpm typecheck`. A suite that arrives RED as a typecheck failure rather than
 * as a named assertion tells the implementing session nothing about what is missing (`24 §3`).
 */
const meshHost = async (): Promise<LanMeshModule> => {
  const hosts = meshHostFiles();
  expect(
    hosts,
    "no shipped file under apps/pos-electron/src constructs a mesh session. `01-F13` makes the " +
      "counter terminal the preferred branch hub (`counter_electron` is first in the election " +
      "order) and `packages/sync-client/src/mesh-session.ts` carries `@unreached-owed NO HOST RUNS " +
      "THE LAN MESH YET`. Until this app calls `createMeshSession`, the branch has no hub and " +
      "`00 §5.1` is breached in effect: the pass screen learns about new orders only over the WAN.",
  ).not.toEqual([]);
  expect(
    hosts,
    `${hosts.length} shipped files construct a mesh session (${hosts.join(", ")}). A branch has ` +
      "ONE hub (`01-F13`) and a device has one mesh session; two constructions in one app is two " +
      "devices' worth of election traffic from one process, and `DEC-ARCH-001`'s standing " +
      "argument applies — a second implementation is a second interpretation, and they diverge " +
      "silently.",
  ).toHaveLength(1);
  const file = join(REPO_ROOT, String(hosts[0]));
  const mod = (await import(pathToFileURL(file).href)) as Partial<LanMeshModule>;
  expect(
    typeof mod.createLanMesh,
    `${rel(file)} constructs a mesh session but does not export \`createLanMesh\`. A host that ` +
      "builds its mesh inline inside `boot()` cannot be driven by any suite, which is how " +
      "`createPinSession` came to have zero production callers with every gate green — the " +
      "wave's recurring defect. The factory is the seam that makes the claim checkable.",
  ).toBe("function");
  return mod as LanMeshModule;
};

// ── the peer that stands in for the pass screen ──────────────────────────────────────────────
//
// Built from `@restos/sync-client` directly — the SAME protected package `apps/pass-kds` will use.
// It is not a mock: real `openStore`, real `createWsLanTransport`, real `createMeshSession`, real
// sockets. `18 §2` forbids one app importing another ("Apps NEVER import ... other apps"), so the
// counter's suite cannot import the pass app; it proves the counter's half against a real peer of
// the right class, and `apps/pass-kds/src/main/__acceptance__/lan-mesh-join.test.ts` proves the
// other half against a real hub. The two halves meet at `resolveLanMesh`, which §F pins as a single
// shared declaration precisely so they cannot drift apart.

type Peer = { store: DeviceStore; session: MeshSession; dir: string };

const cleanups: (() => void)[] = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

const openTempStore = (device_id: string): { store: DeviceStore; dir: string } => {
  const dir = mkdtempSync(join(tmpdir(), "restos-lan-mesh-"));
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
  return { store, dir };
};

/** A real `kitchen`-class peer dialing `host:port`. Started; caller awaits convergence. */
const startKitchenPeer = (host: string, port: number): Peer => {
  const { store, dir } = openTempStore(KITCHEN_ID);
  const transport = createWsLanTransport({
    admission: PKI.admissionFor(KITCHEN_ID),
    listen_port: 0,
    peers: [{ device_id: COUNTER_ID, host, port }],
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
  return { store, session, dir };
};

/**
 * Build the counter's mesh host on an ephemeral port and return it with the port it bound.
 *
 * `listen_port: 0` is the ephemeral-bind convention the gateway spike (`x10-device-entry.ts`) uses
 * and `createWsLanTransport` already supports; the bound port is read back through the transport's
 * `on_listening`. Because the host owns its transport, the suite discovers the port by probing the
 * `peers`-free config it was given — see `boundPortOf`.
 */
const CONNECT_BUDGET_MS = 10_000;

/**
 * `01-F13` fixes re-election at "< 10 s", so 10 s is the corpus's own patience for the mesh to
 * settle. Every convergence wait below uses it rather than a number invented here.
 */
const bindHostFor = (host: string, port: number): LanMeshConfig => ({
  listen_host: host,
  listen_port: port,
  peers: [],
});

/** An unused local TCP port, so the counter's hub can be dialed at a known address. */
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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §A — THE ACCEPTANCE CRITERION. An `order.confirmed` rung on the till reaches the pass screen
//      WITH THE WAN DOWN.
//
// "WAN down" is realised by there being no gateway, no `RESTOS_CLOUD_URL` and no cloud session
// ANYWHERE in this process. Nothing here can quietly route through the cloud, because there is no
// cloud to route through — which is the only way to prove a LAN claim.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("§A 01-F15/00 §5.1 — the order crosses the branch LAN with no WAN at all", () => {
  it("an order.confirmed rung on the counter reaches a kitchen peer's queue", async () => {
    const { store: counterStore } = openTempStore(COUNTER_ID);
    const { createLanMesh } = await meshHost();
    const port = await freePort();
    const mesh = createLanMesh({
      store: counterStore,
      lan: bindHostFor("0.0.0.0", port),
      onChanged: () => {},
    });
    cleanups.push(() => mesh.stop());

    const peer = startKitchenPeer("127.0.0.1", port);
    const converged = await waitFor(
      () => peer.session.status().hub_id === COUNTER_ID,
      CONNECT_BUDGET_MS,
    );
    expect(
      converged,
      "the kitchen peer never adopted the counter as its hub. `01-F13` gives re-election a < 10 s " +
        "budget and this is a cold join on loopback, so a device that has not converged in 10 s " +
        "is not slow — it is not meshing at all.",
    ).toBeGreaterThan(-1);

    const order_id = ringConfirmedOrder(counterStore, COUNTER_ID);
    mesh.notifyAppended();

    const elapsed = await waitFor(
      () => peer.store.kitchenQueue().some((r) => r.order_id === order_id),
      CONNECT_BUDGET_MS,
    );
    expect(
      elapsed,
      "the order the counter confirmed never reached the kitchen device over the LAN. There is no " +
        "gateway and no cloud session in this process, so this is exactly the state `00 §5.1` " +
        "governs — WAN down, branch LAN coordination still working — and it is the state " +
        "`apps/pass-kds/src/main/uplink.ts` names as broken today: the pass screen stops learning " +
        "about new orders while the counter goes on selling.",
    ).toBeGreaterThan(-1);
  });

  it("01-F15: LAN propagation is < 1 s p95 — the FAST PATH, not the heartbeat", async () => {
    // ⚠ **THE ASSERTION THAT OWNS `notifyAppended`, AND IT IS AIMED.** A host that builds the mesh
    // correctly and never calls `notifyAppended` still delivers — `mesh-session.ts` re-fans its
    // whole window to every follower on each heartbeat, so the order arrives on the next beat.
    // MEASURED against a plausible implementation with the call removed: **1519 ms** for a single
    // order, and uniformly distributed over the 2 s `HEARTBEAT_INTERVAL_MS` across many. So a
    // single-sample "< 1 s" assertion is a COIN FLIP and would be flaky in both directions.
    //
    // p95 over a batch is both the FR's own word ("< 1 s p95") and the sharp discriminator: with
    // the fast path the measured propagation was ~11 ms, without it the p95 approaches 2 s.
    const { store: counterStore } = openTempStore(COUNTER_ID);
    const { createLanMesh } = await meshHost();
    const port = await freePort();
    const mesh = createLanMesh({
      store: counterStore,
      lan: bindHostFor("0.0.0.0", port),
      onChanged: () => {},
    });
    cleanups.push(() => mesh.stop());
    const peer = startKitchenPeer("127.0.0.1", port);
    expect(
      await waitFor(() => peer.session.status().hub_id === COUNTER_ID, CONNECT_BUDGET_MS),
    ).toBeGreaterThan(-1);

    const SAMPLES = 20;
    const latencies: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const order_id = ringConfirmedOrder(counterStore, COUNTER_ID);
      const startedAt = Date.now();
      mesh.notifyAppended();
      const seen = await waitFor(
        () => peer.store.kitchenQueue().some((r) => r.order_id === order_id),
        CONNECT_BUDGET_MS,
      );
      expect(seen, `order ${i + 1} of ${SAMPLES} never arrived at all`).toBeGreaterThan(-1);
      latencies.push(Date.now() - startedAt);
      // A gap between rings so each order is a fresh measurement rather than a batch riding one
      // frame — otherwise 20 orders appended in 3 ms all land together and the p95 is meaningless.
      await sleep(40);
    }
    latencies.sort((a, b) => a - b);
    const p95 = latencies[Math.min(latencies.length - 1, Math.ceil(0.95 * latencies.length) - 1)];
    expect(
      p95,
      `01-F15 requires "< 1 s p95" and this build's p95 over ${SAMPLES} confirmed orders was ` +
        `${p95} ms (min ${latencies[0]}, max ${latencies.at(-1)}). A p95 near 2 s is the signature ` +
        "of a host that never calls `notifyAppended`: delivery then waits for the next 2 s " +
        "heartbeat window re-fan instead of riding the fast path the FR describes.",
    ).toBeLessThan(1_000);
  });

  it("00 §5.1: the mesh runs with NO cloud configuration whatsoever", async () => {
    // ⚠ AIMED AT THE MOST PLAUSIBLE WRONG IMPLEMENTATION IN THIS APP. `main/sync.ts`'s
    // `createUplink` returns `offline()` — no session, no timer — the moment `RESTOS_CLOUD_URL` is
    // unset, and the obvious place to "add the mesh" is inside that same factory, below that early
    // return. An implementation that does so builds the LAN mesh only when a WAN endpoint is
    // configured, which inverts commandment 4 exactly: the offline-first path would be the one
    // that requires the cloud.
    //
    // No env var is set here and no cloud object exists in this process; if the mesh needs one,
    // this fails.
    const { store: counterStore } = openTempStore(COUNTER_ID);
    const { createLanMesh } = await meshHost();
    const port = await freePort();
    const mesh = createLanMesh({
      store: counterStore,
      lan: bindHostFor("0.0.0.0", port),
      onChanged: () => {},
    });
    cleanups.push(() => mesh.stop());
    const peer = startKitchenPeer("127.0.0.1", port);
    expect(
      await waitFor(() => peer.session.status().hub_id === COUNTER_ID, CONNECT_BUDGET_MS),
      "the branch elected no hub with the cloud absent. `00 §5.1`: branch LAN coordination keeps " +
        "working with WAN down, indefinitely — the mesh must not be conditional on a gateway URL.",
    ).toBeGreaterThan(-1);

    const order_id = ringConfirmedOrder(counterStore, COUNTER_ID);
    mesh.notifyAppended();
    expect(
      await waitFor(
        () => peer.store.kitchenQueue().some((r) => r.order_id === order_id),
        CONNECT_BUDGET_MS,
      ),
    ).toBeGreaterThan(-1);
  });

  it("01-F13: the COUNTER is hub even though the kitchen's device_id sorts lower", async () => {
    // ⚠ **THE ELECTION ASSERTION, AND THE IDS ARE THE TEST.** `01-F13` ranks by CLASS first
    // (`counter_electron` > `counter_rn` > `kitchen`) and only then by "lowest device id".
    // `KITCHEN_ID` starts `aaaa-` and `COUNTER_ID` starts `zzzz-`, so:
    //   • a host shipping the wrong `device_class` (e.g. `kitchen` copied from the pass app, or the
    //     pass shipping `counter_electron` copied from here) elects the KITCHEN — this fails;
    //   • an election that ignored class and sorted by id alone elects the KITCHEN — this fails.
    // With the ids the other way round BOTH wrong implementations elect the counter and this
    // assertion is vacuous. That is the round-3 failure in one line, so it is stated here.
    const { store: counterStore } = openTempStore(COUNTER_ID);
    const { createLanMesh } = await meshHost();
    const port = await freePort();
    const mesh = createLanMesh({
      store: counterStore,
      lan: bindHostFor("0.0.0.0", port),
      onChanged: () => {},
    });
    cleanups.push(() => mesh.stop());
    const peer = startKitchenPeer("127.0.0.1", port);

    // ⚠ WAIT ON *SEEING THE COUNTER*, NOT ON `hub_id !== null` — the first draft did the latter and
    // it was RED AGAINST A CORRECT IMPLEMENTATION, which the round-3 law rates exactly as damaging
    // as a vacuous test. `kitchen` is hub-eligible (`01-F39`), so a cold-started pass device is
    // `solo` with `hub_id` already set to ITSELF; the predicate was therefore satisfied before the
    // counter was ever visible, and the assertion below raced the election it was meant to measure.
    expect(
      await waitFor(() => peer.session.status().peers.length > 0, CONNECT_BUDGET_MS),
      "the kitchen never even saw the counter, so no election ran",
    ).toBeGreaterThan(-1);
    // The election is a pure function re-run synchronously on the peer-set change; this settle is
    // for the hello/hello_ack round trip behind `state`, measured at ~11 ms on loopback.
    await sleep(500);
    expect(
      peer.session.status().hub_id,
      `the kitchen adopted ${peer.session.status().hub_id} as hub. 01-F13 elects among the ` +
        "hub-eligible classes in the order `counter_electron` > `counter_rn` > `kitchen`, and " +
        "only breaks TIES by lowest device id. The kitchen's id sorts below the counter's here " +
        "on purpose: electing the kitchen means the host shipped the wrong device_class, or the " +
        "election read the id before the class.",
    ).toBe(COUNTER_ID);
    expect(
      peer.session.status().state,
      "the kitchen must be a FOLLOWER while a counter_electron is visible (01-F13 star topology)",
    ).toBe("follower");
  });

  it("01-F8/26: the peer's projection of the order matches the counter's own", async () => {
    // Both devices fold the same events, so both screens must say the same thing about the same
    // order. This is the property a host can break without breaking delivery — by re-ordering,
    // re-authoring or partially relaying — and neither the arrival assertion above nor the p95 one
    // would notice.
    const { store: counterStore } = openTempStore(COUNTER_ID);
    const { createLanMesh } = await meshHost();
    const port = await freePort();
    const mesh = createLanMesh({
      store: counterStore,
      lan: bindHostFor("0.0.0.0", port),
      onChanged: () => {},
    });
    cleanups.push(() => mesh.stop());
    const peer = startKitchenPeer("127.0.0.1", port);
    expect(
      await waitFor(() => peer.session.status().hub_id === COUNTER_ID, CONNECT_BUDGET_MS),
    ).toBeGreaterThan(-1);

    const order_id = ringConfirmedOrder(counterStore, COUNTER_ID);
    mesh.notifyAppended();
    expect(
      await waitFor(
        () => peer.store.kitchenQueue().some((r) => r.order_id === order_id),
        CONNECT_BUDGET_MS,
      ),
    ).toBeGreaterThan(-1);

    const here = counterStore.kitchenQueue().find((r) => r.order_id === order_id);
    const there = peer.store.kitchenQueue().find((r) => r.order_id === order_id);
    expect(
      there,
      "the order is in the counter's queue and not the kitchen's after delivery reported success",
    ).toBeDefined();
    expect(
      there,
      "the two devices project the SAME order differently. `01-F34`/`26` make every fold a " +
        "function of the events alone — no ordering metadata, no device clock — so two devices " +
        "holding the same events must render the same row. A difference here means the host " +
        "re-authored or re-stamped something in transit, which `01-F1` forbids outright.",
    ).toEqual(here);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §B — `01-F12` SAYS **ON THE LAN**, AND LOOPBACK IS NOT A LAN.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("§B 01-F12 — a second device on the branch network can reach this hub", () => {
  it("a peer dialing this machine's non-loopback address reaches the hub", async () => {
    // ⚠ **MEASURED FINDING, NOT A HYPOTHETICAL.** `packages/sync-client/src/transport-ws.ts`
    // currently binds `new WebSocketServer({ port: listen_port, host: "127.0.0.1" })` — a HARDCODED
    // loopback bind — so today a hub is unreachable at the machine's own LAN address. Verified with
    // a control on 2026-08-12: a listener bound to `127.0.0.1` refuses a connection to the host's
    // LAN IPv4 with `ECONNREFUSED`, and the identical listener bound to `0.0.0.0` accepts it. Two
    // mesh sessions dialing across that address both stayed `solo` and never saw each other.
    //
    // This is why the suite asserts the OUTCOME (a peer on the network can reach the hub) rather
    // than any particular bind string: `transport-ws.ts` is a PROTECTED PATH (`20 §4.4`) and how
    // the host gets a routable socket is the implementer's call, reviewed by a senior. What is not
    // optional is that `01-F12`'s sentence — devices "in a branch discover each other on the LAN" —
    // is true of the shipped product. A mesh that works only between two processes on one machine
    // closes nothing: a branch's counter and its pass screen are two machines.
    const address = lanAddress();
    const { store: counterStore } = openTempStore(COUNTER_ID);
    const { createLanMesh } = await meshHost();
    const port = await freePort();
    const mesh = createLanMesh({
      store: counterStore,
      lan: bindHostFor(address, port),
      onChanged: () => {},
    });
    cleanups.push(() => mesh.stop());

    const peer = startKitchenPeer(address, port);
    expect(
      await waitFor(() => peer.session.status().hub_id === COUNTER_ID, CONNECT_BUDGET_MS),
      `a kitchen device dialing ${address}:${port} — this machine's real network address, which ` +
        "is what a second till on the branch LAN would have to use — never reached the hub. " +
        "`01-F12` places discovery ON THE LAN; a hub reachable only over loopback leaves the " +
        "counter and the pass screen unable to mesh whenever they are, as they always are, two " +
        "different machines.",
    ).toBeGreaterThan(-1);

    const order_id = ringConfirmedOrder(counterStore, COUNTER_ID);
    mesh.notifyAppended();
    expect(
      await waitFor(
        () => peer.store.kitchenQueue().some((r) => r.order_id === order_id),
        CONNECT_BUDGET_MS,
      ),
      "the hub was reachable over the network address but the order did not cross it",
    ).toBeGreaterThan(-1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §C — THE SEAM. Does the SHIPPED APP build a mesh, or only this suite?
//
// This is the section the wave's recurring defect is about: every instance of it had green tests
// and a subsystem the product never reached. `pnpm seams:check` cannot answer it here — once the
// host calls `createMeshSession` the export is reached and Rule A is satisfied, whether or not
// `boot()` ever constructs the host.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("§C the seam — the counter app itself runs a mesh", () => {
  it("is actually reading the app it guards", () => {
    // ROUND-2 PATTERN 2, "the guard passed by not looking". Anchored on things that have nothing to
    // do with this work, so a broken walk fails here rather than passing everything below.
    const files = shippedFiles().map((f) => rel(f));
    expect(files).toContain("apps/pos-electron/src/main/index.ts");
    expect(files).toContain("apps/pos-electron/src/main/sync.ts");
    expect(readFileSync(join(REPO_ROOT, "apps/pos-electron/src/main/sync.ts"), "utf8")).toContain(
      "createCloudSession({",
    );
  });

  it("a shipped module constructs both the mesh session and a LAN transport", () => {
    const hosts = meshHostFiles();
    expect(
      hosts,
      "no shipped module constructs `createMeshSession`. See the failure text in `meshHost()`.",
    ).toHaveLength(1);
    const src = stripComments(readFileSync(join(REPO_ROOT, String(hosts[0])), "utf8"));
    expect(
      /\bcreateWsLanTransport\s*\(/.test(src),
      `${hosts[0]} builds a mesh session but never builds a LAN transport. A session over a ` +
        "transport nobody supplied has no sockets and meets no peers — the `Rule B` shape of this " +
        "wave's recurring defect, an optional seam left unsupplied.",
    ).toBe(true);
  });

  it("main/index.ts REACHES that module — the mesh is built at boot, not merely buildable", () => {
    // ⚠ THE ASSERTION THAT SEPARATES THIS FROM EVERY PREVIOUS INSTANCE OF THE DEFECT. A factory
    // that exists, is correct, is unit-tested and is never called from `boot()` is precisely
    // `createPinSession` with zero production callers, `createSpooler` with no store, and
    // `notifyCatalogVersion` with no caller. The register is littered with them.
    const host = String(meshHostFiles()[0]);
    const indexPath = join(REPO_ROOT, "apps/pos-electron/src/main/index.ts");
    const indexSrc = stripComments(readFileSync(indexPath, "utf8"));

    // The module may be reached directly from index.ts, or through one module index.ts imports —
    // both are "built at boot". Walking one hop keeps a legitimate `main/sync.ts`-composes-it
    // arrangement green without accepting an unreferenced file.
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
        `${callSites} call sites found). The ` +
        "mesh would then be a correct, tested subsystem the product never constructs — the " +
        "wave's recurring defect, fourteen recorded instances, every one with green tests. " +
        "`grep -arn 'createLanMesh' apps/pos-electron/src` is the closing evidence this asks for.",
    ).toBe(true);
  });

  it("01-F15: the host calls notifyAppended on the mesh, not only on the cloud session", () => {
    // `main/sync.ts` already learned this lesson once for the cloud session — see
    // `uplink-push-seam.test.ts`, where `notifyAppended` had zero production callers and a till
    // pushed its outbox at connect and never again. The mesh has the same member for the same
    // reason and can acquire the same defect; §A2's p95 catches it behaviourally, and this catches
    // it by name so the failure message points at the line.
    const host = String(meshHostFiles()[0]);
    const src = stripComments(readFileSync(join(REPO_ROOT, host), "utf8"));
    expect(
      /\bnotifyAppended\s*\(/.test(src),
      `${host} never calls \`notifyAppended\`. \`mesh-session.ts\` names it the "Host-app fast ` +
        'path (01-F15): an event was durably appended — propagate now". Without it delivery ' +
        "falls back to the 2 s heartbeat window re-fan, measured at 1519 ms for a single order, " +
        'and `01-F15` requires "< 1 s p95".',
    ).toBe(true);
  });

  it("the seams register no longer claims the mesh is unhosted", () => {
    // `pnpm seams:check` FAILS if an `@unreached-owed` marker sits on something now reached, so
    // leaving these in place turns a correct implementation RED — the register self-corrects and
    // deleting them is part of the work. Asserted here so the requirement is visible at the point
    // of failure rather than only in the rail's output.
    const owed = ["mesh-session.ts", "hub-election.ts", "transport-ws.ts"]
      .map((f) => join(REPO_ROOT, "packages/sync-client/src", f))
      .filter((f) => exists(f))
      .filter((f) => /@unreached-owed[^\n]*(?:MESH|mesh|LAN)/.test(readFileSync(f, "utf8")))
      .map((f) => rel(f));
    expect(
      owed,
      `these still carry an \`@unreached-owed\` marker naming the unhosted mesh: ${owed.join(", ")}. ` +
        "A marker on something now reached FAILS `pnpm seams:check`, so this is not cosmetic — " +
        "and the register is the product's own count of how far the kernel runs ahead of its apps.",
    ).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §D — `00 §5.7` THE HONESTY STRIP. `lan` and `hub` are hardcoded `"down"` today, in both apps,
//      with a comment saying so. A constant is not a report — in EITHER direction.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("§D 00 §5.7 — lan and hub are reported, not asserted", () => {
  it("a device with no LAN configured reports lan down and hub down, and still runs", async () => {
    // `01-F17` / commandment 4: a T1 single-terminal branch is the normal deployment, not an
    // error state. It must boot with no mesh configuration at all and say so honestly.
    const { store } = openTempStore(COUNTER_ID);
    const { createLanMesh } = await meshHost();
    const mesh = createLanMesh({ store, lan: null, onChanged: () => {} });
    cleanups.push(() => mesh.stop());
    expect(mesh.reachability()).toEqual({ lan: "down", hub: "down" });
    expect(() => mesh.notifyAppended()).not.toThrow();
    expect(() => mesh.stop()).not.toThrow();
  });

  it("a converged hub reports lan ok and hub ok — from the SAME build", async () => {
    // ⚠ THE TWO-SIDED HALF, AND IT IS THE POINT. The assertion above passes trivially against the
    // shipped `lan: "down", hub: "down"` constants — they are literally the current code. Only
    // running BOTH states through one build can tell a report from a constant, in either
    // direction: a host that hardcodes `"ok"` is the same defect with the sign flipped, and it is
    // the more dangerous one, because the strip would claim a branch LAN that does not exist.
    const { store: counterStore } = openTempStore(COUNTER_ID);
    const { createLanMesh } = await meshHost();
    const port = await freePort();
    const mesh = createLanMesh({
      store: counterStore,
      lan: bindHostFor("0.0.0.0", port),
      onChanged: () => {},
    });
    cleanups.push(() => mesh.stop());
    const peer = startKitchenPeer("127.0.0.1", port);
    expect(
      await waitFor(() => peer.session.status().hub_id === COUNTER_ID, CONNECT_BUDGET_MS),
    ).toBeGreaterThan(-1);
    const settled = await waitFor(
      () => mesh.reachability().lan === "ok" && mesh.reachability().hub === "ok",
      CONNECT_BUDGET_MS,
    );
    expect(
      settled,
      `with a kitchen device connected and the hub elected, the strip still reports ` +
        `${JSON.stringify(mesh.reachability())}. \`00 §5.7\` wants three facts each of which is ` +
        "TRUE; this device is serving as branch hub to a connected follower.",
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
    const order_id = ringConfirmedOrder(counterStore, COUNTER_ID);
    mesh.notifyAppended();
    expect(
      await waitFor(
        () => peer.store.kitchenQueue().some((r) => r.order_id === order_id),
        CONNECT_BUDGET_MS,
      ),
      "the strip reported `lan: ok` and `hub: ok` and then no event crossed the mesh. The facts " +
        "`00 §5.7` asks for are about what this device can actually do, not about what it has " +
        "computed about its neighbours.",
    ).toBeGreaterThan(-1);
  });

  it("the shipped strip stops hardcoding lan and hub", () => {
    // `main/sync.ts` today returns `lan: "down", hub: "down"` as literals with a comment admitting
    // it ("LAN and hub are the MESH's facts and the mesh is not wired yet"). After this work the
    // facts must come from the mesh. Expressed as "no literal `lan:`/`hub:` pair survives in a
    // reachability result" rather than against any particular expression, so a correct
    // implementation is free to compose them however it likes.
    const offenders = shippedFiles()
      .filter((f) => {
        const src = stripComments(readFileSync(f, "utf8"));
        return (
          /\blan\s*:\s*"(?:ok|degraded|down)"/.test(src) &&
          /\bhub\s*:\s*"(?:ok|degraded|down)"/.test(src)
        );
      })
      .map((f) => rel(f))
      // The `offline()` object — a device with NO mesh configured — is legitimately constant:
      // `lan: "down"` is not an assumption there, it is the whole truth about that device.
      .filter((f) => {
        const src = stripComments(readFileSync(join(REPO_ROOT, f), "utf8"));
        const pairs = src.match(/\blan\s*:\s*"(?:ok|degraded|down)"/g) ?? [];
        return pairs.length > 1;
      });
    expect(
      offenders,
      `these shipped files still decide lan/hub with literals in more than one place: ` +
        `${offenders.join(", ")}. One constant pair is the honest "this device has no mesh" ` +
        "answer; two means a device WITH a mesh is also being told what to report.",
    ).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §E — `01-F17` / commandment 4. Nothing about the LAN may take the till down.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("§E 01-F17 — a sale is never blocked by the mesh", () => {
  it("a hub with no peers still serves solo, and the counter keeps appending", async () => {
    // HUB-ELECTION.md: "Cold start: single eligible device → `solo` (acts as hub for later
    // joiners)." A counter alone on the branch is the T1 deployment and the overwhelmingly common
    // one; it must ring orders with nobody listening.
    const { store } = openTempStore(COUNTER_ID);
    const { createLanMesh } = await meshHost();
    const port = await freePort();
    const mesh = createLanMesh({
      store,
      lan: bindHostFor("0.0.0.0", port),
      onChanged: () => {},
    });
    cleanups.push(() => mesh.stop());
    const order_id = ringConfirmedOrder(store, COUNTER_ID);
    expect(() => mesh.notifyAppended()).not.toThrow();
    expect(
      store.kitchenQueue().some((r) => r.order_id === order_id),
      "the counter could not confirm an order while alone on the mesh. `01-F17`: a sale is never " +
        "blocked — not by inventory math, not by sync, not by an empty branch.",
    ).toBe(true);
  });

  it("an unreachable configured peer never blocks the till", async () => {
    // The realistic failure: the pass screen is switched off, or its IP changed. The counter dials
    // into nothing and must go on selling. `transport-ws.ts` retries every 250 ms forever by
    // design, so what is asserted is that the retry loop is harmless, not that it stops.
    const { store } = openTempStore(COUNTER_ID);
    const { createLanMesh } = await meshHost();
    const port = await freePort();
    const dead = await freePort();
    const mesh = createLanMesh({
      store,
      lan: {
        listen_host: "0.0.0.0",
        listen_port: port,
        peers: [{ device_id: "a-device-that-is-switched-off", host: "127.0.0.1", port: dead }],
      },
      onChanged: () => {},
    });
    cleanups.push(() => mesh.stop());
    await sleep(1_000); // several dial-retry cycles at the 250 ms LAN cadence
    const order_id = ringConfirmedOrder(store, COUNTER_ID);
    mesh.notifyAppended();
    expect(store.kitchenQueue().some((r) => r.order_id === order_id)).toBe(true);
    expect(
      mesh.reachability().lan,
      "a configured peer that never answers is not a working LAN, and `00 §5.7` would rather say " +
        "so than show a green dot. `degraded` and `down` are both honest here; `ok` is not.",
    ).not.toBe("ok");
  });

  it("stop() releases the listen port — nothing outlives will-quit", async () => {
    // `main/index.ts` binds the cloud uplink's `stop()` to `will-quit`; the mesh holds a LISTENING
    // socket as well as dial timers, so a leak here keeps a port bound and the next launch cannot
    // rebind it. Asserted by rebinding the port after `stop()`.
    const { store } = openTempStore(COUNTER_ID);
    const { createLanMesh } = await meshHost();
    const port = await freePort();
    const mesh = createLanMesh({
      store,
      lan: bindHostFor("0.0.0.0", port),
      onChanged: () => {},
    });
    await sleep(300);
    mesh.stop();
    await sleep(300);
    const { createServer } = await import("node:net");
    const rebound = await new Promise<boolean>((res) => {
      const s = createServer();
      s.on("error", () => res(false));
      s.listen(port, "0.0.0.0", () => s.close(() => res(true)));
    });
    expect(
      rebound,
      `port ${port} was still bound after stop(). The mesh owns a WebSocketServer and dial ` +
        "retry timers; leaving either alive holds the socket past app shutdown and the next " +
        "launch of the till fails to bind its own hub port.",
    ).toBe(true);
    expect(() => mesh.stop()).not.toThrow();
  });
});
