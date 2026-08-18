"use client";

/**
 * **`14-F14` as a surface an owner operates — the back office's fourth section.**
 *
 * *"User CRUD with role × per-location assignment; per-user permission overrides within matrix
 * bounds; PIN set/reset (never displayed; Argon2id per `00 §5.4`); deactivation preserves
 * historical attribution."*
 *
 * **Three of those five are here whole, one is here in half, and one is not here at all** — stated
 * this way because the sentence that stood here said *"four of those five"* and counted the U of
 * CRUD as landed:
 *
 *   · **C, the assignment, the PIN and the deactivation** are here.
 *   · **U is NOT.** There is no rename and no email correction anywhere in this product — the four
 *     procedures behind this screen are `create`, `setAssignments`, `setPin` and `deactivate`, and
 *     none of them takes a `display_name`. With `11-F20` never deleting a person, a mistyped name
 *     renders on every order she ever rings, for ever. Closing it needs a procedure, its
 *     `user.changed` act and a task on this surface, so it is a spec-and-server change rather than
 *     a control that could be added here — and until then `00 §5.7` decides what this screen owes
 *     an owner, which is to SAY SO before she presses the control (`strings.staff.nameFixOwed`).
 *   · **The per-user permission overrides are not here**, and that is `14-F14`'s own gap rather
 *     than this screen's — nothing in this product models one and no FR states their shape, so a
 *     control for them would be inventing policy (commandment 2).
 *
 * **`14-F32` DECIDES THE SHAPE AND IT IS THE WHOLE DESIGN.** The founder read the shipped catalog
 * editor — a form shaped like its storage model — and said *"this is very complex interface. What
 * even is this. this is so hard to use. I cant understand a single thing."* The job this screen
 * exists for is **"put Nadia on the till at Gulberg and give her a PIN"**, so there is no control
 * for a user id, a grid position, a participation state or an assignment set as a structure. What
 * an owner answers is: what is she called, what does she do, where, and what does she tap to sign
 * in. Everything else on `PersonListing` is the writer's (`01-F61`'s explicit ordinal, `11-F22`'s
 * status) and is rendered as a FACT or not at all.
 *
 * **Commandment 5 — this is a cloud screen.** TanStack Query v5 + tRPC, no `sync-client`, no client
 * store, and no query result copied into state. The three pieces of local state are intents: which
 * task is open, which row is being edited, which departure is armed.
 *
 * **Commandment 8 — nothing here decides what the caller may do**, which is `auth-gate.tsx`'s own
 * recorded law for this app. `14-F39` makes `user.manage` owner-only and the API refuses at boot to
 * host an ungated procedure; so this screen ASKS, and renders the refusal that comes back. It reads
 * no role, computes no permission and hides no control by rank — a client that hid itself from a
 * non-owner would be trusting a client role claim to do it, which is the failure commandment 8
 * names.
 *
 * ── WHAT THIS SCREEN DELIBERATELY DOES NOT SAY ─────────────────────────────────────────────────
 *
 *   · **No distribution figure** (`14-F4`, `00 §5.7`). No procedure on this plane can answer *"live
 *     on 4 of 5 tills"* for a roster, and `packages/sync-protocol` carries no staff message at all.
 *     `strings.staff.tillsOwed` states the absence instead — the device list's precedent, where
 *     three columns the FR asks for are named as missing rather than guessed at.
 *   · **No attribution and no history** (`14-F3`, `14-F15`). `users.list` carries no actor and no
 *     instant, and `user.changed` rows exist in the org-scoped store with no procedure serving
 *     them. A plausible *"changed by …"* line would be indistinguishable from a real one on a demo
 *     and wrong every day after.
 *   · **No re-activation.** There is no procedure, and R32 makes it a two-step act whose second
 *     half is a device unlock-flow behaviour this surface cannot supply. A disabled or hopeful
 *     control would imply one exists behind a condition — the same reason `device-list.tsx` offers
 *     nothing at all on a revoked row.
 *   · **No rename and no email correction** — see the U above. It is stated on the glass, not only
 *     here, because an owner cannot read this file.
 *   · **No change-my-PIN path.** `14-F40` puts that on the TILL and blocks it on a wire message
 *     that does not exist yet. An owner set/reset is `14-F14`'s and both halves are here — the set
 *     rides the hire, the reset is a task on the row. ⚠ **That sentence used to claim the reset was
 *     here while only the set was**, which is the shape this repo keeps recording: a protection
 *     claimed in prose retires the assertion the next session would otherwise write.
 *
 * ── ⚠ `21-F15` — THE UNNAMED TREATMENT SITES ON THIS SCREEN, ENUMERATED ────────────────────────
 *
 * The FR requires the enumeration itself: *"every unnamed treatment site is enumerated: the count
 * is a visible debt that shrinks, and adding one is a deliberate act with a reason."*
 *
 * **ONE site: the BRANCH name slot, reached from `placeName` and rendered in four places** — the
 * assignment line on a row, the deactivation control's own name, the consequence sentence read
 * before that control's second press, and the `Job at …` label inside the assignment editor. It is
 * one site because it is one function; four call sites of one treatment is not four debts.
 *
 * **The debt is `01-F69`, upstream, and it is the whole of the deployment**: nothing writes the
 * branch directory in any deployment today, so `tenancy.directory` answers `[]` for every real
 * tenant and this treatment is what every branch on this screen reads. It shrinks to zero the day
 * that table gets a writer, and this screen changes not at all when it does.
 *
 * ⚠ **THIS FILE ARGUED THE OTHER WAY AND THE ARGUMENT WAS WRONG IN A WAY WORTH KEEPING.** The
 * `placeName` comment below used to say the fallback was *"the identifier rather than a sentence"*
 * because an owner with two branches has to tell one departure from the other, and *"unnamed
 * branch" twice on one row cannot*. **The concern is real and the conclusion was still an FR
 * overruled in a comment** (commandments 2 and 9): `21-F15` answers it in advance with exception
 * (b) — a secondary, explicitly LABELLED technical id offered for support **beside** the name,
 * which may never occupy the name slot. That is what ships now, and it is this app's own
 * twice-shipped shape (`Problem`'s demoted `Technical detail`, the pending row's demoted identity).
 *
 * ── ⚠ WHAT THIS SCREEN DOES THAT NO ORACLE HERE ASSERTS ────────────────────────────────────────
 *
 * `14-F14`'s **PIN reset on a row** is not driven by `staff-screen.dom.test.tsx` — that suite was
 * authored from spec text before this control existed and is read-only to this session (`24 §3`).
 * The reset is built because `14-F14` names it, because `services/api`'s own act for it is called
 * `pin_reset`, and because it is the only way out of the partial hire below once that task is
 * closed. **It is a finding for that file's session, cited here rather than hidden**: what is
 * untested is the row task's own commit path, not the procedure behind it.
 *
 * ── ⚠ LAYOUT, WHICH NO GATE IN THIS REPO CAN SEE ───────────────────────────────────────────────
 *
 * `pnpm layout:check` runs `apps/pos-electron` and `apps/pass-kds` only, so **this app has no
 * layout gate at any width**, and happy-dom performs no layout — every `getBoundingClientRect` is
 * zeroes, so a clipped control and a reachable one are the same DOM. Nine layout defects in this
 * repo were each found by launching an app or by the gate built from that habit and **zero** by a
 * suite, so the composition below is defensive by construction rather than by measurement:
 *
 *   · **The armed confirmation is `w-full` inside its `flex-wrap` row and carries NO `max-w-*`.**
 *     The concrete hazard is `device-list.tsx`'s shape one section over: a `max-w-sm` armed block
 *     sitting as the third item of a wrapping row is squeezed into a narrow column on a small
 *     panel, and its own confirm control is pushed below the fold while every assertion stays
 *     green. A `w-full` child forces its own line in a wrapping flex row at every width, so the
 *     consequence and the two controls are always the full width of the card and never a column
 *     beside something else.
 *   · **Every control row is `flex-wrap`**, so a long branch name or a long person's name pushes
 *     the controls onto the next line instead of off the card.
 *   · **Nothing is `truncate`d that a decision depends on.** A branch name inside a deactivation
 *     control is what tells an owner WHICH departure she is confirming (`11-F22` makes the act
 *     per-(person, place)), so it wraps rather than being clipped to an ellipsis.
 */

