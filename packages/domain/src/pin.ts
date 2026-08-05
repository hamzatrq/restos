/**
 * PIN credentials — Argon2id hash and verify (`01-F26`, `00 §5.4`, `01-F61`).
 *
 * `01-F26` makes the algorithm platform law and platform law lives here (`18 §2`). `01-F61`
 * settles the two things that law left open:
 *
 * - **Two bindings of ONE algorithm.** `18 §` names the native `argon2` addon under *Backend*
 *   and it stays there for the cloud plane. The device path is Core/shared, where a node-gyp
 *   addon would break every browser workspace that imports `domain`, so it uses
 *   `@noble/hashes`' pure-JS `argon2id` — already a dependency. Same algorithm, same
 *   parameters, and the PHC encoding below is what makes the two interoperable: a hash minted
 *   on either side verifies on the other.
 * - **The cost floor is a PARAMETER, never an elapsed time** (`01-F61`). A duration assertion
 *   is a timing test, and a fast machine reads as a weak one. `PIN_ARGON2ID_PARAMS` is
 *   exported so the floor is asserted directly.
 *
 * `01-F1` is why the raw PIN reaches nothing durable: the ledger is permanent, so a credential
 * written into it can never be redacted. Nothing here logs, returns or stores the PIN.
 */

import { argon2idAsync } from "@noble/hashes/argon2.js";
import { randomBytes } from "@noble/hashes/utils.js";

/**
 * `01-F61`'s explicit cost floor: the OWASP Argon2id minimum (19 MiB, 2 iterations, 1 lane).
 *
 * The value is a **pinned interpretation** — `01-F61` requires *a* stated floor and names no
 * numbers — but the direction is not: without one, a conforming-but-worthless `m=8,t=1,p=1`
 * satisfies every test that checks only the algorithm name. Exported so the floor can be
 * asserted as a parameter rather than measured as a duration.
 *
 * `m` is in kibibytes, matching both the PHC encoding and the native `argon2` binding.
 */
export const PIN_ARGON2ID_PARAMS = { m: 19_456, t: 2, p: 1 } as const;

/** RFC 9106's version, the only one either binding emits. */
const ARGON2_VERSION = 0x13;

/** 16 bytes — the RFC 9106 recommendation, and what the native binding defaults to. */
const SALT_BYTES = 16;

/** 32 bytes of digest. Longer buys nothing against a credential this short (`01-F61`). */
const DK_LEN = 32;

const B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** PHC's B64: standard base64 with the padding stripped. Hand-rolled to stay runtime-neutral
 *  — `Buffer` is Node-only and `btoa` is not everywhere `domain` is imported. */
const toB64 = (bytes: Uint8Array): string => {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] as number;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += B64_ALPHABET[a >> 2];
    out += B64_ALPHABET[((a & 0b11) << 4) | ((b ?? 0) >> 4)];
    if (b === undefined) break;
    out += B64_ALPHABET[((b & 0b1111) << 2) | ((c ?? 0) >> 6)];
    if (c === undefined) break;
    out += B64_ALPHABET[c & 0b111111];
  }
  return out;
};

/** `null` for anything that is not B64 — this parses a value that arrived over the wire
 *  (`01-F28` syncs it), so a bad character is a refusal, never a throw (`01-F17`). */
const fromB64 = (text: string): Uint8Array | null => {
  const bits: number[] = [];
  for (const ch of text) {
    const v = B64_ALPHABET.indexOf(ch);
    if (v < 0) return null;
    bits.push(v);
  }
  const out = new Uint8Array(Math.floor((bits.length * 6) / 8));
  let acc = 0;
  let held = 0;
  let n = 0;
  for (const v of bits) {
    acc = (acc << 6) | v;
    held += 6;
    if (held >= 8) {
      held -= 8;
      out[n++] = (acc >> held) & 0xff;
    }
  }
  return out;
};

/**
 * Constant-time byte comparison. Not paranoia: `verifyPin` runs on a shared terminal where an
 * attacker can call it as often as they like, and an early-exit `===` on the digest leaks the
 * matching prefix one byte at a time.
 */
const equalConstantTime = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] as number) ^ (b[i] as number);
  return diff === 0;
};

type Parsed = { params: { m: number; t: number; p: number }; salt: Uint8Array; hash: Uint8Array };

/**
 * `01-F28` syncs the hash to devices, so the salt and the cost parameters have to travel WITH
 * it: a device holding only a digest could verify nothing, and the day the parameters are
 * raised every already-synced hash would stop verifying — on every device, offline, at once.
 * That is the whole reason for the self-contained PHC string.
 */
const parse = (encoded: string): Parsed | null => {
  const m = /^\$argon2id\$v=(\d+)\$m=(\d+),t=(\d+),p=(\d+)\$([^$]+)\$([^$]+)$/.exec(encoded);
  if (m === null) return null;
  if (Number(m[1]) !== ARGON2_VERSION) return null;
  const salt = fromB64(m[5] as string);
  const hash = fromB64(m[6] as string);
  if (salt === null || hash === null || salt.length === 0 || hash.length === 0) return null;
  return {
    params: { m: Number(m[2]), t: Number(m[3]), p: Number(m[4]) },
    salt,
    hash,
  };
};

/**
 * Enrol a PIN (`01-F26`). Salted per enrolment, so two staff who pick the same four digits — on
 * a keypad that is ordinary, not exotic — do not share a stored value; equal hashes would make
 * the branch credential table one rainbow-table lookup, and `01-F28` puts that table on every
 * device.
 *
 * Async because Argon2id is deliberately slow: `argon2idAsync` yields to the scheduler, so a
 * ~half-second enrolment does not freeze whatever was serving the till (`01-F17`).
 */
export const hashPin = async (pin: string): Promise<string> => {
  const salt = randomBytes(SALT_BYTES);
  const digest = await argon2idAsync(pin, salt, { ...PIN_ARGON2ID_PARAMS, dkLen: DK_LEN });
  const { m, t, p } = PIN_ARGON2ID_PARAMS;
  return `$argon2id$v=${ARGON2_VERSION}$m=${m},t=${t},p=${p}$${toB64(salt)}$${toB64(digest)}`;
};

/**
 * Verify a candidate PIN against a stored hash (`01-F28`) — stored value first, candidate
 * second. Reads the parameters OUT of the encoded string rather than from
 * `PIN_ARGON2ID_PARAMS`, which is what lets the floor be raised without invalidating every
 * hash already synced to every device.
 *
 * `false`, never a throw, for an unparseable hash: it arrives over the sync channel and
 * `01-F17` makes a stopped till the one unacceptable outcome.
 */
export const verifyPin = async (hash: string, pin: string): Promise<boolean> => {
  const parsed = parse(hash);
  if (parsed === null) return false;
  const candidate = await argon2idAsync(pin, parsed.salt, {
    ...parsed.params,
    dkLen: parsed.hash.length,
  });
  return equalConstantTime(candidate, parsed.hash);
};
