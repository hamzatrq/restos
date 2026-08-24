/**
 * ACCEPTANCE — the service can actually be STARTED.
 *
 * ⚠ **THIS IS `L8`'s LATER SHAPE, ASSERTED RATHER THAN ASSUMED.** The register records
 * *a service with no `dev`/`start` script, so a whole plane had never run as a process* —
 * measured on `services/sync-gateway`, which had `test` and a `build` stub and could not be
 * started at all, for a whole wave, with every suite green. A correct origin, a correct gate and
 * a correct outbox that no process can host is that defect one module over.
 *
 * It spawns the **DECLARED** script from `package.json` rather than importing `server.ts`,
 * because importing proves the module parses and proves nothing about whether `pnpm start` runs.
 * `services/sync-gateway/src/__acceptance__/startable.test.ts` set that precedent.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

describe("the storefront service is startable", () => {
  it("declares `start` and `dev` — the scripts whose absence was the defect", () => {
    expect(pkg.scripts.start, "no `start` script is how a plane never runs").toBeDefined();
    expect(pkg.scripts.dev).toBeDefined();
  });

  it("`pnpm start` boots, prints its origin identity, and answers /health", async () => {
    const child = spawn("pnpm", ["start"], {
      cwd: packageRoot,
      env: {
        ...process.env,
        PORT: "0",
        RESTOS_ORG_ID: "org-karachi",
        RESTOS_BRANCH_ID: "branch-clifton",
        RESTOS_DEVICE_ID: "device-storefront-clifton",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    try {
      const port = await new Promise<number>((resolve, reject) => {
        let out = "";
        const timer = setTimeout(() => reject(new Error(`no boot line in 60 s:\n${out}`)), 60_000);
        child.stdout.on("data", (chunk: Buffer) => {
          out += chunk.toString();
          const match = out.match(/on :(\d+)/);
          if (match?.[1] !== undefined) {
            clearTimeout(timer);
            // The boot line is load-bearing (`T12`): it names the (org, branch) this origin
            // pushes under, because a storefront on the wrong join key reports success at every
            // layer and no till ever sees an order.
            expect(out).toContain("org-karachi/branch-clifton");
            expect(out).toContain("storefront_cloud");
            expect(out, "06-F31's ruling belongs on the boot line, not only in a doc").toContain(
              "branch_provisional",
            );
            resolve(Number(match[1]));
          }
        });
        child.stderr.on("data", (chunk: Buffer) => {
          out += chunk.toString();
        });
        child.on("exit", (code) => {
          clearTimeout(timer);
          reject(new Error(`exited ${code} before booting:\n${out}`));
        });
      });

      const response = await fetch(`http://127.0.0.1:${port}/health`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
    } finally {
      child.kill("SIGKILL");
    }
  });

  it("REFUSES to boot with no origin identity — 00 §5.4 admits no defaulted org", async () => {
    // The other half of `T12`. A storefront that defaulted its (org, branch) would push a real
    // tenant's ledger under a made-up name and report success, which is the failure mode with no
    // error message at all.
    const child = spawn("pnpm", ["start"], {
      cwd: packageRoot,
      env: {
        ...process.env,
        PORT: "0",
        RESTOS_ORG_ID: "",
        RESTOS_BRANCH_ID: "",
        RESTOS_DEVICE_ID: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    try {
      const { code, out } = await new Promise<{ code: number | null; out: string }>((resolve) => {
        let out = "";
        child.stdout.on("data", (c: Buffer) => {
          out += c.toString();
        });
        child.stderr.on("data", (c: Buffer) => {
          out += c.toString();
        });
        child.on("exit", (code) => resolve({ code, out }));
      });
      expect(code).not.toBe(0);
      expect(out).toContain("06-F30");
      expect(out).toContain("RESTOS_ORG_ID");
    } finally {
      child.kill("SIGKILL");
    }
  });
});
