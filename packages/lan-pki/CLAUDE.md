# @restos/lan-pki

**Owning spec: `specs/01-kernel-sync.md` — `01-F72`, `01-F73`, `01-F74`. Read them before
modifying anything here.**

The X.509 material behind `01-F72`'s mutually-authenticated branch LAN: a per-org issuer, and
device certificates issued from it. **One implementation**, because the gateway issues these in
production and the acceptance suites need to make them, and two implementations of a credential
format is how a fixture starts blessing something the product cannot parse (`03-F40`'s two sensor
bit layouts is this corpus's own instance of that).

## Why it is a package and not a file in `services/sync-gateway`

`18 §2` allows `services → packages` and forbids `services → services` and `packages → services`.
`packages/testing` needs to mint fixtures and the gateway needs to issue for real, so the shared
implementation has to sit where both may import it — `DEC-ARCH-001`'s ruling, applied at the
moment the second consumer appeared rather than after.

## Why the dependency exists (`18 §15` step 1)

Node's standard library **parses** X.509 (`crypto.X509Certificate`) and does not **construct** it.
Building a TBSCertificate by hand is security-critical ASN.1 DER encoding well past that rule's
*"or 50 lines of our own code"* bias. `@peculiar/x509` is pinned at `1.12.3` deliberately: `2.x`
pulls in `tsyringe` + `reflect-metadata` — a DI container inside a certificate library — which is
a larger and stranger surface than the job needs.

**It ships on the CLOUD plane and in TEST SUPPORT only.** `packages/sync-client` does not depend
on it and must not: a device generates its keypair with `node:crypto` and receives a finished
certificate (`01-F73` (b·i)), so nothing in the till ever needs to encode one.

## What is deliberately absent

- **No revocation list.** Revocation is the roster's (`01-F74` (c)) — there is no CRL or OCSP on a
  branch LAN and there is not going to be one. A certificate here is only ever half of admission;
  the fingerprint pin is the other half, and both are required.
- **No `device_class` in the subject.** Class decides hub eligibility (`01-F39`) and changes when a
  device is re-purposed; a certificate is long-lived. It lives in the roster (`01-F73` (b)).
- **No private-key transport.** `issueDeviceCertificate` takes a PUBLIC key and returns a
  certificate. There is no function here that moves a private key, and adding one would break
  `01-F73` (a).
