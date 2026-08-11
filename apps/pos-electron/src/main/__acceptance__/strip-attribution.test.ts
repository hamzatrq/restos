// ACCEPTANCE TESTS — the name on the strip is the name in the ledger.
//
// FRs: `02-F19` (every action is attributed; `StatusStrip` renders the NAME, not a role),
// `02-F41` (attribution is whoever's PIN is in), `02-F45` (one fact, one source — two can
// disagree and an append-only ledger has no rule for which wins), `02-F18` (no anonymous mode;
// a locked device shows only the unlock screen), `01-F27` (a device identity is never promoted
// into a user identity), `00 §5.7` (a surface reports what is TRUE).
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// WHAT WAS BROKEN, AND WHY READING THE DIFF NEVER FOUND IT
//
// `DeviceState` carries TWO identity fields. `user` is the `01-F26` session, added by S-0c
// (`5677452`) and stamped into every envelope as `actor_user_id`. `actor` is older — it shipped
// with the first launch commit (`8b39529`), before identity existed — and it is the one
// `StatusStrip` actually renders, under the caption *"02-F19 — attribution is never anonymous.
// The name is shown, not just a role."*
//
// When identity landed it reached the envelope, the permission matrix and `DeviceState.user`.
// Nothing moved the STRIP over. `main/index.ts` went on passing the literal `actor: "dev"`, so a
// till that had signed Ayesha in, refused her the day open on her real role, and written
// `actor_user_id: "user-ayesha"` into every event, told her she was `dev` — for the life of the
// process, on the one piece of chrome `27-F1` guarantees never leaves the screen.
//
// Every gate was green while that was true: 330 tests, `pnpm verify` exit 0, `seams:check`
// clean. `identity-attribution.test.ts` even carries a test titled *"the identity SHOWN and the
// identity STAMPED are one fact, not two"* — and it compares `deviceState().user` against the
// envelope, which agreed all along. The guard was built correctly and pointed one field away
// from the one the product draws. That is the round-3 law's defect, in the tree, and it is why
// this file asserts against the RENDERED field by name.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// TWO SECTIONS BECAUSE TWO PROPERTIES ARE NEEDED, AND EITHER ALONE BLESSES A BROKEN PRODUCT:
//
//   §A  BEHAVIOUR — `deviceState().actor` follows the session, and names the same person the
//       envelope does. Green against a gateway no application ever builds.
//   §B  THE SEAM   — `main/index.ts` does not hand the strip a constant. Read off SOURCE,
//       because that file imports `electron` and cannot be loaded here (the house pattern:
//       `catalog-seam.test.ts` §D, `kot-printing.test.ts` §G).

import { readFileSync } from "node:fs";
import type { DeviceStore } from "@restos/sync-client";
import { describe, expect, it, vi } from "vitest";
import { resolveAging } from "../../../../pass-kds/src/main/aging";
import { createGateway, type GatewayDeps } from "../gateway";

const AYESHA = { user_id: "user-ayesha", display_name: "Ayesha" } as const;
const HINA = { user_id: "user-hina", display_name: "Hina" } as const;

/**
 * The locked placeholder and the device label are DIFFERENT STRINGS here, deliberately.
 *
 * The shipped app passes one constant for both (`01-F27` — the locked value is the device's own
 * label and never a person's name), so a fixture that copied that would make
 * `actor: deps.actor` and `actor: deps.deviceLabel` indistinguishable, and an implementation
 * reading either would pass. Keeping them apart is what points §A at the dangerous case.
 */
const LOCKED_PLACEHOLDER = "terminal-placeholder";
const DEVICE_LABEL = "Counter 1";

const JSON_LINES = JSON.stringify({
  "line-a": { item_id: "i-karahi", qty: 1, unit_price_paisa: 45_000, states: ["confirmed"] },
});

const harness = (start: { user_id: string; display_name: string } | null = null) => {
  let unlocked = start;
  const append = vi.fn((input: unknown) => ({ ...(input as object), lamport_seq: 1 }));
  const deps: GatewayDeps = {
    store: {
      identity: { org_id: "org1", branch_id: "br1", device_id: "device-counter-1" },
      openOrders: () => [
        { order_id: "order-1234abcd", json_lines: JSON_LINES, pay_total: 0, channel: "counter" },
      ],
      kitchenQueue: () => [],
      availability: () => [],
      branchTimeStatus: () => ({
        offset_ms: 0,
        basis: "branch",
        skew_ms: null,
        skew_flagged: false,
      }),
      append,
    } as unknown as DeviceStore,
    catalog: (id) => ({ name: id }),
    menu: () => [{ id: "i-karahi", name: "Chicken Karahi" }],
    priceOf: () => 45_000,
    actor: LOCKED_PLACEHOLDER,
    session: () => unlocked,
    deviceLabel: DEVICE_LABEL,
    training: false,
    reachability: () => ({ lan: "ok", hub: "ok", cloud: "down" }),
    blockedCursor: () => null,
    // 01-F56/DEC-SYNC-011 — the catalog refusal, required on GatewayDeps. Healthy here: this
    // harness is about another fact, and a raised refusal would be scenery in it.
    catalogRefusal: () => null,
    businessDay: () => "2026-08-07",
    // 27-F68 — the density of the glass, required on GatewayDeps.
    panelPpi: () => 100.5,
    // `27-F11c` — required, so a host that forgets the panel-fit notice is a typecheck
    // error rather than a silent no-op. `null` = this fixture's glass clears the floor.
    // `03-F14`/`03-F47` — REQUIRED on `GatewayDeps` since `03-F25` put aging timers on the
    // counter. The SHIPPED resolver rather than a convenient constant, so a fixture that is not
    // about the thresholds still gets the product's own answers.
    aging: resolveAging(undefined).thresholdsFor,
    panelFit: () => null,
  };
  return {
    gateway: createGateway(deps),
    setSession: (next: { user_id: string; display_name: string } | null) => {
      unlocked = next;
    },
    envelope: (n = 0) => append.mock.calls[n]?.[0] as Record<string, unknown>,
  };
};

