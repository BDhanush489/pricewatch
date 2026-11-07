import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { inr, Rates } from '../lib/rates';
import type { RatesWidgetProps } from './RatesWidget';

// The widget native module only exists in a development/release build with the
// expo-widgets plugin — not in Expo Go. Check first: requiring a module whose native
// side is missing is reported as a fatal error in dev, even inside try/catch.
const widgetsAvailable = Platform.OS === 'android' && requireOptionalNativeModule('ExpoWidgets') != null;

function change(now: number, prev?: number) {
  if (!prev) return { text: '', up: null };
  const p = ((now - prev) / prev) * 100;
  if (Math.abs(p) < 0.005) return { text: '0.00% today', up: null };
  return { text: `${p > 0 ? '▲' : '▼'} ${Math.abs(p).toFixed(2)}% today`, up: p > 0 };
}

/**
 * Pushes the latest Bangalore rates to the Android home-screen widget. No-op in Expo Go, iOS and web.
 * @param prev yesterday's rates, for the ▲/▼ daily change
 */
export function updateRatesWidget(r: Rates, prev: Rates | undefined, dark: boolean) {
  if (!widgetsAvailable) return;
  const g = change(r.gold24, prev?.gold24);
  const s = change(r.silver, prev?.silver);
  const props: RatesWidgetProps = {
    dark,
    gold24: inr(r.gold24),
    gold22: inr(r.gold22),
    silver: inr(r.silver * 1000),
    goldChange: g.text, goldUp: g.up,
    silverChange: s.text, silverUp: s.up,
    updated: 'Updated ' + new Date(r.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
  };
  try {
    // Lazy require so Expo Go / iOS / web never load the widget module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./RatesWidget').default.updateSnapshot(props);
  } catch {
    // Widget not on the home screen yet, or native call failed — not fatal for the app.
  }
}
