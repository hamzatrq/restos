/**
 * # `01-F12`/`01-F13` — WHERE THE BRANCH MESH LISTENS, AND WHO IT DIALS
 *
 * > 01-F12 Devices in a branch discover each other on the LAN (mDNS; **manual IP fallback**) and
 * > exchange events directly while WAN is down.
 *
 * This is the manual-IP half, resolved once per device host at boot: the port this device listens
 * on, the address it binds, and the directory of peers it dials. `00 §7` puts *"printer assignments,
 * station identity, float amounts, idle-lock timeout, panel pixel density"* at **layer 3
 * (branch/device)**, which is the layer these three belong to for the same reason `IDENTITY_ENV`
 * does — they are the whole of what makes one device's place on one branch's wire different from
 * another's, and no org-wide layer can express them.
 *
 * ## ⚠ THE mDNS HALF IS NOT IMPLEMENTED, AND THAT IS RECORDED RATHER THAN INVENTED
 *
 * `01-F12` names two discovery mechanisms and this module is the second. The first needs a native
 * multicast responder, and `18 §14` line 197 lists *"mDNS on Android (01 §9.1 LAN transport spike
 * will force the native-module shape)"* as an **open** registry item rather than an allowlisted
 * dependency — so adding one is a `18 §15` process and not an implementer's call. Until that lands
 * an operator types the branch's addresses, exactly as they type `RESTOS_CLOUD_URL` and the three
 * `IDENTITY_ENV` keys, and `describeLanMesh` says on the boot line which peers were read.
 *
 * ## WHY IT IS ONE DECLARATION IN A PACKAGE AND NOT TWO IN TWO APPS
 *
 * `apps/pos-electron` (the `01-F13` preferred hub) and `apps/pass-kds` (`01-F39`'s `kitchen`) are
 * the two ends of the same wire, and `18 §2` forbids either importing the other. `DEC-ARCH-001`
 * rules EXTRACT at the moment a module acquires its second consumer — and the failure a copy
 * produces here is the sharpest version of it in the repo: two parsers of one peer directory means
 * the counter can listen on one port while the pass dials another, **with both apps' suites green
 * and nothing anywhere reporting an error**. That is `01-F60`'s enabled-set drift with the names
 * changed, and it cost this product a fortnight once already.
 */

/** `00 §7` **layer 3**, per device. Named here so no suite and no host hardcodes a key string. */
export const LAN_MESH_ENV = {
  listen_host: "RESTOS_LAN_HOST",
  listen_port: "RESTOS_LAN_PORT",
  peers: "RESTOS_LAN_PEERS",
} as const;

/** One entry of `01-F12`'s manual-IP directory: who to dial, and where. */
export type LanPeer = { device_id: string; host: string; port: number };

export type LanMeshConfig = {
  listen_host: string;
  listen_port: number;
  peers: readonly LanPeer[];
};

/**
 * **`0.0.0.0`, and the default is the FR rather than a convenience.**
 *
 * `01-F12` places discovery *on the LAN*, and a branch's counter and its pass screen are always two
 * machines. A device bound to loopback is reachable only from its own box, so it satisfies every
 * test that runs two processes on one host and closes nothing for a real restaurant. The key exists
 * for the till with two NICs whose operator wants to name one; the DEFAULT has to be the answer
 * that makes the FR true, because the failure of the other default is invisible — the mesh starts,
 * reports itself listening, and nobody ever arrives.
 */
export const DEFAULT_LAN_LISTEN_HOST = "0.0.0.0";

/**
 * The peer-directory string an operator is shown — `device_id@host:port`, comma-separated.
 *
 * It is EXPORTED rather than written into a README because the boot line, the documentation and the
 * parser must agree, and the cheapest way to guarantee that is for the example to be the thing the
 * parser is tested against. An example that does not parse is worse than no example: an operator
 * copies it, the device starts, and the queue stays empty.
 *
 * The ids are the dev seed's org/branch/device shape (`DEV_IDENTITY`) so the example reads like the
 * values `provision-device` actually mints.
 */
export const LAN_PEERS_EXAMPLE =
  "00000000-0000-7000-8000-000000000003@192.168.1.21:7311," +
  "00000000-0000-7000-8000-000000000004@192.168.1.22:7311";

/** `device_id@host:port` — the id may not contain `@`, the host may not contain `:`. */
const PEER_PATTERN = /^([^@\s]+)@([^:\s]+):(\d+)$/;

const refuse = (message: string): never => {
  throw new Error(
    `${message} A half-read LAN configuration is the failure 01-F12 cannot report: the device ` +
      "starts, the mesh comes up, and the peer that was mistyped simply never appears — which " +
      "looks exactly like a peer that is switched off. resolveDeviceIdentity refuses for the same " +
      "reason, and this refuses with it.",
  );
};

