import Decimal from 'decimal.js-light';

const MINUS = '−';

/**
 * Converts euros (number or string) to integer cents using Decimal ROUND_HALF_UP.
 */
export function toCents(value: number | string): number {
  let euros: Decimal;
  try {
    euros = new Decimal(value);
  } catch {
    throw new RangeError(`Not a finite amount: ${String(value)}`);
  }
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
  const abs = Math.abs(num);
  const isWhole = Math.round(abs) === abs;
  const formattedAbs = isWhole
    ? groupThousands(Math.round(abs))
    : `${groupThousands(Math.floor(abs))}.${(abs % 1).toFixed(2).slice(2)}`;

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
