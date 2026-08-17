// ACCEPTANCE TESTS — `01-F72`/`01-F73`/`01-F74`: **LAN ADMISSION, over real sockets.**
//
// **AUTHORED FROM SPEC TEXT ONLY** (`20 §4.3`, `24 §3` step 2). The session that wrote this file
// wrote none of the production code it exercises and is disqualified from implementing it. Every
// assertion below is derived from a quoted FR clause, and the quotes are in this header so a
// reviewer can argue with the reading rather than reverse-engineer it.
//
// ⚠ **PROTECTED PATH (`20 §4.4`, commandment 10): `packages/sync-client`.**
//
// ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────────────────────────
//
// A `20 §4.4` review lane found that the security property `01-F72` exists to deliver had **zero
// in-tree assertions**: `createTestBranchPki` minted an `outsider` documented as *"the negative
// case a suite needs to be honest"* that no suite consumed, and `lan-roster.test.ts` scoped itself
// out in writing — *"asserts nothing about certificate chain verification, which is the TLS
// suite's"* — while no TLS suite existed. Nothing asserted that an unrostered, foreign-issuer,
// expired or revoked certificate is refused. This is that suite. It drives the **real**
// `createWsLanTransport` over **real** TLS sockets, with the **real** `01-F74` roster
// (`createLanRoster`) and the **real** admission assembly (`createLanAdmission`) — one
// interpretation of admission, not a second one written for the test.
//
// ── THE AUTHORITIES, quoted ────────────────────────────────────────────────────────────────────
//
//   01-F72     "THE BRANCH LAN IS A MUTUALLY AUTHENTICATED CHANNEL OR IT DOES NOT RUN."
//   01-F72 (a) "Admission requires PROOF OF POSSESSION of a pairing-issued device credential
//              (`01-F73`), verified against the branch roster (`01-F74`). A bearer string carried
//              in a message body is not proof."
//   01-F72 (b) "The mechanism is mutual TLS, and the session's device identity is the PEER
//              CERTIFICATE's subject — never a `device_id` read from a frame."
//   01-F72 (e) "It never blocks a sale (`01-F17`, `00 §5.1`)."
//   01-F72(e·i) "A COMPLETED HANDSHAKE IS NOT PROOF OF ADMISSION … Under TLS 1.3 the dialling
//              side's `Finished` precedes the accepting side's verdict on the dialler's
//              certificate, so a refused device's `secureConnect` fires normally and it is then
//              cut off by a fatal alert. **The refusal is observed as the CLOSE.**"
//   01-F73 (b) "The cloud returns a certificate naming `(org_id, branch_id, device_id)` — signed by
//              a **per-org** issuing key … `device_class` is deliberately NOT among them … the
//              certificate answers *who*, the roster answers *what it may do*."
//   01-F73 (d) "The certificate expires and renews on `01-F47`'s pattern … **Expiry withdraws LAN
//              admission and never the sale** (`01-F17`)."
//   01-F74 (c) "Admission is: the peer's certificate verifies against the org issuer, its
//              fingerprint appears in the roster, and that entry is not revoked. **Both the chain
//              and the pin, and an implementer may not drop either as redundant.**"
//   01-F74 (e) "`01-F48`'s 30 s eviction bound … the authority drops the peer's session on applying
//              it rather than at that peer's next voluntary contact."
//   01-F48     "Eviction is fail-closed — if revocation state cannot be read, participation is
//              refused, not granted … Revocation blocks **reads as well as writes**."
//   01-F17     "A sale is never blocked." — so every refusal here is a CLOSED SOCKET, never a
//              throw, and a refused peer may not stop the transport serving an admitted one.
//   01-F12     "Devices in a branch discover each other on the LAN … and exchange events directly
//              while WAN is down."   01-F13 elects the hub among 01-F39's hub-eligible classes.
//   01-F39     `device_class` decides hub eligibility — which is why §A asserts WHERE the class
//              the transport reports comes from, and not merely that one is reported.
//   00 §5.1    No in-branch feature may require WAN.   00 §5.4 "TLS everywhere", org isolation is
//              absolute.   00 §5.7 a degradation is named, never presented as health.
//
// ── FOUR READINGS THIS SUITE PINS, stated so a reviewer can reject them rather than discover them
//
//   R-1  **A refusal is observed as the CLOSE, never as a failure to connect** (`01-F72` (e·i),
//        quoted above). So every roster-level refusal below synchronises on the *refused peer's own
//        `onPeerLost`* — it connects, is admitted by nothing, and is cut off. A test that waited
//        for a dial to fail would be asserting the opposite of what TLS 1.3 does, and would pass
//        against an implementation that admitted everybody and closed nothing.
//
//   R-2  **`device_class` is roster-derived, and that is checkable because the certificate does not
//        carry one** (`01-F73` (b)). §A therefore rosters a device under a class its *fixture*
//        does not have, and asserts the roster's answer. If class were ever read from a
//        certificate, a frame, or a build constant, §A fails.
//
//   R-3  **An impostor is not required to run our transport.** Where a refusal happens inside the
//        TLS handshake (a foreign issuer, an expired certificate) the impostor here is a raw `ws`
//        client that verifies NOTHING about the server (`rejectUnauthorized: false`). That is
//        deliberate attribution, not laziness: an impostor that judged the acceptor first would
//        abort the handshake before presenting its own certificate, and the test would then pass
//        against a server that had stopped checking. The acceptor's verdict is the only one under
//        test in §C and §D.
//
//   R-4  **Refused peers back off (`LAN_ADMISSION_RETRY_MS`, 5 s) and admitted-then-evicted peers
//        do not** — an evicted dialler redials on the ordinary 250 ms cadence, because from its
//        side the socket merely closed. §G uses that second redial as evidence the eviction holds
//        across a reconnect; nothing here waits on, or asserts about, a redial storm.

