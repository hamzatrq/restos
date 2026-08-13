// Acceptance tests — the `customer_file` fold's DIRECTED merge rules. Authored from spec text
// only (`24 §3` step 2); the FR list, the answered merge question and the per-field rule table
// live at the head of `./customer-file-builders.ts` and are not repeated here.
//
// The `01-F34` invariance nets are in `./customer-file-invariance.test.ts`; the ingest seam is
// in `./customer-file-store.test.ts`.
//
// RED-AWAITING-IMPLEMENTATION — `@restos/sync-client/fold-engine` exports none of
// `emptyCustomerFile` / `foldCustomerFile` / `projectCustomerFile`, and `packages/domain`'s
// registry has no `customer.*` key, so `store.ingest` would refuse these envelopes too.
//
// ⚠ AMENDED 2026-08-11 BY THE MUTATION PASS, and the provenance matters because the line above
// says "authored from spec text only". §4's LAST test was added by the adversarial session, which
// HAD read the implementation — it is the one assertion in this file whose author saw the code.
// It was written for a mutant that survived all 628 tests; the block comment on it carries the
// measurement. Everything else in this file predates any implementation.
//
// ⚠ THE ONE MUTANT THIS FILE EXISTS FOR, stated so it cannot be lost. A fold that resolves two
// divergent names with `[...names].sort()[0]` is CONVERGENT, relabel-invariant and
// clock-free — it passes every net in the invariance suite and every plain-convergence test
// ever written. It is nonetheless a direct `01-F31` violation ("a fold never picks a winner")
// and an `01-F20` LWW-without-a-spec-change. §3 below is the only thing in this package that
// kills it, and it kills it three ways: `name` must be `null`, BOTH names must be retained,
// and the anomaly must be raised.

import { describe, expect, it } from "vitest";
import { identity } from "./builders.js";
import {
  ADDRESS_1,
  ADDRESS_1_DUP_TEXT,
  ADDRESS_2,
  addressAdded,
  addressesOf,
  addressIdsOf,
  customerCreated,
  customerEmitter,
  customerFile,
  customerFileScenario,
  exceptionsOf,
  NAME_A,
  NAME_B,
  NAME_DIVERGENCE,
  NAME_URDU,
  namesOf,
  PHONE_A,
  PHONE_B,
  PHONE_C,
  projectionBytes,
  row,
  someOrder,
} from "./customer-file-builders.js";
import { shuffled } from "./merge-builders.js";

/** Two devices on one branch, partitioned: nothing but the emitted set connects them. */
const twoDevices = () => {
  const base = identity();
  return { alfa: customerEmitter(base, "alfa"), bravo: customerEmitter(base, "bravo") };
};

// ===========================================================================
// §1 — 01-F23: the identity is the NUMBER. One row per normalized phone, never per event.
// ===========================================================================

describe("§1 01-F23 — one customer identity per org, keyed by the normalized phone", () => {
  it("01-F23: two devices creating the same number while partitioned converge to ONE row", () => {
    const { alfa, bravo } = twoDevices();
    alfa.emit(customerCreated(PHONE_A, NAME_A));
    bravo.emit(customerCreated(PHONE_A, NAME_A));

    const proj = customerFile().projectAll([...alfa.envelopes, ...bravo.envelopes]);

    expect(proj.customers).toHaveLength(1);
    expect(row(proj, PHONE_A).phone_e164).toBe(PHONE_A);
  });

  it("01-F23: two DIFFERENT numbers are two identities — the key is not collapsing everything", () => {
    const { alfa } = twoDevices();
    alfa.emit(customerCreated(PHONE_A, NAME_A));
    alfa.emit(customerCreated(PHONE_B, NAME_A));

    const proj = customerFile().projectAll(alfa.envelopes);

    expect(proj.customers.map((r) => r.phone_e164)).toEqual([PHONE_A, PHONE_B].sort());
  });

  it("FOLDS.md line 7: re-delivering the identical envelope changes nothing (idempotent)", () => {
    const { alfa } = twoDevices();
    const env = alfa.emit(customerCreated(PHONE_A, NAME_A));
    const fold = customerFile();

    const once = projectionBytes(fold.projectAll([env]));
    const twice = projectionBytes(fold.projectAll([env, env, env]));

    expect(twice).toBe(once);
  });

  it("26 §7: an event another fold owns is ignored — no phantom customer row", () => {
    const { alfa } = twoDevices();
    alfa.emit(someOrder("ord-1"));

    expect(customerFile().projectAll(alfa.envelopes).customers).toEqual([]);
  });
});

// ===========================================================================
// §2 — 06-F11: the name attaches later, and ABSENCE IS NOT A COMPETING VALUE.
// ===========================================================================