const parsePort = (raw: string, key: string): number => {
  if (!/^\d+$/.test(raw)) {
    return refuse(`${key} is set to ${JSON.stringify(raw)}, which is not a port number.`);
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    return refuse(`${key} is set to ${JSON.stringify(raw)}, which is not a port in 1..65535.`);
  }
  return port;
};

/**
 * Parse the whole directory or refuse it — **never half of it**.
 *
 * `01-F17`'s "a sale is never blocked" governs what happens at RUN time, not what happens to a
 * misconfiguration at boot: a directory silently missing one entry means the branch runs a mesh
 * that permanently excludes one device, and the operator's only evidence is an empty pass screen.
 * `resolveDeviceIdentity` is the house precedent — a padded id refuses rather than falling back —
 * and the argument transfers exactly.
 */
const parsePeers = (raw: string): LanPeer[] => {
  const entries = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  return entries.map((entry) => {
    const match = PEER_PATTERN.exec(entry);
    if (match === null) {
      return refuse(
        `${LAN_MESH_ENV.peers} entry ${JSON.stringify(entry)} is not ` +
          `\`device_id@host:port\` (for example: ${LAN_PEERS_EXAMPLE}).`,
      );
    }
    return {
      device_id: String(match[1]),
      host: String(match[2]),
      port: parsePort(String(match[3]), `${LAN_MESH_ENV.peers} entry ${JSON.stringify(entry)}`),
    };
  });
};

/**
 * The branch mesh this device should run, or `null` for a device that runs none.
 *
 * **Unset means NO mesh, and that is the normal deployment rather than a degraded one.** A T1
 * single-terminal branch — the overwhelmingly common Pakistani restaurant this product is built for
 * — has one till, no LAN peer, and nothing to elect. `01-F17` and commandment 4 mean it must boot
 * with nothing configured and sell all day, so the absence of these keys is an answer and not an
 * omission.
 *
 * **The port is what turns the mesh on.** Both classes that run this code are hub-eligible
 * (`01-F39`), so either may be asked to SERVE the branch, and a device that cannot be dialed cannot
 * serve. A peer directory with no port is therefore a refusal rather than an ephemeral bind: the
 * directory on the other end names a fixed port, and a device that picked its own would be
 * unreachable at exactly the address its peers were told to use.
 */
export const resolveLanMesh = (env: Record<string, string | undefined>): LanMeshConfig | null => {
  const rawPort = (env[LAN_MESH_ENV.listen_port] ?? "").trim();
  const rawPeers = (env[LAN_MESH_ENV.peers] ?? "").trim();
  const rawHost = (env[LAN_MESH_ENV.listen_host] ?? "").trim();
  if (rawPort === "") {
    if (rawPeers === "") return null;
    return refuse(
      `${LAN_MESH_ENV.peers} names peers to dial but ${LAN_MESH_ENV.listen_port} is unset, so ` +
        "this device would dial the branch and be undialable itself. 01-F13 makes every " +
        "hub-eligible device a possible hub, and a hub that cannot be reached cannot serve one.",
    );
  }
  return {
    listen_host: rawHost === "" ? DEFAULT_LAN_LISTEN_HOST : rawHost,
    listen_port: parsePort(rawPort, LAN_MESH_ENV.listen_port),
    peers: parsePeers(rawPeers),
  };
};

/**
 * What the boot line says — `00 §5.7`, and this value has the property that decides what belongs in
 * one: **being wrong about it is invisible from the screen.** A pass screen with no peer directory
 * shows an empty queue, which is also exactly what a quiet kitchen looks like; a till whose port was
 * mistyped serves nobody and reports nothing.
 */
export const describeLanMesh = (config: LanMeshConfig | null): string => {
  if (config === null) {
    return (
      `LAN mesh: OFF (${LAN_MESH_ENV.listen_port} unset). This device exchanges events with no ` +
      "other device on the branch, so a WAN outage isolates it (01-F12/01-F15, 00 §5.1). That is " +
      "correct for a single-terminal branch and wrong for every other kind. To turn it on, set " +
      `${LAN_MESH_ENV.listen_port}=7311 on every device and ${LAN_MESH_ENV.peers} to the others, ` +
      `e.g. ${LAN_PEERS_EXAMPLE}`
    );
  }
  const where = `${config.listen_host}:${config.listen_port}`;
  const directory =
    config.peers.length === 0
      ? `no peers configured (${LAN_MESH_ENV.peers} unset) — this device serves whoever dials it ` +
        "and dials nobody, so a branch where every device is configured this way never meets"
      : `dialing ${config.peers.map((p) => `${p.device_id}@${p.host}:${p.port}`).join(", ")}`;
  return (
    `LAN mesh: listening on ${where}, ${directory}. Discovery is 01-F12's MANUAL-IP fallback; ` +
    "mDNS is not implemented (18 §14 lists it as an open registry item), so a device missing from " +
    "every directory is invisible to the branch however healthy it is."
  );
};
