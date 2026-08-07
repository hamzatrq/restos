"use client";

/**
 * `14-F28` — *"Pending day-end edits are visible and cancellable until they land."*
 *
 * Both halves are here and neither is decoration. Visible, because an edit an owner cannot see is
 * an edit she cannot reconsider; cancellable, because `catalog-transport.md` names a cancelled
 * edit publishing anyway as the failure that decided devices are never shipped an `effective_at`.
 *
 * This reads `catalog.pending`, which is the STAGED axis. It deliberately does not merge with
 * `catalog.published` — a screen that showed one list would tell an owner a menu no till has, and
 * a cancelled edit would keep appearing as though it had shipped.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import type { ReactNode } from "react";
import { strings } from "../lib/strings";
import { useTRPC } from "../lib/trpc";
import { formatInstant } from "../lib/when";
import { Button } from "./ui/button";
import { Note } from "./ui/surface";

/**
 * `lib/when.ts`, not a second `toLocaleString`. This rendered `"Lands 8/8/2026, 05:00:00"` —
 * `en-US` month-first, to the second — directly above `14-F3`'s `"2 Aug 2026, 05:00"` on the same
 * page. Two orderings and two precisions for one kind of fact, and the month-first one is the
 * wrong reading order for this market: `9/8` would have been read as the wrong day.
 */
const landsAtText = formatInstant;

export const PendingEdits = (): ReactNode => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const pending = useQuery(trpc.catalog.pending.queryOptions());

  const cancel = useMutation(
    trpc.catalog.cancelPending.mutationOptions({
      // Invalidate rather than splice the cached list by hand. Editing the cache locally is how a
      // client's opinion of server state diverges from the server's, which is the shape
      // Commandment 5 forbids even when the store is TanStack Query's own.
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: trpc.catalog.pending.queryKey() });
      },
    }),
  );

  if (pending.isPending)
    return <p className="text-sm text-muted-foreground">{strings.errors.loading}</p>;
  if (pending.error !== null) return <Note tone="fault">{pending.error.message}</Note>;

  const edits = pending.data;
  if (edits.length === 0) {
    return <p className="text-sm text-muted-foreground">{strings.timing.pendingEmpty}</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {edits.map((edit) => (
        <li
          key={edit.edit_id}
          className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-border-strong bg-muted p-3"
        >
          <div className="flex min-w-0 items-start gap-3">
            <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="flex min-w-0 flex-col gap-0.5 text-sm">
              {/* `${entity} / ${entity_id}` is the identity `shell.dom.test.tsx` reads as one text
                  node (`getByText("item / tikka")`), so it stays exactly one node and exactly
                  that string. The `catalog.pending` row carries no NAME — the staged draft is
                  keyed by identity and the published artifact is a different axis this component
                  deliberately never joins (see the header above) — so a friendlier label here
                  would mean either merging the two axes or inventing a name. Neither is on. */}
              <span className="truncate font-medium">{`${edit.entity} / ${edit.entity_id}`}</span>
              <span className="text-xs text-muted-foreground">
                {`${strings.timing.landsAt} ${landsAtText(edit.lands_at)} · ${strings.timing.stagedBy} ${edit.actor_user_id}`}
              </span>
            </div>
          </div>
          {/*
            `variant="destructive"` before this — the same fault red as `Archive`, on the two most
            reversible controls in the app. Cancelling a PENDING edit is the safe act by
            construction: `14-F28` says a cancelled edit never reaches a till, so nothing is
            undone and no device has heard of it. `27-F16` reserves colour for the abnormal, and
            spending it here left nothing for apply-now, which is the one control on these screens
            that genuinely disrupts a shift.
          */}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate({ edit_id: edit.edit_id })}
          >
            {cancel.isPending ? strings.timing.cancelling : strings.timing.cancel}
          </Button>
        </li>
      ))}
    </ul>
  );
};
