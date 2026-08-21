// Named tenancy — the four records an `org_id`, a `branch_id`, a `device_id` and a `user_id`
// point AT (`01-F68`, `01-F69`, `01-F70`, `11-F20`; lifecycle status `15-F25`).
//
// **WHY THIS FILE EXISTS.** The kernel has been org-scoped since Wave 0 — `org_events`,
// `org_sequences`, an org-scoped catalog, `org_id` on every envelope — and nothing anywhere said
// what an org *is*. `01 §5` has listed `orgs/branches/users/roles` among the cloud tables since
// Draft 1; no migration creates them, no code path creates an org, and the only org a running
// deployment has is assembled at boot from three environment variables into a process-local store
// that dies with the process. The visible symptom is `21-F15`'s: every surface renders hexadecimal
// where a restaurant's name belongs. The cause is a missing MODEL, and this is it.
//
// **WHY IN `domain` AND NOWHERE ELSE (`18 §2`, `18 §4`).** These records cross both planes — the
// cloud provisions them (`15-F4`, `15-F26`), the gateway stores and serves them, the device reads
// its own projections. `SELLABLE_KINDS` is the worked example one file over: three copies of one
// classification, each commenting that the others existed, and a founder ruling that had to be
// applied in one place. A tenancy record redeclared per plane diverges the first time a field is
// added, and the two planes then disagree about what a restaurant is called.
//
// **NONE OF THIS IS AN EVENT, AND NO EVENT TYPE IS ADDED BY IT.** Every FR above is explicit:
// `15-F25` routes org lifecycle transitions through the EXISTING `config.changed` and says in
// terms that no new type is introduced; `01-F70` says renaming a device is an ordinary `14-F2`
// settings change and specifically NOT `device.registered`; `11-F20` writes no event at all and
// forbids a name reaching one — "names are resolved at RENDER TIME, never written into events".
// So there is no `KnownEventType` here, no payload schema, and no merge rule. That is a
// requirement satisfied, not a corner cut: a new type needs a row in the `01 §4` catalog, a
// schema in `registry.ts` and an oracle-pinned merge rule, and the merge engine's exhaustive
// `assertNever` will not compile without the third.
//
// **THESE ARE DIRECTORY ROWS, NOT LEDGER ROWS**, and the distinction has teeth (`01-F68`): no
// ledger table may ever carry a foreign key to one. Events already exist under org ids no
// registry row names, so a referential constraint would refuse ingest for exactly those orgs —
// refusing a sale a till has already rung and persisted (`01-F17`, `01-F2`, `00 §5.1`). Admission
// is the gate and it is one layer up (`01-F25`, `01-F47`, `01-F48`, `01-F71` (c)). An org with
// events and no record is UNNAMED, not invalid.
//
// **UNKNOWN KEYS ARE STRIPPED, NOT REFUSED** (zod's default, kept deliberately), and the
// consequence is stated because it is not the obvious one: `00 §6`'s evolution rule is
// additive-only under one version with a reader for N−1, so a reader that REFUSED an unknown key
// would let a cloud that adds one field brick every device that has not shipped yet. The price is
// that a caller passing `timezone` to `BranchRecord` — the field `01-F69` REFUSES — has it dropped
// silently rather than rejected. That refusal is enforced at the spec layer, and by the fact that
// this schema is the shape the writer persists so nothing smuggles a column into storage; it is
// NOT enforced by a parse error, and a session expecting one will not get it. Measured, not
// assumed: `BranchRecord.parse({…, timezone: "Asia/Karachi"})` succeeds and returns six fields.
//
// **THE FILE-HEADER DEBT MARKER IS GONE (August 2026), AND ITS DELETION IS THE POINT.** It read
// "NOTHING CONSTRUCTS THESE YET … each landing deletes its share", and the landing that deleted its
// share is `15-F27`'s provisioning commands in `services/sync-gateway`: `create-org`,
// `create-branch`, `create-owner` and a `--name`-taking `provision-device` construct `OrgRecord`,
// `BranchRecord`, `PersonRecord`, `DisplayName`, `BRANCH_TYPES` and `BRANCH_CLASSES` on every run.
// `seams:check` reported all six as **STALE markers** the moment those callers landed — a marker on
// something reached fails the rail by design, which is the register refusing to rot. What is still
// owed is recorded at the DECLARATION of each remaining symbol below, never in this header: a
// header marker covers every export in the module, so leaving it here would have re-muted the six
// that are now wired (`provision-device.ts` and `migrate.ts` both record that trap).
import { z } from "zod";
import { DEVICE_CLASSES } from "./device-classes.js";
import { PERSON_STATUSES, ROLES, type RoleAssignment } from "./permissions.js";

