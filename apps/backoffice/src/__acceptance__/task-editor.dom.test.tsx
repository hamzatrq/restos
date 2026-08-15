/**
 * **THE TASK-SHAPED CATALOG EDITOR — `14-F32`..`14-F38`, asserted through the SHIPPED component.**
 *
 * ⚠ **AUTHORED FROM SPEC TEXT ONLY** (`24 §3` step 2), by a session that implemented **none** of
 * it and wrote no line of `components/entry-editor.tsx`, `price-grid.tsx` or `apply-when.tsx`. The
 * source is `specs/14-backoffice.md` §"The catalog editor's SHAPE" and its §8 walkthrough *"Add a
 * dish (14-F32..F37)"*, plus the founder review those FRs quote: *"this is very complex interface.
 * What even is this. this is so hard to use. I cant understand a single thing."*
 *
 * ---------------------------------------------------------------------------------------------
 * THE CONTRACT THIS ORACLE FIXES — everything else is the implementer's
 * ---------------------------------------------------------------------------------------------
 *
 * An acceptance suite written before an implementation has to fix *something*, and every fixed
 * point is a decision taken away from the implementer. These are deliberately few, and each has a
 * reason that is not taste:
 *
 *  1. **The component keeps its name, its file and its props** — `EntryEditor({ initial, enabled,
 *     onSaved })`. `14-F32` reshapes what the surface ASKS, not where it lives, and inventing a
 *     new module would make `catalog-screen.tsx` (a file this session may not touch, and did not)
 *     part of the change for no FR's sake.
 *  2. **The editor reads the existing catalog from `catalog.published`.** Three of these FRs need
 *     it and none of them can be satisfied without it: `14-F33`'s parent chosen *"by the parent's
 *     name, from the entries that exist"*, its org-wide id collision check, and `14-F35`'s
 *     *resolved* inherited station. This component already runs `catalog.history` itself, so the
 *     query belongs here by the file's own precedent, and Commandment 5 is untouched — tRPC +
 *     TanStack Query, never a store.
 *  3. **The identifier is generated CLIENT-SIDE and travels in the save.** Not a preference:
 *     `saveInput` on the server is `z.object({ entry: CatalogEntryWire, … })` and
 *     `CatalogEntryWire.id` is `z.string().min(1)`, so a client that sent no id would be refused
 *     by a protected-path schema (`packages/sync-protocol`). Moving derivation to the server is a
 *     legitimate design — it is also a spec change to a protected path, and this oracle is not the
 *     place that decides it. If that change is made, these three assertions are the ones to bring
 *     to the test-owning session; do not weaken them in place (`24-F5`).
 *  4. **Help is bound to its control with `aria-describedby`.** `14-F34` requires the sentence
 *     *"rendered adjacent to it and readable without pointing at it — never a tooltip, a hover or
 *     a `title` attribute as the only carrier"*. **Adjacency is a layout property and happy-dom
 *     performs no layout** (`AGENTS.md`: every `getBoundingClientRect` is zeroes), so "adjacent"
 *     is not assertable here at all. The accessible description is the one binding between *this
 *     control* and *that sentence* a DOM can carry, and it satisfies the FR's negative clause by
 *     construction: a `title` tooltip is not a description a screen reader reads as one, and an
 *     `aria-describedby` sentence is rendered text, not a hover. One shared help element may serve
 *     several controls — the price cells are asserted that way below.
 *
 * **What this oracle deliberately does NOT assert**, so nobody reads its silence as permission:
 * `14-F33`'s *"pre-selects the section the owner was looking at"* (the editor is given no such
 * prop today, and inventing one is a screen-frame decision this session may not take);
 * `14-F32`'s task set beyond a dish and a menu section (doc 14 §9.7 has an OPEN QUESTION on which
 * of the five kinds a Wave-1 owner needs a create task for, and an oracle must not close a
 * question the corpus left open); and every layout, order and size claim, which is `pnpm
 * layout:check`'s domain and which no gate in this repo points at these screens at any width.
 *
 * ---------------------------------------------------------------------------------------------
 * THE HAPPY-DOM TRAP THIS FILE IS WRITTEN AROUND — read before adding an assertion
 * ---------------------------------------------------------------------------------------------
 *
 * `apps/backoffice/CLAUDE.md` names it as the reason progressive disclosure was not attempted:
 * *"happy-dom finds elements inside a closed `<details>` and `fireEvent.change` works on them, so
 * `editor.dom.test.tsx` would stay green while a real owner could not type an ID."* So every
 * disclosure claim below is **structural** — it reads the closed state's own text and walks
 * ancestors — and never `queryBy…`, which cannot tell open from closed here and would make
 * `14-F34`'s whole disclosure requirement vacuous.
 *
 * ---------------------------------------------------------------------------------------------
 * MUTATION MATRIX (the round-3 law) — control 35/35 green, 30 mutants, **0 survivors**
 * ---------------------------------------------------------------------------------------------
 *
 * Run out-of-tree against a plausible reference implementation of `14-F32`..`14-F38` written by
 * this session in a scratchpad copy of the app, never in the repo. Every row is ONE branch of that
 * implementation; the right-hand column is measured, not argued.
 *
 * | #    | mutant (one branch)                                                    | killed |
 * |------|------------------------------------------------------------------------|--------|
 * | M1   | create skips the task chooser — the shipped one-form shape              | 30     |
 * | M1b  | a kind selector is offered as a control                                 | 1      |
 * | M2   | the tasks are bare nouns with no explanation                            | 1      |
 * | M3   | one form for both — a section gets the grid and the printing group      | 1      |
 * | M4   | the internal kind string is rendered instead of the task noun           | 1      |
 * | M5   | an `ID` text box (the shipped control)                                  | 1      |
 * | M6   | the identifier is an opaque UUID                                        | 2      |
 * | M7   | **CONTROL** the collision check is per KIND, not per ORG                | 1      |
 * | M8   | the saved identifier is shown in a `readOnly` control                   | 1      |
 * | M9   | the parent is a free-text identifier box                                | 3      |
 * | M10  | no sort is assigned                                                     | 1      |
 * | M11  | one field ships with no help at all                                     | 1      |
 * | M12  | a field's help repeats its label                                        | 1      |
 * | M13  | the help is a `title` tooltip instead                                   | 1      |
 * | M14  | the price grid is tidied away behind a disclosure                       | 1      |
 * | M15  | the collapsed group says only what it is called                         | 4      |
 * | M16  | the inherited station is not resolved (an empty value)                  | 1      |
 * | M17  | **CONTROL** the platform fallback rendered as the owner's own choice    | 1      |
 * | M18  | the default outcome is never stated, only labelled                      | 2      |
 * | M18b | the timing fieldset sits in the middle of data entry                    | 1      |
 * | M19  | apply-now is pre-selected                                               | 2      |
 * | M20  | apply-now is remembered between edits                                   | 1      |
 * | M21  | the count is rendered into a `hidden` element                           | 4      |
 * | M22  | **CONTROL** an explicit `0` counts as missing (truthiness)              | 1      |
 * | M23  | the commit control is disabled until the grid is complete               | 2      |
 * | M24  | the refusal names only the FIRST missing pair                           | 1      |
 * | M25  | **CONTROL** the count is coloured while merely unfinished               | 1      |
 * | M26  | a help sentence carries its FR citation (the founder's screenshot)      | 2      |
 * | M27  | the typed rupees are forwarded (off by a factor of 100)                 | 1      |
 * | M28  | a blank station travels as `""` rather than `null`                      | 1      |
 *
 * **The six one-kill rows are why the other numbers mean anything.** M7 changes only the scope of
 * the collision check and fires only the cross-kind assertion; M17 changes only the attribution of
 * the fallback station and fires only that one; M22 and M25 each move one branch of the count. The
 * suite discriminates between claims rather than reddening on any change.
 *
 * ⚠ **THREE OF THESE ROWS WERE SURVIVORS ON THE FIRST RUN, and each exposed a defect in this file
 * rather than in the implementation** — which is the round-3 law's whole point, and the reason a
 * suite is not evidence until it has been mutated:
 *
 *   M4  survived because `textContent` concatenates adjacent elements, so the rendered word
 *       `modifier` became the token `modifierReference` and `\bmodifier\b` stopped matching. Every
 *       word-boundary assertion here, including `14-F38`'s whole sweep, was defeatable that way.
 *   M21 survived because a `hidden` paragraph still has `textContent` — the count was invisible to
 *       an owner and perfectly readable to the test.
 *   M24 survived because the refusal's four words are ALREADY on screen as row and column headers,
 *       so a whole-document sweep could not tell a refusal naming two pairs from one naming none.
 *       It is now asserted against the text the press INSERTED.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EntryEditor } from "../components/entry-editor";
import type { CatalogEntry } from "../lib/catalog-types";
import type { EnabledPairs } from "../lib/price-grid";
import { type CallLog, type Handlers, Harness } from "./harness";

afterEach(cleanup);

/** Three branches × three channels = **nine** pairs, which is `14-F37`'s own worked example. */
const THREE: EnabledPairs = {
  branches: ["gulberg", "dha", "johar"],
  channels: ["counter", "phone", "foodpanda"],
};

