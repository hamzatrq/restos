// ACCEPTANCE TESTS — `18 §10`'s FIRST REAL TRANSPORT: the link between the spooler and a printer.
//
// ⚠ AUTHORED FROM SPEC TEXT ONLY (`24 §3` step 2, `24-F5`), by a session that implemented NONE of
// it and read the transport's implementation nowhere, because none exists: at the time of writing
// this app shipped exactly two `SpoolerTransport`s — `unattachedPrinter` (`main/printing.ts`,
// `no_response` on every transmit) and `filePrinter` (`main/file-printer.ts`, a PDF simulator) —
// and `18 §10`'s TCP/USB/serial links were unbuilt. Those two files were read as CONTRACTS: the
// resolver's shape, `classifyTransmit`'s place in it, and `03-F5`'s band. **Read-only to the
// implementing session.** An assertion you believe is wrong is a FINDING for this file's owner,
// cited by FR id — never an edit (`24-F5`).
//
// ── THE FRs, QUOTED so an assertion can be argued with ─────────────────────────────────────────
//
//   03-F1  "ESC/POS output, 58 mm and 80 mm, over USB, Bluetooth SPP/BLE, and TCP port 9100, via
//          `packages/escpos` (encoder + pluggable transports)."
//   18 §10 "Transports: TCP 9100 (pure TS, all platforms), USB/serial (Electron main via
//          `serialport`/`usb`) … Every printer interaction goes through the spooler (doc 03):
//          queue → attempt → confirm/timeout → retry/alert. Direct transport writes from app code
//          are banned."
//   03-F4  "Retry with backoff (default 3 attempts over 30 s) on transport failure."
//   03-F5  "**Silent KOT failure is forbidden.** When retries exhaust: the host device raises a
//          loud alert … naming the printer and order … `kot.print_failed` is emitted."
//   03-F40 "Paper-out is detected with the real-time `DLE EOT 4`, never `GS r` … the paper-end
//          sensor takes the printer **offline**, and it then does not execute `GS r` at all — so a
//          health check built on `GS r` reports 'paper present' forever and a paper-out becomes a
//          silent KOT failure. Real-time commands are answered while offline by design. The two
//          commands also use **incompatible bit layouts for the same sensor** (`DLE EOT 4`: bits
//          2,3 near-end / 5,6 out; `GS r 1`: bits 0,1 / 2,3) … Cap outstanding real-time queries
//          at **4**."
//   03-F41 "A stalled printer is holding the job, not dropping it — so `03-F4`'s retry must not
//          fire … a stall never counts toward the 3-attempt budget and never re-transmits. A
//          timeout that flips a stall to `failed` and retries **double-prints the instant the roll
//          is loaded** — a duplicate KOT is a real kitchen error."
//   03-F42 "A document is rendered whole, buffered, and transmitted as one unit … if data is
//          interrupted for two seconds or more, the printer automatically feeds to the reserved cut
//          position and cuts … **No I/O wait may be interleaved inside a document.**"
//   03-F51 "A refused configuration never blocks a sale and never blocks the app (01-F17,
//          commandment 4). It is simply not applied … and the refusal is reported at length
//          wherever the configuration was made." Its fallback is the LOUD one on purpose: "paper it
//          cannot print merely says so loudly (03-F5)".
//   00 §5.7 a surface reports what is TRUE of itself; a degradation is NAMED rather than presented
//          as configuration. (`main/station-routing.ts`, `main/panel-density.ts` and
//          `main/device-identity.ts` are this app's three worked examples, all of them boot lines.)
//   01-F17 "A sale is never blocked" — not by a printer, not by a socket, not by a setting.
//
// ── THE DECLARED SURFACE — what this oracle asks the implementing session to deliver ───────────
//
// A test cannot assert behaviour it cannot reach, so this file NAMES the surface (`24 §3` step 2:
// the oracle is written first and the implementation is written against it). It is deliberately
// the smallest surface that can hold the properties below, and it is **not invented freehand** —
// it is `main/station-routing.ts`'s shape, which is this app's existing precedent for a
// configured-by-environment resolver whose refusal must be REPORTED rather than guessed:
//
//   `main/printer-link.ts`
//     export const PRINTER_LINK_ENV: string
//       The one environment key. **Its VALUE is not asserted anywhere in this file** — every test
//       uses the constant — so the implementer picks the name (`00 §7` layer 3: a link is per
//       DEVICE, not per org).
//     export const resolvePrinterLink: (input: {
//       readonly configured: string | undefined;   // raw, as it arrives; parsed and refused here
//       readonly capability: PrinterCapability;    // `03-F5`'s printer NAME, and classifyTransmit's
//     }) => {
//       readonly transport: SpoolerTransport;      // `18 §10`'s seam, ready to be handed to K-6
//       readonly source: "configured" | "refused" | "default";
//       readonly verdict: { readonly ok: true } | { readonly ok: false; readonly reason: string };
//       readonly configured: string | undefined;   // carried ONLY so the boot line can name it
//     }
//     export const describePrinterLink: (link: …) => string    // the `00 §5.7` boot line
//
//   …and `printerTransport(capability, env)` (`main/file-printer.ts`) — which already exists and is
//   already the ONE place the default is decided — resolves through it. That symbol is not this
//   file's choice: `__acceptance__/file-printer.test.ts` §D already pins `main/index.ts` to
//   `createSpooler({ transport: printerTransport(…, process.env) })`.
//
// `configured` is a PARAMETER and not a read of `process.env` inside the resolver, for
// `file-printer.ts`'s own stated reason: a default that can only be checked by mutating a global
// is a default a test can lose to ordering.
//
// If you believe another shape is right, that is a finding (`24-F5`) — but note that every
// assertion below names the PROPERTY it holds in its comment, so re-pointing them at a different
// surface is mechanical.
//
// ── PINNED INTERPRETATIONS (stated, not smuggled — `24 §3b`) ───────────────────────────────────
//
//  1. **The URL vocabulary is NOT in the corpus.** `18 §10` names the transports ("TCP 9100 …
//     USB/serial") and no syntax for choosing one. `tcp://host:port`, `device:///dev/usb/lp0` and
//     `windows://ShareName` are the shapes this suite was briefed with, and they are an
//     interpretation. What IS corpus is that the choice is a CONFIGURATION and that a configuration
//     the product cannot read must be refused and reported rather than guessed (`03-F51`,
//     `00 §5.7`). Tests below are written so that the *properties* survive a different syntax —
//     only §A's literals would move.
//  2. **`windows://` is not asserted to WORK.** No Windows host exists here, and refusing it on
//     Linux with a named reason is as honest as accepting it (`00 §5.7`). So §A asserts only that a
//     supported form is DECIDED — never silently ignored — and §F asserts the operator is told
//     which. Whether a Windows share prints is K-8 on Windows, and it is in DEFERRED.
//  3. **`send()` must produce `03-F40` evidence, not just write bytes.** A socket accepts bytes
//     from a printer that is offline holding a paper-out (`03-F40`: the sensor takes it offline and
//     real-time commands are answered "while offline by design"), so "the write succeeded" is not
//     "the ticket printed". If a transport cannot report `stalled`, `03-F41`'s state is unreachable
//     for every 9100 printer and a paper-out is marked `printed` — the silent KOT failure `03-F5`
//     forbids. §E asserts it; the alternative (the spooler pre-flighting `status()` itself) is not
//     available, because `createSpooler` ships and does not.
//
// ── WHAT THIS SUITE IS NOT ─────────────────────────────────────────────────────────────────────
//
// **IT DOES NOT CLOSE K-8 AND NO ASSERTION IN IT MAY BE READ AS IF IT DID.** A `node:net` listener
// on 127.0.0.1 is not a printer: it has no head, no cutter, no roll and no firmware, it answers
// exactly the bytes this file tells it to, and it never runs out of paper on its own. Everything
// below is about a SOCKET and a FILE. Whether a TM-T88 answers `DLE EOT 4` the way `03-F40`
// describes, whether the cutter cuts where the bytes say, and whether any of it is legible
// (`27-F35`'s ≥85% comprehension gate) are `03-F10` rig questions against hardware that does not
// exist here. A green run of this file is evidence that the LINK is correct, and evidence about
// nothing on the other end of it.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSpooler,
  MAX_TRANSMIT_ATTEMPTS,
  PAPER_STATUS_QUERY,
  printerCapability,
  REALTIME_QUERY_CAP,
  RETRY_WINDOW_MS,
  type Spooler,
} from "@restos/escpos";
import type { DeviceStore } from "@restos/sync-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PRINT_TO_FILE_ENV, printerTransport } from "../file-printer";
import { describePrinterLink, PRINTER_LINK_ENV, resolvePrinterLink } from "../printer-link";
import { createKotPrinter, type KotPrinterDeps } from "../printing";

