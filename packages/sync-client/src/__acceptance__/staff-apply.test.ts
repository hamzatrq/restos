// Acceptance tests — STEP 7 (a): what the DEVICE REGISTRY does with a roster.
//
// AUTHORED FROM SPEC TEXT ONLY (`24 §3` step 2 — read-only to the implementing session).
// Every assertion below cites the clause it transcribes; nothing here was derived from
// `staff.ts`, which is the code these tests exist to constrain.
//
// The clauses, quoted so an implementer can check the transcription rather than trust it:
//
//   01-F61  "position is an explicit ordinal on the record and **new members append**" —
//           "Ordering the identification grid by any *derived* key — `user_id`, name,
//           recency — means a new hire inserts wherever it sorts and shifts every tile after
//           it… The first build ordered by `user_id` and the defect is invisible to a test
//           that only re-renders the same roster, which is precisely how it survived review."
//   11-F22  "Only `active` PARTICIPATES… An inactive person does not unlock, on any device,
//           WAN or no WAN"; "The one rendering surface status DOES govern is the
//           identification grid, and only because a control there is an offer… Every *other*
//           rendering of a name — order, receipt, KOT, report, reconciliation — is
//           unconditional"; "The refusal needs a NAME… The reason is **`not_active`**";
//           "It records no lockout failure"; "what a device does with its own older stored
//           rows is a protected-path code decision owed against this FR, **not a licence to
//           default an absent status to `active`**"; "every person the roster has ever named
//           stays resolvable by `user_id`".
//   11-F21  the hash "is carried ONLY on an `active` ENTRY"; "a **missing hash on a
//           non-`active` member is the specified shape and never `malformed`**".
//   01-F75  "one unparseable member refuses the entire update (`01-F56` `malformed`), and for
//           `staff` that is a branch nobody can sign in to"; "**A missing `pin_hash` on a
//           non-`active` member is NOT `malformed`**"; R29 makes "active, no credential yet" a
//           real published state; "A DEPARTURE IS A MARKED ENTRY AND NEVER AN ABSENCE".
//   01-F56  "Versions apply monotonically, and a delta whose base does not match is REFUSED…
//           An older snapshot or delta than the device already holds is ignored, never applied
//           backwards"; "Refusal is observable in device health".
//   01-F17  a sale is never blocked — a shape the device cannot read is a REFUSAL, never an
//           exception unwinding through whatever was serving the till.
//   R28     an OLD roster admits; only a NEVER-RECEIVED one refuses.
//
// ── ORACLE-PROPOSED SURFACE (binding for the implementing session; `packages/sync-client` is
//    a PROTECTED PATH under `20 §4.4` and R35 puts the CREDENTIAL tier on full adversarial
//    rounds, so this wants ratification in that review rather than silent adoption):
//
//      StaffMember      += grid_ordinal: number          (`01-F61`, explicit, never derived)
//                       += status: "active" | "inactive" (`11-F22`, closed at two)
//                       ×= pin_hash becomes OPTIONAL     (`11-F21`, active entries only)
//      StaffApplyResult += reason "divergent"            (`01-F56`, the catalog's fourth)
//      UnlockRefusal    += "not_active"                  (`11-F22`, named there verbatim)
//      StaffRegistry.list()  offers `active` members only (`11-F22`'s grid clause; its own
//                            doc comment already says it exists for `01-F61`'s grid)
//      StaffRegistry.lookup() resolves EVERY member the roster has ever named (`11-F22`)
//
//    The alternative to the `list()` narrowing — a second method for the grid — is named in
//    the report rather than picked here: `list()` is what BOTH shipped hosts render the grid
//    from (`apps/pos-electron/src/main/index.ts:1592`, `apps/pass-kds/src/main/pass-identity.ts:142`),
//    and step 7 does not touch either host, so a `list()` that returned inactive members would
//    put a permanently-refusing tile on `01-F61`'s grid the day retention lands (`27-F5`: no
//    dead control).
//
// RED-AWAITING-IMPLEMENTATION: today `StaffMember` is four fields, `list()` is
// `ORDER BY user_id`, `StaffApplyResult` has three reasons and `UnlockRefusal` has four.
// Every assertion below names what it owes when it fails.

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import {
  createMemoryPinAttemptStore,
  createPinAttemptStore,
  PIN_ATTEMPTS_SCHEMA,
} from "../pin-attempts.js";
import { createPinSession } from "../pin-session.js";
import {
  createStaffRegistry,
  STAFF_SCHEMA,
  type StaffApplyResult,
  type StaffMember,
  type StaffRegistry,
  type StaffUpdate,
} from "../staff.js";
import { PIN, PIN_HASH, USER } from "./staff-builders.js";