import { ROLES, type Role } from "@restos/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, UserPlus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { strings } from "../lib/strings";
import { isForbidden, useTRPC } from "../lib/trpc";
import { Button } from "./ui/button";
import { Field, helpId, Input, Select } from "./ui/field";
import { Card, CardBody, CardHeader, CardTitle, Note, Problem } from "./ui/surface";

/** `01-F26`'s pair as this screen holds it while the owner is still typing — never a status. */
type AssignmentDraft = { readonly role: string; readonly branch_id: string | null };

/** One person as `users.list` serves her. Read where it is needed, never copied into state. */
type Person = {
  readonly user_id: string;
  readonly display_name: string;
  readonly email: string | null;
  readonly assignments: readonly {
    readonly role: string;
    readonly branch_id: string | null;
    readonly status: string;
  }[];
};

/**
 * `14-F38` — the internal role tokens are vendor vocabulary and never render. `Record<Role, …>` is
 * exhaustive on purpose, following `packages/domain`'s own comment on the matrix: a fifth column in
 * `ROLES` will not compile until it has an owner-facing name here.
 */
const ROLE_LABELS: Record<Role, string> = {
  cashier: strings.staff.roles.cashier,
  branch_manager: strings.staff.roles.branchManager,
  storekeeper: strings.staff.roles.storekeeper,
  owner: strings.staff.roles.owner,
};

/**
 * The `?? role` tail is unreachable through the shipped writer — the gateway parses every stored
 * assignment through a schema closed at `ROLES` — and it is here because the wire types the field
 * as a string. It is a type obligation, not a safeguard, and it is deliberately not dressed as one.
 */