const CAPABILITY = printerCapability("TH230");

// ── the probe document ─────────────────────────────────────────────────────────────────────────

const ascii = (text: string): number[] => [...text].map((ch) => ch.charCodeAt(0));

/**
 * A document chosen so that a "helpful" transform CANNOT survive it. ESC/POS is a byte protocol
 * and every byte below is one an implementation might damage on the way out:
 *
 *   `0x00`      — a C-string or a `String(…)` round trip truncates here.
 *   `0x80 0xff` — any `toString()` / `Buffer.from(string)` pass re-encodes these to two bytes.
 *   `0xc3 0x28` — an INVALID UTF-8 sequence: a decode/encode round trip replaces it with U+FFFD.
 *   `0x0d 0x0a` and a lone `0x0a` — a stream opened in TEXT mode rewrites line endings, which is
 *                the classic Windows raw-print defect and would silently move every cut position.
 *
 * It deliberately contains NO `10 04 04` (`03-F40`'s real-time query), so the fake printer below
 * cannot mistake the document's own bytes for a status request. That collision is real on
 * hardware — `03-F42` names it for raster data — and it belongs to the encoder (`GS ( D`), not
 * here; see DEFERRED.
 */
const PROBE = Uint8Array.from([
  0x1b,
  0x40, // ESC @
  0x00,
  0x80,
  0xff,
  0xfe,
  0xc3,
  0x28,
  0x0d,
  0x0a,
  0x0a,
  ...ascii("KOT 142 · GRILL"),
  0x0a,
  0x1d,
  0x56,
  0x00, // GS V 0 — the cut (`03-F42`)
]);

/**
 * A well-formed minimal document — `ESC @`, text, `LF`, `GS V 0`.
 *
 * `PROBE` is deliberately hostile and is the right instrument for a link that must not INTERPRET
 * what it carries. `filePrinter` interprets: it renders a page through `simulate()`, so it answers
 * `link_error` on bytes that are not a document (measured — the first draft of §F asserted `PROBE`
 * through it and failed for that reason and not for the reason it was testing). Where the
 * assertion is about the SELECTOR rather than the wire, the document is an ordinary one.
 */
const PLAIN = Uint8Array.from([0x1b, 0x40, ...ascii("KOT 142"), 0x0a, 0x1d, 0x56, 0x00]);

/**
 * 24 MiB, and the size is load-bearing rather than arbitrary: §B's flush assertion needs a document
 * larger than the kernel's send + receive buffers on loopback (`tcp_wmem` and `tcp_rmem` maxima are
 * commonly 4 MiB and 6 MiB), or a transport that never waits for the wire would look identical to
 * one that does. It is a PROBE and not a realistic ticket.
 */
const LONG = (() => {
  const bytes = new Uint8Array(24 * 1024 * 1024);
  bytes.fill(0xa5);
  bytes.set(Uint8Array.from([0x1b, 0x40]), 0);
  bytes.set(Uint8Array.from([0x1d, 0x56, 0x00]), bytes.length - 3);
  return bytes;
})();

// ── byte-level assertions ──────────────────────────────────────────────────────────────────────

/** A view, never a copy: these searches run over documents measured in megabytes. */
const view = (bytes: Uint8Array): Buffer =>
  Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/** Where `needle` appears CONTIGUOUSLY in `haystack`, or -1. Contiguity is `03-F42`. */
const runIndex = (haystack: Uint8Array, needle: Uint8Array): number =>
  view(haystack).indexOf(view(needle));

