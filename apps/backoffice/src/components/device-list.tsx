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
    return <span className="text-sm text-muted-foreground">{strings.devices.active}</span>;
  }
  return (
    <span className="flex flex-col gap-0.5 text-sm">
      {/* `27-F12` — colour never carries state alone. The WORD "Revoked" is the state; the tone
          is emphasis on top of it, so a monochrome screenshot still reads correctly. */}
      <span className="font-medium text-warning-fg">
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
    return <p className="text-sm text-muted-foreground">{strings.errors.loading}</p>;
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
        {/* The owed columns, named on the screen rather than only in a comment. */}
        <p className="text-xs text-muted-foreground">{strings.devices.columnsOwed}</p>
      </CardHeader>
      <CardBody>
        {revoke.error !== null ? (
          <Note tone="fault">{`${strings.devices.refused} ${revoke.error.message}`}</Note>
        ) : null}
        {revoke.data?.already === true ? (
          <Note tone="abnormal">{strings.devices.alreadyRevoked}</Note>
        ) : null}
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{strings.devices.empty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((device) => (
              <li
                key={device.device_id}
                className="flex flex-wrap items-start justify-between gap-4 rounded-md border border-border-strong bg-muted p-3"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <Smartphone
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  />
                  <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                    {/* The identity leads, because it is what an owner matches against the tablet
                        in her hand — there is no device display name in the corpus to prefer. */}
                    <span className="truncate font-medium">{device.device_id}</span>
                    <span className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
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
                <div className="flex flex-col items-end gap-2">
                  <RevocationState revoked_at={device.revoked_at} revoked_by={device.revoked_by} />
                  {/* No control at all on a revoked device — there is no un-revoke anywhere in this
                      product (`14-F30`; `01-N5`'s replacement path is a fresh device_id), and a
                      disabled button would suggest one exists behind a condition. */}
                  {device.revoked_at !== null ? null : confirming === device.device_id ? (
                    <div className="flex flex-col items-end gap-2">
                      {/* `14-F28`'s rule applied to the irreversible act: the consequence is on
                          the control, and it is READ rather than being the control's name. */}
                      <p className="max-w-xs text-right text-xs leading-relaxed text-warning-fg">
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
