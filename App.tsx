import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Waveform } from './components/Waveform';
import { Knob, Fader, VerticalFader } from './components/ControlKnob';
import { Keyboard } from './components/Keyboard';
import { GranularParams } from './types';
import { generateSynthPreset } from './services/geminiService';
import { Loader2, Wand2, Play, Square, AlertCircle, Info, Sliders, Music, Cable, ChevronDown, ChevronUp, Keyboard as KeyboardIcon, Sparkles, Upload } from 'lucide-react';

// Computer Keyboard to MIDI Note Mapping
// Layout: 
// Row 1 (Bottom): Z=C3 ... M=B3, comma=C4, dot=D4, slash=E4
// Row 2 (Top):    Q=C4 ... I=C5, O=D5, P=E5, [=F5, ]=G5
const KEY_TO_NOTE: Record<string, number> = {
  // --- Bottom Row (Starts C3 = 48) ---
  'z': 48, // C3
  's': 49, // C#3
  'x': 50, // D3
  'd': 51, // D#3
  'c': 52, // E3
  'v': 53, // F3
  'g': 54, // F#3
  'b': 55, // G3
  'h': 56, // G#3
  'n': 57, // A3
  'j': 58, // A#3
  'm': 59, // B3
  ',': 60, // C4 (Overlap)
  'l': 61, // C#4 (Overlap)
  '.': 62, // D4 (Overlap)
  ';': 63, // D#4 (Overlap)
  '/': 64, // E4 (Overlap)

  // --- Top Row (Starts C4 = 60) ---
  'q': 60, // C4
  '2': 61, // C#4
  'w': 62, // D4
  '3': 63, // D#4
  'e': 64, // E4
  'r': 65, // F4
  '5': 66, // F#4
  't': 67, // G4
  '6': 68, // G#4
  'y': 69, // A4
  '7': 70, // A#4
  'u': 71, // B4
  'i': 72, // C5
  '9': 73, // C#5
  'o': 74, // D5
  '0': 75, // D#5
  'p': 76, // E5
  '[': 77, // F5
  '=': 78, // F#5
  ']': 79, // G5
};

// Reverse map for display labels. 
const NOTE_TO_KEY: Record<number, string> = {};
Object.entries(KEY_TO_NOTE).forEach(([key, note]) => {
  if (!NOTE_TO_KEY[note]) {
      NOTE_TO_KEY[note] = key.toUpperCase();
  } else {
      if (['q','w','e','r','t','y','u','i','o','p'].includes(key)) {
          NOTE_TO_KEY[note] = key.toUpperCase();
      }
  }
});

interface NoteState {
  velocity: number;
  startTime: number;
  releaseTime?: number;
  isReleased: boolean;
}

