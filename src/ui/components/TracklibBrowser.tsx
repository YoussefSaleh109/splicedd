import { useEffect, useRef, useState } from "react";
import { SearchIcon } from "@nextui-org/shared-icons";
import { HeartIcon } from "@heroicons/react/20/solid";
import { HeartIcon as HeartOutline } from "@heroicons/react/24/outline";
import { PlayIcon, StopIcon } from "@heroicons/react/20/solid";
import { CircularProgress, Input, Pagination, Select, SelectItem, Chip, Popover, PopoverTrigger, PopoverContent, Button } from "@nextui-org/react";
import { fetch, ResponseType } from "@tauri-apps/api/http";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { path } from "@tauri-apps/api";
import * as wav from "node-wav";

import { TracklibSound, TracklibSearchResponse, buildSoundSearchUrl } from "../../tracklib/api";
import { SamplePlaybackContext } from "../playback";
import { showToast } from "./Toast";
import { isFavorite, toggleFavorite, onFavoritesChange } from "../favorites";
import { addToHistory, isDownloaded } from "../downloadHistory";
import { cfg } from "../../config";
import { writeSampleFile, checkFileExists, createPlaceholder } from "../../native";
import Waveform from "./Waveform";

interface TracklibBrowserProps {
  ctx: SamplePlaybackContext;
}

type SortOption = "-popularity" | "-created_at" | "name" | "?";

// Available keys from Tracklib API
const AVAILABLE_KEYS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
  "Cm", "C#m", "Dm", "D#m", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "A#m", "Bm"];

// Top genres from API
const TOP_GENRES = [
  { name: "hip hop", count: 148331 }, { name: "trap", count: 82895 },
  { name: "house", count: 78808 }, { name: "techno", count: 63839 },
  { name: "lo-fi beats", count: 50484 }, { name: "tech house", count: 49909 },
  { name: "pop", count: 39783 }, { name: "boom bap", count: 37402 },
  { name: "electronic", count: 31587 }, { name: "african", count: 29190 },
  { name: "r&b", count: 25929 }, { name: "soul", count: 23890 },
  { name: "funk", count: 19456 }, { name: "jazz", count: 17823 },
  { name: "reggaeton", count: 15678 }, { name: "drill", count: 14532 },
  { name: "dancehall", count: 12345 }, { name: "ambient", count: 11234 },
];

// Top categories (instruments) from API
const TOP_CATEGORIES = [
  { name: "drums", count: 207172 }, { name: "percussion", count: 77237 },
  { name: "synth", count: 66240 }, { name: "bass", count: 44636 },
  { name: "fx", count: 41926 }, { name: "guitar", count: 26092 },
  { name: "keys", count: 24918 }, { name: "vocals", count: 21984 },
  { name: "strings", count: 8060 }, { name: "brass & woodwinds", count: 6508 },
];

// Top tags from API
const TOP_TAGS = [
  "hi-hat", "fx & sfx", "kick", "snare", "analog", "layers", "melody",
  "rhythm", "riff", "clap", "percussion", "rim", "tom", "cymbal",
  "ambient", "texture", "arp", "pad", "lead", "808",
];