describe("§2 06-F11 — a first-sight create carries no name, and the typed one wins outright", () => {
  it("06-F11: one stated name projects that name, with no divergence", () => {
    const { alfa } = twoDevices();
    alfa.emit(customerCreated(PHONE_A, NAME_A));

    const r = row(customerFile().projectAll(alfa.envelopes), PHONE_A);

    expect(r.name).toBe(NAME_A);
    expect(namesOf(r)).toEqual([NAME_A]);
    expect(exceptionsOf(r)).toEqual([]);
  });

  it("06-F11: a create with NO name states nothing — the row exists and `name` is null", () => {
    const { alfa } = twoDevices();
    alfa.emit(customerCreated(PHONE_A, null));

    const r = row(customerFile().projectAll(alfa.envelopes), PHONE_A);

    expect(r.name).toBeNull();
    expect(namesOf(r)).toEqual([]);
    expect(exceptionsOf(r)).toEqual([]);
  });

  /**
   * THE ASSERTION THAT CATCHES "null is a member". A storefront checkout (`06-F11`) creates on
   * first sight with no name; the counter (`02-F27`) later types one. If the fold treated the
   * null as a competing value, the name a human typed would be ERASED into a contested null —
   * a loss `01-F20`'s append-and-merge forbids, and the exact confusion `01-F60`'s
   * absence-is-not-nothing doctrine exists to prevent. Delivered in BOTH orders so the claim
   * cannot rest on which arrived first.
   */
  it.each([
    ["the unnamed create first", true],
    ["the named create first", false],
  ])("06-F11/01-F60: %s — a null name never competes with a stated one", (_what, nullFirst) => {
    const { alfa, bravo } = twoDevices();
    const unnamed = bravo.emit(customerCreated(PHONE_B, null));
    const named = alfa.emit(customerCreated(PHONE_B, NAME_URDU));

    const r = row(
      customerFile().projectAll(nullFirst ? [unnamed, named] : [named, unnamed]),
      PHONE_B,
    );

    expect(r.name).toBe(NAME_URDU);
    expect(namesOf(r)).toEqual([NAME_URDU]);
    expect(exceptionsOf(r)).toEqual([]);
  });

  it("00 §5.6: a Unicode name survives the fold byte-identically", () => {
    const { alfa } = twoDevices();
    alfa.emit(customerCreated(PHONE_A, NAME_URDU));

    expect(row(customerFile().projectAll(alfa.envelopes), PHONE_A).name).toBe(NAME_URDU);
  });

  it("01-F23: two creates AGREEING on the name are one member, not a divergence", () => {
    const { alfa, bravo } = twoDevices();
    alfa.emit(customerCreated(PHONE_C, NAME_A));
    bravo.emit(customerCreated(PHONE_C, NAME_A));

    const r = row(customerFile().projectAll([...alfa.envelopes, ...bravo.envelopes]), PHONE_C);

    expect(r.name).toBe(NAME_A);
    expect(namesOf(r)).toEqual([NAME_A]);
    expect(exceptionsOf(r)).toEqual([]);
  });
});

// ===========================================================================
// §3 — 01-F31 / 01-F20: THE PARTITION CASE. The fold does not pick a winner.
// ===========================================================================

describe("§3 01-F31/01-F20 — two devices, two names, one number: nothing is arbitrated", () => {
  const divergent = () => {
    const { alfa, bravo } = twoDevices();
    alfa.emit(customerCreated(PHONE_A, NAME_A));
    bravo.emit(customerCreated(PHONE_A, NAME_B));
    return row(customerFile().projectAll([...alfa.envelopes, ...bravo.envelopes]), PHONE_A);
  };

  /**
   * Kills `sort()[0]`, `sort().at(-1)`, first-delivered, last-delivered, min-id, max-id,
   * min-clock and max-clock in one assertion — every one of them projects a STRING here.
   */
  it("01-F31: `name` is null — a fold never picks a winner", () => {
    expect(divergent().name).toBeNull();
  });

  /**
   * Kills "collapse to null and forget". `01-F31`: disagreeing members "are ALL RETAINED".
   * `DEC-CUST-001` (proposed) will decide who resolves this and where; whoever they are needs
   * both candidate names to be still in the projection when they arrive.
   */
  it("01-F31/DEC-CUST-001: BOTH stated names are retained, sorted, for the resolver to read", () => {
    expect(namesOf(divergent())).toEqual([NAME_A, NAME_B].sort());
  });

  /** Kills "diverge silently". `01-F58`'s worked precedent: the disagreement is FLAGGED. */
  it("01-F31/01-F58: the disagreement raises `customer_name_divergence`", () => {
    expect(exceptionsOf(divergent())).toContain(NAME_DIVERGENCE);
  });

  /**
   * The single-variable control for the three assertions above. Identical set, identical
   * devices, identical delivery — ONE payload byte differs (`NAME_B` becomes `NAME_A`). If
   * this row is also contested, §3 is asserting something other than divergence.
   */
  it("attribution control: the same set AGREEING on the name is clean — divergence is the variable", () => {
    const { alfa, bravo } = twoDevices();
    alfa.emit(customerCreated(PHONE_A, NAME_A));
    bravo.emit(customerCreated(PHONE_A, NAME_A));

    const r = row(customerFile().projectAll([...alfa.envelopes, ...bravo.envelopes]), PHONE_A);

    expect(r.name).toBe(NAME_A);
    expect(exceptionsOf(r)).not.toContain(NAME_DIVERGENCE);
  });

  it("01-F17: a contested NAME never hides the customer — the row and its addresses stand", () => {
    const { alfa, bravo } = twoDevices();
    alfa.emit(customerCreated(PHONE_A, NAME_A));
    bravo.emit(customerCreated(PHONE_A, NAME_B));
    alfa.emit(addressAdded(PHONE_A, ADDRESS_1));

    const r = row(customerFile().projectAll([...alfa.envelopes, ...bravo.envelopes]), PHONE_A);

    expect(r.name).toBeNull();
    expect(addressIdsOf(r)).toEqual([ADDRESS_1.address_id]);
  });
});

