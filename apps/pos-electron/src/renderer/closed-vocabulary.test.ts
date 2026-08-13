// ACCEPTANCE TEST — Commandment 6 / `21-F2` / `21-F3`, applied to this app's renderer.
//
// PROVENANCE (24 §3 step 2): written from spec text, alongside the S-0c unlock-surface oracle
// in `unlock-gate.dom.test.tsx`, by a session that has seen no implementation.
//
// `21-F2`: "Raw primitives are banned in app code ... allowed only inside `packages/ui`."
// `21-F5`: "An app-local one-off component is a lint error."
// `21-F3`: Tailwind arbitrary values are banned in app code.
//
// WHY THIS FILE EXISTS NOW: the `C1` unlock surface is a PIN pad, and a PIN pad is the single
// most tempting thing in this product to hand-roll — ten keys and a submit is twenty minutes of
// `<button>`s, against a `packages/ui` change that needs a design-owner review (`21-F5`). The
// vocabulary guard that exists today (`packages/ui/src/components/discipline-ast.oracle.test.ts`)
// scans `packages/ui` and NOTHING under `apps/`, so app code is unguarded exactly where the FR
// aims.
//
// SCOPE, stated so the exemption is visible rather than convenient: this guard bans the
// INTERACTIVE primitives — the ones that carry behaviour, focus and a touch target, which is
// what `27-F8`'s sizing and `21-F1`'s semantic components exist to own. It does NOT ban `<div>`
// or `<p>`, which `Counter.tsx` already uses as layout and as its loading line. A strict reading
// of `21-F2` bans those too and no guard anywhere covers them; that is a real finding about
// existing code, reported by this session rather than smuggled in here as a red test the S-0c
// implementer would have to fix.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

const RENDERER = new URL(".", import.meta.url).pathname;

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    if (extname(full) !== ".tsx") return [];
    if (/\.test\.tsx$/.test(full)) return [];
    return [full];
  });

/**
 * `21-F2`'s ban list, restricted to interactive primitives (see the scope note above).
 * Case-sensitive on purpose: `<AppShell` and `<Alarm...` are components, `<a ` is an anchor.
 */
const RAW_INTERACTIVE = /<(button|input|form|select|textarea|label|a|img|iframe)(?=[\s/>])/g;

const rawPrimitivesIn = (src: string): string[] =>
  [...src.matchAll(RAW_INTERACTIVE)].map((m) => m[1] as string);

/** `21-F3` — an arbitrary value inside a class string, e.g. `p-[13px]`, `text-[#ff0000]`. */
const ARBITRARY_CLASS = /class(?:Name)?\s*=\s*(?:"[^"]*\[[^"]*\][^"]*"|'[^']*\[[^']*\][^']*')/g;

const arbitraryValuesIn = (src: string): string[] =>
  [...src.matchAll(ARBITRARY_CLASS)].map((m) => m[0]);

const FILES = walk(RENDERER).sort();
const sources = FILES.map((f) => [f.slice(RENDERER.length), readFileSync(f, "utf8")] as const);

describe("Commandment 6 — the renderer composes packages/ui, never raw primitives", () => {
  it("is actually looking at the surfaces it guards", () => {
    // ROUND-2 PATTERN 2, "the guard passed by not looking": a scanner over an empty or
    // mis-rooted file list reports clean forever. Both named files are pinned — `Counter.tsx`
    // because it exists, `App.tsx` because it is `C1`'s home (`unlock-gate.dom.test.tsx`) and a
    // PIN pad is the violation this guard was written for.
    const names = sources.map(([name]) => name);
    expect(names).toContain("Counter.tsx");
    expect(names).toContain("App.tsx");
  });

  it("no raw interactive HTML element appears in any renderer file", () => {
    const found = sources.flatMap(([name, src]) =>
      rawPrimitivesIn(src).map((tag) => `${name}: <${tag}>`),
    );
    expect(found, "raw primitives in app code (21-F2)").toEqual([]);
  });

  it("no Tailwind arbitrary value appears in any renderer file", () => {
    const found = sources.flatMap(([name, src]) =>
      arbitraryValuesIn(src).map((hit) => `${name}: ${hit}`),
    );
    expect(found, "arbitrary values in app code (21-F3)").toEqual([]);
  });
});

describe("the guard is shown the violations it must catch", () => {
  // The evasion corpus is the deliverable, per `discipline-ast.oracle.test.ts`'s own lesson:
  // "a guard is only as good as the violations it has been shown to catch, and the previous
  // suite had never been shown any." These snippets are the shapes a hand-rolled PIN pad and a
  // hand-rolled unlock screen actually take.
  const HAND_ROLLED_PIN_PAD = [
    `const Key = ({ d }: { d: string }) => <button type="button">{d}</button>;`,
    `<input type="password" inputMode="numeric" value={pin} />`,
    `<form onSubmit={submit}><input value={pin} /></form>`,
    `<label htmlFor="pin">PIN</label>`,
    `<a href="#" onClick={unlock}>Unlock</a>`,
    `<select value={user} onChange={pick} />`,
    `<textarea value={note} />`,
    `<img src="logo.png" alt="" />`,
  ];

  it.each(HAND_ROLLED_PIN_PAD)("catches %s", (snippet) => {
    expect(rawPrimitivesIn(snippet).length).toBeGreaterThan(0);
  });

  it("does not fire on the components that ARE the vocabulary", () => {
    // The other half of a guard's honesty: it must not make the legal composition impossible.
    // A guard that flagged `<AppShell>` or `<Tile>` would be "fixed" by deleting it.
    const legal = `<AppShell tabs={TABS}><Tile label="1" onPress={press} /><ItemGrid items={i} /><TenderPanel dueP={d} /><Cart lines={l} /></AppShell>`;
    expect(rawPrimitivesIn(legal)).toEqual([]);
  });

  it.each([
    `<Surface className="p-[13px]" />`,
    `<Surface className="text-[#ff0000] flex" />`,
    `<Surface className='w-[42rem]' />`,
  ])("catches the arbitrary value in %s", (snippet) => {
    expect(arbitraryValuesIn(snippet).length).toBeGreaterThan(0);
  });

  it("does not fire on an ordinary class string", () => {
    expect(arbitraryValuesIn(`<Surface className="flex gap-2" />`)).toEqual([]);
  });
});
