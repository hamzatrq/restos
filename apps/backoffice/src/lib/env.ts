/**
 * The app's ONLY `process.env` reader (`18 §5`: env is read through `defineEnv` and nowhere else).
 *
 * ⚠ **THE ENABLED SET IS DECLARED TWICE AND CAN DRIFT — reported, not hidden.**
 * `01-F60`'s enabled `(branch, channel)` pairs are the price grid's two axes, and the API holds
 * them as `ENABLED_BRANCHES`/`ENABLED_CHANNELS` on `CatalogDeps.enabled`. **There is no procedure
 * that returns them**, and `services/api` is this task's contract rather than its code, so the
 * editor cannot ask the server what to draw. Every alternative available here is worse:
 *
 *   - deriving branches from the published prices invents nothing for a NEW branch (it has no
 *     prices yet, which is the entire reason its cells need filling), and nothing at all for the
 *     first item an org ever prices;
 *   - defaulting to "all `ORDER_CHANNELS`, one branch" is the plausible guess `01-F60` refuses a
 *     fallback in order to prevent — it would publish prices for branches that do not exist.
 *
 * So the operator states the set here too, and the server's refusal is the backstop: a grid drawn
 * with the wrong axes fails `assertSavable` loudly rather than publishing a half-priced menu. A
 * `catalog.enabled` procedure is the real fix and is owed.
 *
 * Absent config leaves the set EMPTY, and `resolveGrid` refuses an empty set outright rather than
 * treating it as "nothing to check" — the same fail-closed direction as the API's
 * `unconfiguredCatalog`.
 */

import { defineEnv } from "@restos/config";
import { ORDER_CHANNELS, type OrderChannel } from "@restos/domain";
import type { EnabledPairs } from "./price-grid";

const list = (raw: string | undefined): readonly string[] =>
  raw === undefined
    ? []
    : raw
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part !== "");

/**
 * `02-F42`'s CLOSED set is the authority (`18 §4` — declared once in `domain`). A channel outside
 * it crashes the app at boot rather than drawing a column whose prices no order can ever resolve:
 * `01-F60` looks a price up by the ORDER's channel, so a `dine_in` column (an order TYPE, `02-F1`)
 * matches no lookup ever and the item reads as unpriced on every real channel.
 */
const channels = (raw: string | undefined): readonly OrderChannel[] => {
  const named = list(raw);
  const unknown = named.filter((name) => !(ORDER_CHANNELS as readonly string[]).includes(name));
  if (unknown.length > 0) {
    throw new Error(
      `not an 02-F42 order channel: ${unknown.join(", ")}. Known: ${ORDER_CHANNELS.join(", ")}`,
    );
  }
  return named as readonly OrderChannel[];
};

/**
 * Read once, at module load. `NEXT_PUBLIC_` because the price grid renders in the browser, and
 * these two literal member expressions are what Next inlines at build time — which is also why
 * they cannot be computed.
 */
const env = defineEnv(
  { ENABLED_BRANCHES: list, ENABLED_CHANNELS: channels },
  {
    ENABLED_BRANCHES: process.env.NEXT_PUBLIC_ENABLED_BRANCHES,
    ENABLED_CHANNELS: process.env.NEXT_PUBLIC_ENABLED_CHANNELS,
  },
);

export const enabledPairs: EnabledPairs = {
  branches: env.ENABLED_BRANCHES,
  channels: env.ENABLED_CHANNELS,
};
