/**
 * # `00 §5.4` — **the cloud leg is `wss://`**, and the hostile spellings that read as if they were
 *
 * The defect this suite defends against was live and shipping until 2026-08-23:
 * `createWsCloudTransport` dialled `new WebSocket(url)` with the string taken verbatim, both
 * Electron hosts passed `process.env.RESTOS_CLOUD_URL` straight through, `README.md` specified the
 * variable as `ws://host:8080/sync`, and `wss://` appeared in no document in the repository — on the
 * ONE leg that crosses the public internet, carrying `01-F28`'s Argon2id staff hashes, `01-F47`'s
 * device token, `01-F81`'s `device_roster` and every event. `01-F72` (c) had already recorded it in
 * the corpus as *"a law this leg has never met"*.
 *
 * ## What each section owns, so a failure names a claim rather than a file
 *
 * - **§A** the accepted forms — `wss://`, including the case-folded scheme, which must NOT be a
 *   false refusal.
 * - **§B** `00 §5.4` (i)'s loopback carve-out: the three spellings every runbook uses, plus the
 *   spellings WHATWG's IPv4 parser hands us for free.
 * - **§C** **the hostile set.** Every member is a string that reads as loopback or as secure to a
 *   human, to `String.includes` or to `String.startsWith`, and is neither. This is the section the
 *   suite exists for.
 * - **§D** the refusal MESSAGE, because `00 §5.4` (ii) requires the variable to be named and a
 *   refusal nobody can act on is a till that stays down.
 * - **§E** the SEAM (`AGENTS.md`'s recurring defect): that `createWsCloudTransport` itself refuses,
 *   at construction, before a socket exists. A correct predicate no shipping code consults is the
 *   defect and not the fix. The other half of the seam — that each host's entry point calls the
 *   BOOT guard — is asserted where those hosts live, because both `index.ts` files import
 *   `electron` and are unreachable from vitest: `apps/pos-electron/src/main/__acceptance__/` and
 *   `apps/pass-kds/src/main/__acceptance__/cloud-url-boot-seam.test.ts`.
 * - **§F** `01-F17`: an unset key is offline and starts, and the loopback carve-out starts.
 */
import { describe, expect, it } from "vitest";
import { classifyCloudUrl, cloudUrlRefusal, describeCloudUrl } from "../cloud-url.js";
import { createWsCloudTransport } from "../transport-ws.js";

const ENV_KEY = "RESTOS_CLOUD_URL";

/** A clock the transport never gets to use: every construction below is expected to throw. */
const unusedClock = {
  now: () => 0,
  setTimeout: () => {
    throw new Error("the transport dialled — it should have refused at construction");
  },
  clearTimeout: () => undefined,
} as unknown as Parameters<typeof createWsCloudTransport>[0]["clock"];

describe("§A — wss:// is the production form", () => {
  it.each([
    "wss://sync.example.com/sync",
    "wss://sync.example.com:8080/sync",
    "wss://203.0.113.10:8080/sync",
  ])("accepts %s", (url) => {
    expect(classifyCloudUrl(url)).toEqual({ kind: "tls" });
    expect(cloudUrlRefusal(url, ENV_KEY)).toBeNull();
  });

  /**
   * A WHATWG scheme is case-insensitive and `new URL` folds it, so `WSS://` is genuinely TLS.
   * Refusing it would be a FALSE REFUSAL of a secure deployment — a stopped till for no security
   * gain — and it is also the mutant that separates a parser from `raw.startsWith("wss://")`.
   */
  it.each(["WSS://sync.example.com/sync", "Wss://sync.example.com/sync"])(
    "accepts the case-folded scheme %s rather than refusing a secure deployment",
    (url) => {
      expect(classifyCloudUrl(url)).toEqual({ kind: "tls" });
    },
  );

  it("refuses WS:// — the fold cuts one way only", () => {
    expect(classifyCloudUrl("WS://sync.example.com/sync").kind).toBe("refused");
  });
});

