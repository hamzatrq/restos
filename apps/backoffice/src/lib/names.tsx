"use client";

/**
 * **`21-F15` — THE NAMING LAW, DECLARED ONCE FOR THE WHOLE CLOUD PLANE.**
 *
 * The law: *"no surface renders a machine identifier where the product knows a name — and where it
 * knows none, that is a MISSING FIELD, not a rendering problem."* A name slot renders the record's
 * name (`01-F68` org, `01-F69` branch, `11-F20` person); where the record has no name the slot
 * renders a **stated** treatment saying what is missing and where it is set (`00 §5.7`); it never
 * renders the identifier as though it were the name and it is never blank.
 *
 * **WHY A MODULE AND NOT A `??` AT EACH SITE.** Measured before this landed, the back office had
 * **fourteen** name slots holding a raw key — the header's org and user, the menu's price-column
 * heading, the price grid's row headers and its screen-reader labels, the editor's incomplete-pair
 * refusal, the change log's moved cells, the pending-edit's author, the summary's branch selector,
 * its cashier, its correction actor and its approver, and the device list's branch and revoking
 * actor. Fourteen sites each inventing a fallback is fourteen treatments that drift, and
 * `21-F15`'s counterpart clause is explicit that *"every unnamed treatment site is enumerated: the
 * count is a visible debt that shrinks, and adding one is a deliberate act with a reason"*. A debt
 * you cannot count is not a debt you can pay. So: one vocabulary, one component, one enumeration.
 *
 * **THE SERVER ALREADY SERVED ALL OF IT AND NOTHING READ IT — this is the wave's named defect on a
 * READ path.** `tenancy.directory` (`01-F68` + `01-F69`, gated `report.sales_view`), `users.list`
 * (`11-F20`, gated `user.manage`) and `session.whoami`'s `display_name` all shipped, all correct,
 * all tested; exactly ONE screen consumed any of them. No second procedure is added here and none
 * is needed — this module is the missing *seam*, not a missing capability.
 *
 * **THREE STATES, NOT TWO, AND THE THIRD IS THE HONEST ONE.** A slot is `named`; or it is `unnamed`
 * — the directory answered and holds no name, which is `01-F68`'s UNNAMED org and a real, ordinary
 * state today; or it is `unknown` — we could not ask at all, because the read is still in flight or
 * the matrix refused it. Collapsing `unknown` into `unnamed` would make this screen *claim* a
 * restaurant has no name because a query 401'd, which is the exact class of lie `00 §5.7` bans and
 * the reason a value's SOURCE travels with it there. The two treatments differ in words, so the
 * surface says which one it is showing.
 *
 * **COMMANDMENT 5.** Everything here is tRPC + TanStack Query. There is no `sync-client` read, no
 * client store, and no query answer is copied into `useState` — the resolvers below are derived on
 * every render from `query.data`, which is what `plane-scan.ts` exists to keep true.
 */

import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { strings } from "./strings";
import { useTRPC } from "./trpc";

/**
 * The record kinds `21-F15` names: *"the record's name (`01-F68` org, `01-F69` branch, `01-F70`
 * device, `11-F20` person)"*. All four, because a kind left out of this union is a slot with no
 * treatment, which is where a raw key gets in.
 */
export type NameKind = "org" | "branch" | "device" | "person";

/**
 * One resolved name slot.
 *
 * `id` rides on every state including `named`, because a caller may want the technical id beside a
 * name under exception (b) — and because a state that dropped it could not be widened later
 * without touching every site.
 */
export type Naming =
  | { readonly state: "named"; readonly kind: NameKind; readonly id: string; readonly name: string }
  | { readonly state: "unnamed"; readonly kind: NameKind; readonly id: string }
  | { readonly state: "unknown"; readonly kind: NameKind; readonly id: string };

/**
 * **THE ENUMERATION `21-F15` REQUIRES.** One entry per treatment word, with the record whose
 * missing field is the actual fix. It is exported so a test can assert the set rather than a
 * reviewer remembering it, and so that adding a fifteenth slot is a diff somebody reads.
 */
export const TREATMENTS: Readonly<
  Record<
    NameKind,
    { readonly unnamed: string; readonly unknown: string; readonly reference: string }
  >
> = {
  org: {
    unnamed: strings.names.orgUnnamed,
    unknown: strings.names.orgUnknown,
    reference: strings.names.orgReference,
  },
  branch: {
    unnamed: strings.names.branchUnnamed,
    unknown: strings.names.branchUnknown,
    reference: strings.names.branchReference,
  },
  device: {
    unnamed: strings.names.deviceUnnamed,
    unknown: strings.names.deviceUnknown,
    reference: strings.names.deviceReference,
  },
  person: {
    unnamed: strings.names.personUnnamed,
    unknown: strings.names.personUnknown,
    reference: strings.names.personReference,
  },
};

