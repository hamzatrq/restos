/**
 * # `16-F27`'s posture cell for THIS device — and it is a **v0 STOPGAP**, stated first
 *
 * Owning specs: `16-F1` (tax is off by default), `16-F27` (founder ruling R55 — the owner
 * configures his channels and types the rates), `16-F28` (the axis is the *tender* channel),
 * `16-F31`/`01-F82` (tax is inside `billed_total`), `01-F87` (the layer-2 carrier), `00 §7`.
 *
 * ## ⚠ THIS IS NOT WHERE A TAX RATE BELONGS, AND SAYING SO IS THE POINT
 *
 * `16-F27` makes the cell **layer-2 ORG configuration** and `01-F87` rules its carrier: `config`
 * is the fourth member of `01-F75`'s reference-data set, replicated to a till as a versioned
 * snapshot, *"because a version number is a completeness claim and a stream of events is not"*.
 * **That carrier is not built** — `plans/v0.md` gap 3, *"Tax rates have nowhere to live … For ONE
 * pilot this may be seeded — decide when 2 is built, not before"* — and gap 2 is what this file
 * belongs to. So the rate is **seeded from this device's environment**, which is the smallest
 * honest seam available: it is the same mechanism `RESTOS_KOT_PRINTER`, `RESTOS_PANEL_PPI` and
 * `RESTOS_CLOUD_URL` already use, it needs no new plane, and it is visibly temporary.
 *
 * **What is WRONG with it, named rather than left for a reader to notice.** A tax rate is
 * ORG-scoped and this is PER-DEVICE, so two tills in one branch can be seeded differently and
 * nothing detects it — precisely the divergence `01-F87` says a version number exists to prevent
 * (*"a device that missed one event holds a silently wrong rate forever"*). It carries no
 * effective date, so `16-F29`'s pinning — the rate version resolves from the order's **creation**
 * time in branch time — is unrepresentable: an operator who edits the variable and relaunches
 * changes the rate on every open order. And it is not audited, so `16-F1`'s *"an explicit org
 * action recorded as `config.changed`"* does not happen at all. **None of these is fixable here;
 * every one of them is closed by building `01-F87`'s carrier and deleting this file.**
 *
 * ## What it deliberately does NOT do (`24 §3b` — the alternative, named)
 *
 * It resolves **one cell for the whole device**, not `16-F27`'s grid. The refused alternative was
 * a seeded matrix — a default cell plus per-tender overrides, which is `16-F27`'s literal shape.
 * It is refused because **nothing can select a non-default cell**: `16-F32` (R58) puts the
 * tender-channel choice *before the unpaid bill prints* and no surface offers it, so an override
 * map would be a branch no caller could reach — this wave's named defect, shipped on purpose.
 * Worse than dead: the cover test (`pay_total >= billed_total`) runs **before** a tender exists,
 * so a cell that depended on the tender would make what the customer owes depend on how she pays
 * it, which has no fixed point under `exclusive`. `16-F27`'s own default-cell design is exactly
 * the one-rate org R55 names — *"some orgs … charge one rate across all, as instructed by
 * government"* — so v0 ships the case the ruling already blesses and no guess beside it.
 *
 * `16-F33`'s multi-total `bill` document is not reachable from here either: `packages/escpos`
 * declares `kot`, `receipt`, `shift_close_slip` and `day_summary`, and `03-F31`'s `bill` type has
 * no spec, no renderer and no producer. A `receipt` shows exactly one total (`16-F33` (c)) and
 * that is the one document this device prints.
 *
 * ## Why a malformed value REFUSES rather than defaults
 *
 * `16-F1` puts the default at `none`, so an UNSET variable is not an error — it is the ordinary
 * Pakistani restaurant, and the till behaves exactly as it did before this file existed. A
 * variable that is SET and unreadable is different: defaulting it to `none` is a tax silently not
 * charged and defaulting it to a number is a tax silently charged, and both are permanent under
 * `01-F1`. `11-F22`'s precedent — *"an absent status is not a licence to default"* — and `00 §5.7`
 * both point the same way, so it throws with the variable named. That is not an `01-F17` break:
 * `01-F17` protects a sale from inventory math, sync and approval timeouts, never from a
 * configuration an operator typed wrong, and a wrong rate on every bill is the outcome it would
 * otherwise buy.
 */

