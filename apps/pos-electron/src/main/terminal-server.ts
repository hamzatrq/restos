import {
  createHash,
  createPublicKey,
  type KeyObject,
  randomBytes,
  verify as verifySignature,
} from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer as createHttpsServer, type Server } from "node:https";
import { extname, join, normalize, resolve as resolvePath, sep } from "node:path";
import type { Terminal } from "./terminal";

/**
 * # `04-F22` — the wire under `04-F21`'s terminal, and nothing else
 *
 * `terminal.ts` is the trust boundary; this file carries bytes to it. The split matters because
 * every security property worth asserting is asserted against that module directly, so nothing
 * here can quietly acquire a rule of its own.
 *
 * ## What this port is, restated from the FR because it is the reason the file is careful
 *
 * `01-F72` exists because *"every launch of either app opens an unauthenticated read-write port
 * onto the branch money ledger, on every interface, for anyone on the shop Wi-Fi. The customer
 * network in a Pakistani restaurant is the staff network."* This is a SECOND such port. The mesh's
 * own listener answers it with mutual TLS pinned on the peer's client certificate — which a
 * browser cannot present, and which is exactly why this port exists rather than the pad joining
 * the mesh. **Nothing here may weaken that port, and this one must not be weaker.**
 *
 * ## Three gates, and the first one is a refusal to exist
 *
 * 1. **TLS, or no listener at all** (`04-F22` (a)). No certificate material ⇒ this returns
 *    `listening: false` and binds nothing. Absent means OFF, never absent means plaintext — a PIN
 *    on a plaintext shop LAN is the whole of what `01-F72` is about, and a non-secure origin also
 *    costs the pad Web Crypto, which gate 2 is built on.
 * 2. **An enrolled tablet proving possession of a key** (`04-F22` (b)) — never a bearer string,
 *    which `01-F72` (a) refuses by name because *"it is replayable by anyone who observed it"*.
 * 3. **A person, verified by the till** (`04-F22` (c)) — in `terminal.ts`, not here.
 *
 * ⚠ **What gate 2 does NOT defeat, said out loud so no later reader over-reads it.** An ACTIVE
 * man-in-the-middle on a connection whose certificate the operator waved through can relay the
 * nonce and the signature and ride the session. Only gate 1 closes that, and gate 1 is only as
 * strong as the browser's trust in the certificate — which is `04-F22`'s named founder call and
 * is not decided here.
 */

/**
 * `04-F22` (a) — the certificate material, and it is REQUIRED to be supplied rather than defaulted.
 *
 * There is no self-signing fallback in this file on purpose. A till that minted its own
 * certificate would be a till whose operator is trained to tap through a browser warning, and that
 * training is worth more to an attacker than the certificate is to us. `null` is a legitimate,
 * common state — most tills have no pad — and it is reported, not worked around.
 */
export type TerminalTls = { readonly cert: string; readonly key: string };

export type TerminalServerDeps = {
  terminal: Terminal;
  /** `null` ⇒ nothing listens. See `TerminalTls`. */
  tls: TerminalTls | null;
  port: number;
  /** The built pad bundle. Absent ⇒ the API serves and the app does not (a dev split). */
  bundleDir: string | null;
  now: () => number;
  /** `00 §5.7` — the boot line. A port onto the ledger announces itself or it is a surprise. */
  log: (line: string) => void;
};

