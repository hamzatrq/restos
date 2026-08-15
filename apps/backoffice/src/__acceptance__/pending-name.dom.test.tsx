/**
 * `14-F28` — the pending row names the dish, and it names it WITHOUT joining the two version axes.
 *
 * The row rendered `item / item-chicken-karahi` in a real browser: a kind and a raw identifier, in
 * the one list whose job is to let an owner recognise what lands at 05:00 and cancel it if she has
 * changed her mind. The obvious repair is the forbidden one — look the name up in
 * `catalog.published` — and `services/api/src/catalog.ts` names conflating the staged and published
 * axes as the defect that module is shaped against.
 *
 * **Every assertion here is pointed at the case where the join is NOT invisible**, because on an
 * item that already exists under the same name a join and the correct implementation are
 * indistinguishable, and a suite built only on that fixture proves nothing (the round-3 law's
 * "guard that was never pointed at the dangerous case", AGENTS.md).
 *
 * Two fixtures do that work, and one structural assertion makes it hold for implementations nobody
 * has thought of yet:
 *
 *   - a **rename**, where `catalog.published` still carries the old name — a join renders the menu
 *     as it IS in a list that exists to say how it WILL BE;
 *   - a **brand-new item**, absent from `catalog.published` entirely — a join has nothing to
 *     resolve and degrades to the identifier permanently, which is the defect restored;
 *   - and the tripwire: **this component never asks for `catalog.published` at all.** A handler for
 *     it is registered on purpose, so a joining implementation gets a SUCCESSFUL join and is killed
 *     by the name assertions rather than by a "no handler" error. `apps/backoffice/CLAUDE.md`
 *     records the round where a mutant's kill was unattributable because the test file failed to
 *     load — read the failure message, not the count.
 *
 * ⚠ **The IDENTITY's spelling changed on 16 August 2026 and two assertions here were re-pointed**
 * (`14-F32`/`14-F38`, adjudicated by the test-owning session). The demoted identity read
 * `item / <id>` — a raw `01-F21` kind string — and reads `Dish · Reference code <id>` now. Nothing
 * this file owns moved: the NAME still leads, the identity is still present and still below it, and
 * the two axes are still not joined. The retired literal is now asserted as an absence.
 */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PendingEdits } from "../components/pending-edits";
import { type CallLog, type Handlers, Harness } from "./harness";

afterEach(cleanup);

const mount = (handlers: Handlers): CallLog => {
  const log: CallLog = [];
  render(
    <Harness log={log} handlers={handlers}>
      <PendingEdits />
    </Harness>,
  );
  return log;
};

const LANDS_AT = 1_786_060_800_000;

const row = (entity_id: string, name: string) => ({
  edit_id: `edit-${entity_id}`,
  entity: "item",
  entity_id,
  name,
  actor_user_id: "u-ali",
  staged_at: 1_786_039_200_000,
  apply_when: "day_end" as const,
  lands_at: LANDS_AT,
});

/**
 * What a device has today. Registered as a handler in every test so that a joining implementation
 * SUCCEEDS at joining — the kill then comes from the rendered name, which is attributable, rather
 * than from the harness refusing an unhandled path, which is not.
 */
const publishedWithOldName = () => ({
  version: 7,
  entries: [
    {
      kind: "item",
      id: "item-chicken-karahi",
      name: "Chicken Karahi",
      prices: [{ branch_id: "branch-gulberg", channel: "counter", price_paisa: 45_000 }],
    },
  ],
});

