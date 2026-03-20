import { useEffect, useState } from "react";
import { Chip, Divider } from "@nextui-org/react";
import { HeartIcon, ClockIcon, TrashIcon } from "@heroicons/react/20/solid";
import { getFavorites, FavoriteSample, onFavoritesChange, toggleFavorite } from "../favorites";
import { getDownloadHistory, DownloadRecord } from "../downloadHistory";

interface HistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(ms: number): string {
  const secs = (ms / 1000).toFixed(1);
  return `${secs}s`;
}

export default function HistoryPanel({ isOpen, onClose }: HistoryPanelProps) {
  const [tab, setTab] = useState<"favorites" | "downloads">("favorites");
  const [favorites, setFavorites] = useState<FavoriteSample[]>([]);
  const [downloads, setDownloads] = useState<DownloadRecord[]>([]);

  useEffect(() => {
    setFavorites(getFavorites());
    setDownloads(getDownloadHistory());

    const unsub = onFavoritesChange(() => {
      setFavorites(getFavorites());
    });
    return unsub;
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="absolute right-0 top-0 bottom-0 w-[420px] bg-content1 shadow-2xl flex flex-col z-[81] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-divider">
          <h2 className="text-lg font-semibold">Library</h2>
          <button onClick={onClose} className="text-foreground-400 hover:text-foreground-700 text-xl">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-divider">
          <button
            onClick={() => setTab("favorites")}
            className={`flex-1 py-3 px-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              tab === "favorites"
                ? "text-danger-500 border-b-2 border-danger-500"
                : "text-foreground-400 hover:text-foreground-600"
            }`}
          >
            <HeartIcon className="w-4 h-4" />
            Favorites ({favorites.length})
          </button>
          <button
            onClick={() => setTab("downloads")}
            className={`flex-1 py-3 px-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              tab === "downloads"
                ? "text-primary border-b-2 border-primary"
                : "text-foreground-400 hover:text-foreground-600"
            }`}
          >
            <ClockIcon className="w-4 h-4" />
            Downloads ({downloads.length})
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-2">
          {tab === "favorites" ? (
            favorites.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-foreground-400">
                <HeartIcon className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">No favorites yet</p>
                <p className="text-xs mt-1">Click the heart icon on any sample to save it</p>
              </div>
            ) : (
              favorites.map((fav) => (
                <div key={fav.uuid} className="flex items-center gap-3 px-3 py-2 rounded hover:bg-foreground-100 group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{fav.name.split("/").pop()}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-foreground-400">{fav.packName}</span>
                      {fav.bpm && <Chip size="sm" variant="flat" className="text-[10px] h-4">{fav.bpm} BPM</Chip>}
                      {fav.key && <Chip size="sm" variant="flat" className="text-[10px] h-4">{fav.key}</Chip>}
                      <span className="text-xs text-foreground-300">{formatDuration(fav.duration)}</span>
                    </div>
                    <span className="text-[10px] text-foreground-300">{formatDate(fav.addedAt)}</span>
                  </div>
                  <button
                    onClick={async () => {
                      await toggleFavorite(fav);
                      setFavorites(getFavorites());
                    }}
                    className="opacity-0 group-hover:opacity-100 text-foreground-300 hover:text-danger-500 transition-all"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              ))
            )
          ) : (
            downloads.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-foreground-400">
                <ClockIcon className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">No downloads yet</p>
                <p className="text-xs mt-1">Drag samples to your DAW to download them</p>
              </div>
            ) : (
              downloads.map((dl, idx) => (
                <div key={`${dl.uuid}-${idx}`} className="flex items-center gap-3 px-3 py-2 rounded hover:bg-foreground-100">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{dl.name.split("/").pop()}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-foreground-400">{dl.packName}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-foreground-300">{formatDate(dl.downloadedAt)}</span>
                      <span className="text-[10px] text-foreground-300 truncate">{dl.filePath}</span>
                    </div>
                  </div>
                </div>
              ))
            )
          )}
        </div>
      </div>
    </div>
  );
}
