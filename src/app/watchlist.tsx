import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, FlatList, Linking, Platform, Pressable, RefreshControl, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTabBarSpace } from '../components/GlassTabBar';
import { evaluateAlerts, removeAlertsForItem } from '../lib/alerts';
import { inr } from '../lib/rates';
import { Category, Item, loadItems, refreshItem, saveItems } from '../lib/storage';
import { Colors, useTheme } from '../lib/theme';

// Alert with buttons is a no-op on web, so use the browser's confirm there.
const confirmRemove = (onYes: () => void) => {
  if (Platform.OS === 'web') { if (window.confirm('Remove this product?')) onYes(); return; }
  Alert.alert('Remove this product?', '', [{ text: 'Cancel' }, { text: 'Remove', style: 'destructive', onPress: onYes }]);
};
const hostOf = (u: string) => { try { return new URL(u).hostname.replace('www.', ''); } catch { return ''; } };

export default function WatchlistScreen() {
  const { c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const bottomSpace = useTabBarSpace();
  const [items, setItems] = useState<Item[]>([]);
  const [tab, setTab] = useState<Category>('RAM');
  const [url, setUrl] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refreshItems = useCallback(async (list: Item[]) => {
    const updated = await Promise.all(list.map(refreshItem));
    setItems(updated);
    saveItems(updated);
    evaluateAlerts({ items: updated });
  }, []);

  useEffect(() => { loadItems().then((l) => { setItems(l); refreshItems(l); }); }, [refreshItems]);

  const onRefresh = async () => { setRefreshing(true); await refreshItems(items); setRefreshing(false); };

  const addItem = async () => {
    const u = url.trim();
    if (!/^https?:\/\//.test(u)) { setMsg('Paste a full product link starting with https://'); return; }
    setMsg(null);
    const it: Item = { id: Date.now().toString(), url: u, category: tab, title: u };
    setUrl('');
    await refreshItems([...items, it]);
  };

  const removeItem = (id: string) => confirmRemove(() => {
    const l = items.filter((i) => i.id !== id); setItems(l); saveItems(l);
    removeAlertsForItem(id);
  });

  const shown = items.filter((i) => i.category === tab).sort((a, b) => (a.price ?? 1e12) - (b.price ?? 1e12));

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <FlatList
        data={shown}
        keyExtractor={(i) => i.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.sub} />}
        contentContainerStyle={{ padding: 16, paddingBottom: bottomSpace }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            <Text style={s.h1}>RAM & SSD prices</Text>
            {Platform.OS === 'web' && (
              <Text style={[s.note, { color: c.fair }]}>Store prices can only be fetched in the phone app (browsers block it).</Text>
            )}
            <View style={s.seg}>
              {(['RAM', 'SSD'] as Category[]).map((cat) => (
                <Pressable key={cat} onPress={() => setTab(cat)} style={[s.segItem, tab === cat && { backgroundColor: c.gold }]}>
                  <Text style={[s.segTxt, tab === cat && { color: c.accentText, fontWeight: '700' }]}>
                    {cat === 'SSD' ? 'SATA SSD' : 'RAM'}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={s.addRow}>
              <TextInput
                style={s.input} value={url} onChangeText={setUrl} onSubmitEditing={addItem}
                placeholder={`Paste ${tab} product link`} placeholderTextColor={c.faint}
                autoCapitalize="none" autoCorrect={false} returnKeyType="done"
              />
              <Pressable style={[s.addBtn, { backgroundColor: c.gold }]} onPress={addItem}>
                <Text style={{ fontWeight: '700', color: c.accentText }}>Add</Text>
              </Pressable>
            </View>
            {msg && <Text style={[s.note, { color: c.down }]}>{msg}</Text>}
            {shown.length > 0 && <Text style={s.note}>Cheapest first · tap to open · long-press to remove</Text>}
          </>
        }
        ListEmptyComponent={
          <Text style={s.note}>No products yet. Paste a store link (mdcomputers, primeabgb, vedant, amazon.in, flipkart…).</Text>
        }
        renderItem={({ item }) => {
          const diff = item.price != null && item.prevPrice != null ? item.price - item.prevPrice : 0;
          return (
            <Pressable style={s.item} onPress={() => Linking.openURL(item.url)} onLongPress={() => removeItem(item.id)}>
              <Text style={s.title} numberOfLines={2}>{item.title}</Text>
              <Text style={s.host}>{hostOf(item.url)}</Text>
              {item.error
                ? <Text style={{ color: c.down, marginTop: 6 }}>{item.error}</Text>
                : <Text style={s.price}>
                    {inr(item.price)}{' '}
                    {diff !== 0 && (
                      <Text style={{ color: diff < 0 ? c.up : c.down, fontSize: 14 }}>
                        {diff < 0 ? '▼' : '▲'} {inr(Math.abs(diff))}
                      </Text>
                    )}
                  </Text>}
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const makeStyles = (c: Colors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  h1: { color: c.text, fontSize: 26, fontWeight: '800', marginBottom: 14 },
  note: { color: c.sub, fontSize: 12, marginBottom: 10, lineHeight: 17 },
  seg: { flexDirection: 'row', backgroundColor: c.segBg, borderRadius: 12, padding: 4, marginBottom: 12 },
  segItem: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  segTxt: { color: c.segText, fontSize: 14, fontWeight: '600' },
  addRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  input: { flex: 1, backgroundColor: c.card, color: c.text, borderRadius: 12, paddingHorizontal: 14, minHeight: 46, borderWidth: 1, borderColor: c.border },
  addBtn: { borderRadius: 12, paddingHorizontal: 18, justifyContent: 'center' },
  item: { backgroundColor: c.card, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: c.border },
  title: { color: c.text, fontWeight: '600', lineHeight: 20 },
  host: { color: c.faint, fontSize: 12, marginTop: 3 },
  price: { color: c.text, fontSize: 20, fontWeight: '800', marginTop: 8 },
});
