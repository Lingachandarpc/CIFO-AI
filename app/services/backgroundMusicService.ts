import { Genre } from '../types';

export interface MusicSettings {
  frequencies: number[]; // Base frequencies for oscillators
  waveType: OscillatorType;
  filterFrequency: number; // Low-pass filter frequency
  filterQ: number;
  gainModulation: {
    minGain: number;
    maxGain: number;
    modulationFrequency: number; // Tremolo/vibrato frequency
  };
  vibe: 'calm' | 'peppy' | 'relaxing'; // Music mood
  description: string; // Genre vibe description
}

// Genre-specific background music configurations
export const GENRE_MUSIC: Record<Genre, MusicSettings> = {
  [Genre.PERSONAL_FINANCE]: {
    frequencies: [130, 164, 196], // Low, warm, professional
    waveType: 'sine',
    filterFrequency: 800,
    filterQ: 1,
    gainModulation: {
      minGain: 0.04,
      maxGain: 0.08, // Reduced for low opacity
      modulationFrequency: 0.3, // Slower for calm
    },
    vibe: 'calm',
    description: 'Grounded, focused, peaceful ambiance',
  },
  [Genre.TECHNOLOGY]: {
    frequencies: [220, 277, 330], // Mid-range, bright, modern
    waveType: 'triangle',
    filterFrequency: 2000,
    filterQ: 2,
    gainModulation: {
      minGain: 0.03,
      maxGain: 0.08, // Reduced for low opacity
      modulationFrequency: 0.7, // Moderate, peppy
    },
    vibe: 'peppy',
    description: 'Energetic, innovative, uplifting mood',
  },
  [Genre.BUSINESS]: {
    frequencies: [165, 220, 275], // Professional, confident
    waveType: 'sine',
    filterFrequency: 1200,
    filterQ: 1.5,
    gainModulation: {
      minGain: 0.035,
      maxGain: 0.07, // Reduced for low opacity
      modulationFrequency: 0.4, // Calm, professional
    },
    vibe: 'calm',
    description: 'Professional, confident, steady ambiance',
  },
  [Genre.PSYCHOLOGY]: {
    frequencies: [110, 147, 196], // Deep, introspective, calm
    waveType: 'sine',
    filterFrequency: 600,
    filterQ: 0.8,
    gainModulation: {
      minGain: 0.025,
      maxGain: 0.06, // Reduced for low opacity
      modulationFrequency: 0.2, // Very slow for deep relaxation
    },
    vibe: 'relaxing',
    description: 'Therapeutic, introspective, deeply calming',
  },
  [Genre.HEALTH]: {
    frequencies: [264, 297, 330], // Healing, balanced, uplifting
    waveType: 'sine',
    filterFrequency: 1000,
    filterQ: 1.2,
    gainModulation: {
      minGain: 0.03,
      maxGain: 0.07, // Reduced for low opacity
      modulationFrequency: 0.25, // Slow for wellness feel
    },
    vibe: 'relaxing',
    description: 'Healing, peaceful, wellness-focused ambiance',
  },
  [Genre.HISTORY]: {
    frequencies: [110, 146, 175], // Deep, grounded, classic
    waveType: 'sine',
    filterFrequency: 700,
    filterQ: 1,
    gainModulation: {
      minGain: 0.03,
      maxGain: 0.065, // Reduced for low opacity
      modulationFrequency: 0.3, // Calm, contemplative
    },
    vibe: 'calm',
    description: 'Grounded, timeless, contemplative mood',
  },
  [Genre.SCIENCE]: {
    frequencies: [261, 329, 392], // Clear, rational, energetic
    waveType: 'triangle',
    filterFrequency: 1800,
    filterQ: 1.8,
    gainModulation: {
      minGain: 0.03,
      maxGain: 0.08, // Reduced for low opacity
      modulationFrequency: 0.6, // Peppy, curious
    },
    vibe: 'peppy',
    description: 'Bright, curious, intellectually stimulating',
  },
  [Genre.SELF_HELP]: {
    frequencies: [185, 220, 261], // Motivating, uplifting, warm
    waveType: 'sine',
    filterFrequency: 1200,
    filterQ: 1.3,
    gainModulation: {
      minGain: 0.035,
      maxGain: 0.08, // Reduced for low opacity
      modulationFrequency: 0.5, // Peppy, motivating
    },
    vibe: 'peppy',
    description: 'Motivating, uplifting, empowering ambiance',
  },
  [Genre.FICTION]: {
    frequencies: [138, 184, 246], // Storytelling, imaginative, immersive
    waveType: 'triangle',
    filterFrequency: 1500,
    filterQ: 1.6,
    gainModulation: {
      minGain: 0.03,
      maxGain: 0.075, // Reduced for low opacity
      modulationFrequency: 0.45, // Relaxing, immersive
    },
    vibe: 'relaxing',
    description: 'Immersive, imaginative, engaging storytelling mood',
  },
  [Genre.BIOGRAPHY]: {
    frequencies: [146, 195, 261], // Personal, engaging, authentic
    waveType: 'sine',
    filterFrequency: 900,
    filterQ: 1.1,
    gainModulation: {
      minGain: 0.03,
      maxGain: 0.07, // Reduced for low opacity
      modulationFrequency: 0.3, // Calm, personal
    },
    vibe: 'calm',
    description: 'Personal, authentic, warmly contemplative mood',
  },
  [Genre.DEFAULT]: {
    frequencies: [164, 220, 277], // Neutral, balanced
    waveType: 'sine',
    filterFrequency: 1000,
    filterQ: 1,
    gainModulation: {
      minGain: 0.03,
      maxGain: 0.07, // Reduced for low opacity
      modulationFrequency: 0.35, // Calm, neutral
    },
    vibe: 'calm',
    description: 'Balanced, neutral, pleasant ambiance',
  },
};

