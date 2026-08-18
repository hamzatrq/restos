/**
 * **`14-F14` AS A SURFACE AN OWNER OPERATES — the back office's fourth section.**
 *
 * ⚠ **AUTHORED FROM SPEC TEXT ONLY** (`24 §3` step 2), by a session that wrote no implementation
 * of this screen and read no build sequence for it. Every policy below cites an FR that resolves.
 *
 * PROVENANCE — read verbatim before a single assertion was designed:
 *   · `14-F14` — "User CRUD with role × per-location assignment; per-user permission overrides
 *     within matrix bounds; PIN set/reset (never displayed; Argon2id per 00 §5.4); deactivation
 *     preserves historical attribution."
 *   · `14-F39` — `user.manage` is the action and it is **owner-only**; "`01-F71` still binds
 *     underneath it: the org comes from the authenticated subject and never from the request".
 *   · `14-F1` (org-scoped, role-gated) · `14-F2` (every change emits, with actor) · `14-F3` (the
 *     change history of any entity is browsable in place) · `14-F4` (distribution state, honestly
 *     aged per `00 §5.7`).
 *   · `14-F32` — "One task per form: the editor is chosen by the JOB, not by the entity", after the
 *     founder read the shipped catalog editor and said *"this is very complex interface. What even
 *     is this. this is so hard to use. I cant understand a single thing."* `14-F33`: "No control on
 *     this surface accepts an id."
 *   · `01-F26` (User × Role × per-location assignment) · `01-F61` (the staff grid's EXPLICIT
 *     ordinal — a derived order is banned) · `11-F20` (the name is required and is never an
 *     identifier) · `11-F22` (participation is per-(person, branch); rendering is independent of
 *     it) · `11-F23`/R32 (the credential row is deleted on departure; re-activation is a two-step
 *     act whose skipped second step must fail LEGIBLY).
 *   · Founder rulings **R29** (the owner sets the first PIN and tells her) and **R30** (a till-only
 *     cashier has no email; email is required only for BACK-OFFICE access).
 *   · `14-F40` — the change-MY-PIN surface is the till's and is blocked on the wire. An
 *     owner-set/reset is `14-F14`'s and is here. Nothing below asserts a self-service path.
 *
 * ── ⚠ THE COVERAGE BOUNDARY, STATED BECAUSE A CLEAN RUN HERE WOULD OTHERWISE IMPLY IT ──────────
 *
 * **These tests run under happy-dom, which performs no layout at all**: every
 * `getBoundingClientRect` is zeroes. So this file can express *"the control is in the document"*
 * and can never express *"the control is on the screen"*. That distinction has produced NINE
 * measured layout defects in this repo — every one found by launching an app or by the gate built
 * from that habit, and **zero** by a suite.
 *
 * **And `apps/backoffice` has no layout gate at all.** Measured against the root `package.json` on
 * 2026-08-18: `"layout:check": "pnpm -C apps/pos-electron layout:check && pnpm -C apps/pass-kds
 * layout:check"` — two Electron apps, and this one is neither. `apps/backoffice/CLAUDE.md` records
 * the same fact from the other side ("no gate in this repo looks at these screens at any width")
 * and lists three defects found by LOOKING that no rail here could see, including a price that
 * rendered `3200` as `32`.
 *
 * So a green run of this file is evidence that the screen SENDS the right things and SAYS the right
 * things. It is not evidence that an owner can see them, reach them, or press them. That has to be
 * bought by opening the app.
 *
 * ── THREE RULES THIS FILE IS NOT THE GUARD FOR, AND WHO IS ─────────────────────────────────────
 *
 * Stated as boundaries because a file this long invites the opposite reading, and because in each
 * case the rail a reader would ASSUME covers it has been measured and does not:
 *
 *   1. **`00 §5.6`, sentences that live in the catalogue.** `staff-language.test.ts` is this file's
 *      structural half and it is the ONLY thing standing between this screen and that rule.
 *      Measured with a sentence typed straight into `staff-screen.tsx`: `pnpm strings:check` is
 *      **exit 0 and clean** — it scanned the inlined sentence and found no jargon in it, which is
 *      the only question that rail asks — while `staff-language.test.ts` goes red. Nothing in THIS
 *      file reads the source at all.
 *   2. **Commandment 5, the two-plane law.** A `sync-client` import in the shipped screen is caught
 *      by the pre-existing `two-plane.test.ts`, which scans every file in the app; measured, it
 *      fails **no test in this file**. §A's "reads the cloud plane only" is a claim about what the
 *      mounted screen ASKS FOR, which is a different claim from what its source imports.
 *   3. **The seam to the product.** `pnpm seams:check` is **clean** when `workspace.tsx` mounts a
 *      placeholder in place of this screen: a component imported by a shell that never renders it
 *      is still a reached export, and neither of that rail's two rules can express the difference.
 *      §G's *"choosing it renders the roster"* is the only guard against instance sixteen of the
 *      wave's recurring defect, and it is one test.
 *
 * ── CONTRACTED SURFACE (binding on the implementation session, and contestable) ─────────────────
 *
 * The corpus decides the acts, the gate, the ordering and the vocabulary. It does not name a
 * module, an export or an accessible name, so these are pinned HERE and follow this app's own
 * precedents (`device-list.tsx` for a list with an irreversible act, `workspace.tsx` for the rail):
 *
 *   `../components/staff-screen` exporting `StaffScreen` — mounted by `workspace.tsx` as a FOURTH
 *   tab, APPENDED (`14-F31` recorded that rule when the third landed: `27-F4` binds positional
 *   muscle memory, so a new section goes after the ones that exist and never between them).
 *
 *   Reads: `users.list` (the roster, in the server's order) and `tenancy.directory` (the org's
 *   branches, BY NAME — `21-F15`, and it is the only branch list on this plane).
 *   Writes: `users.create`, `users.setPin`, `users.setAssignments`, `users.deactivate` — the four
 *   procedures that landed with `14-F2`'s `user.changed` producer behind them.
 *
 *   Controls are found by ACCESSIBLE NAME, with permissive regexes: the person's name `/name/i`,
 *   `/email/i`, `/pin/i`, the role `/role|job/i`, the branch `/branch|location/i`. A choice control
 *   must be a labelled `<select>` or a radio group inside a `<fieldset>` whose `<legend>` names it —
 *   both are what this app already ships (`ui/field.tsx`, `apply-when.tsx`). **A control this file
 *   cannot find is a control a screen-reader user cannot find either** (`18 §7`'s accessibility
 *   floor: "keyboard operability + labels on all internal tools"), so a helper's failure is an
 *   assertion and not a harness limitation.
 *
 * ── THE FIXTURE IS THE COVERAGE BOUNDARY, SO IT VARIES SIX THINGS ON PURPOSE ────────────────────
 *
 * `K-4`'s recorded failure was varying `spec` and `profile` across ~90 renders and never varying
 * `data`. The equivalent here is one person, one branch, one role, everybody with an email, a list
 * that is never empty and a caller who is always an owner. So the roster carries **four** people
 * across **three** role kinds; one has **no email** (R30) and one has **two branches**; one is
 * **departed** (`11-F22`) and one is **org-wide** (`branch_id: null`); the roster is also driven
 * **empty**, **refused** and **forbidden**; and the branch directory is driven populated, partial
 * (one branch named and one not — round 3, and the only one of the three that catches the repair an
 * implementer reaches for first, see §H) and
 * **empty**, which is the state every real tenant is in today (`services/api/src/tenancy.ts`:
 * "NOTHING WRITES EITHER TABLE YET … `branches` is `[]` for every tenant").
 *
 * ── WHAT THIS SUITE DELIBERATELY DOES NOT ASSERT ───────────────────────────────────────────────
 *
 *   · **Anything about layout, legibility or reachability** — see the boundary above.
 *   · **`14-F14`'s per-user permission overrides.** Nothing in this product models one and no FR
 *     states their shape (`packages/domain/src/permissions.ts`), so building one would be inventing
 *     policy (commandment 2). §B asserts that none is invented; it does not ask for one.
 *   · **`14-F3`'s history rendered in place and `14-F15`'s per-user login history.** `user.changed`
 *     rows exist in `01-F62`'s store and **no procedure serves them**, so the screen has nothing to
 *     read. §F asserts only that nothing is INVENTED in their place.
 *   · **The exact wording of any sentence.** Copy is the string catalogue's and is already ruled by
 *     `14-F38` + `pnpm strings:check` + `owner-language.test.ts`. Where a sentence must EXIST this
 *     file matches it permissively and says so.
 *   · **A real distribution read.** `14-F4` wants "live on 4 of 5 devices" and no procedure can
 *     answer it for a roster; the day one can, §F's negative supersedes and must be amended in that
 *     change rather than deleted.
 *
 * ── MUTATION EVIDENCE (the round-3 law), IN TWO ROUNDS ─────────────────────────────────────────
 *
 * **Round 1 — the author's own.** A plausible implementation was built OUT-OF-TREE, wired into a
 * temporary fourth tab, and this file taken **43/43 green** against it — because "a test that stays
 * RED under a CORRECT implementation is as damaging as a vacuous one", and this round of the wave
 * produced three. Twenty-one mutants were then run against that probe, one branch each, full file
 * every time: **18 killed, 1 CONTROL survivor (two metadata spans swapped — 0 killed, so the kill
 * counts are attributable), and 2 real survivors that were repairs to THIS file rather than to the
 * probe.** Both survivors are recorded at the assertion they belong to, because both are this
 * wave's named defect committed inside the oracle written to catch it: a `/till|device/i` sweep
 * satisfied by an unrelated row label, and a re-activation ban that missed a button named simply
 * *"Activate"*.
 *
 * **Round 2 — an adversarial prover, and it found FIVE assertions that were not assertions.** Its
 * 55 mutants were re-run against the repaired file in one 62-run pass (56 mutants, 5 controls, a
 * baseline), each one branch, the FULL `apps/backoffice` suite every time, `REAL_EXIT` read from a
 * marker written inside each log. The counts below are failures in `staff-screen.dom.test.tsx`
 * itself; every run also carries the one pre-existing `owner-summary` failure described in the ⚠
 * at the end of this header, which is not this file's.
 *
 *   | the gap | mutant, one branch | before | after |
 *   |---|---|---|---|
 *   | §A `null` read over a glued `textContent` | `{String(person.email)}` | **0** | 1 |
 *   | …the same with a leading space · as `Email: null` | | **0 · 0** | 1 · 1 |
 *   | §D the forbidden word over the same glue | a `Delete` control beside `Edit where she works` | **0** | 1 |
 *   | §D "declining sends nothing", read synchronously | the decline control ALSO fires the mutation | **0** | 1 |
 *   | §B "refused or NAMED", read over the whole body | create an active person, set no PIN, report success (two shapes) | **0 · 0** | 1 · 1 |
 *   | §B a foreign branch, guarded only on an EMPTY directory | a foreign-org branch offered when the directory is populated | **0** | 1 |
 *   | §D a consequence of eight words, read from an ANCESTOR | the consequence cut to *"Are you sure"* | **0** | 1 |
 *   | §D nothing required the confirmation to name her | the consequence says *"She"* throughout | **no assertion** | 1 |
 *
 * **Four of those rows are ONE root cause**, and it is the transferable finding of the round:
 * `textContent` glues siblings with no separator, so a `\b` over a rendered subtree is a claim
 * about where the implementation put its element boundaries. The full measurement, including the
 * variants that killed 1 because a single space was added, is at `phrases`.
 *
 * **Nothing was traded for it.** All 55 of the prover's mutants were re-run: 16 counts went UP, 39
 * are unchanged, and **none went down** — the three assertions rewritten here bite strictly more
 * than the ones they replace, and the three new tests killed nothing that was already dead.
 *
 * **The controls stay at zero**, which is what makes the column above attributable: two metadata
 * spans swapped, the opener renamed, a button variant changed, an extra wrapper div — and a fifth
 * added for the naming assertion, which renders her name in an element of its OWN and kills **0**.
 * That last one is the control that matters most: the first draft of the naming assertion read a
 * STRING diff of what appeared, and a name rendered in its own element is a string already on her
 * row, so it failed a correct implementation. It reads nodes now, and the control proves the
 * requirement is *that she is named* rather than *how she is composed*.
 *
 * **Round 3 — an adversarial review of the SHIPPED screen, and it found two states this file drove
 * past.** Both were invisible to all 46 tests here: the suite was **46/46 green** against an
 * implementation that renders `branch-gulberg` in three name slots and that duplicates a person
 * permanently on a failed PIN. Nine tests were added (§0 one, §B three, §H five) and the file went
 * 46 → 55.
 *
 *   | the gap | mutant, one branch | kills | which test |
 *   |---|---|---|---|
 *   | `21-F15` — the id in the name slot | N1 the shipped `?? branch_id` fallback restored | **3** | §H empty · row treatment · partial |
 *   | …the repair that is one case narrow | N2 the treatment only when the directory is EMPTY | **1** | §H **partial only** |
 *   | …the treatment that retires the question | N3 the "where it is set" statement deleted | **1** | §H says-WHERE |
 *   | …exception (b) without its label | N4 the demoted id keeps its place, loses its label | **2** | §H empty · partial |
 *   | …a slot that never asks `placeLabel` | N6 the row prints `branch_id` on EVERY row | **3** | §H empty · **populated** · partial |
 *   | the partial hire, unspoken | P1 the notice becomes a bare failure | **1** | §B told |
 *   | …and repeated | P2 the still-open form re-runs `create` (shipped) | **1** | §B second person |
 *   | …on a roster that never re-read | P3 invalidate only when the task completes | **1** | §B re-read |
 *   | **CONTROL** | N5 the row's two metadata facts swap order | **0** | — |
 *   | **CONTROL** | P4 the notice keeps its words, changes tone and gains a wrapper | **0** | — |
 *
 * Every row is one branch, run against the FULL `apps/backoffice` suite (16 files, 329 tests) with
 * `REAL_EXIT` read from a marker written inside each log, against an out-of-tree probe repaired to
 * a plausible correct implementation — **which takes all 55 green**, because a test that stays RED
 * under a correct implementation is as damaging as a vacuous one. **In every row the only failing
 * file was this one, and inside it only the named test**: the 46 that existed before round 3 fired
 * zero times across ten mutants, which is the measurement that says why both defects shipped.
 *
 * ⚠ **THE PROBE WAS BUILT OUT-OF-TREE FOR A REASON THAT IS NOT THE USUAL ONE.** `staff-screen.tsx`
 * was UNTRACKED and `strings.ts` MODIFIED in the working tree while this ran — another session's
 * uncommitted work — so an in-tree mutate-and-revert would have restored over a file somebody was
 * still writing. AGENTS.md's rule about not staging another agent's half-written files has a
 * mutation-shaped twin: **do not mutate a file you did not write while its author is still in the
 * tree.** The probe is a copy of `apps/backoffice` with `node_modules` symlinked back; the shipped
 * files were verified byte-identical (md5) before and after.
 *
 * ⚠ **N3 WAS A SURVIVOR ON ITS FIRST RUN, AND ITS CAUSE IS THIS WAVE'S NAMED DEFECT COMMITTED
 * INSIDE THE SECTION WRITTEN TO CLOSE IT.** The "says where the name is set" assertion swept every
 * leaf on the screen and was satisfied by `"Branch manager · Branch not named"` — a ROW LABEL, six
 * "words" once the `·` is counted, both matchers happy. That is §F's own recorded failure ("a
 * `/till|device/i` sweep satisfied by an unrelated row label") reproduced one section over, and
 * **reading the assertion would never have found it**; only deleting the statement did. Fixed with
 * §F's remedy — the rows are excluded, because a row cannot be the statement about itself.
 *
 * ⚠ **THE SHIPPED `placeLabel` CARRIES AN ARGUMENT AGAINST §H, AND §H IS BUILT TO ANSWER IT RATHER
 * THAN TO OVERRULE IT.** Its comment says the fallback is the identifier "rather than a sentence"
 * because *"an owner with two branches has to be able to tell one departure from the other, and
 * 'unnamed branch' twice on one row cannot"*. That concern is real and `21-F15` already answers it:
 * exception (b) is a **secondary, explicitly labelled technical id offered for support beside** the
 * name — this app's own twice-shipped shape — and the sweep permits exactly that (`declaredTechnical`).
 * So the road is open; what is closed is the id occupying the slot. N4 is the mutant that proves the
 * exception is not a hole: strip the label, keep the demotion, and the sweep still fires.
 *
 * ⚠ **ONE PRE-EXISTING TEST FAILS THE MOMENT THE FOURTH TAB LANDS, AND IT IS NOT THIS FILE'S TO
 * FIX.** `owner-summary.dom.test.tsx:414` clicks EVERY navigation control in order and then asserts
 * the summary is on screen — which holds only while the summary is the LAST tab. Appending a fourth
 * (which `14-F31` and `27-F4` require) leaves the staff section mounted and that assertion fails on
 * `region("sales")`. Measured with the probe in place: 2 failures in the package, that one and the
 * probe's own inline strings. It is a finding for that suite's session (`24 §3`), and the repair is
 * one line there — click the controls and re-check after each, or re-click the one that mounted the
 * summary. **It must not be repaired by inserting this section anywhere but last.**
 */