import type { DeviceClass } from "@restos/domain";
import {
  type MeshTransport,
  type PeerInfo,
  PROTOCOL_VERSION,
  type ProtocolMessage,
  type TransportHandlers,
} from "@restos/sync-protocol";
import {
  createTestBranchPki,
  type TestBranchPki,
  type TestDevice,
} from "@restos/testing/lan-credentials";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import {
  createLanAdmission,
  createWsLanTransport,
  type LanAdmission,
  wallClock,
} from "../index.js";
import { createLanRoster, type LanRoster, ROSTER_SCHEMA, type RosterEntry } from "../lan-roster.js";

// ───────────────────────────────────────────────────────────────────────────────────────────────
// Fixtures — one branch, issued by `@restos/lan-pki` exactly as the gateway issues in production.
// ───────────────────────────────────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
/** Every socket in this file is loopback: an acceptance suite must not open a port on the LAN. */
const LOOPBACK = "127.0.0.1";

/**
 * The branch, minted at the REAL clock — see `createTestBranchPki`'s own warning: TLS validates a
 * validity window against the system clock and there is no seam to inject one, so a fixture that
 * pins `now` for certificates that must be VALID is a fixture with an expiry date.
 */
const BRANCH = await createTestBranchPki([
  { device_id: "till-counter", device_class: "counter_electron" },
  { device_id: "pass-screen", device_class: "kitchen" },
  { device_id: "a-laptop-on-the-shop-wifi", device_class: "counter_rn" },
]);

