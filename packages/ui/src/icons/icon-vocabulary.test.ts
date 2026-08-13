// ACCEPTANCE TESTS — AUTHORED FROM SPEC TEXT ONLY (`24 §3` step 2).
//
// PROVENANCE: written by a test-authoring session against `specs/27-design-language.md` §5
// (`27-F30`..`27-F37`), `plans/wave-1/role-task-inventories.md`, `packages/domain/src/registry.ts`
// and `00 §5.6`. No implementation existed when these were written — `packages/ui` contained no
// icon component, no icon token and no `src/icons` of any kind — so nothing here was read off
// working code. They are expected RED until the vocabulary is drawn.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// WHAT THIS SUITE IS AND IS NOT EVIDENCE FOR
//
// `27-F35` is the gate that decides whether these symbols work: **≥85% correct and ≤5% critical
// confusion on a post-training retest with real staff**, with `27-F34` run as "show the real
// page, name the function, record the tap". **THAT TEST HAS NOT BEEN RUN.** Nothing in this file
// is a substitute for it and no assertion here should ever be quoted as if it were. A machine can
// check that a drawing is a line drawing, that it is not a copy of its neighbour, that it names a
// task somebody performs and that it never travels without its word. It cannot check that a
// cashier in Lahore looks at it and says "khata".
//
// So the one property this suite defends hardest is the one that survives the gate being unrun:
// **an icon ACCOMPANIES a label, it never REPLACES one.** `27-F5` wants a labelled target, and an
// unvalidated pictogram alone is a guess about people we have not met. Going icon-only is gated
// on `27-F35` passing, and that is stated here rather than in a commit message so it cannot be
// quietly forgotten.
//
// ⚠ A SOURCE-SCANNING TEST MUST NOT SCAN ITSELF (`citations.oracle.test.ts` learned this the hard
// way in this package). The scan below excludes `*.test.ts` / `*.test.tsx`, and that exclusion is
// asserted rather than assumed.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// FOUR THINGS THE IMPLEMENTER WILL HIT, MEASURED AGAINST A WORKING IMPLEMENTATION, NOT GUESSED
//
// 1. **`discipline-ast.oracle.test.ts` pins the exact file list under `src/`** and adding
//    `icons/index.tsx` reddens it by design — *"adding a component should require acknowledging
//    that it is now under the guards."* Add the path there; it is a required part of the work,
//    not a broken test. These two test files are exempt (it skips `*.test.tsx?`).
// 2. **That rail DOES reach `src/icons/`** — it walks `src/` recursively. So the raw-colour ban
//    already covers the drawings: a hex in an icon fails it as well as the currentColor test in
//    the companion file. (`discipline.test.ts`, the older regex guard, reads only
//    `src/components/*.tsx` and does NOT see this directory.)
// 3. **`pnpm seams:check` will call `Icon`/`IconLabel` unreached** until a shipping surface
//    imports them. That is the wave's named defect in miniature and it is the point: a drawn
//    vocabulary no screen renders is a correct subsystem with no seam to the product.
// 4. **The tests are typed through a structural VIEW of the registry, not through the
//    implementation's own literal types**, so `as const satisfies Record<string, IconEntry>` is
//    free to be used. See `EntryView` below for why that mattered.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { ORDER_CHANNELS, PAYMENT_METHODS } from "@restos/domain";
import { describe, expect, it } from "vitest";
import { ICON_NAMES, ICONS } from "./index";

/**
 * A STRUCTURAL VIEW over the registry, and the reason it exists rather than indexing `ICONS`
 * directly: these tests must typecheck against any correct implementation, and an implementation
 * that writes `as const satisfies Record<string, IconEntry>` — a good idiom, and the one the
 * package already uses for its token maps — narrows `tasks` to a literal tuple. TypeScript then
 * rejects `tasks.length === 0` as a comparison with no overlap, and the suite goes RED against a
 * CORRECT implementation, which is the failure this round's law weighs equally with a vacuous
 * test. The view pins the CONTRACT (what fields exist, of what kind) and leaves the literal
 * typing to the implementer.
 */
type EntryView = {
  group: string;
  kind: string;
  depicts: string;
  tasks: readonly string[];
};
const NAMES: readonly string[] = ICON_NAMES as readonly string[];
const entryOf = (name: string): EntryView => {
  const e = (ICONS as Record<string, EntryView | undefined>)[name];
  if (!e) throw new Error(`ICONS has no entry for "${name}" — the vocabulary has forked`);
  return e;
};

