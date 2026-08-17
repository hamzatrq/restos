/**
 * # `01-F73` — this device's own LAN credential, and the assembly of `01-F72`'s admission seam
 *
 * The keypair is generated **on the device** at pairing and the private key never leaves it. This
 * module is where it lives afterwards, and there is deliberately nothing here that transmits it:
 * the only writer is the pairing path, the only reader is the LAN transport.
 *
 * ## Why the private key is in the device database rather than in a file beside it
 *
 * `01-F64` binds the device database to the `(org, branch, device)` it was created for and refuses
 * any other, so a store carried to another machine refuses to open at all. A PEM sitting next to it
 * has no such binding — it opens anywhere, for anyone. Keeping the key inside the bound store means
 * the credential inherits the identity check the store already enforces, rather than needing a
 * second one somebody has to remember to write.
 *
 * It also means the credential is covered by the backup and restore path the store already has
 * (`22`), instead of being the one file a restore silently omits — which would produce a till that
 * restores cleanly, boots, sells, and never rejoins its own branch LAN.
 *
 * ## What this module refuses to do
 *
 * It does not generate the keypair and it does not build a certificate. Node's standard library
 * parses X.509 and does not construct it, so issuance lives on the cloud plane where the issuing
 * key already is (`01-F73` (b·i)) — putting an ASN.1 library in this package would ship it into
 * every till for a step each device performs once, while online, against the cloud.
 */

import type { PeerInfo } from "@restos/sync-protocol";
import type { LanRoster } from "./lan-roster.js";
import type { LanAdmission, LanCredential } from "./transport-ws.js";

/** Minimal SQLite surface — the shape `staff.ts`, `catalog.ts` and `lan-roster.ts` take. */
type Db = {
  prepare(sql: string): {
    run(...a: unknown[]): unknown;
    get(...a: unknown[]): unknown;
    all(...a: unknown[]): unknown[];
  };
};

export const LAN_CREDENTIAL_SCHEMA = `
-- 01-F73: the device's own LAN identity. One row or none; "none" is a device that has never been
-- paired, and 01-F72 (d) makes that a device whose mesh does not run rather than one that meshes
-- anonymously.
CREATE TABLE IF NOT EXISTS lan_credential (
  id INTEGER PRIMARY KEY CHECK (id = 0),
  cert TEXT NOT NULL,
  key TEXT NOT NULL,
  ca TEXT NOT NULL
) STRICT;
`;

const isPem = (v: unknown, label: string): v is string =>
  typeof v === "string" && v.includes(`-----BEGIN ${label}`);

/**
 * The stored credential, or `null` if this device has never been paired.
 *
 * A partially-written or non-PEM row reads as `null` — the same answer as "no credential" — and
 * that collapse is deliberate: both mean *this device cannot authenticate*, both take the same
 * `01-F72` (d) path, and inventing a third state would only give a caller something to get wrong.
 * The honesty strip distinguishes them for a human by reporting what the boot found (`00 §5.7`).
 */
export const readLanCredential = (db: Db): LanCredential | null => {
  const row = db.prepare("SELECT cert, key, ca FROM lan_credential WHERE id = 0").get() as
    | { cert: string; key: string; ca: string }
    | undefined;
  if (row === undefined) return null;
  if (!isPem(row.cert, "CERTIFICATE")) return null;
  if (!isPem(row.ca, "CERTIFICATE")) return null;
  // PKCS#8 is what `crypto.subtle.exportKey("pkcs8", …)` produces and what the issuing path
  // returns; a key in any other envelope would be a hand-made credential, which pairing does not
  // produce and this device should not accept.
  if (!isPem(row.key, "PRIVATE KEY")) return null;
  return { cert: row.cert, key: row.key, ca: row.ca };
};

/**
 * Store the credential pairing issued. Replaces any previous one — re-pairing a device is the
 * supported way to rotate, and `01-F73` (e) makes a LOST key a fresh `device_id` rather than a
 * re-issue onto the same identity.
 */
export const writeLanCredential = (db: Db, credential: LanCredential): void => {
  db.prepare(
    `INSERT INTO lan_credential (id, cert, key, ca) VALUES (0, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET cert = excluded.cert, key = excluded.key, ca = excluded.ca`,
  ).run(credential.cert, credential.key, credential.ca);
};

/**
 * `01-F72` — assemble the admission seam from the two halves that decide it.
 *
 * A named factory rather than an object literal at each host, because both hosts would otherwise
 * write the same three-property wiring and one of them would eventually forget `subscribe` — after
 * which revocation silently stops evicting live sessions on that host only, with every gate green.
 * That is this repo's most-recorded defect shape, and one call is how it stays impossible.
 */
export const createLanAdmission = (credential: LanCredential, roster: LanRoster): LanAdmission => ({
  credential,
  admit: (cert_sha256) => {
    const entry = roster.admit(cert_sha256);
    if (entry === null) return null;
    /**
     * ⚠ The roster stores `device_class` as OPEN TEXT and `PeerInfo` wants `01-F39`'s closed
     * union, so this is where the two meet. The cast is deliberate and the alternative was
     * measured against the FRs rather than assumed: refusing a class this build does not
     * recognise would make an older device reject its whole branch roster the day the cloud
     * learns a new class, which is `01-F56`'s forward-skew problem (`DEC-SYNC-011`) applied to
     * the thing that decides whether the LAN runs at all — a stopped branch (`01-F17`).
     *
     * Admitting it is safe because nothing downstream trusts the string: `01-F39`'s hub-eligible
     * set is a closed membership test, so an unrecognised class simply never wins an election.
     * The device is admitted, reads and writes, and cannot become the hub — which is the
     * conservative outcome, reached without taking the branch down.
     */
    return {
      device_id: entry.device_id,
      device_class: entry.device_class as PeerInfo["device_class"],
    };
  },
  subscribe: (listener) => roster.subscribe(listener),
});
