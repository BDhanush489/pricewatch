// Price alerts: "tell me when X drops below / rises above ₹N".
//
// Each alert fires once when the price crosses its target, then stays quiet until the price
// moves back past the target by REARM (0.5%) — so a price hovering around the line doesn't
// send a notification every 15 minutes.
// @ts-ignore AsyncStorage may be installed without its type declarations.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { notify } from './notify';
import { Calibration, fetchSpot, inr, loadCalibration, Point, Rates, toRates } from './rates';
import { Item, refreshStoredItems } from './storage';

export type MetalKey = 'gold24' | 'gold22' | 'silver';
export type Direction = 'below' | 'above';

export type PriceAlert = {
  id: string;
  target: MetalKey | 'item';
  itemId?: string;
  /** What is being watched, e.g. "Gold 22K" or the product title. */
  label: string;
  dir: Direction;
  /** Gold: ₹ per gram. Silver: ₹ per kg. Products: ₹. All excluding GST, as shown in the app. */
  price: number;
  /** False after firing, until the price moves back across the target. */
  armed: boolean;
  firedAt?: number;
  createdAt: number;
};

export const METALS: { key: MetalKey; label: string; unit: string }[] = [
  { key: 'gold24', label: 'Gold 24K', unit: '/g' },
  { key: 'gold22', label: 'Gold 22K', unit: '/g' },
  { key: 'silver', label: 'Silver', unit: '/kg' },
];

export const unitOf = (a: { target: PriceAlert['target'] }) => METALS.find((m) => m.key === a.target)?.unit ?? '';

/** Metal price in the units alerts use: gold per gram, silver per kg. */
export const metalValue = (r: Rates, k: MetalKey) => (k === 'silver' ? r.silver * 1000 : r[k]);

/** Lowest and highest Bangalore price over the cached history (about one year). */
export function yearRange(history: Point[], cal: Calibration, k: MetalKey) {
  if (history.length < 30) return null;
  const vs = history.map((p) => metalValue(toRates({ ...p, at: p.t }, cal), k));
  return { lo: Math.min(...vs), hi: Math.max(...vs) };
}

const REARM = 0.005;
export const isHit = (a: Pick<PriceAlert, 'dir' | 'price'>, v: number) => (a.dir === 'below' ? v <= a.price : v >= a.price);
const movedBack = (a: PriceAlert, v: number) => (a.dir === 'below' ? v > a.price * (1 + REARM) : v < a.price * (1 - REARM));

// ---- storage ----
const KEY = 'pricewatch.alerts.v1';
const listeners = new Set<(list: PriceAlert[]) => void>();
let queue: Promise<unknown> = Promise.resolve();

export async function loadAlerts(): Promise<PriceAlert[]> {
  try { return JSON.parse((await AsyncStorage.getItem(KEY)) || '[]'); } catch { return []; }
}

/**
 * Read-modify-write, one at a time, so the Alerts screen and a price check running at the
 * same moment never overwrite each other. Return the same array to skip the write.
 */
export function updateAlerts(fn: (list: PriceAlert[]) => PriceAlert[]): Promise<PriceAlert[]> {
  const run = queue.then(async () => {
    const list = await loadAlerts();
    const next = fn(list);
    if (next !== list) {
      await AsyncStorage.setItem(KEY, JSON.stringify(next));
      listeners.forEach((l) => l(next));
    }
    return next;
  });
  queue = run.catch(() => {});
  return run;
}

export const subscribeAlerts = (l: (list: PriceAlert[]) => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};

export const removeAlert = (id: string) => updateAlerts((l) => l.filter((a) => a.id !== id));
export const removeAlertsForItem = (itemId: string) =>
  updateAlerts((l) => (l.some((a) => a.itemId === itemId) ? l.filter((a) => a.itemId !== itemId) : l));

// ---- checking ----
type Prices = { metals?: Rates; items?: Item[] };

function currentValue(a: PriceAlert, p: Prices): number | undefined {
  if (a.target === 'item') {
    const it = p.items?.find((i) => i.id === a.itemId);
    return it && !it.error ? it.price : undefined;
  }
  return p.metals ? metalValue(p.metals, a.target) : undefined;
}

function message(a: PriceAlert, now: number) {
  const unit = unitOf(a);
  if (a.target === 'item') {
    return {
      title: `${a.dir === 'below' ? '▼ Price drop' : '▲ Price rise'}: ${inr(now)}`,
      body: `${a.label} is now ${a.dir} your ${inr(a.price)} target.`,
      url: '/watchlist',
    };
  }
  return {
    title: `${a.label} ${a.dir === 'below' ? 'dropped below' : 'rose above'} ${inr(a.price)}${unit}`,
    body: `Now ${inr(now)}${unit} in Bangalore (excl. GST).`,
    url: '/',
  };
}

/** Compares alerts with the given prices, sends notifications for new crossings and re-arms the rest. */
export async function evaluateAlerts(prices: Prices) {
  const fired: { title: string; body: string; url: string }[] = [];
  await updateAlerts((list) => {
    let changed = false;
    const next = list.map((a) => {
      const v = currentValue(a, prices);
      if (v == null) return a;
      if (a.armed && isHit(a, v)) {
        changed = true;
        fired.push(message(a, v));
        return { ...a, armed: false, firedAt: Date.now() };
      }
      if (!a.armed && movedBack(a, v)) { changed = true; return { ...a, armed: true }; }
      return a;
    });
    return changed ? next : list;
  });
  for (const f of fired) await notify(f.title, f.body, f.url).catch(() => {});
}

/**
 * Fetches only the prices that alerts need, then evaluates them. Used by the background task
 * and by pull-to-refresh on the Alerts screen (`includeMetals` fetches rates even without metal alerts).
 */
export async function runPriceCheck(opts: { includeMetals?: boolean } = {}): Promise<Prices> {
  const alerts = await loadAlerts();
  const needMetals = opts.includeMetals || alerts.some((a) => a.target !== 'item');
  const itemIds = new Set(alerts.filter((a) => a.target === 'item' && a.itemId).map((a) => a.itemId!));
  const [metals, items] = await Promise.all([
    needMetals ? Promise.all([fetchSpot(), loadCalibration()]).then(([s, c]) => toRates(s, c)).catch(() => undefined) : undefined,
    itemIds.size ? refreshStoredItems(itemIds).catch(() => undefined) : undefined,
  ]);
  if (alerts.length) await evaluateAlerts({ metals, items });
  return { metals, items };
}