const everywhere = (price_paisa: number) =>
  THREE.branches.flatMap((branch_id) =>
    THREE.channels.map((channel) => ({ branch_id, channel, price_paisa })),
  );

/**
 * The published catalog these tests run against. **The fixture is the coverage boundary** — this
 * repo has measured that twice (`P1`'s renamed entry, `B1b`'s CLI-revoked device), so each entry
 * below exists to make one wrong implementation distinguishable from the right one:
 *
 *   `karahi-handi`  a section that DOES set a station → `14-F35`'s resolved value has an origin.
 *   `cold-drinks`   a section that sets none → `14-F35`'s terminal, platform-owned fallback.
 *   two siblings    sorts 2 and 5 → `14-F33`'s *"appends after the last entry"* is falsifiable.
 *   `extra-raita`   an **add-on**, so a dish named *Extra Raita* collides ACROSS KINDS —
 *                   `14-F33`'s *"uniqueness is per ORG across every kind, not per kind"*, which a
 *                   per-kind generator passes on every same-kind fixture.
 */
const SECTION_WITH_STATION = {
  kind: "category",
  id: "karahi-handi",
  name: "Karahi & Handi",
  sort: 1,
  station: "grill",
} as CatalogEntry;

const SECTION_WITHOUT_STATION = {
  kind: "category",
  id: "cold-drinks",
  name: "Cold Drinks",
  sort: 2,
} as CatalogEntry;

const SIBLING_EARLY = {
  kind: "item",
  id: "mutton-karahi",
  name: "Mutton Karahi",
  parent_id: "karahi-handi",
  sort: 2,
  prices: everywhere(320000),
} as CatalogEntry;

const SIBLING_LAST = {
  kind: "item",
  id: "chicken-karahi",
  name: "Chicken Karahi",
  parent_id: "karahi-handi",
  sort: 5,
  prices: everywhere(185000),
} as CatalogEntry;

const ADD_ON = {
  kind: "modifier",
  id: "extra-raita",
  name: "Extra Raita",
  parent_id: "cold-drinks",
  sort: 1,
  prices: everywhere(0),
} as CatalogEntry;

const ENTRIES: readonly CatalogEntry[] = [
  SECTION_WITH_STATION,
  SECTION_WITHOUT_STATION,
  SIBLING_EARLY,
  SIBLING_LAST,
  ADD_ON,
];

const RECEIPT = {
  edit_id: "e1",
  apply_when: "day_end",
  lands_at: 1_800_000_000_000,
  version: null,
};

const handlers = (entries: readonly CatalogEntry[]): Handlers => ({
  "catalog.published": () => ({ version: 7, entries }),
  "catalog.enabled": () => THREE,
  "catalog.history": () => [],
  "catalog.save": () => RECEIPT,
  "catalog.archive": () => RECEIPT,
});

const mount = (
  initial: CatalogEntry | null,
  entries: readonly CatalogEntry[] = ENTRIES,
): CallLog => {
  const log: CallLog = [];
  render(
    <Harness log={log} handlers={handlers(entries)}>
      <EntryEditor initial={initial} enabled={THREE} onSaved={() => {}} />
    </Harness>,
  );
  return log;
};

// ── reading the rendered surface ──────────────────────────────────────────────────────────────

const squash = (text: string): string => text.replace(/\s+/g, " ").trim();