const countRuns = (haystack: Uint8Array, needle: Uint8Array): number => {
  const hay = view(haystack);
  const pin = view(needle);
  let found = 0;
  for (let at = hay.indexOf(pin); at !== -1; at = hay.indexOf(pin, at + pin.length)) found += 1;
  return found;
};

/**
 * Everything on the wire that is NOT the document, as bytes.
 *
 * `03-F40` permits real-time queries (three bytes, `DLE …`) around a document and `03-F42` permits
 * nothing else inside one. So the leftovers are asserted to be whole real-time sequences and never
 * a framing header, a length prefix, a chunk boundary marker or a trailing newline somebody added.
 */
const bytesAround = (received: Uint8Array, document: Uint8Array, at: number): number[] => [
  ...received.subarray(0, at),
  ...received.subarray(at + document.length),
];

// ── the fake printer: a real TCP listener that answers `03-F40`'s query ────────────────────────

type FakePrinter = {
  /** `tcp://127.0.0.1:<port>` — the address a `tcp` link is pointed at. */
  readonly url: string;
  readonly port: number;
  /** Everything written to us, across every connection, in arrival order. */
  readonly received: () => Uint8Array;
  /** Answer every outstanding and every future real-time query with this byte. */
  readonly answer: (byte: number) => void;
  /** Stop answering — a printer that is reachable and says nothing (`03-F40`'s silence). */
  readonly goSilent: () => void;
  /** Resume reading after `pauseReads` — TCP backpressure released. */
  readonly release: () => void;
  readonly close: () => Promise<void>;
};

type FakeOptions = {
  /** The `DLE EOT 4` response byte. `null` = a printer that answers nothing at all. */
  readonly answer?: number | null;
  /** Never read from the socket, so the transport's own write cannot complete. */
  readonly pauseReads?: boolean;
  /** Destroy the connection the moment any byte arrives — a mid-write socket error. */
  readonly resetOnFirstData?: boolean;
};

