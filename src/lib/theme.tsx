import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
// @ts-ignore AsyncStorage may be installed without its type declarations.
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Mode = 'light' | 'dark';

const light = {
  bg: '#f7f5f0', card: '#ffffff', border: '#ece7dc',
  text: '#1d1b16', sub: '#6b665b', faint: '#a09a8d',
  segBg: '#f1ede4', segText: '#5f5a50',
  gold: '#b7860b', goldSoft: '#fbf4df', silver: '#5f6b7a', silverSoft: '#eef1f5',
  accentText: '#ffffff',
  up: '#15803d', down: '#dc2626', upBg: '#e8f6ed', fair: '#a16207', fairBg: '#fdf5da', downBg: '#fdecec',
  tabBar: '#ffffff', input: '#f4f1ea',
};
const dark: typeof light = {
  bg: '#0b0b0f', card: '#16161c', border: '#24242c',
  text: '#ffffff', sub: '#9a9aa5', faint: '#62626c',
  segBg: '#0f0f14', segText: '#b0b0b8',
  gold: '#f5c542', goldSoft: '#241e0e', silver: '#c0c7d1', silverSoft: '#1b1d22',
  accentText: '#000000',
  up: '#4ade80', down: '#f87171', upBg: '#14321f', fair: '#facc15', fairBg: '#332a10', downBg: '#3a1616',
  tabBar: '#111116', input: '#1d1d24',
};
export type Colors = typeof light;

type Ctx = { mode: Mode; c: Colors; toggle: () => void };
const ThemeCtx = createContext<Ctx>({ mode: 'light', c: light, toggle: () => {} });
const KEY = 'pricewatch.theme.v1';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>('light');
  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v: string | null) => { if (v === 'dark' || v === 'light') setMode(v); }).catch(() => {});
  }, []);
  const toggle = useCallback(() => setMode((m) => {
    const next = m === 'light' ? 'dark' : 'light';
    AsyncStorage.setItem(KEY, next).catch(() => {});
    return next;
  }), []);
  const value = useMemo(() => ({ mode, c: mode === 'light' ? light : dark, toggle }), [mode, toggle]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
