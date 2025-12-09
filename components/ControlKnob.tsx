import React, { useState, useEffect, useRef } from 'react';

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (val: number) => void;
  unit?: string;
  size?: number;
}

export const Knob: React.FC<KnobProps> = ({ label, value, min, max, onChange, unit = '', size = 60 }) => {
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef<number>(0);
  const startValueRef = useRef<number>(0);

  // Convert value to angle (0 to 270 degrees)
  const range = max - min;
  const normalized = (value - min) / range;
  const angle = normalized * 270 - 135; // -135 to +135

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startYRef.current = e.clientY;
    startValueRef.current = value;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaY = startYRef.current - e.clientY;
      const sensitivity = 0.005 * range; // Adjust sensitivity based on range
      const newValue = Math.min(max, Math.max(min, startValueRef.current + deltaY * sensitivity));
      onChange(newValue);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, min, max, onChange, range]);

  return (
    <div className="flex flex-col items-center group">
      <div className="relative mb-2" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 100 100" className="overflow-visible">
          {/* Knob Body */}
          <circle cx="50" cy="50" r="45" fill="#1a202c" stroke="#334155" strokeWidth="2" className="drop-shadow-lg" />
          
          {/* Indicator Line */}
          <line
            x1="50" y1="50" x2="50" y2="10"
            stroke="#38bdf8"
            strokeWidth="4"
            strokeLinecap="round"
            transform={`rotate(${angle} 50 50)`}
          />
          
          {/* Active Ring (Optional decoration) */}
           <path
            d={`M 20 80 A 45 45 0 1 1 80 80`}
            fill="none"
            stroke="#475569"
            strokeWidth="4"
            strokeLinecap="round"
            opacity="0.3"
            transform="rotate(135 50 50)"
          />
        </svg>
        
        {/* Invisible Hit Area */}
        <div 
          onMouseDown={handleMouseDown}
          className="absolute inset-0 cursor-ns-resize rounded-full"
        />
      </div>
      
      <div className="text-center">
        <div className="text-[10px] font-bold uppercase tracking-wider text-device-blue mb-0.5 whitespace-nowrap">{label}</div>
        <div className="text-[9px] font-mono text-slate-500 bg-white/50 px-1 rounded inline-block">
          {value.toFixed(2)}{unit}
        </div>
      </div>
    </div>
  );
};

interface FaderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (val: number) => void;
  unit?: string;
}

export const Fader: React.FC<FaderProps> = ({ label, value, min, max, step, onChange, unit = '' }) => {
  return (
    <div className="flex flex-col items-center w-full">
      <div className="w-full flex justify-between items-end mb-1 px-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-device-blue">{label}</span>
        <span className="text-[9px] font-mono text-slate-500">{value.toFixed(2)}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="fader"
      />
    </div>
  );
};

export const VerticalFader: React.FC<FaderProps> = ({ label, value, min, max, step, onChange, unit = '' }) => {
  return (
    <div className="flex flex-col items-center h-full justify-end group">
       <div className="h-32 w-8 bg-slate-900 rounded-md relative p-1 shadow-inner border border-slate-700">
          {/* Track Line */}
          <div className="absolute left-1/2 top-2 bottom-2 w-0.5 bg-slate-700 -translate-x-1/2"></div>
          
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="absolute top-0 left-0 w-32 h-8 origin-top-left -rotate-90 translate-y-32 cursor-pointer opacity-0 z-10"
          />
          
          {/* Visual Thumb */}
          <div 
            className="absolute left-0 w-full h-6 bg-slate-300 rounded border-y border-white shadow-button pointer-events-none transition-colors group-hover:bg-slate-200"
            style={{ 
              bottom: `${((value - min) / (max - min)) * (100 - 20)}%` // Adjust for thumb height
            }}
          >
             <div className="w-4 h-0.5 bg-slate-400 mx-auto mt-2.5"></div>
          </div>
       </div>
       <div className="mt-2 text-center">
        <div className="text-[10px] font-bold uppercase tracking-wider text-device-blue">{label}</div>
      </div>
    </div>
  );
};