const BRANCH = "branch-gulberg";
const DEVICE = "till-1";

// ── the proposed member shape, read and written through one cast each ───────────────────
// The casts exist so that this file TYPECHECKS against today's four-field `StaffMember`:
// the suite must be red on ASSERTIONS, not red on `tsc`, or the RED stops being evidence
// about behaviour. They are the only place the proposed shape is asserted structurally.

type Proposed = {
  user_id: string;
  display_name?: string;
  grid_ordinal: number;
  status: string;
  assignments: readonly { role: string; branch_id: string | null }[];
  pin_hash?: string;
};

const member = (m: Proposed): StaffMember => m as unknown as StaffMember;
const read = (m: StaffMember | null): Proposed | null => m as unknown as Proposed | null;
const reasonOf = (r: StaffApplyResult): string | null =>
  r.applied ? null : ((r as { reason?: string }).reason ?? null);

// ── the four people. See `staff-builders.ts` for why the three orderings are disjoint. ──

const ZAINAB = member({
  user_id: USER.zainab,
  display_name: "Zainab",
  grid_ordinal: 0,
  status: "active",
  assignments: [{ role: "owner", branch_id: null }],
  pin_hash: PIN_HASH.zainab,
});
const AYESHA = member({
  user_id: USER.ayesha,
  display_name: "Ayesha",
  grid_ordinal: 1,
  status: "active",
  assignments: [{ role: "branch_manager", branch_id: BRANCH }],
  pin_hash: PIN_HASH.ayesha,
});
const HINA = member({
  user_id: USER.hina,
  display_name: "Hina",
  grid_ordinal: 2,
  status: "active",
  assignments: [{ role: "cashier", branch_id: BRANCH }],
  pin_hash: PIN_HASH.hina,
});
const BILAL = member({
  user_id: USER.bilal,
  display_name: "Bilal",
  grid_ordinal: 3,
  status: "active",
  assignments: [{ role: "cashier", branch_id: BRANCH }],
  pin_hash: PIN_HASH.bilal,
});
/**
 * R29: the owner sets a person's first PIN in the back office, so "active, no credential yet"
 * is a real published state. Kept OUT of the base roster deliberately — it is the one member
 * today's `isMember` refuses, and putting it in the shared fixture would collapse every
 * assertion in this file into one setup failure and stop the red saying anything per clause.
 */
const BILAL_NO_PIN = member({
  user_id: USER.bilal,
  display_name: "Bilal",
  grid_ordinal: 3,
  status: "active",
  assignments: [{ role: "cashier", branch_id: BRANCH }],
});

/** The gateway pages `order by user_id`, so a roster arrives in an order that means nothing. */
const WIRE_ORDER = [BILAL, AYESHA, HINA, ZAINAB];

const harness = () => {
  const db = new Database(":memory:");
  db.exec(STAFF_SCHEMA);
  db.exec(PIN_ATTEMPTS_SCHEMA);
  return {
    db,
    registry: createStaffRegistry(db as never),
    attempts: createPinAttemptStore(db as never),
  };
};

const seeded = (members: readonly StaffMember[] = WIRE_ORDER, version = 1) => {
  const h = harness();
  const result = h.registry.apply({ kind: "snapshot", version, members });
  if (!result.applied) {
    throw new Error(
      `fixture roster refused as ${reasonOf(result)} — the SETUP is broken, not the assertion. ` +
        "`01-F75` makes every field below the specified wire shape, so a refusal here means the " +
        "registry rejects a legal roster.",
    );
  }
  return h;
};