export type TerminalServer = {
  /** `false` with a reason whenever `04-F22` (a) is unsatisfied. */
  readonly listening: boolean;
  readonly reason: string;
  /**
   * `04-F32`/`00 §5.7` — **what stopped this port coming up, live, or `null`.**
   *
   * A bind failure is ASYNCHRONOUS: `listen()` returns, the `error` arrives on a later tick, and
   * until August 2026 there was no listener for it — so a second counter, a stale process or
   * anything else already holding the port took the whole till down with an uncaught
   * `EADDRINUSE` (reproduced: exit 7). It is caught now, and kept here rather than logged and
   * dropped.
   *
   * ⚠ **NO SURFACE READS IT, and this sentence used to imply one did** (`04-F35`). It said the
   * answer lives here *"so the host can put it on the honesty strip rather than leaving a dead pad
   * looking healthy"* — true of what the value is FOR and false as a description of the product:
   * the only production caller is `terminal-console.ts`, which is TTY-only, and no shipping file
   * carries this to `DeviceState`, `ConnectionFacts` or `PanelHealth`. `04-F22` (a)'s strip clause
   * is recorded in the FR as OWED with its cost measured, and a comment that reads as though it
   * were built retires the assertion the next session would have written (`AGENTS.md` `L11`).
   * `terminal-operations.test.ts` §F pins the two together: the words above are legal only while
   * `failure()` reaches no surface.
   */
  failure: () => string | null;
  /**
   * `04-F22` (b) — mint a one-time enrolment code for ONE tablet. Single use, and it expires:
   * a code read aloud across a restaurant and left valid for the shift is a bearer credential
   * with a long life, which is the thing being avoided.
   */
  mintEnrolmentCode: () => string;
  /** `01-F42`'s posture for a tablet: admitted terminals are listed and revocable. */
  enrolments: () => string[];
  revoke: (terminal_id: string) => boolean;
  close: () => Promise<void>;
  /**
   * The port actually bound, once the socket is up — `null` when nothing listens.
   *
   * It exists because `port: 0` is the only way a test can bind without racing another process for
   * a fixed number, and a harness that guessed the port would be testing its guess. The shipped
   * host passes a real port and never reads this.
   */
  boundPort: () => Promise<number | null>;
};

const NONCE_TTL_MS = 30_000;
const CODE_TTL_MS = 5 * 60_000;
/** P-256 signatures are 64 bytes raw; anything else is not one and is refused before parsing. */
const P1363_SIGNATURE_BYTES = 64;

type Enrolment = { readonly terminal_id: string; readonly spki: Buffer };

const MIME: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".json": "application/json; charset=utf-8",
};

/**
 * The bytes a tablet signs: the nonce it was issued, and the exact body it is sending.
 *
 * **Binding the BODY is what makes gate 2 more than a login.** A signature over the nonce alone
 * authenticates the tablet once and then leaves every subsequent field of that request unprotected
 * — an attacker who can rewrite the stream could keep the signature and change the order id, the
 * item, or the quantity. `01-F1` makes whatever lands permanent, so the thing that must be
 * authenticated is the ACT, not the connection.
 *
 * The raw request bytes are signed rather than a re-serialization of the parsed object: two JSON
 * encoders disagree about key order and number formatting, and a signature over a *different*
 * string than the one the tablet signed fails closed but for the wrong reason — which is a bug
 * that looks exactly like an attack.
 *
 * ⚠ **THIS RETURNS THE BYTES, NOT A DIGEST OF THEM, AND `04-F36` (b) IS WHAT THAT COST.** It used
 * to return `sha256(…)` and hand that to a verification with a NULL algorithm, which on Node
 * applies the key's default digest and so hashed a second time. The pad cannot reach that shape
 * from any direction: `crypto.subtle.sign({ ECDSA, SHA-256 }, key, bytes)` hashes its input
 * exactly once, and WebCrypto offers no way to pre-hash. So the till verified `sha256(sha256(x))`
 * against a signature over `sha256(x)`, every signed request was `401 not admitted`, and no tablet
 * had ever made an authenticated request. **One byte string, one hash, named at both ends.**
 *
 * ⚠ **EXPORTED FOR ONE REASON: SO THE PROPERTY CAN BE ASSERTED AGAINST THIS FUNCTION AND NOT
 * AGAINST A THIRD HAND-COPY OF IT (`04-F36` (d)).** The length prefix is documented at BOTH ends as
 * a security property — *"it removes the concatenation ambiguity a separator carries"* — and was
 * asserted by nothing: dropping it here alone reddened 9 tests, dropping it here AND in the pad's
 * client reddened 5, and dropping it in all THREE copies (here, the pad, and the suite's own
 * `prefixed()` helper) left the suite **49/49 green**. Three hand-copies agreeing is not the
 * property; `terminal.test.ts` §I now signs with THIS function and asserts the ambiguity is gone
 * from it. The honest end state is still the shared wire module `04-F36` records as owed — one
 * declaration both ends import — and this export is the cheaper half of it, not a substitute.
 */