/**
 * The upper bound on every name in this file, counted in CODE POINTS.
 *
 * **Why code points and not bytes or UTF-16 units.** `00 §5.6`: user content is uncontrolled
 * Unicode and "never transliterated or rejected for its script". "کباب ہاؤس" is 9 code points, 9
 * UTF-16 units and 18 UTF-8 bytes; a byte bound therefore gives an Urdu restaurant roughly half
 * the name length an English one gets, silently, for no stated reason. A UTF-16 bound is the same
 * defect deferred — it only bites above the BMP (an emoji in a branch label costs 2). Code points
 * is the one unit that treats every script alike.
 *
 * **Why not grapheme clusters, which would be better still.** `Intl.Segmenter`'s answer depends
 * on the ICU/Unicode version of the runtime, and this bound is evaluated on BOTH planes — a cloud
 * Node and an Electron main process that upgrade on different schedules. Two planes disagreeing
 * about whether a stored name is legal is a worse failure than a crude count, because the
 * disagreement surfaces as a record the cloud accepted and a device refuses.
 *
 * **Why 120, and why the number is generous on purpose.** This is a stop-a-payload bound, not a
 * fitting bound: no restaurant, branch, till or person reaches it, and FITTING a name to a 48-
 * column receipt line (`03 §7`) or a tile is truncation's job at the surface, never validation's.
 * The asymmetry decides the direction — raising the bound later is additive and invalidates
 * nothing, while lowering it refuses a name already stored under a record `01-F68`/`01-F69` say is
 * never deleted. So err high.
 */
export const DISPLAY_NAME_MAX_CODE_POINTS = 120;

/** Unicode control characters: C0, DEL and C1. `\p{Cc}` is exactly that set. */
const CONTROL = /\p{Cc}/u;

/**
 * At least one character that is not a control, a format character or a separator — i.e. the
 * string renders SOMETHING. `\p{Cf}` deliberately stays legal in the *body* of a name: Urdu and
 * Arabic use ZWNJ (U+200C) and ZWJ (U+200D) to control joining, and banning them outright would
 * reject correctly-typed names in the exact script `00 §5.6` protects.
 */
const RENDERS_SOMETHING = /[^\p{Cf}\p{Zs}\p{Zl}\p{Zp}]/u;

