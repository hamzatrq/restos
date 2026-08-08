/**
 * **THE SEAM: `14-F29`'s grid is drawn on the axes the SERVER states, and on nothing else.**
 *
 * `01-F60` prices per `(branch, channel)` with no fallback, so the enabled set decides which cells
 * an owner must fill and which saves `services/api` refuses. Until August 2026 this app held its
 * own copy in `NEXT_PUBLIC_ENABLED_BRANCHES`/`NEXT_PUBLIC_ENABLED_CHANNELS`, so the axes the grid
 * drew and the axes the writer checked were two declarations that could disagree — and when they
 * do, nothing reports it: the owner prices a menu, this screen says "Published version 1", the
 * gateway returns 200, and every tile on the till reads `no price set`.
 *
 * **`price-grid.test.ts` and `editor.dom.test.tsx` are both blind to this**, and that is the point.
 * They pass `enabled` in as a prop, so they assert what the grid does with axes it is GIVEN and can
 * say nothing about where the shipped screen gets them. That is this wave's recurring defect — a
 * correct module the application reaches by a path nothing asserts — so the assertions here are
 * about PROVENANCE:
 *
 *   1. the screen asks `catalog.enabled` before it draws an editor;
 *   2. the cells it draws are the server's answer, and they CHANGE when the answer changes, with
 *      no environment difference between the two runs;
 *   3. when the answer does not arrive there is **no fallback** — no grid is drawn at all;
 *   4. an EMPTY answer is a refusal, not a permission (`apps/backoffice`'s M13, over the wire);
 *   5. no shipped file reads a client-side enabled set any more, and the scanner that says so is
 *      fired at a known violation first, because a guard nothing has ever made fail is not
 *      evidence (`two-plane.test.ts` draws the same distinction).
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CatalogScreen } from "../components/catalog-screen";
import { strings } from "../lib/strings";
import { type CallLog, Harness } from "./harness";

afterEach(cleanup);

type Answer = { branches: readonly string[]; channels: readonly string[] };

const TWO_BY_TWO: Answer = {
  branches: ["gulberg", "dha"],
  channels: ["counter", "foodpanda"],
};

/** One axis different in each direction — a set no run of this suite could have guessed. */
const OTHER: Answer = {
  branches: ["johar"],
  channels: ["storefront", "whatsapp", "phone"],
};

const BIRYANI = {
  kind: "item",
  id: "biryani",
  name: "Chicken Biryani",
  prices: [{ branch_id: "gulberg", channel: "counter", price_paisa: 45_000 }],
};

const published = { version: 3, entries: [BIRYANI] };

const receipt = {
  edit_id: "e1",
  apply_when: "day_end",
  lands_at: 1_800_000_000_000,
  version: null,
};

/**
 * Mounts the SHIPPED screen. `enabled` is a handler rather than a value so a test can make the
 * server fail, answer empty, or answer differently — the three cases a build-time constant makes
 * unreachable.
 */
const mount = (enabled: () => unknown): CallLog => {
  const log: CallLog = [];
  render(
    <Harness
      log={log}
      handlers={{
        "catalog.enabled": enabled,
        "catalog.published": () => published,
        "catalog.pending": () => [],
        "catalog.history": () => [],
        "catalog.save": () => receipt,
      }}
    >
      <CatalogScreen />
    </Harness>,
  );
  return log;
};

/** Open the published entry, which is what puts `14-F29`'s grid on the screen. */
const openTheItem = async (): Promise<void> => {
  const row = await screen.findByRole("button", { name: /Chicken Biryani/ });
  fireEvent.click(row);
  await screen.findByRole("button", { name: "Save" });
};

/** Every price cell currently on screen, by its accessible name (`<branch> <channel>`). */
const cellNames = (answer: Answer): string[] =>
  answer.branches.flatMap((branch) => answer.channels.map((channel) => `${branch} ${channel}`));

/**
 * Long enough for a mutation to reach the link, so a "nothing was sent" assertion means the screen
 * refused rather than that the test looked too early. The CONTROL beside every use of it proves
 * that, rather than leaving it asserted.
 */
const flush = (): Promise<void> => new Promise((done) => setTimeout(done, 50));

