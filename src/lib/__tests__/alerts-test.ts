import { evaluateAlerts, isHit, loadAlerts, PriceAlert, updateAlerts } from '../alerts';
import { notify } from '../notify';
import type { Rates } from '../rates';
import type { Item } from '../storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../notify', () => ({ notify: jest.fn(() => Promise.resolve()) }));

const notifyMock = notify as jest.MockedFunction<typeof notify>;

const rates = (gold24: number, silverPerGram = 200): Rates =>
  ({ gold24, gold22: gold24 * 0.9167, silver: silverPerGram, at: Date.now() });

const alert = (over: Partial<PriceAlert> = {}): PriceAlert => ({
  id: 'a1', target: 'gold24', label: 'Gold 24K', dir: 'below', price: 14000, armed: true, createdAt: 0, ...over,
});

const product = (over: Partial<Item> = {}): Item => ({
  id: 'p1', url: 'https://example.com/ram', category: 'RAM', title: '16GB DDR5', price: 4000, ...over,
});

const setAlerts = (list: PriceAlert[]) => updateAlerts(() => list);

beforeEach(() => notifyMock.mockClear());

test('isHit compares in the alert direction, inclusive of the target', () => {
  expect(isHit({ dir: 'below', price: 100 }, 100)).toBe(true);
  expect(isHit({ dir: 'below', price: 100 }, 101)).toBe(false);
  expect(isHit({ dir: 'above', price: 100 }, 100)).toBe(true);
  expect(isHit({ dir: 'above', price: 100 }, 99)).toBe(false);
});

test('a "below" alert fires once when the price drops under the target', async () => {
  await setAlerts([alert()]);

  await evaluateAlerts({ metals: rates(13990) });
  expect(notifyMock).toHaveBeenCalledTimes(1);
  expect(notifyMock).toHaveBeenCalledWith(expect.stringContaining('Gold 24K dropped below'), expect.any(String), '/');
  expect((await loadAlerts())[0]).toMatchObject({ armed: false, firedAt: expect.any(Number) });

  // Still below: no second notification.
  await evaluateAlerts({ metals: rates(13900) });
  expect(notifyMock).toHaveBeenCalledTimes(1);
});

test('a fired alert re-arms only after the price moves 0.5% back past the target', async () => {
  await setAlerts([alert({ armed: false })]);

  await evaluateAlerts({ metals: rates(14050) }); // +0.36%: too close, stays quiet
  expect((await loadAlerts())[0].armed).toBe(false);

  await evaluateAlerts({ metals: rates(14080) }); // +0.57%: re-armed
  expect((await loadAlerts())[0].armed).toBe(true);

  await evaluateAlerts({ metals: rates(13999) }); // crosses again: fires
  expect(notifyMock).toHaveBeenCalledTimes(1);
});

test('an "above" silver alert compares the price per kg', async () => {
  await setAlerts([alert({ target: 'silver', label: 'Silver', dir: 'above', price: 210_000 })]);

  await evaluateAlerts({ metals: rates(14000, 209.5) }); // ₹2,09,500/kg
  expect(notifyMock).not.toHaveBeenCalled();

  await evaluateAlerts({ metals: rates(14000, 210.2) }); // ₹2,10,200/kg
  expect(notifyMock).toHaveBeenCalledWith(expect.stringContaining('Silver rose above'), expect.any(String), '/');
});

test('product alerts skip products whose price could not be fetched', async () => {
  await setAlerts([alert({ target: 'item', itemId: 'p1', label: '16GB DDR5', price: 4500 })]);

  await evaluateAlerts({ items: [product({ error: 'HTTP 503' })] });
  expect(notifyMock).not.toHaveBeenCalled();

  await evaluateAlerts({ items: [product()] });
  expect(notifyMock).toHaveBeenCalledWith(expect.stringContaining('Price drop'), expect.any(String), '/watchlist');
});

test('metal alerts ignore a check that only has product prices', async () => {
  await setAlerts([alert()]);
  await evaluateAlerts({ items: [product()] });
  expect(notifyMock).not.toHaveBeenCalled();
  expect((await loadAlerts())[0].armed).toBe(true);
});