/**
 * The rendered words, with **one space between every text node**.
 *
 * ⚠ Not `textContent`, and the difference is not cosmetic — it was found by mutating, which is the
 * only way it could have been. `textContent` concatenates adjacent elements with no separator, so
 * a paragraph reading `modifier` followed by one reading `Reference extra-raita` becomes the
 * single token `modifierReference` — and **every `\b`-anchored assertion in this file silently
 * stops matching.** Measured: the mutant that renders the internal kind string instead of
 * `14-F32`'s task noun — the exact defect that assertion exists to catch — passed 33 of 33 tests
 * against a `textContent` sweep, and is killed by this one. The same hole sits under `14-F38`'s
 * jargon sweep, where a token abutting the next element would have read as clean.
 *
 * ⚠ It also skips what an ATTRIBUTE hides (`hidden`, `aria-hidden`, an inline `display: none`),
 * found the same way: the mutant that renders `14-F37`'s count into a `hidden` paragraph passed 33
 * of 33 until this walk skipped it. **It cannot skip what a CLASS hides** — happy-dom computes no
 * styles, so a count inside a `class="hidden"` element still reads as rendered here. That case
 * belongs to a gate that performs layout, and no gate in this repo points at these screens
 * (`apps/backoffice/CLAUDE.md`). Stated so the coverage claim is not read wider than it is.
 */
const hiddenByAttribute = (node: Node): boolean => {
  if (!(node instanceof Element)) return false;
  return (
    node.hasAttribute("hidden") ||
    node.getAttribute("aria-hidden") === "true" ||
    /display:\s*none/.test(node.getAttribute("style") ?? "")
  );
};

const textOf = (node: Element | null): string => {
  if (node === null) return "";
  const parts: string[] = [];
  const walk = (parent: Node): void => {
    for (const child of Array.from(parent.childNodes)) {
      if (child.nodeType === 3) parts.push(child.textContent ?? "");
      else if (!hiddenByAttribute(child)) walk(child);
    }
  };
  walk(node);
  return squash(parts.join(" "));
};

const bodyText = (): string => textOf(document.body);
const words = (text: string): number => squash(text).split(" ").filter(Boolean).length;

/**
 * Every control that ACCEPTS OWNER INPUT (`14-F34`'s own phrase). Radix renders a radio as
 * `button[role="radio"]`, so a tag-name-only sweep would miss the timing choice entirely.
 */
const CONTROL_SELECTOR =
  'input, select, textarea, [role="radio"], [role="combobox"], [role="switch"], [role="spinbutton"]';

const controls = (): HTMLElement[] =>
  Array.from(document.querySelectorAll<HTMLElement>(CONTROL_SELECTOR)).filter(
    (el) =>
      el.getAttribute("type") !== "hidden" &&
      el.getAttribute("aria-hidden") !== "true" &&
      !el.hasAttribute("hidden"),
  );

const labelOf = (el: Element): string => {
  const aria = el.getAttribute("aria-label");
  if (aria !== null && aria.trim() !== "") return squash(aria);
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy !== null && labelledBy.trim() !== "") {
    return squash(
      labelledBy
        .split(/\s+/)
        .map((id) => textOf(document.getElementById(id)))
        .join(" "),
    );
  }
  const id = el.getAttribute("id");
  if (id !== null && id !== "") {
    const bound = document.querySelector(`label[for="${id}"]`);
    if (bound !== null) return textOf(bound);
  }
  return textOf(el.closest("label"));
};

/** The accessible DESCRIPTION — `14-F34`'s help sentence, as a DOM can carry it. See the header. */
const helpOf = (el: Element): string =>
  squash(
    (el.getAttribute("aria-describedby") ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => textOf(document.getElementById(id)))
      .join(" "),
  );

const named = (pattern: RegExp): HTMLElement[] =>
  controls().filter((el) => pattern.test(labelOf(el)));

/** A price cell is the one control whose name carries BOTH a branch and a channel (`01-F60`). */
const isCell = (el: Element): boolean => {
  const label = labelOf(el).toLowerCase();
  return (
    THREE.branches.some((branch) => label.includes(branch)) &&
    THREE.channels.some((channel) => label.includes(channel))
  );
};

const cells = (): HTMLElement[] => controls().filter(isCell);

const cell = (branch: string, channel: string): HTMLInputElement => {
  const hit = cells().find((el) => {
    const label = labelOf(el).toLowerCase();
    return label.includes(branch) && label.includes(channel);
  });
  if (hit === undefined) {
    throw new Error(
      `no price cell for (${branch}, ${channel}). Cells on screen: ${cells()
        .map((el) => `"${labelOf(el)}"`)
        .join(", ")}`,
    );
  }
  return hit as HTMLInputElement;
};

const type = (el: HTMLElement, value: string): void => {
  fireEvent.change(el, { target: { value } });
};

/** Prices every enabled pair by hand, so setup never depends on the fill-across control. */
const priceEveryPair = (value: string): void => {
  for (const branch of THREE.branches) {
    for (const channel of THREE.channels) type(cell(branch, channel), value);
  }
};

const buttons = (): HTMLElement[] => screen.queryAllByRole("button");

const commitControl = (): HTMLElement => {
  const hit =
    buttons().find((el) => /\b(save|publish)\b/i.test(textOf(el))) ??
    buttons().find((el) => /^(add|create)\b/i.test(textOf(el)));
  if (hit === undefined) {
    throw new Error(
      `no commit control. Buttons on screen: ${buttons()
        .map((el) => `"${textOf(el)}"`)
        .join(", ")}`,
    );
  }
  return hit;
};

/**
 * The `14-F28` timing choice, wherever it lives. `14-F36` allows it to be one act from the primary
 * button rather than always on screen, so the trigger that OFFERS the choice counts as the control.
 */
const timingControl = (): HTMLElement => {
  const hit =
    named(/apply now|day end|when this applies|straight away|immediately/i)[0] ??
    buttons().find((el) => /apply now|day end|when this applies|when it applies/i.test(textOf(el)));
  if (hit === undefined) {
    throw new Error(
      `14-F36 — nothing offers the timing choice. Controls: ${controls()
        .map((el) => `"${labelOf(el)}"`)
        .join(", ")} / Buttons: ${buttons()
        .map((el) => `"${textOf(el)}"`)
        .join(", ")}`,
    );
  }
  return hit;
};

/**
 * The text an act ADDED to the screen — common prefix and suffix removed.
 *
 * `14-F37` requires the refusal to name every missing pair, and every branch and channel name is
 * already on screen as a row and a column header, so a sweep of the whole document cannot tell a
 * refusal that names two pairs from one that names none. Measured: the mutant that names only the
 * FIRST missing pair passed a whole-document assertion. The insertion is the refusal.
 */
const inserted = (before: string, after: string): string => {
  let head = 0;
  while (head < before.length && before[head] === after[head]) head += 1;
  let tail = 0;
  while (
    tail < before.length - head &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) {
    tail += 1;
  }
  return after.slice(head, after.length - tail);
};

