import type { AutoPrice, AppState } from './domain';

const MARKET_HOST: Record<AppState['settings']['server'], string> = {
  west: 'https://west.albion-online-data.com',
  east: 'https://east.albion-online-data.com',
  europe: 'https://europe.albion-online-data.com',
};

type ApiPrice = {
  item_id: string; city: string; quality: number; sell_price_min?: number; sell_price_min_date?: string;
  buy_price_max?: number; buy_price_max_date?: string;
};

const validPrice = (price: unknown) => typeof price === 'number' && Number.isFinite(price) && price > 0 ? price : null;
const validTimestamp = (value: unknown) => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || Date.parse(value) < Date.UTC(2000, 0, 1)) return null;
  return value;
};

export type MarketPriceFetchResult = { updates: Record<string, AutoPrice>; failures: string[] };

export async function fetchMarketPrices(server: AppState['settings']['server'], itemIds: string[], cities: string[], quality = 1): Promise<MarketPriceFetchResult> {
  const uniqueIds = [...new Set(itemIds)].filter(Boolean);
  const updates: Record<string, AutoPrice> = {};
  const failures: string[] = [];
  const cityQuery = cities.map(encodeURIComponent).join(',');
  const makeUrl = (ids: string[]) => {
    const path = `/api/v2/stats/prices/${ids.map(encodeURIComponent).join(',')}.json?locations=${cityQuery}&qualities=${quality}`;
    // The desktop app runs on Vite locally. Proxy through the same origin so
    // automatic price requests are not blocked by browser CORS/network rules.
    return import.meta.env.DEV ? `/__aodp/${server}${path}` : `${MARKET_HOST[server]}${path}`;
  };
  const chunks: string[][] = [];
  let current: string[] = [];
  for (const id of uniqueIds) {
    const candidate = [...current, id];
    if (current.length && makeUrl(candidate).length > 3000) {
      chunks.push(current);
      current = [id];
    } else current = candidate;
  }
  if (current.length) chunks.push(current);

  for (const chunk of chunks) {
    try {
      const response = await fetch(makeUrl(chunk), { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`);
      const payload: unknown = await response.json();
      if (!Array.isArray(payload)) throw new Error('The market service returned an unexpected response.');
      const refreshedAt = new Date().toISOString();
      for (const value of payload) {
        if (!value || typeof value !== 'object') continue;
        const row = value as ApiPrice;
        if (typeof row.item_id !== 'string' || typeof row.city !== 'string' || Number(row.quality) !== quality) continue;
        const buy = validPrice(row.buy_price_max);
        const sell = validPrice(row.sell_price_min);
        updates[`${row.item_id}::${row.city}::q${quality}`] = {
          buy, sell,
          buyAt: buy == null ? null : validTimestamp(row.buy_price_max_date),
          sellAt: sell == null ? null : validTimestamp(row.sell_price_min_date),
          buyUnavailableAt: buy == null ? refreshedAt : null,
          sellUnavailableAt: sell == null ? refreshedAt : null,
          refreshedAt,
        };
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      failures.push(`${chunk.length} item${chunk.length === 1 ? '' : 's'}: ${reason}`);
    }
  }
  return { updates, failures };
}

export function freshnessLabel(price: AutoPrice | undefined, minutes: number, now = Date.now()) {
  if (!price || (price.buy == null && price.sell == null)) return 'UNAVAILABLE';
  const stamps = [price.buyAt, price.sellAt].map((stamp) => stamp ? Date.parse(stamp) : NaN).filter(Number.isFinite);
  if (!stamps.length) return 'AUTO — Unverified';
  return now - Math.max(...stamps) <= minutes * 60_000 ? 'AUTO — Fresh' : 'AUTO — Stale';
}
