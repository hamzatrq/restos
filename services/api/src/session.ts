/**
 * Session tokens (`18 §5`: `jose`; founder ruling `dac8747`: sessions live in `services/api`).
 *
 * **The token is an IDENTITY claim, and deliberately nothing more.** It carries `sub` — a user id
 * — and an expiry. It does NOT carry roles, assignments, an org, or a permission list, and that
 * is not minimalism: `01-F27` puts authorization on "every API/sync operation", so the authority
 * behind an identity is re-read from the server's own store per request. A token that carried its
 * own authority would keep a revoked manager authorized until it expired, and would make a signed
 * claim into an input to `can()` — the Commandment 8 violation with a signature on it.
 *
 * Two shapes follow `services/sync-gateway/src/auth.ts`, which solved the same problems first:
 * HS256, and expiry as a custom epoch-ms `expires_at` claim rather than the standard `exp`,
 * because standard-`exp` verification reads the wall clock and `18 §4` injects it.
 */

import { jwtVerify, SignJWT } from "jose";

/**
 * A back-office session's lifetime — 12 hours, a **pinned interpretation**, not a specified one.
 * No FR states it: `DEC-AUTH-001` gives 90 days to a DEVICE token, which is the wrong precedent
 * for a person (a device is a registered, revocable object; a laptop is a shared desk). Twelve
 * hours is one working day, so an owner logs in once a day and a walked-away session does not
 * outlive the shift. Recorded here rather than settled — session rotation and revocation are
 * named as owed work in `backoffice-catalog.md` Q2 and this constant is what they will replace.
 */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export type SessionClaims = {
  readonly user_id: string;
  /** Epoch ms, enforced against the INJECTED clock (`18 §4`). */
  readonly expires_at: number;
};

const keyOf = (secret: string): Uint8Array => new TextEncoder().encode(secret);

/** Mint a session for a user the server has ALREADY authenticated. */
export const issueSessionToken = async (
  user_id: string,
  secret: string,
  now: number,
  ttl_ms: number = SESSION_TTL_MS,
): Promise<string> =>
  new SignJWT({ expires_at: now + ttl_ms })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user_id)
    .sign(keyOf(secret));

/**
 * Verify signature and expiry. `null` for anything that does not verify — a caller distinguishing
 * "bad signature" from "expired" would be telling an attacker which half to work on, and every
 * failure here has the same consequence anyway.
 *
 * Only `sub` and `expires_at` are read. Any other claim in the payload is ignored on purpose:
 * that is where a smuggled `roles: ["owner"]` would live.
 */
export const verifySessionToken = async (
  token: string,
  secret: string,
  now: number,
): Promise<SessionClaims | null> => {
  try {
    const { payload } = await jwtVerify(token, keyOf(secret), { algorithms: ["HS256"] });
    const user_id = payload.sub;
    const expires_at = payload.expires_at;
    if (typeof user_id !== "string" || user_id === "") return null;
    if (typeof expires_at !== "number") return null;
    if (now >= expires_at) return null;
    return { user_id, expires_at };
  } catch {
    return null;
  }
};
