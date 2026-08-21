// Acceptance tests — STEP 7 (c): the SESSION reconciles the roster.
//
// AUTHORED FROM SPEC TEXT ONLY (`24 §3` step 2 — read-only to the implementing session).
//
// Clauses transcribed:
//   01-F77  "`hello_ack.reference_versions` … THE correctness mechanism of the whole
//           reference-data transport: the device compares each key against its own stored
//           version and requests the ones it is behind on, so every reconnection reconciles —
//           including for a device offline a week that could not have heard an announcement. A
//           design that reconciled the roster only on a pushed notice gives a till nobody can
//           sign in to after a lossy week." And: an artifact the org has published nothing for
//           is **omitted, never sent as `0`**, so "the device simply never asks".
//   01-F75  a `reference_notice` "is a freshness optimisation and **the system is correct
//           without it**"; a notice "is exactly the kind of message a lossy link drops".
//   01-F76  "A device holds one version *per key*, not one version"; "A device REFUSES an
//           artifact whose key is not one of its own … and never applies it; the refusal is
//           observable in device health… The refusal needs a NAME … The reason is
//           `foreign_artifact`" — "Without this clause the scope is decoration: a mis-routed
//           roster applies silently as version N, every later comparison agrees with itself,
//           and the divergence `01-F56` exists to detect is undetectable by construction."
//           The request states the device's OWN key: "the org comes from the authenticated
//           session and the branch from the device's own identity."
//   01-F56  "Refusal is observable in device health (`15`) like any other blocked cursor."
//   01-F17  a sale is never blocked.
//   R28     an OLD roster admits — refusing because the WAN is down is the `00 §5.1` breach.
//
// ── ORACLE-PROPOSED SURFACE (binding; PROTECTED PATH):
//      CloudSessionStatus += staff_refusal: { reason: string; have_version: number } | null
//    `catalog_refusal`'s shape and its recorded reason, one key over: "a roster that has
//    quietly stopped updating is indistinguishable from a roster nobody has edited". The
//    reasons are `01-F56`'s three plus `01-F76`'s `foreign_artifact` plus `divergent`.
//    Step 8 renders it; this is the value step 8 reads, so it lands here.
//
// RED-AWAITING-IMPLEMENTATION: `cloud-session.ts` returns early on every non-`catalog`
// resource today and its own comment says so ("THE CATALOG IS THE ONLY RESOURCE THIS DEVICE
// CONSUMES TODAY … the roster's fetch and apply are the NEXT step").

import { describe, expect, it } from "vitest";
import { createPinSession } from "../pin-session.js";
import { appendInput } from "./builders.js";
import {
  catalogKey,
  catalogNotice,
  catalogRequests,
  catalogResponse,
  type Device,
  helloAck,
  openDevice,
  ownScope,
  PIN,
  ROSTER,
  readStaffRefusal,
  requireStaffRefusal,
  requireStaffRequest,
  STAFF_REFUSAL_REASONS,
  staffEntry,
  staffKey,
  staffNotice,
  staffRequests,
  staffResponse,
  USER,
} from "./staff-builders.js";

const OTHER_BRANCH = "branch-dha";

const rosterFor = (d: Device) => ROSTER(d.id.branch_id);

/** Deliver a `hello_ack` advertising the staff key at `version` (and nothing else). */
const helloWithStaff = (d: Device, version: number) =>
  d.cloud.deliver(helloAck({ reference_versions: [staffKey(ownScope(d), version)] }));

/** Answer the outstanding staff request with a complete snapshot. */
const serveRoster = (d: Device, version: number, entries = rosterFor(d)) =>
  d.cloud.push(staffResponse({ scope: ownScope(d), version, entries }));

const unlocks = (d: Device, user_id: string, pin: string) =>
  createPinSession({
    registry: d.store.staff,
    device: { device_id: d.id.device_id, registered: true },
    idle_lock_ms: 60_000,
    max_failed_attempts: 3,
    now: () => 1_760_000_000_000,
    audit: () => {},
  }).unlock(user_id, pin);

// ═══════════════════════════════════════════════════════════════════════════════════════
// §A — `01-F77`: the version set is what makes every reconnection reconcile
// ═══════════════════════════════════════════════════════════════════════════════════════

