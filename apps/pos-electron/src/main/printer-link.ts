/**
 * `03-F1` / `18 §10` — **THE LINK BETWEEN THE SPOOLER AND A PRINTER, and it is the first one this
 * product has ever had.**
 *
 * Until this file existed the app shipped exactly two `SpoolerTransport`s and neither reached a
 * printer: `unattachedPrinter` (`main/printing.ts`), which reports `no_response` on every transmit
 * because that is the truth about a device with no link, and `filePrinter` (`main/file-printer.ts`),
 * a PDF simulator. `18 §10` names the transports — *"TCP 9100 (pure TS, all platforms), USB/serial
 * (Electron main …)"* — and `03-F1` names the same three families. This is the TCP one, plus the two
 * shapes a USB printer actually takes on the two platforms this app runs on.
 *
 * ══ WHAT THIS IS NOT — READ THIS BEFORE CITING IT AS EVIDENCE ═══════════════════════════════════
 *
 * **IT DOES NOT CLOSE K-8. NO PRINTER HAS BEEN ATTACHED TO ANY OF THIS.** Everything below has been
 * exercised against a `node:net` listener on loopback and a regular file. A listener has no head, no
 * cutter, no roll and no firmware; it answers exactly the bytes a test tells it to and it never runs
 * out of paper. Whether a TM-T88 or a BC-58U answers `DLE EOT 4` with the bits `03-F40` describes,
 * whether it holds a job on paper-end the way `03-F41` says (`ESC c 4`), whether the cutter cuts
 * where `GS V` lands, and whether any of it is legible (`27-F35`'s ≥85% comprehension gate) are all
 * `03-F10` rig questions against hardware that does not exist here. A green suite over this file is
 * evidence that the LINK is correct and evidence about nothing on the other end of it.
 *
 * ══ THE SHAPE — why this is a resolver and not a constructor ════════════════════════════════════
 *
 * `main/station-routing.ts`'s, deliberately: it is this app's existing precedent for a value
 * configured by environment whose REFUSAL must be reported rather than guessed. The dangerous
 * implementation here is four characters long —
 *
 *     if (!url?.startsWith("tcp")) return unattachedPrinter(capability);
 *
 * — which is correct on the happy path and, on a typo, hands the operator a print-failure band
 * saying the printer did not answer. That sends someone to check a cable for a mistake in a setting,
 * which is precisely the guess-presented-as-configuration `00 §5.7` forbids. So an unreadable value
 * is REFUSED, with a reason, and the boot line says so at length (`03-F51`: a refused configuration
 * *"is simply not applied … and the refusal is reported at length wherever the configuration was
 * made"* — and there is no UI for a printer setting, so the boot line is the only such place).
 *
 * A refusal never throws and never blocks (`01-F17`, commandment 4): this runs at boot, and a till
 * that will not start over a typo in a setting whose whole purpose is to stop the product being
 * precious about hardware is the harm inverted. The fallback is the LOUD one — `unattachedPrinter`,
 * whose failures reach `03-F5`'s band within 45 s — never a transport that claims to have printed.
 *
 * ══ THE VOCABULARY IS AN INTERPRETATION AND IS NAMED AS ONE (`24 §3b`) ══════════════════════════
 *
 * `18 §10` names the transports and **no syntax for choosing one**. `tcp://host:port`,
 * `device:///dev/usb/lp0` and `windows://ShareName` are this file's declared reading. What IS corpus
 * is that the choice is a CONFIGURATION (`00 §7` layer 3 — *"printer assignments"* are per branch or
 * device, never per org: one org runs many tills and each has its own cable) and that a
 * configuration the product cannot read is refused rather than guessed.
 *
 * ══ WHAT EACH FORM CAN AND CANNOT OBSERVE — the honest half ═════════════════════════════════════
 *
 * `tcp://` is the only one of the three with a BACK-CHANNEL, and that difference decides how much of
 * `03-F40`/`03-F41` is reachable:
 *
 *   * **`tcp://` asks the sensor.** After the document is on the wire, `DLE EOT 4` goes out and the
 *     answer decides the outcome. This is not decoration: a 9100 socket accepts every byte from a
 *     printer that is OFFLINE holding a paper-out (`03-F40`: the sensor takes it offline and
 *     real-time commands are answered *"while offline by design"*), so *"the write succeeded"* is
 *     not *"the ticket printed"*. Without the query a paper-out is reported as `printed`, the chit
 *     is lost and nothing is ever said — the silent KOT failure `03-F5` forbids.
 *   * **`device://` and `windows://` are WRITE-ONLY, so `03-F40` is unreachable on them.** A
 *     character device opened for writing and a Windows print share both take bytes and say nothing;
 *     reading the back-channel needs an ioctl (`usblp`) or a spooler API this product has no
 *     dependency for, and `18 §15` is not being spent on it here. **The consequence is stated rather
 *     than hidden: on those two forms a paper-out reads as a successful transmit**, exactly the
 *     failure `03-F40`'s first sentence is about, and the boot line says so in those words. Prefer
 *     `tcp://` wherever the printer has an Ethernet port.
 */

import { writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import {
  classifyTransmit,
  createRealtimeQueryWindow,
  decodePaperStatus,
  MAX_TRANSMIT_ATTEMPTS,
  PAPER_STATUS_QUERY,
  type PaperStatus,
  type PrinterCapability,
  RETRY_WINDOW_MS,
  type SpoolerTransport,
  type TransmitEvidence,
} from "@restos/escpos";
import { unattachedPrinter } from "./printing";

/**
 * `00 §7` layer 3 — the one key, per DEVICE.
 *
 * Layer 3 and not layer 2 for `panel_ppi`'s reason one cable over: an org runs many tills, and the
 * printer one of them is plugged into is a fact about that machine. `03 §7` already puts *"printer
 * assignments"* in the branch/device layer.
 */
export const PRINTER_LINK_ENV = "RESTOS_PRINTER";

/** `03-F1` / `18 §10`, verbatim: *"TCP port 9100"*. Applied where the value names no port. */
const DEFAULT_TCP_PORT = 9100;

/**
 * How long ONE transmit attempt may take, DERIVED rather than typed.
 *
 * The corpus fixes no per-attempt deadline and `03-F4` fixes the whole window — *"3 attempts over
 * 30 s"* — so a share of that window is the only number the corpus can be said to imply, and it is
 * the same derivation `PUMP_INTERVAL_MS` already makes in `main/printing.ts`. **A transport with no
 * deadline at all is the worst outcome available here**: the job never leaves `transmitting`, the
 * budget never exhausts, `03-F5`'s band never appears, and the counter shows nothing while the
 * kitchen gets nothing. (The OS gives up on an unroutable address long after 30 s.)
 *
 * It must also be comfortably LONGER than a real document takes: TCP backpressure holds a write open
 * while the head prints, and `03-F43` puts a ten-line KOT at ~150 ms of print time on its own.
 */
const TRANSMIT_DEADLINE_MS = RETRY_WINDOW_MS / MAX_TRANSMIT_ATTEMPTS;

/**
 * How long a REAL-TIME query may go unanswered before the printer counts as silent.
 *
 * A DECLARED INTERPRETATION (`24 §3b`) with no FR behind it, and a deliberately short one, because
 * `03-F40` says these commands *"are answered while offline by design"* — a printer that has not
 * answered in a second is not answering, whatever else is true of it. The cost of being wrong is
 * bounded in the safe direction: silence never releases a held job (see `cannotSay` below), so an
 * over-eager deadline holds a ticket that would have printed and never duplicates one.
 *
 * It is separate from the transmit deadline because the two questions are different. A document may
 * legitimately take seconds; an answer to a three-byte real-time command may not.
 */
const REALTIME_DEADLINE_MS = 1_000;

/**
 * What a link that cannot answer reports.
 *
 * **`paper_out: true` is not a claim that the roll is out** — it is the only way this type can say
 * *"I cannot tell you the roll came back"*. `PaperStatus` is two-valued and the shipped spooler
 * releases a held job on `!status.paper_out`, so answering `false` to a printer that said nothing at
 * all would mark an unprinted ticket `printed` on the strength of a printer that is not there.
 * `checkPrinterHealth`'s own words for this are *"silence is NOT health"*.
 *
 * The residual is named rather than hidden: a printer unplugged while a job is HELD stays held for
 * ever, with no band, because `03-F41` takes a stall out of `03-F4`'s budget by design. That is the
 * safe direction — holding never double-prints — and closing it needs an FR about how long a stall
 * may last, which the corpus does not have.
 *
 * ⚠ **`03-F58` (August 2026) records this same residual and does NOT close it** — it decides that a
 * held ticket is SAID on the counter's honesty strip, which makes the difference between *held with
 * nobody told* and *held and named*. The FR's clause (a) is this paragraph: the till cannot tell
 * *no roll* from *no printer* through a link that has gone silent, `paper_out: true` is the only
 * thing a two-valued `PaperStatus` can say about that, and no stall lifetime exists to bound it.
 * **The surface `03-F58` names is OWED**, so today a stall is still silent on every link.
 */
const CANNOT_SAY: PaperStatus = { paper_out: true, near_end: "unsupported" };

/**
 * What a WRITE-ONLY link reports.
 *
 * `paper_out: false` here means **not observed**, never *observed absent* — see the header. It is
 * `filePrinter`'s answer for `filePrinter`'s reason (a link with no sensor to read), and it carries
 * `filePrinter`'s hazard with it: `03-F41`'s hold is unreachable through these two forms.
 */
const NOT_OBSERVED: PaperStatus = { paper_out: false, near_end: "unsupported" };

/** A link this device knows how to speak, or the reason it will not try. */
type LinkPlan =
  | { readonly kind: "tcp"; readonly host: string; readonly port: number }
  /** A path bytes are written to: a Linux character device, or a Windows print share as UNC. */
  | {
      readonly kind: "path";
      readonly path: string;
      readonly flag: "a" | "w";
      readonly noun: string;
    }
  | { readonly kind: "refused"; readonly reason: string };

const FORMS =
  `tcp://<host>[:${DEFAULT_TCP_PORT}] · device:///dev/usb/lp0 · windows://<ShareName>` as const;

/**
 * Read the configured value, or say why it could not be.
 *
 * `new URL` and not a hand-rolled split: it is a real parser, it refuses whitespace and a missing
 * scheme by itself, and a second grammar in this file would be one more thing to get subtly wrong.
 * Everything it throws on is a refusal — never an exception that reaches a caller (`01-F17`).
 */
const planLink = (raw: string): LinkPlan => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return {
      kind: "refused",
      // The `RESTOS_KOT_PRINTER` hint is not decoration: the two keys sit beside each other in
      // `ops/env/counter.env.example`, one names the CABLE and one names the MODEL, and a bare
      // model id typed into this one lands here. Both mistakes fail loudly (the other takes
      // `03-F49`'s column refusal), and this is the cheaper of the two to say out loud.
      reason:
        `"${raw}" is not a printer link — it must be one of ${FORMS}` +
        ` (the printer MODEL goes in RESTOS_KOT_PRINTER, not here)`,
    };
  }
  if (url.protocol === "tcp:") {
    if (url.hostname === "") {
      return { kind: "refused", reason: `"${raw}" names no host — try tcp://192.168.1.50:9100` };
    }
    // An EMPTY port is the value naming none, which takes `03-F1`'s 9100. A port that was written
    // and could not be read never reaches here at all: the URL parser refuses a non-numeric port
    // outright, which is the refusal this branch would otherwise have to make by hand.
    const port = url.port === "" ? DEFAULT_TCP_PORT : Number(url.port);
    return { kind: "tcp", host: url.hostname, port };
  }
  if (url.protocol === "device:") {
    // `device:///dev/usb/lp0` — three slashes, because the path is absolute and the authority is
    // empty. A RELATIVE path (`device://lp0`, which parses as host `lp0` and no path) is refused
    // rather than resolved against the process's working directory: a till that quietly created a
    // file called `lp0` beside its binary and reported `ok` would be the one outcome worse than not
    // printing — a device that claims to have printed (`00 §5.7`).
    if (url.hostname !== "" || url.pathname === "") {
      return {
        kind: "refused",
        reason: `"${raw}" is not an absolute device path — try device:///dev/usb/lp0`,
      };
    }
    // Appended, never truncated. A character device ignores `O_TRUNC`, so the flag costs nothing
    // where the value is right — and where it is wrong (an operator pointing this at an ordinary
    // file) appending keeps the evidence instead of erasing it.
    return { kind: "path", path: url.pathname, flag: "a", noun: `device node ${url.pathname}` };
  }
  if (url.protocol === "windows:") {
    if (url.hostname === "" || url.pathname !== "") {
      return {
        kind: "refused",
        reason:
          `"${raw}" is not a Windows printer share — it must name a share on THIS machine, ` +
          `e.g. windows://KOT. A printer shared from another PC is not supported`,
      };
    }
    if (process.platform !== "win32") {
      // `00 §5.7`. A UNC path means nothing on Linux or macOS, and accepting it here would create a
      // file with backslashes in its name in the working directory and report a printed ticket.
      return {
        kind: "refused",
        reason:
          `"${raw}" is a Windows printer share and this host is ${process.platform} — ` +
          `use device:///dev/usb/lp0 for a USB printer here, or tcp://<host>:9100`,
      };
    }
    // The raw-print path Windows actually offers without a native dependency: the printer is shared
    // locally and the share is written as a file through the LanMan redirector. `w` and not `a`,
    // because a share is an endpoint rather than a file and `O_APPEND` is not a thing it has.
    //
    // **UNVERIFIED — no Windows host exists in this repo or in CI (`24 §3b`: say so rather than
    // imply otherwise).** Whether a share accepts this write is K-8, on Windows.
    return {
      kind: "path",
      path: `\\\\localhost\\${url.hostname}`,
      flag: "w",
      noun: `Windows printer share \\\\localhost\\${url.hostname}`,
    };
  }
  return {
    kind: "refused",
    reason: `"${raw}" names no transport this device has — it must be one of ${FORMS}`,
  };
};