import type { BranchListing, OrgListing } from "@restos/api/src/tenancy.js";
import type { PersonListing } from "@restos/api/src/user-directory.js";
import { ROLES } from "@restos/domain";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TRPCClientError } from "@trpc/client";
import { afterEach, describe, expect, it } from "vitest";
import { StaffScreen } from "../components/staff-screen";
import { Workspace } from "../components/workspace";
import { strings } from "../lib/strings";
import { type CallLog, type Handlers, Harness } from "./harness";

afterEach(cleanup);

// ───────────────────────────────────────────────────────────────────────────────────────────────
// The fixture. Typed against the PRODUCTION symbols (`PersonListing`, `BranchListing`), never a
// hand-copy: `K-3`'s recorded defect was an oracle declaring the interface it existed to deliver
// and then asserting against its own copy of it.
// ───────────────────────────────────────────────────────────────────────────────────────────────

const GULBERG = "branch-gulberg";
const DHA = "branch-dha";

const BRANCHES: readonly BranchListing[] = [
  { branch_id: GULBERG, display_name: "Gulberg", branch_type: "restaurant", branch_class: "t1" },
  { branch_id: DHA, display_name: "DHA Phase 5", branch_type: "restaurant", branch_class: "t1" },
];

const ORG: OrgListing = { org_id: "org-zaiqa", display_name: "Zaiqa", status: "active" };

/**
 * A till-only cashier: **no email** (R30 — "a cashier who only uses the till needs no email"), one
 * branch, `active`. She is the reason a required email field would be a founder ruling broken.
 */
const NADIA: PersonListing = {
  user_id: "u-nadia",
  display_name: "Nadia Khan",
  email: null,
  grid_ordinal: 10,
  assignments: [{ role: "cashier", branch_id: GULBERG, status: "active" }],
};

/**
 * Two branches, two roles (`01-F26`, `11-F22`). She is the only fixture that can tell a whole-set
 * write from a delta, and the only one that can tell a per-(person, branch) departure from an
 * org-wide one.
 */
const AYESHA: PersonListing = {
  user_id: "u-ayesha",
  display_name: "Ayesha Malik",
  email: "ayesha@zaiqa.test",
  grid_ordinal: 20,
  assignments: [
    { role: "branch_manager", branch_id: GULBERG, status: "active" },
    { role: "cashier", branch_id: DHA, status: "active" },
  ],
};

/**
 * Departed (`11-F22`: "a let-go cashier's name still renders on last month's orders", and the
 * record is retained FULL STOP). She is on the roster the server serves, so she is on the screen.
 */
const IMRAN: PersonListing = {
  user_id: "u-imran",
  display_name: "Imran Sheikh",
  email: null,
  grid_ordinal: 30,
  assignments: [{ role: "storekeeper", branch_id: DHA, status: "inactive" }],
};

/** Org-wide (`branch_id: null` — "how an owner holds Appendix A's everything", `01-F26`). */
const SANA: PersonListing = {
  user_id: "u-sana",
  display_name: "Sana Tariq",
  email: "sana@zaiqa.test",
  grid_ordinal: 40,
  assignments: [{ role: "owner", branch_id: null, status: "active" }],
};

/**
 * `01-F61`'s grid order, which is the SERVER's order. It agrees with neither of the two orders an
 * implementation might reach for: alphabetically it is Ayesha · Imran · Nadia · Sana, and by
 * `user_id` it is u-ayesha · u-imran · u-nadia · u-sana. Both differ from this in the first row,
 * which is what makes the ordering assertion discriminating rather than decorative.
 */
const ROSTER: readonly PersonListing[] = [NADIA, AYESHA, IMRAN, SANA];

const PEOPLE_NAMES = ROSTER.map((person) => person.display_name);

/** The id `users.create` MINTS. Nothing on the client may invent one (`01-F61`, `14-F33`). */
const MINTED_ID = "u-minted-by-the-server";

// ───────────────────────────────────────────────────────────────────────────────────────────────
// Harness plumbing
// ───────────────────────────────────────────────────────────────────────────────────────────────

type Sent = { path: string; input: unknown };

/** The refusal shape `services/api` puts on the wire for a matrix `deny` (`errorFormatter`). */
const forbidden = (): never => {
  throw TRPCClientError.from({
    error: {
      code: -32003,
      message: "authorization deny: user.manage",
      data: {
        code: "FORBIDDEN",
        httpStatus: 403,
        authz: { outcome: "deny", action: "user.manage", satisfied_by: ["owner"] },
      },
    },
  });
};

const mount = (
  options: {
    roster?: readonly PersonListing[] | (() => never);
    branches?: readonly BranchListing[] | (() => never);
    extra?: Handlers;
  } = {},
): { log: CallLog; sent: Sent[] } => {
  const log: CallLog = [];
  const sent: Sent[] = [];
  const roster = options.roster ?? ROSTER;
  const branches = options.branches ?? BRANCHES;
  const record =
    (path: string, answer: (input: unknown) => unknown) =>
    (input: unknown): unknown => {
      sent.push({ path, input });
      return answer(input);
    };

  const handlers: Handlers = {
    "users.list": () => (typeof roster === "function" ? roster() : roster),
    "tenancy.directory": () => ({
      org: ORG,
      branches: typeof branches === "function" ? branches() : branches,
    }),
    "users.create": record("users.create", () => ({
      user_id: MINTED_ID,
      grid_ordinal: 50,
    })),
    "users.setPin": record("users.setPin", () => undefined),
    "users.setAssignments": record("users.setAssignments", () => undefined),
    "users.deactivate": record("users.deactivate", () => undefined),
    ...options.extra,
  };

  render(
    <Harness handlers={handlers} log={log}>
      <StaffScreen />
    </Harness>,
  );
  return { log, sent };
};

const settled = async (): Promise<void> => {
  await waitFor(() => expect(screen.queryByText(strings.errors.loading)).toBeNull());
};

const flat = (value: string | null | undefined): string =>
  (value ?? "").replace(/\s+/g, " ").trim();
const textOf = (element: Element | null): string => flat(element?.textContent);
const wordCount = (value: string): number => value.split(/\s+/).filter(Boolean).length;

/**
 * ⚠ **`textContent` GLUES SIBLINGS WITH NO SEPARATOR, AND THAT SILENTLY VOIDS EVERY WORD-BOUNDARY
 * REGEX WRITTEN OVER A RENDERED TREE.** React puts no whitespace between JSX siblings, so a row
 * whose spans read *Nadia Khan*, *null*, *Cashier*, *Gulberg*, *Working*, *Deactivate*, *Edit where
 * she works* has a `textContent` of `Nadia KhannullCashierGulbergWorkingDeactivateEdit where she
 * works` — and `/\bnull\b/i` does **not** match it, because the trailing `\b` fails against
 * `nullCashier`.
 *
 * **Measured, and it cost two assertions in this file their whole value:** the mutant that renders
 * `{String(person.email)}` on the till-only cashier killed **0 of 52**, and so did the one that
 * puts a `Delete` button beside `Edit where she works`. The *identical* mutants with one space
 * between the two elements killed 1 each — so the two assertions were discriminating between
 * markup shapes, not between screens.
 *
 * `phrases` is what those assertions read now: every element's OWN text, meaning the text nodes
 * that are its direct children and nothing from a sibling or a descendant element. Adjacent text
 * nodes inside one element are joined with a SPACE rather than concatenated, because `{a}{b}` is
 * two things and gluing them is the same defect one level down.
 *
 * This is worth carrying to any suite that greps a rendered tree: **a `\b` over `textContent` is a
 * claim about where the implementation happened to put its element boundaries.**
 */
