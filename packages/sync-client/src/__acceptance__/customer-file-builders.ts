// Oracle builders — the `customer_file` device fold (`02-F27`'s lookup by normalized phone,
// `02-F28`'s ≤30 s from NUMBER ENTRY).
//
// AUTHORED FROM SPEC TEXT ONLY (`24 §3` step 2 — read-only to the implementing session):
//   `specs/01-kernel-sync.md`  — `01-F23` (ONE identity per org, KEYED BY normalized E.164
//                                phone; channels attach names/addresses; merging two
//                                identities is an event), `01-F24` (org-scoped absolutely),
//                                `01-F10` (an event carrying its full projection keys never
//                                parks), `01-F19` (both stand on merge; nothing is
//                                auto-discarded), `01-F20` (a conflict class NOT in the closed
//                                list must be designed APPEND-AND-MERGE before a module may
//                                emit the type; new LWW entities need a spec change),
//                                `01-F31` (a fold NEVER picks a winner: disagreeing members
//                                are all retained, contribute nothing, and raise an anomaly),
//                                `01-F34` (folds read NO ordering metadata), `01-F58` (the
//                                worked precedent for a contested projection one fold over)
//   `specs/02-pos-app.md`      — `02-F27`, `02-F28`
//   `specs/06-storefront.md`   — `06-F9` (saved addresses), `06-F11` (create on first sight,
//                                name attaches later)
//   `specs/26-merge-semantics.md` — `§3` (the per-field merge-rule table), `§4` (the
//                                late-resolving-entity trap and its one-field fix), `§8`
//                                (why plain convergence is not enough)
//   `packages/sync-client/FOLDS.md` line 7 (every fold is a pure `(state, envelope) → state`,
//                                commutative and idempotent).
//
// ─────────────────────────────────────────────────────────────────────────────────────────
// THE MERGE-RULE QUESTION, ANSWERED FROM THE FRs. Two devices create a customer for the same
// number while partitioned — what does the fold do?
//
//  (a) ONE ROW, and this is not a choice. `01-F23` keys the identity BY THE NORMALIZED PHONE,
//      so two creates carrying one number ARE one identity by the FR's own definition. Keying
//      the row by anything else (a minted id, the create's envelope id) contradicts `01-F23`
//      directly. The key is a payload VALUE, so grouping by it reads no ordering metadata.
//  (b) THE NAME IS NOT ARBITRATED. `01-F20` is the clause that decides this and it is easy to
//      miss: a customer-name conflict is NOT in `01-F16`..`01-F19`'s closed list, so it "must
//      be designed as append-and-merge before a module may emit the event type", and "new LWW
//      entities require a spec change here". Last-writer-wins is therefore ILLEGAL today
//      without a doc-01 spec PR — which forecloses the answer a reader reaches for first.
//      What remains is `01-F31`'s ratified disposition: disagreeing members "are all retained,
//      contribute zero, raise an anomaly; a fold never picks a winner". `01-F58` already
//      applied that verbatim outside the payment domain, and `folds/shift-cash.ts` ships it
//      for `cashier` / `prev_shift_id` / the opening float.
//  (c) SO `DEC-CUST-001` IS NOT A BLOCKER FOR THE FOLD — and that is a claim, so here is the
//      reasoning. It is `proposed`, and a leaf module must not implement against a proposed
//      decision. Its scope is `01 §9.3`: *"who resolves name/address conflicts and where"* —
//      the WHO and the WHERE, a surface question, and `01 §9.3` states in the same breath that
//      **"kernel handles the merge"**. Every answer it could take (the POS resolves it, the
//      back office resolves it, a manager console resolves it) is compatible with a fold that
//      RETAINS BOTH names and refuses to choose; no answer it could take is compatible with a
//      fold that has already chosen, because a resolution surface cannot un-pick a winner an
//      append-only projection already committed to. The fold that does not decide is the only
//      one `DEC-CUST-001` cannot invalidate.
//      **What DOES wait on it: `customer.merged`.** `01-F23`'s "merging two identities is an
//      event" is the act that decision governs, it has no payload schema in this task, and no
//      fixture here emits one.
// ─────────────────────────────────────────────────────────────────────────────────────────
//
// THE DECLARED MERGE RULE, PER PROJECTED FIELD (`01-F34` requires them declared):
//
//   row existence      G-Set over the phone keys touched by any delivered customer event.
//                      `01-F23` — the key is the normalized phone, never a minted id.
//   name               MVR over the STATED names carried by that key's `customer.created`
//                      members. Exactly one distinct stated name ⇒ carried. Two or more ⇒ the
//                      fold does not pick (`01-F31`): `name` projects `null`, every stated
//                      name is RETAINED in `names_json`, and `customer_name_divergence` is
//                      raised. A `name: null` create is NOT a member — `06-F11` creates on
//                      first sight from a checkout that captured no name, and treating that
//                      absence as a competing value would let a storefront checkout ERASE a
//                      name typed at the counter, which is a loss `01-F20`'s append-and-merge
//                      forbids and `01-F60`'s absence-is-not-nothing doctrine names directly.
//   addresses          G-Map union keyed by the payload's minted `address_id`, projected
//                      sorted by that key. Grow-only: an address never disappears (`01-F19`
//                      "nothing is auto-discarded"; a vanished address is a delivery that
//                      cannot be made). Keyed by the MINTED id and not the envelope id, on
//                      `26 §8`'s ratified ground that one intent may legitimately exist under
//                      two envelope ids.
//   exceptions         G-Set of anomaly codes, sorted (`folds/shift-cash.ts`'s convention).
//
// EXPLICITLY NOT DECIDED HERE, and named rather than left to look intentional:
//   * TWO `customer.address_added` UNDER ONE `address_id` WITH DIFFERENT TEXT. `01-F31`'s
//     disputed-member disposition is stated for MONEY attempt keys and `01-F20` does not
//     reach a case ids make unreachable in practice. No FR determines it, so no fixture here
//     produces it and no assertion here constrains it. Guessing would be commandment 2.
//   * ERASURE. These rows hold a phone number, a name and a street address. `DEC-DATA-001`
//     (crypto-shredding) is `proposed` and doc 22 owns erasure; nothing here designs one.
//   * CROSS-BRANCH VISIBILITY. `01-F24` shares the customer file across an org's branches
//     while `01-F9` gives a device its BRANCH stream; how a customer created at one branch
//     reaches another is `01 §9.3` and is untouched below. Every fixture here is one branch.

