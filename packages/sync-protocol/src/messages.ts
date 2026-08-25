// Wire protocol v2 (PROTOCOL.md, 24-F8 artifact): one message set for LAN and
// cloud. Unknown keys are stripped (reject-or-drop, 01-F40 — slices are
// sender-enforced; a client can never smuggle one in). Contract fixtures:
// src/__acceptance__/fixtures (20 §2.7 — changing them is a spec-review event).
//
// ⚠ PROTECTED PATH (`20 §4.4`, commandment 10) — SENIOR REVIEW.
//
// ── THIS MODULE IS RUNTIME-PORTABLE, AND THAT IS NOW A LOAD-BEARING PROPERTY ───────────────────
//
// It used to open with `import { … } from "node:zlib"`, for the zstd framing that now lives in
// `compression.ts`. That one line made the WHOLE package unbundlable for React Native: Metro
// cannot resolve `node:zlib`, so anything reaching `@restos/sync-protocol` — including the
// message parser a device needs to read a single frame — failed at bundle time, not at run time.
// `18 §4` puts RN on `@op-engineering/op-sqlite` and `18 §8` requires the manager app to stay
// installable, so a kernel package that only Node can load contradicts the handbook.
//
// The split is a MOVE, not a rewrite: `index.ts` re-exports exactly the same names from the same
// package root, so every existing consumer (`services/sync-gateway`, `sync-client`'s ws transport,
// every suite) is byte-identically unaffected. What is new is the `@restos/sync-protocol/messages`
// subpath, which is this file and reaches nothing a phone lacks — the same mechanism, and the same
// reason, as `@restos/sync-client/fold-engine`.
//
// Nothing here may import `node:*` again. A device that cannot parse a frame cannot sync.
import {
  DEVICE_CLASSES,
  EventEnvelope,
  ORDER_CHANNELS,
  PERSON_STATUSES,
  ROLES,
} from "@restos/domain";
import { z } from "zod";

/**
 * `01-F77` — **`v: 1` → `v: 2`.** `01-F75` supersedes `catalog_request` / `catalog_response` /
 * `catalog_notice`; removing kinds is not additive, so `00 §6`'s rule binds without
 * interpretation.
 *
 * ⚠ **THE N−1 READER IS DEFERRED, NOT WITHDRAWN** (`01-F77`, founder ruling). R4 puts nothing in
 * the field — no deployment has ever run `v: 1` — so a `v: 1` reader would be a compatibility
 * target that does not exist, which is the speculative work `24 §3b` forbids by name. It lands,
 * with the three retained `v: 1` fixtures and the per-session negotiation, before the first pilot
 * device is paired. Until then `v` is a version the whole system moves in ONE step, and a `v: 1`
 * frame is REFUSED rather than half-understood.
 */
export const PROTOCOL_VERSION = 2;

const v = z.literal(PROTOCOL_VERSION);
const seq = z.number().int().nonnegative();

/** Envelope as carried in merged streams — cloud may have stamped global_seq (01-F3). */
export const WireEnvelope = EventEnvelope.extend({ global_seq: seq.optional() });

/**
 * One catalog entity on the wire — **exported so the WRITER can validate against it.**
 *
 * It has to be one definition. When this lived inline in `catalog_response`, only the read path
 * knew the rules: `publishCatalog` stored anything the Postgres column accepted, and an entry
 * with an empty `name` then made the whole frame unserialisable. The throw landed on the SERVER,
 * inside dispatch, where the handler closes the socket — so one blank name from a bulk import
 * (`15 §42` names that path) put every device in the org into a permanent reconnect loop, taking
 * the ledger push path down with it. Not self-healing either: a corrective publish does not help
 * a device asking for a delta whose range still spans the poisoned version.
 *
 * Validating at the writer is the fix; this export is what makes "the same rules" literal
 * rather than a comment asking two files to agree.
 */
export const CatalogEntryWire = z.object({
  kind: z.string().min(1),
  id: z.string().min(1),
  name: z.string().min(1),
  /** 03-F38 — a short kitchen name, so long item names stop being a KOT layout problem. */
  kitchen_name: z.union([z.string().min(1), z.null()]).optional(),
  parent_id: z.union([z.string().min(1), z.null()]).optional(),
  /**
   * Display order. Bounded to a safe integer because the column is `bigint`: a value past 2^53
   * round-trips lossily through `Number()`, which would silently reorder a menu.
   */
  sort: z
    .number()
    .int()
    .min(-(2 ** 53) + 1)
    .max(2 ** 53 - 1)
    .optional(),
  /**
   * `01-F55` — deletion is a TOMBSTONE. A reprint of an order placed before an item was
   * deleted must still render its name, so a delete travels as a marked entry rather
   * than as an absence. This is also why a snapshot carries its tombstones: the oracle
   * round found that clearing and re-inserting destroyed every one of them, and made
   * `01-F55` fail on its own named scenario after any recovery.
   */
  deleted: z.boolean().optional(),
  /**
   * `01-F60` — the price, per `(branch, channel)` pair, in integer paisa (`00 §6`).
   *
   * A flat list rather than a nested map because a map key must be a string and a `branch_id`
   * is data, not a shape: nesting would make the wire's structure depend on which branches an
   * org happens to have, and JSON object key order is not something a golden fixture can pin.
   *
   * **Optional on the wire, and that is not a relaxation.** `01-F60` puts completeness "at the
   * WRITER", so `publishCatalog` refuses an entry that omits an enabled pair; the wire must
   * still carry categories and modifier groups, which are priced by nothing.
   *
   * `price_paisa` is bounded to a safe integer for the same reason `sort` is: the column is
   * `bigint`, and a value past 2^53 round-trips lossily through `Number()` — which for a price
   * is a silently wrong bill rather than a reordered menu.
   */
  prices: z
    .array(
      z.object({
        branch_id: z.string().min(1),
        /**
         * `02-F42`'s CLOSED set, not a free string — declared once in `domain` and reused here
         * rather than restated (`18 §4`).
         *
         * A price keyed to a channel that does not exist is money nobody can resolve: `01-F60`
         * looks a price up by the ORDER's channel, so a `dine_in` key (an order TYPE, `02-F1`)
         * matches no lookup ever and the item reads as unpriced on every real channel. Refusing
         * it here is what stops that reaching a device — and this is the wire, so it is also
         * what stops it being stored.
         */
        channel: z.enum(ORDER_CHANNELS),
        price_paisa: z
          .number()
          .int()
          .min(0)
          .max(2 ** 53 - 1),
      }),
    )
    .optional(),
  /**
   * `03-F50` — the kitchen station that cooks this, joining `kitchen_name` as catalog data
   * rather than layer-2 config.
   *
   * Optional because absence is **inheritance**, not "no station": an entry with none takes its
   * parent's through the `01-F21` chain, and one with none anywhere up the chain resolves to the
   * default station rather than vanishing from every ticket.
   */
  station: z.union([z.string().min(1), z.null()]).optional(),
});
export type CatalogEntryWireT = z.infer<typeof CatalogEntryWire>;

