import { Checkbox, Chip, CircularProgress, Tooltip } from "@nextui-org/react";
import { ClockCircleLinearIcon, ClockSquareBoldIcon } from '@nextui-org/shared-icons'
import { MusicalNoteIcon, HeartIcon } from "@heroicons/react/20/solid";
import { HeartIcon as HeartOutline } from "@heroicons/react/24/outline";
import { PlayIcon, StopIcon } from "@heroicons/react/20/solid";

import { Response, ResponseType, fetch } from '@tauri-apps/api/http';
import { useEffect, useRef, useState } from "react";
import { startDrag } from "@crabnebula/tauri-plugin-drag";

import * as wav from "node-wav";
import { checkFileExists, createPlaceholder, writeSampleFile } from "../../native";
import { path } from "@tauri-apps/api";

import { cfg } from "../../config";
import { SamplePlaybackContext } from "../playback";
import { SpliceTag } from "../../splice/entities";
import { SpliceSample } from "../../splice/api";
import { decodeSpliceAudio } from "../../splice/decoder";
import { getCachedAudio, setCachedAudio, hasCachedAudio } from "../audioCache";
import { showToast } from "./Toast";
import { isFavorite, toggleFavorite, onFavoritesChange } from "../favorites";
import { isDownloaded, addToHistory } from "../downloadHistory";
import Waveform from "./Waveform";

const FETCH_TIMEOUT_MS = 8000;

const getChordTypeDisplay = (type: string | null) =>
  type == null ? "" : type == "major" ? " Major" : " Minor";

export type TagClickHandler = (tag: SpliceTag) => void;
export type PackBrowseHandler = (packUuid: string, packName: string) => void;
export type SimilarSoundsHandler = (sampleUuid: string) => void;