/**
 * A human-facing name, shared by all four records (`01-F68`, `01-F69`, `01-F70`, `11-F20` each
 * say "a required, non-empty `display_name`"). One schema, because nothing in the corpus
 * distinguishes what a restaurant, a branch, a till and a person may be called.
 *
 * **The script is not constrained, and that is the corpus's rule rather than a preference.**
 * `00 §5.6` separates *interface language* (English only, no i18n layer) from *user content*
 * ("uncontrolled Unicode … may contain Urdu script — every surface renders it faithfully … never
 * transliterated or rejected for its script"). A restaurant's own name is user content by that
 * test, so "کباب ہاؤس" is storable, full stop.
 *
 * **What that costs at the printer, MEASURED rather than assumed** (2026-08-16, `encode()` run
 * against a raster-capable capability): `{ kind: "user_text", value: "کباب ہاؤس" }` →
 * `REFUSE raster_font_unavailable severity=S1`; the same name passed as `kind: "text"` →
 * `REFUSE non_ascii_system_text`; `"Cafe 🍛"` → `raster_font_unavailable` too, so an EMOJI in a
 * name costs exactly what Urdu does. `packages/escpos`'s encoder refuses a non-Latin `user_text`
 * part with `raster_font_unavailable` (`encoder.ts`, `03-F8`:
 * "a non-Latin user field needs a font AND a shaping engine, because the script is positional.
 * Until one is chosen this refuses rather than emitting a raster with no legible glyphs"). So an
 * Urdu name STORES, RENDERS on screen and REFUSES AT PRINT — loudly, `03-F34`'s hard refusal with
 * no silent degradation, which is the honest state and not a bug this file may paper over.
 * Refusing the name here to keep the printer happy would invert the layering: it would let a
 * printer's code page decide what a restaurant may call itself, and `00 §5.6` names bitmap
 * rasterization (`03-F8`) as the answer that is owed.
 *
 * **Trimming, stated.** Leading and trailing whitespace is stripped, then emptiness is judged —
 * so `"   "` is refused rather than stored as a name that renders as nothing. Surrounding
 * whitespace is invisible in every slot this value appears in, so keeping it would store a
 * difference no human can see and no reader can act on.
 *
 * **NOT normalized (no NFC), deliberately.** Normalization rewrites what the owner typed, and the
 * usual reason to accept that — stable equality — does not apply here: `01-F70` and `11-F20` both
 * state that a name is a LABEL and nothing may key on it, so no code path ever compares two names
 * for equality. The residual is stated: two visually identical names may differ byte-wise, which
 * is harmless precisely because nothing keys on them. If a future FR ever wants name *search* or
 * uniqueness, normalization belongs in that reader, not in the record.
 *
 * **Why the emptiness test is not `.length > 0`.** That is the simpler alternative and it fails
 * `21-F15`'s own clause — a slot "is never blank — a blank is the same lie with less information".
 * `"​"` and `" "` survive a length check and render as nothing at all.
 */
export const DisplayName = z
  .string()
  .trim()
  .refine((v) => v.length > 0, { message: "display_name is required and may not be empty" })
  .refine((v) => RENDERS_SOMETHING.test(v), {
    message: "display_name must contain at least one visible character (21-F15: never blank)",
  })
  .refine((v) => !CONTROL.test(v), {
    message: "display_name may not contain control characters (a name is one rendered line)",
  })
  .refine((v) => [...v].length <= DISPLAY_NAME_MAX_CODE_POINTS, {
    message: `display_name may not exceed ${DISPLAY_NAME_MAX_CODE_POINTS} code points`,
  });

/**
 * An identifier as these records hold it. `z.string().min(1)`, matching `EventEnvelope` exactly.
 *
 * A UUIDv7 check would be *stricter than the envelope*, and then "is this a valid org id" has two
 * answers in one package — the ingest path accepting a value the directory refuses. `00 §6`'s id
 * shape is enforced where ids are MINTED (`newId`), which is the only place that can enforce it
 * without contradicting history that already exists.
 */
const Id = z.string().min(1);

/**
 * Registry bookkeeping time: epoch milliseconds on the clock of whatever provisioned the record.
 *
 * **This is NOT branch time and no fold may read it.** `01-F43..F46` and law 1 govern EVENTS,
 * whose durations must be evaluated in a consistent branch clock stamped at append. A directory
 * row is not an event, is never delivered to a fold, and no projected value may derive from it —
 * a fold reading a registry row would depend on cloud sync state at fold time, which is the
 * `01-F34` break law 1 exists to prevent (`01-F52` makes the identical argument for the catalog).
 */
const CreatedAt = z.number().int();

/**
 * `15-F25` — an org's lifecycle is `active ⇄ suspended`, and there is deliberately NO third state.
 *
 * `closed` is REFUSED rather than deferred: it would be indistinguishable, in every enforcement
 * path this product has, from a never-lifted suspension plus revoking the org's devices — both of
 * which already ship (`15-F7`; `01-F25`/`01-F42`/`01-F48`). Closure is therefore a PROCEDURE
 * composed of existing acts (export → revoke devices → suspend with a reason), not a value.
 * The precedent is `14-F30`'s: two states differing in nothing an implementation can observe are
 * one state. Adding a member here is an FR amendment to `15-F25`, never a convenience.
 */
export const ORG_STATUSES = ["active", "suspended"] as const;
export type OrgStatus = (typeof ORG_STATUSES)[number];

