"use client";

/**
 * **B-6 — the catalog entry editor, reshaped by `14-F32`..`14-F38` (August 2026).**
 *
 * `14-F5`'s editing surface over the `01-F21` chain, carrying `14-F29`'s price grid, `03-F38`'s
 * kitchen name, `03-F50`'s station, `14-F28`'s timing and `14-F7`'s archive.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT CHANGED, AND WHY IT IS NOT A REDESIGN
 * ---------------------------------------------------------------------------------------------
 *
 * What shipped here was shaped like the STORE: a kind discriminator, a hand-typed `id`, a
 * `parent_id`, a `sort` integer, two routing fields and a publish-timing fieldset, all at once, on
 * one form that added a section and added a dish with the same controls. The founder's review is
 * quoted in the FRs: *"this is very complex interface. What even is this. this is so hard to use.
 * I cant understand a single thing."*
 *
 * The five FRs decide the shape and this file is their implementation, one to one:
 *
 *   `14-F32`  creating begins with a TASK — *add a dish*, *add a menu section* — and a field
 *             appears only if that task's kind can carry it. The kind is never a control.
 *   `14-F33`  the identifier is GENERATED, unique per org across every kind, permanent, derived
 *             from the name, and shown demoted on a saved entry. `BELONGS TO` became a question
 *             about the menu; `ORDER` is assigned by appending.
 *   `14-F34`  every control carries a help sentence BOUND to it, and the one collapsed group
 *             states what is inside it and what happens if it is never opened.
 *   `14-F35`  the inherited station is RESOLVED in the closed state — blank is the normal case, so
 *             blank is exactly what has to be legible.
 *   `14-F36`  timing belongs to the ACT: it sits in the commit region, never mid-form.
 *   `14-F37`  the unpriced pairs are COUNTED as he types (`price-grid.tsx`), not at the refusal.
 *
 * **How this obeys Commandment 5, stated because the shape looks like a violation and is not.**
 * The editor seeds its fields from the entry the owner opened, which is server data. The
 * difference that matters is *seed* versus *sync*: the `useState` initialisers below run once, and
 * there is no `useEffect` anywhere in this app writing query data into state. What the component
 * holds is a DRAFT — keystrokes the server has never seen — which is an unsent request, not a copy
 * of server state.
 *
 * The remount is the parent's job: `catalog-screen.tsx` gives this component a `key` of the entry
 * being edited, so choosing a different item builds a new editor rather than reconciling one.
 *
 * **`catalog.published` is READ HERE, and three FRs need it**: `14-F33`'s section chooser (*"by
 * the parent's name, from the entries that exist"*) and its org-wide collision check, and
 * `14-F35`'s resolved station. It is read where it is needed and never copied into state (`18 §6`),
 * and it fails SOFT: a menu that cannot be read costs the section list and the resolution, not the
 * ability to fix a price on the entry already open.
 */

import type { OrderChannel } from "@restos/domain";
import { SELLABLE_KINDS } from "@restos/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Plus } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import {
  type CatalogEntry,
  type EditReceipt,
  ENTRY_KINDS,
  type PendingEdit,
} from "../lib/catalog-types";
import { isWholeRupees, rupeeTextFromPaisa } from "../lib/money";
import { nameText, usePlaceNames } from "../lib/names";
import {
  cellKey,
  draftFromPrices,
  type EnabledPairs,
  emptyDraft,
  fillAcross,
  type GridDraft,
  type GridFault,
  needsPrices,
  resolveGrid,
} from "../lib/price-grid";
import { strings } from "../lib/strings";
import { refusalMessage, useTRPC } from "../lib/trpc";
import { formatInstant } from "../lib/when";
import { type ApplyWhen, ApplyWhenControl, DEFAULT_APPLY_WHEN } from "./apply-when";
import { ChangeHistory } from "./change-history";
import { PriceGrid } from "./price-grid";
import { Button } from "./ui/button";
import { Field, helpId, Input } from "./ui/field";
import { Caption, Card, CardBody, CardHeader, Note } from "./ui/surface";

// `CardTitle` is deliberately NOT imported: it uppercases, and this card's subject is a dish name.

/**
 * **`14-F32` — one task per `01-F21` kind, named in the owner's vocabulary.**
 *
 * `kind` is the only place the internal string survives, and it never reaches the glass: it is
 * what the wire wants (`CatalogEntryWire.kind`) and `14-F38` bans it from anything an owner reads.
 * `parentKind` is what the task asks for by NAME; `null` means this rung has no parent in the
 * chain and the form does not ask at all (`14-F33`).
 */
