"use client";

/**
 * **`14-F41` — `01-F25`'s PAIRING CODE, as the device list's own create task.**
 *
 * `01-F25` has said since Draft 1 that *"registration is a one-time pairing via back office code"*
 * and named no surface. Until this screen existed, putting a till on the floor meant a shell on the
 * service host: `pnpm -C services/sync-gateway provision-device` plus five environment keys typed
 * on the machine itself. `28-F13` records that as the point where a self-onboarded restaurant
 * **stops** — an org, an owner, and no way to reach a till — and R40 is what makes it blocking:
 * a restaurant must reach *"an org, a branch, an owner login and a device pairing code with nobody
 * touching a terminal."*
 *
 * ── WHAT THIS SCREEN OWNS AND WHAT IT DOES NOT ──────────────────────────────────────────────────
 *
 * `01-F80` owns the code, its lifetime, its claim, its limits and its refusals; this file owns the
 * surface and nothing else. **In particular it MINTS NOTHING ITSELF** — `14-F41`: *"a wizard that
 * mints codes its own way is that defect with a credential on it"* — every act here is
 * `devices.mintPairing` / `devices.pairings` / `devices.cancelPairing`, the same three procedures
 * `14-F26`'s wizard step will call.
 *
 * ── THE FOUR THINGS THE FR ASKS OF THE SURFACE, EACH ANSWERED BELOW ─────────────────────────────
 *
 *  1. **Three facts and no more** — the branch, what the device is for, and the name it will be
 *     known by. The `01-F39` class STRING never renders (`14-F38`): the task is *connect a till*
 *     and the vocabulary word is mapped to the class here, in one place.
 *  2. **What she READS ALOUD.** The code renders large enough to read from arm's length, grouped
 *     `4831 9026` (`01-F80` (b)), and the screen states *where it goes* — a code read to somebody
 *     staring at a screen with no box for it is a support call.
 *  3. **A reload loses it, and the surface says so instead of pretending.** There is no read
 *     anywhere that can fetch a live code back; `14-F41` requires that of doc 01 deliberately, so
 *     the credential half stays free to store a verifier and never the secret. The way out costs
 *     one press: get another, which kills the first (`01-F80` (c)).
 *  4. **CANCEL IS NOT REVOKE**, and the surface states which side of the line she is on **before**
 *     she presses. Cancelling an unclaimed code destroys a credential nobody holds; revoking a
 *     claimed device is permanent (`01-N5`, `14-F30`, `01-F48`).
 *
 * ── ⚠ A WAITING ROW IS NOT A DEVICE, AND THE TWO LISTS ARE NEVER MERGED ─────────────────────────
 *
 * `14-F41`: *"Before a claim there is no device"* and *"The waiting row becomes `14-F12`'s device
 * row."* So the waiting rows live here, in their own bounded block, and `DeviceList` renders the
 * registry. A screen that folded them together would show an owner a fleet containing tills that do
 * not exist — `00 §5.7`'s aged-fact-as-fresh failure with the sign flipped.
 *
 * **A claim is observed as the row changing by itself**, so this polls; `14-F41` requires that the
 * row *"never silently disappears"*, which is why an expired row is rendered as expired and offers
 * another rather than being filtered out.
 *
 * Commandment 5: TanStack Query + tRPC only. Commandment 6 applies to `packages/ui`'s counter
 * vocabulary and not to this app — the back office is a Next.js cloud screen built on its own
 * `components/ui` primitives, exactly as every other screen here is.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Named, usePlaceNames } from "../lib/names";
import { strings } from "../lib/strings";
import { useTRPC } from "../lib/trpc";
import { formatInstant } from "../lib/when";
import { Button } from "./ui/button";
import { Field, helpId, Input, Select } from "./ui/field";
import { Card, CardBody, CardHeader, CardTitle, Note, Problem } from "./ui/surface";

/**
 * `14-F41`'s task list, and the mapping is here because it is the ONE place the vendor word meets
 * the owner's word.
 *
 * ⚠ **`14 §9.14` is open — "Which device classes `14-F41`'s task list should offer" — and this is
 * the narrow answer, stated as a reading.** `01-F39` ships six classes; a single-branch pilot
 * connects a till and perhaps a kitchen screen, and `14-F32`'s whole argument is that offering six
 * tasks where two are used is the clutter it exists to remove. Widening the list later is additive;
 * the class strings themselves are `packages/domain`'s and are not redeclared — these two are the
 * two `apps/pos-electron` and `apps/pass-kds` actually run.
 */
