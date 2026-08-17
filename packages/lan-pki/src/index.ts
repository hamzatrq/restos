/**
 * `01-F73` — issuing the credential that `01-F72`'s mutual TLS authenticates against.
 *
 * Two operations and nothing else: mint a per-ORG issuer, and issue a device certificate from it
 * over a public key the device generated. See `CLAUDE.md` for why this is a package, why the
 * dependency exists, and what is deliberately not here.
 */

import { createHash, webcrypto } from "node:crypto";
import * as x509 from "@peculiar/x509";

x509.cryptoProvider.set(webcrypto as Crypto);

/**
 * P-256 ECDSA with SHA-256.
 *
 * Not RSA: an EC keypair is generated in milliseconds on the modest hardware `27 §1a` lists,
 * where RSA-2048 keygen is seconds — and pairing happens while an operator is standing at the
 * till waiting. Every TLS stack in play (Node, Electron, `ws`) has supported P-256 for a decade.
 */
const ALG = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" } as const;

const DAY_MS = 86_400_000;

export type IssuerMaterial = {
  /** PEM. Distributed to every device in the org as the chain half of `01-F74` (c). */
  readonly certPem: string;
  /** PKCS#8 PEM. **Cloud-plane only** — this signs credentials for a whole org. */
  readonly privateKeyPem: string;
};

export type DeviceCertificate = {
  readonly certPem: string;
  /** Lowercase hex SHA-256 of the DER — the roster's admission key (`01-F74`). */
  readonly fingerprint: string;
};

const pem = (label: string, der: ArrayBuffer): string =>
  `-----BEGIN ${label}-----\n${Buffer.from(der)
    .toString("base64")
    .replace(/(.{64})/g, "$1\n")
    .replace(/\n$/, "")}\n-----END ${label}-----\n`;

/**
 * PEM → DER bytes.
 *
 * Returns a `Uint8Array` over its own `ArrayBuffer` rather than a `Buffer`: `Buffer`'s backing
 * store is typed `ArrayBufferLike`, which may be a `SharedArrayBuffer`, and WebCrypto's
 * `BufferSource` excludes that — so `importKey` will not accept a `Buffer` under `strict`. A copy
 * rather than a view for the same reason a `Buffer` will not do: `Buffer.from(…, "base64")` may
 * sit inside Node's shared 8 KB allocation pool, so `.buffer` is not this key's own memory.
 */
const derOf = (certPem: string): Uint8Array<ArrayBuffer> => {
  const b = Buffer.from(certPem.replace(/-----[^-]+-----|\s/g, ""), "base64");
  const copy = new ArrayBuffer(b.byteLength);
  new Uint8Array(copy).set(b);
  return new Uint8Array(copy);
};

/** The one definition of a certificate's identity on this platform. Used by both ends. */
// @unreached-owed `01-F73`'s pairing path. The FRs specify how a device gets this credential —
// keypair on-device, public key to the cloud, certificate back — and the command that issues it
// does not exist yet, so nothing shipping calls this. The device SIDE is closed (the store holds
// it, the transport presents it, both hosts fail closed without it); what is owed is the cloud
// side: `services/sync-gateway`'s pair-device command, `01-F25`'s back-office pairing code.
// DELETE these markers when that command lands — a marker on something reached fails this rail.
export const fingerprintOfPem = (certPem: string): string =>
  createHash("sha256").update(derOf(certPem)).digest("hex");

/**
 * Mint an org's LAN issuer (`01-F73` (b)).
 *
 * **Per org, never platform-wide.** A branch roster from one org must be *structurally* incapable
 * of admitting a device from another (`00 §5.4`, `01-F71`); a single platform issuer would leave
 * that to a field comparison somebody can forget to write.
 *
 * Ten years, because the failure mode of expiry here is every device in an org losing its LAN on
 * one day, and nothing about a restaurant's operations gives anyone a reason to notice beforehand.
 * The device certificates below are the short-lived half (`01-F73` (d)).
 */
// @unreached-owed `01-F73`'s pairing path. The FRs specify how a device gets this credential —
// keypair on-device, public key to the cloud, certificate back — and the command that issues it
// does not exist yet, so nothing shipping calls this. The device SIDE is closed (the store holds
// it, the transport presents it, both hosts fail closed without it); what is owed is the cloud
// side: `services/sync-gateway`'s pair-device command, `01-F25`'s back-office pairing code.
// DELETE these markers when that command lands — a marker on something reached fails this rail.
export const createOrgIssuer = async (
  org_id: string,
  now: number,
  days = 3650,
): Promise<IssuerMaterial> => {
  const keys = (await webcrypto.subtle.generateKey(ALG, true, [
    "sign",
    "verify",
  ])) as unknown as CryptoKeyPair;
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: "01",
    name: `CN=${org_id} LAN issuer,O=${org_id}`,
    notBefore: new Date(now - DAY_MS),
    notAfter: new Date(now + days * DAY_MS),
    keys,
    signingAlgorithm: ALG,
    extensions: [new x509.BasicConstraintsExtension(true, 1, true)],
  });
  return {
    certPem: cert.toString("pem"),
    privateKeyPem: pem("PRIVATE KEY", await webcrypto.subtle.exportKey("pkcs8", keys.privateKey)),
  };
};

