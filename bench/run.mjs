// bench/run.mjs — the Tier-B harness driver. Builds the pure-kernel bundle, runs the
// parity battery and the benchmarks under BOTH Node (V8) and the standalone Hermes VM,
// compares parity output byte-for-byte, and prints the busy-day table + Hermes/V8 ratio
// + a clearly-labeled tablet PROJECTION. Additive test infra — see bench/README.md.
//
// Usage:
//   node bench/run.mjs            # both phases
//   node bench/run.mjs parity     # phase 1 only
//   node bench/run.mjs bench      # phase 2 only
// Env:
//   HERMES_BIN=/path/to/hermes    # use a Hermes you trust (preferred)
//   SKIP_HERMES=1                 # Node-only run (no cross-engine comparison)
//   ALLOW_HERMES_DOWNLOAD=1       # opt in to fetching the prebuilt CLI (OFF by default)
//   HERMES_SHA256=<64 hex>        # required with the opt-in: verifies the tarball before use
// Auto-download is disabled by default and, when enabled, refuses to run a
// binary whose sha256 does not match HERMES_SHA256 (supply-chain safety).

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildBundle } from "./build.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const DIST = join(HERE, "dist");
const VENDOR = join(HERE, "vendor", "hermes");

// Pinned to the release whose hermes-cli-darwin.tar.gz ships a UNIVERSAL binary
// (native arm64 — no Rosetta). Reports internal version 0.12.0, HBC bytecode v96.
const HERMES_VERSION = "v0.13.0";
const HERMES_URL = `https://github.com/facebook/hermes/releases/download/${HERMES_VERSION}/hermes-cli-darwin.tar.gz`;
// Undocumented -Xes6-* flags: the raw Hermes CLI defaults ES6 classes OFF; React
// Native enables them at runtime. @noble/hashes (sha256) is class-based, so the fold
// hash path needs -Xes6-class. proxy/promise enabled defensively (harmless, unused).
const HERMES_FLAGS = ["-Xes6-class", "-Xes6-proxy", "-Xes6-promise"];
// Spec 25 §3: a 2 GB Android tablet is 5–10× slower than an Apple-silicon laptop.
const TABLET_FACTOR = [5, 10];

const log = (s = "") => process.stdout.write(`${s}\n`);
const captured = [];
const cap = (s = "") => {
  captured.push(s);
  log(s);
};

// ── Hermes acquisition ──────────────────────────────────────────────────────
const sha256 = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

