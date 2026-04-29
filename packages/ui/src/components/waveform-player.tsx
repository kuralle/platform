import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@kuralle/ui/lib/utils";

interface WaveformPlayerProps {
  /** Total duration in seconds. */
  durationSec: number;
  /** Current playhead position in seconds (controlled). */
  positionSec: number;
  onSeek: (positionSec: number) => void;
  /** Live mode — use Live Cyan instead of Signal Teal. */
  live?: boolean;
  /** Auto-generated waveform amplitudes. Provide for deterministic display. */
  amplitudes?: number[];
  height?: number;
  className?: string;
}

/**
 * The shared playhead waveform used by F2 Conversation detail and F3 Live
 * supervisor. Click anywhere on the track to seek; the playhead position
 * is owned by the parent so the transcript can scroll in lockstep.
 */
export function WaveformPlayer({
  durationSec,
  positionSec,
  onSeek,
  live,
  amplitudes,
  height = 48,
  className,
}: WaveformPlayerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const bars = useMemo(() => {
    const count = Math.max(48, Math.floor(width / 4));
    const seed = Math.max(1, Math.floor(durationSec));
    return amplitudes ?? generateAmplitudes(count, seed);
  }, [amplitudes, durationSec, width]);

  const playedFraction = durationSec > 0 ? Math.min(1, positionSec / durationSec) : 0;
  const playedBars = Math.round(bars.length * playedFraction);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const fraction = Math.max(0, Math.min(1, x / rect.width));
    onSeek(fraction * durationSec);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      onSeek(Math.max(0, positionSec - 5));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      onSeek(Math.min(durationSec, positionSec + 5));
    }
  }

  return (
    <div
      ref={ref}
      role="slider"
      aria-label="Audio playhead"
      aria-valuemin={0}
      aria-valuemax={durationSec}
      aria-valuenow={Math.round(positionSec)}
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        "relative flex w-full cursor-pointer select-none items-end gap-[2px] rounded-md bg-soft-hairline px-2 py-1.5",
        "outline-none focus-visible:ring-2 focus-visible:ring-signal-teal/50",
        className,
      )}
      style={{ height }}
    >
      {bars.map((amp, i) => (
        <span
          key={i}
          aria-hidden
          className={cn(
            "block w-[2px] rounded-full",
            i < playedBars
              ? live ? "bg-live-cyan" : "bg-signal-teal"
              : "bg-whisper-slate/60",
          )}
          style={{ height: `${20 + amp * 75}%` }}
        />
      ))}
      <span
        aria-hidden
        className={cn(
          "absolute top-0 bottom-0 w-[2px]",
          live ? "bg-live-cyan" : "bg-signal-teal",
        )}
        style={{ left: `${playedFraction * 100}%` }}
      />
    </div>
  );
}

function generateAmplitudes(count: number, seed: number): number[] {
  let s = seed * 0x9e3779b1;
  return Array.from({ length: count }, () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s & 0xff) / 255;
  });
}