const roleLabel = (role: string): string => ROLE_LABELS[role as Role] ?? role;

/**
 * `21-F15` exception (b) — the branch's key, DEMOTED beside the treatment and never in its place.
 *
 * The label and the value are ONE element's own words on purpose: the exception's condition is
 * that the id is *explicitly labelled*, and a bare key with a label somewhere near it is the shape
 * the law exists to stop. It renders only where the directory has no name, so it disappears
 * entirely the day `01-F69` gets a writer — the debt is visible while it exists and gone when it
 * does not.
 */
const BranchReference = ({ branch_id }: { readonly branch_id: string }): ReactNode => (
  <span className="text-xs text-muted-foreground">
    {`${strings.staff.branchReference} ${branch_id}`}
  </span>
);

/**
 * `14-F14`'s create task, as the job rather than as the record (`14-F32`).
 *
 * The draft is seeded once and never synced — the legal pattern this app already uses and the one
 * `two-plane.test.ts` distinguishes from the Commandment 5 violation. Nothing here is server state:
 * it is a request the owner has not sent yet.
 */
const HireTask = ({
  branches,
  busy,
  partial,
  refusal,
  onCancel,
  onHire,
}: {
  readonly branches: readonly { readonly branch_id: string; readonly display_name: string }[];
  readonly busy: boolean;
  /**
   * The person EXISTS on the server and holds no credential — the instant between the hire's two
   * writes, which is a state and not an error. See `hire` below for why it is carried at all.
   */
  readonly partial: boolean;
  readonly refusal: string | null;
  readonly onCancel: () => void;
  readonly onHire: (
    person: {
      readonly display_name: string;
      readonly email: string | null;
      readonly assignments: AssignmentDraft[];
    },
    pin: string,
  ) => void;
}): ReactNode => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [branch, setBranch] = useState("");
  const [pin, setPin] = useState("");
  const [missing, setMissing] = useState<readonly string[]>([]);

  /**
   * `14-F37`'s rule, applied to a hire: **the commit control is not disabled**, and on press it
   * names everything that is missing. A disabled button explains nothing, and the gap that matters
   * most here is the PIN — `11-F23`/R32 require the skipped second step to fail LEGIBLY, because an
   * active person with no credential row is a tile that cannot be unlocked, which is `01-F17`'s
   * stopped till arriving through the identity path.
   */
  const submit = (): void => {
    const gaps: string[] = [];
    if (name.trim() === "") gaps.push(strings.staff.needName);
    if (role === "") gaps.push(strings.staff.needRole);
    if (branch === "") gaps.push(strings.staff.needBranch);
    if (pin.trim() === "") gaps.push(strings.staff.needPin);
    setMissing(gaps);
    if (gaps.length > 0) return;
    onHire(
      {
        display_name: name.trim(),
        // R30 — an absent address travels as `null`. `""` is an invented address rather than an
        // absent one, and the router's schema refuses it for exactly that reason.
        email: email.trim() === "" ? null : email.trim(),
        // `11-F22` makes participation the WRITER's, so no status is stated here; `01-F61`'s
        // ordinal and the id come BACK from the create and are never sent to it (`14-F33`).
        assignments: [{ role, branch_id: branch }],
      },
      pin.trim(),
    );
  };

  return (
    <div className="flex w-full flex-col gap-5 rounded-md border border-border-strong bg-muted p-4">
      {/*
        The four identity fields are DISABLED once the person exists (`partial`), because they are
        already committed and there is no procedure that would carry a change to any of them — an
        owner who retyped the name here and pressed save would be told nothing and would get
        nothing. `00 §5.7`: a control that cannot do what it looks like it does is a claim.
      */}
      <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
        <Field label={strings.staff.name} help={strings.staff.nameHelp} htmlFor="staff-name">
          <Input
            id="staff-name"
            aria-describedby={helpId("staff-name")}
            disabled={partial}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Field label={strings.staff.email} help={strings.staff.emailHelp} htmlFor="staff-email">
          <Input
            id="staff-email"
            type="email"
            aria-describedby={helpId("staff-email")}
            disabled={partial}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        <Field label={strings.staff.role} help={strings.staff.roleHelp} htmlFor="staff-role">
          <Select
            id="staff-role"
            aria-describedby={helpId("staff-role")}
            disabled={partial}
            value={role}
            onChange={(event) => setRole(event.target.value)}
          >
            <option value="">{strings.staff.chooseOne}</option>
            {ROLES.map((candidate) => (
              <option key={candidate} value={candidate}>
                {ROLE_LABELS[candidate]}
              </option>
            ))}
          </Select>
        </Field>

        {/*
          `21-F15` — the branch is chosen by NAME, from the branches the SERVER named, and never
          typed. There is no org-wide option: `01-F26`'s `branch_id: null` is how an owner holds
          everything, and offering it beside two branches would let a hire mean that by accident.
          With no branch in the directory the control offers nothing and the help says who can fix
          it (`14-F38`), rather than this screen inventing a place the business does not have.
        */}
        <Field
          label={strings.staff.branch}
          help={branches.length === 0 ? strings.staff.branchEmpty : strings.staff.branchHelp}
          htmlFor="staff-branch"
        >
          <Select
            id="staff-branch"
            aria-describedby={helpId("staff-branch")}
            disabled={partial}
            value={branch}
            onChange={(event) => setBranch(event.target.value)}
          >
            <option value="">{strings.staff.chooseOne}</option>
            {branches.map((candidate) => (
              <option key={candidate.branch_id} value={candidate.branch_id}>
                {candidate.display_name}
              </option>
            ))}
          </Select>
        </Field>

        {/*
          R29 — the owner types the first PIN and tells her, so a plaintext necessarily crosses from
          this box to the API, which hashes it at `01-F61`'s cost floor and stores a hash.

          **Masked, and the alternative is named rather than passed over (`24 §3b`).** A visible box
          would let an owner check what she typed before she says it out loud, and a mistyped PIN is
          a cashier who cannot sign in on her first shift. It is masked anyway because `14-F14` says
          a PIN is never displayed and the realistic reader of this screen is whoever is standing at
          the counter; the typo costs one reset, and unmasking later is additive while the reverse
          is a security change.
        */}
        <Field label={strings.staff.pin} help={strings.staff.pinHelp} htmlFor="staff-pin">
          <Input
            id="staff-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            aria-describedby={helpId("staff-pin")}
            value={pin}
            onChange={(event) => setPin(event.target.value)}
          />
        </Field>
      </div>

      {missing.length === 0 ? null : (
        <Note tone="fault">{`${strings.staff.incomplete} ${missing.join("; ")}`}</Note>
      )}
      {/*
        `00 §5.7` + `11-F23` — she EXISTS and cannot sign in. It is `abnormal` rather than `fault`
        because half of it succeeded: `27-F16` spends colour on the abnormal, and a destructive fill
        beside a person who is on the roster would say the hire did not happen. The refusal below
        keeps the server's own words; this says what the OWNER's situation now is, which is the part
        the server cannot know.
      */}
      {!partial ? null : (
        <Note tone="abnormal">
          {strings.staff.hirePartial.replace("{name}", () => name.trim())}
        </Note>
      )}
      {refusal === null ? null : <Note tone="fault">{`${strings.staff.refused} ${refusal}`}</Note>}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {strings.staff.cancel}
        </Button>
        {/* `27-F14`'s fill is the ONE committing action on this surface, which is the reading
            `ui/button.tsx` records: blue means pressable, not important. */}
        <Button type="button" variant="primary" disabled={busy} onClick={submit}>
          {busy ? strings.staff.saving : strings.staff.save}
        </Button>
      </div>
    </div>
  );
};