/**
 * `01-F76` — **an artifact is `(resource, scope)`, and a version number is meaningless without
 * it.** The scope is STRUCTURED and never a concatenation (`01-F71` (d), quoted by `01-F76`):
 * `("ab","c")` and `("a","bc")` are different tenants, and a separator-less key maps both to one
 * set with no error in it.
 *
 * **One SHAPE for every resource** — `{ org_id, branch_id }`, `branch_id: null` meaning org scope
 * — so a reader never switches on `resource` before it can parse the key it is about to authorize
 * (`01-F71` (e)). What narrows per resource is the legal VALUE of `branch_id`, which is why there
 * are two constants below and not two shapes: `01-F52`/`01-F76` fix the catalog at ORG scope
 * ("byte-identical everywhere … nothing here re-opens it") and the roster at BRANCH scope ("the
 * reason is the credential"). Neither named refusal reaches that pairing — `01-F71` (e) compares
 * the frame's key to the SESSION's and only on the request leg, and `01-F76`'s device-side
 * `foreign_artifact` asks whether the key is one of this device's own, which a catalog response
 * scoped to its own branch answers yes to. So the FRAME is where a `staff` roster at org scope
 * (every branch's credentials in one artifact) and a branch-scoped `catalog` (one version number
 * meaning different bytes on different devices) are made unrepresentable, on `01-F75`'s own
 * argument for typing `entries[]` per resource.
 */
const OrgScope = z.object({ org_id: z.string().min(1), branch_id: z.null() });
const BranchScope = z.object({ org_id: z.string().min(1), branch_id: z.string().min(1) });

/**
 * **A CREDENTIAL FIELD ON THIS WIRE, DECLARED ONCE.** `11-F21` puts a PIN in exactly two places
 * for exactly as long as each takes — *"the keypad it is typed on and the argument to a verify
 * call"* — and `14 §2` says PINs are never present in payloads. A `min(1)` string in a field
 * NAMED for a hash accepts `"4821"` and every other assertion in a suite still passes, so
 * `01-F75`'s argument for typing `entries[]` per resource applies to the field as well as to the
 * row: the FRAME is where such a payload is made unrepresentable.
 *
 * ⚠ **ONE DECLARATION BECAUSE THE FIRST BUILD MADE TWO AND ONLY ONE WAS CONSTRAINED.** The guard
 * landed on `credential_change_request.new_pin_hash` — the frame whose serve path is not built and
 * which therefore has no producer — while `StaffEntryWire.pin_hash`, the field that carries a
 * credential to **every till in a branch on every roster fetch**, stayed `z.string().min(1)` and
 * parsed `"4821"`. Same reasoning, one field over, aimed at the case that could not happen. A
 * shared schema is what stops the next credential field repeating it: adding one is now a choice
 * between this name and a bare string, rather than a copy nobody notices is missing.
 *
 * **It is a PREFIX check and not a PHC parse**, deliberately and stated so no reader over-reads
 * it: `"$argon2id$4821"` satisfies this. What it buys is that a typed PIN — the only credential
 * shape a human can produce at a keypad — is unrepresentable, and that anything else is a format
 * `packages/domain`'s `hashPin` does not mint. Parsing the parameter block would be a second
 * interpretation of Argon2id's encoding beside `domain`'s (`18 §2`), and `verifyPin` is the one
 * that already has to be right.
 *
 * Refusals never echo the offending VALUE — zod 4's issues carry the path and the pattern, not
 * the input, which is what keeps a rejected credential out of a log line.
 */
const Argon2idHash = z
  .string()
  .min(1)
  .regex(/^\$argon2id\$/, {
    error:
      "11-F21/01-F61: a credential field carries an Argon2id hash as `packages/domain`'s " +
      "`hashPin` mints it — never a PIN, and never a credential format this product does not " +
      "produce",
  });

/**
 * `01-F75`'s `staff` row — **exported so the WRITER can validate against it**, for the reason
 * `CatalogEntryWire` already records: a resource whose row is loose at the wire is a resource
 * whose bad row is discovered on a till, and one unparseable member refuses the ENTIRE update
 * (`01-F56` `malformed`), which for `staff` is a branch nobody can sign in to.
 *
 * The fields and their owners, transcribed: `user_id`; `display_name`, **required on the wire**
 * (`11-F20` — the device type's optionality is a migration artifact and not a wire rule);
 * `grid_ordinal` (`01-F61`, explicit because that FR bans a derived tiebreak); `status`
 * (`11-F22`, and this artifact is branch-scoped so the single word IS this branch's
 * participation); `assignments` (`01-F26`); and `pin_hash` **only on an `active` member**
 * (`11-F21` — a hash on a non-active entry is a credential no verifier can ever reach, pure blast
 * radius with no function).
 *
 * ⚠ **A MISSING `pin_hash` ON A NON-`active` MEMBER IS THE SPECIFIED SHAPE, NEVER `malformed`**
 * (`01-F75`), and an `active` member with none is legal too — R29 has the owner set a person's
 * first PIN, so "active, no credential yet" is a real published state. Both neighbours of the
 * refinement below are one keystroke away in English and nothing alike in the code.
 *
 * The closed sets are `packages/domain`'s (`18 §4`) — `ROLES` and `PERSON_STATUSES` — reused here
 * exactly as `DEVICE_CLASSES` and `ORDER_CHANNELS` already are, so the wire cannot drift from the
 * matrix that answers "may she act".
 */
export const StaffEntryWire = z
  .object({
    user_id: z.string().min(1),
    display_name: z.string().min(1),
    grid_ordinal: z.number().int(),
    status: z.enum(PERSON_STATUSES),
    /**
     * `01-F26`'s `(role, location)` pair, org-wide as `branch_id: null`. It carries **no status**:
     * `11-F22`'s participation rides the assignment in STORAGE and the row's single `status` is
     * this branch's on the wire, so a second carrier would be two representations of one fact
     * with nothing ruling which wins.
     *
     * **Non-empty** — `01-F78` half one puts in a branch roster exactly the people whose
     * assignments REACH it, and says a person whose only assignments are elsewhere is "absent
     * from this artifact entirely". A row with none is that person published anyway, and what she
     * costs is a tile on `01-F61`'s grid that `can()` then refuses every act to.
     */
    assignments: z
      .array(
        z.object({
          role: z.enum(ROLES),
          branch_id: z.union([z.string().min(1), z.null()]),
        }),
      )
      .min(1),
    /**
     * `11-F21`'s credential, and the field this whole artifact's blast radius is measured in
     * (`01-F76`/R25 made the roster branch-scoped for it). `Argon2idHash` rather than a bare
     * string: see that declaration for why the constraint belongs on the FRAME, and for the
     * measured reason it is declared once.
     */
    pin_hash: Argon2idHash.optional(),
  })
  .superRefine((entry, ctx) => {
    if (entry.status !== "active" && entry.pin_hash !== undefined)
      ctx.addIssue({
        code: "custom",
        path: ["pin_hash"],
        message:
          "11-F21: the PIN hash rides an `active` entry only — a hash on a non-`active` member " +
          "is a credential no verifier can ever reach",
      });
  });
