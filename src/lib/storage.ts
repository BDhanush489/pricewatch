// @ts-ignore AsyncStorage may be installed without its type declarations.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { scrapePrice } from './scraper';

export type Category = 'RAM' | 'SSD';
export type Item = {
  id: string;
  url: string;
  category: Category;
  title: string;
  price?: number;
  prevPrice?: number;
  error?: string;
  updatedAt?: number;
};

const KEY = 'pricewatch.items.v1';

export const loadItems = async (): Promise<Item[]> => {
  try { return JSON.parse((await AsyncStorage.getItem(KEY)) || '[]'); } catch { return []; }
};
export const saveItems = (items: Item[]) => AsyncStorage.setItem(KEY, JSON.stringify(items));

/** Re-scrapes one product page. Never throws — a failure is stored on the item as `error`. */
export async function refreshItem(it: Item): Promise<Item> {
  try {
    const r = await scrapePrice(it.url);
    return {
      ...it, title: r.title || it.title,
      prevPrice: it.price !== r.price ? it.price : it.prevPrice,
      price: r.price, error: undefined, updatedAt: Date.now(),
    };
  } catch (e: any) {
    return { ...it, error: e?.message ?? 'Could not fetch price' };
  }
}

/** Refreshes the saved products with the given ids (all if omitted), saves and returns the full list. */
export async function refreshStoredItems(ids?: Set<string>): Promise<Item[]> {
  const list = await loadItems();
  const updated = await Promise.all(list.map((it) => (!ids || ids.has(it.id) ? refreshItem(it) : it)));
  await saveItems(updated);
  return updated;
}
