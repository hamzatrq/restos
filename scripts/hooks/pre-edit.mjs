#!/usr/bin/env node
// PreToolUse hook (23-F6): protected-path and oracle-protection reminders.
// Scaffold posture: allow + reason (23 §8 bias). Hard-deny on test/conformance
// paths activates when the first acceptance tests land (24 §3 step 2).
let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  let filePath = "";
  try {
    filePath = JSON.parse(input)?.tool_input?.file_path ?? "";
  } catch {
    /* no JSON — allow */
  }
  const allow = (reason) => {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "allow",
          permissionDecisionReason: reason,
        },
      }),
    );
    process.exit(0);
  };
  const protectedPaths = [
    "packages/domain/",
    "packages/sync-client/",
    "packages/sync-protocol/",
    "packages/escpos/",
    "services/tax/",
    "services/sync-gateway/",
  ];
  if (
    /\.(test|spec)\.tsx?$/.test(filePath) ||
    filePath.includes("/conformance/") ||
    filePath.startsWith("conformance/")
  ) {
    allow(
      "⚠ ORACLE PATH (24 §3): acceptance tests and conformance are read-only to implementing sessions. If you are the implementer of the FRs these tests cover, STOP — a different session owns them.",
    );
  }
  for (const p of protectedPaths) {
    if (filePath.includes(p))
      allow(
        `⚠ PROTECTED PATH (20 §4.4): ${p} requires senior review and its owning spec open (see ${p}CLAUDE.md). Spec change before behavior change.`,
      );
  }
  process.exit(0);
});
