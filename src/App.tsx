import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as Tone from 'tone';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, 
  Square, 
  RotateCcw, 
  Music, 
  Zap, 
  ArrowRight, 
  Settings2,
  Volume2,
  Activity,
  Fish,
  Waves,
  ZapOff,
  Maximize2
} from 'lucide-react';
import { Knob } from './components/Knob';
import { LineaVisualizer } from './components/LineaVisualizer';
import { StepData, SynthState, Waveform, Scale } from './types';

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const SCALES: Record<Scale, number[]> = {
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  pentatonic: [0, 3, 5, 7, 10]
};

const SVG_FRAMES = [
  // Stand Star
  "M 50,15 L 61,40 L 88,40 L 66,57 L 75,82 L 50,66 L 25,82 L 34,57 L 12,40 L 39,40 Z",
  // Walk Star (Legs/Arms shifted)
  "M 50,12 L 65,38 L 92,35 L 68,55 L 80,80 L 50,62 L 20,85 L 32,55 L 8,42 L 35,42 Z",
  // Jump Star (Stretched)
  "M 50,5 L 63,35 L 95,30 L 70,52 L 85,90 L 50,70 L 15,90 L 30,52 L 5,30 L 37,35 Z"
];

const INITIAL_STEPS: StepData[] = Array(16).fill(null).map((_, i) => ({
  note: 'C',
  octave: 0,
  accent: false,
  slide: false,
  slide2: false,
  halfTempo: false,
  enabled: i % 4 === 0,
}));

