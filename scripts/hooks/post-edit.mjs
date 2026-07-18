#!/usr/bin/env node
// PostToolUse hook (23-F6, 24 §3 step 4): deterministic feedback into the loop.
// - spec/router edits → run the doc linter, feed findings back (exit 2)
// - TS/JSON edits → biome check the file, feed diagnostics back (exit 2)
import { execFileSync } from "node:child_process";

let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  let filePath = "";
  try {
    filePath = JSON.parse(input)?.tool_input?.file_path ?? "";
  } catch {
    process.exit(0);
  }
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: "pipe" }).toString();
  try {
    if (/(^|\/)(specs\/.*\.md|AGENTS\.md|restaurant-os\.md)$/.test(filePath)) {
      run("node", ["scripts/docs-lint.mjs"]);
    } else if (/\.(ts|tsx|json)$/.test(filePath) && !filePath.includes("node_modules")) {
      run("pnpm", ["exec", "biome", "check", filePath]);
    }
    process.exit(0);
  } catch (e) {
    const out = (e.stdout?.toString() ?? "") + (e.stderr?.toString() ?? "");
    process.stderr.write(out.slice(0, 4000) || String(e.message));
    process.exit(2); // feeds diagnostics back into the session (rules-based feedback, 24 §3)
  }
});
