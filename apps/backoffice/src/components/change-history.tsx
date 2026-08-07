"use client";

/**
 * **B-7 — `14-F3`: "The change history of any entity is browsable IN PLACE … the audit trail is a
 * first-class UI element, not a hidden log."**
 *
 * In place means filtered to the entity the owner has open, which is why this takes `entity` and
 * `entity_id` and does the narrowing here: `catalog.history` is org-scoped and a screen that
 * listed every change in the org would be the hidden log this FR exists to replace.
 *
 * It reads the LEDGER (`catalog.changed`), not the catalog. `14-F6` and `01-F52` are held together
 * rather than in tension — the artifact is reference data, the audit record is an event — and the
 * whole reason to render from the second is that the first cannot say who or when.
 *
 * ⚠ **`14-F3` IS NOT FULLY RENDERABLE FROM THIS CONTRACT, and the screen says so rather than
 * inventing the missing halves.** The FR's own example is *"price changed by Ali, 2 Jul, 450 →
 * 480"*. What `LedgerRecord` carries is `actor_user_id`, `entity`, `entity_id`, `version`,
 * `before_ref` and `after_ref` — content hashes, deliberately, because `01-F52` forbids the event
 * carrying entity bodies. So:
 *
 *   - **the date is absent.** `01-F43` stamps branch-consensus time at APPEND and `publish.ts`
 *     records that a back-office edit has no branch and no hub to ask, leaving the envelope's
 *     timestamp to the owed adapter. There is no field to read.
 *   - **450 → 480 is absent.** The refs are hashes; resolving them to values needs a snapshot
 *     store keyed by content address, which does not exist.
 *
 * Rendering a plausible date here would be inventing the one thing an audit trail may not invent.
 */

import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { strings } from "../lib/strings";
import { useTRPC } from "../lib/trpc";
import { Note } from "./ui/surface";

export const ChangeHistory = ({
  entity,
  entity_id,
}: {
  entity: string;
  entity_id: string;
}): ReactNode => {
  const trpc = useTRPC();
  const history = useQuery(trpc.catalog.history.queryOptions());

  if (history.isPending) {
    return <p className="text-sm text-muted-foreground">{strings.errors.loading}</p>;
  }
  if (history.error !== null) return <Note tone="fault">{history.error.message}</Note>;

  // IN PLACE — this entity's records, newest first. The append order is the ledger's; reversing it
  // is a display choice and touches no projected value (`01-F34`).
  const mine = history.data
    .filter((record) => record.payload.entity === entity && record.payload.entity_id === entity_id)
    .slice()
    .reverse();

  if (mine.length === 0) {
    return <p className="text-sm text-muted-foreground">{strings.history.empty}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <ol className="flex flex-col gap-1.5">
        {mine.map((record) => (
          <li
            key={`${record.payload.version}-${record.payload.after_ref ?? ""}`}
            className="rounded-md border border-border px-3 py-2 text-sm"
          >
            <span className="font-medium">
              {/* `before_ref === null` means the entry is NEW — there was nothing to change from. */}
              {record.payload.before_ref === null
                ? strings.history.created
                : strings.history.changed}
            </span>
            {/* `14-F3`'s "by Ali". `null` is a constructible mistake in `LedgerRecord`, so it is
                rendered as the absence it is rather than as an empty gap. */}
            <span>{` ${strings.history.by} ${record.actor_user_id ?? "—"} · `}</span>
            <span className="text-muted-foreground">
              {`${strings.history.version} ${record.payload.version}`}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">{strings.history.refsOnly}</p>
    </div>
  );
};
