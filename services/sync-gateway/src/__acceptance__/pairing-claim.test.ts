/**
 * **`01-F80` — THE PAIRING CODE: THE CLOUD HALF. The mint, the claim, and the five refusals.**
 *
 * AUTHORSHIP: **authored from spec text ONLY** (`20 §4.3`, `24 §3` step 2). The session that wrote
 * this file wrote none of the production code it exercises and is disqualified from implementing
 * against it (`24-F5`). Every assertion cites an FR that resolves (`grep -arn "01-F80" specs/`). A
 * test believed wrong is a **finding for this file's owner, cited by FR id** — never an edit by the
 * implementer.
 *
 * ⚠ **PROTECTED PATH (`20 §4.4`, commandment 10): credentials.** This file exercises the act that
 * mints a device's two credentials, so the change that satisfies it takes a full adversarial round.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────────────────────────
 *
 * `packages/sync-client/src/__acceptance__/device-roster-distribution.test.ts:544` asserts only
 * that *the device side has a producer* for `01-F73`'s LAN credential, and says in terms that
 * *"the CLOUD half of `01-F80` — the claim endpoint, its 8-digit code, its 15-minute TTL, its
 * one-time claim and its five named refusals — is `services/sync-gateway`'s and is owed its OWN
 * oracle"*. **This is that oracle.** It asserts nothing about `packages/sync-client`, nothing about
 * `createLanMesh`, and nothing about `01-F81`'s roster distribution — those are that file's and
 * `01-F81`'s verifier oracle's. The boundary is the wire: everything here is the cloud answering.
 *
 * ── THE AUTHORITIES, QUOTED VERBATIM ────────────────────────────────────────────────────────────
 *
 *   · `01-F80` (`specs/01-kernel-sync.md:213`) — "THE PAIRING CODE IS A ONE-TIME, SHORT-LIVED CLAIM
 *     ON A DEVICE THE OWNER HAS ALREADY DESCRIBED … **Doc 14 still owns the SURFACE (`14-F26`,
 *     `14-F12`); this FR owns the code, its lifetime, its claim, its limits and its refusals.**"
 *   · `01-F80` (a) — "**The owner MINTS and the device CLAIMS; the device chooses nothing.** Minting
 *     fixes `org_id`, `branch_id`, `device_class` (`01-F39`) and `01-F70`'s required name, and mints
 *     the `device_id` — UUIDv7, never reused … The claim carries **the code and a public key and
 *     nothing else** … Class and branch are not claimable … the name is not claimable … **The claim
 *     states no tenant either** — a caller-stated `org_id` would be a client role claim at the one
 *     moment in this product's life when there is no session to check it against … **The consequence
 *     is what makes (e) small: an unauthenticated caller can never cause a registry row to exist.**"
 *   · `01-F80` (b) — "**What a code IS: 8 CSPRNG digits, displayed and read as `1234 5678`.** …
 *     **No check digit** … The cloud stores an **Argon2id hash at `01-F61`'s cost floor and never
 *     the code** … a database read then hands over no live pairing. … **The entropy is sized against
 *     an ONLINE guess under (e) and against nothing else** — 26.6 bits is not an offline margin, and
 *     what makes that sufficient is the 15-minute TTL, the one-time claim and the hash together."
 *   · `01-F80` (c) — "**TTL is 15 minutes and it is NOT an org setting.** … An **unclaimed** code
 *     that expires leaves *nothing* — no registry row, no certificate, no device, nothing to clean
 *     up … A **claimed** pairing whose response never reached the device is the case that matters,
 *     and (d) answers it."
 *   · `01-F80` (d) — "**ONE-TIME CLAIM, AND THE RACE IS DECIDED BY THE PUBLIC KEY RATHER THAN BY
 *     ARRIVAL.** The first claim to commit wins and the pending row records the fingerprint of the
 *     key it issued over. Re-presenting the same code **with the same public key** inside the TTL
 *     returns **the same certificate** — a dropped response is a retry, not a burned device — and
 *     every other presentation is refused `already_claimed`. So two devices presenting one code
 *     produce **one** device … After the TTL a claimed-but-undelivered pairing is dead: its registry
 *     row is an unusable device that an owner can *see and revoke*."
 *   · `01-F80` (e) — "**RATE LIMIT: bound the burst, make it observable, and never lock the
 *     deployment.** Failed claims are capped per source over a short window and refused
 *     `rate_limited` beyond it … **A deployment-wide lockout is refused rather than deferred:** on
 *     R17's pooled deployment it would let one attacker stop every tenant commissioning a till."
 *   · `01-F80` (f) — "**THE CLAIM IS AN UNAUTHENTICATED WRITE — ONE OF EXACTLY TWO — and its refusal
 *     SAYS WHICH.** It is served on the cloud plane over TLS to a known endpoint (`01-F73` (c))
 *     because the device holds no credential yet by construction. … its sibling is `28-F12`'s
 *     self-serve signup … **One response carries everything a device needs to become a till:** its
 *     identity (`org_id`, `branch_id`, `device_id`, `device_class`, name), `01-F73`'s certificate
 *     with its org issuer PEM, `01-F81`'s pinned roster-signing key, and `01-F47`'s device token —
 *     **one act, two credentials.** … **There is no proof-of-possession challenge** … **The refusal
 *     set is CLOSED — `unknown_code` · `expired` · `already_claimed` · `rate_limited` ·
 *     `unavailable` — and the till must say which one** (`00 §5.7`)."
 *   · `01-F73` (a) — "The keypair is generated ON the device at pairing. The private key never leaves
 *     it … What travels to the cloud is the **public key** — and nothing else."
 *   · `01-F73` (b) — "The cloud returns a certificate naming `(org_id, branch_id, device_id)` —
 *     signed by a **per-org** issuing key … **Three facts, not four, and `device_class` is
 *     deliberately NOT among them** … the certificate answers *who*, the roster answers *what it may
 *     do*." (b·i) — "The device sends a public key and receives a certificate; it never encodes a
 *     request and never holds issuing material."
 *   · `01-F81` (c) — "**THE SIGNING KEY IS NOT THE ISSUING KEY, AND THAT IS FORCED BY `01-F74` (c)
 *     RATHER THAN CHOSEN** … The obvious design (the `01-F73` (b) org issuer signs the roster …) is
 *     therefore refused … an org carries a **roster-signing keypair distinct from its issuer**, and
 *     its public half is **pinned on the device at pairing** (`01-F80` (f))."
 *   · `01-F81` (a) — the roster row carries "the certificate fingerprint as **lowercase hex SHA-256
 *     of the DER**"; (f) — "the artifact's producer is the registry **write** (`01-F80`'s claim,
 *     `14-F13`'s revocation)".
 *   · `01-F47` — the device token carries a mandatory expiry and "the registry, never the token,
 *     decides"; `01-F25` — "Registration is a one-time pairing via back office code";
 *     `01-F48` — revocation is fail-closed and "blocks **reads as well as writes**";
 *     `01-F61` — the Argon2id cost floor is a **parameter**, never an elapsed time;
 *     `01-F70` — the human name is REQUIRED at registration; `01-F39` — the class vocabulary.
 *   · `14-F41` (`specs/14-backoffice.md:101`) — the surface: "**The form asks three facts and no
 *     more:** the branch … what the device is for; and **the name it will be known by**"; "a
 *     **waiting** row joins the list under the name she typed"; "The waiting row becomes `14-F12`'s
 *     device row"; "**CANCEL IS NOT REVOKE** … Before a claim there is no device".
 *
 * ── ⚠ THE BRIEF SAID "FIVE NAMED REFUSALS" AND THE FR NAMES EXACTLY FIVE ────────────────────────
 *
 * Counted from `01-F80` (f) verbatim: `unknown_code`, `expired`, `already_claimed`, `rate_limited`,
 * `unavailable`. Five, and the set is CLOSED by that clause. Four of them have a trigger this suite
 * can produce. **`unavailable` has NO specified trigger anywhere in the corpus** — no clause says
 * what makes the act unavailable — so nothing here provokes it and nothing here may invent a
 * trigger (commandment 2). What IS asserted about it: it is a legal member (so an implementation
 * that has it costs nothing), and it is **not** the answer to any of the four cases that do have
 * triggers — which is the failure that matters, since a service answering one refusal for every
 * cause sends an operator to none of the five actions `01-F80` (f) exists to distinguish.
 *
 * ── ⚠ PINNED INTERPRETATIONS — the transport. Contest them HERE, never in an implementation ─────
 *
 * `01-F80` owns the model and doc 14 owns the surface; **neither names a route, a field or a status
 * code**, and a suite cannot send a request without answering all three. They are answered ONCE,
 * below, in `MINT` / `CLAIM` / `MintRequest` / `ClaimRequest` / `refusalOf`, on the precedent
 * `signup.test.ts` set for `28-F13` ("change it here and in any adapter together, never in one
 * place") and `01-F76` set for a wire shape ("pinned in the only place it can be reviewed"):
 *
 *   (i)   **MINT — `POST /internal/devices/pairing-codes`**, behind the same `PUBLISH_TOKEN` and the
 *         same fail-closed `503` as `/internal/devices/revoke`, because it is the same kind of act
 *         arriving from the same place: `services/api` on behalf of an owner whom `14-F41` gates
 *         with `can("device.manage")`. Body `{ org_id, branch_id, device_class, display_name,
 *         actor_user_id, now }` — `01-F80` (a)'s four minted facts plus `publish-http.ts`'s own
 *         `actOf` pair, `now` because "one act must not be split into two instants" and
 *         `actor_user_id` because `14-F41` names the issuing owner as the fact an audit trail wants.
 *         Reply `{ code, device_id, expires_at }`.
 *   (ii)  **CLAIM — `POST /pair/claim`**, and it is **NOT** under `/internal/`. That prefix is where
 *         `registerPublishRoutes`' `onRequest` hook demands `PUBLISH_TOKEN`, and `01-F80` (f) makes
 *         this an unauthenticated write **by construction** — a device holds no credential yet. A
 *         claim route registered under `/internal/` would answer `401` to every till in the world,
 *         so §A asserts the property (no header, and a deployment with no credential configured at
 *         all) rather than the prefix. Body `{ code, public_key_pem }` — `01-F80` (a)'s "the code
 *         and a public key and nothing else"; the key is SPKI PEM because that is what
 *         `packages/lan-pki`'s `issueDeviceCertificate` consumes (`spkiDer`) and what
 *         `crypto.subtle.exportKey("spki", …)` produces on the device.
 *   (iii) **A REFUSAL IS `status >= 400` AND A BODY FIELD `refusal` holding one of the five.** The
 *         status alone cannot carry it (`00 §5.7`: the till must say *which*), and a bare `404` from
 *         a route that does not exist has no `refusal` field — which is what keeps every refusal
 *         assertion here from passing for free against an unbuilt surface (`signup.test.ts`'s
 *         measured failure pattern 3). Which 4xx/5xx each refusal maps to is deliberately NOT
 *         pinned: `429` for `rate_limited` and `503` for `unavailable` are both natural and nothing
 *         in the corpus rules.
 *   (iv)  **The claim reply's field names** are those of `01-F80` (f)'s own list, snake_cased on this
 *         service's convention, with `display_name` for "name" because that is what
 *         `registerDevice`, `listDevices` and `UserCreateRequest` already call a human label:
 *         `{ org_id, branch_id, device_id, device_class, display_name, certificate_pem, issuer_pem,
 *         roster_signing_public_key_pem, token }`.
 *
 * **These four are the only place this file can be wrong in a way that blocks a correct
 * implementation.** Everything else asserts a property `01-F80` states.
 *
 * ── ⚠ WHAT THIS SUITE DELIBERATELY DOES NOT ASSERT, so the omissions are not read as coverage ───
 *
 *   · **RE-ISSUE AND CANCEL.** `01-F80` (c) says re-issuing "**kills the previous code**" and
 *     `14-F41` says "issuing replaces the old code so one waiting row never has two live codes" and
 *     that "cancelling an unclaimed code destroys a credential nobody holds". Both are real and both
 *     are **unasserted here**, because the act needs a way to *name the waiting row it re-issues*
 *     and neither FR gives one: doc 14 owns that surface, `01-F80` names no parameter, and a
 *     fabricated one is a pin that can only block an implementer who chose differently. **OWED to
 *     the doc-14 surface oracle.** Nothing below may be read as blessing two live codes on one
 *     waiting row.
 *   · **`unavailable`'s trigger** — see above.
 *   · **`device.registered`.** `14-F41` says this act is what unblocks it and `14-F41`'s last clause
 *     says it is **unbuildable**: the type has no payload schema in `packages/domain`, so `01-F4`
 *     makes the emit a build-time error. Asserting an event would assert a thing that cannot be
 *     written. `provision-device.ts` and `revoke-device.ts` emit none either, for the actor reason.
 *   · **Where the org's issuer and roster-signing keypairs come from.** No FR says when they are
 *     created or where they are stored, so §E asserts only the properties `01-F73` (b) and `01-F81`
 *     (c) state about them — per-org, stable, distinct, and never travelling as private material.
 *   · **TLS.** `01-F80` (f) says the claim is served over TLS to a known endpoint; termination is a
 *     deployment concern this service does not own (nothing in `server.ts` terminates TLS today).
 *   · **`01-F81`'s roster artifact, envelope and signature** — that FR's own verifier oracle owns
 *     them. §E asserts only the two ends this act must produce: the pinned roster-signing key, and a
 *     durable record of the issued certificate so a roster row can exist at all (`01-F81` (f): "the
 *     artifact's producer is the registry **write** (`01-F80`'s claim)").
 *   · **`01-F77`'s N−1 reader.** `01-F81` (e) makes "the first claim served" the moment that stops
 *     being deferred. That is a deadline this file records and does not test.
 *
 * ── ⚠ ONE PINNED READING WITH A SECURITY CONSEQUENCE: A CLAIM NEVER RESURRECTS A REVOKED DEVICE ──
 *
 * **`01-F80` does not rule on it — said plainly rather than dressed as a transcription.** The FR
 * never mentions revocation. §H asserts the refusal anyway, derived from three clauses that do:
 * `01-F47` ("revocation … remains the operative kill switch"), `01-F48` (fail-closed; "revocation
 * blocks **reads as well as writes**"), and `01-N5`/`01-F73` (e) (the replacement path is a fresh
 * `device_id`, never a reinstatement). It is also the exact defect the runbook shipped and
 * `provision-device.ts` removed — §6b's `on conflict … do update set revoked_at = null`
 * *"un-revokes a revoked device"* — and that command "refuses a revoked row in **both** of its
 * modes and says why". Two admission paths that disagree about revocation is one admission path
 * plus a bypass. What §H asserts is narrow and derived: **`revoked_at` is not cleared, and no
 * credential is handed back.** Which of the five refusals it is, is NOT pinned.
 *
 * ── THE MUTATION EVIDENCE (the round-3 law: "a claim that a test bites is not evidence that it does")
 *
 * A plausible implementation of `01-F80` was built OUT OF TREE (a scratchpad copy of this package —
 * never in it, `AGENTS.md`'s rule for anything touching a security parameter) and this file was
 * taken **GREEN, 35/35**, before it was handed over: a suite that stays red against a correct
 * implementation blocks its implementer, and the round that produced this law produced three of
 * those. **That green build is the CONTROL.** Twenty-seven mutants were then applied to it, each
 * differing from the control in exactly one branch, each run against the whole file. **Every one
 * was killed, and in twenty-one of the twenty-seven the ONLY test that failed was the one that
 * names the property** (failure counts out of 35 in brackets):
 *
 *   mint not behind the credential → §A "the MINT is the owner's act" [1]
 *   pairing registered only when PUBLISH_TOKEN is set → §A "…no /internal credential AT ALL" [1]
 *   the claim demands a bearer token → [27], including both §A tests that name it
 *   the mint writes the registry row → §A "an unclaimed code leaves NO REGISTRY ROW" [24 — the
 *     other 23 are the control's claim then hitting a duplicate key: the mutant's blast radius]
 *   6-digit code → §B "EXACTLY 8 digits" [1]      · sequential counter → §B "CSPRNG" [3]
 *   the code stored in a column → §B "never the code" [1]
 *   SHA-256 instead of Argon2id → §B/`01-F61` "AT THE COST FLOOR" [1]
 *   Argon2id at m=8,t=1,p=1 → §B/`01-F61` "AT THE COST FLOOR" [1] — the floor bites as a PARAMETER
 *   TTL 60 minutes → §C "dies exactly 15 minutes", §C "five seconds PAST", §D "after the TTL" [4]
 *   TTL never enforced → §C "five seconds PAST", §D "after the TTL" [3]
 *   the claim honours a caller's `now` → §C "takes no clock from its caller" [1]
 *   the retry re-issues → §D "the SAME certificate" [2]
 *   a second key gets its own certificate → §D "`already_claimed`" [1]
 *   `device_class` in the certificate subject → §E "THREE facts" [1]
 *   roster key = the issuer's key → §E/`01-F81` (c) "NOT the issuing key" [1]
 *   **a token and no certificate → [20]: every test that pairs** — the brief's own headline case
 *   a certificate and no token → [20]   · no registry row written → [8], incl. §E "opens a session"
 *   a fresh issuer per claim → §E "PER ORG and STABLE" [2] · one platform issuer → §E [1]
 *   the certificate not recorded → §E/`01-F81` (a)/(f) "recorded on the cloud" [3]
 *   no rate limit → §G "capped … `rate_limited`" [2] · a global counter → §G "never locks" [1]
 *   the issuer key in the response → §E "no private key material" [1]
 *   a revoked device re-credentialled → §H "NEVER resurrects a revoked device" [1]
 *   one refusal for every cause → [6], one per named refusal
 *   `01-F70`'s name dropped at the write → §H "under the name the owner typed" [1]
 *   a stated `org_id`/`device_class` honoured → §A "does not get one" [1]
 *
 * Against the tree as handed over: **all 35 RED**, and this package's 533 pre-existing tests
 * unchanged at 533 passed (`REAL_EXIT` read from a marker written INSIDE the log, both runs).
 */