describe("the screen asks the server what to draw", () => {
  it("calls catalog.enabled", async () => {
    const log = mount(() => TWO_BY_TWO);
    await waitFor(() => expect(log.some((call) => call.path === "catalog.enabled")).toBe(true));
  });

  it("draws a cell for every pair in the server's answer, and no others", async () => {
    mount(() => TWO_BY_TWO);
    await openTheItem();

    for (const name of cellNames(TWO_BY_TWO)) expect(screen.getByLabelText(name)).toBeDefined();
    // The negative half: a pair the server did NOT name has no cell. Without it, a screen drawing
    // the union of its own guess and the server's answer would pass.
    expect(screen.queryByLabelText("johar storefront")).toBeNull();
    expect(screen.queryAllByRole("columnheader")).toHaveLength(TWO_BY_TWO.channels.length + 1);
  });

  it("draws DIFFERENT cells when the server answers differently — the environment never changes", async () => {
    // THE assertion this file exists for. Both mounts run in one process with one environment; the
    // only difference between them is what the server said. A grid reading a build-time constant
    // renders the same cells twice and fails here.
    mount(() => TWO_BY_TWO);
    await openTheItem();
    expect(screen.getByLabelText("gulberg counter")).toBeDefined();
    cleanup();

    mount(() => OTHER);
    await openTheItem();
    for (const name of cellNames(OTHER)) expect(screen.getByLabelText(name)).toBeDefined();
    expect(screen.queryByLabelText("gulberg counter")).toBeNull();
    expect(screen.queryByLabelText("dha foodpanda")).toBeNull();
  });

  it("quotes the server's pair as the list's money column, not a locally configured one", async () => {
    // `catalog-screen.tsx`'s `referencePair` is the SECOND consumer of the set. A screen that
    // moved the grid to the server and left this heading on a local constant would tell an owner
    // she is comparing a column that is not there.
    mount(() => OTHER);
    await screen.findByText(`${strings.catalog.pricesShown} johar · storefront`);
  });
});

describe("01-F60 — there is NO fallback when the server does not answer", () => {
  it("draws no grid at all when catalog.enabled fails", async () => {
    mount(() => {
      throw new Error("gateway down");
    });

    // The `Problem` surface, not a grid on a guess. A fallback to a constant — or to the env vars
    // this app used to read — would render cells here, and that is exactly how the drift returns.
    await screen.findByText(strings.unreachable.heading);
    expect(screen.queryAllByRole("columnheader")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.queryByRole("button", { name: strings.catalog.newEntry })).toBeNull();
  });

  it("sends no save while the axes are unknown", async () => {
    const log = mount(() => {
      throw new Error("gateway down");
    });
    await screen.findByText(strings.unreachable.heading);
    expect(log.filter((call) => call.path === "catalog.save")).toHaveLength(0);
  });

  it("CONTROL — the published query failing does NOT change the verdict about the axes", async () => {
    // One branch different from the test above: the OTHER query is the one that fails. Both reach
    // the same surface, which is what makes the two kills above attributable to the enabled query
    // rather than to `Problem` firing on anything at all.
    const log: CallLog = [];
    render(
      <Harness
        log={log}
        handlers={{
          "catalog.enabled": () => TWO_BY_TWO,
          "catalog.published": () => {
            throw new Error("gateway down");
          },
          "catalog.pending": () => [],
          "catalog.history": () => [],
        }}
      >
        <CatalogScreen />
      </Harness>,
    );
    await screen.findByText(strings.unreachable.heading);
    expect(screen.queryAllByRole("columnheader")).toHaveLength(0);
  });
});

