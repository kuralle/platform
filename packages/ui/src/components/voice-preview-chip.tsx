import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@kuralle/ui/lib/utils";

interface VoicePreviewChipProps {
  voiceId: string;
  voiceName: string;
  language: string;
  /** Optional sample preview audio URL. If omitted, the chip simulates a 4s preview. */
  previewUrl?: string;
  className?: string;
  onTogglePlay?: (next: boolean) => void;
}

/**
 * The voice-preview chip — appears on C4 Voice tab and M4 A/B comparator.
 * 32px tall rounded rectangle, animated waveform sparkline only while playing.
 */
export function VoicePreviewChip({
  voiceId,
  voiceName,
  language,
  previewUrl,
  className,
  onTogglePlay,
}: VoicePreviewChipProps) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      audioRef.current?.pause();
    };
  }, []);

  function toggle() {
    const next = !playing;
    setPlaying(next);
    onTogglePlay?.(next);
    if (previewUrl) {
      if (!audioRef.current) audioRef.current = new Audio(previewUrl);
      if (next) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => undefined);
        audioRef.current.onended = () => setPlaying(false);
      } else {
        audioRef.current.pause();
      }
    } else if (next) {
      // Simulated preview — auto-stop in 4s.
      timerRef.current = window.setTimeout(() => setPlaying(false), 4000);
    }
  }

  return (
    <button
      type="button"
      data-voice-id={voiceId}
      onClick={toggle}
      className={cn(
        "group inline-flex h-8 items-center gap-2 rounded-lg border bg-card px-2 pr-3",
        "transition hover:border-signal-teal/50 hover:bg-signal-teal/5",
        playing && "border-signal-teal/60 bg-signal-teal/5",
        className,
      )}
    >
      <span
        className={cn(
          "flex size-6 items-center justify-center rounded-md text-mute-slate",
          "group-hover:text-signal-teal",
          playing && "text-signal-teal",
        )}
      >
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </span>
      <span className="text-[13px] font-medium text-operator-slate">{voiceName}</span>
      <span className="rounded-md bg-audit-indigo/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.04em] text-audit-indigo">
        {language}
      </span>
      <PreviewWaveform playing={playing} />
    </button>
  );
}

function PreviewWaveform({ playing }: { playing: boolean }) {
  // 12-bar mini-bar visualizer that animates (CSS-only) while playing.
  return (
    <span className="ml-1 inline-flex h-4 w-[60px] items-end gap-[2px]">
      {Array.from({ length: 12 }).map((_, i) => (
        <span
          key={i}
          aria-hidden
          className={cn(
            "block w-[2px] rounded-full bg-signal-teal/40 transition-all",
            playing && "bg-signal-teal animate-pulse",
          )}
          style={{
            height: `${30 + ((i * 41) % 70)}%`,
            animationDelay: `${i * 60}ms`,
            animationDuration: `${600 + ((i * 113) % 380)}ms`,
          }}
        />
      ))}
    </span>
  );
}
