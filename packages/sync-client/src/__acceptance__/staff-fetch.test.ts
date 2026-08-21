// Acceptance tests — STEP 7 (b): the RESHAPE. A `reference_response` for `resource: "staff"`
// becomes the `StaffUpdate` the registry already understands, and a cashier's PIN survives it.
//
// AUTHORED FROM SPEC TEXT ONLY (`24 §3` step 2 — read-only to the implementing session).
//
// ⚠ **THIS FILE EXISTS BECAUSE OF A MEASUREMENT, NOT A THEORY.** `catalog-fetch.ts`'s `toEntry`
// dropped `prices` and `station`: the gateway served them, `CatalogEntryWire` carried them, the
// device store declared and read them, and the ONE function between did not copy them. It
// failed **0 of 579** tests, because `catalog-pricing.test.ts` calls `store.catalog.apply()`
// directly and never crosses that seam, while `catalog-fetch.test.ts` did not contain the word
// *price*. `WireCatalogResponse`'s own doc comment had already warned that "a reshape is where a
// field quietly goes missing" — about that reshape.
//
// The roster's version of that defect is a cashier's PIN silently ceasing to verify, on a
// device that reports a healthy version number. So **every assertion here runs the whole hop**
// — parsed wire frame → `accept()` → `store.staff.apply()` → `lookup()` → `unlock()` — and the
// credential leg ends at a real `verifyPin`, never at a string comparison. That last clause is
// the lesson `packages/sync-client/CLAUDE.md` records verbatim: "an assertion on
// `update.upserts[0].prices` would have passed against a store that dropped the column, which
// is the same mistake one layer down."
//
// Clauses transcribed:
//   01-F75  the response body is `form` / `version` / `base_version?` / `entries[]` /
//           `complete` / `next_from`, and "a snapshot must apply ATOMICALLY — the device must
//           never hold half an artifact"; "A DEPARTURE IS A MARKED ENTRY AND NEVER AN ABSENCE —
//           the frame carries no removals list, for any resource."
//   01-F76  the frame states the artifact's scope; a paged fetch is a fetch of ONE artifact.
//   01-F28  PIN verification happens on-device against SYNCED credential hashes.
//   01-F61  `grid_ordinal` is the grid's order; new members append.
//   11-F20  `display_name` is required on the wire.
//   11-F21  the hash rides an `active` entry only, and never leaves the process that verifies it.
//   01-F78  a row carries the assignments that reach THIS branch — org-wide (`null`) included.
//
// ── ORACLE-PROPOSED SURFACE (binding; PROTECTED PATH, and R35 puts credentials on full
//    adversarial rounds, so it wants ratification there):
//
//      packages/sync-client/src/staff-fetch.ts
//        createStaffFetch(have_version: number): { accept(frame): StaffFetchStep }
//        StaffFetchStep =
//          | { done: false; fetchMore: { have_version: number; from: number; at_version: number } }
//          | { done: true;  update: StaffUpdate | null }
//
//    It is `catalog-fetch.ts`'s shape verbatim, which is what the plan's step 7 specifies ("a
//    staff accumulator on `catalog-fetch.ts:113`'s shape, with its own `toMember`"), and the
//    file name is part of the contract because a suite cannot import a module it cannot name.
//    `accept` takes the frame **the protocol layer parses, unmodified** — the reason
//    `WireCatalogResponse` spells `| undefined` on its optionals — so these tests pass the
//    output of `parseMessage` straight in.
//
// RED-AWAITING-IMPLEMENTATION: `../staff-fetch.js` does not exist, so this file fails to load.
// That is the intended red and it is the same idiom `cloud-session.test.ts` shipped with
// ("createCloudSession is the not-yet-built T-01-06 impl surface — its absence is the RED").

import { verifyPin } from "@restos/domain";
import { describe, expect, it } from "vitest";
import { createPinSession } from "../pin-session.js";
import type { StaffUpdate } from "../staff.js";
// The not-yet-built step-7 surface. Its absence is the RED.
import { createStaffFetch, type StaffFetchStep } from "../staff-fetch.js";
import { openStore } from "../store.js";
import { must } from "./builders.js";
import {
  PIN,
  PIN_HASH,
  ROSTER,
  staffEntry,
  staffResponse,
  USER,
  type WireStaffEntryInput,
} from "./staff-builders.js";

const ORG = "org-step7";
const BRANCH = "branch-gulberg";
const DEVICE = "till-1";
const SCOPE = { org_id: ORG, branch_id: BRANCH };

/** Narrow a step to its update. `done: false` carries no `update` field at all — there is
 *  nothing a caller could apply even by mistake, which is stronger than asking them not to. */
const finished = (step: StaffFetchStep): StaffUpdate | null => (step.done ? step.update : null);

