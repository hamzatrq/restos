/**
 * # `02-F6` / `02-F50` — the kitchen quick-tag list a cashier picks a note from
 *
 * > 02-F6 Item notes to kitchen: free text + **org-configurable quick-tags** ("less spicy") →
 * > `order.note_added`, printed prominently on the KOT (doc 03).
 *
 * > 02-F50 Wave 1's item note is the QUICK-TAG PICK LIST, and free text is deferred with `03-F8`'s
 * > reason.
 *
 * `27-F6`'s test is *"whether a non-typing operator can complete the task by another route"*, and
 * 24 of 27 field subjects could not type a single word. A tag tile is that route, so this list is
 * not a convenience layer over a text box — in Wave 1 it is the **only** input `C7` has.
 *
 * ## Layer 2, read from the environment — `aging.ts`'s and `serve-signal.ts`'s precedent
 *
 * `02 §7` already lists **kitchen quick-tags** under **Layer 2 (org)**, so the list has a home and
 * needs no new `00 §7` key. Layer 2 has no transport to a device — `config.changed` is org-scoped
 * under `01-F62` and no device folds it — so every layer-2 value in this repo is either pinned in
 * code or read from the environment, and this takes the second shape for the reason those two
 * modules give: it is a value an operator may need to change on the day.
 *
 * It lives in `packages/device-config` rather than in `apps/pos-electron` because `04 §7` names
 * the same list as *"quick-tag list (shared with doc 02)"* — the waiter app's second consumer is
 * written into the corpus. `DEC-ARCH-001` rules EXTRACT at the moment a module acquires its second
 * consumer and `18 §2` makes *"Apps NEVER import … other apps"* a MUST, so putting it in the till
 * would be the edge that made `aging.ts` a cycle, drawn again knowingly.
 *
 * ## ⚠ THE DEFAULT IS EMPTY, AND THAT IS A DECISION WITH A COST
 *
 * A till with no configured list draws **no tag row at all** and `C7` is unavailable — not broken
 * (`01-F17`: nothing about a note blocks a sale, and every other counter act is untouched).
 *
 * The alternative is a shipped starter list, and it is refused: a quick tag is an INSTRUCTION TO A
 * KITCHEN, and a plausible-sounding default is this product asserting what a restaurant it has
 * never seen wants its cooks told. `02-F6` states exactly one example — *"less spicy"* — and a
 * one-item pick list is not a pick list. `10 §7` and `11 §7` both carry their own quick-tag sets as
 * org config with no vendor defaults anywhere, which is the corpus being consistent about this.
 *
 * The cost is real and is stated rather than hidden: out of the box the note surface is dark until
 * someone sets the key. `describeQuickTags` puts that on the boot line (`00 §5.7`) instead of
 * letting it be discovered as an absent control.
 *
 * ## ⚠ `02-F39`'S CAP IS NOT ENFORCED HERE, AND IT IS OWED
 *
 * > 02-F39 **Quick-tags are capped at one page at the target posture (gap G10).** … The cap is
 * > **not a fixed number** … back office computes the page capacity for the target surface and
 * > refuses to save beyond it, showing the count against the limit.
 *
 * That FR puts the refusal at the WRITER, and the writer is a back-office surface that does not
 * exist — so today the environment key is the writer and nothing bounds it. A host that configures
 * forty tags gets forty controls and breaks `27-F2` (no scrolling to reach a primary action). This
 * module deliberately does not invent a number: `02-F39` calls a fixed cap *"the `27-F2` category
 * error"* by name, and the capacity computation it does specify needs the target surface's
 * geometry, which no boot-time resolver has. Named here so it is owed rather than assumed closed.
 */

/** `00 §7` layer 2 — the kitchen quick-tag list, as a device host reads it. */
export const QUICK_TAGS_ENV = "RESTOS_QUICK_TAGS";

/** How the list was answered, for the boot line. `aging.ts`'s three-way shape. */
export type QuickTagsSource =
  /** `00 §7` layer 2's key was set and at least one tag survived parsing. */
  | "configured"
  /** The key was unset or held nothing but separators. `C7` has no surface. */
  | "unset";

export type QuickTagsPolicy = {
  readonly tags: readonly string[];
  readonly source: QuickTagsSource;
};

/**
 * The separator. A tag is a short phrase with spaces in it (*"less spicy"*), so space cannot
 * separate them and comma is the only punctuation that is not plausibly part of one.
 */
const SEPARATOR = ",";

/**
 * Parse the key into `02-F6`'s list.
 *
 * **Nothing here filters by SCRIPT, and that is `02-F50`'s ruling rather than an omission.** An
 * owner may configure an Urdu tag; it will still refuse at the encoder (`03-F8`'s
 * `raster_font_unavailable`, `03-F34`'s *"hard refusal to print, never a silent degradation"*).
 * What `02-F50` changes is WHERE and WHEN that refusal happens — in configuration, before service,
 * against one list an owner can see and fix, rather than at the counter mid-rush against one order
 * with a cook waiting. Refusing here would be `00 §5.6` inverted (user content is Unicode) and
 * would also hide the state of the world the band is supposed to report.
 *
 * Empty entries are dropped rather than refused: a trailing comma is a typo, not a tag, and
 * `01-F17`'s reasoning at `station-routing.ts` applies — a layer-2 typo must not take a control off
 * the glass in the middle of a service. Duplicates are dropped too, because the fold keys notes by
 * TEXT (`26 §7` M2) so a repeated tag is one control that can only ever produce one note.
 */
export const parseQuickTags = (raw: string | undefined): readonly string[] => {
  const seen = new Set<string>();
  for (const part of (raw ?? "").split(SEPARATOR)) {
    const tag = part.trim();
    if (tag !== "") seen.add(tag);
  }
  return [...seen];
};

/**
 * The whole chain as one pure function, so the policy is testable without Electron.
 *
 * Order is PRESERVED as configured and never sorted. `00 §5.6` — staff navigate by **memorized
 * position**, so the order an owner writes is the order that ends up in a cashier's hands, and a
 * resolver that sorted alphabetically would re-rank every tile the day a tag was renamed.
 */
export const resolveQuickTags = (configured: string | undefined): QuickTagsPolicy => {
  const tags = parseQuickTags(configured);
  return { tags, source: tags.length === 0 ? "unset" : "configured" };
};

/**
 * What the boot line says (`00 §5.7`).
 *
 * The unset case is spelled out because being wrong about it is invisible from the screen: a till
 * with no configured tags looks exactly like a till whose note surface was never built, which is
 * the state this track exists to end.
 */
export const describeQuickTags = (policy: QuickTagsPolicy): string => {
  const head = `quick tags: ${policy.tags.length} (02-F6/02-F50, ${QUICK_TAGS_ENV})`;
  if (policy.source === "unset") {
    return (
      `${head} — UNSET. 02-F50 makes the pick list Wave 1's ONLY note input (27-F6: a non-typing` +
      ` operator must have a route), so this till draws no tag row and C7 is unavailable. Set` +
      ` ${QUICK_TAGS_ENV}="less spicy,no onions,extra gravy" to give the counter one. No default` +
      ` is shipped: a quick tag is an instruction to a kitchen, and 02 §7 makes the list org config.`
    );
  }
  return `${head} — from 00 §7 layer 2: ${policy.tags.join(" | ")}`;
};