import { createHash, createPublicKey, generateKeyPairSync, X509Certificate } from "node:crypto";
import { request as httpRequest } from "node:http";
import { newId, PIN_ARGON2ID_PARAMS, verifyPin } from "@restos/domain";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGateway, type Gateway } from "../index.js";
import { provisionDevice } from "../provision-device.js";
import { listDevices, readRegistryRow } from "../registry.js";
import { revokeRegisteredDevice } from "../revoke-device.js";
import { buildServer } from "../server.js";
import {
  closeDb,
  type Db,
  helloMsg,
  makeClock,
  must,
  ofKind,
  openDb,
  recorder,
  TEST_TOKEN_SECRET,
  testDatabaseUrl,
} from "./helpers.js";

/* ── the pinned transport (see the header block (i)–(iv)) ────────────────────────────────────── */

const MINT = "/internal/devices/pairing-codes";
const CLAIM = "/pair/claim";

/** ≥ 32 bytes — the floor `server.ts` enforces on the `/internal` credential (`18 §5`). */
const PUBLISH_SECRET = "internal-pairing-credential-for-the-01-f80-acceptance-suite";

/** `01-F80` (b). Eight, and the FR says why it is not six and not letters. */
const CODE_DIGITS = 8;

/** `01-F80` (c): "TTL is 15 minutes and it is NOT an org setting." */
const PAIRING_TTL_MS = 15 * 60 * 1000;

