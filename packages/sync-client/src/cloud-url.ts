/**
 * # `00 §5.4` — **the cloud leg is `wss://`, and this file is the one place that decides it.**
 *
 * ⚠ **PROTECTED PATH (`20 §4.4`, commandment 10).**
 *
 * `00 §5.4` has required *"TLS everywhere"* since Draft 1 and `01-F72` (c) records, in the corpus
 * itself, that this is *"a law this leg has never met"*. Measured on the shipped tree (2026-08-23):
 * `createWsCloudTransport` dialled `new WebSocket(url)` with the string taken **verbatim**, both
 * Electron hosts passed `process.env.RESTOS_CLOUD_URL` straight through, and the substring `wss://`
 * appeared in **no document in the repository**. So the one leg that crosses the public internet —
 * carrying `01-F28`'s Argon2id staff hashes, `01-F47`'s device token, `01-F81`'s `device_roster`
 * (which decides who may write to a branch ledger) and every event — took whatever an environment
 * handed it, while `01-F72` gives the **branch LAN**, on a restaurant's own private network, mutual
 * TLS with a certificate pin. **The asymmetry ran backwards from the risk.**
 *
 * It is a load-bearing premise rather than a hardening preference: `01-F73` (c) and `01-F80` (f)
 * both reason from *"the cloud leg is TLS to a known endpoint"*, and `01-F80` (f) serves one of
 * exactly two UNAUTHENTICATED writes on that reasoning.
 *
 * ## ONE reading, TWO enforcement points — and why that is not redundancy
 *
 * `classifyCloudUrl` is the whole of the policy. `createWsCloudTransport` refuses at construction,
 * so no host — present, future, or a spike under a service's own `__acceptance__/spike/` — can
 * dial cleartext by forgetting a check; each app calls `cloudUrlRefusal` at **boot**, so an operator
 * meets the refusal on the boot line with the variable named, before a window, a store or a socket
 * exists (`00 §5.4` (ii)). Two *phrasings* of one *verdict*, because the audiences differ: the
 * transport talks to whoever constructed it, the boot line talks to somebody holding an env file.
 * What must never fork is the PREDICATE — two walks of one question diverge, and this repository
 * has already paid for that (`packages/escpos/src/simulate.ts`'s header: two byte→page walks, so a
 * document looked right in a snapshot and wrong in the app).
 *
 * ## `new URL`, never a substring test — measured, not argued
 *
 * `main/printer-link.ts` makes this argument for `RESTOS_PRINTER` and it is the same one: a real
 * parser refuses whitespace, a missing host and a bare hostname — and, the part that decides this
 * file, it tells you the **host** rather than a piece of the string that looks like one. Measured
 * on Node 22:
 *
 *   - `ws://127.0.0.1.evil.com/sync` → host `127.0.0.1.evil.com`
 *   - `ws://127.0.0.1@evil.com/sync` → host **`evil.com`**, with `127.0.0.1` as USERINFO
 *   - `ws://evil.com/wss://sync`     → host `evil.com`
 *
 * All three are admitted by an `includes()`/`startsWith()` guard and all three are refused here.
 * Three further loopback spellings come free from WHATWG's own IPv4 parser — `127.1`,
 * `0177.0.0.1` and `2130706433` all normalise to `127.0.0.1` — and the scheme is case-folded, so
 * `WSS://host/sync` is genuinely TLS and is **accepted**: refusing it would be a false refusal of a
 * secure deployment, which is a stopped till for no security gain.
 *
 * **`[::ffff:127.0.0.1]` is a real loopback form that this REFUSES**, stated rather than hidden: it
 * normalises to `[::ffff:7f00:1]` and not to `[::1]`, nothing in this repository writes it, and a
 * false refusal there is a stopped dev box while a false admission is the defect this file exists
 * for. The three spellings below are the ones the runbooks use.
 *
 * ## What this does NOT close — name the neighbouring case (AGENTS.md's `01-F66` lesson)
 *
 * 1. **The scheme is not the certificate.** `wss://` obliges Node's `ws` to verify the server's
 *    chain and hostname against the system trust store, which it does by default and which nothing
 *    in shipping code disables — so a **self-signed** certificate on a deployed gateway produces
 *    *no cloud*, not an insecure one. That is the honest outcome and it is a deployment task
 *    (`00 §5.4` (iii)); this file cannot and must not soften it.
 * 2. **`createRnCloudTransport` (`transport-rn.ts`) is NOT guarded by this.** It takes an injected
 *    `socket` factory and never constructs a WebSocket itself, so there is nothing here to refuse
 *    at; `apps/manager/src/branch.ts` is its one production caller and doc 05's remote path is v1
 *    (`plans/v0.md`). The manager phone's leg is therefore still unchecked, and that is a REPORTED
 *    gap rather than a silently accepted one.
 * 3. **Nothing here checks that the endpoint is the RIGHT one.** `wss://` to an attacker's
 *    correctly-certificated host is TLS. `01-F80`'s pairing is what makes an endpoint *known*.
 */

/**
 * The three spellings of *this machine*. **Exact host equality against a parsed URL** — the whole
 * point of the header above — so `127.0.0.1.evil.com` and `localhost.evil.com` are hosts that are
 * not in this set rather than strings that contain a member of it.
 */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** The production form, for every message that has to tell somebody what to type instead. */