type Proposed = {
  user_id: string;
  display_name?: string;
  grid_ordinal: number;
  status: string;
  assignments: readonly { role: string; branch_id: string | null }[];
  pin_hash?: string;
};

const device = () => openStore({ path: ":memory:", identity: { ...SCOPE, device_id: DEVICE } });

/** The whole hop, as one call: the frame the gateway would send, landed in the device store. */
const land = (
  store: ReturnType<typeof device>,
  frame: ReturnType<typeof staffResponse>,
  have_version = 0,
) => {
  const update = finished(createStaffFetch(have_version).accept(frame));
  if (update === null) throw new Error("the accumulator produced no update for a complete page");
  const result = store.staff.apply(update);
  if (!result.applied) {
    throw new Error(
      `the registry refused the reshaped update as ${(result as { reason?: string }).reason} — ` +
        "the frame parsed, so either the reshape lost a required field or the registry refuses " +
        "a legal roster. `01-F75`: one unparseable member refuses the ENTIRE update, and for " +
        "`staff` that is a branch nobody can sign in to.",
    );
  }
  return result;
};

const read = (store: ReturnType<typeof device>, user_id: string): Proposed =>
  must(store.staff.lookup(user_id), `member ${user_id}`) as unknown as Proposed;

const unlockWith = (store: ReturnType<typeof device>, user_id: string, pin: string) =>
  createPinSession({
    registry: store.staff,
    device: { device_id: DEVICE, registered: true },
    idle_lock_ms: 60_000,
    max_failed_attempts: 3,
    now: () => 1_760_000_000_000,
    audit: () => {},
  }).unlock(user_id, pin);

const entry = (over: WireStaffEntryInput) => staffEntry(over);

// ═══════════════════════════════════════════════════════════════════════════════════════
// §A — THE SEAM. Every field the wire carries reaches the thing that reads it.
// ═══════════════════════════════════════════════════════════════════════════════════════

describe("01-F28/11-F21 — the credential survives the reshape, proved by VERIFYING it", () => {
  it("a cashier's synced PIN unlocks the till after fetch → apply", async () => {
    // The one assertion this whole file is for. `01-F28` puts verification on-device against
    // SYNCED hashes, so the test of "the hash arrived" is that the PIN it belongs to opens the
    // till — not that a string with a `$argon2id$` prefix is present somewhere.
    const store = device();
    land(store, staffResponse({ scope: SCOPE, version: 1, entries: ROSTER(BRANCH) }));
    const result = await unlockWith(store, USER.hina, PIN.hina);
    expect(result.ok, "the synced roster did not let a real cashier in").toBe(true);
  });

  it("the WRONG pin is still refused after the same hop — the control", async () => {
    // Attribution: without this, a reshape that wrote a constant hash every verifier accepts
    // would pass the test above. `01-F61` calls the PIN a convenience credential, not a
    // non-credential.
    const store = device();
    land(store, staffResponse({ scope: SCOPE, version: 1, entries: ROSTER(BRANCH) }));
    const result = await unlockWith(store, USER.hina, PIN.ayesha);
    expect(result.ok, "another member's PIN opened this member's session").toBe(false);
  });

  it("the stored hash is the one the wire carried, byte for byte", async () => {
    // Belt to the brace above: `verifyPin` would also succeed against a re-hash of the same
    // PIN, which cannot happen (the device never sees a PIN here) but which would hide a
    // re-encoding. `11-F21` makes the ENCODING one declaration across both planes precisely so
    // a cloud writer and a device verifier cannot disagree.
    const store = device();
    land(store, staffResponse({ scope: SCOPE, version: 1, entries: ROSTER(BRANCH) }));
    expect(read(store, USER.hina).pin_hash).toBe(PIN_HASH.hina);
    expect(await verifyPin(must(read(store, USER.hina).pin_hash), PIN.hina)).toBe(true);
  });
});