/**
 * `01-F68` — the ORG record. Four fields, and the FR states that as the whole of it.
 *
 * `org_id` is minted once at provisioning (`15-F4`) and **never reused**: `01-F1` makes every
 * event under it permanent, so a recycled id merges two restaurants' histories into one ledger
 * with no rule for separating them again. A mistaken provision is abandoned, never recycled
 * (`15-F26`).
 *
 * **Deliberately absent, each because another FR already owns it:** operating profile and hardware
 * capability (`15-F4`, `restaurant-os.md` §6 + `DEC-HW-003`); the province a fiscal adapter
 * resolves against (`16-F19` — added *there* when the add-on lands, not speculatively here);
 * branding (`06`); and anything to do with plan, billing, quota or metering (`15-F5a`, `15-F24`:
 * metering is measurement only, and no FR anywhere makes a payment state gate a service).
 */
export const OrgRecord = z.object({
  org_id: Id,
  display_name: DisplayName,
  created_at: CreatedAt,
  status: z.enum(ORG_STATUSES),
});
export type OrgRecordT = z.infer<typeof OrgRecord>;

/** `01-F25`'s branch types, transcribed: `branch | prep_kitchen | storage`. */
export const BRANCH_TYPES = ["branch", "prep_kitchen", "storage"] as const;
export type BranchType = (typeof BRANCH_TYPES)[number];

/**
 * `01-F49`'s branch classes: "A branch carries a `class` of `production | training`" — and the
 * same FR's headline is why this is a field and not a flag: *there is no training flag anywhere in
 * the kernel*. A training session is an ordinary session against a training branch, and everything
 * branch-scoped (credentials `01-F9`, fan-out `01-F13`, reporting) isolates it for free.
 */
export const BRANCH_CLASSES = ["production", "training"] as const;
export type BranchClass = (typeof BRANCH_CLASSES)[number];

/**
 * `01-F69` — a BRANCH under exactly one org. Its two discriminators already existed; the name did
 * not, and a device's identity resolves against this record (`01-F65`) while fan-out is keyed by
 * it (`01-F71` (d)), so the till, the pass screen and the fleet dashboard all print it.
 *
 * **NO TIMEZONE, and that is a refusal rather than a deferral.** `01-F46` anchors the business day
 * to Asia/Karachi "regardless of cloud region or device locale" and makes the cutover HOUR the
 * layer-2 setting while the anchor itself is platform law. A per-branch timezone would be a
 * layer-3 record overriding layer 1, which `00 §7`'s strict ordering forbids outright, and its
 * failure would be silent: every duration, day boundary, shift report and cash reconciliation
 * would re-date itself against a field nobody remembers setting. Multi-timezone is an amendment to
 * `01-F46`, not a column here.
 *
 * **No address, no phone** — deferred by `01-F69` to the FRs that will READ them (`16-F19` for
 * province and registration status, `06-F9`/`06-F11` for delivery capture), because a field with
 * no reader is captured by human discretion and left to drift (`00 §5.8`).
 *
 * **A branch record is never deleted.** `01-F51`'s droppability is a *training*-branch property
 * and extends to nothing else; decommissioning a production branch is revoking its devices
 * (`01-F42`, `14-F13`) — the record and its ledger stay.
 *
 * **The two discriminators are `branch_type` and `branch_class`, not `type` and `class`**, though
 * `01-F25` and `01-F49` name the concepts by the bare words. Three reasons, none of them taste.
 * `DeviceRecord.device_class` below already carries the prefix and matches the column
 * `kernel.device_registry` has held since T-01-09, so the bare form would make this file
 * inconsistent with itself. `kernel.branches` names its columns `branch_type`/`branch_class`, and
 * a record whose field names differ from the columns the sole writer (`18 §4`) persists needs a
 * hand-written mapping — one more place drift can hide, for nothing. And `class` is a TypeScript
 * reserved word: `const { class: cls } = branch` is the only way to destructure it, so every
 * consumer pays a rename at every call site.
 */
export const BranchRecord = z.object({
  branch_id: Id,
  org_id: Id,
  display_name: DisplayName,
  branch_type: z.enum(BRANCH_TYPES),
  branch_class: z.enum(BRANCH_CLASSES),
  created_at: CreatedAt,
});
export type BranchRecordT = z.infer<typeof BranchRecord>;

