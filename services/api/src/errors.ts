/**
 * `18 §5`'s error taxonomy, the slot this service actually needs: **`IntegrationError` (external
 * system, retriable flag)**.
 *
 * **The defect it closes.** `catalog.published` and `catalog.history` proxy to
 * `services/sync-gateway`. With the gateway down, `fetch` rejects with Node's own undici
 * `TypeError`, whose message is the string **`"fetch failed"`** and nothing else. tRPC normalises an
 * unrecognised throw into `INTERNAL_SERVER_ERROR` carrying that message verbatim, and the back
 * office renders it. An operator is then told a two-word sentence that is true of nothing they can
 * act on: not *what* failed, not *whose* fault it is, not *whether trying again will help*. `00 §5.7`
 * requires the opposite — a surface reports what is true, and a cloud surface degrades **honestly**
 * (`00 §5.1`).
 *
 * **Three properties, and each one is a question the operator was asking:**
 *
 *   - `dependency` — *what failed.* A name, not a stack. The back office talks to exactly one
 *     external system today and it still could not say which one.
 *   - `retriable` — *is this me or is this the world.* An unreachable peer is an infrastructure
 *     state; a rejected edit is not. Collapsing the two is what makes an owner re-check a menu that
 *     was never the problem. Carried as a flag rather than inferred from the message, because a
 *     client that pattern-matches a message is a client that breaks when the message improves.
 *   - `cause` — *the diagnosis, kept.* `24-F15` tracks catch-without-diagnose as a slop metric, and
 *     a caught error re-thrown with a nicer sentence and no `cause` is exactly that. The chain
 *     survives to the log; only the sentence is for the human.
 *
 * **Not in `packages/domain`, and that is a deliberate reading of `18 §3`** ("throw only `Error`
 * subclasses from `domain`"). The repo's standing precedent is a per-service taxonomy module —
 * `services/sync-gateway/src/errors.ts` declares `GatewayError` / `ProtocolViolationError` /
 * `AuthRejectedError` the same way — and `domain` is a protected path (Commandment 10) that this
 * change has no other reason to open. If a second service needs `IntegrationError` it moves to
 * `domain` then, as one reviewed change, rather than being predicted here (`24 §3b`).
 */

/**
 * An external system this service depends on did not answer, or answered in a way that says the
 * system is unhealthy rather than that the request was wrong.
 *
 * **Never used for a peer's REFUSAL.** A `400` from the gateway carrying `01-F60`'s "entry 3
 * (item/biryani) is not sellable — no price for branch b1, channel foodpanda" is the owner's
 * mistake and reaches them unchanged (`gateway-client.ts`'s `refuse`). Wrapping that in an
 * infrastructure error would tell an owner to wait for an outage that will never end.
 */
export class IntegrationError extends Error {
  /** The external system, named the way an operator names it — e.g. `"sync gateway"`. */
  public readonly dependency: string;

  /**
   * Whether the same request, unchanged, can succeed once the dependency is healthy. `true` for an
   * unreachable peer; `false` would be a peer that answered and said no — which is why nothing in
   * this service constructs one with `false` yet, and why the flag is required rather than
   * defaulted: a default is how the distinction quietly stops being made.
   */
  public readonly retriable: boolean;

  constructor(
    dependency: string,
    message: string,
    options: { readonly retriable: boolean; readonly cause: unknown },
  ) {
    super(message, { cause: options.cause });
    this.name = "IntegrationError";
    this.dependency = dependency;
    this.retriable = options.retriable;
  }
}