export function createAmbientMusicForGenre(
  audioContext: AudioContext,
  genre: Genre | null | string,
  volume: number = 0.15
): {
  oscillators: OscillatorNode[];
  gain: GainNode;
  filter: BiquadFilterNode;
} {
  const settings = GENRE_MUSIC[genre as Genre] || GENRE_MUSIC[Genre.DEFAULT];

  // Create main gain node
  const gain = audioContext.createGain();
  gain.gain.setValueAtTime(volume * 0.5, audioContext.currentTime); // Reduce base volume for better mixing

  // Create low-pass filter for ambient smoothing
  const filter = audioContext.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(settings.filterFrequency, audioContext.currentTime);
  filter.Q.setValueAtTime(settings.filterQ, audioContext.currentTime);

  // Create convolver for pad/reverb effect
  const dryGain = audioContext.createGain();
  dryGain.gain.setValueAtTime(0.7, audioContext.currentTime);

  const oscArray: OscillatorNode[] = [];

  // Create detuned oscillators with independent modulation
  settings.frequencies.forEach((freq) => {
    // Detune each oscillator slightly (±2-5 cents)
    const detune = (Math.random() - 0.5) * 8;

    // Create main oscillator
    const osc = audioContext.createOscillator();
    osc.type = settings.waveType;
    osc.frequency.setValueAtTime(freq, audioContext.currentTime);
    osc.detune.setValueAtTime(detune, audioContext.currentTime);

    // Create unique LFO for each voice (frequency modulation)
    const freqLfo = audioContext.createOscillator();
    freqLfo.frequency.setValueAtTime(
      settings.gainModulation.modulationFrequency * (0.8 + Math.random() * 0.4),
      audioContext.currentTime
    );

    const freqLfoGain = audioContext.createGain();
    freqLfoGain.gain.setValueAtTime(freq * 0.02, audioContext.currentTime); // Subtle frequency wobble

    freqLfo.connect(freqLfoGain);
    freqLfoGain.connect(osc.frequency);

    // Create amplitude LFO (volume modulation) - more complex envelope
    const ampLfo = audioContext.createOscillator();
    ampLfo.frequency.setValueAtTime(
      settings.gainModulation.modulationFrequency * 0.5 * (0.9 + Math.random() * 0.2),
      audioContext.currentTime
    );

    const ampLfoGain = audioContext.createGain();
    const midGain = (settings.gainModulation.maxGain + settings.gainModulation.minGain) / 2;
    const range = (settings.gainModulation.maxGain - settings.gainModulation.minGain) / 2;
    ampLfoGain.gain.setValueAtTime(range, audioContext.currentTime);

    const oscGain = audioContext.createGain();
    oscGain.gain.setValueAtTime(midGain, audioContext.currentTime);

    ampLfo.connect(ampLfoGain);
    ampLfoGain.connect(oscGain.gain);

    // Connect oscillator chain: osc -> filter -> oscGain -> dryGain
    osc.connect(filter);
    filter.connect(oscGain);
    oscGain.connect(dryGain);

    // Start all LFOs
    freqLfo.start();
    ampLfo.start();
    osc.start();

    oscArray.push(osc);
    oscArray.push(freqLfo);
    oscArray.push(ampLfo);
  });

  // Connect to final output
  dryGain.connect(gain);
  gain.connect(audioContext.destination);

  return { oscillators: oscArray, gain, filter };
}

export function stopAmbientMusic(
  musicRef: {
    oscillators: OscillatorNode[];
    gain: GainNode;
    filter: BiquadFilterNode;
  } | null
) {
  if (!musicRef) return;

  try {
    // Fade out over 500ms
    const currentTime = musicRef.gain.context.currentTime;
    musicRef.gain.gain.setTargetAtTime(0, currentTime, 0.1);

    // Stop oscillators after fade
    setTimeout(() => {
      musicRef.oscillators.forEach((osc) => {
        try { osc.stop(); } catch {}
      });
    }, 500);
  } catch (err) {
    console.error('Error stopping ambient music:', err);
  }
}

export function updateMusicVolume(
  musicRef: {
    oscillators: OscillatorNode[];
    gain: GainNode;
    filter: BiquadFilterNode;
  } | null,
  newVolume: number
) {
  if (!musicRef) return;
  musicRef.gain.gain.setTargetAtTime(newVolume, musicRef.gain.context.currentTime, 0.05);
}