/**
 * `01-F70` — a DEVICE's human name, on the cloud REGISTRY row, REQUIRED at registration.
 *
 * Today `kernel.device_registry` holds `org_id`, `branch_id`, `device_id`, `device_class` and
 * `revoked_at`, and `provision-device` takes `--class` and no label — so `14-F12`'s device list and
 * `15-F11`'s fleet dashboard can name a till only by its UUID, and the operator reading either is
 * by construction not standing in front of it.
 *
 * **Required at registration, on `01-F65`'s discipline:** an absent name is refused, naming the
 * argument the operator must supply. A name that may be added later never is.
 *
 * **On the registry row, not in device-local configuration** (`00 §7` layer 3): a name typed into
 * a device's own environment is a name only that device knows, and both surfaces that need it are
 * lists of devices nobody is holding.
 *
 * **The name is a LABEL and never an identifier.** `device_id` remains the sole key for admission,
 * fan-out, watermarks, relay attestation (`01-F13`) and `01-F64`'s store binding. Two devices may
 * legitimately share a name; nothing may key on it; a rename changes no history because no event
 * ever carried it. Renaming is `device.manage` (`14-F30`) from `14-F12`'s list.
 *
 * **What this record deliberately does NOT carry:** `revoked_at` and `token_expires_at`. Those are
 * ADMISSION state owned by `01-F25`/`01-F47`/`01-F48` and written by exactly one service (`18 §4`);
 * mirroring them into a shared record would give the fleet two answers to "is this till revoked",
 * and the wrong one would be the cached one.
 *
 * **⚠ NAME COLLISION, FOUND 2026-08-16 AND REPORTED RATHER THAN DODGED.**
 * `services/api/src/devices.ts:41` already exports a type called `DeviceRecord` — the same
 * physical row (`kernel.device_registry`) under a different projection: it carries `revoked_at`
 * and `token_expires_at` for `14-F12`'s list and carries neither `org_id` nor a name. Two exported
 * types with one name, both describing a device row, in one monorepo, is the drift `18 §4` exists
 * to stop, and it is silent because they sit in different packages. The name is NOT surrendered
 * here — `domain` is where a domain type is declared — and the owed fix is the other direction:
 * `devices.ts` re-expressed as this record plus the two admission fields it adds. Nothing breaks
 * today (`services/api` imports no tenancy symbol; `tsc --noEmit` is exit 0 across the monorepo),
 * and the first file to import both will get a duplicate-identifier error, which is loud.
 */
export const DeviceRecord = z.object({
  org_id: Id,
  branch_id: Id,
  device_id: Id,
  device_class: z.enum(DEVICE_CLASSES),
  display_name: DisplayName,
});
export type DeviceRecordT = z.infer<typeof DeviceRecord>;

/**
 * `01-F26`'s "(role, location)" pair as a parser, WITHOUT participation — the base
 * `PersonAssignment` extends below, and not a shape anything parses on its own.
 *
 * ⚠ **IT IS NO LONGER THE PARSER FOR `RoleAssignment`, AND THE TRIPWIRE MOVED WITH THE FIELD
 * (August 2026, step 2b).** It used to be: the type was declared once in `permissions.ts`, this was
 * its wire form, and the bridge underneath made drift a COMPILE error. Then `11-F22`'s participation
 * landed on `PersonAssignment` and deliberately NOT here, because `RoleAssignment` was `can()`'s
 * subject and a matrix carrying a status nothing reads *"is the shape that later gets read by
 * accident"*. **The matrix now reads it**, so that reason has expired in the direction that
 * removes the exception rather than the field: `RoleAssignment` carries `status`, `PersonAssignment`
 * is exactly that type, and the tripwire below pins THOSE two. Keeping a second statusless pair as
 * the pinned one would mean the record and the matrix disagree about what an assignment is — two
 * answers to *may she act here*, which is the `18 §2` case that has teeth.
 */
const RoleAssignmentBase = z.object({
  role: z.enum(ROLES),
  branch_id: Id.nullable(),
});

