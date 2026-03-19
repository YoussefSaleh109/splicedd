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

export function onFavoritesChange(cb: () => void) {
  listeners.push(cb);
  return () => { listeners = listeners.filter(l => l !== cb); };
}

function notifyListeners() {
  listeners.forEach(cb => cb());
}

export async function loadFavorites(): Promise<void> {
  try {
    const appConfig = await appConfigDir();
    if (!await exists(appConfig))
      await createDir(appConfig);

    if (await exists("favorites.json", { dir: BaseDirectory.AppConfig })) {
      const raw = await readTextFile("favorites.json", { dir: BaseDirectory.AppConfig });
      favorites = JSON.parse(raw);
    }
  } catch (err) {
    console.error("Failed to load favorites:", err);
    favorites = [];
  }
}

async function saveFavorites(): Promise<void> {
  try {
    await writeTextFile("favorites.json", JSON.stringify(favorites, null, 2), {
      dir: BaseDirectory.AppConfig
    });
  } catch (err) {
    console.error("Failed to save favorites:", err);
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
    return false; // removed
  } else {
    favorites.unshift(sample);
    await saveFavorites();
    notifyListeners();
    return true; // added
  }
}

export function getFavorites(): FavoriteSample[] {
  return [...favorites];
}

export function getFavoritesCount(): number {
  return favorites.length;
}
