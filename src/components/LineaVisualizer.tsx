import React, { useEffect, useRef } from 'react';
import * as Tone from 'tone';
import { interpolate } from 'flubber';

interface LineaVisualizerProps {
  analyser: Tone.Analyser | null;
  fft: Tone.Analyser | null;
  isPlaying: boolean;
  color?: string;
  imageUrls?: string[];
  svgPaths?: string[];
  glowIntensity?: number;
  lineThickness?: number;
  devilMode?: boolean;
  vibratoDepth?: number;
  vibratoRate?: number;
  bitcrush?: number;
  chorus?: number;
}

export const LineaVisualizer: React.FC<LineaVisualizerProps> = ({ 
  analyser, 
  fft,
  isPlaying, 
  color = '#22d3ee',
  imageUrls = [],
  svgPaths = [],
  glowIntensity = 0.5,
  lineThickness = 4,
  devilMode = false,
  vibratoDepth = 0,
  vibratoRate = 5,
  bitcrush = 16,
  chorus = 0
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();
  const imagesRef = useRef<HTMLImageElement[]>([]);
  const currentFrameRef = useRef(0);
  const nextFrameRef = useRef(0);
  const transitionRef = useRef(0);
  const lastSwitchTime = useRef(0);
  const processedImagesRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const interpolatorsRef = useRef<Map<string, (t: number) => string>>(new Map());

  // Clear cache when color changes
  useEffect(() => {
    processedImagesRef.current.clear();
  }, [color]);

  // Load images
  useEffect(() => {
    if (imageUrls.length > 0) {
      const loadedImages = imageUrls.map(url => {
        const img = new Image();
        img.src = url;
        img.crossOrigin = "anonymous";
        return img;
      });
      imagesRef.current = loadedImages;
    }
  }, [imageUrls]);

  // Pre-calculate SVG interpolators
  useEffect(() => {
    if (svgPaths.length > 1) {
      interpolatorsRef.current.clear();
      // We'll create interpolators on the fly or pre-calculate common ones
      // For simplicity in this reactive environment, we'll do it in the draw loop or as needed
    }
  }, [svgPaths]);

  const processImage = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, alpha: number) => {
    if (!img.complete || img.naturalWidth === 0) return;
    
    const cacheKey = `${img.src}-${color}`;
    let processedCanvas = processedImagesRef.current.get(cacheKey);

    if (!processedCanvas) {
      // Create a temporary canvas to process the image (Chroma Key + Tint)
      processedCanvas = document.createElement('canvas');
      processedCanvas.width = img.width;
      processedCanvas.height = img.height;
      const tempCtx = processedCanvas.getContext('2d');
      if (!tempCtx) return;

      tempCtx.drawImage(img, 0, 0);
      const imageData = tempCtx.getImageData(0, 0, processedCanvas.width, processedCanvas.height);
      const data = imageData.data;

      // Parse hex color
      const hex = color.replace('#', '');
      const r_tint = parseInt(hex.substring(0, 2), 16);
      const g_tint = parseInt(hex.substring(2, 4), 16);
      const b_tint = parseInt(hex.substring(4, 6), 16);

      // Chroma Key + Tinting
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // Brightness threshold for keeping the line
        const brightness = (r + g + b) / 3;
        if (brightness < 160) {
          data[i + 3] = 0; // Transparent background
        } else {
          // Tint the white lines
          data[i] = r_tint;
          data[i + 1] = g_tint;
          data[i + 2] = b_tint;
          // Keep original alpha or set to full
          data[i + 3] = 255;
        }
      }

      tempCtx.putImageData(imageData, 0, 0);
      processedImagesRef.current.set(cacheKey, processedCanvas);
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    
    // Add glow to the character image
    if (glowIntensity > 0) {
      ctx.shadowBlur = 15 * glowIntensity;
      ctx.shadowColor = color;
    }
    
    ctx.drawImage(processedCanvas, x, y, w, h);
    ctx.restore();
  };

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
    
    const centerY = height * 0.65;
    const charWidth = 200;
    const charHeight = 150;
    const charX = width / 2 - charWidth / 2;
    
    // Calculate frequency bands
    let bass = 0;
    for (let i = 0; i < 5; i++) bass += Math.abs(fftBuffer[i]);
    bass = (bass / 5 + 100) / 100;
    
    let mids = 0;
    for (let i = 5; i < 40; i++) mids += Math.abs(fftBuffer[i]);
    mids = (mids / 35 + 100) / 100;

    let highs = 0;
    for (let i = 40; i < 100; i++) highs += Math.abs(fftBuffer[i]);
    highs = (highs / 60 + 100) / 100;

    const energy = (bass + mids + highs) / 3;
    const bounce = isPlaying ? (bass - 1) * 60 : 0;
    
    // Vibrato Shake
    const vibOffset = isPlaying ? Math.sin(Date.now() * 0.001 * vibratoRate * 10) * vibratoDepth * 20 : 0;
    
    // Squash and Stretch based on energy
    const squash = isPlaying ? 1 + (energy - 1) * 0.2 : 1;
    const stretch = isPlaying ? 1 - (energy - 1) * 0.1 : 1;

    // Frame Switching Logic based on frequency
    const frameCount = svgPaths.length > 0 ? svgPaths.length : imagesRef.current.length;
    
    if (isPlaying && frameCount > 0) {
      const now = Date.now();
      const switchThreshold = 200 / energy;
      
      if (now - lastSwitchTime.current > switchThreshold || (bass > 1.25 && now - lastSwitchTime.current > 80)) {
        currentFrameRef.current = nextFrameRef.current;
        
        // Map frequency bands to frame ranges
        let targetRange = [0, frameCount - 1];
        if (frameCount >= 15) {
          if (highs > 1.2) targetRange = [10, 14];
          else if (mids > 1.1) targetRange = [5, 9];
          else targetRange = [0, 4];
        } else if (frameCount >= 3) {
          if (highs > 1.2) targetRange = [frameCount - 1, frameCount - 1];
          else if (mids > 1.1) targetRange = [Math.floor(frameCount / 2), Math.floor(frameCount / 2)];
          else targetRange = [0, 0];
        }
        
        const rangeSize = targetRange[1] - targetRange[0] + 1;
        nextFrameRef.current = targetRange[0] + Math.floor(Math.random() * rangeSize);
        nextFrameRef.current = Math.min(nextFrameRef.current, frameCount - 1);
        
        transitionRef.current = 0;
        lastSwitchTime.current = now;
      }
      
      if (transitionRef.current < 1) {
        transitionRef.current += 0.15;
      }
    }

    // Background glow
    if (isPlaying) {
      ctx.save();
      const gradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width / 2);
      const glowAlpha = Math.floor((energy - 1) * 20 * glowIntensity);
      gradient.addColorStop(0, `${color}${glowAlpha.toString(16).padStart(2, '0')}`);
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }

    // Draw Oscilloscope Line
    const drawLine = (ctx: CanvasRenderingContext2D, offset: number = 0, alpha: number = 1) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineThickness;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = alpha;
      
      if (glowIntensity > 0 && offset === 0) {
        ctx.shadowBlur = 10 * glowIntensity;
        ctx.shadowColor = color;
      } else {
        ctx.shadowBlur = 0;
      }

      // Bitcrush quantization
      const stepSize = Math.max(1, Math.floor(17 - bitcrush));
      const quantize = (v: number) => Math.round(v / stepSize) * stepSize;

      // Left side
      const leftPoints = Math.floor(charX / (width / buffer.length));
      for (let i = 0; i < leftPoints; i++) {
        const x = (i / buffer.length) * width;
        let y = centerY + (buffer[i] * height * 0.4) + offset;
        if (bitcrush < 15) y = quantize(y);
        
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      // Connect line to character base
      ctx.lineTo(charX, centerY + offset);
      ctx.lineTo(charX + charWidth, centerY + offset);

      // Right side
      const rightStartIdx = leftPoints + Math.floor(charWidth / (width / buffer.length));
      for (let i = rightStartIdx; i < buffer.length; i++) {
        const x = (i / buffer.length) * width;
        let y = centerY + (buffer[i] * height * 0.4) + offset;
        if (bitcrush < 15) y = quantize(y);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    // Chorus Ghosting
    if (chorus > 0.1) {
      drawLine(ctx, -5 * chorus, 0.3 * chorus);
      drawLine(ctx, 5 * chorus, 0.3 * chorus);
    }
    drawLine(ctx, 0, 1);

    // Draw Character
    const charY = centerY - (charHeight * squash) + 20 - bounce + vibOffset;
    const currentWidth = charWidth * stretch;
    const currentX = width / 2 - currentWidth / 2;
    
    if (svgPaths.length > 0) {
      // SVG Morphing Logic
      const pathA = svgPaths[currentFrameRef.current];
      const pathB = svgPaths[nextFrameRef.current];
      const key = `${currentFrameRef.current}-${nextFrameRef.current}`;
      
      let interpolator = interpolatorsRef.current.get(key);
      if (!interpolator) {
        interpolator = interpolate(pathA, pathB, { maxSegmentLength: 2 });
        interpolatorsRef.current.set(key, interpolator);
      }
      
      const interpolatedPath = interpolator(transitionRef.current);
      
      ctx.save();
      ctx.translate(currentX, charY);
      // Scale SVG to fit charWidth/charHeight (assuming SVG is 100x100 or similar)
      // We might need a viewBox or scale factor
      const scaleX = currentWidth / 100;
      const scaleY = (charHeight * squash) / 100;
      ctx.scale(scaleX, scaleY);
      
      ctx.strokeStyle = color;
      ctx.lineWidth = lineThickness / scaleX;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      if (glowIntensity > 0) {
        ctx.shadowBlur = (15 * glowIntensity) / scaleX;
        ctx.shadowColor = color;
      }
      
      const p = new Path2D(interpolatedPath);
      
      // Draw main path
      ctx.stroke(p);
      
      // Draw a second, slightly offset path for a "hand-drawn" look
      if (isPlaying) {
        ctx.save();
        ctx.translate(Math.random() * 0.5 - 0.25, Math.random() * 0.5 - 0.25);
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = (lineThickness * 0.7) / scaleX;
        ctx.stroke(p);
        ctx.restore();
      }
      
      ctx.restore();
    } else if (imagesRef.current.length > 0) {
      // Draw Images with Cross-fade
      const currentImg = imagesRef.current[currentFrameRef.current];
      const nextImg = imagesRef.current[nextFrameRef.current];
      
      if (currentImg) processImage(ctx, currentImg, currentX, charY, currentWidth, charHeight * squash, 1 - transitionRef.current);
      if (nextImg) processImage(ctx, nextImg, currentX, charY, currentWidth, charHeight * squash, transitionRef.current);
    } else {
      // Fallback to procedural silhouette
      const startX = currentX;
      const startY = centerY + vibOffset;
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineThickness;
      ctx.moveTo(startX, startY);
      ctx.lineTo(startX + 20 * stretch, startY - (30 + bounce) * squash);
      ctx.lineTo(startX + 40 * stretch, startY - (80 + bounce) * squash);
      ctx.bezierCurveTo(
        startX + 40 * stretch, startY - (140 + bounce) * squash, 
        startX + 120 * stretch, startY - (140 + bounce) * squash, 
        startX + 120 * stretch, startY - (100 + bounce) * squash
      );
      ctx.lineTo(startX + 100 * stretch, startY - (80 + bounce) * squash);
      ctx.lineTo(startX + 80 * stretch, startY - (40 + bounce) * squash);
      ctx.lineTo(startX + 90 * stretch, startY);
      ctx.stroke();
    }

    // Add some "sparks" if devil mode is on or energy is very high
    if (isPlaying && (devilMode || energy > 1.3)) {
      const sparkCount = devilMode ? 5 : 2;
      for (let i = 0; i < sparkCount; i++) {
        const sx = charX + Math.random() * charWidth;
        const sy = charY + Math.random() * charHeight;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(sx, sy, Math.random() * 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    requestRef.current = requestAnimationFrame(draw);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(draw);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [analyser, fft, isPlaying, color, glowIntensity, lineThickness, devilMode, vibratoDepth, vibratoRate, bitcrush, chorus, svgPaths]);

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