describe("01-F77 — a staff key in `hello_ack` makes the device ask, with its OWN key", () => {
  it("the request names `resource: staff`, this device's scope, and the version it holds", () => {
    // `01-F76`: the org comes from the authenticated session and the branch from the device's
    // own identity. A device that echoed a scope from the frame would be stating a client role
    // claim — and under R25 the roster's scope IS its credential blast radius, so the field is
    // the whole ruling.
    const d = openDevice();
    helloWithStaff(d, 3);
    const request = requireStaffRequest(d.cloud.sent, "a staff key advertised at v3 against v0");
    expect(request.scope).toEqual({ org_id: d.id.org_id, branch_id: d.id.branch_id });
    expect(request.have_version).toBe(0);
  });

  it("a device already AT the advertised version does not ask", () => {
    // ⚠ ANCHORED, because the negative half passes for free against a session that never asks
    // at all — which is exactly today's session, and is the failure pattern this repo measured
    // as "19 of 53 refusals green because `parseMessage` threw". The positive control comes
    // first and in the SAME test.
    const d = openDevice();
    helloWithStaff(d, 1);
    const asked = staffRequests(d.cloud.sent).length;
    expect(asked, "the anchor: a device at v0 told about v1 must ask").toBeGreaterThan(0);
    serveRoster(d, 1);
    d.cloud.down();
    d.cloud.up();
    helloWithStaff(d, 1);
    expect(
      staffRequests(d.cloud.sent).length,
      "the device re-fetched an artifact it already holds — one fetch per reconnect is a hot " +
        "loop against the branch's credential store (01-F17)",
    ).toBe(asked);
  });

  it("01-F77 — an OMITTED key is never read as version 0, so the device never asks", () => {
    // "An artifact the org has published nothing for is omitted, never sent as `0`, so that case
    // stays indistinguishable from a gateway that does not serve the resource. In both the
    // device simply never asks, which is right for both." A `?? 0` default here would have every
    // till in the fleet asking a gateway that has nothing to answer with, for ever.
    //
    // ⚠ ANCHORED by the first half: the same `hello_ack` shape WITH the key must produce a
    // request, or "never asks" is satisfied by a session with no staff arm.
    const present = openDevice();
    present.cloud.deliver(
      helloAck({
        reference_versions: [catalogKey(present.id.org_id, 2), staffKey(ownScope(present), 1)],
      }),
    );
    expect(staffRequests(present.cloud.sent), "the anchor: a present key IS fetched").toHaveLength(
      1,
    );

    const absent = openDevice();
    absent.cloud.deliver(helloAck({ reference_versions: [catalogKey(absent.id.org_id, 2)] }));
    expect(staffRequests(absent.cloud.sent)).toHaveLength(0);
    expect(absent.store.staff.version()).toBe(0);
  });

  it("a key for ANOTHER BRANCH is not fetched, and the device's own key still is", () => {
    // `01-F76`: a device refuses an artifact whose key is not one of its own. The fixture
    // carries BOTH keys, because a suite that only ever shows the foreign one cannot tell
    // "refused the foreign key" from "ignores staff keys entirely" — which is exactly today's
    // behaviour and would pass a one-key fixture.
    const d = openDevice();
    d.cloud.deliver(
      helloAck({
        reference_versions: [
          staffKey({ org_id: d.id.org_id, branch_id: OTHER_BRANCH }, 9),
          staffKey(ownScope(d), 2),
        ],
      }),
    );
    const requests = staffRequests(d.cloud.sent);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.scope.branch_id).toBe(d.id.branch_id);
  });
});

