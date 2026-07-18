// Branded integer money/quantity types (00 §6): floats in ledgers never.
declare const brand: unique symbol;
export type Paisa = number & { readonly [brand]: "Paisa" };
export type Milligrams = number & { readonly [brand]: "Milligrams" };
export type Millilitres = number & { readonly [brand]: "Millilitres" };
export type Units = number & { readonly [brand]: "Units" };

const asInt = (n: number, label: string): number => {
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer, got ${n}`);
  }
  return n;
};

export const paisa = (n: number): Paisa => asInt(n, "paisa") as Paisa;
export const mg = (n: number): Milligrams => asInt(n, "mg") as Milligrams;
export const ml = (n: number): Millilitres => asInt(n, "ml") as Millilitres;
export const units = (n: number): Units => asInt(n, "units") as Units;

export const addPaisa = (a: Paisa, b: Paisa): Paisa => paisa(a + b);
export const subPaisa = (a: Paisa, b: Paisa): Paisa => paisa(a - b);

/** Bigint-exact accumulation; throws rather than drift past Number.MAX_SAFE_INTEGER. */
export const sumPaisa = (values: readonly Paisa[]): Paisa => {
  let total = 0n;
  for (const v of values) total += BigInt(v);
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`sumPaisa overflow: ${total}`);
  }
  return paisa(Number(total));
};