type Task = {
  readonly kind: string;
  /** The chooser tile and the form header — *"Add a dish"*. */
  readonly title: string;
  /** The same task as a noun, for the panel label on a saved entry — *"Dish"*. */
  readonly noun: string;
  /** `14-F34` — what the job is, before he commits to it. */
  readonly help: string;
  readonly parentKind: string | null;
};

const TASK_BY_KIND: Readonly<Record<string, Task>> = {
  item: {
    kind: "item",
    title: strings.catalog.tasks.dish,
    noun: strings.catalog.tasks.dishNoun,
    help: strings.catalog.tasks.dishHelp,
    parentKind: "category",
  },
  category: {
    kind: "category",
    title: strings.catalog.tasks.section,
    noun: strings.catalog.tasks.sectionNoun,
    help: strings.catalog.tasks.sectionHelp,
    parentKind: null,
  },
  variant: {
    kind: "variant",
    title: strings.catalog.tasks.size,
    noun: strings.catalog.tasks.sizeNoun,
    help: strings.catalog.tasks.sizeHelp,
    parentKind: "item",
  },
  modifier_group: {
    kind: "modifier_group",
    title: strings.catalog.tasks.choice,
    noun: strings.catalog.tasks.choiceNoun,
    help: strings.catalog.tasks.choiceHelp,
    parentKind: "item",
  },
  modifier: {
    kind: "modifier",
    title: strings.catalog.tasks.addon,
    noun: strings.catalog.tasks.addonNoun,
    help: strings.catalog.tasks.addonHelp,
    parentKind: "modifier_group",
  },
};

/**
 * The offered order is **how often the job is done**, not the chain's own order: a restaurant types
 * dishes all afternoon and adds a section five times ever, and `27-F4`'s positional argument is
 * about muscle memory, which the frequent job earns.
 *
 * ⚠ It is filtered through `ENTRY_KINDS` — the chain as `catalog-types.ts` declares it — so a kind
 * that leaves the chain stops being offered here, in one place, rather than in two lists that
 * drift. A kind the chain gains and this table does not is simply not offered, which is doc 14
 * §9.7's open question (*which of the five a Wave-1 owner actually needs*) left open rather than
 * answered by an accident.
 */
const TASK_ORDER: readonly string[] = ["item", "category", "variant", "modifier_group", "modifier"];

const TASKS: readonly Task[] = TASK_ORDER.flatMap((kind) => {
  const task = TASK_BY_KIND[kind];
  return task === undefined || !ENTRY_KINDS.includes(kind) ? [] : [task];
});

/**
 * The task a saved entry belongs to. An unknown kind still opens — `CatalogEntryWire.kind` is an
 * open string and refusing to display published data would hide a menu a till is currently
 * selling — under a neutral noun rather than under the raw string (`14-F38`).
 */
const taskFor = (kind: string): Task =>
  TASK_BY_KIND[kind] ?? {
    kind,
    title: strings.catalog.tasks.unknownNoun,
    noun: strings.catalog.tasks.unknownNoun,
    help: strings.catalog.tasks.unknownHelp,
    parentKind: null,
  };

/**
 * **`14-F32`/`14-F38` — the owner-facing name for a kind, for any surface in this module.**
 *
 * *"The internal kind strings are vendor vocabulary and are not rendered; the task noun is this
 * surface's name for a kind EVERYWHERE, including on a saved entry."* The menu list needed it too:
 * it captioned every section row with the raw string, so an owner read *"Karahi & Handi category"*
 * — found by running the app and sweeping the rendered text, which is the only way it could have
 * been found, since the editor's own oracle does not render the list.
 */
export const nounForKind = (kind: string): string => taskFor(kind).noun;

/** `{placeholder}` substitution for the catalog's whole-sentence templates. */
const fill = (template: string, values: Readonly<Record<string, string>>): string =>
  template.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);

/**
 * **`14-F33` — the identifier, derived from the name the owner typed.**
 *
 * Not a UUID, and the FR gives the reason rather than a preference: `01-F54` renders the identifier
 * **to a cashier** when an item is unknown or not yet synced, so `chicken-karahi` degrades to a
 * legible dish and an opaque UUID degrades to nothing.
 *
 * Unicode is KEPT (`\p{L}\p{N}`, commandment 7) — a menu written in Urdu produces an id in Urdu,
 * which is still the name a cashier can read, where transliterating would produce neither. Only
 * when a name yields no letters or digits at all does this fall back to the task's own word, which
 * the collision suffix then makes unique.
 */
const slugOf = (name: string, fallback: string): string => {
  const slug = name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? fallback : slug;
};

