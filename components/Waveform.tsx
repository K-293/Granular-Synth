import React, { useEffect, useRef, useState } from 'react';

interface WaveformProps {
  buffer: AudioBuffer | null;
  position: number; // Normalized 0-1 within the Clip
  spread: number;
  sampleRange: [number, number]; // [Start, End] normalized 0-1 relative to File
  onPositionChange: (newPos: number) => void;
  onSampleRangeChange: (range: [number, number]) => void;
}

export const Waveform: React.FC<WaveformProps> = ({ 
  buffer, 
  position, 
  spread, 
  sampleRange,
  onPositionChange,
  onSampleRangeChange
}) => {
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const thumbCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragMode, setDragMode] = useState<'none' | 'left' | 'right' | 'move'>('none');

  // Helper to draw waveform
  const drawWaveform = (
    ctx: CanvasRenderingContext2D, 
    width: number, 
    height: number, 
    data: Float32Array,
    color: string
  ) => {
    ctx.clearRect(0, 0, width, height);
    
    // Grid/Background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < width; i += 40) ctx.moveTo(i, 0), ctx.lineTo(i, height);
    ctx.stroke();

    // Waveform
    ctx.fillStyle = color;
    const step = Math.ceil(data.length / width);
    const amp = height / 2;
    
    ctx.beginPath();
    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = data[(i * step) + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      ctx.fillRect(i, amp + min * amp, 1, Math.max(1, (max - min) * amp));
    }
  };

  // 1. Draw Main View (Zoomed)
  useEffect(() => {
    const canvas = mainCanvasRef.current;
    if (!canvas || !containerRef.current) return;
    
    const w = containerRef.current.offsetWidth;
    const h = containerRef.current.offsetHeight * 0.7; // 70% height
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!buffer) {
       ctx.fillStyle = '#0f172a'; ctx.fillRect(0,0,w,h);
       ctx.fillStyle = '#64748b'; ctx.font = '16px monospace'; ctx.textAlign = 'center';
       ctx.fillText('NO SAMPLE', w/2, h/2);
       return;
    }

    // Extract slice based on sampleRange
    const fullData = buffer.getChannelData(0);
    const startIdx = Math.floor(sampleRange[0] * fullData.length);
    const endIdx = Math.floor(sampleRange[1] * fullData.length);
    const sliceData = fullData.slice(startIdx, endIdx);

    drawWaveform(ctx, w, h, sliceData, '#38bdf8');

    // Draw Grain Playhead (relative to slice)
    const x = position * w;
    const spreadPx = spread * w;
    ctx.fillStyle = 'rgba(0, 240, 255, 0.2)';
    ctx.fillRect(Math.max(0, x - spreadPx), 0, spreadPx * 2, h);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();

  }, [buffer, position, spread, sampleRange]);

  // 2. Draw Thumbnail View (Full)
  useEffect(() => {
    const canvas = thumbCanvasRef.current;
    if (!canvas || !containerRef.current) return;

    const w = containerRef.current.offsetWidth;
    const h = containerRef.current.offsetHeight * 0.3; // 30% height
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!buffer) {
        ctx.fillStyle = '#020617'; ctx.fillRect(0,0,w,h);
        return; 
    }

    const data = buffer.getChannelData(0);
    // Draw darker waveform
    drawWaveform(ctx, w, h, data, '#1e40af');

    // Draw Window Overlay
    const [start, end] = sampleRange;
    const sx = start * w;
    const ex = end * w;
    
    // Dim areas outside selection
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, sx, h);
    ctx.fillRect(ex, 0, w - ex, h);

    // Border for active area
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx, 0, ex - sx, h);

    // Handles
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(sx, 0, 4, h); // Left Handle
    ctx.fillRect(ex - 4, 0, 4, h); // Right Handle

  }, [buffer, sampleRange]);

  // Main Canvas Interaction (Playhead)
  const handleMainInteract = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const x = clientX - rect.left;
    const newPos = Math.max(0, Math.min(1, x / canvas.width));
    onPositionChange(newPos);
  };

  // Thumb Canvas Interaction (Clipping)
  const handleThumbDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (!thumbCanvasRef.current) return;
    const rect = thumbCanvasRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const xPct = (clientX - rect.left) / rect.width;
    const [start, end] = sampleRange;
    
    // Tolerance for handle grabbing
    const tol = 0.02; 

    if (Math.abs(xPct - start) < tol) setDragMode('left');
    else if (Math.abs(xPct - end) < tol) setDragMode('right');
    else if (xPct > start && xPct < end) setDragMode('move');
    else setDragMode('none');
  };

  const handleThumbMouseMove = (e: React.MouseEvent) => {
     const canvas = thumbCanvasRef.current;
     if (!canvas) return;
     const rect = canvas.getBoundingClientRect();
     const clientX = e.clientX;
     let xPct = (clientX - rect.left) / rect.width;
     
     const [start, end] = sampleRange;
     const tol = 0.02;

     // Dragging Logic
     if (e.buttons === 1 && dragMode !== 'none') {
         xPct = Math.max(0, Math.min(1, xPct));
         const width = end - start;

         if (dragMode === 'left') {
             onSampleRangeChange([Math.min(xPct, end - 0.01), end]);
             canvas.style.cursor = 'ew-resize';
         } else if (dragMode === 'right') {
             onSampleRangeChange([start, Math.max(xPct, start + 0.01)]);
             canvas.style.cursor = 'ew-resize';
         } else if (dragMode === 'move') {
             const halfWidth = width / 2;
             let newStart = xPct - halfWidth;
             let newEnd = xPct + halfWidth;
             if (newStart < 0) { newStart = 0; newEnd = width; }
             if (newEnd > 1) { newEnd = 1; newStart = 1 - width; }
             onSampleRangeChange([newStart, newEnd]);
             canvas.style.cursor = 'grabbing';
         }
         return;
     }

     // Hover Logic (Visual Feedback)
     if (Math.abs(xPct - start) < tol) {
         canvas.style.cursor = 'ew-resize';
     } else if (Math.abs(xPct - end) < tol) {
         canvas.style.cursor = 'ew-resize';
     } else if (xPct > start && xPct < end) {
         canvas.style.cursor = 'grab';
     } else {
         canvas.style.cursor = 'default';
     }
  };

  // For touch moves, we just handle logic, no cursor
  const handleThumbTouchMove = (e: React.TouchEvent) => {
    if (dragMode === 'none' || !thumbCanvasRef.current) return;
    const rect = thumbCanvasRef.current.getBoundingClientRect();
    const clientX = e.touches[0].clientX;
    let xPct = (clientX - rect.left) / rect.width;
    xPct = Math.max(0, Math.min(1, xPct));
    
    const [start, end] = sampleRange;
    const width = end - start;

    if (dragMode === 'left') {
        onSampleRangeChange([Math.min(xPct, end - 0.01), end]);
    } else if (dragMode === 'right') {
        onSampleRangeChange([start, Math.max(xPct, start + 0.01)]);
    } else if (dragMode === 'move') {
        const halfWidth = width / 2;
        let newStart = xPct - halfWidth;
        let newEnd = xPct + halfWidth;
        if (newStart < 0) { newStart = 0; newEnd = width; }
        if (newEnd > 1) { newEnd = 1; newStart = 1 - width; }
        onSampleRangeChange([newStart, newEnd]);
    }
  };

  return (
    <div ref={containerRef} className="w-full h-80 bg-device-screen rounded-lg overflow-hidden border-4 border-gray-700 shadow-screen relative flex flex-col">
      {/* Main View */}
      <canvas
        ref={mainCanvasRef}
        onMouseDown={(e) => { if (e.buttons === 1) handleMainInteract(e); }}
        onMouseMove={(e) => { if (e.buttons === 1) handleMainInteract(e); }}
        onTouchStart={handleMainInteract}
        onTouchMove={handleMainInteract}
        className="cursor-crosshair w-full flex-grow block relative z-10"
      />
      
      {/* Divider */}
      <div className="h-1 bg-slate-700 w-full z-20"></div>

      {/* Minimap View */}
      <canvas
        ref={thumbCanvasRef}
        onMouseDown={handleThumbDown}
        onMouseMove={handleThumbMouseMove}
        onMouseUp={() => setDragMode('none')}
        onMouseLeave={() => setDragMode('none')}
        onTouchStart={handleThumbDown}
        onTouchMove={handleThumbTouchMove}
        onTouchEnd={() => setDragMode('none')}
        className="w-full block relative z-10 border-t border-slate-600"
        style={{ height: '30%' }}
      />
      
      <div className="absolute inset-0 pointer-events-none scanlines z-20 opacity-30"></div>
    </div>
  );
};