export const signedBytes = (nonce: string, rawBody: Buffer): Buffer => {
  const n = Buffer.from(nonce, "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(n.length);
  return Buffer.concat([length, n, rawBody]);
};

export const createTerminalServer = (deps: TerminalServerDeps): TerminalServer => {
  const enrolments = new Map<string, Enrolment>();
  const codes = new Map<string, number>();
  const nonces = new Map<string, { terminal_id: string; expires: number }>();
  /** `04-F36` (a) — see `admit`'s catch. Latched: one line per till, not one per request. */
  let verifyFaultLogged = false;

  const mintEnrolmentCode = (): string => {
    // Six bytes of base32-ish text: short enough to read across a counter, long enough that
    // guessing it inside its five-minute life is not a strategy.
    const code = randomBytes(6).toString("base64url");
    codes.set(code, deps.now() + CODE_TTL_MS);
    return code;
  };

  if (deps.tls === null) {
    const reason =
      "no terminal certificate configured — the order pad is OFF and nothing is listening";
    deps.log(`terminal: ${reason} (04-F22 (a): absent means off, never plaintext)`);
    return {
      listening: false,
      reason,
      // Not a failure: `04-F22` (a) makes an absent certificate the deliberate OFF state, and a
      // till with no pad is the ordinary case. What `failure` reports is a pad that was asked for
      // and did not come up.
      failure: () => null,
      mintEnrolmentCode,
      enrolments: () => [],
      revoke: () => false,
      close: async () => {},
      boundPort: async () => null,
    };
  }

  const bundleRoot = deps.bundleDir === null ? null : resolvePath(deps.bundleDir);

  const json = (res: ServerResponseLike, status: number, body: unknown): undefined => {
    const text = JSON.stringify(body);
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      // The pad is served from this same origin, so nothing needs to reach it cross-origin. A
      // permissive CORS header here would let any page on the shop Wi-Fi drive the ledger through
      // a waiter's own browser.
      "cache-control": "no-store",
    });
    res.end(text);
  };

  /**
   * `04-F22` (b) — the whole of gate 2, in one place.
   *
   * Returns the terminal id when the request is admissible, and `null` otherwise WITHOUT saying
   * which check failed. A caller learning "the nonce was fine but the signature was not" learns
   * whether a terminal id exists, which is the first thing an attacker on the shop Wi-Fi wants.
   */
  const admit = (
    headers: Record<string, string | string[] | undefined>,
    raw: Buffer,
  ): string | null => {
    const terminal_id = header(headers, "x-restos-terminal");
    const nonce = header(headers, "x-restos-nonce");
    const signature = header(headers, "x-restos-signature");
    if (terminal_id === null || nonce === null || signature === null) return null;

    // The nonce is consumed FIRST and unconditionally, before any cryptography: a nonce that
    // survives a failed verification is a nonce an attacker may retry against, and this is also
    // what stops a captured request being replayed even by the tablet that sent it.
    const issued = nonces.get(nonce);
    nonces.delete(nonce);
    if (issued === undefined || issued.expires <= deps.now()) return null;
    if (issued.terminal_id !== terminal_id) return null;

    const enrolment = enrolments.get(terminal_id);
    if (enrolment === undefined) return null;

    let sig: Buffer;
    try {
      sig = Buffer.from(signature, "base64url");
    } catch {
      return null;
    }
    if (sig.length !== P1363_SIGNATURE_BYTES) return null;

    try {
      const key = createPublicKey({ key: enrolment.spki, format: "der", type: "spki" });
      /**
       * `04-F36` (a) — **the digest is NAMED, because a defaulted one is a different function on
       * the two platforms.** `null` here meant *this key's default digest*, which Node's OpenSSL
       * supplies and Electron's BoringSSL refuses outright (`ERR_OSSL_EVP_NO_DEFAULT_DIGEST`).
       * The suites run on the first and the till runs on the second, so the call that every
       * assertion in this repo exercised was not the call the product made.
       *
       * `ieee-p1363` stays: WebCrypto emits the raw `r||s` pair and Node's default is DER.
       */
      return verifySignature(
        "sha256",
        signedBytes(nonce, raw),
        { key, dsaEncoding: "ieee-p1363" },
        sig,
      )
        ? terminal_id
        : null;
    } catch (cause) {
      /**
       * `04-F36` (a) — **a fault of ours may not leave by the same door as a rejected credential.**
       * A signature that does not check RETURNS false; reaching here means the primitive could not
       * run at all, and the bare `catch { return null; }` that used to stand here is what turned
       * a platform defect into `401 not admitted` on every request, for ever, with nothing on the
       * boot line, the console or the glass to say so.
       *
       * Still `null`: gate 2 fails CLOSED, and `04-F22` (b)'s caller must not learn which check
       * failed. Logged ONCE, latched, because this socket is open to the shop Wi-Fi and a line per
       * request is a lever a stranger can pull.
       *
       * ⚠ **THE LATCH AND `/enrol`'s CURVE GATE ARE ONE MECHANISM, AND THIS PARAGRAPH USED TO
       * CLAIM ONLY HALF OF IT (`04-F35`, `04-F36` (c)).** It said *"once is all a fault of this
       * kind needs, since it is a property of the build rather than of the request"* — true only
       * because every enrolled key is now P-256, so the arguments to this call cannot vary in any
       * way this primitive can refuse to run on. It was FALSE when written: `/enrol` pinned no key
       * type, an Ed25519 key enrolled with 200, and one request from anyone holding an enrolment
       * code burned this latch for the life of the process. **What is closed is the class "a
       * REQUEST can reach this catch"; what is not closed is that the latch remains one-shot, so
       * a future change admitting a second key type re-opens it in one keystroke.** The sentence
       * below — *every pad is refused until this is fixed* — is likewise true only while that gate
       * stands: it was false against a till with one Ed25519 enrolment and nine working ones.
       * `terminal.test.ts` §K4 pins the two together, so the day the gate is widened this comment
       * fails rather than quietly becoming a lie again.
       */
      if (!verifyFaultLogged) {
        verifyFaultLogged = true;
        const detail = cause instanceof Error ? cause.message : String(cause);
        deps.log(
          `terminal: signature verification could not RUN — every pad is refused until this is fixed: ${detail} (04-F36 (a))`,
        );
      }
      return null;
    }
  };

  /**
   * `04-F32`/`01-F17` — **certificate MATERIAL that cannot be used is "no pad", never a till that
   * will not start.**
   *
   * `createHttpsServer` parses the PEM synchronously and THROWS on anything it cannot read —
   * reproduced against real OpenSSL: garbage gives `ERR_OSSL_PEM_NO_START_LINE`, a truncated file
   * gives `ERR_OSSL_PEM_BAD_END_LINE`. That throw left this module, left `counterBoot`, and
   * reached the fatal handler, which exits non-zero with *"The device store could not be
   * opened"* — a till that will not turn on, and a message naming the wrong subsystem. The host
   * already guarded the READ (`terminalTls` catches a missing file) and could not guard the
   * CONTENTS, because only this call knows whether they parse.
   */
  let https: Server;
  try {
    https = createHttpsServer({ cert: deps.tls.cert, key: deps.tls.key });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    const reason = `the terminal certificate could not be used — the order pad is OFF: ${detail}`;
    deps.log(`terminal: ${reason} (04-F32: the pad never stops the till)`);
    return {
      listening: false,
      reason,
      // A pad WAS configured and did not come up, so unlike the absent-certificate case above
      // this is a FAILURE rather than an "off", and it is kept as a live fact for a surface to
      // report.
      //
      // ⚠ **This comment said "and the strip says so (`00 §5.7`)" and the strip does not**
      // (`04-F35`): `failure()`'s only production caller is the TTY console, and `04-F22` (a)'s
      // strip clause is recorded in the FR as owed. The distinction it draws — configured and
      // dead, versus never configured — is real and is what a strip would render; what was false
      // was the claim that anything renders it today.
      failure: () => reason,
      mintEnrolmentCode,
      enrolments: () => [],
      revoke: () => false,
      close: async () => {},
      boundPort: async () => null,
    };
  }

  /**
   * `04-F32`/`01-F17` — **nothing on the shop Wi-Fi, and nothing about this port, may take the
   * till down.** `transport-ws.ts` already answers the identical question for the mesh listener
   * (*"`01-F17` says nothing about the LAN may take the till down"*), and this port had neither
   * handler: an `error` on an emitter with no listener is an uncaught exception in the main
   * process.
   *
   * `error` is the bind failure (`EADDRINUSE`, a privileged port, an interface that went away);
   * `tlsClientError` is every handshake a stranger can start — a port scanner, a browser dialling
   * `http://` at an `https://` socket, or an attacker doing it on purpose. Both are recorded, and
   * `error` is kept because the honesty strip reads it.
   */
  let bindFailure: string | null = null;
  https.on("error", (cause: Error) => {
    bindFailure = `the order pad's port ${deps.port} did not come up: ${cause.message}`;
    deps.log(`terminal: ${bindFailure} (04-F32 — the till goes on selling)`);
  });
  https.on("tlsClientError", () => undefined);

  https.on("request", (req: IncomingMessageLike, res: ServerResponseLike) => {
    void handle(req, res).catch(() => {
      // `01-F17` — a pad's malformed request never takes the till down with it.
      try {
        json(res, 500, { error: "terminal request failed" });
      } catch {
        /* the socket is already gone */
      }
    });
  });

  const handle = async (req: IncomingMessageLike, res: ServerResponseLike): Promise<undefined> => {
    const url = (req.url ?? "/").split("?")[0] ?? "/";
    if (req.method === "GET") return serveBundle(url, res);
    if (req.method !== "POST") return json(res, 405, { error: "method not allowed" });

    const raw = await readBody(req);

    // ── The two UNSIGNED endpoints, and why each is allowed to be ─────────────────────────────
    //
    // `/enrol` cannot be signed: the tablet has no admitted key yet, which is what it is asking
    // for. It is gated by the one-time code instead. `/nonce` cannot be signed either, because a
    // nonce is what a signature needs — and it hands out nothing but a random string bound to a
    // terminal id the caller already named, so an attacker who requests one learns nothing they
    // did not supply.
    if (url === "/enrol") return enrol(raw, res);
    if (url === "/nonce") return issueNonce(raw, res);

    if (url !== "/rpc") return json(res, 404, { error: "not found" });

    const terminal_id = admit(req.headers, raw);
    if (terminal_id === null) return json(res, 401, { error: "not admitted" });

    let body: {
      op?: unknown;
      handle?: unknown;
      user_id?: unknown;
      pin?: unknown;
      intent?: unknown;
    };
    try {
      body = JSON.parse(raw.toString("utf8")) as typeof body;
    } catch {
      return json(res, 400, { error: "malformed" });
    }

    switch (body.op) {
      case "roster":
        return json(res, 200, { roster: deps.terminal.roster() });
      case "sign_in": {
        const result = await deps.terminal.signIn(body.user_id, body.pin);
        // A refusal is 200 with a reason rather than 401: `01-F61`'s refusals are OPERATOR-facing
        // states the pad must render distinctly ("locked out" is not "wrong PIN"), and collapsing
        // them into a transport status is how a waiter is told to re-key a PIN that was right.
        return json(res, 200, result);
      }
      case "sign_out":
        deps.terminal.signOut(body.handle);
        return json(res, 200, { ok: true });
      case "view": {
        const view = deps.terminal.view(body.handle);
        return view === null
          ? json(res, 200, { ok: false, reason: "not_signed_in" })
          : json(res, 200, { ok: true, view });
      }
      case "act":
        return json(res, 200, deps.terminal.act(body.handle, body.intent));
      default:
        return json(res, 400, { error: "malformed" });
    }
  };

  const enrol = (raw: Buffer, res: ServerResponseLike): undefined => {
    let body: { code?: unknown; public_key?: unknown };
    try {
      body = JSON.parse(raw.toString("utf8")) as typeof body;
    } catch {
      return json(res, 400, { error: "malformed" });
    }
    if (typeof body.code !== "string" || typeof body.public_key !== "string") {
      return json(res, 400, { error: "malformed" });
    }
    const expires = codes.get(body.code);
    // Burned whether or not it was valid, and burned BEFORE the key is looked at: a code that
    // survives one use is a code two tablets can enrol against.
    codes.delete(body.code);
    if (expires === undefined || expires <= deps.now()) {
      return json(res, 403, { error: "not admitted" });
    }
    let spki: Buffer;
    let key: KeyObject;
    try {
      spki = Buffer.from(body.public_key, "base64url");
      // Parsed HERE so a key that cannot be imported is refused at enrolment rather than at every
      // later request, where it would look like a signature failure.
      key = createPublicKey({ key: spki, format: "der", type: "spki" });
    } catch {
      return json(res, 400, { error: "malformed" });
    }
    /**
     * `04-F22` (b)/`04-F36` (c) — **the CURVE is pinned here, and this is the whole of that fix.**
     *
     * The FR specifies *"a non-extractable **P-256** keypair"* and this gate accepted whatever
     * `createPublicKey` would parse: `ec-p384`, `rsa2048`, `ed25519` and `x25519` all enrolled with
     * **200** (measured). None of them can be ADMITTED — an Ed25519 signature is 64 bytes, so it
     * clears `P1363_SIGNATURE_BYTES` untouched, and `verify("sha256", …)` against that key THROWS
     * on both platforms — so the damage was not a bypass. It was that a stranger holding an
     * enrolment code could make `admit`'s catch fire, and that catch is `04-F36` (a)'s ONE-SHOT
     * latch: one such request burned it, and a genuine build fault afterwards was silent for ever.
     *
     * Refused at ENROLMENT rather than at verification, for the reason the parse above is already
     * here: a key this wire cannot use must be a `400` to the operator typing the code, not a
     * `401` on every request for the life of the till.
     */
    if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") {
      return json(res, 400, { error: "malformed" });
    }
    // The id is the key's own fingerprint, not a counter: two enrolments of one key are one
    // terminal, and an id an attacker could guess buys nothing because the key is what is checked.
    const terminal_id = createHash("sha256").update(spki).digest("hex").slice(0, 32);
    enrolments.set(terminal_id, { terminal_id, spki });
    deps.log(`terminal: enrolled ${terminal_id} (04-F22 (b))`);
    return json(res, 200, { terminal_id });
  };

  const issueNonce = (raw: Buffer, res: ServerResponseLike): undefined => {
    let body: { terminal_id?: unknown };
    try {
      body = JSON.parse(raw.toString("utf8")) as typeof body;
    } catch {
      return json(res, 400, { error: "malformed" });
    }
    if (typeof body.terminal_id !== "string" || !enrolments.has(body.terminal_id)) {
      // Same shape and status as an admitted-but-expired case: this endpoint must not become an
      // oracle for which terminal ids exist.
      return json(res, 200, { nonce: randomBytes(18).toString("base64url") });
    }
    const nonce = randomBytes(18).toString("base64url");
    nonces.set(nonce, { terminal_id: body.terminal_id, expires: deps.now() + NONCE_TTL_MS });
    // Swept on issue rather than on a timer: the map only grows while requests are arriving, and
    // a timer in a till that runs for weeks is a thing to remember to clear.
    for (const [key, value] of nonces) if (value.expires <= deps.now()) nonces.delete(key);
    return json(res, 200, { nonce });
  };

  const serveBundle = async (url: string, res: ServerResponseLike): Promise<undefined> => {
    if (bundleRoot === null) return json(res, 404, { error: "no pad bundle" });
    const rel = url === "/" ? "index.html" : url.replace(/^\/+/, "");
    // Path traversal, refused by RESOLUTION rather than by inspecting the string: `..` can arrive
    // percent-encoded, doubled, or mixed with backslashes, and every string-level check is a list
    // of the encodings somebody thought of.
    const target = resolvePath(join(bundleRoot, normalize(rel)));
    if (target !== bundleRoot && !target.startsWith(bundleRoot + sep)) {
      return json(res, 403, { error: "not found" });
    }
    try {
      const bytes = await readFile(target);
      res.writeHead(200, {
        "content-type": MIME[extname(target)] ?? "application/octet-stream",
        "cache-control": "no-store",
      });
      res.end(bytes);
    } catch {
      return json(res, 404, { error: "not found" });
    }
  };

  https.listen(deps.port);
  deps.log(
    `terminal: listening on ${deps.port} over TLS (04-F21 — the pad is a terminal of this till)`,
  );

  return {
    listening: true,
    reason: "listening",
    failure: () => bindFailure,
    mintEnrolmentCode,
    enrolments: () => [...enrolments.keys()],
    revoke: (terminal_id: string) => {
      // Every live nonce for that terminal goes with it, so a request already in flight cannot
      // land after the revocation. `01-F48`'s eviction posture, at this port's scale.
      for (const [key, value] of nonces) if (value.terminal_id === terminal_id) nonces.delete(key);
      return enrolments.delete(terminal_id);
    },
    close: () =>
      new Promise<void>((done) => {
        https.close(() => done());
      }),
    boundPort: () =>
      new Promise<number | null>((done) => {
        const read = (): void => {
          const address = https.address();
          done(address !== null && typeof address === "object" ? address.port : null);
        };
        if (https.listening) read();
        else https.once("listening", read);
      }),
  };
};

const header = (
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | null => {
  const value = headers[name];
  return typeof value === "string" && value !== "" ? value : null;
};

/**
 * A hard cap, because this socket is open to the shop Wi-Fi. An intent is a few hundred bytes; a
 * megabyte of it is not a waiter.
 */
const MAX_BODY_BYTES = 64 * 1024;

const readBody = (req: IncomingMessageLike): Promise<Buffer> =>
  new Promise<Buffer>((done, fail) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        fail(new Error("terminal request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => done(Buffer.concat(chunks)));
    req.on("error", fail);
  });

/**
 * Structural types over Node's own, so this module can be driven by a test double without a
 * socket, and so the file names exactly what it uses.
 */
type IncomingMessageLike = {
  url?: string;
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  on(event: string, listener: (arg: never) => void): unknown;
  destroy(): unknown;
};

type ServerResponseLike = {
  writeHead(status: number, headers: Record<string, string>): unknown;
  end(body?: unknown): unknown;
};

export type { Server as TerminalHttpsServer };