const startFakePrinter = async (options: FakeOptions = {}): Promise<FakePrinter> => {
  let answerByte: number | null = options.answer ?? null;
  const chunks: Buffer[] = [];
  const live: { socket: Socket; unanswered: number }[] = [];
  /** A rolling two-byte tail, so a query split across two TCP segments is still seen. */
  let tail = Buffer.alloc(0);

  const flush = (): void => {
    if (answerByte === null) return;
    for (const conn of live) {
      while (conn.unanswered > 0) {
        conn.socket.write(Uint8Array.from([answerByte]));
        conn.unanswered -= 1;
      }
    }
  };

  const server: Server = createServer((socket) => {
    const conn = { socket, unanswered: 0 };
    live.push(conn);
    socket.on("error", () => {
      /* a transport that closes its socket first is not a test failure */
    });
    if (options.pauseReads === true) socket.pause();
    socket.on("data", (chunk: Buffer) => {
      if (options.resetOnFirstData === true) {
        socket.destroy();
        return;
      }
      chunks.push(chunk);
      const window = Buffer.concat([tail, chunk]);
      conn.unanswered += countRuns(window, PAPER_STATUS_QUERY);
      tail = window.subarray(Math.max(0, window.length - (PAPER_STATUS_QUERY.length - 1)));
      flush();
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no ephemeral port");
  const port = address.port;

  return {
    url: `tcp://127.0.0.1:${port}`,
    port,
    received: () => new Uint8Array(Buffer.concat(chunks)),
    answer: (byte) => {
      answerByte = byte;
      flush();
    },
    goSilent: () => {
      answerByte = null;
    },
    release: () => {
      for (const conn of live) conn.socket.resume();
    },
    close: async () => {
      for (const conn of live) conn.socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
};

/** A port with nothing on it: bound, its number kept, then closed. */
const deadPort = async (): Promise<number> => {
  const printer = await startFakePrinter();
  const { port } = printer;
  await printer.close();
  return port;
};

const linkTo = (configured: string | undefined) =>
  resolvePrinterLink({ configured, capability: CAPABILITY });

const settle = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// ── a directory for the `device://` form ───────────────────────────────────────────────────────

let directory = "";
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "restos-link-"));
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §A RESOLUTION — one key decides, and a value that was SET is never silently ignored (03-F51,
//    00 §5.7). The dangerous implementation is four characters long: `if (!url?.startsWith("tcp"))
//    return unattachedPrinter(cap)`. It is correct on the happy path, and on a typo it hands the
//    operator a print-failure band that says the printer did not answer — sending them to check a
//    cable for a mistake in a setting. `00 §5.7` forbids exactly that: a guess presented as
//    configuration.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("§A 03-F51/00 §5.7 — the link is CONFIGURED, and an unreadable setting is refused", () => {
  it("03-F51 — with nothing set the link is `default` and behaves as this device does today", async () => {
    // "Existing behaviour is unchanged" has to mean the OUTCOME, not the code path: with no printer
    // this device reports `no_response` on every transmit, which is what drives `03-F4`'s budget to
    // exhaustion and puts `03-F5`'s band on the counter within 45 s. That band is the honest signal
    // that no printer is attached, and a resolver that quietly changed it would remove the one
    // thing telling an operator the truth (`file-printer.ts` makes the same argument at length).
    const link = linkTo(undefined);
    expect(link.source).toBe("default");
    expect(link.verdict.ok).toBe(true);
    await expect(link.transport.send(PROBE)).resolves.toEqual({
      ok: false,
      state: "failed",
      reason: "no_response",
      model_id: "TH230",
    });
  });

  it("03-F51 — an EMPTY value is not a configuration and does not turn a link on", async () => {
    // `RESTOS_…=` in a shell profile is an unset variable that is present. `file-printer.ts` has
    // this exact test for `RESTOS_PRINT_TO_FILE`; the hazard here is worse, because selecting on
    // presence alone would point a printer at the empty string and report a link.
    for (const raw of ["", "   "]) {
      const link = linkTo(raw);
      expect(link.source, `"${raw}" was read as a configuration`).toBe("default");
      expect((await link.transport.send(PROBE)).ok).toBe(false);
    }
  });

  it("03-F1/18 §10 — each supported form resolves to a link, and none is reported as `default`", async () => {
    // THE ROUND-3 CASE FOR THIS SECTION. A resolver that understands `tcp://` and falls through on
    // everything else passes every other test in this file, because every other test uses `tcp`.
    // `18 §10` names three transport families; a value naming one of them and being ignored is the
    // silent half of `00 §5.7`.
    const printer = await startFakePrinter({ answer: 0x00 });
    try {
      const forms = [printer.url, `device://${join(directory, "lp0")}`, "windows://KitchenPrinter"];
      for (const configured of forms) {
        const link = linkTo(configured);
        expect(link.source, `"${configured}" was silently ignored`).not.toBe("default");
      }
      // The two forms this host can actually carry are ACCEPTED. `windows://` is deliberately not
      // asserted either way (pinned interpretation 2) — refusing it on Linux with a named reason is
      // as honest as accepting it, and only a Windows host can tell.
      expect(linkTo(printer.url).source).toBe("configured");
      expect(linkTo(`device://${join(directory, "lp0")}`).source).toBe("configured");
    } finally {
      await printer.close();
    }
  });

  it("03-F51/00 §5.7 — a malformed value is REFUSED with a reason, and never guessed", async () => {
    // `03-F51`: a refused configuration "is simply not applied … and the refusal is reported at
    // length wherever the configuration was made", falling back to the LOUD default. So three
    // things at once: refused, reported, and still not silent about the printer.
    const malformed = ["grill printer", "tcp://", "://127.0.0.1:9100", "smoke-signal://grill"];
    for (const configured of malformed) {
      const link = linkTo(configured);
      expect(link.source, `"${configured}" was not refused`).toBe("refused");
      expect(link.verdict.ok).toBe(false);
      if (link.verdict.ok) throw new Error("unreachable — narrowing only");
      expect(link.verdict.reason.length, "a refusal with no reason is a guess").toBeGreaterThan(0);
      // …and the fallback is the loud one, never a transport that claims to have printed.
      const outcome = await link.transport.send(PROBE);
      expect(outcome.ok, `"${configured}" produced a transport that reports success`).toBe(false);
      expect(outcome).toMatchObject({ state: "failed" });
    }
  });

  it("01-F17/03-F51 — no configuration value, however bad, throws or blocks the app", () => {
    // "A refused configuration never blocks a sale and never blocks the app." `resolvePrinterLink`
    // runs at boot, so a throw here is a till that will not start over a typo in a setting whose
    // whole purpose is to stop the product being precious about hardware.
    const garbage = [
      undefined,
      "",
      "tcp://",
      "tcp://:::::",
      "tcp://127.0.0.1:not-a-port",
      "device://",
      "windows://",
      " ",
      "tcp://127.0.0.1:9100 ; rm -rf /",
      "🖨️",
      "x".repeat(10_000),
    ];
    for (const configured of garbage) {
      expect(() => linkTo(configured), `"${String(configured)}" threw at resolve`).not.toThrow();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §B THE BYTES ARRIVE UNMODIFIED. ESC/POS is a byte protocol and a "helpful" transform IS the
//    defect: `03-F42` makes a document ONE transmitted unit, and `03-F36` already bans the two
//    layout tricks that survive re-encoding. A transport that re-encodes, reorders, chunks lossily
//    or drops a trailing byte produces a ticket that looks nearly right, which is worse than one
//    that fails.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("§B 03-F42 — the document reaches the wire as ONE unit, byte for byte", () => {
  it("03-F42 — every byte arrives, in order, contiguously, and nothing is added", async () => {
    // THE DANGEROUS IMPLEMENTATIONS, each killed by a specific byte of `PROBE`:
    //   `socket.write(Buffer.from(doc).toString())`      → 0x80/0xff/0xfe expand; 0xc3 0x28 → U+FFFD
    //   `socket.write(doc.join(""))` / a text-mode fd    → 0x0d 0x0a rewritten, the cut moves
    //   a C-string path                                  → truncated at 0x00
    //   a chunker that forgets its remainder             → the trailing `GS V 0` never arrives
    // and the contiguity check kills a framing header, a length prefix or a trailing newline.
    const printer = await startFakePrinter({ answer: 0x00 });
    try {
      const link = linkTo(printer.url);
      const outcome = await link.transport.send(PROBE);
      expect(outcome).toEqual({ ok: true });

      const received = printer.received();
      const at = runIndex(received, PROBE);
      expect(at, "the document did not arrive as one contiguous run of bytes").not.toBe(-1);

      const extra = bytesAround(received, PROBE, at);
      // `03-F40` permits real-time queries around a document (three bytes, `DLE …`). Nothing else
      // may be on the wire — and nothing at all may be INSIDE the run, which `runIndex` already
      // decides by matching contiguously.
      expect(extra.length % 3, `unexpected bytes on the wire: ${extra.join(",")}`).toBe(0);
      for (let i = 0; i < extra.length; i += 3) expect(extra[i]).toBe(0x10);
    } finally {
      await printer.close();
    }
  });

  it("03-F5/03-F4 — `ok` is not reported until the printer has taken the bytes", async () => {
    // `file-printer.ts` states this property for the disk and the argument is the same here: "a
    // transport that answered `ok` and then failed to write would mark the job `printed` in the
    // durable spool (03-F4) with nothing to show for it, which is the silent KOT failure 03-F5
    // forbids". A 9100 socket is where it is easiest to get wrong, because `write()` returns
    // instantly into a buffer the printer has not seen.
    //
    // The printer never reads until `release()`, so TCP backpressure holds the write open. If your
    // transport has a per-attempt deadline shorter than 250 ms this test will fail — that is a
    // FINDING for this file's owner, not a reason to weaken it: `03-F4`'s budget is 30 s across
    // three attempts and a ten-line KOT takes ~150 ms of print time on its own (03-F43).
    const printer = await startFakePrinter({ answer: 0x00, pauseReads: true });
    try {
      const link = linkTo(printer.url);
      let settled = false;
      const inFlight = link.transport.send(LONG).then((outcome) => {
        settled = true;
        return outcome;
      });
      await settle(250);
      expect(settled, "the transport reported a transmit the printer has not taken").toBe(false);

      printer.release();
      expect(await inFlight).toEqual({ ok: true });
      const received = printer.received();
      expect(received.length, "bytes were dropped once the link unblocked").toBeGreaterThanOrEqual(
        LONG.length,
      );
      expect(runIndex(received, LONG), "the long document did not arrive intact").not.toBe(-1);
    } finally {
      await printer.close();
    }
  });

  it("03-F42 — a `device://` link writes the same bytes to the character device", async () => {
    // The USB path `18 §10` names ("USB/serial … Electron main"), in the form a Linux till meets it
    // — `/dev/usb/lp0` is written like a file. A regular file stands in for the node here, which is
    // exactly what makes the byte assertion possible and exactly what makes it NOT hardware.
    const path = join(directory, "lp0");
    const link = linkTo(`device://${path}`);
    expect(link.source).toBe("configured");
    expect(await link.transport.send(PROBE)).toEqual({ ok: true });
    const written = new Uint8Array(readFileSync(path));
    expect(runIndex(written, PROBE), "the device node did not get the document's bytes").not.toBe(
      -1,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §C FAILURE IS CLASSIFIED, NEVER THROWN. `classifyTransmit` (K-3) owns the evidence→outcome
//    decision — `unattachedPrinter` and `filePrinter` both take their outcome from it and say why:
//    "this seam must not be able to drift from K-3's classifier". A transport that REJECTS is worse
//    than one that classifies wrongly: `spooler.pump()` awaits `send`, so a rejection takes every
//    other job in the queue with it and `03-F5`'s band never appears at all.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("§C 03-F5/01-F17 — a dead printer is an OUTCOME, never an exception", () => {
  it("03-F5 — a refused connection is a NAMED link error, not silence", async () => {
    // `classifyTransmit`'s own order: "Silence loses to a named link error … an S1 band that says
    // `no_response` when the socket reported `EPIPE` sends someone to the wrong layer." ECONNREFUSED
    // is a name: the link worked and the printer said no. `no_response` is reserved for the printer
    // that is reachable and mute — which is `unattachedPrinter`'s answer and reads to an operator as
    // "there is no printer here". Full equality, because a literal outcome assembled in the
    // transport instead of by `classifyTransmit` is the "two interpretations of one fact" defect
    // `03-F40` is this corpus's worked example of.
    const port = await deadPort();
    const outcome = await linkTo(`tcp://127.0.0.1:${port}`).transport.send(PROBE);
    expect(outcome).toEqual({
      ok: false,
      state: "failed",
      reason: "link_error",
      model_id: "TH230",
    });
  });

  it("03-F5 — an unresolvable host is a link error, and never a rejected promise", async () => {
    // `.invalid` cannot resolve (RFC 6761), so this is DNS failing rather than a printer failing.
    // The property is the same one: the transport answers, it names the layer, and `03-F4`'s budget
    // gets to advance. A transport that let the error escape would take the whole pump down.
    const outcome = await linkTo("tcp://kitchen-printer.invalid:9100").transport.send(PROBE);
    expect(outcome.ok).toBe(false);
    expect(outcome).toMatchObject({ state: "failed", reason: "link_error", model_id: "TH230" });
  });

  it("03-F5/03-F41 — a socket that dies MID-WRITE fails, and is never read as a stall", async () => {
    // The distinction `03-F41` is written about, in the case that produces it by accident: a
    // half-written document is a ticket that did not print, and the printer is not holding it. A
    // transport that answered `stalled` here would park the job outside `03-F4`'s budget for ever —
    // no retry, no exhaustion, no band. That is a silent KOT failure reached by the one route
    // `03-F5` cannot see.
    const printer = await startFakePrinter({ resetOnFirstData: true });
    try {
      const outcome = await linkTo(printer.url).transport.send(LONG);
      expect(outcome.ok, "a document the printer never received was reported as printed").toBe(
        false,
      );
      expect(outcome).toMatchObject({ state: "failed" });
    } finally {
      await printer.close();
    }
  });

  it("03-F4/03-F5 — an unreachable address SETTLES inside the retry window", async () => {
    // The only bound the corpus fixes is `03-F4`'s own: "3 attempts over 30 s". A transport that can
    // hang for ever is the worst outcome available here — the job never leaves `transmitting`, the
    // budget never exhausts, `03-F5`'s band never comes up, and the counter shows nothing at all
    // while the kitchen gets nothing at all. No per-attempt deadline is asserted (the corpus fixes
    // none — see DEFERRED); what is asserted is that one exists.
    //
    // ⚠ A transport with NO deadline fails this as a vitest TIMEOUT rather than on the assertion
    // below (measured: the run ends at the 60 s suite timeout, because the OS gives up on an
    // unroutable address long after `03-F4`'s window has closed). That is the right verdict wearing
    // the wrong hat — read a timeout here as "one transmit attempt never ended".
    const started = Date.now();
    const outcome = await linkTo("tcp://10.255.255.1:9100").transport.send(PROBE);
    expect(Date.now() - started, "one attempt outlived 03-F4's whole retry window").toBeLessThan(
      RETRY_WINDOW_MS,
    );
    expect(outcome.ok).toBe(false);
    expect(outcome).toMatchObject({ state: "failed" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §D THE BUDGET AND THE BAND STILL WORK THROUGH THIS TRANSPORT. Every assertion above is about one
//    `send`; this section is the product: `order.confirmed` → `render()` → the durable spooler →
//    three attempts → `03-F5`'s S1 and `kot.print_failed`. A transport can be individually correct
//    and still break this, by classifying a dead printer as `stalled` — which is not a failure, so
//    the budget never spends and the alert `03-F5` requires is never raised.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const ORDER_ID = "0199aaaa-0000-7000-8000-00000000abcd";
const TICKET = ORDER_ID.slice(0, 8);
const CONFIRM_AT = 1_754_300_000_000;

const stubStore = (): Pick<DeviceStore, "openOrders" | "kitchenQueue"> =>
  ({
    openOrders: () => [
      {
        order_id: ORDER_ID,
        channel: "counter",
        table_ids_json: "[]",
        json_lines: JSON.stringify({
          "line-a": {
            item_id: "i-karahi",
            qty: 2,
            unit_price_paisa: 45_000,
            states: ["confirmed"],
          },
        }),
        pay_total: 0,
      },
    ],
    kitchenQueue: () => [{ order_id: ORDER_ID, age_basis: CONFIRM_AT, channel: "counter" }],
  }) as unknown as Pick<DeviceStore, "openOrders" | "kitchenQueue">;

type Rig = {
  printer: ReturnType<typeof createKotPrinter>;
  spooler: Spooler;
  appended: { type: string; payload: Record<string, unknown> }[];
};

const rig = (configured: string | undefined): Rig => {
  const spooler = createSpooler({ transport: linkTo(configured).transport });
  const appended: { type: string; payload: Record<string, unknown> }[] = [];
  const deps: KotPrinterDeps = {
    spooler,
    store: stubStore(),
    catalog: () => ({ name: "Chicken Karahi" }),
    station: () => "GRILL",
    capability: CAPABILITY,
    append: (type, payload) => {
      appended.push({ type, payload });
    },
  };
  return { printer: createKotPrinter(deps), spooler, appended };
};

describe("§D 03-F4/03-F5 — the retry budget and the band, through a real link", () => {
  it("03-F4/03-F5 — a printer that refuses the connection exhausts the budget and BANDS", async () => {
    const port = await deadPort();
    const r = rig(`tcp://127.0.0.1:${port}`);
    r.printer.confirmed(ORDER_ID);
    for (let i = 0; i < MAX_TRANSMIT_ATTEMPTS; i += 1) await r.printer.pump();

    const job = r.spooler.jobs()[0];
    // `failed`, not `stalled`: a stall "never counts toward the 3-attempt budget", so a transport
    // that mapped a dead socket onto it would hold this job outside the budget for ever.
    expect(job?.state, "a dead 9100 link did not reach 03-F4's terminal failure").toBe("failed");
    expect(job?.attempts).toBe(MAX_TRANSMIT_ATTEMPTS);

    const alarms = r.printer.alarms();
    expect(alarms, "03-F5's alert did not appear for an unreachable printer").toHaveLength(1);
    const shown = `${alarms[0]?.message} ${alarms[0]?.subject}`;
    expect(shown).toContain(TICKET);
    expect(shown).toContain("TH230");

    const failed = r.appended.filter((event) => event.type === "kot.print_failed");
    expect(failed).toHaveLength(1);
    expect(r.appended.filter((event) => event.type === "kot.printed")).toHaveLength(0);
  });

  it("03-F4/01-F17 — a printer that ANSWERS prints once, bands never, and takes real bytes", async () => {
    // The control for the row above: without it, every assertion in §D is satisfied by a transport
    // that fails unconditionally, which is the shipped `unattachedPrinter` wearing a URL.
    const printer = await startFakePrinter({ answer: 0x00 });
    try {
      const r = rig(printer.url);
      r.printer.confirmed(ORDER_ID);
      await r.printer.pump();

      expect(r.spooler.jobs()[0]?.state).toBe("printed");
      expect(r.printer.alarms()).toHaveLength(0);
      expect(r.appended.filter((event) => event.type === "kot.printed")).toHaveLength(1);
      // …and what reached the wire is the ticket, not a placeholder: the rendered KOT names the
      // dish, so the bytes carry it (`03-F3`, and K-4's "never varied `data`" lesson one layer up).
      const received = Buffer.from(printer.received()).toString("latin1");
      expect(received).toContain("Chicken Karahi");
      expect(received).toContain(TICKET);
    } finally {
      await printer.close();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §E `status()` — 03-F40's REAL-TIME QUERY, WITH 03-F40's MAP. This is the section a stub passes
//    unless every assertion is pointed at the dangerous case: `filePrinter.status()` returns a
//    literal `{ paper_out: false }` and is CORRECT to (a file has no roll), so an implementer
//    copying it into a 9100 transport produces a printer that can never be out of paper — which is
//    `03-F40`'s named defect ("reports 'paper present' forever") reached from the other side.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const GS_R = Uint8Array.from([0x1d, 0x72]);

describe("§E 03-F40/03-F41 — the paper sensor is ASKED, and read with the right map", () => {
  it("03-F40 — `status()` asks with `DLE EOT 4` and never with `GS r`", async () => {
    // The whole of `03-F40`'s first sentence. A `GS r` health check is not merely a different
    // opcode: an offline printer "does not execute `GS r` at all", so the reading can never become
    // bad and a paper-out becomes a silent KOT failure. `PAPER_STATUS_QUERY` is IMPORTED from
    // `@restos/escpos` — a hand-copied three bytes here would be K-3's dead-oracle defect, and two
    // copies of one fact drifting is `03-F40`'s own worked example.
    const printer = await startFakePrinter({ answer: 0x00 });
    try {
      await linkTo(printer.url).transport.status();
      const received = printer.received();
      expect(
        runIndex(received, PAPER_STATUS_QUERY),
        "status() did not send 03-F40's real-time query",
      ).not.toBe(-1);
      expect(runIndex(received, GS_R), "status() used `GS r`, which 03-F40 forbids").toBe(-1);
    } finally {
      await printer.close();
    }
  });

  it("03-F40 — bits 5,6 are paper-out; bits 2,3 are NOT (the two incompatible maps)", async () => {
    // THE TRAP, STATED IN THE FR: "`DLE EOT 4`: bits 2,3 near-end / 5,6 out; `GS r 1`: bits 0,1 /
    // 2,3". `0b0000_1100` is paper-out under `GS r`'s map and NEAR-END under this one. An
    // implementation holding the wrong map answers `paper_out: true` to a printer with paper — and
    // the shipped spooler then parks the job at `stalled` for ever, outside the budget, with no
    // band. Both directions are asserted, because either alone is satisfied by a constant.
    const out = await startFakePrinter({ answer: 0b0110_0000 });
    try {
      expect((await linkTo(out.url).transport.status()).paper_out).toBe(true);
    } finally {
      await out.close();
    }

    const nearEndBits = await startFakePrinter({ answer: 0b0000_1100 });
    try {
      const status = await linkTo(nearEndBits.url).transport.status();
      expect(status.paper_out, "bits 2,3 were decoded with `GS r`'s map").toBe(false);
      // `03-F40` model-gates near-end from the capability record, and every shipped row is `false`
      // (an under-claim, not a measurement). So the honest answer is "unsupported" — a warning that
      // could never fire is the same shape as a reading that can never become bad.
      expect(status.near_end).toBe("unsupported");
    } finally {
      await nearEndBits.close();
    }
  });

  it("03-F41/03-F5 — a paper-out during a transmit is a STALL, not a success and not a failure", async () => {
    // THE SHARPEST CASE IN THIS FILE. A 9100 socket accepts the document from a printer that is
    // OFFLINE holding a paper-out — `03-F40` says the sensor takes it offline and that real-time
    // commands are answered "while offline by design" — so "the write succeeded" is not "the ticket
    // printed". Three outcomes are available and two are defects:
    //   `ok: true`   → the job is marked `printed`, the chit is lost, nothing is ever said (03-F5).
    //   `failed`     → `03-F4` retries and "double-prints the instant the roll is loaded" (03-F41),
    //                  and a duplicate KOT is a real kitchen error.
    //   `stalled`    → the printer is holding the job. Correct.
    const printer = await startFakePrinter({ answer: 0b0110_0000 });
    try {
      const outcome = await linkTo(printer.url).transport.send(PROBE);
      expect(outcome.ok, "a paper-out transmit was reported as printed").toBe(false);
      expect(outcome).toMatchObject({ state: "stalled", reason: "paper_out", model_id: "TH230" });
    } finally {
      await printer.close();
    }
  });

  it("03-F41 — a stalled job is held, never re-sent, and released when the roll comes back", async () => {
    // `03-F41` end to end, through the SHIPPED spooler: "a stall never counts toward the 3-attempt
    // budget and never re-transmits". The re-transmit half is the one that costs a restaurant a
    // duplicate ticket, and it is only observable on a wire.
    const printer = await startFakePrinter({ answer: 0b0110_0000 });
    try {
      const r = rig(printer.url);
      r.printer.confirmed(ORDER_ID);
      for (let i = 0; i < MAX_TRANSMIT_ATTEMPTS + 1; i += 1) await r.printer.pump();

      expect(r.spooler.jobs()[0]?.state).toBe("stalled");
      expect(r.spooler.jobs()[0]?.attempts, "a stall spent 03-F4's budget").toBe(0);
      expect(r.printer.alarms(), "a held job raised 03-F5's band").toHaveLength(0);

      const cut = Uint8Array.from([0x1d, 0x56, 0x00]);
      expect(countRuns(printer.received(), cut), "the held document was transmitted twice").toBe(1);

      // The roll is replaced. The next pump releases the job, and STILL does not re-transmit.
      printer.answer(0x00);
      await r.printer.pump();
      expect(r.spooler.jobs()[0]?.state).toBe("printed");
      expect(countRuns(printer.received(), cut), "the released job was printed twice").toBe(1);
    } finally {
      await printer.close();
    }
  });

  it("03-F41/03-F40 — a printer that says NOTHING does not release a held job", async () => {
    // "Silence is NOT health" (`checkPrinterHealth`'s own words, from `03-F34`'s hard-refusal rule).
    // The shipped spooler releases a stalled job on `!status.paper_out` and marks it PRINTED, so a
    // `status()` that answers `paper_out: false` when the printer answered nothing at all reports a
    // ticket as printed on the strength of a printer that is not there. The FR's hold ends when the
    // roll is replaced — not when the link goes quiet.
    const printer = await startFakePrinter({ answer: 0b0110_0000 });
    try {
      const r = rig(printer.url);
      r.printer.confirmed(ORDER_ID);
      await r.printer.pump();
      expect(r.spooler.jobs()[0]?.state).toBe("stalled");

      printer.goSilent();
      await r.printer.pump();
      expect(r.spooler.jobs()[0]?.state, "a silent printer released a held job").toBe("stalled");
    } finally {
      await printer.close();
    }
  });

  it("03-F40 — outstanding real-time queries are capped at 4", async () => {
    // `03-F40`, verbatim: "Cap outstanding real-time queries at **4**." `packages/escpos` ships
    // `createRealtimeQueryWindow` carrying an owed marker that names its caller — "the first real
    // transport owes this its caller, or the cap is a number in a file" — and this is that
    // transport. The cap is asserted on the WIRE, so any mechanism satisfies it: a window, a
    // semaphore, or simply never having two queries in flight.
    const printer = await startFakePrinter();
    try {
      const transport = linkTo(printer.url).transport;
      const pending = Array.from({ length: REALTIME_QUERY_CAP + 2 }, () => transport.status());
      const settled = Promise.allSettled(pending);
      await settle(250);
      expect(
        countRuns(printer.received(), PAPER_STATUS_QUERY),
        "more than 03-F40's cap of outstanding real-time queries reached the printer",
      ).toBeLessThanOrEqual(REALTIME_QUERY_CAP);
      printer.answer(0x00);
      await settled;
    } finally {
      await printer.close();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §F THE SEAM — the wave's named defect, which this repo has now recorded fourteen times: a
//    correct subsystem the product never reaches. `pnpm seams:check` cannot close it here (Rule A
//    sees an export that IS reached; Rule B asks whether an optional member was SUPPLIED, never
//    whether what was supplied is real), so these are the hand-written assertions.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("§F 18 §10/00 §5.7 — the product reaches the link, and says which one it has", () => {
  it("18 §10 — `printerTransport` honours the key, so `main/index.ts` gets a real link", async () => {
    // BEHAVIOURAL, not a source read: `file-printer.test.ts` §D already pins that `main/index.ts`
    // builds the spooler with `printerTransport(…, process.env)`, so a transport this selector
    // resolves is a transport the product uses. A `resolvePrinterLink` that is perfect and unwired
    // is this wave's defect exactly, and it would leave every gate in the repo green.
    const printer = await startFakePrinter({ answer: 0x00 });
    try {
      const transport = printerTransport(CAPABILITY, { [PRINTER_LINK_ENV]: printer.url });
      expect(await transport.send(PROBE)).toEqual({ ok: true });
      expect(runIndex(printer.received(), PROBE)).not.toBe(-1);
    } finally {
      await printer.close();
    }
  });

  it("18 §10 — with the key unset, today's two transports are untouched", async () => {
    // "Unset ⇒ existing behaviour is unchanged" has two halves and only one of them is the default.
    // A resolver rewritten around a new key can drop the `RESTOS_PRINT_TO_FILE` branch without any
    // other test in this file noticing.
    await expect(printerTransport(CAPABILITY, {}).send(PLAIN)).resolves.toMatchObject({
      ok: false,
      reason: "no_response",
    });
    const outcome = await printerTransport(CAPABILITY, { [PRINT_TO_FILE_ENV]: directory }).send(
      PLAIN,
    );
    expect(outcome, "the file transport stopped being selectable").toEqual({ ok: true });
  });

  it("00 §5.7 — the boot line names the key, the link and any refusal", () => {
    // There is no UI for a printer setting (doc 14 owes it), so the boot line is the ONLY place a
    // refusal is reported — `03-F51`: "reported at length wherever the configuration was made".
    // Without it the refusal machinery in §A is decorative: the product would know its setting is
    // unreadable and tell nobody, which is the `00 §5.7` failure the whole section exists to stop.
    // Every other resolver in this app already has one (`describeStationRouting`,
    // `describePanelDensity`, `describeDeviceIdentity`, `describeAging`).
    const refused = describePrinterLink(linkTo("smoke-signal://grill"));
    expect(refused, "the boot line does not name the setting").toContain(PRINTER_LINK_ENV);
    expect(refused, "the boot line does not show what was rejected").toContain(
      "smoke-signal://grill",
    );

    // …and a link the operator DID configure is named too, including the one this host cannot
    // verify (pinned interpretation 2): `windows://` is the case where the boot line is the only
    // thing that can tell an operator what the till believes it is pointed at.
    expect(describePrinterLink(linkTo("windows://KitchenPrinter"))).toContain("KitchenPrinter");
    // The default says what is true of this device: no printer link at all.
    expect(describePrinterLink(linkTo(undefined)).length).toBeGreaterThan(0);
  });

  it("00 §5.7 — `main/index.ts` prints that boot line", () => {
    // A SOURCE READ, and a weak instrument — stated plainly, as `line-advance-seam.test.ts` §A and
    // `settlement-closer-seam.test.ts` already do here: `main/index.ts` builds an Electron app at
    // module scope and no suite in this package can import it. It is the only guard available on
    // "the operator is actually told", and one guard is better than the zero this seam has today.
    const source = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
    expect(source, "the printer link is resolved but never reported at boot").toMatch(
      /console\.log\s*\(\s*describePrinterLink\s*\(/,
    );
  });
});

// ── DEFERRED — what this suite could NOT assert, and who owns each ─────────────────────────────
//
// * **K-8, IN FULL. NO PRINTER HAS BEEN ATTACHED.** A loopback listener answers exactly the bytes
//   this file tells it to. Whether a TM-T88 or a BC-58U answers `DLE EOT 4` with the bits `03-F40`
//   describes, whether it holds a job on paper-end the way `03-F41` says (`ESC c 4`), whether the
//   cutter cuts where `GS V` lands, and whether `DLE ENQ n=2` recovers a cutter error are all
//   `03-F10` rig questions. **Every assertion in §E is about a byte this file chose.** Owner: K-8.
//
// * **`03-F42`'s TWO-SECOND RULE IS NOT ASSERTED.** "If data is interrupted for two seconds or more,
//   the printer automatically feeds to the reserved cut position and cuts" — so a transport that
//   stalls mid-document cuts a ticket in half. §B asserts the document arrives CONTIGUOUS and as one
//   unit, which is the property the FR asks the transport for; it does not assert that no two-second
//   gap can occur inside it, because the gap is produced by the network and the printer's own clock
//   and neither is observable from here. A rig test with a real head is the only instrument. Owner:
//   K-8 / `03-F10`.
//
// * **A REAL-TIME SEQUENCE OCCURRING INSIDE THE DOCUMENT.** `03-F42`: a `DLE …` sequence inside
//   raster data "is executed as a command and corrupts the image unless disabled via `GS ( D`".
//   `PROBE` deliberately contains no such sequence, so this suite is silent on it. It is the
//   ENCODER's to prevent (`packages/escpos`), not the transport's, and it has no assertion anywhere
//   today. Owner: K-2/K-4's test sessions.
//
// * **WHETHER `windows://` PRINTS.** No Windows host exists in this repo or in CI, and `18 §10`
//   puts the raw-write path on the platform this product actually ships to. §A asserts only that the
//   form is DECIDED rather than ignored; §F that the operator is told which link the till has. The
//   whole behaviour is unmeasured. Owner: K-8, on Windows.
//
// * **A PER-ATTEMPT DEADLINE.** The corpus fixes `03-F4`'s window ("3 attempts over 30 s") and no
//   per-attempt timeout. §C asserts only that one attempt settles inside the whole window, which is
//   the weakest bound that keeps `03-F5`'s band reachable. If a number is wanted it is a spec change
//   (commandment 9), not a test.
//
// * **PRECEDENCE BETWEEN THIS KEY AND `RESTOS_PRINT_TO_FILE`.** Both are transports and nothing in
//   the corpus says which wins when both are set. Deliberately unasserted — inventing an order here
//   would pin a behaviour by accident (commandment 2). What §F does assert is that neither key
//   erases the other's ordinary case. Owner: whoever writes the FR; note that a till which silently
//   simulated a printer it was configured to have would be `file-printer.ts`'s own named hazard.
//
// * **`03-F51`'s ROUTE IS A DIFFERENT QUESTION AND IS NOT RE-TESTED HERE.** A station routed
//   `screen` enqueues no job at all, so no transport is reached; that boundary is
//   `station-routing-seam.test.ts`'s. This file only ever exercises a station whose route is paper.
//
// * **NOTHING HERE IS EVIDENCE ABOUT LEGIBILITY.** `27-F35`'s ≥85% comprehension / ≤5%
//   critical-confusion gate is a post-training retest with real staff on thermal paper, and it is
//   OWED in full. A byte-identity assertion says the printer received what we sent. It says nothing
//   about whether a cook can read what came out.
