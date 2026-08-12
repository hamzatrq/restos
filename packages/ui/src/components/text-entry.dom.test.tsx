// ACCEPTANCE TESTS — **authored from spec text only** (`24 §3` step 2).
//
// PROVENANCE: written by an acceptance-test session that read `27-F6`, `27-F5`, `27-F8`,
// `27-F12`/`27-F14`/`27-F16`, `27-F29`, `21 §2`/`21-F2`/`21-F5`, `21 §5`, `00 §5.6` and
// `02-F27`, and no implementation of the component under test — because there is none. This
// file is expected to be RED on the commit that introduces it.
//
// ── WHY A NEW COMPONENT AT ALL, AND WHY THIS PACKAGE ────────────────────────────────────────
//
// `02-F27` names TWO events for one operator act — *"unknown number → inline customer creation
// (`customer.created`, `customer.address_added`)"* — and only the first has a production
// producer. `apps/pos-electron/src/shared/ipc.ts` states the blocker on the request schema
// itself: *"`address_text` is optional … **Nothing in this app supplies it today** and that is a
// named gap, not an oversight: `06-F9` calls the address free text, `packages/ui` ships no
// text-entry component, and commandment 6 forbids a raw `<input>` in app code."*
//
// So the missing thing is here, not there. `21-F2` allows raw primitives *"only inside
// `packages/ui`"*, and `apps/pos-electron/src/renderer/closed-vocabulary.test.ts` enforces it on
// the app — correctly, and it is what makes the shortcut impossible rather than merely rude.
//
// ── THE CAPTURE IS AN ESCAPE HATCH AND `27-F6` IS WHAT MAKES IT LEGAL ───────────────────────
//
// *"No operational role is ever required to type non-numeric text to complete a CRITICAL-PATH
// task … Typing may exist as an **optional escape hatch** — 21 §5 names search as exactly that,
// and 02-F2 search, 02-F6 notes and **02-F27 customer name** are all legitimate under this
// reading. The test is whether a non-typing operator can complete the task by another route,
// not whether a keyboard appears anywhere."* `27-F6` names `02-F27`'s customer name as blessed,
// by that FR id, in that clause. The *optionality* is a property of the SURFACE, not of this
// component, and it is asserted where it lives —
// `apps/pos-electron/src/renderer/caller-details.dom.test.tsx` §B.
//
// ── WHAT THIS FILE DELIBERATELY DOES NOT DECIDE ─────────────────────────────────────────────
//
// Not how a glyph gets into the field. A Windows till may have a physical keyboard, an OS
// on-screen keyboard, or neither, and no FR in the corpus decides which — `21 §5` blesses typed
// search without saying what types. Every assertion below is about the CONTRACT (a labelled,
// posture-sized, controlled text control that carries Unicode faithfully) and none is about the
// key mechanism.
//
// It DOES pin two things it cannot avoid pinning, and says so rather than hiding it: the
// exported NAME (`TextEntry`) and the four props. A test for a component has to name it. The
// lookup below is a namespace read rather than a static import for one reason — a static
// `import { TextEntry }` of a member that does not exist is a TYPECHECK error, and a red `tsc`
// is a worse first signal than a red assertion that says in words what is missing.
//
// ── THE PLAUSIBLE WRONG IMPLEMENTATION FOR EACH SECTION, NAMED UP FRONT ─────────────────────
//
//   §A  a field that renders but reports nothing (decorative), or one that is uncontrolled so
//       the surface can never read what was typed.
//   §B  a field that filters its own input to Latin — the exact shape `packages/escpos` already
//       ships as `isPrintableLatin`, and the one an implementer reaches for when `03-F8` says
//       the printer cannot do Urdu. `00 §5.6` is explicit that the PRINTER's limit is not the
//       FIELD's: *"user content is never transliterated or rejected for its script."*
//   §C  a field that takes the posture prop and ignores it, sizing itself from a literal. This
//       is `K-4`'s recorded defect verbatim (*"varied `spec` and `profile` across ~90 renders
//       and never varied `data`"*), so the posture is VARIED here and the two answers compared.
//   §D  a field labelled only by `aria-label`, or by a placeholder that vanishes on focus —
//       `27-F5` bans invisible affordances and this population reads position, not prose.
//   §E  `<input type="password">` for a name (masking what `27-F29` requires her to read back)
//       or `type="number"` for anything (which strips the user content `00 §5.6` protects, and
//       duplicates `NumericKeypad`'s job besides).

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { type ReactElement, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as ui from "../index";
import { ThemeProvider } from "../theme";
import { type Posture, palette, targetFor } from "../tokens/index";

afterEach(cleanup);

/**
 * The contract this file asserts. Four props and no more — every one of them is a decision some
 * FR has already taken, and a fifth would be a knob `21-F5` makes a design-owner question:
 *
 *  - `posture` and never a size (`27-F8`, and `Tile`'s own comment: *"a component that accepts
 *    an arbitrary size is not a closed vocabulary"*).
 *  - `caption` and never an optional label (`27-F5`: every target is *labelled*; `Readout` is
 *    this package's caption idiom and `27-F43` records what leaving a pairing in prose costs).
 *  - `value` + `onChange`: CONTROLLED, because the surface is what decides whether a blank field
 *    is `null` or `""` (`registry.ts` refuses `""`) and it cannot decide that about a value it
 *    cannot see.
 *
 * Deliberately absent, and each absence is an assertion this file does not have to make:
 * no `type` (see §E), no `placeholder` (§D), no `maxLength`, no colour, no `disabled`.
 */
type TextEntryProps = {
  posture: Posture;
  caption: string;
  value: string;
  onChange: (next: string) => void;
};

const TextEntry = (ui as Record<string, unknown>).TextEntry as
  | ((props: TextEntryProps) => ReactElement)
  | undefined;

/**
 * The one place the absence is reported, in words, once per test rather than as an import crash.
 *
 * `02-F27` is the FR that goes unclosed while this is undefined, and `01-F1` is why it matters
 * more than a missing screen usually would: a delivery order taken from a new caller has
 * nowhere to send the food (`09-F10` reads the address text off the assigned order), and the
 * identity that was filed without one is permanent.
 */
const entry = (props: TextEntryProps) => {
  if (TextEntry === undefined) {
    throw new Error(
      "@restos/ui exports no `TextEntry`. 02-F27's inline customer creation names " +
        "`customer.address_added` and nothing in the product can capture an address: 21-F2 bans " +
        "a raw <input> in app code and this package ships no text-entry component. " +
        "See specs/27-design-language.md 27-F6 for why the capture is legal as an escape hatch.",
    );
  }
  return <TextEntry {...props} />;
};

const NAME_FIELD = {
  posture: "counter" as const,
  caption: "CALLER NAME",
  value: "",
  onChange: () => {},
};

/** The textbox itself — the thing a finger lands on, which is what `27-F8` sizes. */
const box = (): HTMLElement => screen.getByRole("textbox");

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — IT IS A REAL, CONTROLLED TEXT CONTROL
//
// The whole point of the component is that a surface can read what was typed. A field that
// renders and reports nothing satisfies every structural guard in this package and closes no FR.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 02-F27 — the field carries a value in, and carries a value back out", () => {
  it("renders the value it was given", () => {
    render(entry({ ...NAME_FIELD, value: "Hina Raza" }));
    // `toHaveValue` is not available here (no jest-dom), so the DOM property is read directly.
    expect((box() as HTMLInputElement).value).toBe("Hina Raza");
  });

  it("reports the NEW text, not the event and not the old value", () => {
    const onChange = vi.fn();
    render(entry({ ...NAME_FIELD, value: "", onChange }));
    fireEvent.change(box(), { target: { value: "Hina" } });
    // A string, so the caller can decide `null` vs `""` (`registry.ts` refuses `""` because
    // `null` already says "no name stated"). Handing back an event would push that decision
    // into every call site and `27-F43` records what a pairing left in prose costs.
    expect(onChange).toHaveBeenCalledWith("Hina");
  });

  it("does not hold its own copy of the text (it is CONTROLLED)", () => {
    // The failure this owns: a field that keeps its own state renders whatever was typed while
    // the surface reads `""` — so `Save caller` files a customer with no name, under a screen
    // showing one. `01-F1` makes that row permanent.
    const onChange = vi.fn();
    const { rerender } = render(entry({ ...NAME_FIELD, value: "", onChange }));
    fireEvent.change(box(), { target: { value: "typed but not accepted" } });
    rerender(entry({ ...NAME_FIELD, value: "", onChange }));
    expect((box() as HTMLInputElement).value).toBe("");
  });

  it("reports what she typed KEYSTROKE BY KEYSTROKE, editing none of it", () => {
    /**
     * ⚠ **ADDED BY THE MUTATION PASS — every other assertion in this file sets the whole value in
     * ONE `fireEvent.change`, and a mutant that survives that is not hypothetical.** Measured
     * 2026-08-12: `onChange(e.target.value.trim())` — "tidy it up at the field", the shape an
     * implementer reaches for when `stated()` is trimming one line away — passed **318/318 here
     * and 846/846 in `apps/pos-electron`**. It is not cosmetic: the field is CONTROLLED, so the
     * trimmed string is what comes back as `value`, the space is erased before the next key
     * arrives, and a two-word name becomes untypable. The probe prints `'HinaRaza'`.
     *
     * `00 §5.6` is the FR — user content is never rewritten — and `27-F6` is what makes it bite,
     * because this field IS the escape hatch and an escape hatch that cannot spell a name is not
     * one. So the value is built one character at a time, from what the control currently holds,
     * which is what a browser actually delivers.
     */
    const Harness = () => {
      const [held, setHeld] = useState("");
      return entry({ ...NAME_FIELD, value: held, onChange: setHeld });
    };
    render(<Harness />);
    for (const ch of "Hina Raza") {
      const el = box() as HTMLInputElement;
      fireEvent.change(el, { target: { value: el.value + ch } });
    }
    expect((box() as HTMLInputElement).value).toBe("Hina Raza");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — `00 §5.6`: THE FIELD HOLDS USER CONTENT, AND USER CONTENT IS UNICODE
//
// *"Interface language ≠ user content: customer-entered data (names, addresses, notes, messages,
// transcripts) is uncontrolled Unicode and may contain Urdu script — every surface renders it
// faithfully … User content is never transliterated or rejected for its script."*
//
// This is the section most likely to be got wrong in good faith, because `03-F8` says in terms
// that no ESC/POS code page can print Urdu and that the encoder REFUSES a non-Latin user field.
// That is a fact about the PRINTER. A field that pre-emptively refused the same text would make
// the customer unrecordable rather than the ticket unprintable — and `02-F27`'s caller is on the
// phone spelling her address in the language she speaks.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 00 §5.6 — Urdu goes in and Urdu comes out, untransliterated", () => {
  /** `06-F9`'s *"free-text address"*, in the script a Lahore caller actually says it in. */
  const URDU_ADDRESS = "مکان نمبر ۱۲، گلبرگ، لاہور";
  const URDU_NAME = "حنا رضا";

  it("renders an Urdu address exactly as given", () => {
    render(entry({ ...NAME_FIELD, caption: "ADDRESS", value: URDU_ADDRESS }));
    expect((box() as HTMLInputElement).value).toBe(URDU_ADDRESS);
  });

  it("reports Urdu back unchanged — nothing stripped, nothing romanized", () => {
    const onChange = vi.fn();
    render(entry({ ...NAME_FIELD, onChange }));
    fireEvent.change(box(), { target: { value: URDU_NAME } });
    // Not `toContain`, not a length check: BYTE-FOR-BYTE. A filter that dropped the diacritics
    // and kept the letters would satisfy a looser assertion and still change a person's name.
    expect(onChange).toHaveBeenCalledWith(URDU_NAME);
    expect(onChange.mock.calls[0]?.[0]).toHaveLength(URDU_NAME.length);
  });

  it("does not refuse a mixed-script address (the common real case)", () => {
    // A Pakistani address is routinely half Latin, half Urdu, with Western digits (`27-F22`).
    const mixed = "House 12, گلبرگ III, Lahore 54000";
    const onChange = vi.fn();
    render(entry({ ...NAME_FIELD, onChange }));
    fireEvent.change(box(), { target: { value: mixed } });
    expect(onChange).toHaveBeenCalledWith(mixed);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — `27-F8`: THE TOUCH TARGET COMES FROM THE POSTURE TABLE
//
// The posture is VARIED and the two answers compared, which is the whole discipline: a component
// that accepted `posture` and sized itself from a literal passes any single-posture render.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 27-F8 — the field is sized by its posture, never by a number someone typed", () => {
  const minHeightOf = (posture: Posture): string => {
    cleanup();
    render(entry({ ...NAME_FIELD, posture }));
    return box().style.minHeight;
  };

  it("takes the counter posture's target", () => {
    expect(minHeightOf("counter")).toBe(`${targetFor("counter")}px`);
  });

  it("takes a DIFFERENT target for a different posture", () => {
    // The attribution half. Without this, a field hardcoding 76 px passes the assertion above
    // and is not reading its prop at all — `K-4`'s survivor, one component over.
    expect(minHeightOf("kitchen")).toBe(`${targetFor("kitchen")}px`);
    expect(targetFor("kitchen")).not.toBe(targetFor("counter"));
  });

  it("never sits below `27-F8`'s absolute floor", () => {
    // `TOKENS.md`'s floor, restated as a property rather than a value so it survives a retune:
    // whatever the posture resolves to, it is at least the floor the FR calls absolute.
    for (const posture of ["counter", "keypad", "kitchen", "handheld"] as const) {
      expect(Number.parseInt(minHeightOf(posture), 10)).toBeGreaterThanOrEqual(targetFor("floor"));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — `27-F5`: A PERSISTENT, VISIBLE, LABELLED TARGET
//
// *"No context-dependent or invisible controls … Every action has a persistent, visible,
// labelled target."* A placeholder is the canonical way to break this: it is the label, it is
// inside the control, and it disappears at the exact moment the operator needs it.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 27-F5/27-F43 — the caption names the field and stays on the glass", () => {
  it("gives the control its accessible name from the caption", () => {
    render(entry({ ...NAME_FIELD, caption: "CALLER NAME" }));
    expect(screen.getByRole("textbox", { name: /CALLER NAME/i })).toBeTruthy();
  });

  it("renders the caption as TEXT, not only as an aria attribute", () => {
    // `21 §5`'s cashier law is that *"visual position is the real interface"* and `00 §5.6` puts
    // the low-literacy load on the visual channel. An `aria-label` is read by a screen reader
    // this product does not ship to and by nothing a cashier can see.
    const { container } = render(entry({ ...NAME_FIELD, caption: "CALLER NAME" }));
    expect(container.textContent).toContain("CALLER NAME");
  });

  it("keeps the caption on screen once there is a value in the field", () => {
    // The placeholder failure, stated as the property it violates rather than as a ban on an
    // attribute: a caption that is present when empty and gone when filled is a placeholder
    // whatever it is implemented as.
    const { container } = render(entry({ ...NAME_FIELD, value: "Hina Raza" }));
    expect(container.textContent).toContain("CALLER NAME");
  });

  it("renders the caption it was GIVEN, not one of its own", () => {
    /**
     * ⚠ **ADDED BY THE MUTATION PASS, and it is `K-4`'s recorded defect in the one prop §C did
     * not vary.** §C varies `posture` and compares the two answers, precisely so a component that
     * accepts a prop and sizes itself from a literal cannot pass — and then every caption
     * assertion above renders the SAME caption, `"CALLER NAME"`, three times. Measured 2026-08-12:
     * hardcoding `<Readout caption="CALLER NAME">` while leaving `aria-label={caption}` alone
     * passed **318/318 here and 846/846 in `apps/pos-electron`**, because the accessible name
     * still varied — so `getByRole("textbox", { name: /address/i })` kept finding the right box
     * while the glass showed `CALLER NAME` over both fields.
     *
     * `21 §5` is why the visible half is the half that matters — *"visual position is the real
     * interface"*, and this population reads position, not prose — and `27-F5` requires the target
     * to be *labelled*, which two identically-labelled fields are not.
     */
    const { container } = render(entry({ ...NAME_FIELD, caption: "ADDRESS" }));
    expect(container.textContent).toContain("ADDRESS");
    expect(container.textContent).not.toContain("CALLER NAME");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — IT IS A PLAIN TEXT CONTROL, AND IT IS NOT A STATUS SURFACE
//
// Two anti-scope claims. Neither is decoration: each names a component this package already
// ships whose job would be silently duplicated or defeated.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§E the field is text, and it spends no 27-F14 colour", () => {
  it("is not a masked field", () => {
    // `27-F29` — *"Validate and block impossible numbers at entry"* — works only if the operator
    // can READ BACK what she entered, which is the reason `Counter.tsx` renders the dialled
    // digits in a `Readout` rather than as dots. A masked name field is that argument inverted,
    // and it would put a second credential-shaped surface beside `App.tsx`'s PIN pad (`27-F4`:
    // two surfaces that look alike teach one habit and serve two purposes).
    render(entry(NAME_FIELD));
    expect((box() as HTMLInputElement).type).not.toBe("password");
  });

  it("is not a numeric field", () => {
    // `NumericKeypad` and `27-F8`'s `keypad` posture own numeric entry, and a `type="number"`
    // control drops exactly the characters `00 §5.6` protects. `getByRole("textbox")` already
    // half-states this — a numeric input is `role="spinbutton"` — and this makes it explicit so
    // the reason survives.
    render(entry(NAME_FIELD));
    expect((box() as HTMLInputElement).type).not.toBe("number");
  });

  it("paints no status fill, in either polarity, empty or filled", () => {
    // `27-F14` allocates three status colours to a CLOSED list of claimants and says *"a module
    // needing a distinction not on this table expresses it with shape, position or a number …
    // Adding a colour requires an amendment here, not a local decision."* An empty optional
    // field is not on that list. `27-F16`'s argument is the sharper one: an empty field is the
    // resting state of this control, and colouring the base case spends the whole preattentive
    // channel on the thing that is always true.
    const fills = [
      palette.light["bgColor-status-abnormal"],
      palette.light["bgColor-status-fault"],
      palette.light["bgColor-status-confirmed"],
      palette.dark["bgColor-status-abnormal"],
      palette.dark["bgColor-status-fault"],
      palette.dark["bgColor-status-confirmed"],
    ];
    for (const value of ["", "Hina Raza"]) {
      for (const polarity of ["light", "dark"] as const) {
        cleanup();
        render(
          <ThemeProvider polarity={polarity}>{entry({ ...NAME_FIELD, value })}</ThemeProvider>,
        );
        const painted = box().style.background || box().style.backgroundColor;
        expect(fills, `a status fill on a text field (27-F14/27-F16)`).not.toContain(painted);
      }
    }
  });
});
