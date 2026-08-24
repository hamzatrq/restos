// ACCEPTANCE TESTS — `04-F31` and `04-F32`: the pad never stops the till, and an operator can
// admit, list and revoke a tablet while the till is running.
//
// PROVENANCE (`24 §3` step 2): written in the session that fixed the adversarial review of
// `04-F21`..`04-F26`; `20 §4.3`'s separation is NOT satisfied and the mitigation is the round-3
// law alone. Every assertion was measured against a mutant that restores the defect it owns.
//
// THE THREE DEFECTS, each reproduced before it was fixed:
//
//   1. `04-F32` (a) — NO `error` LISTENER ON THE HTTPS SERVER. A port already bound raises `error`
//      on an emitter with no listener, which in Node is an uncaught exception; this app installs
//      no `process.on("uncaughtException")` and `counterBoot.catch(fatal)` cannot see an async
//      event. Reproduced standalone against real OpenSSL material: `UNCAUGHT EXCEPTION:
//      EADDRINUSE`, exit 7. The repo already answers this one file over — `transport-ws.ts` swallows
//      both `error` and `tlsClientError` because *"`01-F17` says nothing about the LAN may take the
//      till down"* — and this port had neither.
//   2. `04-F32` (b) — MALFORMED PEM THREW SYNCHRONOUSLY out of `createHttpsServer`, out of
//      `counterBoot`, into `fatal`. Reproduced: garbage gives `ERR_OSSL_PEM_NO_START_LINE`, a
//      truncated certificate gives `ERR_OSSL_PEM_BAD_END_LINE`. The till then exits non-zero
//      printing *"The device store could not be opened"* — a message naming the wrong subsystem,
//      for a till that is otherwise perfectly able to sell (`01-F17`).
//   3. `04-F31` — ONE TABLET PER BOOT, AND NO WAY TO REVOKE. `mintEnrolmentCode` had exactly one
//      call site (the boot line) and the code is single-use with a five-minute life, so a second
//      tablet needed a restart — which un-enrols the first. `enrolments()` and `revoke()` had ZERO
//      production callers, so `04-F22` (b)'s *"enrolments are listed and revocable at the till"*
//      could not be performed at all. `seams:check` is blind to both: object members, not exports.
//
// ⚠ WHAT THIS SUITE DOES NOT CLAIM. §C drives the console's PARSE, not a terminal: whether the
// host is attached to a TTY is `main/index.ts`'s business and §D reads it as source, weakly and
// deliberately. Nothing here is evidence about a packaged Windows till, which has no console at
// all — a limit `04-F31` states rather than hides.

import { readFileSync } from "node:fs";
import { createOrgIssuer } from "@restos/lan-pki";
import { afterEach, describe, expect, it } from "vitest";
import type { Terminal } from "../terminal";
import { createTerminalConsole } from "../terminal-console";
import { createTerminalServer, type TerminalServer } from "../terminal-server";

const SRC = new URL("../", import.meta.url).pathname;
const readSrc = (rel: string): string => readFileSync(`${SRC}${rel}`, "utf8");

/** A terminal that does nothing: every assertion here is about the WIRE and the operator's acts. */
const inertTerminal = (): Terminal => ({
  roster: () => [],
  signIn: async () => ({ ok: false, reason: "malformed" }),
  signOut: () => {},
  view: () => null,
  act: () => ({ ok: false, reason: "not_signed_in" }),
});

const opened: TerminalServer[] = [];
afterEach(async () => {
  for (const s of opened.splice(0)) await s.close();
});

