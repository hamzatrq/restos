// Canonical JSON — the single declared-once serializer (18 §2): object keys sorted
// by UTF-16 code unit at every depth, no insignificant whitespace. Byte-pinned so a
// future non-JS refold/verify implementation must byte-agree (20 §4.2). The audit
// hash (audit.ts) and any determinism assertion hash over exactly these bytes.
// (`sync-client`'s folds/replay.ts holds an identical copy that cannot import this
// one — dependency direction — its convergence onto this home is scheduled W0-CONS.)
export const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, val]) => `${JSON.stringify(key)}:${canonicalJson(val)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
};