import * as foldEngine from "../fold-engine.js";
import { canonicalJson, type Identity, identity, must, peerEnvelope } from "./builders.js";
import { relabelEnvelope, reversingIdMap } from "./merge-builders.js";

// ---------------------------------------------------------------------------
// The projection contract.
// ---------------------------------------------------------------------------

export type CustomerRow = {
  /** `01-F23`'s key: the normalized E.164 number. */
  phone_e164: string;
  /** The agreed stated name; `null` when none was stated AND when stated names DISAGREE. */
  name: string | null;
  /** canonicalJson of every DISTINCT stated name, sorted. `01-F31` — all retained. */
  names_json: string;
  /** canonicalJson of `[{address_id, address_text}]`, sorted by `address_id`. */
  addresses_json: string;
  /** canonicalJson of the sorted anomaly codes. */
  exceptions_json: string;
};

/** Rows sorted by `phone_e164` — a sort on the KEY, which is a payload value, not metadata. */
export type CustomerFileProjection = { customers: CustomerRow[] };

/** Opaque — the fold's internal accumulator is an implementation choice (`18 §4`). */
export type CustomerFileState = { readonly __customer_file_state: unique symbol };

export type CustomerFileFold = {
  empty: () => CustomerFileState;
  fold: (state: CustomerFileState, envelope: unknown) => CustomerFileState;
  project: (state: CustomerFileState) => CustomerFileProjection;
  foldAll: (envelopes: readonly unknown[]) => CustomerFileState;
  projectAll: (envelopes: readonly unknown[]) => CustomerFileProjection;
};

type MaybeModule = Partial<{
  emptyCustomerFile: () => CustomerFileState;
  foldCustomerFile: (state: CustomerFileState, envelope: unknown) => CustomerFileState;
  projectCustomerFile: (state: CustomerFileState) => CustomerFileProjection;
}>;

const RED =
  "customer_file red-awaiting-implementation: `@restos/sync-client/fold-engine` must export " +
  "`%s` (the pure customer_file fold — 01-F23, FOLDS.md line 7). Implement it in " +
  "src/folds/customer-file.ts and re-export it from src/fold-engine.ts.";

/**
 * The fold under test, resolved through a NAMESPACE import so a not-yet-written export is a
 * loud per-test failure naming the missing symbol, rather than a module-level link error that
 * collapses the whole file into one uninformative red.
 */