export type StaffEntryWireT = z.infer<typeof StaffEntryWire>;

/**
 * `01-F81` (a) — **one row of `01-F74`'s branch device roster: exactly four facts.**
 *
 * `device_id`, `device_class`, the certificate fingerprint, and revocation state. Nothing else,
 * and in particular **no key material and no credential**: a fingerprint is a public hash of a
 * certificate its holder already presents on the wire (`01-F72` (b)), which is why this artifact's
 * branch scope is `01-F74`'s own (a roster is per branch) rather than R25's credential argument.
 *
 * ⚠ **`device_class` IS OPEN TEXT AND `z.enum(DEVICE_CLASSES)` IS THE WRONG ANSWER HERE**, on the
 * FR's own stated reason (`01-F81` (a), `01-F56`'s forward-skew problem, `DEC-SYNC-011`): *"an
 * older build must not refuse a whole roster because the cloud learned a class it has not"*. One
 * unparseable member refuses the ENTIRE update (`01-F56` `malformed`), so the day a new class
 * ships would be the day every older till loses its branch LAN — a stopped branch (`01-F17`).
 * Admitting it is safe because `01-F39`'s hub-eligible set is a closed membership test, so an
 * unrecognised class simply never wins an election; `packages/sync-client`'s `lan-roster.ts` and
 * `createLanAdmission` already refuse the enum for the same reason, in those words.
 *
 * The fingerprint is **lowercase hex SHA-256 of the DER** (`01-F81` (a)) and the regex is that
 * sentence. It is asserted at the FRAME rather than left to the device because `lan-roster.ts`
 * refuses anything else as `malformed` on arrival — deliberately, so a mixed-case or truncated
 * fingerprint is loud at the boundary rather than a silent never-admits at every handshake
 * afterwards. A frame schema that let one through would move that failure to the place the FR
 * avoided.
 */
const DeviceRosterEntryWire = z.object({
  device_id: z.string().min(1),
  device_class: z.string().min(1),
  cert_sha256: z.string().regex(/^[0-9a-f]{64}$/, {
    error:
      "01-F81 (a): the certificate fingerprint is the lowercase hex SHA-256 of the DER — a " +
      "mixed-case or truncated fingerprint matches no handshake this product can make",
  }),
  /**
   * `01-F75`'s no-removals-list rule is what makes this a FIELD and not an absence: a delta
   * carries one entry per changed id, so a device that simply vanished from the artifact is a
   * change a delta has no way to state, and an absence would silently leave every
   * non-snapshotting device admitting a departed peer (`01-F81` (a)). In THIS artifact the mark
   * IS the revocation field.
   */
  revoked: z.boolean(),
});

/**
 * `01-F87` — **one layer-2 setting as the `config` artifact carries it.**
 *
 * `config` is `01-F75`'s FOURTH member (`01-F75`'s closed-set clause, amended by `01-F87`), org
 * scoped with `branch_id: null`, on the frame triple that already exists and adding **zero**
 * message kinds.
 *
 * ⚠ **`value` IS DELIBERATELY LOOSE HERE AND STRICT AT BOTH ENDS, WHICH IS THE ONE PLACE THIS ARM
 * DEPARTS FROM `staff`'s SHAPE.** `01-F75` says a resource whose row is loose at the wire is a
 * resource whose rules live at the writer, and for THIS resource that is forced rather than
 * chosen: `01-F87` (a) makes the KEY SPACE OPEN — *"no FR supplies a closed list"*, because
 * `00 §7` grows it with every module doc — so a discriminated union over key names could not be
 * written without freezing a set the corpus keeps open, and a device would then refuse a key
 * added by a newer cloud instead of ignoring it (`01-F87` (b)).
 *
 * The strictness is at the two ends where it can be exercised, and both are ONE declaration:
 * `@restos/domain/config`'s `refuseConfigWrite` at the writer (`14-F48`, `01-F60`'s precedent —
 * *"a typo is caught once at a failed save instead of frozen forever in an append-only ledger"*)
 * and `parseConfigArtifact` at the device, where `01-F87` (b)'s split lives: **an unknown key is
 * ignored, a MALFORMED KNOWN key refuses the whole artifact.** That split is only expressible
 * because this field is loose — a frame that refused a malformed value would turn `01-F56`'s
 * observable `malformed` into a dropped socket, which is the stopped-till-through-a-validator
 * `01-F75` names.
 *
 * `deleted` is `01-F75`'s **marked entry, never an absence**, applied to a setting: it is a key
 * the owner has RESET to its declared default. It is a field rather than an omission for the same
 * reason `DeviceRosterEntryWire.revoked` is one — a delta carries one entry per changed key, so a
 * key that merely stopped appearing is a change a delta has no way to state.
 */
const ConfigEntryWire = z
  .object({
    /**
     * `00 §7`'s setting name. `min(1)` and nothing more, on `01-F87` (a)'s open-key-space rule —
     * a pattern asserted here would be a closed key space wearing a regex.
     */
    key: z.string().min(1),
    value: z.unknown().optional(),
    deleted: z.boolean().optional(),
  })
  .check((ctx) => {
    // A reset carries no value and a set carries one. Without this, `{ key }` alone is a legal
    // frame meaning neither — and `parseConfigArtifact` would read it as `value: undefined`, which
    // every key's schema refuses, so a writer that forgot the value would take an org's whole
    // configuration down at every till through `01-F87` (b)'s refusal. Making it unrepresentable
    // is `01-F75`'s own argument for typing `entries[]` per resource.
    const marked = ctx.value.deleted === true;
    const hasValue = ctx.value.value !== undefined;
    if (marked && hasValue)
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: ["value"],
        message:
          "01-F75/01-F87: a RESET key carries no value — a marked entry with a value states two " +
          "different things about one setting",
      });
    if (!marked && !hasValue)
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: ["value"],
        message:
          "01-F87: a configured key carries its value. An entry with neither a value nor " +
          "`deleted: true` states nothing, and would reach the device as a malformed known key " +
          "and refuse the org's whole artifact (01-F87 (b))",
      });
  });

