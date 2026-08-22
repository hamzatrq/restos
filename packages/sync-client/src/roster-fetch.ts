import type { RosterEntry, RosterUpdate } from "./lan-roster.js";

/**
 * `01-F81` — the device half of the BRANCH DEVICE ROSTER transport: turning `reference_response`
 * frames for `resource: "device_roster"` into the `RosterUpdate` `lan-roster.ts` already
 * understands (`01-F74`, `01-F75`, `01-F76`).
 *
 * `staff-fetch.ts`'s shape verbatim, with its own `toEntry`, because `01-F75` puts all three
 * artifacts on ONE replication path and a third accumulator with a third idea of atomicity is a
 * third interpretation of it. A pure accumulator with no socket and no store in it: **a snapshot
 * must apply ATOMICALLY** (`01-F56`), and a branch's roster can exceed one frame. A device that
 * applied each page as it arrived would hold half a roster in the window between them — and half a
 * roster is half a branch that cannot be admitted to its own LAN (`01-F72`).
 *
 * A DELTA IS ACCUMULATED TOO, for `catalog-fetch.ts`'s recorded reason: a prefix of a delta is only
 * consistent if the device also records how far it got, and it does not — it would commit the
 * delta's FINAL version while holding a prefix of its rows.
 *
 * ## ⚠ THIS FILE DOES NOT VERIFY THE SIGNATURE, AND THAT IS A NAMED DEBT RATHER THAN AN OVERSIGHT
 *
 * `01-F81` (b) puts verification at APPLY, over the assembled artifact, and (c) has the public half
 * of the org's roster-signing key **pinned on the device at pairing** (`01-F80` (f)). No device
 * holds such a key: `01-F80`'s claim endpoint is unbuilt, `store.setLanCredential` has no shipping
 * caller, and nothing anywhere stores a roster-signing key. So a verifier written here would refuse
 * every artifact for want of a key it can never be given, which is a correct implementation that
 * blocks the transport this FR exists to open.
 *
 * What `01-F81` (d) DID close is that an unsigned roster is **unrepresentable on the wire**
 * (`packages/sync-protocol`: `signature` is a required member of the `device_roster` arm), so the
 * bytes a verifier needs are carried on every frame and the verifier is the only thing owed. What
 * it did NOT close — stated because this corpus records a shipped comment that claimed the class it
 * closed and not the one it left open — is that **the envelope carried is not checked here**.
 *
 * The exposure is bounded and the bound is the corpus's own: `01-F75` (ii)/(iii) records that the
 * reference-data channel has exactly ONE leg today, the cloud's, authenticated end to end, and that
 * a hub relays no reference data of any kind — which is precisely the argument that lets `staff`
 * carry `11-F21` Argon2id credentials on this same channel with no signature at all. On top of
 * that, `createLanMesh` refuses at the CREDENTIAL gate (`01-F72` (d)) before the roster is ever an
 * admission input, so on the shipped binary today this artifact grants nothing. **Both of those
 * facts stop being true in the same change: the one that lands `01-F80`'s pairing.** That change
 * pins the key (`01-F81` (c)) and makes the roster reachable as a trust anchor, so it is the change
 * the verifier must land with — not a later one.
 */

/**
 * One roster row as the wire carries it (`DeviceRosterEntryWire`).
 *
 * `device_class` is `string` and not `DeviceClass`: `01-F81` (a) makes it OPEN TEXT on `01-F56`'s
 * forward-skew reasoning, and `lan-roster.ts` stores it as open text for the same stated reason.
 * Narrowing it at this seam would reintroduce the whole-roster refusal both of them refuse.
 */
export type WireDeviceRosterEntry = {
  device_id: string;
  device_class: string;
  cert_sha256: string;
  revoked: boolean;
};

/**
 * The response body this accumulator reads.
 *
 * ⚠ **`signature` IS ABSENT FROM THIS TYPE ON PURPOSE, AND THAT IS THE ONE FIELD DROPPED AT THIS
 * SEAM.** `catalog-fetch.ts`'s `toEntry` dropping `prices` and `station` is this repo's worked
 * example of a reshape losing a field silently and failing 0 of 579 tests, so the omission is
 * declared rather than left to be discovered: nothing on this device can consume the envelope until
 * `01-F81` (c)'s key is pinned (see the header), and threading a value to a consumer that does not
 * exist is the speculative work `24 §3b` forbids. The frame carries it, the wire requires it, and
 * the verifier reads it from the frame when it lands.
 */
