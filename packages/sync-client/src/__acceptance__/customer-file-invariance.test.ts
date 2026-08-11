// Acceptance tests — the `customer_file` fold's `01-F34` oracle. Authored from spec text only
// (`24 §3` step 2): `01-F34`, `01-F43`..`01-F45`, `26 §7`, `26 §8`. The FR list and the
// per-field merge rules live at the head of `./customer-file-builders.ts`.
//
// ── WHY PLAIN CONVERGENCE IS NOT ENOUGH (26 §8) ─────────────────────────────
// A `min(envelope.id)` tiebreak PASSES plain convergence and is convergent-AND-WRONG: `00 §6`
// pins ids to UUIDv7, whose leading 48 bits are the minting device's wall clock, so id-min is
// min-wall-clock in a disguise. Only bijective relabelling — including an ORDER-REVERSING one
// — kills it.
//
// Three independent nets, because each catches what the others miss:
//   1. RELABEL   — an order-reversing bijection over envelope ids. Kills min/max-by-id.
//   2. INJECTION — garbage `device_created_at` / `lamport_seq` / `global_seq` /
//                  `server_received_at` on the identical set. Kills clock and sequence reads
//                  that survive relabelling.
//   3. POISON    — Proxy-wrapped envelopes that THROW the moment the fold reads one of the four
//                  banned fields (`26 §8`'s own technique). Names the offending field at the
//                  read instead of inferring it from a diff, and catches a read whose effect
//                  happens to cancel in this particular projection.
//
// ── AND THE NETS MUST COVER THE DANGEROUS CASE, NOT MERELY EXIST ────────────
// The round-3 law. Five suites in this repo were returned broken for the same defect: the
// mechanism was built correctly and never aimed at the input that matters. A min-id tiebreak is
// only OBSERVABLE on a field decided among divergent concurrent members, and this fold has
// exactly one such field — `name` under two `customer.created` events carrying two different
// names for one number. A relabel net run over a set without that shape is a correct net over a
// safe fixture. §0b asserts the shape is present rather than leaving it to a reader.
//
// ⚠ AND A NET THAT PASSES HERE IS STILL NOT ENOUGH. `[...names].sort()[0]` is clock-free,
// id-free and perfectly convergent: it passes every net in this file. It is killed only by the
// DIRECTED assertions in `./customer-file-fold.test.ts` §3. Neither file is sufficient alone,
// and no reader should take a green run here as evidence the fold obeys `01-F31`.
//
// RED-AWAITING-IMPLEMENTATION — `@restos/sync-client/fold-engine` exports none of the three
// customer_file symbols yet. §0 and §0b are GREEN today, deliberately: they assert properties of
// the ADVERSARIES and the FIXTURE, which must hold before an implementation exists or the nets
// below prove nothing when it does.

import { describe, expect, it } from "vitest";
import { must } from "./builders.js";
import {
  BANNED_METADATA,
  customerFile,
  customerFileScenario,
  injectGarbageMetadata,
  poisoned,
  projectionBytes,
  reversedIds,
  row,
  shiftBranchStamps,
} from "./customer-file-builders.js";
import { shuffled } from "./merge-builders.js";

type Env = Record<string, unknown> & { id: string };
type Payload = Record<string, unknown>;

const payloadOf = (env: Env): Payload => env.payload as Payload;
const isType = (env: Env, type: string) => env.type === type;
const creates = (envs: readonly Env[]) => envs.filter((e) => isType(e, "customer.created"));
const addresses = (envs: readonly Env[]) => envs.filter((e) => isType(e, "customer.address_added"));

const groupBy = <T>(items: readonly T[], key: (t: T) => string): Map<string, T[]> => {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    out.set(k, [...(out.get(k) ?? []), item]);
  }
  return out;
};

// ===========================================================================
// §0 — the tripwire itself must be live. A guard that cannot fire is the round-2 §C failure
// ("the guard passed by not looking"), so the poison is tested before it is used.
// ===========================================================================

