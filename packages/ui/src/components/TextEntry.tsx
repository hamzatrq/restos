import { useColor } from "../theme";
import { type Posture, space, targetFor, typography } from "../tokens/index";
import { Readout } from "./Readout";

/**
 * # The text entry — **the one way this product asks a human for a word**
 *
 * ## Why it exists, and why it did not until now
 *
 * `02-F27` names two events for one operator act — *"unknown number → inline customer creation
 * (`customer.created`, `customer.address_added`)"* — and the second of them **had no production
 * producer anywhere in the product**. The blocker was measured and written down twice, once on
 * the request schema (`apps/pos-electron/src/shared/ipc.ts`) and once on the surface
 * (`Counter.tsx`'s `recordCaller`): the trusted side carried both fields, the fold and the store
 * table were built, the permission action existed — and **`packages/ui` shipped no text-entry
 * component**, so nothing in the product could capture a name or an address. `21-F2` bans a raw
 * `<input>` in app code and `apps/pos-electron/src/renderer/closed-vocabulary.test.ts` enforces
 * it, correctly: that guard is what made the shortcut impossible rather than merely rude, so the
 * missing thing was here and not there.
 *
 * ## `27-F6` is what makes a keyboard legal on this product at all
 *
 * *"No operational role is ever required to type non-numeric text to complete a CRITICAL-PATH
 * task … Typing may exist as an **optional escape hatch** — 21 §5 names search as exactly that,
 * and 02-F2 search, 02-F6 notes and **02-F27 customer name** are all legitimate under this
 * reading. The test is whether a non-typing operator can complete the task by another route, not
 * whether a keyboard appears anywhere."*
 *
 * The FR blesses `02-F27`'s customer name **by that id, in that clause**. The *optionality* is a
 * property of the SURFACE rather than of this component — a screen that refused to save until
 * something was typed would break `27-F6` with this component behaving perfectly — so it is
 * asserted where it lives, at the call site
 * (`apps/pos-electron/src/renderer/caller-details.dom.test.tsx` §B).
 *
 * ## What it deliberately does not have
 *
 * Four props, and each absence is a decision some FR has already taken:
 *
 * - **No `type`.** `27-F29` blocks impossible entries *at entry*, and the only way an operator
 *   acts on that is to READ BACK what she entered — which is why `Counter.tsx` renders the
 *   dialled digits in a `Readout` rather than as dots. A masked field is that argument inverted,
 *   and it would put a second credential-shaped surface beside `App.tsx`'s PIN pad (`27-F4`: two
 *   surfaces that look alike teach one habit and serve two purposes). `type="number"` is refused
 *   for the other half: it strips exactly the characters `00 §5.6` protects, and `NumericKeypad`
 *   plus `27-F8`'s `keypad` posture already own numeric entry.
 * - **No `placeholder`.** `27-F5` — *"every action has a persistent, visible, labelled target"*.
 *   A placeholder is the canonical way to break that: it is the label, it is inside the control,
 *   and it disappears at the exact moment the operator needs it. The caption is a `Readout`, which
 *   is this package's caption-above-payload idiom and stays on the glass whatever the value is.
 * - **No size.** `27-F8` — `Tile`'s own header states the rule: *"a component that accepts an
 *   arbitrary size is not a closed vocabulary"*.
 * - **No colour and no state prop.** `27-F14`'s three status colours are a CLOSED allocation and
 *   a text field is on none of the three lists; `27-F16`'s argument is the sharper one — an empty
 *   optional field is this control's RESTING state, and colouring the base case spends the whole
 *   preattentive channel on the thing that is always true.
 *
 * ## It is CONTROLLED, and that is a correctness property rather than a React preference
 *
 * The surface is what decides whether a blank field is `null` or absent — `registry.ts` refuses
 * `""` because `null` already says *"no name stated"* (`06-F11`) — and it cannot decide that about
 * a value it cannot see. A field holding its own copy would render what she typed while the
 * surface read `""`, so `Save caller` would file a customer with no name under a screen showing
 * one, and `01-F1` makes that row permanent.
 *
 * ## `00 §5.6` — it holds USER CONTENT, and user content is Unicode
 *
 * *"Customer-entered data (names, addresses, notes, messages, transcripts) is uncontrolled
 * Unicode and may contain Urdu script — every surface renders it faithfully … User content is
 * never transliterated or rejected for its script."*
 *
 * So there is **no filter here of any kind**, and the temptation to add one is real and is written
 * down two docs away: `03-F8` proves no ESC/POS code page can print Urdu and has the encoder
 * REFUSE a non-Latin user field, and `packages/escpos` ships `isPrintableLatin` for an implementer
 * to reach for. That is a fact about PAPER. A field that pre-emptively refused the same text would
 * make the customer unrecordable rather than the ticket unprintable — and `02-F27`'s caller is on
 * the phone spelling her address in the language she speaks.
 */
