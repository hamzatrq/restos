// X10 — real-process smoke (T-01-06 real-core leg, contract (g) "X10"; DEC block
// point 2). Authored by the TEST-OWNING session (24 §3 step 2) from the T-01-06
// binding contract only. Green X10 resolves 01 §9-Q1 (plain WebSocket).
//
// THREE real device child processes (tsx) — counter_electron (hub) + counter_rn +
// kitchen — each with a REAL SQLite file, a REAL LAN WebSocket mesh (hub serves /
// followers dial over loopback), and a REAL cloud WebSocket to a REAL buildServer on
// an ephemeral port → Testcontainers Postgres. The parent scripts a rush across all
// three (including one U+0000 event → real storage_reject end-to-end), CUTS WAN by
// closing the gateway listener mid-run, SIGKILLs the hub child mid-print (printer
// hold coordinated over IPC), then RESPAWNS the hub + re-listens the gateway on the
// same port/PG; devices re-hello and resume. It then asserts, over the collected
// device ledgers + fold digests: id-set equality, per-origin lamport order, fold-
// digest identity, gap-free lamport on the killed device, every (non-poisoned) event
// carries a global_seq, acked_watermark == own_high_water on all three, and the
// quarantine_notice observed at the poisoned origin. Wall-clock propagation prints as
// EVIDENCE ONLY (never asserted — DEC-TEST-002: wall-clock is D3).
//
// RED until the impl lands contract (f): the child entrypoint imports
// createWsLanTransport / createWsCloudTransport from @restos/sync-client (not yet
// exported), so every child crashes at import and never reaches ready — this suite
// fails at "hub ready" with the child's stderr. The other gateway suites are
// unaffected (this file spawns the entrypoint by path; it never imports it).
//
// Real-process hygiene (binding on this harness): every server binds an EPHEMERAL
// port and reads it back; the freed port is reused on respawn; every child + socket
// + the gateway is torn down in `finally` (no orphans, no leaked ports); every wait
// is bounded with a diagnostic.
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DeviceClass } from "@restos/domain";
import type { FastifyInstance } from "fastify";
import { afterAll, describe, expect, it } from "vitest";
import { buildServer } from "../../server.js";
import { closeDb, eventRows, openDb, quarantineRows, testDatabaseUrl } from "../helpers.js";
import {
  type AppendInput,
  type ChildConfig,
  type ChildMessage,
  type ChildReport,
  devToken,
  type LanPeer,
  type ParentCommand,
  toArgv,
} from "./x10-ipc.js";

const ENTRY = fileURLToPath(new URL("./x10-device-entry.ts", import.meta.url));
const GATEWAY_CWD = fileURLToPath(new URL("../../..", import.meta.url));

const ORG = "x10-org";
const BRANCH = "x10-branch";
const BASE_TS = 1_752_800_000_000;
const NUL = String.fromCharCode(0); // built at runtime — source stays ASCII-clean

const HUB = { id: "dev-a", cls: "counter_electron" as DeviceClass };
const F1 = { id: "dev-b", cls: "counter_rn" as DeviceClass };
const F2 = { id: "dev-c", cls: "kitchen" as DeviceClass };

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ── a spawned device child, with a bounded IPC inbox ─────────────────────────

class Child {
  readonly proc: ChildProcess;
  readonly id: string;
  private stderr = "";
  private readonly inbox: ChildMessage[] = [];
  private readonly waiters: {
    match: (m: ChildMessage) => boolean;
    resolve: (m: ChildMessage) => void;
  }[] = [];
  private exited = false;
  readonly exit: Promise<void>;

  constructor(config: ChildConfig) {
    this.id = config.device_id;
    this.proc = spawn(process.execPath, ["--import", "tsx", ENTRY, ...toArgv(config)], {
      cwd: GATEWAY_CWD,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      env: process.env,
    });
    this.proc.stderr?.on("data", (d: Buffer) => {
      this.stderr += d.toString();
    });
    this.proc.on("message", (m: unknown) => this.deliver(m as ChildMessage));
    this.exit = new Promise((resolve) => {
      this.proc.on("exit", () => {
        this.exited = true;
        resolve();
      });
    });
  }