/**
 * One connection, one interaction: write the document if there is one, then ask `03-F40`'s question.
 *
 * **The order is the whole of pinned interpretation 3 and it is not interchangeable.** The document
 * goes FIRST because a printer holding a paper-out still TAKES the bytes and prints them when the
 * roll returns (`03-F41`: it *"is holding the job, not dropping it"*) — so querying first and
 * declining to write would leave `03-F41`'s hold with nothing to hold, and the ticket would have to
 * be re-transmitted later, which is the duplicate KOT that FR spends a paragraph on.
 *
 * `03-F42` is satisfied by construction: exactly one `write` carries the document, and the query is
 * only written after that write has completed, so no I/O wait is interleaved inside a document.
 *
 * It resolves EVIDENCE and never an outcome. `classifyTransmit` (K-3) owns the evidence→outcome
 * decision for every transport in this app, and a literal assembled here instead would be two
 * interpretations of one fact — `03-F40`'s two sensor bit layouts is this corpus's own worked
 * example of what that costs.
 *
 * **It never rejects, and that is BY CONSTRUCTION rather than by argument (`01-F17`).**
 * `spooler.pump()` awaits `send`, so a rejection takes every other job in the queue with it and
 * `03-F5`'s band never appears at all — a silent KOT failure reached by the one route that FR
 * cannot see. Every path out of this executor, including a synchronous throw from the socket
 * constructor, is an `evidence` value.
 */