const ownText = (element: Element): string =>
  flat(
    Array.from(element.childNodes)
      .filter((node) => node.nodeType === 3 /* Node.TEXT_NODE */)
      .map((node) => node.textContent ?? "")
      .join(" "),
  );

const phrases = (root: HTMLElement = document.body): readonly string[] =>
  [root, ...Array.from(root.querySelectorAll("*"))].map(ownText).filter((value) => value !== "");

/**
 * Several turns of the event loop, inside `act`, so that anything the last click set in motion has
 * arrived before a NEGATIVE assertion reads for it.
 *
 * ⚠ **A tRPC mutation reaches the link a microtask AFTER the click handler returns.** Instrumented
 * at the decline control: `sync=0 immediate=1 afterTick=1` — the call is made, and the synchronous
 * instant an assertion reads is the one instant at which it has not been. Every "nothing was sent"
 * in this file is worthless without this wait, and one of them was (see §D).
 */
const settleSends = async (): Promise<void> => {
  for (let turn = 0; turn < 5; turn += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
};

const buttons = (root: HTMLElement = document.body): readonly HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>("button"));

const buttonsNamed = (pattern: RegExp, root: HTMLElement = document.body): readonly HTMLElement[] =>
  buttons(root).filter((button) => pattern.test(textOf(button)));

/**
 * The smallest ancestor of a person's name that carries at least one control and names nobody
 * else — a row, whatever element the implementation chose for it. The "names nobody else" half is
 * what stops the walk at the list container on a screen whose rows carry no control of their own.
 */
const rowOf = (personName: string): HTMLElement => {
  const others = PEOPLE_NAMES.filter((name) => name !== personName);
  let element: HTMLElement | null = screen.getByText(personName).parentElement;
  let widest: HTMLElement | null = null;
  while (element !== null && element !== document.body) {
    const content = textOf(element);
    if (others.some((name) => content.includes(name))) break;
    widest = element;
    element = element.parentElement;
  }
  if (widest === null) {
    throw new Error(
      `no row found for ${personName}: its name shares an element with another person`,
    );
  }
  return widest;
};

/** The label text bound to a control, by `htmlFor`, `aria-label` or an enclosing `<label>`. */
const labelFor = (control: Element): string => {
  const id = control.getAttribute("id");
  const aria = control.getAttribute("aria-label");
  if (aria !== null) return flat(aria);
  if (id !== null) {
    const label = document.querySelector(`label[for="${id}"]`);
    if (label !== null) return textOf(label);
  }
  const enclosing = control.closest("label");
  if (enclosing !== null) return textOf(enclosing);
  const fieldset = control.closest("fieldset");
  const legend = fieldset?.querySelector("legend") ?? null;
  return textOf(legend);
};

type Choice = { readonly label: string; readonly choose: () => void };

/**
 * The choices a control offers, whether it is a `<select>` or a radio group. Values are read off
 * the DOM rather than assumed, so an implementation is free to use any token it likes — what the
 * assertions read is what the screen SENDS, never what its markup happens to spell.
 *
 * An option with an empty value is a placeholder ("Choose one") and is not a choice.
 */
const choicesFor = (pattern: RegExp, root: HTMLElement = document.body): readonly Choice[] => {
  for (const select of Array.from(root.querySelectorAll("select"))) {
    if (!pattern.test(labelFor(select))) continue;
    return Array.from(select.options)
      .filter((option) => option.value !== "")
      .map((option) => ({
        label: flat(option.textContent),
        choose: () => fireEvent.change(select, { target: { value: option.value } }),
      }));
  }
  const groups = [
    ...Array.from(root.querySelectorAll<HTMLElement>("fieldset")),
    ...Array.from(root.querySelectorAll<HTMLElement>('[role="radiogroup"]')),
  ].filter((group) => {
    const legend = group.querySelector("legend");
    return pattern.test(textOf(legend)) || pattern.test(flat(group.getAttribute("aria-label")));
  });
  for (const group of groups) {
    const radios = [
      ...Array.from(group.querySelectorAll<HTMLElement>('input[type="radio"]')),
      ...Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]')),
    ];
    if (radios.length === 0) continue;
    return radios.map((radio) => ({
      label: labelFor(radio),
      choose: () => fireEvent.click(radio),
    }));
  }
  return [];
};

const requireChoices = (pattern: RegExp, what: string): readonly Choice[] => {
  const found = choicesFor(pattern);
  if (found.length === 0) {
    throw new Error(
      `no ${what} choice control found (looked for a <select> or a radio group named ${String(
        pattern,
      )}). 14-F14 requires role × per-location assignment, and a control this suite cannot find ` +
        `by its accessible name is one a screen-reader user cannot find either (18 §7).`,
    );
  }
  return found;
};

const fill = (pattern: RegExp, value: string): void => {
  const control = screen.getByLabelText(pattern);
  fireEvent.change(control, { target: { value } });
};

/**
 * Opens the "add a person" task if it is not already open. `14-F32`'s shape — a task named in the
 * owner's vocabulary — is the FR's; whether it is inline or behind one control is the
 * implementation's, and both are accepted here.
 */
const openHireTask = async (): Promise<void> => {
  if (screen.queryByLabelText(/name/i) !== null) return;
  // Waited for rather than demanded on the first tick: a screen that renders its controls after
  // its first query settles is correct, and a helper that could not tolerate it would fail an
  // implementation for being asynchronous.
  await waitFor(() => {
    if (buttonsNamed(/add|new|hire|invite/i).length === 0) {
      throw new Error(
        "no control opens 14-F14's create task — looked for a button named /add|new|hire|invite/i",
      );
    }
  });
  fireEvent.click(buttonsNamed(/add|new|hire|invite/i)[0] as HTMLElement);
  await waitFor(() => expect(screen.queryByLabelText(/name/i)).not.toBeNull());
};

/** A live control, resolved by its label at the moment it is asked for. */
const controlNamed = (pattern: RegExp): HTMLElement => {
  const found = Array.from(document.querySelectorAll<HTMLElement>("input, select, textarea")).find(
    (control) => pattern.test(labelFor(control)),
  );
  if (found === undefined) throw new Error(`no control is labelled ${String(pattern)}`);
  return found;
};

/**
 * Presses whatever commits the form the named control belongs to.
 *
 * **It walks UP from the control rather than scanning the screen**, and that is not a nicety: a
 * roster screen has an opener ("Add a person") on it at the same time as a form ("Save"), and a
 * flat scan finds whichever the implementation happened to render first. The innermost ancestor
 * holding both this control and a commit button is the form, whatever element it turned out to be.
 * A `<form>` submit is accepted too, for an implementation that commits with the Enter key.
 *
 * ⚠ **The control is re-resolved HERE rather than passed in**, because React may replace the node
 * between a choice and the commit — an out-of-tree probe did exactly that (a changed `key`
 * remounted the row) and the walk then started from a DETACHED element and reached no form. A
 * helper that holds a node across a re-render is testing its own bookkeeping.
 */
const commitFrom = (pattern: RegExp): void => {
  const COMMIT = /save|create|hire|done|finish|confirm|update|apply/i;
  const NOT_COMMIT = /cancel|keep|back|not now|discard|close/i;
  for (const named of [COMMIT, /add|new/i]) {
    let element: HTMLElement | null = controlNamed(pattern);
    while (element !== null && element !== document.body) {
      const candidate = buttonsNamed(named, element).find(
        (button) => !NOT_COMMIT.test(textOf(button)),
      );
      if (candidate !== undefined) {
        fireEvent.click(candidate);
        return;
      }
      element = element.parentElement;
    }
  }
  const form = controlNamed(pattern).closest("form");
  if (form === null) {
    throw new Error("nothing commits this form: no button named to commit it, and no <form>");
  }
  fireEvent.submit(form);
};

/** The whole hire, as an owner performs it: a name, a job, a place, and a PIN (R29). */
const hire = async (person: {
  name: string;
  email?: string;
  roleIndex?: number;
  branchLabel?: string;
  pin?: string;
}): Promise<void> => {
  await openHireTask();
  fill(/name/i, person.name);
  if (person.email !== undefined) fill(/email/i, person.email);
  const roles = requireChoices(/role|job/i, "role");
  (roles[person.roleIndex ?? 0] as Choice).choose();
  if (person.branchLabel !== undefined) {
    const branches = requireChoices(/branch|location/i, "branch");
    const chosen = branches.find((choice) => choice.label.includes(person.branchLabel as string));
    if (chosen === undefined) {
      throw new Error(
        `the branch control does not offer ${person.branchLabel} — it offers: ${branches
          .map((choice) => choice.label)
          .join(" | ")}`,
      );
    }
    chosen.choose();
  }
  if (person.pin !== undefined) fill(/pin/i, person.pin);
  commitFrom(/name/i);
};

/** The roster is on screen. Used wherever a test acts on a ROW rather than on the form. */
const rosterShown = async (): Promise<void> => {
  await screen.findByText(NADIA.display_name);
};

/**
 * The three NEGATIVE patterns, declared once and used twice — by §0, which proves each one bites,
 * and by the section that spends it. **They are shared constants and not copies on purpose**: `K-3`'s
 * recorded defect was an oracle that declared the interface it existed to deliver and then asserted
 * against a hand-copy of it, and two regexes that drift make §0's proof worthless.
 */
/** `14-F4` — a distribution figure no procedure on this plane can answer. */
const DISTRIBUTION_CLAIM =
  /live on \d|\d+\s+of\s+\d+\s+(devices?|tills?)|up to date|in sync\b|\bsynced\b/i;
/** `14-F3`/`14-F15` — an attribution no read serves. */
const HISTORY_CLAIM = /changed by|updated by|last changed|last updated|edited by/i;
/** `11-F20` — "a person record is never deleted", so the word is not this surface's to use. */
const DELETION_LANGUAGE = /\bdeleted?\b|permanently removed|erase/i;

const inputsTo = (sent: readonly Sent[], path: string): readonly Record<string, unknown>[] =>
  sent.filter((call) => call.path === path).map((call) => call.input as Record<string, unknown>);

// ───────────────────────────────────────────────────────────────────────────────────────────────
// The deactivation helpers. **Declared here rather than inside §D (a mechanical hoist, August
// 2026)** because §H arms the same act on a different fixture, and two copies of `DEACTIVATE`
// drift — `K-3`'s recorded defect, which `phrases` above already carries a warning about.
// ───────────────────────────────────────────────────────────────────────────────────────────────

const DEACTIVATE = /deactivate|let go|no longer|remove from|end (her|his)|leave/i;

/** Declined, in every wording an implementation might choose. Declared once, spent three times. */
const DECLINE = /no,|keep|cancel|not now|back|never/i;

const arm = async (personName: string, branchName?: string): Promise<void> => {
  const row = rowOf(personName);
  const controls = buttonsNamed(DEACTIVATE, row);
  if (controls.length === 0) {
    throw new Error(`no deactivation control on ${personName}'s row (14-F14)`);
  }
  const scoped =
    branchName === undefined
      ? controls[0]
      : (controls.find((control) => {
          let element: HTMLElement | null = control;
          while (element !== null && element !== row) {
            if (textOf(element).includes(branchName)) return true;
            element = element.parentElement;
          }
          return controls.length === 1;
        }) ?? controls[0]);
  fireEvent.click(scoped as HTMLElement);
  if (branchName !== undefined) {
    const places = choicesFor(/branch|location|where/i);
    const place = places.find((choice) => choice.label.includes(branchName));
    if (place !== undefined) place.choose();
  }
};

const confirm = (before: readonly string[]): void => {
  const fresh = buttons().filter((button) => !before.includes(textOf(button)));
  const yes = fresh.find((button) => !DECLINE.test(textOf(button)));
  if (yes === undefined) throw new Error("the confirmation offers nothing to confirm with");
  fireEvent.click(yes);
};