describe("§0 the Proxy poison is a LIVE tripwire, not decoration (26 §8)", () => {
  it("01-F34: reading any of the four banned fields off a poisoned envelope throws, naming the field", () => {
    const { envelopes } = customerFileScenario();
    const env = poisoned(must(envelopes[0], "envelope"));
    for (const field of BANNED_METADATA) {
      expect(() => (env as Record<string, unknown>)[field]).toThrow(
        new RegExp(`01-F34 violation.*${field}`),
      );
    }
  });

  it("01-F34: the fields a fold IS allowed to read pass through the poison untouched", () => {
    const { envelopes } = customerFileScenario();
    const raw = must(envelopes[0], "envelope");
    const env = poisoned(raw);
    expect(env.type).toBe(raw.type);
    expect(env.payload).toEqual(raw.payload);
    expect(env.branch_created_at).toBe(raw.branch_created_at);
    expect(env.id).toBe(raw.id);
    // Copying an envelope is not reading a value out of it: a spread must not trip the wire,
    // and the copy must carry none of the banned fields.
    const copy = { ...env } as Record<string, unknown>;
    for (const field of BANNED_METADATA) expect(copy[field]).toBeUndefined();
  });

  it("26 §8: the relabel is a genuine ORDER-REVERSING bijection, not an identity map", () => {
    const { envelopes } = customerFileScenario();
    const { reversing, bijective, map } = reversedIds(envelopes);
    expect(reversing, "φ must invert the id order or a min-id tiebreak survives it").toBe(true);
    expect(bijective, "φ must not collapse two ids").toBe(true);
    expect(map.size).toBe(envelopes.length);
  });
});

// ===========================================================================
// §0b — THE FIXTURE MUST CARRY THE DANGEROUS SHAPES, AND THIS IS THE TRIPWIRE THAT SAYS SO.
//
// Asserted over the ENVELOPES, not the projection, so it holds while the fold is unwritten and
// so a future fixture edit that quietly removes a shape reddens HERE — naming the shape — rather
// than silently converting every net below into a correct net over a safe set.
// ===========================================================================

