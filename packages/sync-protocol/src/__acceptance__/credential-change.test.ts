// Acceptance tests — 01-F79's credential-change pair: the till REQUESTS and the cloud RECORDS.
// FRs: 01-F79 (+ 11-F21, 11-F23, 14-F40, 14 §2, 01-F61, 00 §5.7).
//
// AUTHORED FROM SPEC TEXT ONLY, by a session that wrote no implementation.
//
// ── ⚠ WHY MOST OF THIS FILE IS NAME-AGNOSTIC, AND THAT IS DELIBERATE ───────────────────────────
//
// 01-F79 fixes the two KIND names ("the pair is `credential_change_request` and
// `credential_change_result`"), the closed outcome vocabulary, and the rule that what travels is
// the new HASH and never either PIN. It does NOT write down the body's field names — unlike
// 01-F76, which pinned `{ org_id, branch_id }` in the spec precisely because "a fixture cannot be
// written until someone writes the JSON down".
//
// So this file does not invent them (commandment 2). The two golden fixtures are the IMPLEMENTING
// change's to mint — `20 §2.7` makes them the contract — and every assertion below is written
// against the fixture's own shape and the production codec, so it binds whatever names are chosen
// and reds only on the properties the FR actually fixes. Where a name is spec'd it is asserted
// exactly; where it is not, the PROPERTY is.
//
// ⚠ If `fixtures/credential_change_request.json` or `fixtures/credential_change_result.json` does
// not exist, every test here fails on the READ. That is the intended failure: 01-F79 opens the
// message set and `20 §2.7` makes a kind without a golden fixture a kind with no contract.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MESSAGE_KINDS, PROTOCOL_VERSION, parseMessage } from "../index.js";

type Frame = Record<string, unknown>;

const fixture = (name: string): Frame =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)), "utf8"),
  ) as Frame;

const REQUEST = "credential_change_request";
const RESULT = "credential_change_result";

/**
 * 01-F79: "The result is one of a closed set, and one of them is not a failure. `changed` ·
 * `wrong_old_pin` · `not_permitted` · `unavailable`."
 */
const RESULTS = ["changed", "wrong_old_pin", "not_permitted", "unavailable"] as const;

const refuses = (frame: unknown): void => {
  expect(() => parseMessage(frame)).toThrow();
};

/**
 * ⚠ ANTI-VACUITY — see `reference-frames.test.ts`'s note, measured on the same run. A base frame
 * that does not parse makes every refusal below trivially true, and this helper swallows a throw
 * by design, so the base is anchored here rather than at each call site.
 */
const anchored = (name: string): Frame => {
  const frame = fixture(name);
  expect(
    parseMessage(frame),
    `ANCHOR: ${name} must PARSE before any mutation of it can prove anything`,
  ).toEqual(frame);
  return frame;
};

/** Refusing and stripping are both legal; carrying the value on is not. */
const cannotCarry = (name: string, over: Frame, sentinel: string): void => {
  const frame = { ...anchored(name), ...over };
  let parsed: unknown;
  try {
    parsed = parseMessage(frame);
  } catch {
    return;
  }
  expect(JSON.stringify(parsed)).not.toContain(sentinel);
};