const talk = (
  host: string,
  port: number,
  capability: PrinterCapability,
  document: Uint8Array | null,
): Promise<TransmitEvidence> =>
  new Promise((resolve) => {
    let done = false;
    let answerBy: ReturnType<typeof setTimeout> | undefined;
    let socket: ReturnType<typeof createConnection>;
    try {
      socket = createConnection({ host, port });
    } catch (error) {
      // A throw here would REJECT this promise, because a throwing executor rejects. There is no
      // host or port that reaches this — `planLink` has already refused everything `new URL` will
      // not parse — which is exactly why it is worth five lines: the property is "never rejects",
      // and a property that holds because of an argument about a different function is one edit
      // from being false.
      resolve({ status: null, timed_out: false, link_error: (error as Error).message });
      return;
    }
    // A three-byte real-time query behind Nagle would wait for an ack that is not coming.
    socket.setNoDelay(true);

    const finish = (evidence: TransmitEvidence): void => {
      if (done) return;
      done = true;
      clearTimeout(deadline);
      if (answerBy !== undefined) clearTimeout(answerBy);
      // Safe to drop the connection here: the printer's answer to a query written AFTER the document
      // is proof that it consumed the document first. On every other path there is nothing to lose.
      socket.destroy();
      resolve(evidence);
    };

    const deadline = setTimeout(
      () => finish({ status: null, timed_out: true, link_error: null }),
      document === null ? REALTIME_DEADLINE_MS : TRANSMIT_DEADLINE_MS,
    );

    // A NAME and never a boolean — `03-F5` requires the alert to say what broke, and `ECONNREFUSED`
    // ("the link worked and the printer said no") is a different errand from `EHOSTUNREACH`.
    socket.on("error", (error: NodeJS.ErrnoException) =>
      finish({ status: null, timed_out: false, link_error: error.code ?? error.message }),
    );
    // A close before we are done is the printer dropping us mid-document. It must be a link error
    // and never a stall: a half-written ticket is not being held by anybody, and answering `stalled`
    // would park the job outside `03-F4`'s budget for ever — no retry, no exhaustion, no band.
    socket.on("close", () =>
      finish({
        status: null,
        timed_out: false,
        link_error: "EPIPE (the printer closed the connection before the document was taken)",
      }),
    );

    const ask = (): void => {
      // Only from here: a byte that arrives before we asked is not an answer to our question.
      socket.on("data", (chunk: Buffer) => {
        const response = chunk[0];
        if (response === undefined) return;
        finish({
          status: decodePaperStatus(response, capability),
          timed_out: false,
          link_error: null,
        });
      });
      socket.write(PAPER_STATUS_QUERY);
      answerBy = setTimeout(
        () => finish({ status: null, timed_out: true, link_error: null }),
        REALTIME_DEADLINE_MS,
      );
    };

    socket.on("connect", () => {
      if (document === null) {
        ask();
        return;
      }
      // The callback fires when the bytes have left this process, so a printer holding the link
      // shut with TCP backpressure keeps this promise open — which is the point. Reporting `ok` off
      // `write()`'s synchronous return would mark the job `printed` in the durable spool (`03-F4`)
      // against bytes sitting in a buffer the printer has never seen.
      socket.write(document, (error) => {
        // A write error also raises `error` above, which settles this with the name.
        if (error === undefined || error === null) ask();
      });
    });
  });