describe("01-F60 — an EMPTY answer is a refusal, not a permission", () => {
  it("refuses to draw a grid and says where the set is configured", async () => {
    // M13's misreading, one layer out: an empty cross product makes every entry vacuously
    // complete, so `[]` arriving over the wire must not read as "nothing to check".
    mount(() => ({ branches: [], channels: [] }));
    await openTheItem();

    expect(screen.getByText(strings.grid.notEnabled)).toBeDefined();
    expect(screen.queryAllByRole("columnheader")).toHaveLength(0);
  });

  it("sends no save from a grid it refused to draw", async () => {
    const log = mount(() => ({ branches: [], channels: [] }));
    await openTheItem();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    // The refusal is the editor's own (`resolveGrid`), reached because the server said empty —
    // and `PriceGrid` early-returns `notEnabled`, so the per-cell fault list is not the evidence
    // here. The evidence is that nothing went out, measured after the same flush the CONTROL
    // below proves is long enough for a save to arrive.
    await flush();
    expect(log.filter((call) => call.path === "catalog.save")).toHaveLength(0);
    expect(screen.getByText(strings.grid.notEnabled)).toBeDefined();
  });

  it("CONTROL — the same click through the same flush DOES send a save on a drawable grid", async () => {
    // Without this the zero above proves only that the flush is too short. One branch different:
    // the server's answer is non-empty, so the grid draws and every cell can be filled.
    const log = mount(() => TWO_BY_TWO);
    await openTheItem();
    fireEvent.change(screen.getByLabelText("Price for every cell"), { target: { value: "450" } });
    fireEvent.click(screen.getByRole("button", { name: "Fill across" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await flush();
    expect(log.filter((call) => call.path === "catalog.save")).toHaveLength(1);
  });

  it("names the enabled set's real home — not a variable this app no longer reads", async () => {
    // The vacuity guard for the sentence itself. `strings.grid.notEnabled` told owners to set
    // `NEXT_PUBLIC_ENABLED_*` for months; a string that names a deleted variable is a screen
    // stating a gap it does not have, which this codebase treats as badly as hiding one.
    expect(strings.grid.notEnabled).toContain("ENABLED_BRANCHES");
    expect(strings.grid.notEnabled).not.toContain("NEXT_PUBLIC");
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────
// The structural half. Behaviour above proves the screen USES the server's answer; this proves
// there is no second source left for it to fall back to.
// ────────────────────────────────────────────────────────────────────────────────────────────

/**
 * `import.meta.dirname`, not `new URL("..", import.meta.url).pathname` — under the `dom` project
 * the module URL is not an absolute file URL and that idiom resolves to `/src`, so the walk below
 * reads someone else's filesystem or nothing at all. `startable.test.ts` uses the same form.
 */
const SRC = resolve(import.meta.dirname, "..");

const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(name)) out.push(path);
  }
  return out;
};

const shipped = (): { file: string; source: string }[] =>
  walk(SRC)
    .filter((path) => !path.includes("__acceptance__"))
    .map((path) => ({ file: relative(SRC, path), source: readFileSync(path, "utf8") }));

/**
 * A client-side declaration of the enabled set, by name. Takes SOURCE TEXT rather than a directory
 * for `plane-scan.ts`'s stated reason: a scanner that can only ever walk `src/` reports clean and
 * has never been shown to report anything else.
 */
const enabledEnvReadsIn = (files: readonly { file: string; source: string }[]): readonly string[] =>
  files
    .filter(({ source }) =>
      /process\s*\.\s*env\s*\.\s*[A-Z_]*ENABLED_(BRANCHES|CHANNELS)/.test(source),
    )
    .map(({ file }) => file);

describe("the second source is gone, not merely unused", () => {
  it("the scanner fires on the violation it exists to catch", () => {
    // Fired first, on the same code path that clears the real tree. Both spellings: the vars this
    // app used to read, and the server's own names, because copying THOSE into the client is the
    // same defect with a shorter identifier.
    expect(
      enabledEnvReadsIn([
        { file: "fixture.ts", source: "const b = process.env.NEXT_PUBLIC_ENABLED_BRANCHES;" },
      ]),
    ).toEqual(["fixture.ts"]);
    expect(
      enabledEnvReadsIn([
        { file: "fixture.ts", source: "const c = process.env.ENABLED_CHANNELS;" },
      ]),
    ).toEqual(["fixture.ts"]);
    expect(
      enabledEnvReadsIn([{ file: "fixture.ts", source: "const x = process.env.RESTOS_API_URL;" }]),
    ).toEqual([]);
  });

  it("has source files to scan at all", () => {
    // `24-F14` empty-match protection: rename `src/` and this must FAIL, not pass vacuously.
    expect(shipped().length).toBeGreaterThan(10);
  });

  it("no shipped file declares the enabled set client-side", () => {
    expect(enabledEnvReadsIn(shipped())).toEqual([]);
  });

  it("declares no dependency on the env reader it deleted", () => {
    // `lib/env.ts` was this app's only `process.env` reader and its only use of `@restos/config`.
    // A manifest entry that is unused today is one import away from being used tomorrow.
    const manifest = JSON.parse(readFileSync(join(SRC, "..", "package.json"), "utf8")) as Record<
      string,
      Record<string, string>
    >;
    const declared = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
    expect(declared).not.toContain("@restos/config");
    expect(shipped().map(({ file }) => file)).not.toContain("lib/env.ts");
  });
});
