import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTabBarSpace } from '../components/GlassTabBar';
import { PriceChart } from '../components/PriceChart';
import { analyse } from '../lib/advice';
import { evaluateAlerts } from '../lib/alerts';
import {
  Calibration, DEFAULT_CAL, fetchHistory, fetchSpot, GST, inr, loadCache, loadCalibration, Metal, pct, Point,
  PURITY_22K, saveCache, saveCalibration, Spot, toRates,
} from '../lib/rates';
import { Colors, useTheme } from '../lib/theme';
import { updateRatesWidget } from '../widgets/updateWidget';

const REFRESH_MS = 60_000;

type Purity = '24K' | '22K';
const UNITS: Record<Metal, { label: string; grams: number }[]> = {
  gold: [{ label: '1 g', grams: 1 }, { label: '10 g', grams: 10 }, { label: '100 g', grams: 100 }],
  silver: [{ label: '1 g', grams: 1 }, { label: '100 g', grams: 100 }, { label: '1 kg', grams: 1000 }],
};
const DEFAULT_UNIT: Record<Metal, number> = { gold: 0, silver: 2 };
const RANGES = [{ k: '1W', d: 7 }, { k: '1M', d: 30 }, { k: '3M', d: 90 }, { k: '6M', d: 180 }, { k: '1Y', d: 366 }];

