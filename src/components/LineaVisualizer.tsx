import React, { useEffect, useRef } from 'react';
import * as Tone from 'tone';

interface LineaVisualizerProps {
  analyser: Tone.Analyser | null;
  fft: Tone.Analyser | null;
  isPlaying: boolean;
  color?: string;
}

export const LineaVisualizer: React.FC<LineaVisualizerProps> = ({ 
  analyser, 
  fft,
  isPlaying, 
  color = '#22d3ee' 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();

  const draw = () => {
    if (!canvasRef.current || !analyser || !fft) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const buffer = analyser.getValue() as Float32Array;
    const fftBuffer = fft.getValue() as Float32Array;
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);
    
    // Background glow
    ctx.shadowBlur = 15;
    ctx.shadowColor = color;
    
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const centerY = height * 0.65;
    const charWidth = 140;
    const charX = width / 2 - charWidth / 2;
    
    // Calculate frequency bands for character animation
    let bass = 0;
    for (let i = 0; i < 20; i++) bass += Math.abs(fftBuffer[i]);
    bass = (bass / 20 + 100) / 100;
    
    let mids = 0;
    for (let i = 20; i < 100; i++) mids += Math.abs(fftBuffer[i]);
    mids = (mids / 80 + 100) / 100;

    let highs = 0;
    for (let i = 100; i < 256; i++) highs += Math.abs(fftBuffer[i]);
    highs = (highs / 156 + 100) / 100;

    const bounce = isPlaying ? (bass - 1) * 200 : 0;
    const mouthOpen = isPlaying ? (mids - 1) * 100 : 0;
    const armWave = isPlaying ? (highs - 1) * 120 : 0;
    const energy = (bass + mids + highs) / 3;

    // Background energy pulses
    if (isPlaying) {
      ctx.save();
      const gradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width / 2);
      gradient.addColorStop(0, `${color}11`);
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.globalAlpha = (energy - 1) * 0.5;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }

    // Draw "Speed Lines" when energy is high
    if (isPlaying && energy > 1.1) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.globalAlpha = (energy - 1) * 0.3;
      for (let i = 0; i < 5; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const len = Math.random() * 100 * energy;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + len, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 1. Left side of the line (Oscilloscope)
    const leftPoints = Math.floor(charX / (width / buffer.length));
    for (let i = 0; i < leftPoints; i++) {
      const x = (i / buffer.length) * width;
      const y = centerY + (buffer[i] * height * 0.45);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    // 2. The "La Linea" Character (Enhanced Silhouette)
    const startX = charX;
    const startY = centerY + (buffer[leftPoints] * height * 0.45);

    // Feet/Legs (React to Bass)
    ctx.lineTo(startX, startY);
    ctx.lineTo(startX + 20, startY - 30 - bounce);
    ctx.lineTo(startX + 40, startY);
    
    // Body/Back
    ctx.bezierCurveTo(
      startX + 30, startY - 80 - bounce,
      startX + 50, startY - 120 - bounce,
      startX + 80, startY - 120 - bounce
    );

    // Head/Nose (Iconic profile)
    const noseX = startX + 130 + (isPlaying ? Math.sin(Date.now() * 0.015) * 15 : 0);
    ctx.lineTo(noseX, startY - 120 - bounce);
    
    // Mouth (Reacts to Mids)
    ctx.lineTo(startX + 100, startY - 100 - bounce + mouthOpen);
    ctx.lineTo(startX + 85, startY - 90 - bounce);

    // Front/Arms (React to Highs)
    ctx.lineTo(startX + 70, startY - 70 - bounce);
    
    // Arm out (Waving)
    const armEndX = startX + 110 + armWave;
    const armEndY = startY - 60 - bounce - armWave * 0.6;
    ctx.lineTo(armEndX, armEndY);
    
    // Hand (Simplified fingers)
    ctx.lineTo(armEndX + 8, armEndY - 8);
    ctx.lineTo(armEndX, armEndY);
    ctx.lineTo(armEndX + 8, armEndY + 8);
    ctx.lineTo(armEndX, armEndY);

    ctx.lineTo(startX + 70, startY - 45 - bounce);
    
    // Back to line
    ctx.lineTo(startX + 80, startY);
    ctx.lineTo(startX + charWidth, startY);

    // 3. Right side of the line (Oscilloscope)
    const rightStartIdx = leftPoints + Math.floor(charWidth / (width / buffer.length));
    for (let i = rightStartIdx; i < buffer.length; i++) {
      const x = (i / buffer.length) * width;
      const y = centerY + (buffer[i] * height * 0.45);
      ctx.lineTo(x, y);
    }

    ctx.stroke();

    requestRef.current = requestAnimationFrame(draw);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(draw);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [analyser, fft, isPlaying]);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        const parent = canvasRef.current.parentElement;
        if (parent) {
          canvasRef.current.width = parent.clientWidth;
          canvasRef.current.height = parent.clientHeight;
        }
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      className="w-full h-full"
      style={{ filter: 'drop-shadow(0 0 8px rgba(34, 211, 238, 0.3))' }}
    />
  );
};
