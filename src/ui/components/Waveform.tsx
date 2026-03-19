import { useEffect, useRef } from "react";

interface WaveformProps {
  /** URL to the waveform JSON data from Splice */
  data: number[] | null;
  /** Current playback progress 0-1 */
  progress?: number;
  /** Width in pixels */
  width?: number;
  /** Height in pixels */
  height?: number;
  /** Click handler for seeking */
  onSeek?: (ratio: number) => void;
}

/**
 * Renders a waveform visualization from Splice's waveform data.
 * Displays as a series of vertical bars with played portion highlighted.
 */
export default function Waveform({
  data,
  progress = 0,
  width = 200,
  height = 32,
  onSeek
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !data || data.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    const barCount = Math.min(data.length, Math.floor(width / 3));
    const barWidth = Math.max(1, (width / barCount) - 1);
    const gap = 1;

    // Normalize data
    const maxVal = Math.max(...data, 0.01);

    for (let i = 0; i < barCount; i++) {
      const dataIdx = Math.floor((i / barCount) * data.length);
      const value = (data[dataIdx] || 0) / maxVal;
      const barHeight = Math.max(1, value * (height - 2));

      const x = i * (barWidth + gap);
      const y = (height - barHeight) / 2;

      const ratio = i / barCount;
      if (ratio <= progress) {
        ctx.fillStyle = "hsl(212, 95%, 55%)"; // primary blue for played
      } else {
        ctx.fillStyle = "hsl(0, 0%, 60%)"; // gray for unplayed
      }

      ctx.fillRect(x, y, barWidth, barHeight);
    }
  }, [data, progress, width, height]);

  if (!data || data.length === 0) return null;

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ width, height, cursor: onSeek ? "pointer" : "default" }}
      onClick={(e) => {
        if (!onSeek) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        onSeek(Math.max(0, Math.min(1, ratio)));
      }}
    />
  );
}