/**
 * ⚠ **`now` IS PINNED HERE ON PURPOSE, and it is the one place in this file where that is right.**
 * The issuer is minted 200 days ago and lives ten years, so it is valid TODAY; the device
 * certificates it signs live 90 days, so they expired ~110 days ago. That is the only difference
 * between this branch and the one above — same issuance code, same subject shape, same kind of
 * fingerprint in the roster — which is what makes §D's refusal attributable to `01-F73` (d).
 *
 * The ids differ from `BRANCH`'s because §D's acceptor rosters devices from BOTH branches, and a
 * roster's `device_id` is its primary key: reusing a name there would silently make one row
 * overwrite the other and the test would measure something else entirely.
 *
 * ⚠ **`org_id` MUST DIFFER TOO, and the reason is a measurement rather than tidiness.**
 * `createOrgIssuer` names an issuer `CN=<org_id> LAN issuer, O=<org_id>` with serial `01`, so two
 * `createTestBranchPki` calls at the DEFAULT `org_id` mint two different KEYS under one issuer
 * IDENTITY. Put both in one trust store and OpenSSL selects an anchor by subject DN, finds the
 * wrong key, and refuses the client with `EVP_DigestVerifyFinal: provider signature failure` —
 * a message that reads as a broken certificate rather than as a fixture collision. Measured
 * out-of-tree, both as a PEM bundle and as a two-element `ca` array; distinct `org_id`s admit
 * both. Production cannot hit this (`01-F73` (b) issues per org, so the DNs differ by
 * construction) — it is a hazard of the FIXTURE's default, and it cost this suite a red run.
 */
const EXPIRED_BRANCH = await createTestBranchPki(
  [
    { device_id: "till-counter-expired", device_class: "counter_electron" },
    { device_id: "pass-screen-expired", device_class: "kitchen" },
  ],
  { org_id: "org-test-expired", branch_id: "branch-test-expired", now: Date.now() - 200 * DAY_MS },
);

const deviceNamed = (pki: TestBranchPki, device_id: string): TestDevice => {
  const found = pki.devices.find((d) => d.device_id === device_id);
  if (found === undefined) throw new Error(`fixture has no device "${device_id}"`);
  return found;
};

const COUNTER = deviceNamed(BRANCH, "till-counter");
const PASS = deviceNamed(BRANCH, "pass-screen");
/** Same issuer, valid chain, and in nobody's roster — `01-F72`'s "anyone on the shop Wi-Fi". */
const STRANGER = deviceNamed(BRANCH, "a-laptop-on-the-shop-wifi");
/** A DIFFERENT org's issuer. The fixture's own "negative case a suite needs to be honest". */
const OUTSIDER = BRANCH.outsider;
const EXPIRED_COUNTER = deviceNamed(EXPIRED_BRANCH, "till-counter-expired");
const EXPIRED_PASS = deviceNamed(EXPIRED_BRANCH, "pass-screen-expired");

// ───────────────────────────────────────────────────────────────────────────────────────────────
// Harness — real SQLite rosters, real transports, and teardown that cannot be skipped.
// ───────────────────────────────────────────────────────────────────────────────────────────────

const dbs: Database.Database[] = [];
const transports: MeshTransport[] = [];
const rawSockets: WebSocket[] = [];

afterEach(() => {
  // Order matters: transports first, so their listen sockets and dial timers are gone before the
  // rosters they read close. A leaked listener wedges every test after it.
  for (const transport of transports.splice(0)) transport.stop();
  for (const socket of rawSockets.splice(0)) socket.close();
  for (const db of dbs.splice(0)) db.close();
});

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Poll until `predicate` holds. A timeout throws with the LABEL rather than dying as a generic
 * vitest timeout — a negative result here is a security finding and must read as one.
 */
const waitFor = async (
  label: string,
  predicate: () => boolean,
  timeout_ms = 10_000,
): Promise<void> => {
  const deadline = Date.now() + timeout_ms;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(10);
  }
  throw new Error(`timed out waiting for ${label}`);
};

const entryFor = (device: TestDevice, over: Partial<RosterEntry> = {}): RosterEntry => ({
  device_id: device.device_id,
  device_class: device.device_class,
  cert_sha256: device.cert_sha256,
  revoked: false,
  ...over,
});

/** A REAL `01-F74` roster at version 1 holding exactly `entries`. */
const rosterHolding = (entries: readonly RosterEntry[]): LanRoster => {
  const db = new Database(":memory:");
  dbs.push(db);
  db.exec(ROSTER_SCHEMA);
  const roster = createLanRoster(db as never);
  // The fixture asserts its own setup: a roster that silently refused the snapshot would make
  // every admission below refuse for a reason that has nothing to do with the property under test.
  expect(roster.apply({ kind: "snapshot", version: 1, entries }, Date.now())).toEqual({
    applied: true,
    version: 1,
  });
  return roster;
};