/**
 * `01-F81` (b)/(d) — **the signature envelope, a REQUIRED member of the `device_roster` arm and
 * absent from the others.**
 *
 * (d) is explicit about why it is not an optional field on the shared response body: *"an optional
 * protection is one an implementation can simply not supply — this corpus's most-repeated defect
 * and precisely the shape `seams:check` Rule B exists for — while a required per-arm member makes
 * an unsigned device roster **unrepresentable**"*. `staff` stays unsigned by the same clause, and
 * extending this envelope to it is a further amendment to doc 01 (the precondition of `01-F75`
 * (ii)'s LAN reference-data leg), never an implementation's choice.
 *
 * ⚠ **THREE PINNED INTERPRETATIONS, contestable in review rather than in an implementation**
 * (`01-F76`'s precedent, and `01-F81` (b) pins its own domain-separation prefix the same way).
 * `01-F81` (b) says WHAT the signature covers and with WHICH algorithm; it does not name the wire
 * field, its encoding, or its shape. A frame cannot be built without answering all three, so they
 * are answered HERE, once: (i) the field is `signature`; (ii) it carries `{ alg, signed_at,
 * value }`; (iii) `value` is base64 of the raw IEEE-P1363 (`r‖s`, 64 bytes) signature WebCrypto
 * produces, which `packages/lan-pki` already drives. The device-side oracle
 * (`packages/sync-client/src/__acceptance__/device-roster-distribution.test.ts`) makes the same
 * three pins in its header and states that if the two disagree, that file moves.
 *
 * **The LENGTH is deliberately not pinned** even though pin (iii) determines it: the only code
 * that can decode this value is the verifier, which does not exist yet (`01-F81` (c)'s pinned
 * roster-signing key arrives at pairing, and `01-F80`'s claim endpoint is unbuilt), and a length
 * asserted here plus a length asserted there is two interpretations of one encoding — `03-F40`'s
 * defect, which `01-F81` (b) names by name when it reuses `01-F5`'s canonical JSON rather than
 * minting a second one. The alphabet is asserted because it costs nothing and pins no encoding.
 *
 * `signed_at` is epoch milliseconds and exists **for `00 §5.7`'s age display and nothing else**
 * (`01-F81` (b)): `01-F74` (d) admits an old roster, so no implementation may refuse on age, and
 * it is never an input to any fold (`01-F34`, `01-F45`).
 *
 * ⚠ **OWED, RECORDED HERE BECAUSE NOTHING ELSE CAN SEE IT: `01-F75` REQUIRES A GOLDEN FIXTURE PER
 * MEMBER AND `device_roster` HAS NONE.** That clause makes a member *"an amendment to this clause
 * plus its own golden fixture"*, and `01-F81` landed the member without the fixture. **The
 * omission is silent in BOTH directions**, which is why it is written down rather than left to a
 * rail: `reference-fixtures.test.ts` §J1 requires a fixture per KIND and not per RESOURCE, so the
 * three `reference_*` fixtures satisfy it with two resources; and §J7 pins the fixture set's
 * resources to exactly `{catalog, staff}`, so ADDING the missing fixture reddens that oracle until
 * it moves in the same change. Nothing in between fails.
 *
 * **The stated reason for deferring it is real and it is not the whole story.** A golden file
 * carrying a FABRICATED signature would pin a contract no signer has ever made — `01-F81` (b)/(c)
 * put the roster-signing key on the cloud plane and `01-F80`'s claim endpoint is unbuilt — so the
 * fixture is owed with the gateway serve path, which is what can produce a real one. What that
 * argument does not cover is the rest of the frame: both suites landed with this member already
 * build well-formed-invalid envelopes (`device-roster-apply.test.ts`'s `SIGNATURE`,
 * `device-roster-distribution.test.ts`'s), so the shape of every OTHER field on this arm could be
 * pinned today by a fixture whose envelope is marked as unsigned-by-a-real-key. That is an
 * implementer deviating from an explicit spec requirement, and the deviation belongs to whoever
 * lands the serve path.
 */
const ReferenceSignature = z.object({
  alg: z.literal("ES256"),
  signed_at: z.number().int().nonnegative(),
  value: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/, {
    error: "01-F81 (b): the signature travels base64-encoded",
  }),
});

/**
 * `01-F75`'s triple, assembled per resource. The bodies below are `catalog_*`'s existing
 * vocabulary, unchanged and now generic; only the `(resource, scope)` key and the per-resource
 * `entries[]` are new.
 */
const referenceRequestBody = {
  v,
  kind: z.literal("reference_request"),
  /** What the device has now for THIS key. `0` means "nothing", and gets a snapshot. */
  have_version: seq,
  /**
   * **The version this fetch is TOWARD**, echoed from the first page's response.
   *
   * ⚠ `01-F75`: it is a **CONTINUATION, never a selector** — honoured only when `from > 0`, and a
   * first page is served the CURRENT version whatever it asks for. That rule is the SERVE path's
   * to enforce (`services/sync-gateway`); the wire carries the field, and carries it uniformly
   * across resources so nobody reproduces a per-resource carve-out incorrectly.
   */
  at_version: seq.optional(),
  /** Paging cursor, echoed from a previous response's `next_from`. */
  from: seq.optional(),
};

const referenceResponseBody = {
  v,
  kind: z.literal("reference_response"),
  form: z.enum(["snapshot", "delta"]),
  /** The version this payload brings the device TO, for this key. */
  version: seq,
  /** For a delta, the exact base it applies to. A device holding anything else refuses. */
  base_version: seq.optional(),
  /**
   * Paging, in `catchup_response`'s vocabulary rather than a second idiom. **A snapshot must
   * apply ATOMICALLY** — the device must never hold half an artifact — so paged snapshot chunks
   * accumulate and commit on `complete`.
   */
  complete: z.boolean(),
  next_from: seq,
};

/**
 * `01-F76`'s artifact key as `hello_ack` carries it (`01-F77`) — **an ARRAY of
 * `{ resource, scope, version }` and not a map**, because a map key over two fields is the
 * concatenation `01-F76` bans and this is the one place the ban would be easiest to break by
 * convenience.
 *
 * `version` is `min(1)`, not `nonnegative`: `catalog_version`'s omitted-never-zero rule survives
 * PER KEY (`01-F77`) — an artifact the org has published nothing for is **omitted, never sent as
 * `0`**, so that case stays indistinguishable from a gateway that does not serve the resource. In
 * both the device simply never asks, which is right for both, and a `0` over a key makes the two
 * distinguishable again while looking perfectly well-formed.
 */