// ── A. BEHAVIOUR — the strip names the operator ──────────────────────────────────────────────

describe("02-F19 — the field the strip RENDERS carries the operator's name", () => {
  it("names the signed-in user, not a construction-time constant", () => {
    // The literal assertion the shipped defect fails. `deps.actor` is in scope and is what the
    // implementation used to return; naming the expected value explicitly is what makes the two
    // distinguishable, rather than asserting some non-empty string came back.
    const h = harness(AYESHA);

    expect(h.gateway.deviceState().actor).toBe("Ayesha");
    expect(h.gateway.deviceState().actor).not.toBe(LOCKED_PLACEHOLDER);
  });

  it("is the DISPLAY NAME and not the identifier — `01-F54` degrades, it does not substitute", () => {
    // The near-miss implementation: `user?.user_id ?? deps.actor` typechecks, follows the
    // session, satisfies the test above's "not the placeholder" half, and puts a UUID-shaped
    // identifier where `02-F19` asks for a name. `main/index.ts` is where the degrade-to-
    // identifier rule (`01-F54`) is applied, on the roster lookup, and it must not be
    // re-applied here on a session that already carries a name.
    const h = harness(AYESHA);

    expect(h.gateway.deviceState().actor).not.toBe(AYESHA.user_id);
  });

  it("FOLLOWS the session — one gateway instance serves the whole process life", () => {
    // `ipcMain.handle` admits one handler per channel, so the gateway is built once at boot
    // while `01-F26`'s unlock/auto-lock cycle moves the identity 20–60× a shift. Two different
    // people, so an implementation returning any single constant fails here whichever one it
    // happens to be.
    const h = harness(AYESHA);
    expect(h.gateway.deviceState().actor).toBe("Ayesha");

    h.setSession(HINA);
    expect(h.gateway.deviceState().actor).toBe("Hina");
  });

  it("02-F45 — the name SHOWN and the id STAMPED are one read, never two", () => {
    // The disagreement this FR exists to forbid, asserted on the RENDERED field. A strip naming
    // Ayesha over an envelope attributing Hina cannot be resolved in an append-only ledger, and
    // `01-F1` makes whichever one is wrong permanent.
    const h = harness(HINA);
    const shown = h.gateway.deviceState();
    h.gateway.append({ type: "order.created", payload: { order_id: "o-1" }, refs: [] });

    expect(shown.actor).toBe(shown.user?.display_name);
    expect(shown.user?.user_id).toBe(h.envelope(0)?.actor_user_id);
    expect(shown.actor).toBe("Hina");
    expect(h.envelope(0)?.actor_user_id).toBe("user-hina");
  });

  it("01-F27 — a LOCKED device shows no person, and never the device label as one", () => {
    // `02-F18`: no anonymous mode. `App.tsx` reads `user` to draw the unlock gate, so this
    // string reaches no surface — but `deviceState()` is PARSED on every locked read, so the
    // value has to exist and has to be honest. The dangerous substitution is the device's
    // identity standing in for a user's, which is what `01-F27` names.
    const h = harness(null);
    const state = h.gateway.deviceState();

    expect(state.user).toBeNull();
    expect(state.actor).toBe(LOCKED_PLACEHOLDER);
    expect(state.actor).not.toBe("Ayesha");
    expect(state.actor).not.toBe("Hina");
  });

  it("and a re-lock takes the name back off the strip", () => {
    // The direction that decays: an implementation caching the last name it rendered keeps a
    // cashier's name on a till she has walked away from, which is the screen half of the defect
    // `identity-attribution.test.ts` pins on the envelope.
    const h = harness(AYESHA);
    expect(h.gateway.deviceState().actor).toBe("Ayesha");

    h.setSession(null);
    expect(h.gateway.deviceState().actor).toBe(LOCKED_PLACEHOLDER);
  });
});