const App: React.FC = () => {
  // --- Audio State ---
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false); // Drone Mode
  
  // Sample Clipping State: [start, end] normalized 0-1
  const [sampleRange, setSampleRange] = useState<[number, number]>([0, 1]);
  
  // --- MIDI & Keyboard State ---
  const activeNotesRef = useRef<Map<number, NoteState>>(new Map());
  const [activeNotesUI, setActiveNotesUI] = useState<number[]>([]);
  const [midiAccess, setMidiAccess] = useState<any>(null);
  const [showKeyboard, setShowKeyboard] = useState(true);

  // --- AI State ---
  const [showAI, setShowAI] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  
  // --- Audio Graph Refs ---
  const audioGraphRef = useRef<{
    input: GainNode;
    dryGain: GainNode;
    delay: DelayNode;
    delayFeedback: GainNode;
    delayWet: GainNode;
    reverb: ConvolverNode;
    reverbWet: GainNode;
    master: GainNode;
    compressor: DynamicsCompressorNode;
  } | null>(null);

  // --- Refs for Audio Loop ---
  const paramsRef = useRef<GranularParams>({
    position: 0.5,
    spread: 0.1,
    grainSize: 0.1,
    density: 0.05,
    pitch: 1.0,
    pitchSpread: 0.0,
    volume: 0.7,
    attack: 0.1,
    decay: 0.2,
    sustain: 0.8,
    release: 0.5,
    delayTime: 0.3,
    delayFeedback: 0.4,
    delayWet: 0.0,
    reverbWet: 0.0,
  });

  const [params, setParams] = useState<GranularParams>(paramsRef.current);
  const nextGrainTimeRef = useRef<number>(0);
  const timerIdRef = useRef<number | null>(null);

  // --- Initialize Audio Context & Graph ---
  useEffect(() => {
    const initAudio = () => {
      if (audioContext) return;
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      const input = ctx.createGain();
      const dryGain = ctx.createGain();
      const delay = ctx.createDelay(5.0);
      const delayFeedback = ctx.createGain();
      const delayWet = ctx.createGain();
      const reverb = ctx.createConvolver();
      const reverbWet = ctx.createGain();
      const master = ctx.createGain();
      const compressor = ctx.createDynamicsCompressor();

      // Parallel Processing: Dry + Delay + Reverb
      input.connect(dryGain);
      dryGain.connect(master);
      dryGain.gain.value = 1.0; // Ensure dry signal is audible

      input.connect(delay);
      delay.connect(delayFeedback);
      delayFeedback.connect(delay);
      delay.connect(delayWet);
      delayWet.connect(master);

      try {
          reverb.buffer = createImpulseResponse(ctx, 3.0, 3.0);
      } catch (e) {
          console.warn("Failed to create impulse response", e);
      }
      input.connect(reverb);
      reverb.connect(reverbWet);
      reverbWet.connect(master);

      master.connect(compressor);
      compressor.connect(ctx.destination);

      audioGraphRef.current = {
        input, dryGain, delay, delayFeedback, delayWet, reverb, reverbWet, master, compressor
      };
      setAudioContext(ctx);
    };

    document.addEventListener('click', initAudio, { once: true });
    return () => document.removeEventListener('click', initAudio);
  }, [audioContext]);

  // --- Computer Keyboard Listeners ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const key = e.key.toLowerCase();
      if (KEY_TO_NOTE[key]) {
        handleNoteOn(KEY_TO_NOTE[key]);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (KEY_TO_NOTE[key]) {
        handleNoteOff(KEY_TO_NOTE[key]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [audioContext]);

  // --- MIDI Setup ---
  useEffect(() => {
    const nav = navigator as any;
    if (nav.requestMIDIAccess) {
      nav.requestMIDIAccess().then(onMIDISuccess, onMIDIFailure);
    }

    function onMIDISuccess(midi: any) {
      setMidiAccess(midi);
      const inputs = midi.inputs.values();
      for (let input of inputs) {
        input.onmidimessage = getMIDIMessage;
      }
      midi.onstatechange = () => {
         const inputs = midi.inputs.values();
         for (let input of inputs) {
            input.onmidimessage = getMIDIMessage;
         }
      };
    }

    function onMIDIFailure() {
      console.warn("Could not access your MIDI devices.");
    }

    function getMIDIMessage(message: any) {
      const command = message.data[0];
      const note = message.data[1];
      const velocity = (message.data.length > 2) ? message.data[2] : 0;

      if (command >= 144 && command <= 159 && velocity > 0) {
        handleNoteOn(note, velocity / 127);
      }
      else if ((command >= 128 && command <= 143) || (command >= 144 && command <= 159 && velocity === 0)) {
        handleNoteOff(note);
      }
    }
  }, [audioContext]);

  const handleNoteOn = (note: number, velocity: number = 0.8) => {
    if (audioContext) {
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
    }
    
    // Add to active notes with start time for ADSR
    const startTime = audioContext ? audioContext.currentTime : 0;
    activeNotesRef.current.set(note, { velocity, startTime, isReleased: false });
    
    // Force update UI
    setActiveNotesUI(prev => {
        if (!prev.includes(note)) return [...prev, note];
        return prev;
    });
    
    if (!timerIdRef.current && audioContext) {
        // Reset scheduling clock to now to avoid catch-up bursts
        nextGrainTimeRef.current = audioContext.currentTime;
        scheduleGrains();
    }
  };

  const handleNoteOff = (note: number) => {
    const noteData = activeNotesRef.current.get(note);
    if (noteData && audioContext) {
      activeNotesRef.current.set(note, { 
        ...noteData, 
        isReleased: true, 
        releaseTime: audioContext.currentTime 
      });
      // Remove from UI immediately for visual feedback
      setActiveNotesUI(prev => prev.filter(n => n !== note));
    } else {
        // Fallback if context not ready
        activeNotesRef.current.delete(note);
        setActiveNotesUI(prev => prev.filter(n => n !== note));
    }
  };

  const createImpulseResponse = (ctx: AudioContext, duration: number, decay: number) => {
    const rate = ctx.sampleRate;
    const length = rate * duration;
    const impulse = ctx.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const n = i / length;
      const atten = Math.pow(1 - n, decay);
      left[i] = (Math.random() * 2 - 1) * atten;
      right[i] = (Math.random() * 2 - 1) * atten;
    }
    return impulse;
  };

  useEffect(() => {
    if (!audioContext || !audioGraphRef.current) return;
    const { delay, delayFeedback, delayWet, reverbWet } = audioGraphRef.current;
    const now = audioContext.currentTime;
    const ramp = 0.1;

    delay.delayTime.setTargetAtTime(Math.max(0.001, params.delayTime), now, ramp);
    delayFeedback.gain.setTargetAtTime(params.delayFeedback, now, ramp);
    delayWet.gain.setTargetAtTime(params.delayWet, now, ramp);
    reverbWet.gain.setTargetAtTime(params.reverbWet, now, ramp);
  }, [params, audioContext]);

  const updateParam = (key: keyof GranularParams, value: number) => {
    const newParams = { ...params, [key]: value };
    setParams(newParams);
    paramsRef.current = newParams;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !audioContext) return;
    setIsPlaying(false);
    
    // Resume context if needed
    if (audioContext.state === 'suspended') await audioContext.resume();

    const arrayBuffer = await file.arrayBuffer();
    try {
      const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer);
      setAudioBuffer(decodedBuffer);
      setSampleRange([0, 1]); // Reset clip
      setAiExplanation("Audio loaded successfully. Adjust clip below if needed.");
    } catch (err) {
      console.error("Error decoding audio", err);
      setAiError("Failed to decode audio file.");
    }
  };

  // Needed to access current sampleRange in the callback which is a closure
  const sampleRangeRef = useRef(sampleRange);
  useEffect(() => { sampleRangeRef.current = sampleRange; }, [sampleRange]);

  const scheduleGrains = useCallback(() => {
    if (!audioContext || !audioBuffer || !audioGraphRef.current) return;
    const ctx = audioContext;
    const p = paramsRef.current;
    const dest = audioGraphRef.current.input;
    const [clipStart, clipEnd] = sampleRangeRef.current;
    
    // Lookahead: Schedule 100ms into the future
    while (nextGrainTimeRef.current < ctx.currentTime + 0.1) {
      const now = nextGrainTimeRef.current;
      
      const notesToPlay: { playbackRate: number, gain: number }[] = [];

      // Drone voice
      if (isPlaying) {
        notesToPlay.push({ playbackRate: p.pitch, gain: 1.0 });
      }

      // Base note for 1.0 pitch is C3 (48)
      const baseNote = 48; 
      
      // Process Active Notes (with ADSR)
      activeNotesRef.current.forEach((data, note) => {
         // Cleanup finished notes
         if (data.isReleased && data.releaseTime && (now > data.releaseTime + p.release)) {
            activeNotesRef.current.delete(note);
            return;
         }

         // Calculate Envelope
         let envGain = 0;
         const timeSinceStart = now - data.startTime;

         // Sanity check for negative time (scheduling caught up weirdly)
         const safeTime = Math.max(0, timeSinceStart);

         if (!data.isReleased) {
             // Attack / Decay / Sustain Phase
             if (safeTime < p.attack) {
                 envGain = (safeTime / Math.max(0.001, p.attack));
             } else if (safeTime < p.attack + p.decay) {
                 const decayProgress = (safeTime - p.attack) / Math.max(0.001, p.decay);
                 envGain = 1.0 - (1.0 - p.sustain) * decayProgress;
             } else {
                 envGain = p.sustain;
             }
         } else if (data.releaseTime) {
             // Release Phase
             const timeSinceRelease = now - data.releaseTime;
             if (timeSinceRelease < p.release) {
                 // Simplified Release: Fade from current sustain level
                 envGain = p.sustain * (1.0 - (timeSinceRelease / Math.max(0.001, p.release)));
             } else {
                 envGain = 0;
             }
         }
         
         if (envGain > 0.001) {
             const semitones = note - baseNote; 
             const rate = p.pitch * Math.pow(2, semitones / 12);
             notesToPlay.push({ playbackRate: rate, gain: data.velocity * envGain });
         }
      });

      if (notesToPlay.length > 0) {
        notesToPlay.forEach(voice => {
            const src = ctx.createBufferSource();
            const env = ctx.createGain();
            src.buffer = audioBuffer;

            const clipDurationPct = clipEnd - clipStart;
            
            const randomOffset = (Math.random() - 0.5) * 2 * p.spread;
            let relativeGrainPos = p.position + randomOffset;
            
            // Wrap or Clamp
            if (relativeGrainPos < 0) relativeGrainPos += 1;
            if (relativeGrainPos > 1) relativeGrainPos -= 1;
            
            const absolutePosPct = clipStart + (relativeGrainPos * clipDurationPct);
            
            // Safety Clamp: Ensure we don't start past the end
            const safeStartPct = Math.max(0, Math.min(1, absolutePosPct));
            let offsetSeconds = safeStartPct * audioBuffer.duration;
            const duration = p.grainSize;

            // Ensure we don't play past the buffer duration
            if (offsetSeconds + duration > audioBuffer.duration) {
                offsetSeconds = Math.max(0, audioBuffer.duration - duration);
            }

            const randomPitch = 1.0 + (Math.random() - 0.5) * 2 * p.pitchSpread;
            const finalRate = Math.max(0.1, voice.playbackRate * randomPitch);
            
            src.playbackRate.value = finalRate;
            
            src.connect(env);
            env.connect(dest);

            const peakGain = p.volume * voice.gain;

            // Hanning Window
            env.gain.setValueAtTime(0, now);
            env.gain.linearRampToValueAtTime(peakGain, now + duration * 0.2);
            env.gain.linearRampToValueAtTime(peakGain, now + duration * 0.8);
            env.gain.linearRampToValueAtTime(0, now + duration);

            src.start(now, offsetSeconds, duration);
            src.stop(now + duration + 0.1); // Cleanup
        });
      }

      nextGrainTimeRef.current += Math.max(0.005, p.density);
    }
    
    timerIdRef.current = requestAnimationFrame(scheduleGrains);
  }, [audioContext, audioBuffer, isPlaying]);

  useEffect(() => {
    // Start loop if playing or if there are notes (including releasing notes) in the map
    const hasNotes = activeNotesRef.current.size > 0;
    
    if ((isPlaying || hasNotes) && audioContext) {
      if (audioContext.state === 'suspended') audioContext.resume();
      
      // Reset timer if it fell behind significantly (more than 200ms)
      if (nextGrainTimeRef.current < audioContext.currentTime - 0.2) {
         nextGrainTimeRef.current = audioContext.currentTime;
      }
      
      if (!timerIdRef.current) {
         nextGrainTimeRef.current = Math.max(nextGrainTimeRef.current, audioContext.currentTime);
         timerIdRef.current = requestAnimationFrame(scheduleGrains);
      }
    } else {
        // If not playing and no notes left, stop loop
        if (!isPlaying && !hasNotes && timerIdRef.current) {
             cancelAnimationFrame(timerIdRef.current);
             timerIdRef.current = null;
        }
    }
    return () => {
      if (timerIdRef.current) cancelAnimationFrame(timerIdRef.current);
    };
  }, [isPlaying, activeNotesUI, scheduleGrains, audioContext]);

  const handleAIPresets = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setAiError(null);
    setAiExplanation(null);

    try {
      const preset = await generateSynthPreset(prompt);
      updateParam('grainSize', preset.grainSize);
      updateParam('density', preset.density);
      updateParam('spread', preset.spread);
      updateParam('pitch', preset.pitch);
      updateParam('pitchSpread', preset.pitchSpread);
      updateParam('attack', preset.attack);
      updateParam('decay', preset.decay);
      updateParam('sustain', preset.sustain);
      updateParam('release', preset.release);
      updateParam('delayTime', preset.delayTime);
      updateParam('delayFeedback', preset.delayFeedback);
      updateParam('delayWet', preset.delayWet);
      updateParam('reverbWet', preset.reverbWet);
      setAiExplanation(preset.explanation);
    } catch (err) {
      setAiError("Could not generate preset. Check API Key.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center bg-chassis-200 pb-20 font-sans text-slate-700">
      
      {/* Main Container */}
      <div className="w-full max-w-6xl p-4 md:p-8 flex flex-col space-y-6">
        
        {/* Header Section */}
        <header className="flex justify-between items-end px-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-device-blue">NEBULA <span className="font-light text-slate-500">GR-1</span></h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mt-1">Granular Synthesis Engine</p>
          </div>
          <div className="flex items-center space-x-4">
             {midiAccess && (
               <div className="flex items-center text-xs text-slate-500 bg-slate-300 px-2 py-1 rounded shadow-inner">
                 <Cable className="w-3 h-3 mr-1" />
                 MIDI READY
               </div>
             )}
             {!audioContext && (
                <button onClick={() => audioContext?.resume()} className="text-amber-600 text-xs font-bold animate-pulse flex items-center cursor-pointer">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  CLICK TO INIT AUDIO
                </button>
              )}
          </div>
        </header>

        {/* TOP ROW: Screen & Engine */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Main Controls Area */}
          <div className="lg:col-span-12 space-y-6">
            
            {/* Display Area */}
            <div className="relative">
              <Waveform 
                buffer={audioBuffer}
                position={params.position}
                spread={params.spread}
                sampleRange={sampleRange}
                onPositionChange={(pos) => updateParam('position', pos)}
                onSampleRangeChange={setSampleRange}
              />
              <div className="absolute top-4 left-4 text-[10px] text-device-accent font-mono opacity-70 pointer-events-none">
                 SCAN: {(params.position * 100).toFixed(1)}%<br/>
                 CLIP: {(sampleRange[0]*100).toFixed(0)}-{(sampleRange[1]*100).toFixed(0)}%
              </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6">
                
                {/* LEFT COLUMN: Voice & ADSR */}
                <div className="flex-grow bg-slate-100/50 rounded-xl p-6 border border-white shadow-inner relative">
                    
                   {/* Sample Source Button (Placed above parameters as requested) */}
                   <div className="absolute top-4 left-4 z-10">
                       <label className="flex items-center space-x-2 cursor-pointer group">
                           <div className="bg-slate-300 hover:bg-slate-400 text-slate-700 text-[10px] font-bold py-1 px-3 rounded shadow-button active:shadow-button-pressed transition-all flex items-center">
                               <Upload className="w-3 h-3 mr-2" />
                               {audioBuffer ? "CHANGE SAMPLE" : "LOAD SAMPLE"}
                           </div>
                           <input type="file" accept="audio/*" onChange={handleFileUpload} className="hidden" />
                       </label>
                   </div>
                   
                   <div className="flex items-center justify-end space-x-2 mb-6 border-b border-slate-300 pb-2 h-8">
                     <Sliders className="w-4 h-4 text-device-blue" />
                     <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Voice Engine</h2>
                   </div>

                   <div className="flex flex-col md:flex-row gap-8">
                       {/* Knobs Area */}
                       <div className="flex-grow grid grid-cols-5 gap-2 items-center">
                          <Knob label="Density" value={params.density} min={0.01} max={0.2} onChange={(v) => updateParam('density', v)} />
                          <Knob label="Grain Size" value={params.grainSize} min={0.01} max={0.5} onChange={(v) => updateParam('grainSize', v)} />
                          <Knob label="Spray" value={params.spread} min={0} max={0.5} onChange={(v) => updateParam('spread', v)} />
                          <Knob label="Pitch" value={params.pitch} min={0.1} max={4.0} onChange={(v) => updateParam('pitch', v)} />
                          <Knob label="Tune Rnd" value={params.pitchSpread} min={0} max={1.0} onChange={(v) => updateParam('pitchSpread', v)} />
                       </div>
                       
                       {/* ADSR Area */}
                       <div className="flex-shrink-0 flex space-x-3 items-end pb-2 border-l border-slate-300 pl-6 bg-slate-50/50 rounded-r-lg">
                          <VerticalFader label="A" value={params.attack} min={0.01} max={2.0} step={0.01} onChange={(v) => updateParam('attack', v)} />
                          <VerticalFader label="D" value={params.decay} min={0.01} max={2.0} step={0.01} onChange={(v) => updateParam('decay', v)} />
                          <VerticalFader label="S" value={params.sustain} min={0} max={1.0} step={0.01} onChange={(v) => updateParam('sustain', v)} />
                          <VerticalFader label="R" value={params.release} min={0.1} max={5.0} step={0.01} onChange={(v) => updateParam('release', v)} />
                       </div>
                   </div>
                </div>
            </div>

            {/* FX SECTION */}
            <div className="bg-slate-100/50 rounded-xl p-6 border border-white shadow-inner">
               <div className="flex items-center space-x-2 mb-6 border-b border-slate-300 pb-2">
                 <Music className="w-4 h-4 text-device-blue" />
                 <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Effects & Output</h2>
               </div>
               
               <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
                 <div className="md:col-span-5 flex justify-around border-r border-slate-200 pr-4">
                    <Knob label="Delay Time" value={params.delayTime} min={0.01} max={1.0} size={50} onChange={(v) => updateParam('delayTime', v)} />
                    <Knob label="Feedback" value={params.delayFeedback} min={0} max={0.95} size={50} onChange={(v) => updateParam('delayFeedback', v)} />
                    <Knob label="Delay Mix" value={params.delayWet} min={0} max={1.0} size={50} onChange={(v) => updateParam('delayWet', v)} />
                 </div>

                 <div className="md:col-span-3 flex justify-center border-r border-slate-200 pr-4">
                     <Knob label="Reverb" value={params.reverbWet} min={0} max={1.0} size={60} onChange={(v) => updateParam('reverbWet', v)} />
                 </div>

                 <div className="md:col-span-4 flex justify-center">
                     {/* Main Volume as Large Pot */}
                     <Knob label="MAIN VOL" value={params.volume} min={0} max={1.0} size={80} onChange={(v) => updateParam('volume', v)} />
                 </div>
               </div>
            </div>

          </div>
        </div>
        
        {/* KEYBOARD & AI SECTION */}
        <div className="space-y-2">
            
            {/* Collapsible Keyboard */}
            {showKeyboard && (
              <div className="w-full bg-chassis-200 rounded-xl border border-white shadow-lg p-2 animate-in slide-in-from-top-4 fade-in duration-300">
                 <div className="bg-slate-800 rounded-t-lg p-1 flex justify-center items-center relative">
                     <div className="h-1 w-16 bg-slate-600 rounded-full"></div>
                 </div>
                 <Keyboard 
                    activeNotes={activeNotesUI}
                    onNoteOn={(n) => handleNoteOn(n)}
                    onNoteOff={(n) => handleNoteOff(n)}
                    keyLabels={NOTE_TO_KEY}
                 />
              </div>
            )}
            
            {/* Bottom Bar: Toggle Buttons */}
            <div className="flex justify-between items-center bg-slate-200 rounded-lg p-2 shadow-button border border-white">
                 <button 
                    onClick={() => setShowKeyboard(!showKeyboard)}
                    className="flex items-center text-xs font-bold text-slate-600 hover:text-device-blue px-4 py-2"
                  >
                    <KeyboardIcon className="w-4 h-4 mr-2"/> {showKeyboard ? "HIDE KEYS" : "SHOW KEYS"}
                 </button>

                 <div className="h-4 w-px bg-slate-400"></div>

                 <button 
                  onClick={() => setIsPlaying(!isPlaying)}
                  disabled={!audioBuffer}
                  className={`flex items-center text-xs font-bold px-4 py-2 transition-colors ${isPlaying ? 'text-device-blue' : 'text-slate-600 hover:text-slate-800'}`}
                >
                  {isPlaying ? <Square className="w-4 h-4 mr-2 fill-current" /> : <Play className="w-4 h-4 mr-2 fill-current" />}
                  DRONE MODE
                </button>

                 <div className="h-4 w-px bg-slate-400"></div>

                 <button 
                    onClick={() => setShowAI(!showAI)}
                    className={`flex items-center text-xs font-bold px-4 py-2 transition-colors ${showAI ? 'text-device-accent bg-slate-800 rounded shadow-inner' : 'text-slate-600 hover:text-device-blue'}`}
                  >
                    <Sparkles className="w-4 h-4 mr-2"/> AI PATCH GEN
                    {showAI ? <ChevronDown className="w-4 h-4 ml-2"/> : <ChevronUp className="w-4 h-4 ml-2"/>}
                 </button>
            </div>
            
            {/* Inline AI Panel (Expandable) */}
             {showAI && (
               <div className="w-full bg-slate-800 rounded-xl shadow-2xl p-6 border border-slate-600 animate-in slide-in-from-top-2 fade-in duration-200 mt-2">
                 <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex-shrink-0 text-white md:w-1/4">
                      <h2 className="font-bold text-lg flex items-center"><Wand2 className="w-5 h-5 mr-2 text-device-accent" /> AI DESIGNER</h2>
                      <p className="text-slate-400 text-xs mt-2 leading-relaxed">Describe a texture (e.g., "Metallic swarm with long release" or "Glitchy underwater drums"). The AI will configure the engine and ADSR envelope.</p>
                    </div>
                    
                    <div className="flex-grow flex flex-col gap-4">
                      <div className="flex gap-4">
                        <textarea
                          value={prompt}
                          onChange={(e) => setPrompt(e.target.value)}
                          placeholder="Describe your sound..."
                          className="flex-grow bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-300 focus:outline-none focus:border-device-blue h-20 resize-none shadow-inner font-mono"
                        />
                        <button
                          onClick={handleAIPresets}
                          disabled={isGenerating || !prompt}
                          className="w-32 bg-device-blue hover:bg-blue-600 text-white rounded font-bold text-sm shadow-lg flex flex-col justify-center items-center transition-all disabled:opacity-50 disabled:bg-slate-600"
                        >
                          {isGenerating ? <Loader2 className="w-6 h-6 animate-spin mb-1" /> : <Wand2 className="w-6 h-6 mb-1" />}
                          {isGenerating ? "..." : "MAKE"}
                        </button>
                      </div>
    
                      {aiExplanation && !isGenerating && (
                        <div className="p-3 bg-slate-700/50 border border-slate-600 rounded text-slate-300 text-xs flex items-start">
                            <Info className="w-4 h-4 mr-2 shrink-0 mt-0.5 text-device-accent" />
                            <p>{aiExplanation}</p>
                        </div>
                      )}
                       {aiError && (
                         <div className="text-red-400 text-xs">{aiError}</div>
                      )}
                    </div>
                 </div>
               </div>
             )}
        </div>

      </div>
    </div>
  );
};

export default App;