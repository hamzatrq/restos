"use client";

/**
 * `14-F12`'s device list and `14-F13`'s kill switch — *"Revocation is immediate ('stolen tablet'
 * flow) … the list shows revoked state and **actor**"*, on a screen `14-N2` puts on an owner's
 * phone.
 *
 * **Until this screen existed the only way to revoke a device was a shell command on the service
 * host**, which by construction had no signed-in user and so could record no actor at all
 * (`services/sync-gateway/src/revoke-device.ts` records that as the reason it deliberately writes
 * no event). The actor is the entire difference between the two surfaces, which is why it is a
 * column here and not a footnote.
 *
 * **Two things this screen says that a screen usually would not, and both are `00 §5.7`:**
 *
 *  1. `14-F12` asks for app version, last-seen and sync lag. Nothing in this product stores them
 *     — no heartbeat table exists, doc 15's device pipeline is unbuilt — so they are ABSENT and
 *     the card says which. A plausible substitute would be indistinguishable from a real one on
 *     a demo and wrong every day after.
 *  2. A device revoked from the service host has revoked state and **no** actor. That renders as
 *     *"actor not recorded"*, never as an empty cell: an empty cell reads as "nobody", which is a
 *     claim, and the true statement is that the ledger has no row.
 *
 * Commandment 5: TanStack Query + tRPC only, no client store, no `sync-client`. The only local
 * state is which row's confirmation is open — an intent, not a copy of server data.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Smartphone } from "lucide-react";
import { type ReactNode, useState } from "react";
import { strings } from "../lib/strings";
import { useTRPC } from "../lib/trpc";
import { formatInstant } from "../lib/when";
import { Button } from "./ui/button";
import { Card, CardBody, CardHeader, CardTitle, Note, Problem } from "./ui/surface";

/**
 * One row's revoked state, rendered so the three cases are three different sentences.
 *
 * Active · revoked-with-actor · revoked-without-actor. The third is the one that must not collapse
 * into either neighbour: collapsing it into "active" hides a dead till, and collapsing it into
 * "revoked by —" invents an attribution the ledger does not have.
 */
const RevocationState = ({
  revoked_at,
  revoked_by,
}: {
  revoked_at: number | null;
  revoked_by: string | null;
}): ReactNode => {
  if (revoked_at === null) {
    return <span className="text-label text-muted-foreground">{strings.devices.active}</span>;
  }
  return (
    <span className="flex flex-col items-start gap-0.5 sm:items-end">
      {/* `27-F12` — colour never carries state alone. The WORD "Revoked" is the state; the tone
          is emphasis on top of it, so a monochrome screenshot still reads correctly. */}
      <span className="text-label text-warning-fg">
        {`${strings.devices.revokedAt} ${formatInstant(revoked_at)}`}
      </span>
      <span className="text-xs text-muted-foreground">
        {revoked_by === null
          ? strings.devices.notRecorded
          : `${strings.devices.revokedBy} ${revoked_by}`}
      </span>
    </span>
  );
};

