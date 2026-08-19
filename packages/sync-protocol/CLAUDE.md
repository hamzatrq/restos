# @restos/sync-protocol

**Owning spec: `specs/01-kernel-sync.md §8 + 20 §2.7` — read it before modifying anything here (AGENTS.md routing).**

- PROTECTED PATH. Wire types shared by sync-client and sync-gateway; golden fixtures keep the contract from drifting.
- **IMPLEMENTED (Wave 0).** See `README.md` for the module map and `PROTOCOL.md` for the wire spec. Golden fixtures pin the wire — changing one is a 20 §2.7 spec-review event.
- **⚠ THE WIRE IS `v: 2` (August 2026, `01-F75`/`01-F76`/`01-F77`/`01-F79`) AND THAT IS THE FIRST
  BREAKING CHANGE THIS PROTOCOL HAS HAD.** `catalog_request` / `catalog_response` /
  `catalog_notice` are **gone**, replaced by ONE resource-discriminated triple —
  `reference_request` / `reference_response` / `reference_notice` — keyed by an artifact
  `(resource, scope)` whose resource set is CLOSED at `catalog` and `staff`. `01-F79` adds
  `credential_change_request` / `credential_change_result`. `MESSAGE_KINDS` is **16**.
  - **The N−1 reader is DEFERRED, not withdrawn** (`01-F77`, founder ruling; R4 puts nothing in
    the field). A `v: 1` frame is REFUSED and the refusal **names `v: 2`** rather than reporting
    an unknown kind — the kind may be perfectly well known and it is the version that is not, and
    telling an operator mid-rollout the wrong thing about which end to look at is `00 §5.7`'s
    failure. **Do not build a `v: 1` reader here**: it lands with the three retained `v: 1`
    fixtures and per-session negotiation, before the first pilot device is paired, and `01-F77`
    is explicit that a reader alone is not an N−1 story.
    - ⚠ **THAT WAS FALSE FOR THE THREE KINDS IT IS ABOUT, AND THE ORDER IN `parseMessage` IS WHY
      (found by review, corrected 2026-08-19).** `kind` was tested BEFORE `v`, so
      `{ v: 1, kind: "catalog_request" }` answered *unknown protocol message kind* — the exact
      wrong end, for the exact fleet the sentence describes. For every kind that survived the bump
      the distinction is moot and the claim read as true; the only three where *"the kind may be
      perfectly well known"* is the whole point are the three `01-F75` removed. **`v` is now tested
      first and that ordering is the contract, not a style choice** — do not "tidy" the two checks
      back together. Measured after the fix: all three removed kinds at `v: 1` →
      `UnsupportedProtocolVersionError` naming `v: 2`; `catalog_request` at `v: 2` → still
      `UnknownMessageKindError`; `ping` at `v: 1` → the version error.
  - **`v` is ONE SHARED LITERAL and that is what makes a bump safe.** Every sender writes it
    inline, so a bump is a compile error at every construction site — measured on this one: 86
    TypeScript errors in 12 files, none inside this package. Do not replace those literals with
    `PROTOCOL_VERSION` "for safety"; the literal is what fails loudly.
  - **The three `reference_*` kinds are NESTED discriminated unions** (on `kind`, then on
    `resource`), which zod 4 supports and zod 3 did not. That nesting is what types `entries[]`
    per resource, pairs `catalog` with ORG scope and `staff` with BRANCH scope, and makes a
    cross-resource payload unrepresentable rather than merely wrong — `01-F75`'s own argument,
    because `CatalogEntryWire.kind` is open at the wire by design so a ROW can never carry that
    guarantee.
  - **`StaffEntryWire` is exported** for the reason `CatalogEntryWire` is: the WRITER validates
    against it. A blank `display_name` from a bulk import is `01-F56` `malformed`, and for
    `staff` that is a branch nobody can sign in to.
    - ⚠ **For one round no writer did, and the export's own comment said otherwise.** Measured
      2026-08-19, symbol-precise and comment-blind, its only non-test reference outside
      `messages.ts` was the barrel — while `CatalogEntryWire` is reached by four shipping files.
      `services/sync-gateway/src/staff.ts`'s `assertPublishable` now closes it inside
      `publishStaffRoster`. `seams:check` is blind here by construction (the export IS reached, by
      tests; the seam is not optional), which is why a comment claiming a protection is the thing
      to distrust: it retires the assertion the next session would have written.
  - ⚠ **Both credential fields are regex-constrained to an Argon2id **PREFIX** (`Argon2idHash`,
    one declaration), and that is load-bearing rather than decorative.** `11-F21`'s whole claim is
    that the PIN never travels; a `min(1)` string in a field named for a hash accepts `"4821"` and
    every other assertion in the suite still passes.
    - ⚠ **It is a PREFIX check, not a PHC parse — `"$argon2id$4821"` parses.** This bullet said
      *"PHC string"*; `messages.ts` itself worded it correctly, and the over-claim is corrected
      here rather than deleted because it is the kind that invites a reader to skip writing the
      parameter-block assertion they think already exists. Parsing the block would be a second
      interpretation of Argon2id's encoding beside `packages/domain`'s (`18 §2`).
    - ⚠ **It guarded `new_pin_hash` ONLY until 2026-08-19 — the frame with no producer — while
      `StaffEntryWire.pin_hash`, which carries a credential to every till in a branch on every
      roster fetch, stayed a bare `min(1)` string.** The reasoning was written at the guarded
      field and applied one field away from the one that matters, which is this chain's
      most-repeated defect, inside the change that names it. One shared `Argon2idHash` now, so
      adding a third credential field is a choice between a name and a bare string.
    - Refusals never echo the offending VALUE — measured against zod 4, whose issues carry the
      path and the pattern and not the input. `assertPublishable` reproduces that property by
      quoting `issue.path` + `issue.message` and never the input.
- **⚠ `messages.ts` MUST NOT import `node:*` again (August 2026).** It did — one line, for the zstd
  framing — and that made the whole package unbundlable for React Native: Metro cannot resolve
  `node:zlib`, so a phone could not reach the message PARSER, let alone a socket. The zstd half now
  lives in `compression.ts` and the root `index.ts` re-exports it under the same names, so **no
  consumer changed**. Two subpaths publish the portable half: `@restos/sync-protocol/messages`
  (schemas, `parseMessage`, `encodeMessage`) and `/transport` (the transport seam types).
- **A TYPE-ONLY import of the package ROOT still loads its module graph**, so `import type { … }
  from "@restos/sync-protocol"` in a file an RN program compiles is enough to break that program on
  `node:zlib`. `sync-client`'s `cloud-session.ts`, `wall-clock.ts` and `transport-rn.ts` use the
  subpaths for exactly that reason; the specifiers are load-bearing, not cosmetic. Verified by
  mutation: pointing `transport-rn.ts` at the root fails `pnpm -C apps/manager bundle:check` with
  *"Unable to resolve module node:zlib"*.
