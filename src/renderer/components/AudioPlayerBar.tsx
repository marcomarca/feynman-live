import type React from "react";
import { useEffect, useRef, useState } from "react";

interface AudioPlayerBarProps {
  audioBase64: string;
  durationMs?: number;
}

function formatTime(seconds: number): string {
  if (Number.isNaN(seconds) || seconds < 0) return "0:00";
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationMs ? durationMs / 1000 : 0);

  useEffect(() => {
    if (!audioBase64) return;

    let blobUrl = "";
    try {
      blobUrl = base64ToBlobUrl(audioBase64);
    } catch {
      return;
    }

    const audio = new Audio(blobUrl);
    audio.preload = "auto";
    audioRef.current = audio;

    const handleLoaded = () => {
      if (audio.duration && !Number.isNaN(audio.duration) && Number.isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handlePlay = () => {
      setIsPlaying(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const handleError = () => {
      setIsPlaying(false);
    };

    audio.addEventListener("loadedmetadata", handleLoaded);
    audio.addEventListener("canplaythrough", handleLoaded);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("error", handleError);

    return () => {
      audio.pause();
      audio.removeEventListener("loadedmetadata", handleLoaded);
      audio.removeEventListener("canplaythrough", handleLoaded);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("error", handleError);
      audio.src = "";
      URL.revokeObjectURL(blobUrl);
      audioRef.current = null;
    };
  }, [audioBase64]);

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

  return (
    <div className="audio-player-bar">
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
