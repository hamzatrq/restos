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
import { type ChildProcess, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

/** Reads the boot line's port out of a spawned host, or rejects with everything it printed. */
const bootedPort = (child: ChildProcess): Promise<number> =>
  new Promise<number>((resolve, reject) => {
    let out = "";
    const timer = setTimeout(() => reject(new Error(`no boot line in 60 s:\n${out}`)), 60_000);
    child.stdout?.on("data", (chunk: Buffer) => {
      out += chunk.toString();
      const match = out.match(/on :(\d+)/);
      if (match?.[1] !== undefined) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`exited ${code} before booting:\n${out}`));
    });
  });

/**
 * ⚠ `fetch` overwrites `Host` (a forbidden header in undici), and `06-F1` resolves the tenant
 * FROM `Host` — so a customer's request has to be driven with `node:http`. `server-seam.test.ts`
 * records the version of this that measured its own 404.
 */
const postTo = (
  port: number,
  path: string,
  body: unknown,
  host: string,
): Promise<{ status: number; text: string }> => {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port,
        path,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload),
          host,
        },
      },
      (res) => {
        let text = "";
        res.on("data", (chunk) => {
          text += String(chunk);
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text }));
      },
    );
    req.on("error", reject);
    req.end(payload);
  });
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
        RESTOS_STOREFRONT_HOST: "burger-house.restos.pk",
        // `06-F33` — the dev host builds the REAL gateway-backed catalog and refuses to start
        // without somewhere to read prices from. Nothing is listening on this port in this test:
        // booting does not read the catalog, placing an order does, and a boot that pre-flighted
        // the gateway would make this service unstartable whenever the gateway was restarting.
        RESTOS_GATEWAY_URL: "http://127.0.0.1:59999",
        RESTOS_GATEWAY_TOKEN: "service-credential",
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
            // `06-F34` (a): a storefront answering the wrong vhost 404s every real customer and
            // reports a clean boot, so the host it serves is load-bearing on this line too.
            expect(out).toContain("burger-house.restos.pk");
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

  it("REFUSES to boot with no CATALOG to price against — 06-F33/01-F60 admit no fallback", async () => {
    // The catalog is a price authority, not a convenience: a dev host that started without one
    // would either refuse every order at runtime or (the dangerous shape) acquire a default.
    const child = spawn("pnpm", ["start"], {
      cwd: packageRoot,
      env: {
        ...process.env,
        PORT: "0",
        RESTOS_ORG_ID: "org-karachi",
        RESTOS_BRANCH_ID: "branch-clifton",
        RESTOS_DEVICE_ID: "device-storefront-clifton",
        RESTOS_STOREFRONT_HOST: "burger-house.restos.pk",
        RESTOS_GATEWAY_URL: "",
        RESTOS_GATEWAY_TOKEN: "",
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
      expect(out).toContain("06-F33");
      expect(out).toContain("RESTOS_GATEWAY_URL");
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
        RESTOS_STOREFRONT_HOST: "",
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
      // `06-F34` (a) joined the join key: an origin with no public host cannot refuse a request
      // that names another one, so it is refused at boot rather than defaulted to "any".
      expect(out).toContain("RESTOS_STOREFRONT_HOST");
    } finally {
      child.kill("SIGKILL");
    }
  });

  /**
   * ⚠ **THE PRICE AUTHORITY OF THE ONLY SHIPPING HOST, ASSERTED THROUGH THE SPAWNED PROCESS —
   * AND THIS IS `L7`, ONE LAYER OUT FROM THE `F1` FIX THAT CLOSED IT FOR THE OUTBOX.**
   *
   * Measured by the adversarial re-review (2026-08-24): replacing
   * `catalog: createGatewayCatalog(link, identity)` in `server.ts`'s `pnpm start` block with an
   * inline stub pricing **every** item at 1 paisa left the suite at **59 passed (59), exit 0**,
   * while `server.ts` asserted in prose that *"the catalog is NOT stubbed"*. A comment claiming a
   * protection nothing enforces is the shape this repo records as worse than no comment, because
   * it retires the assertion the next session would have written.
   *
   * Every other test in this file boots the host and reads `/health`, which cannot tell a real
   * price authority from a stub: **an order has to travel through the spawned process**. The two
   * assertions with teeth are (i) the gateway was actually ASKED, with this org and the service
   * credential (`28-F5` (b′)), and (ii) an item the published artifact does not price is REFUSED
   * (`06-F33`/`01-F60`) — a stub prices everything, so it fails both.
   */
  it("prices from the REAL gateway artifact — the shipping host's catalog is not a stub (06-F33)", async () => {
    const seen: Array<{ url: string; auth: string | undefined }> = [];
    const gateway: Server = createServer((req, res) => {
      seen.push({ url: req.url ?? "", auth: req.headers.authorization });
      if (req.headers.authorization !== "Bearer service-credential") {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          version: 12,
          entries: [
            {
              kind: "item",
              id: "item-burger",
              name: "Zinger Burger",
              prices: [
                { branch_id: "branch-clifton", channel: "counter", price_paisa: 40_000 },
                { branch_id: "branch-clifton", channel: "storefront", price_paisa: 45_000 },
              ],
            },
          ],
        }),
      );
    });
    await new Promise<void>((resolve) => gateway.listen(0, "127.0.0.1", resolve));
    const gatewayPort = (gateway.address() as AddressInfo).port;

    const child = spawn("pnpm", ["start"], {
      cwd: packageRoot,
      env: {
        ...process.env,
        PORT: "0",
        RESTOS_ORG_ID: "org-karachi",
        RESTOS_BRANCH_ID: "branch-clifton",
        RESTOS_DEVICE_ID: "device-storefront-clifton",
        RESTOS_STOREFRONT_HOST: "burger-house.restos.pk",
        RESTOS_GATEWAY_URL: `http://127.0.0.1:${gatewayPort}`,
        RESTOS_GATEWAY_TOKEN: "service-credential",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    try {
      const port = await bootedPort(child);

      const placed = await postTo(
        port,
        "/trpc/placeOrder",
        { lines: [{ line_id: "l1", item_id: "item-burger", qty: 1 }] },
        "burger-house.restos.pk",
      );
      expect(placed.status, placed.text).toBe(200);

      // (i) the gateway was ASKED — a stub catalog never opens this connection at all.
      expect(
        seen,
        "06-F33: the shipping host's price authority is the published artifact, read over " +
          "28-F5 (b′)'s /internal hop — a catalog that answers without asking is a stub",
      ).not.toHaveLength(0);
      expect(seen[0]?.url).toContain("/internal/catalog/published");
      expect(seen[0]?.url).toContain("org_id=org-karachi");
      expect(seen[0]?.auth).toBe("Bearer service-credential");

      // (ii) an item the artifact does not price is REFUSED. A stub prices everything, which is
      // how a customer's 1 paisa becomes a permanent line under `01-F1`.
      const ghost = await postTo(
        port,
        "/trpc/placeOrder",
        { lines: [{ line_id: "l1", item_id: "item-not-on-this-menu", qty: 1 }] },
        "burger-house.restos.pk",
      );
      expect(ghost.status, ghost.text).not.toBe(200);
      expect(ghost.text).toContain("06-F33");
    } finally {
      child.kill("SIGKILL");
      await new Promise<void>((resolve) => gateway.close(() => resolve()));
    }
  });
});