const HERE = new URL(".", import.meta.url).pathname;
const REPO_ROOT = new URL("../../../..", import.meta.url).pathname.replace(/\/$/, "");

/** The shipped icon sources — the drawings and the components, never the tests that read them. */
const ICON_SOURCES = readdirSync(HERE)
  .filter((f) => [".ts", ".tsx"].includes(extname(f)))
  .filter((f) => !/\.test\.tsx?$/.test(f))
  .map((f) => [f, readFileSync(join(HERE, f), "utf8")] as const);

describe("the scan is honest about its own corpus", () => {
  it("reads the implementation and never the tests that read it", () => {
    const names = ICON_SOURCES.map(([f]) => f);
    expect(names.filter((f) => f.includes(".test."))).toEqual([]);
    expect(names.length, "no icon source found at all — the drawings have no home").toBeGreaterThan(
      0,
    );
  });
});

/**
 * ═══ `27-F37` — THE VOCABULARY IS CAPPED, PINNED, AND EVERY MEMBER IS ARGUED FOR ═══
 *
 * *"Chrome icons are capped at ~25 symbols product-wide and are absolutely stable."* A cap is
 * only a cap if something counts, and "absolutely stable" is only stable if something pins the
 * membership — otherwise the set grows one plausible symbol at a time and every addition
 * re-teaches the whole product to a staff member who navigates by memorised position (`00 §5.6`).
 *
 * **THE PIN IS TWENTY NAMES, DERIVED — NOT COPIED FROM A DESIGN.** Where a closed kernel
 * vocabulary already exists the icon takes its key verbatim, so a symbol can never name a
 * concept the ledger does not have (commandment 2):
 *
 *   - **order type** (3) — `dine_in` / `takeaway` / `delivery`. `02-F1`'s type axis, named in
 *     `packages/domain/src/registry.ts`'s own warning that types and channels are different axes.
 *     Task **C4**, ~75×/shift, sale-stopping.
 *   - **channel** (5) — every member of `ORDER_CHANNELS` (`02-F42`). Tasks **C4** (counter),
 *     **C18** (phone), **C19** (storefront, whatsapp), **C21** (foodpanda).
 *   - **payment** (5) — every member of `PAYMENT_METHODS`. Tasks **C11**, **C12**, **C13**, and
 *     **C33**, which is what earns `aggregator_receivable` its symbol: a cashier never taps it as
 *     a tender, but shift close shows *"one numeric field per method"* and a method with no
 *     symbol among four that have one is the row she cannot name.
 *   - **chrome** (7) — `sold_out` (**C22**, **K6**), `done` (**K3**, **C32**), `remove` (**C8**,
 *     the `✕ NO` the cart already renders), `backspace` and `clear` (**C1**, **C11** — the two
 *     keys `NumericKeypad` currently draws as `⌫` and the letter `C`), `page_previous` and
 *     `page_next` (**C6**, **C31**, and `03-F46`'s paging).
 *
 * **ONE SYMBOL FROM THE BRIEFED FIRST CUT IS DELIBERATELY ABSENT: `hand_over`.** Its only tasks
 * are **C35** (rider handover, marked *Wave 2* in the inventory) and a `served` transition that
 * `AGENTS.md` records nothing emits. A symbol for a task no one can perform is feature tourism
 * (`21 §5`) spending one of ~25 permanently-learned slots, and `27-F37` calls the vocabulary
 * *absolutely stable* — which makes adding one cheap and removing one expensive. It is dropped,
 * on purpose, and this comment is the record of why.
 *
 * ⚠ The pin is a SET, not an order. Nothing here says which order they are declared in, because
 * nothing in the corpus does.
 */
const PINNED_VOCABULARY = {
  "order-type": ["dine_in", "takeaway", "delivery"],
  channel: ["counter", "phone", "storefront", "whatsapp", "foodpanda"],
  payment: ["cash", "card", "raast", "khata_credit", "aggregator_receivable"],
  chrome: ["sold_out", "done", "remove", "backspace", "clear", "page_previous", "page_next"],
} as const;

const PINNED_NAMES = Object.values(PINNED_VOCABULARY).flat();

