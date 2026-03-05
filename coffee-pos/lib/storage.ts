import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MenuItem } from './types';

const KEYS = {
  MENU_CACHE: '@coffee_pos/menu_cache',
  MENU_CACHE_TIME: '@coffee_pos/menu_cache_time',
} as const;

// ─── Menu Cache ───

export async function getCachedMenu(): Promise<MenuItem[] | null> {
  try {
    const json = await AsyncStorage.getItem(KEYS.MENU_CACHE);
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

export async function setCachedMenu(items: MenuItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.MENU_CACHE, JSON.stringify(items));
    await AsyncStorage.setItem(KEYS.MENU_CACHE_TIME, new Date().toISOString());
  } catch {
    // silent fail
  }
}

export async function getMenuCacheTime(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEYS.MENU_CACHE_TIME);
  } catch {
    return null;
  }
}

export async function clearAllStorage(): Promise<void> {
  await AsyncStorage.multiRemove([
    KEYS.MENU_CACHE,
    KEYS.MENU_CACHE_TIME,
  ]);
}