describe("01-F61/11-F20/11-F22/01-F26 — every other field survives too", () => {
  it("`display_name`, `grid_ordinal`, `status` and `assignments` all land", () => {
    // One member, asserted field by field rather than by a deep equal on the whole object: a
    // deep equal that happened to compare `{}` to `{}` after a total reshape failure would
    // still pass some shapes, and each of these four has a different consequence when it is
    // the one that is missing — a nameless tile, a grid that reorders on the next hire, a
    // departed cashier who can still sell, and a cashier `can()` refuses everything to.
    const store = device();
    land(store, staffResponse({ scope: SCOPE, version: 2, entries: ROSTER(BRANCH) }));
    const hina = read(store, USER.hina);
    expect(hina.user_id).toBe(USER.hina);
    expect(hina.display_name).toBe("Hina");
    expect(hina.grid_ordinal).toBe(2);
    expect(hina.status).toBe("active");
    expect(hina.assignments).toEqual([{ role: "cashier", branch_id: BRANCH }]);
    expect(store.staff.version()).toBe(2);
  });

  it("01-F78 — an ORG-WIDE assignment (`branch_id: null`) is preserved as null, not dropped", () => {
    // `01-F78` half one: an org-wide assignment REACHES every branch, which is how an owner
    // unlocks a till at a branch she does not staff. A reshape that collapsed `null` to the
    // device's own branch — or dropped the row — silently changes what `can()` answers, and
    // `main/authorize.ts` matches on `branch_id` for every write.
    const store = device();
    land(store, staffResponse({ scope: SCOPE, version: 1, entries: ROSTER(BRANCH) }));
    expect(read(store, USER.zainab).assignments).toEqual([{ role: "owner", branch_id: null }]);
  });

  it("11-F21/01-F75 — a member with NO `pin_hash` lands without one and without refusing", () => {
    // Both of the shapes `01-F75` calls specified: an `active` member whose first PIN the owner
    // has not set yet (R29), and a departed member who carries none by rule. A reshape that
    // wrote `pin_hash: undefined` as a present key, or that refused the member, breaks a whole
    // branch's sign-in — one unparseable member refuses the ENTIRE update.
    const store = device();
    land(
      store,
      staffResponse({
        scope: SCOPE,
        version: 1,
        entries: [
          entry({ user_id: USER.bilal, display_name: "Bilal", grid_ordinal: 0 }),
          entry({
            user_id: USER.hina,
            display_name: "Hina",
            grid_ordinal: 1,
            status: "inactive",
          }),
        ],
      }),
    );
    expect(read(store, USER.bilal).pin_hash).toBeUndefined();
    expect(read(store, USER.hina).status).toBe("inactive");
    expect(read(store, USER.hina).display_name).toBe("Hina");
  });

  it("01-F61 — the grid comes out in ORDINAL order from a page served in `user_id` order", () => {
    // The gateway pages `order by user_id` and says in terms that the wire order "carries no
    // meaning on purpose". So the hop is where a device that trusts arrival order is caught:
    // the frame arrives Bilal · Ayesha · Hina · Zainab and the grid must read
    // Zainab · Ayesha · Hina · Bilal.
    const store = device();
    land(store, staffResponse({ scope: SCOPE, version: 1, entries: ROSTER(BRANCH) }));
    expect(store.staff.list().map((m) => (m as unknown as Proposed).display_name)).toEqual([
      "Zainab",
      "Ayesha",
      "Hina",
      "Bilal",
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════
// §B — `01-F75`: a snapshot applies ATOMICALLY, and a paged fetch is one artifact
// ═══════════════════════════════════════════════════════════════════════════════════════

describe("01-F75 — a paged roster commits once, or not at all", () => {
  const pageOne = staffResponse({
    scope: SCOPE,
    version: 5,
    entries: [entry({ user_id: USER.zainab, display_name: "Zainab", grid_ordinal: 0 })],
    complete: false,
    next_from: 1,
  });

  it("a partial page yields NOTHING to apply and asks for the rest at the pinned version", () => {
    // Half a roster is half a branch that cannot sign in, mid-service, with the other half
    // arriving only if the link survives — and `01-F56`'s recovery path is exactly when the
    // link is least trustworthy. `at_version` pins the continuation to the version page 1 was
    // serving, which is what stops a publish between pages splicing two rosters into one
    // version number.
    const fetch = createStaffFetch(2);
    const step = fetch.accept(pageOne);
    expect(step.done, "a partial roster was offered for apply").toBe(false);
    expect(step.done === false && step.fetchMore).toEqual({
      have_version: 2,
      from: 1,
      at_version: 5,
    });
    expect("update" in step).toBe(false);
  });

  it("the LAST page commits every accumulated member exactly once", () => {
    const fetch = createStaffFetch(2);
    expect(fetch.accept(pageOne).done).toBe(false);
    const update = finished(
      fetch.accept(
        staffResponse({
          scope: SCOPE,
          version: 5,
          entries: [entry({ user_id: USER.hina, display_name: "Hina", grid_ordinal: 1 })],
        }),
      ),
    );
    const snapshot = must(update, "the completed update");
    expect(snapshot.kind).toBe("snapshot");
    expect(snapshot.version).toBe(5);
    expect(snapshot.kind === "snapshot" ? snapshot.members.map((m) => m.user_id) : []).toEqual([
      USER.zainab,
      USER.hina,
    ]);
  });

  it("an INTERRUPTED fetch leaves the device holding what it already had", () => {
    // The accumulator is discarded with its connection, so an interrupted fetch contributes
    // nothing at all rather than a prefix. Stated against the STORE and not only against the
    // accumulator, because the failure that matters is a till whose roster went half-empty.
    const store = device();
    land(store, staffResponse({ scope: SCOPE, version: 1, entries: ROSTER(BRANCH) }));
    const fetch = createStaffFetch(1);
    expect(fetch.accept(pageOne).done).toBe(false);
    expect(store.staff.list()).toHaveLength(4);
    expect(store.staff.version()).toBe(1);
  });

  it("pages that DISAGREE about what they are commit nothing", () => {
    // The catalog's measured defect, on the artifact where it costs credentials: the
    // accumulator took `version`/`base_version` from the LAST page and the entries from all of
    // them, so a publish between pages committed page 1's rows at the new version number —
    // after which `hello_ack` matched forever and the edit was never re-fetched. Silent,
    // permanent, undetectable at the till. Discarding is safe because nothing has been applied.
    const fetch = createStaffFetch(2);
    expect(fetch.accept(pageOne).done).toBe(false);
    const step = fetch.accept(
      staffResponse({
        scope: SCOPE,
        version: 6, // a different artifact version — these two pages are not one roster
        entries: [entry({ user_id: USER.hina, display_name: "Hina", grid_ordinal: 1 })],
      }),
    );
    expect(step.done).toBe(true);
    expect(finished(step), "two rosters were spliced into one version number").toBeNull();
  });

  it("…and a form disagreement is refused the same way", () => {
    const fetch = createStaffFetch(2);
    expect(fetch.accept(pageOne).done).toBe(false);
    const step = fetch.accept(
      staffResponse({
        scope: SCOPE,
        form: "delta",
        version: 5,
        base_version: 2,
        entries: [entry({ user_id: USER.hina, display_name: "Hina", grid_ordinal: 1 })],
      }),
    );
    expect(finished(step)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════
// §C — `01-F75`: a departure is a MARKED ENTRY, and there is no removals list to carry one
// ═══════════════════════════════════════════════════════════════════════════════════════

describe("01-F75/11-F22/R26 — a delta marks a departure and never removes a row", () => {
  it("a delta becomes a delta at the exact base the frame states", () => {
    const update = must(
      finished(
        createStaffFetch(4).accept(
          staffResponse({
            scope: SCOPE,
            form: "delta",
            version: 7,
            base_version: 4,
            entries: [entry({ user_id: USER.hina, display_name: "Hina", grid_ordinal: 2 })],
          }),
        ),
      ),
      "the delta update",
    );
    expect(update.kind).toBe("delta");
    expect(update.kind === "delta" && update.from_version).toBe(4);
    expect(update.version).toBe(7);
  });

  it("a deactivation arrives as an UPSERT — the row stays and the name still renders", () => {
    // R26's ruling in one hop: "a let-go cashier's name still renders on last month's orders."
    // The wire carries no removals list for any resource (`01-F75`), so the ONLY thing a
    // correct reshape can do with a departure is upsert a marked row. A reshape that turned an
    // `inactive` entry into a removal would delete the device's record of her name — the exact
    // defect `11-F22` names in the shipped `staff.ts`, reintroduced one layer up.
    const store = device();
    land(store, staffResponse({ scope: SCOPE, version: 4, entries: ROSTER(BRANCH) }));
    const update = must(
      finished(
        createStaffFetch(4).accept(
          staffResponse({
            scope: SCOPE,
            form: "delta",
            version: 5,
            base_version: 4,
            entries: [
              entry({
                user_id: USER.hina,
                display_name: "Hina",
                grid_ordinal: 2,
                status: "inactive",
              }),
            ],
          }),
        ),
      ),
      "the departure delta",
    );
    expect(update.kind === "delta" && update.upserts.map((m) => m.user_id)).toEqual([USER.hina]);
    const applied = store.staff.apply(update);
    expect(
      applied.applied,
      `the departure was refused as ${(applied as { reason?: string }).reason}`,
    ).toBe(true);
    expect(read(store, USER.hina).display_name).toBe("Hina");
    expect(read(store, USER.hina).status).toBe("inactive");
    // …and the people the delta did not name are untouched.
    expect(read(store, USER.zainab).display_name).toBe("Zainab");
  });

  it("an EMPTY delta at the version we hold is the server saying 'you are current'", () => {
    // `staffPage` answers a device at parity with `form: "delta", base_version === version,
    // entries: []`. That is not an error and must not be applied as one — a device that treated
    // it as a refusal would report a fault every time it was up to date.
    const step = createStaffFetch(9).accept(
      staffResponse({
        scope: SCOPE,
        form: "delta",
        version: 9,
        base_version: 9,
        entries: [],
      }),
    );
    expect(step.done).toBe(true);
    expect(finished(step)).toBeNull();
  });
});