export default function RatesScreen() {
  const { c, mode, toggle } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const bottomSpace = useTabBarSpace();

  const [spot, setSpot] = useState<Spot | null>(null);
  const [history, setHistory] = useState<Point[]>([]);
  const [cal, setCal] = useState<Calibration>(DEFAULT_CAL);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [metal, setMetal] = useState<Metal>('gold');
  const [purity, setPurity] = useState<Purity>('24K');
  const [unitIdx, setUnitIdx] = useState(0);
  const [range, setRange] = useState('1M');
  const [editing, setEditing] = useState(false);

  const load = useCallback(async (withHistory: boolean) => {
    try {
      const [live, hist] = await Promise.all([fetchSpot(), withHistory ? fetchHistory().catch(() => null) : null]);
      setSpot(live);
      setError(null);
      if (hist?.length) setHistory(hist);
      saveCache({ spot: live, ...(hist?.length ? { history: hist } : {}) });
    } catch (e: any) {
      setError(e?.message ?? 'Could not load rates');
    }
  }, []);

  useEffect(() => {
    (async () => {
      const [cache, savedCal] = await Promise.all([loadCache(), loadCalibration()]);
      setCal(savedCal);
      if (cache.spot) setSpot((x) => x ?? cache.spot!);
      if (cache.history?.length) setHistory((h) => (h.length ? h : cache.history!));
      await load(true);
    })();
    const t = setInterval(() => load(false), REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const rates = useMemo(() => (spot ? toRates(spot, cal) : null), [spot, cal]);

  // "Now" = time of the latest fetch (keeps render pure). Previous close = last point before today.
  const now = spot?.at ?? history[history.length - 1]?.t ?? 0;
  const todayStart = Math.floor(now / 86400_000) * 86400_000;
  const prevPoint = useMemo(() => [...history].reverse().find((p) => p.t < todayStart), [history, todayStart]);
  const prevRates = useMemo(() => (prevPoint ? toRates({ ...prevPoint, at: prevPoint.t }, cal) : undefined), [prevPoint, cal]);

  // Keep the home-screen widget in sync with rates and theme.
  useEffect(() => { if (rates) updateRatesWidget(rates, prevRates, mode === 'dark'); }, [rates, prevRates, mode]);

  // Price alerts are also checked on every refresh while the app is open (each minute).
  // Only live rates count — the cached rates shown at launch may be days old.
  useEffect(() => {
    if (rates && Date.now() - rates.at < 10 * 60_000) evaluateAlerts({ metals: rates });
  }, [rates]);

  const onRefresh = async () => { setRefreshing(true); await load(true); setRefreshing(false); };

  const color = metal === 'gold' ? c.gold : c.silver;
  const factor = metal === 'gold' ? cal.gold * (purity === '22K' ? PURITY_22K : 1) : cal.silver;
  const unit = UNITS[metal][Math.min(unitIdx, UNITS[metal].length - 1)];
  const perGram = spot ? (metal === 'gold' ? spot.gold : spot.silver) * factor : undefined;
  const price = perGram != null ? perGram * unit.grams : undefined;

  // Daily series for the selected metal/purity in Bangalore ₹/g.
  const daily = useMemo(
    () => history.map((p) => ({ t: p.t, v: (metal === 'gold' ? p.gold : p.silver) * factor })),
    [history, metal, factor],
  );
  const prevClose = prevPoint ? (metal === 'gold' ? prevPoint.gold : prevPoint.silver) * factor : undefined;
  const dayChange = perGram != null && prevClose ? ((perGram - prevClose) / prevClose) * 100 : undefined;

  const chartData = useMemo(() => {
    const days = RANGES.find((r) => r.k === range)!.d;
    const cutoff = now - days * 86400_000;
    const pts = daily.filter((p) => p.t >= cutoff).map((p) => ({ t: p.t, v: p.v * unit.grams }));
    if (spot && perGram != null && pts.length) pts.push({ t: spot.at, v: perGram * unit.grams });
    return pts;
  }, [daily, range, unit.grams, spot, perGram, now]);

  const advice = useMemo(
    () => (perGram != null ? analyse(daily.map((d) => d.v), perGram) : null),
    [daily, perGram],
  );

  const pick = (m: Metal, p?: Purity) => { setMetal(m); if (p) setPurity(p); setUnitIdx(DEFAULT_UNIT[m]); };

  const onSaveCal = (gold24PerGram?: number, silverPerKg?: number) => {
    if (!spot) return;
    const next: Calibration = { ...cal };
    if (gold24PerGram) { next.gold = gold24PerGram / spot.gold; next.goldSetAt = Date.now(); }
    if (silverPerKg) { next.silver = silverPerKg / 1000 / spot.silver; next.silverSetAt = Date.now(); }
    setCal(next); saveCalibration(next); setEditing(false);
  };
  const onResetCal = () => { setCal(DEFAULT_CAL); saveCalibration(DEFAULT_CAL); setEditing(false); };

  const verdictStyle = {
    buy: { bg: c.upBg, fg: c.up, icon: '✅' },
    fair: { bg: c.fairBg, fg: c.fair, icon: '⚖️' },
    wait: { bg: c.downBg, fg: c.down, icon: '⏳' },
  } as const;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: bottomSpace }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.sub} />}
      >
        {/* Header */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.h1}>Bangalore rates</Text>
            <Text style={s.sub}>
              {rates
                ? `● Live · updated ${new Date(rates.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} · excl. GST`
                : 'Loading…'}
            </Text>
          </View>
          <Pressable onPress={toggle} style={s.iconBtn} accessibilityLabel="Switch light or dark mode">
            <Text style={{ fontSize: 18 }}>{mode === 'light' ? '🌙' : '☀️'}</Text>
          </Pressable>
        </View>

        {error && (
          <Pressable style={[s.banner, { backgroundColor: c.downBg }]} onPress={onRefresh}>
            <Text style={{ color: c.down, fontSize: 13 }}>{error}{rates ? ' · showing last saved rates' : ''} · tap to retry</Text>
          </Pressable>
        )}

        {/* Quick glance */}
        <View style={s.glance}>
          <Glance s={s} c={c} label="Gold 24K" unit="per gram" value={inr(rates?.gold24)} color={c.gold} soft={c.goldSoft}
            active={metal === 'gold' && purity === '24K'} onPress={() => pick('gold', '24K')} />
          <Glance s={s} c={c} label="Gold 22K" unit="per gram" value={inr(rates?.gold22)} color={c.gold} soft={c.goldSoft}
            active={metal === 'gold' && purity === '22K'} onPress={() => pick('gold', '22K')} />
          <Glance s={s} c={c} label="Silver" unit="per kg" value={inr(rates ? rates.silver * 1000 : undefined)} color={c.silver}
            soft={c.silverSoft} active={metal === 'silver'} onPress={() => pick('silver')} />
        </View>

        {/* Main price card */}
        <View style={s.card}>
          <Text style={[s.label, { color }]}>
            {metal === 'gold' ? `GOLD ${purity} · ${purity === '24K' ? '99.9%' : '91.6%'}` : 'SILVER · 999'}
          </Text>
          <Text style={s.big} numberOfLines={1} adjustsFontSizeToFit>{inr(price)}</Text>
          <Text style={s.sub}>for {unit.label} · Bangalore board rate</Text>
          <View style={s.row}>
            {dayChange != null && (
              <View style={[s.pill, { backgroundColor: dayChange >= 0 ? c.upBg : c.downBg }]}>
                <Text style={{ color: dayChange >= 0 ? c.up : c.down, fontWeight: '700', fontSize: 13 }}>
                  {dayChange >= 0 ? '▲' : '▼'} {pct(dayChange)} today
                </Text>
              </View>
            )}
            <Text style={s.gst}>With 3% GST: {inr(price != null ? price * (1 + GST) : undefined)}</Text>
          </View>
          <Segmented s={s} c={c} options={UNITS[metal].map((u) => u.label)} value={unit.label}
            onChange={(l) => setUnitIdx(UNITS[metal].findIndex((u) => u.label === l))} color={color} />
        </View>

        {/* Calibration */}
        <View style={s.card}>
          {!editing ? (
            <Pressable onPress={() => setEditing(true)} style={s.calRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitleSm}>Rate different at your jeweller?</Text>
                <Text style={s.sub}>
                  {cal.goldSetAt || cal.silverSetAt
                    ? `Matched to your rate on ${new Date(Math.max(cal.goldSetAt ?? 0, cal.silverSetAt ?? 0)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                    : 'Enter today’s board rate once — all prices, the chart and the widget will follow it.'}
                </Text>
              </View>
              <Text style={[s.link, { color: c.gold }]}>Adjust</Text>
            </Pressable>
          ) : (
            <CalibrationForm s={s} c={c} current={rates} onSave={onSaveCal} onReset={onResetCal} onCancel={() => setEditing(false)} />
          )}
        </View>

        {/* Chart */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Price trend</Text>
          <PriceChart data={chartData} color={color} unitLabel={`/ ${unit.label}`} />
          <Segmented s={s} c={c} options={RANGES.map((r) => r.k)} value={range} onChange={setRange} color={color} />
        </View>

        {/* Best time to buy */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Best time to buy?</Text>
          {!advice ? (
            <Text style={s.sub}>Needs price history — pull down to refresh.</Text>
          ) : (
            <>
              <View style={[s.verdict, { backgroundColor: verdictStyle[advice.verdict].bg }]}>
                <Text style={[s.verdictTxt, { color: verdictStyle[advice.verdict].fg }]}>
                  {verdictStyle[advice.verdict].icon} {advice.headline}
                </Text>
                <Text style={s.sub}>{metal === 'gold' ? 'Applies to both 24K and 22K gold' : 'Silver'}</Text>
              </View>
              {advice.reasons.map((r) => <Text key={r} style={s.reason}>• {r}</Text>)}
              <RangeBar s={s} c={c} pos={advice.rangePos} color={color} />
              {advice.targetPrice != null && (
                <Text style={s.reason}>
                  🎯 Better entry: around <Text style={{ color: c.text, fontWeight: '700' }}>
                    {inr(advice.targetPrice * unit.grams)}</Text> for {unit.label}
                </Text>
              )}
              <Text style={s.tip}>
                {metal === 'gold'
                  ? 'Tip: 24K (99.9%) suits coins and bars for investment. 22K (91.6%) is used for jewellery — jewellers add making charges and wastage on top of this rate.'
                  : 'Tip: silver swings more than gold. Buying in small parts over a few weeks smooths out the price you pay.'}
              </Text>
              <Text style={s.disclaimer}>Based on price trends only. Not financial advice.</Text>
            </>
          )}
        </View>

        <Text style={s.disclaimer}>
          Prices follow live international rates, matched to the Bangalore board rate. GST (3%) and making charges are extra.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

type S = ReturnType<typeof makeStyles>;

function Glance({ s, c, label, unit, value, active, onPress, color, soft }: {
  s: S; c: Colors; label: string; unit: string; value: string; active: boolean; onPress: () => void; color: string; soft: string;
}) {
  return (
    <Pressable onPress={onPress} style={[s.glanceItem, active && { borderColor: color, backgroundColor: soft }]}>
      <Text style={[s.glanceLabel, { color: active ? color : c.sub }]}>{label}</Text>
      <Text style={s.glanceVal} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={s.glanceUnit}>{unit}</Text>
    </Pressable>
  );
}

function Segmented({ s, c, options, value, onChange, color }: {
  s: S; c: Colors; options: string[]; value: string; onChange: (v: string) => void; color: string;
}) {
  return (
    <View style={s.seg}>
      {options.map((o) => (
        <Pressable key={o} onPress={() => onChange(o)} style={[s.segItem, value === o && { backgroundColor: color }]}>
          <Text style={[s.segTxt, value === o && { color: c.accentText, fontWeight: '700' }]}>{o}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function RangeBar({ s, c, pos, color }: { s: S; c: Colors; pos: number; color: string }) {
  const p = Math.max(0, Math.min(1, pos));
  return (
    <View style={{ marginTop: 14 }}>
      <View style={[s.rangeTrack, { backgroundColor: c.segBg }]}>
        <View style={[s.rangeDot, { left: `${p * 100}%`, backgroundColor: color, borderColor: c.card }]} />
      </View>
      <View style={s.rangeLabels}>
        <Text style={s.disclaimer}>1-yr low</Text>
        <Text style={s.disclaimer}>today</Text>
        <Text style={s.disclaimer}>1-yr high</Text>
      </View>
    </View>
  );
}

function CalibrationForm({ s, c, current, onSave, onReset, onCancel }: {
  s: S; c: Colors; current: { gold24: number; silver: number } | null;
  onSave: (gold24?: number, silverKg?: number) => void; onReset: () => void; onCancel: () => void;
}) {
  const [gold, setGold] = useState(current ? Math.round(current.gold24).toString() : '');
  const [silver, setSilver] = useState(current ? Math.round(current.silver * 1000).toString() : '');
  const num = (t: string) => { const n = parseFloat(t.replace(/[^\d.]/g, '')); return isFinite(n) && n > 0 ? n : undefined; };
  return (
    <View>
      <Text style={s.cardTitleSm}>Match your jeweller’s board rate</Text>
      <Text style={[s.sub, { marginBottom: 12 }]}>Enter today’s rate without GST. You can update it any time.</Text>
      <Text style={s.inputLabel}>Gold 24K — per gram (₹)</Text>
      <TextInput style={s.input} value={gold} onChangeText={setGold} keyboardType="numeric" placeholder="e.g. 14618" placeholderTextColor={c.faint} />
      <Text style={s.inputLabel}>Silver — per kg (₹)</Text>
      <TextInput style={s.input} value={silver} onChangeText={setSilver} keyboardType="numeric" placeholder="e.g. 185000" placeholderTextColor={c.faint} />
      <Text style={[s.disclaimer, { marginTop: 4 }]}>22K is set automatically at 91.6% of 24K.</Text>
      <View style={[s.row, { marginTop: 14 }]}>
        <Pressable style={[s.btn, { backgroundColor: c.gold }]} onPress={() => onSave(num(gold), num(silver))}>
          <Text style={{ color: c.accentText, fontWeight: '700' }}>Save</Text>
        </Pressable>
        <Pressable style={[s.btn, { backgroundColor: c.segBg }]} onPress={onCancel}>
          <Text style={{ color: c.text, fontWeight: '600' }}>Cancel</Text>
        </Pressable>
        <Pressable onPress={onReset} style={{ marginLeft: 'auto' }}>
          <Text style={[s.link, { color: c.sub }]}>Reset</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (c: Colors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  content: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  h1: { color: c.text, fontSize: 26, fontWeight: '800' },
  sub: { color: c.sub, fontSize: 13, marginTop: 4, lineHeight: 18 },
  iconBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
  banner: { padding: 12, borderRadius: 12, marginBottom: 12 },
  glance: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  glanceItem: { flex: 1, backgroundColor: c.card, borderRadius: 16, padding: 12, borderWidth: 1.5, borderColor: c.border },
  glanceLabel: { fontSize: 12, fontWeight: '700' },
  glanceVal: { color: c.text, fontSize: 17, fontWeight: '800', marginTop: 6 },
  glanceUnit: { color: c.faint, fontSize: 11, marginTop: 2 },
  card: { backgroundColor: c.card, borderRadius: 20, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: c.border },
  cardTitle: { color: c.text, fontSize: 17, fontWeight: '700', marginBottom: 14 },
  cardTitleSm: { color: c.text, fontSize: 15, fontWeight: '700' },
  label: { fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  big: { color: c.text, fontSize: 40, fontWeight: '800', marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  gst: { color: c.sub, fontSize: 13 },
  seg: { flexDirection: 'row', backgroundColor: c.segBg, borderRadius: 12, padding: 4, marginTop: 16 },
  segItem: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  segTxt: { color: c.segText, fontSize: 13 },
  calRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  link: { fontSize: 14, fontWeight: '700' },
  inputLabel: { color: c.sub, fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 6 },
  input: { backgroundColor: c.input, color: c.text, borderRadius: 12, paddingHorizontal: 14, minHeight: 46, fontSize: 16, borderWidth: 1, borderColor: c.border },
  btn: { paddingHorizontal: 20, paddingVertical: 11, borderRadius: 12 },
  verdict: { borderRadius: 14, padding: 14, marginBottom: 10 },
  verdictTxt: { fontSize: 18, fontWeight: '800' },
  reason: { color: c.text, opacity: 0.85, fontSize: 14, lineHeight: 21, marginTop: 4 },
  tip: { color: c.sub, fontSize: 13, lineHeight: 19, marginTop: 14 },
  disclaimer: { color: c.faint, fontSize: 11, marginTop: 8, lineHeight: 16 },
  rangeTrack: { height: 6, borderRadius: 3, marginHorizontal: 8 },
  rangeDot: { position: 'absolute', top: -5, width: 16, height: 16, borderRadius: 8, marginLeft: -8, borderWidth: 2 },
  rangeLabels: { flexDirection: 'row', justifyContent: 'space-between' },
});