/**
 * **A name is a non-empty name or it is not a name** (`01-F68`, `01-F69`, `11-F20` all say
 * *"required, non-empty"*). A `""` or a run of spaces reaching a slot would render as a blank, and
 * `21-F15` calls a blank *"the same lie with less information"* — so the emptiness test is
 * whitespace-insensitive while the VALUE is rendered byte-for-byte.
 *
 * ⚠ **Trimmed to TEST, never to RENDER** (commandment 7). User content is Unicode and renders
 * faithfully: an Urdu name, a name with combining marks, a name whose glyphs this file cannot
 * display must reach the glass exactly as the owner typed it. Normalising it here would be this
 * app quietly editing a restaurant's own name.
 */
const isName = (candidate: string | null | undefined): candidate is string =>
  typeof candidate === "string" && candidate.trim() !== "";

/**
 * The one place a name becomes a `Naming`. `answered` is whether the directory that would hold it
 * has replied at all — false means `unknown`, and it is a separate argument from the name itself
 * precisely so the two absences cannot be confused at a call site.
 */
const resolve = (
  kind: NameKind,
  id: string,
  answered: boolean,
  candidate: string | null | undefined,
): Naming =>
  !answered
    ? { state: "unknown", kind, id }
    : isName(candidate)
      ? { state: "named", kind, id, name: candidate }
      : { state: "unnamed", kind, id };

/**
 * A `Naming` for a record whose name the caller ALREADY holds on the row in front of it — today
 * `session.whoami`'s own `display_name` (`11-F20`) and `devices.list`'s (`01-F70`).
 *
 * It is `answered` by construction: the read that carried the id carried the name with it, so an
 * absent name here is a genuine `unnamed` and never an unasked question. That distinction is the
 * whole reason `resolve` takes the two as separate arguments — a helper that guessed would collapse
 * the two absences the module exists to keep apart.
 */
export const namingFrom = (
  kind: NameKind,
  id: string,
  display_name: string | null | undefined,
): Naming => resolve(kind, id, true, display_name);

/**
 * `21-F15` exception (b) — *"a secondary, explicitly labelled technical id offered for support
 * beside a name"*. The label is never optional: a bare key with a label somewhere near it is the
 * shape the law exists to stop.
 */
export const referenceText = (naming: Naming): string =>
  `${TREATMENTS[naming.kind].reference} ${naming.id}`;

/**
 * The flat form, for the places a second element cannot go — an `<option>`, an `aria-label`, a
 * `<title>`. Identical in text to what `<Named>` renders, which `naming-law.dom.test.tsx` asserts
 * rather than assumes: two spellings of one treatment is how the vocabulary drifts.
 */
export const nameText = (naming: Naming): string =>
  naming.state === "named"
    ? naming.name
    : `${TREATMENTS[naming.kind][naming.state]} · ${referenceText(naming)}`;

/**
 * **`21-F15` exception (b) as a DECLARED SLOT** — *"a secondary, explicitly labelled technical id
 * offered for support beside a name"*.
 *
 * Two things it does that a `<span>` with a template string does not. It makes the label
 * structurally inseparable from the value, so a key can never end up on the glass with its label
 * left behind in a refactor; and it carries `data-technical-id`, which is what makes the FR's own
 * check mechanical — *"a node whose text matches the identifier shape and is not inside a
 * component declared a technical-id slot is a violation"*. `naming-law.dom.test.tsx` is that sweep,
 * and this attribute is the declaration it reads.
 *
 * ⚠ **It is also the slot for records the product has no NAME for at all** — a shift, a menu entry,
 * a device. `21-F15`'s named records are the org, the branch, the device and the person; a shift id
 * is an *entity* id with no name record anywhere in the corpus, so there is nothing to resolve it
 * to and inventing one would be inventing policy. What the law still requires of it is that it is
 * labelled and that it never occupies a name slot alone.
 */
export const TechnicalId = ({
  label,
  id,
}: {
  readonly label: string;
  readonly id: string;
}): ReactNode => (
  <span data-technical-id="" className="text-xs text-muted-foreground">
    {`${label} ${id}`}
  </span>
);

/**
 * A name slot, rendered.
 *
 * The name occupies the slot alone when the product knows it. When it does not, the STATED
 * treatment occupies the slot and the key follows it demoted and labelled — never promoted into
 * the slot, never dropped, so two unnamed branches stay tellable apart under exception (b).
 */
