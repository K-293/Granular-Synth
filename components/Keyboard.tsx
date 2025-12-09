import React from 'react';

interface KeyboardProps {
  activeNotes: number[]; // Array of currently active MIDI note numbers
  onNoteOn: (note: number) => void;
  onNoteOff: (note: number) => void;
  keyLabels?: Record<number, string>;
}

export const Keyboard: React.FC<KeyboardProps> = ({ activeNotes, onNoteOn, onNoteOff, keyLabels = {} }) => {
  // Range: C3 (48) to G5 (79)
  // This matches "2 octaves and 5 notes" (C3-C5 is 2 octaves, + C5-G5 is 5 notes)
  const startNote = 48; 
  const endNote = 79;
  const totalKeys = endNote - startNote + 1;
  const keys = [];

  // Generate keys
  for (let i = 0; i < totalKeys; i++) {
    const note = startNote + i;
    const isBlack = [1, 3, 6, 8, 10].includes(i % 12);
    keys.push({ note, isBlack });
  }

  const handleMouseDown = (note: number) => {
    onNoteOn(note);
  };

  const handleMouseUp = (note: number) => {
    onNoteOff(note);
  };

  const handleMouseEnter = (e: React.MouseEvent, note: number) => {
    if (e.buttons === 1) {
      onNoteOn(note);
    }
  };

  const handleMouseLeave = (e: React.MouseEvent, note: number) => {
    if (e.buttons === 1) {
      onNoteOff(note);
    }
  };

  // Helper to calculate total white keys for width distribution
  const totalWhiteKeys = keys.filter(k => !k.isBlack).length;

  return (
    <div className="w-full h-32 bg-slate-900 rounded-b-xl relative overflow-hidden shadow-inner border-t-4 border-slate-700 select-none">
      <div className="flex h-full relative">
        {keys.map((k) => {
          if (k.isBlack) return null; // Render whites first
          const isActive = activeNotes.includes(k.note);
          const label = keyLabels[k.note];
          
          return (
            <div
              key={k.note}
              className={`flex-1 border-r border-slate-300 h-full relative z-10 transition-colors duration-75 flex items-end justify-center pb-2
                ${isActive ? 'bg-blue-200 shadow-[inset_0_0_10px_rgba(0,100,255,0.5)]' : 'bg-chassis-100 hover:bg-white'}
                rounded-b-sm active:bg-blue-300
              `}
              onMouseDown={() => handleMouseDown(k.note)}
              onMouseUp={() => handleMouseUp(k.note)}
              onMouseEnter={(e) => handleMouseEnter(e, k.note)}
              onMouseLeave={(e) => handleMouseLeave(e, k.note)}
              onTouchStart={(e) => { e.preventDefault(); handleMouseDown(k.note); }}
              onTouchEnd={(e) => { e.preventDefault(); handleMouseUp(k.note); }}
            >
              {label && (
                <span className="text-[10px] font-bold text-slate-400 select-none pointer-events-none mb-1">
                  {label}
                </span>
              )}
            </div>
          );
        })}
        
        {/* Render Black Keys Overlay */}
        <div className="absolute top-0 left-0 w-full h-2/3 flex pointer-events-none z-20">
           {keys.map((k) => {
             if (!k.isBlack) return null;
             
             // Calculate position
             let whiteKeyIndex = 0;
             for(let n=startNote; n<k.note; n++) {
                const isNBlack = [1, 3, 6, 8, 10].includes((n - startNote) % 12);
                if (!isNBlack) whiteKeyIndex++;
             }
             
             const whiteKeyWidth = 100 / totalWhiteKeys;
             
             // Position centered on the line between the whiteKeyIndex-th white key and the next one.
             const left = (whiteKeyIndex) * whiteKeyWidth - (whiteKeyWidth * 0.35); 
             
             const isActive = activeNotes.includes(k.note);
             const label = keyLabels[k.note];

             return (
               <div
                 key={k.note}
                 className={`absolute w-[1.8%] h-full rounded-b-md pointer-events-auto transition-transform active:scale-y-95 origin-top flex items-end justify-center pb-2
                   ${isActive ? 'bg-device-blue shadow-[0_0_10px_#00f0ff]' : 'bg-slate-800 border-x border-b border-black'}
                 `}
                 style={{ left: `${left}%` }}
                 onMouseDown={() => handleMouseDown(k.note)}
                 onMouseUp={() => handleMouseUp(k.note)}
                 onMouseEnter={(e) => handleMouseEnter(e, k.note)}
                 onMouseLeave={(e) => handleMouseLeave(e, k.note)}
                 onTouchStart={(e) => { e.preventDefault(); handleMouseDown(k.note); }}
                 onTouchEnd={(e) => { e.preventDefault(); handleMouseUp(k.note); }}
               >
                 {label && (
                  <span className="text-[8px] font-bold text-slate-400 select-none pointer-events-none">
                    {label}
                  </span>
                 )}
               </div>
             );
           })}
        </div>
      </div>
    </div>
  );
};