const TASKS = [
  { device_class: "counter_electron", label: strings.pairing.connectTill },
  { device_class: "kitchen", label: strings.pairing.connectKitchen },
] as const;

/** `01-F80` (b): "displayed and read as `1234 5678`". The SPACE is a display concern — the value on
 * the wire is the eight digits — so it is added here and nowhere else. */
const spoken = (code: string): string => `${code.slice(0, 4)} ${code.slice(4)}`;

const MINUTE_MS = 60_000;

/**
 * `14-F4`/`00 §5.7` — the waiting row states its own age, and near expiry it says so.
 *
 * **`now` is a PARAMETER and not a `Date.now()` inside the component**, so the sentence a test
 * reads is the sentence a determinate clock produces. An expired row keeps its place and reads
 * *expired*: `14-F41` requires that it never silently disappear, because "a vanished row is
 * indistinguishable from a claimed one".
 */
const lifeOf = (expires_at: number, now: number): { text: string; expired: boolean } => {
  const left = expires_at - now;
  if (left <= 0) return { text: strings.pairing.expired, expired: true };
  if (left < MINUTE_MS) return { text: strings.pairing.expiringSoon, expired: false };
  return {
    text: `${strings.pairing.expiresIn} ${String(Math.ceil(left / MINUTE_MS))} min`,
    expired: false,
  };
};

/**
 * The code, once.
 *
 * `27-F12`: colour never carries state alone — the words above and below the digits are what say
 * what this is; the ground is emphasis on top of them.
 */
const CodeCard = ({
  code,
  device_name,
  onDone,
}: {
  code: string;
  device_name: string;
  onDone: () => void;
}): ReactNode => (
  <div
    data-testid="pairing-code"
    className="flex flex-col gap-3 rounded-md border border-border-strong bg-card p-4 outline-2 outline-warning-outline"
  >
    <p className="text-label text-foreground">{device_name}</p>
    <p className="text-label text-muted-foreground">{strings.pairing.codeHeading}</p>
    {/*
      `14-F41`: "the code renders large enough to read from arm's length". `tabular-nums` because
      `27-F26` picked a face with tabular digits for exactly this — a code read aloud must not have
      its digits shifting width under the reader's finger.
    */}
    <p className="font-mono text-4xl tracking-[0.2em] tabular-nums text-foreground">
      {spoken(code)}
    </p>
    <p className="text-body text-foreground">{strings.pairing.codeWhere}</p>
    <p className="text-label text-warning-fg">{strings.pairing.codeLife}</p>
    <p className="text-xs leading-relaxed text-muted-foreground">{strings.pairing.codeGone}</p>
    <div>
      <Button type="button" variant="secondary" size="sm" onClick={onDone}>
        {strings.pairing.codeDone}
      </Button>
    </div>
  </div>
);

