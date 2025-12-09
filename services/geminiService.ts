import { GoogleGenAI, Type } from "@google/genai";
import { PresetResponse } from "../types";

export const generateSynthPreset = async (description: string): Promise<PresetResponse> => {
  const apiKey = process.env.API_KEY;
  
  if (!apiKey) {
    throw new Error("API Key is missing. Please set the API_KEY environment variable.");
  }

  const ai = new GoogleGenAI({ apiKey });

  // Schema for the synthesizer parameters
  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      grainSize: { type: Type.NUMBER, description: "Duration of each grain in seconds (0.01 to 0.5)." },
      density: { type: Type.NUMBER, description: "Time interval between grains (0.01 to 0.5)." },
      spread: { type: Type.NUMBER, description: "Position randomization (0.0 to 0.5)." },
      pitch: { type: Type.NUMBER, description: "Playback rate (0.2 to 2.0)." },
      pitchSpread: { type: Type.NUMBER, description: "Random pitch deviation (0.0 to 1.0)." },
      
      attack: { type: Type.NUMBER, description: "Envelope Attack time in seconds (0.01 to 2.0)." },
      decay: { type: Type.NUMBER, description: "Envelope Decay time in seconds (0.01 to 2.0)." },
      sustain: { type: Type.NUMBER, description: "Envelope Sustain level (0.0 to 1.0)." },
      release: { type: Type.NUMBER, description: "Envelope Release time in seconds (0.1 to 5.0)." },

      delayTime: { type: Type.NUMBER, description: "Delay time (0.0 to 1.0)." },
      delayFeedback: { type: Type.NUMBER, description: "Delay feedback (0.0 to 0.95)." },
      delayWet: { type: Type.NUMBER, description: "Delay mix (0.0 to 1.0)." },
      reverbWet: { type: Type.NUMBER, description: "Reverb mix (0.0 to 1.0)." },

      explanation: { type: Type.STRING, description: "Short creative reason for these settings." }
    },
    required: ["grainSize", "density", "spread", "pitch", "pitchSpread", "attack", "decay", "sustain", "release", "delayTime", "delayFeedback", "delayWet", "reverbWet", "explanation"],
  };

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Generate granular synthesizer parameters for a sound texture described as: "${description}".
      
      Guidelines:
      - "Pad" or "Ambient": Slow Attack (>0.5), Long Release (>1.0), High Reverb.
      - "Pluck" or "Percussive": Fast Attack (0.01), Short Decay, Low Sustain, Short Release.
      - "Drone": Long Attack, Max Sustain (1.0).
      - "Glitch": Fast Attack, Low density, High randomness.
      `,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      },
    });

    if (response.text) {
      return JSON.parse(response.text) as PresetResponse;
    } else {
      throw new Error("No data returned from Gemini.");
    }
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};