/**
 * `01-F80` (f)'s CLOSED refusal set, in the FR's own order.
 *
 * Declared here and asserted in `refusalOf`, so a refusal outside the set fails **wherever it is
 * read** rather than only in the one test that thought to look — the round-3 law's "the mechanism
 * was built correctly and simply never aimed at the case that matters".
 */
const PAIRING_REFUSALS = [
  "unknown_code",
  "expired",
  "already_claimed",
  "rate_limited",
  "unavailable",
] as const;
type PairingRefusal = (typeof PAIRING_REFUSALS)[number];

/** `01-F39`'s vocabulary — the class the mint fixes for every fixture below. */
const DEVICE_CLASS = "counter_electron";

type Http = { status: number; body: Record<string, unknown> };

let db: Db;
let configured: number;
/** A deployment that declared NO `/internal` credential — `buildServer`'s `undefined` publishSecret. */
let unconfigured: number;
let servers: { close(): Promise<void> }[];
let gateway: Gateway | undefined;

/**
 * Every refusal this file has read, so the last test can prove the closed set was actually
 * EXERCISED rather than merely declared. A constant nothing reaches is `K-3`'s dead oracle.
 */
const refusalsSeen = new Set<string>();

/* ── the wire ────────────────────────────────────────────────────────────────────────────────── */

/**
 * One request, on `node:http` rather than `fetch`, for exactly one reason: **`localAddress`**.
 *
 * `01-F80` (e) caps failed claims **per source** and forbids a deployment-wide lockout, and a suite
 * that sends every request from one address cannot tell the two apart — nor can it stop its own
 * refusal probes from spending another test's budget. `127.0.0.0/8` is entirely local on Linux, so
 * a fresh source per probe is a real distinct peer to the server (`remoteAddress`) and costs
 * nothing. **PINNED READING: "source" is the transport peer.** The claim carries only a code and a
 * public key, both attacker-chosen, so the peer address is the only source-like fact the request
 * has; if an implementation keys on something else it should contest this line.
 */
const call = (
  port: number,
  method: "GET" | "POST",
  path: string,
  init: { token?: string | null; body?: unknown; source?: string } = {},
): Promise<Http> =>
  new Promise((resolve, reject) => {
    const payload = init.body === undefined ? undefined : JSON.stringify(init.body);
    const headers: Record<string, string> = {};
    if (payload !== undefined) {
      headers["content-type"] = "application/json";
      headers["content-length"] = String(Buffer.byteLength(payload));
    }
    // `null` — never `undefined` — is how this file says "send NO header". `signup.test.ts` records
    // why: a default parameter ate the absence and made its own control unsatisfiable.
    if (init.token !== undefined && init.token !== null)
      headers.authorization = `Bearer ${init.token}`;
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port,
        method,
        path,
        headers,
        ...(init.source === undefined ? {} : { localAddress: init.source }),
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          text += chunk;
        });
        res.on("end", () => {
          let body: Record<string, unknown> = {};
          if (text !== "") {
            try {
              body = JSON.parse(text) as Record<string, unknown>;
            } catch {
              body = { __unparsed: text };
            }
          }
          resolve({ status: res.statusCode ?? 0, body });
        });
      },
    );
    req.on("error", reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });

let sourceCounter = 0;
/** A loopback address no previous probe has used — see `call`. */
const freshSource = (): string => {
  sourceCounter += 1;
  return `127.9.${Math.floor(sourceCounter / 250) % 250}.${(sourceCounter % 250) + 1}`;
};

/* ── the two acts ────────────────────────────────────────────────────────────────────────────── */

type MintRequest = {
  readonly org_id: string;
  readonly branch_id: string;
  readonly device_class: string;
  readonly display_name: string;
  readonly actor_user_id: string | null;
  readonly now: number;
};

type Minted = { readonly code: string; readonly device_id: string; readonly expires_at: number };

const mintRequest = (over: Partial<MintRequest> = {}): MintRequest => ({
  org_id: over.org_id ?? newId(),
  branch_id: over.branch_id ?? newId(),
  device_class: over.device_class ?? DEVICE_CLASS,
  display_name: over.display_name ?? "Counter till",
  actor_user_id: over.actor_user_id === undefined ? newId() : over.actor_user_id,
  now: over.now ?? Date.now(),
});

/** The mint as an authenticated caller on the `/internal` plane makes it. */
const mintOverHttp = (
  request: MintRequest,
  init: { token?: string | null; port?: number } = {},
): Promise<Http> =>
  call(init.port ?? configured, "POST", MINT, {
    token: init.token === undefined ? PUBLISH_SECRET : init.token,
    body: request,
  });

/**
 * A mint that FAILS BY NAME rather than returning a status nobody reads.
 *
 * Every assertion below is about a pairing this act was supposed to have created, and every one of
 * them passes vacuously against a pairing that never existed — the round-3 law's "guard never
 * pointed at the dangerous case", which is why the fixture throws instead of asserting.
 */
const mustMint = async (
  over: Partial<MintRequest> = {},
): Promise<Minted & { request: MintRequest }> => {
  const request = mintRequest(over);
  const reply = await mintOverHttp(request);
  if (reply.status !== 200) {
    throw new Error(
      `fixture: POST ${MINT} refused with ${reply.status} — ${JSON.stringify(reply.body)}. ` +
        "01-F80 (a): the OWNER mints, and every assertion in this file is about the pending " +
        "pairing that act was supposed to have created.",
    );
  }
  const { code, device_id, expires_at } = reply.body;
  if (typeof code !== "string" || typeof device_id !== "string" || typeof expires_at !== "number") {
    throw new Error(
      `POST ${MINT} answered 200 without { code, device_id, expires_at } — 01-F80 (a) mints the ` +
        `device_id (the caller never supplies one) and (c) fixes when the code dies. Got ${JSON.stringify(reply.body)}`,
    );
  }
  return { code, device_id, expires_at, request };
};

