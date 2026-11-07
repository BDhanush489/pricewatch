// Live + historical gold/silver rates, converted to Bangalore board rates in ₹ per gram (excl. GST).
//
// How it works (there is no free official Bangalore-rate API):
//   1. Fetch the live international spot price (USD / troy oz) and USD→INR.
//   2. Convert to ₹ per gram  →  "spot ₹/g".
//   3. Multiply by a calibration factor that captures import duty + the Indian domestic premium.
//      The factor is matched to a real Bangalore board rate, and the user can re-match it in the app
//      ("Match my jeweller's rate") whenever their jeweller's board differs.
// Because history uses the same factor, the chart and buy advice line up with Bangalore prices too.
// @ts-ignore AsyncStorage may be installed without its type declarations.
import AsyncStorage from '@react-native-async-storage/async-storage';

export const TROY_OZ_G = 31.1035;
export const GST = 0.03;
export const PURITY_22K = 0.9167; // 916 gold

export type Metal = 'gold' | 'silver';

/** International spot price converted to ₹ per gram (no duty, no premium). */
export type Spot = { gold: number; silver: number; at: number };
export type Point = { t: number; gold: number; silver: number }; // daily spot ₹/g

/** Bangalore board rate = spot ₹/g × factor. */
export type Calibration = { gold: number; silver: number; goldSetAt?: number; silverSetAt?: number };
// Gold: matched to the Bangalore 24K board rate of ₹14,618/g reported on 7 Nov 2026.
// Silver: import duty only (6%) until the user matches it to their jeweller's rate.
export const DEFAULT_CAL: Calibration = { gold: 1.186, silver: 1.06 };

/** ₹ per gram, Bangalore board rate (excl. GST). */
export type Rates = { gold24: number; gold22: number; silver: number; at: number };
export const toRates = (s: Spot, c: Calibration): Rates => ({
  gold24: s.gold * c.gold,
  gold22: s.gold * c.gold * PURITY_22K,
  silver: s.silver * c.silver,
  at: s.at,
});

const perGram = (usdPerOz: number, usdInr: number) => (usdPerOz / TROY_OZ_G) * usdInr;

const getJson = async (url: string) => {
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

const yahoo = (symbol: string, range: string) =>
  getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`)
    .then((j) => j.chart.result[0]);

export async function fetchSpot(): Promise<Spot> {
  const [xau, xag, fx] = await Promise.allSettled([
    getJson('https://api.gold-api.com/price/XAU'),
    getJson('https://api.gold-api.com/price/XAG'),
    getJson('https://open.er-api.com/v6/latest/USD'),
  ]);
  let goldOz = xau.status === 'fulfilled' ? Number(xau.value.price) : 0;
  let silverOz = xag.status === 'fulfilled' ? Number(xag.value.price) : 0;
  let usdInr = fx.status === 'fulfilled' ? Number(fx.value?.rates?.INR) : 0;

  // Fallback: Yahoo Finance quotes if any primary source failed.
  if (!goldOz) goldOz = (await yahoo('GC=F', '1d')).meta.regularMarketPrice;
  if (!silverOz) silverOz = (await yahoo('SI=F', '1d')).meta.regularMarketPrice;
  if (!usdInr) usdInr = (await yahoo('INR=X', '1d')).meta.regularMarketPrice;
  if (!goldOz || !silverOz || !usdInr) throw new Error('Rates unavailable right now');

  return { gold: perGram(goldOz, usdInr), silver: perGram(silverOz, usdInr), at: Date.now() };
}

/** One year of daily closes as spot ₹/gram. */
export async function fetchHistory(): Promise<Point[]> {
  const [g, s, fx] = await Promise.all([yahoo('GC=F', '1y'), yahoo('SI=F', '1y'), yahoo('INR=X', '1y')]);
  const day = (t: number) => Math.floor(t / 86400);
  const series = (r: any) => {
    const m = new Map<number, number>();
    const closes: (number | null)[] = r.indicators.quote[0].close;
    r.timestamp.forEach((t: number, i: number) => closes[i] && m.set(day(t), closes[i] as number));
    return m;
  };
  const gm = series(g), sm = series(s), fm = series(fx);
  const days = [...new Set([...gm.keys(), ...sm.keys()])].sort((a, b) => a - b);
  const out: Point[] = [];
  let lastG = 0, lastS = 0, lastF = fm.values().next().value ?? 0;
  for (const d of days) {
    lastG = gm.get(d) ?? lastG;
    lastS = sm.get(d) ?? lastS;
    lastF = fm.get(d) ?? lastF;
    if (lastG && lastS && lastF) out.push({ t: d * 86400_000, gold: perGram(lastG, lastF), silver: perGram(lastS, lastF) });
  }
  return out;
}

// ---- persistence ----
const CACHE_KEY = 'pricewatch.spot.v3';
const CAL_KEY = 'pricewatch.calibration.v1';
export type Cache = { spot?: Spot; history?: Point[] };

const readJson = async <T,>(key: string, fallback: T): Promise<T> => {
  try { const v = await AsyncStorage.getItem(key); return v ? { ...fallback, ...JSON.parse(v) } : fallback; } catch { return fallback; }
};
export const loadCache = () => readJson<Cache>(CACHE_KEY, {});
/** Merges into the saved cache, so saving only `spot` keeps the saved history. */
export const saveCache = async (c: Cache) => {
  try { await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ ...(await loadCache()), ...c })); } catch {}
};
export const loadCalibration = () => readJson<Calibration>(CAL_KEY, DEFAULT_CAL);
export const saveCalibration = (c: Calibration) => AsyncStorage.setItem(CAL_KEY, JSON.stringify(c)).catch(() => {});

// ---- formatting ----
export const inr = (n?: number, digits = 0) =>
  n == null || !isFinite(n) ? '—' : '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: digits });
export const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
