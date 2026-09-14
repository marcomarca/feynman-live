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

export const AudioPlayerBar: React.FC<AudioPlayerBarProps> = ({ audioBase64, durationMs }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationMs ? durationMs / 1000 : 0);

  useEffect(() => {
    const audio = new Audio(audioBase64);
    audioRef.current = audio;

    const handleLoaded = () => {
      if (audio.duration && !Number.isNaN(audio.duration)) {
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

    audio.addEventListener("loadedmetadata", handleLoaded);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.pause();
      audio.removeEventListener("loadedmetadata", handleLoaded);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audioRef.current = null;
    };
  }, [audioBase64]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = Number(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
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
      />
    </div>
  );
};