function ensureHermes() {
  const env = process.env;
  if (env.SKIP_HERMES === "1") return null;
  // Preferred path: point at a Hermes you already trust.
  if (env.HERMES_BIN && existsSync(env.HERMES_BIN)) return env.HERMES_BIN;
  const vendored = join(VENDOR, "hermes");
  if (existsSync(vendored)) return vendored;

  // Auto-download is OFF by default: fetching and executing a binary from the
  // internet on `pnpm bench` is a supply-chain risk (this repo is a
  // money-handling kernel). To enable the cross-engine parity assertion, either
  // set HERMES_BIN to a Hermes you trust, or opt in explicitly AND pin the
  // expected tarball hash from the official release you have verified:
  //   ALLOW_HERMES_DOWNLOAD=1 HERMES_SHA256=<sha256 of hermes-cli-darwin.tar.gz>
  if (env.ALLOW_HERMES_DOWNLOAD !== "1") {
    log("  hermes not found → Node-only run (no cross-engine parity).");
    log("  Enable it with HERMES_BIN=<trusted hermes>, or");
    log(`  ALLOW_HERMES_DOWNLOAD=1 HERMES_SHA256=<sha256 of the ${HERMES_VERSION} tarball>.`);
    return null;
  }
  const expected = (env.HERMES_SHA256 || "").toLowerCase().trim();
  if (!/^[0-9a-f]{64}$/.test(expected)) {
    log("  ALLOW_HERMES_DOWNLOAD=1 but HERMES_SHA256 is missing/invalid — refusing to");
    log("  run an unverified binary. Pin the official tarball's sha256 and retry.");
    return null;
  }
  try {
    log(`  downloading ${HERMES_VERSION} prebuilt CLI (will verify sha256)…`);
    mkdirSync(VENDOR, { recursive: true });
    const tgz = join(VENDOR, "hermes-cli-darwin.tar.gz");
    // https-only, fail on HTTP error, modern TLS.
    execFileSync("curl", ["-fsSL", "--proto", "=https", "--tlsv1.2", HERMES_URL, "-o", tgz], {
      stdio: ["ignore", "ignore", "inherit"],
    });
    const got = sha256(tgz);
    if (got !== expected) {
      rmSync(tgz, { force: true });
      log(`  sha256 MISMATCH — refusing to extract. expected ${expected}, got ${got}`);
      return null;
    }
    execFileSync("tar", ["xzf", tgz, "-C", VENDOR], { stdio: "inherit" });
    // Containment check — reject any symlink/traversal escape from VENDOR.
    if (!existsSync(vendored) || !realpathSync(vendored).startsWith(`${realpathSync(VENDOR)}/`)) {
      rmSync(vendored, { force: true });
      log("  extracted binary is missing or escaped the vendor dir — refusing.");
      return null;
    }
    // Note: the macOS quarantine xattr is intentionally NOT stripped — the
    // binary is verified by hash, and silently clearing Gatekeeper is not our call.
    log(`  hermes ready (sha256 verified): ${vendored}`);
    return vendored;
  } catch (e) {
    log(`  hermes setup failed (${e.message}); continuing Node-only.`);
  }
  return null;
}

function hermesVersion(bin) {
  const r = spawnSync(bin, [...HERMES_FLAGS, "--version"], { encoding: "utf8" });
  const m = (r.stdout || "").match(/release version:\s*([\d.]+)/i);
  const b = (r.stdout || "").match(/bytecode version:\s*(\d+)/i);
  return `${m ? m[1] : "?"} (HBC ${b ? b[1] : "?"})`;
}

// ── Bundle + run ────────────────────────────────────────────────────────────
async function build() {
  const parity = join(DIST, "parity.js");
  const bench = join(DIST, "bench.js");
  const r1 = await buildBundle({ entry: join(HERE, "src/parity-entry.ts"), outfile: parity });
  await buildBundle({ entry: join(HERE, "src/bench-entry.ts"), outfile: bench });
  return { parity, bench, esbuild: r1.version };
}

function runNode(bundle) {
  const r = spawnSync(process.execPath, [bundle], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`node run failed: ${r.stderr}`);
  return r.stdout.split("\n").filter(Boolean);
}
function runHermes(bin, bundle) {
  const r = spawnSync(bin, [...HERMES_FLAGS, bundle], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`hermes run failed: ${r.stderr || r.stdout}`);
  return r.stdout.split("\n").filter(Boolean);
}