// ───────────────────────────────────────────────────────────────────────────────────────────────
// `21-F15`, THE NAMING LAW — its machinery, declared here because §0 proves it bites before §H
// spends it, and because the same sweep is spent on three different directories.
// ───────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Every machine identifier this fixture carries. `21-F15` defines the term itself — "any value
 * whose only purpose is to be a key: org, branch, device and user ids, event and entity ids" — so
 * the sweep does not stop at the branch ids the review measured on the glass. A sweep narrowed to
 * the one id someone has already seen on a screen is the same guard pointed one case away.
 */
const MACHINE_IDS: readonly string[] = [
  GULBERG,
  DHA,
  ORG.org_id,
  ...ROSTER.map((person) => person.user_id),
];

/**
 * `21-F15` exception (b): "a secondary, explicitly labelled **technical id** offered for support
 * beside a name, copyable". This app ships that twice — `Problem`'s demoted `<details>` under
 * *Technical detail*, and the pending row's demoted identity — so the exception is real here and
 * the sweep honours it.
 *
 * ⚠ **Read WITHOUT climbing the tree, and that is the load-bearing half.** An ancestor walk finds
 * *some* `<summary>`, or the word "id" in *some* heading, on any screen large enough to matter, and
 * would exempt the whole document. What counts is the element's own words, its `aria-label`, the
 * sibling that labels it, or the `<details>` it is demoted inside — nothing further away, because
 * nothing further away is what an owner reads as the label of THIS value.
 */
const TECHNICAL_LABEL = /\btechnical\b|\bidentifiers?\b|\bids?\b|for support|\breference\b/i;

const declaredTechnical = (element: Element): boolean => {
  if (TECHNICAL_LABEL.test(ownText(element))) return true;
  if (TECHNICAL_LABEL.test(flat(element.getAttribute("aria-label")))) return true;
  const previous = element.previousElementSibling;
  if (previous !== null && TECHNICAL_LABEL.test(ownText(previous))) return true;
  const details = element.closest("details");
  const summary = details === null ? null : details.querySelector("summary");
  return summary !== null && TECHNICAL_LABEL.test(textOf(summary));
};

/**
 * Every element whose OWN words carry a machine identifier without declaring it one — that is,
 * every place on the screen where a key is standing in a name's slot.
 *
 * Per element, for the reason `phrases` carries in full: read over a glued `textContent` this
 * would be a claim about where the implementation put its element boundaries.
 */
const idsInNameSlots = (root: HTMLElement = document.body): readonly string[] =>
  [root, ...Array.from(root.querySelectorAll("*"))]
    .filter((element) => MACHINE_IDS.some((id) => ownText(element).includes(id)))
    .filter((element) => !declaredTechnical(element))
    .map((element) => `<${element.tagName.toLowerCase()}> ${ownText(element)}`);

/**
 * `21-F15`'s compliant shape for a record the product has no name for: "a stated **unnamed**
 * treatment that says what is missing and where it is set … it is never blank — a blank is the
 * same lie with less information."
 */
const UNNAMED_TREATMENT =
  /not named|no name\b|unnamed|nameless|needs a name|name (?:is )?(?:not set|missing)|without a name/i;

// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("0 · the suite's own patterns bite before they are used as evidence", () => {
  /**
   * `two-plane.test.ts` established this convention here and the reason it matters is measured: a
   * clean report from a matcher nothing has ever made fail is indistinguishable from a matcher that
   * matches nothing. Every NEGATIVE assertion in §D and §F fires here at a known violation first,
   * against the same constant it will later be spent on.
   */
  it("the 14-F4 distribution matcher fires on a fabricated figure", () => {
    expect(DISTRIBUTION_CLAIM.test("Live on 4 of 5 devices")).toBe(true);
    expect(DISTRIBUTION_CLAIM.test("This branch is up to date")).toBe(true);
    // …and not on the roster's ordinary content, or every screen would fail.
    expect(DISTRIBUTION_CLAIM.test("Nadia Khan · Cashier · Gulberg")).toBe(false);
  });

  it("the 14-F3 attribution matcher fires on an invented history line", () => {
    expect(HISTORY_CLAIM.test("Changed by Sana Tariq, 2 Jul")).toBe(true);
    expect(HISTORY_CLAIM.test("Ayesha Malik · Branch manager")).toBe(false);
  });

  it("the 11-F20 deletion matcher fires on the word the corpus forbids", () => {
    expect(DELETION_LANGUAGE.test("Delete this person")).toBe(true);
    // "Deactivate" is the act this screen DOES have, and it must not read as the one it does not.
    expect(DELETION_LANGUAGE.test("Deactivate at Gulberg")).toBe(false);
  });

  it("the phrase walk sees what a glued textContent hides — the root cause of two 0-kill mutants", () => {
    const row = document.createElement("div");
    row.append(
      ...["Nadia Khan", "null", "Cashier", "Delete"].map((value) => {
        const span = document.createElement("span");
        span.textContent = value;
        return span;
      }),
    );
    document.body.append(row);

    // What `textContent` gives — and why a word-boundary regex over it is evidence about the
    // markup rather than about the screen.
    expect(textOf(row)).toBe("Nadia KhannullCashierDelete");
    expect(/\bnull\b/i.test(textOf(row))).toBe(false);
    expect(DELETION_LANGUAGE.test(textOf(row))).toBe(false);

    // What the screen actually says, which is what §A and §D read.
    expect(phrases(row)).toEqual(["Nadia Khan", "null", "Cashier", "Delete"]);
    expect(phrases(row).some((phrase) => /\bnull\b/i.test(phrase))).toBe(true);
    expect(phrases(row).some((phrase) => DELETION_LANGUAGE.test(phrase))).toBe(true);

    // …and a sentence composed of two expressions inside ONE element stays one phrase, because
    // that is how a sentence is written — the case a per-text-node walk would have broken.
    const sentence = document.createElement("p");
    sentence.append(document.createTextNode("Nadia Khan"), document.createTextNode("— she stops"));
    expect(ownText(sentence)).toBe("Nadia Khan — she stops");

    row.remove();
  });

  it("the 21-F15 sweep fires on the row review measured, and not on a compliant one", () => {
    /**
     * The three rows below are the law's three states, and the sweep has to separate them or §H is
     * decoration. The first is **verbatim from the review** that sent this session: the roster row,
     * the deactivate control and the consequence sentence each rendered `branch-gulberg` where a
     * name belongs, on the only deployment state that exists today.
     */
    const rowOfSpans = (contents: readonly string[]): HTMLElement => {
      const element = document.createElement("div");
      element.append(
        ...contents.map((value) => {
          const span = document.createElement("span");
          span.textContent = value;
          return span;
        }),
      );
      document.body.append(element);
      return element;
    };

    const measured = rowOfSpans([
      "Nadia Khan",
      "Cashier · branch-gulberg",
      "Working",
      "Deactivate at branch-gulberg",
    ]);
    expect(idsInNameSlots(measured)).toHaveLength(2);
    measured.remove();

    // The same row with the name the directory knows. Nothing here may fire, or §H fails every
    // implementation including the correct one.
    const named = rowOfSpans([
      "Nadia Khan",
      "Cashier · Gulberg",
      "Working",
      "Deactivate at Gulberg",
    ]);
    expect(idsInNameSlots(named)).toEqual([]);
    named.remove();

    // The unnamed treatment, with `21-F15` exception (b) demoted beside it — the shape this app
    // already ships twice. Both halves must read as compliant, and the treatment must be findable.
    const treated = rowOfSpans([
      "Nadia Khan",
      "Cashier · branch not named",
      "Technical id",
      "branch-gulberg",
    ]);
    expect(idsInNameSlots(treated)).toEqual([]);
    expect(phrases(treated).some((phrase) => UNNAMED_TREATMENT.test(phrase))).toBe(true);
    // …and the treatment matcher does not fire on a row that simply names its branch, or the
    // "says what is missing" half of §H would be satisfied by every screen.
    expect(phrases(named).some((phrase) => UNNAMED_TREATMENT.test(phrase))).toBe(false);
    treated.remove();
  });
});

describe("A · 14-F14 — the roster is the SERVER's, whole and in its order", () => {
  it("renders every person the server serves, the departed one included (11-F20, 11-F22)", async () => {
    mount();
    for (const person of ROSTER) {
      expect(await screen.findByText(person.display_name)).toBeTruthy();
    }
  });

  it("renders them in the server's GRID order — not alphabetically and not by id (01-F61)", async () => {
    mount();
    await screen.findByText(NADIA.display_name);
    const body = textOf(document.body);
    const positions = PEOPLE_NAMES.map((name) => body.indexOf(name));
    expect(positions.every((at) => at >= 0)).toBe(true);
    // `01-F61` bans a derived order outright, and its first build shipped exactly this defect —
    // "invisible to a test that only re-renders the same roster, which is precisely how it
    // survived review". The fixture disagrees with both derivable orders in its first row.
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(positions[0]).toBeLessThan(positions[1] as number);
  });

  it("a departed person reads as departed, and an active one does not (11-F22)", async () => {
    mount();
    await screen.findByText(IMRAN.display_name);
    const departed = textOf(rowOf(IMRAN.display_name));
    const working = textOf(rowOf(NADIA.display_name));
    const DEPARTED = /inactive|no longer|deactivated|left|departed|former|ended/i;
    expect(DEPARTED.test(departed)).toBe(true);
    // The control: without it, a screen that stamps the same word on every row also passes.
    expect(DEPARTED.test(working)).toBe(false);
  });

  it("a till-only cashier's absent email is never rendered as an address (R30)", async () => {
    mount();
    await screen.findByText(NADIA.display_name);
    // `String(null)` is the four-letter string `"null"`, which reads as an address and satisfies
    // every type check — `users.ts` records it as the exact shape a till-only person must not
    // acquire on the way out of a reader.
    //
    // ⚠ **READ PER PHRASE, NOT OVER THE ROW'S `textContent`, AND THE DIFFERENCE IS THE WHOLE
    // ASSERTION.** `{String(person.email)}` renders a `null` whose next sibling is her role, so the
    // glued walk this line used to do reads `nullCashier` and `\bnull\b` cannot match. That mutant
    // — the exact shape named above — killed **0 of 52** until this changed; the same mutant with
    // one space between the two spans killed 1. The `/@/` half bit either way, because a character
    // class has no boundary to lose. See `phrases`.
    const offenders = phrases(rowOf(NADIA.display_name)).filter(
      (phrase) => /\bnull\b/i.test(phrase) || /@/.test(phrase),
    );
    expect(offenders).toEqual([]);
    // The control: a person who HAS an email has it rendered, so the assertion above is about the
    // absence rather than about a screen that renders no email at all.
    expect(textOf(rowOf(AYESHA.display_name))).toContain(AYESHA.email as string);
  });

  it("an EMPTY roster still offers the create task and claims nothing", async () => {
    mount({ roster: [] });
    await settled();
    // An empty roster is a true answer (the refusing fallback is what an unconfigured host gives),
    // so the screen must be usable in it — an owner's first act on a new tenant is a hire.
    await openHireTask();
    expect(screen.getByLabelText(/name/i)).toBeTruthy();
  });

  it("a REFUSED roster read renders the app's one failure surface, never an empty roster", async () => {
    mount({
      roster: () => {
        throw new Error("connect ECONNREFUSED 127.0.0.1:3001");
      },
    });
    // `Problem` is "the ONLY way this app renders a failed query" (`apps/backoffice/CLAUDE.md`),
    // and the alternative it replaced put `fetch failed` edge-to-edge as the whole application.
    expect(await screen.findByText(strings.unreachable.heading)).toBeTruthy();
    // `unconfiguredUserDirectory` refuses rather than answering `[]` for this exact reason: "an
    // empty roster is a CLAIM about who works at this restaurant". A failed read must not become
    // one on the way to the glass.
    expect(screen.queryByText(NADIA.display_name)).toBeNull();
    expect(buttonsNamed(/try again|retry/i).length).toBeGreaterThan(0);
  });

  it("Commandment 5 — it reads the cloud plane only, and asks nothing it does not need", async () => {
    const { log } = mount();
    await screen.findByText(NADIA.display_name);
    const paths = new Set(log.map((call) => call.path));
    expect([...paths].filter((path) => !/^(users|tenancy)\./.test(path))).toEqual([]);
    // `session.whoami` is the shell's gate, not this screen's: nothing here may decide from the
    // caller's own assignments what the caller may do (Commandment 8, and `auth-gate.tsx`'s own
    // recorded law — "no role is read, no permission is computed, no button is hidden by rank").
    expect(paths.has("session.whoami")).toBe(false);
  });
});