const server = (
  over: Partial<Parameters<typeof createTerminalServer>[0]> = {},
): {
  server: TerminalServer;
  lines: string[];
} => {
  const lines: string[] = [];
  const built = createTerminalServer({
    terminal: inertTerminal(),
    tls: null,
    port: 0,
    bundleDir: null,
    now: () => 1_754_300_000_000,
    log: (line) => lines.push(line),
    ...over,
  });
  return { server: built, lines };
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — `04-F32` (b): certificate material that cannot be used is "no pad", never a dead till.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 04-F32 — a certificate that will not parse never stops the till", () => {
  const GARBAGE = { cert: "not a certificate at all", key: "not a key either" };

  it("A1 — construction RETURNS rather than throwing, and says the pad is off", () => {
    // The defect verbatim: this call threw `ERR_OSSL_PEM_NO_START_LINE` out of `counterBoot` and
    // into `fatal`, which exits the app non-zero.
    const build = () => server({ tls: GARBAGE });
    expect(
      build,
      "a malformed certificate took the whole till down with it (01-F17)",
    ).not.toThrow();
    const built = build();
    expect(built.server.listening).toBe(false);
    // `00 §5.7` — it names what is true, and the boot line is where an operator finds it today.
    expect(built.server.reason).toMatch(/certificate/i);
    expect(built.lines.join("\n")).toMatch(/certificate/i);
  });

  it("A2 — a pad that was CONFIGURED and did not come up is a failure; an absent one is not", () => {
    // The distinction the honesty surface needs: most tills have no pad and that is the deliberate
    // OFF state (`04-F22` (a)), while a till whose certificate is broken has a pad that was asked
    // for and is not serving. Reporting them the same way would make the second invisible.
    expect(server({ tls: GARBAGE }).server.failure()).not.toBeNull();
    expect(server().server.failure()).toBeNull();
  });

  it("A3 — a truncated certificate is refused the same way, not by shape-matching the error", () => {
    const truncated = {
      cert: "-----BEGIN CERTIFICATE-----\nMIIB",
      key: "-----BEGIN PRIVATE KEY-----\nMIIB",
    };
    expect(() => server({ tls: truncated })).not.toThrow();
    expect(server({ tls: truncated }).server.listening).toBe(false);
  });

  it("A4 — the CONTROL: with no certificate at all, nothing listens and nothing failed", () => {
    // Without this row, "it did not throw" would be satisfied by a module that never builds a
    // server under any input.
    const { server: built, lines } = server();
    expect(built.listening).toBe(false);
    expect(built.failure()).toBeNull();
    expect(lines.join("\n")).toContain("04-F22 (a)");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — `04-F32` (a): the async bind failure. Driven against the REAL `node:https` emitter.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 04-F32 — a port already in use does not raise an uncaught exception", () => {
  it("B0 — DRIVEN: a second server on a bound port survives, and says what happened", async () => {
    // THE DEFECT VERBATIM, on real TLS material and a real socket. Reproduced standalone before
    // the fix as `UNCAUGHT EXCEPTION: EADDRINUSE` and exit 7 — here the second construction must
    // come back, the process must live, and the failure must be readable.
    const issuer = await createOrgIssuer("terminal-ops-test", 1_754_300_000_000);
    const tls = { cert: issuer.certPem, key: issuer.privateKeyPem };
    const first = server({ tls });
    opened.push(first.server);
    const port = await first.server.boundPort();
    expect(port, "the first server never bound, so nothing is being contested").not.toBeNull();

    const second = server({ tls, port: port as number });
    opened.push(second.server);
    // An `error` on an emitter with no listener is an uncaught exception in the main process; the
    // event arrives on a later tick, so this waits for the tick rather than asserting synchronously.
    await new Promise((done) => setTimeout(done, 200));
    expect(
      second.server.failure(),
      "the port collision was not caught — before this it was an uncaught EADDRINUSE and the till exited",
    ).toMatch(/EADDRINUSE/);
    // `00 §5.7` — and it reached the operator's log rather than only a getter.
    expect(second.lines.join("\n")).toMatch(/did not come up/);
    // THE CONTROL: the first server is untouched and still serving. A guard that took the running
    // till down with the second process would be the defect wearing a fix.
    expect(first.server.failure()).toBeNull();
    expect(await first.server.boundPort()).toBe(port);
  });

  it("B1 — the module installs an `error` listener before it listens", () => {
    // A source read, and named as weak: binding a real port twice inside vitest would race the
    // runner's own sockets. What it pins is the property whose ABSENCE was an uncaught exception —
    // `transport-ws.ts` carries the identical pair for the identical reason.
    const src = readSrc("terminal-server.ts");
    const at = src.indexOf("https.listen(");
    expect(at, "the module no longer listens").toBeGreaterThan(-1);
    const before = src.slice(0, at);
    expect(before, "no error listener before listen() — an EADDRINUSE is uncaught").toContain(
      'https.on("error"',
    );
    // `tlsClientError` is the shop-Wi-Fi half: a stranger dialling this port must not be able to
    // crash the till by starting a handshake and abandoning it.
    expect(before).toContain('https.on("tlsClientError"');
  });

  it("B2 — the listeners are on the SERVER this module returns, not on a stray emitter", () => {
    // The mutant this kills is a listener attached to something else — the shape a careless fix
    // takes when it is written to satisfy a string match.
    const src = readSrc("terminal-server.ts");
    const created = /(\w+)\s*=\s*createHttpsServer\(/.exec(src)?.[1];
    expect(created, "nothing binds the https server").toBeTruthy();
    expect(src).toContain(`${created as string}.on("error"`);
    expect(src).toContain(`${created as string}.listen(`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — `04-F31`: the three operator acts, driven through the console's own parse.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 04-F31 — mint, list and revoke are things a person can actually do", () => {
  const fake = (over: Partial<TerminalServer> = {}) => {
    const admitted = new Set<string>(["tablet-a", "tablet-b"]);
    const minted: string[] = [];
    const lines: string[] = [];
    const stub: TerminalServer = {
      listening: true,
      reason: "listening",
      failure: () => null,
      mintEnrolmentCode: () => {
        const code = `code-${minted.length + 1}`;
        minted.push(code);
        return code;
      },
      enrolments: () => [...admitted],
      revoke: (id: string) => admitted.delete(id),
      close: async () => {},
      boundPort: async () => 0,
      ...over,
    };
    return {
      console: createTerminalConsole({ server: stub, log: (l) => lines.push(l) }),
      lines,
      minted,
      admitted,
    };
  };

  it("C1 — `pad enrol` mints a code, and a SECOND tablet no longer needs a restart", () => {
    const rig = fake();
    rig.console.command("pad enrol");
    rig.console.command("pad enrol");
    // The defect: exactly one code existed per launch, and it was single-use. Two are two.
    expect(rig.minted).toEqual(["code-1", "code-2"]);
    expect(rig.lines.join("\n")).toContain("code-2");
  });

  it("C2 — `pad` lists the tablets this till has admitted", () => {
    const rig = fake();
    rig.console.command("pad");
    expect(rig.lines.join("\n")).toContain("tablet-a");
    expect(rig.lines.join("\n")).toContain("tablet-b");
  });

  it("C3 — `pad revoke <id>` reaches the server and says which outcome happened", () => {
    const rig = fake();
    rig.console.command("pad revoke tablet-a");
    expect(rig.admitted.has("tablet-a"), "the tablet is still admitted after a revoke").toBe(false);
    expect(rig.lines.join("\n")).toContain("revoked tablet-a");

    // An id nobody holds is NOT reported as a revocation: telling an operator a stolen tablet is
    // out when it never was is worse than telling her nothing.
    rig.console.command("pad revoke tablet-zzz");
    expect(rig.lines.join("\n")).toMatch(/no tablet tablet-zzz/);
  });

  it("C4 — a revoke with no id asks for one, and nothing is revoked", () => {
    const rig = fake();
    rig.console.command("pad revoke");
    expect(rig.admitted.size).toBe(2);
    expect(rig.lines.join("\n")).toMatch(/name the tablet/i);
  });

  it("C5 — with no certificate the console says the pad is OFF rather than 'no tablets'", () => {
    const rig = fake({ listening: false });
    rig.console.command("pad");
    expect(rig.lines.join("\n")).toMatch(/OFF/);
    rig.console.command("pad enrol");
    // And it mints nothing: a code for a port that does not exist is a code that cannot work.
    expect(rig.minted).toEqual([]);
  });

  it("C6 — a bind failure is reported to the operator who asks what is enrolled", () => {
    const rig = fake({ failure: () => "the order pad's port 8443 did not come up: EADDRINUSE" });
    rig.console.command("pad");
    expect(rig.lines.join("\n")).toContain("EADDRINUSE");
  });

  it("C7 — anything else is answered with the vocabulary, and nothing happens", () => {
    const rig = fake();
    rig.console.command("pad wibble");
    expect(rig.lines.join("\n")).toContain("pad revoke");
    expect(rig.minted).toEqual([]);
    expect(rig.admitted.size).toBe(2);
  });

  it("C8 — a line that is not ours is IGNORED, silently", () => {
    // The console shares stdin with whatever else a terminal-launched Electron app prints and
    // reads. A parser that answered every line would be noise on a till's own log.
    const rig = fake();
    rig.console.command("");
    rig.console.command("   ");
    rig.console.command("ls -la");
    expect(rig.lines).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — THE SEAM. A source read, weak and named as such: `main/index.ts` builds an Electron app at
// module scope and no suite in this package can import it.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 04-F31 — the shipped host reaches the console with the REAL server", () => {
  const mainSrc = readSrc("index.ts");

  it("D0 — is actually reading the file it guards", () => {
    expect(mainSrc).toContain("app.whenReady()");
    expect(mainSrc).toContain("createTerminalServer({");
    expect(mainSrc.length).toBeGreaterThan(20_000);
  });

  it("D1 — the console is constructed over the terminal server, not over a stub", () => {
    const at = mainSrc.indexOf("createTerminalConsole({");
    expect(at, "the operator console is not constructed at all").toBeGreaterThan(-1);
    const args = mainSrc.slice(at, mainSrc.indexOf("\n  });", at));
    const bound = /const\s+(\w+)\s*=\s*createTerminalServer\(/.exec(mainSrc)?.[1];
    expect(bound, "nothing binds the terminal server").toBeTruthy();
    expect(args, "the console was handed something other than the real server").toContain(
      `server: ${bound as string}`,
    );
  });

  it("D2 — stdin is what feeds it, and only when there is a console to read", () => {
    const at = mainSrc.indexOf("createTerminalConsole({");
    const after = mainSrc.slice(at, at + 900);
    expect(after).toContain("process.stdin.isTTY");
    expect(after).toContain("process.stdin.on(");
    // The binding is read rather than assumed, so the host may name it anything.
    const bound = /const\s+(\w+)\s*=\s*createTerminalConsole\(/.exec(mainSrc)?.[1];
    expect(bound).toBeTruthy();
    expect(after).toContain(`${bound as string}.command(`);
  });
});