import { TAX_OFF, TAX_POSTURES, type TaxCell, type TaxPosture } from "@restos/domain";

/** The seeded posture — `none | inclusive | exclusive` (`16-F2`). Unset ⇒ `16-F1`'s default. */
export const TAX_POSTURE_ENV = "RESTOS_TAX_POSTURE";

/** The seeded rate in integer basis points (`00 §6`, `DEC-MONEY-005`). 1600 = 16 %. */
export const TAX_RATE_BPS_ENV = "RESTOS_TAX_RATE_BPS";

/**
 * `16-F27`'s cell for this device, from a v0 seed.
 *
 * Pure in its input so a suite can drive every arm without touching `process.env`; the shipping
 * callers pass `process.env` themselves. There is no memo and no construction-time capture on
 * purpose — a value read once at boot is a value that disagrees with the variable an operator has
 * since corrected, and this seam is short-lived enough that the extra `env` read costs nothing.
 */
export const resolveTaxCell = (env: Record<string, string | undefined>): TaxCell => {
  const posture = env[TAX_POSTURE_ENV]?.trim();
  const rate = env[TAX_RATE_BPS_ENV]?.trim();

  // `16-F1` — off by default, and the whole cell is absent rather than half-configured. Read
  // BEFORE the rate so an org with no posture never has to set a rate to start a till.
  if (posture === undefined || posture === "") {
    if (rate !== undefined && rate !== "") {
      throw new RangeError(
        `${TAX_RATE_BPS_ENV} is set to "${rate}" but ${TAX_POSTURE_ENV} is not — a rate with no ` +
          `posture charges nothing and reads as configured (16-F1, 16-F27)`,
      );
    }
    return TAX_OFF;
  }

  if (!(TAX_POSTURES as readonly string[]).includes(posture)) {
    throw new RangeError(
      `${TAX_POSTURE_ENV} must be one of ${TAX_POSTURES.join(" | ")} (16-F2), got "${posture}"`,
    );
  }

  // `none` consults no rate — `16-F2`'s posture and `16-F27`'s rate are one cell, and an org that
  // has switched tax off must not have to keep a rate beside it for the till to start.
  if (posture === "none") return TAX_OFF;

  if (rate === undefined || rate === "") {
    throw new RangeError(
      `${TAX_RATE_BPS_ENV} is required when ${TAX_POSTURE_ENV} is "${posture}" — 16-F27 makes the ` +
        `owner type the rate, and a missing one is not a licence to default`,
    );
  }
  // `00 §6`: a rate is an INTEGER basis point. `Number()` on "16%", "0.16" or "" would yield NaN,
  // 0.16 and 0 respectively — one of which is silently wrong rather than obviously so, which is
  // why the integer test is explicit and the message quotes what was typed back.
  const rate_bps = Number(rate);
  if (!Number.isSafeInteger(rate_bps) || rate_bps < 0) {
    throw new RangeError(
      `${TAX_RATE_BPS_ENV} must be a non-negative integer of BASIS POINTS (00 §6 — 1600 is 16 %), ` +
        `got "${rate}"`,
    );
  }

  return { posture: posture as TaxPosture, rate_bps };
};

/**
 * The shipping resolution — every reader of `01-F82`'s `billed_total` on this device calls THIS.
 *
 * One function rather than a value passed down from `index.ts`: the five readers
 * (`settlement-guard`, `settlement-closer`, `line-advance`, `aggregator-settlement`, `printing`)
 * must resolve the *same* cell or the receipt would print a total the cover test never accepted,
 * and `16-F33` (a) already refuses a second declaration of a posture beside the one settlement
 * uses — *"this corpus has already paid for the other arrangement once, when two declarations of
 * one enabled channel set drifted silently and nothing could see it."*
 */
export const deviceTaxCell = (): TaxCell => resolveTaxCell(process.env);
