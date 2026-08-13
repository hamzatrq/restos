// ⚠ **MUTATION-TESTER-AUTHORED, and it is here because a MUTATION SURVIVED.** `24 §3` puts the
// acceptance suite in another session's hands (`branch-slice-seam.test.ts`) and the implementing
// session added two more after its own mutation round. This file makes one assertion none of them
// makes, written after measuring that its absence is exploitable in the worst available direction.
//
// ── THE MEASUREMENT ────────────────────────────────────────────────────────────────────────────
//
// `home.ts` holds ONE piece of mutable module state — `attachment` — and `branch.ts` is the only
// thing that fills it. Measured 2026-08-13, on this branch, with the shipped code otherwise
// untouched: deleting the single live `attachBranch(sourceOver(...))` call from
// `attachBranchSlice()` — so the store still opens, the cloud session still starts, and the ledger
// still fills — leaves
//
//   · **64 of 64 tests in this package GREEN**,
//   · `pnpm seams:check` **clean at exit 0**,
//   · `pnpm -C apps/manager typecheck` **exit 0**,
//
// while `managerHomeNow()` returns `{ unavailable: "the branch slice has not been opened on this
// device yet" }` for the life of the process. The console renders the `05-F23` offline arm for
// ever, over a full and freshly-synced branch slice: **the exact decorative state this whole track
// existed to end, wearing a different sentence.**
//
// `seams:check` cannot see it and its clean run is not a bug in the rail: Rule A asks whether
// shipping code REACHES an export, and `branch.ts` goes on importing `attachBranch` for the two
// honest failure arms below — so the symbol is reached, by a mention that is not the use that
// matters. That is AGENTS.md's own *"A MENTION IS NOT A USE"* one layer down from where it is
// usually paid for, and it is the same defect the oracle's author found inside their own first
// draft (their M13: *"the mutant renamed only the CALL — the import still named the symbol"*).
//
// ── WHAT THIS CAN AND CANNOT SEE ───────────────────────────────────────────────────────────────
//
// CAN: that the shipped composition contains at least one `attachBranch(...)` that hands over a
// LIVE SOURCE, and at least one that reports a reason (`05-F22`).
//
// CANNOT: whether the source it hands over is the right one. `branch.ts` opens an op-sqlite
// database at module scope, so it cannot be imported under Node and no assertion in this
// repository can CALL `attachBranchSlice()`. This reads SOURCE for the same reason
// `branch-slice-seam.test.ts` §C does, and it catches a wiring that was UNMADE — not one made
// wrongly. Both arms' behaviour is `branch-slice-seam.test.ts` §A/§B/§D's subject and is not
// re-tested here.
//
// It is deliberately blind to WHERE the composition lives (`24 §3b` leaves that to the
// implementer) and to the SHAPE of the live argument: an implementation that inlines the source
// object rather than calling a `sourceOver` helper is correct, and classifying by "is it the
// `unavailable` literal" rather than by the helper's name is what keeps this test from going red
// against it. A test that stays red under a correct implementation is rated as damaging as a
// vacuous one.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SRC = new URL("../", import.meta.url);