describe("14-F28 — the pending row renders the draft's own name", () => {
  it("shows the name an owner recognises, not the identifier", async () => {
    mount({
      "catalog.pending": () => [row("item-chicken-karahi", "Chicken Karahi")],
      "catalog.published": publishedWithOldName,
    });
    await waitFor(() => expect(screen.getByText("Chicken Karahi")).toBeTruthy());
  });

  it("leads the row with the name and DEMOTES the identity below it", async () => {
    // The identity is kept — two entries can share a display name, and this row's control cancels
    // one of them — but it is no longer what the row is called. An implementation that appended the
    // name after the identifier would satisfy "the name is on screen" and still leave an owner
    // reading the identity first.
    //
    // ⚠ **RE-POINTED 16 August 2026 by the test-owning session (`24 §3` step 2, `24-F5`).** This
    // asserted the identity was spelled `item / item-chicken-karahi`, and `14-F32` overruled that
    // spelling after this file was written: *"the internal kind strings are vendor vocabulary under
    // `14-F38` and are not rendered; the task noun is this surface's name for a kind EVERYWHERE."*
    // The raw `01-F21` kind string is now banned from this row, so the literal is retired and the
    // identity is read in the vocabulary `14-F32`/`14-F33` require — the task noun plus the editor's
    // own `Reference code` label. **What this test OWNS is unchanged and still asserted here**: the
    // identity is PRESENT (the tie-breaker between two entries sharing a name) and it sits BELOW the
    // name. Only the spelling moved; nothing about hierarchy was weakened, and mutant P4 (name and
    // identity swapped, `apps/backoffice/CLAUDE.md`) still fails both of the last two assertions.
    mount({
      "catalog.pending": () => [row("item-chicken-karahi", "Chicken Karahi")],
      "catalog.published": publishedWithOldName,
    });
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
    const text = screen.getByRole("listitem").textContent ?? "";
    const identity = "Dish · Reference code item-chicken-karahi";
    expect(text.startsWith("Chicken Karahi")).toBe(true);
    expect(text).toContain(identity);
    expect(text.indexOf("Chicken Karahi")).toBeLessThan(text.indexOf(identity));
    // The retired form, asserted as an ABSENCE so the banned string cannot come back unnoticed —
    // the same negative-assertion move `shell.dom.test.tsx` makes against `14-F3`'s retired
    // apology. Without it, retiring the assertion above would leave `14-F38` defended by nothing.
    expect(text).not.toContain("item / item-chicken-karahi");
  });

  it("shows the NEW name for a rename, never the published one", async () => {
    // The fixture the join passes on every other item: `catalog.published` answers, successfully,
    // with the name this edit is replacing.
    mount({
      "catalog.pending": () => [row("item-chicken-karahi", "Chicken Karahi (Half)")],
      "catalog.published": publishedWithOldName,
    });
    await waitFor(() => expect(screen.getByText("Chicken Karahi (Half)")).toBeTruthy());
    // `getByText` matches a whole normalised text node, so this asserts the OLD name is not the
    // row's own label — it does not merely re-find the new one by substring.
    expect(screen.queryByText("Chicken Karahi")).toBeNull();
  });

  it("names an item that has never been published — the case a join cannot serve", async () => {
    mount({
      "catalog.pending": () => [row("item-seekh-kebab", "Seekh Kebab")],
      "catalog.published": publishedWithOldName,
    });
    await waitFor(() => expect(screen.getByText("Seekh Kebab")).toBeTruthy());
    // ⚠ **RE-POINTED 16 August 2026 (`14-F32`, test-owning session).** This read
    // `queryByText("item / item-seekh-kebab")`; the kind string is now vendor vocabulary and is not
    // rendered. The claim this line makes is unchanged — a never-published entry still carries its
    // demoted identifier, so the row degrades to neither a bare id nor a nameless row — and the
    // FIRST assertion, which is the one a joining implementation dies on, is untouched.
    expect(screen.queryByText("Dish · Reference code item-seekh-kebab")).toBeTruthy();
  });

  it("never asks for the published catalog at all — the two axes are not joined", async () => {
    // The structural half. The fixtures above catch the joins anyone would write today; this
    // catches the ones nobody has written yet, because a join of any shape has to fetch the other
    // axis first. `pending-edits.tsx`'s header claims this separation; without an assertion the
    // claim is a comment.
    const log = mount({
      "catalog.pending": () => [row("item-chicken-karahi", "Chicken Karahi (Half)")],
      "catalog.published": publishedWithOldName,
    });
    await waitFor(() => expect(screen.getByText("Chicken Karahi (Half)")).toBeTruthy());
    expect(log.filter((call) => call.path === "catalog.published")).toEqual([]);
    expect(log.filter((call) => call.path === "catalog.pending").length).toBeGreaterThan(0);
  });

  it("names each row from its own draft, never from the first row's", async () => {
    mount({
      "catalog.pending": () => [row("item-daal", "Daal Maash"), row("item-naan", "Garlic Naan")],
      "catalog.published": publishedWithOldName,
    });
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2));
    const rendered = screen.getAllByRole("listitem").map((node) => node.textContent ?? "");
    expect(rendered[0]?.startsWith("Daal Maash")).toBe(true);
    expect(rendered[1]?.startsWith("Garlic Naan")).toBe(true);
  });
});