const ReferenceVersionKey = z.discriminatedUnion("resource", [
  z.object({ resource: z.literal("catalog"), scope: OrgScope, version: z.number().int().min(1) }),
  z.object({ resource: z.literal("staff"), scope: BranchScope, version: z.number().int().min(1) }),
  // `01-F81` (a)/(e) — `device_roster`, BRANCH-scoped. (e) makes this key the staged-rollout
  // answer: a gateway that does not serve the roster OMITS it here, so a `device_roster`-capable
  // device meeting that gateway never asks, and a request for an unserved resource is then a
  // client that ignored the advertisement rather than a negotiation outcome.
  //
  // ⚠ This comment said "the THIRD member" and is now `01-F87`-stale in the direction that
  // matters: the RULE is that `01-F75`'s resource set is closed and its size is that clause's to
  // state, and the count has moved twice (`01-F81`, then `01-F87`'s `config`) in the month this
  // union has existed. The number lives in `01-F75`; a copy of it here acquires this file's shelf
  // life, which is `e74cffb`'s recorded lesson one layer down. What THIS union is, is the set of
  // members whose wire arm this build carries; `config` has none and adding one is a spec-directed
  // act plus its golden fixture, never an implementation's choice.
  z.object({
    resource: z.literal("device_roster"),
    scope: BranchScope,
    version: z.number().int().min(1),
  }),
  // `01-F87` — `config`, ORG-scoped, and the scope is the FR's own ruling rather than a default:
  // `00 §7` names layer 2 *"Organization (back office)"* and `01-F62`'s emitter test already puts
  // `config.changed` on the org side, so the artifact and the event agree. Layer-2 keys with a
  // BRANCH axis are ordinary and already shipping (`03-F51`'s routes, `01-F60`'s enabled set), and
  // that axis is **DATA inside one org artifact** — a branch-scoped artifact would make one
  // version number mean different bytes on different devices, destroying the premise `01-F56`'s
  // divergence detection rests on. The roster's opposite answer does not transfer, and `01-F87`
  // makes the reason checkable rather than stylistic: `staff` is branch-scoped *because it carries
  // an Argon2id hash and its scope is its blast radius*, and measured against `00 §7`'s layer-2
  // list no layer-2 key carries key material, a hash or a credential. ⚠ That is a measurement of
  // today's key set: a layer-2 key that ever carries a secret is a re-scoping act in `01-F87`,
  // never an implementer's judgement.
  z.object({ resource: z.literal("config"), scope: OrgScope, version: z.number().int().min(1) }),
]);

