import React, { useState, useEffect, useRef } from 'react';

interface KnobProps {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (val: number) => void;
  step?: number;
  unit?: string;
  size?: number;
}

export const Knob: React.FC<KnobProps> = ({
  label,
  min,
  max,
  value,
  onChange,
  step = 1,
  unit = '',
  size = 60,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef(0);
  const startValue = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    startY.current = e.clientY;
    startValue.current = value;
    document.body.style.cursor = 'ns-resize';
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaY = startY.current - e.clientY;
      const range = max - min;
      const sensitivity = 200; // pixels for full range
      const newValue = Math.min(max, Math.max(min, startValue.current + (deltaY / sensitivity) * range));
      onChange(Math.round(newValue / step) * step);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.style.cursor = 'default';
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, min, max, onChange, step]);

  const angle = ((value - min) / (max - min)) * 270 - 135;

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <div
        className="relative flex items-center justify-center cursor-ns-resize group"
        onMouseDown={handleMouseDown}
        style={{ width: size, height: size }}
      >
        {/* Knob Background */}
        <div className="absolute inset-0 rounded-full bg-zinc-800 border-2 border-zinc-700 shadow-inner group-hover:border-zinc-500 transition-colors" />
        
        {/* Indicator Line */}
        <div
          className="absolute w-1 h-1/2 bg-cyan-400 origin-bottom rounded-full"
          style={{ transform: `rotate(${angle}deg) translateY(-50%)` }}
        />
        
        {/* Center Cap */}
        <div className="absolute w-1/3 h-1/3 rounded-full bg-zinc-900 border border-zinc-700" />
      </div>
      
      <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">{label}</span>
      <span className="text-[10px] font-mono text-zinc-500">
        {value.toFixed(0)}{unit}
      </span>
    </div>
  );
};