describe("B · 14-F14 — the hire is an owner's task, not the record's fields (14-F32)", () => {
  it("asks for no id, no ordinal, no status and no hash (14-F33)", async () => {
    mount();
    await settled();
    await openHireTask();
    const labelled = Array.from(document.querySelectorAll("input, select, textarea")).map(labelFor);
    const schemaShaped = labelled.filter((label) =>
      /\bid\b|identifier|ordinal|status|hash|org\b|user_id/i.test(label),
    );
    // `14-F33`: "No control on this surface accepts an id." `user_id` and `grid_ordinal` come BACK
    // from `create` and are never sent to it — only the writer, inside the transaction that
    // inserts, can assign an ordinal without two owners colliding.
    expect(schemaShaped).toEqual([]);
  });

  it("sends 14-F14's three facts and nothing else — no org, no id, no status (01-F71)", async () => {
    const { sent } = mount();
    await settled();
    await hire({ name: "Bilal Ahmed", roleIndex: 0, branchLabel: "Gulberg", pin: "4821" });
    await waitFor(() => expect(inputsTo(sent, "users.create")).toHaveLength(1));
    const input = inputsTo(sent, "users.create")[0] as Record<string, unknown>;
    expect(Object.keys(input).sort()).toEqual(["assignments", "display_name", "email"]);
    expect(input.display_name).toBe("Bilal Ahmed");
  });

  it("R30 — a till-only cashier is created with NO email, and the absence is `null`", async () => {
    const { sent } = mount();
    await settled();
    await hire({ name: "Rabia Noor", roleIndex: 0, branchLabel: "Gulberg", pin: "1234" });
    await waitFor(() => expect(inputsTo(sent, "users.create")).toHaveLength(1));
    const input = inputsTo(sent, "users.create")[0] as Record<string, unknown>;
    // `""` is an invented address rather than an absent one, and the router's own schema is
    // `z.union([z.string().min(1), z.null()])` for exactly that reason.
    expect(input.email).toBeNull();
  });

  it("an email TYPED is carried — the control that stops `email: null` being unconditional", async () => {
    const { sent } = mount();
    await settled();
    await hire({
      name: "Farah Iqbal",
      email: "farah@zaiqa.test",
      roleIndex: 0,
      branchLabel: "Gulberg",
      pin: "1234",
    });
    await waitFor(() => expect(inputsTo(sent, "users.create")).toHaveLength(1));
    expect((inputsTo(sent, "users.create")[0] as Record<string, unknown>).email).toBe(
      "farah@zaiqa.test",
    );
  });

  it("01-F26 — the assignment sent is a role and a place, and nothing else", async () => {
    const { sent } = mount();
    await settled();
    await hire({ name: "Bilal Ahmed", roleIndex: 0, branchLabel: "Gulberg", pin: "4821" });
    await waitFor(() => expect(inputsTo(sent, "users.create")).toHaveLength(1));
    const assignments = (inputsTo(sent, "users.create")[0] as { assignments: unknown[] })
      .assignments;
    expect(assignments).toHaveLength(1);
    const assignment = assignments[0] as Record<string, unknown>;
    expect(Object.keys(assignment).sort()).toEqual(["branch_id", "role"]);
    // `11-F22` makes participation the WRITER's: a client that could state it could create a
    // cashier who is `inactive` on her first shift.
    expect(assignment.status).toBeUndefined();
    expect(assignment.branch_id).toBe(GULBERG);
  });

  it("01-F26 — every role the matrix has is offered, and no role it does not have", async () => {
    // Driven rather than read off the markup: the SENT value is the only thing that has to be a
    // matrix role, and an implementation is free to spell its option values however it likes.
    const seen: string[] = [];
    for (let index = 0; index < ROLES.length; index += 1) {
      const run = mount();
      await settled();
      await openHireTask();
      expect(requireChoices(/role|job/i, "role")).toHaveLength(ROLES.length);
      await hire({
        name: `Person ${index}`,
        roleIndex: index,
        branchLabel: "Gulberg",
        pin: "1111",
      });
      await waitFor(() => expect(inputsTo(run.sent, "users.create")).toHaveLength(1));
      const created = inputsTo(run.sent, "users.create")[0] as {
        assignments: { role: string }[];
      };
      seen.push((created.assignments[0] as { role: string }).role);
      cleanup();
    }
    // Free-form roles are "deliberately not configurable" (14 §7) and the matrix's four columns are
    // `01-F26`'s seed. A fifth invented here would be commandment 2; a missing one is an owner who
    // cannot hire a storekeeper.
    expect([...seen].sort()).toEqual([...ROLES].sort());
  });

  it("14-F38 — no role choice renders the internal token", async () => {
    mount();
    await settled();
    await openHireTask();
    const labels = requireChoices(/role|job/i, "role").map((choice) => choice.label);
    // `branch_manager` is the one matrix role whose token is snake_case, which is `14-F38`'s own
    // definition of a code symbol reaching a screen ("a code symbol, a table or a column name").
    expect(labels.filter((label) => label.includes("_"))).toEqual([]);
    expect(labels.every((label) => label.trim().length > 0)).toBe(true);
  });

  it("21-F15 — the branch is chosen by NAME, and every branch the org has is offered", async () => {
    mount();
    await settled();
    await openHireTask();
    const labels = choicesFor(/branch|location/i).map((choice) => choice.label);
    for (const branch of BRANCHES) {
      expect(labels.some((label) => label.includes(branch.display_name))).toBe(true);
    }
    // …and never a raw id on a control an owner reads. `21-F15`: "no surface renders a machine
    // identifier where the product knows a name".
    expect(labels.filter((label) => label.includes(GULBERG) || label.includes(DHA))).toEqual([]);
  });

  it("no assignment ever names a branch the SERVER did not name — including when there are none", async () => {
    // The invariant that survives the state every tenant is actually in: `kernel.branches` has no
    // writer yet, so `tenancy.directory` answers `[]` for every real org today. A screen that
    // invented a branch here would write an assignment `01-F68` cannot resolve, permanently.
    const { sent } = mount({ branches: [] });
    await settled();
    await openHireTask();
    expect(choicesFor(/branch|location/i).map((choice) => choice.label)).toEqual([]);
    fill(/name/i, "Kamran Aziz");
    const roles = requireChoices(/role|job/i, "role");
    (roles[0] as Choice).choose();
    fill(/pin/i, "5150");
    commitFrom(/name/i);
    await waitFor(() => expect(true).toBe(true));
    for (const input of inputsTo(sent, "users.create")) {
      for (const assignment of (input.assignments as { branch_id: string | null }[]) ?? []) {
        expect([null, GULBERG, DHA]).toContain(assignment.branch_id);
      }
    }
  });

  it("…and none on the POPULATED directory either — every choice offered is driven and read", async () => {
    /**
     * ⚠ **THE ASSERTION ABOVE DISCRIMINATED ONLY ON AN EMPTY DIRECTORY, AND THAT IS THE ONE STATE
     * IN WHICH THERE IS NOTHING TO LEAK.** Measured: a foreign-org branch appended to the served
     * list ALWAYS killed 1; the same branch appended **only when the list is non-empty** killed
     * **0 of 52**. So `01-F71`/`01-F68` was defended exactly until `kernel.branches` gets a writer
     * — and on the day it does, an owner would be offered another org's branch, write an
     * assignment against it, and this suite would stay green.
     *
     * Every offered choice is DRIVEN and the SENT id is read, rather than the markup's option
     * values being trusted: `choicesFor` reads labels off the DOM on purpose ("an implementation
     * is free to spell its option values however it likes"), so what the screen sends is the only
     * thing that can be checked against what the server named.
     */
    mount();
    await settled();
    await openHireTask();
    const offered = requireChoices(/branch|location/i, "branch").length;
    expect(offered).toBeGreaterThan(0);
    cleanup();

    for (let index = 0; index < offered; index += 1) {
      const run = mount();
      await settled();
      await openHireTask();
      const branches = requireChoices(/branch|location/i, "branch");
      expect(branches).toHaveLength(offered);
      fill(/name/i, `Person ${String(index)}`);
      (requireChoices(/role|job/i, "role")[0] as Choice).choose();
      (branches[index] as Choice).choose();
      fill(/pin/i, "1234");
      commitFrom(/name/i);
      await waitFor(() => expect(inputsTo(run.sent, "users.create")).toHaveLength(1));
      const input = inputsTo(run.sent, "users.create")[0] as Record<string, unknown>;
      for (const assignment of (input.assignments as { branch_id: string | null }[]) ?? []) {
        // The same invariant as the empty case, on the fixture where a screen has something to
        // invent alongside: `01-F68` cannot resolve a branch this org does not have, permanently.
        expect([null, GULBERG, DHA]).toContain(assignment.branch_id);
      }
      cleanup();
    }
  });

  it("R29 — the PIN is set as part of the hire, against the id the SERVER minted", async () => {
    const { sent } = mount();
    await settled();
    await hire({ name: "Bilal Ahmed", roleIndex: 0, branchLabel: "Gulberg", pin: "4821" });
    await waitFor(() => expect(inputsTo(sent, "users.setPin")).toHaveLength(1));
    // An `active` member with no credential row is `11-F23`'s named DEFECT — a tile that cannot be
    // unlocked, which is `01-F17`'s stopped till arriving through the identity path.
    expect(inputsTo(sent, "users.setPin")[0]).toEqual({ user_id: MINTED_ID, pin: "4821" });
    // Order matters: the id does not exist until the create answers.
    const order = sent.map((call) => call.path);
    expect(order.indexOf("users.create")).toBeLessThan(order.indexOf("users.setPin"));
  });

  it("11-F21 — no PIN rides the create, and none is displayed after it (14-F14)", async () => {
    const { sent } = mount();
    await settled();
    await hire({ name: "Bilal Ahmed", roleIndex: 0, branchLabel: "Gulberg", pin: "4821" });
    await waitFor(() => expect(inputsTo(sent, "users.create")).toHaveLength(1));
    expect(inputsTo(sent, "users.create")[0]).not.toHaveProperty("pin");
    // "PIN set/reset (never displayed)" — `14-F14`, verbatim. A receipt reading "Bilal's PIN is
    // 4821" is the plausible implementation R29 invites, and it puts a credential on a screen an
    // owner may be standing in front of anybody at.
    await waitFor(() => expect(inputsTo(sent, "users.setPin")).toHaveLength(1));
    expect(textOf(document.body)).not.toContain("4821");
  });

  it("11-F23 — a hire with no PIN is refused or NAMED, never silently unusable", async () => {
    const { sent } = mount();
    await settled();
    await openHireTask();
    fill(/name/i, "Zoya Rehman");
    const roles = requireChoices(/role|job/i, "role");
    (roles[0] as Choice).choose();
    const said = new Set(phrases());
    commitFrom(/name/i);
    await settled();
    await settleSends();

    /**
     * R32's rule for re-activation binds the first activation too: *"the second step being skipped
     * must fail LEGIBLY"*. `11-F23` says what the silent version is — an `active` member with no
     * credential row is *"a tile that cannot be unlocked, which is `01-F17`'s stopped till arriving
     * through the identity path"*.
     *
     * TWO shapes are legal and this assertion accepts either: refuse the act until a PIN is typed,
     * or perform it and SAY she cannot sign in yet. Only the third is a defect, and it is the one
     * an implementation reaches by accident — the person is created, no credential follows, and the
     * screen reports success.
     *
     * ⚠ **`legible` IS SCOPED TO WHAT APPEARED AFTER THE COMMIT, AND THE UNSCOPED VERSION WAS
     * SATISFIED BY A REQUIREMENT OF ITS OWN SUITE.** Read over the whole body, this vocabulary is
     * matched by the PIN field's own label — and with that label removed, by `strings.staff
     * .tillsOwed`'s *"RestOS **cannot** yet report…"*, a sentence **§F requires to be on this
     * screen**. So §F's requirement made §B's verdict permanently "legible": two mutants that
     * create an active person, set no PIN and report success killed **0 of 52 each**, and the way
     * that was proved was deleting the word *cannot* from an unrelated sentence, which killed 1.
     * An assertion another requirement guarantees will pass is worse than no assertion, because it
     * is counted.
     */
    const created = inputsTo(sent, "users.create").length > 0;
    const pinned = inputsTo(sent, "users.setPin").length > 0;
    const legible = phrases()
      .filter((phrase) => !said.has(phrase))
      .some((phrase) => /pin|sign in|unlock|cannot|not able/i.test(phrase));
    const verdict = !created || pinned || legible ? "legible" : "silently unusable";
    expect(`created=${created} pin-set=${pinned} says-so=${legible} → ${verdict}`).toBe(
      `created=${created} pin-set=${pinned} says-so=${legible} → legible`,
    );
  });

  /**
   * ⚠ **THE HIRE IS TWO CALLS AND NOTHING IN THIS FILE DROVE THE INSTANT BETWEEN THEM.** §B tested
   * the happy path (`create` then `setPin`, in that order, against the minted id) and the refusal
   * with no PIN typed at all. The state it never reached is the one that costs an owner a permanent
   * duplicate: **`users.create` succeeds and `users.setPin` fails.**
   *
   * Measured in review on the shipped screen:
   *
   *     PROBE: creates-after-first=1  creates-after-second=2
   *     PATHS: users.create → users.create
   *     FORM STILL OPEN: true
   *
   * Every FR needed to call that a defect is already cited above. `11-F20` never deletes a person
   * record, so the first one is **permanent** — a correction here is a second row, never an undo
   * (commandment 1). She is left `active` with no credential, which is `11-F23`/R32's named defect
   * verbatim, *"a tile that cannot be unlocked … `01-F17`'s stopped till arriving through the
   * identity path"*, and R32's rule for the skipped second step is that it *"must fail LEGIBLY
   * rather than silently"*. And `00 §5.7` decides the honesty half: a screen that reports the hire
   * as failed, when a person was in fact created, is stating something it knows to be false — and
   * that false statement is the **mechanism** of the duplicate, because the only sane response to
   * "it failed" is to do it again.
   *
   * `users.setPin` is overridden here rather than wrapped, so it is not in `sent`; the harness's
   * own `log` records every call at the instant it is made and is what these three read.
   */
  const HIRED = "Bilal Ahmed";

  const partialHire = async (): Promise<{
    log: CallLog;
    said: ReadonlySet<string>;
    buttonsBefore: readonly string[];
    readsBefore: number;
  }> => {
    const { log } = mount({
      extra: {
        "users.setPin": () => {
          // Deliberately carries none of the vocabulary the assertions below read for. A message
          // like "credential store unavailable" would let a screen that merely echoes the server
          // satisfy an assertion about what the screen UNDERSTANDS.
          throw new Error("upstream write timed out");
        },
      },
    });
    await settled();
    await openHireTask();
    fill(/name/i, HIRED);
    (requireChoices(/role|job/i, "role")[0] as Choice).choose();
    const branches = requireChoices(/branch|location/i, "branch");
    const gulberg = branches.find((choice) => choice.label.includes("Gulberg"));
    if (gulberg === undefined) {
      throw new Error("the branch control does not offer Gulberg");
    }
    gulberg.choose();
    fill(/pin/i, "4821");
    const said = new Set(phrases());
    const buttonsBefore = buttons().map((button) => textOf(button));
    const readsBefore = log.filter((call) => call.path === "users.list").length;
    commitFrom(/name/i);
    // The partial state, reached rather than assumed: the person EXISTS on the server and holds no
    // credential. If either wait times out the fixture never got there and the tests below are
    // about nothing.
    await waitFor(() => expect(inputsTo(log, "users.create")).toHaveLength(1));
    await waitFor(() => expect(inputsTo(log, "users.setPin")).toHaveLength(1));
    await settleSends();
    return { log, said, buttonsBefore, readsBefore };
  };

  it("11-F23 — a create that lands with a FAILED PIN says she exists and cannot sign in yet", async () => {
    const { said } = await partialHire();
    /**
     * Read from the phrases the COMMIT added, for §B's own recorded reason one test up: over the
     * whole body this vocabulary is matched by the PIN field's own label and by a sentence §F
     * requires to be on this screen, and an assertion another requirement guarantees will pass is
     * worse than no assertion.
     *
     * Two halves, and they are different claims. **exists** — the person is a fact now, so a
     * notice that speaks only of failure is false (`00 §5.7`); either naming her or saying she was
     * added carries it, because both tell an owner the act partly landed. **gap** — what is
     * missing, at sentence length rather than label length, so a re-rendered field label cannot
     * supply it.
     */
    const appeared = phrases().filter((phrase) => !said.has(phrase));
    const exists = appeared.some(
      (phrase) =>
        phrase.includes(HIRED) || /added|created|exists|saved|hired|on the roster/i.test(phrase),
    );
    const gap = appeared.some(
      (phrase) => /pin|sign in|unlock|credential/i.test(phrase) && wordCount(phrase) >= 5,
    );
    const said_ = appeared.join(" | ");
    expect(
      `exists=${exists} gap=${gap} → ${exists && gap ? "told" : "NOT told"}; it said: ${said_}`,
    ).toBe(`exists=${exists} gap=${gap} → told; it said: ${said_}`);
  });

  it("11-F20 — a second attempt after a failed PIN does not create a SECOND person", async () => {
    const { log, buttonsBefore } = await partialHire();
    /**
     * The owner does what the screen leaves her to do — a fresh control that finishes the job, or
     * the form it left open holding her values. Both are pressed the way an owner would press
     * them; which one exists is the implementation's business, and the invariant is the same
     * either way: **the second attempt must not mint a second person.**
     *
     * `11-F20` is why this is permanent rather than merely untidy — nothing in this product deletes
     * a person record, so the duplicate outlives every later correction, and the FIRST of the two
     * is the one left `active` with no credential.
     */
    const fresh = buttons().filter((button) => !buttonsBefore.includes(textOf(button)));
    const finish = fresh.find(
      (button) =>
        /try again|retry|set|finish|save|create|hire|done|confirm|update|apply/i.test(
          textOf(button),
        ) && !DECLINE.test(textOf(button)),
    );
    let attempted = "nothing";
    if (finish !== undefined) {
      fireEvent.click(finish);
      attempted = `pressed "${textOf(finish)}"`;
    } else if (screen.queryByLabelText(/name/i) !== null) {
      commitFrom(/name/i);
      attempted = "re-committed the form it left open";
    }
    await settleSends();

    // A zero is only evidence if the owner had something to press — the control §D's decline test
    // records in full. A screen offering neither a way to finish nor a form to re-commit has
    // stranded the hire, which is `11-F23`'s tile-that-cannot-be-unlocked with no way out at all.
    expect(`the owner can still finish: ${attempted !== "nothing"}`).toBe(
      "the owner can still finish: true",
    );
    expect(`${attempted} → creates=${inputsTo(log, "users.create").length}`).toBe(
      `${attempted} → creates=1`,
    );
  });

  it("00 §5.7 — the roster is re-read, because she exists whatever the PIN did (PINNED)", async () => {
    const { log, readsBefore } = await partialHire();
    /**
     * ⚠ **PINNED INTERPRETATION, contestable — a finding for this file's session cited by FR id, not
     * a line to soften.** §B already requires the roster to be re-read after a hire ("the authority
     * for who works here is the server: invalidate, never splice"), and the reading applied here is
     * that a `create` which ANSWERED is what triggers it, not a task which completed. The reasons:
     * the roster on screen omits a person the server now holds, which is `00 §5.7`'s stale-as-live
     * exactly; and it is the only path by which an owner reaches her row to set the PIN that failed,
     * so without it the recovery from this state is a second hire — the defect this section is
     * about. The simpler alternative, rejected: invalidate only when the whole task succeeds, which
     * leaves the screen knowingly wrong for as long as the credential store is down.
     */
    await waitFor(() =>
      expect(log.filter((call) => call.path === "users.list").length).toBeGreaterThan(readsBefore),
    );
  });

  it("commandment 2 — no per-user permission override is invented", async () => {
    mount();
    await settled();
    await openHireTask();
    // `14-F14` lists them and nothing in this product models one: `packages/domain` records them as
    // "named there and deliberately unbuilt", and no FR states their shape. Building a control for
    // them here would be inventing policy.
    const controls = Array.from(document.querySelectorAll("input, select, textarea")).map(labelFor);
    expect(
      controls.filter((label) => /permission|override|can (void|discount|refund)/i.test(label)),
    ).toEqual([]);
  });

  it("the roster is RE-READ from the server after a hire, never spliced into the cache", async () => {
    const { log, sent } = mount();
    await settled();
    const reads = () => log.filter((call) => call.path === "users.list").length;
    const before = reads();
    await hire({ name: "Bilal Ahmed", roleIndex: 0, branchLabel: "Gulberg", pin: "4821" });
    await waitFor(() => expect(inputsTo(sent, "users.create")).toHaveLength(1));
    await waitFor(() => expect(reads()).toBeGreaterThan(before));
  });
});