export const messageSchemas = {
  hello: z.object({
    v,
    kind: z.literal("hello"),
    device_id: z.string().min(1),
    device_class: z.enum(DEVICE_CLASSES),
    branch_id: z.string().min(1),
    token: z.string().min(1),
    last_global_seq: seq,
    own_high_water: seq,
    // Additive under v:1 (DEC-SYNC-010, T-01-19): this peer can DECODE compressed
    // frames. Advertising is half the contract — the grant only holds if the server
    // also accepts (hello_ack.compression). Absent ⇒ plain JSON for this connection's
    // whole life, which is the property that stops a new gateway stranding an old device.
    accepts_compression: z.boolean().optional(),
  }),
  hello_ack: z
    .object({
      v,
      kind: z.literal("hello_ack"),
      session_id: z.string().min(1),
      hub: z.boolean(),
      resume_from: seq,
      // Additive under v:1 (DEC-SYNC-009, T-01-12): true iff the session's token
      // carries the hub-relay capability — the client-side gate for relaying.
      relay_authorized: z.boolean().optional(),
      // Additive under v:1 (DEC-AUTH-001, T-01-18): a silently re-issued device
      // token, present ONLY when one was actually minted (remaining life below the
      // configured threshold). Absent on an ordinary session, so healthy sessions —
      // and the committed golden transcript — stay byte-identical. Renewing on every
      // hello would destroy issuance determinism, which those fixtures depend on.
      renewed_token: z.string().min(1).optional(),
      // Additive under v:1 (DEC-SYNC-010, T-01-19). Granted IFF the client advertised
      // AND this server accepts — a closed vocabulary, so an unknown codec name is a
      // parse failure rather than a silent downgrade. Absent ⇒ plain, forever.
      compression: z.literal("zstd").optional(),
      /**
       * `01-F77` — **the per-artifact version set, which supersedes `catalog_version`.**
       *
       * ⚠ **This field is what makes the whole reference-data transport correct**, and every
       * notice is only latency on top. The device compares each key against its own stored
       * version and requests the ones it is behind on, so every reconnection reconciles —
       * including for a device offline a week that could not have heard an announcement. A design
       * that reconciled the roster only on a pushed notice gives a till nobody can sign in to
       * after a lossy week.
       *
       * `catalog_version` is GONE rather than retained: `01-F77` keeps it only "for as long as
       * the N−1 reader is", and that reader is deferred, so the two can never be both
       * authoritative on one session (a `v: 2` session reads the artifact set and nothing else).
       * An undeclared key is stripped (`01-F40`), so a gateway still emitting one cannot have it
       * read here by accident.
       *
       * ABSENT is legal and meaningful — an org that has published nothing has no keys at all.
       */
      reference_versions: z.array(ReferenceVersionKey).optional(),
    })
    .superRefine((ack, ctx) => {
      // `01-F76`: "A device holds one version *per key*, not one version" — so the array IS a
      // map, and a map cannot hold one key twice. Two entries for one key cost `01-F56`'s named
      // failure with no bad data anywhere: the device compares against whichever entry its reader
      // reaches first, and picking the lower one re-fetches forever while picking the higher one
      // never fetches again. No error is raised on either path.
      //
      // The key is the PAIR `(resource, scope)` and never `resource` alone: two branches' rosters
      // are two different keys, which is the case `01-F76` exists for. `JSON.stringify` over an
      // ARRAY is injective, so this is not the concatenation `01-F71` (d) bans (`["ab","c"]` and
      // `["a","bc"]` do not collide).
      const seen = new Set<string>();
      for (const [index, entry] of (ack.reference_versions ?? []).entries()) {
        const key = JSON.stringify([entry.resource, entry.scope.org_id, entry.scope.branch_id]);
        if (seen.has(key))
          ctx.addIssue({
            code: "custom",
            path: ["reference_versions", index],
            message:
              "01-F76/01-F77: one artifact key appears at most once — a key carried at two " +
              "versions leaves the device comparing against whichever entry it happens to read",
          });
        seen.add(key);
      }
    }),
  push: z.object({ v, kind: z.literal("push"), events: z.array(EventEnvelope), watermark: seq }),
  push_ack: z.object({
    v,
    kind: z.literal("push_ack"),
    acked_watermark: seq,
    // Additive under v:1 (DEC-SYNC-009, T-01-12): present iff the ack answers a
    // relay push — names the ORIGIN device whose stream acked_watermark
    // describes. Hub→origin over LAN, the same shape carries the relayed CLOUD
    // ack (origin_device_id = the receiving origin), the only LAN push_ack that
    // may move the cloud write-checkpoint (19 §5).
    origin_device_id: z.string().min(1).optional(),
    // Additive under v:1 (DEC-AUTH-001, T-01-18). Two carriers, one field:
    // (a) a DRAIN session's renewal — an expired-but-unrevoked device is admitted
    //     push-only (01-F47 "sole purpose"), so its renewal cannot ride hello_ack;
    //     it rides the ack of the push it was admitted to make.
    // (b) a hub-RELAYED origin's renewal — this ack already names its origin via
    //     origin_device_id, so the hub forwards it over LAN and a WAN-less device
    //     renews without ever holding WAN. That clause is what makes a 90-day TTL
    //     safe in a LAN-only deployment instead of bricking every waiter tablet.
    renewed_token: z.string().min(1).optional(),
  }),
  event_batch: z.object({ v, kind: z.literal("event_batch"), events: z.array(WireEnvelope) }),
  catchup_request: z.object({ v, kind: z.literal("catchup_request"), from_global_seq: seq }),
  catchup_response: z.object({
    v,
    kind: z.literal("catchup_response"),
    events: z.array(WireEnvelope),
    complete: z.boolean(),
    next_from: seq,
  }),
  /**
   * `01-F75` — **the ONE reference-data request, for every resource** (`01-F9`, `01-F52`..`F56`,
   * `01-F28`, `01-F61`, `11-F20`). It supersedes `catalog_request`.
   *
   * The device asks; the server decides snapshot vs delta from `have_version`. A delta if it can
   * construct one from that EXACT base, a snapshot otherwise — including `have_version: 0` and a
   * base too old to reconstruct. The device's `needs_snapshot` refusal (`01-F56`) is the belt to
   * that brace.
   *
   * ⚠ **THE SERVER DERIVES THE KEY FROM THE SESSION AND REFUSES A REQUEST STATING ANOTHER**
   * (`01-F71` (e)) — never clamps. This is the first frame that puts a tenant key in bytes a
   * caller controls: `catalog_request` carried no tenant at all and the org was read from the
   * session. Under R25 the roster's scope IS its credential blast radius, so a device free to
   * name a branch defeats that ruling in one field. `01-F76`'s device-side `foreign_artifact`
   * refusal is the belt, never a substitute (commandment 8). Neither refusal lives here: a frame
   * can carry a key, only a session can judge it.
   */
  reference_request: z.discriminatedUnion("resource", [
    z.object({ ...referenceRequestBody, resource: z.literal("catalog"), scope: OrgScope }),
    z.object({ ...referenceRequestBody, resource: z.literal("staff"), scope: BranchScope }),
    // `01-F81` (a) — the roster rides `01-F75`'s OWN triple, never a fourth bespoke chain and
    // never a `reference_response` typed for another resource (`01-F74` (b)'s smuggling ban
    // survives its own unblocking).
    z.object({ ...referenceRequestBody, resource: z.literal("device_roster"), scope: BranchScope }),
    // `01-F87` — `config` on the SAME triple, adding zero message kinds. ORG-scoped; see
    // `ReferenceVersionKey` for why the scope is not the roster's.
    z.object({ ...referenceRequestBody, resource: z.literal("config"), scope: OrgScope }),
  ]),
  /**
   * `01-F75`/`01-F76` — `catalog_response`'s body plus the artifact key, which the response
   * **echoes** so a device can refuse an artifact that is not its own.
   *
   * **`entries[]` is typed PER RESOURCE**, and the frame is what makes a cross-resource payload
   * unrepresentable: `CatalogEntryWire.kind` is open at the wire by design, so a row alone could
   * never carry that guarantee. One unparseable member refuses the ENTIRE update (`01-F56`
   * `malformed`) — for `staff` that is a branch nobody can sign in to, which is why the row
   * schema is validated at the WRITER and not only here.
   *
   * **No removals list, for any resource** (`01-F55`, `11-F22`, R26): a departure is a MARKED
   * ENTRY and never an absence. A removals list collapses *may she act* and *does she render*
   * into one bit and answers the second by accident while answering the first.
   */
  reference_response: z
    .discriminatedUnion("resource", [
      z.object({
        ...referenceResponseBody,
        resource: z.literal("catalog"),
        scope: OrgScope,
        entries: z.array(CatalogEntryWire),
      }),
      z.object({
        ...referenceResponseBody,
        resource: z.literal("staff"),
        scope: BranchScope,
        entries: z.array(StaffEntryWire),
      }),
      z.object({
        ...referenceResponseBody,
        resource: z.literal("device_roster"),
        scope: BranchScope,
        entries: z.array(DeviceRosterEntryWire),
        // `01-F81` (d) — REQUIRED, and required HERE rather than on `referenceResponseBody`,
        // which is what makes an unsigned device roster unrepresentable while leaving `staff`
        // unsigned. A shared optional field is forgettable; a shared required one breaks every
        // staff publisher at once.
        signature: ReferenceSignature,
      }),
      // `01-F87` — the `config` artifact. No signature: `01-F81` (d) requires one for the roster
      // because that artifact decides LAN admission, and this one carries no credential, so the
      // question `01-F81` (d) answers does not arise here and `01-F87` says so in terms. Its
      // `entries[]` is `ConfigEntryWire`, whose `value` is loose for the reason stated there.
      z.object({
        ...referenceResponseBody,
        resource: z.literal("config"),
        scope: OrgScope,
        entries: z.array(ConfigEntryWire),
      }),
    ])
    .superRefine((frame, ctx) => {
      // `01-F56`/`01-F75`: `base_version` rides a DELTA and only a delta. A delta with no base
      // leaves the device nothing to match, so it can neither apply the frame nor refuse it for
      // the right reason — `01-F56`'s whole detection mechanism becomes a field that was not
      // sent. A base on a SNAPSHOT is the mirror: a snapshot applies ATOMICALLY and REPLACES, so
      // the value is one no reader can act on and one an implementer will eventually act on.
      if (frame.form === "delta" && frame.base_version === undefined)
        ctx.addIssue({
          code: "custom",
          path: ["base_version"],
          message: "01-F56: a delta states the exact base it applies to, or it cannot be refused",
        });
      if (frame.form === "snapshot" && frame.base_version !== undefined)
        ctx.addIssue({
          code: "custom",
          path: ["base_version"],
          message: "01-F75: a snapshot REPLACES, so it applies to no base",
        });
      if (frame.resource === "config") {
        // `01-F75` — **unique within the artifact**, and on this resource that rule is money.
        // Two rows for one key make ARRAY POSITION decide a tax rate, which is `01-F34`'s hazard
        // arriving through a settings screen; `StaffEntryWire`'s `user_id` rule is the same
        // sentence one resource over. A frame sees ONE page, so the writer and the device enforce
        // it across a paged snapshot too.
        const keys = new Set<string>();
        for (const [index, entry] of frame.entries.entries()) {
          if (keys.has(entry.key))
            ctx.addIssue({
              code: "custom",
              path: ["entries", index, "key"],
              message:
                "01-F75/01-F87: one row per setting within the artifact — two rows for one key " +
                "let array position decide the value",
            });
          keys.add(entry.key);
        }
        return;
      }
      if (frame.resource !== "staff") return;

      // `01-F78` half two: **only the assignments that REACH this branch.** The frame can express
      // it because `01-F76` puts the artifact's own branch ON the frame. The cost of the other
      // answer is the FR's own — "a row carrying every branch's assignment also tells every till
      // the org's branch structure": `01-F71`'s isolation boundary crossed by reference data
      // rather than by a query, and R25's purchase spent a second way. The predicate is
      // `rolesAt`'s, verbatim, so an ORG-WIDE assignment is not another branch's and must pass —
      // refusing it would empty every owner's row and the non-empty floor above would then refuse
      // her outright, breaking both halves of `01-F78` with one over-wide guard.
      //
      // `user_id` and `grid_ordinal` are unique WITHIN THE ARTIFACT (`01-F75`). Two rows for one
      // person make `11-F22`'s status and `11-F21`'s hash ambiguous at once and let ARRAY
      // POSITION decide, with no error raised on either path; two rows sharing an ordinal
      // reintroduce exactly the derived tiebreak `01-F61` bans, and `02-F41` attributes an order
      // to whoever was tapped. A frame sees ONE page, so `01-F75`'s "unique within the artifact"
      // is also the writer's and the device's across a paged snapshot.
      const users = new Set<string>();
      const ordinals = new Set<number>();
      for (const [index, entry] of frame.entries.entries()) {
        for (const [at, assignment] of entry.assignments.entries())
          if (assignment.branch_id !== null && assignment.branch_id !== frame.scope.branch_id)
            ctx.addIssue({
              code: "custom",
              path: ["entries", index, "assignments", at, "branch_id"],
              message:
                "01-F78: a row carries only the assignments that reach THIS branch — org-wide " +
                "(null) or this branch's, never another's",
            });
        if (users.has(entry.user_id))
          ctx.addIssue({
            code: "custom",
            path: ["entries", index, "user_id"],
            message: "01-F75: one row per `user_id` within the artifact",
          });
        users.add(entry.user_id);
        if (ordinals.has(entry.grid_ordinal))
          ctx.addIssue({
            code: "custom",
            path: ["entries", index, "grid_ordinal"],
            message: "01-F75/01-F61: `grid_ordinal` is unique within the artifact",
          });
        ordinals.add(entry.grid_ordinal);
      }
    }),
  /**
   * `01-F75` — server→device, keyed by the artifact, carrying ONLY a version number.
   *
   * Covers a version changing DURING a live session, so an edit does not wait for the next
   * reconnect. It is a freshness optimisation and **the system is correct without it**, which is
   * the property that must survive the generalisation: a notice is exactly the kind of message a
   * lossy link drops, and `hello_ack.reference_versions` is what makes that cost freshness rather
   * than correctness. Fan-out is keyed by the artifact key, so a branch-scoped notice reaches
   * that branch's devices and no others (`01-F76`).
   */
  reference_notice: z.discriminatedUnion("resource", [
    z.object({
      v,
      kind: z.literal("reference_notice"),
      resource: z.literal("catalog"),
      scope: OrgScope,
      version: seq,
    }),
    z.object({
      v,
      kind: z.literal("reference_notice"),
      resource: z.literal("staff"),
      scope: BranchScope,
      version: seq,
    }),
    // `01-F81` (a) — `device_roster` on the third frame of `01-F75`'s triple. A notice carries no
    // artifact and therefore no signature: it is a version number, and the envelope is verified at
    // APPLY over the assembled artifact, never per frame (`01-F81` (b)).
    z.object({
      v,
      kind: z.literal("reference_notice"),
      resource: z.literal("device_roster"),
      scope: BranchScope,
      version: seq,
    }),
    // `01-F87` — `config` on the third frame of `01-F75`'s triple. ORG-scoped, so fan-out reaches
    // every device of the org rather than one branch's (`01-F76`: fan-out is keyed by the artifact
    // key). A notice is a freshness optimisation and the system is correct without it — an owner
    // who changes a rate at 14:00 has it on every connected till without waiting for a reconnect,
    // and a dropped notice costs latency because `hello_ack.reference_versions` reconciles anyway.
    z.object({
      v,
      kind: z.literal("reference_notice"),
      resource: z.literal("config"),
      scope: OrgScope,
      version: seq,
    }),
  ]),
  /**
   * `01-F79` — **the till asks the cloud to change its own operator's PIN, and what travels is a
   * HASH.** `14-F40` specifies the surface and cannot be built without this pair: `01-F62` makes
   * `user.changed` org-scoped, so a till has no legal envelope for it, and commandment 5 forbids
   * an operational screen calling `services/api`. The resolution is `05-F28`'s (c) with the
   * planes reversed — the till REQUESTS and the cloud RECORDS.
   *
   * **Deliberately NOT a reference-data frame.** `01-F75`'s triple is a PULL; this is a COMMAND
   * with an outcome, and folding it into `reference_request` would make one frame mean two things
   * the moment a second command appears. Narrow names over a generic `command` pair for the same
   * reason `01-F75` closed its resource set: a generic frame invites the next author to carry
   * something nobody ruled on.
   *
   * ⚠ **NEITHER PIN TRAVELS, AND THE CLOUD CANNOT RE-VERIFY THE OLD ONE BECAUSE IT NEVER
   * RECEIVES IT.** `11-F21` says a PIN exists in exactly two places for exactly as long as each
   * takes — "the keypad it is typed on and the argument to a verify call" — and `14 §2` says PINs
   * are never present in payloads. So the till verifies the old PIN against its SYNCED hash
   * (`01-F28`, which is what the roster carries one for) and hashes the new one locally at
   * `01-F61`'s parameters from `packages/domain`'s single declaration — a device and a cloud that
   * hash differently produce an offline refusal of a credential the owner has just set.
   *
   * The Argon2id prefix is asserted at the SCHEMA and not left to the fixture: a `min(1)` string
   * in a field named for a hash accepts a typed PIN, and `01-F75`'s argument for typing
   * `entries[]` per resource is that the FRAME is where such a payload is made unrepresentable.
   * ⚠ **That reasoning was written here and applied here ONLY**, while `StaffEntryWire.pin_hash`
   * — the field that actually carries credentials to devices — kept a bare `min(1)` string for a
   * round. Both now share `Argon2idHash`; see its declaration.
   *
   * `user_id` is here because the cloud enforces `14-F40`'s self-only rule by comparing the named
   * user to the SESSION's user, never to a field the device chose (`01-F71` (e) — an auth failure
   * and not a clamp). That comparison is the serve path's; that there IS something to compare is
   * the wire's.
   */
  credential_change_request: z.object({
    v,
    kind: z.literal("credential_change_request"),
    user_id: z.string().min(1),
    new_pin_hash: Argon2idHash,
  }),
  /**
   * `01-F79` — the outcome, one of a CLOSED set of four, **one of which is not a failure**.
   *
   * `changed` · `wrong_old_pin` (the till's local verify is the first gate; this is the cloud
   * refusing a request whose user does not match the session) · `not_permitted` · `unavailable`.
   *
   * ⚠ `unavailable` exists because this act REQUIRES the WAN, and that is correct rather than a
   * `00 §5.1` breach — the rule protects service, and a cashier who cannot change her PIN during
   * an outage still signs in with her current one and sells. The till must say WHICH of the four
   * happened; "it did not work" is `00 §5.7`'s failure, so a schema that could not carry one of
   * them would make that outcome unreportable.
   */
  credential_change_result: z.object({
    v,
    kind: z.literal("credential_change_result"),
    result: z.enum(["changed", "wrong_old_pin", "not_permitted", "unavailable"]),
  }),
  quarantine_notice: z.object({
    v,
    kind: z.literal("quarantine_notice"),
    event_id: z.string().min(1),
    reason: z.string().min(1),
  }),
  purge_command: z.object({ v, kind: z.literal("purge_command"), scope: z.literal("all") }),
  // `ping.t` is the sender's clock at send. Since the HUB heartbeats its followers
  // (01-F13), a follower's inbound ping already carries branch time — which is what
  // makes the 01-F43 offset acquisition need no protocol change at all.
  ping: z.object({ v, kind: z.literal("ping"), t: z.number().int() }),
  pong: z.object({ v, kind: z.literal("pong"), t: z.number().int() }),
} as const;