describe("§0b `customerFileScenario()` carries every case the nets exist to cover (round-3 law)", () => {
  const { envelopes } = customerFileScenario() as { envelopes: Env[] };
  const byPhone = groupBy(creates(envelopes), (e) => payloadOf(e).phone_e164 as string);

  it("01-F31: some number carries TWO creates with TWO DIFFERENT stated names — the ONLY field a min-id tiebreak is observable on", () => {
    const divergent = [...byPhone.values()].filter((group) => {
      const stated = new Set(
        group.map((e) => payloadOf(e).name).filter((n): n is string => typeof n === "string"),
      );
      return stated.size > 1;
    });
    expect(divergent.length, "no divergent-name key ⇒ relabel and injection prove nothing").toBe(1);
    expect(must(divergent[0], "divergent group").length).toBeGreaterThanOrEqual(2);
  });

  it("06-F11: some number carries a NULL-name create ALONGSIDE a stated one", () => {
    const mixed = [...byPhone.values()].filter(
      (group) =>
        group.some((e) => payloadOf(e).name === null) &&
        group.some((e) => typeof payloadOf(e).name === "string"),
    );
    expect(mixed.length, "no null-vs-stated key ⇒ 'null is a member' is unreachable").toBe(1);
  });

  it("01-F23: some number carries two creates AGREEING byte-for-byte — the single-variable control", () => {
    const agreed = [...byPhone.values()].filter((group) => {
      const stated = new Set(
        group.map((e) => payloadOf(e).name).filter((n): n is string => typeof n === "string"),
      );
      return group.length > 1 && stated.size === 1;
    });
    expect(agreed.length).toBeGreaterThanOrEqual(1);
  });

  it("06-F9/01-F19: the set carries two distinct addresses on one number, AND two ids sharing one text", () => {
    const adds = addresses(envelopes);
    const byKey = groupBy(adds, (e) => payloadOf(e).phone_e164 as string);
    const multi = [...byKey.values()].filter((g) => g.length > 1);
    expect(
      multi.length,
      "no multi-address key ⇒ the union rule is untested",
    ).toBeGreaterThanOrEqual(1);

    // Two DISTINCT minted ids carrying one text, ON ONE NUMBER — the only shape on which a
    // content-keyed address set is distinguishable from an id-keyed one.
    const sharingText = [...byKey.values()].filter((group) => {
      const byText = groupBy(group, (e) => payloadOf(e).address_text as string);
      return [...byText.values()].some(
        (g) => new Set(g.map((e) => payloadOf(e).address_id as string)).size > 1,
      );
    });
    expect(
      sharingText.length,
      "no key with two address_ids sharing a text ⇒ content-dedupe is unreachable",
    ).toBe(1);
  });

  it("01-F10: the set carries an address whose number has NO create anywhere", () => {
    const created = new Set(creates(envelopes).map((e) => payloadOf(e).phone_e164 as string));
    const orphaned = addresses(envelopes).filter(
      (e) => !created.has(payloadOf(e).phone_e164 as string),
    );
    expect(orphaned.length, "no orphan address ⇒ the parking hazard is unreachable").toBe(1);
  });

  it("26 §7: the set carries an event ANOTHER fold owns, and events from TWO devices", () => {
    expect(envelopes.some((e) => !String(e.type).startsWith("customer."))).toBe(true);
    expect(new Set(envelopes.map((e) => e.device_id)).size).toBeGreaterThanOrEqual(2);
  });
});

// ===========================================================================
// §1 — RELABEL. An order-reversing bijection over envelope ids.
// ===========================================================================

describe("§1 01-F34 — bijective envelope-id relabelling moves nothing", () => {
  it("26 §8: the whole scenario projects byte-identically under an order-reversing relabel", () => {
    const { envelopes } = customerFileScenario();
    const { envelopes: relabelled, reversing, bijective } = reversedIds(envelopes);
    expect(reversing && bijective).toBe(true);

    const fold = customerFile();
    expect(projectionBytes(fold.projectAll(relabelled))).toBe(
      projectionBytes(fold.projectAll(envelopes)),
    );
  });

  /**
   * §1 isolated on the row a min-id tiebreak actually decides, so the red names the CONTESTED
   * NAME rather than "an eleven-event projection moved". Without this, an implementer reading a
   * §1 failure has to bisect a whole scenario to find the field.
   */
  it("01-F31: the contested-name row alone is relabel-invariant", () => {
    const { envelopes } = customerFileScenario() as { envelopes: Env[] };
    const contested = must(
      [...groupBy(creates(envelopes), (e) => payloadOf(e).phone_e164 as string).entries()].find(
        ([, group]) =>
          new Set(
            group.map((e) => payloadOf(e).name).filter((n): n is string => typeof n === "string"),
          ).size > 1,
      ),
      "the contested-name key",
    )[0];

    const { envelopes: relabelled } = reversedIds(envelopes);
    const fold = customerFile();

    expect(row(fold.projectAll(relabelled), contested)).toEqual(
      row(fold.projectAll(envelopes), contested),
    );
  });

  it("26 §8: relabel AND shuffle together still move nothing", () => {
    const { envelopes } = customerFileScenario();
    const { envelopes: relabelled } = reversedIds(envelopes);
    const fold = customerFile();
    const expected = projectionBytes(fold.projectAll(envelopes));

    for (let seed = 11; seed <= 14; seed++) {
      expect(projectionBytes(fold.projectAll(shuffled(relabelled, seed))), `seed ${seed}`).toBe(
        expected,
      );
    }
  });
});