const savedEntry = (log: CallLog): Record<string, unknown> => {
  const call = log.find((entry) => entry.path === "catalog.save");
  if (call === undefined) throw new Error("no catalog.save was sent");
  return (call.input as { entry: Record<string, unknown> }).entry;
};

const savedInput = (log: CallLog): Record<string, unknown> => {
  const call = log.find((entry) => entry.path === "catalog.save");
  if (call === undefined) throw new Error("no catalog.save was sent");
  return call.input as Record<string, unknown>;
};

// ── the task chooser (`14-F32`) ───────────────────────────────────────────────────────────────

const TASK_ROLES = ["button", "radio", "link", "menuitem", "option", "tab"] as const;

const taskControls = (): HTMLElement[] =>
  TASK_ROLES.flatMap((role) => screen.queryAllByRole(role)).filter(
    (el) => !/^(save|publish|archive|cancel|fill)/i.test(textOf(el)),
  );

const taskControl = (pattern: RegExp): HTMLElement => {
  const hit = taskControls().find((el) => pattern.test(`${textOf(el)} ${labelOf(el)}`));
  if (hit === undefined) {
    throw new Error(
      `14-F32 — no create task matching ${pattern}. Offered: ${taskControls()
        .map((el) => `"${textOf(el)}"`)
        .join(", ")}`,
    );
  }
  return hit;
};

/** Starts one task and waits for its form. The name field is the one control every task has. */
const start = async (pattern: RegExp): Promise<void> => {
  await waitFor(() => taskControl(pattern));
  fireEvent.click(taskControl(pattern));
  await waitFor(() => nameControl());
};

/** The entry's own name — never the KITCHEN name, which is a different field (`03-F38`). */
const nameControl = (): HTMLElement => {
  const hit = controls().find((el) => {
    const label = labelOf(el).toLowerCase();
    return /name|called/.test(label) && !/kitchen|ticket|print/.test(label);
  });
  if (hit === undefined) {
    throw new Error(
      `no name control. Controls on screen: ${controls()
        .map((el) => `"${labelOf(el)}"`)
        .join(", ")}`,
    );
  }
  return hit;
};

const startDish = async (): Promise<void> => start(/dish/i);
const startSection = async (): Promise<void> => start(/section/i);

// ── disclosures, read in their CLOSED state (`14-F34`, `14-F35`) ──────────────────────────────

type Disclosure = { readonly trigger: Element; readonly closedText: string };

/**
 * What an owner can read WITHOUT opening the group. For `<details>` that is the summary; for an
 * `aria-expanded` trigger it is the trigger's own region with the controlled panel removed.
 * Computed by clone-and-delete rather than by `queryBy`, for the happy-dom reason in the header.
 */
const closedTextOf = (trigger: Element): string => {
  if (trigger.tagName === "SUMMARY") return textOf(trigger);
  const region = trigger.parentElement ?? trigger;
  const panelId = trigger.getAttribute("aria-controls");
  const clone = region.cloneNode(true) as HTMLElement;
  if (panelId !== null && panelId !== "") {
    for (const node of Array.from(clone.querySelectorAll(`#${panelId}`))) node.remove();
  }
  return textOf(clone);
};

const disclosures = (): Disclosure[] => [
  ...Array.from(document.querySelectorAll("summary")).map((trigger) => ({
    trigger,
    closedText: closedTextOf(trigger),
  })),
  ...Array.from(document.querySelectorAll("[aria-expanded]")).map((trigger) => ({
    trigger,
    closedText: closedTextOf(trigger),
  })),
];

const printingDisclosure = (): Disclosure => {
  const hit = disclosures().find((group) => /kitchen|print|ticket|station/i.test(group.closedText));
  if (hit === undefined) {
    throw new Error(
      `14-F34/14-F35 — no collapsed kitchen-printing group. Disclosures on screen: ${
        disclosures()
          .map((group) => `"${group.closedText}"`)
          .join(", ") || "none"
      }`,
    );
  }
  return hit;
};

/** Is this element inside something an owner would have to OPEN? Structural, never `queryBy`. */
const collapsedAncestorOf = (el: Element): Element | null => {
  let node: Element | null = el.parentElement;
  while (node !== null) {
    if (node.tagName === "DETAILS") return node;
    if (node.getAttribute("data-state") === "closed") return node;
    if (node.getAttribute("aria-hidden") === "true") return node;
    if (node.hasAttribute("hidden")) return node;
    node = node.parentElement;
  }
  return null;
};

// ── `14-F37`'s running count ──────────────────────────────────────────────────────────────────

const COUNT_PATTERNS: readonly RegExp[] = [
  /(\d+)\s*(?:of|\/)\s*\d+\s*(?:prices?|cells?|pairs?)/i,
  /(\d+)\s*(?:prices?|cells?|pairs?)[^.]{0,40}?(?:still needed|needed|missing|left|to set|unpriced|without a price)/i,
  /(?:still needed|needed|missing|left to set|unpriced)[^.]{0,40}?(\d+)/i,
];

const COMPLETE_PATTERN =
  /every price (?:is )?set|all (?:the )?prices? (?:are )?set|every cell (?:is )?priced|no prices? (?:are )?missing|nothing (?:is )?missing|prices? complete/i;

const stillNeeded = (): number => {
  for (const pattern of COUNT_PATTERNS) {
    const match = bodyText().match(pattern);
    if (match?.[1] !== undefined) return Number(match[1]);
  }
  throw new Error(
    `14-F37 — nothing on screen counts the unpriced pairs. Screen text: ${bodyText().slice(0, 900)}`,
  );
};

/** The leaf element carrying that count — `27-F16`'s colour claim is about THIS element. */
const countElement = (): HTMLElement => {
  const hit = Array.from(document.querySelectorAll<HTMLElement>("*")).find(
    (el) => el.children.length === 0 && COUNT_PATTERNS.some((pattern) => pattern.test(textOf(el))),
  );
  if (hit === undefined) throw new Error("14-F37 — no element carries the unpriced count");
  return hit;
};

// ── `14-F38`'s classes, declared HERE and not shared with the catalog oracle ───────────────────

/**
 * Deliberately a second declaration. `scripts/check-strings.mjs` is the repo-wide rail and
 * `owner-language.test.ts` is the catalog-side belt; **neither of them can see a literal that
 * reaches an owner through JSX**, which is the one thing this copy is pointed at. A shared
 * declaration would make all three fail or pass together, which is the opposite of a belt.
 */
