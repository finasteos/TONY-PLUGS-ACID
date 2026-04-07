import { LucideIcon } from 'lucide-react';

export type Waveform = 'sawtooth' | 'square' | 'triangle' | 'sine';
export type Scale = 'chromatic' | 'major' | 'minor' | 'phrygian' | 'dorian' | 'pentatonic';

export interface StepData {
  note: string;
  octave: number; // -1, 0, 1 relative to base
  accent: boolean;
  slide: boolean;
  slide2: boolean; // Second glide type
  halfTempo: boolean; // Half-tempo step
  enabled: boolean;
}

export interface SynthState {
  cutoff: number;
  resonance: number;
  envMod: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  accent: number;
  drive: number;
  glide: number;
  glide2: number;
  devilMode: boolean;
  osc1Wave: Waveform;
  osc2Wave: Waveform;
  osc2Detune: number;
  oscMix: number; // 0 to 1
  visualizerColor: string;
  colorScheme: number; // 0 to 100 for knob
  glowIntensity: number; // 0 to 1
  lineThickness: number; // 1 to 10
  vibratoRate: number; // 0 to 10
  vibratoDepth: number; // 0 to 1
  bitcrush: number; // 1 to 16
  chorus: number; // 0 to 1
  useSvg: boolean;
  masterVolume: number; // 0 to 1
  scale: Scale;
}

export interface SequencerState {
  steps: StepData[];
  bpm: number;
  currentStep: number;
  isPlaying: boolean;
}