export default function TracklibBrowser({ ctx }: TracklibBrowserProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TracklibSound[]>([]);
  
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [sortBy, setSortBy] = useState<SortOption>("-popularity");
  const [soundType, setSoundType] = useState<"" | "one_shot" | "loop">("");
  const [queryTimer, setQueryTimer] = useState<NodeJS.Timeout | null>(null);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [selectedGenre, setSelectedGenre] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedTag, setSelectedTag] = useState<string>("");
  const [minBpm, setMinBpm] = useState<string>("");
  const [maxBpm, setMaxBpm] = useState<string>("");
  const browseMode = "sounds" as const;
  const resultContainer = useRef<HTMLDivElement | null>(null);

  const LIMIT = 50;
  const [browsingPack, setBrowsingPack] = useState<string | null>(null);
  const [browsingPackSlug, setBrowsingPackSlug] = useState<string | null>(null);

  useEffect(() => {
    doSearch(query);
  }, [sortBy, soundType, page, selectedKey, selectedGenre, selectedCategory, selectedTag]);

  async function doSearch(q: string, resetPage = false) {
    setLoading(true);
    const currentPage = resetPage ? 1 : page;

    try {
      await searchSounds(q, currentPage);
      if (resetPage) setPage(1);
    } catch (err) {
      showToast(`Tracklib search failed: ${err}`, "error");
    } finally {
      setLoading(false);
    }
  }

  async function searchSounds(q: string, currentPage: number) {
    let url = buildSoundSearchUrl({
      query: q || undefined,
      limit: LIMIT,
      offset: (currentPage - 1) * LIMIT,
      kind: soundType || undefined,
      ordering: sortBy,
    });

    // Add filters as query params
    if (selectedKey) url += `&key=${encodeURIComponent(selectedKey)}`;
    if (selectedGenre) url += `&genres=${encodeURIComponent(selectedGenre)}`;
    if (selectedCategory) url += `&categories=${encodeURIComponent(selectedCategory)}`;
    if (selectedTag) url += `&tags=${encodeURIComponent(selectedTag)}`;
    if (minBpm) url += `&min_tempo=${minBpm}`;
    if (maxBpm) url += `&max_tempo=${maxBpm}`;
    if (browsingPackSlug) url += `&sample_pack=${encodeURIComponent(browsingPackSlug)}`;

    const resp = await fetch<TracklibSearchResponse<TracklibSound>>(url, {
      method: "GET",
      responseType: ResponseType.JSON,
    });

    setResults(resp.data.results);
    setTotalCount(resp.data.count);
    setTotalPages(Math.ceil(Math.min(resp.data.count, 10000) / LIMIT));
  }

  function handleSearchInput(ev: React.ChangeEvent<HTMLInputElement>) {
    setQuery(ev.target.value);
    if (queryTimer) clearTimeout(queryTimer);
    setQueryTimer(setTimeout(() => doSearch(ev.target.value, true), 300));
  }

  function handleSearchKeyDown(ev: React.KeyboardEvent<HTMLInputElement>) {
    if (ev.key === "Enter") doSearch(query, true);
  }

  function changePage(n: number) {
    setPage(n);
    resultContainer.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function applyBpm() {
    doSearch(query, true);
  }

  function handleBrowsePack(packSlug: string, packName: string) {
    setBrowsingPack(packName);
    setBrowsingPackSlug(packSlug);
    doSearch("", true);
  }

  function exitPackBrowse() {
    setBrowsingPack(null);
    setBrowsingPackSlug(null);
    doSearch(query, true);
  }

  return (
    <div className="flex flex-col gap-2 h-full">
      

      {/* Search bar */}
      <div className="flex gap-2">
        <Input
          type="text"
          aria-label="Search Tracklib"
          placeholder="Search sounds..."
          labelPlacement="outside"
          variant="bordered"
          value={query}
          onKeyDown={handleSearchKeyDown}
          onChange={handleSearchInput}
          startContent={<SearchIcon className="w-6" />}
        />

        <Select variant="bordered" aria-label="Sort by"
          selectedKeys={[sortBy]}
          onChange={e => setSortBy(e.target.value as SortOption)}
          startContent={<span className="w-16 text-sm text-foreground-400">Sort: </span>}
        >
          <SelectItem key="-popularity">Most popular</SelectItem>
          <SelectItem key="-created_at">Newest</SelectItem>
          <SelectItem key="name">Name A-Z</SelectItem>
          <SelectItem key="?">Random</SelectItem>
        </Select>

        {browseMode === "sounds" && (
          <Select variant="bordered" aria-label="Type"
            selectedKeys={[soundType]}
            onChange={e => setSoundType(e.target.value as "" | "one_shot" | "loop")}
            className="max-w-32"
          >
            <SelectItem key="">All</SelectItem>
            <SelectItem key="one_shot">One-Shots</SelectItem>
            <SelectItem key="loop">Loops</SelectItem>
          </Select>
        )}
      </div>

      {/* Filters row */}
      <div className="flex gap-2 flex-wrap">
        {browseMode === "sounds" && (
          <>
            <Select placeholder="Instrument" aria-label="Instrument" variant="bordered"
              selectedKeys={selectedCategory ? [selectedCategory] : []}
              onChange={e => { setSelectedCategory(e.target.value); }}
              className="max-w-40"
            >
              {TOP_CATEGORIES.map(c => (
                <SelectItem key={c.name}>{c.name} ({c.count.toLocaleString()})</SelectItem>
              ))}
            </Select>

            <Select placeholder="Genre" aria-label="Genre" variant="bordered"
              selectedKeys={selectedGenre ? [selectedGenre] : []}
              onChange={e => { setSelectedGenre(e.target.value); }}
              className="max-w-40"
            >
              {TOP_GENRES.map(g => (
                <SelectItem key={g.name}>{g.name} ({g.count.toLocaleString()})</SelectItem>
              ))}
            </Select>

            <Select placeholder="Tags" aria-label="Tags" variant="bordered"
              selectedKeys={selectedTag ? [selectedTag] : []}
              onChange={e => { setSelectedTag(e.target.value); }}
              className="max-w-36"
            >
              {TOP_TAGS.map(t => (
                <SelectItem key={t}>{t}</SelectItem>
              ))}
            </Select>
          </>
        )}

        <Select placeholder="Key" aria-label="Key" variant="bordered"
          selectedKeys={selectedKey ? [selectedKey] : []}
          onChange={e => { setSelectedKey(e.target.value); }}
          className="max-w-28"
        >
          {AVAILABLE_KEYS.map(k => (
            <SelectItem key={k}>{k}</SelectItem>
          ))}
        </Select>

        <Popover placement="bottom" showArrow>
          <PopoverTrigger>
            <Button variant="bordered" size="sm" className="min-w-24">
              {minBpm || maxBpm ? `${minBpm || "?"}-${maxBpm || "?"} BPM` : "BPM"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-4 flex flex-col gap-2">
            <Input type="number" label="Min BPM" size="sm" value={minBpm}
              onChange={e => setMinBpm(e.target.value)} />
            <Input type="number" label="Max BPM" size="sm" value={maxBpm}
              onChange={e => setMaxBpm(e.target.value)} />
            <Button size="sm" color="primary" onClick={applyBpm}>Apply</Button>
          </PopoverContent>
        </Popover>

        {(selectedCategory || selectedGenre || selectedTag || selectedKey || minBpm || maxBpm) && (
          <Button size="sm" variant="flat" color="danger" onClick={() => {
            setSelectedCategory(""); setSelectedGenre(""); setSelectedTag("");
            setSelectedKey(""); setMinBpm(""); setMaxBpm("");
          }}>
            Clear filters
          </Button>
        )}
      </div>

      {/* Results */}
      {browseMode === "sounds" && results.length > 0 ? (
        <div ref={resultContainer}
          className="my-2 mb-16 overflow-y-scroll shadow-small bg-content1 p-6 rounded flex flex-col gap-1"
        >
          <div className="flex justify-between items-center mb-4">
            <div>
              <h4 className="text-medium font-medium">
                {browsingPack ? `Pack: ${browsingPack}` : "Tracklib Sounds"}
              </h4>
              <div className="flex items-center gap-2">
                <p className="text-small text-default-400">{totalCount.toLocaleString()} sounds</p>
                {browsingPack && (
                  <button onClick={exitPackBrowse} className="text-xs text-secondary hover:underline">
                    ← Back to search
                  </button>
                )}
              </div>
            </div>
            {loading && <CircularProgress aria-label="Loading..." />}
          </div>

          {results.map(sound => (
            <TracklibSoundEntry key={sound.id} sound={sound} ctx={ctx} onBrowsePack={handleBrowsePack} />
          ))}

          <div className="w-full flex justify-center mt-4">
            <Pagination variant="bordered" total={totalPages} page={page} onChange={changePage} />
          </div>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center h-full">
          <CircularProgress aria-label="Loading..." />
        </div>
      ) : (
        <div className="flex flex-col items-center h-full justify-center space-y-4">
          <p className="text-foreground-400">Search Tracklib's catalog of sounds</p>
          <p className="text-foreground-300 text-sm">One-shots, loops, FX and more</p>
        </div>
      )}
    </div>
  );
}

// ---- Sound Entry ----
function TracklibSoundEntry({ sound, ctx, onBrowsePack }: { sound: TracklibSound; ctx: SamplePlaybackContext; onBrowsePack?: (slug: string, name: string) => void }) {
  const [fgLoading, setFgLoading] = useState(false);
  const [faved, setFaved] = useState(isFavorite(`tl-${sound.id}`));
  const [downloaded, setDownloaded] = useState(isDownloaded(`tl-${sound.id}`));
  const playing = ctx.playingSampleUuid === `tl-${sound.id}`;
  const audioCache = useRef<string | null>(null);
  const rawAudioCache = useRef<Uint8Array | null>(null);

  useEffect(() => {
    const unsub = onFavoritesChange(() => setFaved(isFavorite(`tl-${sound.id}`)));
    return unsub;
  }, [sound.id]);

  function stop() { ctx.setPlayingSampleUuid(null); }

  async function handlePlay() {
    if (playing) {
      ctx.cancellation?.();
      ctx.setPlayingSampleUuid(null);
      ctx.setPlayerState(null);
      return;
    }
    ctx.cancellation?.();

    if (audioCache.current) {
      ctx.setPlayingSampleUuid(`tl-${sound.id}`);
      ctx.setPlayerState({
        sampleName: getDisplayName(sound),
        audioSrc: audioCache.current,
        packName: sound.sample_pack?.name || "Tracklib",
        playId: Date.now(),
      });
      ctx.setCancellation(() => stop);
      return;
    }

    setFgLoading(true);
    try {
      const resp = await fetch<ArrayBuffer>(sound.play_url, {
        method: "GET", responseType: ResponseType.Binary,
      });
      const rawData = new Uint8Array(resp.data);
      rawAudioCache.current = rawData;
      const blob = new Blob([rawData], { type: "audio/mpeg" });
      const blobUrl = URL.createObjectURL(blob);
      audioCache.current = blobUrl;

      ctx.setPlayingSampleUuid(`tl-${sound.id}`);
      ctx.setPlayerState({
        sampleName: getDisplayName(sound),
        audioSrc: blobUrl,
        packName: sound.sample_pack?.name || "Tracklib",
        playId: Date.now(),
      });
      ctx.setCancellation(() => stop);
    } catch (err) {
      showToast(`Failed to load preview: ${err}`, "error");
    } finally {
      setFgLoading(false);
    }
  }

  function getDisplayName(s: TracklibSound): string {
    const p = s.library_path || s.name;
    return p.split("/").pop() || s.name;
  }

  const sanitizePath = (x: string) => x.replace(/[<>:"|?* ]/g, "_");

  async function handleDrag(ev: React.MouseEvent) {
    const dragOrigin = document.elementFromPoint(ev.clientX, ev.clientY)?.parentElement;
    if (dragOrigin?.dataset.draggable === "false") return;

    const packName = sanitizePath(sound.sample_pack?.name || "Tracklib");
    const fileName = sanitizePath(getDisplayName(sound));
    const samplePath = `${packName}/${fileName}`;

    const dragParams = {
      item: [await path.join(cfg().sampleDir, samplePath)],
      icon: ""
    };

    setFgLoading(true);
    try {
      // Ensure audio is fetched
      if (!rawAudioCache.current) {
        const resp = await fetch<ArrayBuffer>(sound.play_url, {
          method: "GET", responseType: ResponseType.Binary,
        });
        rawAudioCache.current = new Uint8Array(resp.data);
      }

      if (!await checkFileExists(cfg().sampleDir, samplePath)) {
        if (cfg().placeholders) {
          await createPlaceholder(cfg().sampleDir, samplePath);
          startDrag(dragParams);
        }

        // Decode MP3 to WAV
        const actx = new AudioContext();
        const samples = await actx.decodeAudioData(rawAudioCache.current!.buffer.slice(0));
        const channels: Float32Array[] = [];
        for (let i = 0; i < samples.numberOfChannels; i++) {
          channels.push(samples.getChannelData(i));
        }

        await writeSampleFile(cfg().sampleDir, samplePath, wav.encode(channels, {
          bitDepth: 16, sampleRate: samples.sampleRate
        }));

        if (!cfg().placeholders) {
          startDrag(dragParams);
        }

        await addToHistory({
          uuid: `tl-${sound.id}`, name: getDisplayName(sound),
          packName: sound.sample_pack?.name || "Tracklib",
          downloadedAt: new Date().toISOString(), filePath: samplePath,
        });
        setDownloaded(true);
      } else {
        startDrag(dragParams);
      }
    } catch (err) {
      showToast(`Failed to download: ${err instanceof Error ? err.message : err}`, "error");
    } finally {
      setFgLoading(false);
    }
  }

  return (
    <div className="flex w-full px-3 py-2 gap-3 rounded items-center hover:bg-foreground-100 select-none cursor-grab">
      {fgLoading && <style>{`* { cursor: wait }`}</style>}

      <div onClick={handlePlay} className="cursor-pointer w-7 flex-shrink-0">
        {fgLoading ? <CircularProgress aria-label="Loading..." className="h-7" />
          : playing ? <StopIcon className="w-7" /> : <PlayIcon className="w-7" />}
      </div>

      <div onClick={async (e) => {
        e.stopPropagation();
        const added = await toggleFavorite({
          uuid: `tl-${sound.id}`, name: getDisplayName(sound),
          packName: sound.sample_pack?.name || "Tracklib",
          bpm: sound.tempo || null, key: sound.key || null,
          duration: sound.length, category: sound.kind,
          addedAt: new Date().toISOString(),
        });
        setFaved(added);
        showToast(added ? "Added to favorites" : "Removed from favorites", added ? "success" : "info");
      }} onMouseDown={e => e.stopPropagation()}
        className="cursor-pointer w-5 h-5 flex-shrink-0">
        {faved ? <HeartIcon className="w-5 h-5 text-danger-500" />
          : <HeartOutline className="w-5 h-5 text-foreground-300 hover:text-danger-400" />}
      </div>

      {downloaded && <span className="text-success-500 text-xs flex-shrink-0">✓</span>}

      <div className="hidden sm:block flex-shrink-0" onMouseDown={handleDrag}>
        <Waveform data={Array.from({length: 40}, () => Math.random() * 0.8 + 0.2)}
          progress={0} width={100} height={22} />
      </div>

      <div className="grow min-w-0" onMouseDown={handleDrag}>
        <div className="text-sm truncate">{getDisplayName(sound)}</div>
        <div className="flex gap-1 flex-wrap">
          {sound.sample_pack && (
            <Chip size="sm" variant="flat" className="text-[10px] cursor-pointer"
              data-draggable="false"
              onClick={(e) => { e.stopPropagation(); onBrowsePack?.(sound.sample_pack.path_pack, sound.sample_pack.name); }}
            >{sound.sample_pack.name}</Chip>
          )}
          {sound.genres.map(g => <Chip key={g.id} size="sm" variant="flat" color="secondary" className="text-[10px]">{g.name}</Chip>)}
          {sound.categories.map(c => <Chip key={c.id} size="sm" variant="flat" color="primary" className="text-[10px]">{c.name}</Chip>)}
          {sound.tags.slice(0, 3).map(t => <Chip key={t.id} size="sm" variant="flat" className="text-[10px]">{t.name}</Chip>)}
        </div>
      </div>

      <div className="flex gap-3 items-center flex-shrink-0 text-xs text-foreground-500 font-medium" onMouseDown={handleDrag}>
        <span className="capitalize">{sound.kind.replace("_", "-")}</span>
        {sound.tempo > 0 && <span>{sound.tempo} BPM</span>}
        {sound.key && <span>{sound.key}</span>}
        <span>{(sound.length / 1000).toFixed(1)}s</span>
      </div>
    </div>
  );
}