/**
 * `11-F22` — a person's PARTICIPATION status, closed at two (founder ruling R26).
 *
 * ⚠ **THE DECLARATION MOVED TO `permissions.ts` (August 2026, step 2b) and is re-exported here
 * unchanged**, so every importer of `@restos/domain` is untouched. It moved because the MATRIX now
 * reads the value and `permissions.ts` cannot import from this module — this one already imports
 * `ROLES` and `RoleAssignment` from it, so the other direction is a cycle. `ROLES` is the precedent
 * and the direction is `18 §4`'s: the matrix declares the closed sets it answers against, and the
 * record schemas import them. The reasoning for the set itself is stated at the declaration.
 *
 * `active | inactive`, and the set is closed for `ORG_STATUSES`' reason one level down: a wider
 * vocabulary (`suspended`, `on_leave`, `probation`) is org policy nobody has ruled, and inventing
 * one here would be inventing policy (commandment 2). The two members answer the one question the
 * FR asks — *may she act* — and `11-F22` separates that from *does she render*, which is
 * unconditional: a departed cashier's name still resolves on last month's orders, so her record is
 * retained and marked rather than deleted (`11-F20`: "a person record is never deleted").
 *
 * ⚠ **It is REQUIRED and there is deliberately no default.** `01-F75` makes the field required at
 * the writer "so nothing on the wire lacks it", and `11-F22` refuses the default by name — an
 * absent status is "not a licence to default an absent status to `active`". A default here would
 * be the one place a status could be invented for a person nobody classified.
 */
export { PERSON_STATUSES, type PersonStatus } from "./permissions.js";

/**
 * `11-F22` — `01-F26`'s assignment **with the participation status on it**, which is where the FR
 * puts it: *"participation is carried where `01-F26` already carries the relationship — with the
 * ASSIGNMENT"*.
 *
 * ⚠ **PER-(PERSON, BRANCH), AND THE FIRST BUILD PUT IT ON THE PERSON ROW.** `11-F22` carried both
 * readings — its heading says *"a PERSON RECORD carries a participation status"* and its transfer
 * clause requires a cashier moving A→B to be *"`inactive` in A's roster and `active` in B's at the
 * same moment"* — and the FR now states the transfer clause as the operative one. A single column
 * cannot hold two answers, and the cost was measured on the build that tried: deactivating her at A
 * destroyed the credential B's artifact needs (`11-F23`'s *"`active` member with no hash"*), and any
 * later republish at A re-copied her CURRENT status and **returned a departed cashier to `active`
 * with a working PIN hash on her old branch's tills**.
 *
 * **The person record is still where participation LIVES** — that is how the heading is now to be
 * read — so this stays a field of `PersonRecord` below rather than a second table.
 *
 * **It does NOT travel on `01-F75`'s wire row.** That row declares exactly one `status`, and
 * `01-F76` already makes the staff artifact branch-scoped, so an entry's single `status` **is** that
 * branch's participation. A per-assignment status on the wire would be two representations of one
 * fact with nothing ruling which wins — `11-F20`'s "ONE name, not one per plane" argument on a
 * different field.
 */
export const PersonAssignment = RoleAssignmentBase.extend({
  status: z.enum(PERSON_STATUSES, {
    error:
      "11-F22: an assignment carries the person's participation status at that location and the " +
      "set is closed at `active` | `inactive`. An ABSENT status is refused rather than defaulted " +
      "to `active` (01-F75 makes the field required at the writer, so nothing on the wire lacks " +
      "it), and the status is required PER ASSIGNMENT — a transfer is `inactive` at one branch " +
      "and `active` at another at the same moment, which no single per-person value can express.",
  }),
});
export type PersonAssignmentT = z.infer<typeof PersonAssignment>;

/**
 * Drift tripwire: if either declaration moves, this stops compiling.
 *
 * ⚠ **IT PINS `PersonAssignment` NOW, NOT THE STATUSLESS BASE (August 2026, step 2b).** The pair
 * the record stores and the pair the matrix authorizes against are ONE type — `RoleAssignment`
 * carries `11-F22`'s status and so does this — so this is the parser for that type and the bridge
 * asserts it exactly. **What it buys is the case that was live for three days:** while the two
 * shapes were allowed to differ, `PersonAssignment` carried a required `status` that
 * `RoleAssignment` did not have, every stored assignment already held the value, and `can()` simply
 * did not look at it. Nothing failed to compile, because a supertype accepts a subtype's extra
 * field silently. Pinning them mutually makes the next such divergence a build error rather than a
 * fail-open — which is what this tripwire was always for, aimed at the field that now decides
 * authority.
 */