const JARGON: readonly { readonly what: string; readonly pattern: RegExp }[] = [
  { what: "an FR id", pattern: /\b(?:[0-9]{2}|[A-Z])-[FNT][0-9]+[a-z]?\b/ },
  { what: "an environment or config variable", pattern: /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/ },
  { what: "a code symbol, table or column name", pattern: /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/ },
  { what: "a section reference", pattern: /§/ },
  { what: "a repository path", pattern: /\b[\w-]+\/[\w-]+\.[a-z]{2,4}\b/ },
];

// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("14-F32 — the editor is chosen by the JOB, not by the entity", () => {
  it("14-F32 — creating begins with a task in the owner's vocabulary, not a kind discriminator", async () => {
    // WRONG IMPLEMENTATION: the `<select id="kind">` that shipped. It makes an owner answer a
    // schema question — *is a Half Plate a variant or an item?* — before he may type a name,
    // which the FR calls "the defect in one sentence".
    mount(null);
    await waitFor(() => taskControl(/dish/i));
    expect(taskControl(/section/i)).toBeTruthy();
    expect(named(/\btype\b|\bkind\b/i).map((el) => labelOf(el))).toEqual([]);
  });

  it("14-F32/14-F34 — every offered task says what it is for, not just what it is called", async () => {
    // WRONG IMPLEMENTATION: five bare words on five buttons. The founder's condition on
    // progressive disclosure is that hiding without guidance moves the confusion rather than
    // removing it, and a task list is the first place he meets that.
    mount(null);
    await waitFor(() => taskControl(/dish/i));
    for (const task of [taskControl(/dish/i), taskControl(/section/i)]) {
      const explanation = helpOf(task) === "" ? textOf(task) : helpOf(task);
      expect(`${textOf(task)}: ${words(explanation)} words`).toBe(
        `${textOf(task)}: ${Math.max(words(explanation), 6)} words`,
      );
    }
  });

  it("14-F32 — adding a dish and adding a menu section ask DIFFERENT questions", async () => {
    // WRONG IMPLEMENTATION: one form with a kind selector and conditional fields — "what shipped,
    // and cheaper by a branch". Under it both label sets are identical and this fails on the
    // comparison rather than on any single field.
    mount(null);
    await startDish();
    const dishLabels = controls()
      .filter((el) => !isCell(el))
      .map((el) => labelOf(el))
      .sort();
    const dishCells = cells().length;

    cleanup();
    mount(null);
    await startSection();
    const sectionLabels = controls()
      .filter((el) => !isCell(el))
      .map((el) => labelOf(el))
      .sort();

    expect(dishCells).toBe(9);
    expect(sectionLabels).not.toEqual(dishLabels);
  });

  it("14-F32/01-F60 — a menu section is priced by nothing, so it is shown no grid at all", async () => {
    // WRONG IMPLEMENTATION: an empty grid on the section form, which "is teaching the owner that
    // the grid is optional" — the FR's own words for why the field must be absent, not blank.
    mount(null);
    await startSection();
    expect(cells()).toEqual([]);
    expect(disclosures().filter((group) => /kitchen|print|ticket/i.test(group.closedText))).toEqual(
      [],
    );
  });

  it("14-F32 — an existing entry never offers its kind, and never renders it", async () => {
    // WRONG IMPLEMENTATION: the shipped header, which prints `initial.kind` verbatim. The fixture
    // is an ADD-ON rather than a dish on purpose: `item` is also an ordinary English word, so a
    // dish fixture cannot tell "the schema leaked" from "the screen said item".
    mount(ADD_ON);
    await waitFor(() => nameControl());
    expect(named(/\btype\b|\bkind\b/i)).toEqual([]);
    expect(bodyText()).not.toMatch(/\bmodifier\b/i);
  });
});

describe("14-F33 — the owner never types an identifier", () => {
  it("14-F33 — the create-a-dish form has no control that accepts an id, a parent id or a sort", async () => {
    // WRONG IMPLEMENTATION: the shipped `ID`, `Belongs to` and `Order` text boxes — a primary key,
    // a foreign key and a sort column, typed by hand, above the price grid he came for.
    mount(null);
    await startDish();
    const offenders = controls()
      .filter((el) => {
        const label = labelOf(el);
        const attribute = `${el.getAttribute("id") ?? ""} ${el.getAttribute("name") ?? ""}`;
        return (
          /\bid\b|identifier|\bslug\b/i.test(label) ||
          /^\s*order\s*$/i.test(label) ||
          /\bsort\b|\bposition\b/i.test(label) ||
          /\b(?:^|\s)(id|parent_id|sort)(?:\s|$)/.test(attribute)
        );
      })
      .map((el) => `"${labelOf(el)}" (#${el.getAttribute("id") ?? "—"})`);
    expect(offenders).toEqual([]);
  });

  it("14-F33 — the identifier is generated from the name the owner typed", async () => {
    // WRONG IMPLEMENTATIONS, both refused by the FR itself: an empty id (the server's
    // `min(1)` refuses it after a round trip the owner may not be watching), and a UUID —
    // "`01-F54` renders the identifier TO A CASHIER … an opaque UUID degrades to nothing".
    const log = mount(null);
    await startDish();
    type(nameControl(), "Chicken Tikka");
    priceEveryPair("450");
    fireEvent.click(commitControl());
    await waitFor(() => expect(log.some((call) => call.path === "catalog.save")).toBe(true));
    expect(savedEntry(log).id).toMatch(/^chicken-tikka(?:-\d+)?$/);
  });

  it("14-F33 — a name colliding with another KIND's entry takes a numeric suffix", async () => {
    // THE dangerous case, and the fixture is the whole of it: `extra-raita` is an ADD-ON, so a
    // per-kind generator — the plausible wrong implementation, and the one storage invites, since
    // a version is keyed by `(kind, id)` — passes every same-kind fixture and fails here.
    // "A cross-kind collision is expressible in the store and unresolvable at the till."
    const log = mount(null);
    await startDish();
    type(nameControl(), "Extra Raita");
    priceEveryPair("60");
    fireEvent.click(commitControl());
    await waitFor(() => expect(log.some((call) => call.path === "catalog.save")).toBe(true));
    expect(savedEntry(log).id).not.toBe("extra-raita");
    expect(savedEntry(log).id).toMatch(/^extra-raita-\d+$/);
  });

  it("14-F33 — a saved entry SHOWS its identifier, demoted, and never on a control", async () => {
    // WRONG IMPLEMENTATION: the shipped `readOnly` input. It is uneditable and it is still a
    // control, which fails "shown once, demoted, on a saved entry — never on a control" while
    // passing every "the owner cannot type an id" assertion above.
    mount(SIBLING_LAST);
    await waitFor(() => nameControl());
    expect(bodyText()).toContain("chicken-karahi");
    expect(screen.queryByDisplayValue("chicken-karahi")).toBeNull();
  });

  it("14-F33 — the menu section is chosen by NAME and sent as the parent's id", async () => {
    // WRONG IMPLEMENTATION: the shipped free-text `Belongs to`, where an owner types a foreign key
    // he has no way to know — and a typo makes an orphan the list cannot draw.
    const log = mount(null);
    await startDish();
    chooseSection("Karahi & Handi");
    type(nameControl(), "Chicken Tikka");
    priceEveryPair("450");
    fireEvent.click(commitControl());
    await waitFor(() => expect(log.some((call) => call.path === "catalog.save")).toBe(true));
    expect(savedEntry(log).parent_id).toBe("karahi-handi");
  });

  it("14-F33 — a new entry APPENDS after the last entry under the same parent", async () => {
    // WRONG IMPLEMENTATIONS: no sort at all (the menu's order becomes whatever the writer
    // serialised), or a fixed 0/1 which inserts the new dish above everything the owner already
    // ordered — `27-F4`'s muscle-memory breakage, caused by the editor rather than by the owner.
    const log = mount(null);
    await startDish();
    chooseSection("Karahi & Handi");
    type(nameControl(), "Chicken Tikka");
    priceEveryPair("450");
    fireEvent.click(commitControl());
    await waitFor(() => expect(log.some((call) => call.path === "catalog.save")).toBe(true));
    // The siblings under `karahi-handi` are 2 and 5.
    expect(typeof savedEntry(log).sort).toBe("number");
    expect(savedEntry(log).sort as number).toBeGreaterThan(5);
  });
});