describe("27-F37 — the vocabulary is capped and absolutely stable", () => {
  it("holds no more than the ~25-symbol cap", () => {
    // WRONG IMPLEMENTATION THIS CATCHES: the natural one. An icon set grows by accretion —
    // someone needs a symbol for "park", "reprint", "split", "refund", "drawer", and each is
    // individually reasonable. The cap is judgement (27-F37 says so itself), so the number is
    // soft; what is not soft is that a number exists and something enforces it.
    expect(
      NAMES.length,
      `${NAMES.length} symbols — 27-F37 caps the product at ~25`,
    ).toBeLessThanOrEqual(25);
  });

  it("declares each name exactly once", () => {
    expect(new Set(NAMES).size).toBe(NAMES.length);
  });

  it("is exactly the pinned set — no member added, none dropped", () => {
    // WRONG IMPLEMENTATION THIS CATCHES: a set that is *nearly* right — four of five channels,
    // or a helpfully-added `hand_over`. Neither reddens any other test in this suite: the
    // closure rules below pass on a subset and the justification rules pass on any symbol with
    // a real task id. Only the pin sees a gap or a stowaway.
    expect([...NAMES].sort()).toEqual([...PINNED_NAMES].sort());
  });

  it("agrees with itself — the registry and the name list are one vocabulary", () => {
    // A second source of truth for membership is how a set silently forks: `ICON_NAMES` is what
    // a sweep iterates, `ICONS` is what a render looks up, and a symbol in one and not the other
    // is either an unreachable drawing or a lookup that returns `undefined` on a live screen.
    expect(Object.keys(ICONS).sort()).toEqual([...NAMES].sort());
  });

  it("files every symbol under exactly the group the pin puts it in", () => {
    // The groups are not decoration: 27-F34 validates by MUTUAL DISTINCTNESS among co-displayed
    // siblings, so the group is the set an icon is judged against. Getting a member into the
    // wrong group silently weakens the distinctness check by comparing it to the wrong things.
    const declared = Object.fromEntries(
      Object.entries(PINNED_VOCABULARY).map(([g, names]) => [g, [...names].sort()]),
    );
    const actual: Record<string, string[]> = {};
    for (const name of NAMES) {
      const group = entryOf(name).group;
      actual[group] = [...(actual[group] ?? []), name].sort();
    }
    expect(actual).toEqual(declared);
  });
});

/**
 * ═══ COMMANDMENT 2 / `02-F42` — A SYMBOL NEVER NAMES A CONCEPT THE KERNEL DOES NOT HAVE ═══
 *
 * `registry.ts` closes `ORDER_CHANNELS` and `PAYMENT_METHODS` and states why in terms this
 * applies directly to: a channel is *"a PRICE KEY, not a report category"*, and its comment on
 * `PAYMENT_METHODS` says the schema is *"derived from `PAYMENT_METHODS` rather than transcribed,
 * so a sixth tender"* is picked up rather than missed. An icon set is a third transcription of
 * the same vocabulary and rots the same way — so it is derived here too.
 *
 * Note what this does and does not do. Closure (`⊆`) catches an INVENTED member. Coverage (`=`)
 * catches a MISSING one, and missing is the more interesting failure: `27-F34` judges an icon
 * against its co-displayed siblings, and among five tender tiles the one with no symbol is the
 * one a non-reader cannot identify at all. The pin above already fixes both, but these state the
 * property in terms of the kernel, so a **sixth tender** or a **sixth channel** landing in
 * `domain` reddens here and forces the vocabulary to be re-decided rather than silently lagging.
 */
describe("02-F42 — the channel and payment symbols are the kernel's own vocabulary", () => {
  const namesIn = (group: string) => NAMES.filter((n) => entryOf(n).group === group).sort();

  it("names every order channel and invents none", () => {
    expect(namesIn("channel")).toEqual([...ORDER_CHANNELS].sort());
  });

  it("names every payment method and invents none", () => {
    expect(namesIn("payment")).toEqual([...PAYMENT_METHODS].sort());
  });

  it("never files a type as a channel", () => {
    // registry.ts records this exact confusion as a real defect: `channel: "dine_in"` sat in 45
    // fixture sites across 26 files, invisible because the field accepted any string. An icon
    // set drawn from the wrong axis reproduces it on glass, where it is even harder to see.
    const channels = new Set<string>(namesIn("channel"));
    for (const type of PINNED_VOCABULARY["order-type"]) {
      expect(channels.has(type), `${type} is an order TYPE (02-F1), never a channel`).toBe(false);
    }
  });
});