type _RoleAssignmentAgrees =
  z.infer<typeof PersonAssignment> extends RoleAssignment
    ? RoleAssignment extends z.infer<typeof PersonAssignment>
      ? true
      : never
    : never;
const _roleAssignmentAgrees: _RoleAssignmentAgrees = true;
void _roleAssignmentAgrees;

/**
 * `11-F20` — the PERSON record: the required minimum, and no more.
 *
 * What the corpus already decided, so this extends rather than restates: `01-F26` gives
 * User × Role × per-location assignment; `01-F28` verifies a PIN offline against synced hashes;
 * `01-F61` requires a `display_name` ("because the identification tile must render something")
 * and a `grid_ordinal`; `14-F14` owns the CRUD surface; `15-F26` creates the first one. What none
 * of them said is that the name is REQUIRED on the one record both planes read — and it was on
 * neither: the cloud user record carries no name at all and the device roster's is optional.
 *
 * **ONE name, not one per plane.** The cloud user record and the device staff record are two
 * projections of one person; a second name field is a second source for one fact, and the two
 * disagree the first time somebody's name changes. The device projection may be a SUBSET of this;
 * it may not hold a name this does not.
 *
 * **The CREDENTIAL is per plane and is deliberately not here** — `15-F26`'s email + password on
 * the cloud plane, `01-F28`'s PIN hash on the device plane. `11-F20` enumerates them as
 * "the credential each plane needs", which is a statement that they differ; hoisting both into one
 * shared record would put a password hash on every device roster row, which `01-F28` never asks
 * for and `00 §5.4` would have to answer for.
 *
 * **`grid_ordinal` is explicit and not derived** (`01-F61`): ordering the identification grid by
 * `user_id`, name or recency means a new hire inserts wherever it sorts and shifts every tile
 * after it, destroying the positional memory `27-F4` protects — "the first build ordered by
 * `user_id` and the defect is invisible to a test that only re-renders the same roster". New
 * members append; roster changes land at the `01-F46` business-day boundary.
 *
 * **A name is NOT an identifier.** Two people legitimately share one; attribution is
 * `actor_user_id` on the envelope, always (`01-F63` refuses even an actor field inside a payload).
 * Names are resolved at RENDER time and never written into events, so a rename is an ordinary edit
 * and `01-F1` needs no correction — and a read model that SNAPSHOTS a name diverges from the
 * roster silently and permanently.
 *
 * **A person record is never deleted** — `14-F14`'s deactivation is the exit, so every event the
 * person authored still renders a name (`01-F55`'s tombstone argument on the people axis).
 *
 * **Deferred to the FRs that read them:** attendance and the advances ledger (`11-F1..F11`, this
 * module's own Wave 3), and a photo or fixed per-person mark — which `01-F61` already records as
 * materially better than a name for this population and puts on doc `27`, so it is owed THERE and
 * must not be invented here.
 */
export const PersonRecord = z.object({
  user_id: Id,
  org_id: Id,
  display_name: DisplayName,
  /**
   * `01-F26`'s per-location pairs, each carrying `11-F22`'s participation status at that location.
   *
   * **The status is required and has no default** — `01-F75` makes the field required at the writer
   * "so nothing on the wire lacks it", and `11-F22` refuses the default by name ("not a licence to
   * default an absent status to `active`"). **The message names the FR because the refusal IS the
   * enforcement:** `services/sync-gateway/src/schema.ts` deliberately carries no CHECK for a closed
   * set, so this parse is the only thing between a mistyped word and a person nothing can classify,
   * and a refusal an operator cannot act on is the failure `insertUser`'s own doc comment already
   * names about "duplicate key value violates unique constraint".
   */
  assignments: z.array(PersonAssignment),
  grid_ordinal: z.number().int().nonnegative(),
});
export type PersonRecordT = z.infer<typeof PersonRecord>;