describe("C · 01-F26 — role × per-location assignment, edited", () => {
  const openAssignments = async (personName: string): Promise<void> => {
    const row = rowOf(personName);
    const opener = buttonsNamed(/edit|change|assign|update|manage/i, row)[0];
    if (opener === undefined) {
      throw new Error(
        `no control edits ${personName}'s assignments — 14-F14 requires "role × per-location ` +
          `assignment" to be editable, and the roster is where an owner meets it`,
      );
    }
    fireEvent.click(opener);
    await waitFor(() => expect(choicesFor(/role|job/i).length).toBeGreaterThan(0));
  };

  it("writes the WHOLE set, so a second branch is never dropped by an edit to the first", async () => {
    const { sent } = mount();
    await rosterShown();
    await openAssignments(AYESHA.display_name);
    const roles = requireChoices(/role|job/i, "role");
    const widened = roles[roles.length - 1] as Choice;
    widened.choose();
    commitFrom(/role|job/i);

    await waitFor(() => expect(inputsTo(sent, "users.setAssignments")).toHaveLength(1));
    const input = inputsTo(sent, "users.setAssignments")[0] as {
      user_id: string;
      assignments: { role: string; branch_id: string | null }[];
    };
    // "Absolute, never a delta" (`UserDirectory.setAssignments`). A screen that sent only the pair
    // the owner touched would silently take Ayesha off the other branch — and `01-F1` makes the
    // ledger row describing it permanent.
    expect(input.user_id).toBe(AYESHA.user_id);
    expect(input.assignments.length).toBeGreaterThanOrEqual(AYESHA.assignments.length);
    expect(input.assignments.map((a) => a.branch_id)).toContain(DHA);
    expect(input.assignments.map((a) => a.branch_id)).toContain(GULBERG);
  });

  it("carries no participation status back to the writer (11-F22)", async () => {
    const { sent } = mount();
    await rosterShown();
    await openAssignments(AYESHA.display_name);
    const roles = requireChoices(/role|job/i, "role");
    const widened = roles[roles.length - 1] as Choice;
    widened.choose();
    commitFrom(/role|job/i);
    await waitFor(() => expect(inputsTo(sent, "users.setAssignments")).toHaveLength(1));
    const input = inputsTo(sent, "users.setAssignments")[0] as {
      assignments: Record<string, unknown>[];
    };
    // The plausible bug is mapping the listing straight back: `PersonListing` carries `status` and
    // the input schema does not. The server strips it, so nothing downstream would ever report it.
    for (const assignment of input.assignments) {
      expect(Object.keys(assignment).sort()).toEqual(["branch_id", "role"]);
    }
  });
});