/**
 * ═══ `27-F37` / `21 §5` — EVERY SYMBOL IS ARGUED FOR AGAINST A TASK SOMEBODY PERFORMS ═══
 *
 * `21 §5`: *"no screen exists without a role + task + budget. Feature tourism … is a spec
 * violation."* A symbol is cheaper to add than a screen and costs the same thing — a slot in a
 * vocabulary `27-F37` calls absolutely stable, learned once by someone who reads little.
 *
 * The check resolves the cited task id against `plans/wave-1/role-task-inventories.md` rather
 * than accepting any string, because "cite a task" degrades to "type something task-shaped"
 * within one session otherwise. This is the same rule commandment 2 applies to FR ids: *an ID
 * that greps to nothing means you invented it.*
 */
describe("27-F37 — every symbol is justified against a real task", () => {
  const INVENTORY = readFileSync(
    join(REPO_ROOT, "plans", "wave-1", "role-task-inventories.md"),
    "utf8",
  );

  it("reads the inventory it is checking against", () => {
    // Anti-vacuity. A missing or renamed inventory file would make every id below unresolvable
    // and this whole describe would fail for the wrong reason; a truncated one would make them
    // all resolvable against nothing. Two known rows, from two different roles.
    expect(/^\|\s*C4\s*\|/m.test(INVENTORY), "C4 is not in the inventory — wrong file?").toBe(true);
    expect(/^\|\s*K3\s*\|/m.test(INVENTORY), "K3 is not in the inventory — wrong file?").toBe(true);
  });

  it("cites at least one task per symbol", () => {
    const unjustified = NAMES.filter((n) => (entryOf(n).tasks?.length ?? 0) === 0);
    expect(unjustified, "a symbol nobody performs a task with — 21 §5 feature tourism").toEqual([]);
  });

  it("cites task ids that resolve in the role-task inventories", () => {
    // WRONG IMPLEMENTATION THIS CATCHES: `tasks: ["C99"]`, or `tasks: ["cashier settles"]` — a
    // justification field filled in to satisfy the shape rather than to make a claim.
    const unresolved: string[] = [];
    for (const name of NAMES) {
      for (const id of entryOf(name).tasks ?? []) {
        if (
          !/^[A-Z]\d{1,2}$/.test(id) ||
          !new RegExp(`^\\|\\s*${id}\\s*\\|`, "m").test(INVENTORY)
        ) {
          unresolved.push(`${name} cites ${id}, which is not a row in the inventory`);
        }
      }
    }
    expect(unresolved).toEqual([]);
  });

  it("records what each symbol DEPICTS, and no two depict the same thing", () => {
    // 27-F36 is a cultural-review CHECKLIST — clock faces read right-to-left, a house outline
    // read as "a village hut", grid encodings, literal colour realism, any icon denoting a
    // specific instance rather than a category. A checklist cannot be run against a bezier; it
    // is run against a sentence saying what was drawn. So the sentence is required to exist.
    //
    // ⚠ HONEST LIMIT: this asserts the review has an ARTIFACT, never that it was passed. The
    // checklist itself is human work and stays human work.
    const empty = NAMES.filter((n) => (entryOf(n).depicts ?? "").trim().length < 8);
    expect(
      empty,
      "a symbol with no record of what it draws — 27-F36 has nothing to review",
    ).toEqual([]);
    const seen = new Map<string, string>();
    const collisions: string[] = [];
    for (const name of NAMES) {
      const key = entryOf(name).depicts.trim().toLowerCase();
      const first = seen.get(key);
      if (first) collisions.push(`${first} and ${name} both depict "${key}"`);
      else seen.set(key, name);
    }
    expect(
      collisions,
      "two symbols drawing the same thing — 27-F34 fails before it is run",
    ).toEqual([]);
  });
});