/** Chooses a section by the NAME an owner reads, whatever control the implementation used. */
const chooseSection = (name: string): void => {
  const select = Array.from(document.querySelectorAll("select")).find((el) =>
    Array.from(el.options).some((option) => textOf(option).includes(name)),
  );
  if (select !== undefined) {
    const option = Array.from(select.options).find((candidate) => textOf(candidate).includes(name));
    fireEvent.change(select, { target: { value: option?.value } });
    return;
  }
  const option = screen
    .queryAllByRole("option")
    .concat(screen.queryAllByRole("radio"))
    .find((el) => textOf(el).includes(name));
  if (option === undefined) {
    throw new Error(
      `14-F33 — no way to choose the section "${name}" by name. Controls: ${controls()
        .map((el) => `"${labelOf(el)}"`)
        .join(", ")}`,
    );
  }
  fireEvent.click(option);
};

describe("14-F34 — every field says what it is and why you would set it", () => {
  it("14-F34 — every control on the dish form carries a help sentence bound to it", async () => {
    // WRONG IMPLEMENTATIONS, all four of which pass a "the field has help" test written loosely:
    // `help=""`; help that repeats the label ("Kitchen name — the kitchen name"); a `title`
    // tooltip; and a form where one field of seven was simply forgotten. The threshold is words,
    // not characters, because "Required." is a character count and not a guideline.
    mount(null);
    await startDish();
    const failures = controls()
      .filter((el) => !isCell(el))
      .map((el) => ({ label: labelOf(el), help: helpOf(el) }))
      .filter(
        (field) =>
          field.help === "" ||
          words(field.help) < 8 ||
          field.help.toLowerCase() === field.label.toLowerCase(),
      )
      .map((field) => `"${field.label}" → "${field.help}"`);
    expect(failures).toEqual([]);
  });

  it("14-F34 — the price grid carries its own help, and every cell is bound to it", async () => {
    // Asserted at the GRID rather than per cell: nine identical descriptions would be noise, and
    // `14-F34` is satisfied by one sentence several controls point at. WRONG IMPLEMENTATION: a
    // grid whose help is a heading — "Prices" says what it is and nothing about why it refuses.
    mount(null);
    await startDish();
    const helps = new Set(cells().map((el) => helpOf(el)));
    expect(helps.size).toBe(1);
    expect(words([...helps][0] ?? "")).toBeGreaterThanOrEqual(8);
  });

  it("14-F34 — nothing a save can refuse is collapsed", async () => {
    // WRONG IMPLEMENTATION: the tidy one. Collapsing the grid or the name behind a disclosure
    // "produces a refusal pointing at a control the owner cannot see". Structural on purpose —
    // happy-dom finds elements inside a closed `<details>`, so `queryBy` would bless it.
    mount(null);
    await startDish();
    expect(collapsedAncestorOf(nameControl())).toBeNull();
    expect(cells().filter((el) => collapsedAncestorOf(el) !== null)).toEqual([]);
  });

  it("14-F34 — the collapsed group names what is inside it AND the outcome of never opening it", async () => {
    // WRONG IMPLEMENTATION: a disclosure labelled "Advanced" — named by the FR as the failing
    // case — or "Kitchen printing" alone, which says what is inside and nothing about the outcome.
    mount(null);
    await startDish();
    type(nameControl(), "Chicken Karahi");
    chooseSection("Karahi & Handi");
    const closed = printingDisclosure().closedText;
    expect(words(closed)).toBeGreaterThanOrEqual(8);
    expect(closed).not.toMatch(/^\s*(advanced|more|options|kitchen printing)\s*$/i);
  });
});

describe("14-F35 — an inheriting field shows what it will inherit, without opening anything", () => {
  it("14-F35 — the closed group states the station AND where it comes from", async () => {
    // WRONG IMPLEMENTATIONS: an empty box (the shipped station field, where blank is the normal
    // case and therefore the case that must be legible); the bare word "inherit"; and the station
    // with no origin, which tells an owner a value he cannot trace or change.
    mount(null);
    await startDish();
    type(nameControl(), "Chicken Karahi");
    chooseSection("Karahi & Handi");
    const closed = printingDisclosure().closedText;
    expect(closed).toMatch(/grill/i);
    expect(closed).toMatch(/Karahi & Handi/);
  });

  it("14-F35/03-F38 — the closed group states the name the ticket will print", async () => {
    // WRONG IMPLEMENTATION: showing the empty kitchen-name field. `03-F38`'s blank inherits the
    // entry's own name, and blank is what must be legible.
    mount(null);
    await startDish();
    type(nameControl(), "Chicken Karahi");
    chooseSection("Karahi & Handi");
    expect(printingDisclosure().closedText).toContain("Chicken Karahi");
  });

  it("14-F35 — where nothing up the chain sets a station, the fallback is named as the PLATFORM's", async () => {
    // WRONG IMPLEMENTATION: rendering the terminal fallback as though the owner had chosen it.
    // "The terminal station fallback is a pinned constant rather than a specified value, and a
    // screen that presents it as a configured choice is claiming a decision nobody made."
    // The wording is the implementer's; what is asserted is that SOME word carries the
    // attribution and that the value is not simply absent.
    mount(null);
    await startDish();
    type(nameControl(), "Fresh Lime");
    chooseSection("Cold Drinks");
    const closed = printingDisclosure().closedText;
    expect(closed).not.toMatch(/Cold Drinks/);
    expect(closed).toMatch(
      /RestOS|platform|standard|built-?in|comes with|nobody|not (?:your|yours)/i,
    );
  });
});

