/**
 * **`01-F80` — THE PAIRING CODE, CLOUD HALF: the mint, the claim, and the five refusals.**
 *
 * `01-F25` has said since Draft 1 that *"registration is a one-time pairing via back office code"*
 * and nothing anywhere specified the credential half, so `provision-device.ts` — a shell command on
 * the service host — stayed the only way a till came into existence. `01-F80` specifies it; this
 * module is the writer. **Doc 14 owns the SURFACE (`14-F41`); this file owns nothing about how a
 * code is displayed, read aloud or re-issued.**
 *
 * ⚠ **PROTECTED PATH (commandment 10, `20 §4.4`): this module mints a device's two credentials.**
 *
 * ── THE TWO ACTS ────────────────────────────────────────────────────────────────────────────────
 *
 *   `mintPairingCode` — the OWNER's act, authenticated one layer up. Fixes `org_id`, `branch_id`,
 *   `device_class` and `01-F70`'s name, mints the `device_id`, draws the code, and writes a pending
 *   row. **It writes NO registry row** (`01-F80` (c), `14-F41`: "Before a claim there is no
 *   device").
 *
 *   `claimPairing` — the DEVICE's act, unauthenticated by construction (`01-F80` (f): the device
 *   holds no credential yet). Takes the code and a public key and **nothing else**, and returns
 *   everything a device needs to become a till — identity, `01-F73`'s certificate with its org
 *   issuer PEM, `01-F81`'s pinned roster-signing key, and `01-F47`'s device token.
 *
 * ── WHAT THE DEVICE MAY SAY, AND WHY IT IS SO LITTLE ────────────────────────────────────────────
 *
 * `01-F80` (a): "Class and branch are not claimable … the name is not claimable … **The claim
 * states no tenant either** — a caller-stated `org_id` would be a client role claim at the one
 * moment in this product's life when there is no session to check it against". So `ClaimRequest`
 * is a **strict** object of exactly two members: a body carrying anything else fails to parse
 * rather than being quietly ignored, which is the difference between a rule and a convention.
 *
 * ── THE ONE DESIGN DECISION NO FR MAKES: HOW A CLAIM FINDS ITS ROW ──────────────────────────────
 *
 * An Argon2id verifier carries a random salt and cannot be looked up by. The alternatives and the
 * choice are argued in `drizzle/0014_device_pairing.sql`'s header; the short form is that scanning
 * every live row costs one Argon2id verification per row **per guess** (a denial of service
 * `01-F80` (e) refuses by name), storing a selector spends the entropy (b) sizes against an online
 * guess, and a **keyed blind index** — `HMAC-SHA256(deployment key, code)` — costs one SELECT and
 * is not reversible by anyone holding only a database dump. That is exactly (b)'s stated property:
 * *"a database read then hands over no live pairing"*.
 *
 * **The index key is DERIVED from the device-token secret and is never the secret**
 * (`pairingIndexKey`): one secret, two purposes, separated by construction.
 *
 * ── WHAT THIS FILE DELIBERATELY DOES NOT DO ─────────────────────────────────────────────────────
 *
 *   · **It emits no event.** `14-F41` names `device.registered` as the act it unblocks and then
 *     records that the type has **no payload schema in `packages/domain`**, so `01-F4` makes the
 *     emit a build-time error — unbuildable rather than unbuilt. `provision-device.ts` and
 *     `revoke-device.ts` emit none either. The `actor_user_id` the mint carries is stored on the
 *     pending row so the emit has an actor the day the schema lands.
 *   · **It does not cancel or re-issue.** `01-F80` (c) says re-issuing "kills the previous code"
 *     and `14-F41` owns the surface that names *which* waiting row is being re-issued; neither
 *     gives this act a parameter for it. Owed with that surface.
 *   · **It sweeps nothing.** An expired pending row is KEPT — deleting it would make `expired` and
 *     `unknown_code` indistinguishable, and `01-F80` (f) distinguishes them deliberately.
 */