export const customerFile = (): CustomerFileFold => {
  const mod = foldEngine as unknown as MaybeModule;
  const pick = <K extends keyof MaybeModule>(name: K): NonNullable<MaybeModule[K]> => {
    const fn = mod[name];
    if (typeof fn !== "function") throw new Error(RED.replace("%s", name));
    return fn as NonNullable<MaybeModule[K]>;
  };
  const empty = pick("emptyCustomerFile");
  const fold = pick("foldCustomerFile");
  const project = pick("projectCustomerFile");
  const foldAll = (envelopes: readonly unknown[]): CustomerFileState => {
    let state = empty();
    for (const env of envelopes) state = fold(state, env);
    return state;
  };
  return { empty, fold, project, foldAll, projectAll: (e) => project(foldAll(e)) };
};

// ---------------------------------------------------------------------------
// Fixtures. Numbers are E.164 (`01-F23`); the whole file uses ONE branch (`01 §9.3` is open).
// ---------------------------------------------------------------------------

export const PHONE_A = "+923001234567";
export const PHONE_B = "+923339876543";
export const PHONE_C = "+924235000000";
/** Reserved for the ORPHAN-ADDRESS case: no fixture may ever emit a create for this number. */
export const PHONE_D = "+923215550101";

/** The two names two partitioned devices type for ONE number — the dangerous case. */
export const NAME_A = "Ayesha Khan";
export const NAME_B = "A. Khan (office)";

/** `00 §5.6`: user content is Unicode. Carried in the main set so no net runs ASCII-only. */
export const NAME_URDU = "عائشہ خان";

export const ADDRESS_1 = { address_id: "adr-0001", address_text: "House 12, Street 5, Gulberg" };
export const ADDRESS_2 = { address_id: "adr-0002", address_text: "Office 4, Kalma Chowk" };
/** Same TEXT as ADDRESS_1, different minted id — `01-F19`: both stand, nothing is discarded. */
export const ADDRESS_1_DUP_TEXT = { address_id: "adr-0003", address_text: ADDRESS_1.address_text };
/** The orphan-address fixture's own address, so no text is shared across two customers. */
export const ADDRESS_4 = { address_id: "adr-0004", address_text: "Flat 9B, Askari X, Lahore" };

export const customerCreated = (phone_e164: string, name: string | null) => ({
  type: "customer.created",
  payload: { phone_e164, name },
});

export const addressAdded = (
  phone_e164: string,
  address: { address_id: string; address_text: string },
  extra: Record<string, unknown> = {},
) => ({
  type: "customer.address_added",
  payload: { phone_e164, ...address, ...extra },
});

/** An ORDER event, so every net proves the fold ignores what another fold owns. */
export const someOrder = (order_id: string) => ({
  type: "order.created",
  payload: { order_id, channel: "phone" },
});

/** The branch's shared instant at fixture start. 2025-07-18T02:13:20Z. */
export const BRANCH_T0 = 1_752_800_000_000;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Every fixture's device clock is YEARS from its branch stamp and moves in the OPPOSITE
 * direction, so a fold reading `device_created_at` produces a visibly wrong answer rather
 * than an accidentally right one (`01-F45`).
 */
export const customerEnvelope = (
  peer: Identity,
  lamport_seq: number,
  typed: { type: string; payload: Record<string, unknown> },
  opts: { branch_at?: number; id?: string; actor_user_id?: string | null } = {},
): Record<string, unknown> & { id: string } => {
  const branch_at = opts.branch_at ?? BRANCH_T0;
  const delta = branch_at - BRANCH_T0;
  const env = peerEnvelope(peer, lamport_seq, {
    branch_created_at: branch_at,
    device_created_at: BRANCH_T0 + 4 * YEAR_MS - delta * 2,
    time_basis: "branch",
    ...(opts.id === undefined ? {} : { id: opts.id }),
    ...(opts.actor_user_id === undefined ? {} : { actor_user_id: opts.actor_user_id }),
    ...typed,
  });
  return env as Record<string, unknown> & { id: string };
};

// ---------------------------------------------------------------------------
// Projection helpers.
// ---------------------------------------------------------------------------

export const projectionBytes = (proj: CustomerFileProjection): string => canonicalJson(proj);

export const row = (proj: CustomerFileProjection, phone_e164: string): CustomerRow =>
  must(
    proj.customers.find((r) => r.phone_e164 === phone_e164),
    `customer row ${phone_e164}`,
  );