export type TextEntryProps = {
  /** `27-F8` — the posture the surface is in. Never a number; see the header. */
  posture: Posture;
  /**
   * The word that names the field. Short, upper-case at the call site, English (`00 §5.6`).
   *
   * REQUIRED, on `Readout`'s own reasoning: `27-F43` records what leaving a pairing in prose
   * costs, and an unlabelled box is `27-F5`'s invisible affordance exactly.
   */
  caption: string;
  /** What the surface holds. The single source of the text — see "it is CONTROLLED" above. */
  value: string;
  /** The NEW text, as a string, so the caller decides `null` vs absent vs `""` itself. */
  onChange: (next: string) => void;
};

export const TextEntry = ({ posture, caption, value, onChange }: TextEntryProps) => {
  const color = useColor();
  // `text-body` and not `text-label`: this renders USER CONTENT (`00 §5.6`), which is read for
  // its meaning rather than scanned for its position, and `27-F25` reserves the numeric ladder
  // for the operational payload. It is also the size an Urdu string needs to be legible at all.
  const t = typography["text-body"];
  return (
    // The caption is a `Readout` rather than a hand-drawn label: it is the same
    // caption-directly-above-its-fact idiom the unlock screen, the tender panel and the caller
    // strip already use, and `27-F57`'s mapping step is where comprehension collapses. A second
    // way of pairing a word to the thing it names is exactly what `21-F1`/`21-F5` forbid.
    <Readout caption={caption}>
      <input
        type="text"
        // Both, and deliberately: `Tile` sets the same pair for the same reason. The visible
        // caption above is what a cashier uses (`21 §5` — *"visual position is the real
        // interface"*, and this population reads position rather than prose); the attribute is
        // what makes the control's accessible name resolvable without depending on a generated id.
        aria-label={caption}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          // `27-F8` — the posture's own target, from the table, and the ONLY size this component
          // states. A field is a control a finger lands on before anything is typed into it.
          minHeight: targetFor(posture),
          padding: space["space-2"],
          fontFamily: t.fontFamily,
          fontSize: t.fontSize,
          fontWeight: t.fontWeight,
          // 27-F13/F16 — no status colour on a resting control. This is the ordinary raised
          // surface every other neutral control in the package sits on.
          background: color["bgColor-surface-raised"],
          color: color["fgColor-default"],
          // `27-F66`'s neutral boundary, one step up from `borderColor-default`: an empty field
          // has no ink of its own, so the outline is the whole of what makes it a visible target
          // (`27-F5`) rather than a gap in the card.
          border: `1px solid ${color["borderColor-strong"]}`,
          borderRadius: space["space-2"],
          // The field gives up width before anything else on a caller card that also carries a
          // 20 mm keypad — the same `minWidth: 0` the card column itself takes. The TARGET never
          // shrinks (`27-F68` (b): *"the minimum IS the millimetre"*), only the writing room does.
          minWidth: 0,
        }}
      />
    </Readout>
  );
};
