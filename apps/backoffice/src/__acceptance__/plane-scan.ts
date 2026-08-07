/**
 * The two-plane scanner (Commandment 5, `18 §6`) — **and it takes SOURCE TEXT, not a directory.**
 *
 * That signature is the point. This wave's round-3 finding is *"the guard that was never pointed
 * at the dangerous case"*: five suites built a correct mechanism and never ran it over the fixture
 * that would fail. A scanner that could only ever walk `src/` is exactly that shape — it reports
 * clean, and nothing has ever shown that it reports anything else. Taking text means the suite
 * points it at a KNOWN violation of every rule and asserts the rule fires, on the same code path
 * that clears the real tree.
 *
 * It lives in `__acceptance__/` because it is oracle support, not shipped code.
 */

export type PlaneViolation = {
  readonly rule: string;
  readonly file: string;
  readonly detail: string;
};

/**
 * Comments and string contents are blanked so a rule cannot fire on prose, and so this file's own
 * documentation of what it bans does not trip it. Positions are preserved, so nothing shifts.
 */
const blank = (source: string): string => {
  const out = source.split("");
  const keep = (i: number): void => {
    if (source[i] !== "\n") out[i] = " ";
  };
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") keep(i++);
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      keep(i++);
      keep(i++);
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) keep(i++);
      keep(i++);
      keep(i++);
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      i++;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === "\\") {
          keep(i++);
          if (i < source.length) keep(i++);
          continue;
        }
        keep(i++);
      }
      i++;
      continue;
    }
    i++;
  }
  return out.join("");
};

/** Every `import ... from "<specifier>"` in the (blanked) source. */
const importsOf = (code: string, raw: string): readonly string[] => {
  const found: string[] = [];
  // The specifier's TEXT was blanked above, so it is read from the raw source at the same offsets.
  const re = /\bfrom\s*["']/g;
  for (let m = re.exec(code); m !== null; m = re.exec(code)) {
    const start = m.index + m[0].length;
    const quote = raw[start - 1] as string;
    const end = raw.indexOf(quote, start);
    if (end > start) found.push(raw.slice(start, end));
  }
  return found;
};

/** The balanced span of the call starting at `open` (the index of its `(`). */
const callSpan = (code: string, open: number): string => {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === "(") depth++;
    else if (code[i] === ")") {
      depth--;
      if (depth === 0) return code.slice(open, i + 1);
    }
  }
  return code.slice(open);
};

/**
 * **The operational plane, banned by name.** `sync-client` reads and writes the device's local
 * ledger; to the POS the catalog is a read-only cache resolved by id, to this app it is an
 * editable server-owned aggregate. One import would put a device's stale snapshot behind an editor.
 */
const OPERATIONAL_PLANE = /(^|\/)sync-client(\/|$)|(^|\/)sync-protocol(\/|$)/;

/**
 * **A client store, banned by name.** `18 §6` is "TanStack Query v5 + tRPC only". Each of these
 * exists to hold state across components, which for server data is the copy the law forbids.
 */
const CLIENT_STORES = /^(zustand|redux|@reduxjs\/|react-redux|jotai|valtio|mobx|recoil|nanostores)/;

export const scanPlaneDiscipline = (
  files: readonly { readonly file: string; readonly source: string }[],
): readonly PlaneViolation[] => {
  const violations: PlaneViolation[] = [];

  for (const { file, source } of files) {
    const code = blank(source);

    for (const specifier of importsOf(code, source)) {
      if (OPERATIONAL_PLANE.test(specifier)) {
        violations.push({
          rule: "two-plane",
          file,
          detail: `imports "${specifier}" — the operational plane (Commandment 5, 18 §6)`,
        });
      }
      if (CLIENT_STORES.test(specifier)) {
        violations.push({
          rule: "client-store",
          file,
          detail: `imports "${specifier}" — server state may not live in a client store (18 §6)`,
        });
      }
    }

    // A `useState` seeded DIRECTLY from a query result. `useState(() => formOf(initial))` — a seed
    // from a PROP — is legal and stays legal; `useState(query.data)` is the copy.
    const stateRe = /\buseState\s*\(/g;
    for (let m = stateRe.exec(code); m !== null; m = stateRe.exec(code)) {
      const span = callSpan(code, m.index + m[0].length - 1);
      if (/\.data\b/.test(span)) {
        violations.push({
          rule: "state-copy",
          file,
          detail: "useState initialised from a query result — read it where it is needed (18 §6)",
        });
      }
    }

    // The commonest shape of the violation: an effect that writes query data into state. It is the
    // one that looks most like ordinary React and is hardest to spot in review.
    const effectRe = /\buseEffect\s*\(/g;
    for (let m = effectRe.exec(code); m !== null; m = effectRe.exec(code)) {
      const span = callSpan(code, m.index + m[0].length - 1);
      if (/\.data\b/.test(span) && /\bset[A-Z]\w*\s*\(/.test(span)) {
        violations.push({
          rule: "effect-sync",
          file,
          detail: "useEffect copies query data into state — the Commandment 5 violation (18 §6)",
        });
      }
    }
  }

  return violations;
};
