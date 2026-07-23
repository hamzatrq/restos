// Device-token issue/verify — the NAMED auth seam, T-01-09 (01-F27 server-side
// validation; 18 §5 jose device tokens, §14-listed). Replaces the T-01-07
// unsigned base64url dev-token stub with real HS256 verification under the same
// claims contract { org_id, branch_id, device_id, hub_relay?, expires_at? }
// (T-01-07 assumption 7 / T-01-12 pinned relay surface). The RETIRED dev-token
// shape no longer opens a session for anyone.
//
// Verification here is SIGNATURE + CLAIM SHAPE only. The gateway composes the
// rest of the T-01-09 law at the session boundary: expiry against the INJECTED
// clock (18 §4), claims-match-hello consistency, and the registry authority —
// an (org_id, device_id) row in kernel.device_registry that is unrevoked and
// branch-matching (18 §5: the registry, never the token or the hello, decides).
// The relay capability is likewise composed: token claim `hub_relay` AND an
// unrevoked registry row whose class is hub-eligible — neither alone. Relayed
// ORIGIN devices are validated against the registry at the merge boundary
// (gateway.ts: `origin_unregistered` / `origin_revoked` — the DEC-SYNC-009 F6
// hole T-01-09 closes; fix round F6 documented it here until this landed).
import { jwtVerify, SignJWT } from "jose";

export type DeviceTokenClaims = {
  org_id: string;
  branch_id: string;
  device_id: string;
  /** Hub-relay capability CLAIM (DEC-SYNC-009): necessary, never sufficient — the registry has veto. */
  hub_relay: boolean;
  /** Optional expiry, epoch ms — enforced by the gateway against the injected clock (18 §4). */
  expires_at?: number;
};

/** issueDeviceToken input: the same claims, capability/expiry optional. */
export type DeviceTokenInput = {
  org_id: string;
  branch_id: string;
  device_id: string;
  hub_relay?: boolean;
  expires_at?: number;
};

const keyOf = (tokenSecret: string): Uint8Array => new TextEncoder().encode(tokenSecret);

/**
 * Mint a device token (Wave-0 issuance seam; the pairing-code provisioning UX
 * is doc 14/15). Deterministic HS256: no iat/jti/exp is stamped, so identical
 * claims + secret always yield identical bytes (the committed golden fixtures
 * rely on this). expires_at rides as a custom epoch-ms claim, NOT `exp` —
 * standard-`exp` verification would read the wall clock and break the
 * injected-clock law (18 §4).
 */
export const issueDeviceToken = async (
  claims: DeviceTokenInput,
  tokenSecret: string,
): Promise<string> =>
  new SignJWT({
    org_id: claims.org_id,
    branch_id: claims.branch_id,
    device_id: claims.device_id,
    ...(claims.hub_relay === true ? { hub_relay: true } : {}),
    ...(claims.expires_at === undefined ? {} : { expires_at: claims.expires_at }),
  })
    .setProtectedHeader({ alg: "HS256" })
    .sign(keyOf(tokenSecret));

const claim = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

/**
 * Verify signature (HS256 under tokenSecret) and extract the claims. Returns
 * null on ANY failure — tampered, wrong-key, or not a compact JWS (which
 * includes every retired unsigned dev token). Expiry is NOT checked here: the
 * verifier has no clock; the gateway enforces expires_at ≤ clock.now() (18 §4).
 */
export const verifyDeviceToken = async (
  token: string,
  tokenSecret: string,
): Promise<DeviceTokenClaims | null> => {
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(token, keyOf(tokenSecret), { algorithms: ["HS256"] }));
  } catch {
    return null;
  }
  const org_id = claim(payload.org_id);
  const branch_id = claim(payload.branch_id);
  const device_id = claim(payload.device_id);
  if (org_id === null || branch_id === null || device_id === null) return null;
  return {
    org_id,
    branch_id,
    device_id,
    hub_relay: payload.hub_relay === true,
    ...(typeof payload.expires_at === "number" ? { expires_at: payload.expires_at } : {}),
  };
};