/**
 * Issue a device certificate over a public key the DEVICE generated (`01-F73` (a)).
 *
 * `spkiDer` is the device's public key in SubjectPublicKeyInfo form — what
 * `crypto.subtle.exportKey("spki", …)` produces, and the only key material that ever travels.
 *
 * The subject names three facts: `CN` the device, `OU` the branch, `O` the org. Not four —
 * `device_class` is the roster's (`01-F73` (b)).
 */
// @unreached-owed `01-F73`'s pairing path. The FRs specify how a device gets this credential —
// keypair on-device, public key to the cloud, certificate back — and the command that issues it
// does not exist yet, so nothing shipping calls this. The device SIDE is closed (the store holds
// it, the transport presents it, both hosts fail closed without it); what is owed is the cloud
// side: `services/sync-gateway`'s pair-device command, `01-F25`'s back-office pairing code.
// DELETE these markers when that command lands — a marker on something reached fails this rail.
export const issueDeviceCertificate = async (
  issuer: IssuerMaterial,
  device: { org_id: string; branch_id: string; device_id: string },
  spkiDer: ArrayBuffer,
  now: number,
  days = 90,
): Promise<DeviceCertificate> => {
  // `node:crypto`'s `webcrypto` and the DOM lib declare structurally identical but nominally
  // distinct `CryptoKey`s, and `@peculiar/x509` is typed against the DOM one. The cast is on the
  // TYPE only — one runtime object, one algorithm — and it is confined to these two lines.
  const signingKey = (await webcrypto.subtle.importKey(
    "pkcs8",
    derOf(issuer.privateKeyPem),
    ALG,
    false,
    ["sign"],
  )) as unknown as CryptoKey;
  const publicKey = (await webcrypto.subtle.importKey("spki", spkiDer, ALG, true, [
    "verify",
  ])) as unknown as CryptoKey;
  const cert = await x509.X509CertificateGenerator.create({
    // Derived from the identity rather than counted, so two issuances for one device are the same
    // serial and an issuer holds no state. `01-F73` (e) makes a lost key a fresh `device_id`, so
    // "two certificates for one device" is a re-pairing and not a second identity.
    serialNumber: createHash("sha256")
      .update(`${device.org_id}|${device.branch_id}|${device.device_id}`)
      .digest("hex")
      .slice(0, 32),
    subject: `CN=${device.device_id},OU=${device.branch_id},O=${device.org_id}`,
    issuer: new x509.X509Certificate(issuer.certPem).subject,
    notBefore: new Date(now - DAY_MS),
    notAfter: new Date(now + days * DAY_MS),
    signingKey,
    publicKey,
    signingAlgorithm: ALG,
    extensions: [
      new x509.BasicConstraintsExtension(false, undefined, true),
      // BOTH, because every device is both ends of `01-F72`'s mutual handshake: the elected hub
      // accepts (serverAuth) and every follower dials (clientAuth), and `01-F13` re-elects, so a
      // certificate issued for one role would strand the device the moment the branch changed
      // its mind about who serves.
      new x509.ExtendedKeyUsageExtension(["1.3.6.1.5.5.7.3.1", "1.3.6.1.5.5.7.3.2"], true),
    ],
  });
  const certPem = cert.toString("pem");
  return { certPem, fingerprint: fingerprintOfPem(certPem) };
};

/**
 * Generate a device keypair. **Test support and pairing-side only** — in production this runs on
 * the DEVICE (`01-F73` (a)) and the private key never leaves it.
 */
// @unreached-by-design In production the DEVICE generates its own keypair and the private key
// never leaves it (`01-F73` (a)), using `node:crypto` directly — `packages/sync-client` does not
// depend on this package and must not. This entry point exists so test support and a pairing
// HARNESS can mint one; a shipping caller here would mean key material was generated somewhere
// other than the device it belongs to, which is the thing `01-F73` (a) forbids.
export const generateDeviceKeypair = async (): Promise<{
  spkiDer: ArrayBuffer;
  privateKeyPem: string;
}> => {
  const keys = (await webcrypto.subtle.generateKey(ALG, true, [
    "sign",
    "verify",
  ])) as unknown as CryptoKeyPair;
  return {
    spkiDer: await webcrypto.subtle.exportKey("spki", keys.publicKey),
    privateKeyPem: pem("PRIVATE KEY", await webcrypto.subtle.exportKey("pkcs8", keys.privateKey)),
  };
};
