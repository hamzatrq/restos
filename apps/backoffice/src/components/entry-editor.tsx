"use client";

/**
 * **B-6 — the catalog entry editor.** `14-F5`'s editing surface over the `01-F21` chain, carrying
 * `14-F29`'s price grid, `03-F50`'s station, `14-F28`'s timing and `14-F7`'s archive.
 *
 * **How this obeys Commandment 5, stated because the shape looks like a violation and is not.**
 * The editor seeds its fields from the entry the owner opened, which is server data. The
 * difference that matters is *seed* versus *sync*: the `useState` initialisers below run once, and
 * there is no `useEffect` anywhere in this app writing query data into state. What the component
 * holds is a DRAFT — keystrokes the server has never seen — which is an unsent request, not a copy
 * of server state. `commandment-5.test.ts` draws exactly that line and fails on the other side of
 * it.
 *
 * The remount is the parent's job: `catalog-screen.tsx` gives this component a `key` of the entry
 * being edited, so choosing a different item builds a new editor rather than reconciling one.
 * Without that key the initialisers would go stale and the seed WOULD have to become a sync.
 */

import type { OrderChannel } from "@restos/domain";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { type CatalogEntry, type EditReceipt, ENTRY_KINDS } from "../lib/catalog-types";
import { isWholeRupees, rupeeTextFromPaisa } from "../lib/money";
import {
  cellKey,
  draftFromPrices,
  type EnabledPairs,
  emptyDraft,
  fillAcross,
  type GridDraft,
  type GridFault,
  needsPrices,
  resolveGrid,
} from "../lib/price-grid";
import { strings } from "../lib/strings";
import { refusalMessage, useTRPC } from "../lib/trpc";
import { type ApplyWhen, ApplyWhenControl, DEFAULT_APPLY_WHEN } from "./apply-when";
import { ChangeHistory } from "./change-history";
import { PriceGrid } from "./price-grid";
import { Button } from "./ui/button";
import { Field, Input } from "./ui/field";
import { Card, CardBody, CardHeader, CardTitle, Note } from "./ui/surface";

/** The text fields, as typed. Nothing here is a number until save — see `lib/money.ts`. */
type Form = {
  kind: string;
  id: string;
  name: string;
  kitchen_name: string;
  parent_id: string;
  sort: string;
  station: string;
};

const formOf = (entry: CatalogEntry | null): Form => ({
  kind: entry?.kind ?? "item",
  id: entry?.id ?? "",
  name: entry?.name ?? "",
  kitchen_name: entry?.kitchen_name ?? "",
  parent_id: entry?.parent_id ?? "",
  sort: entry?.sort === undefined ? "" : String(entry.sort),
  station: entry?.station ?? "",
});

/**
 * A cell's rupee text, or `null` when the stored paisa cannot round-trip through whole rupees.
 * `draftFromPrices` leaves those cells EMPTY, which makes the owner retype the number rather than
 * silently saving a truncated one — see `money.ts`'s `isWholeRupees`.
 */
const cellText = (price_paisa: number): string | null =>
  isWholeRupees(price_paisa) ? rupeeTextFromPaisa(price_paisa) : null;

/** `""` means "not set" for every optional field; the wire wants `null`, not an empty string. */
const orNull = (text: string): string | null => (text.trim() === "" ? null : text.trim());