/**
 * ═══ `27-F33` — AN ACTION SHOWS THE ACT; AN OBJECT SHOWS THE THING ═══
 *
 * *"Without motion cues, drawings read as places rather than actions — utensils read as 'the
 * kitchen', not 'washing up'."* The classification has to be DECLARED before it can be drawn
 * against, and the drawing half is checked in `icon-drawing.dom.test.tsx`.
 *
 * Two thirds of the classification is decided by the corpus and is pinned here; one symbol is
 * deliberately left free.
 *
 * **The three vocabulary groups are OBJECTS.** Their members are values of a closed kernel
 * vocabulary — a channel, a tender, an order type. The tile that carries one is pressed to
 * SELECT a category, and the reading wanted is "a delivery order", not "deliver something". A
 * motorbike with speed lines is the instinctive drawing for `delivery` and it is the exact
 * failure `27-F33` names, one direction over.
 *
 * **The chrome operators are ACTIONS.** `done`, `remove`, `backspace`, `clear`, `page_previous`
 * and `page_next` are all things a hand does; drawn statically they read as places (a page, a
 * key, a bin) and `27-F33` says so in terms.
 *
 * **`sold_out` is left unpinned on purpose.** `02-F7` is a control the cashier presses (C22) and
 * `01-F59` is a STATE a tile carries; the corpus supports both readings and settling it here
 * would be inventing policy. The drawing test enforces whichever the registry declares.
 */
describe("27-F33 — the action/object classification the drawing must then honour", () => {
  it("classifies every symbol", () => {
    const bad = NAMES.filter((n) => !["action", "object"].includes(entryOf(n).kind));
    expect(bad, "an unclassified symbol — 27-F33 cannot be checked against it").toEqual([]);
  });

  it("treats a value of a closed kernel vocabulary as an object", () => {
    // WRONG IMPLEMENTATION THIS CATCHES: `delivery` classified `action` so the drawing may carry
    // speed lines. It reads as "deliver it", on a tile whose job is to say which KIND of order
    // this is.
    const categories = NAMES.filter((n) =>
      ["order-type", "channel", "payment"].includes(entryOf(n).group),
    );
    expect(categories.length).toBeGreaterThan(10);
    for (const n of categories) {
      expect(entryOf(n).kind, `${n} names a category, not an act (27-F33)`).toBe("object");
    }
  });

  it("treats the chrome operators as actions", () => {
    for (const n of ["done", "remove", "backspace", "clear", "page_previous", "page_next"]) {
      expect(entryOf(n).kind, `${n} is an act (27-F33)`).toBe("action");
    }
  });

  it("has both kinds, so neither half of the drawing rule is vacuous", () => {
    // If every symbol were an object the motion-cue test would assert nothing at all and stay
    // green; if every symbol were an action the "objects carry none" half would. Two guards in
    // the drawing suite depend on this and cannot state it themselves.
    const kinds = new Set(NAMES.map((n) => entryOf(n).kind));
    expect([...kinds].sort()).toEqual(["action", "object"]);
  });
});

/**
 * ═══ `27-F30` / `27-F31` — NOTHING HERE CAME OFF A SHELF ═══
 *
 * `27-F30`: 987 Pakistani doctors, dentists and paramedics scored **42.2% mean comprehension on
 * ISO 7010** — literate professionals, on the international standard, with only 2 of 19 signs
 * clearing the threshold. *"Material Icons will not do better."* `27-F31`: locally developed
 * pictograms passed at **20 of 23 against 11 of 23** for imported equivalents.
 *
 * A machine cannot check that a shape was drawn locally with staff in the loop. It can check the
 * two mechanical ways an off-the-shelf set arrives: as a DEPENDENCY, and as a FETCH.
 *
 * ⚠ **A BLANKET WORKSPACE BAN WAS WRITTEN FIRST AND IT WAS WRONG — RECORDED HERE BECAUSE THE
 * CORRECTION IS A FINDING, NOT A LOOSENING.** The first draft of this test asserted that no
 * package anywhere declares an icon library, on the stated premise that *"`18 §14`'s allowlist
 * contains no icon library"*. It does. `18 §14` line 120 puts **`lucide-react` on internal tools
 * by name** — *"Internal tools (backoffice, platform-admin): shadcn/ui (Radix primitives) +
 * `lucide-react` icons — boring, fast, consistent"* — and repeats it in the Web dependency list.
 * `apps/backoffice` already imports from it in **eight** components. The blanket ban therefore
 * failed against a dependency the corpus explicitly permits, which is the "RED under a correct
 * implementation" failure this round's law weighs equally with a vacuous test.
 *
 * **THE TENSION IS REAL AND IS NOT THIS SUITE'S TO SETTLE** (commandment 2): `27-F30` forbids an
 * off-the-shelf set and `18 §14` prescribes one for the internal tools. The reading these tests
 * take — the narrowest one that leaves both documents standing — is that **`27-F30`'s evidence is
 * about the people it was measured on.** Its 42.2% is Pakistani clinicians on ISO 7010 and
 * `27-F31`'s 20-of-23 is *"low-literate participants"*; the back office is an owner-and-manager
 * surface on the cloud plane, and `21 §5`'s role contracts put a different reader in front of it.
 * So the ban is scoped to the **staff-facing operational surfaces**, and the permitted use is
 * asserted to STAY there — which is a stronger guard than the blanket one, because the failure
 * that actually matters is `lucide-react` spreading from the back office onto a till.
 *
 * A founder ruling could go the other way and put the whole product on locally-drawn symbols.
 * Nothing here forecloses that; the containment test would simply get shorter.
 */
