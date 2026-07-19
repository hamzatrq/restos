#!/usr/bin/env node
// PreToolUse hook (23-F6): protected-path and oracle-protection reminders.
// conformance/ is hard-denied (24-F5: CI-derived, read-only to humans and
// agents). Test files stay allow + warn — session role is unknowable here.
let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  let filePath = "";
  try {
    filePath = JSON.parse(input)?.tool_input?.file_path ?? "";
  } catch {
    /* no JSON — allow */
  }
  const decide = (permissionDecision, reason) => {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision,
          permissionDecisionReason: reason,
        },
      }),
    );
    process.exit(0);
  };
  const allow = (reason) => decide("allow", reason);
  const deny = (reason) => decide("deny", reason);
  const protectedPaths = [
    "packages/domain/",
    "packages/sync-client/",
    "packages/sync-protocol/",
    "packages/escpos/",
    "services/tax/",
    "services/sync-gateway/",
  ];
  if (/(?:^|\/)conformance\/\d{2}\.yml$/.test(filePath)) {
    deny(
      "conformance/NN.yml is CI-derived (24-F5): hand-editing is falsifying the ledger. Run pnpm verify:<nn> to re-derive. (Hand-authored files under conformance/, e.g. wave-0-scope.yml, are allowed.)",
    );
  }
  if (/\.(test|spec)\.tsx?$/.test(filePath)) {
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