export const Named = ({
  naming,
  reference = true,
}: {
  readonly naming: Naming;
  /**
   * Whether the demoted key follows the treatment **here**. Pass `false` only where the row renders
   * `<Reference>` of its own somewhere else — the device list does, because a till's key is what an
   * operator quotes to support and it must survive the day the till gets a name. Passing `false`
   * with no `<Reference>` anywhere on the row would drop the only thing telling two unnamed records
   * apart, so the sweep in `naming-law.dom.test.tsx` is what stops that being silent.
   */
  readonly reference?: boolean;
}): ReactNode =>
  naming.state === "named" ? (
    <>{naming.name}</>
  ) : (
    <>
      {TREATMENTS[naming.kind][naming.state]}
      {reference ? (
        <>
          {" "}
          <TechnicalId label={`· ${TREATMENTS[naming.kind].reference}`} id={naming.id} />
        </>
      ) : null}
    </>
  );

/**
 * The labelled key on its own — exception (b) where a row wants it beside a name it HAS, not only
 * as part of a treatment for a name it lacks.
 */
export const Reference = ({ naming }: { readonly naming: Naming }): ReactNode => (
  <TechnicalId label={TREATMENTS[naming.kind].reference} id={naming.id} />
);

/**
 * `21-F15`'s counterpart half — *"an unnamed record is a missing field upstream, so the fix is the
 * required field on the record, never a prettier fallback"*. It renders only while something on
 * the screen is actually standing on the treatment, on `staff-screen.tsx`'s established rule that
 * an absence stated when there is no absence is its own dishonesty.
 *
 * `unknown` gets no sentence: its own treatment already says the name could not be read, and there
 * is no upstream field for an owner to go and fill in.
 */
export const NameDebt = ({ namings }: { readonly namings: readonly Naming[] }): ReactNode =>
  namings.some((naming) => naming.state === "unnamed") ? (
    <p className="text-xs leading-relaxed text-muted-foreground">{strings.names.owed}</p>
  ) : null;

/** The org and its branches (`01-F68`, `01-F69`). */
export type PlaceNames = {
  readonly org: (org_id: string) => Naming;
  readonly branch: (branch_id: string) => Naming;
};

/** The people (`11-F20`). */
export type PeopleNames = {
  readonly person: (user_id: string) => Naming;
};

/**
 * `tenancy.directory`, as names.
 *
 * **The query is the one that already exists.** It answers `{ org, branches }` in one read, gated
 * on `report.sales_view` and narrowed by `reportScope` — a branch manager is offered her own
 * branch, an owner the estate — so a branch this subject may not report on resolves `unnamed`
 * rather than leaking a name from outside her reach.
 *
 * **A refusal is not an error here and is deliberately not surfaced as one.** Names decorate
 * screens whose own reads are gated on other actions; a 403 on this one must never take a screen
 * down that the matrix said yes to. It degrades to `unknown`, which says so.
 */
export const usePlaceNames = (): PlaceNames => {
  const trpc = useTRPC();
  const directory = useQuery(trpc.tenancy.directory.queryOptions(undefined, { retry: false }));
  const answered = directory.data !== undefined;
  const org = directory.data?.org ?? null;
  const branches = new Map(
    (directory.data?.branches ?? []).map((branch) => [branch.branch_id, branch.display_name]),
  );

  return {
    // The org row is answered for the caller's own org and no other, so the id is not looked up —
    // it is the subject's, and `whoami` is where it came from.
    org: (org_id) => resolve("org", org_id, answered, org?.display_name),
    branch: (branch_id) => resolve("branch", branch_id, answered, branches.get(branch_id)),
  };
};

/**
 * `users.list`, as names — `11-F20`'s *"an event carries the id; the roster resolves the word"*,
 * which is why this is a render-time lookup and not a field anybody writes into an event.
 *
 * **Every person the roster has ever named resolves, including a departed one.** `11-F22` is
 * explicit that participation *"decides nothing about rendering"* and that a let-go cashier's name
 * still renders on last month's orders — so nothing here filters on status, and a test says so.
 *
 * ⚠ **Gated on `user.manage` (owner-only, `14-F39`) while its callers are gated on other actions.**
 * That mismatch is unreachable today — the back office is owner-only in practice — and it is named
 * rather than branched on, exactly as `staff-screen.tsx` names it. A subject who could read the
 * summary but not the roster gets `unknown` on every cashier, which is true and legible.
 */
export const usePeopleNames = (): PeopleNames => {
  const trpc = useTRPC();
  const roster = useQuery(trpc.users.list.queryOptions(undefined, { retry: false }));
  const answered = roster.data !== undefined;
  const people = new Map(
    (roster.data ?? []).map((person) => [person.user_id, person.display_name]),
  );

  return {
    person: (user_id) => resolve("person", user_id, answered, people.get(user_id)),
  };
};
