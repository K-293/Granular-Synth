export interface GranularParams {
  position: number;      // 0 to 1 (normalized position in buffer)
  spread: number;        // 0 to 1 (random offset from position)
  grainSize: number;     // 0.01 to 0.5 (seconds)
  density: number;       // 0.01 to 0.5 (interval between grains in seconds)
  pitch: number;         // 0.5 to 2.0 (playback rate)
  pitchSpread: number;   // 0 to 1 (random detune)
  volume: number;        // 0 to 1
  
  // ADSR Envelope
  attack: number;        // 0 to 2.0s
  decay: number;         // 0 to 2.0s
  sustain: number;       // 0 to 1.0 level
  release: number;       // 0 to 5.0s

  // FX
  delayTime: number;     // 0.0 to 1.0 (seconds)
  delayFeedback: number; // 0.0 to 0.95
  delayWet: number;      // 0.0 to 1.0
  reverbWet: number;     // 0.0 to 1.0
}

export interface PresetRequest {
  description: string;
}

export interface PresetResponse {
  grainSize: number;
  density: number;
  spread: number;
  pitch: number;
  pitchSpread: number;
  
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  
  delayTime: number;
  delayFeedback: number;
  delayWet: number;
  reverbWet: number;

  explanation: string;
}