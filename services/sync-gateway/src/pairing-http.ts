/**
 * **`01-F80` (f) — THE CLAIM, and it is a SEPARATE MODULE from `publish-http.ts` for one reason
 * that is the whole point of the route: it must not be under `/internal/`.**
 *
 * `registerPublishRoutes`' `onRequest` hook demands `PUBLISH_TOKEN` for every path beginning
 * `/internal/`, and answers `503` when a deployment declared none. `01-F80` (f) makes this an
 * **unauthenticated write by construction** — *"the device holds no credential yet"* — so a claim
 * registered under that prefix would answer `401` to every till in the world at the one moment it
 * has nothing to present, and `503` on a gateway with no back office beside it.
 *
 * Keeping it in its own file with its own registrar is what makes that structural rather than a
 * convention: this module never sees `publishSecret`, so no future edit can accidentally put the
 * claim behind it, and no future edit of the hook's prefix can accidentally take the guard off the
 * publish routes.
 *
 * ⚠ **PROTECTED PATH (commandment 10): this route hands a device its two credentials.**
 *
 * ── THE PINNED TRANSPORT ────────────────────────────────────────────────────────────────────────
 *
 * `01-F80` owns the model and doc 14 owns the surface, and **neither names a route, a field or a
 * status code**. Those three are answered here, once, on `signup.ts`'s precedent for `28-F13`
 * (*"change it here and in any adapter together, never in one place"*):
 *
 *   · `POST /pair/claim`, body `{ code, public_key_pem }` — `01-F80` (a)'s *"the code and a public
 *     key and nothing else"*, enforced by `strictObject` rather than by convention. SPKI PEM,
 *     because that is what `crypto.subtle.exportKey("spki", …)` produces on the device and what
 *     `packages/lan-pki`'s `issueDeviceCertificate` consumes.
 *   · A refusal is `status >= 400` **and** a body field `refusal` holding one of `01-F80` (f)'s
 *     closed five. The status alone cannot carry it: `00 §5.7` requires the till to say WHICH, and
 *     *"pairing failed"* sends an operator to none of the five actions.
 *   · The status per refusal is a natural mapping and nothing in the corpus rules on it:
 *     `unknown_code` → 404, `expired` → 410, `already_claimed` → 409, `rate_limited` → 429,
 *     `unavailable` → 503.
 *
 * ── `unavailable` — A READING, STATED AS ONE ────────────────────────────────────────────────────
 *
 * `01-F80` (f) closes the refusal set at five and **no clause anywhere says what makes the act
 * unavailable**. This module answers `unavailable` when the cloud could not do the work — the
 * database did not answer — because that is the only one of the five whose next action ("check the
 * connection and try again") is right for it, and because the alternative is a bare `500` the till
 * cannot name. It invents no other trigger.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { GatewayDb } from "./gateway.js";
import { claimPairing, type PairingRefusal, PairingRefused } from "./pairing.js";

/**
 * `01-F80` (a): *"The claim carries the code and a public key and nothing else … Class and branch
 * are not claimable … The claim states no tenant either."*
 *
 * ⚠ **`strictObject`, so an `org_id`, a `device_class`, a `display_name` or a `now` is refused BY
 * NAME rather than ignored.** An ignored field reads to its sender as accepted, which is exactly
 * the `28-F5` (b) hazard `signup.ts` records — and here the field a caller would most like to state
 * is the tenant, at *"the one moment in this product's life when there is no session to check it
 * against"*.
 */
const ClaimRequest = z.strictObject({
  code: z.string().min(1),
  public_key_pem: z.string().min(1),
});

const STATUS_OF: Record<PairingRefusal, number> = {
  unknown_code: 404,
  expired: 410,
  already_claimed: 409,
  rate_limited: 429,
  unavailable: 503,
};

export type PairingDeps = {
  readonly db: GatewayDb;
  /**
   * The deployment's device-token secret. It is BOTH the key `pairing.ts` derives its blind index
   * from and the key `01-F47`'s token is signed with — one secret, two purposes, separated at the
   * derivation and not here.
   */
  readonly tokenSecret: string;
  /**
   * The injected clock (`18 §4`). **Required**, and never a `Date.now()` default: a default is how
   * the deterministic rigs this service is tested under would silently start reading a wall clock,
   * and `01-F80` (c)'s fifteen minutes are measured against exactly this value.
   */
  readonly now: () => number;
};

export const registerPairingRoutes = (app: FastifyInstance, deps: PairingDeps): void => {
  app.post("/pair/claim", async (request, reply) => {
    const parsed = ClaimRequest.safeParse(request.body);
    if (!parsed.success) {
      // A schema refusal carries no `refusal` member on purpose: the act never ran, so naming one
      // of `01-F80` (f)'s five would tell the till which pairing outcome occurred when none did.
      return reply.code(400).send({ error: `pair claim: ${z.prettifyError(parsed.error)}` });
    }
    try {
      const paired = await claimPairing(
        deps.db,
        {
          code: parsed.data.code,
          public_key_pem: parsed.data.public_key_pem,
          // `01-F80` (e)'s SOURCE, pinned as the transport peer. The claim carries only
          // attacker-chosen values, so the peer address is the only source-like fact it has.
          source: request.ip,
          now: deps.now(),
        },
        deps.tokenSecret,
      );
      return reply.code(200).send(paired);
    } catch (error: unknown) {
      if (error instanceof PairingRefused) {
        return reply.code(STATUS_OF[error.refusal]).send({ refusal: error.refusal });
      }
      // See the header: a reading, not a transcription. The message is logged and NOT returned —
      // a stranger reaching this route learns that the cloud is unwell and nothing about the org.
      request.log.error({ err: error }, "pair claim: the pairing writer failed");
      return reply.code(STATUS_OF.unavailable).send({ refusal: "unavailable" });
    }
  });
};
