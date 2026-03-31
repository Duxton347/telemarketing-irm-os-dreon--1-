type SoundKind = 'new-task' | 'completed-task';

const SOUND_PREF_KEY = 'dreon:sound-enabled';

type SoundPreset = {
  frequency: number;
  duration: number;
  type: OscillatorType;
  gain: number;
  detune?: number;
};

const SOUND_PRESETS: Record<SoundKind, SoundPreset[]> = {
  'new-task': [
    { frequency: 698, duration: 0.12, type: 'square', gain: 0.085, detune: -8 },
    { frequency: 932, duration: 0.16, type: 'triangle', gain: 0.075, detune: 6 },
    { frequency: 1174, duration: 0.18, type: 'sine', gain: 0.06 }
  ],
  'completed-task': [
    { frequency: 523, duration: 0.1, type: 'triangle', gain: 0.07 },
    { frequency: 659, duration: 0.13, type: 'triangle', gain: 0.06, detune: 4 },
    { frequency: 784, duration: 0.16, type: 'sine', gain: 0.05 }
  ]
};

let sharedAudioContext: AudioContext | null = null;

const getAudioContext = () => {
  if (typeof window === 'undefined') return null;
  if (sharedAudioContext) return sharedAudioContext;

  const AudioContextRef = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextRef) return null;

  sharedAudioContext = new AudioContextRef();
  return sharedAudioContext;
};

export const isSoundEnabled = () => {
  if (typeof window === 'undefined') return true;
  const storedValue = window.localStorage.getItem(SOUND_PREF_KEY);
  return storedValue !== 'false';
};

export const setSoundEnabled = (enabled: boolean) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SOUND_PREF_KEY, String(enabled));
};

export const playSoundEffect = async (kind: SoundKind) => {
  if (!isSoundEnabled()) return;

  const audioContext = getAudioContext();
  if (!audioContext) return;

  if (audioContext.state === 'suspended') {
    await audioContext.resume().catch(() => undefined);
  }

  const now = audioContext.currentTime;
  const masterGain = audioContext.createGain();
  const compressor = audioContext.createDynamicsCompressor();

  compressor.threshold.setValueAtTime(-24, now);
  compressor.knee.setValueAtTime(18, now);
  compressor.ratio.setValueAtTime(8, now);
  compressor.attack.setValueAtTime(0.003, now);
  compressor.release.setValueAtTime(0.16, now);

  masterGain.gain.setValueAtTime(kind === 'new-task' ? 1.7 : 1.45, now);
  masterGain.connect(compressor);
  compressor.connect(audioContext.destination);

  SOUND_PRESETS[kind].forEach((preset, index) => {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    const startAt = now + index * 0.06;

    oscillator.type = preset.type;
    oscillator.frequency.setValueAtTime(preset.frequency, startAt);
    oscillator.detune.setValueAtTime(preset.detune || 0, startAt);
    gainNode.gain.setValueAtTime(0.0001, startAt);
    gainNode.gain.exponentialRampToValueAtTime(preset.gain, startAt + 0.012);
    gainNode.gain.exponentialRampToValueAtTime(Math.max(preset.gain * 0.45, 0.0002), startAt + (preset.duration * 0.55));
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + preset.duration);

    oscillator.connect(gainNode);
    gainNode.connect(masterGain);
    oscillator.start(startAt);
    oscillator.stop(startAt + preset.duration);
  });
};
