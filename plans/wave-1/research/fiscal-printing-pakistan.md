# Wave 1 research — Pakistani fiscal receipt law (condensed to decisions)

The agent corrected itself three times against primary instruments and, in each case,
`specs/16` turned out to be RIGHT and its own earlier reading wrong. Methodological
lesson it named: **when a Pakistani authority's "updated" published consolidation
disagrees with a Finance Act, the Finance Act wins.** PRA publishes a 2021-22 schedule as
current; KPRA publishes a 2020-21 tariff as its rates page. Both are stale.

## ⚠ FOUNDER-LEVEL: direct statutory liability on US, not the restaurant

**Sindh Finance Act 2026 inserts s.43 penalty entry 2AA** — a penalty of **up to
Rs 1,000,000, minimum Rs 100,000**, on *"any person who **designs, develops, customizes
or supplies invoicing software** enabling issuance of invoices not conforming to"* the
Sindh invoicing rules. Combined with **rule 8** (the PoS vendor must have its place of
business in Sindh), shipping RestOS to a Karachi customer would carry **vendor liability
for non-conforming invoice output, not indemnifiable by a contract term with the
restaurant.**

**Status: UNVERIFIED.** The Sindh Finance Act 2026 on SRB's own site is a pure image scan
with no text layer; this was read by OCR, single-source. **This needs a Pakistani tax
lawyer before any Sindh customer is signed** — it is a founder decision, not an
engineering one. It also raises `16-F23` (per-adapter receipt/QR format ownership) from a
correctness concern to a liability control.

## ⚠ A legal requirement that is physically impossible on standard hardware

SRB's rules mandate a **7×7 mm QR**. SRB's own integration API returns a **~95-character
verification URL** and instructs that it *"must be converted into a QR Code and printed
on the invoice."* At 203 dpi, 7 mm ≈ 56 dots; a 95-byte payload needs QR version 5
(37 modules) → **~1.5 dots per module, which will not scan reliably.**

**You cannot satisfy both clauses on a 203 dpi thermal head.** Two exits: get the size
waiver in writing at sandbox certification, or **specify 300 dpi print heads for Sindh
deployments**, where 7 mm ≈ 83 dots gives a clean 2 dots/module. This is a hardware
requirement discovered from a collision between a legal rule and physics.

## Restaurant tax is PROVINCIAL, and the provinces differ on every axis

| | Punjab (PRA) | Sindh (SRB) | KP (KPRA) | Balochistan (BRA) |
|---|---|---|---|---|
| **rate** | **8% digital / 16% other**, from 1 Jul 2026 | 15% (List A) or 8% digital | 10% cash / 6% digital; **corporate 15%/6%**; dhaba 2% | **8% base / 4% if POS-linked** |
| **QR in law?** | **NO** — administrative only, from PRAL's spec | **YES**, 7×7 mm in the rules | **NO** — "QR" appears zero times in the Act and Regulation | **YES**, 7×7 mm |
| **offline** | **1 week** after fault fixed (e-IMS Rule 8(3)) | **no *katcha*/provisional invoices at all** | — | same no-provisional clause |
| **threshold** | turnover **≥ Rs 10m**; below that, outside e-IMS entirely | — | — | — |
| **topology** | local Windows fiscal device | **cloud API** (published Jul 2026) | two paths, **different field names** | EFD |

**Balochistan is the only jurisdiction where being integrated is itself worth a rate**
(8%→4%), which makes the compliance add-on a revenue argument there rather than a cost.

**Sindh's rate is a three-way function:** per-taxpayer List-A status × per-branch
POS-integration state × per-tender payment mode. The SRB approval letter's operative
condition is *"valid for such branches whose POS system are duly integrated/active."*
So `16-F19`'s branch-status-conditional rate rows are **the minimum that works**, not
over-engineering — and the agent's own strengthening: it must be evaluated **per tender
line, not per order.**

## Corrections owed to `specs/16` (recorded, not yet applied)

- **`16-F24` has PRA and KPRA backwards** on topology. PRA is the local Windows fiscal
  device.
- **`16-F10`'s pending-marker receipt is ILLEGAL in Sindh and Balochistan** (no *katcha*
  or provisional invoice), **mandatory federally** (rule 150XC), and **unnecessary in
  Punjab and KP** where the number and QR are generated locally. One behaviour, four
  different legal answers — this is the sharpest argument for the adapter model.
- **`16 §5`'s "≥ 6 years" retention is wrong** in both provinces; different cut-over dates
  plus a "whichever is later" legal hold.
- **`16 §9.1`'s "highest-rate-applies" split-payment fallback is the DANGEROUS direction
  in Punjab**, where s.48 S.No. 21 penalises charging **above** the Second Schedule rate.
- **Federal rule 150ZB(4)** — restaurants must show price **and tax separately on menu
  cards and menu boards**. Owned by no spec today.
- **Rule 20(3) proviso (SRO 350(I)/2024)** — credit notes to unregistered persons need
  **prior Commissioner approval**. Direct threat to `16-F12` and the counter refund flow.

## Two implementation facts that change the adapter design
- **SRB validates arithmetic SERVER-SIDE and rejects mismatches** —
  `taxAmount = (saleValue + serviceCharges + extraCharges) × rate/100`, and
  `netAmount = (…+ taxAmount) − discountAmount`. **Our integer-paisa maths must reproduce
  SRB's float arithmetic exactly or every invoice fails validation.** A concrete,
  testable acceptance criterion for the SRB adapter, and precisely the bug class
  `DEC-MONEY-005` exists to prevent.
- **SRB's `modeOfPay` accepts only `Cash`/`Card` — it cannot express split tender at
  all.** Our money model supports split payment; the fiscal adapter cannot represent it.
  Unresolved.
- **KPRA's two integration paths use DIFFERENT FIELD NAMES** (`date_time` vs `date`,
  `tax_amount` vs `sales_tax`). A shared serialiser across the two will silently fail.
  KPRA's published sample carries `tax_rate: 5`, which **matches no current KP rate** —
  it is stale from the pre-2024 regime. Do not copy the sample.

## Also worth knowing
**PRA Circular No. 1 of 2026** makes **Raast QR payment acceptance mandatory** for
restaurants in Punjab — QR-enabled bank account within 14 days, QR displayed
conspicuously. Payment acceptance, not receipt content, but it pairs with the 8%
digital-payment rate and belongs in the Punjab onboarding checklist.

## Verdict on the spec
`specs/16`'s **adapter model is vindicated.** The four authorities differ in topology,
rate structure, offline law, QR legal basis and now vendor liability. No shared
abstraction would have absorbed that.

## Open — would not paper over
1. **Sindh vendor penalty 2AA — unverified** (image scan, OCR, single source). Highest
   stakes item in the report. Lawyer, not researcher.
2. **KP Finance Act 2026 could not be found**; KP rates high-confidence as at 18 May 2026,
   medium today.
3. **No Balochistan Finance Act 2026 exists on eBRA**; the 2%→4% change rests on two
   circulars citing an unnumbered Assembly notification.
4. **No FBR general order under ICTO s.3(1)** — whether Islamabad restaurants must
   integrate *today* is unresolved.
5. **PRA e-IMS Rules 2019 detail is OCR-sourced**, not text-extracted; URL and title
   confirmed, rule-by-rule content single-source.
