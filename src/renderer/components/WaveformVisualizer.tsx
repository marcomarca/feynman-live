import type React from "react";

export interface WaveformVisualizerProps {
  volume: number; // 0 to 1
  isSpeaking: boolean;
}

export const WaveformVisualizer: React.FC<WaveformVisualizerProps> = ({ volume, isSpeaking }) => {
  const barCount = 12;
  const bars = Array.from({ length: barCount }, (_, i) => {
    // Generate organic wave variations based on index and current volume
    const factor = Math.sin((i / barCount) * Math.PI);
    const height = Math.max(4, Math.min(36, volume * 36 * factor + Math.random() * 4));
    return height;
  });

  return (
    <div className="waveform-bars">
      {bars.map((h, idx) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: Fixed size static visual bars
          key={idx}
          className="waveform-bar"
          style={{
            height: `${h}px`,
            background: isSpeaking ? "#06b6d4" : "#6366f1",
            boxShadow: volume > 0.1 ? `0 0 8px ${isSpeaking ? "#06b6d4" : "#6366f1"}` : "none",
          }}
        />
      ))}
    </div>
  );
};
