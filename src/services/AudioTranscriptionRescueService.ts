import { GoogleGenAI } from "@google/genai";
import { GEMINI_TRANSCRIPTION_MODEL } from "../shared/constants";
import type { LoggerPort } from "../shared/logger";
import { defaultLogger } from "../shared/logger";

export interface AudioTranscriptionRescuePort {
  transcribeAudioWav(wavBytes: Uint8Array, apiKey: string): Promise<string | null>;
}

export class AudioTranscriptionRescueService implements AudioTranscriptionRescuePort {
  constructor(private readonly logger: LoggerPort = defaultLogger) {}

  async transcribeAudioWav(wavBytes: Uint8Array, apiKey: string): Promise<string | null> {
    if (!apiKey || wavBytes.byteLength < 3200) {
      return null;
    }

    try {
      this.logger.info(
        "AudioTranscriptionRescueService",
        `Iniciando transcripción de rescate de audio (${wavBytes.byteLength} bytes)...`,
      );
      const client = new GoogleGenAI({ apiKey });
      const base64Audio = Buffer.from(
        wavBytes.buffer,
        wavBytes.byteOffset,
        wavBytes.byteLength,
      ).toString("base64");

      const response = await client.models.generateContent({
        model: GEMINI_TRANSCRIPTION_MODEL,
        contents: [
          {
            inlineData: {
              mimeType: "audio/wav",
              data: base64Audio,
            },
          },
          {
            text: "Transcribe exactamente el audio proporcionado en su idioma original. Devuelve únicamente el texto literal de lo que dice el usuario, sin comillas, sin etiquetas, sin notas y sin explicaciones adicionales.",
          },
        ],
      });

      const text = response.text?.trim();
      if (text) {
        this.logger.info(
          "AudioTranscriptionRescueService",
          `Transcripción de rescate completada exitosamente: "${text.slice(0, 100)}..."`,
        );
        return text;
      }
      return null;
    } catch (e) {
      this.logger.warn(
        "AudioTranscriptionRescueService",
        `Error al intentar transcripción de rescate: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
  }
}