/**
 * `18 §10`'s *"TCP 9100 (pure TS, all platforms)"*, in `node:net` and nothing else.
 *
 * One connection per interaction. A real 9100 printer typically accepts ONE at a time, and the
 * product never needs two: `spooler.pump()` advances one job at a time and awaits each `send` to
 * completion. `03-F40`'s cap is what bounds the case where somebody asks anyway.
 */
const tcpPrinter = (
  host: string,
  port: number,
  capability: PrinterCapability,
): SpoolerTransport => {
  /**
   * `03-F40`, verbatim: *"Cap outstanding real-time queries at 4."*
   *
   * `createRealtimeQueryWindow` has shipped in `packages/escpos` since K-6 carrying an
   * `@unreached-owed` marker that names its caller — *"the first real transport owes this its
   * caller, or the cap is a number in a file"*. This is that transport.
   */
  const window = createRealtimeQueryWindow();

  return {
    send: async (document) => {
      // The slot is taken BEFORE anything is written, so a refused query cannot leave a document on
      // the wire with no way to ask about it. Nothing is transmitted on this path, which is what
      // makes the retry that follows safe: there is no half-sent ticket to duplicate (`03-F41`).
      if (!window.send()) {
        return classifyTransmit({ status: null, timed_out: true, link_error: null }, capability);
      }
      try {
        return classifyTransmit(await talk(host, port, capability, document), capability);
      } finally {
        window.receive();
      }
    },
    status: async () => {
      if (!window.send()) return CANNOT_SAY;
      try {
        const evidence = await talk(host, port, capability, null);
        return evidence.status ?? CANNOT_SAY;
      } finally {
        window.receive();
      }
    },
  };
};

