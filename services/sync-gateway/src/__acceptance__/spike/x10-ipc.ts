// X10 — real-process smoke: the CHILD-ENTRYPOINT CLI + IPC contract (T-01-06
// contract (g) "X10"; DEC block point 2). Defined ONCE here, consumed by the
// orchestrator (x10-smoke.test.ts) and the child entrypoint (x10-device-entry.ts).
// This is the precise contract the T-01-06 task asked the test session to pin down.
//
// ── CHILD-ENTRYPOINT CLI ─────────────────────────────────────────────────────
// Spawned as:  node --import tsx <x10-device-entry.ts> <flags>
// with stdio ["ignore","pipe","pipe","ipc"] so the child gets process.send / .on.
//
//   --device-id   <string>                      device identity (store + token claim)
//   --device-class counter_electron|counter_rn|kitchen
//   --org         <string>                      store/branch identity
//   --branch      <string>
//   --db          <path>                        REAL sqlite file (reopened on respawn)
//   --token       <base64url dev-token>         cloud auth (claims {org,branch,device})
//   --cloud-url   <ws://host:port/sync>         the gateway /sync route
//   --lan-role    hub|follower                  hub LISTENS; follower DIALS the hub
//   --lan-port    <int>                         hub listen port (0 = ephemeral →
//                                               reported back as ready.lan_port; a
//                                               fixed freed port on respawn)
//   --lan-peers   <json:[{device_id,host,port}]> DIAL directory (manual-IP discovery,
//                                               01-F12 fallback): follower=[hub], hub=[]
//   --script      <name>                        reserved selector (default "smoke");
//                                               fine-grained actions arrive over IPC
//
// The child WS adapters are the impl surface (packages/sync-client/src/transport-ws.ts,
// T-01-06 contract (f)) — createWsLanTransport / createWsCloudTransport. Until they
// land, the child crashes at import ("does not provide an export named
// 'createWsLanTransport'") and never reaches ready → X10 is RED (the intended state).
//
// ── IPC: parent → child (commands) ───────────────────────────────────────────
//   { cmd:"append",  event: AppendInput, hold?: boolean }
//        durably append + fast-path BOTH planes. hold=true models a print-in-progress:
//        the child reports {type:"holding"} and does NOT append — the deterministic
//        kill point (SIGKILL mid-print; the kot.printed never enters the ledger).
//   { cmd:"report" }                → child replies {type:"report", ...}
//   { cmd:"shutdown" }              → stop sessions, close store, exit 0
//
// ── IPC: child → parent (events) ─────────────────────────────────────────────
//   { type:"ready",    device_id, lan_port? }    sessions up (+ hub LAN listening)
//   { type:"appended", event_id, lamport_seq }   a durable append landed
//   { type:"holding",  event_id }                frozen mid-print (kill me here)
//   { type:"report",   ... }                     the ledger/digest/status snapshot
//   { type:"fatal",    message }                 a caught startup/runtime error
import type { DeviceClass, EventEnvelopeT } from "@restos/domain";

/** Append input = envelope minus the store-assigned fields (matches DeviceStore.append). */
export type AppendInput = Omit<EventEnvelopeT, "lamport_seq" | "server_received_at">;

export type LanPeer = { device_id: string; host: string; port: number };
export type LanRole = "hub" | "follower";

export type ChildConfig = {
  device_id: string;
  device_class: DeviceClass;
  org: string;
  branch: string;
  db: string;
  token: string;
  cloud_url: string;
  lan_role: LanRole;
  lan_port: number;
  lan_peers: LanPeer[];
  script: string;
};

// ── message shapes ───────────────────────────────────────────────────────────

export type ParentCommand =
  | { cmd: "append"; event: AppendInput; hold?: boolean }
  | { cmd: "report" }
  | { cmd: "shutdown" };

export type LedgerEntry = { id: string; device_id: string; lamport_seq: number };

export type ChildReport = {
  type: "report";
  device_id: string;
  ledger: LedgerEntry[];
  fold_digest: string;
  status: {
    own_high_water: number | null;
    acked_watermark: number | null;
    last_global_seq: number | null;
    queue_depth: number;
  };
  quarantined: { event_id: string; reason: string }[];
  mesh: { state: string; hub_id: string | null };
  /** [event_id, wall_ms] pairs — first local sighting of each event (evidence only). */
  first_seen: [string, number][];
};

export type ChildMessage =
  | { type: "ready"; device_id: string; lan_port?: number }
  | { type: "appended"; event_id: string; lamport_seq: number }
  | { type: "holding"; event_id: string }
  | ChildReport
  | { type: "fatal"; message: string };

// ── CLI codec (shared so parent and child never drift on flag names) ─────────

const FLAG_KEYS = [
  "device-id",
  "device-class",
  "org",
  "branch",
  "db",
  "token",
  "cloud-url",
  "lan-role",
  "lan-port",
  "lan-peers",
  "script",
] as const;

/** Serialize a ChildConfig into the argv the entrypoint parses (parent side). */
export const toArgv = (config: ChildConfig): string[] => [
  "--device-id",
  config.device_id,
  "--device-class",
  config.device_class,
  "--org",
  config.org,
  "--branch",
  config.branch,
  "--db",
  config.db,
  "--token",
  config.token,
  "--cloud-url",
  config.cloud_url,
  "--lan-role",
  config.lan_role,
  "--lan-port",
  String(config.lan_port),
  "--lan-peers",
  JSON.stringify(config.lan_peers),
  "--script",
  config.script,
];

/** Parse argv into a ChildConfig (child side). Throws on any missing/invalid flag. */
export const parseArgv = (argv: readonly string[]): ChildConfig => {
  const map = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === undefined || !key.startsWith("--") || value === undefined) {
      throw new Error(`x10 entry: malformed flag at argv[${i}] (${String(key)})`);
    }
    map.set(key.slice(2), value);
  }
  const req = (k: (typeof FLAG_KEYS)[number]): string => {
    const v = map.get(k);
    if (v === undefined) throw new Error(`x10 entry: missing --${k}`);
    return v;
  };
  const role = req("lan-role");
  if (role !== "hub" && role !== "follower") {
    throw new Error(`x10 entry: --lan-role must be hub|follower, got ${role}`);
  }
  const port = Number(req("lan-port"));
  if (!Number.isInteger(port) || port < 0) {
    throw new Error(`x10 entry: --lan-port must be a non-negative integer, got ${req("lan-port")}`);
  }
  return {
    device_id: req("device-id"),
    device_class: req("device-class") as DeviceClass,
    org: req("org"),
    branch: req("branch"),
    db: req("db"),
    token: req("token"),
    cloud_url: req("cloud-url"),
    lan_role: role,
    lan_port: port,
    lan_peers: JSON.parse(req("lan-peers")) as LanPeer[],
    script: req("script"),
  };
};

// The Wave-0 unsigned dev-token mint that lived here is RETIRED (T-01-09): the
// orchestrator now mints signed tokens via the acceptance helpers and registers
// the fleet in kernel.device_registry before spawning (x10-smoke.test.ts).
