import type { TerminalServer } from "./terminal-server";

/**
 * # `04-F31` — **the operator's three acts on the pad port: mint, list, revoke.**
 *
 * ## What was wrong, measured rather than argued
 *
 * `04-F22` (b) requires an enrolment code an operator reads off the till *"once per tablet"*, and
 * says in the same clause that *"enrolments are listed and revocable at the till"*. The shipped
 * till did neither:
 *
 * - `mintEnrolmentCode` had **exactly one call site**, on the boot line, so precisely ONE tablet
 *   could ever enrol per launch — the code is single-use and expires in five minutes, and nothing
 *   else could mint another. A second tablet meant restarting the counter, which (enrolments being
 *   process-local) un-enrols the first.
 * - `enrolments()` and `revoke()` had **zero production callers** — the shape `AGENTS.md` records
 *   as the eleventh-and-a-half instance of this wave's recurring defect, where `revokeDevice` was
 *   correct, tested and invocable by no human. A stolen tablet was revoked only by restarting the
 *   till mid-service, which revokes every other tablet with it.
 *
 * `seams:check` cannot see either: both are members of an object, not exports, and Rule A walks
 * exports. That is the same blind spot the register's own entry names, one surface along.
 *
 * ## Why the console and not a screen — and what that limit IS
 *
 * `14-F13`'s device list is where an owner-facing enrolment belongs and it is owed; until it
 * exists the operator's channel to this till is the one the enrolment code already uses, its
 * **console**. So this parses a line and performs an act, on the precedent `01-F25`'s pairing and
 * the gateway's `provision-device` command already set: an operator act on the host that holds the
 * credential, named in the runbook.
 *
 * ⚠ **STATED LIMIT: a packaged, double-clicked till has no TTY, so it has no console and these
 * three acts are unavailable there.** The boot line's single code remains its only enrolment, and
 * that is the honest state of build 1 rather than a design. It is the same shell-access limit
 * `01-F25` carries, and it closes when `14-F13`'s list ships.
 *
 * ## The parse is HERE and the stream is in the host
 *
 * One `command(line)` function, driven directly by a suite, because a module that owned the socket
 * could only be tested through one. `main/index.ts` reads stdin and hands it lines; nothing about
 * the vocabulary lives there.
 */
export type TerminalConsole = {
  /** One typed line. Anything unrecognised prints the vocabulary and does nothing. */
  command: (line: string) => void;
};

export type TerminalConsoleDeps = {
  /**
   * The real server. Three members, and they are the three `04-F22` (b) names — a fourth would be
   * this console growing a surface the FR does not describe.
   */
  server: Pick<
    TerminalServer,
    "listening" | "failure" | "mintEnrolmentCode" | "enrolments" | "revoke"
  >;
  log: (line: string) => void;
};

/** The vocabulary, printed on anything unrecognised so the operator is never guessing. */
const USAGE = [
  "pad — list the tablets this till has admitted (04-F22 (b))",
  "pad enrol — mint a one-time code for ONE tablet, valid five minutes",
  "pad revoke <terminal> — stop admitting that tablet, now",
].join("\n");

export const createTerminalConsole = (deps: TerminalConsoleDeps): TerminalConsole => ({
  command: (line: string): void => {
    const words = line.trim().split(/\s+/).filter(Boolean);
    // A blank line is a person pressing return, not a request. Silence is the answer.
    if (words.length === 0) return;
    if (words[0] !== "pad") return;
    // `04-F22` (a) — with no certificate nothing listens, so there is nothing to enrol INTO. Said
    // rather than answered with an empty list, which would read as "no tablets yet".
    if (!deps.server.listening) {
      deps.log("terminal: the order pad is OFF on this till — no certificate is configured");
      return;
    }
    const verb = words[1];
    if (verb === undefined) {
      // `04-F32`/`00 §5.7` — a port that was asked for and did not come up is the first thing an
      // operator listing tablets needs to know, because every other answer here would be true and
      // useless: no tablet can reach a socket that is not bound.
      const failure = deps.server.failure();
      if (failure !== null) deps.log(`terminal: ${failure}`);
      const admitted = deps.server.enrolments();
      deps.log(
        admitted.length === 0
          ? "terminal: no tablet is enrolled on this till"
          : `terminal: ${admitted.length} tablet(s) enrolled — ${admitted.join(", ")}`,
      );
      return;
    }
    if (verb === "enrol") {
      // `04-F22` (b) — one code, one tablet, five minutes. Minting a fresh one is an operator act
      // rather than a standing offer: a code that is always available is a bearer credential with
      // no end, which is what that clause refuses.
      deps.log(`terminal: enrolment code ${deps.server.mintEnrolmentCode()} (04-F22 (b))`);
      return;
    }
    if (verb === "revoke") {
      const target = words[2];
      if (target === undefined) {
        deps.log("terminal: name the tablet to revoke — `pad` lists them");
        return;
      }
      // The answer says WHICH outcome happened: a revoke that silently reports success on an id
      // nobody holds tells an operator a stolen tablet is out when it is not.
      deps.log(
        deps.server.revoke(target)
          ? `terminal: revoked ${target} — it is admitted no longer, and its live nonces are gone`
          : `terminal: no tablet ${target} is enrolled here — nothing was revoked`,
      );
      return;
    }
    deps.log(USAGE);
  },
});