import { createHash, createHmac, createPublicKey, randomInt } from "node:crypto";
import {
  DEVICE_CLASSES,
  type DeviceClass,
  DisplayName,
  hashPin,
  newId,
  verifyPin,
} from "@restos/domain";
import { createOrgIssuer, type IssuerMaterial, issueDeviceCertificate } from "@restos/lan-pki";
import { sql } from "drizzle-orm";
import { DEVICE_TOKEN_TTL_MS, issueDeviceToken } from "./auth.js";
import type { GatewayDb } from "./gateway.js";
import { registerDevice } from "./registry.js";

/**
 * `01-F80` (b) — "8 CSPRNG digits, displayed and read as `1234 5678`".
 *
 * ⚠ **Marked in the FR itself as a choice with no corpus precedent**, sized against an ONLINE guess
 * under (e) and against nothing else, and "a change that lengthens the TTL re-opens the length".
 * The two constants below therefore move together or not at all.
 */
export const PAIRING_CODE_DIGITS = 8;

/** `01-F80` (c) — "TTL is 15 minutes and it is NOT an org setting." */
export const PAIRING_TTL_MS = 15 * 60 * 1000;

/**
 * `01-F80` (f)'s CLOSED refusal set, in the FR's own order.
 *
 * "those five send an operator to five different actions and *'pairing failed'* sends her to none."
 */
export const PAIRING_REFUSALS = [
  "unknown_code",
  "expired",
  "already_claimed",
  "rate_limited",
  "unavailable",
] as const;
export type PairingRefusal = (typeof PAIRING_REFUSALS)[number];

/**
 * `01-F80` (e) — "capped per source over a short window", and the shape is marked in the FR as a
 * choice with no corpus precedent.
 *
 * Twenty failures a minute from one peer is generous for a code an operator types once and mean
 * against the 26.6 bits (b) sizes: at this cap, exhausting a fifteen-minute window's guessing
 * budget from one source reaches 300 of 10⁸ codes. **What it must never be is deployment-wide** —
 * (e) refuses that outright, because "on R17's pooled deployment it would let one attacker stop
 * every tenant commissioning a till".
 */
export const PAIRING_FAILURE_CAP = 20;
export const PAIRING_FAILURE_WINDOW_MS = 60_000;

/** What a mint answers with; the code is returned ONCE and never stored (`01-F80` (b)). */
export type MintedPairing = {
  readonly code: string;
  readonly device_id: string;
  readonly expires_at: number;
};

export type MintPairingInput = {
  readonly org_id: string;
  readonly branch_id: string;
  readonly device_class: string;
  readonly display_name: string;
  readonly actor_user_id: string | null;
  /**
   * The MINT's own instant (`18 §4`, and `publish-http.ts`'s `actOf` for the same reason): one act
   * must not be split into two instants. Reading a clock inside this writer would make the TTL
   * depend on how long the request queued.
   */
  readonly now: number;
};

/** `01-F80` (f) — "one response carries everything a device needs to become a till". */
export type ClaimedPairing = {
  readonly org_id: string;
  readonly branch_id: string;
  readonly device_id: string;
  readonly device_class: string;
  readonly display_name: string;
  readonly certificate_pem: string;
  readonly issuer_pem: string;
  readonly roster_signing_public_key_pem: string;
  readonly token: string;
};

/**
 * A refusal, by name. **Never an exception carrying a status** — `00 §5.7` requires the till to say
 * WHICH, and a thrown `Error` at this seam is how five refusals become "pairing failed".
 */
export class PairingRefused extends Error {
  constructor(readonly refusal: PairingRefusal) {
    super(`pairing refused: ${refusal}`);
    this.name = "PairingRefused";
  }
}

const isDeviceClass = (value: string): value is DeviceClass =>
  (DEVICE_CLASSES as readonly string[]).includes(value);

/**
 * The blind-index key, derived from the deployment's device-token secret under a label.
 *
 * **Derived and not reused.** The token secret signs `01-F47` credentials; using it directly as an
 * HMAC key here would make one key do two jobs, which is the exact structure `01-F81` (c) refuses
 * one layer up for the issuer and the roster signer. The label is the domain separation.
 */
const pairingIndexKey = (tokenSecret: string): Buffer =>
  createHmac("sha256", tokenSecret).update("01-F80/pairing-code-index").digest();

