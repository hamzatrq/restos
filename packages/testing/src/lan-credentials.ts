/**
 * Test-support credentials for `01-F72`'s mutually-authenticated branch LAN.
 *
 * A suite that constructs a LAN transport now has to supply a real credential, because
 * `01-F72` (d) makes an unauthenticated transport *unconstructable* rather than merely
 * discouraged. This mints a branch's worth of them from ONE issuer so a suite's devices can
 * actually admit each other.
 *
 * **It uses `@restos/lan-pki`, the same issuance the gateway uses in production**, deliberately:
 * a fixture with its own certificate format would eventually bless something the product cannot
 * parse. `03-F40`'s two incompatible bit layouts for one sensor is this corpus's own instance of
 * a fixture and a product disagreeing about a format.
 */

import type { DeviceClass } from "@restos/domain";
import {
  createOrgIssuer,
  fingerprintOfPem,
  generateDeviceKeypair,
  issueDeviceCertificate,
} from "@restos/lan-pki";

/** What a suite hands to `createWsLanTransport`, plus the roster fact that admits it. */
export type TestDevice = {
  readonly device_id: string;
  readonly device_class: DeviceClass;
  readonly credential: { cert: string; key: string; ca: string };
  readonly cert_sha256: string;
};

export type TestBranchPki = {
  readonly devices: readonly TestDevice[];
  /** A device from a DIFFERENT org's issuer — the negative case a suite needs to be honest. */
  readonly outsider: TestDevice;
  /**
   * An admission object over a fixed roster, for a suite that does not want a real store.
   * `revoked` names devices this roster refuses while still listing them (`01-F48`).
   */
  admissionFor(
    self: string,
    revoked?: readonly string[],
  ): {
    credential: { cert: string; key: string; ca: string };
    admit(cert_sha256: string): { device_id: string; device_class: DeviceClass } | null;
    subscribe(listener: () => void): () => void;
  };
};

/**
 * ⚠ **`now` DEFAULTS TO THE REAL CLOCK, AND IT MUST — `20 §2.4` cannot reach this one.**
 *
 * The first draft defaulted to a pinned constant, on the ordinary reasoning that a suite's
 * fixtures should be deterministic and the virtual clock should be the only clock. It produced a
 * branch whose devices could not connect **at all**, with `certificate has expired` on the client
 * and `socket hang up` on the server — because a certificate's validity window is checked by
 * Node's TLS stack against the SYSTEM clock, and there is no seam to inject one. A pinned
 * timestamp is therefore a fixture with an expiry date: it works for 90 days after whoever wrote
 * it, and then every LAN suite in the repo fails with a network-shaped error.
 *
 * A caller may still pass `now` — `@restos/lan-pki` takes it because the GATEWAY should stamp
 * from its own clock — but a suite that pins it is choosing a deadline.
 */
// @unreached-by-design Test support, like everything else in `@restos/testing` (`18 §12` puts
// this package out of reach of an app by construction). A shipping caller would mean a product
// surface minting its own branch PKI, which is `services/sync-gateway`'s job and not a fixture's.
export const createTestBranchPki = async (
  members: readonly { device_id: string; device_class: DeviceClass }[],
  opts: { org_id?: string; branch_id?: string; now?: number } = {},
): Promise<TestBranchPki> => {
  const org_id = opts.org_id ?? "org-test";
  const branch_id = opts.branch_id ?? "branch-test";
  const now = opts.now ?? Date.now();

  const issuer = await createOrgIssuer(org_id, now);
  const mint = async (
    member: { device_id: string; device_class: DeviceClass },
    from = issuer,
  ): Promise<TestDevice> => {
    const kp = await generateDeviceKeypair();
    const cert = await issueDeviceCertificate(
      from,
      { org_id, branch_id, device_id: member.device_id },
      kp.spkiDer,
      now,
    );
    return {
      device_id: member.device_id,
      device_class: member.device_class,
      credential: { cert: cert.certPem, key: kp.privateKeyPem, ca: from.certPem },
      cert_sha256: cert.fingerprint,
    };
  };

  const devices = await Promise.all(members.map((m) => mint(m)));
  // A separate ISSUER, not merely an unrostered device: the two failure modes are different
  // (`01-F74` (c) — the chain and the pin), and a suite that only ever has the second cannot
  // tell an implementation that dropped the chain check from one that kept it.
  const foreignIssuer = await createOrgIssuer("org-other", now);
  const outsider = await mint(
    { device_id: "device-outsider", device_class: "counter_electron" },
    foreignIssuer,
  );

  return {
    devices,
    outsider,
    admissionFor(self, revoked = []) {
      const me = devices.find((d) => d.device_id === self);
      if (me === undefined) throw new Error(`createTestBranchPki: no device "${self}"`);
      return {
        credential: me.credential,
        admit(cert_sha256) {
          const found = devices.find((d) => d.cert_sha256 === cert_sha256);
          if (found === undefined) return null;
          if (revoked.includes(found.device_id)) return null;
          return { device_id: found.device_id, device_class: found.device_class };
        },
        // A no-op unsubscribe: a fixed roster never changes, so there is nothing to notify.
        // Suites that exercise `01-F74` (e) drive a real `LanRoster` instead.
        subscribe: () => () => {},
      };
    },
  };
};

export { fingerprintOfPem };