describe("§B — 00 §5.4 (i)'s loopback carve-out", () => {
  /** Every local run in README.md, plans/wave-1/running-the-stack.md and both app guides. */
  it.each(["ws://127.0.0.1:8080/sync", "ws://localhost:8080/sync", "ws://[::1]:8080/sync"])(
    "permits %s, because a guard without this stops every developer and every demo",
    (url) => {
      expect(classifyCloudUrl(url).kind).toBe("loopback");
      expect(cloudUrlRefusal(url, ENV_KEY)).toBeNull();
    },
  );

  it("permits wss:// to loopback too — TLS is never the thing that is refused", () => {
    expect(classifyCloudUrl("wss://127.0.0.1:8080/sync")).toEqual({ kind: "tls" });
  });

  /**
   * These come free from WHATWG's own IPv4 parser and are asserted rather than assumed: the point
   * of parsing is that these are the SAME host, and a hand-rolled string compare would refuse all
   * three while admitting §C's members.
   */
  it.each(["ws://127.1/sync", "ws://0177.0.0.1/sync", "ws://2130706433/sync"])(
    "normalises %s to 127.0.0.1 and permits it",
    (url) => {
      expect(classifyCloudUrl(url)).toEqual({ kind: "loopback", host: "127.0.0.1" });
    },
  );

  it("normalises the expanded IPv6 loopback", () => {
    expect(classifyCloudUrl("ws://[0:0:0:0:0:0:0:1]/sync")).toEqual({
      kind: "loopback",
      host: "[::1]",
    });
  });

  /**
   * A STATED false refusal, asserted so it cannot change silently. `[::ffff:127.0.0.1]` is a real
   * loopback that normalises to `[::ffff:7f00:1]` and not to `[::1]`; nothing in this repository
   * writes it, and a false refusal is a stopped dev box while a false admission is the defect.
   */
  it("refuses the IPv4-mapped IPv6 loopback, deliberately and narrowly", () => {
    expect(classifyCloudUrl("ws://[::ffff:127.0.0.1]/sync").kind).toBe("refused");
  });
});

describe("§C — the hostile set: strings that READ as loopback or secure and are not", () => {
  /**
   * The whole suite is here. Each row is admitted by at least one plausible cheap guard —
   * `raw.includes("127.0.0.1")`, `raw.includes("wss")`, `raw.startsWith("ws://localhost")` — and
   * each is refused by a parsed HOST comparison.
   */
  const hostile: ReadonlyArray<readonly [string, string]> = [
    ["ws://127.0.0.1.evil.com/sync", "a subdomain that begins with the loopback literal"],
    ["ws://localhost.evil.com/sync", "a subdomain that begins with localhost"],
    ["ws://evil.com/wss://sync", "wss:// in the PATH but not the scheme"],
    ["ws://evil.com?to=wss://sync", "wss:// in the query"],
    ["ws://evil.com#wss://sync", "wss:// in the fragment"],
    ["ws://127.0.0.1@evil.com/sync", "the loopback literal as USERINFO — the host is evil.com"],
    ["ws://user:pass@evil.com/sync", "credentials over cleartext to a remote host"],
    ["wss://127.0.0.1@evil.com/sync", "TLS, but the host a human reads is not the host dialled"],
    ["http://sync.example.com/sync", "cleartext, and not even a WebSocket scheme"],
    ["ws://sync.example.com:8080/sync", "the plain documented form — the defect itself"],
    ["ws://203.0.113.10:8080/sync", "cleartext to a bare public IP"],
    ["sync.example.com/sync", "no scheme at all"],
    ["", "empty"],
    ["   ", "whitespace"],
    ["wss://", "a scheme with no host"],
  ];

  it.each(hostile)("refuses %s (%s)", (url) => {
    expect(classifyCloudUrl(url).kind).toBe("refused");
    expect(cloudUrlRefusal(url, ENV_KEY)).not.toBeNull();
  });

  /**
   * ⚠ **The point of §C, stated as an assertion rather than as a comment.** These three cheap
   * guards are what a reader reaches for first, and each one admits part of the hostile set. If a
   * later edit replaces the parser with any of them, this fails by name.
   */
  it("a substring guard would admit the hostile set — this is why the URL is PARSED", () => {
    const admittedBySubstring = hostile
      .map(([url]) => url)
      .filter(
        (url) => url.includes("127.0.0.1") || url.includes("localhost") || url.includes("wss"),
      );
    expect(admittedBySubstring.length).toBeGreaterThan(0);
    for (const url of admittedBySubstring) expect(classifyCloudUrl(url).kind).toBe("refused");
  });

  it("names the host it would actually have dialled, so the userinfo trick is legible", () => {
    const verdict = classifyCloudUrl("ws://127.0.0.1@evil.com/sync");
    expect(verdict.kind).toBe("refused");
    if (verdict.kind !== "refused") throw new Error("unreachable");
    expect(verdict.reason).toContain("evil.com");
  });
});

