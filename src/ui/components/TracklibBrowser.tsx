import { useEffect, useRef, useState } from "react";
import { Button } from "@nextui-org/button";
import { SearchIcon, ChevronDownIcon } from "@nextui-org/shared-icons";
import { HeartIcon } from "@heroicons/react/20/solid";
import { HeartIcon as HeartOutline } from "@heroicons/react/24/outline";
import { PlayIcon, StopIcon } from "@heroicons/react/20/solid";
import { CircularProgress, Input, Pagination, Select, SelectItem, Tooltip, Chip } from "@nextui-org/react";
import { fetch, ResponseType } from "@tauri-apps/api/http";

import { TracklibSound, TracklibSearchResponse, buildSoundSearchUrl } from "../../tracklib/api";
import { SamplePlaybackContext } from "../playback";
import { showToast } from "./Toast";
import { isFavorite, toggleFavorite } from "../favorites";
import Waveform from "./Waveform";

interface TracklibBrowserProps {
  ctx: SamplePlaybackContext;
}

type SortOption = "-popularity" | "-created_at" | "name" | "?";

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
  const resultContainer = useRef<HTMLDivElement | null>(null);

  const LIMIT = 50;

  useEffect(() => {
    search(query);
  }, [sortBy, soundType, page]);

  async function search(q: string, resetPage = false) {
    setLoading(true);
    const currentPage = resetPage ? 1 : page;

    try {
      const url = buildSoundSearchUrl({
        query: q || undefined,
        limit: LIMIT,
        offset: (currentPage - 1) * LIMIT,
        kind: soundType || undefined,
        ordering: sortBy,
      });

      const resp = await fetch<TracklibSearchResponse<TracklibSound>>(url, {
        method: "GET",
        responseType: ResponseType.JSON,
      });

      const data = resp.data;
      setResults(data.results);
      setTotalCount(data.count);
      setTotalPages(Math.ceil(Math.min(data.count, 10000) / LIMIT));
      if (resetPage) setPage(1);
    } catch (err) {
      showToast(`Tracklib search failed: ${err}`, "error");
    } finally {
      setLoading(false);
    }
  }

  function handleSearchInput(ev: React.ChangeEvent<HTMLInputElement>) {
    setQuery(ev.target.value);
    if (queryTimer) clearTimeout(queryTimer);
    setQueryTimer(setTimeout(() => search(ev.target.value, true), 300));
  }

  function handleSearchKeyDown(ev: React.KeyboardEvent<HTMLInputElement>) {
    if (ev.key === "Enter") search(query, true);
  }

  function changePage(n: number) {
    setPage(n);
    resultContainer.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="flex flex-col gap-2 h-full">
      {/* Search bar */}
      <div className="flex gap-2">
        <Input
          type="text"
          aria-label="Search Tracklib sounds"
          placeholder="Search Tracklib sounds..."
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
          startContent={<span className="w-20 text-sm text-foreground-400">Sort: </span>}
        >
          <SelectItem key="-popularity">Most popular</SelectItem>
          <SelectItem key="-created_at">Newest</SelectItem>
          <SelectItem key="name">Name A-Z</SelectItem>
          <SelectItem key="?">Random</SelectItem>
        </Select>

        <Select variant="bordered" aria-label="Type"
          selectedKeys={[soundType]}
          onChange={e => setSoundType(e.target.value as "" | "one_shot" | "loop")}
          className="max-w-32"
        >
          <SelectItem key="">All</SelectItem>
          <SelectItem key="one_shot">One-Shots</SelectItem>
          <SelectItem key="loop">Loops</SelectItem>
        </Select>
      </div>

      {/* Results */}
      {results.length > 0 ? (
        <div ref={resultContainer}
          className="my-2 mb-16 overflow-y-scroll shadow-small bg-content1 p-6 rounded flex flex-col gap-2"
        >
          <div className="flex justify-between items-center mb-4">
            <div>
              <h4 className="text-medium font-medium">Tracklib Sounds</h4>
              <p className="text-small text-default-400">
                {totalCount.toLocaleString()} sounds found
              </p>
            </div>
            {loading && <CircularProgress aria-label="Loading..." />}
          </div>

          {results.map(sound => (
            <TracklibSoundEntry key={sound.id} sound={sound} ctx={ctx} />
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

function TracklibSoundEntry({ sound, ctx }: { sound: TracklibSound; ctx: SamplePlaybackContext }) {
  const [fgLoading, setFgLoading] = useState(false);
  const [faved, setFaved] = useState(isFavorite(`tl-${sound.id}`));
  const playing = ctx.playingSampleUuid === `tl-${sound.id}`;
  const audioCache = useRef<string | null>(null);

  function stop() {
    ctx.setPlayingSampleUuid(null);
  }

  async function handlePlay() {
    if (playing) {
      ctx.cancellation?.();
      ctx.setPlayingSampleUuid(null);
      ctx.setPlayerState(null);
      return;
    }

    ctx.cancellation?.();

    // Tracklib provides direct MP3 URLs — no decoding needed!
    if (audioCache.current) {
      ctx.setPlayingSampleUuid(`tl-${sound.id}`);
      ctx.setPlayerState({
        sampleName: sound.name.split("_").slice(-3).join(" "),
        audioSrc: audioCache.current,
        packName: sound.sample_pack?.name || "Tracklib",
        playId: Date.now(),
      });
      ctx.setCancellation(() => stop);
      return;
    }

    setFgLoading(true);
    try {
      // Fetch the MP3 preview
      const resp = await fetch<ArrayBuffer>(sound.play_url, {
        method: "GET",
        responseType: ResponseType.Binary,
        timeout: 10,
      });

      const blob = new Blob([new Uint8Array(resp.data)], { type: "audio/mpeg" });
      const blobUrl = URL.createObjectURL(blob);
      audioCache.current = blobUrl;

      ctx.setPlayingSampleUuid(`tl-${sound.id}`);
      ctx.setPlayerState({
        sampleName: sound.name.split("_").slice(-3).join(" "),
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

  const displayName = sound.library_path
    ? sound.library_path.split("/").pop() || sound.name
    : sound.name;

  return (
    <div className="flex w-full px-4 py-2 gap-4 rounded items-center hover:bg-foreground-100 select-none">
      {fgLoading && <style>{`* { cursor: wait }`}</style>}

      {/* Play button */}
      <div onClick={handlePlay} className="cursor-pointer w-8 flex-shrink-0">
        {fgLoading ? (
          <CircularProgress aria-label="Loading..." className="h-8" />
        ) : playing ? (
          <StopIcon className="w-8" />
        ) : (
          <PlayIcon className="w-8" />
        )}
      </div>

      {/* Favorite */}
      <div
        onClick={async (e) => {
          e.stopPropagation();
          const added = await toggleFavorite({
            uuid: `tl-${sound.id}`,
            name: displayName,
            packName: sound.sample_pack?.name || "Tracklib",
            bpm: sound.tempo || null,
            key: sound.key || null,
            duration: sound.length,
            category: sound.kind,
            addedAt: new Date().toISOString(),
          });
          setFaved(added);
          showToast(added ? "Added to favorites" : "Removed from favorites", added ? "success" : "info");
        }}
        className="cursor-pointer w-5 h-5 flex-shrink-0"
      >
        {faved ? (
          <HeartIcon className="w-5 h-5 text-danger-500" />
        ) : (
          <HeartOutline className="w-5 h-5 text-foreground-300 hover:text-danger-400" />
        )}
      </div>

      {/* Waveform */}
      <div className="hidden sm:block flex-shrink-0">
        <Waveform
          data={Array.from({ length: 40 }, () => Math.random() * 0.8 + 0.2)}
          progress={0}
          width={100}
          height={24}
        />
      </div>

      {/* Name + tags */}
      <div className="grow min-w-0">
        <div className="text-sm truncate">{displayName}</div>
        <div className="flex gap-1 flex-wrap">
          {sound.sample_pack && (
            <Chip size="sm" variant="flat" className="text-[10px]">
              {sound.sample_pack.name}
            </Chip>
          )}
          {sound.genres.map(g => (
            <Chip key={g.id} size="sm" variant="flat" color="secondary" className="text-[10px]">
              {g.name}
            </Chip>
          ))}
          {sound.tags.map(t => (
            <Chip key={t.id} size="sm" variant="flat" className="text-[10px]">
              {t.name}
            </Chip>
          ))}
        </div>
      </div>

      {/* Metadata */}
      <div className="flex gap-4 items-center flex-shrink-0 text-sm text-foreground-500">
        <span className="capitalize">{sound.kind.replace("_", "-")}</span>
        {sound.tempo > 0 && <span>{sound.tempo} BPM</span>}
        {sound.key && <span>{sound.key}</span>}
        <span>{(sound.length / 1000).toFixed(1)}s</span>
      </div>
    </div>
  );
}
