/**
 * `00 §5.4` — **the SEAM half of the cloud-scheme guard: this host refuses at BOOT.**
 *
 * `packages/sync-client/src/__acceptance__/cloud-url-scheme.test.ts` owns the predicate and the
 * transport's construction-time refusal. Neither of those is what `00 §5.4` (ii) asks for, and the
 * difference is the whole reason this file exists: a refusal that arrives when the socket is first
 * dialled is a till that already started, already signed a cashier in, and discovers the problem at
 * the first sync. This repository's worked example is `deviceTaxCell()` — resolved lazily at five
 * money sites and at no boot, so a bad value started a till, rang a full order, and threw at
 * settlement. This host dials the SAME leg as the counter — `RESTOS_CLOUD_URL` into
 * `createPassUplink` into `createWsCloudTransport` — so guarding one and not the other would be
 * `01-F66`'s lesson again: a protection aimed one case away from the case beside it.
 *
 * **Read off the SOURCE, because `main/index.ts` imports `electron` and is unreachable from
 * vitest** — the same technique and the same reason as `pass-seam.test.ts` §A2, which is this
 * app's established pattern for asserting that the entry point wires something in the right
 * ORDER.
 *
 * ## The property that carries §A, and why it is INDENTATION
 *
 * "At boot" has to be checked, not trusted, and the check must survive a reader who moves the call
 * one scope in. In both Electron hosts every statement inside `counterBoot` / `boot()` is indented
 * and every module-scope statement begins at column 0 — so *"the call appears on a line with no
 * leading whitespace"* is exactly the claim `00 §5.4` (ii) makes, mechanically. `app.whenReady()`
 * is NOT usable as the anchor: in this file it occurs inside `boot()` *above* the module-scope
 * prologue, and in `apps/pos-electron` it occurs earlier inside a doc comment — a first draft of
 * this file used it and produced three false failures, which is the cheap version of the lesson.
 *
 * ⚠ **A source assertion can pass by not looking** (`plans/wave-1/oracle-round-2-findings.md` §C
 * pattern 2): a scan over an empty string reports clean. §0 anchors on lines that have nothing to
 * do with this change, so this file cannot be satisfied by the very code it guards.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SRC = new URL("../", import.meta.url).pathname;
const mainSrc = readFileSync(`${SRC}index.ts`, "utf8");
const lines = mainSrc.split("\n");

/** Where this host hands control to its async boot. Everything after it is not "at boot". */
const BOOT_KICKOFF = "void boot()";

/** Module scope = column 0. See the header: this is the mechanical form of "at boot". */
const moduleScopeGuard = lines.findIndex(
  (line) => /^\S/.test(line) && line.includes("cloudUrlRefusal("),
);

/**
 * The module-scope line that hands control to the async boot. Found by INDENTATION for the same
 * reason as the guard above: both files mention this expression inside a doc comment, and a comment
 * continuation line begins with whitespace while a module-scope statement does not. That is a cheap
 * stand-in for comment-blindness and it is stated rather than implied — `AGENTS.md` records a count
 * inflated by comment hits as this repository's own worked example of a proxy accepted as evidence.
 */
const kickoffLine = lines.findIndex((line) => /^\S/.test(line) && line.includes(BOOT_KICKOFF));

describe("§0 — the file was actually read (round-2 pattern 2)", () => {
  it("reads a non-trivial main/index.ts with its unrelated landmarks intact", () => {
    expect(mainSrc.length).toBeGreaterThan(4_000);
    expect(mainSrc).toContain("app.requestSingleInstanceLock()");
    expect(kickoffLine).toBeGreaterThan(-1);
    expect(lines.length).toBeGreaterThan(200);
  });
});

describe("§A — 00 §5.4 (ii): the refusal is at BOOT, before anything opens", () => {
  it("consults cloudUrlRefusal and imports it from the package that owns the reading", () => {
    expect(mainSrc).toMatch(/cloudUrlRefusal\s*\(/);
    expect(mainSrc).toMatch(
      /import\s*\{[^}]*cloudUrlRefusal[^}]*\}\s*from\s*"@restos\/sync-client"/s,
    );
  });

  /**
   * THE ASSERTION THAT DOES THE WORK. `cloudUrlRefusal` could be called anywhere — inside
   * `boot()`, inside an IPC handler, in a branch reached only once a socket is wanted — and
   * the guard would then be exactly the lazy resolution `00 §5.4` (ii) forbids. At column 0 it is
   * module scope: it runs before the store, the window, the roster and every socket.
   */
  it("is called at MODULE SCOPE, so it cannot be a lazily-resolved refusal", () => {
    expect(moduleScopeGuard).toBeGreaterThan(-1);
  });

  it("runs before this host hands control to its async boot", () => {
    expect(kickoffLine).toBeGreaterThan(-1);
    expect(moduleScopeGuard).toBeLessThan(kickoffLine);
  });

  it("names RESTOS_CLOUD_URL, so the operator is told which value is wrong", () => {
    const guard = lines.slice(moduleScopeGuard - 2, moduleScopeGuard + 8).join("\n");
    expect(guard).toContain("RESTOS_CLOUD_URL");
  });

  /**
   * `01-F67`: stderr because it is the stream `ops/startup/restos-kitchen.bat` captures, and a
   * NON-ZERO exit because that launcher tells a permanent refusal from a crash by the shape of the
   * return. `app.quit()` here would be a screen that reported success while refusing to work, and a
   * modal would be `01-F67` (iii)'s refusal-by-waiting-for-a-human on an unattended machine.
   */
  it("returns non-zero on stderr and does not wait for a human (01-F67)", () => {
    const guard = lines.slice(moduleScopeGuard, moduleScopeGuard + 8).join("\n");
    expect(guard).toContain("process.stderr.write");
    expect(guard).toContain("app.exit(1)");
    expect(guard).not.toContain("showErrorBox");
  });
});

describe("§B — 00 §5.7: the boot line reports the transport", () => {
  it("prints describeCloudUrl inside the boot-line block, not somewhere unread", () => {
    const bootLine = mainSrc.slice(mainSrc.indexOf("process.stdout.write"));
    expect(bootLine).toMatch(/describeCloudUrl\(/);
    expect(mainSrc).toMatch(
      /import\s*\{[^}]*describeCloudUrl[^}]*\}\s*from\s*"@restos\/sync-client"/s,
    );
  });
});