/**
 * `code` → the row key. Deterministic (so one SELECT finds it) and keyed (so a database dump does
 * not yield it). See this file's header and `0014`'s.
 */
const codeIndexOf = (code: string, tokenSecret: string): string =>
  createHmac("sha256", pairingIndexKey(tokenSecret)).update(code).digest("hex");

/**
 * `01-F80` (b) — CSPRNG, not a counter and not time-derived.
 *
 * `randomInt` is `node:crypto`'s rejection-sampled uniform draw; `Math.random` would be neither
 * uniform nor unpredictable, and a code derived from the clock "shares a prefix and is guessable
 * inside (e)'s budget however many digits it has".
 */
const drawCode = (): string =>
  String(randomInt(0, 10 ** PAIRING_CODE_DIGITS)).padStart(PAIRING_CODE_DIGITS, "0");

/** `01-F81` (a) / `01-F80` (d) — lowercase hex SHA-256 of the DER, the one fingerprint definition. */
const fingerprintOfSpkiPem = (publicKeyPem: string): string => {
  const der = createPublicKey(publicKeyPem).export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest("hex");
};

/**
 * `01-F80` (e)'s counter, in this process's memory, keyed by SOURCE.
 *
 * **In memory and not in Postgres, deliberately.** A limiter is a burst bound, not a durable fact;
 * a table would put a write on the guessing path, which is the direction that helps an attacker.
 * The residual is stated rather than hidden: a multi-instance deployment gives an attacker one
 * budget per instance. That is a real weakening of (e)'s number and not of its shape — the bound is
 * still per source and never deployment-wide, which is the property (e) argues for.
 */
const failures = new Map<string, number[]>();

const isRateLimited = (source: string, now: number): boolean => {
  const window = (failures.get(source) ?? []).filter((at) => at > now - PAIRING_FAILURE_WINDOW_MS);
  if (window.length === 0) failures.delete(source);
  else failures.set(source, window);
  return window.length >= PAIRING_FAILURE_CAP;
};

const recordFailure = (source: string, now: number): void => {
  const window = (failures.get(source) ?? []).filter((at) => at > now - PAIRING_FAILURE_WINDOW_MS);
  window.push(now);
  failures.set(source, window);
};

/**
 * **`01-F80` (a) — THE OWNER MINTS.**
 *
 * Fixes the four facts the owner supplies, mints the `device_id` (UUIDv7 through `domain`'s single
 * id source, `01-F68`: never reused), draws the code, hashes it at `01-F61`'s cost floor, and
 * writes ONE pending row.
 *
 * **A collision at the index re-draws** — `01-F80` (a): "a code resolves to exactly one pending
 * pairing deployment-wide and a mint that collides re-draws". The insert is `on conflict do
 * nothing` and the loop reads the row count, so the decision is the DATABASE's rather than a read
 * that could race between two owners minting at once.
 */
export const mintPairingCode = async (
  db: GatewayDb,
  input: MintPairingInput,
  tokenSecret: string,
): Promise<MintedPairing> => {
  if (!isDeviceClass(input.device_class)) {
    throw new Error(
      `mintPairingCode: "${input.device_class}" is not a DEVICE_CLASSES member (01-F39)`,
    );
  }
  // `01-F70` makes the name required AT REGISTRATION and `14-F41` asks for it at the mint, because
  // "nobody types a name on a till". `DisplayName` is `packages/domain`'s one authority — the same
  // declaration `PersonRecord` and the org directory parse through — so an empty, padded or
  // unrenderable name is refused here rather than reaching the registry as a blank label.
  const display_name = DisplayName.parse(input.display_name);
  const device_id = newId();
  const expires_at = input.now + PAIRING_TTL_MS;

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = drawCode();
    const code_index = codeIndexOf(code, tokenSecret);
    // Hashed BEFORE the insert and never after: the row must never exist without its verifier.
    const code_hash = await hashPin(code);
    const written = await db.execute(
      sql`insert into kernel.device_pairings
            (code_index, org_id, branch_id, device_id, device_class, display_name, code_hash,
             minted_at, expires_at, actor_user_id, claimed_at, claimed_key_fingerprint)
          values (${code_index}, ${input.org_id}, ${input.branch_id}, ${device_id},
                  ${input.device_class}, ${display_name}, ${code_hash}, ${input.now},
                  ${expires_at}, ${input.actor_user_id}, null, null)
          on conflict (code_index) do nothing
          returning code_index`,
    );
    if ([...written].length === 1) return { code, device_id, expires_at };
  }
  // Eight consecutive collisions against a live set that is at most a handful of rows is not a
  // collision — it is a broken CSPRNG or a broken index, and minting under either would hand out a
  // credential somebody else can already present.
  throw new Error(
    "mintPairingCode: eight consecutive code collisions (01-F80 (a) — 'a mint that collides " +
      "re-draws'). This is not a busy deployment; it is a broken draw or a broken index.",
  );
};