/**
 * `14-F14`'s *"role × per-location assignment"*, edited.
 *
 * **It writes the WHOLE set, because the port is absolute and never a delta.** Every place she
 * already works gets a control and every one of them is sent back, so changing her job at one
 * branch cannot silently take her off another — a write `01-F1` would then make permanent.
 *
 * It offers no way to ADD or REMOVE a place, and that is the narrow direction rather than an
 * oversight: removing a pair here would delete an assignment row, which is a different act from
 * `14-F14`'s deactivation (that one preserves the row and its historical attribution), and the two
 * would be one control apart on the same form.
 */
const PlacesTask = ({
  person,
  placeName,
  unnamed,
  busy,
  refusal,
  onCancel,
  onSave,
}: {
  readonly person: Person;
  readonly placeName: (branch_id: string | null) => string;
  /** `21-F15` — whether that name is the stated treatment rather than a name the product knows. */
  readonly unnamed: (branch_id: string | null) => boolean;
  readonly busy: boolean;
  /** The server's own words, rendered INSIDE the task they refused (see the screen's `refusal`). */
  readonly refusal: string | null;
  readonly onCancel: () => void;
  readonly onSave: (assignments: AssignmentDraft[]) => void;
}): ReactNode => {
  // Seeded once from a PROP, never synced — see `HireTask`. The screen gives this a `key` per
  // person so choosing another row MOUNTS a new editor rather than re-seeding a live one.
  const [roles, setRoles] = useState<readonly string[]>(() =>
    person.assignments.map((assignment) => assignment.role),
  );

  return (
    <div className="flex w-full flex-col gap-4 rounded-md border border-border-strong bg-card p-4">
      {person.assignments.map((assignment, index) => {
        const control = `role-${person.user_id}-${String(index)}`;
        return (
          <Field
            key={`${assignment.branch_id ?? ""}`}
            label={`${strings.staff.roleAt} ${placeName(assignment.branch_id)}`}
            help={strings.staff.roleHelp}
            htmlFor={control}
          >
            <Select
              id={control}
              aria-describedby={helpId(control)}
              value={roles[index] ?? assignment.role}
              onChange={(event) =>
                setRoles((current) =>
                  current.map((held, at) => (at === index ? event.target.value : held)),
                )
              }
            >
              {ROLES.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {ROLE_LABELS[candidate]}
                </option>
              ))}
            </Select>
            {/* Two unnamed branches would give this editor two identical labels, so `21-F15`'s
                exception (b) belongs here as much as on the row (see `BranchReference`). */}
            {assignment.branch_id !== null && unnamed(assignment.branch_id) ? (
              <BranchReference branch_id={assignment.branch_id} />
            ) : null}
          </Field>
        );
      })}
      {refusal === null ? null : <Note tone="fault">{`${strings.staff.refused} ${refusal}`}</Note>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {strings.staff.cancel}
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={busy}
          onClick={() =>
            onSave(
              person.assignments.map((assignment, index) => ({
                role: roles[index] ?? assignment.role,
                // `11-F22`'s status is not carried back: the listing has one and the input schema
                // does not, so mapping the listing straight through would state participation a
                // client has no business stating.
                branch_id: assignment.branch_id,
              })),
            )
          }
        >
          {busy ? strings.staff.saving : strings.staff.save}
        </Button>
      </div>
    </div>
  );
};