export default function App() {
  const [isStarted, setIsStarted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // Define the image frames for the visualizer
  // Replace these with your actual local paths once uploaded to /public
  const lineaFrames = Array.from({ length: 15 }, (_, i) => `/linea${i + 1}.png`);

  const [currentStep, setCurrentStep] = useState(-1);
  const [bpm, setBpm] = useState(128);
  const [steps, setSteps] = useState<StepData[]>(INITIAL_STEPS);
  const [synthParams, setSynthParams] = useState<SynthState>({
    cutoff: 400,
    resonance: 0.7,
    envMod: 0.5,
    attack: 0.001,
    decay: 0.2,
    sustain: 0.1,
    release: 0.1,
    accent: 0.5,
    drive: 0.2,
    glide: 0.1,
    glide2: 0.3,
    devilMode: false,
    osc1Wave: 'sawtooth',
    osc2Wave: 'square',
    osc2Detune: 7,
    oscMix: 0.3,
    visualizerColor: '#22d3ee',
    colorScheme: 0,
    glowIntensity: 0.5,
    lineThickness: 4,
    vibratoRate: 5,
    vibratoDepth: 0,
    bitcrush: 16,
    chorus: 0,
    useSvg: false,
    masterVolume: 0.7,
    scale: 'chromatic'
  });

  // Synth Refs
  const osc1Ref = useRef<Tone.Oscillator | null>(null);
  const osc2Ref = useRef<Tone.Oscillator | null>(null);
  const osc1GainRef = useRef<Tone.Gain | null>(null);
  const osc2GainRef = useRef<Tone.Gain | null>(null);
  const filterRef = useRef<Tone.Filter | null>(null);
  const ampEnvRef = useRef<Tone.AmplitudeEnvelope | null>(null);
  const filterEnvRef = useRef<Tone.Envelope | null>(null);
  const distortionRef = useRef<Tone.Distortion | null>(null);
  const bitcrushRef = useRef<Tone.BitCrusher | null>(null);
  const chorusRef = useRef<Tone.Chorus | null>(null);
  const vibratoRef = useRef<Tone.Vibrato | null>(null);
  const compressorRef = useRef<Tone.Compressor | null>(null);
  const masterGainRef = useRef<Tone.Gain | null>(null);
  const limiterRef = useRef<Tone.Limiter | null>(null);
  const analyserRef = useRef<Tone.Analyser | null>(null);
  const fftRef = useRef<Tone.Analyser | null>(null);
  const sequenceRef = useRef<Tone.Sequence | null>(null);
  const skipNextRef = useRef<boolean>(false);

  const initAudio = async () => {
    await Tone.start();
    
    // Create Synth Chain
    const analyser = new Tone.Analyser('waveform', 1024);
    const fft = new Tone.Analyser('fft', 256);
    const limiter = new Tone.Limiter(-1).toDestination();
    const masterGain = new Tone.Gain(0.7).connect(limiter);
    
    const compressor = new Tone.Compressor({
      threshold: -20,
      ratio: 4,
      attack: 0.01,
      release: 0.1
    }).connect(masterGain);
    
    masterGain.connect(analyser);
    analyser.connect(fft);

    const distortion = new Tone.Distortion({
      distortion: synthParams.drive,
      oversample: '4x'
    });

    const bitcrush = new Tone.BitCrusher({
      bits: synthParams.bitcrush
    }).connect(distortion);

    const chorus = new Tone.Chorus({
      frequency: 1.5,
      delayTime: 3.5,
      depth: 0.7,
      wet: synthParams.chorus
    }).connect(bitcrush);

    const vibrato = new Tone.Vibrato({
      frequency: synthParams.vibratoRate,
      depth: synthParams.vibratoDepth
    }).connect(chorus);

    vibrato.connect(compressor);

    const filter = new Tone.Filter({
      frequency: synthParams.cutoff,
      type: 'lowpass',
      rolloff: -24,
      Q: synthParams.resonance * 8 // Slightly lower default Q
    }).connect(vibrato);

    const ampEnv = new Tone.AmplitudeEnvelope({
      attack: synthParams.attack,
      decay: synthParams.decay,
      sustain: synthParams.sustain,
      release: synthParams.release
    }).connect(filter);

    const filterEnv = new Tone.FrequencyEnvelope({
      attack: 0.001,
      decay: synthParams.decay,
      sustain: 0,
      release: 0.1,
      baseFrequency: synthParams.cutoff,
      octaves: synthParams.envMod * (synthParams.devilMode ? 10 : 7),
      exponent: 2
    }).connect(filter.frequency);

    const osc1Gain = new Tone.Gain(1 - synthParams.oscMix).connect(ampEnv);
    const osc2Gain = new Tone.Gain(synthParams.oscMix).connect(ampEnv);

    const osc1 = new Tone.Oscillator({ type: synthParams.osc1Wave }).connect(osc1Gain).start();
    const osc2 = new Tone.Oscillator({ type: synthParams.osc2Wave, detune: synthParams.osc2Detune }).connect(osc2Gain).start();

    osc1Ref.current = osc1;
    osc2Ref.current = osc2;
    osc1GainRef.current = osc1Gain;
    osc2GainRef.current = osc2Gain;
    filterRef.current = filter;
    ampEnvRef.current = ampEnv;
    filterEnvRef.current = filterEnv as any;
    distortionRef.current = distortion;
    bitcrushRef.current = bitcrush;
    chorusRef.current = chorus;
    vibratoRef.current = vibrato;
    compressorRef.current = compressor;
    masterGainRef.current = masterGain;
    limiterRef.current = limiter;
    analyserRef.current = analyser;
    fftRef.current = fft;
    setIsStarted(true);
  };

  // Update Synth Params
  useEffect(() => {
    if (!osc1Ref.current || !osc2Ref.current || !filterRef.current || !ampEnvRef.current || !filterEnvRef.current || !distortionRef.current || !osc1GainRef.current || !osc2GainRef.current) return;

    const devilMultiplier = synthParams.devilMode ? 1.5 : 1;

    filterRef.current.frequency.value = synthParams.cutoff;
    // Compensate gain for high resonance
    filterRef.current.Q.value = synthParams.resonance * (synthParams.devilMode ? 12 : 8);
    
    distortionRef.current.distortion = synthParams.drive * (synthParams.devilMode ? 1.5 : 1);
    
    if (bitcrushRef.current) bitcrushRef.current.bits.value = synthParams.bitcrush;
    if (chorusRef.current) chorusRef.current.wet.value = synthParams.chorus;
    if (vibratoRef.current) {
      vibratoRef.current.frequency.value = synthParams.vibratoRate;
      vibratoRef.current.depth.value = synthParams.vibratoDepth;
    }

    if (masterGainRef.current) {
      // Lower master gain as resonance/drive increases to avoid hitting limiter too hard
      const resCompensation = 1 - (synthParams.resonance * 0.4);
      const driveCompensation = 1 - (synthParams.drive * 0.3);
      const baseGain = synthParams.masterVolume * 0.8;
      masterGainRef.current.gain.rampTo(baseGain * resCompensation * driveCompensation * (synthParams.devilMode ? 1.1 : 1), 0.1);
    }
    
    osc1Ref.current.type = synthParams.osc1Wave;
    osc2Ref.current.type = synthParams.osc2Wave;
    osc2Ref.current.detune.value = synthParams.osc2Detune;
    
    osc1GainRef.current.gain.value = 1 - synthParams.oscMix;
    osc2GainRef.current.gain.value = synthParams.oscMix;

    ampEnvRef.current.attack = synthParams.attack;
    ampEnvRef.current.decay = synthParams.decay * devilMultiplier;
    ampEnvRef.current.sustain = synthParams.sustain;
    ampEnvRef.current.release = synthParams.release;
    
    const fEnv = filterEnvRef.current as unknown as Tone.FrequencyEnvelope;
    fEnv.decay = synthParams.decay * devilMultiplier;
    fEnv.baseFrequency = synthParams.cutoff;
    fEnv.octaves = synthParams.envMod * (synthParams.devilMode ? 10 : 7);
  }, [synthParams]);

  // Sequencer Logic
  useEffect(() => {
    if (!isStarted) return;

    if (sequenceRef.current) {
      sequenceRef.current.dispose();
    }

    sequenceRef.current = new Tone.Sequence(
      (time, stepIndex) => {
        if (skipNextRef.current) {
          skipNextRef.current = false;
          return;
        }

        const step = steps[stepIndex];
        setCurrentStep(stepIndex);

        if (step.enabled && osc1Ref.current && osc2Ref.current && ampEnvRef.current && filterEnvRef.current) {
          const baseOctave = 2;
          const freq = Tone.Frequency(`${step.note}${baseOctave + step.octave}`).toFrequency();
          
          // Handle Slide (Portamento)
          const glideTime = step.slide2 ? synthParams.glide2 : (step.slide ? synthParams.glide : 0);
          osc1Ref.current.frequency.rampTo(freq, glideTime, time);
          osc2Ref.current.frequency.rampTo(freq, glideTime, time);

          // Handle Accent
          const velocity = step.accent ? 0.9 : 0.6;
          const fEnv = filterEnvRef.current as unknown as Tone.FrequencyEnvelope;
          const envModBase = synthParams.envMod * (synthParams.devilMode ? 8 : 6);
          fEnv.octaves = step.accent ? (envModBase + (synthParams.devilMode ? 3 : 1.5)) : envModBase;

          // Handle Half-Tempo
          const duration = step.halfTempo ? '8n' : '16n';
          if (step.halfTempo) {
            skipNextRef.current = true;
          }

          ampEnvRef.current.triggerAttackRelease(duration, time, velocity);
          fEnv.triggerAttack(time);
        }
      },
      Array.from({ length: 16 }, (_, i) => i),
      '16n'
    ).start(0);

    return () => {
      sequenceRef.current?.dispose();
    };
  }, [isStarted, steps, synthParams.envMod, synthParams.devilMode, synthParams.glide, synthParams.glide2, synthParams.cutoff]);

  useEffect(() => {
    Tone.Transport.bpm.value = bpm;
  }, [bpm]);

  const togglePlay = () => {
    if (!isStarted) {
      initAudio();
    }
    if (isPlaying) {
      Tone.Transport.stop();
      setCurrentStep(-1);
      skipNextRef.current = false;
    } else {
      Tone.Transport.start();
    }
    setIsPlaying(!isPlaying);
  };

  const updateStep = (index: number, updates: Partial<StepData>) => {
    setSteps(prev => prev.map((s, i) => i === index ? { ...s, ...updates } : s));
  };

  const getScaleNotes = (scale: Scale) => {
    return SCALES[scale].map(idx => NOTES[idx]);
  };

  const randomizeSteps = () => {
    const scaleNotes = getScaleNotes(synthParams.scale);
    setSteps(prev => prev.map(() => ({
      note: scaleNotes[Math.floor(Math.random() * scaleNotes.length)],
      octave: Math.floor(Math.random() * 3) - 1,
      accent: Math.random() > 0.7,
      slide: Math.random() > 0.8,
      slide2: Math.random() > 0.9,
      halfTempo: Math.random() > 0.9,
      enabled: Math.random() > 0.3,
    })));
  };

  const currentScaleNotes = getScaleNotes(synthParams.scale);

  const VISUALIZER_COLORS = [
    { name: 'Cyan', value: '#22d3ee' },
    { name: 'Acid Green', value: '#84cc16' },
    { name: 'Electric Purple', value: '#a855f7' },
    { name: 'Hot Pink', value: '#ec4899' },
    { name: 'Sunset Orange', value: '#f97316' },
    { name: 'Pure White', value: '#ffffff' }
  ];

  useEffect(() => {
    const index = Math.floor((synthParams.colorScheme / 100.1) * VISUALIZER_COLORS.length);
    const newColor = VISUALIZER_COLORS[index].value;
    if (newColor !== synthParams.visualizerColor) {
      setSynthParams(prev => ({ ...prev, visualizerColor: newColor }));
    }
  }, [synthParams.colorScheme]);

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 p-4 md:p-8">
      {/* Header */}
      <header className="flex items-center justify-between mb-8 max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-cyan-500 rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(34,211,238,0.4)]">
            <Activity className="text-zinc-950" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tighter text-white">SUB-303</h1>
            <p className="text-[10px] font-mono text-cyan-500/70 uppercase tracking-widest">Dual Osc Devil Fish</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-mono text-zinc-500 uppercase">Tempo</span>
            <div className="flex items-center gap-2">
              <input 
                type="range" min="60" max="200" value={bpm} 
                onChange={(e) => setBpm(parseInt(e.target.value))}
                className="w-24 h-1 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-cyan-500"
              />
              <span className="text-xl font-mono font-bold text-cyan-400 w-12">{bpm}</span>
            </div>
          </div>
          
          <button 
            onClick={togglePlay}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
              isPlaying 
                ? 'bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)]' 
                : 'bg-cyan-500 text-zinc-950 shadow-[0_0_20px_rgba(34,211,238,0.4)] hover:scale-105'
            }`}
          >
            {isPlaying ? <Square fill="currentColor" size={20} /> : <Play fill="currentColor" size={20} className="ml-1" />}
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Synth Controls */}
        <div className="lg:col-span-4 bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2 text-zinc-400">
              <Settings2 size={16} />
              <h2 className="text-xs font-bold uppercase tracking-widest">Sound Engine</h2>
            </div>
            <button
              onClick={() => setSynthParams(p => ({...p, devilMode: !p.devilMode}))}
              className={`flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-bold uppercase transition-all ${
                synthParams.devilMode 
                  ? 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.4)]' 
                  : 'bg-zinc-800 text-zinc-500'
              }`}
            >
              <Fish size={12} />
              Devil Mode
            </button>
          </div>

          <div className="grid grid-cols-2 gap-y-8 gap-x-4">
            <Knob label="Cutoff" min={100} max={5000} value={synthParams.cutoff} onChange={(v) => setSynthParams(p => ({...p, cutoff: v}))} unit="Hz" />
            <Knob label="Resonance" min={0} max={1} step={0.01} value={synthParams.resonance} onChange={(v) => setSynthParams(p => ({...p, resonance: v}))} />
            <Knob label="Env Mod" min={0} max={1} step={0.01} value={synthParams.envMod} onChange={(v) => setSynthParams(p => ({...p, envMod: v}))} />
            <Knob label="Attack" min={0.001} max={0.5} step={0.001} value={synthParams.attack} onChange={(v) => setSynthParams(p => ({...p, attack: v}))} unit="s" />
            <Knob label="Decay" min={0.05} max={1} step={0.01} value={synthParams.decay} onChange={(v) => setSynthParams(p => ({...p, decay: v}))} unit="s" />
            <Knob label="Sustain" min={0} max={1} step={0.01} value={synthParams.sustain} onChange={(v) => setSynthParams(p => ({...p, sustain: v}))} />
            <Knob label="Release" min={0.01} max={2} step={0.01} value={synthParams.release} onChange={(v) => setSynthParams(p => ({...p, release: v}))} unit="s" />
            <Knob label="Glide 1" min={0} max={0.5} step={0.01} value={synthParams.glide} onChange={(v) => setSynthParams(p => ({...p, glide: v}))} unit="s" />
            <Knob label="Glide 2" min={0} max={1} step={0.01} value={synthParams.glide2} onChange={(v) => setSynthParams(p => ({...p, glide2: v}))} unit="s" />
            <Knob label="Osc Mix" min={0} max={1} step={0.01} value={synthParams.oscMix} onChange={(v) => setSynthParams(p => ({...p, oscMix: v}))} />
            <Knob label="Osc 2 Det" min={0} max={50} step={1} value={synthParams.osc2Detune} onChange={(v) => setSynthParams(p => ({...p, osc2Detune: v}))} unit="ct" />
            <Knob label="Drive" min={0} max={1} step={0.01} value={synthParams.drive} onChange={(v) => setSynthParams(p => ({...p, drive: v}))} />
            <Knob label="Accent" min={0} max={1} step={0.01} value={synthParams.accent} onChange={(v) => setSynthParams(p => ({...p, accent: v}))} />
            <Knob label="Master" min={0} max={1} step={0.01} value={synthParams.masterVolume} onChange={(v) => setSynthParams(p => ({...p, masterVolume: v}))} />
            <Knob label="Color" min={0} max={100} step={1} value={synthParams.colorScheme} onChange={(v) => setSynthParams(p => ({...p, colorScheme: v}))} />
            <Knob label="Glow" min={0} max={1} step={0.01} value={synthParams.glowIntensity} onChange={(v) => setSynthParams(p => ({...p, glowIntensity: v}))} />
            <Knob label="Line" min={1} max={10} step={0.5} value={synthParams.lineThickness} onChange={(v) => setSynthParams(p => ({...p, lineThickness: v}))} />
            <Knob label="Vib Rate" min={0} max={10} step={0.1} value={synthParams.vibratoRate} onChange={(v) => setSynthParams(p => ({...p, vibratoRate: v}))} />
            <Knob label="Vib Depth" min={0} max={1} step={0.01} value={synthParams.vibratoDepth} onChange={(v) => setSynthParams(p => ({...p, vibratoDepth: v}))} />
            <Knob label="Crush" min={1} max={16} step={1} value={synthParams.bitcrush} onChange={(v) => setSynthParams(p => ({...p, bitcrush: v}))} />
            <Knob label="Chorus" min={0} max={1} step={0.01} value={synthParams.chorus} onChange={(v) => setSynthParams(p => ({...p, chorus: v}))} />
            
            <div className="flex flex-col items-center gap-2">
              <button 
                onClick={() => setSynthParams(p => ({...p, useSvg: !p.useSvg}))}
                className={`p-3 rounded-full transition-all ${synthParams.useSvg ? 'bg-cyan-500 text-black shadow-[0_0_15px_rgba(34,211,238,0.5)]' : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'}`}
                title="Toggle SVG Morphing"
              >
                <Maximize2 size={18} />
              </button>
              <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">SVG</span>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-zinc-800 flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-[9px] font-bold uppercase text-zinc-500">Osc 1 Wave</span>
                <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800">
                  {(['sawtooth', 'square'] as Waveform[]).map(w => (
                    <button
                      key={w}
                      onClick={() => setSynthParams(p => ({...p, osc1Wave: w}))}
                      className={`flex-1 px-2 py-1 text-[9px] uppercase font-bold rounded-md transition-all ${
                        synthParams.osc1Wave === w ? 'bg-cyan-500 text-zinc-950' : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {w === 'sawtooth' ? 'Saw' : 'Sqr'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-[9px] font-bold uppercase text-zinc-500">Osc 2 Wave</span>
                <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800">
                  {(['sawtooth', 'square'] as Waveform[]).map(w => (
                    <button
                      key={w}
                      onClick={() => setSynthParams(p => ({...p, osc2Wave: w}))}
                      className={`flex-1 px-2 py-1 text-[9px] uppercase font-bold rounded-md transition-all ${
                        synthParams.osc2Wave === w ? 'bg-cyan-500 text-zinc-950' : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {w === 'sawtooth' ? 'Saw' : 'Sqr'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase text-zinc-500">Scale</span>
              <select 
                value={synthParams.scale}
                onChange={(e) => setSynthParams(p => ({...p, scale: e.target.value as Scale}))}
                className="bg-zinc-950 text-[10px] uppercase font-bold text-zinc-300 border border-zinc-800 rounded px-2 py-1 outline-none focus:border-cyan-500"
              >
                {Object.keys(SCALES).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Sequencer */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-zinc-400">
              <Music size={16} />
              <h2 className="text-xs font-bold uppercase tracking-widest">Step Sequencer</h2>
            </div>
            <button 
              onClick={randomizeSteps}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-[11px] font-bold uppercase text-zinc-200 hover:bg-cyan-500 hover:text-zinc-950 hover:border-cyan-400 transition-all shadow-lg active:scale-95"
            >
              <RotateCcw size={14} />
              Randomize Pattern
            </button>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
            {steps.map((step, i) => (
              <div 
                key={i}
                className={`relative flex flex-col gap-2 p-3 rounded-xl border transition-all ${
                  currentStep === i 
                    ? 'bg-zinc-800 border-cyan-500 shadow-[0_0_15px_rgba(34,211,238,0.2)]' 
                    : 'bg-zinc-900/50 border-zinc-800'
                }`}
              >
                {/* Step Number */}
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[9px] font-mono font-bold ${currentStep === i ? 'text-cyan-400' : 'text-zinc-600'}`}>
                    {(i + 1).toString().padStart(2, '0')}
                  </span>
                  <button 
                    onClick={() => updateStep(i, { enabled: !step.enabled })}
                    className={`w-2 h-2 rounded-full ${step.enabled ? 'bg-cyan-500 shadow-[0_0_5px_rgba(34,211,238,0.5)]' : 'bg-zinc-700'}`}
                  />
                </div>

                {/* Note Selector */}
                <select 
                  value={step.note}
                  onChange={(e) => updateStep(i, { note: e.target.value })}
                  className="bg-zinc-950 text-[10px] font-mono font-bold text-zinc-300 border border-zinc-800 rounded px-1 py-0.5 outline-none focus:border-cyan-500"
                >
                  {currentScaleNotes.map(n => <option key={n} value={n}>{n}</option>)}
                </select>

                {/* Octave Selector */}
                <div className="flex gap-1">
                  {[-1, 0, 1].map(o => (
                    <button
                      key={o}
                      onClick={() => updateStep(i, { octave: o })}
                      className={`flex-1 text-[8px] font-bold py-1 rounded border transition-all ${
                        step.octave === o 
                          ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400' 
                          : 'bg-zinc-950 border-zinc-800 text-zinc-600 hover:border-zinc-700'
                      }`}
                    >
                      {o > 0 ? `+${o}` : o}
                    </button>
                  ))}
                </div>

                {/* Modifiers */}
                <div className="grid grid-cols-2 gap-1 pt-1 border-t border-zinc-800/50 mt-1">
                  <button 
                    onClick={() => updateStep(i, { accent: !step.accent })}
                    className={`flex flex-col items-center justify-center p-1 rounded transition-all ${
                      step.accent ? 'text-yellow-400 bg-yellow-400/20 border border-yellow-400/50' : 'text-zinc-500 bg-zinc-950/50 border border-zinc-800 hover:text-zinc-300'
                    }`}
                    title="Accent"
                  >
                    <Zap size={10} fill={step.accent ? 'currentColor' : 'none'} />
                    <span className="text-[6px] mt-0.5 uppercase font-bold">Acc</span>
                  </button>
                  <button 
                    onClick={() => updateStep(i, { slide: !step.slide, slide2: false })}
                    className={`flex flex-col items-center justify-center p-1 rounded transition-all ${
                      step.slide ? 'text-cyan-400 bg-cyan-400/20 border border-cyan-400/50' : 'text-zinc-500 bg-zinc-950/50 border border-zinc-800 hover:text-zinc-300'
                    }`}
                    title="Glide 1"
                  >
                    <ArrowRight size={10} />
                    <span className="text-[6px] mt-0.5 uppercase font-bold">G1</span>
                  </button>
                  <button 
                    onClick={() => updateStep(i, { slide2: !step.slide2, slide: false })}
                    className={`flex flex-col items-center justify-center p-1 rounded transition-all ${
                      step.slide2 ? 'text-purple-400 bg-purple-400/20 border border-purple-400/50' : 'text-zinc-500 bg-zinc-950/50 border border-zinc-800 hover:text-zinc-300'
                    }`}
                    title="Glide 2"
                  >
                    <Waves size={10} />
                    <span className="text-[6px] mt-0.5 uppercase font-bold">G2</span>
                  </button>
                  <button 
                    onClick={() => updateStep(i, { halfTempo: !step.halfTempo })}
                    className={`flex flex-col items-center justify-center p-1 rounded transition-all ${
                      step.halfTempo ? 'text-orange-400 bg-orange-400/20 border border-orange-400/50' : 'text-zinc-500 bg-zinc-950/50 border border-zinc-800 hover:text-zinc-300'
                    }`}
                    title="Half Tempo"
                  >
                    <Maximize2 size={10} />
                    <span className="text-[6px] mt-0.5 uppercase font-bold">1/2</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Visualizer */}
          <div className="mt-auto h-[450px] bg-zinc-900/40 border border-zinc-800 rounded-3xl flex flex-col items-center justify-center overflow-hidden relative shadow-2xl">
            <div className="absolute top-4 right-4 z-10 flex gap-2 bg-zinc-950/50 p-2 rounded-xl backdrop-blur-md border border-zinc-800">
              {VISUALIZER_COLORS.map(c => (
                <button
                  key={c.value}
                  onClick={() => setSynthParams(p => ({...p, visualizerColor: c.value}))}
                  className={`w-4 h-4 rounded-full transition-all hover:scale-125 ${
                    synthParams.visualizerColor === c.value ? 'ring-2 ring-white scale-110' : 'opacity-50'
                  }`}
                  style={{ backgroundColor: c.value }}
                  title={c.name}
                />
              ))}
            </div>
            <LineaVisualizer 
              analyser={analyserRef.current} 
              fft={fftRef.current}
              isPlaying={isPlaying} 
              color={synthParams.devilMode ? '#ef4444' : synthParams.visualizerColor} 
              imageUrls={lineaFrames}
              svgPaths={synthParams.useSvg ? SVG_FRAMES : []}
              glowIntensity={synthParams.glowIntensity}
              lineThickness={synthParams.lineThickness}
              devilMode={synthParams.devilMode}
              vibratoDepth={synthParams.vibratoDepth}
              vibratoRate={synthParams.vibratoRate}
              bitcrush={synthParams.bitcrush}
              chorus={synthParams.chorus}
            />
          </div>
        </div>
      </main>

      {/* Footer / Instructions */}
      <footer className="max-w-6xl mx-auto w-full mt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-zinc-600 text-[10px] font-medium uppercase tracking-wider">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-orange-400" />
            <span>1/2: Half-Tempo Step (Holds for 2 slots)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-purple-400" />
            <span>G2: Long Glide</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-cyan-400" />
            <span>G1: Short Glide</span>
          </div>
        </div>
        <p>© 2026 SUB-303 // DUAL OSCILLATOR EDITION</p>
      </footer>

      {/* Initial Overlay */}
      <AnimatePresence>
        {!isStarted && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/90 backdrop-blur-md"
          >
            <div className="text-center p-8 border border-zinc-800 bg-zinc-900 rounded-3xl shadow-2xl max-w-sm">
              <div className="w-20 h-20 bg-cyan-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-[0_0_40px_rgba(34,211,238,0.3)]">
                <Volume2 size={40} className="text-zinc-950" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Dual Osc Devil Fish</h2>
              <p className="text-zinc-400 text-sm mb-8">Click below to initialize the audio engine and start the sequencer.</p>
              <button 
                onClick={initAudio}
                className="w-full py-4 bg-cyan-500 text-zinc-950 font-bold rounded-xl hover:scale-105 transition-transform shadow-[0_0_20px_rgba(34,211,238,0.4)]"
              >
                INITIALIZE ENGINE
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
