/**
 * `02-F6` / `02-F50` — **the host seam for `C7`'s quick-tag pick list.**
 *
 * ⚠ **THIS IS A TRIPWIRE WRITTEN BY THE IMPLEMENTING SESSION, NOT AN ACCEPTANCE ORACLE.** The
 * `24 §3` oracles for this track were authored from spec text by another session and are read-only
 * (`renderer/line-correction.dom.test.tsx`, `main/__acceptance__/line-correction-seam.test.ts`).
 * Neither covers the HOST wiring, and its own header says why it cannot: *"the NAME is this file's
 * declared interpretation … what is NOT negotiable is that the list comes from the host"*. So this
 * file exists to make the second half of that sentence assertable.
 *
 * It exists because `shared/ipc.ts` now says of `RestosBridge.quickTags` that
 * *"`main/__acceptance__/quick-tags-seam.test.ts` is the assertion that stands in for the type"* —
 * and `AGENTS.md` is explicit that **a comment promising a protection that does not exist is worse
 * than no comment, because it retires the hand-written assertion someone would otherwise write.**
 * Writing this is what makes that sentence true.
 *
 * ── The defect it is aimed at ────────────────────────────────────────────────────────────────
 *
 * The wave's named recurring defect: a correct subsystem with no seam to the product. `quickTags`
 * is OPTIONAL on `RestosBridge` (several older oracle harnesses close with
 * `satisfies RestosBridge`), so **the type cannot carry this claim** — a host that never wires the
 * channel, or a preload that never exposes it, leaves the counter with no tag row and `C7`
 * unbuilt, with every gate green and every suite passing. That is exactly the state the removal
 * half of this track was in for a wave: `Cart` declared `onRemove` and `Counter.tsx` never passed
 * it.
 *
 * ── What a source read can and cannot do, said plainly ───────────────────────────────────────
 *
 * §A and §B are SOURCE READS, the same instrument and the same admission as
 * `phone-entry-host.test.ts` and `availability-seam.test.ts` §G: `main/index.ts` builds an
 * Electron app at module scope and no suite in this package can import it. It is weak — it cannot
 * tell a wired handler from a commented-out one. §C is behavioural over the pure resolver, which
 * is the half that CAN be executed.
 */

import { readFileSync } from "node:fs";
import { describeQuickTags, QUICK_TAGS_ENV, resolveQuickTags } from "@restos/device-config";
import { describe, expect, it } from "vitest";

const src = (rel: string): string => readFileSync(new URL(rel, import.meta.url).pathname, "utf8");

const INDEX = src("../index.ts");
const PRELOAD = src("../../preload/index.ts");

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — the shipped HOST resolves the list and wires the channel.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 02-F6/02-F50 — main resolves the org's tags and serves them", () => {
  it("reads `00 §7` layer 2's key through the shared resolver, not an inline literal", () => {
    // Not a second parser: `04 §7` names the same list as *"quick-tag list (shared with doc 02)"*,
    // so a copy here is the drift `01-F60`'s enabled-set already cost this product once.
    expect(INDEX).toMatch(/resolveQuickTags\(process\.env\[QUICK_TAGS_ENV\]\)/);
  });

  it("registers a handler for the channel", () => {
    // Without this the renderer's `quickTags()` rejects, the counter catches, and the tag row is
    // simply never drawn — indistinguishable from an org with no tags configured.
    expect(INDEX).toMatch(/ipcMain\.handle\(\s*CHANNELS\.quickTags/);
  });

  it("`00 §5.7` — the boot line reports the list, including the unset case", () => {
    // An unconfigured list is INVISIBLE from the screen: no tag row looks exactly like a note
    // surface that was never built. The boot line is the only thing that separates them.
    expect(INDEX).toMatch(/describeQuickTags\(/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — the shipped PRELOAD exposes it. The other half of one seam.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 18 §9 — the renderer can reach the channel through the one bridge", () => {
  it("the preload bridge serves `quickTags`", () => {
    // Main can wire a channel and the renderer still never reach it — `18 §9` allows no generic
    // `invoke`, so a member absent here is a member that does not exist for the counter.
    expect(PRELOAD).toMatch(/quickTags:\s*\(\)\s*=>\s*ipcRenderer\.invoke\(CHANNELS\.quickTags\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — the resolver itself, executed rather than read.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 02 §7 — the layer-2 list, parsed", () => {
  it("splits the configured key and preserves the ORDER an owner wrote", () => {
    // `00 §5.6` — staff navigate by memorized position, so a resolver that sorted would re-rank
    // every tile the day a tag was renamed.
    expect(resolveQuickTags("less spicy,no onions, extra gravy ")).toEqual({
      tags: ["less spicy", "no onions", "extra gravy"],
      source: "configured",
    });
  });

  it("an unset or empty key answers the EMPTY list, and says so", () => {
    // `01-F17` — this is a rendered absence, never a refusal: the till still sells.
    expect(resolveQuickTags(undefined).source).toBe("unset");
    expect(resolveQuickTags("  , ,").tags).toEqual([]);
    expect(describeQuickTags(resolveQuickTags(undefined))).toContain(QUICK_TAGS_ENV);
  });

  it("00 §5.6 — a non-Latin tag is ACCEPTED here; the refusal is the PRINTER's", () => {
    // `02-F50`: the refusal MOVES rather than disappears. An owner may configure an Urdu tag and
    // `03-F8`'s `raster_font_unavailable` will still refuse the document — in the back office,
    // before service, against one list, rather than at the counter with a cook waiting. A
    // script filter here would be `00 §5.6` inverted and would hide the state of the world.
    expect(resolveQuickTags("کم مرچ").tags).toEqual(["کم مرچ"]);
  });
});
