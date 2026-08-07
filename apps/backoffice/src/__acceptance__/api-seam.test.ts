// **THE LINK BETWEEN THE TWO PROCESSES, WHICH IS STATED IN TWO FILES AND CONNECTED BY NOTHING.**
//
// This app has no backend of its own. Its whole path to `services/api` is:
//
//     browser → httpBatchLink(TRPC_URL) → Next rewrite(source) → RESTOS_API_URL + /trpc
//
// `TRPC_URL` lives in `lib/trpc.tsx` and the rewrite's `source` lives in `next.config.ts`, and
// until this file existed nothing required them to be the same string. Change one and every gate
// stays green — the suite drives a real tRPC client over a FAKE link, so it never touches the
// rewrite, and `next build` never touches the client's URL. That is this wave's recurring defect
// (AGENTS.md) in its purest form: two correct halves and no assertion that they meet.
//
// So: the real `next.config.ts`, its real `rewrites()`, checked against the constant the shipped
// client actually passes to `httpBatchLink` — imported, never copied.
//
// ⚠ What this does NOT claim: that a browser reaches the API. It claims the two configured paths
// agree and that the destination is operator-configurable. The process seam on the other side is
// `services/api/src/__acceptance__/startable.test.ts`, which boots the service for real.

import { afterEach, describe, expect, it } from "vitest";
import nextConfig from "../../next.config.js";
import { TRPC_URL } from "../lib/trpc.js";

/** `next.config.ts` reads env at call time, so each case sets its own and puts it back. */
const withEnv = async <T>(value: string | undefined, run: () => Promise<T>): Promise<T> => {
  const before = process.env.RESTOS_API_URL;
  if (value === undefined) delete process.env.RESTOS_API_URL;
  else process.env.RESTOS_API_URL = value;
  try {
    return await run();
  } finally {
    if (before === undefined) delete process.env.RESTOS_API_URL;
    else process.env.RESTOS_API_URL = before;
  }
};

const trpcRewrite = async (): Promise<{ source: string; destination: string }> => {
  const rewrites = await nextConfig.rewrites?.();
  if (rewrites === undefined) throw new Error("next.config.ts declares no rewrites");
  // `rewrites()` may return a bare array or the three-phase object; both shapes are Next's, and
  // reading only the one this config happens to use today would make the test a copy of the
  // implementation rather than a check on it.
  const rules = Array.isArray(rewrites) ? rewrites : (rewrites.beforeFiles ?? []);
  const rule = rules.find((candidate) => candidate.source.startsWith(TRPC_URL));
  if (rule === undefined) {
    throw new Error(
      `no rewrite whose source starts with the client's TRPC_URL (${TRPC_URL}). ` +
        `Sources declared: ${rules.map((candidate) => candidate.source).join(", ")}`,
    );
  }
  return { source: rule.source, destination: rule.destination };
};

afterEach(() => {
  delete process.env.RESTOS_API_URL;
});

describe("the back office reaches services/api", () => {
  it("reads a real TRPC_URL from the shipped client (this file is vacuous without one)", () => {
    // ⚠ **This assertion is here because the hole it closes actually opened**, during this file's
    // own mutation run: `TRPC_URL` stopped being exported and every case below still FAILED — but
    // with `no rewrite whose source starts with … (undefined)`, which reads like a broken rewrite.
    // `undefined` would compare equal to `undefined` in the wrong arrangement of these tests, and
    // an oracle whose subject can silently become `undefined` is the round-3 defect (AGENTS.md):
    // a mechanism that runs, and never runs over the case that matters. So the subject is checked
    // first, and it names itself when it goes missing.
    expect(
      typeof TRPC_URL,
      "TRPC_URL is not exported by lib/trpc — every case below is vacuous",
    ).toBe("string");
    expect(TRPC_URL.startsWith("/")).toBe(true);
  });

  it("rewrites exactly the path the shipped client calls", async () => {
    // `:path*` and nothing else after the client's base. A rewrite mounted one segment away is a
    // 404 on every query, and it is the kind of edit that reviews clean.
    const { source } = await trpcRewrite();
    expect(source).toBe(`${TRPC_URL}/:path*`);
  });

  it("sends it to services/api's tRPC mount, not to the app's own origin", async () => {
    // `/trpc` is `createApiServer`'s Fastify prefix. The client's `/api/` segment is Next's, and
    // it must NOT survive the hop — the API serves `/trpc/*`, not `/api/trpc/*`.
    const { destination } = await withEnv("http://api.invalid:9999", trpcRewrite);
    expect(destination).toBe("http://api.invalid:9999/trpc/:path*");
  });

  it("takes the API's address from RESTOS_API_URL, so a deployment repoints it without a rebuild", async () => {
    const sentinel = "http://not-a-real-host.invalid:12345";
    const { destination } = await withEnv(sentinel, trpcRewrite);
    // A hardcoded backend address fails here. Read at REQUEST time by the Next server, so it is
    // never inlined into the browser bundle and never crosses an origin with the bearer on it.
    expect(destination.startsWith(sentinel)).toBe(true);
  });

  it("defaults to the loopback address services/api binds in development", async () => {
    // The two-command startup in CLAUDE.md relies on this: step 2 needs no env to talk to step 1
    // on its default port. `services/api`'s `PORT` defaults to 3001.
    const { destination } = await withEnv(undefined, trpcRewrite);
    expect(destination).toBe("http://127.0.0.1:3001/trpc/:path*");
  });
});