// ── B. THE SEAM — the shipped application does not hand the strip a constant ─────────────────
//
// §A is green against a gateway nothing constructs. The defect this file was written for lived
// entirely in the ARGUMENT `main/index.ts` passed, and no behaviour suite over `createGateway`
// can see it. Source-read for the same reason `catalog-seam.test.ts` §D is: `index.ts` imports
// `electron` and cannot be loaded into vitest.

const INDEX_SRC = readFileSync(new URL("../index.ts", import.meta.url).pathname, "utf8");

/**
 * Comments removed — the seam is what the CODE passes, and this file's own prose about `"dev"`
 * would otherwise satisfy a scan looking for it. Only whole-line `//` are stripped, so a `//`
 * inside a string literal mid-line survives.
 */
const CODE = INDEX_SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/** The object literal `main/index.ts` hands `createGateway`. No nested braces live in it. */
const gatewayArgs = /createGateway\s*\(\s*\{([\s\S]*?)\n\s*\}\s*\)/.exec(CODE)?.[1] ?? "";

/**
 * The expression `index.ts` passes for `key`, or `undefined` if it passes none.
 *
 * Shorthand is handled (`{ session }`), because that is how the shipped call writes it and a
 * matcher that only understood `key: value` would report the session as ABSENT — a guard failing
 * open on the one argument the fix depends on.
 */
const argFor = (key: string): string | undefined => {
  const m = new RegExp(`^\\s*${key}\\s*(?::\\s*([^,\\n]+)|,\\s*$)`, "m").exec(gatewayArgs);
  return m === null ? undefined : (m[1] ?? key).trim();
};

describe("the seam — main/index.ts does not put a literal on the honesty strip", () => {
  it("is actually reading the file it guards", () => {
    // ROUND-2 PATTERN 2, "the guard passed by not looking": every assertion below is satisfied
    // by an empty string or an unmatched regex. Anchored on lines that have nothing to do with
    // attribution, so this check cannot be satisfied by the code it is guarding.
    expect(INDEX_SRC).toContain("app.whenReady()");
    expect(INDEX_SRC.length).toBeGreaterThan(4_000);
    expect(gatewayArgs, "the createGateway({...}) call must be found").not.toBe("");
    expect(gatewayArgs).toContain("store");
  });

  it("hands the gateway the SESSION, which is what the strip is derived from", () => {
    // Without this argument there is no identity to derive from and `deps.actor` is all that is
    // left — the pre-S-0c state, where the fix is unreachable however correct `gateway.ts` is.
    const session = argFor("session");
    expect(session, "createGateway must be given a session").toBeDefined();
    expect(session).toMatch(/^[A-Za-z_$][\w$]*(?:\.[\w$]+)*$/);
    expect(session).not.toBe("undefined");
    expect(session).not.toBe("null");
  });

  it("passes no string LITERAL for `actor` — that is the defect verbatim", () => {
    // `actor: "dev"` is what shipped. Extracted and inspected rather than pattern-matched for
    // absence: a `not.toContain('"dev"')` scan would pass the moment someone wrote `"cashier"`.
    const actor = argFor("actor");
    expect(actor, "createGateway must be given an actor").toBeDefined();
    expect(actor, `02-F19 — the strip's name must not be a constant, got \`${actor}\``).not.toMatch(
      /^["'`]/,
    );
    expect(actor).toMatch(/^[A-Za-z_$][\w$]*(?:\.[\w$]+)*$/);
  });

  it("01-F27 — and the locked placeholder is the DEVICE's own label, not a stand-in person", () => {
    // The decidable form of `01-F27` at this seam. `gateway.ts` documents `deps.actor` as the
    // locked value; the only thing it may honestly be is what the device already calls itself.
    // `actor: "dev"` fails this as well as the literal check above, and so would
    // `actor: SOME_OTHER_NAME` — which the literal check alone would let through.
    expect(argFor("actor")).toBe(argFor("deviceLabel"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// WHAT THIS FILE DOES NOT PROVE, stated rather than left to look covered:
//
// * **That the strip renders `actor` at all.** That is `packages/ui`'s `StatusStrip` and
//   `renderer/Counter.tsx`; the renderer suites carry `DeviceState` fixtures whose `actor` and
//   `user.display_name` already agree (`counter.dom.test.tsx` says so in a comment). Nothing here
//   would notice if `Counter.tsx` switched to `device.user?.display_name` — which would be an
//   improvement, not a regression, and is named as owed in the commit.
// * **That `deps.actor` is worth keeping.** It is vestigial: `main/index.ts` now passes the same
//   expression to it and to `deviceLabel`, and the honest shape is one field. It survives because
//   `identity-attribution.test.ts` and `gateway.test.ts` both build `GatewayDeps` literals that
//   name it, and removing the member would fail their excess-property check — reddening two
//   protected oracles under a correct implementation, which the round-3 law names as its own
//   kind of damage. A finding for a test-owning session, not a fix to make here.
// * **Anything about the LOCKED strip's copy.** `02-F18` draws no strip on a locked device, so no
//   FR names what that string should say. §A pins the dep's contract, not a design decision.
