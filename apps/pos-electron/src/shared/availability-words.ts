/**
 * `02-F51` — **ONE STATE, ONE WORD, WRITTEN ONCE ON THIS DEVICE.**
 *
 * Two surfaces render `02-F7`'s availability state and they live on opposite sides of the
 * `18 §6` bridge: `main/gateway.ts`'s display join composes the reason the Order grid shows, and
 * `renderer/Counter.tsx`'s Sold-out grid composes the reason its own tiles show. Until August
 * 2026 they composed it from the same two fold facts and produced **different words** — `86` /
 * `86 — disputed` on one tab and `Sold out` / `Sold out — disputed` on the other, for one fold
 * row, in front of one cashier. `00 §5.6` is English-only UI, `02-F40`'s jargon is American
 * restaurant slang with no standing in Pakistan, and `21 §5` puts the operator at plausibly
 * non-reading: two digits she must be TAUGHT are worse than two words she may already know.
 *
 * **Renaming the string in one layer would have closed the defect and left the cause**, which is
 * the `02-F45` shape — a second source for one fact. So the word lives here and both layers call
 * this. The suite that proves it is `renderer/one-word-per-state.dom.test.tsx`, which runs the
 * REAL gateway behind the REAL screen and compares the two surfaces **to each other** rather
 * than to a hand-copy.
 *
 * **The jargon stays in the spec corpus and in reasoning about `02-F7`; it never reaches the
 * glass.** Nothing here touches the EVENT vocabulary — `availability.changed` is unchanged, and
 * `02-F51` decides nothing about it (commandment 2).
 *
 * `01-F58`'s contest keeps its own qualifier rather than collapsing into the plain word: the
 * fold refused to pick a winner (`01-F31`) and the operator is the one who can resolve it, so
 * telling her a settled fact would be a different lie. `01-F60`'s unpriced tile deliberately has
 * **no entry here** — `01-F59` calls the two dispositions opposites, and one word for both would
 * be this same defect inverted.
 */
export const soldOutWord = (contested: boolean): string =>
  contested ? "Sold out — disputed" : "Sold out";