// ===========================================================================
// §1b — ANTI-VACUITY. A fold that reads NOTHING passes every net above.
// ===========================================================================

describe("§1b the nets are not vacuous — the fold demonstrably reads what it is allowed to", () => {
  it("01-F23: changing a stated NAME in the payload MOVES the projection", () => {
    const { envelopes } = customerFileScenario() as { envelopes: Env[] };
    const target = must(
      creates(envelopes).find((e) => typeof payloadOf(e).name === "string"),
      "a create with a stated name",
    );
    const mutated = envelopes.map((e) =>
      e === target ? { ...e, payload: { ...payloadOf(e), name: "Zzz Unrelated" } } : e,
    );

    const fold = customerFile();
    expect(projectionBytes(fold.projectAll(mutated))).not.toBe(
      projectionBytes(fold.projectAll(envelopes)),
    );
  });

  it("01-F23: changing a PHONE key in the payload MOVES the projection", () => {
    const { envelopes } = customerFileScenario() as { envelopes: Env[] };
    const target = must(creates(envelopes)[0], "a create");
    const mutated = envelopes.map((e) =>
      e === target ? { ...e, payload: { ...payloadOf(e), phone_e164: "+923119999999" } } : e,
    );

    const fold = customerFile();
    expect(projectionBytes(fold.projectAll(mutated))).not.toBe(
      projectionBytes(fold.projectAll(envelopes)),
    );
  });
});

// ===========================================================================
// §2 — INJECTION. Same ids, same payloads, same devices, same branch stamps: only the four
// banned fields move.
// ===========================================================================

describe("§2 01-F34 — garbage ordering metadata moves nothing", () => {
  it("01-F34: clock / lamport / global_seq / server_received_at injection is inert", () => {
    const { envelopes } = customerFileScenario();
    const fold = customerFile();

    expect(projectionBytes(fold.projectAll(injectGarbageMetadata(envelopes)))).toBe(
      projectionBytes(fold.projectAll(envelopes)),
    );
  });

  it("01-F34: injection AND relabel AND shuffle, composed, are still inert", () => {
    const { envelopes } = customerFileScenario();
    const { envelopes: relabelled } = reversedIds(envelopes);
    const fold = customerFile();

    expect(projectionBytes(fold.projectAll(shuffled(injectGarbageMetadata(relabelled), 21)))).toBe(
      projectionBytes(fold.projectAll(envelopes)),
    );
  });

  /**
   * `01-F43`'s branch stamp is the ONE clock a fold may read — and this fold projects no time
   * at all, so moving every branch stamp must also be inert. Stated as its own assertion
   * because "reads no clock" is a claim, and because a later field that DID carry a time
   * (a `last_seen_at`) would red here and force the FR to be written before it ships.
   */
  it("01-F34: this fold projects no time — moving every BRANCH stamp is inert too", () => {
    const { envelopes } = customerFileScenario();
    const fold = customerFile();

    expect(projectionBytes(fold.projectAll(shiftBranchStamps(envelopes, 9 * 86_400_000)))).toBe(
      projectionBytes(fold.projectAll(envelopes)),
    );
  });
});

// ===========================================================================
// §3 — POISON. The strongest net: it names the field at the moment of the read.
// ===========================================================================

describe("§3 26 §8 — the fold never touches ordering metadata at all", () => {
  it("01-F34: folding poisoned envelopes completes without tripping the wire", () => {
    const { envelopes } = customerFileScenario();
    const fold = customerFile();

    expect(() => fold.projectAll(envelopes.map(poisoned))).not.toThrow();
  });

  it("01-F34: the poisoned fold produces the SAME projection as the clean one", () => {
    const { envelopes } = customerFileScenario();
    const fold = customerFile();

    expect(projectionBytes(fold.projectAll(envelopes.map(poisoned)))).toBe(
      projectionBytes(fold.projectAll(envelopes)),
    );
  });
});