export const DeviceList = (): ReactNode => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const devices = useQuery(trpc.devices.list.queryOptions());
  /** Which row is asking for confirmation. `14-F13` is irreversible, so it is never one tap. */
  const [confirming, setConfirming] = useState<string | null>(null);

  const revoke = useMutation(
    trpc.devices.revoke.mutationOptions({
      // Invalidate, never splice: the authority for revoked state is the registry, and a client
      // that edited its own cache would show a device as dead before the write landed — on the
      // one screen where believing a stolen tablet is off matters most.
      onSuccess: () => {
        setConfirming(null);
        void queryClient.invalidateQueries({ queryKey: trpc.devices.list.queryKey() });
      },
    }),
  );

  if (devices.isPending) {
    return <p className="text-body text-muted-foreground">{strings.errors.loading}</p>;
  }
  if (devices.error !== null) {
    return (
      <Problem
        heading={strings.unreachable.heading}
        body={strings.unreachable.body}
        action={strings.unreachable.action}
        detail={devices.error.message}
      >
        <Button
          type="button"
          variant="secondary"
          disabled={devices.isFetching}
          onClick={() => void devices.refetch()}
        >
          <RefreshCw aria-hidden="true" className="size-4" />
          {devices.isFetching ? strings.unreachable.retrying : strings.unreachable.retry}
        </Button>
      </Problem>
    );
  }

  const rows = devices.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{strings.devices.heading}</CardTitle>
      </CardHeader>
      <CardBody>
        {/*
          **`14-F12` asks for three columns this product does not store, and stating that well is
          the design problem — not a caption to hide.**

          It was a 12 px grey line under the heading, which is the register of an apology and reads
          as small print an owner skims. It is now a bounded, labelled block on its own ground,
          placed where the missing columns WOULD have been: above the list, as the list's own
          header note. That is `00 §5.7` given a shape — the absence is a first-class statement
          with the same standing as the data beside it, not a footnote about it.

          It stays OUT of the `<li>`s deliberately, and that is asserted:
          `device-list.dom.test.tsx` reads each row's `textContent` and fails if `last seen`,
          `sync lag` or `app version` appear in it — a row must never look like it is carrying a
          fact the registry does not hold.
        */}
        <p className="rounded-md border border-border bg-muted px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          {strings.devices.columnsOwed}
        </p>
        {revoke.error !== null ? (
          <Note tone="fault">{`${strings.devices.refused} ${revoke.error.message}`}</Note>
        ) : null}
        {revoke.data?.already === true ? (
          <Note tone="abnormal">{strings.devices.alreadyRevoked}</Note>
        ) : null}
        {rows.length === 0 ? (
          <p className="text-body text-muted-foreground">{strings.devices.empty}</p>
        ) : (
          /*
            **A fleet register, not seven floating cards.** Each row was its own bordered box on a
            sunken fill, so an eight-device org rendered as eight separate objects and the identity
            sat 1200 px from its own state at desk width — two unrelated things at opposite ends of
            the screen. One bounded well with a rule per row reads as a list of a fleet, and the
            `gap-x-6` metadata line replaces three run-on label-value pairs a reader had to
            re-parse on every row.
          */
          <ul className="flex flex-col overflow-hidden rounded-md border border-border-strong bg-muted">
            {rows.map((device) => (
              <li
                key={device.device_id}
                className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-border p-4 last:border-b-0"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <Smartphone
                    aria-hidden="true"
                    className="mt-1 size-4 shrink-0 text-muted-foreground"
                  />
                  <div className="flex min-w-0 flex-col gap-1">
                    {/* The identity leads, because it is what an owner matches against the tablet
                        in her hand — there is no device display name in the corpus to prefer. */}
                    <span className="truncate text-body text-foreground">{device.device_id}</span>
                    <span className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                      <span className="truncate">{`${strings.devices.branch} ${device.branch_id}`}</span>
                      <span className="truncate">{`${strings.devices.deviceClass} ${device.device_class}`}</span>
                      {device.token_expires_at === null ? null : (
                        <span className="truncate">
                          {`${strings.devices.tokenExpires} ${formatInstant(device.token_expires_at)}`}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                  <RevocationState revoked_at={device.revoked_at} revoked_by={device.revoked_by} />
                  {/* No control at all on a revoked device — there is no un-revoke anywhere in this
                      product (`14-F30`; `01-N5`'s replacement path is a fresh device_id), and a
                      disabled button would suggest one exists behind a condition. */}
                  {device.revoked_at !== null ? null : confirming === device.device_id ? (
                    /*
                      The armed state takes the `27-F64` abnormal outline and its own raised
                      ground — the same treatment the armed apply-now row gets in the editor,
                      because these are the two irreversible-ish acts in the app and they should
                      look like the same kind of moment. Thickness and ground, no extra hue.
                    */
                    <div className="flex max-w-sm flex-col items-start gap-3 rounded-md border border-warning-outline bg-card p-3 outline-2 outline-warning-outline sm:items-end">
                      {/* `14-F28`'s rule applied to the irreversible act: the consequence is on
                          the control, and it is READ rather than being the control's name. */}
                      <p className="text-xs leading-relaxed text-warning-fg sm:text-right">
                        {strings.devices.revokeConsequence}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={revoke.isPending}
                          onClick={() => setConfirming(null)}
                        >
                          {strings.devices.confirmNo}
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={revoke.isPending}
                          onClick={() => revoke.mutate({ device_id: device.device_id })}
                        >
                          {revoke.isPending ? strings.devices.revoking : strings.devices.confirmYes}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setConfirming(device.device_id)}
                    >
                      {strings.devices.revoke}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
};