export const PairingPanel = (): ReactNode => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const places = usePlaceNames();
  /**
   * The branch list, off the read that already exists (`21-F15`'s `tenancy.directory`). A refusal
   * is not surfaced as an error here for that read's own recorded reason — but it DOES leave the
   * form with no branch to name, and `14-F37` says a disabled control explains nothing, so the
   * empty case renders a sentence rather than a dead select.
   */
  const directory = useQuery(trpc.tenancy.directory.queryOptions(undefined, { retry: false }));
  const waiting = useQuery(
    trpc.devices.pairings.queryOptions(undefined, {
      // `14-F41`: "A claim is observed as the row changing by itself." Ten seconds is short against
      // a fifteen-minute code and long enough that a browser left open all day is not a load.
      refetchInterval: 10_000,
    }),
  );

  /** Which task is open, if any. An intent — not a copy of server data. */
  const [task, setTask] = useState<(typeof TASKS)[number] | null>(null);
  /**
   * ⚠ **`""` means SHE HAS NOT CHOSEN, and the effective branch is derived below rather than
   * seeded on the click.** The first draft seeded it from `branches[0]` when the task opened, and
   * that is a real defect rather than a style: `tenancy.directory` is a separate query, so opening
   * the form before it answers left the choice at `""` for ever — a permanently disabled *Get a
   * code* on a form that looks complete, with a `<select>` showing a branch the state does not
   * hold. Deriving it means the default follows the data whenever the data arrives.
   */
  const [branchId, setBranchId] = useState("");
  const [deviceName, setDeviceName] = useState("");
  /** The minted code, held for exactly as long as this render tree lives. Never persisted. */
  const [minted, setMinted] = useState<{ code: string; device_name: string } | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const refreshLists = () => {
    void queryClient.invalidateQueries({ queryKey: trpc.devices.pairings.queryKey() });
    void queryClient.invalidateQueries({ queryKey: trpc.devices.list.queryKey() });
  };

  const mint = useMutation(
    trpc.devices.mintPairing.mutationOptions({
      onSuccess: (result, variables) => {
        setMinted({ code: result.code, device_name: variables.display_name });
        setTask(null);
        setDeviceName("");
        refreshLists();
      },
    }),
  );

  const cancel = useMutation(
    trpc.devices.cancelPairing.mutationOptions({
      onSuccess: () => {
        setCancelling(null);
        refreshLists();
      },
    }),
  );

  const branches = directory.data?.branches ?? [];
  /**
   * `14-F41`/`14-F33`: pre-selected from the list she was looking at. With one branch — the shape
   * of every pilot — there is nothing to choose and she is not asked to.
   */
  const chosenBranch = branchId !== "" ? branchId : (branches[0]?.branch_id ?? "");
  const now = Date.now();

  if (waiting.error !== null) {
    return (
      <Problem
        heading={strings.unreachable.heading}
        body={strings.unreachable.body}
        action={strings.unreachable.action}
        detail={waiting.error.message}
      >
        <Button
          type="button"
          variant="secondary"
          disabled={waiting.isFetching}
          onClick={() => void waiting.refetch()}
        >
          {waiting.isFetching ? strings.unreachable.retrying : strings.unreachable.retry}
        </Button>
      </Problem>
    );
  }

  const rows = waiting.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{strings.pairing.heading}</CardTitle>
      </CardHeader>
      <CardBody>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {strings.pairing.deviceSide}
        </p>

        {minted === null ? null : (
          <CodeCard
            code={minted.code}
            device_name={minted.device_name}
            onDone={() => setMinted(null)}
          />
        )}

        {mint.error !== null ? (
          <Note tone="fault">{`${strings.pairing.refused} ${mint.error.message}`}</Note>
        ) : null}
        {cancel.error !== null ? (
          <Note tone="fault">{`${strings.pairing.refused} ${cancel.error.message}`}</Note>
        ) : null}
        {/*
          `14-F41`: cancel is not revoke, and the two answers are two different sentences. A claim
          that landed between the render and the press leaves nothing to cancel, and the honest
          reply says the device is real now and that stopping it is the other, permanent act.
        */}
        {cancel.data?.cancelled === false ? (
          <Note tone="abnormal">{strings.pairing.cancelTooLate}</Note>
        ) : null}

        {task === null ? (
          <div className="flex flex-wrap gap-2">
            {TASKS.map((option) => (
              <Button
                key={option.device_class}
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setTask(option)}
              >
                <Plus aria-hidden="true" className="size-4" />
                {option.label}
              </Button>
            ))}
          </div>
        ) : (
          <form
            className="flex flex-col gap-4 rounded-md border border-border bg-muted p-4"
            onSubmit={(event) => {
              event.preventDefault();
              mint.mutate({
                branch_id: chosenBranch,
                device_class: task.device_class,
                display_name: deviceName,
              });
            }}
          >
            <p className="text-label text-foreground">{task.label}</p>
            {branches.length === 0 ? (
              /*
                `14-F37` — a disabled control explains nothing, so the prerequisite is a SENTENCE.
                `14-F41`'s form asks for a branch and a device cannot exist without one
                (`01-F64` binds the store to it at creation), so this is stated rather than
                enforced by a dead select.
              */
              <Note tone="abnormal">{strings.pairing.branchHelp}</Note>
            ) : (
              <Field
                label={strings.pairing.branchLabel}
                help={strings.pairing.branchHelp}
                htmlFor="pairing-branch"
              >
                <Select
                  id="pairing-branch"
                  aria-describedby={helpId("pairing-branch")}
                  value={chosenBranch}
                  onChange={(event) => setBranchId(event.target.value)}
                >
                  {branches.map((branch) => (
                    <option key={branch.branch_id} value={branch.branch_id}>
                      {branch.display_name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field
              label={strings.pairing.nameLabel}
              help={strings.pairing.nameHelp}
              htmlFor="pairing-name"
            >
              <Input
                id="pairing-name"
                aria-describedby={helpId("pairing-name")}
                placeholder={strings.pairing.namePlaceholder}
                value={deviceName}
                onChange={(event) => setDeviceName(event.target.value)}
              />
            </Field>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setTask(null);
                  setDeviceName("");
                }}
              >
                {strings.pairing.cancel}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={mint.isPending || deviceName.trim() === "" || chosenBranch === ""}
              >
                <KeyRound aria-hidden="true" className="size-4" />
                {mint.isPending ? strings.pairing.creating : strings.pairing.create}
              </Button>
            </div>
          </form>
        )}

        <div className="flex flex-col gap-2">
          <p className="text-label text-foreground">{strings.pairing.waitingHeading}</p>
          {rows.length === 0 ? (
            <p className="text-body text-muted-foreground">{strings.pairing.waitingEmpty}</p>
          ) : (
            <ul
              data-testid="waiting-pairings"
              className="flex flex-col overflow-hidden rounded-md border border-border-strong bg-muted"
            >
              {rows.map((row) => {
                const life = lifeOf(row.expires_at, now);
                /*
                  ⚠ **The re-issue control is offered only for a class this screen has a TASK for,
                  and that is the honest narrowing rather than a cast.** `PairingRecord.device_class`
                  crosses the wire as a string over `01-F39`'s whole vocabulary; `TASKS` names the
                  two `14 §9.14` decides this list offers. A row minted for some other class — by a
                  future task, or by the operator command — can still be CANCELLED here, and
                  re-issuing it belongs to whatever surface knows its words. Widening the cast
                  instead would put a class string in front of an owner the first time it went
                  wrong, which `14-F38` forbids.
                */
                const task = TASKS.find((option) => option.device_class === row.device_class);
                return (
                  <li
                    key={row.device_id}
                    className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-border p-4 last:border-b-0"
                  >
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="truncate text-body text-foreground">{row.display_name}</span>
                      <span className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                        <span className="truncate">
                          {`${strings.devices.branch} `}
                          <Named naming={places.branch(row.branch_id)} />
                        </span>
                        <span className="truncate">
                          {`${strings.pairing.waitingSince} ${formatInstant(row.minted_at)}`}
                        </span>
                      </span>
                    </div>
                    <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                      {/* `27-F12` — the WORD carries the state; the tone is emphasis on top. */}
                      <span
                        className={
                          life.expired
                            ? "text-label text-warning-fg"
                            : "text-label text-muted-foreground"
                        }
                      >
                        {life.text}
                      </span>
                      {cancelling === row.device_id ? (
                        <div className="flex max-w-sm flex-col items-start gap-3 rounded-md border border-border bg-card p-3 sm:items-end">
                          {/*
                            `14-F41`: the surface states WHICH SIDE OF THE LINE she is on before she
                            presses. This row has no claim on it, so the sentence is the safe one —
                            and the control that looks identical on a claimed device is
                            `14-F13`'s revoke, on the list above, which says the opposite.
                          */}
                          <p className="text-xs leading-relaxed text-muted-foreground sm:text-right">
                            {strings.pairing.cancelSafe}
                          </p>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setCancelling(null)}
                            >
                              {strings.devices.confirmNo}
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={cancel.isPending}
                              onClick={() => cancel.mutate({ device_id: row.device_id })}
                            >
                              {cancel.isPending
                                ? strings.pairing.cancelling
                                : strings.pairing.cancelCode}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setCancelling(row.device_id)}
                          >
                            {strings.pairing.cancelCode}
                          </Button>
                          {/*
                            `14-F41`: "a waiting row whose code is no longer on screen offers
                            *issue a new one*, and issuing replaces the old code so one waiting row
                            never has two live codes." Minting again for the same branch, class and
                            name is what this does; the previous row is cancelled first, so the
                            "never two live codes" property holds at the surface as well as at the
                            writer.
                          */}
                          {task === undefined ? null : (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={mint.isPending || cancel.isPending}
                              onClick={() => {
                                cancel.mutate(
                                  { device_id: row.device_id },
                                  {
                                    onSuccess: () => {
                                      mint.mutate({
                                        branch_id: row.branch_id,
                                        device_class: task.device_class,
                                        display_name: row.display_name,
                                      });
                                    },
                                  },
                                );
                              }}
                            >
                              {strings.pairing.reissue}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </CardBody>
    </Card>
  );
};