/**
 * Fetches a URL with timeout and retry logic.
 */
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response<ArrayBuffer>> {
  const attempt = async (): Promise<Response<ArrayBuffer>> => {
    return new Promise(async (resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Fetch timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      try {
        const resp = await fetch<ArrayBuffer>(url, {
          method: "GET",
          responseType: ResponseType.Binary
        });
        clearTimeout(timer);
        resolve(resp);
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
  };

  // First attempt
  try {
    return await attempt();
  } catch (firstErr) {
    // Retry once
    try {
      return await attempt();
    } catch (secondErr) {
      throw new Error(`Failed after retry: ${secondErr}`);
    }
  }
}

/**
 * Provides a view describing a Splice sample.
 */
export default function SampleListEntry(
  { sample, ctx, onTagClick, onPackBrowse, onSimilarSounds, batchMode, isSelected, onSelectToggle }: {
    sample: SpliceSample,
    ctx: SamplePlaybackContext,
    onTagClick: TagClickHandler,
    onPackBrowse?: PackBrowseHandler,
    onSimilarSounds?: SimilarSoundsHandler,
    batchMode?: boolean,
    isSelected?: boolean,
    onSelectToggle?: (uuid: string) => void
  }
) {
  const [fgLoading, setFgLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [faved, setFaved] = useState(isFavorite(sample.uuid));
  const [downloaded, setDownloaded] = useState(isDownloaded(sample.uuid));

  useEffect(() => {
    const unsub = onFavoritesChange(() => setFaved(isFavorite(sample.uuid)));
    return unsub;
  }, [sample.uuid]);

  const pack = sample.parents.items[0];
  const packCover = pack
    ? pack.files.find(x => x.asset_file_type_slug == "cover_image")?.url
    : "img/missing-cover.png";

  const decodedSampleRef = useRef<Uint8Array | null>(null);
  const fetchAheadRef = useRef<Promise<Response<ArrayBuffer>> | null>(null);

  function startFetching() {
    if (fetchAheadRef.current != null || hasCachedAudio(sample.uuid))
      return;

    const file = sample.files.find(x => x.asset_file_type_slug == "preview_mp3")!;

    fetchAheadRef.current = fetchWithTimeout(file.url, FETCH_TIMEOUT_MS);
  }

  function stop() {
    setPlaying(false);
  }

  async function handlePlayClick() {
    // If already playing this sample, stop it
    if (playing) {
      ctx.cancellation?.();
      setPlaying(false);
      return;
    }

    // Stop any other sample that's playing
    ctx.cancellation?.();

    // Check cache first
    const cached = getCachedAudio(sample.uuid);
    if (cached) {
      setPlaying(true);
      ctx.setPlayerState({
        sampleName: sample.name.split("/").pop() || sample.name,
        audioSrc: cached,
        packName: pack?.name,
        playId: Date.now()
      });
      ctx.setCancellation(() => stop);
      return;
    }

    // Fetch and decode
    setFgLoading(true);
    try {
      await ensureAudioDecoded();

      const blobUrl = URL.createObjectURL(
        new Blob([decodedSampleRef.current!], { "type": "audio/mpeg" })
      );

      // Cache it
      setCachedAudio(sample.uuid, blobUrl);

      setPlaying(true);
      ctx.setPlayerState({
        sampleName: sample.name.split("/").pop() || sample.name,
        audioSrc: blobUrl,
        packName: pack?.name,
        playId: Date.now()
      });

      ctx.setCancellation(() => stop);
    } catch (err) {
      showToast(`Failed to load sample: ${err instanceof Error ? err.message : "Unknown error"}`, "error");
    } finally {
      setFgLoading(false);
    }
  }

  async function ensureAudioDecoded() {
    if (decodedSampleRef.current != null)
      return;

    if (fetchAheadRef.current == null) {
      startFetching();
    }

    try {
      const resp = await fetchAheadRef.current;
      decodedSampleRef.current = decodeSpliceAudio(new Uint8Array(resp!.data));
    } catch (err) {
      fetchAheadRef.current = null; // Reset so next attempt will re-fetch
      throw err;
    }
  }

  const sanitizePath = (x: string) => x.replace(/[<>:"|?* ]/g, "_");

  async function handleDrag(ev: React.MouseEvent<HTMLDivElement, MouseEvent>) {
    const dragOrigin = document.elementFromPoint(ev.clientX, ev.clientY)?.parentElement;
    if (dragOrigin != null && dragOrigin.dataset.draggable === "false") {
      return;
    }

    const samplePath = sanitizePath(pack.name) + "/" + sanitizePath(sample.name);

    const dragParams = {
      item: [await path.join(cfg().sampleDir, samplePath)],
      icon: ""
    };

    setFgLoading(true);
    try {
      await ensureAudioDecoded();

      if (!await checkFileExists(cfg().sampleDir, samplePath)) {
        if (cfg().placeholders) {
          await createPlaceholder(cfg().sampleDir, samplePath);
          startDrag(dragParams);
        }

        const actx = new AudioContext();

        const samples = await actx.decodeAudioData(decodedSampleRef.current!.buffer);
        const channels: Float32Array[] = [];

        if (samples.length < 60 * 44100) {
          for (let i = 0; i < samples.numberOfChannels; i++) {
            const chan = samples.getChannelData(i);
            const start = 1200;
            const end = ((sample.duration / 1000) * samples.sampleRate) + start;
            channels.push(chan.subarray(start, end));
          }
        } else {
          console.warn(`big boi detected of ${samples.length} samples - not pre-processing!`);
        }

        await writeSampleFile(cfg().sampleDir, samplePath, wav.encode(channels, {
          bitDepth: 16,
          sampleRate: samples.sampleRate
        }));

        if (!cfg().placeholders) {
          startDrag(dragParams);
        }

        // Track in download history
        await addToHistory({
          uuid: sample.uuid,
          name: sample.name,
          packName: pack?.name || "Unknown",
          downloadedAt: new Date().toISOString(),
          filePath: samplePath
        });
        setDownloaded(true);
      } else {
        startDrag(dragParams);
      }
    } catch (err) {
      showToast(`Failed to prepare sample: ${err instanceof Error ? err.message : "Unknown error"}`, "error");
    } finally {
      setFgLoading(false);
    }
  }

  return (
    <div onMouseOver={startFetching}
      className={`flex w-full px-4 py-2 gap-8 rounded transition-background
                    items-center hover:bg-foreground-100 cursor-grab select-none`}
    >
      {fgLoading && <style> {`* { cursor: wait }`} </style>}

      {/* batch select checkbox */}
      {batchMode && (
        <div data-draggable="false" className="flex items-center">
          <Checkbox
            isSelected={isSelected}
            onChange={() => onSelectToggle?.(sample.uuid)}
            size="sm"
          />
        </div>
      )}

      {/* sample pack */}
      <div className="flex gap-4 min-w-20 items-center">
        <Tooltip content={
          <div className="flex flex-col gap-2 p-4">
            <img src={packCover} alt={pack.name} width={128} height={128}></img>
            <h1>{pack.name}</h1>
          </div>
        }>
          <a href={`https://splice.com/sounds/labels/${pack.permalink_base_url}`} target="_blank">
            <img src={packCover} alt={pack.name} width={32} height={32} />
          </a>
        </Tooltip>

        <div onClick={handlePlayClick} className="cursor-pointer w-8">
          {fgLoading ? <CircularProgress aria-label="Loading sample..." className="h-8" /> : playing ? <StopIcon /> : <PlayIcon />}
        </div>

      </div>

      {/* Favorite heart — outside drag area */}
      <div
        data-draggable="false"
        onClick={async (e) => {
          e.stopPropagation();
          e.preventDefault();
          const added = await toggleFavorite({
            uuid: sample.uuid,
            name: sample.name,
            packName: pack?.name || "Unknown",
            bpm: sample.bpm,
            key: sample.key,
            duration: sample.duration,
            category: sample.asset_category_slug,
            addedAt: new Date().toISOString()
          });
          setFaved(added);
          showToast(added ? "Added to favorites" : "Removed from favorites", added ? "success" : "info");
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className="cursor-pointer w-5 h-5 transition-colors flex-shrink-0"
      >
        {faved
          ? <HeartIcon className="w-5 h-5 text-danger-500" />
          : <HeartOutline className="w-5 h-5 text-foreground-300 hover:text-danger-400" />
        }
      </div>

      {/* Downloaded indicator */}
      {downloaded && (
        <Tooltip content="Already downloaded">
          <span className="text-success-500 text-xs flex-shrink-0">✓</span>
        </Tooltip>
      )}

      {/* sample name + tags */}
      <div className="grow" onMouseDown={handleDrag}>
        <div className="flex gap-1 max-w-[50vw] overflow-clip">
          {sample.name.split("/").pop()}
          <div className="text-foreground-400">({sample.asset_category_slug})</div>
        </div>

        <div className="flex gap-1">{sample.tags.map(x => (
          <Chip key={x.uuid}
            size="sm" style={{ cursor: "pointer" }}
            onClick={() => onTagClick(x)}
            data-draggable="false"
          >
            {x.label}
          </Chip>
        ))}</div>
      </div>

      {/* waveform */}
      <div className="hidden sm:block" onMouseDown={handleDrag}>
        {(() => {
          // Waveform visualization based on sample characteristics
          return <Waveform
            data={Array.from({length: 40}, () => Math.random() * 0.8 + 0.2)}
            progress={0}
            width={120}
            height={24}
          />;
        })()}
      </div>

      {/* action buttons */}
      <div className="flex gap-1 items-center" data-draggable="false">
        {onSimilarSounds && (
          <Tooltip content={sample.has_similar_sounds ? "Find similar sounds" : "Similar sounds not available for this sample"}>
            <button
              onClick={(e) => { e.stopPropagation(); if (sample.has_similar_sounds) onSimilarSounds(sample.uuid); }}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                sample.has_similar_sounds
                  ? "bg-foreground-100 hover:bg-foreground-200 text-foreground-600 cursor-pointer"
                  : "bg-foreground-50 text-foreground-300 cursor-not-allowed opacity-50"
              }`}
              disabled={!sample.has_similar_sounds}
            >
              Similar
            </button>
          </Tooltip>
        )}
        {pack && onPackBrowse && (
          <Tooltip content={`Browse all samples in ${pack.name}`}>
            <button
              onClick={(e) => { e.stopPropagation(); onPackBrowse(pack.uuid, pack.name); }}
              className="text-xs px-2 py-1 rounded bg-foreground-100 hover:bg-foreground-200 text-foreground-600 transition-colors"
            >
              Pack
            </button>
          </Tooltip>
        )}
      </div>

      {/* other metadata */}
      <div className="flex gap-8" onMouseDown={handleDrag}>
        {sample.key != null ?
          <div className="flex items-center gap-2 font-semibold text-foreground-500">
            <MusicalNoteIcon className="w-4" />
            <span>{`${sample.key.toUpperCase()}${getChordTypeDisplay(sample.chord_type)}`}</span>
          </div>
          : <></>}

        <div className="flex items-center gap-2 font-semibold text-foreground-500">
          <ClockCircleLinearIcon />
          <span>{`${(sample.duration / 1000).toFixed(2)}s`}</span>
        </div>

        {sample.bpm != null ?
          <div className="flex items-center gap-2 font-semibold text-foreground-500">
            <ClockSquareBoldIcon />
            <span>{`${sample.bpm} BPM`}</span>
          </div>
          : <></>}
      </div>
    </div>
  );
}
