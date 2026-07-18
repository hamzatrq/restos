// Acceptance tests — T-01-01 (authored from spec text only; see plans/wave-0/kernel-tasks.md).
// Canonical line-state chain per 01 §4; terminal monotonicity per 01-F35.
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { ORDER_LINE_STATES, TERMINAL_LINE_STATES, applyLineState } from "../index.js";

const ALL = ORDER_LINE_STATES as readonly string[];
const TERMINAL = TERMINAL_LINE_STATES as readonly string[];
const NON_TERMINAL = ALL.filter((s) => !TERMINAL.includes(s));
// Widened once so tests can iterate exhaustively over the state vocabulary.
const apply = applyLineState as (
  current: string,
  next: string,
) => { state: string; applied: boolean; anomaly?: string };

const chain = (start: string, steps: readonly string[]) =>
  steps.reduce((state, next) => {
    const res = apply(state, next);
    expect(res.applied, `${state} -> ${next} must apply`).toBe(true);
    expect(res.state).toBe(next);
    return res.state;
  }, start);

describe("canonical line states (01 §4)", () => {
  it("01 §4: terminals are exactly served/delivered/voided/cancelled; settled is money-side, not a line state", () => {
    expect([...TERMINAL].sort()).toEqual(["cancelled", "delivered", "served", "voided"]);
    for (const t of TERMINAL) expect(ALL).toContain(t);
    expect(ALL).not.toContain("settled");
  });

  it("01 §4: the dine-in chain placed→confirmed→in_prep→ready→served applies every step", () => {
    chain("placed", ["confirmed", "in_prep", "ready", "served"]);
  });

  it("01 §4: the delivery chain continues ready→picked_up→delivered", () => {
    chain("ready", ["picked_up", "delivered"]);
  });

  it("01 §4: an illegal jump (placed→ready) is not applied and flags illegal_transition", () => {
    const res = apply("placed", "ready");
    expect(res.applied).toBe(false);
    expect(res.state).toBe("placed");
    expect(res.anomaly).toBe("illegal_transition");
  });

  it("01 §4: voided and cancelled are reachable from every non-terminal state", () => {
    for (const from of NON_TERMINAL) {
      for (const exit of ["voided", "cancelled"]) {
        const res = apply(from, exit);
        expect(res.applied, `${from} -> ${exit} must apply`).toBe(true);
        expect(res.state).toBe(exit);
      }
    }
  });
});

describe("terminal-state monotonicity (01-F35)", () => {
  it("01-F35: a delivered line ignores a later in_prep transition", () => {
    const res = apply("delivered", "in_prep");
    expect(res.applied).toBe(false);
    expect(res.state).toBe("delivered");
    expect(res.anomaly).toBe("terminal_regression");
  });

  it("01-F35: every terminal state ignores every later transition with terminal_regression", () => {
    for (const terminal of TERMINAL) {
      for (const next of ALL) {
        const res = apply(terminal, next);
        expect(res.applied, `${terminal} -> ${next} must be ignored`).toBe(false);
        expect(res.state).toBe(terminal);
        expect(res.anomaly).toBe("terminal_regression");
      }
    }
  });

  it("01-F35: folding any sequence never leaves a terminal state once entered, and applied:false never mutates state", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL),
        fc.array(fc.constantFrom(...ALL), { maxLength: 40 }),
        (start, seq) => {
          let state = start;
          let firstTerminal: string | null = TERMINAL.includes(state) ? state : null;
          for (const next of seq) {
            const res = apply(state, next);
            if (!res.applied) {
              expect(res.state, "an unapplied transition must not mutate state").toBe(state);
              expect(res.anomaly, "an unapplied transition must carry an anomaly").toBeDefined();
            }
            state = res.state;
            if (firstTerminal !== null) expect(state).toBe(firstTerminal);
            else if (TERMINAL.includes(state)) firstTerminal = state;
          }
        },
      ),
    );
  });
});
