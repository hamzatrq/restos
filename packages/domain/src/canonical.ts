// Canonical JSON — the single declared-once serializer (18 §2): object keys sorted
// by UTF-16 code unit at every depth, no insignificant whitespace. Byte-pinned so a
// future non-JS refold/verify implementation must byte-agree (20 §4.2). The audit
// hash (audit.ts) and any determinism assertion hash over exactly these bytes.
// `sync-client`'s folds/replay.ts now imports this one (the earlier "cannot import —
// dependency direction" note was wrong: sync-client already depends on domain), so
// product code has exactly one serializer. The only remaining copy is the independent
// one in the acceptance builders, which is deliberate — an oracle that recomputed the
// expected bytes with the implementation under test would assert nothing.
// Values JSON.stringify drops (object keys) or renders as `null` (array elements).
// canonicalJson must mirror that exactly, so hashing the in-memory value equals
// hashing what SQLite/Postgres persist after a JSON.stringify round-trip — otherwise
// a legitimate `undefined` payload key self-breaks the audit chain (01-F5).
const isJsonOmitted = (v: unknown): boolean =>
  v === undefined || typeof v === "function" || typeof v === "symbol";

export const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((v) => (isJsonOmitted(v) ? "null" : canonicalJson(v))).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, val]) => !isJsonOmitted(val)) // JSON.stringify drops these keys
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, val]) => `${JSON.stringify(key)}:${canonicalJson(val)}`);
    return `{${entries.join(",")}}`;
  }
  return isJsonOmitted(value) ? "null" : JSON.stringify(value);
};