export const namesOf = (r: CustomerRow): string[] => JSON.parse(r.names_json) as string[];

export const addressesOf = (r: CustomerRow): { address_id: string; address_text: string }[] =>
  JSON.parse(r.addresses_json) as { address_id: string; address_text: string }[];

export const addressIdsOf = (r: CustomerRow): string[] => addressesOf(r).map((a) => a.address_id);

export const exceptionsOf = (r: CustomerRow): string[] => JSON.parse(r.exceptions_json) as string[];

/** `01-F31`'s anomaly for two devices naming one number differently. */
export const NAME_DIVERGENCE = "customer_name_divergence";

// ---------------------------------------------------------------------------
// 01-F34 adversaries. Same four banned fields as the shift_cash oracle — the law is one law.
// ---------------------------------------------------------------------------

export const BANNED_METADATA = [
  "global_seq",
  "lamport_seq",
  "device_created_at",
  "server_received_at",
] as const;

const isBanned = (prop: string | symbol): prop is string =>
  typeof prop === "string" && (BANNED_METADATA as readonly string[]).includes(prop);

/**
 * `26 §8`'s dynamic enforcement: an envelope that THROWS the moment the fold reads a piece of
 * ordering metadata, naming the field at the moment of the read instead of inferring it from a
 * diff. The banned keys are hidden from `ownKeys`/`getOwnPropertyDescriptor` on purpose, so an
 * ordinary spread does not trip the wire — copying an envelope is not reading a value out of
 * it; a fold that copies first and reads from the copy gets `undefined` and diverges under the
 * INJECTION net instead. Both nets are set.
 */