/**
 * `14-F14`'s *"PIN set/reset"* — the RESET half, as its own one-field task (`14-F32`).
 *
 * **It exists because the set half alone leaves a hole with no floor.** A hire is two writes; when
 * the second fails and the owner closes the task, the person is `active` with no credential, and
 * without this control the only way to give her one was to hire her a second time — which is the
 * permanent duplicate `hire` now refuses. `services/api` has always had the act and calls it
 * `pin_reset`; what was missing was a way for an owner to reach it.
 *
 * Masked, never displayed and never read back (`14-F14`), exactly as the hire's field is.
 */
const PinTask = ({
  person,
  busy,
  refusal,
  onCancel,
  onSave,
}: {
  readonly person: Person;
  readonly busy: boolean;
  readonly refusal: string | null;
  readonly onCancel: () => void;
  readonly onSave: (pin: string) => void;
}): ReactNode => {
  const [pin, setPin] = useState("");
  const [missing, setMissing] = useState(false);
  const control = `reset-pin-${person.user_id}`;

  // `14-F37` — the commit control is not disabled; pressing it with an empty box says what is
  // missing. An empty PIN sent to the server would be refused by its schema anyway, and a refusal
  // in the server's words for something the screen could name itself is the worse of the two.
  const submit = (): void => {
    setMissing(pin.trim() === "");
    if (pin.trim() === "") return;
    onSave(pin.trim());
  };

  return (
    <div className="flex w-full flex-col gap-4 rounded-md border border-border-strong bg-card p-4">
      <Field label={strings.staff.newPin} help={strings.staff.newPinHelp} htmlFor={control}>
        <Input
          id={control}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          aria-describedby={helpId(control)}
          value={pin}
          onChange={(event) => setPin(event.target.value)}
        />
      </Field>
      {!missing ? null : (
        <Note tone="fault">{`${strings.staff.incomplete} ${strings.staff.needPin}`}</Note>
      )}
      {refusal === null ? null : <Note tone="fault">{`${strings.staff.refused} ${refusal}`}</Note>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {strings.staff.cancel}
        </Button>
        <Button type="button" variant="primary" size="sm" disabled={busy} onClick={submit}>
          {busy ? strings.staff.saving : strings.staff.save}
        </Button>
      </div>
    </div>
  );
};

export const StaffScreen = (): ReactNode => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const roster = useQuery(trpc.users.list.queryOptions());
  /** `01-F69` — the org's branches, BY NAME. The only branch list on this plane (`21-F15`). */
  const directory = useQuery(trpc.tenancy.directory.queryOptions());

  const [hiring, setHiring] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  /** Which departure is armed. `14-F14`'s deactivation is irreversible here, so it is never one tap. */
  const [confirming, setConfirming] = useState<string | null>(null);
  /** Whose PIN is being reset — `14-F14`'s reset half, one row at a time. */
  const [resetting, setResetting] = useState<string | null>(null);
  /**
   * **The id the server minted for the hire that is still in progress**, and the whole of the fix
   * for a permanent duplicate — see `hire`. `null` means no person exists for the open draft.
   */
  const [minted, setMinted] = useState<string | null>(null);

  // Invalidate, never splice: the authority for who works here is the server, and a client that
  // edited its own cache would show a roster no till will ever be sent.
  const reread = (): void => {
    void queryClient.invalidateQueries({ queryKey: trpc.users.list.queryKey() });
  };

  const create = useMutation(trpc.users.create.mutationOptions());
  const setPin = useMutation(trpc.users.setPin.mutationOptions());
  const setAssignments = useMutation(
    trpc.users.setAssignments.mutationOptions({
      onSuccess: () => {
        setEditing(null);
        reread();
      },
    }),
  );
  const deactivate = useMutation(
    trpc.users.deactivate.mutationOptions({
      onSuccess: () => {
        setConfirming(null);
        reread();
      },
    }),
  );
  /**
   * `14-F14`'s PIN **reset**, on a row. A second `useMutation` over the same procedure rather than
   * a shared one, for the reason the refusals below are placed where they are: one mutation object
   * carries one error, and a reset that failed on Ayesha's row would otherwise render its refusal
   * inside the hire task at the top of the card.
   */
  const resetPin = useMutation(
    trpc.users.setPin.mutationOptions({ onSuccess: () => setResetting(null) }),
  );

  /**
   * Every state change that OPENS or CLOSES a task clears the refusal that belonged to the last
   * one. Without it the server's words outlive the row that produced them and are read as being
   * about the row an owner is looking at now — which is worse than showing nothing, because it is
   * specific and wrong.
   */
  const armDeparture = (key: string | null): void => {
    deactivate.reset();
    setConfirming(key);
  };
  const editPlaces = (user_id: string | null): void => {
    setAssignments.reset();
    setEditing(user_id);
  };
  const resetPinFor = (user_id: string | null): void => {
    resetPin.reset();
    setResetting(user_id);
  };
  /**
   * Closing the hire task drops the minted id with it, so the NEXT hire cannot set its PIN on the
   * person this one created. It is the one piece of state here that names a row on the server.
   */
  const closeHire = (): void => {
    create.reset();
    setPin.reset();
    setMinted(null);
    setHiring(false);
  };

  /**
   * R29's hire is TWO writes and their order is load-bearing: the id does not exist until the
   * create answers, and `14-F33` forbids a client inventing one.
   *
   * ⚠ **THE INSTANT BETWEEN THEM IS A STATE, AND TREATING IT AS AN ERROR MINTED A SECOND PERSON.**
   * The shipped version re-ran `create` on every press, so a `setPin` that failed left the form
   * open with the same values and the only affordance created her again — and `11-F20` never
   * deletes a person record, so both rows were permanent and the first was `active` with no
   * credential (`11-F23`'s tile that cannot be unlocked). The id is therefore REMEMBERED the moment
   * the create answers: a retry finishes the credential instead of minting a twin.
   *
   * The roster is re-read at that same moment rather than at the end of the task, because she is on
   * it whatever the PIN did next — a screen that waited for the whole act to succeed would go on
   * showing a roster it knows to be short for as long as the credential store is down (`00 §5.7`).
   */
  const hire = (
    person: {
      readonly display_name: string;
      readonly email: string | null;
      readonly assignments: AssignmentDraft[];
    },
    pin: string,
  ): void => {
    void (async () => {
      let user_id = minted;
      if (user_id === null) {
        user_id = (await create.mutateAsync(person)).user_id;
        setMinted(user_id);
        reread();
      }
      await setPin.mutateAsync({ user_id, pin });
      closeHire();
      reread();
    })().catch(() => undefined);
  };

  if (roster.isPending || directory.isPending) {
    return <p className="text-body text-muted-foreground">{strings.errors.loading}</p>;
  }

  /**
   * `14-F39` — the matrix said no, and it is its own surface. Collapsing it into the sign-in screen
   * would claim the session is over (it is not); collapsing it into the outage surface would claim
   * the service did not answer (it did, and it said no); answering an empty roster would claim
   * nobody works at this restaurant. Three states, three renderings.
   *
   * ⚠ **THE TWO QUERIES ARE GATED ON DIFFERENT ACTIONS, AND THIS SENTENCE IS THE SAME FOR BOTH.**
   * `users.list` is `user.manage` (owner-only, `14-F39`); `tenancy.directory` is
   * `report.sales_view`, which `router.ts` gates it on deliberately because `12-F10`'s summary is
   * the screen that needs it. So a caller could in principle be refused the directory while holding
   * the roster — and this branch would then tell her only an owner can see who works here, which is
   * a true sentence about the wrong read. **It is unreachable today**: every action here except
   * `report.sales_view` is owner-only and the back office is owner-only in practice (doc 14 §9's
   * first open question is whether managers get a slice at all), so nobody can hold `user.manage`
   * without also holding the wider one. It is named rather than branched on, because a second
   * refusal surface for a state nothing can reach is a screen nobody has ever seen.
   */
  if (isForbidden(roster.error) || isForbidden(directory.error)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{strings.staff.heading}</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-body text-foreground">{strings.staff.refusedHeading}</p>
          <p className="text-body text-muted-foreground">{strings.staff.refusedBody}</p>
        </CardBody>
      </Card>
    );
  }

  // Two `if`s rather than one, because each narrows its OWN query — the same reason
  // `catalog-screen.tsx` gives for not collapsing them into a shared `failed`.
  if (roster.error !== null) {
    return (
      <Problem
        heading={strings.unreachable.heading}
        body={strings.unreachable.body}
        action={strings.unreachable.action}
        detail={roster.error.message}
      >
        <Button
          type="button"
          variant="secondary"
          disabled={roster.isFetching}
          onClick={() => void roster.refetch()}
        >
          <RefreshCw aria-hidden="true" className="size-4" />
          {roster.isFetching ? strings.unreachable.retrying : strings.unreachable.retry}
        </Button>
      </Problem>
    );
  }
  if (directory.error !== null) {
    return (
      <Problem
        heading={strings.unreachable.heading}
        body={strings.unreachable.body}
        action={strings.unreachable.action}
        detail={directory.error.message}
      >
        <Button
          type="button"
          variant="secondary"
          disabled={directory.isFetching}
          onClick={() => void directory.refetch()}
        >
          <RefreshCw aria-hidden="true" className="size-4" />
          {directory.isFetching ? strings.unreachable.retrying : strings.unreachable.retry}
        </Button>
      </Problem>
    );
  }

  const people = roster.data;
  const branches = directory.data.branches;
  const named = new Map(branches.map((branch) => [branch.branch_id, branch.display_name]));

  /**
   * **`21-F15`, and this is the ONE unnamed treatment site on this screen** (the file header
   * enumerates it, as the FR requires).
   *
   * A name where the product knows one; where it knows none, the STATED treatment and never the
   * key. `branch_id === null` is not that case at all — `01-F26`'s org-wide assignment is a fact
   * the product knows perfectly well, so it gets a name of its own rather than a treatment.
   *
   * The key still reaches the glass, DEMOTED and labelled beside this (`BranchReference`), which is
   * how two unnamed branches stay tellable apart without either of them being named by a key.
   */
  const placeName = (branch_id: string | null): string =>
    branch_id === null
      ? strings.staff.everywhere
      : (named.get(branch_id) ?? strings.staff.branchUnnamed);

  const unnamed = (branch_id: string | null): boolean =>
    branch_id !== null && !named.has(branch_id);

  /** Whether anything on this screen is standing on that treatment right now (`00 §5.7`). */
  const anyUnnamed = people.some((person) =>
    person.assignments.some((assignment) => unnamed(assignment.branch_id)),
  );

  const refusal = create.error?.message ?? setPin.error?.message ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{strings.staff.heading}</CardTitle>
      </CardHeader>
      <CardBody>
        {/*
          `14-F4` + `00 §5.7`, in the shape the device list settled on: the absence is a bounded,
          labelled block with the same standing as the data beside it, placed where the fact WOULD
          have been, rather than a 12 px grey apology an owner skims. It stays OUT of the rows, so
          no row ever looks like it is carrying a distribution fact nothing serves.
        */}
        <div className="flex flex-col gap-2 rounded-md border border-border bg-muted px-4 py-3">
          <p className="text-xs leading-relaxed text-muted-foreground">{strings.staff.tillsOwed}</p>
          {/* `14-F14` says "User CRUD" and there is no U (see the file header). An owner can act on
              this one — by reading it before she types, which she cannot do if it is only a code
              comment. */}
          <p className="text-xs leading-relaxed text-muted-foreground">
            {strings.staff.nameFixOwed}
          </p>
          {/* `21-F15`'s "where it is set" half, and it renders only while something is standing on
              the treatment: an absence stated when there is no absence is its own dishonesty. */}
          {!anyUnnamed ? null : (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {strings.staff.branchNamesOwed}
            </p>
          )}
        </div>

        {hiring ? (
          <HireTask
            branches={branches}
            busy={create.isPending || setPin.isPending}
            partial={minted !== null && setPin.isError}
            refusal={refusal}
            onCancel={closeHire}
            onHire={hire}
          />
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="self-start"
            onClick={() => {
              // One PIN box on the screen at a time: the row task and this one both carry a control
              // labelled for a PIN, and two of them is a label a screen reader cannot resolve.
              resetPinFor(null);
              setHiring(true);
            }}
          >
            <UserPlus aria-hidden="true" className="size-4" />
            {strings.staff.add}
          </Button>
        )}

        {people.length === 0 ? (
          <p className="text-body text-muted-foreground">{strings.staff.empty}</p>
        ) : (
          /*
            A staff register, not a stack of cards — the same rule the device list follows: one
            bounded well with a rule per row, so an eight-person org reads as a list of a team.
            `01-F61`'s explicit grid order is the SERVER's and is rendered exactly as served; a
            derived order (alphabetical, by id) is banned outright by that FR.
          */
          <ul className="flex flex-col overflow-hidden rounded-md border border-border-strong bg-muted">
            {people.map((person) => {
              const works = person.assignments.some((assignment) => assignment.status === "active");
              return (
                <li
                  key={person.user_id}
                  className="flex flex-col gap-3 border-b border-border p-4 last:border-b-0"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                    {/* `11-F20` — the name leads, because a person is known by her name and never
                        by an identifier. The id is on no control and on no row. */}
                    <span className="text-body text-foreground">{person.display_name}</span>
                    {/* R30 — a till-only cashier has none, and an absence renders as nothing at
                        all. Never `null`, which reads as an address and satisfies every type. */}
                    {person.email === null ? null : (
                      <span className="text-xs text-muted-foreground">{person.email}</span>
                    )}
                  </div>

                  {editing === person.user_id ? (
                    <PlacesTask
                      key={person.user_id}
                      person={person}
                      placeName={placeName}
                      unnamed={unnamed}
                      busy={setAssignments.isPending}
                      refusal={setAssignments.error?.message ?? null}
                      onCancel={() => editPlaces(null)}
                      onSave={(assignments) =>
                        setAssignments.mutate({ user_id: person.user_id, assignments })
                      }
                    />
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {person.assignments.map((assignment) => {
                        const place = placeName(assignment.branch_id);
                        const armed = `${person.user_id}|${assignment.branch_id ?? ""}`;
                        return (
                          <li
                            key={armed}
                            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
                          >
                            {/* The job and the place are one fact and the `21-F15` reference is a
                                caption under it, so the two stay together when the row wraps. */}
                            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                              <span className="text-xs text-muted-foreground">
                                {`${roleLabel(assignment.role)} · ${place}`}
                              </span>
                              {assignment.branch_id !== null && unnamed(assignment.branch_id) ? (
                                <BranchReference branch_id={assignment.branch_id} />
                              ) : null}
                            </div>
                            {/* `11-F22` — participation is per-(person, place), and it is a WORD
                                rather than a colour, so a monochrome screenshot still reads. */}
                            <span className="text-xs text-muted-foreground">
                              {assignment.status === "active"
                                ? strings.staff.working
                                : strings.staff.departed}
                            </span>
                            {assignment.status !== "active" ? null : confirming === armed ? (
                              /*
                                ⚠ `w-full` and no `max-w-*` — see this file's layout note. In a
                                `flex-wrap` row a full-width child takes its own line at every
                                width, so the consequence and its two controls can never be
                                squeezed into a column beside the metadata above them.
                              */
                              <div className="flex w-full flex-col gap-3 rounded-md border border-warning-outline bg-card p-3 outline-2 outline-warning-outline">
                                {/*
                                  `14-F13`'s rule for the app's other irreversible act: the
                                  consequence is stated ON the control and READ before the second
                                  press, never folded into what the control is CALLED — the live
                                  a11y regression this app records from the apply-when row.

                                  It NAMES her, which `device-list.tsx` does not need to: a device
                                  row carries exactly one revocation, while four people at up to two
                                  places each carry up to five departures on one screen, and
                                  `11-F20` makes the name how this product refers to a person.
                                */}
                                <p className="text-xs leading-relaxed text-warning-fg">
                                  {strings.staff.deactivateConsequence
                                    .replace("{name}", () => person.display_name)
                                    .replace("{place}", () => place)}
                                </p>
                                {/*
                                  ⚠ **THE REFUSAL BELONGS TO THIS ROW AND IS RENDERED IN IT.** It
                                  used to sit at the top of the card, above the hire control and
                                  the whole list: an owner deactivating a lower row got the
                                  server's sentence off screen while the armed block in front of
                                  her showed no change at all — she could not tell a refusal from a
                                  hang, on the one act here that is irreversible. No rail in this
                                  repo can see that (happy-dom performs no layout, and this app has
                                  no layout gate at any width), so it is a placement decision made
                                  deliberately rather than one a suite would have caught.
                                */}
                                {deactivate.error === null ? null : (
                                  <Note tone="fault">
                                    {`${strings.staff.refused} ${deactivate.error.message}`}
                                  </Note>
                                )}
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={deactivate.isPending}
                                    onClick={() => armDeparture(null)}
                                  >
                                    {strings.staff.confirmNo}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    disabled={deactivate.isPending}
                                    onClick={() =>
                                      deactivate.mutate({
                                        user_id: person.user_id,
                                        // `01-F26` — `null` addresses the ORG-WIDE assignment and
                                        // is a different fact from "every branch". Sending it for
                                        // a branch-assigned person changes nothing while the
                                        // screen reports success.
                                        branch_id: assignment.branch_id,
                                      })
                                    }
                                  >
                                    {deactivate.isPending
                                      ? strings.staff.deactivating
                                      : strings.staff.confirmYes}
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => armDeparture(armed)}
                              >
                                {`${strings.staff.deactivate} ${place}`}
                              </Button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {/* No control at all on a person who works nowhere: `11-F20` keeps her record for
                      ever so her name renders on last month's orders, and there is no act left to
                      offer — no re-activation exists anywhere in this product (R32), and `11-F23`
                      deletes the credential row on departure, so there is no PIN to reset either. */}
                  {editing === person.user_id || !works ? null : resetting === person.user_id ? (
                    <PinTask
                      key={person.user_id}
                      person={person}
                      busy={resetPin.isPending}
                      refusal={resetPin.error?.message ?? null}
                      onCancel={() => resetPinFor(null)}
                      onSave={(pin) => resetPin.mutate({ user_id: person.user_id, pin })}
                    />
                  ) : (
                    <div className="flex flex-wrap gap-2 self-start">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => editPlaces(person.user_id)}
                      >
                        {strings.staff.edit}
                      </Button>
                      {/* Hidden while the hire task is open, for the reason the opener records:
                          two controls labelled for a PIN is a label nothing can resolve. */}
                      {hiring ? null : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => resetPinFor(person.user_id)}
                        >
                          {strings.staff.resetPin}
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
};