  private deliver(message: ChildMessage): void {
    const idx = this.waiters.findIndex((w) => w.match(message));
    if (idx >= 0) {
      const [w] = this.waiters.splice(idx, 1);
      w?.resolve(message);
      return;
    }
    this.inbox.push(message);
  }

  /** Resolve the next (or buffered) message matching `match`, or reject on timeout / early exit. */
  waitFor<T extends ChildMessage>(
    match: (m: ChildMessage) => m is T,
    timeoutMs: number,
    label: string,
  ): Promise<T> {
    const buffered = this.inbox.findIndex(match);
    if (buffered >= 0) return Promise.resolve(this.inbox.splice(buffered, 1)[0] as T);
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            `x10: timed out after ${timeoutMs}ms waiting for ${label} from ${this.id}.` +
              (this.stderr ? `\n--- child stderr ---\n${this.stderr}` : ""),
          ),
        );
      }, timeoutMs);
      const onExit = (): void => {
        cleanup();
        reject(
          new Error(
            `x10: ${this.id} exited before ${label}.` +
              (this.stderr ? `\n--- child stderr ---\n${this.stderr}` : " (no stderr)"),
          ),
        );
      };
      const cleanup = (): void => {
        clearTimeout(timer);
        this.proc.off("exit", onExit);
      };
      if (this.exited) return onExit();
      this.proc.on("exit", onExit);
      this.waiters.push({
        match,
        resolve: (m) => {
          cleanup();
          resolve(m as T);
        },
      });
    });
  }

  send(command: ParentCommand): void {
    this.proc.send?.(command);
  }

  async report(): Promise<ChildReport> {
    this.send({ cmd: "report" });
    return this.waitFor((m): m is ChildReport => m.type === "report", 10_000, "report");
  }

  kill(signal: NodeJS.Signals): void {
    this.proc.kill(signal);
  }
}

// ── event builders (registry-valid; deterministic ids) ───────────────────────

let tick = 0;
const mkInput = (
  device_id: string,
  id: string,
  type: string,
  payload: Record<string, unknown>,
): AppendInput => ({
  id,
  org_id: ORG,
  branch_id: BRANCH,
  device_id,
  actor_user_id: null,
  device_created_at: BASE_TS + tick++,
  type,
  schema_version: 1,
  payload,
  refs: [],
});
const created = (device: string, id: string, order: string): AppendInput =>
  mkInput(device, id, "order.created", { order_id: order, channel: "dine_in" });
const confirmed = (device: string, id: string, order: string): AppendInput =>
  mkInput(device, id, "order.confirmed", { order_id: order });

// ── gateway lifecycle (ephemeral port, reused on re-listen) ──────────────────

let app: FastifyInstance | null = null;
const listenGateway = async (databaseUrl: string, port: number): Promise<number> => {
  const instance = buildServer(databaseUrl);
  await instance.listen({ port, host: "127.0.0.1" });
  app = instance;
  return (instance.server.address() as AddressInfo).port;
};
const cutGateway = async (): Promise<void> => {
  if (app !== null) {
    await app.close();
    app = null;
  }
};

const spawned: Child[] = [];
const spawnChild = (config: ChildConfig): Child => {
  const child = new Child(config);
  spawned.push(child);
  return child;
};
const baseConfig = (
  device: { id: string; cls: DeviceClass },
  cloudUrl: string,
  db: string,
): Omit<ChildConfig, "lan_role" | "lan_port" | "lan_peers"> => ({
  device_id: device.id,
  device_class: device.cls,
  org: ORG,
  branch: BRANCH,
  db,
  token: devToken({ org_id: ORG, branch_id: BRANCH, device_id: device.id }),
  cloud_url: cloudUrl,
  script: "smoke",
});

