import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTabBarSpace } from '../components/GlassTabBar';
import {
  Direction, evaluateAlerts, isHit, loadAlerts, MetalKey, METALS, metalValue, PriceAlert, removeAlert,
  runPriceCheck, subscribeAlerts, unitOf, updateAlerts, yearRange,
} from '../lib/alerts';
import { getPermission, notify, PermissionState, requestPermission } from '../lib/notify';
import { Calibration, DEFAULT_CAL, fetchSpot, inr, loadCache, loadCalibration, Point, Rates, saveCache, toRates } from '../lib/rates';
import { Item, loadItems } from '../lib/storage';
import { Colors, useTheme } from '../lib/theme';
import { syncPriceCheckTask } from '../tasks/priceCheck';

const isMetal = (k: string): k is MetalKey => METALS.some((m) => m.key === k);
const num = (t: string) => { const n = parseFloat(t.replace(/[^\d.]/g, '')); return isFinite(n) && n > 0 ? n : undefined; };
const when = (t: number) => new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const short = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const back = (d: Direction) => (d === 'below' ? 'above' : 'below');

type Preset = { label: string; v: number; dir: Direction };

export default function AlertsScreen() {
  const { c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const bottomSpace = useTabBarSpace();

  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [rates, setRates] = useState<Rates | null>(null);
  const [history, setHistory] = useState<Point[]>([]);
  const [cal, setCal] = useState<Calibration>(DEFAULT_CAL);
  const [items, setItems] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [perm, setPerm] = useState<PermissionState>('granted');
  const [refreshing, setRefreshing] = useState(false);

  // New-alert form
  const [sel, setSel] = useState('gold22');
  const [dir, setDir] = useState<Direction>('below');
  const [price, setPrice] = useState('');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => subscribeAlerts(setAlerts), []);

  // Reload whenever the tab is shown: products may have been added on the RAM / SSD tab.
  useFocusEffect(useCallback(() => {
    let live = true;
    (async () => {
      const [cache, savedCal, its, list, p] = await Promise.all([loadCache(), loadCalibration(), loadItems(), loadAlerts(), getPermission()]);
      if (!live) return;
      setCal(savedCal); setItems(its); setAlerts(list); setPerm(p); setLoaded(true);
      if (cache.history?.length) setHistory(cache.history);
      if (cache.spot) setRates(toRates(cache.spot, savedCal));
      try {
        const spot = await fetchSpot();
        if (!live) return;
        const r = toRates(spot, savedCal);
        setRates(r);
        saveCache({ spot });
        evaluateAlerts({ metals: r });
      } catch {
        // Offline: keep showing the saved rates.
      }
    })();
    return () => { live = false; };
  }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    const r = await runPriceCheck({ includeMetals: true });
    if (r.metals) setRates(r.metals);
    setItems(r.items ?? (await loadItems()));
    setRefreshing(false);
  };

  // ---- form ----
  const options = useMemo(() => [
    ...METALS.map((m) => ({ key: m.key as string, label: m.label })),
    ...items.map((i) => ({ key: `item:${i.id}`, label: `${i.category} · ${short(i.title, 24)}` })),
  ], [items]);
  const selItem = sel.startsWith('item:') ? items.find((i) => `item:${i.id}` === sel) : undefined;
  const key = isMetal(sel) || selItem ? sel : 'gold22'; // falls back if the product was removed
  const unit = isMetal(key) ? unitOf({ target: key }) : '';
  const now = isMetal(key) ? (rates ? metalValue(rates, key) : undefined) : selItem?.error ? undefined : selItem?.price;
  const range = useMemo(() => (isMetal(key) ? yearRange(history, cal, key) : null), [history, cal, key]);

  const presets = useMemo(() => {
    if (now == null) return [];
    const p: Preset[] = [];
    // "New 1-year high/low" = just beyond the highest/lowest price seen, so it fires on a fresh record.
    if (range) p.push({ label: '▼ New 1-yr low', v: Math.min(range.lo, now) - 1, dir: 'below' });
    p.push(
      { label: '−5%', v: now * 0.95, dir: 'below' },
      { label: '−2%', v: now * 0.98, dir: 'below' },
      { label: '+2%', v: now * 1.02, dir: 'above' },
      { label: '+5%', v: now * 1.05, dir: 'above' },
    );
    if (range) p.push({ label: '▲ New 1-yr high', v: Math.max(range.hi, now) + 1, dir: 'above' });
    return p;
  }, [now, range]);

  const ensurePermission = async () => {
    const p = perm === 'granted' ? perm : await requestPermission();
    setPerm(p);
    return p;
  };

  const onCreate = async () => {
    const target = num(price);
    if (!target) { setMsg({ text: 'Enter a target price first.', ok: false }); return; }
    const label = isMetal(key) ? METALS.find((m) => m.key === key)!.label : selItem!.title;
    const already = now != null && isHit({ dir, price: target }, now);
    const alert: PriceAlert = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      target: isMetal(key) ? key : 'item',
      itemId: selItem?.id,
      label, dir, price: target,
      armed: !already,
      createdAt: Date.now(),
    };
    await updateAlerts((l) => [alert, ...l]);
    setPrice('');
    syncPriceCheckTask();
    await ensurePermission();
    setMsg(already
      ? { text: `It’s already ${dir} ${inr(target)}${unit} (now ${inr(now)}${unit}), so this alert starts once the price moves back ${back(dir)} it.`, ok: false }
      : { text: `Alert set. You’ll get a notification when ${short(label, 40)} ${dir === 'below' ? 'drops below' : 'rises above'} ${inr(target)}${unit}.`, ok: true });
  };

  const onDelete = (id: string) => { removeAlert(id).then(() => syncPriceCheckTask()); };

  const onTest = async () => {
    if ((await ensurePermission()) !== 'granted') return;
    await notify('PriceWatch alerts are on', 'You’ll get a notification like this when a price hits your target.', '/alerts');
  };

  const valueFor = (a: PriceAlert) => {
    if (a.target !== 'item') return rates ? metalValue(rates, a.target) : undefined;
    const it = items.find((i) => i.id === a.itemId);
    return it && !it.error ? it.price : undefined;
  };
  const sorted = [...alerts].sort((a, b) => b.createdAt - a.createdAt);
  const native = Platform.OS !== 'web';

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: bottomSpace }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.sub} />}
      >
        <Text style={s.h1}>Price alerts</Text>
        <Text style={[s.sub, { marginBottom: 16 }]}>Get a notification when a price drops below or rises above your target.</Text>

        {!native && <Text style={[s.banner, { backgroundColor: c.fairBg, color: c.fair }]}>Notifications only work in the phone app.</Text>}
        {native && perm === 'unavailable' && (
          <Text style={[s.banner, { backgroundColor: c.fairBg, color: c.fair }]}>
            This version of the app can’t send notifications yet. Install the latest build to get alerts — any alerts you set now are kept.
          </Text>
        )}
        {native && perm !== 'granted' && perm !== 'unavailable' && (
          <Pressable
            style={[s.bannerBox, { backgroundColor: c.downBg }]}
            onPress={async () => { if (perm === 'denied') Linking.openSettings(); else setPerm(await requestPermission()); }}
          >
            <Text style={{ color: c.down, fontSize: 13, fontWeight: '600' }}>
              Notifications are off, so alerts can’t reach you · {perm === 'denied' ? 'open settings' : 'tap to turn on'}
            </Text>
          </Pressable>
        )}

        {/* New alert */}
        <View style={s.card}>
          <Text style={s.cardTitle}>New alert</Text>

          <Text style={s.inputLabel}>Watch</Text>
          <View style={s.chips}>
            {options.map((o) => {
              const on = o.key === key;
              return (
                <Pressable
                  key={o.key}
                  onPress={() => { setSel(o.key); setPrice(''); setMsg(null); }}
                  style={[s.chip, on && { backgroundColor: c.gold, borderColor: c.gold }]}
                >
                  <Text style={[s.chipTxt, on && { color: c.accentText, fontWeight: '700' }]} numberOfLines={1}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {loaded && items.length === 0 && (
            <Text style={s.hint}>Add products on the RAM / SSD tab to set alerts on them too.</Text>
          )}

          <Text style={s.inputLabel}>Notify me when it</Text>
          <View style={s.seg}>
            {(['below', 'above'] as Direction[]).map((d) => (
              <Pressable key={d} onPress={() => { setDir(d); setMsg(null); }} style={[s.segItem, dir === d && { backgroundColor: c.gold }]}>
                <Text style={[s.segTxt, dir === d && { color: c.accentText, fontWeight: '700' }]}>
                  {d === 'below' ? '▼ Drops below' : '▲ Rises above'}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={s.inputLabel}>Target price (₹{unit === '/g' ? ' per gram' : unit === '/kg' ? ' per kg' : ''})</Text>
          <TextInput
            style={s.input} value={price} onChangeText={(t) => { setPrice(t); setMsg(null); }}
            keyboardType="numeric" returnKeyType="done" onSubmitEditing={onCreate}
            placeholder={now != null ? `Now ${Math.round(now)}` : 'e.g. 13000'} placeholderTextColor={c.faint}
          />
          <Text style={s.hint}>
            {now != null
              ? `Now ${inr(now)}${unit}${isMetal(key) ? ' · Bangalore rate, excl. GST' : ''}`
              : selItem?.error ? `Couldn’t fetch this product’s price (${selItem.error}).` : 'Loading current price…'}
          </Text>
          {presets.length > 0 && (
            <View style={[s.chips, { marginTop: 10 }]}>
              {presets.map((p) => (
                <Pressable
                  key={p.label}
                  onPress={() => { setPrice(String(Math.round(p.v))); setDir(p.dir); setMsg(null); }}
                  style={[s.preset, { backgroundColor: p.dir === 'below' ? c.upBg : c.downBg }]}
                >
                  <Text style={[s.presetTxt, { color: p.dir === 'below' ? c.up : c.down }]}>{p.label}</Text>
                </Pressable>
              ))}
            </View>
          )}

          <Pressable style={({ pressed }) => [s.btn, { backgroundColor: c.gold, opacity: pressed ? 0.8 : 1 }]} onPress={onCreate}>
            <Text style={{ color: c.accentText, fontWeight: '700', fontSize: 15 }}>Create alert</Text>
          </Pressable>
          {msg && <Text style={[s.msg, { color: msg.ok ? c.up : c.fair }]}>{msg.text}</Text>}
        </View>

        {/* Existing alerts */}
        <Text style={s.section}>Your alerts{alerts.length ? ` (${alerts.length})` : ''}</Text>
        {sorted.length === 0 && <Text style={[s.sub, { marginBottom: 14 }]}>No alerts yet.</Text>}
        {sorted.map((a) => (
          <AlertRow
            key={a.id} a={a} s={s} c={c} now={valueFor(a)}
            missing={loaded && a.target === 'item' && !items.some((i) => i.id === a.itemId)}
            onDelete={() => onDelete(a.id)}
          />
        ))}

        {/* How it works */}
        <View style={[s.card, { marginTop: 4 }]}>
          <Text style={s.cardTitleSm}>How alerts work</Text>
          <Text style={s.reason}>• Prices are checked about every 15 minutes in the background, and every minute while the app is open.</Text>
          <Text style={s.reason}>• An alert notifies you once when the price crosses your target, then re-arms after the price moves back.</Text>
          {Platform.OS === 'android' && (
            <Text style={s.reason}>
              • On Xiaomi, Redmi and POCO phones, turn on <Text style={{ fontWeight: '700' }}>Autostart</Text> and set
              Battery saver to <Text style={{ fontWeight: '700' }}>No restrictions</Text> for PriceWatch, or background checks can stop.
            </Text>
          )}
          {native && (
            <View style={s.btnRow}>
              {Platform.OS === 'android' && (
                <Pressable style={[s.smallBtn, { backgroundColor: c.segBg }]} onPress={() => Linking.openSettings()}>
                  <Text style={s.smallBtnTxt}>App settings</Text>
                </Pressable>
              )}
              {perm !== 'unavailable' && (
                <Pressable style={[s.smallBtn, { backgroundColor: c.segBg }]} onPress={onTest}>
                  <Text style={s.smallBtnTxt}>Send test notification</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

type S = ReturnType<typeof makeStyles>;

function AlertRow({ a, now, missing, s, c, onDelete }: {
  a: PriceAlert; now?: number; missing: boolean; s: S; c: Colors; onDelete: () => void;
}) {
  const unit = unitOf(a);
  const status = missing
    ? 'Product was removed from your RAM / SSD list'
    : !a.armed
      ? a.firedAt
        ? `🔔 Hit on ${when(a.firedAt)} · re-arms when the price moves back ${back(a.dir)}`
        : `Already ${a.dir} this price · starts once it moves back ${back(a.dir)}`
      : now != null
        ? `Now ${inr(now)}${unit} · ${((Math.abs(now - a.price) / now) * 100).toFixed(1)}% away`
        : 'Watching';
  const below = a.dir === 'below';
  return (
    <View style={s.alertRow}>
      <View style={[s.badge, { backgroundColor: below ? c.upBg : c.downBg }]}>
        <Text style={{ color: below ? c.up : c.down, fontWeight: '800' }}>{below ? '▼' : '▲'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.alertWhat} numberOfLines={1}>{a.label}</Text>
        <Text style={s.alertPrice}>
          {below ? 'Below ' : 'Above '}{inr(a.price)}<Text style={s.alertUnit}>{unit}</Text>
        </Text>
        <Text style={[s.alertStatus, (!a.armed || missing) && { color: c.fair }]}>{status}</Text>
      </View>
      <Pressable onPress={onDelete} hitSlop={12} style={s.del} accessibilityLabel={`Delete alert for ${a.label}`}>
        <Text style={{ color: c.faint, fontSize: 16 }}>✕</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (c: Colors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  content: { padding: 16 },
  h1: { color: c.text, fontSize: 26, fontWeight: '800' },
  sub: { color: c.sub, fontSize: 13, marginTop: 4, lineHeight: 18 },
  banner: { padding: 12, borderRadius: 12, marginBottom: 12, fontSize: 13, overflow: 'hidden' },
  bannerBox: { padding: 12, borderRadius: 12, marginBottom: 12 },
  card: { backgroundColor: c.card, borderRadius: 20, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: c.border },
  cardTitle: { color: c.text, fontSize: 17, fontWeight: '700', marginBottom: 4 },
  cardTitleSm: { color: c.text, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  inputLabel: { color: c.sub, fontSize: 12, fontWeight: '600', marginBottom: 8, marginTop: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.input, maxWidth: '100%' },
  chipTxt: { color: c.text, fontSize: 13 },
  hint: { color: c.faint, fontSize: 12, marginTop: 6, lineHeight: 17 },
  seg: { flexDirection: 'row', backgroundColor: c.segBg, borderRadius: 12, padding: 4 },
  segItem: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  segTxt: { color: c.segText, fontSize: 13, fontWeight: '600' },
  input: { backgroundColor: c.input, color: c.text, borderRadius: 12, paddingHorizontal: 14, minHeight: 48, fontSize: 17, borderWidth: 1, borderColor: c.border },
  preset: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999 },
  presetTxt: { fontSize: 12, fontWeight: '700' },
  btn: { marginTop: 18, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  msg: { fontSize: 13, marginTop: 10, lineHeight: 18 },
  section: { color: c.text, fontSize: 17, fontWeight: '700', marginTop: 6, marginBottom: 10 },
  alertRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.card, borderRadius: 16,
    padding: 14, marginBottom: 10, borderWidth: 1, borderColor: c.border,
  },
  badge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  alertWhat: { color: c.sub, fontSize: 12, fontWeight: '600' },
  alertPrice: { color: c.text, fontSize: 18, fontWeight: '800', marginTop: 2 },
  alertUnit: { color: c.sub, fontSize: 13, fontWeight: '600' },
  alertStatus: { color: c.faint, fontSize: 12, marginTop: 3, lineHeight: 16 },
  del: { padding: 6 },
  reason: { color: c.text, opacity: 0.85, fontSize: 13, lineHeight: 20, marginTop: 6 },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  smallBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  smallBtnTxt: { color: c.text, fontWeight: '600', fontSize: 13 },
});