describe("§D — 00 §5.4 (ii): the refusal names the variable and what to do", () => {
  it("names the configuration key", () => {
    const refusal = cloudUrlRefusal("ws://sync.example.com:8080/sync", ENV_KEY);
    expect(refusal).toContain(ENV_KEY);
  });

  it("offers the secure form and the offline option, so the operator has two actions", () => {
    const refusal = cloudUrlRefusal("ws://sync.example.com:8080/sync", ENV_KEY) ?? "";
    expect(refusal).toContain("wss://sync.example.com:8080/sync");
    expect(refusal).toContain("01-F17");
  });

  it("says which of the three loopback spellings are permitted", () => {
    const refusal = cloudUrlRefusal("ws://sync.example.com/sync", ENV_KEY) ?? "";
    for (const host of ["127.0.0.1", "localhost", "[::1]"]) expect(refusal).toContain(host);
  });

  it("the boot line distinguishes TLS from the loopback carve-out and says LOCAL only", () => {
    expect(describeCloudUrl("wss://sync.example.com/sync", ENV_KEY)).toContain("TLS");
    const local = describeCloudUrl("ws://127.0.0.1:8080/sync", ENV_KEY);
    expect(local).toContain("CLEARTEXT");
    expect(local).toContain("LOCAL RUNS ONLY");
  });
});

describe("§E — the SEAM: shipping code consults the predicate", () => {
  /**
   * `AGENTS.md`'s recurring defect of this wave is a correct subsystem with no seam to the product,
   * and `seams:check` cannot see this one: `classifyCloudUrl` IS reached, and a version of
   * `createWsCloudTransport` that called it and ignored the verdict would keep the rail clean. So
   * this is the hand-written assertion — and it mutates the SEAM, not the logic.
   */
  it.each([
    "ws://sync.example.com:8080/sync",
    "ws://127.0.0.1.evil.com/sync",
    "ws://127.0.0.1@evil.com/sync",
    "http://sync.example.com/sync",
  ])("createWsCloudTransport refuses %s AT CONSTRUCTION, before any socket", (url) => {
    expect(() => createWsCloudTransport({ url, clock: unusedClock })).toThrow(/00 §5.4/);
  });

  it.each(["wss://sync.example.com/sync", "ws://127.0.0.1:8080/sync"])(
    "createWsCloudTransport constructs for %s",
    (url) => {
      expect(() => createWsCloudTransport({ url, clock: unusedClock })).not.toThrow();
    },
  );
});

describe("§F — 01-F17: what must still start", () => {
  it("an UNSET key is offline, not a refusal — a WAN-less branch is normal", () => {
    expect(cloudUrlRefusal(undefined, ENV_KEY)).toBeNull();
    expect(describeCloudUrl(undefined, ENV_KEY)).toContain("OFFLINE");
  });

  it("the loopback carve-out produces no refusal, so every runbook still runs", () => {
    expect(cloudUrlRefusal("ws://127.0.0.1:8080/sync", ENV_KEY)).toBeNull();
  });
});
