import { BaseDirectory, exists, readTextFile, writeTextFile, createDir } from "@tauri-apps/api/fs";
import { appConfigDir } from "@tauri-apps/api/path";

export interface FavoriteSample {
  uuid: string;
  name: string;
  packName: string;
  bpm: number | null;
  key: string | null;
  duration: number;
  category: string;
  addedAt: string;
}

let favorites: FavoriteSample[] = [];
let listeners: (() => void)[] = [];
let useLocalStorage = false;

const LS_KEY = "splicedd_favorites";

export function onFavoritesChange(cb: () => void) {
  listeners.push(cb);
  return () => { listeners = listeners.filter(l => l !== cb); };
}

function notifyListeners() {
  listeners.forEach(cb => cb());
}

export async function loadFavorites(): Promise<void> {
  // Try Tauri filesystem first
  try {
    const appConfig = await appConfigDir();
    if (!await exists(appConfig)) {
      await createDir(appConfig, { recursive: true });
    }

    if (await exists("favorites.json", { dir: BaseDirectory.AppConfig })) {
      const raw = await readTextFile("favorites.json", { dir: BaseDirectory.AppConfig });
      favorites = JSON.parse(raw);
      console.log(`[Favorites] Loaded ${favorites.length} from Tauri FS`);
      return;
    } else {
      console.log("[Favorites] No file found in Tauri FS, checking localStorage");
    }
  } catch (err) {
    console.warn("[Favorites] Tauri FS failed, falling back to localStorage:", err);
    useLocalStorage = true;
  }

  // Fallback: localStorage
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      favorites = JSON.parse(raw);
      console.log(`[Favorites] Loaded ${favorites.length} from localStorage`);
    }
  } catch (err) {
    console.error("[Favorites] localStorage also failed:", err);
    favorites = [];
  }
}

async function saveFavorites(): Promise<void> {
  const data = JSON.stringify(favorites, null, 2);

  // Always save to localStorage as backup
  try {
    localStorage.setItem(LS_KEY, data);
  } catch (e) {
    console.warn("[Favorites] localStorage save failed:", e);
  }

  // Also try Tauri FS
  if (!useLocalStorage) {
    try {
      await writeTextFile("favorites.json", data, { dir: BaseDirectory.AppConfig });
    } catch (err) {
      console.warn("[Favorites] Tauri FS save failed:", err);
    }
  }
}

export function isFavorite(uuid: string): boolean {
  return favorites.some(f => f.uuid === uuid);
}

export async function toggleFavorite(sample: FavoriteSample): Promise<boolean> {
  const idx = favorites.findIndex(f => f.uuid === sample.uuid);
  if (idx >= 0) {
    favorites.splice(idx, 1);
    await saveFavorites();
    notifyListeners();
    return false;
  } else {
    favorites.unshift(sample);
    await saveFavorites();
    notifyListeners();
    return true;
  }
}

export function getFavorites(): FavoriteSample[] {
  return [...favorites];
}

export function getFavoritesCount(): number {
  return favorites.length;
}