describe("14-F36 — publish timing belongs to the ACT, not to the entry", () => {
  it("14-F36 — the timing question is not a fieldset in the middle of data entry", async () => {
    // WRONG IMPLEMENTATION: "WHEN DOES THIS APPLY?" as a section of a create form — the screenshot
    // the founder was reading. Asserted structurally: the smallest region holding both the timing
    // CONTROL and the commit control holds neither the name nor a price.
    //
    // ⚠ Anchored on the control and not on the text `05:00`, because the timing help sentences
    // contain that string too — a text anchor found the commit panel whatever the controls did,
    // and the mutant that moves the whole fieldset above the name field survived it.
    mount(null);
    await startDish();
    const commit = commitControl();
    const timing = timingControl();
    let region: HTMLElement | null = commit.parentElement;
    while (region !== null && !region.contains(timing)) region = region.parentElement;
    expect(region).not.toBeNull();
    expect(region?.contains(nameControl())).toBe(false);
    expect(cells().some((el) => region?.contains(el) === true)).toBe(false);
  });

  it("14-F36/14-F28 — the resting state states the default outcome in the owner's terms", async () => {
    // WRONG IMPLEMENTATION: no resting statement at all, so `14-F28`'s default is chosen by
    // silence. A SENTENCE is required rather than the string `05:00`, because the option's own
    // four-word label — "At day end (05:00)" — is not a statement of what will happen, and a bare
    // `toMatch(/05:00/)` cannot tell the two apart.
    mount(null);
    await startDish();
    const statements = Array.from(document.querySelectorAll<HTMLElement>("*")).filter(
      (el) => el.children.length === 0 && /05:00/.test(textOf(el)) && words(textOf(el)) >= 6,
    );
    expect(statements.map((el) => textOf(el)).length).toBeGreaterThan(0);
    expect(bodyText()).toMatch(/till|menu/i);
  });

  it("14-F36 — apply-now is never pre-selected, and a save that changes nothing lands at day end", async () => {
    const log = mount(null);
    await startDish();
    for (const el of named(/apply now|straight away|immediately/i)) {
      // Three carriers, because the choice may be a Radix radio (`data-state`), an ARIA widget or
      // a native `<input type="radio">` — and a native one's checked state is a PROPERTY that no
      // attribute reports, so an attribute-only assertion would miss the pre-selected default.
      const state = [
        el.getAttribute("data-state") ?? "",
        el.getAttribute("aria-checked") ?? "",
        (el as HTMLInputElement).checked === true ? "on" : "off",
      ].join(" ");
      expect(`${labelOf(el)}: ${state}`).not.toMatch(/\bchecked\b|\btrue\b|\bon\b/);
    }
    type(nameControl(), "Chicken Tikka");
    priceEveryPair("450");
    fireEvent.click(commitControl());
    await waitFor(() => expect(log.some((call) => call.path === "catalog.save")).toBe(true));
    expect(savedInput(log).apply_when).toBe("day_end");
  });

  it("14-F36 — apply-now's consequence is rendered BEFORE it can be chosen", async () => {
    // WRONG IMPLEMENTATION: the consequence as a confirmation dialog after the click. `14-F28`
    // calls that a hidden default; the FR restates it here because the option now sits one act
    // from the primary button.
    mount(null);
    await startDish();
    const offer = named(/apply now|straight away|immediately/i).concat(
      buttons().filter((el) =>
        /apply now|straight away|immediately|when this applies/i.test(textOf(el)),
      ),
    );
    expect(offer.length).toBeGreaterThan(0);
    expect(bodyText()).toMatch(/every till|as soon as this saves|mid-order|halfway through/i);
  });

  it("14-F36 — apply-now is not remembered between edits", async () => {
    // WRONG IMPLEMENTATION: the helpful one — a module-level `lastChoice`, or `localStorage`, so
    // "the owner already told us". Then one urgent edit silently makes every later edit urgent.
    const first = mount(null);
    await startDish();
    const applyNow = named(/apply now|straight away|immediately/i)[0];
    if (applyNow !== undefined) fireEvent.click(applyNow);
    type(nameControl(), "Chicken Tikka");
    priceEveryPair("450");
    fireEvent.click(commitControl());
    await waitFor(() => expect(first.some((call) => call.path === "catalog.save")).toBe(true));
    expect(savedInput(first).apply_when).toBe("now");

    cleanup();
    const second = mount(null);
    await startDish();
    type(nameControl(), "Mutton Tikka");
    priceEveryPair("520");
    fireEvent.click(commitControl());
    await waitFor(() => expect(second.some((call) => call.path === "catalog.save")).toBe(true));
    expect(savedInput(second).apply_when).toBe("day_end");
  });
});

