import { createHash, createPublicKey, randomBytes, verify as verifySignature } from "node:crypto";
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
 * The raw request bytes are hashed rather than a re-serialization of the parsed object: two JSON
 * encoders disagree about key order and number formatting, and a signature over a *different*
 * string than the one the tablet signed fails closed but for the wrong reason — which is a bug
 * that looks exactly like an attack.
 */
const signedBytes = (nonce: string, rawBody: Buffer): Buffer => {
  const n = Buffer.from(nonce, "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(n.length);
  return createHash("sha256").update(length).update(n).update(rawBody).digest();
};

export const createTerminalServer = (deps: TerminalServerDeps): TerminalServer => {
  const enrolments = new Map<string, Enrolment>();
  const codes = new Map<string, number>();
  const nonces = new Map<string, { terminal_id: string; expires: number }>();

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
      return verifySignature(
        null,
        signedBytes(nonce, raw),
        //
        { key, dsaEncoding: "ieee-p1363" },
        sig,
      )
        ? terminal_id
        : null;
    } catch {
      return null;
    }
  };

  const https = createHttpsServer({ cert: deps.tls.cert, key: deps.tls.key });

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
    try {
      spki = Buffer.from(body.public_key, "base64url");
      // Parsed HERE so a key that cannot be imported is refused at enrolment rather than at every
      // later request, where it would look like a signature failure.
      createPublicKey({ key: spki, format: "der", type: "spki" });
    } catch {
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
