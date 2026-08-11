// The `customer_file` fold (`02-F27`'s lookup by normalized phone, `02-F28`'s ≤30 s from NUMBER
// ENTRY) — the seventh device fold, and the first one `FOLDS.md`'s v1 registry never listed.
//
// A pure function of the delivered event SET, exactly as `folds/merge.ts` and `folds/shift-cash.ts`
// are, and it lives beside them under the `@restos/sync-client/fold-engine` subpath for the same
// reason: the cloud Auditor refolds without loading the better-sqlite3 addon (`01-F7`, `20 §4.2`),
// and a fold it cannot refold is unauditable.
//
// ── WHY A SEVENTH FOLD IS BUILDABLE TODAY, AND `01-F20` IS THE CLAUSE THAT DECIDES IT ────────
// The question this fold exists to answer: two devices create a customer for one phone number
// while partitioned. What does the projection say?
//
//  (a) ONE ROW, and that is not a choice. `01-F23` keys the identity BY THE NORMALIZED PHONE, so
//      two creates carrying one number ARE one identity by the FR's own definition. Keying the row
//      by anything else — a minted id, the create's envelope id — contradicts `01-F23` directly.
//      The key is a payload VALUE, so grouping by it reads no ordering metadata (`01-F34`).
//  (b) THE NAME IS NOT ARBITRATED. A customer-name conflict is NOT in `01-F16`..`01-F19`'s closed
//      list, so `01-F20` binds: such a class *"must be designed as append-and-merge before a module
//      may emit the event type"*, and *"new LWW entities require a spec change here"*. Last-writer-
//      wins is therefore ILLEGAL today without a doc-01 spec PR — which forecloses the answer a
//      reader reaches for first. What remains is `01-F31`'s ratified disposition: disagreeing
//      members *"are all retained, contribute zero, raise an anomaly; a fold never picks a winner"*.
//      `01-F58` already applies that verbatim outside the payment domain, and `folds/shift-cash.ts`
//      ships it for `cashier` / `prev_shift_id` / the opening float.
//  (c) SO `DEC-CUST-001` IS NOT A BLOCKER FOR THIS FOLD. It is `proposed`, and a leaf module must
//      not implement against a proposed decision — so the reasoning matters. Its scope is `01 §9.3`:
//      *"who resolves name/address conflicts and where"* — the WHO and the WHERE, a surface
//      question, stated in the same breath as *"kernel handles the merge"*. Every answer it can
//      take (the POS resolves it, the back office does, a manager console does) is compatible with
//      a fold that RETAINS BOTH names and refuses to choose; NO answer is compatible with a fold
//      that has already chosen, because a resolution surface cannot un-pick a winner an
//      append-only projection committed to. The fold that does not decide is the only one
//      `DEC-CUST-001` cannot invalidate.
//      **What DOES wait on it: `customer.merged`.** `01-F23`'s *"merging two identities is an
//      event"* is the act that decision governs; it has no payload schema, so `01-F4` keeps it
//      unemittable, and nothing here anticipates its shape.
//
// ── THE MERGE RULES, PER PROJECTED FIELD (`01-F34` requires them declared) ────────────────────
//   row existence   G-Set over the phone keys touched by ANY delivered `customer.*` event —
//                   `01-F23`'s key, never a minted id. An address whose create has not arrived
//                   (or never will) still yields a readable row: the event carries its full
//                   projection key, so `01-F10` never parks it and no delivery address is lost.
//   name            MVR over the STATED names carried by that key's `customer.created` members.
//                   Exactly one distinct stated name ⇒ carried. Two or more ⇒ the fold does not
//                   pick (`01-F31`): `name` projects `null`, every stated name is RETAINED in
//                   `names_json`, and `customer_name_divergence` is raised for the resolver
//                   `DEC-CUST-001` will eventually name. A `name: null` create is NOT a member —
//                   `06-F11` creates on first sight from a checkout that captured no name, and
//                   treating that absence as a competing value would let a storefront checkout
//                   ERASE a name typed at the counter (`02-F27`), a loss `01-F20`'s
//                   append-and-merge forbids.
//   addresses       G-Map union keyed by the payload's MINTED `address_id` (`26 §8`: one intent may
//                   legitimately exist under two envelope ids, so an envelope-id-keyed set would
//                   fragment a re-emitted address), projected sorted by that key. Grow-only: an
//                   address never disappears — `01-F19`'s *"nothing is auto-discarded"*, and a
//                   vanished address is a delivery that cannot be made. Two DISTINCT ids carrying
//                   the same text are two entries, because they were minted as two; content
//                   de-duplication is a policy no FR asks for.
//   exceptions      G-Set of anomaly codes, sorted (`folds/shift-cash.ts`'s convention).
//
// ── THE ONE CASE NO FR DETERMINES, RECORDED RATHER THAN GUESSED ───────────────────────────────
// Two `customer.address_added` under ONE `address_id` carrying DIFFERENT text. `01-F31`'s
// disputed-member disposition is stated for money attempt keys and `01-F20` does not reach a case
// minted ids make unreachable in practice; the acceptance suite deliberately produces no fixture
// for it and constrains nothing. What is NOT open is that the projection must not depend on
// delivery order — standing law 1 binds whether or not a test looks. So each `address_id` holds a
// value-keyed member map (`folds/merge.ts` keys its own MVRs the same way) and BOTH texts are
// projected under that id: order-free, nothing discarded (`01-F19`), no winner picked (`01-F31`).
// That is `01-F20`'s append-and-merge default, not a disposition invented here — and deliberately
// no anomaly code, because naming one would be asserting a policy the corpus has not written.
import { canonicalJson } from "@restos/domain";

