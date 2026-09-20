import { GoogleGenAI } from "@google/genai";

const apiKey = "AIzaSyA6dluSgJO8tiIiNKRdOqnAjxHKOvTlPuA";
const client = new GoogleGenAI({ apiKey });

console.log("Testing client.live.connect with gemini-3.1-flash-live-preview...");

try {
  const session = await client.live.connect({
    model: "gemini-3.1-flash-live-preview",
    config: {
      responseModalities: ["AUDIO"],
    },
    callbacks: {
      onopen: () => console.log("onopen called!"),
      onmessage: (msg) => console.log("onmessage:", JSON.stringify(msg)),
      onerror: (err) => console.error("onerror:", err),
      onclose: (e) => console.log("onclose:", e),
    },
  });
  console.log("Connected successfully to session!");
  await session.close();
} catch (e: unknown) {
  console.error("Caught error in live.connect:", (e as Error)?.message || e);
}
