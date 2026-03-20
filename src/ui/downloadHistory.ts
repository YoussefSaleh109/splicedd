import { BaseDirectory, exists, readTextFile, writeTextFile, createDir } from "@tauri-apps/api/fs";
import { appConfigDir } from "@tauri-apps/api/path";

export interface DownloadRecord {
  uuid: string;
  name: string;
  packName: string;
  downloadedAt: string;
  filePath: string;
}

let history: DownloadRecord[] = [];
let useLocalStorage = false;

const LS_KEY = "splicedd_downloads";

export async function loadDownloadHistory(): Promise<void> {
  // Try Tauri filesystem first
  try {
    const appConfig = await appConfigDir();
    if (!await exists(appConfig)) {
      await createDir(appConfig, { recursive: true });
    }

    if (await exists("download-history.json", { dir: BaseDirectory.AppConfig })) {
      const raw = await readTextFile("download-history.json", { dir: BaseDirectory.AppConfig });
      history = JSON.parse(raw);
      console.log(`[Downloads] Loaded ${history.length} from Tauri FS`);
      return;
    } else {
      console.log("[Downloads] No file found in Tauri FS, checking localStorage");
    }
  } catch (err) {
    console.warn("[Downloads] Tauri FS failed, falling back to localStorage:", err);
    useLocalStorage = true;
  }

  // Fallback: localStorage
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      history = JSON.parse(raw);
      console.log(`[Downloads] Loaded ${history.length} from localStorage`);
    }
  } catch (err) {
    console.error("[Downloads] localStorage also failed:", err);
    history = [];
  }
}

async function saveHistory(): Promise<void> {
  const data = JSON.stringify(history, null, 2);

  // Always save to localStorage as backup
  try {
    localStorage.setItem(LS_KEY, data);
  } catch (e) {
    console.warn("[Downloads] localStorage save failed:", e);
  }

  // Also try Tauri FS
  if (!useLocalStorage) {
    try {
      await writeTextFile("download-history.json", data, { dir: BaseDirectory.AppConfig });
    } catch (err) {
      console.warn("[Downloads] Tauri FS save failed:", err);
    }
  }
}

export function isDownloaded(uuid: string): boolean {
  return history.some(h => h.uuid === uuid);
}

export async function addToHistory(record: DownloadRecord): Promise<void> {
  if (!isDownloaded(record.uuid)) {
    history.unshift(record);
    await saveHistory();
  }
}

export function getDownloadHistory(): DownloadRecord[] {
  return [...history];
}

export function getDownloadCount(): number {
  return history.length;
}