export const EntryEditor = ({
  initial,
  enabled,
  onSaved,
}: {
  initial: CatalogEntry | null;
  enabled: EnabledPairs;
  onSaved: () => void;
}): ReactNode => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // SEEDED ONCE, never synced. The parent remounts this component per entry (see the header).
  const [form, setForm] = useState<Form>(() => formOf(initial));
  const [draft, setDraft] = useState<GridDraft>(() =>
    initial === null
      ? emptyDraft(enabled)
      : draftFromPrices(enabled, initial.prices ?? [], cellText),
  );
  const [applyWhen, setApplyWhen] = useState<ApplyWhen>(DEFAULT_APPLY_WHEN);
  const [faults, setFaults] = useState<readonly GridFault[]>([]);
  const [receipt, setReceipt] = useState<EditReceipt | null>(null);

  const archived = initial?.deleted === true;

  const invalidate = (): void => {
    // Both axes, because a save moves one or the other and the screen shows both.
    void queryClient.invalidateQueries({ queryKey: trpc.catalog.published.queryKey() });
    void queryClient.invalidateQueries({ queryKey: trpc.catalog.pending.queryKey() });
    void queryClient.invalidateQueries({ queryKey: trpc.catalog.history.queryKey() });
  };

  const save = useMutation(
    trpc.catalog.save.mutationOptions({
      onSuccess: (data) => {
        setReceipt(data);
        invalidate();
        onSaved();
      },
    }),
  );

  const archive = useMutation(
    trpc.catalog.archive.mutationOptions({
      onSuccess: (data) => {
        setReceipt(data);
        invalidate();
        onSaved();
      },
    }),
  );

  const set = (field: keyof Form, value: string): void =>
    setForm((current) => ({ ...current, [field]: value }));

  const onCellChange = (branch_id: string, channel: OrderChannel, text: string): void =>
    setDraft((current) => ({ ...current, [cellKey(branch_id, channel)]: text }));

  const onSubmit = (): void => {
    setReceipt(null);

    // `01-F60`, refused HERE — at the point of the mistake rather than at publish. A category is
    // priced by nothing, and a tombstone is exempt for `01-F55`'s reason.
    const priced = needsPrices(form.kind, archived);
    const resolution = priced ? resolveGrid(enabled, draft) : ({ ok: true, prices: [] } as const);
    if (!resolution.ok) {
      setFaults(resolution.faults);
      return;
    }
    setFaults([]);

    const sort = form.sort.trim();
    save.mutate({
      entry: {
        kind: form.kind,
        id: form.id.trim(),
        name: form.name.trim(),
        kitchen_name: orNull(form.kitchen_name),
        parent_id: orNull(form.parent_id),
        ...(sort === "" ? {} : { sort: Number(sort) }),
        // `03-F50` — absence is INHERITANCE, not "no station", so a blank field sends `null`.
        station: orNull(form.station),
        // Copied into a mutable array because the wire schema's inferred input is mutable; the
        // resolution stays `readonly` so nothing downstream can edit a resolved price in place.
        ...(priced ? { prices: [...resolution.prices] } : {}),
        ...(archived ? { deleted: true } : {}),
      },
      apply_when: applyWhen,
    });
  };

  const refusal = refusalMessage(save.error) ?? refusalMessage(archive.error);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{initial === null ? strings.catalog.newEntry : initial.name}</CardTitle>
        {archived ? (
          <p className="text-xs text-muted-foreground">{strings.catalog.archived}</p>
        ) : null}
      </CardHeader>
      <CardBody>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={strings.catalog.kind} htmlFor="kind">
            <select
              id="kind"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={form.kind}
              onChange={(event) => set("kind", event.target.value)}
            >
              {ENTRY_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
          </Field>
          <Field label="ID" htmlFor="id">
            <Input
              id="id"
              value={form.id}
              readOnly={initial !== null}
              onChange={(event) => set("id", event.target.value)}
            />
          </Field>
          <Field label={strings.catalog.name} htmlFor="name">
            <Input
              id="name"
              value={form.name}
              onChange={(event) => set("name", event.target.value)}
            />
          </Field>
          <Field label={strings.catalog.kitchenName} htmlFor="kitchen_name">
            <Input
              id="kitchen_name"
              value={form.kitchen_name}
              onChange={(event) => set("kitchen_name", event.target.value)}
            />
          </Field>
          <Field label={strings.catalog.parent} htmlFor="parent_id">
            <Input
              id="parent_id"
              value={form.parent_id}
              onChange={(event) => set("parent_id", event.target.value)}
            />
          </Field>
          <Field label={strings.catalog.sort} htmlFor="sort">
            <Input
              id="sort"
              inputMode="numeric"
              value={form.sort}
              onChange={(event) => set("sort", event.target.value)}
            />
          </Field>
          <Field
            label={strings.catalog.station}
            help={strings.catalog.stationHelp}
            htmlFor="station"
          >
            <Input
              id="station"
              value={form.station}
              onChange={(event) => set("station", event.target.value)}
            />
          </Field>
        </div>

        {needsPrices(form.kind, archived) ? (
          <PriceGrid
            enabled={enabled}
            draft={draft}
            faults={faults}
            onCellChange={onCellChange}
            onFillAcross={(text) => setDraft(fillAcross(enabled, text))}
          />
        ) : null}

        <ApplyWhenControl value={applyWhen} onChange={setApplyWhen} />

        {refusal === null ? null : (
          <Note tone="fault">{`${strings.errors.saveRefused} ${refusal}`}</Note>
        )}
        {receipt === null ? null : (
          <Note tone="neutral">
            {receipt.apply_when === "now"
              ? `${strings.timing.now} · ${strings.history.version} ${receipt.version ?? "—"}`
              : `${strings.timing.landsAt} ${new Date(receipt.lands_at).toLocaleString("en-US", { hour12: false })}`}
          </Note>
        )}

        <div className="flex items-center gap-2">
          <Button type="button" onClick={onSubmit} disabled={save.isPending}>
            {save.isPending ? strings.catalog.saving : strings.catalog.save}
          </Button>
          {initial === null || archived ? null : (
            <Button
              type="button"
              variant="destructive"
              disabled={archive.isPending}
              onClick={() =>
                archive.mutate({ kind: initial.kind, id: initial.id, apply_when: applyWhen })
              }
            >
              {strings.catalog.archive}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{strings.catalog.archiveHelp}</p>

        {initial === null ? null : (
          <section className="flex flex-col gap-2 border-t border-border pt-4">
            <h3 className="text-sm font-semibold">{strings.history.heading}</h3>
            <ChangeHistory entity={initial.kind} entity_id={initial.id} />
          </section>
        )}
      </CardBody>
    </Card>
  );
};