describe("27-F30/F31 — the set is drawn here, not installed and not fetched", () => {
  const OFF_THE_SHELF = [
    "lucide",
    "heroicons",
    "react-icons",
    "feather-icons",
    "@mui/icons-material",
    "material-icons",
    "material-symbols",
    "font-awesome",
    "@fortawesome",
    "phosphor",
    "@tabler/icons",
    "bootstrap-icons",
    "remixicon",
    "ionicons",
    "@primer/octicons",
    "iconify",
    "@iconify",
    "unplugin-icons",
    "boxicons",
    "eva-icons",
    "css.gg",
  ];

  const manifests = (): [string, string][] => {
    const out: [string, string][] = [];
    const add = (p: string) => {
      const f = join(p, "package.json");
      try {
        if (statSync(f).isFile())
          out.push([f.slice(REPO_ROOT.length + 1), readFileSync(f, "utf8")]);
      } catch {
        /* no manifest here */
      }
    };
    add(REPO_ROOT);
    for (const group of ["packages", "apps", "services"]) {
      let entries: string[] = [];
      try {
        entries = readdirSync(join(REPO_ROOT, group));
      } catch {
        continue;
      }
      for (const e of entries) add(join(REPO_ROOT, group, e));
    }
    return out;
  };

  it("finds the workspace manifests it is checking", () => {
    const found = manifests().map(([f]) => f);
    expect(found).toContain("package.json");
    expect(found).toContain("packages/ui/package.json");
    expect(found.length).toBeGreaterThan(5);
  });

  /** `18 §14` line 120 names these two, and only these two, as the internal-tool exception. */
  const INTERNAL_TOOLS = ["apps/backoffice", "apps/platform-admin"];

  const declarers = (): { pkg: string; dep: string }[] => {
    const out: { pkg: string; dep: string }[] = [];
    for (const [file, raw] of manifests()) {
      const pkg = JSON.parse(raw) as Record<string, Record<string, string> | undefined>;
      const declared = Object.keys({
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
        ...(pkg.peerDependencies ?? {}),
      });
      for (const dep of declared) {
        if (
          OFF_THE_SHELF.some((lib) => dep === lib || dep.startsWith(`${lib}/`) || dep.includes(lib))
        )
          out.push({ pkg: file.replace(/\/package\.json$/, ""), dep });
      }
    }
    return out;
  };

  it("keeps every icon library off the staff-facing surfaces", () => {
    // WRONG IMPLEMENTATION THIS CATCHES: `pnpm add lucide-react` in `packages/ui` and twenty
    // re-exports — which is what "use internet icon sets as reference" degrades into under time
    // pressure, passes every other test in this suite, and is the exact thing 42.2% measures.
    const offences = declarers()
      .filter(({ pkg }) => !INTERNAL_TOOLS.includes(pkg))
      .map(({ pkg, dep }) => `${pkg} declares ${dep}`);
    expect(
      offences,
      "27-F30: no off-the-shelf set on a surface a low-literate staff member reads",
    ).toEqual([]);
  });

  it("keeps 18 §14's internal-tool exception CONTAINED, and proves the guard is live", () => {
    // Two claims in one test on purpose. The first is the containment above, stated positively.
    // The second is anti-vacuity of a kind this repo has been bitten by: a guard whose corpus
    // contains no instance of what it forbids passes for free, and `citations.oracle.test.ts`
    // asserts the same thing about its own exclusions ("a silent exclusion would just move the
    // problem from permanently red to silently green"). There IS an instance — `apps/backoffice`
    // — so the matcher is proven to match, and the day the exception spreads, the test above
    // reddens rather than this one going quiet.
    const found = declarers().map(({ pkg }) => pkg);
    expect(
      found.length,
      "no icon library anywhere — is OFF_THE_SHELF still matching?",
    ).toBeGreaterThan(0);
    expect([...new Set(found)].filter((p) => !INTERNAL_TOOLS.includes(p))).toEqual([]);
  });

  it("draws every symbol inline, with no remote reference and no raster", () => {
    // 27-F32: photographs measured WORST of five visual representations — extraneous detail
    // actively hurts. A raster is also a thing that can be fetched, cached, and missing on a
    // till with no WAN, which commandment 4 does not permit for chrome that carries meaning.
    const offences: string[] = [];
    for (const [file, raw] of ICON_SOURCES) {
      // ⚠ The SVG NAMESPACE is a URL and is not a fetch. `xmlns="http://www.w3.org/2000/svg"` is
      // an identifier the parser matches on, never a request, and a naive `https?://` ban reds a
      // correct implementation for writing it — which is the "test that stays RED under a correct
      // implementation" failure this round's law names as being as damaging as a vacuous one. It
      // is excluded by exact prefix rather than by loosening the rule.
      const src = raw.replaceAll("http://www.w3.org/", "«svg-namespace»/");
      const forbidden: [RegExp, string][] = [
        [/https?:\/\//, "a remote URL"],
        [/\bfetch\s*\(/, "a runtime fetch"],
        [/<img\b/, "a raster <img>"],
        [/<image\b/, "an SVG <image> (raster)"],
        [/data:image\//, "an embedded raster"],
        [/\burl\(/, "a CSS url() reference"],
      ];
      for (const [re, what] of forbidden) {
        if (re.test(src)) offences.push(`${file} contains ${what}`);
      }
    }
    expect(offences).toEqual([]);
  });
});

/**
 * ═══ `27-F35` — THE GATE HAS NOT BEEN RUN, SO THE ICON NEVER TRAVELS ALONE ═══
 *
 * This is the single most important thing in the suite and the one failure that would make the
 * whole track worse than not doing it: an icon that REPLACES a label before `27-F35`'s ≥85%
 * comprehension / ≤5% critical-confusion retest has been run on real staff.
 *
 * The behavioural half — the label renders, visibly, and carries the accessible name — is in
 * `icon-drawing.dom.test.tsx`. The half here is STRUCTURAL, and it is the package's own standing
 * rule: *"a component that can be configured into violating a law is not a closed vocabulary."*
 * If a prop exists that suppresses the label, then somewhere between here and the pilot a screen
 * will pass it, and the gate will have been skipped by a boolean.
 */
describe("27-F35 — going icon-only is not something a caller can opt into", () => {
  it("exposes no prop that suppresses the word", () => {
    // WRONG IMPLEMENTATION THIS CATCHES: `<IconLabel iconOnly>` / `hideLabel` / `labelHidden` /
    // `srOnly` — every one of which is a reasonable-looking API and each is the gate being
    // skipped. Matched on the source rather than by rendering, because the defect is that the
    // prop EXISTS: a prop nothing passes today is a prop a compact layout passes next month.
    const banned =
      /\b(iconOnly|icon_only|hideLabel|labelHidden|showLabel|withoutLabel|noLabel|srOnly|visuallyHidden|labelless)\b/;
    const offences = ICON_SOURCES.filter(([, src]) => banned.test(src)).map(([f]) => f);
    expect(offences, "a switch that turns an unvalidated pictogram into the only signal").toEqual(
      [],
    );
  });

  it("records the unrun gate in its own header — DOCUMENTATION TRIPWIRE, not a behavioural guard", () => {
    // Stated as what it is. This proves a sentence exists; it proves nothing about behaviour,
    // and it is reported separately from the mutation kills for that reason. It is here because
    // the next reader of this module needs to know the gate is outstanding at the moment they
    // are tempted to drop a label to buy 40 dp, and a comment in a commit message is not where
    // they will look.
    const cited = ICON_SOURCES.some(([, src]) => src.includes("27-F35"));
    expect(cited, "no icon source cites 27-F35 — the gate it is waiting on").toBe(true);
  });
});