/** The shipped assembly (`createLanAdmission`), over a real roster. Never a hand-made stand-in. */
const admissionHolding = (self: TestDevice, entries: readonly RosterEntry[]): LanAdmission =>
  createLanAdmission(self.credential, rosterHolding(entries));

type Recorder = {
  readonly visible: PeerInfo[];
  readonly lost: string[];
  readonly messages: { from: string; message: ProtocolMessage }[];
  readonly handlers: TransportHandlers;
};

const recorder = (): Recorder => {
  const visible: PeerInfo[] = [];
  const lost: string[] = [];
  const messages: { from: string; message: ProtocolMessage }[] = [];
  return {
    visible,
    lost,
    messages,
    handlers: {
      onPeerVisible: (peer) => {
        visible.push(peer);
      },
      onPeerLost: (device_id) => {
        lost.push(device_id);
      },
      onMessage: (from, message) => {
        messages.push({ from, message });
      },
    },
  };
};

/** Start a listening transport and resolve the port it actually bound. */
const startAcceptor = async (
  admission: LanAdmission,
  rec: Recorder,
): Promise<{ port: number; transport: MeshTransport }> => {
  let resolvePort: (port: number) => void = () => undefined;
  const bound = new Promise<number>((resolve) => {
    resolvePort = resolve;
  });
  const transport = createWsLanTransport({
    admission,
    listen_host: LOOPBACK,
    listen_port: 0,
    peers: [],
    clock: wallClock,
    on_listening: (port) => resolvePort(port),
  });
  transports.push(transport);
  transport.start(rec.handlers);
  return { port: await bound, transport };
};

/** Start a transport that dials `port`. It also listens (on an ephemeral port it never uses). */
const startDialler = (
  admission: LanAdmission,
  rec: Recorder,
  target: { device_id: string; port: number },
): MeshTransport => {
  const transport = createWsLanTransport({
    admission,
    listen_host: LOOPBACK,
    listen_port: 0,
    peers: [{ device_id: target.device_id, host: LOOPBACK, port: target.port }],
    clock: wallClock,
  });
  transports.push(transport);
  transport.start(rec.handlers);
  return transport;
};

/**
 * An impostor that is NOT our transport (R-3). It presents a certificate and verifies nothing, so
 * the acceptor's verdict is the only judgement in play.
 */
const rawImpostor = (
  port: number,
  credential: { cert: string; key: string },
): { ended: () => boolean } => {
  const ws = new WebSocket(`wss://${LOOPBACK}:${port}`, {
    cert: credential.cert,
    key: credential.key,
    rejectUnauthorized: false,
  });
  rawSockets.push(ws);
  let ended = false;
  ws.on("error", () => {
    ended = true;
  });
  ws.on("close", () => {
    ended = true;
  });
  return { ended: () => ended };
};

