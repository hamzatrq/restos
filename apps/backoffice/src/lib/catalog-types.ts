/**
 * The screens' types, **inferred from the router rather than transcribed from it.**
 *
 * `18 §4` declares a schema once. `services/api`'s `catalog.ts` records what a transcription costs
 * in the neighbouring case — a restated `channel` enum accepting `dine_in` here and being refused
 * three layers down, in front of an owner who has already left the screen. Inference is the same
 * argument applied to the read side: when `catalog.history` grows the timestamp `14-F3` needs,
 * this file learns about it by failing to compile rather than by silently rendering nothing.
 */

import type { AppRouter } from "@restos/api/src/router.js";
import type { inferRouterOutputs } from "@trpc/server";

type Outputs = inferRouterOutputs<AppRouter>;

/** `01-F52` reference data as devices fetch it — the published artifact, never the staged draft. */
export type PublishedCatalog = Outputs["catalog"]["published"];
export type CatalogEntry = PublishedCatalog["entries"][number];

/** `14-F28` — a staged edit, visible until it lands. The OTHER version axis. */
export type PendingEdit = Outputs["catalog"]["pending"][number];

/** `14-F3` — one `catalog.changed` record from the ledger. */
export type HistoryRecord = Outputs["catalog"]["history"][number];

/** What `catalog.save` and `catalog.archive` answer with — `14-F28`'s stated consequence. */
export type EditReceipt = Outputs["catalog"]["save"];

/**
 * The `01-F21` chain, in the order a menu is built. `kind` is a free string on the wire, so this is
 * the editor's offered set rather than a closed one — an entry arriving with a kind outside it
 * still renders, because refusing to display published data would hide a menu a till is selling.
 */
export const ENTRY_KINDS: readonly string[] = [
  "category",
  "item",
  "variant",
  "modifier_group",
  "modifier",
];