/** One saved address as the projection renders it (`06-F9` capture, `09-F10` the rider reads it). */
export type CustomerAddress = { address_id: string; address_text: string };

/** `01-F23`'s identity, keyed by the normalized E.164 number. */
export type CustomerRow = {
  phone_e164: string;
  /** The agreed stated name; `null` when none was stated AND when stated names DISAGREE. */
  name: string | null;
  /** canonicalJson of every DISTINCT stated name, sorted — `01-F31`, all retained. */
  names_json: string;
  /** canonicalJson of `[{address_id, address_text}]`, sorted by `address_id`. */
  addresses_json: string;
  /** canonicalJson of the sorted anomaly codes. */
  exceptions_json: string;
};

/** Rows sorted by `phone_e164` — a sort on the KEY, which is a payload value, not metadata. */
export type CustomerFileProjection = { customers: CustomerRow[] };

type Payload = Record<string, unknown>;

/**
 * Exactly the envelope fields this fold reads: TWO. `lamport_seq`, `global_seq`,
 * `device_created_at` and `server_received_at` are absent by design (`01-F34`), and `26 §8`'s
 * Proxy-poisoned envelopes throw the moment one of them is touched. `id` is absent too — unlike
 * `shift-cash.ts` this fold needs no per-envelope set key, because every member it holds is keyed
 * by a payload value (`01-F23`'s phone, `26 §8`'s minted `address_id`). `branch_created_at` is
 * absent because the customer file projects no time at all.
 */
type CustomerEvent = { type: string; payload: Payload };

type CustomerAcc = {
  /** Distinct STATED names — a null name states nothing and never enters (`06-F11`). */
  names: Set<string>;
  /** `address_id` → (canonical member bytes → entry). Value-keyed, per the note above. */
  addresses: Map<string, Map<string, CustomerAddress>>;
};

export type CustomerFileState = { customers: Map<string, CustomerAcc> };

export const emptyCustomerFile = (): CustomerFileState => ({ customers: new Map() });

/** `01-F31`'s anomaly for two devices naming one number differently. */
const NAME_DIVERGENCE = "customer_name_divergence";

const sub = <K, V>(m: Map<K, V>, k: K, mk: () => V): V => {
  const existing = m.get(k);
  if (existing !== undefined) return existing;
  const fresh = mk();
  m.set(k, fresh);
  return fresh;
};

const customerOf = (state: CustomerFileState, phone_e164: string): CustomerAcc =>
  sub(state.customers, phone_e164, () => ({ names: new Set<string>(), addresses: new Map() }));

/**
 * Fold one envelope. Types outside this fold's vocabulary change nothing — an order event
 * delivered in the same batch is never silently bucketed into a customer row.
 */
export const foldCustomerFile = (
  state: CustomerFileState,
  envelope: unknown,
): CustomerFileState => {
  const event = envelope as CustomerEvent;
  const payload = event.payload;
  switch (event.type) {
    case "customer.created": {
      const acc = customerOf(state, payload.phone_e164 as string);
      // `registry.ts` types `name` as required-and-nullable, so this discriminates a STATED name
      // from `06-F11`'s stated absence — the whole of the "null is not a member" rule.
      if (typeof payload.name === "string") acc.names.add(payload.name);
      return state;
    }
    case "customer.address_added": {
      const acc = customerOf(state, payload.phone_e164 as string);
      // Only the two declared fields reach the projection: `06-F9`'s later area/locality and map
      // pin ride the `looseObject` for doc 06 to project when it lands (`01-F52`'s discipline —
      // this fold renders what its own FRs name and nothing it happens to receive).
      const entry: CustomerAddress = {
        address_id: payload.address_id as string,
        address_text: payload.address_text as string,
      };
      sub(acc.addresses, entry.address_id, () => new Map<string, CustomerAddress>()).set(
        canonicalJson(entry),
        entry,
      );
      return state;
    }
    default:
      return state;
  }
};

/** One customer's row — a pure function of that key's delivered members. */
const rowOf = (phone_e164: string, acc: CustomerAcc): CustomerRow => {
  const exceptions = new Set<string>();
  // Sorted on the VALUES, which are payload content. `01-F31`: all members retained, and the
  // sort is a rendering of the set rather than a selection out of it — nothing here picks.
  const names = [...acc.names].sort();
  if (names.length > 1) exceptions.add(NAME_DIVERGENCE);

  const addresses: CustomerAddress[] = [];
  for (const address_id of [...acc.addresses.keys()].sort()) {
    const members = acc.addresses.get(address_id) as Map<string, CustomerAddress>;
    for (const bytes of [...members.keys()].sort()) {
      addresses.push(members.get(bytes) as CustomerAddress);
    }
  }

  return {
    phone_e164,
    // ONE stated name is the customer's name; none is `06-F11`'s first sight; two or more is
    // `01-F31`'s disputed key, which contributes nothing and is rendered as the contest it is.
    name: names.length === 1 ? (names[0] as string) : null,
    names_json: canonicalJson(names),
    addresses_json: canonicalJson(addresses),
    exceptions_json: canonicalJson([...exceptions].sort()),
  };
};

/**
 * Project the whole fold — pure and repeatable, a function of the delivered SET alone.
 *
 * Row ORDER is part of the projection: returning insertion order would make delivery order
 * observable (`01-F34`), so rows are sorted by `01-F23`'s key.
 */
export const projectCustomerFile = (state: CustomerFileState): CustomerFileProjection => ({
  customers: [...state.customers.keys()]
    .sort()
    .map((phone_e164) => rowOf(phone_e164, state.customers.get(phone_e164) as CustomerAcc)),
});