/** `01-F17` — a ping is the smallest real `ProtocolMessage`; it proves the wire still carries. */
const ping = (t: number): ProtocolMessage => ({ v: PROTOCOL_VERSION, kind: "ping", t });

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE CONTROL. Without this, every refusal below proves nothing.
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("01-F72 — LAN admission over real mutually-authenticated sockets", () => {
  it("01-F72 (b) / 01-F74 (c) / 01-F39: a rostered peer is ADMITTED, under the device_id and device_class the ROSTER names", async () => {
    const acceptor = recorder();
    const dialler = recorder();

    /**
     * R-2 — each end rosters the other under a class the fixture did NOT mint it with, and asserts
     * its own roster's answer. `01-F73` (b) keeps `device_class` out of the certificate entirely,
     * so there is nowhere else for a correct implementation to have read these from; a transport
     * that reported a build constant, a frame, or a certificate field fails here. `01-F39` is why
     * it matters: class decides hub eligibility, so a wrong class is a wrong election.
     */
    const acceptorClass: DeviceClass = "waiter";
    const diallerClass: DeviceClass = "manager";

    const { port } = await startAcceptor(
      admissionHolding(PASS, [entryFor(COUNTER, { device_class: acceptorClass })]),
      acceptor,
    );
    startDialler(
      admissionHolding(COUNTER, [entryFor(PASS, { device_class: diallerClass })]),
      dialler,
      {
        device_id: PASS.device_id,
        port,
      },
    );

    await waitFor("the acceptor to admit the rostered counter", () => acceptor.visible.length > 0);
    await waitFor("the dialler to admit the rostered acceptor", () => dialler.visible.length > 0);

    expect(acceptor.visible).toEqual([{ device_id: "till-counter", device_class: acceptorClass }]);
    expect(dialler.visible).toEqual([{ device_id: "pass-screen", device_class: diallerClass }]);
    // An admitted peer STAYS admitted: nothing about a correct handshake closes the socket.
    expect(acceptor.lost).toEqual([]);
    expect(dialler.lost).toEqual([]);
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // §B — the PIN half of `01-F74` (c), alone. A perfectly valid chain is not admission.
  // ─────────────────────────────────────────────────────────────────────────────────────────────

  it("01-F74 (c): a SAME-ISSUER peer the roster does not name is refused — the fingerprint pin, alone", async () => {
    const acceptor = recorder();
    const stranger = recorder();

    // The stranger's certificate chains to the branch issuer and is in date. The ONLY thing wrong
    // with it is that this branch's roster has never heard of it (`01-F72`: "the customer network
    // in a Pakistani restaurant is the staff network").
    const { port } = await startAcceptor(admissionHolding(PASS, [entryFor(COUNTER)]), acceptor);
    startDialler(admissionHolding(STRANGER, [entryFor(PASS)]), stranger, {
      device_id: PASS.device_id,
      port,
    });

    // R-1 / `01-F72` (e·i): the stranger's handshake COMPLETES — it even sees the acceptor as a
    // peer, because its own roster names it — and it is then cut off. The cut is the refusal.
    await waitFor("the stranger's completed handshake to be cut off by the acceptor", () =>
      stranger.lost.includes(PASS.device_id),
    );
    expect(stranger.visible.map((p) => p.device_id)).toContain(PASS.device_id);

    expect(acceptor.visible).toEqual([]);
    expect(acceptor.lost).toEqual([]);
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // §C — the CHAIN half of `01-F74` (c), alone. `outsider`'s first consumer.
  // ─────────────────────────────────────────────────────────────────────────────────────────────

  it("01-F74 (c) / 01-F73 (b): a FOREIGN-ISSUER certificate is refused even when the roster pins its fingerprint and its CN matches — the chain, alone", async () => {
    const acceptor = recorder();

    /**
     * The roster is rigged in the impostor's favour, which is the whole point: its fingerprint is
     * pinned, under the very `device_id` its certificate's subject `CN` claims. The pin passes and
     * the name matches, so the only thing left that can refuse it is the ISSUER CHAIN — and
     * `01-F73` (b) makes the issuer per-org precisely so that a roster from one org is
     * *structurally* incapable of admitting a device from another (`00 §5.4`, `01-F71`).
     */
    const { port } = await startAcceptor(
      admissionHolding(PASS, [entryFor(COUNTER), entryFor(OUTSIDER)]),
      acceptor,
    );
    const impostor = rawImpostor(port, OUTSIDER.credential);

    await waitFor(
      "the foreign-issued impostor to be refused (or, fatally, admitted)",
      () => impostor.ended() || acceptor.visible.length > 0,
    );

    /**
     * ⚠ **THE LIVENESS CONTROL, and without it this test could pass for the wrong reason.** An
     * empty `visible` is also what a wrong port, an unbound socket or a transport that admits
     * NOBODY produces — so the same acceptor, on the same port, out of the same roster, must be
     * shown admitting an issuer it does trust. The refusal above is then a VERDICT rather than an
     * absence. (Measured: mutant (d), `requestCert: false`, is caught here by this line alone.)
     */
    const rostered = rawImpostor(port, COUNTER.credential);
    await waitFor(
      "the same-issuer control to be admitted on that very port",
      () => acceptor.visible.length > 0 || rostered.ended(),
    );
    expect(acceptor.visible.map((p) => p.device_id)).toEqual([COUNTER.device_id]);
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // §D — `01-F73` (d): expiry withdraws admission.
  // ─────────────────────────────────────────────────────────────────────────────────────────────

  it("01-F73 (d): an EXPIRED device certificate is refused, though its issuer, its roster pin and its CN are all good", async () => {
    const acceptor = recorder();

    /**
     * The acceptor trusts BOTH issuers — `ca` is a PEM bundle, which is the ordinary way to name
     * more than one trust anchor — so that the in-date control below reaches the SAME acceptor on
     * the SAME port out of the SAME roster. That is what isolates `01-F73` (d): both certificates
     * chain to something this acceptor trusts, both are pinned, both CNs match their rows, and the
     * only property left on which one can be refused and the other admitted is the validity window.
     *
     * The acceptor's own certificate is expired too (the fixture mints a branch at one `now`), and
     * that is harmless HERE and only here: neither client verifies the server (R-3), so the
     * acceptor's certificate is never judged and the single judgement made is the one under test.
     */
    const { port } = await startAcceptor(
      createLanAdmission(
        {
          cert: EXPIRED_PASS.credential.cert,
          key: EXPIRED_PASS.credential.key,
          // ⚠ The separator is load-bearing: `@peculiar/x509`'s PEM has NO trailing newline, so
          // a bare concatenation yields `-----END CERTIFICATE----------BEGIN CERTIFICATE-----`
          // and only the FIRST anchor parses — measured, and it made the control below refuse.
          ca: `${EXPIRED_PASS.credential.ca}\n${PASS.credential.ca}`,
        },
        rosterHolding([entryFor(EXPIRED_COUNTER), entryFor(COUNTER)]),
      ),
      acceptor,
    );
    const stale = rawImpostor(port, EXPIRED_COUNTER.credential);

    await waitFor(
      "the expired certificate to be refused (or, fatally, admitted)",
      () => stale.ended() || acceptor.visible.length > 0,
    );
    expect(acceptor.visible).toEqual([]);

    // The liveness control (see §C): an IN-DATE certificate, otherwise identically placed.
    const inDate = rawImpostor(port, COUNTER.credential);
    await waitFor(
      "the in-date control to be admitted on that very port",
      () => acceptor.visible.length > 0 || inDate.ended(),
    );
    expect(acceptor.visible.map((p) => p.device_id)).toEqual([COUNTER.device_id]);
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // §E — `01-F72` (b): the identity is the CERTIFICATE's subject, and the roster must agree.
  // ─────────────────────────────────────────────────────────────────────────────────────────────

  it("01-F72 (b): a certificate whose subject CN disagrees with the roster row it is pinned to is refused", async () => {
    const acceptor = recorder();
    const counter = recorder();

    /**
     * A MIS-JOINED roster: the counter's certificate fingerprint, filed against the stranger's
     * `device_id`. Chain valid, in date, fingerprint present, entry live — every other clause of
     * `01-F74` (c) is satisfied, and the two writes of one identity disagree.
     *
     * `01-F72` (b) makes the session's identity the certificate's subject, so admitting under
     * either answer would attribute this till's `push` and `event_batch` to an origin nobody
     * vouched for twice — `01-F3` attribution and `01-F8`'s per-origin checkpoint both wrong,
     * permanently, in an append-only ledger (`01-F1`).
     */
    const misJoined: RosterEntry = {
      device_id: STRANGER.device_id,
      device_class: "counter_rn",
      cert_sha256: COUNTER.cert_sha256,
      revoked: false,
    };
    const { port } = await startAcceptor(admissionHolding(PASS, [misJoined]), acceptor);
    startDialler(admissionHolding(COUNTER, [entryFor(PASS)]), counter, {
      device_id: PASS.device_id,
      port,
    });

    await waitFor("the mis-joined counter's completed handshake to be cut off", () =>
      counter.lost.includes(PASS.device_id),
    );
    expect(acceptor.visible).toEqual([]);
    // Nor under the *other* reading: neither identity is admitted, because neither is vouched for.
    expect(acceptor.visible.map((p) => p.device_id)).not.toContain(STRANGER.device_id);
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // §F — `01-F48`: presence in the roster is not admission.
  // ─────────────────────────────────────────────────────────────────────────────────────────────

  it("01-F48 / 01-F74 (c): a REVOKED roster entry is refused at the handshake — presence is not admission", async () => {
    const acceptor = recorder();
    const revoked = recorder();

    const { port } = await startAcceptor(
      admissionHolding(PASS, [entryFor(COUNTER, { revoked: true })]),
      acceptor,
    );
    startDialler(admissionHolding(COUNTER, [entryFor(PASS)]), revoked, {
      device_id: PASS.device_id,
      port,
    });

    await waitFor("the revoked device's completed handshake to be cut off", () =>
      revoked.lost.includes(PASS.device_id),
    );
    // `01-F48`: "Revocation blocks reads as well as writes" — a revoked device is never a peer, so
    // nothing is ever fanned out to it.
    expect(acceptor.visible).toEqual([]);
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // §G — `01-F74` (e): eviction happens on APPLYING the update, not at the peer's next contact.
  // ─────────────────────────────────────────────────────────────────────────────────────────────

  it("01-F74 (e) / 01-F48: revoking a peer MID-SESSION drops its live socket and fires onPeerLost, and the redial is refused too", async () => {
    const acceptor = recorder();
    const dialler = recorder();

    // The real store, because this is the test that proves `subscribe`/`revalidate` are wired: the
    // roster must be the thing that changes, and it must notify by itself (`01-F74` (e) —
    // "the authority drops the peer's session on applying it").
    const roster = rosterHolding([entryFor(COUNTER), entryFor(PASS)]);
    const { port } = await startAcceptor(createLanAdmission(PASS.credential, roster), acceptor);
    startDialler(admissionHolding(COUNTER, [entryFor(PASS)]), dialler, {
      device_id: PASS.device_id,
      port,
    });

    await waitFor("the counter to be admitted before it is revoked", () =>
      acceptor.visible.some((p) => p.device_id === COUNTER.device_id),
    );
    expect(acceptor.lost).toEqual([]);

    expect(
      roster.apply(
        {
          kind: "delta",
          from_version: 1,
          version: 2,
          upserts: [entryFor(COUNTER, { revoked: true })],
          removals: [],
        },
        Date.now(),
      ),
    ).toEqual({ applied: true, version: 2 });

    // The socket CLOSES — `onPeerLost` is fired from the close handler, so this assertion is the
    // socket's death and not a separate notification that could fire over a live connection.
    await waitFor("the acceptor to drop the revoked peer's LIVE socket", () =>
      acceptor.lost.includes(COUNTER.device_id),
    );

    // R-4 — the evicted dialler redials on the ordinary cadence; the eviction must survive it.
    // Two losses at the dialler means at least one post-revocation handshake was also refused.
    await waitFor(
      "the evicted peer's redial to be refused as well",
      () => dialler.lost.length >= 2,
    );
    expect(acceptor.visible).toHaveLength(1);
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // §H — both directions. `01-F72` says MUTUALLY.
  // ─────────────────────────────────────────────────────────────────────────────────────────────

  it("01-F72 (b) / 01-F74 (c): the DIALLER refuses an acceptor its own roster does not name — admission is mutual, not server-side", async () => {
    const acceptor = recorder();
    const dialler = recorder();

    // The acceptor's roster names the dialler, so the SERVER half admits. The dialler's roster
    // names only itself — it has never heard of this acceptor. A client that only proved itself
    // would hand its branch's events to any listener holding an issuer-signed certificate.
    const { port } = await startAcceptor(admissionHolding(PASS, [entryFor(COUNTER)]), acceptor);
    startDialler(admissionHolding(COUNTER, [entryFor(COUNTER)]), dialler, {
      device_id: PASS.device_id,
      port,
    });

    // The acceptor admitting and then losing the dialler is the proof that the dialler connected
    // at all and hung up on its own judgement — the mirror of R-1, one end over.
    await waitFor("the acceptor to admit the dialler", () =>
      acceptor.visible.some((p) => p.device_id === COUNTER.device_id),
    );
    await waitFor("the dialler to hang up on the unrostered acceptor", () =>
      acceptor.lost.includes(COUNTER.device_id),
    );

    expect(dialler.visible).toEqual([]);
    expect(dialler.messages).toEqual([]);
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // §I — `01-F17`: nothing here takes the till down.
  // ─────────────────────────────────────────────────────────────────────────────────────────────

  it("01-F17 / 01-F72 (e): a refused peer never throws and never stops the transport serving an admitted one", async () => {
    const acceptor = recorder();
    const stranger = recorder();
    const good = recorder();

    const { port, transport } = await startAcceptor(
      admissionHolding(PASS, [entryFor(COUNTER)]),
      acceptor,
    );

    // The refusal happens FIRST, so nothing can excuse it as "the good peer got in before the
    // damage". `01-F72`'s threat model is a device on the shop Wi-Fi dialling the till all day.
    startDialler(admissionHolding(STRANGER, [entryFor(PASS)]), stranger, {
      device_id: PASS.device_id,
      port,
    });
    await waitFor("the stranger to be refused", () => stranger.lost.includes(PASS.device_id));

    startDialler(admissionHolding(COUNTER, [entryFor(PASS)]), good, {
      device_id: PASS.device_id,
      port,
    });
    await waitFor("the good peer to be admitted after the refusal", () =>
      acceptor.visible.some((p) => p.device_id === COUNTER.device_id),
    );

    // Still SERVING, not merely still listening: a message crosses the admitted socket.
    transport.send(COUNTER.device_id, ping(4210));
    await waitFor(
      "the admitted peer to receive traffic over the surviving transport",
      () => good.messages.length > 0,
    );
    expect(good.messages).toEqual([
      { from: PASS.device_id, message: { v: PROTOCOL_VERSION, kind: "ping", t: 4210 } },
    ]);

    // And the refused peer never became one, however many times it tried.
    expect(acceptor.visible.map((p) => p.device_id)).toEqual([COUNTER.device_id]);
    expect(acceptor.lost).toEqual([]);
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // §J — the eviction hook is subscribed once per run, and released.
  // ─────────────────────────────────────────────────────────────────────────────────────────────

  it("01-F74 (e): start/stop cycles subscribe to the roster exactly once and leak no listener", async () => {
    const rec = recorder();
    const base = admissionHolding(PASS, [entryFor(COUNTER)]);

    // A counting DECORATOR over the real admission — not a second interpretation of it. `admit`
    // is the real one, and only the subscription is observed.
    let subscribed = 0;
    const tracked: LanAdmission = {
      credential: base.credential,
      admit: (cert_sha256) => base.admit(cert_sha256),
      subscribe: (listener) => {
        subscribed += 1;
        const unsubscribe = base.subscribe(listener);
        return () => {
          subscribed -= 1;
          unsubscribe();
        };
      },
    };

    let onBound: (() => void) | null = null;
    const transport = createWsLanTransport({
      admission: tracked,
      listen_host: LOOPBACK,
      listen_port: 0,
      peers: [],
      clock: wallClock,
      on_listening: () => onBound?.(),
    });
    transports.push(transport);

    for (let cycle = 0; cycle < 3; cycle += 1) {
      const bound = new Promise<void>((resolve) => {
        onBound = resolve;
      });
      transport.start(rec.handlers);
      // Exactly one, on every cycle: zero means a revocation would never evict anybody
      // (`01-F74` (e)), and a rising count means a restarted mesh evicts N times per update.
      expect(subscribed).toBe(1);
      await bound;
      transport.stop();
      expect(subscribed).toBe(0);
    }
  });
});