/** The field the result's outcome rides, discovered from the committed fixture rather than named. */
const outcomeKeyOf = (frame: Frame): string => {
  const keys = Object.keys(frame).filter(
    (key) =>
      typeof frame[key] === "string" &&
      (RESULTS as readonly string[]).includes(frame[key] as string),
  );
  // Exactly one, because two carriers of one outcome is two representations of one fact — the
  // shape 11-F20 and 01-F75 both refuse elsewhere on this wire.
  expect(keys).toHaveLength(1);
  const key = keys[0];
  if (key === undefined) throw new Error("unreachable: length asserted above");
  return key;
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("§G — the pair exists and is NOT a reference-data frame (01-F79)", () => {
  it("G1 01-F79: `credential_change_request` and `credential_change_result` are kinds", () => {
    // "The message set is declared closed (20 §2.7 pins it with golden fixtures), so this FR is
    // what opens it." Narrow names over a generic `command` pair, on 01-F75's own ground: "a
    // generic frame invites the next author to carry something nobody ruled on."
    expect(MESSAGE_KINDS).toContain(REQUEST);
    expect(MESSAGE_KINDS).toContain(RESULT);
    for (const generic of ["command", "command_result", "credential_change", "pin_change"]) {
      expect(MESSAGE_KINDS).not.toContain(generic);
    }
  });

  it("G2 01-F79: both fixtures decode through the production codec and carry v: 2", () => {
    for (const name of [REQUEST, RESULT]) {
      const frame = fixture(name);
      expect(parseMessage(frame)).toEqual(frame);
      expect(frame.kind).toBe(name);
      expect(frame.v).toBe(PROTOCOL_VERSION);
    }
  });

  it("G3 01-F79/01-F75: it is a COMMAND, so it is not carried as a reference resource", () => {
    // "01-F75's triple is a PULL … This is a COMMAND with an outcome, and folding it into
    // `reference_request` would make one frame mean two things the moment a second command
    // appears." The closed resource set is the enforcement: no credential resource exists.
    // Anchored on a LEGAL reference_request, so this cannot pass against a build where the frame
    // does not exist at all (`reference-frames.test.ts` measured 19 such vacuous passes).
    const legal = anchored("reference_request_catalog");
    for (const resource of ["credential", "credential_change", "pin", "user_credential"]) {
      refuses({ ...legal, resource });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("§H — what travels is the NEW HASH, never either PIN (01-F79, 11-F21, 14 §2)", () => {
  it("H1 01-F79: no field of either frame is named for a PIN unless it is a HASH", () => {
    // "The alternative — send both PINs and let the cloud verify — is refused because it makes
    // 11-F21 false: that FR says a PIN exists in exactly two places for exactly as long as each
    // takes, 'the keypad it is typed on and the argument to a verify call', and 14 §2 says PINs are
    // never present in payloads."
    //
    // The fixture's keys are the frame's DECLARED required keys (nothing undeclared survives the
    // codec, and a required field cannot be absent from a golden fixture), so this reads the
    // contract without naming it.
    for (const name of [REQUEST, RESULT]) {
      for (const key of Object.keys(parseMessage(fixture(name)) as Frame)) {
        if (/pin/i.test(key)) expect(key, `${name}.${key}`).toMatch(/hash/i);
      }
    }
  });

  it("H2 01-F79: neither frame can CARRY a PIN, declared or smuggled", () => {
    // The old PIN is verified on the DEVICE against its synced hash (01-F28) — "the cloud does not
    // re-verify the old PIN and cannot: it never receives it" — so there is no field for either
    // PIN, and an undeclared one must not survive the codec.
    for (const name of [REQUEST, RESULT]) {
      for (const key of [
        "pin",
        "old_pin",
        "new_pin",
        "current_pin",
        "pin_digits",
        "plain_pin",
        "old_pin_plaintext",
      ]) {
        cannotCarry(name, { [key]: "4821" }, "4821");
      }
    }
  });

  it("H3 01-F79/11-F21: no committed credential fixture holds a PIN-shaped literal", () => {
    // A golden fixture is copied into logs, transcripts and bug reports; 14 §2's rule is about
    // payloads and a fixture IS a payload. A 4–6 digit string in either of these two files is
    // either a PIN or something that will be read as one.
    for (const name of [REQUEST, RESULT]) {
      const walk = (value: unknown, path: string): void => {
        if (typeof value === "string") expect(value, path).not.toMatch(/^\d{4,6}$/);
        else if (Array.isArray(value)) {
          for (const [i, item] of value.entries()) walk(item, `${path}[${i}]`);
        } else if (typeof value === "object" && value !== null) {
          for (const [key, inner] of Object.entries(value)) walk(inner, `${path}.${key}`);
        }
      };
      walk(fixture(name), name);
    }
  });

  it("H4 01-F79: a refusal never echoes a PIN back into an error message", () => {
    // 11-F21's two-places rule binds the error path too: an implementation that names the offending
    // VALUE in its message (which `publishCatalog` does, for a menu row, deliberately) would put a
    // typed PIN into a log line the moment someone smuggles one.
    const probes: unknown[] = [
      { ...fixture(REQUEST), v: 1, pin: "4821" },
      { ...fixture(REQUEST), kind: "credential_change", old_pin: "4821" },
      { v: PROTOCOL_VERSION, kind: REQUEST, pin: "4821" },
      { v: PROTOCOL_VERSION, kind: RESULT, new_pin: "4821" },
    ];
    for (const probe of probes) {
      let message = "";
      try {
        parseMessage(probe);
        continue; // parsed: H2 already owns whether the value survived
      } catch (error) {
        message = String((error as Error).message);
      }
      expect(message).not.toContain("4821");
    }
  });

  it("H5 01-F79/14-F40: the request NAMES the user it is about, and the field is required", () => {
    // "The request may only ever be about the requester herself (14-F40), and the cloud enforces
    // that by comparing the named user to the SESSION's user, never to a field the device chose."
    // The comparison is the serve path's; that there is something to compare is the wire's.
    const request = parseMessage(fixture(REQUEST)) as Frame;
    const userKeys = Object.keys(request).filter(
      (key) => /user/i.test(key) && typeof request[key] === "string" && request[key] !== "",
    );
    expect(userKeys.length).toBeGreaterThan(0);
    for (const key of userKeys) {
      const stripped = { ...fixture(REQUEST) };
      delete stripped[key];
      refuses(stripped);
      refuses({ ...fixture(REQUEST), [key]: "" });
    }
  });

  it("H6 01-F79/01-F61: the request carries a credential hash, and it is required and non-empty", () => {
    // "…hashes the new PIN locally at 01-F61's parameters — one declaration, `packages/domain`'s,
    // because a device and a cloud that hash differently produce an offline refusal of a credential
    // the owner has just set — and sends the resulting hash."
    const request = parseMessage(fixture(REQUEST)) as Frame;
    const hashKeys = Object.keys(request).filter(
      (key) => /hash/i.test(key) && typeof request[key] === "string",
    );
    expect(hashKeys.length).toBeGreaterThan(0);
    for (const key of hashKeys) {
      const stripped = { ...fixture(REQUEST) };
      delete stripped[key];
      refuses(stripped);
      refuses({ ...fixture(REQUEST), [key]: "" });
      // 11-F21's Argon2id credential, as `domain`'s `hashPin` mints it. A fixture carrying anything
      // else records a credential format this product does not produce.
      expect(String(request[key])).toMatch(/^\$argon2id\$/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("§I — the outcome is one of a CLOSED set of four (01-F79, 00 §5.7)", () => {
  it("I1 01-F79: the result fixture carries exactly one outcome field, holding one of the four", () => {
    const result = parseMessage(fixture(RESULT)) as Frame;
    const key = outcomeKeyOf(result);
    expect(RESULTS).toContain(result[key]);
  });

  it("I2 01-F79: all four words are legal — including `unavailable`, which is not a failure", () => {
    // "⚠ `unavailable` exists because this act REQUIRES the WAN and that is correct rather than a
    // 00 §5.1 breach … The till must say which of those four happened; 'it did not work' is
    // 00 §5.7's failure." A schema that refused any of the four would make one outcome
    // unreportable, which is exactly the 'it did not work' this FR forbids.
    const key = outcomeKeyOf(parseMessage(fixture(RESULT)) as Frame);
    for (const outcome of RESULTS) {
      const frame = { ...fixture(RESULT), [key]: outcome };
      expect((parseMessage(frame) as Frame)[key], outcome).toBe(outcome);
    }
  });

  it("I3 01-F79: a FIFTH outcome is refused — the set is closed, not a free string", () => {
    const key = outcomeKeyOf(parseMessage(fixture(RESULT)) as Frame);
    for (const invented of [
      "ok",
      "denied",
      "error",
      "rate_limited",
      "wrong_pin",
      "CHANGED",
      "",
      "changed ",
    ]) {
      refuses({ ...fixture(RESULT), [key]: invented });
    }
    refuses({ ...fixture(RESULT), [key]: undefined });
    const stripped = { ...fixture(RESULT) };
    delete stripped[key];
    refuses(stripped);
  });
});
