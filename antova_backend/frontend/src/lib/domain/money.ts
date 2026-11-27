import Decimal from 'decimal.js-light';

const MINUS = '−';

/**
 * Converts euros (number or string) to integer cents using Decimal ROUND_HALF_UP.
 * value: {EUR}; returns D2{EUR}
 */
export function toCents(value: number | string): number {
  let euros: Decimal;
  try {
    euros = new Decimal(value);
  } catch {
    throw new RangeError(`Not a finite amount: ${String(value)}`);
  }
  // D2{EUR} = round2({EUR}) * 100
  const cents = euros.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).times(100).toNumber();
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(`Amount out of range: ${String(value)}`);
  }
  return cents;
}

function groupThousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Formats integer cents or euro values cleanly.
 * If value is an integer number of euros (e.g. 452000), formats as "€452,000".
 * If isLowerBound is true, appends "+" -> "€479,650+".
 * value: {EUR} (whole euros, NOT D2 cents: no /100 is applied)
 */
export function formatEur(
  value: number | string | null | undefined,
  options?: { isLowerBound?: boolean; signed?: boolean }
): string {
  if (value === null || value === undefined) {
    return '€?';
  }

  const num = typeof value === 'number' ? value : parseFloat(value);
  if (isNaN(num)) return '€?';

  const isNeg = num < 0;
  const abs = Math.abs(num); // {EUR}
  const isWhole = Math.round(abs) === abs;
  // Round to cents first, then split, so 2.999 carries into the euros (€3.00, not €2.00).
  const cents = isWhole ? 0 : toCents(abs); // D2{EUR} as integer cents
  const formattedAbs = isWhole
    ? groupThousands(Math.round(abs))
    : `${groupThousands(Math.trunc(cents / 100))}.${String(cents % 100).padStart(2, '0')}`;

  const prefix = isNeg ? `${MINUS}€` : options?.signed && num > 0 ? '+€' : '€';
  const suffix = options?.isLowerBound ? '+' : '';

  return `${prefix}${formattedAbs}${suffix}`;
}

export function formatAdderEur(adder: number | string | null | undefined): string {
  if (adder === null || adder === undefined) return '€?';
  const num = typeof adder === 'number' ? adder : parseFloat(adder);
  if (isNaN(num)) return '€?';
  if (num === 0) return '€0';
  return num > 0 ? `+${formatEur(num)}` : formatEur(num);
}