export type WireDeviceRosterResponse = {
  form: "snapshot" | "delta";
  version: number;
  base_version?: number | undefined;
  entries: readonly WireDeviceRosterEntry[];
  complete: boolean;
  next_from: number;
};

/**
 * What the caller should do next — `StaffFetchStep`'s shape, for its recorded reason: the
 * `done: false` arm carries no `update` key at all, so there is nothing a caller could apply by
 * mistake.
 */
export type DeviceRosterFetchStep =
  | { done: false; fetchMore: { have_version: number; from: number; at_version: number } }
  | { done: true; update: RosterUpdate }
  | { done: true; update: null };

/** Every field the wire carries, copied. See `WireDeviceRosterResponse` on the one that is not. */
const toEntry = (w: WireDeviceRosterEntry): RosterEntry => ({
  device_id: w.device_id,
  device_class: w.device_class,
  cert_sha256: w.cert_sha256,
  revoked: w.revoked,
});

/**
 * Accumulates `reference_response` pages for ONE roster fetch. Create it when a fetch starts;
 * discard it when the fetch ends or the connection drops — a half-accumulated roster from a dead
 * session must never merge with pages from the next one, which is why this holds no store reference
 * and cannot apply anything itself.
 */
export const createDeviceRosterFetch = (have_version: number) => {
  let pending: WireDeviceRosterEntry[] = [];
  /**
   * What page 1 said this fetch is. Every later page must agree, or the pages do not describe one
   * roster and combining them fabricates a third that never existed — the catalog's measured
   * defect, on the artifact that decides who may write to the branch ledger.
   */
  let shape: { form: "snapshot" | "delta"; version: number; base_version?: number } | null = null;

  return {
    /** Feed one frame. Returns whether to ask for more, and what to apply when finished. */
    accept(response: WireDeviceRosterResponse): DeviceRosterFetchStep {
      if (shape === null) {
        shape = {
          form: response.form,
          version: response.version,
          ...(response.base_version === undefined ? {} : { base_version: response.base_version }),
        };
      } else if (
        shape.form !== response.form ||
        shape.version !== response.version ||
        shape.base_version !== response.base_version
      ) {
        pending = [];
        shape = null;
        return { done: true, update: null };
      }

      pending = [...pending, ...response.entries];
      if (!response.complete) {
        return {
          done: false,
          // `at_version` pins the continuation to the version page 1 was serving, which is what
          // stops a publish between pages splicing two rosters into one version number.
          fetchMore: { have_version, from: response.next_from, at_version: response.version },
        };
      }
      shape = null;

      const entries = pending;
      pending = [];

      if (response.form === "snapshot") {
        return {
          done: true,
          update: { kind: "snapshot", version: response.version, entries: entries.map(toEntry) },
        };
      }

      // A delta with no base is not applicable — the store would have to guess what it applies to,
      // and guessing is how one device's roster diverges from every other's. Refuse by returning
      // nothing; the caller's next reconnect reconciles through `hello_ack`.
      if (response.base_version === undefined) return { done: true, update: null };

      // An empty delta at the version we already hold is the server saying "you are current".
      // Deliberately not an error — a device that reported a fault every time it was up to date
      // would send a manager to look for a problem that does not exist (`00 §5.7`).
      if (entries.length === 0 && response.version === response.base_version) {
        return { done: true, update: null };
      }

      return {
        done: true,
        update: {
          kind: "delta",
          from_version: response.base_version,
          version: response.version,
          upserts: entries.map(toEntry),
          // ALWAYS EMPTY. `01-F81` (a) makes the no-removals-list rule load-bearing for this
          // artifact: a departure travels as a MARKED ENTRY (the `revoked` field), because a
          // delta carries one entry per changed id and an id that simply vanished is a change a
          // delta has no way to state. `RosterDelta.removals` predates the wire and is
          // `lan-roster.ts`'s to keep or delete; this accumulator has nothing it could ever put
          // there, which is exactly what `staff-fetch.ts` records about its own.
          removals: [],
        },
      };
    },
  };
};

export type DeviceRosterFetch = ReturnType<typeof createDeviceRosterFetch>;
