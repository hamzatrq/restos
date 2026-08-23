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
import { Named, usePeopleNames } from "../lib/names";
import { strings } from "../lib/strings";
import { useTRPC } from "../lib/trpc";
import { formatInstant } from "../lib/when";
import { nounForKind } from "./entry-editor";
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
  /** `11-F20` — who staged the edit is a PERSON, and the roster resolves the word (`21-F15`). */
  const people = usePeopleNames();
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
    return <p className="text-body text-muted-foreground">{strings.errors.loading}</p>;
  if (pending.error !== null) return <Note tone="fault">{pending.error.message}</Note>;

  const edits = pending.data;
  if (edits.length === 0) {
    return <p className="text-body text-muted-foreground">{strings.timing.pendingEmpty}</p>;
  }

  /*
    A queue, not a stack of separate cards. Each row was its own bordered box on a sunken fill
    with 8 px between them — five objects where the truth is one list with five entries, and
    `27-F66`'s 3.41:1 boundary spent five times over inside a card that already has one. The rows
    now share one bounded well and are separated by a single rule each, which is what makes them
    read as *a queue with an order* rather than as unrelated notices.
  */
  return (
    <ul className="flex flex-col overflow-hidden rounded-md border border-border-strong bg-muted">
      {edits.map((edit) => (
        <li
          key={edit.edit_id}
          className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-4 last:border-b-0"
        >
          <div className="flex min-w-0 items-start gap-3">
            <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="flex min-w-0 flex-col gap-1">
              {/* **The DRAFT'S OWN name** — `catalog.pending` carries it, and this component
                  resolves nothing. This row read `item / item-chicken-karahi` until August 2026,
                  which is a kind and a raw id in front of an owner deciding whether to cancel a
                  dish she knows as "Chicken Karahi".

                  The name was never absent from the staged edit: `StagedEdit.entry` is a whole
                  `CatalogEntryWire`. Only the router's projection dropped it, and the earlier note
                  here ("the staged draft is keyed by identity") was wrong about its own data — the
                  half that was right is that the two axes must not be joined, and they still are
                  not. Resolving this name out of `catalog.published` would show the OLD name for a
                  rename and nothing at all for an item that has never been published, both
                  silently; `pending-name.dom.test.tsx` asserts this component never even asks for
                  the published artifact, which is what makes the separation structural rather
                  than a comment. */}
              {/* The dish the owner recognises, at content scale — this row exists so she can
                  decide whether to cancel it, and the identity below is the tie-breaker. */}
              <span className="truncate text-body text-foreground">{edit.name}</span>
              <span className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                {/*
                  **The identity, DEMOTED — and now in the owner's vocabulary (`14-F32`).**

                  This node read `${edit.entity} / ${edit.entity_id}` — *"item / mutton-karahi"*,
                  *"modifier_group / spice-level"* — which is the raw `01-F21` kind string and a
                  bare key, on the one list whose job is to let an owner recognise what lands at
                  05:00 and take it back. `14-F32` is explicit that *"the internal kind strings are
                  vendor vocabulary under `14-F38` and are not rendered; the task noun is this
                  surface's name for a kind EVERYWHERE"* — so it is `nounForKind`, the same table
                  the editor's own header and the menu list already draw from, and never a second
                  vocabulary invented here.

                  Both halves stay, and both are still needed. The KIND, because two entries may
                  share a display name (a dish *Coke* and an add-on *Coke*) and this row's control
                  cancels exactly one of them; the identifier, because `14-F33` makes it the thing
                  an owner quotes to whoever supports him and the thing a till renders when its
                  menu has not caught up (`01-F54`) — so it is labelled the way the editor labels
                  it rather than left as a naked token. The name above still leads; this is the
                  tie-breaker under it, at caption scale.

                  ⚠ **This is a live conflict with two older suites, reported and NOT worked
                  around** (`24-F5`): `shell.dom.test.tsx` finds this row by
                  `getByText("item / tikka")` and `pending-name.dom.test.tsx` asserts
                  `toContain("item / item-chicken-karahi")`. Both predate `14-F32`/`14-F38` and
                  both encode the string those FRs ban, so no implementation satisfies the corpus
                  and those five assertions at once. They are for the test-owning session; the
                  assertion those files were really written to defend — that the NAME leads and the
                  identity is demoted under it — is unchanged and still true here.
                */}
                <span className="truncate">
                  {`${nounForKind(edit.entity)} · ${strings.catalog.reference} ${edit.entity_id}`}
                </span>
                <span>
                  {`${strings.timing.landsAt} ${landsAtText(edit.lands_at)} · ${strings.timing.stagedBy} `}
                  <Named naming={people.person(edit.actor_user_id)} />
                </span>
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
