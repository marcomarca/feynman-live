import { WebSocket } from "ws";

const apiKey = "AIzaSyA6dluSgJO8tiIiNKRdOqnAjxHKOvTlPuA";
const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

console.log("Connecting directly to v1beta WebSocket with gemini-3.1-flash-live-preview...");
const ws = new WebSocket(url);

ws.on("open", () => {
  console.log("WebSocket open!");
  const setup = {
    setup: {
      model: "models/gemini-3.1-flash-live-preview",
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: "Puck"
            }
          }
        }
      }
    }
  };
  console.log("Sending setup payload:", JSON.stringify(setup));
  ws.send(JSON.stringify(setup));
});

ws.on("message", (data) => {
  console.log("Received message:", data.toString());
  const parsed = JSON.parse(data.toString());
  if (parsed.setupComplete) {
    console.log("Setup completed! Sending text turn...");
    const textMsg = {
      clientContent: {
        turns: [
          {
            role: "user",
            parts: [{ text: "Hola" }]
          }
        ],
        turnComplete: true
      }
    };
    ws.send(JSON.stringify(textMsg));
  }
  if (parsed.serverContent) {
    console.log("Got serverContent! Success!");
    ws.close();
  }
});

ws.on("error", (err) => console.error("WS error:", err));
ws.on("close", (code, reason) => console.log("WS closed:", code, reason.toString()));
