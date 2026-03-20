import { useEffect, useRef, useState } from "react";
import { PlayIcon, StopIcon } from "@heroicons/react/20/solid";

export interface PlayerState {
  sampleName: string;
  audioSrc: string;
  packName?: string;
  /** Unique play ID to force replay of same sample */
  playId?: number;
}

interface PlayerBarProps {
  playerState: PlayerState | null;
  onStop: () => void;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function PlayerBar({ playerState, onStop }: PlayerBarProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Create or update audio element when source changes
  useEffect(() => {
    if (!playerState) return;

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(playerState.audioSrc);
    audioRef.current = audio;

    audio.addEventListener("loadedmetadata", () => {
      setDuration(audio.duration);
    });

    audio.addEventListener("timeupdate", () => {
      if (!isDragging) {
        setCurrentTime(audio.currentTime);
      }
    });

    audio.addEventListener("ended", () => {
      setIsPlaying(false);
      setCurrentTime(0);
    });

    audio.play();
    setIsPlaying(true);
    setCurrentTime(0);

    return () => {
      audio.pause();
      audio.removeEventListener("loadedmetadata", () => {});
      audio.removeEventListener("timeupdate", () => {});
      audio.removeEventListener("ended", () => {});
    };
  }, [playerState?.audioSrc, playerState?.playId]);

  function handlePlayPause() {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  }

  function handleStop() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setCurrentTime(0);
    onStop();
  }

  function seekTo(clientX: number) {
    if (!progressRef.current || !audioRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const newTime = ratio * duration;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  }

  function handleProgressClick(e: React.MouseEvent) {
    seekTo(e.clientX);
  }

  function handleMouseDown(e: React.MouseEvent) {
    setIsDragging(true);
    seekTo(e.clientX);

    const handleMouseMove = (ev: MouseEvent) => {
      seekTo(ev.clientX);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }

  if (!playerState) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-content1 border-t border-divider px-6 py-3 z-50 shadow-lg">
      <div className="flex items-center gap-4">
        {/* Play/Pause + Stop buttons */}
        <div className="flex items-center gap-2 min-w-[80px]">
          <button
            onClick={handlePlayPause}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-primary text-white hover:bg-primary-600 transition-colors"
          >
            {isPlaying ? <StopIcon className="w-4" /> : <PlayIcon className="w-4" />}
          </button>
          <button
            onClick={handleStop}
            className="w-6 h-6 flex items-center justify-center rounded text-foreground-400 hover:text-foreground-600 transition-colors text-xs"
          >
            ✕
          </button>
        </div>

        {/* Current time */}
        <span className="text-xs text-foreground-500 min-w-[40px] text-right font-mono">
          {formatTime(currentTime)}
        </span>

        {/* Progress bar */}
        <div
          ref={progressRef}
          className="flex-1 h-2 bg-foreground-200 rounded-full cursor-pointer relative group"
          onClick={handleProgressClick}
          onMouseDown={handleMouseDown}
        >
          {/* Filled progress */}
          <div
            className="h-full bg-primary rounded-full transition-none relative"
            style={{ width: `${progress}%` }}
          >
            {/* Drag handle */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow border border-foreground-300 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>

        {/* Total duration */}
        <span className="text-xs text-foreground-500 min-w-[40px] font-mono">
          {formatTime(duration)}
        </span>

        {/* Sample info */}
        <div className="flex flex-col items-end min-w-[200px] max-w-[300px]">
          <span className="text-sm text-foreground-700 truncate w-full text-right">
            {playerState.sampleName}
          </span>
          {playerState.packName && (
            <span className="text-xs text-foreground-400 truncate w-full text-right">
              {playerState.packName}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