afterAll(async () => {
  for (const c of spawned) c.kill("SIGKILL");
  await Promise.all(spawned.map((c) => c.exit));
  await cutGateway();
});

describe("X10 — real-process smoke over real WS + Testcontainers PG (01 §9-Q1)", () => {
  it("01-F2/F3/F8/F13/F34/F37: 3 tsx devices converge across WAN cut + hub SIGKILL-mid-print + respawn", async () => {
    // The gateway connects to the Testcontainers PG the global-setup started; the
    // sanctioned helper throws loudly if Docker/the container is absent (never mocks).
    const url = testDatabaseUrl();

    const tmp = mkdtempSync(join(tmpdir(), "x10-"));
    const dbPath = (name: string): string => join(tmp, `${name}.sqlite`);

    const appended = new Set<string>();
    const appendWall = new Map<string, number>();

    // Bounded append: durable-ack the local write, record its wall time.
    const appendOn = async (child: Child, event: AppendInput): Promise<void> => {
      child.send({ cmd: "append", event });
      await child.waitFor(
        (m): m is Extract<ChildMessage, { type: "appended" }> =>
          m.type === "appended" && m.event_id === event.id,
        10_000,
        `append ${event.id}`,
      );
      appended.add(event.id);
      appendWall.set(event.id, Date.now());
    };

    try {
      // ── boot the gateway (ephemeral) ──────────────────────────────────
      const gatewayPort = await listenGateway(url, 0);
      const cloudUrl = `ws://127.0.0.1:${gatewayPort}/sync`;

      // ── spawn the hub first (ephemeral LAN port; read it back) ────────
      const hub = spawnChild({
        ...baseConfig(HUB, cloudUrl, dbPath(HUB.id)),
        lan_role: "hub",
        lan_port: 0,
        lan_peers: [],
      });
      const hubReady = await hub.waitFor(
        (m): m is Extract<ChildMessage, { type: "ready" }> => m.type === "ready",
        15_000,
        "hub ready",
      );
      const lanPort = hubReady.lan_port ?? 0;
      expect(lanPort).toBeGreaterThan(0);
      const hubPeer: LanPeer = { device_id: HUB.id, host: "127.0.0.1", port: lanPort };

      // ── spawn the two followers, dialing the hub ──────────────────────
      const f1 = spawnChild({
        ...baseConfig(F1, cloudUrl, dbPath(F1.id)),
        lan_role: "follower",
        lan_port: 0,
        lan_peers: [hubPeer],
      });
      const f2 = spawnChild({
        ...baseConfig(F2, cloudUrl, dbPath(F2.id)),
        lan_role: "follower",
        lan_port: 0,
        lan_peers: [hubPeer],
      });
      await Promise.all([
        f1.waitFor(
          (m): m is Extract<ChildMessage, { type: "ready" }> => m.type === "ready",
          15_000,
          "f1 ready",
        ),
        f2.waitFor(
          (m): m is Extract<ChildMessage, { type: "ready" }> => m.type === "ready",
          15_000,
          "f2 ready",
        ),
      ]);

      // ── Phase 1: rush while WAN is up (incl. the U+0000 event) ─────────
      const nulEvent = mkInput(F1.id, "evt-b-nul", "order.created", {
        order_id: `order-${NUL}poison`,
        channel: "dine_in",
      });
      await appendOn(hub, created(HUB.id, "evt-a-x-created", "order-X"));
      await appendOn(hub, confirmed(HUB.id, "evt-a-x-confirmed", "order-X"));
      await appendOn(f1, created(F1.id, "evt-b-y-created", "order-Y"));
      await appendOn(f1, confirmed(F1.id, "evt-b-y-confirmed", "order-Y"));
      await appendOn(f1, nulEvent);
      await appendOn(f2, created(F2.id, "evt-c-z-created", "order-Z"));
      await appendOn(f2, confirmed(F2.id, "evt-c-z-confirmed", "order-Z"));

      // The storage_reject notice must round-trip to the poisoned origin BEFORE we
      // cut WAN — proves the real end-to-end quarantine path (01-F37 device half).
      await waitUntil(
        async () => (await f1.report()).quarantined.some((q) => q.event_id === nulEvent.id),
        20_000,
        "dev-b observes storage_reject quarantine_notice",
      );

      // ── Phase 2: cut WAN; LAN-only operation continues (01-F17) ────────
      await cutGateway();
      await appendOn(hub, created(HUB.id, "evt-a-w-created", "order-W"));
      await appendOn(hub, confirmed(HUB.id, "evt-a-w-confirmed", "order-W"));
      await appendOn(f2, created(F2.id, "evt-c-v-created", "order-V"));

      // ── Phase 3: SIGKILL the hub mid-print ────────────────────────────
      const heldKot = mkInput(HUB.id, "evt-a-x-kot", "kot.printed", { order_id: "order-X" });
      hub.send({ cmd: "append", event: heldKot, hold: true });
      await hub.waitFor(
        (m): m is Extract<ChildMessage, { type: "holding" }> =>
          m.type === "holding" && m.event_id === heldKot.id,
        10_000,
        "hub holding mid-print",
      );
      hub.kill("SIGKILL");
      await hub.exit; // dead → LAN port freed for the respawn

      // ── Phase 4: respawn hub on the SAME port; re-listen gateway ───────
      await listenGateway(url, gatewayPort); // WAN heal (fresh sessions, same PG)
      const hub2 = spawnChild({
        ...baseConfig(HUB, cloudUrl, dbPath(HUB.id)), // SAME db file → ledger survives
        lan_role: "hub",
        lan_port: lanPort, // reuse the freed port so followers reconnect
        lan_peers: [],
      });
      await hub2.waitFor(
        (m): m is Extract<ChildMessage, { type: "ready" }> => m.type === "ready",
        15_000,
        "hub respawn ready",
      );

      // ── Phase 5: converge on both planes ──────────────────────────────
      const all = [hub2, f1, f2];
      const reports = await convergeAll(all, appended, 45_000);

      // ── Phase 6: assertions ───────────────────────────────────────────
      const origins = [HUB.id, F1.id, F2.id];

      // (1) id-set equality across devices — every device holds every appended
      // event exactly once (the U+0000 event reaches all via LAN, 01-F8/F38).
      for (const r of reports) {
        expect(new Set(r.ledger.map((e) => e.id))).toEqual(appended);
        expect(r.ledger.length).toBe(appended.size);
      }
      // (2) per-origin lamport order: dense 0..k-1 at every receiver.
      for (const r of reports) {
        for (const origin of origins) {
          const seqs = r.ledger
            .filter((e) => e.device_id === origin)
            .map((e) => e.lamport_seq)
            .sort((a, b) => a - b);
          expect(seqs).toEqual(seqs.map((_v, i) => i));
        }
      }
      // (3) fold-digest identity across devices (all fold the same set in the same
      // canonical/cloud order — 01-N1/01-F34/01-F6).
      expect(new Set(reports.map((r) => r.fold_digest)).size).toBe(1);
      // (4) gap-free lamport on the killed device: the held kot.printed was never
      // appended, so dev-a's own ledger has no hole (01-F2 kill-seed).
      const hubReport = reports.find((r) => r.device_id === HUB.id);
      expect(hubReport).toBeDefined();
      const hubOwn = (hubReport as ChildReport).ledger
        .filter((e) => e.device_id === HUB.id)
        .map((e) => e.lamport_seq)
        .sort((a, b) => a - b);
      expect(hubOwn).toEqual(hubOwn.map((_v, i) => i));
      expect(hubOwn).not.toContain(heldKot.device_created_at); // sanity: kot absent
      for (const r of reports) {
        expect(r.ledger.some((e) => e.id === heldKot.id)).toBe(false); // no phantom print
      }
      // (5) acked_watermark == own_high_water on all three — the outbox fully drained
      // to the cloud, advancing OVER the poisoned slot (DEC-SYNC-005; 19 §5).
      for (const r of reports) {
        expect(r.status.acked_watermark).toBe(r.status.own_high_water);
      }
      // (6) every (non-poisoned) event carries a global_seq — asserted at the real
      // core (the gateway is the global_seq authority; the device sidecar is
      // internal, 01-F1). Dense from 1; the U+0000 event is quarantined, not merged.
      const db = openDb();
      try {
        const rows = await eventRows(db, ORG);
        const quar = await quarantineRows(db, ORG);
        const mergedIds = new Set(rows.map((e) => e.id));
        expect(rows.map((e) => e.global_seq)).toEqual(rows.map((_v, i) => i + 1));
        expect(mergedIds.has(nulEvent.id)).toBe(false);
        expect(
          quar.some((q) => q.claimed_event_id === nulEvent.id && q.reason === "storage_reject"),
        ).toBe(true);
        const expectedMerged = new Set([...appended].filter((id) => id !== nulEvent.id));
        expect(mergedIds).toEqual(expectedMerged);
      } finally {
        await closeDb(db);
      }
      // (7) quarantine_notice observed at the poisoned origin (dev-b cloud session).
      const originReport = reports.find((r) => r.device_id === F1.id) as ChildReport;
      expect(
        originReport.quarantined.some(
          (q) => q.event_id === nulEvent.id && q.reason === "storage_reject",
        ),
      ).toBe(true);

      // ── wall-clock propagation (EVIDENCE ONLY — never asserted) ────────
      printWallEvidence(reports, appendWall, origins);
    } finally {
      for (const c of spawned) c.kill("SIGKILL");
      await Promise.allSettled(spawned.map((c) => c.exit));
      await cutGateway();
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 120_000);
});

// ── bounded convergence poll ─────────────────────────────────────────────────

const convergeAll = async (
  children: readonly Child[],
  expectedIds: ReadonlySet<string>,
  timeoutMs: number,
): Promise<ChildReport[]> => {
  const deadline = Date.now() + timeoutMs;
  let last: ChildReport[] = [];
  while (Date.now() < deadline) {
    last = await Promise.all(children.map((c) => c.report()));
    const ok = last.every((r) => {
      const ids = new Set(r.ledger.map((e) => e.id));
      const complete = ids.size === expectedIds.size && [...expectedIds].every((id) => ids.has(id));
      const drained = r.status.acked_watermark === r.status.own_high_water;
      return complete && drained;
    });
    if (ok) return last;
    await delay(400);
  }
  return last; // return the last snapshot; the assertions produce a precise diff
};

const waitUntil = async (
  predicate: () => Promise<boolean>,
  timeoutMs: number,
  label: string,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(300);
  }
  throw new Error(`x10: timed out after ${timeoutMs}ms waiting until ${label}`);
};

// ── wall-clock evidence (printed, never asserted — DEC-TEST-002) ─────────────

const printWallEvidence = (
  reports: readonly ChildReport[],
  appendWall: ReadonlyMap<string, number>,
  origins: readonly string[],
): void => {
  const seen = new Map<string, Map<string, number>>();
  for (const r of reports) seen.set(r.device_id, new Map(r.first_seen));
  const deltas: number[] = [];
  for (const [id, at] of appendWall) {
    let last = at;
    for (const origin of origins) {
      const first = seen.get(origin)?.get(id);
      if (first !== undefined && first > last) last = first;
    }
    deltas.push(last - at);
  }
  deltas.sort((a, b) => a - b);
  const p = (q: number): number =>
    deltas.length === 0
      ? 0
      : (deltas[Math.min(deltas.length - 1, Math.ceil(q * deltas.length) - 1)] ?? 0);
  console.log(
    `[X10] wall-clock propagation to last device (EVIDENCE ONLY, never asserted — DEC-TEST-002): ` +
      `n=${deltas.length} p50=${p(0.5)}ms p95=${p(0.95)}ms max=${deltas.at(-1) ?? 0}ms`,
  );
};