describe("01-F77 — the answer lands, and the device stops asking", () => {
  it("a served roster reaches the store at the served version", () => {
    const d = openDevice();
    helloWithStaff(d, 4);
    serveRoster(d, 4);
    expect(d.store.staff.version()).toBe(4);
    expect(d.store.staff.list()).toHaveLength(4);
  });

  it("a response for a fetch that was never started is IGNORED", () => {
    // A late page from a previous connection, or a server volunteering one. Applying it would
    // splice pages from two different fetches into one commit — and on this artifact the commit
    // is a set of credentials.
    //
    // ⚠ ANCHORED: the unsolicited frame first, then the SAME frame after a fetch is started.
    // Without the second half a session with no staff arm scores this test for free.
    const d = openDevice();
    d.cloud.deliver(helloAck({}));
    d.cloud.push(staffResponse({ scope: ownScope(d), version: 4, entries: rosterFor(d) }));
    expect(d.store.staff.version(), "an unsolicited roster was applied").toBe(0);
    expect(d.store.staff.list()).toHaveLength(0);

    helloWithStaff(d, 4);
    serveRoster(d, 4);
    expect(d.store.staff.version(), "the anchor: a SOLICITED roster does apply").toBe(4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════
// §B — `01-F76`: a FOREIGN artifact is refused by name, not applied
// ═══════════════════════════════════════════════════════════════════════════════════════

describe("01-F76 — `foreign_artifact`: a mis-routed roster must not apply silently", () => {
  it("a response echoing another branch's scope is refused and surfaced", () => {
    // The clause's own reasoning: without the refusal "the scope is decoration — a mis-routed
    // roster applies silently as version N, every later comparison agrees with itself, and the
    // divergence `01-F56` exists to detect is undetectable by construction." The fetch is IN
    // FLIGHT when the foreign frame arrives, which is the dangerous case: "a frame for a fetch
    // we did not start is ignored" would otherwise answer this by accident, one case away.
    const d = openDevice();
    helloWithStaff(d, 3);
    requireStaffRequest(d.cloud.sent, "the in-flight fetch this test needs");
    d.cloud.push(
      staffResponse({
        scope: { org_id: d.id.org_id, branch_id: OTHER_BRANCH },
        version: 3,
        entries: ROSTER(OTHER_BRANCH),
      }),
    );
    expect(d.store.staff.version(), "another branch's roster was applied").toBe(0);
    expect(d.store.staff.list()).toHaveLength(0);
    const refusal = requireStaffRefusal(d.session, "a roster scoped to another branch");
    expect(refusal.reason).toBe("foreign_artifact");
    expect(STAFF_REFUSAL_REASONS as readonly string[]).toContain(refusal.reason);
  });

  it("CONTROL: the SAME frame under this device's own scope applies", () => {
    // Attribution. Without it the assertion above is satisfied by a session that applies no
    // roster at all — which is today's behaviour and would score a kill it has not earned.
    const d = openDevice();
    helloWithStaff(d, 3);
    serveRoster(d, 3);
    expect(d.store.staff.version()).toBe(3);
    expect(readStaffRefusal(d.session)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════
// §C — trap 5: a notice is FRESHNESS. Correctness lives in `hello_ack`.
// ═══════════════════════════════════════════════════════════════════════════════════════

describe("01-F75 — the notice is latency on top, never the mechanism", () => {
  it("a staff notice mid-session starts a fetch without waiting for a reconnect", () => {
    const d = openDevice();
    helloWithStaff(d, 1);
    serveRoster(d, 1);
    const before = staffRequests(d.cloud.sent).length;
    d.cloud.deliver(staffNotice(ownScope(d), 2));
    expect(staffRequests(d.cloud.sent).length).toBe(before + 1);
    expect(staffRequests(d.cloud.sent).at(-1)?.have_version).toBe(1);
  });

  it("DROPPING EVERY NOTICE COSTS FRESHNESS AND NEVER CORRECTNESS", () => {
    // The trap, stated as a scenario: a lossy week in which no notice is ever delivered. The
    // owner hired someone on Monday; the till learns about her on its next reconnection,
    // because `hello_ack` compares versions. A design that reconciled only on a notice gives a
    // till nobody can sign in to — `01-F17`'s stopped till arriving through the identity path.
    const d = openDevice();
    helloWithStaff(d, 1);
    serveRoster(d, 1, [
      staffEntry({ user_id: USER.zainab, display_name: "Zainab", grid_ordinal: 0 }),
    ]);
    expect(d.store.staff.list()).toHaveLength(1);

    // …a week passes. Every notice the cloud sent is lost on the wire; the link drops.
    d.cloud.down();
    d.cloud.up();
    helloWithStaff(d, 2); // the reconnection is where the device learns anything at all
    serveRoster(d, 2);
    expect(d.store.staff.version()).toBe(2);
    expect(d.store.staff.list()).toHaveLength(4);
  });

  it("a CATALOG notice does not start a staff fetch, and a staff notice no catalog fetch", () => {
    // `01-F76`: one version per KEY. The two resources share a frame and share nothing else.
    // ⚠ ANCHORED: the staff notice at the end must produce a staff request, or the first
    // assertion is scored by a session that has no staff arm at all.
    const d = openDevice();
    d.cloud.deliver(helloAck({}));
    d.cloud.deliver(catalogNotice(d.id.org_id, 5));
    expect(staffRequests(d.cloud.sent), "a catalog notice fetched the roster").toHaveLength(0);
    const catalogAsks = catalogRequests(d.cloud.sent).length;
    d.cloud.deliver(staffNotice(ownScope(d), 5));
    expect(catalogRequests(d.cloud.sent).length, "a staff notice fetched the menu").toBe(
      catalogAsks,
    );
    expect(
      staffRequests(d.cloud.sent),
      "the anchor: a staff notice DOES fetch the roster",
    ).toHaveLength(1);
  });

  it("a notice for ANOTHER BRANCH's roster starts nothing", () => {
    // ⚠ ANCHORED by the second half: the own-branch notice that follows must be acted on.
    const d = openDevice();
    d.cloud.deliver(helloAck({}));
    d.cloud.deliver(staffNotice({ org_id: d.id.org_id, branch_id: OTHER_BRANCH }, 5));
    expect(staffRequests(d.cloud.sent), "another branch's notice started a fetch").toHaveLength(0);
    d.cloud.deliver(staffNotice(ownScope(d), 5));
    expect(staffRequests(d.cloud.sent), "the anchor: this branch's notice does").toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════
// §D — `01-F76`: one version PER KEY. The two artifacts do not share state.
// ═══════════════════════════════════════════════════════════════════════════════════════

describe("01-F76 — the catalog and the roster reconcile independently", () => {
  it("both keys advertised in one `hello_ack` produce two requests and two applied artifacts", () => {
    // The likeliest implementation error in this step is one `fetch` variable and one refusal
    // slot copied from the catalog: `reconcileCatalog` returns early while a fetch is in
    // flight, and a shared slot makes a roster fetch cancel a menu fetch (or the reverse)
    // whenever an owner edits both — which is what an owner does on the day she opens.
    const d = openDevice();
    d.cloud.deliver(
      helloAck({
        reference_versions: [catalogKey(d.id.org_id, 2), staffKey(ownScope(d), 3)],
      }),
    );
    expect(catalogRequests(d.cloud.sent)).toHaveLength(1);
    expect(staffRequests(d.cloud.sent)).toHaveLength(1);

    // Answered out of order, which is what a real gateway is free to do.
    d.cloud.push(staffResponse({ scope: ownScope(d), version: 3, entries: rosterFor(d) }));
    d.cloud.push(
      catalogResponse({
        org_id: d.id.org_id,
        version: 2,
        entries: [{ kind: "item", id: "i1", name: "Chicken Karahi" }],
      }),
    );
    expect(d.store.staff.version()).toBe(3);
    expect(d.store.catalog.version()).toBe(2);
    expect(d.store.staff.list()).toHaveLength(4);
    expect(d.store.catalog.list("item")).toHaveLength(1);
  });

  it("a staff refusal does not become a catalog refusal", () => {
    // Two slots, because they have different remedies and a UI that conflates them sends staff
    // to the wrong fix (`00 §5.7`, and the `blocked` cursor's own recorded reasoning).
    const d = openDevice();
    d.cloud.deliver(
      helloAck({
        reference_versions: [catalogKey(d.id.org_id, 2), staffKey(ownScope(d), 3)],
      }),
    );
    d.cloud.push(
      staffResponse({
        scope: { org_id: d.id.org_id, branch_id: OTHER_BRANCH },
        version: 3,
        entries: [],
      }),
    );
    d.cloud.push(
      catalogResponse({
        org_id: d.id.org_id,
        version: 2,
        entries: [{ kind: "item", id: "i1", name: "Chicken Karahi" }],
      }),
    );
    expect(requireStaffRefusal(d.session, "a foreign roster").reason).toBe("foreign_artifact");
    expect(d.session.status().catalog_refusal).toBeNull();
    expect(d.store.catalog.version()).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════
// §E — `01-F56`: a refusal is OBSERVABLE, bounded, and clears when an update lands
// ═══════════════════════════════════════════════════════════════════════════════════════

describe("01-F56 — a refused roster is observable in device health", () => {
  it("`needs_snapshot` is surfaced with the version the device actually holds", () => {
    // "`have_version` is what the device actually holds, so a support surface can say 'stuck at
    // version 7' rather than only 'stuck'." On the roster the user-visible symptom is a cashier
    // whose PIN stopped working, so "stuck" alone sends a manager to the wrong problem.
    const d = openDevice();
    helloWithStaff(d, 2);
    serveRoster(d, 2);
    d.cloud.deliver(staffNotice(ownScope(d), 9));
    d.cloud.push(
      staffResponse({
        scope: ownScope(d),
        form: "delta",
        version: 9,
        base_version: 7, // a base this device has never held
        entries: [staffEntry({ user_id: USER.hina, display_name: "Hina", grid_ordinal: 2 })],
      }),
    );
    const refusal = requireStaffRefusal(d.session, "a delta on a base the device never held");
    expect(refusal.reason).toBe("needs_snapshot");
    expect(refusal.have_version).toBe(2);
    expect(d.store.staff.version()).toBe(2);
  });

  it("a server that keeps answering with the same unusable delta is asked a BOUNDED number of times", () => {
    // `01-F17`: an unbounded receive-path loop is one of the few things in this session that
    // could stop a till selling — each iteration costs the gateway a fold over the branch's
    // whole entry table, so a buggy or hostile server turns one till into a hot loop against
    // credential storage. The count is not asserted, only that it terminates: the FR rules the
    // property and names no number.
    const d = openDevice();
    helloWithStaff(d, 5);
    for (let i = 0; i < 25; i++) {
      const asked = staffRequests(d.cloud.sent).length;
      if (asked === 0) break;
      d.cloud.push(
        staffResponse({
          scope: ownScope(d),
          form: "delta",
          version: 5,
          base_version: 4,
          entries: [staffEntry({ user_id: USER.hina, display_name: "Hina", grid_ordinal: 2 })],
        }),
      );
      if (staffRequests(d.cloud.sent).length === asked) break; // it stopped asking
    }
    expect(
      staffRequests(d.cloud.sent).length,
      "the device is in an unbounded fetch loop against the branch's credential store",
    ).toBeLessThanOrEqual(8);
    expect(requireStaffRefusal(d.session, "the repeated refusal").reason).toBe("needs_snapshot");
  });

  it("a roster that PARSES at the wire is APPLIED and never refused by the device's own belt", () => {
    // The direction that costs a branch its sign-in. `01-F75` puts the row schema at the WRITER
    // and keeps the device's `malformed` as the belt — but a belt tighter than the wire refuses
    // a legal roster, and "one unparseable member refuses the ENTIRE update, and for `staff`
    // that is a branch nobody can sign in to… `01-F17`'s stopped till arriving through a
    // validator." Both rows below are shapes `01-F75` names as SPECIFIED: an `active` member
    // whose first PIN is not set yet (R29), and a departed member carrying no hash (`11-F21`).
    //
    // ⚠ It is also the honest bound on what this file can reach: `StaffEntryWire` is strictly
    // stronger than anything the device can check, so a `malformed` REFUSAL is not producible
    // from a parsed frame at all. That case is asserted at the registry in
    // `staff-apply.test.ts`, and the gap is reported rather than faked with an unparseable
    // fixture — an assertion that cannot be reached through the seam it claims to guard is the
    // §A3 defect this repo already measured.
    const d = openDevice();
    helloWithStaff(d, 2);
    serveRoster(d, 2);
    d.cloud.deliver(staffNotice(ownScope(d), 3));
    d.cloud.push(
      staffResponse({
        scope: ownScope(d),
        version: 3,
        entries: [
          staffEntry({ user_id: USER.hina, display_name: "Hina", grid_ordinal: 2 }),
          staffEntry({
            user_id: USER.zainab,
            display_name: "Zainab",
            grid_ordinal: 0,
            status: "inactive",
            assignments: [{ role: "owner", branch_id: null }],
          }),
        ],
      }),
    );
    expect(d.store.staff.version(), "a legal roster was refused by the device").toBe(3);
    expect(readStaffRefusal(d.session)).toBeNull();
    expect(d.store.staff.lookup(USER.zainab), "a departed member was dropped").not.toBeNull();
  });

  it("a refusal CLEARS when a good roster lands", () => {
    const d = openDevice();
    helloWithStaff(d, 3);
    d.cloud.push(
      staffResponse({
        scope: { org_id: d.id.org_id, branch_id: OTHER_BRANCH },
        version: 3,
        entries: [],
      }),
    );
    expect(requireStaffRefusal(d.session, "a foreign roster").reason).toBe("foreign_artifact");
    d.cloud.down();
    d.cloud.up();
    helloWithStaff(d, 3);
    serveRoster(d, 3);
    expect(
      readStaffRefusal(d.session),
      "a stale refusal outlived the repair, so device health reports a fault that is fixed",
    ).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════
// §F — `01-F17` / R28: the till goes on selling, and an OLD roster still signs people in
// ═══════════════════════════════════════════════════════════════════════════════════════

describe("01-F17/R28 — a roster problem never stops the till", () => {
  it("a standing staff refusal does not stop the ledger draining", () => {
    // The whole reference-data path is beside the ledger, not in front of it. A device that
    // wedged its push loop on a roster problem would accumulate unacked sales while looking
    // connected — `19 §5`'s write-checkpoint stalled by an identity fetch.
    const d = openDevice();
    helloWithStaff(d, 3);
    d.cloud.push(
      staffResponse({
        scope: { org_id: d.id.org_id, branch_id: OTHER_BRANCH },
        version: 3,
        entries: [],
      }),
    );
    // ⚠ ANCHORED: the refusal must actually be STANDING, or this is "a session with no roster
    // arm still pushes", which is true today and proves nothing about the property.
    expect(requireStaffRefusal(d.session, "the standing refusal this test is about").reason).toBe(
      "foreign_artifact",
    );
    d.store.append(appendInput(d.id));
    d.session.notifyAppended();
    expect(d.cloud.sent.filter((m) => m.kind === "push")).not.toHaveLength(0);
  });

  it("R28 — the WAN drops and the roster this device already holds still signs a cashier in", async () => {
    // "An OLD roster admits, with its age surfaced… refusing because the WAN is down is
    // precisely the breach `01-F74` (d) exists to prevent." So a disconnect discards the
    // in-flight FETCH and touches nothing that has already landed.
    const d = openDevice();
    helloWithStaff(d, 1);
    serveRoster(d, 1);
    // A second fetch is in flight when the link dies.
    d.cloud.deliver(staffNotice(ownScope(d), 2));
    d.cloud.push(
      staffResponse({
        scope: ownScope(d),
        version: 2,
        entries: rosterFor(d),
        complete: false,
        next_from: 1,
      }),
    );
    d.cloud.down();

    expect(d.store.staff.version()).toBe(1);
    expect(d.store.staff.list()).toHaveLength(4);
    const result = await unlocks(d, USER.hina, PIN.hina);
    expect(result.ok, "a WAN outage stopped a cashier signing in — 00 §5.1").toBe(true);
  });

  it("a half-received roster is never completed with pages from the NEXT connection", () => {
    // The accumulator belongs to ONE connection. Splicing two rosters together under one
    // version number is undetectable at the till and, here, decides who may open a shift.
    const d = openDevice();
    helloWithStaff(d, 2);
    d.cloud.push(
      staffResponse({
        scope: ownScope(d),
        version: 2,
        entries: [staffEntry({ user_id: USER.zainab, display_name: "Zainab", grid_ordinal: 0 })],
        complete: false,
        next_from: 1,
      }),
    );
    d.cloud.down();
    d.cloud.up();
    // The tail of the DEAD fetch arrives on the fresh connection before any hello_ack.
    d.cloud.push(
      staffResponse({
        scope: ownScope(d),
        version: 2,
        entries: [staffEntry({ user_id: USER.hina, display_name: "Hina", grid_ordinal: 1 })],
      }),
    );
    expect(d.store.staff.version(), "a spliced roster was committed at a full version").toBe(0);
    expect(d.store.staff.list()).toHaveLength(0);

    // ⚠ ANCHORED: the session is still capable of fetching — otherwise "nothing was committed"
    // is scored by a device that commits nothing ever.
    helloWithStaff(d, 2);
    serveRoster(d, 2);
    expect(d.store.staff.version(), "the anchor: the next fetch does land").toBe(2);
    expect(d.store.staff.list()).toHaveLength(4);
  });
});