/** One pending row, as the claim reads it. */
type PendingRow = {
  code_index: string;
  org_id: string;
  branch_id: string;
  device_id: string;
  device_class: string;
  display_name: string;
  code_hash: string;
  expires_at: number;
  claimed_at: number | null;
  claimed_key_fingerprint: string | null;
};

const readPending = async (db: GatewayDb, code_index: string): Promise<PendingRow | undefined> => {
  const rows = await db.execute(
    sql`select code_index, org_id, branch_id, device_id, device_class, display_name, code_hash,
               expires_at, claimed_at, claimed_key_fingerprint
        from kernel.device_pairings where code_index = ${code_index}`,
  );
  const row = [...rows][0];
  if (row === undefined) return undefined;
  return {
    code_index: String(row.code_index),
    org_id: String(row.org_id),
    branch_id: String(row.branch_id),
    device_id: String(row.device_id),
    device_class: String(row.device_class),
    display_name: String(row.display_name),
    code_hash: String(row.code_hash),
    expires_at: Number(row.expires_at),
    claimed_at: row.claimed_at === null ? null : Number(row.claimed_at),
    claimed_key_fingerprint:
      row.claimed_key_fingerprint === null ? null : String(row.claimed_key_fingerprint),
  };
};

/**
 * The org's issuer and roster-signing keypairs, created on first use and **stable thereafter**.
 *
 * `01-F73` (b): per org. Two devices in one org holding different issuers can never admit each
 * other on the branch LAN (`01-F74` (c)'s chain half), so "a fresh issuer per claim is a mesh that
 * never forms". The insert is `on conflict do nothing` followed by a read, so two concurrent first
 * claims in one org converge on ONE row rather than racing to overwrite.
 *
 * ⚠ **Created lazily at the CLAIM and not at the mint.** An unclaimed code that expires must leave
 * "nothing … no certificate, no device" (`01-F80` (c)); generating an org's issuing key for a code
 * nobody ever typed would leave key material behind for a device that never existed.
 */
const readOrgPki = async (
  db: GatewayDb,
  org_id: string,
): Promise<{ issuer: IssuerMaterial; rosterSigningPublicKeyPem: string } | undefined> => {
  const rows = await db.execute(
    sql`select issuer_cert_pem, issuer_private_key_pem, roster_signing_public_key_pem
        from kernel.org_pki where org_id = ${org_id}`,
  );
  const held = [...rows][0];
  if (held === undefined) return undefined;
  return {
    issuer: {
      certPem: String(held.issuer_cert_pem),
      privateKeyPem: String(held.issuer_private_key_pem),
    },
    rosterSigningPublicKeyPem: String(held.roster_signing_public_key_pem),
  };
};