describe("D · 14-F14 — deactivation preserves the person, and names the place", () => {
  /**
   * The words the arming ADDED: the own-text of every element that was not in the document before
   * the control was pressed.
   *
   * **By NODE and not by string, and both halves of that were measured rather than reasoned.**
   *
   *   · A **string** diff drops a phrase that was already on the screen — so a confirmation that
   *     renders her name in an element of its OWN is invisible to it, that string being her row
   *     label. Measured against the control that does exactly that: the string form fails a
   *     CORRECT implementation, which is the damage this wave names beside a vacuous test.
   *   · Scoping to the **smallest ancestor holding both confirmation controls** — the first draft —
   *     scopes to the button PAIR, not to the confirmation: the consequence is a sibling one level
   *     up, outside it. Measured the same way, and it failed the probe.
   *
   * What is left is the honest question: which elements did pressing this control put on the
   * screen, and do any of them say who this is about.
   */
  const addedBy = async (press: () => Promise<void>): Promise<readonly string[]> => {
    const known = new Set(Array.from(document.querySelectorAll("*")));
    await press();
    return Array.from(document.querySelectorAll("*"))
      .filter((element) => !known.has(element))
      .map(ownText)
      .filter((phrase) => phrase !== "");
  };

  it("takes TWO acts, and the consequence is READ rather than being the control's name", async () => {
    const { sent } = mount();
    await rosterShown();
    const buttonsBefore = buttons().map((button) => textOf(button));
    const said = new Set(phrases());

    await arm(NADIA.display_name, "Gulberg");
    // Nothing has been sent. There is no re-activation procedure anywhere in this product (R32
    // makes it a two-step act this surface cannot complete), so a one-tap control here stops a
    // cashier mid-shift with no way back from this screen.
    await settleSends();
    expect(inputsTo(sent, "users.deactivate")).toHaveLength(0);

    /**
     * A sentence appeared that was not on the screen before — `14-F13`'s rule for the app's other
     * irreversible act, which `device-list.tsx` already meets: the consequence is stated ON the
     * control and is READ before the second press.
     *
     * ⚠ **A SENTENCE IS A PHRASE, NOT AN ANCESTOR'S `textContent`.** Read over whole subtrees this
     * clause was satisfied by any ancestor of the two new controls — the row, the list, the card —
     * whose glued text is long whatever the confirmation says, so cutting the consequence to
     * *"Are you sure"* killed **0** tests in this file. What is required is one ELEMENT that says
     * eight words.
     */
    const appeared = phrases().filter((phrase) => !said.has(phrase));
    const sentences = appeared.filter((phrase) => wordCount(phrase) >= 8);
    expect(
      sentences.length === 0
        ? `the confirmation stated no sentence; it added: ${appeared.join(" | ")}`
        : "a sentence appeared",
    ).toBe("a sentence appeared");
    // …and it is not folded into a control's accessible NAME — the live a11y regression
    // `apps/backoffice/CLAUDE.md` records from the apply-when row, where a screen reader announced
    // a whole consequence paragraph as what the control was called.
    for (const button of buttons()) {
      expect(`${textOf(button)} — ${wordCount(textOf(button))} words`).toBe(
        `${textOf(button)} — ${Math.min(wordCount(textOf(button)), 8)} words`,
      );
    }

    confirm(buttonsBefore);
    await waitFor(() => expect(inputsTo(sent, "users.deactivate")).toHaveLength(1));
  });

  it("11-F22 — a departure names the BRANCH she is leaving, not the org", async () => {
    const { sent } = mount();
    await rosterShown();
    const before = buttons().map((button) => textOf(button));
    await arm(AYESHA.display_name, "Gulberg");
    confirm(before);
    await waitFor(() => expect(inputsTo(sent, "users.deactivate")).toHaveLength(1));
    // Participation is per-(person, branch). Sending `null` for a branch-assigned person addresses
    // `01-F26`'s ORG-WIDE assignment — a different fact, and for Ayesha a write that changes
    // nothing while the screen reports success.
    expect(inputsTo(sent, "users.deactivate")[0]).toEqual({
      user_id: AYESHA.user_id,
      branch_id: GULBERG,
    });
  });

  it("01-F26 — an ORG-WIDE person is deactivated org-wide, and `null` means exactly that", async () => {
    const { sent } = mount();
    await rosterShown();
    const before = buttons().map((button) => textOf(button));
    await arm(SANA.display_name);
    confirm(before);
    await waitFor(() => expect(inputsTo(sent, "users.deactivate")).toHaveLength(1));
    expect(inputsTo(sent, "users.deactivate")[0]).toEqual({
      user_id: SANA.user_id,
      branch_id: null,
    });
  });

  it("11-F20 — the confirmation NAMES the person it is about, in words the arming added", async () => {
    /**
     * Nothing in this file used to require it, and an implementation whose consequence says
     * *"She"* throughout passed: measured, 0 kills. Four people are on this screen and up to two
     * places each, the act is per-(person, place) (`11-F22`) and irreversible from here — so
     * `14-F13`'s *"the consequence is READ before the second press"* is only worth anything if what
     * is read says WHOSE. `11-F20` supplies the noun: a person is known by her name, never by an
     * identifier, and this screen has hers.
     *
     * Read from the elements the ARMING added (`addedBy`, and its comment carries why that is by
     * node rather than by string).
     *
     * ⚠ **BOUNDARY:** an implementation that re-mounted the whole row on arming would make her own
     * row label one of the added elements and satisfy this for free. Nothing here detects that, and
     * it is stated rather than guarded, because guarding it means deciding which added element is
     * "the confirmation" — a question about markup, which is the mistake §A records.
     *
     * ⚠ **AND IT IS STRICTER THAN THIS APP'S OWN PRECEDENT, which is stated rather than hidden:**
     * `device-list.tsx`'s confirmation says *"This device stops working within 30 seconds…"* and
     * never names the device. The reading that separates them is `11-F22` — participation is
     * per-(person, place), so the armed act here is one of up to five on this screen while a
     * device row has exactly one — and `11-F20`, which makes the NAME the way this product refers
     * to a person at all. If an implementer reads that the other way, it is a finding for this
     * file's session cited by FR id, not a line to soften.
     */
    mount();
    await rosterShown();
    const added = await addedBy(() => arm(NADIA.display_name, "Gulberg"));
    expect(
      added.some((phrase) => phrase.includes(NADIA.display_name))
        ? "the confirmation names her"
        : `the confirmation never says who it is about; it says: ${added.join(" | ")}`,
    ).toBe("the confirmation names her");
  });

  it("declining sends nothing — read after the send would have arrived, not at the click", async () => {
    const { sent } = mount();
    await rosterShown();
    const before = buttons().map((button) => textOf(button));
    await arm(NADIA.display_name, "Gulberg");
    const declining = buttons().find(
      (button) => !before.includes(textOf(button)) && DECLINE.test(textOf(button)),
    );
    if (declining === undefined) {
      throw new Error("the confirmation cannot be declined — an irreversible act with no way out");
    }
    fireEvent.click(declining);

    /**
     * ⚠ **THE SYNCHRONOUS FORM OF THIS ASSERTION WAS VACUOUS, AND IT WAS MEASURED RATHER THAN
     * SUSPECTED.** The mutant whose decline control ALSO fires `users.deactivate` killed **0 of
     * 52**. Instrumented at the click: `sync=0 immediate=1 afterTick=1` — the call IS made, and
     * `sent` is empty at exactly the instant the old assertion read it, because a tRPC mutation
     * reaches the link a microtask after the handler returns. Any implementation whose cancel
     * fires the mutation passed.
     */
    await settleSends();
    expect(inputsTo(sent, "users.deactivate")).toHaveLength(0);

    /**
     * …and a zero is only evidence if a send WOULD have been seen inside that wait. So the same
     * act is armed again and CONFIRMED, and the same instrument reports one. A `settleSends` too
     * short to observe a send fails here rather than blessing the zero above — the control this
     * assertion needs, in the assertion itself.
     */
    await arm(NADIA.display_name, "Gulberg");
    confirm(before);
    await settleSends();
    expect(inputsTo(sent, "users.deactivate")).toHaveLength(1);
  });

  it("11-F20 — she stays on the roster, and the screen never speaks of deletion", async () => {
    const { log, sent } = mount();
    await rosterShown();
    const reads = () => log.filter((call) => call.path === "users.list").length;
    const before = buttons().map((button) => textOf(button));
    const readsBefore = reads();
    await arm(NADIA.display_name, "Gulberg");
    confirm(before);
    await waitFor(() => expect(inputsTo(sent, "users.deactivate")).toHaveLength(1));
    // The authority for who works here is the server: invalidate, never splice.
    await waitFor(() => expect(reads()).toBeGreaterThan(readsBefore));
    expect(screen.getByText(NADIA.display_name)).toBeTruthy();
    // ⚠ **PER PHRASE, for the reason §A carries in full.** A control reading `Delete` beside one
    // reading `Edit where she works` glues to `…she worksDelete…`, where `\bdeleted?\b` cannot
    // match: that mutant killed **0 of 52** over `textContent`, and killed 1 the moment a single
    // space was put between the two elements. The word the corpus forbids is the one an owner
    // reads, and an owner reads elements.
    expect(phrases().filter((phrase) => DELETION_LANGUAGE.test(phrase))).toEqual([]);
  });

  it("an already-departed assignment offers no deactivation, and no re-activation is invented", async () => {
    mount();
    await screen.findByText(IMRAN.display_name);
    const row = rowOf(IMRAN.display_name);
    expect(buttonsNamed(DEACTIVATE, row)).toEqual([]);
    // There is no `activate` procedure: R32 makes re-activation a two-step act whose second half is
    // a device unlock-flow behaviour this surface cannot supply. A control implying one exists is
    // the same defect `device-list.tsx` refuses by rendering no un-revoke.
    // ⚠ `\bactivate\b` and not `/re-?activate/`: the first draft banned only the RE- spelling and
    // survived the mutant that renders a button named *"Activate"* — 0 of 44, measured. The word
    // boundary is what keeps it off "Deactivate", which is the control beside it.
    expect(
      buttonsNamed(/\bre-?activate\b|\bactivate\b|restore|reinstate|bring back|re-?hire/i, row),
    ).toEqual([]);
  });

  it("a REFUSED deactivation shows the server's own words", async () => {
    mount({
      extra: {
        "users.deactivate": () => {
          throw new Error("user u-nadia has no assignment at branch-gulberg in org org-zaiqa");
        },
      },
    });
    await rosterShown();
    const before = buttons().map((button) => textOf(button));
    await arm(NADIA.display_name, "Gulberg");
    confirm(before);
    // The owner's mistake is the owner's business — never "deactivation failed". Same rule the
    // price grid follows for `01-F60`'s refusals and the device list for a rejected revocation.
    expect(await screen.findByText(/no assignment at/)).toBeTruthy();
  });
});

describe("E · 14-F39 — owner-only, decided by the SERVER (commandment 8)", () => {
  it("a matrix refusal renders as a refusal — not a sign-in, not an outage, not an empty roster", async () => {
    mount({ roster: forbidden });
    await settled();
    // Three surfaces, three meanings. `strings.signIn.heading` would say the session is over
    // (it is not); `strings.unreachable.heading` would say the service did not answer (it did,
    // and it said no); an empty roster would say nobody works at this restaurant.
    expect(screen.queryByRole("heading", { name: strings.signIn.heading })).toBeNull();
    expect(screen.queryByText(strings.unreachable.heading)).toBeNull();
    expect(screen.queryByText(NADIA.display_name)).toBeNull();
    expect(textOf(document.body).length).toBeGreaterThan(0);
  });

  it("a refused caller is offered no act at all", async () => {
    mount({ roster: forbidden });
    await settled();
    expect(buttonsNamed(/add|new|hire|invite|deactivate|reset|pin/i)).toEqual([]);
    expect(screen.queryByLabelText(/pin/i)).toBeNull();
  });

  it("the client never decides: it asks, and the refusal comes from the wire", async () => {
    const { log } = mount({ roster: forbidden });
    await settled();
    // `auth-gate.tsx`'s recorded law for this app: "nothing here decides what the owner may do. No
    // role is read, no permission is computed, no button is hidden by rank. The API refuses what
    // the matrix refuses, and this app renders the refusal." A screen that hid itself from a
    // non-owner would send nothing at all — and would be trusting a client role claim to do it.
    expect(log.some((call) => call.path === "users.list")).toBe(true);
  });

  it("the outage surface and the refusal surface are DIFFERENT renderings", async () => {
    // Pairwise, so no collapse of the two can pass — the shape `device-list.dom.test.tsx` uses for
    // its three revocation states.
    mount({ roster: forbidden });
    await settled();
    const refusal = textOf(document.body);
    cleanup();
    mount({
      roster: () => {
        throw new Error("connect ECONNREFUSED 127.0.0.1:3001");
      },
    });
    await screen.findByText(strings.unreachable.heading);
    expect(refusal).not.toBe(textOf(document.body));
  });
});