describe("14-F37 — an incomplete price set is obvious BEFORE the save is pressed", () => {
  it("14-F37 — the unpriced pairs are counted before anything is typed", async () => {
    // WRONG IMPLEMENTATION: `01-F60`'s refusal alone, which is what shipped — the owner learns
    // what the screen wanted by being refused by it, possibly at 05:00, from a scheduler.
    mount(null);
    await startDish();
    expect(stillNeeded()).toBe(9);
  });

  it("14-F37 — the count follows every keystroke", async () => {
    // WRONG IMPLEMENTATION: a count computed on blur, or on submit. "A running count adjacent to
    // the grid, changing with every keystroke."
    mount(null);
    await startDish();
    type(cell("gulberg", "counter"), "450");
    expect(stillNeeded()).toBe(8);
    type(cell("dha", "foodpanda"), "520");
    expect(stillNeeded()).toBe(7);
    type(cell("gulberg", "counter"), "");
    expect(stillNeeded()).toBe(8);
  });

  it("14-F37/01-F60 — a free item counts as PRICED, because 0 is a price", async () => {
    // WRONG IMPLEMENTATION: truthiness — `if (!value)` — which makes an explicit zero and a
    // forgotten cell the same fact. That is the distinction `01-F60` exists to keep.
    mount(null);
    await startDish();
    priceEveryPair("0");
    expect(bodyText()).toMatch(COMPLETE_PATTERN);
  });

  it("14-F37 — the readout says the set is complete once every pair is priced", async () => {
    mount(null);
    await startDish();
    priceEveryPair("450");
    expect(bodyText()).toMatch(COMPLETE_PATTERN);
  });

  it("14-F37 — the commit control is NOT disabled while prices are missing", async () => {
    // WRONG IMPLEMENTATION: disable-until-valid, which every form library makes the easy path.
    // "A disabled control explains nothing; it states what is missing, and on press it names
    // every missing pair."
    mount(null);
    await startDish();
    type(nameControl(), "Chicken Tikka");
    expect(commitControl().hasAttribute("disabled")).toBe(false);
    expect(commitControl().getAttribute("aria-disabled")).not.toBe("true");
  });

  it("14-F37/14-F29 — pressing commit names EVERY missing pair and sends nothing", async () => {
    // WRONG IMPLEMENTATION: naming the first missing cell only (this repo's `H8` shape). The two
    // gaps are in different branches AND different channels, so a refusal that names one pair
    // cannot accidentally satisfy both halves — and the claim is made against the text the press
    // ADDED, because every one of those four words is already on screen as a row or column header.
    const log = mount(null);
    await startDish();
    type(nameControl(), "Chicken Tikka");
    priceEveryPair("450");
    type(cell("gulberg", "phone"), "");
    type(cell("johar", "foodpanda"), "");
    const before = bodyText();
    fireEvent.click(commitControl());
    await waitFor(() => expect(inserted(before, bodyText())).not.toBe(""));
    const refusal = inserted(before, bodyText());
    for (const token of ["gulberg", "phone", "johar", "foodpanda"]) {
      expect(`refusal: ${refusal}`).toContain(token);
    }
    expect(log.filter((call) => call.path === "catalog.save")).toHaveLength(0);
  });

  /**
   * ⚠ These two claims are **re-homed, not new**, and the reason is a live conflict rather than
   * belt-and-braces. `editor.dom.test.tsx` owns them today and reaches them through
   * `getByLabelText("ID")` — a control `14-F33` forbids — so ten of its tests cannot pass a
   * correct implementation of these FRs. That is a finding for the test-owning session, not
   * something to weaken in place (`24-F5`); until it is resolved, these two properties would be
   * lost if that suite were simply retired, and they are the two whose failure is silent money.
   */
  it("14-F29/Commandment 3 — a typed 450 reaches the wire as 45000 integer paisa", async () => {
    // WRONG IMPLEMENTATION: forwarding the typed rupees. The menu publishes at one hundredth of
    // its price and `01-F53` freezes that into every line the till rings.
    const log = mount(null);
    await startDish();
    type(nameControl(), "Chicken Tikka");
    priceEveryPair("450");
    fireEvent.click(commitControl());
    await waitFor(() => expect(log.some((call) => call.path === "catalog.save")).toBe(true));
    const prices = savedEntry(log).prices as readonly { price_paisa: number }[];
    expect(prices).toHaveLength(9);
    expect(prices.every((price) => price.price_paisa === 45000)).toBe(true);
  });

  it("03-F50 — a station the owner never touched is sent as null, because absence is inheritance", async () => {
    // WRONG IMPLEMENTATION: sending `""`. That is a station NAMED empty string, which resolves to
    // nothing and drops the dish off every kitchen ticket — and it is what a form sends by default
    // when nobody decided otherwise. The owner never opens the printing group in this test, which
    // is `14-F35`'s normal case: blank is the answer, and it still has to travel correctly.
    const log = mount(null);
    await startDish();
    type(nameControl(), "Chicken Tikka");
    priceEveryPair("450");
    fireEvent.click(commitControl());
    await waitFor(() => expect(log.some((call) => call.path === "catalog.save")).toBe(true));
    expect(savedEntry(log).station).toBeNull();
  });

  it("14-F37/27-F16 — the count is not coloured while the item is merely unfinished", async () => {
    // WRONG IMPLEMENTATION: a red count from the first keystroke. "A half-typed new item is the
    // normal state of a form; colour arrives with a refusal" — `27-F16` reserves colour for the
    // abnormal, and a form that is red from the start has spent the channel before it is needed.
    mount(null);
    await startDish();
    const element = countElement();
    const classes = `${element.className} ${element.parentElement?.className ?? ""}`;
    expect(classes).not.toMatch(/destructive|warning|danger|error|fault|text-red|amber/i);
  });
});

describe("14-F38 — nothing on this surface names an internal identifier", () => {
  it("14-F38 — the jargon rules bite (fired at the sentence the FR quotes)", () => {
    // Without this, a clean sweep below is indistinguishable from a sweep that matches nothing —
    // the round-3 defect written as a regex.
    const specimen =
      "Leave blank to inherit from the category above (03-F50). Set ENABLED_BRANCHES on the " +
      "service; the parent_id column decides this (00 §7), see services/api/src/catalog.ts.";
    for (const rule of JARGON)
      expect(`${rule.what}: ${rule.pattern.test(specimen)}`).toBe(`${rule.what}: true`);
  });

  it("14-F38 — the create-a-dish form renders no FR id, env var, symbol, section or path", async () => {
    mount(null);
    await startDish();
    const text = bodyText();
    const hits = JARGON.filter((rule) => rule.pattern.test(text)).map(
      (rule) => `${rule.what}: ${text.match(rule.pattern)?.[0]}`,
    );
    expect(hits).toEqual([]);
  });

  it("14-F38 — nor does the task chooser, the section form or a saved entry", async () => {
    mount(null);
    await waitFor(() => taskControl(/dish/i));
    const chooser = bodyText();
    cleanup();
    mount(null);
    await startSection();
    const section = bodyText();
    cleanup();
    mount(SIBLING_LAST);
    await waitFor(() => nameControl());
    const saved = bodyText();

    for (const [where, text] of [
      ["the task chooser", chooser],
      ["the section form", section],
      ["a saved entry", saved],
    ] as const) {
      const hits = JARGON.filter((rule) => rule.pattern.test(text)).map(
        (rule) => `${where} — ${rule.what}: ${text.match(rule.pattern)?.[0]}`,
      );
      expect(hits).toEqual([]);
    }
  });
});