const orgPkiMaterial = async (
  db: GatewayDb,
  org_id: string,
  now: number,
): Promise<{ issuer: IssuerMaterial; rosterSigningPublicKeyPem: string }> => {
  const held = await readOrgPki(db, org_id);
  if (held !== undefined) return held;

  const issuer = await createOrgIssuer(org_id, now);
  // `01-F81` (c): a SEPARATE keypair, and its public half is PINNED at pairing rather than
  // certified by the issuer — "a chain from the issuer hands a compromised issuer the power to mint
  // a fresh signing key". So it travels as a bare public key and never as a certificate.
  const rosterSigning = await createOrgIssuer(`${org_id} roster signing`, now);
  const rosterSigningPublicKeyPem = createPublicKey(rosterSigning.privateKeyPem)
    .export({ type: "spki", format: "pem" })
    .toString();

  await db.execute(
    sql`insert into kernel.org_pki
          (org_id, issuer_cert_pem, issuer_private_key_pem, roster_signing_public_key_pem,
           roster_signing_private_key_pem, created_at)
        values (${org_id}, ${issuer.certPem}, ${issuer.privateKeyPem},
                ${rosterSigningPublicKeyPem}, ${rosterSigning.privateKeyPem}, ${now})
        on conflict (org_id) do nothing`,
  );
  // Re-read unconditionally: on a lost race the row above is somebody else's, and returning the
  // material we just generated would hand two devices in one org two different issuers — which
  // `01-F73` (b) makes a branch LAN that never forms.
  //
  // ⚠ **ONE re-read and then a THROW, never a recursive call, and this shape was found by a
  // MIS-DESIGNED MUTANT rather than by reading.** The first draft recursed into `orgPkiMaterial`
  // here; the mutant that skips the read (a fresh issuer per claim) then never terminated — the
  // suite hung instead of failing, which is not a result. A recursion whose base case is "the row
  // I just inserted is readable" is unbounded on any state where that is false, and a gateway
  // spinning inside a credential writer is worse than one that says it could not issue.
  const settled = await readOrgPki(db, org_id);
  if (settled === undefined) {
    throw new Error(
      `orgPkiMaterial: kernel.org_pki has no row for org ${org_id} immediately after an insert ` +
        "that conflicted with nothing (01-F73 (b) — the issuer is per org and stable). This is a " +
        "broken database rather than a race, and issuing under freshly generated material would " +
        "hand two devices in one org two different issuers.",
    );
  }
  return settled;
};

/** The stored certificate for an already-claimed pairing, or undefined when the row is gone. */
const readIssuedCertificate = async (
  db: GatewayDb,
  org_id: string,
  device_id: string,
): Promise<{ certificate_pem: string | null; revoked_at: number | null } | undefined> => {
  const rows = await db.execute(
    sql`select certificate_pem, revoked_at from kernel.device_registry
        where org_id = ${org_id} and device_id = ${device_id}`,
  );
  const row = [...rows][0];
  if (row === undefined) return undefined;
  return {
    certificate_pem: row.certificate_pem === null ? null : String(row.certificate_pem),
    revoked_at: row.revoked_at === null ? null : Number(row.revoked_at),
  };
};

export type ClaimPairingInput = {
  readonly code: string;
  readonly public_key_pem: string;
  /**
   * `01-F80` (e)'s "source", pinned as the transport peer.
   *
   * The claim carries only a code and a public key, both attacker-chosen, so the peer address is
   * the only source-like fact the request has.
   */
  readonly source: string;
  /**
   * The CLAIM's instant, from the deployment's injected clock (`18 §4`).
   *
   * ⚠ **Never the caller's.** `01-F80` (a) refuses a caller-stated `org_id` because there is no
   * session to check it against; a caller-stated instant is the same claim about time and would
   * make (c)'s fifteen minutes decorative.
   */
  readonly now: number;
};

/**
 * **`01-F80` (d)/(f) — THE DEVICE CLAIMS.**
 *
 * The order of the checks is the security order and is not the tidy one:
 *
 *   1. the rate limit, **before** the lookup — a guess must not cost an Argon2id verification
 *      (`01-F80` (e), and the DoS the blind index exists to avoid);
 *   2. the lookup, which decides `unknown_code`;
 *   3. the TTL, which decides `expired` — and is checked for a CLAIMED row too, because (d) says
 *      "after the TTL a claimed-but-undelivered pairing is dead";
 *   4. the fingerprint, which decides `already_claimed` — (d): "the race is decided by the public
 *      key rather than by arrival";
 *   5. the verifier, which is what actually admits.
 *
 * **A revoked device is refused, and `01-F80` does not rule on it — this is a PINNED READING.**
 * Derived from `01-F47` ("revocation … remains the operative kill switch"), `01-F48` (fail-closed;
 * revocation blocks "reads as well as writes") and `01-N5` (the replacement path is a fresh
 * `device_id`, never a reinstatement). It is also the exact defect the runbook shipped and
 * `provision-device.ts` removed — `on conflict … do update set revoked_at = null` un-revoked a
 * revoked device. **Two admission paths that disagree about revocation are one path plus a
 * bypass.** The refusal is `already_claimed`, chosen among the closed five because it is the one
 * whose next action is right: ask the back office for another code.
 */