/**
 * `18 §10`'s USB half, in the form a till actually meets it: a path that takes bytes.
 *
 * On Linux a USB printer is `/dev/usb/lp0` and is written like a file; on Windows a locally shared
 * printer is `\\localhost\<share>` and is also written like a file. **No `serialport` and no `usb`
 * dependency** — both are on `18 §14`'s allowlist and neither is installed, and neither is needed
 * for a printer that is already a node in the filesystem.
 *
 * `writeFile` and not `writeFileSync`: a device node blocks until the printer takes the bytes, and
 * a synchronous write would stop the whole Electron main process — the ledger, the IPC and the sync
 * loop — for the length of a ticket. `01-F17`: a sale is never blocked by a printer.
 *
 * It reports `ok` only after the write resolves, for `filePrinter`'s stated reason: a transport that
 * answered `ok` and then failed to write would mark the job `printed` in the durable spool with
 * nothing to show for it.
 */
const rawPathPrinter = (
  path: string,
  flag: "a" | "w",
  capability: PrinterCapability,
): SpoolerTransport => ({
  send: async (document) => {
    try {
      await writeFile(path, document, { flag });
      return classifyTransmit(
        { status: NOT_OBSERVED, timed_out: false, link_error: null },
        capability,
      );
    } catch (error) {
      // A filesystem error is a `link_error` carrying its name: `EACCES` on `/dev/usb/lp0` means the
      // user is not in `lp`, and an S1 band that said `no_response` about a permission problem sends
      // someone to check a cable (`03-F5` requires the alert to be actionable).
      return classifyTransmit(
        { status: null, timed_out: false, link_error: (error as Error).message },
        capability,
      );
    }
  },
  // See `NOT_OBSERVED`: this link has no back-channel, so it cannot answer `03-F40`'s question and
  // does not pretend to have asked it.
  status: async () => NOT_OBSERVED,
});

export type PrinterLinkSource =
  /** The key was set and read. This device has a printer link. */
  | "configured"
  /** The key was set and REFUSED. No link is applied and the reason is reported. */
  | "refused"
  /** The key was not set. This device has no printer of its own, exactly as before it existed. */
  | "default";

export type PrinterLinkVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

export type PrinterLink = {
  /** `18 §10`'s seam, ready to be handed to the spooler. */
  readonly transport: SpoolerTransport;
  readonly source: PrinterLinkSource;
  readonly verdict: PrinterLinkVerdict;
  /** The raw value, carried ONLY so the boot line can name what was rejected. */
  readonly configured: string | undefined;
};

export type PrinterLinkInput = {
  /**
   * Raw, as it arrives; parsed and refused here.
   *
   * A PARAMETER and not a read of `process.env` inside this function, for `file-printer.ts`'s own
   * stated reason: a default that can only be checked by mutating a global is a default a test can
   * lose to ordering.
   */
  readonly configured: string | undefined;
  /** `03-F5`'s printer NAME, and `classifyTransmit`'s model gate for the near-end sensor. */
  readonly capability: PrinterCapability;
};

/**
 * The whole chain as one pure function, so it is testable without Electron and without a printer.
 *
 * **A value that was SET is never silently ignored, and a value that was not set changes nothing.**
 * An empty or whitespace-only value is an unset variable that happens to be present (`RESTOS_…=` in
 * a shell profile), not a configuration — selecting on presence alone would point a printer at the
 * empty string and report a link.
 */