/**
 * @unreached-owed The wire vocabulary as a LIST. Both ends dispatch on a concrete `kind` through
 * `decodeMessage`, so nothing enumerates the set in production; the golden-fixture suites do. A
 * caller arrives with protocol-version negotiation or an admin/inspection surface.
 */
export const MESSAGE_KINDS = Object.keys(
  messageSchemas,
) as readonly (keyof typeof messageSchemas)[];
export type MessageKind = keyof typeof messageSchemas;

const union = z.discriminatedUnion("kind", [
  messageSchemas.hello,
  messageSchemas.hello_ack,
  messageSchemas.push,
  messageSchemas.push_ack,
  messageSchemas.event_batch,
  messageSchemas.catchup_request,
  messageSchemas.catchup_response,
  messageSchemas.reference_request,
  messageSchemas.reference_response,
  messageSchemas.reference_notice,
  messageSchemas.credential_change_request,
  messageSchemas.credential_change_result,
  messageSchemas.quarantine_notice,
  messageSchemas.purge_command,
  messageSchemas.ping,
  messageSchemas.pong,
]);

export type ProtocolMessage = z.infer<typeof union>;

export class UnknownMessageKindError extends Error {
  constructor(kind: unknown) {
    super(`unknown protocol message kind: ${String(kind)} (PROTOCOL.md is the closed message set)`);
    this.name = "UnknownMessageKindError";
  }
}

