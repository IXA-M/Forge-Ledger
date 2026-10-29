import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchMarketPrices } from './market';

describe('automatic market prices', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetches through the local AODP proxy and maps buy and sell prices', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{
        item_id: 'T4_BAG', city: 'Bridgewatch', quality: 1,
        buy_price_max: 2907, buy_price_max_date: '2026-10-14T10:00:00Z',
        sell_price_min: 4281, sell_price_min_date: '2026-10-14T10:00:00Z',
      }],
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchMarketPrices('europe', ['T4_BAG'], ['Bridgewatch'], 1);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe('/__aodp/europe/api/v2/stats/prices/T4_BAG.json?locations=Bridgewatch&qualities=1');
    expect(result.failures).toEqual([]);
    expect(result.updates['T4_BAG::Bridgewatch::q1']).toMatchObject({ buy: 2907, sell: 4281 });
  });

  it('requests rune, soul, and relic sell quotes specifically from Brecilien at item quality 1', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [
      ...['T6_RUNE', 'T6_SOUL', 'T6_RELIC'].map((item_id) => ({ item_id, city: 'Brecilien', quality: 1, sell_price_min: 123, sell_price_min_date: '2026-10-19T10:00:00Z' })),
    ] });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchMarketPrices('europe', ['T6_RUNE', 'T6_SOUL', 'T6_RELIC'], ['Brecilien'], 1);

    expect(fetchMock.mock.calls[0][0]).toBe('/__aodp/europe/api/v2/stats/prices/T6_RUNE,T6_SOUL,T6_RELIC.json?locations=Brecilien&qualities=1');
    for (const id of ['T6_RUNE', 'T6_SOUL', 'T6_RELIC']) {
      expect(result.updates[`${id}::Brecilien::q1`]).toMatchObject({ sell: 123, sellAt: '2026-10-19T10:00:00Z' });
    }
  });

  it('reports failed batches so the app can show the actual network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, statusText: 'Unavailable' }));

    const result = await fetchMarketPrices('europe', ['T4_BAG'], ['Bridgewatch'], 1);

    expect(result.updates).toEqual({});
    expect(result.failures).toEqual(['1 item: HTTP 503 Unavailable']);
  });
});