describe("F · 00 §5.7 — what this screen may not claim", () => {
  it("14-F4 — it states no distribution figure, because nothing serves one", async () => {
    mount();
    await screen.findByText(NADIA.display_name);
    // No procedure on this plane can answer "live on 4 of 5 devices" for a roster, and a plausible
    // substitute is indistinguishable from a real one on a demo and wrong every day after — the
    // reason `14-F12`'s three columns are ABSENT on the device list rather than guessed at.
    expect(textOf(document.body)).not.toMatch(DISTRIBUTION_CLAIM);
  });

  it("14-F4 — and it does not leave the question unasked either (PINNED interpretation)", async () => {
    mount();
    await screen.findByText(NADIA.display_name);
    /**
     * ⚠ PINNED INTERPRETATION, contestable. `14-F4` requires "each config screen shows
     * distribution state … honestly aged per `00 §5.7`", and `00 §5.7` is "stale is never
     * presented as live". A roster change reaches no till at all today — `packages/sync-protocol`
     * declares fourteen message kinds and a comment-blind search of it for *staff* returns
     * nothing — so a screen that says nothing lets an owner believe her new cashier can sign in.
     * The simpler alternative (say nothing until there is a figure to show) is what this rejects,
     * on the device list's own precedent: `strings.devices.columnsOwed` is a first-class statement
     * of an absence, not a footnote about it.
     *
     * ⚠ **THE FIRST DRAFT OF THIS ASSERTION WAS `toMatch(/till|device/i)` OVER THE WHOLE BODY, AND
     * IT SURVIVED THE MUTANT THAT DELETES THE STATEMENT** — measured, 0 of 44, because a probe
     * implementation happened to render *"Works on the till only"* on a till-only cashier's row and
     * the word alone satisfied it. That is this wave's round-3 defect committed inside the oracle
     * written to catch it, so the assertion now asks for a STATEMENT: a leaf element, outside every
     * person's row, of at least six words.
     */
    const rows = PEOPLE_NAMES.map(rowOf);
    const statements = Array.from(document.querySelectorAll("*"))
      .filter((element) => element.children.length === 0)
      .filter((element) => /till|device/i.test(textOf(element)))
      .filter((element) => !rows.some((row) => row.contains(element)))
      .filter((element) => wordCount(textOf(element)) >= 6);
    expect(statements.map(textOf)).not.toEqual([]);
  });

  it("14-F3/14-F15 — no change is attributed to anybody, because no history is served", async () => {
    mount();
    await screen.findByText(NADIA.display_name);
    // `users.list` carries no actor and no instant. The mirror defect is measured one screen over:
    // `device-list.dom.test.tsx`'s B1b mutant renders the signed-in user's id for every revoked
    // row and is invisible to a fixture that only ever revoked through the screen.
    for (const person of ROSTER) {
      expect(textOf(rowOf(person.display_name))).not.toMatch(HISTORY_CLAIM);
    }
  });
});

describe("G · the section is REACHABLE from the shipped shell (14-F31, 27-F4)", () => {
  const shell = (): { log: CallLog } => {
    const log: CallLog = [];
    render(
      <Harness
        log={log}
        handlers={{
          "catalog.enabled": () => ({ branches: [GULBERG], channels: ["counter"] }),
          "catalog.published": () => ({ version: 1, entries: [] }),
          "catalog.pending": () => [],
          "users.list": () => ROSTER,
          "tenancy.directory": () => ({ org: ORG, branches: BRANCHES }),
        }}
      >
        <Workspace />
      </Harness>,
    );
    return { log };
  };

  const tabs = (): readonly HTMLElement[] =>
    Array.from(document.querySelectorAll<HTMLElement>("nav button"));

  it("the rail gains a FOURTH tab and the three that existed keep their places", () => {
    shell();
    const labels = tabs().map((tab) => textOf(tab));
    // `14-F31` recorded the rule when the third landed: "APPENDED the third tab and did not
    // reorder the first two. `27-F4`'s positional contract binds muscle memory, so a new section
    // goes after the sections that exist — never between them."
    expect(labels.slice(0, 3)).toEqual([
      strings.nav.menu,
      strings.nav.devices,
      strings.nav.summary,
    ]);
    expect(labels).toHaveLength(4);
    expect(flat(labels[3])).not.toBe("");
    expect(labels[3]).not.toMatch(/_|\bid\b/i);
  });

  it("choosing it renders the roster — the seam the wave's recurring defect breaks", async () => {
    shell();
    // A correct screen the product never mounts is instance sixteen of "a correct subsystem with
    // no seam to the product", and `seams:check` is blind to it: a component imported by a shell
    // that never renders it is still a reached export.
    fireEvent.click(tabs()[3] as HTMLElement);
    expect(await screen.findByText(NADIA.display_name)).toBeTruthy();
  });

  it("its queries do not run until the owner chooses it", async () => {
    const { log } = shell();
    await waitFor(() => expect(log.length).toBeGreaterThan(0));
    // `workspace.tsx`: "Mounted, not hidden: the inactive section's queries should not run."
    expect(log.some((call) => call.path === "users.list")).toBe(false);
  });
});

describe("H · 21-F15 — the naming law, on the deployment state that exists", () => {
  /**
   * ⚠ **§B's `21-F15` ASSERTION READS THE HIRE FORM'S SELECT LABELS ON A FIXTURE WHERE EVERY BRANCH
   * IS NAMED — which is the one state in which the law has nothing to catch.** The FR predicts its
   * own survival in those words: a screen showing an id where a name belongs *"passes typecheck,
   * passes its story, passes its `.dom.test.tsx` assertion that the label is present, and is
   * nonsensical to the only person who matters"*. An assertion pointed at the named fixture is that
   * `.dom.test.tsx` assertion.
   *
   * **Where it bites is the empty directory, and that is not an edge case — it is the only
   * deployment state this product has.** Nothing writes the directory tables, so `tenancy.directory`
   * answers `[]` for every real tenant, and the review that sent this section measured all three
   * name slots on the shipped screen rendering the key:
   *
   *     Nadia KhanCashier · branch-gulbergWorkingDeactivate at branch-gulbergEdit where she works
   *     Nadia Khan stops working at branch-gulberg as soon as you confirm, and nothing on this
   *     screen brings her back.
   *
   * A roster row, a control, and the sentence an owner reads before an irreversible act — `21-F15`'s
   * own definition of a name slot names all three ("a heading, a list row, a tile label, a report
   * axis, a printed document field, a spoken or logged sentence a staff member reads").
   *
   * **THREE DIRECTORIES, AND THE THIRD IS THE ONE THAT MATTERS.** Empty proves the law is met at
   * all; populated proves the sweep is not passing on silence; and **partial** — a directory that
   * names DHA and not Gulberg — is the fixture no cheap fix survives. `branches.length === 0 ?
   * treatment : id` is the repair an implementer reaches for first, it satisfies the empty case
   * completely, and it puts the key back on the glass the day the directory gets its first row.
   * That is this wave's named defect (a guard pointed one case away) and choosing the fixture is
   * the only thing that catches it.
   */
  const armIfOffered = async (personName: string): Promise<boolean> => {
    const controls = buttonsNamed(DEACTIVATE, rowOf(personName));
    if (controls.length === 0) return false;
    fireEvent.click(controls[0] as HTMLElement);
    // The consequence renders after the click; nothing is sent by arming (§D asserts that).
    await settleSends();
    return true;
  };

  const sweep = async (personName: string): Promise<readonly string[]> => {
    const resting = idsInNameSlots();
    await armIfOffered(personName);
    return [...new Set([...resting, ...idsInNameSlots()])];
  };

  it("EMPTY directory — no name slot renders an identifier the product has no name for", async () => {
    mount({ branches: [] });
    await rosterShown();
    expect(await sweep(NADIA.display_name)).toEqual([]);
  });

  it("EMPTY directory — the slot that names a branch when it can says what is missing when it cannot", async () => {
    /**
     * `21-F15`'s counterpart half: the treatment "says what is missing and where it is set … it is
     * never blank — a blank is the same lie with less information". So a screen cannot satisfy the
     * sweep above by deleting the place from the row.
     *
     * **The control is inside the test**, and it is what keeps this from binding an implementation
     * the FR does not bind: a screen that never puts a place on a person's row has no name slot
     * there to treat, and is asked for nothing. The requirement fires only against a screen that
     * showed a branch when it had one — read from the populated fixture, in the same test, so the
     * two halves cannot drift apart.
     */
    mount();
    await rosterShown();
    const namedWhenItCould = phrases(rowOf(NADIA.display_name)).some((phrase) =>
      phrase.includes("Gulberg"),
    );
    cleanup();

    mount({ branches: [] });
    await rosterShown();
    const row = phrases(rowOf(NADIA.display_name));
    const treated = row.some((phrase) => UNNAMED_TREATMENT.test(phrase));
    const verdict =
      namedWhenItCould && !treated
        ? `the row named a branch when it could and says nothing when it cannot; it says: ${row.join(" | ")}`
        : "ok";
    expect(verdict).toBe("ok");
  });

  it("EMPTY directory — and the screen says WHERE the missing name is set (00 §5.7)", async () => {
    /**
     * The half of `21-F15` that changes what gets built: "an unnamed record is a **missing field
     * upstream**, so the fix is the required field on the record, never a prettier fallback". A
     * treatment that says only *unnamed* has retired the question; one that says where the name is
     * set has filed it. Matched as §F matches the same shape — a leaf STATEMENT rather than a word,
     * because `21-F15`'s own worked failure is a word that satisfied a matcher.
     *
     * ⚠ **AND THE FIRST DRAFT OF THIS ASSERTION WAS SATISFIED BY A ROW LABEL — MEASURED, 0 KILLS
     * AGAINST THE MUTANT THAT DELETES THE STATEMENT ALTOGETHER.** Without the row filter below the
     * statement it accepted was `"Branch manager · Branch not named"`: six "words" once the `·`
     * separator is counted as one, both matchers satisfied, and it is the SLOT rather than a
     * statement about it. That is §F's recorded failure one section down — *"a `/till|device/i`
     * sweep satisfied by an unrelated row label"* — reproduced inside the section written to close
     * the same class of gap, and found by mutating rather than by reading. The rows are excluded
     * because a row cannot be the statement: it is the thing the statement is about.
     */
    mount({ branches: [] });
    await rosterShown();
    const rows = PEOPLE_NAMES.map(rowOf);
    const leaves = Array.from(document.querySelectorAll("*"))
      .filter((element) => element.children.length === 0)
      .filter((element) => !rows.some((row) => row.contains(element)))
      .map(textOf);
    const statements = leaves.filter(
      (text) => wordCount(text) >= 6 && /name/i.test(text) && /branch|location/i.test(text),
    );
    const candidates = leaves.filter((text) => /name|branch|location/i.test(text));
    expect(
      statements.length === 0
        ? `nothing states where a branch name is set; the screen's naming words are: ${candidates.join(" | ")}`
        : "stated",
    ).toBe("stated");
  });

  it("POPULATED directory — the same sweep, so no slot keeps the key beside the name", async () => {
    // §B checks the hire form's option labels only. A row, a control and a consequence sentence are
    // name slots the form never touches, and on this fixture the product knows every name — so an
    // identifier appearing here is the law broken in the state it is easiest to get right.
    mount();
    await rosterShown();
    expect(await sweep(NADIA.display_name)).toEqual([]);
  });

  it("PARTIAL directory — one branch named and one not, which no `is the directory empty` fix survives", async () => {
    // Nadia is at Gulberg, which this directory does not name; Ayesha is at DHA, which it does.
    // Both people are on the screen at once, so the treatment and the name have to coexist — the
    // state a screen that switches on `branches.length` renders as a key.
    mount({ branches: [BRANCHES[1] as BranchListing] });
    await rosterShown();
    expect(await sweep(NADIA.display_name)).toEqual([]);
  });
});
