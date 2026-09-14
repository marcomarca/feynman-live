import type React from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

interface AudioPlayerBarProps {
  audioBase64: string;
  durationMs?: number;
}

function formatTime(seconds: number): string {
  if (Number.isNaN(seconds) || seconds < 0 || !Number.isFinite(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function base64ToBlobUrl(base64Data: string): string {
  if (base64Data.startsWith("blob:")) return base64Data;
  const commaIdx = base64Data.indexOf(",");
  const rawBase64 = commaIdx >= 0 ? base64Data.slice(commaIdx + 1) : base64Data;
  const binary = window.atob(rawBase64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: "audio/wav" });
  return URL.createObjectURL(blob);
}

export const AudioPlayerBar: React.FC<AudioPlayerBarProps> = ({ audioBase64, durationMs }) => {
  const playerId = useId();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationMs ? durationMs / 1000 : 0);

  // Generate Blob URL and ensure cleanup on unmount or input change
  const blobUrl = useMemo(() => {
    if (!audioBase64) return "";
    try {
      return base64ToBlobUrl(audioBase64);
    } catch {
      return "";
    }
  }, [audioBase64]);

  useEffect(() => {
    return () => {
      if (blobUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  // Pause other players when one starts playing
  useEffect(() => {
    const handleGlobalPlay = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string }>;
      if (customEvent.detail?.id !== playerId && audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
      }
    };

    window.addEventListener("feynman:audio-play", handleGlobalPlay);
    return () => {
      window.removeEventListener("feynman:audio-play", handleGlobalPlay);
    };
  }, [playerId]);

  const handleLoadedMetadata = () => {
    const audio = audioRef.current;
    if (audio?.duration && !Number.isNaN(audio.duration) && Number.isFinite(audio.duration)) {
      setDuration(audio.duration);
    }
  };

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (audio) {
      setCurrentTime(audio.currentTime);
    }
  };

  const handlePlay = () => {
    setIsPlaying(true);
    window.dispatchEvent(new CustomEvent("feynman:audio-play", { detail: { id: playerId } }));
  };

  const handlePause = () => {
    setIsPlaying(false);
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      audio.play().catch(() => {
        setIsPlaying(false);
      });
    } else {
      audio.pause();
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = Number(e.target.value);
    setCurrentTime(newTime);
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = newTime;
    }
  };

  if (!blobUrl) return null;

  return (
    <div className="audio-player-bar">
      {/* biome-ignore lint/a11y/useMediaCaption: audio text transcription is provided in the message container */}
      <audio
        ref={audioRef}
        src={blobUrl}
        preload="metadata"
        onLoadedMetadata={handleLoadedMetadata}
        onDurationChange={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onPlay={handlePlay}
        onPause={handlePause}
        onEnded={handleEnded}
      />

      <button
        type="button"
        className="audio-player-btn"
        onClick={togglePlay}
        aria-label={isPlaying ? "Pausar audio" : "Reproducir audio"}
      >
        {isPlaying ? (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="currentColor"
            role="img"
            aria-label="Pausa"
          >
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="currentColor"
            role="img"
            aria-label="Play"
          >
            <polygon points="5,3 19,12 5,21" />
          </svg>
        )}
      </button>

      <span className="audio-player-time">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      <input
        type="range"
        className="audio-player-slider"
        min={0}
        max={duration || 1}
        step={0.05}
        value={currentTime}
        onChange={handleSeek}
        aria-label="Progreso del audio"
      />
    </div>
  );
};