/**
 * **Uniqueness is per ORG across every KIND, not per kind** (`14-F33`).
 *
 * Storage keys a version by `(kind, id)`, which makes a cross-kind collision perfectly expressible
 * — and unresolvable at the till, where every reference to an entry is an id ALONE (`parent_id`,
 * `order.line_added`'s item, `01-F54`'s degradation). So the taken set is every id in the catalog,
 * whatever kind it belongs to.
 */
const uniqueId = (base: string, taken: ReadonlySet<string>): string => {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
};

/**
 * **`14-F33` — a new entry APPENDS after the last entry under the same parent.**
 *
 * Not 0 and not 1: inserting a new dish above everything the owner has already ordered is
 * `27-F4`'s muscle-memory breakage caused by the editor rather than by the owner. Position is
 * changed where position is visible, which is the menu list, and the gesture for that is doc 14
 * §9.8's open question — deliberately not invented here.
 */
const nextSort = (entries: readonly CatalogEntry[], parent_id: string | null): number => {
  const siblings = entries.filter((entry) => (entry.parent_id ?? null) === parent_id);
  return siblings.reduce((highest, entry) => Math.max(highest, entry.sort ?? 0), 0) + 1;
};

/** One choosable parent, from either version axis — `14-F33`'s *"the entries that exist"*. */
type ParentOption = { readonly id: string; readonly name: string; readonly waiting: boolean };

/**
 * The sections (or groups) this task can sit under: what is published, plus what is staged and not
 * yet published, in that order and deduplicated by id — a staged EDIT of a published section is
 * one section, and offering it twice would ask the owner to pick between two spellings of the same
 * thing.
 */
const parentChoices = (
  parentKind: string | null,
  entries: readonly CatalogEntry[],
  staged: readonly PendingEdit[],
): readonly ParentOption[] => {
  if (parentKind === null) return [];
  const live = entries
    .filter((entry) => entry.kind === parentKind && entry.deleted !== true)
    .map((entry) => ({ id: entry.id, name: entry.name, waiting: false }));
  const known = new Set(live.map((option) => option.id));
  const waiting = staged
    .filter((edit) => edit.entity === parentKind && !known.has(edit.entity_id))
    .map((edit) => ({ id: edit.entity_id, name: edit.name, waiting: true }));
  return [...live, ...waiting];
};

/** The resolved station and the entry it came from — `14-F35`'s *"Grill, from Karahi & Handi"*. */
type Inherited = { readonly station: string; readonly from: string };

/**
 * Walks UP the `01-F21` chain for the station this entry will actually use (`03-F50`: nearest
 * wins, absence inherits). Stops on a cycle rather than looping — reference data is edited by hand
 * and a `parent_id` pointing at itself is a thing that happens.
 */
const inheritedStation = (
  parent_id: string | null,
  byId: ReadonlyMap<string, CatalogEntry>,
): Inherited | null => {
  const seen = new Set<string>();
  let node = parent_id === null ? undefined : byId.get(parent_id);
  while (node !== undefined && !seen.has(node.id)) {
    seen.add(node.id);
    const station = node.station ?? "";
    if (station !== "") return { station, from: node.name };
    const next = node.parent_id ?? null;
    node = next === null ? undefined : byId.get(next);
  }
  return null;
};

/** The text fields, as typed. Nothing here is a number until save — see `lib/money.ts`. */
type Form = {
  name: string;
  kitchen_name: string;
  station: string;
};

const formOf = (entry: CatalogEntry | null): Form => ({
  name: entry?.name ?? "",
  kitchen_name: entry?.kitchen_name ?? "",
  station: entry?.station ?? "",
});

/**
 * A cell's rupee text, or `null` when the stored paisa cannot round-trip through whole rupees.
 * `draftFromPrices` leaves those cells EMPTY, which makes the owner retype the number rather than
 * silently saving a truncated one — see `money.ts`'s `isWholeRupees`.
 */
const cellText = (price_paisa: number): string | null =>
  isWholeRupees(price_paisa) ? rupeeTextFromPaisa(price_paisa) : null;

/** `""` means "not set" for every optional field; the wire wants `null`, not an empty string. */
const orNull = (text: string): string | null => (text.trim() === "" ? null : text.trim());

/** What the commit control does after the save lands — the founder types 60 to 120 of these. */
type Commit = "again" | "finish";