/**
 * `01-F77`/`00 §5.7` — a frame at any other `v` is REFUSED, and the refusal names the version
 * THIS build speaks.
 *
 * Deliberately NOT an `UnknownMessageKindError`: the kind may be perfectly well known and it is
 * the VERSION that is not, and reporting a mid-rollout fleet as "unknown kind" tells an operator
 * the wrong thing about which end to look at. `00 §5.7` makes "it did not work" the failure.
 *
 * ⚠ **THAT SENTENCE IS ONLY TRUE IF `v` IS TESTED BEFORE `kind`, AND FOR ONE ROUND IT WAS NOT.**
 * The three kinds `01-F75` REMOVED are the only ones for which "the kind may be perfectly well
 * known" is the whole point — a `v: 1` device speaks `catalog_request`, and on this build that
 * name is not in `messageSchemas`. Ordered kind-first, `{ v: 1, kind: "catalog_request" }`
 * answered *unknown protocol message kind*: precisely the wrong end, precisely for the fleet this
 * class exists to describe, while every kind that SURVIVED the bump reported the version and made
 * the defect invisible. The order below is therefore load-bearing and not stylistic — a frame is
 * judged at the version it claims to speak before it is judged against this build's vocabulary.
 *
 * Not exported: nothing outside this module has anything to do with the distinction while the
 * N−1 reader is deferred, and an exported class no shipping code reaches is the shape
 * `pnpm seams:check` exists to catch. The `name` is what reaches a log.
 */
class UnsupportedProtocolVersionError extends Error {
  constructor(received: unknown) {
    super(
      `unsupported protocol version: ${String(received)} — this build speaks v: ${PROTOCOL_VERSION} ` +
        "only (01-F77; the N−1 reader is deferred to the first pilot pairing)",
    );
    this.name = "UnsupportedProtocolVersionError";
  }
}

export const parseMessage = (value: unknown): ProtocolMessage => {
  if (typeof value === "object" && value !== null) {
    // ⚠ **VERSION FIRST, AND THE ORDER IS THE CONTRACT** — see `UnsupportedProtocolVersionError`.
    // A frame is judged at the version it CLAIMS before it is judged against this build's
    // vocabulary, because the kinds most likely to be unrecognised are exactly the ones an older
    // version had and this one removed (`01-F75`): kind-first answered "unknown kind" for the one
    // fleet the version error exists to describe.
    //
    // `v` is ONE shared literal on every kind (`01-F77`), so `ping` and `hello` are not exempt
    // because their bodies did not change: a gateway that parsed a `v: 1` hello and answered
    // `v: 2` would be rejected by the old device's own literal — no session, therefore no
    // `push_ack`, therefore an outbox that never drains (`19 §5`). The whole system moves in one
    // step. A MISSING `v` falls through to the schema, which requires it.
    if ("v" in value) {
      const version = (value as { v: unknown }).v;
      if (version !== PROTOCOL_VERSION) throw new UnsupportedProtocolVersionError(version);
    }
    if ("kind" in value) {
      const kind = (value as { kind: unknown }).kind;
      if (typeof kind !== "string" || !(kind in messageSchemas))
        throw new UnknownMessageKindError(kind);
    }
  }
  return union.parse(value);
};

export const encodeMessage = (message: ProtocolMessage): string => JSON.stringify(message);

export const decodeMessage = (text: string): ProtocolMessage => parseMessage(JSON.parse(text));

/** The negotiated framing for one connection; `undefined` = plain JSON (T-01-19). */
export type Compression = "zstd";

/**
 * Decide one connection's framing (DEC-SYNC-010, T-01-19). Both ends must opt in:
 * the peer advertises `accepts_compression` in its `hello`, and this end declares
 * whether it accepts. Either side declining yields plain JSON **for the life of the
 * connection** — that is the anti-stranding property, not a fallback. A newly
 * deployed gateway must never send frames an un-updated device cannot parse, which
 * in this product means a counter terminal that silently stops receiving orders.
 */
export const negotiateCompression = (
  // `| undefined` explicitly: the repo runs `exactOptionalPropertyTypes`, so a parsed
  // `hello` whose optional field is present-but-undefined is not assignable otherwise.
  hello: { accepts_compression?: boolean | undefined },
  selfAccepts: boolean,
): Compression | undefined =>
  hello.accepts_compression === true && selfAccepts ? "zstd" : undefined;

/**
 * A per-connection frame codec (T-01-19). `encode` returns a `string` for a plain
 * text frame and `Uint8Array` for a compressed binary one, so the TRANSPORT's own
 * text/binary distinction carries the framing — never the frame's contents.
 *
 * That typing is the anti-sniffing mechanism, and it is deliberate. Detecting the
 * zstd magic number would make the wire format depend on the message rather than on
 * the agreement, and a peer that can decode a compressed frame today may not after a
 * rollback. So an un-negotiated connection REFUSES a compressed frame even though it
 * could technically decode one.
 *
 * Decode tolerance is one-directional and also deliberate: a granted codec still
 * accepts plain frames, because the two ends do not switch in the same instant — the
 * `hello_ack` that grants compression is itself plain, and messages already in flight
 * behind it are too. A plain codec never accepts a compressed frame.
 */
export type FrameCodec = {
  encode(message: ProtocolMessage): string | Uint8Array;
  decode(frame: string | Uint8Array): ProtocolMessage;
};
