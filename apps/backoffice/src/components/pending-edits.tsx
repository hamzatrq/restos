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
import type { ReactNode } from "react";
import { strings } from "../lib/strings";
import { useTRPC } from "../lib/trpc";
import { Button } from "./ui/button";
import { Note } from "./ui/surface";

const landsAtText = (lands_at: number): string =>
  new Date(lands_at).toLocaleString("en-US", { hour12: false });

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
          className="flex items-center justify-between gap-4 rounded-md border border-border p-3"
        >
          <div className="flex flex-col gap-0.5 text-sm">
            <span className="font-medium">{`${edit.entity} / ${edit.entity_id}`}</span>
            <span className="text-xs text-muted-foreground">
              {`${strings.timing.landsAt} ${landsAtText(edit.lands_at)} · ${strings.timing.stagedBy} ${edit.actor_user_id}`}
            </span>
          </div>
          <Button
            type="button"
            variant="destructive"
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