/** `01-F73` (a): generated ON the device; only the public half ever travels. */
const deviceKeypair = (): { public_key_pem: string } => {
  const { publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return { public_key_pem: publicKey.export({ type: "spki", format: "pem" }) as string };
};

/** `01-F80` (a): "the code and a public key and nothing else". */
const claimOverHttp = (
  body: unknown,
  init: { source?: string; port?: number } = {},
): Promise<Http> =>
  call(init.port ?? configured, "POST", CLAIM, {
    // **NO credential, ever, on this call.** `01-F80` (f): the device holds none by construction.
    token: null,
    body,
    ...(init.source === undefined ? {} : { source: init.source }),
  });

type Paired = {
  readonly org_id: string;
  readonly branch_id: string;
  readonly device_id: string;
  readonly device_class: string;
  readonly display_name: string;
  readonly certificate_pem: string;
  readonly issuer_pem: string;
  readonly roster_signing_public_key_pem: string;
  readonly token: string;
  readonly raw: Record<string, unknown>;
};

const STRING_FIELDS = [
  "org_id",
  "branch_id",
  "device_id",
  "device_class",
  "display_name",
  "certificate_pem",
  "issuer_pem",
  "roster_signing_public_key_pem",
  "token",
] as const;

/**
 * A claim that must SUCCEED, with `01-F80` (f)'s completeness enforced **in the fixture**.
 *
 * That placement is the point. "One response carries everything a device needs to become a till" is
 * the clause an implementation is most likely to satisfy half of — a token and no certificate is a
 * device that syncs and can never join its own branch LAN — so a missing member fails **every**
 * test that pairs, not only the one test that thought to check.
 */
const mustClaim = async (
  code: string,
  public_key_pem: string,
  init: { source?: string; port?: number } = {},
): Promise<Paired> => {
  const reply = await claimOverHttp({ code, public_key_pem }, init);
  if (reply.status !== 200) {
    throw new Error(
      `fixture: POST ${CLAIM} refused a live code with ${reply.status} — ${JSON.stringify(reply.body)}`,
    );
  }
  const missing = STRING_FIELDS.filter((key) => typeof reply.body[key] !== "string");
  if (missing.length > 0) {
    throw new Error(
      `01-F80 (f): "One response carries everything a device needs to become a till: its identity ` +
        `(org_id, branch_id, device_id, device_class, name), 01-F73's certificate with its org ` +
        `issuer PEM, 01-F81's pinned roster-signing key, and 01-F47's device token — one act, two ` +
        `credentials." Missing or non-string: ${missing.join(", ")}. Got keys ` +
        `[${Object.keys(reply.body).join(", ")}]`,
    );
  }
  return {
    ...(Object.fromEntries(STRING_FIELDS.map((k) => [k, reply.body[k] as string])) as Record<
      (typeof STRING_FIELDS)[number],
      string
    >),
    raw: reply.body,
  };
};

/**
 * The refusal a reply carries — asserted to be a member of `01-F80` (f)'s CLOSED set at the point
 * of reading, and recorded so the final test can prove the set was exercised.
 *
 * ⚠ **`status >= 400` AND a `refusal` field, both.** A route that does not exist answers Fastify's
 * `404` with no `refusal`, so a refusal assertion here cannot pass for free against an unbuilt
 * surface — the failure pattern `signup.test.ts` names as its third.
 */
const refusalOf = (reply: Http, what: string): PairingRefusal => {
  expect(
    reply.status,
    `${what}: expected a refusal, got ${reply.status} ${JSON.stringify(reply.body)}`,
  ).toBeGreaterThanOrEqual(400);
  const refusal = reply.body.refusal;
  expect(
    PAIRING_REFUSALS as readonly string[],
    `${what}: 01-F80 (f) closes the refusal set at ${PAIRING_REFUSALS.join(" · ")} and requires the ` +
      `till to say WHICH — "those five send an operator to five different actions and 'pairing ` +
      `failed' sends her to none". Got refusal=${JSON.stringify(refusal)} in ` +
      `${JSON.stringify(reply.body)}`,
  ).toContain(refusal);
  refusalsSeen.add(refusal as string);
  return refusal as PairingRefusal;
};

/* ── certificates, read with node:crypto so this oracle shares no code with the issuer ────────── */

const certOf = (pem: string): X509Certificate => new X509Certificate(pem);

/** `01-F81` (a): "the certificate fingerprint as lowercase hex SHA-256 of the DER". */
const fingerprintOf = (cert: X509Certificate): string =>
  createHash("sha256").update(cert.raw).digest("hex");

const spkiDerOf = (key: ReturnType<typeof createPublicKey>): Buffer =>
  key.export({ type: "spki", format: "der" });

/** node renders a DN as `KEY=value` lines; `01-F73` (b) is about which keys are present. */
const subjectAttributes = (cert: X509Certificate): Map<string, string> => {
  const map = new Map<string, string>();
  for (const line of cert.subject.split("\n")) {
    const at = line.indexOf("=");
    if (at > 0) map.set(line.slice(0, at).trim(), line.slice(at + 1).trim());
  }
  return map;
};

/* ── raw readers: the kernel schema IS the contract, exactly as `helpers.ts` treats it ────────── */

const kernelTables = async (): Promise<string[]> => {
  const rows = await db.execute(
    sql`select table_name from information_schema.tables
        where table_schema = 'kernel' and table_type = 'BASE TABLE' order by table_name`,
  );
  return [...rows].map((row) => String(row.table_name));
};

/**
 * Every row in the `kernel` schema whose whole content, rendered as text, contains `needle` —
 * table-blind and column-blind on purpose.
 *
 * `01-F80` (b) says the cloud "stores an Argon2id hash … and **never the code**", and this file
 * cannot name the table that would hold it without inventing the storage shape the implementer
 * owns. A sweep over `to_jsonb(t.*)::text` asks the question the FR asks — *is the secret anywhere*
 * — and is the only form of it that survives the implementer choosing a different column.
 */
const rowsContaining = async (needle: string): Promise<{ table: string; blob: string }[]> => {
  const found: { table: string; blob: string }[] = [];
  for (const table of await kernelTables()) {
    const rows = await db.execute(
      sql`select to_jsonb(t.*)::text as blob from kernel.${sql.raw(`"${table}"`)} t
          where to_jsonb(t.*)::text like ${`%${needle}%`}`,
    );
    for (const row of rows) found.push({ table, blob: String(row.blob) });
  }
  return found;
};

const orgDevices = async (org_id: string) => listDevices(db, org_id);

/* ── the session a paired device opens, which is what "become a till" means ───────────────────── */

const opensASession = async (paired: Paired): Promise<boolean> => {
  const rec = recorder();
  const conn = must(gateway, "gateway").connect(rec.sink);
  try {
    await conn.handle(
      helloMsg(
        { org_id: paired.org_id, branch_id: paired.branch_id, device_id: paired.device_id },
        { token: paired.token },
      ),
    );
  } catch {
    return false;
  } finally {
    conn.close();
  }
  return ofKind(rec.all, "hello_ack").length === 1;
};

beforeAll(async () => {
  db = openDb();
  const app = buildServer(
    testDatabaseUrl(),
    TEST_TOKEN_SECRET,
    undefined,
    undefined,
    PUBLISH_SECRET,
  );
  const bare = buildServer(testDatabaseUrl(), TEST_TOKEN_SECRET);
  configured = Number(new URL(await app.listen({ port: 0, host: "127.0.0.1" })).port);
  unconfigured = Number(new URL(await bare.listen({ port: 0, host: "127.0.0.1" })).port);
  servers = [app, bare];
  // The SAME verification key the pairing act mints under (`01-F47` binds a token to its
  // deployment); a gateway built with a different secret would fail §E5 for the wrong reason.
  gateway = createGateway({
    db,
    clock: makeClock(Date.now()),
    auth: { token_secret: TEST_TOKEN_SECRET },
  });
}, 180_000);

afterAll(async () => {
  await gateway?.close();
  for (const server of servers ?? []) await server.close();
  if (db !== undefined) await closeDb(db);
});

/**
 * A reply that handed over NO credential — the property `01-F80` (f) makes load-bearing when the
 * act says no.
 *
 * It is deliberately weaker than `refusalOf` in one direction and no weaker in the other: a request
 * carrying a field the claim's schema does not declare may legitimately be refused by the SCHEMA
 * rather than by the pairing writer, and a schema refusal has no `refusal` field to carry. So the
 * invariant asserted everywhere is *nothing was issued*; where the act itself refused, the named
 * member is still checked.
 */
const deniedNoCredential = (reply: Http, what: string): void => {
  expect(
    reply.status,
    `${what}: expected NO credential to be issued, got ${reply.status} ${JSON.stringify(reply.body)}`,
  ).toBeGreaterThanOrEqual(400);
  expect(reply.body.certificate_pem, `${what}: a refusal carried a CERTIFICATE`).toBeUndefined();
  expect(reply.body.token, `${what}: a refusal carried a device TOKEN`).toBeUndefined();
  if (reply.body.refusal !== undefined) refusalOf(reply, what);
};

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   §A — THE OWNER MINTS AND THE DEVICE CLAIMS; THE DEVICE CHOOSES NOTHING (`01-F80` (a), (f))
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */

describe("§A 01-F80 (a)/(f) — who mints, who claims, and what a claim can never do", () => {
  it("01-F80 (f): the CLAIM is an UNAUTHENTICATED write — a device holds no credential yet by construction", async () => {
    const minted = await mustMint();
    const key = deviceKeypair();
    // No `authorization` header at all. If this answers 401/503 the route is behind the /internal
    // hook, and every till in the world is refused at the one moment it has nothing to present.
    const reply = await claimOverHttp({ code: minted.code, public_key_pem: key.public_key_pem });
    expect(
      reply.status,
      "01-F80 (f): 'THE CLAIM IS AN UNAUTHENTICATED WRITE — ONE OF EXACTLY TWO … because the " +
        "device holds no credential yet by construction'. A 401/503 here means the claim was " +
        `registered behind PUBLISH_TOKEN. Body: ${JSON.stringify(reply.body)}`,
    ).toBe(200);
  });

  it("01-F80 (f): …and it is served by a deployment that declared no /internal credential AT ALL", async () => {
    // The sharpest form of the same claim, and the one a prefix mistake cannot survive: this server
    // was built with `publishSecret: undefined`, so `registerPublishRoutes`' hook answers 503 to
    // everything under /internal/. Pairing must not live there.
    const minted = await mustMint();
    const key = deviceKeypair();
    const reply = await claimOverHttp(
      { code: minted.code, public_key_pem: key.public_key_pem },
      { port: unconfigured },
    );
    expect(
      reply.status,
      "01-F80 (f): a gateway with no PUBLISH_TOKEN configured still admits devices — the claim is " +
        `not the internal plane's. Got ${reply.status} ${JSON.stringify(reply.body)}`,
    ).toBe(200);
  });

  it("01-F80 (a): the MINT is the owner's act — unauthenticated minting would be a THIRD unauthenticated write", async () => {
    const request = mintRequest();
    const none = await mintOverHttp(request, { token: null });
    expect(
      none.status,
      "01-F80 (f) names the unauthenticated writes as a PAIR — this claim and 28-F12's signup — " +
        "and 01-F80 (a) puts minting in the hands of an authenticated owner (14-F41: " +
        "can('device.manage'), owner-only). A mint anyone can reach mints device identities for " +
        "any org on a pooled deployment.",
    ).toBe(401);
    const wrong = await mintOverHttp(request, {
      token: "not-the-publish-credential-but-long-enough-x",
    });
    expect(wrong.status, "01-F80 (a): a wrong /internal credential mints nothing").toBe(401);
    const unset = await mintOverHttp(request, { port: unconfigured });
    expect(
      unset.status,
      "server.ts's fail-closed rule for /internal: 'an unconfigured gateway cannot be handed a " +
        "menu by anyone who can reach the port' — nor a device identity",
    ).toBe(503);
    // ⚠ **THE CONTROL, and without it the three assertions above pass against a service that has
    // no mint at all** — `registerPublishRoutes`' hook answers 401/503 for every `/internal/*` URL,
    // routed or not. This leg differs in exactly one thing (the credential is the configured one),
    // so together they say "the credential is what decided" rather than "nothing is there".
    const allowed = await mintOverHttp(request);
    expect(
      allowed.status,
      "the same request with the deployment's own /internal credential must reach the writer — " +
        "otherwise the refusals above are about a missing route, not about authorization",
    ).toBe(200);
  });

  it("01-F80 (a): minting FIXES org, branch, class and name and MINTS the device_id — a UUIDv7 the caller never supplied", async () => {
    const first = await mustMint();
    const second = await mustMint({
      org_id: first.request.org_id,
      branch_id: first.request.branch_id,
    });
    expect(
      first.device_id,
      "01-F80 (a): 'mints the device_id — UUIDv7, never reused, on 01-F68's reasoning'",
    ).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(
      second.device_id,
      "01-F80 (a): two mints are two devices — 'never reused' is what stops 01-F64's forked store",
    ).not.toBe(first.device_id);
    expect(
      first.code,
      "01-F80 (a): 'a code resolves to exactly one pending pairing deployment-wide'",
    ).not.toBe(second.code);
  });

  it("01-F80 (c)/14-F41: an unclaimed code leaves NO REGISTRY ROW — a waiting row is not a device", async () => {
    const minted = await mustMint();
    expect(
      await readRegistryRow(db, minted.request.org_id, minted.device_id),
      "01-F80 (c): 'An unclaimed code that expires leaves nothing — no registry row, no " +
        "certificate, no device, nothing to clean up'. 14-F41 draws the same line at the surface: " +
        "'Before a claim there is no device' and 'the waiting row BECOMES 14-F12's device row'. A " +
        "registry row written at mint is a device nobody paired, and it is the row 14-F13's kill " +
        "switch and 15-F11's fleet dashboard would both count.",
    ).toBeUndefined();
    expect(
      await orgDevices(minted.request.org_id),
      "the org has no devices until a claim commits",
    ).toHaveLength(0);
  });

  it("01-F80 (a): an UNAUTHENTICATED caller can never cause a registry row to exist", async () => {
    const strangerOrg = newId();
    const strangerBranch = newId();
    const strangerDevice = newId();
    const key = deviceKeypair();
    const source = freshSource();
    // FIRST, in the shape the claim declares, so this test cannot pass against a service with no
    // claim surface: a `404` from a missing route is `>= 400` and writes no row either, which is
    // `signup.test.ts`'s named "refusal test that passes for free".
    expect(
      refusalOf(
        await claimOverHttp({ code: "99999999", public_key_pem: key.public_key_pem }, { source }),
        "a stranger's guess at a code",
      ),
      "01-F80 (f): the act itself refuses, by name",
    ).toBe("unknown_code");
    const reply = await claimOverHttp(
      {
        // A code no mint produced, plus every fact a self-registering device would like to declare.
        code: "00000000",
        public_key_pem: key.public_key_pem,
        org_id: strangerOrg,
        branch_id: strangerBranch,
        device_id: strangerDevice,
        device_class: "manager",
        display_name: "Not a real till",
      },
      { source },
    );
    deniedNoCredential(
      reply,
      "a claim naming its own org, branch, id and class under an unknown code",
    );
    expect(
      await readRegistryRow(db, strangerOrg, strangerDevice),
      "01-F80 (a): 'The consequence is what makes (e) small: an unauthenticated caller can never " +
        "cause a registry row to exist' — 01-F68's never-reuse rule would make any junk device it " +
        "manufactured permanent.",
    ).toBeUndefined();
    expect(await orgDevices(strangerOrg), "no device row in an org the claim named").toHaveLength(
      0,
    );
  });

  it("01-F80 (a): a claim that STATES a tenant, a branch or a class does not get one", async () => {
    const minted = await mustMint();
    const statedOrg = newId();
    const key = deviceKeypair();
    const probe = await claimOverHttp({
      code: minted.code,
      public_key_pem: key.public_key_pem,
      org_id: statedOrg,
      branch_id: newId(),
      device_class: "manager",
      display_name: "Renamed by the device",
    });
    // Unconditional, whichever way the implementation reads "and nothing else": the stated tenant
    // never acquires a device. 01-F80 (a): "a caller-stated org_id would be a client role claim at
    // the one moment in this product's life when there is no session to check it against".
    expect(
      await orgDevices(statedOrg),
      "01-F80 (a): class and branch 'are not claimable because 01-F40 enforces slice predicates " +
        "from device class + role — never client-declared'",
    ).toHaveLength(0);
    if (probe.status === 200) {
      expect(probe.body.org_id, "the MINTED org, not the stated one").toBe(minted.request.org_id);
      expect(probe.body.branch_id, "the MINTED branch").toBe(minted.request.branch_id);
      expect(probe.body.device_class, "the MINTED class (01-F39/01-F40)").toBe(DEVICE_CLASS);
      expect(probe.body.display_name, "01-F70's name is the owner's, typed at the mint").toBe(
        minted.request.display_name,
      );
    } else {
      deniedNoCredential(probe, "a claim carrying fields the act does not accept");
    }
    // Either way the pairing itself is intact and honest: a refused over-claim must not burn it,
    // and an ignored one is a retry (01-F80 (d), same key → same certificate).
    const honest = await mustClaim(minted.code, key.public_key_pem);
    expect(honest.org_id).toBe(minted.request.org_id);
    expect(honest.device_id).toBe(minted.device_id);
    expect(honest.device_class).toBe(DEVICE_CLASS);
    expect(honest.display_name).toBe(minted.request.display_name);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   §B — WHAT A CODE IS (`01-F80` (b))
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */

describe("§B 01-F80 (b) — 8 CSPRNG digits, and the cloud never keeps the code", () => {
  it("01-F80 (b): a code is EXACTLY 8 digits — no letters, no check digit, no separator on the wire", async () => {
    const minted = await mustMint();
    expect(
      minted.code,
      "01-F80 (b): 'What a code IS: 8 CSPRNG digits, displayed and read as 1234 5678.' Digits " +
        "because it is 'read down a phone to whoever is standing at the till and typed on the " +
        "numeric keypad 01-F61 already puts on that surface'. The SPACE is a display concern " +
        "(14-F41: what she READS ALOUD); the value on the wire is the eight digits.",
    ).toMatch(new RegExp(`^[0-9]{${CODE_DIGITS}}$`));
  });

  it("01-F80 (b): codes are CSPRNG — twenty-four mints are twenty-four distinct codes, and not a counter", async () => {
    // Twenty-four and not four hundred: each mint costs one real Argon2id hash at `01-F61`'s floor
    // (~0.6 s measured), and the two properties below are decided long before that. All 24 sharing
    // a first digit is 10 × 10⁻²³; 24 in monotonic order is 1/24!.
    const codes: string[] = [];
    for (let i = 0; i < 24; i++) codes.push((await mustMint()).code);
    expect(new Set(codes).size, "01-F80 (a): 'a mint that collides re-draws'").toBe(codes.length);
    const firstDigits = new Set(codes.map((c) => c[0]));
    expect(
      firstDigits.size,
      "01-F80 (b): CSPRNG. A sequential or time-derived code shares a prefix and is guessable " +
        "inside (e)'s budget however many digits it has — the entropy is the whole defence, " +
        "'sized against an ONLINE guess under (e) and against nothing else'.",
    ).toBeGreaterThan(1);
    const ascending = codes.every(
      (code, i) => i === 0 || Number(code) > Number(codes[i - 1] as string),
    );
    const descending = codes.every(
      (code, i) => i === 0 || Number(code) < Number(codes[i - 1] as string),
    );
    expect(ascending || descending, "codes in monotonic order are a counter, not a CSPRNG").toBe(
      false,
    );
  });

  it("01-F80 (b): the cloud stores an Argon2id VERIFIER and NEVER the code", async () => {
    const minted = await mustMint();
    const key = deviceKeypair();
    const paired = await mustClaim(minted.code, key.public_key_pem);

    // The control FIRST: this sweep sees durable values, so the absence below is evidence.
    const durable = await rowsContaining(paired.device_id);
    expect(
      durable.length,
      "control: the kernel-wide text sweep must FIND a value that IS durable (the registry row " +
        "this claim wrote), or its silence about the code proves nothing",
    ).toBeGreaterThan(0);

    const leaked = await rowsContaining(minted.code);
    expect(
      leaked.map((row) => row.table),
      "01-F80 (b): 'The cloud stores an Argon2id hash at 01-F61's cost floor and never the code, " +
        "on 28-F13's discipline for a minted secret: a database read then hands over no live " +
        "pairing.' 14-F41 requires the same of the surface — 'This FR requires no ability of the " +
        "cloud to reproduce a live code, deliberately'.",
    ).toEqual([]);
  });

  it("01-F80 (b)/01-F61: the verifier is Argon2id AT THE COST FLOOR, read as a PARAMETER", async () => {
    const minted = await mustMint();
    const near = await rowsContaining(minted.device_id);
    const blobs =
      near.some((row) => row.blob.includes("$argon2id$")) === true
        ? near
        : // Fallback for a store that keys the pending row by the hash alone: sweep the schema for
          // PHC strings. Capped because each candidate costs one real Argon2id verification at the
          // floor, and 01-F61 forbids reading a DURATION as the measurement either way.
          (await rowsContaining("$argon2id$")).slice(0, 30);
    const candidates = [
      ...new Set(blobs.flatMap((row) => row.blob.match(/\$argon2id\$[^"]+/g) ?? [])),
    ];
    expect(
      candidates.length,
      "01-F80 (b): the pending pairing is stored as an Argon2id verifier — no PHC string anywhere " +
        "in the kernel schema means the code is either in the clear or hashed by something the FR " +
        "did not name",
    ).toBeGreaterThan(0);

    let matched: string | undefined;
    for (const phc of candidates) {
      if (await verifyPin(phc, minted.code)) {
        matched = phc;
        break;
      }
    }
    expect(
      matched,
      "01-F80 (b): none of the stored Argon2id verifiers accepts the minted code, so the pending " +
        "pairing is verified by something else — 01-F26 is the product's single hashing story",
    ).toBeDefined();
    const params = Object.fromEntries(
      ((matched as string).split("$")[3] ?? "").split(",").map((pair) => {
        const [k, v] = pair.split("=");
        return [k ?? "", Number(v)];
      }),
    ) as Record<string, number>;
    // 01-F61's floor read as a PARAMETER, never an elapsed time — that FR's own words, and the
    // reason `pin.ts` exports the constant at all: "a fast machine reads as a weak one".
    expect(
      params.m,
      `01-F61 memory floor: PIN_ARGON2ID_PARAMS = ${JSON.stringify(PIN_ARGON2ID_PARAMS)}, got ` +
        JSON.stringify(params),
    ).toBeGreaterThanOrEqual(PIN_ARGON2ID_PARAMS.m);
    expect(params.t, "01-F61 iteration floor").toBeGreaterThanOrEqual(PIN_ARGON2ID_PARAMS.t);
    expect(params.p, "01-F61 parallelism floor").toBeGreaterThanOrEqual(PIN_ARGON2ID_PARAMS.p);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   §C — TTL IS 15 MINUTES (`01-F80` (c))
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */

describe("§C 01-F80 (c) — fifteen minutes, stamped from the act's own instant", () => {
  it("01-F80 (c): the pairing dies exactly 15 minutes after the instant the MINT was given", async () => {
    const now = Date.now() - 3_000;
    const minted = await mustMint({ now });
    expect(
      minted.expires_at,
      "01-F80 (c): 'TTL is 15 minutes and it is NOT an org setting.' The instant is the act's " +
        "own (18 §4: the clock is injected at the composition root; publish-http.ts's actOf rides " +
        "`now` on every write so 'one act is not split into two instants'). Reading Date.now() " +
        "inside the writer makes the TTL depend on how long the request queued.",
    ).toBe(now + PAIRING_TTL_MS);
  });

  it("01-F80 (c): a code five seconds INSIDE its fifteen minutes still pairs", async () => {
    const minted = await mustMint({ now: Date.now() - (PAIRING_TTL_MS - 5_000) });
    const key = deviceKeypair();
    const paired = await mustClaim(minted.code, key.public_key_pem);
    expect(paired.device_id).toBe(minted.device_id);
  });

  it("01-F80 (c)/(f): a code five seconds PAST them is refused `expired`, and leaves nothing behind", async () => {
    const minted = await mustMint({ now: Date.now() - (PAIRING_TTL_MS + 5_000) });
    const key = deviceKeypair();
    const reply = await claimOverHttp(
      { code: minted.code, public_key_pem: key.public_key_pem },
      { source: freshSource() },
    );
    expect(
      refusalOf(reply, "a claim five seconds past the TTL"),
      "01-F80 (f): the till must say WHICH — 'an owner reading yesterday's code off a note needs " +
        "to be told to re-issue rather than left doubting her typing'",
    ).toBe("expired");
    expect(
      await readRegistryRow(db, minted.request.org_id, minted.device_id),
      "01-F80 (c): 'An unclaimed code that expires leaves nothing — no registry row, no " +
        "certificate, no device'",
    ).toBeUndefined();
  });

  it("01-F80 (c)/(a): the CLAIM takes no clock from its caller — an expired code stays expired", async () => {
    const minted = await mustMint({ now: Date.now() - (PAIRING_TTL_MS + 5_000) });
    const key = deviceKeypair();
    const reply = await claimOverHttp(
      {
        code: minted.code,
        public_key_pem: key.public_key_pem,
        // A stranger's clock. 01-F80 (a) refuses a caller-stated org_id because there is no session
        // to check it against; a caller-stated INSTANT is the same claim about time, and it would
        // make (c)'s fifteen minutes decorative.
        now: minted.request.now,
      },
      { source: freshSource() },
    );
    deniedNoCredential(reply, "an expired code re-presented with a back-dated `now`");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   §D — ONE-TIME CLAIM, AND THE RACE IS DECIDED BY THE PUBLIC KEY (`01-F80` (d))
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */

describe("§D 01-F80 (d) — one code, one device, and a dropped response is a retry", () => {
  it("01-F80 (d): the SAME code with the SAME public key returns the SAME certificate", async () => {
    const minted = await mustMint();
    const key = deviceKeypair();
    const first = await mustClaim(minted.code, key.public_key_pem);
    const again = await mustClaim(minted.code, key.public_key_pem);
    expect(
      again.certificate_pem,
      "01-F80 (d): 'Re-presenting the same code with the same public key inside the TTL returns " +
        "the same certificate — a dropped response is a retry, not a burned device.' A writer that " +
        "re-issues here hands one device_id two certificates, which is 01-F73 (e)'s refusal read " +
        "from the other end.",
    ).toBe(first.certificate_pem);
    expect(again.device_id).toBe(first.device_id);
    expect(again.issuer_pem).toBe(first.issuer_pem);
    expect(
      (await orgDevices(minted.request.org_id)).map((row) => row.device_id),
      "one pairing, one registry row",
    ).toEqual([minted.device_id]);
  });

  it("01-F80 (d): the same code with a DIFFERENT public key is refused `already_claimed`, and the first device is untouched", async () => {
    const minted = await mustMint();
    const winner = deviceKeypair();
    const loser = deviceKeypair();
    const first = await mustClaim(minted.code, winner.public_key_pem);
    const reply = await claimOverHttp(
      { code: minted.code, public_key_pem: loser.public_key_pem },
      { source: freshSource() },
    );
    expect(
      refusalOf(reply, "a second device presenting a claimed code"),
      "01-F80 (d): 'every other presentation is refused already_claimed. So two devices presenting " +
        "one code produce ONE device: the loser is refused rather than handed a second certificate " +
        "for one device_id, which would be 01-F64's forked store and 01-F66's two-tills-one-identity " +
        "arriving at the credential layer, interleaving one lamport_seq between two origins.'",
    ).toBe("already_claimed");
    expect(reply.body.certificate_pem, "the loser gets no credential").toBeUndefined();
    expect(
      (await orgDevices(minted.request.org_id)).map((row) => row.device_id),
      "01-F80 (d): two devices presenting one code produce ONE device",
    ).toEqual([minted.device_id]);
    // The winner is unharmed by the loser's attempt — its retry still returns its own certificate.
    const retry = await mustClaim(minted.code, winner.public_key_pem);
    expect(retry.certificate_pem).toBe(first.certificate_pem);
  });

  it("01-F80 (d): after the TTL a CLAIMED-but-undelivered pairing is dead, and its registry row remains", async () => {
    // ~1.2 s of life left at the instant it is claimed, so the retry below happens after the TTL
    // without the suite waiting fifteen minutes for it.
    const minted = await mustMint({ now: Date.now() - (PAIRING_TTL_MS - 1_200) });
    const key = deviceKeypair();
    const paired = await mustClaim(minted.code, key.public_key_pem);
    await new Promise((resolve) => setTimeout(resolve, 1_800));
    const reply = await claimOverHttp(
      { code: minted.code, public_key_pem: key.public_key_pem },
      { source: freshSource() },
    );
    deniedNoCredential(reply, "a retry of a claimed pairing after its TTL");
    expect(
      (await orgDevices(minted.request.org_id)).map((row) => row.device_id),
      "01-F80 (d): 'After the TTL a claimed-but-undelivered pairing is dead: its registry row is " +
        "an unusable device that an owner can SEE and REVOKE, which is what 01-F70's required name " +
        "buys and what 14-F13 removes.' Deleting the row would take the owner's only handle on it.",
    ).toEqual([paired.device_id]);
  }, 30_000);
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   §E — ONE RESPONSE CARRIES EVERYTHING A DEVICE NEEDS TO BECOME A TILL
        (`01-F80` (f), `01-F73` (a)/(b), `01-F81` (a)/(c))

   This is the section the brief calls the headline, and `mustClaim` already refuses a response
   missing any member — so an implementation that returns a token and no certificate fails every
   test in this file that pairs, not only the ones below.
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */

describe("§E 01-F80 (f) — one act, two credentials, and the keys that make them mean something", () => {
  it("01-F80 (f): the response carries the device's IDENTITY — the five facts, all of them the owner's", async () => {
    const minted = await mustMint({ display_name: "Kitchen screen" });
    const paired = await mustClaim(minted.code, deviceKeypair().public_key_pem);
    expect(
      [paired.org_id, paired.branch_id, paired.device_id, paired.device_class, paired.display_name],
      "01-F80 (f): 'its identity (org_id, branch_id, device_id, device_class, name)'. 01-F65 (as " +
        "narrowed by 01-F80 (g)) makes this the identity the device then RUNS under — 'the identity " +
        "a device runs under is the one pairing wrote' — so a missing field is a host that cannot " +
        "open a store (01-F64 binds one at creation).",
    ).toEqual([
      minted.request.org_id,
      minted.request.branch_id,
      minted.device_id,
      DEVICE_CLASS,
      "Kitchen screen",
    ]);
  });

  it("01-F73 (b): the certificate names THREE facts — and `device_class` is deliberately not among them", async () => {
    const minted = await mustMint();
    const paired = await mustClaim(minted.code, deviceKeypair().public_key_pem);
    const cert = certOf(paired.certificate_pem);
    const attrs = subjectAttributes(cert);
    expect(
      [attrs.get("CN"), attrs.get("OU"), attrs.get("O")],
      "01-F73 (b): 'The cloud returns a certificate naming (org_id, branch_id, device_id)'. " +
        "packages/lan-pki records what a string subject cost the first time: 'CN=id\\,OU=branch' — " +
        "the branch glued into the common name, and 'a certificate is not self-checking'.",
    ).toEqual([minted.device_id, minted.request.branch_id, minted.request.org_id]);
    expect(
      cert.subject.includes(DEVICE_CLASS),
      "01-F73 (b): 'Three facts, not four, and device_class is deliberately NOT among them' — " +
        "'class decides hub eligibility (01-F39), it changes when a device is re-purposed, and a " +
        "certificate is a long-lived credential', so putting it here would mean re-issuing a " +
        "credential to change a role. The certificate answers WHO; the roster answers what it may do.",
    ).toBe(false);
    const notBefore = Date.parse(cert.validFrom);
    const notAfter = Date.parse(cert.validTo);
    expect(
      notBefore,
      "a certificate whose validity has not started admits nothing today",
    ).toBeLessThanOrEqual(Date.now());
    expect(
      notAfter,
      "01-F73 (d): 'The certificate expires and renews on 01-F47's pattern' — it expires, and not " +
        "before it is issued",
    ).toBeGreaterThan(Date.now());
  });

  it("01-F73 (b): the certificate VERIFIES against the org issuer PEM that travelled with it", async () => {
    const minted = await mustMint();
    const paired = await mustClaim(minted.code, deviceKeypair().public_key_pem);
    const cert = certOf(paired.certificate_pem);
    const issuer = certOf(paired.issuer_pem);
    expect(
      cert.verify(issuer.publicKey),
      "01-F73 (b): the certificate is 'signed by a per-org issuing key', and 01-F74 (c) makes the " +
        "chain half of LAN admission that key: 'the peer's certificate verifies against the org " +
        "issuer'. An issuer PEM that does not verify the certificate shipped beside it leaves every " +
        "peer on the branch refusing every other peer.",
    ).toBe(true);
    expect(
      cert.checkIssued(issuer),
      "the issuer named by the certificate is the PEM it arrived with",
    ).toBe(true);
  });

  it("01-F81 (c): the pinned ROSTER-SIGNING key is present and is NOT the issuing key", async () => {
    const minted = await mustMint();
    const paired = await mustClaim(minted.code, deviceKeypair().public_key_pem);
    const rosterKey = createPublicKey(paired.roster_signing_public_key_pem);
    const issuerKey = certOf(paired.issuer_pem).publicKey;
    expect(
      spkiDerOf(rosterKey).equals(spkiDerOf(issuerKey)),
      "01-F81 (c): 'THE SIGNING KEY IS NOT THE ISSUING KEY, AND THAT IS FORCED BY 01-F74 (c) " +
        "RATHER THAN CHOSEN' — that clause states 'a compromised issuer still cannot admit a device " +
        "the roster does not name', and the property is 'false the moment one key does both jobs, " +
        "because a compromised issuer would mint the certificate AND sign a roster naming its " +
        "fingerprint'. The obvious design is refused BY NAME; this is the assertion that refuses it.",
    ).toBe(false);
    expect(
      paired.roster_signing_public_key_pem,
      "01-F81 (c): 'its public half is PINNED on the device at pairing (01-F80 (f)) … Pinned and " +
        "not certified by the issuer, since a chain from the issuer hands a compromised issuer the " +
        "power to mint a fresh signing key'. A public key, therefore — not a certificate.",
    ).toContain("BEGIN PUBLIC KEY");
  });

  it("01-F47: the device TOKEN in that same response opens a session — this is what 'become a till' means", async () => {
    const minted = await mustMint();
    const paired = await mustClaim(minted.code, deviceKeypair().public_key_pem);
    expect(
      await opensASession(paired),
      "01-F80 (f): 'and 01-F47's device token — one act, two credentials … the token issued here " +
        "is simply the first value of the one sync-client already persists and renews'. 18 §5: the " +
        "REGISTRY, never the token, decides — so this passes only if the claim both minted a valid " +
        "token AND wrote the unrevoked, branch-matching registry row the gateway checks it against.",
    ).toBe(true);
  });

  it("01-F73 (a)/(b·i): no private key material travels — not the device's, not the org's", async () => {
    const minted = await mustMint();
    const paired = await mustClaim(minted.code, deviceKeypair().public_key_pem);
    expect(
      JSON.stringify(paired.raw),
      "01-F73 (a): 'The private key never leaves it, is never transmitted, never logged and never " +
        "backed up'; (b·i): the device 'never holds issuing material'. An org issuing key that " +
        "reached one till would mint credentials for the whole fleet from a shop counter.",
    ).not.toMatch(/PRIVATE KEY/);
  });

  it("01-F73 (b)/01-F71: the issuer is PER ORG and STABLE — and one org's certificate is inert in another", async () => {
    const orgA = newId();
    const orgB = newId();
    const first = await mustMint({ org_id: orgA });
    const second = await mustMint({ org_id: orgA, branch_id: newId() });
    const other = await mustMint({ org_id: orgB });
    const a1 = await mustClaim(first.code, deviceKeypair().public_key_pem);
    const a2 = await mustClaim(second.code, deviceKeypair().public_key_pem);
    const b1 = await mustClaim(other.code, deviceKeypair().public_key_pem);

    expect(
      a2.issuer_pem,
      "01-F73 (b): PER ORG. Two devices in one org that hold different issuers can never admit " +
        "each other — 01-F74 (c)'s chain half fails on the branch LAN — so a fresh issuer per " +
        "claim is a mesh that never forms.",
    ).toBe(a1.issuer_pem);
    expect(
      a2.roster_signing_public_key_pem,
      "01-F81 (c): per ORG, and pinned at pairing. Two devices in one org pinning different roster " +
        "keys means one of them refuses every roster the cloud signs (01-F74 (d): unreadable).",
    ).toBe(a1.roster_signing_public_key_pem);
    expect(
      b1.issuer_pem,
      "01-F73 (b): 'Per-org and not platform-wide: a branch roster from one org must be " +
        "STRUCTURALLY incapable of admitting a device from another (00 §5.4, 01-F71), which a " +
        "single platform issuer would leave to a field comparison somebody can forget.'",
    ).not.toBe(a1.issuer_pem);
    expect(
      certOf(a1.certificate_pem).verify(certOf(b1.issuer_pem).publicKey),
      "01-F71: org B's issuer must not vouch for org A's till",
    ).toBe(false);
    expect(
      b1.roster_signing_public_key_pem,
      "01-F81 (c): the roster-signing keypair is per org on 01-F73 (b)'s reasoning unchanged",
    ).not.toBe(a1.roster_signing_public_key_pem);
  });

  it("01-F81 (a)/(f): the issued certificate is recorded on the cloud, or `device_roster` can never carry it", async () => {
    const minted = await mustMint();
    const paired = await mustClaim(minted.code, deviceKeypair().public_key_pem);
    const cert = certOf(paired.certificate_pem);
    const fingerprint = fingerprintOf(cert);
    expect(fingerprint, "01-F81 (a): lowercase hex SHA-256 of the DER").toMatch(/^[0-9a-f]{64}$/);
    // Three renderings, because this file does not own how the certificate is stored: the
    // fingerprint itself, the PEM body (a text column), or the DER (a bytea column renders as hex).
    const needles = [
      fingerprint,
      paired.certificate_pem.replace(/-----[^-]+-----|\s/g, "").slice(0, 48),
      cert.raw.toString("hex").slice(0, 96),
    ];
    const hits = (await Promise.all(needles.map(rowsContaining))).flat();
    expect(
      hits.length,
      "01-F81 (a) puts 'the certificate fingerprint as lowercase hex SHA-256 of the DER' on every " +
        "device_roster row, and (f) names the producer: 'the artifact's producer is the registry " +
        "WRITE (01-F80's claim, 14-F13's revocation)'. A claim that keeps no record of what it " +
        "issued leaves 01-F74 (c)'s pin half unbuildable — and the chain alone 'admits anything the " +
        "issuer ever signed, including a device revoked an hour ago'.",
    ).toBeGreaterThan(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   §F — THE REFUSALS ARE NAMED (`01-F80` (f))
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */

describe("§F 01-F80 (f) — five refusals, and the till must say which one", () => {
  it("01-F80 (f): a code no mint ever produced is `unknown_code`", async () => {
    const key = deviceKeypair();
    const reply = await claimOverHttp(
      { code: "13579246", public_key_pem: key.public_key_pem },
      { source: freshSource() },
    );
    expect(
      refusalOf(reply, "a code that was never minted"),
      "01-F80 (f): 'Distinguishing unknown_code from expired tells a guesser that a code once " +
        "existed, and that is a deliberate trade, not an oversight: the guessing budget is already " +
        "bounded by (e), while an owner reading yesterday's code off a note needs to be told to " +
        "re-issue rather than left doubting her typing.'",
    ).toBe("unknown_code");
  });

  it("01-F80 (f): a refusal hands over NO half of the pair — no certificate, no token", async () => {
    const reply = await claimOverHttp(
      { code: "24680135", public_key_pem: deviceKeypair().public_key_pem },
      { source: freshSource() },
    );
    // The named refusal FIRST: a route that does not exist carries no certificate either, and this
    // assertion is about what a refusing act withholds, not about an absent surface.
    refusalOf(reply, "a refusal's payload");
    expect(
      reply.body.certificate_pem,
      "01-F73: a refusal that issued a certificate has admitted a device",
    ).toBeUndefined();
    expect(
      reply.body.token,
      "01-F47: a refusal that issued a token has admitted a device",
    ).toBeUndefined();
    expect(
      reply.body.roster_signing_public_key_pem,
      "01-F81 (c): the pinned key is part of becoming a till, not a consolation prize",
    ).toBeUndefined();
  });

  // ⚠ **NO PROOF-OF-POSSESSION TEST HERE, and the absence is deliberate rather than an oversight.**
  // `01-F80` (f): "There is no proof-of-possession challenge: a certificate is useless without the
  // private key, and `01-F73` (b·i) has the device *never encode a request*, so a CSR-shaped step
  // would add a signature format to the till for no gain." Every successful claim in this file
  // already sends `{ code, public_key_pem }` and nothing else, so the property is asserted by every
  // green `mustClaim` — a separate test asserting a certificate came back would restate `mustClaim`
  // and count as coverage it is not.
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   §H — THE TWO ADMISSION PATHS ARE ONE REGISTRY (`01-F25`, `01-F47`, `01-F48`, `14-F12`)

   `provision-device.ts` and `revoke-device.ts` ship today; `01-F80` is the back-office half
   `01-F25` has specified since Draft 1. Nothing here re-specifies either command — these assert
   that what the claim writes is the same row those two already read.
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */

describe("§H 01-F25/01-F48 — the paired device is a first-class registry row, and revocation still wins", () => {
  it("14-F12/01-F70: a paired device appears on the device list under the name the owner typed", async () => {
    const minted = await mustMint({ display_name: "Front counter" });
    const paired = await mustClaim(minted.code, deviceKeypair().public_key_pem);
    const listed = must(
      (await orgDevices(minted.request.org_id)).find((row) => row.device_id === paired.device_id),
      "the paired device on 14-F12's list",
    );
    expect(
      [listed.branch_id, listed.device_class, listed.display_name, listed.revoked_at],
      "14-F41: 'The waiting row becomes 14-F12's device row.' 01-F70 put the name on this row " +
        "because 'the operator reading 14-F12's device list is by construction not standing in " +
        "front of the till'; a paired device with a null name is the UUID-only list that FR exists " +
        "to end.",
    ).toEqual([minted.request.branch_id, DEVICE_CLASS, "Front counter", null]);
    expect(
      listed.token_expires_at,
      "01-F47: 'The cloud's token_expires_at record is seeded at registration so a relayed origin " +
        "is due for renewal from its first day' — and registry.ts warns that a row seeded from the " +
        "DATABASE clock reads as permanently not-due",
    ).toBeGreaterThan(Date.now());
  });

  it("14-F13: the shipped kill switch can revoke a device that pairing admitted", async () => {
    const minted = await mustMint();
    const paired = await mustClaim(minted.code, deviceKeypair().public_key_pem);
    const outcome = await revokeRegisteredDevice(db, {
      org: minted.request.org_id,
      device: paired.device_id,
    });
    expect(
      [outcome.branch_id, outcome.device_class, outcome.already],
      "revoke-device.ts reads the row FIRST and refuses an unknown device precisely so an operator " +
        "cannot 'walk away believing a live till is dead' — a pairing that wrote a row the kill " +
        "switch cannot find is that failure with the roles reversed",
    ).toEqual([minted.request.branch_id, DEVICE_CLASS, false]);
  });

  it("01-F47/01-F48: a claim NEVER resurrects a revoked device — the runbook's own defect, on the pairing path", async () => {
    const minted = await mustMint();
    const key = deviceKeypair();
    const paired = await mustClaim(minted.code, key.public_key_pem);
    await revokeRegisteredDevice(db, { org: minted.request.org_id, device: paired.device_id });
    const before = must(
      await readRegistryRow(db, minted.request.org_id, paired.device_id),
      "the revoked registry row",
    );

    const reply = await claimOverHttp(
      { code: minted.code, public_key_pem: key.public_key_pem },
      { source: freshSource() },
    );
    deniedNoCredential(reply, "a retry of a claim whose device has since been revoked");

    const after = must(
      await readRegistryRow(db, minted.request.org_id, paired.device_id),
      "the registry row after the retry",
    );
    expect(
      after.revoked_at,
      "PINNED READING — 01-F80 does not rule on revocation and this suite says so in its header. " +
        "Derived from: 01-F47 ('revocation remains the operative kill switch'), 01-F48 " +
        "(fail-closed; 'revocation blocks reads as well as writes'), and provision-device.ts's own " +
        "recorded footgun — running-the-stack.md §6b's 'on conflict … do update set revoked_at = " +
        "null' UN-REVOKED a revoked device, and that command 'refuses a revoked row in BOTH of its " +
        "modes'. Two admission paths that disagree about revocation are one path plus a bypass.",
    ).toBe(before.revoked_at);
    expect(
      await opensASession(paired),
      "01-F48: the token the first claim issued must not go on opening sessions for a revoked " +
        "device — the registry, never the token, decides (18 §5)",
    ).toBe(false);
  });

  it("01-N5/01-F73 (e): the shipped provisioning command refuses to re-credential a paired device", async () => {
    const minted = await mustMint();
    const paired = await mustClaim(minted.code, deviceKeypair().public_key_pem);
    await expect(
      provisionDevice(
        db,
        {
          org: minted.request.org_id,
          branch: minted.request.branch_id,
          device: paired.device_id,
          deviceClass: DEVICE_CLASS,
          name: minted.request.display_name,
          reissue: false,
        },
        TEST_TOKEN_SECRET,
        {},
        Date.now(),
      ),
      "one registry, two admission paths: 'Registering a device twice is a provisioning error — " +
        "re-registration mints a FRESH device_id (01-N5)'. A pairing row the command cannot see is " +
        "a second registry.",
    ).rejects.toThrow(/already registered/i);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   §G — RATE LIMIT (`01-F80` (e))

   ⚠ **PLACED LAST ON PURPOSE, out of letter order.** It is the only block that deliberately trips
   a limiter, and every other probe in this file uses a fresh loopback source so that nothing else
   spends the budget. If this ran earlier, a per-source implementation would be unaffected and a
   GLOBAL one would redden tests that are not about rate limiting — attributing its defect to
   whichever test happened to follow it.
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */

describe("§G 01-F80 (e) — bound the burst, and never lock the deployment", () => {
  const ATTACKER = "127.9.240.1";
  /**
   * ⚠ **THIS NUMBER IS THIS SUITE'S, NOT THE FR's.** `01-F80` (e) says "capped per source over a
   * short window" and names no number, and the FR's own preamble marks "the shape of the limit (e)"
   * as one of three choices with no corpus precedent. Sixty consecutive failures from one peer is
   * generous for a code an operator types once; an implementation whose cap is higher should
   * contest this line rather than raise the cap, because the entropy argument in (b) — "26.6 bits
   * is not an offline margin, and what makes that sufficient is the 15-minute TTL, the one-time
   * claim and the hash together" — is sized against a bounded online guess.
   */
  const BURST = 60;

  it("01-F80 (e): a burst of failed claims from ONE source is capped and refused `rate_limited`", async () => {
    const key = deviceKeypair();
    const seen: PairingRefusal[] = [];
    for (let i = 0; i < BURST; i++) {
      const code = String(10_000_000 + i);
      const reply = await claimOverHttp(
        { code, public_key_pem: key.public_key_pem },
        { source: ATTACKER },
      );
      seen.push(refusalOf(reply, `guess ${i + 1} from one source`));
      if (seen[seen.length - 1] === "rate_limited") break;
    }
    expect(
      seen,
      `01-F80 (e): 'Failed claims are capped per source over a short window and refused ` +
        `rate_limited beyond it.' ${BURST} unanswered guesses from one peer with no cap is the ` +
        "online budget (b)'s 26.6 bits is sized against, spent unmetered.",
    ).toContain("rate_limited");
  }, 60_000);

  it("01-F80 (e): it never locks the deployment — another source still pairs, and the owner still mints", async () => {
    // The attacker of the previous test is still hammering, conceptually: the cap has tripped for
    // ATTACKER inside this same window. A restaurant on the other side of the pooled deployment
    // must still be able to commission a till.
    const minted = await mustMint();
    const paired = await mustClaim(minted.code, deviceKeypair().public_key_pem, {
      source: freshSource(),
    });
    expect(
      paired.device_id,
      "01-F80 (e): 'A deployment-wide lockout is refused rather than deferred: on R17's pooled " +
        "deployment it would let one attacker stop every tenant commissioning a till, which is a " +
        "worse outcome than the guessing it prevents.' A limiter that is not per-source is that " +
        "lockout with a smaller window.",
    ).toBe(minted.device_id);
  }, 60_000);
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   §I — THE CLOSED SET WAS EXERCISED, NOT MERELY DECLARED
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */

describe("§I 01-F80 (f) — the refusal set is closed, and this suite reached four of its five members", () => {
  it("01-F80 (f): every refusal this file read is a member, and the four with triggers were all provoked", () => {
    // Containment and not equality: `refusalOf` already fails at the point of reading on anything
    // outside the closed five, and an implementation that legitimately answered `unavailable`
    // somewhere this suite did not anticipate would be red here for a rule no FR states.
    for (const provocable of ["unknown_code", "expired", "already_claimed", "rate_limited"]) {
      expect(
        [...refusalsSeen],
        "K-3's dead-oracle defect, one file over: a closed set asserted in a helper nothing reaches " +
          "is a constant, not a test. These four are every member 01-F80 (f) gives a trigger for; " +
          "`unavailable` is a legal member with no specified cause anywhere in the corpus, so this " +
          "suite provokes none and invents none (commandment 2).",
      ).toContain(provocable);
    }
    expect(
      PAIRING_REFUSALS.length,
      "01-F80 (f): 'The refusal set is CLOSED — unknown_code · expired · already_claimed · " +
        "rate_limited · unavailable — and the till must say which one … those five send an " +
        'operator to five different actions and "pairing failed" sends her to none.\'',
    ).toBe(5);
  });
});
