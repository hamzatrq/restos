import { isPhoneE164 } from "@restos/domain";

/**
 * # `01-F23`'s key, derived from the digits an operator actually dialled
 *
 * `02-F27` begins *"operator types the caller's number"* and `02-F28` measures **30 seconds from
 * that act**. Everything in between rests on one identity: the string she typed and the string the
 * ledger is keyed by must resolve to the same thing, or the repeat customer the feature exists to
 * find is invisible to the screen built to find her.
 *
 * ## Why this lives in the app and not in `packages/domain`
 *
 * `registry.ts` states the placement in terms: *"a normalizer in a fold is a POLICY in a fold: two
 * devices on two library versions key one number two ways and project different customer files
 * from an identical event set … Normalization belongs at the WRITER, upstream of `parseEvent`."*
 * This app is a writer. What the kernel keeps is the FORM — `isPhoneE164`, the one place the E.164
 * pattern is written — so this module cannot invent a key shape the ledger would refuse, and a
 * disagreement between the two is an `01-F4` error at emit rather than a second silent identity.
 *
 * **The alternative, named rather than dismissed:** put the whole normalizer in `packages/domain`
 * beside the schema. It would make one rule structural for every future writer (`06-F11`'s
 * storefront, doc 07's WhatsApp) instead of one-per-writer. It is refused today because the piece
 * that would move is the COUNTRY DEFAULT below, which no FR and no `00 §7` layer states — putting
 * an unstated guess in the kernel makes every plane inherit it, and `packages/domain` is a
 * protected path whose changes are the expensive ones to reverse. When a second writer lands, that
 * is the moment to move it; today it would be one guess in two places instead of one.
 *
 * ## The two forms, and both are pinned readings
 *
 * `01-F23` fixes the OUTPUT form (*"normalized phone number (E.164)"*) and `registry.ts` fixes the
 * input that must map into it — *"the local dialling form a Pakistani operator actually types"*,
 * written there as eleven unbroken digits beginning `03`. Neither names a country code, and
 * `00 §7`'s config plane that would carry one does not exist. So:
 *
 * - **`+92` is Pakistan's ITU code** and Pakistan is the product's country (`restaurant-os.md`;
 *   `01-F46` fixes Asia/Karachi). This reproduces the corpus's own worked example rather than a
 *   preference — but it IS an interpretation, and it is flagged for founder review as one.
 * - **The local form is `0` + exactly ten digits.** That is the shape of `registry.ts`'s worked
 *   example and of every Pakistani mobile number. The strictness is the point rather than a
 *   convenience: `27-F29` blocks impossible values AT ENTRY, and the failure this must not have is
 *   a half-typed number quietly becoming a valid key. Four digits are not a customer — they are an
 *   operator who is still typing — and a country code with three digits after it is a well-formed
 *   E.164 string that would file her caller under a number nobody dialled, permanently (`01-F1`).
 *
 * ⚠ **No worked number is quoted anywhere in this file, and that is deliberate.**
 * `unlock-gate.dom.test.tsx` fails any quoted run of four or more digits under `src/main` —
 * `01-F61`'s dev-PIN tripwire — on the stated ground that *"nothing legitimate under `src/main`
 * quotes four or more consecutive digits"*. A phone number is now the first legitimate thing in
 * that shape, so the example is spelled out in words. The guard is right and was not weakened;
 * the repo's own precedent for a misfiring name guard is a better name, never a narrower regex.
 *
 * ## What it deliberately does not do
 *
 * No stripping of spaces, hyphens or brackets, and no bare country-code-without-plus form. Every
 * digit this app can produce comes from a keypad of ten digits (`27-F6`), so a separator cannot
 * arrive; inventing tolerance for input shapes the product cannot generate is the speculative
 * widening `24 §3b` forbids, and each tolerance is another way for one human to become two rows.
 */
export const normalizeDialledPhone = (dialled: unknown): string | null => {
  if (typeof dialled !== "string") return null;
  // Already the key: a number that arrived from `06-F11`'s storefront or doc 07's WhatsApp is
  // stored in this form, and `02-F27`'s lookup must land on that same row (`01-F23` — ONE identity
  // per org). Validated against the KERNEL's pattern, never a copy of it.
  if (dialled.startsWith("+")) return isPhoneE164(dialled) ? dialled : null;
  // The local dialling form. `+92` replaces the trunk `0`, which is what makes the two ways of
  // saying one number — as dialled, and as `01-F23` keys it — the same human rather than two.
  if (!/^0\d{10}$/.test(dialled)) return null;
  const candidate = `+92${dialled.slice(1)}`;
  // Belt and braces, and it is not decoration: this is the assertion that the country default and
  // the kernel's form agree. A ruling that changes `+92` to something the schema refuses fails
  // HERE, at the writer, instead of appending a row no lookup will ever produce (`01-F1`).
  return isPhoneE164(candidate) ? candidate : null;
};