// ── Parse the tagged protocol ────────────────────────────────────────────────
function parseParity(lines) {
  const m = new Map();
  for (const l of lines) {
    if (!l.startsWith("@P\t")) continue;
    const rest = l.slice(3);
    const tab = rest.indexOf("\t");
    m.set(rest.slice(0, tab), rest.slice(tab + 1));
  }
  return m;
}
function parseMeta(lines) {
  const m = {};
  for (const l of lines) {
    if (!l.startsWith("@M\t")) continue;
    const [, k, v] = l.split("\t");
    m[k] = v;
  }
  return m;
}
function parseBench(lines) {
  const out = [];
  for (const l of lines) {
    if (!l.startsWith("@B\t")) continue;
    const [, workload, n, run, ms, folded] = l.split("\t");
    out.push({ workload, n: +n, run: +run, ms: +ms, folded: +folded });
  }
  return out;
}
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// ── Phase 1: parity ──────────────────────────────────────────────────────────
function reportParity(nodeLines, hermesLines) {
  cap("");
  cap("═══════════════════════════════════════════════════════════════════════");
  cap(" PHASE 1 — RUNTIME PARITY (byte-identical output: Node/V8 vs Hermes)");
  cap("═══════════════════════════════════════════════════════════════════════");
  const nodeMeta = parseMeta(nodeLines);
  const nodeMap = parseParity(nodeLines);
  cap(`  node : bigint=${nodeMeta.bigint}   cases=${nodeMap.size}`);
  if (!hermesLines) {
    cap("  hermes: UNAVAILABLE — Node-only run, no cross-engine comparison performed.");
    cap("  (set HERMES_BIN or allow the download to enable the parity assertion.)");
    for (const name of [...nodeMap.keys()].sort()) cap(`    · ${name}`);
    return { compared: false, findings: [] };
  }
  const hermesMeta = parseMeta(hermesLines);
  const hermesMap = parseParity(hermesLines);
  cap(`  hermes: bigint=${hermesMeta.bigint}   cases=${hermesMap.size}`);
  cap("");
  const names = new Set([...nodeMap.keys(), ...hermesMap.keys()]);
  const findings = [];
  let matched = 0;
  for (const name of [...names].sort()) {
    const a = nodeMap.get(name);
    const b = hermesMap.get(name);
    if (a === undefined || b === undefined) {
      findings.push({ name, kind: "missing", a, b });
    } else if (a !== b) {
      findings.push({ name, kind: "divergent", a, b });
    } else {
      matched++;
    }
  }
  cap(`  RESULT: ${matched}/${names.size} cases byte-identical across engines.`);
  if (findings.length === 0) {
    cap("  ✓ ALL PARITY CASES MATCH — the kernel computes identically on Hermes.");
  } else {
    cap(`  ✗ ${findings.length} DIVERGENCE(S) — these behave differently on the tablet:`);
    for (const f of findings) {
      cap(`    ── ${f.name} [${f.kind}]`);
      cap(`       node  : ${String(f.a).slice(0, 240)}`);
      cap(`       hermes: ${String(f.b).slice(0, 240)}`);
    }
  }
  return { compared: true, findings };
}

// ── Phase 2: benchmarks ──────────────────────────────────────────────────────
function aggregate(samples) {
  // key: workload|n -> { ms: [...], folded: Set }
  const g = new Map();
  for (const s of samples) {
    const k = `${s.workload}|${s.n}`;
    if (!g.has(k)) g.set(k, { workload: s.workload, n: s.n, ms: [], folded: new Set() });
    const e = g.get(k);
    e.ms.push(s.ms);
    e.folded.add(s.folded);
  }
  return g;
}

