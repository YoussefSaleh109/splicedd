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

export async function loadDownloadHistory(): Promise<void> {
  try {
    const appConfig = await appConfigDir();
    if (!await exists(appConfig))
      await createDir(appConfig);

    if (await exists("download-history.json", { dir: BaseDirectory.AppConfig })) {
      const raw = await readTextFile("download-history.json", { dir: BaseDirectory.AppConfig });
      history = JSON.parse(raw);
    }
  } catch (err) {
    console.error("Failed to load download history:", err);
    history = [];
  }
}

async function saveHistory(): Promise<void> {
  try {
    await writeTextFile("download-history.json", JSON.stringify(history, null, 2), {
      dir: BaseDirectory.AppConfig
    });
  } catch (err) {
    console.error("Failed to save download history:", err);
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
