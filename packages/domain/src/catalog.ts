// Catalog vocabulary (01-F60). Declared HERE and nowhere else — `18 §2`/`18 §4`: a domain
// classification is declared in `domain` once, and redeclaring it elsewhere is a violation rather
// than a convenience.

/**
 * `01-F60` — the kinds a price is REQUIRED on: `item`, `variant` and **`modifier`**.
 *
 * **`modifier` is SELLABLE by founder ruling (July 2026)**: "a paid add-on carries the same
 * commission exposure as the dish it sits on, so 'extra raita' is priced per `(branch, channel)`
 * like anything else and falls under the writer's completeness check." The consequence `01-F60`
 * states rather than leaves to be discovered: **a free modifier carries an explicit `0` on every
 * enabled pair** — so a completeness check tests for the CELL's presence, never for a truthy
 * price. `if (!price)` refuses a legal free add-on, and its mirror gives a paid one away;
 * `01-F53` freezes either mistake into the ledger permanently.
 *
 * `category` and `modifier_group` remain non-sellable and carry no price — one underscore from
 * `modifier`, and on the opposite side of this list.
 *
 * **WHY IT IS HERE, and why that is not tidying.** This list was declared three times —
 * `services/sync-gateway/src/catalog.ts` (the writer's completeness check),
 * `services/api/src/catalog.ts` (the same check at save, `14-F29`) and
 * `apps/backoffice/src/lib/price-grid.ts` (the editor grid) — each copy carrying a comment saying
 * the other copies existed. That is not a duplication cost, it is a **correctness** one: the July
 * ruling that added `modifier` had to be applied in one place, and three copies means the next
 * ruling gets applied to one or two of them. The divergence is invisible in review and shows up as
 * a catalog the editor saves and the writer refuses — or, worse, one both accept under different
 * rules. Neither service may import the other, so `domain` is the only place all three can reach.
 *
 * Typed `readonly string[]` rather than a `const` tuple on purpose: every consumer asks
 * `SELLABLE_KINDS.includes(someString)` about a `kind` that arrives off the wire as an open
 * string (`CatalogEntryWire.kind` is `z.string()`), and a literal-union tuple would refuse that
 * question at every call site.
 */
export const SELLABLE_KINDS: readonly string[] = ["item", "variant", "modifier"];