export const claimPairing = async (
  db: GatewayDb,
  input: ClaimPairingInput,
  tokenSecret: string,
): Promise<ClaimedPairing> => {
  const refuse = (refusal: PairingRefusal): never => {
    if (refusal !== "rate_limited") recordFailure(input.source, input.now);
    throw new PairingRefused(refusal);
  };

  if (isRateLimited(input.source, input.now)) throw new PairingRefused("rate_limited");

  const code_index = codeIndexOf(input.code, tokenSecret);
  const pending = await readPending(db, code_index);
  if (pending === undefined) refuse("unknown_code");
  const row = pending as PendingRow;

  if (input.now > row.expires_at) refuse("expired");

  let fingerprint: string;
  try {
    fingerprint = fingerprintOfSpkiPem(input.public_key_pem);
  } catch {
    // An unreadable key is not a code guess, but it IS a failed claim and (e) caps failed claims.
    refuse("unknown_code");
    throw new Error("unreachable");
  }

  if (row.claimed_at !== null) {
    // `01-F80` (d): "Re-presenting the same code with the same public key inside the TTL returns
    // the same certificate — a dropped response is a retry, not a burned device — and every other
    // presentation is refused `already_claimed`."
    if (row.claimed_key_fingerprint !== fingerprint) refuse("already_claimed");
    const issued = await readIssuedCertificate(db, row.org_id, row.device_id);
    // The registry row is what admission reads (`18 §5`: the registry, never the token, decides),
    // so a revoked or vanished row hands nothing back however good the code is.
    if (issued === undefined || issued.certificate_pem === null) refuse("already_claimed");
    if ((issued as { revoked_at: number | null }).revoked_at !== null) refuse("already_claimed");
    const material = await orgPkiMaterial(db, row.org_id, input.now);
    return {
      org_id: row.org_id,
      branch_id: row.branch_id,
      device_id: row.device_id,
      device_class: row.device_class,
      display_name: row.display_name,
      certificate_pem: (issued as { certificate_pem: string }).certificate_pem,
      issuer_pem: material.issuer.certPem,
      roster_signing_public_key_pem: material.rosterSigningPublicKeyPem,
      token: await issueDeviceToken(
        { org_id: row.org_id, branch_id: row.branch_id, device_id: row.device_id },
        tokenSecret,
        { now: input.now },
      ),
    };
  }

  // The verifier, and it is the check rather than the lookup (`01-F80` (b), `01-F26`'s single
  // hashing story). A row found by index whose verifier refuses is a hash collision or a tampered
  // row; either way no credential is issued.
  if (!(await verifyPin(row.code_hash, input.code))) refuse("unknown_code");

  const material = await orgPkiMaterial(db, row.org_id, input.now);
  const spkiDer = createPublicKey(input.public_key_pem).export({ type: "spki", format: "der" });
  const certificate = await issueDeviceCertificate(
    material.issuer,
    { org_id: row.org_id, branch_id: row.branch_id, device_id: row.device_id },
    // A copy over its own ArrayBuffer: `Buffer`'s backing store may be Node's shared pool, and
    // WebCrypto's `BufferSource` excludes `SharedArrayBuffer` (`packages/lan-pki` records this).
    new Uint8Array(spkiDer).slice().buffer,
    input.now,
  );

  // **The commit point, and `01-F80` (d)'s "first claim to commit wins" is this UPDATE's `where`.**
  // Two devices presenting one code both reach here; the conditional update is what makes one of
  // them the winner, and the loser falls back to the already-claimed branch above rather than being
  // handed a second certificate for one `device_id` — which would be `01-F64`'s forked store and
  // `01-F66`'s two-tills-one-identity arriving at the credential layer.
  const claimed = await db.execute(
    sql`update kernel.device_pairings
        set claimed_at = ${input.now}, claimed_key_fingerprint = ${fingerprint}
        where code_index = ${row.code_index} and claimed_at is null
        returning code_index`,
  );
  if ([...claimed].length !== 1) {
    return claimPairing(db, input, tokenSecret);
  }

  await registerDevice(db, {
    org_id: row.org_id,
    branch_id: row.branch_id,
    device_id: row.device_id,
    device_class: row.device_class,
    // `01-F70`/`14-F41`: "a waiting row joins the list under the name she typed", and it becomes
    // `14-F12`'s device row under that same name. A claim that dropped it here would produce
    // exactly the UUID-only list `01-F70` exists to end.
    display_name: row.display_name,
    // `01-F47`: seeded at registration "so a relayed origin is due for renewal from its first day",
    // and from the INJECTED clock rather than the database's (`registry.ts` names that hazard).
    token_expires_at: input.now + DEVICE_TOKEN_TTL_MS,
    certificate_pem: certificate.certPem,
    certificate_fingerprint: certificate.fingerprint,
  });

  return {
    org_id: row.org_id,
    branch_id: row.branch_id,
    device_id: row.device_id,
    device_class: row.device_class,
    display_name: row.display_name,
    certificate_pem: certificate.certPem,
    issuer_pem: material.issuer.certPem,
    roster_signing_public_key_pem: material.rosterSigningPublicKeyPem,
    token: await issueDeviceToken(
      { org_id: row.org_id, branch_id: row.branch_id, device_id: row.device_id },
      tokenSecret,
      { now: input.now },
    ),
  };
};