const names = (registry: StaffRegistry): string[] =>
  registry.list().map((m) => read(m)?.display_name ?? "<no name>");

const session = (registry: StaffRegistry, attempts = createMemoryPinAttemptStore()) =>
  createPinSession({
    registry,
    device: { device_id: DEVICE, registered: true },
    idle_lock_ms: 60_000,
    max_failed_attempts: 3,
    now: () => 1_760_000_000_000,
    audit: () => {},
    attempts,
  });

/** `unlock`'s refusal reason, widened — `not_active` is not in today's closed union. */
const refusalOf = (result: { ok: boolean } & Record<string, unknown>): string | null =>
  result.ok ? null : ((result as { reason?: string }).reason ?? null);

// ═══════════════════════════════════════════════════════════════════════════════════════
// §A — `01-F61`: the grid is ordered by an EXPLICIT ordinal, and positions never move
// ═══════════════════════════════════════════════════════════════════════════════════════

describe("01-F61 — `grid_ordinal` is the grid's order, and it is not derived from anything", () => {
  it("renders in ORDINAL order, which agrees with neither the wire order nor the name", () => {
    // The fixture is the assertion: `user_id` ascending is Bilal · Ayesha · Hina · Zainab (and
    // it is the order the gateway pages in), alphabetical is Ayesha · Bilal · Hina · Zainab,
    // and the ordinal is Zainab · Ayesha · Hina · Bilal. No two agree anywhere, so this one
    // expectation separates four implementations: ordinal, `user_id`, name, and arrival order.
    const { registry } = seeded();
    expect(names(registry)).toEqual(["Zainab", "Ayesha", "Hina", "Bilal"]);
  });

  it("carries the ordinal on the RECORD, so a reader can see the position it was given", () => {
    // `01-F61` says position is "an explicit ordinal ON THE RECORD". A registry that sorted
    // correctly and dropped the field would pass the test above and leave every consumer —
    // the grid, a later re-sort, the honesty surface — with no way to state a position.
    const { registry } = seeded();
    expect(registry.list().map((m) => read(m)?.grid_ordinal)).toEqual([0, 1, 2, 3]);
    expect(read(registry.lookup(USER.hina))?.grid_ordinal).toBe(2);
  });

  it("A NEW HIRE APPENDS AND NO EXISTING TILE MOVES — the ordinary Tuesday hire", () => {
    // `01-F61`'s own worked defect. Farah's `user_id` sorts FIRST of the five and her name
    // sorts second, so under any derived key she inserts near the front and shifts every tile
    // after her — destroying the muscle memory `27-F4` protects on a control a cashier taps
    // 20–60× a shift. Under the explicit ordinal she appends and nobody moves.
    const { registry } = seeded();
    const before = names(registry);
    const FARAH = member({
      user_id: "u-0000-farah", // sorts before every id in the fixture
      display_name: "Aaliya Farah", // sorts before every name but Ayesha
      grid_ordinal: 4, // …and appends
      status: "active",
      assignments: [{ role: "cashier", branch_id: BRANCH }],
      pin_hash: PIN_HASH.hina,
    });
    const applied = registry.apply({
      kind: "delta",
      from_version: 1,
      version: 2,
      upserts: [FARAH],
      removals: [],
    } as unknown as StaffUpdate);
    expect(applied.applied, `the hire was refused as ${reasonOf(applied)}`).toBe(true);

    const after = names(registry);
    expect(after.at(-1), "a new hire must APPEND").toBe("Aaliya Farah");
    // The property `01-F61` actually states: positions NEVER MOVE. Asserting the whole prefix
    // is stronger than asserting the new tile's index, because the defect is what happens to
    // everyone else.
    expect(after.slice(0, before.length)).toEqual(before);
  });

  it("re-applying the SAME roster changes nothing — the control the first build passed", () => {
    // `01-F61` records that the derived-ordering defect "is invisible to a test that only
    // re-renders the same roster". This test is that blind test, kept deliberately as a CONTROL:
    // it must pass under BOTH a correct implementation and the broken one, so a suite in which
    // it is the only ordering assertion is a suite that proves nothing.
    const { registry } = seeded();
    const before = names(registry);
    const again = registry.apply({ kind: "snapshot", version: 1, members: WIRE_ORDER });
    expect(again.applied).toBe(true);
    expect(names(registry)).toEqual(before);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════
// §B — `11-F22`: participation decides whether she may ACT and nothing about RENDERING
// ═══════════════════════════════════════════════════════════════════════════════════════

describe("11-F22 — a deactivated person renders and does not participate", () => {
  const departed = () => {
    const h = seeded();
    const result = h.registry.apply({
      kind: "delta",
      from_version: 1,
      version: 2,
      upserts: [
        member({
          user_id: USER.hina,
          display_name: "Hina",
          grid_ordinal: 2,
          status: "inactive",
          assignments: [{ role: "cashier", branch_id: BRANCH }],
          // `11-F21`: the hash rides an `active` entry ONLY, so a departure arrives WITHOUT one.
        }),
      ],
      removals: [],
    } as unknown as StaffUpdate);
    expect(result.applied, `the deactivation was refused as ${reasonOf(result)}`).toBe(true);
    return h;
  };

  it("R26/11-F20: her name still resolves — a past order does not degrade to a raw UUID", () => {
    // The ruling in one line: "a let-go cashier's name still renders on last month's orders."
    // The shipped device code removed the row, and `apps/pos-electron/src/main/index.ts:777`
    // then degrades to the identifier — measured in `11-F22` as the defect this closes.
    const { registry } = departed();
    expect(read(registry.lookup(USER.hina))?.display_name).toBe("Hina");
  });

  it("the identification grid stops offering her — a control there is an OFFER", () => {
    // `11-F22`: "`01-F61`'s grid offers `active` members only: a tile that always refuses is a
    // control that cannot do its job, and hiding one moves nothing, because `01-F61` makes
    // position an explicit `grid_ordinal` rather than a list index."
    const { registry } = departed();
    expect(names(registry)).toEqual(["Zainab", "Ayesha", "Bilal"]);
    // …and hiding one moved nothing: the ordinals of the survivors are untouched.
    expect(registry.list().map((m) => read(m)?.grid_ordinal)).toEqual([0, 1, 3]);
  });

  it("she does not unlock, and the refusal is named `not_active`", async () => {
    // "Only `active` PARTICIPATES… An inactive person does not unlock, on any device, WAN or
    // no WAN." The NAME is `11-F22`'s, declared there because on a protected path a closed
    // refusal vocabulary is part of the contract: `unknown_user` is false (she is on the
    // roster) and `bad_pin` is a lie about a PIN that was never checked.
    const { registry } = departed();
    const result = await session(registry).unlock(USER.hina, PIN.hina);
    expect(result.ok, "a deactivated person unlocked the till").toBe(false);
    expect(refusalOf(result)).toBe("not_active");
  });

  it("…and charges NO lockout failure, which `11-F22` states outright", async () => {
    // "It records no lockout failure, and under this FR that costs nothing rather than opening
    // a brute-force path: `unknown_user` already refuses without charging an attempt, and a
    // non-`active` entry carries no `pin_hash` at all, so there is no credential to guess."
    const { registry, attempts } = departed();
    const pins = createPinSession({
      registry,
      device: { device_id: DEVICE, registered: true },
      idle_lock_ms: 60_000,
      max_failed_attempts: 3,
      now: () => 1_760_000_000_000,
      audit: () => {},
      attempts,
    });
    await pins.unlock(USER.hina, PIN.hina);
    await pins.unlock(USER.hina, PIN.hina);
    expect(attempts.read(DEVICE, USER.hina).failures).toBe(0);
  });

  it("CONTROL: an ACTIVE colleague with the same shape still unlocks", async () => {
    // Attribution. Without this the four assertions above are satisfied by a registry that
    // refuses everyone, which is `01-F17`'s stopped till passing as a security property.
    const { registry } = departed();
    const result = await session(registry).unlock(USER.ayesha, PIN.ayesha);
    expect(result.ok, "an active manager was refused").toBe(true);
  });
});

describe("11-F22 — an ABSENT status is never read as `active`", () => {
  it("a stored row written by an older build does not unlock", async () => {
    // `11-F22` in terms: "rows written by a build that predates this field carry no status…
    // what a device does with its own older stored rows is a protected-path code decision owed
    // against this FR, **not a licence to default an absent status to `active`**", and `01-F48`
    // says where state cannot be read, participation is REFUSED, not granted.
    //
    // The row is written straight into SQLite because that is the only way this state exists:
    // the wire cannot express it (`StaffEntryWire.status` is required), so no frame can produce
    // it and only the device's OWN history can. That is precisely why an oracle has to reach
    // past the wire here — this is the one case a frame-driven fixture structurally cannot see.
    const { db, registry } = harness();
    db.prepare("INSERT INTO staff (user_id, json) VALUES (?, ?)").run(
      USER.hina,
      JSON.stringify({
        user_id: USER.hina,
        display_name: "Hina",
        pin_hash: PIN_HASH.hina,
        assignments: [{ role: "cashier", branch_id: BRANCH }],
      }),
    );
    const result = await session(registry).unlock(USER.hina, PIN.hina);
    expect(result.ok, "a status-less legacy row unlocked the till").toBe(false);
  });
});

describe("11-F21/R29 — `pin_hash` is optional, and both of its neighbours are legal shapes", () => {
  it("an ACTIVE member with no PIN yet is not `malformed`, and is offered on the grid", () => {
    // R29 has the owner set a person's first PIN in the back office, so a published member with
    // no credential is an ordinary state — and `01-F75` says refusing it is "the stopped till
    // through a validator". The harm is the WHOLE roster, not one tile: one unreadable member
    // refuses the entire update, so if this member is refused the branch cannot sign in at all.
    const { registry } = seeded([ZAINAB, AYESHA, HINA, BILAL_NO_PIN]);
    expect(names(registry)).toEqual(["Zainab", "Ayesha", "Hina", "Bilal"]);
    expect(read(registry.lookup(USER.bilal))?.pin_hash).toBeUndefined();
  });

  it("…and she cannot unlock with ANY input, without an exception reaching the till", async () => {
    // `01-F17`: a shape the device cannot verify is a refusal, never a throw. `verifyPin` takes
    // a hash; a member with none is the case a straight call crashes on, and the crash lands in
    // whatever was serving the cashier.
    const { registry } = seeded([ZAINAB, BILAL_NO_PIN]);
    const result = await session(registry).unlock(USER.bilal, "0000");
    expect(result.ok, "a member with no credential unlocked").toBe(false);
  });

  it("a NON-active member with no hash is the specified shape, never `malformed`", () => {
    // `01-F75`: "**A missing `pin_hash` on a non-`active` member is NOT `malformed`**: it is the
    // specified shape, and a validator that refuses it is the stopped-till-through-a-validator."
    // The neighbour one keystroke away in English — an active member with none — is the test
    // above, and this repo's record is that the guard gets aimed at the wrong one of the pair.
    const { registry } = seeded();
    const result = registry.apply({
      kind: "delta",
      from_version: 1,
      version: 2,
      upserts: [
        member({
          user_id: USER.zainab,
          display_name: "Zainab",
          grid_ordinal: 0,
          status: "inactive",
          assignments: [{ role: "owner", branch_id: null }],
        }),
      ],
      removals: [],
    } as unknown as StaffUpdate);
    expect(result.applied, `refused as ${reasonOf(result)}`).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════
// §C — `01-F56`: monotone apply, and the fourth refusal `staff_state` cannot hold today
// ═══════════════════════════════════════════════════════════════════════════════════════

describe("01-F56 — versions apply monotonically", () => {
  it("a snapshot AT the held version applies — it is the only self-heal this device has", () => {
    const { registry } = seeded(WIRE_ORDER, 4);
    const result = registry.apply({ kind: "snapshot", version: 4, members: [ZAINAB] });
    expect(result.applied).toBe(true);
    expect(names(registry)).toEqual(["Zainab"]);
  });

  it("an OLDER snapshot is `stale` and the held roster is untouched", () => {
    const { registry } = seeded(WIRE_ORDER, 4);
    const result = registry.apply({ kind: "snapshot", version: 3, members: [ZAINAB] });
    expect(reasonOf(result)).toBe("stale");
    expect(names(registry)).toEqual(["Zainab", "Ayesha", "Hina", "Bilal"]);
    expect(registry.version()).toBe(4);
  });

  it("a delta whose base does not match is `needs_snapshot`, and applies NOTHING", () => {
    // "Applying an out-of-order delta silently diverges one device's roles from every other
    // device's, and the divergence is a CREDENTIAL, not a menu word."
    const { registry } = seeded(WIRE_ORDER, 4);
    const result = registry.apply({
      kind: "delta",
      from_version: 2,
      version: 5,
      upserts: [ZAINAB],
      removals: [],
    } as unknown as StaffUpdate);
    expect(reasonOf(result)).toBe("needs_snapshot");
    expect(registry.version()).toBe(4);
    expect(names(registry)).toEqual(["Zainab", "Ayesha", "Hina", "Bilal"]);
  });
});

describe("01-F56 — `divergent`: two updates that disagree about what a version MEANS", () => {
  /** Two deltas, same base, same target, different content — the competitor case. */
  const competitor = (upserts: readonly StaffMember[]) =>
    ({
      kind: "delta",
      from_version: 1,
      version: 2,
      upserts,
      removals: [],
    }) as unknown as StaffUpdate;

  it("the second is refused as `divergent` and the device drops to version 0", () => {
    // The catalog's fourth refusal, and `staff_state` (`version` alone) cannot detect it today:
    // refusal alone cannot fix a disagreement — both devices would sit at N holding different
    // rosters, each having refused the other's update as a duplicate — so the device holds
    // nothing until a snapshot re-establishes what N means. On a menu that costs a word; here
    // the two versions of "N" differ in who may open a shift and whose hash verifies.
    const { registry } = seeded();
    expect(registry.apply(competitor([HINA])).applied).toBe(true);
    const second = registry.apply(
      competitor([
        member({
          user_id: USER.hina,
          display_name: "Hina",
          grid_ordinal: 2,
          status: "active",
          // The same person at the same version with a MANAGER's assignment — the divergence
          // that matters, and one no version comparison can see.
          assignments: [{ role: "branch_manager", branch_id: BRANCH }],
          pin_hash: PIN_HASH.hina,
        }),
      ]),
    );
    expect(reasonOf(second)).toBe("divergent");
    expect(second.version).toBe(0);
    expect(registry.version()).toBe(0);
  });

  it("CONTROL: the SAME delta replayed is `stale`, never `divergent`", () => {
    // Attribution, and the reason `divergent` needs state rather than a counter: an ordinary
    // lossy link redelivers a delta, and a device that called that divergence would empty its
    // own roster on a retransmission — `01-F17`'s stopped till caused by the guard.
    const { registry } = seeded();
    expect(registry.apply(competitor([HINA])).applied).toBe(true);
    const replay = registry.apply(competitor([HINA]));
    expect(reasonOf(replay)).toBe("stale");
    expect(registry.version()).toBe(2);
    expect(names(registry)).toEqual(["Zainab", "Ayesha", "Hina", "Bilal"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════
// §D — `01-F17`: a shape the device cannot read is a REFUSAL, and the roster survives it
// ═══════════════════════════════════════════════════════════════════════════════════════

describe("01-F75/01-F56 — one unreadable member refuses the WHOLE update, without a throw", () => {
  const cases: readonly [string, unknown][] = [
    [
      "a member with no `grid_ordinal` — `01-F61` bans a derived position, so there is none to fall back to",
      { user_id: "u-x", display_name: "X", status: "active", assignments: [] },
    ],
    [
      "a `grid_ordinal` that is not an integer",
      {
        user_id: "u-x",
        display_name: "X",
        grid_ordinal: 1.5,
        status: "active",
        assignments: [{ role: "cashier", branch_id: null }],
      },
    ],
    [
      "a status outside `11-F22`'s closed set of two",
      {
        user_id: "u-x",
        display_name: "X",
        grid_ordinal: 1,
        status: "suspended",
        assignments: [{ role: "cashier", branch_id: null }],
      },
    ],
    [
      "a member with no `display_name` — `11-F20` makes the name required on the wire",
      {
        user_id: "u-x",
        grid_ordinal: 1,
        status: "active",
        assignments: [{ role: "cashier", branch_id: null }],
      },
    ],
  ];

  for (const [what, bad] of cases) {
    it(`${what} → \`malformed\`, and the held roster is intact`, () => {
      // `01-F75`: one unparseable member refuses the ENTIRE update — for `staff` that is a
      // branch nobody can sign in to, which is why the refusal must leave what the device
      // ALREADY holds untouched. A validator that cleared first and checked second would turn a
      // writer's bad row into a locked till mid-service.
      const { registry } = seeded(WIRE_ORDER, 4);
      const result = registry.apply({
        kind: "snapshot",
        version: 5,
        members: [ZAINAB, bad],
      } as unknown as StaffUpdate);
      expect(reasonOf(result)).toBe("malformed");
      expect(registry.version()).toBe(4);
      expect(names(registry)).toEqual(["Zainab", "Ayesha", "Hina", "Bilal"]);
    });
  }

  it("junk of any shape refuses rather than throwing (`01-F17`)", () => {
    const { registry } = seeded(WIRE_ORDER, 4);
    for (const junk of [
      null,
      undefined,
      42,
      "snapshot",
      [],
      { kind: "snapshot" },
      { kind: "snapshot", version: -1, members: [] },
      { kind: "delta", version: 5, upserts: [], removals: [] },
      { kind: "purge", version: 5 },
      { kind: "snapshot", version: 5, members: null },
    ]) {
      const result = registry.apply(junk as unknown as StaffUpdate);
      expect(reasonOf(result), `${JSON.stringify(junk)} was not refused`).toBe("malformed");
    }
    expect(registry.version()).toBe(4);
    expect(names(registry)).toEqual(["Zainab", "Ayesha", "Hina", "Bilal"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════
// §E — trap 11: a roster change and the per-(device, user) lockout counter
// ═══════════════════════════════════════════════════════════════════════════════════════

describe("01-F61 — the lockout counter is not collateral damage of a roster change", () => {
  it("a roster snapshot does not clear a live failure count for a member it keeps", async () => {
    // `01-F61`: the counter is per (device, user) and PERSISTS. `pin_attempts` is its own table
    // and is untouched by `applySnapshot`'s `clearAll` — so this is a pin on the property, not a
    // ruling about the cutover: what a wholesale replacement does to the counters of members it
    // DROPS is chosen by nobody in the corpus and is deliberately not asserted here.
    const { registry, attempts } = seeded();
    const pins = createPinSession({
      registry,
      device: { device_id: DEVICE, registered: true },
      idle_lock_ms: 60_000,
      max_failed_attempts: 3,
      now: () => 1_760_000_000_000,
      audit: () => {},
      attempts,
    });
    await pins.unlock(USER.hina, "0000");
    expect(attempts.read(DEVICE, USER.hina).failures).toBe(1);

    // A fresh roster lands mid-shift (an ordinary republish — a name edited two tiles away).
    expect(registry.apply({ kind: "snapshot", version: 2, members: WIRE_ORDER }).applied).toBe(
      true,
    );
    expect(
      attempts.read(DEVICE, USER.hina).failures,
      "a republish reset a live lockout counter, so three wrong PINs never lock anyone out",
    ).toBe(1);
  });
});