/** Comments stripped before anything is concluded — the header comment names the honest arm. */
const stripComments = (code: string): string => {
  let out = "";
  let i = 0;
  let quote: string | null = null;
  while (i < code.length) {
    const ch = code[i] as string;
    const next = code[i + 1];
    if (quote !== null) {
      out += ch;
      if (ch === "\\") {
        out += code[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < code.length && code[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < code.length && !(code[i] === "*" && code[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
};

/**
 * Every SHIPPED source file of this app, comment-stripped. `readdirSync(..., isFile())` skips
 * `__acceptance__` by construction, which is load-bearing: a test file calling `attachBranch` must
 * never be able to satisfy this.
 */
const shippedFiles = (): Map<string, string> => {
  const dir = SRC.pathname;
  const files = new Map<string, string>();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue;
    files.set(entry.name, stripComments(readFileSync(`${dir}${entry.name}`, "utf8")));
  }
  expect(files.size).toBeGreaterThanOrEqual(4); // 24-F14: an empty read passes every `not`
  return files;
};

const appSource = (): string => [...shippedFiles().values()].join("\n");

/**
 * Every `attachBranch(` call in the shipped app, split by what it hands over.
 *
 * `05-F22`'s honest arm passes an object literal carrying `unavailable`; anything else is a live
 * source. The declaration (`export const attachBranch = (`) cannot match — the pattern requires
 * the open parenthesis to follow the name directly.
 */
const attachCalls = (): { live: number; honest: number } => {
  const app = appSource();
  let live = 0;
  let honest = 0;
  for (const match of app.matchAll(/attachBranch\(([\s\S]{0,80})/g)) {
    const argument = (match[1] ?? "").trimStart();
    if (/^\{[\s\S]*?unavailable/.test(argument)) honest += 1;
    else live += 1;
  }
  return { live, honest };
};

describe("05 §8 — the shipped composition HANDS THE LIVE SLICE to the home model", () => {
  it("calls attachBranch with a live source, not only with a reason", () => {
    // THE assertion. Without it, `attachBranchSlice()` may open a real store, start a real cloud
    // session, fill a real ledger — and never tell the screen, with every gate in this repository
    // green. See the measurement in the header.
    expect(attachCalls().live).toBeGreaterThanOrEqual(1);
  });

  it("CONTROL: 05-F22's honest arm is still there too", () => {
    // Without this control the assertion above passes against a composition that DELETED the
    // offline arm — the opposite regression, and the one `alarm-honesty.test.ts` and
    // `branch-slice-seam.test.ts` §D exist to forbid. `05-F23`: a manager whose phone cannot reach
    // the branch must be told the alarm state is UNKNOWN, not shown a calm screen.
    expect(attachCalls().honest).toBeGreaterThanOrEqual(1);
  });

  it("and SOMETHING ELSE IN THE APP CALLS the file that does it", () => {
    // ⚠ **ADDED IN A SECOND MUTATION ROUND (2026-08-13), and it is a separate hole from the one
    // above.** Measured on this branch with the shipped code otherwise untouched: with `App.tsx`'s
    // `attachBranchSlice()` call deleted and its import left behind — the realistic slip, an
    // incomplete refactor rather than a contrived one — the composition root becomes dead code the
    // phone never runs, and
    //
    //   · **0 of 71 tests** in this package fail (including the assertion above: the live
    //     `attachBranch(` call is still THERE, it is simply never reached),
    //   · `pnpm -C apps/manager typecheck` is **exit 0**,
    //   · `pnpm lint` reports `noUnusedImports` and is **exit 0 anyway** — `biome check` exits 0
    //     on warnings, and this repo already carries one, so `pnpm verify`'s lint step cannot fail
    //     on it and a diff of exit codes shows nothing.
    //
    // `pnpm seams:check` DOES catch the coarser version (delete the import too, and Rule A reports
    // `attachBranchSlice [no importer at all]` at exit 1), so this assertion covers only the gap
    // between "not imported" and "imported but never called" — which is exactly AGENTS.md's *"a
    // MENTION IS NOT A USE"*, one layer above where the rail can see it.
    //
    // Deliberately rename-proof: it does not name `attachBranchSlice`. It finds whichever shipped
    // file holds the live `attachBranch(` call, takes THAT file's own exports, and requires at
    // least one of them to be CALLED from a different shipped file. An implementer who moves or
    // renames the composition root under `24 §3b` keeps this green; one who stops invoking it does
    // not.
    const files = shippedFiles();
    const roots = [...files].filter(([, code]) =>
      [...code.matchAll(/attachBranch\(([\s\S]{0,80})/g)].some(
        (match) => !/^\{[\s\S]*?unavailable/.test((match[1] ?? "").trimStart()),
      ),
    );
    expect(roots.length).toBeGreaterThanOrEqual(1); // 24-F14

    for (const [name, code] of roots) {
      const exported = [
        ...code.matchAll(/export\s+(?:const|function|async\s+function)\s+([A-Za-z_$][\w$]*)/g),
      ].map((match) => match[1] as string);
      expect(exported.length).toBeGreaterThanOrEqual(1); // 24-F14
      const invoked = exported.filter((symbol) =>
        [...files].some(
          ([other, source]) => other !== name && new RegExp(`\\b${symbol}\\s*\\(`).test(source),
        ),
      );
      expect(invoked.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("24-F14: it is reading a file that actually contains the seam", () => {
    // An empty or wrongly-rooted read would report zero of both, and zero honest arms would fail
    // the control above — but only after the first assertion had already passed by not looking.
    const { live, honest } = attachCalls();
    expect(live + honest).toBeGreaterThanOrEqual(2);
    // ⚠ **A LINE WAS DELETED HERE ON 2026-08-13 AND THE DELETION IS THE POINT.** It read
    // `expect(appSource()).toContain("attachBranchSlice")`, and a NEGATIVE CONTROL caught it: a
    // pure rename of the composition root (`attachBranchSlice` → `openBranchSlice`, followed
    // through `App.tsx`) is a behaviour-preserving refactor, and it reddened this assertion and
    // nothing else across 1929 tests. AGENTS.md's round-3 law rates *"a test that stays RED under
    // a CORRECT implementation"* as damaging as a vacuous one, and this file's own header promises
    // to be *"deliberately blind to WHERE the composition lives"* — a hardcoded symbol name is the
    // opposite of that promise. Its non-vacuity job is already done by the line above (which
    // cannot reach 2 without finding real calls) and by `shippedFiles()`'s own file-count floor.
  });
});