export const EntryEditor = ({
  initial,
  enabled,
  onSaved,
}: {
  initial: CatalogEntry | null;
  enabled: EnabledPairs;
  onSaved: () => void;
}): ReactNode => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  /** `01-F69` — the incomplete-pair refusal below names the branches it is about (`21-F15`). */
  const places = usePlaceNames();

  /**
   * The menu as published. Read here, never copied into state, and never fatal: `entries` is `[]`
   * while it loads or if it fails, which costs the section list and the resolved station and
   * leaves everything else — including the price grid the owner came for — working.
   */
  const published = useQuery(trpc.catalog.published.queryOptions());
  const entries: readonly CatalogEntry[] = published.data?.entries ?? [];

  /**
   * **The staged axis, and it is here because LOOKING at the screen proved it had to be.**
   *
   * `14-F28`'s default holds every edit until 05:00, so on the day an owner writes his menu —
   * *the* day this screen is for — every section he creates is staged and NOTHING is published.
   * Read from `catalog.published` alone, the section chooser therefore offered *"there are no menu
   * sections yet"* immediately after he had made one, and his first sixty dishes would have landed
   * parentless. Measured in a browser against the real API; no test in this app could see it,
   * because every fixture arrives already published.
   *
   * **This is NOT the merge `catalog.ts` and `catalog-screen.tsx` are shaped against.** Those keep
   * the two version AXES apart in what they DISPLAY — a menu no till has must not be shown as the
   * menu. This is a different question: *which sections will exist when this edit lands*. A dish
   * staged for 05:00 lands beside a section staged for the same 05:00, so the staged section is
   * exactly the right answer, and the option says which are still waiting rather than blurring it.
   *
   * `catalog.pending` carries `entity`, `entity_id` and `name` and **not** `parent_id`, `sort` or
   * `station` — see the two places below where that projection's shape is load-bearing.
   */
  const pending = useQuery(trpc.catalog.pending.queryOptions());
  const staged: readonly PendingEdit[] = pending.data ?? [];

  // SEEDED ONCE, never synced. The parent remounts this component per entry (see the header).
  const [task, setTask] = useState<Task | null>(initial === null ? null : taskFor(initial.kind));
  const [form, setForm] = useState<Form>(() => formOf(initial));
  const [parentId, setParentId] = useState<string>(initial?.parent_id ?? "");
  const [draft, setDraft] = useState<GridDraft>(() =>
    initial === null
      ? emptyDraft(enabled)
      : draftFromPrices(enabled, initial.prices ?? [], cellText),
  );
  const [applyWhen, setApplyWhen] = useState<ApplyWhen>(DEFAULT_APPLY_WHEN);
  const [faults, setFaults] = useState<readonly GridFault[]>([]);
  const [receipt, setReceipt] = useState<EditReceipt | null>(null);
  /** `14-F32`'s flow half: what the last save kept, said out loud rather than left to be noticed. */
  const [carried, setCarried] = useState(false);
  /** The commit panel, so a refusal can be brought to the owner — see `onSubmit`. */
  const commitRef = useRef<HTMLDivElement>(null);

  const archived = initial?.deleted === true;

  const invalidate = (): void => {
    // Both axes, because a save moves one or the other and the screen shows both.
    void queryClient.invalidateQueries({ queryKey: trpc.catalog.published.queryKey() });
    void queryClient.invalidateQueries({ queryKey: trpc.catalog.pending.queryKey() });
    void queryClient.invalidateQueries({ queryKey: trpc.catalog.history.queryKey() });
  };

  const save = useMutation(
    trpc.catalog.save.mutationOptions({
      onSuccess: (data) => {
        setReceipt(data);
        invalidate();
      },
    }),
  );

  const archive = useMutation(
    trpc.catalog.archive.mutationOptions({
      onSuccess: (data) => {
        setReceipt(data);
        invalidate();
        onSaved();
      },
    }),
  );

  const set = (field: keyof Form, value: string): void =>
    setForm((current) => ({ ...current, [field]: value }));

  const onCellChange = (branch_id: string, channel: OrderChannel, text: string): void =>
    setDraft((current) => ({ ...current, [cellKey(branch_id, channel)]: text }));

  // ── the task chooser (`14-F32`) ─────────────────────────────────────────────────────────────

  if (task === null) {
    /**
     * **The first screen of a creation, and the whole of `14-F32`.**
     *
     * Rejected, and named because it is what shipped and is cheaper by a branch: one form with a
     * kind selector and conditional fields. It makes the owner answer a schema question — *is a
     * Half Plate a variant or an item?* — before he is allowed to type a name.
     *
     * Each tile carries a sentence, not a bare noun: `14-F34`'s condition on disclosure is the
     * founder's own, *"hide until needed, but there are no guidelines like what is what and why
     * something should be entered"*, and the task list is the first place he meets that.
     *
     * `aria-labelledby` names the tile by its TITLE and `aria-describedby` carries the sentence,
     * so the control is called *"Add a dish"* and the explanation is READ rather than announced as
     * the button's name — the a11y regression `apply-when.tsx` records, avoided by construction.
     */
    return (
      <Card>
        <CardHeader>
          <span className="text-label uppercase tracking-wider text-muted-foreground">
            {strings.catalog.tasks.heading}
          </span>
          <Caption>{strings.catalog.tasks.standfirst}</Caption>
        </CardHeader>
        <CardBody>
          <ul className="flex flex-col gap-3">
            {TASKS.map((offered) => (
              <li key={offered.kind}>
                <button
                  type="button"
                  aria-labelledby={`task-${offered.kind}-title`}
                  aria-describedby={`task-${offered.kind}-help`}
                  onClick={() => setTask(offered)}
                  className="flex w-full flex-col gap-1.5 rounded-md border border-border bg-card p-4 text-left hover:border-border-strong hover:bg-muted"
                >
                  <span
                    id={`task-${offered.kind}-title`}
                    className="flex items-center gap-2 text-body text-foreground"
                  >
                    <Plus aria-hidden="true" className="size-4 text-muted-foreground" />
                    {offered.title}
                  </span>
                  <span
                    id={`task-${offered.kind}-help`}
                    className="text-xs leading-relaxed text-muted-foreground"
                  >
                    {offered.help}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    );
  }

  // ── the form for the chosen task ────────────────────────────────────────────────────────────

  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const priced = needsPrices(task.kind, archived);
  /** `03-F38`/`03-F50` apply to what a kitchen actually cooks, which is what a till can sell. */
  const cooks = SELLABLE_KINDS.includes(task.kind) && !archived;
  const parentOptions = parentChoices(task.parentKind, entries, staged);

  /**
   * **`14-F35` — the closed state of the printing group, resolved.**
   *
   * Blank is the NORMAL answer for both of these fields, so blank is exactly what has to be
   * legible: never an empty box, never the bare word *inherit*, and never a value whose origin an
   * owner cannot see. Where nothing up the chain sets a station the sentence says whose decision
   * the fallback is — it is a pinned platform constant, not a choice anybody made here, and a
   * screen presenting it as configured would be claiming a decision nobody took (`00 §5.7`).
   */
  const typedName = form.name.trim();
  const ticket =
    form.kitchen_name.trim() !== ""
      ? form.kitchen_name.trim()
      : typedName !== ""
        ? typedName
        : strings.catalog.kitchenTicketUnnamed;
  const ownStation = form.station.trim();
  const inherited = inheritedStation(parentId === "" ? null : parentId, byId);
  const kitchenClosed =
    ownStation !== ""
      ? fill(strings.catalog.kitchenClosedOwn, { ticket, station: ownStation })
      : inherited !== null
        ? fill(strings.catalog.kitchenClosedInherited, {
            ticket,
            station: inherited.station,
            from: inherited.from,
          })
        : fill(strings.catalog.kitchenClosedFallback, {
            ticket,
            station: strings.catalog.kitchenFallbackStation,
          });

  /** Everything the next entry keeps, so 120 dishes are 120 names and not 120 forms. */
  const resetForNext = (): void => {
    setForm({ name: "", kitchen_name: "", station: "" });
    setDraft(emptyDraft(enabled));
    setFaults([]);
    // `14-F36` — apply-now is NEVER remembered between edits. One urgent change must not make the
    // next one urgent; the section is kept because it is where he is working, and the timing is
    // not because it is a claim about every till in the business.
    setApplyWhen(DEFAULT_APPLY_WHEN);
    setCarried(true);
  };

  const onSubmit = (commit: Commit): void => {
    setReceipt(null);
    setCarried(false);

    // `01-F60`, refused HERE — at the point of the mistake rather than at publish. A section is
    // priced by nothing, and a tombstone is exempt for `01-F55`'s reason.
    const resolution = priced ? resolveGrid(enabled, draft) : ({ ok: true, prices: [] } as const);
    if (!resolution.ok) {
      setFaults(resolution.faults);
      /**
       * **The refusal is brought TO the owner, because rendering it near the button is not enough
       * at this page height — measured, not assumed.**
       *
       * Editing an existing dish at 1366×768 makes this page 2318 px in a 768 px viewport. Putting
       * the sentence in the commit region moved it from **y = −532** (half a screen above the
       * viewport, `anyInView: false`) to **y = −105** — better, and still nothing where the owner
       * is looking, because at the foot of a page this long the commit region sits at the TOP of
       * the viewport with the whole change history below it. There is no static position that is
       * on-screen at every scroll offset: above the buttons fails when they are near the top,
       * below them fails when they are near the bottom edge, which is exactly where an owner who
       * scrolled until `Save` appeared has left them.
       *
       * So the ACT does it. This scrolls the commit panel — the object holding the timing choice,
       * the refusal and the button that was pressed — to the middle of the viewport, so what he
       * reads and what he pressed are in one glance (`27-F5`: the consequence belongs where the
       * act is). It runs only on a refusal, never on a save that worked, so it can never move the
       * page under a hand that is doing something else.
       *
       * `?.` on the method as well as the ref: happy-dom performs no layout and its stub is not
       * something to depend on, and a suite crashing on a missing method would be this fix
       * breaking the very tests that guard the rest of the refusal path.
       */
      commitRef.current?.scrollIntoView?.({ block: "center" });
      return;
    }
    setFaults([]);

    const parent_id = parentId === "" ? null : parentId;
    /**
     * `14-F33` — the identifier is assigned ONCE. A saved entry keeps the one it was given: not on
     * rename, not on re-parent, not on archive. `01-F53` has already frozen it into every line
     * rung and `01-F55` keeps a tombstone resolvable by it, so *"regenerate the id"* is not an
     * operation this module has.
     */
    const id =
      initial === null
        ? uniqueId(
            slugOf(form.name, slugOf(task.noun, task.kind)),
            // BOTH axes: an id staged this afternoon is taken, even though no till has it yet.
            new Set([...entries.map((entry) => entry.id), ...staged.map((edit) => edit.entity_id)]),
          )
        : initial.id;
    /**
     * ⚠ **The staged count is a FLOOR, not a sibling walk, and the reason is the projection.**
     * `catalog.pending` carries no `parent_id` and no `sort`, so the entries staged today cannot be
     * grouped by section here. Adding their number keeps each new entry strictly after every
     * sibling AND after everything staged since — without it, sixty dishes written on day one all
     * take the same `sort` and the menu's order becomes whatever the writer serialised. The cost
     * is gaps in the numbering, which nothing reads. A per-section answer wants two more fields on
     * that projection, which is a server change and is reported rather than taken here.
     */
    const sort = initial === null ? nextSort(entries, parent_id) + staged.length : initial.sort;

    save.mutate(
      {
        entry: {
          kind: task.kind,
          id,
          name: form.name.trim(),
          kitchen_name: orNull(form.kitchen_name),
          parent_id,
          ...(sort === undefined ? {} : { sort }),
          // `03-F50` — absence is INHERITANCE, not "no station", so a blank field sends `null`.
          station: orNull(form.station),
          // Copied into a mutable array because the wire schema's inferred input is mutable; the
          // resolution stays `readonly` so nothing downstream can edit a resolved price in place.
          ...(priced ? { prices: [...resolution.prices] } : {}),
          ...(archived ? { deleted: true } : {}),
        },
        apply_when: applyWhen,
      },
      { onSuccess: () => (commit === "again" ? resetForNext() : onSaved()) },
    );
  };

  const refusal = refusalMessage(save.error) ?? refusalMessage(archive.error);

  return (
    <Card>
      {/*
        **The entry's NAME is user content and is never case-transformed** (commandment 7).
        `CardTitle` uppercases through CSS, which is right for the word *Menu* and wrong for
        *Chicken Karahi (Full)*. The panel label is the TASK NOUN — `14-F32`: the internal kind
        string is vendor vocabulary and is not rendered, on the chooser, on the form or here.
      */}
      <CardHeader>
        <span className="text-label uppercase tracking-wider text-muted-foreground">
          {initial === null ? task.title : task.noun}
        </span>
        {initial === null ? null : (
          <h2 className="text-xl font-semibold leading-tight tracking-tight">{initial.name}</h2>
        )}
        {archived ? <Caption>{strings.catalog.archived}</Caption> : null}
        {/*
          **`14-F33` — shown once, demoted, never on a control.** An owner matching a till's
          degraded line (`01-F54`) or quoting an entry to whoever supports him has to be able to
          READ this; he must never have to invent one. It was a text box, which is uneditable and
          still a control, and which is what made an owner believe a primary key was his to choose.
        */}
        {initial === null ? null : (
          <Caption>
            {`${strings.catalog.reference} ${initial.id} — ${strings.catalog.referenceHelp}`}
          </Caption>
        )}
      </CardHeader>
      <CardBody>
        {/*
          **The fields the task actually needs, and nothing else** (`14-F32`).

          Seven identity fields used to stand between an owner and the grid he opened the editor
          for — a discriminator, a primary key, a foreign key and a sort column among them. What is
          left is what only he can answer: what it is called, and where on the menu it sits.
        */}
        <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
          <Field label={strings.catalog.name} help={strings.catalog.nameHelp} htmlFor="name">
            <Input
              id="name"
              aria-describedby={helpId("name")}
              value={form.name}
              onChange={(event) => set("name", event.target.value)}
            />
          </Field>

          {/*
            `14-F33` — `BELONGS TO` became a question about the MENU: chosen by the parent's name,
            from the entries that exist. A free-text foreign key made an orphan the list cannot
            draw one typo away, and asked an owner for a value he has no way to know.
          */}
          {task.parentKind === null ? null : (
            <Field
              label={strings.catalog.parent}
              help={
                parentOptions.length === 0
                  ? strings.catalog.parentEmpty
                  : strings.catalog.parentHelp
              }
              htmlFor="parent"
            >
              <select
                id="parent"
                aria-describedby={helpId("parent")}
                className="h-10 rounded-md border border-input bg-background px-3 text-body"
                value={parentId}
                onChange={(event) => setParentId(event.target.value)}
              >
                <option value="">{strings.catalog.parentNone}</option>
                {parentOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {/* A section that lands at 05:00 says so, rather than being offered as though
                        a till already had it — the two axes named, not blurred (`14-F28`). */}
                    {option.waiting
                      ? `${option.name} — ${strings.catalog.parentStaged}`
                      : option.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>

        {/*
          `14-F34` — *"nothing a save can refuse may be collapsed"*. The grid is open, always:
          hiding a field whose absence blocks the save produces a refusal pointing at a control the
          owner cannot see.
        */}
        {priced ? (
          <PriceGrid
            enabled={enabled}
            draft={draft}
            faults={faults}
            onCellChange={onCellChange}
            onFillAcross={(text) => setDraft(fillAcross(enabled, text))}
          />
        ) : null}

        {/*
          **The one disclosure on this surface (`14-F34`, `14-F35`).**

          Its closed state states what is inside it AND the outcome of never opening it — the
          resolved ticket name and the resolved station, with the section the station came from. A
          disclosure whose closed state says only *"Advanced"* fails the FR, and so does one saying
          only *"Kitchen printing"*: the first names nothing, the second names the box and not the
          outcome.

          `<details>` rather than a hand-rolled toggle because the browser owns the state, and
          because a closed `<details>` still holds its fields in the DOM — which is exactly why the
          claim above is about the SUMMARY's text and not about what a query can find inside.
        */}
        {cooks ? (
          <details className="rounded-md border border-border bg-muted/40 px-4 py-3">
            <summary className="cursor-pointer text-xs leading-relaxed text-muted-foreground">
              {kitchenClosed}
            </summary>
            <div className="mt-4 grid gap-x-5 gap-y-4 sm:grid-cols-2">
              <Field
                label={strings.catalog.kitchenName}
                help={strings.catalog.kitchenNameHelp}
                htmlFor="kitchen_name"
              >
                <Input
                  id="kitchen_name"
                  aria-describedby={helpId("kitchen_name")}
                  value={form.kitchen_name}
                  onChange={(event) => set("kitchen_name", event.target.value)}
                />
              </Field>
              <Field
                label={strings.catalog.station}
                help={strings.catalog.stationHelp}
                htmlFor="station"
              >
                <Input
                  id="station"
                  aria-describedby={helpId("station")}
                  value={form.station}
                  onChange={(event) => set("station", event.target.value)}
                />
              </Field>
            </div>
          </details>
        ) : null}

        {/*
          **THE COMMIT REGION — `14-F36`: timing belongs to the ACT, not to the entry.**

          *"WHEN DOES THIS APPLY?"* used to be a fieldset in the middle of data entry, which asks an
          owner about ledger timing before he has typed a price. It is now part of the commit: one
          bounded object holding the choice, its consequence and the act, so the two cannot be in
          different glances. `14-F28` is not re-opened by any of this — the choice is still per
          edit, the default is still the 05:00 boundary, and apply-now is still explicit with its
          consequence rendered BEFORE it can be chosen.
        */}
        <div
          ref={commitRef}
          className="flex flex-col gap-5 rounded-lg border border-border-strong bg-muted p-5"
        >
          <ApplyWhenControl value={applyWhen} onChange={setApplyWhen} />

          {/*
            **`14-F29`/`14-F37`'s refusal, AT THE POINT OF THE ACTION — measured, not assumed.**

            `resolveGrid` refuses in `onSubmit` above and `price-grid.tsx` used to render the
            sentence inside the grid. At 1366×768 — the size `27 §1a` promises a counter — editing
            an existing dish makes this page 2318 px tall, and an owner at the foot of it pressing
            `Save` left that note at **y = −532**: half a screen above the viewport, `anyInView:
            false`. Nothing changed where he was looking, so a refused save and a dead button were
            the same event. Measured in Chromium; happy-dom performs no layout, so no suite here
            can see it and `pnpm layout:check` points at the till, not at these screens.

            It sits with the SERVER's refusal on purpose: the two are one fact to an owner — *this
            did not save, and here is why* — and one of them was already in the right place. Which
            cell is wrong is carried by the cells themselves (`aria-invalid`), so the sentence names
            every bad pair (`14-F29`: never the first one only) and the grid marks them.

            `role="status"` and not `role="alert"`: the same choice `Counter.tsx` records for the
            till's refused *Save caller*, and for the same reason — this is a STATE that stays true
            until he fixes a cell, announced without seizing the screen he is fixing it on.
          */}
          {faults.length === 0 ? null : (
            <Note tone="fault" role="status" className="bg-destructive">
              {/* `21-F15` — the refusal names the branches it is about. It is one sentence, so
                  the flat form of the treatment is what fits; the grid marks the same cells. */}
              {`${strings.grid.incomplete} ${faults
                .map(
                  (fault) =>
                    `${nameText(places.branch(fault.branch_id))} · ${fault.channel} — ${fault.reason}`,
                )
                .join("; ")}`}
            </Note>
          )}

          {refusal === null ? null : (
            <Note tone="fault" className="bg-destructive">
              {`${strings.errors.saveRefused} ${refusal}`}
            </Note>
          )}
          {receipt === null ? null : (
            <Note tone="neutral" className="bg-card">
              {receipt.apply_when === "now"
                ? `${strings.timing.now} · ${strings.history.version} ${receipt.version ?? "—"}`
                : `${strings.timing.landsAt} ${formatInstant(receipt.lands_at)}`}
            </Note>
          )}
          {/* What the last save carried over, said rather than left to be discovered. */}
          {carried ? (
            <Note tone="neutral" className="bg-card">
              {strings.catalog.savedCarried}
            </Note>
          ) : null}

          {/*
            **`14-F7` is "archive, never delete" — so archive must not be painted as a deletion.**
            It is reversible curation, and it is a secondary control separated from the primary by
            layout rather than by hue; `27-F16` reserves colour for the abnormal.

            The two commit controls on a CREATION are the founder's own flow: he has 60 to 120
            items to type, one at a time, by choice. *Save and add another* keeps him in the form
            with the section he is working in; *Save and finish* closes it. Neither is disabled
            while the grid is incomplete (`14-F37`) — a disabled control explains nothing, and this
            one states what is missing and, on press, names every pair.
          */}
          <div className="flex flex-wrap items-center gap-4 border-t border-border pt-5">
            {initial === null ? (
              <>
                <Button
                  type="button"
                  size="lg"
                  onClick={() => onSubmit("again")}
                  disabled={save.isPending}
                >
                  {save.isPending ? strings.catalog.saving : strings.catalog.saveAndAddAnother}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => onSubmit("finish")}
                  disabled={save.isPending}
                >
                  {strings.catalog.saveAndFinish}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="lg"
                onClick={() => onSubmit("finish")}
                disabled={save.isPending}
              >
                {save.isPending ? strings.catalog.saving : strings.catalog.save}
              </Button>
            )}
            {initial === null || archived ? null : (
              <div className="ml-auto flex max-w-md flex-col items-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={archive.isPending}
                  onClick={() =>
                    archive.mutate({ kind: initial.kind, id: initial.id, apply_when: applyWhen })
                  }
                >
                  <Archive aria-hidden="true" className="size-4" />
                  {strings.catalog.archive}
                </Button>
                <p className="text-right text-xs leading-relaxed text-muted-foreground">
                  {strings.catalog.archiveHelp}
                </p>
              </div>
            )}
          </div>
        </div>

        {initial === null ? null : (
          <section className="flex flex-col gap-3">
            <h3 className="text-label uppercase tracking-wider text-foreground">
              {strings.history.heading}
            </h3>
            <ChangeHistory entity={initial.kind} entity_id={initial.id} />
          </section>
        )}
      </CardBody>
    </Card>
  );
};
