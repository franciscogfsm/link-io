// ============================================================
// LINK.IO Client - Audio Manager
// Web Audio API: procedural SFX + ambient music
// All sounds are synthesized — no external files needed
// ============================================================

type SFXCategory = 'sfx' | 'music' | 'ui';

interface AudioSettings {
  masterVolume: number;   // 0-1
  sfxVolume: number;      // 0-1
  musicVolume: number;    // 0-1
  uiVolume: number;       // 0-1
  muted: boolean;
}

const SETTINGS_KEY = 'linkio-audio-settings';

const DEFAULT_SETTINGS: AudioSettings = {
  masterVolume: 0.7,
  sfxVolume: 0.8,
  musicVolume: 0.4,
  uiVolume: 0.6,
  muted: false,
};

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private uiGain: GainNode | null = null;
  private settings: AudioSettings;
  private musicOsc: OscillatorNode | null = null;
  private musicLFO: OscillatorNode | null = null;
  private musicPlaying = false;
  private initialized = false;
  private ambientNodes: OscillatorNode[] = [];

  constructor() {
    this.settings = this.loadSettings();
  }

  // Must be called from a user gesture (click/tap)
  init(): void {
    if (this.initialized) return;
    try {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.uiGain = this.ctx.createGain();

      this.sfxGain.connect(this.masterGain);
      this.musicGain.connect(this.masterGain);
      this.uiGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this.applyVolumes();
      this.initialized = true;
    } catch {
      console.warn('[AudioManager] Web Audio API not available');
    }
  }

  private ensureContext(): AudioContext | null {
    if (!this.initialized) this.init();
    if (this.ctx?.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  // ============ SETTINGS ============

  private loadSettings(): AudioSettings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return { ...DEFAULT_SETTINGS };
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch { /* ignore */ }
  }

  private applyVolumes(): void {
    if (!this.masterGain || !this.sfxGain || !this.musicGain || !this.uiGain) return;
    const master = this.settings.muted ? 0 : this.settings.masterVolume;
    this.masterGain.gain.setValueAtTime(master, this.ctx!.currentTime);
    this.sfxGain.gain.setValueAtTime(this.settings.sfxVolume, this.ctx!.currentTime);
    this.musicGain.gain.setValueAtTime(this.settings.musicVolume, this.ctx!.currentTime);
    this.uiGain.gain.setValueAtTime(this.settings.uiVolume, this.ctx!.currentTime);
  }

  getSettings(): AudioSettings { return { ...this.settings }; }

  setMasterVolume(v: number): void { this.settings.masterVolume = v; this.applyVolumes(); this.saveSettings(); }
  setSfxVolume(v: number): void { this.settings.sfxVolume = v; this.applyVolumes(); this.saveSettings(); }
  setMusicVolume(v: number): void { this.settings.musicVolume = v; this.applyVolumes(); this.saveSettings(); }
  setUiVolume(v: number): void { this.settings.uiVolume = v; this.applyVolumes(); this.saveSettings(); }
  setMuted(m: boolean): void { this.settings.muted = m; this.applyVolumes(); this.saveSettings(); }
  toggleMute(): void { this.setMuted(!this.settings.muted); }

  // ============ GAIN HELPERS ============

  private getGain(category: SFXCategory): GainNode | null {
    switch (category) {
      case 'sfx': return this.sfxGain;
      case 'music': return this.musicGain;
      case 'ui': return this.uiGain;
    }
  }

  // ============ SOUND PRIMITIVES ============

  private playTone(
    freq: number, duration: number, type: OscillatorType,
    category: SFXCategory, volume = 0.3,
    attack = 0.01, release = 0.1,
    detune = 0
  ): void {
    const ctx = this.ensureContext();
    const gain = this.getGain(category);
    if (!ctx || !gain) return;

    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (detune) osc.detune.setValueAtTime(detune, ctx.currentTime);

    env.gain.setValueAtTime(0, ctx.currentTime);
    env.gain.linearRampToValueAtTime(volume, ctx.currentTime + attack);
    env.gain.linearRampToValueAtTime(volume * 0.7, ctx.currentTime + duration - release);
    env.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);

    osc.connect(env);
    env.connect(gain);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  }

  private playNoise(duration: number, category: SFXCategory, volume = 0.1, bandpass?: number): void {
    const ctx = this.ensureContext();
    const gain = this.getGain(category);
    if (!ctx || !gain) return;

    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const env = ctx.createGain();
    env.gain.setValueAtTime(volume, ctx.currentTime);
    env.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);

    if (bandpass) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(bandpass, ctx.currentTime);
      filter.Q.setValueAtTime(2, ctx.currentTime);
      source.connect(filter);
      filter.connect(env);
    } else {
      source.connect(env);
    }

    env.connect(gain);
    source.start(ctx.currentTime);
    source.stop(ctx.currentTime + duration);
  }

  private playSweep(
    startFreq: number, endFreq: number, duration: number,
    type: OscillatorType, category: SFXCategory, volume = 0.2
  ): void {
    const ctx = this.ensureContext();
    const gain = this.getGain(category);
    if (!ctx || !gain) return;

    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + duration);

    env.gain.setValueAtTime(volume, ctx.currentTime);
    env.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);

    osc.connect(env);
    env.connect(gain);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  }

  // ============ GAME SFX ============

  /** Link created — short rising chirp */
  playLinkCreate(): void {
    this.playSweep(300, 800, 0.12, 'sine', 'sfx', 0.2);
    this.playTone(800, 0.08, 'triangle', 'sfx', 0.15, 0.005, 0.05);
  }

  /** Link destroyed — descending buzz */
  playLinkDestroy(): void {
    this.playSweep(600, 150, 0.2, 'sawtooth', 'sfx', 0.12);
    this.playNoise(0.15, 'sfx', 0.06, 800);
  }

  /** Node captured — satisfying 2-note ping */
  playNodeCapture(): void {
    this.playTone(523, 0.1, 'sine', 'sfx', 0.25, 0.005, 0.05); // C5
    setTimeout(() => {
      this.playTone(784, 0.15, 'sine', 'sfx', 0.2, 0.005, 0.08); // G5
    }, 80);
  }

  /** Node stolen from enemy — dramatic 3-note sting */
  playNodeStolen(): void {
    this.playTone(440, 0.08, 'square', 'sfx', 0.15);
    setTimeout(() => this.playTone(554, 0.08, 'square', 'sfx', 0.15), 60);
    setTimeout(() => this.playTone(659, 0.15, 'square', 'sfx', 0.2), 120);
  }

  /** Player taking damage — low thud + crackle */
  playDamage(): void {
    this.playTone(80, 0.15, 'sine', 'sfx', 0.3, 0.005, 0.1);
    this.playNoise(0.1, 'sfx', 0.08, 400);
  }

  /** Player eliminated — dramatic explosion */
  playElimination(): void {
    this.playSweep(400, 40, 0.6, 'sawtooth', 'sfx', 0.25);
    this.playNoise(0.5, 'sfx', 0.15);
    this.playTone(60, 0.4, 'sine', 'sfx', 0.3, 0.01, 0.3);
    // Metallic crash
    setTimeout(() => {
      this.playNoise(0.3, 'sfx', 0.1, 2000);
      this.playSweep(2000, 100, 0.3, 'square', 'sfx', 0.05);
    }, 100);
  }

  /** Self eliminated — extra dramatic */
  playSelfDeath(): void {
    this.playElimination();
    // Low rumble
    setTimeout(() => {
      this.playTone(40, 0.8, 'sine', 'sfx', 0.2, 0.05, 0.5);
    }, 200);
  }

  /** Player respawned — rising crystalline tone */
  playRespawn(): void {
    const notes = [262, 330, 392, 523]; // C4, E4, G4, C5
    notes.forEach((freq, i) => {
      setTimeout(() => {
        this.playTone(freq, 0.2, 'sine', 'sfx', 0.2, 0.01, 0.1);
        this.playTone(freq * 2, 0.15, 'triangle', 'sfx', 0.08, 0.01, 0.08);
      }, i * 80);
    });
  }

  /** Ability used — contextual sound */
  playAbility(type: 'surge' | 'shield' | 'emp'): void {
    switch (type) {
      case 'surge':
        this.playSweep(200, 1200, 0.25, 'sawtooth', 'sfx', 0.2);
        this.playNoise(0.15, 'sfx', 0.1, 3000);
        break;
      case 'shield':
        this.playTone(440, 0.3, 'sine', 'sfx', 0.2, 0.02, 0.15);
        this.playTone(660, 0.25, 'sine', 'sfx', 0.15, 0.05, 0.15);
        this.playTone(880, 0.2, 'triangle', 'sfx', 0.1, 0.08, 0.1);
        break;
      case 'emp':
        this.playSweep(1500, 60, 0.4, 'square', 'sfx', 0.15);
        this.playNoise(0.3, 'sfx', 0.12, 1000);
        setTimeout(() => {
          this.playTone(50, 0.3, 'sine', 'sfx', 0.25, 0.01, 0.2);
        }, 150);
        break;
    }
  }

  /** Combo hit — quick escalating beep */
  playCombo(comboCount: number): void {
    const baseFreq = 400 + comboCount * 60;
    this.playTone(baseFreq, 0.1, 'square', 'sfx', 0.15, 0.005, 0.05);
    this.playTone(baseFreq * 1.5, 0.08, 'triangle', 'sfx', 0.1, 0.005, 0.04);
  }

  /** Kill streak reached — fanfare */
  playKillStreak(streak: number): void {
    const base = 523; // C5
    const notes = streak >= 10
      ? [base, base * 1.25, base * 1.5, base * 2] // C E G C
      : [base, base * 1.25, base * 1.5]; // C E G
    notes.forEach((freq, i) => {
      setTimeout(() => {
        this.playTone(freq, 0.2, 'square', 'sfx', 0.2, 0.01, 0.1);
        this.playTone(freq / 2, 0.25, 'sine', 'sfx', 0.1, 0.01, 0.12);
      }, i * 120);
    });
  }

  /** Screen shake — low rumble */
  playImpact(intensity: number): void {
    const vol = Math.min(0.3, intensity * 0.02);
    this.playTone(50 + intensity * 5, 0.2, 'sine', 'sfx', vol, 0.005, 0.15);
  }

  /** Map event announcement — dramatic alert */
  playMapEvent(): void {
    this.playTone(880, 0.15, 'square', 'sfx', 0.15);
    setTimeout(() => this.playTone(1100, 0.15, 'square', 'sfx', 0.15), 120);
    setTimeout(() => this.playTone(880, 0.2, 'square', 'sfx', 0.12), 240);
    this.playNoise(0.1, 'sfx', 0.05, 5000);
  }

  /** Error buzz */
  playError(): void {
    this.playTone(200, 0.15, 'square', 'sfx', 0.15);
    this.playTone(150, 0.15, 'square', 'sfx', 0.12, 0.005, 0.08, 20);
  }

  /** Game started — epic intro */
  playGameStart(): void {
    const notes = [262, 330, 392, 523, 659];
    notes.forEach((freq, i) => {
      setTimeout(() => {
        this.playTone(freq, 0.25, 'sine', 'sfx', 0.2, 0.01, 0.12);
        this.playTone(freq * 0.5, 0.3, 'triangle', 'sfx', 0.08, 0.02, 0.15);
      }, i * 100);
    });
  }

  /** Game ended — dramatic conclusion */
  playGameEnd(): void {
    this.playTone(523, 0.3, 'sine', 'sfx', 0.2);
    setTimeout(() => this.playTone(440, 0.3, 'sine', 'sfx', 0.2), 200);
    setTimeout(() => this.playTone(349, 0.5, 'sine', 'sfx', 0.25, 0.01, 0.3), 400);
  }

  // ============ UI SOUNDS ============

  /** Button hover */
  playHover(): void {
    this.playTone(1200, 0.04, 'sine', 'ui', 0.06, 0.005, 0.02);
  }

  /** Button click */
  playClick(): void {
    this.playTone(800, 0.06, 'triangle', 'ui', 0.12, 0.005, 0.03);
    this.playTone(1200, 0.04, 'sine', 'ui', 0.08, 0.01, 0.02);
  }

  /** Menu transition */
  playMenuTransition(): void {
    this.playSweep(400, 800, 0.15, 'sine', 'ui', 0.1);
  }

  // ============ AMBIENT MUSIC ============

  startMusic(): void {
    if (this.musicPlaying) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.musicGain) return;
    this.musicPlaying = true;

    // Ambient pad — layered detuned oscillators
    const frequencies = [65.41, 98, 130.81, 196]; // C2, G2, C3, G3
    this.ambientNodes = [];

    for (const freq of frequencies) {
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.detune.setValueAtTime(Math.random() * 10 - 5, ctx.currentTime);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(400, ctx.currentTime);
      filter.Q.setValueAtTime(1, ctx.currentTime);

      oscGain.gain.setValueAtTime(0, ctx.currentTime);
      oscGain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 3);

      // Slow LFO on volume for breathing effect
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(0.1 + Math.random() * 0.1, ctx.currentTime);
      lfoGain.gain.setValueAtTime(0.03, ctx.currentTime);
      lfo.connect(lfoGain);
      lfoGain.connect(oscGain.gain);
      lfo.start(ctx.currentTime);

      osc.connect(filter);
      filter.connect(oscGain);
      oscGain.connect(this.musicGain);
      osc.start(ctx.currentTime);

      this.ambientNodes.push(osc, lfo);
    }

    // Slow evolving high pad
    const padOsc = ctx.createOscillator();
    const padGain = ctx.createGain();
    const padFilter = ctx.createBiquadFilter();
    padOsc.type = 'triangle';
    padOsc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
    padFilter.type = 'lowpass';
    padFilter.frequency.setValueAtTime(600, ctx.currentTime);
    padGain.gain.setValueAtTime(0, ctx.currentTime);
    padGain.gain.linearRampToValueAtTime(0.03, ctx.currentTime + 5);

    padOsc.connect(padFilter);
    padFilter.connect(padGain);
    padGain.connect(this.musicGain);
    padOsc.start(ctx.currentTime);
    this.ambientNodes.push(padOsc);
  }

  stopMusic(): void {
    if (!this.musicPlaying || !this.ctx) return;
    this.musicPlaying = false;

    const now = this.ctx.currentTime;
    for (const node of this.ambientNodes) {
      try {
        node.stop(now + 2);
      } catch { /* already stopped */ }
    }
    this.ambientNodes = [];
  }

  isInitialized(): boolean { return this.initialized; }
  isMusicPlaying(): boolean { return this.musicPlaying; }

  destroy(): void {
    this.stopMusic();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.initialized = false;
  }
}

// Singleton instance
export const audioManager = new AudioManager();
