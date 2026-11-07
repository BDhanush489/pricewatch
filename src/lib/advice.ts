// "Is now a good time to buy?" — a simple, explainable trend signal from 1 year of daily prices.
// It looks at four things a careful buyer would check by hand:
//   1. price vs its 50-day average      (buying below average = buying a dip)
//   2. 14-day RSI momentum              (<35 oversold, >70 overheated)
//   3. where today sits in the 1-year range
//   4. the last 30 days' move
// 22K gold is priced as 91.6% of 24K, so the timing signal is the same for both purities.

export type Verdict = 'buy' | 'fair' | 'wait';
export type Advice = {
  verdict: Verdict;
  headline: string;
  reasons: string[];
  targetPrice?: number; // a better entry level to watch for (₹/g)
  sma50: number;
  rangePos: number; // 0 = 1-year low, 1 = 1-year high
};

const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;

function rsi(prices: number[], period = 14) {
  if (prices.length <= period) return 50;
  let gain = 0, loss = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const d = prices[i] - prices[i - 1];
    if (d > 0) gain += d; else loss -= d;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

export function analyse(prices: number[], current: number): Advice | null {
  if (prices.length < 60) return null;
  const sma50 = avg(prices.slice(-50));
  const lo = Math.min(...prices), hi = Math.max(...prices);
  const rangePos = hi > lo ? (current - lo) / (hi - lo) : 0.5;
  const r = rsi([...prices, current]);
  const ref30 = prices[prices.length - 22] ?? prices[0]; // ~22 trading days
  const ch30 = ((current - ref30) / ref30) * 100;
  const vsAvg = ((current - sma50) / sma50) * 100;

  let score = 0;
  const reasons: string[] = [];

  if (vsAvg <= -2) { score++; reasons.push(`Price is ${Math.abs(vsAvg).toFixed(1)}% below its 50-day average — a dip.`); }
  else if (vsAvg >= 4) { score--; reasons.push(`Price is ${vsAvg.toFixed(1)}% above its 50-day average — stretched.`); }
  else reasons.push(`Price is close to its 50-day average (${vsAvg >= 0 ? '+' : ''}${vsAvg.toFixed(1)}%).`);

  if (r < 35) { score++; reasons.push('Momentum is weak (oversold) — selling pressure may be easing.'); }
  else if (r > 70) { score--; reasons.push('Momentum is overheated — short-term pullbacks are common from here.'); }

  if (rangePos < 0.3) { score++; reasons.push('Near the lower part of its 1-year range.'); }
  else if (rangePos > 0.9) { score--; reasons.push('Trading near its 1-year high.'); }

  if (ch30 <= -5) { score++; reasons.push(`Down ${Math.abs(ch30).toFixed(1)}% in the last month.`); }
  else if (ch30 >= 8) { score--; reasons.push(`Up ${ch30.toFixed(1)}% in the last month — a sharp run-up.`); }

  const verdict: Verdict = score >= 2 ? 'buy' : score <= -2 ? 'wait' : 'fair';
  const headline =
    verdict === 'buy' ? 'Good time to buy'
    : verdict === 'wait' ? 'Consider waiting for a dip'
    : 'Fair price — buy in parts';

  return {
    verdict, headline, reasons, sma50, rangePos,
    targetPrice: verdict === 'buy' ? undefined : Math.min(sma50, current * 0.97),
  };
}
