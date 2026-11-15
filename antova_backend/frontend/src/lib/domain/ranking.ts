/**
 * Antova Ranking Domain Logic
 * Bid order vs evaluated order (spec §9)
 */

export interface VendorRankItem {
  vendorId: string;
  name: string;
  headlineCents: number;
  evaluatedCents: number;
  isLowerBound?: boolean;
}

export interface RankRow {
  vendorId: string;
  bidRank: number | null;
  evalRank: number | null;
  worsened: boolean;
}

function rankOf(value: number, all: readonly number[]): number {
  return 1 + all.filter((v) => v < value).length;
}

export function rankChanges(items: readonly VendorRankItem[]): RankRow[] {
  const priced = items.filter((item) => item.headlineCents > 0);
  const bids = priced.map((item) => item.headlineCents);
  const evals = priced.map((item) => item.evaluatedCents);

  return items.map((item) => {
    if (item.headlineCents <= 0) {
      return { vendorId: item.vendorId, bidRank: null, evalRank: null, worsened: false };
    }
    const bidRank = rankOf(item.headlineCents, bids);
    const evalRank = rankOf(item.evaluatedCents, evals);
    return { vendorId: item.vendorId, bidRank, evalRank, worsened: evalRank > bidRank };
  });
}

export function apparentLowBidder(items: readonly VendorRankItem[]): VendorRankItem | null {
  let best: VendorRankItem | null = null;
  for (const item of items) {
    if (item.headlineCents <= 0) continue;
    if (
      best === null ||
      item.headlineCents < best.headlineCents ||
      (item.headlineCents === best.headlineCents && item.evaluatedCents < best.evaluatedCents)
    ) {
      best = item;
    }
  }
  return best;
}

export function lowestEvaluated(items: readonly VendorRankItem[]): VendorRankItem[] {
  const priced = items.filter((item) => item.headlineCents > 0);
  if (priced.length === 0) return [];
  const min = Math.min(...priced.map((item) => item.evaluatedCents));
  return priced.filter((item) => item.evaluatedCents === min);
}