export const poisoned = <T extends Record<string, unknown>>(env: T): T =>
  new Proxy(env, {
    get(target, prop, receiver) {
      if (isBanned(prop))
        throw new Error(
          `01-F34 violation: the customer_file fold read ordering metadata \`${String(prop)}\``,
        );
      return Reflect.get(target, prop, receiver);
    },
    has(target, prop) {
      if (isBanned(prop)) return false;
      return Reflect.has(target, prop);
    },
    ownKeys(target) {
      return Reflect.ownKeys(target).filter((k) => !isBanned(k));
    },
    getOwnPropertyDescriptor(target, prop) {
      if (isBanned(prop)) return undefined;
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
  }) as T;

/** Same ids, payloads, devices and BRANCH stamps — only the banned fields move. */
export const injectGarbageMetadata = <T extends Record<string, unknown>>(
  envelopes: readonly T[],
): T[] =>
  envelopes.map((env, i) => ({
    ...env,
    device_created_at: BRANCH_T0 - (i + 1) * 9_999_991 - 3 * YEAR_MS,
    lamport_seq: 100_000 + (envelopes.length - i) * 7,
    global_seq: 900_000 - i * 13,
    server_received_at: BRANCH_T0 + (envelopes.length - i) * 1_234_567,
  }));

/**
 * Move every BRANCH stamp — the one clock a fold IS allowed to read (`01-F43`). This fold
 * projects no time at all, so unlike the `shift_cash` oracle this is NOT an anti-vacuity twin
 * here: it must leave the projection UNCHANGED, and the anti-vacuity twin is `§1c`'s payload
 * sensitivity instead. Kept because "reads no clock" is a claim worth an assertion.
 */
export const shiftBranchStamps = <T extends Record<string, unknown>>(
  envelopes: readonly T[],
  delta_ms: number,
): T[] =>
  envelopes.map((env) => ({
    ...env,
    branch_created_at: (env.branch_created_at as number) + delta_ms,
  }));

/**
 * `26 §8`'s binding lesson as one call: an ORDER-REVERSING bijection over the set's envelope
 * ids, returned with its own proof of non-vacuity. `reversing` is true only when φ genuinely
 * inverts the id order (so a min-id OR max-id tiebreak must change its answer) and `bijective`
 * only when no two ids collapsed. A test that skips those two flags asserts against a possible
 * identity map — the round-2 §C "guard passed by not looking" shape.
 */
export const reversedIds = <T extends Record<string, unknown> & { id: string }>(
  envelopes: readonly T[],
): {
  envelopes: T[];
  map: ReadonlyMap<string, string>;
  reversing: boolean;
  bijective: boolean;
} => {
  const ids = envelopes.map((e) => e.id);
  const map = reversingIdMap(ids);
  const images = [...ids].sort().map((id) => must(map.get(id), "relabel image"));
  return {
    envelopes: envelopes.map((env) => relabelEnvelope(env, map) as T),
    map,
    reversing:
      images.length > 1 && canonicalJson(images) === canonicalJson([...images].sort().reverse()),
    bijective: new Set(images).size === images.length,
  };
};

// ---------------------------------------------------------------------------
// The directed scenario — every merge rule this fold owns, in ONE set, so the three
// invariance nets in customer-file-invariance.test.ts run over all of them at once.
//
// ⚠ THE ROUND-3 LAW. Technique is not coverage: a correct net over a safe fixture proves
// nothing. `§0b` of the invariance suite ASSERTS the shapes below are present rather than
// leaving that to a reader of this file, because the fixture is the real coverage boundary.
// ---------------------------------------------------------------------------

export type CustomerFileSet = {
  envelopes: (Record<string, unknown> & { id: string })[];
};

export type CustomerEmitter = CustomerFileSet & {
  peer: Identity;
  emit: (
    typed: { type: string; payload: Record<string, unknown> },
    opts?: { branch_at?: number; id?: string },
  ) => Record<string, unknown> & { id: string };
};

/** One device authoring into the shared branch. `tag` seeds the ids so a relabel is visible. */
export const customerEmitter = (base: Identity, tag: string): CustomerEmitter => {
  const peer = { ...base, device_id: `dev-${tag}` };
  const envelopes: (Record<string, unknown> & { id: string })[] = [];
  let lamport = 0;
  return {
    peer,
    envelopes,
    emit(typed, opts = {}) {
      lamport += 1;
      const env = customerEnvelope(peer, lamport, typed, {
        id: `${tag}-${String(lamport).padStart(3, "0")}`,
        ...opts,
      });
      envelopes.push(env);
      return env;
    },
  };
};

/**
 * THE DIRECTED SET. Two devices, one branch, one partition. Every shape the fold has a branch
 * for is here — and the two that matter most are:
 *
 *   * `PHONE_A` gets TWO creates carrying DIFFERENT names, one from each device. This is the
 *     only field in the whole projection on which a `min(envelope.id)` or min-clock tiebreak is
 *     OBSERVABLE, so it is what makes the relabel and injection nets non-vacuous. A set without
 *     it would let all three nets pass over a fold that arbitrates by wall clock.
 *   * `PHONE_B` gets a `name: null` create ALONGSIDE a named one, so an implementation that
 *     treats absence as a competing value is caught rather than blessed.
 */
export const customerFileScenario = (): CustomerFileSet => {
  const base = identity();
  const alfa = customerEmitter(base, "alfa");
  const bravo = customerEmitter(base, "bravo");

  // PHONE_A — the partition. Two devices, two names, one number (01-F23 ⇒ one row).
  alfa.emit(customerCreated(PHONE_A, NAME_A));
  bravo.emit(customerCreated(PHONE_A, NAME_B));
  // …and two different saved addresses, one per device (06-F9 ⇒ union, both stand).
  alfa.emit(addressAdded(PHONE_A, ADDRESS_1));
  bravo.emit(addressAdded(PHONE_A, ADDRESS_2));
  // A third address whose TEXT duplicates ADDRESS_1 under a different minted id (01-F19).
  bravo.emit(addressAdded(PHONE_A, ADDRESS_1_DUP_TEXT));

  // PHONE_B — 06-F11's first sight with no name, then the counter types one. The named
  // member must WIN OUTRIGHT, not by arbitration: `null` is not a member at all.
  bravo.emit(customerCreated(PHONE_B, null));
  alfa.emit(customerCreated(PHONE_B, NAME_URDU));

  // PHONE_D — an address arrives with NO create anywhere in the set. 01-F10: the event
  // carries its full projection key, so it never parks and the address is never lost.
  alfa.emit(addressAdded(PHONE_D, ADDRESS_4));

  // PHONE_C — two creates agreeing byte-for-byte: idempotent, and NOT a divergence. This is
  // the single-variable CONTROL for the divergence on PHONE_A: same shape, one payload byte.
  alfa.emit(customerCreated(PHONE_C, NAME_A));
  bravo.emit(customerCreated(PHONE_C, NAME_A));

  // Another fold's event in the same delivery — the customer fold must ignore it entirely.
  alfa.emit(someOrder("ord-9001"));

  return { envelopes: [...alfa.envelopes, ...bravo.envelopes] };
};
