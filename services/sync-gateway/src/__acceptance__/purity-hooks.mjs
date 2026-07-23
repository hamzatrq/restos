// T-01-11 fix round F7 (ruled, plans/wave-0/t-01-11-fix-round.md) — module
// customization hooks making better-sqlite3 UNRESOLVABLE in a spawned node:
// the environment in which the auditor module must still load (t-01-11
// ruling 2: no native addon in the gateway runtime). Registered via
// purity-block-sqlite.mjs; runs on the loader thread (node:module register).
export const resolve = (specifier, context, nextResolve) => {
  if (specifier === "better-sqlite3" || specifier.includes("better-sqlite3")) {
    throw new Error(
      `[t-01-11 F7] better-sqlite3 blocked: resolution of "${specifier}" is forbidden ` +
        "in this process — the pure fold-engine subpath must suffice (t-01-11 ruling 2)",
    );
  }
  return nextResolve(specifier, context);
};