/**
 * `14-F41`'s **waiting rows** for one org — "a waiting row joins the list under the name she typed
 * … Until then it states its own age; a code near expiry says so; an expired code reads expired."
 *
 * It carries **no code and no verifier**: `14-F41` requires no ability of the cloud to reproduce a
 * live code, deliberately, so doc 01's credential half stays free to store a verifier and never the
 * secret. What the surface gets is the name, the branch, the class and the two instants it needs to
 * say *waiting*, *expiring* or *expired*.
 *
 * A CLAIMED pairing is not a waiting row any more — it is `14-F12`'s device row — so claimed rows
 * are excluded here rather than rendered twice.
 */
export const listWaitingPairings = async (
  db: GatewayDb,
  org_id: string,
): Promise<
  readonly {
    device_id: string;
    branch_id: string;
    device_class: string;
    display_name: string;
    minted_at: number;
    expires_at: number;
  }[]
> => {
  const rows = await db.execute(
    sql`select device_id, branch_id, device_class, display_name, minted_at, expires_at
        from kernel.device_pairings
        where org_id = ${org_id} and claimed_at is null
        order by minted_at desc, device_id asc`,
  );
  return [...rows].map((row) => ({
    device_id: String(row.device_id),
    branch_id: String(row.branch_id),
    device_class: String(row.device_class),
    display_name: String(row.display_name),
    minted_at: Number(row.minted_at),
    expires_at: Number(row.expires_at),
  }));
};

/**
 * `14-F41`'s **cancel**, and the FR's own sentence is the whole specification: "Before a claim
 * there is no device: cancelling an unclaimed code destroys a credential nobody holds, emits
 * nothing, and may be repeated freely."
 *
 * ⚠ **CANCEL IS NOT REVOKE.** The `and claimed_at is null` clause is what makes that structural
 * rather than a discipline: this statement cannot touch a claimed pairing, so the control can never
 * become `14-F13`'s permanent act by accident. Returns whether a waiting row was actually removed,
 * so the surface can say which side of that line the owner was on.
 */
export const cancelPairing = async (
  db: GatewayDb,
  target: { org_id: string; device_id: string },
): Promise<{ cancelled: boolean }> => {
  const removed = await db.execute(
    sql`delete from kernel.device_pairings
        where org_id = ${target.org_id} and device_id = ${target.device_id}
          and claimed_at is null
        returning device_id`,
  );
  return { cancelled: [...removed].length === 1 };
};