const SECURE_SCHEME = "wss://";

export type CloudUrlVerdict =
  /** `wss://` — the production form. */
  | { readonly kind: "tls" }
  /** `ws://` to a loopback host: `00 §5.4` (i)'s one carve-out, for local runs and demos. */
  | { readonly kind: "loopback"; readonly host: string }
  /** May not be dialled. `reason` is one clause, reused by both phrasings below. */
  | { readonly kind: "refused"; readonly reason: string };

/**
 * `00 §5.4` — the ONE reading. Pure: no environment, no throw, no I/O, so both enforcement points
 * and every test ask the identical question.
 */
export const classifyCloudUrl = (raw: string): CloudUrlVerdict => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return {
      kind: "refused",
      reason:
        `${JSON.stringify(raw)} is not a URL. The cloud route is a full WebSocket URL including ` +
        `the path — ${SECURE_SCHEME}host:8080/sync`,
    };
  }
  // BEFORE the scheme, so the message names the confusion rather than the cleartext: this is the
  // case where the host a human reads and the host Node dials are different strings.
  if (url.username !== "" || url.password !== "") {
    return {
      kind: "refused",
      reason:
        `${JSON.stringify(raw)} carries credentials before the host, so the host it would dial ` +
        `is ${JSON.stringify(url.hostname)} — not the part that reads like one. A device ` +
        "authenticates with its 01-F47 token, never with URL credentials, so remove them",
    };
  }
  if (url.protocol === "wss:") return { kind: "tls" };
  if (url.protocol !== "ws:") {
    return {
      kind: "refused",
      reason:
        `${JSON.stringify(raw)} is not a WebSocket URL — its scheme is ` +
        `${JSON.stringify(url.protocol)}. The cloud route is ${SECURE_SCHEME}host:8080/sync`,
    };
  }
  if (LOOPBACK_HOSTS.has(url.hostname)) return { kind: "loopback", host: url.hostname };
  return {
    kind: "refused",
    reason:
      `${JSON.stringify(raw)} is CLEARTEXT to ${JSON.stringify(url.hostname)}. 00 §5.4 requires ` +
      "TLS on this leg, which crosses the public internet carrying staff PIN hashes (01-F28), " +
      "this device's token (01-F47), the roster that decides who may write to the branch ledger " +
      `(01-F81) and every event. Use ${SECURE_SCHEME}${url.host}${url.pathname}`,
  };
};

/**
 * The **operator's** sentence, or `null` when the value may be dialled — `00 §5.4` (ii)'s boot
 * refusal. `env_key` is the caller's because which key carries this is the HOST's business and
 * both hosts already name their own; the *reading* is shared and only the framing is not.
 *
 * `undefined` is NOT a refusal. An unset key is an offline device, which `01-F17` and `00 §5.1`
 * make the normal resting state of a branch on a bad link rather than an error — and `00 §5.4`
 * (ii) says so in as many words, because a guard that refused *absent* would take every offline
 * till down to close a hole that only a SET value can open.
 */
export const cloudUrlRefusal = (raw: string | undefined, env_key: string): string | null => {
  if (raw === undefined) return null;
  const verdict = classifyCloudUrl(raw);
  if (verdict.kind !== "refused") return null;
  return (
    `${env_key} cannot be dialled: ${verdict.reason}.\n\n` +
    "This device is REFUSED rather than started, because a till that starts on a cleartext " +
    "uplink trades all day and leaks everything it syncs (00 §5.4). Either unset " +
    `${env_key} to run this device fully offline, which is legal and normal (01-F17, 00 §5.1), ` +
    `or point it at a ${SECURE_SCHEME} endpoint. Cleartext ws:// is permitted ONLY to 127.0.0.1, ` +
    "localhost or [::1] — the local runs in README.md and plans/wave-1/running-the-stack.md.\n"
  );
};

/**
 * `00 §5.7` — the boot line, and this value has the property that decides what goes in one: **a
 * cleartext uplink and a TLS one look identical from the glass.** Every screen behaves the same,
 * every sale rings, nothing is visibly broken, and the difference is only observable to somebody
 * on the path between the till and the gateway.
 */
export const describeCloudUrl = (raw: string | undefined, env_key: string): string => {
  if (raw === undefined) {
    return (
      `cloud transport: OFFLINE (${env_key} unset). This device syncs nothing and that is a ` +
      "legal resting state, not a fault (01-F17, 00 §5.1)"
    );
  }
  const verdict = classifyCloudUrl(raw);
  if (verdict.kind === "tls") return `cloud transport: TLS — ${raw} (00 §5.4)`;
  if (verdict.kind === "loopback") {
    return (
      `cloud transport: CLEARTEXT ws:// to ${verdict.host} — ${raw}. It never leaves this ` +
      "machine, so it is permitted for LOCAL RUNS ONLY (00 §5.4 (i)); a deployed till must be " +
      `${SECURE_SCHEME}`
    );
  }
  // Unreachable from a host that refused at boot, which is every host that ships. Stated rather
  // than thrown: a boot LINE may never be the thing that takes a till down (01-F17).
  return `cloud transport: REFUSED — ${verdict.reason}`;
};