export const resolvePrinterLink = ({ configured, capability }: PrinterLinkInput): PrinterLink => {
  const raw = (configured ?? "").trim();
  if (raw === "") {
    return {
      transport: unattachedPrinter(capability),
      source: "default",
      verdict: { ok: true },
      configured,
    };
  }
  const plan = planLink(raw);
  if (plan.kind === "refused") {
    // `03-F51`: the refused configuration "is simply not applied", and the fallback is the LOUD one.
    // `unattachedPrinter` reports `no_response`, exhausts `03-F4`'s budget and puts `03-F5`'s band on
    // the counter within 45 s — never a transport that claims to have printed.
    return {
      transport: unattachedPrinter(capability),
      source: "refused",
      verdict: { ok: false, reason: plan.reason },
      configured,
    };
  }
  return {
    transport:
      plan.kind === "tcp"
        ? tcpPrinter(plan.host, plan.port, capability)
        : rawPathPrinter(plan.path, plan.flag, capability),
    source: "configured",
    verdict: { ok: true },
    configured,
  };
};

/**
 * What the boot line says (`00 §5.7`), and it is the ONLY place a refusal is reported.
 *
 * Doc 14 owes a printer setting and does not have one, so without this line the refusal machinery
 * above is decorative: the product would know its setting is unreadable and tell nobody. Every other
 * resolver in this app already has one — `describeStationRouting`, `describePanelDensity`,
 * `describeDeviceIdentity`, `describeAging`, `describeServeSignal`.
 *
 * It re-derives the plan rather than carrying a fifth field on `PrinterLink`. `planLink` is pure and
 * total, so the two readings cannot diverge, and the returned shape stays the smallest one that
 * holds the properties.
 */
export const describePrinterLink = (link: PrinterLink): string => {
  const head = `printer link: ${link.source} (03-F1/18 §10, ${PRINTER_LINK_ENV})`;
  if (!link.verdict.ok) {
    return (
      `${head} — REFUSED and NOT APPLIED: ${link.verdict.reason}.` +
      ` ${PRINTER_LINK_ENV}="${link.configured ?? ""}" as given.` +
      ` No printer link is in use, so every station routed to paper will exhaust 03-F4's retry` +
      ` budget and raise 03-F5's band within 45 s. That is the loud fallback and it is deliberate` +
      ` (03-F51).`
    );
  }
  if (link.source === "default") {
    return (
      `${head} is unset — this device has no printer of its own.` +
      ` Every station routed to paper exhausts 03-F4's budget and raises 03-F5's band within 45 s,` +
      ` which is the honest signal that nothing is attached (00 §5.7), and RESTOS_PRINT_TO_FILE` +
      ` still selects the PDF simulator if it is set. To attach one: ${FORMS}.`
    );
  }
  const plan = planLink((link.configured ?? "").trim());
  if (plan.kind === "tcp") {
    return (
      `${head}="${link.configured ?? ""}" — TCP ${plan.host}:${plan.port}.` +
      ` The roll-paper sensor is queried with DLE EOT 4 after every document (03-F40), so a` +
      ` paper-out is held rather than lost (03-F41). NO PRINTER HAS BEEN TESTED AGAINST THIS (K-8).`
    );
  }
  if (plan.kind === "path") {
    return (
      `${head}="${link.configured ?? ""}" — ${plan.noun}.` +
      ` ⚠ This link is WRITE-ONLY: it cannot read 03-F40's paper sensor, so a PAPER-OUT ON THIS` +
      ` PRINTER READS AS A PRINTED TICKET and 03-F41's hold is unreachable. Use tcp://<host>:9100` +
      ` instead wherever the printer has an Ethernet port. NO PRINTER HAS BEEN TESTED AGAINST` +
      ` THIS (K-8).`
    );
  }
  // Unreachable: a refused plan is a refused verdict, handled above. Stated rather than thrown —
  // a boot line may not be the thing that stops a till starting (`01-F17`).
  return `${head}="${link.configured ?? ""}" — ${plan.reason}`;
};