// ===========================================================================
// §4 — 06-F9 / 01-F19: saved addresses are a grow-only union. Nothing is auto-discarded.
// ===========================================================================

describe("§4 06-F9/01-F19 — saved addresses union, and an address never disappears", () => {
  it("06-F9: two devices adding two addresses to one number produce BOTH, sorted by address_id", () => {
    const { alfa, bravo } = twoDevices();
    alfa.emit(customerCreated(PHONE_A, NAME_A));
    bravo.emit(addressAdded(PHONE_A, ADDRESS_2));
    alfa.emit(addressAdded(PHONE_A, ADDRESS_1));

    const r = row(customerFile().projectAll([...alfa.envelopes, ...bravo.envelopes]), PHONE_A);

    expect(addressesOf(r)).toEqual([ADDRESS_1, ADDRESS_2]);
  });

  /**
   * `01-F19`'s rule in the address domain: two saved addresses whose TEXT happens to match are
   * two entries, because they were minted as two. A content-keyed set would silently discard
   * one — and no FR asks for content dedupe, so doing it is inventing a policy (commandment 2)
   * on top of losing a row.
   */
  it("01-F19: two minted ids carrying the SAME text are two entries — nothing is auto-discarded", () => {
    const { alfa, bravo } = twoDevices();
    alfa.emit(addressAdded(PHONE_A, ADDRESS_1));
    bravo.emit(addressAdded(PHONE_A, ADDRESS_1_DUP_TEXT));

    const r = row(customerFile().projectAll([...alfa.envelopes, ...bravo.envelopes]), PHONE_A);

    expect(addressIdsOf(r)).toEqual([ADDRESS_1.address_id, ADDRESS_1_DUP_TEXT.address_id]);
  });

  /**
   * `26 §8`: one intent may legitimately exist under two envelope ids. Two devices re-emitting
   * ONE saved address must not fragment it into two rows in the customer's address list — the
   * ratified reason business keys are minted rather than read off the envelope.
   */
  it("26 §8: one address_id emitted by two devices is ONE entry, not two", () => {
    const { alfa, bravo } = twoDevices();
    alfa.emit(addressAdded(PHONE_A, ADDRESS_1));
    bravo.emit(addressAdded(PHONE_A, ADDRESS_1));

    const r = row(customerFile().projectAll([...alfa.envelopes, ...bravo.envelopes]), PHONE_A);

    expect(addressesOf(r)).toEqual([ADDRESS_1]);
  });

  /**
   * `01-F10` (amended): an event carrying its FULL projection key never parks. The address
   * carries `phone_e164` — `26 §4`'s one-field fix — so it is foldable the instant it lands,
   * with or without its create, and cannot be dropped for want of a parent.
   */
  it("01-F10/26 §4: an address arriving BEFORE its create is kept, and the create adds the name", () => {
    const { alfa, bravo } = twoDevices();
    const address = bravo.emit(addressAdded(PHONE_A, ADDRESS_1));
    const create = alfa.emit(customerCreated(PHONE_A, NAME_A));

    const r = row(customerFile().projectAll([address, create]), PHONE_A);

    expect(addressIdsOf(r)).toEqual([ADDRESS_1.address_id]);
    expect(r.name).toBe(NAME_A);
  });

  it("01-F10: an address for a number with NO create anywhere still yields a readable row", () => {
    const { alfa } = twoDevices();
    alfa.emit(addressAdded(PHONE_C, ADDRESS_2));

    const r = row(customerFile().projectAll(alfa.envelopes), PHONE_C);

    expect(addressIdsOf(r)).toEqual([ADDRESS_2.address_id]);
    expect(r.name).toBeNull();
  });

  it("06-F9: doc 06's later fields ride the payload without disturbing the projected entry", () => {
    const { alfa } = twoDevices();
    alfa.emit(addressAdded(PHONE_A, ADDRESS_1, { area: "Gulberg III" }));

    expect(addressesOf(row(customerFile().projectAll(alfa.envelopes), PHONE_A))).toEqual([
      ADDRESS_1,
    ]);
  });

  /**
   * ⚠ ADDED BY THE MUTATION PASS (2026-08-11) — the only assertion in this package that fails
   * the mutant it was written for, and the only one whose author had read the implementation.
   *
   * MEASURED: a fold that buckets addresses by `address_text` instead of by the minted
   * `address_id` — retaining every id, so `01-F19` is untouched, and set-determined, so all
   * three `01-F34` nets and every shuffle stay green — passed **628 of 628** tests in this
   * package. The two `§4` fixtures above cannot see it, because their ids happen to sort in the
   * same order as their texts. This one cannot be fooled that way: `adr-0001` and `adr-0003`
   * share a text that sorts BEFORE `adr-0002`'s, so id-order is `[1, 2, 3]` and text-order is
   * `[1, 3, 2]`. The dangerous cousin — sorting by text with NO tiebreak — was already caught,
   * by `§5`'s shuffle, because a tie on text falls back to delivery order; what nothing caught
   * was the version that is convergent and merely keyed on the wrong field.
   *
   * WHAT THIS PINS, precisely. No FR orders a customer's saved addresses, and this does not
   * invent one (commandment 2). What it pins is the fold's OWN DECLARED merge key — the rule
   * `01-F34` requires a fold to declare, written at the head of `./customer-file-builders.ts`
   * as *"keyed by the payload's minted `address_id`, projected sorted by that key"*, and chosen
   * on `26 §8`'s ratified ground that a business key is minted rather than read off an
   * envelope. A declared rule that no assertion holds to is the drift this repo keeps
   * recording; this is the assertion.
   */
  it("01-F34/26 §8: the address list is keyed and ordered by the MINTED address_id, not by its text", () => {
    const compareText = (x: { address_text: string }, y: { address_text: string }): number => {
      if (x.address_text < y.address_text) return -1;
      if (x.address_text > y.address_text) return 1;
      return 0;
    };
    const inIdOrder = [ADDRESS_1, ADDRESS_2, ADDRESS_1_DUP_TEXT];
    // Anti-vacuity, in `§0b`'s habit: on a fixture whose two candidate orders agree, the
    // assertion below holds for a fold keyed on either field and therefore asserts nothing.
    expect(
      [...inIdOrder].sort(compareText).map((a) => a.address_id),
      "the fixture must distinguish id-order from text-order or this test is vacuous",
    ).not.toEqual(inIdOrder.map((a) => a.address_id));

    const { alfa, bravo } = twoDevices();
    alfa.emit(addressAdded(PHONE_A, ADDRESS_1));
    bravo.emit(addressAdded(PHONE_A, ADDRESS_2));
    bravo.emit(addressAdded(PHONE_A, ADDRESS_1_DUP_TEXT));

    const r = row(customerFile().projectAll([...alfa.envelopes, ...bravo.envelopes]), PHONE_A);

    expect(addressesOf(r)).toEqual(inIdOrder);
  });
});

// ===========================================================================
// §5 — FOLDS.md line 7: commutative over the delivered SET, on the whole directed scenario.
// This is the WEAKEST net in the package and is labelled as such: a min-id tiebreak passes it.
// It is here because it is the one that catches an unsorted or insertion-ordered projection.
// ===========================================================================

describe("§5 FOLDS.md line 7 — the projection is a function of the SET, not of the order", () => {
  it("01-F34: eight shuffled deliveries of the directed scenario are byte-identical", () => {
    const { envelopes } = customerFileScenario();
    const fold = customerFile();
    const expected = projectionBytes(fold.projectAll(envelopes));

    for (let seed = 1; seed <= 8; seed++) {
      expect(projectionBytes(fold.projectAll(shuffled(envelopes, seed))), `seed ${seed}`).toBe(
        expected,
      );
    }
  });

  it("FOLDS.md line 7: folding the set TWICE over is byte-identical to folding it once", () => {
    const { envelopes } = customerFileScenario();
    const fold = customerFile();

    expect(projectionBytes(fold.projectAll([...envelopes, ...envelopes]))).toBe(
      projectionBytes(fold.projectAll(envelopes)),
    );
  });
});