function reportBench(nodeB, hermesB, uptime) {
  cap("");
  cap("═══════════════════════════════════════════════════════════════════════");
  cap(" PHASE 2 — BUSY-DAY BENCHMARKS (pure merge engine)");
  cap("═══════════════════════════════════════════════════════════════════════");
  cap(`  machine load (uptime): ${uptime}`);
  cap(`  timing: Date.now() (1 ms resolution, shared by both engines); median of 7 runs`);
  cap("");
  const nodeG = aggregate(nodeB);
  const hermesG = hermesB ? aggregate(hermesB) : null;

  // events_folded work-independence check (the O(1)/event correctness invariant).
  cap("  Work-counter invariant (events_folded — load-independent, correctness-pinned):");
  for (const [, e] of nodeG) {
    const folded = [...e.folded];
    const flag = folded.length === 1 ? "" : "  ⚠ VARIES";
    const ratio =
      e.workload === "reconnect-stream" ? `  events_folded/N=${(folded[0] / e.n).toFixed(3)}` : "";
    cap(
      `    ${e.workload.padEnd(16)} N=${String(e.n).padEnd(6)} events_folded=${folded.join(",")}${ratio}${flag}`,
    );
  }
  cap("");
  cap("  Wall-clock (median ms):");
  const header = hermesG
    ? "    workload           N        node(V8)   hermes    H/V8    tablet≈(×5–10)"
    : "    workload           N        node(V8)   [hermes unavailable]";
  cap(header);
  cap(`    ${"".padEnd(header.length - 4, "─")}`);
  const ratios = [];
  const keys = [...nodeG.keys()].sort((a, b) => {
    const [wa, na] = a.split("|");
    const [wb, nb] = b.split("|");
    return wa === wb ? +na - +nb : wa.localeCompare(wb);
  });
  for (const k of keys) {
    const e = nodeG.get(k);
    const nm = median(e.ms);
    if (hermesG?.has(k)) {
      const hm = median(hermesG.get(k).ms);
      const r = hm / (nm || 1);
      ratios.push(r);
      const tLo = (hm * TABLET_FACTOR[0]).toFixed(0);
      const tHi = (hm * TABLET_FACTOR[1]).toFixed(0);
      cap(
        `    ${e.workload.padEnd(18)} ${String(e.n).padEnd(8)} ${nm.toFixed(1).padStart(8)}   ${hm
          .toFixed(1)
          .padStart(7)}   ${r.toFixed(2).padStart(5)}   ${`${tLo}–${tHi} ms`.padStart(13)}`,
      );
    } else {
      cap(`    ${e.workload.padEnd(18)} ${String(e.n).padEnd(8)} ${nm.toFixed(1).padStart(8)}`);
    }
  }
  cap("");
  if (hermesG && ratios.length) {
    const rMed = median(ratios);
    cap(`  Hermes/V8 ratio (median across workloads): ${rMed.toFixed(2)}×`);
    cap("");
    cap("  TABLET PROJECTION (labeled — NOT a measurement):");
    cap(
      `    projected_tablet_ms ≈ hermes_laptop_ms × [${TABLET_FACTOR[0]}–${TABLET_FACTOR[1]}]  (spec 25 §3 hardware factor)`,
    );
    cap(
      `    equivalently: node_laptop_ms × ${rMed.toFixed(2)} (measured Hermes/V8) × [${TABLET_FACTOR[0]}–${TABLET_FACTOR[1]}] (hardware)`,
    );
    cap("    Tier C (real 2 GB-tablet absolute, op-sqlite storage, plug-pull) is UNMEASURED here.");
    cap("");
    cap("  Context: spec 25 §3 measured the REFUTED O(N²) comparator engine at 25,800 ms for");
    cap("  10k events on this laptop class; the shipped merge engine's 10k cold fold is above.");
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const mode = process.argv[2] || "all";
  const uptime = (() => {
    try {
      return execFileSync("uptime", { encoding: "utf8" }).trim();
    } catch {
      return "unavailable";
    }
  })();

  cap("RestOS Tier-B kernel harness — Hermes parity + busy-day benchmarks");
  cap(`  repo: ${REPO_ROOT}`);
  cap(`  node: ${process.version}   platform: ${process.platform}/${process.arch}`);
  const hermesBin = ensureHermes();
  cap(`  hermes: ${hermesBin ? `${hermesBin}  [${hermesVersion(hermesBin)}]` : "UNAVAILABLE"}`);
  cap(`  hermes flags: ${HERMES_FLAGS.join(" ")}`);

  const { parity, bench, esbuild } = await build();
  cap(`  bundles built (esbuild ${esbuild}): parity.js, bench.js`);

  if (mode === "all" || mode === "parity") {
    const nodeP = runNode(parity);
    const hermesP = hermesBin ? runHermes(hermesBin, parity) : null;
    reportParity(nodeP, hermesP);
  }
  if (mode === "all" || mode === "bench") {
    const nodeB = parseBench(runNode(bench));
    const hermesB = hermesBin ? parseBench(runHermes(hermesBin, bench)) : null;
    reportBench(nodeB, hermesB, uptime);
  }

  cap("");
  cap("═══════════════════════════════════════════════════════════════════════");
  writeFileSync(join(HERE, "last-run.txt"), `${captured.join("\n")}\n`);
  cap(`  captured → bench/last-run.txt`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
