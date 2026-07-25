// T-01-09 FIX ROUND oracle — F2 (plans/wave-0/t-01-09-fix-round.md @08a1b72,
// rides with the ruled F1): the server boot env validator rejects a
// DEVICE_TOKEN_SECRET under 32 bytes (18 §5 crash-at-boot on invalid env;
// 01-F27 — every HS256 signature the gateway trusts is only as strong as this
// symmetric key; device-auth.test.ts already carries the "≥ 32 bytes" note on
// its own committed test secret). Authored from the fix-round plan + 18 §5 ONLY
// (24 §3 step 2: read-only to the implementing session).
//
// RED-AWAITING-FIX: today the validator checks non-empty only — a 10-character
// secret boots a gateway whose whole auth plane rests on a trivially forceable
// key. Pinned at the boot surface (start() reads process.env via defineEnv):
// a 10-byte secret must reject at boot with the offending key and the 32-byte
// floor named; an exactly-32-byte secret (the boundary) must still boot.
import { createServer } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { start } from "../server.js";
import { testDatabaseUrl } from "./helpers.js";

const ENV_KEYS = ["DATABASE_URL", "DEVICE_TOKEN_SECRET", "PORT"] as const;
let saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) saved[key] = process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

/** A currently-free TCP port (the PORT validator rejects 0, so bind-then-release). */
const ephemeralPort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => {
        if (typeof address === "object" && address !== null) resolve(address.port);
        else reject(new Error("no ephemeral port"));
      });
    });
  });

type BootOutcome = { app: Awaited<ReturnType<typeof start>> } | { error: unknown };

/** Boot through the real env surface; never lets a listener leak out of a red run. */
const boot = async (): Promise<BootOutcome> => {
  try {
    return { app: await start() };
  } catch (error) {
    return { error };
  }
};

describe("F2 — DEVICE_TOKEN_SECRET length is validated at boot (t-01-09-fix-round F2 / 18 §5 / 01-F27)", () => {
  it("F2/18 §5: a 10-character secret is REJECTED at boot — loud crash naming DEVICE_TOKEN_SECRET and the 32-byte floor; no server listens", async () => {
    process.env.DATABASE_URL = testDatabaseUrl();
    process.env.DEVICE_TOKEN_SECRET = "0123456789"; // 10 bytes — far under the HS256 floor
    process.env.PORT = String(await ephemeralPort());

    const outcome = await boot();
    if ("app" in outcome) await outcome.app.close(); // red-run hygiene: today this BOOTS
    expect("error" in outcome).toBe(true);
    const message = String((outcome as { error: unknown }).error);
    expect(message).toContain("DEVICE_TOKEN_SECRET"); // defineEnv names the offending key
    expect(message).toContain("32"); // the floor is named — operators must learn the fix
  });

  it("F2/18 §5: an exactly-32-byte secret (the boundary) still boots and closes cleanly — the validator must not overshoot the floor", async () => {
    process.env.DATABASE_URL = testDatabaseUrl();
    process.env.DEVICE_TOKEN_SECRET = "s".repeat(32); // 32 ASCII bytes — ≥ 32 accepted
    process.env.PORT = String(await ephemeralPort());

    const outcome = await boot();
    expect("error" in outcome ? (outcome as { error: unknown }).error : null).toBeNull();
    if ("app" in outcome) await outcome.app.close();
  });
});
