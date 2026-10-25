import type { GameEvent, GameState } from "./types";

type Voice = { oscillator: OscillatorNode; gain: GainNode };

/** Original, quiet arcade sounds synthesized locally; no recordings or autoplay. */
export class ArcadeAudio {
  enabled = false;
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices = new Set<Voice>();
  private siren: Voice | null = null;
  private lastChomp = -1;
  private chompHigh = false;
  private destroyed = false;
  private readonly onVisibilityChange = () => {
    if (document.hidden) {
      this.stopAll();
      void this.context?.suspend().catch(() => {});
    }
  };

  constructor() {
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) void this.unlock();
    else {
      this.stopAll();
      void this.context?.suspend().catch(() => {});
    }
  }

  async unlock(): Promise<void> {
    if (!this.enabled || this.destroyed) return;
    try {
      if (!this.context) {
        const AudioCtor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!AudioCtor) return;
        this.context = new AudioCtor();
        this.master = this.context.createGain();
        this.master.gain.value = 0.32;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === "suspended") await this.context.resume();
    } catch {
      // Browsers may deny audio until a fresh user gesture. Gameplay stays usable.
    }
  }

  handle(events: GameEvent[]): void {
    if (!this.enabled || !this.context || document.hidden) return;
    if (this.context.state === "suspended") {
      void this.unlock().then(() => {
        if (this.context?.state === "running") this.handle(events);
      });
      return;
    }
    if (this.context.state !== "running") return;
    for (const event of events) {
      switch (event.type) {
        case "pellet": {
          const now = this.context.currentTime;
          if (now - this.lastChomp < 0.055) break;
          this.lastChomp = now;
          this.chompHigh = !this.chompHigh;
          this.tone(
            this.chompHigh ? 440 : 310,
            0.064,
            "triangle",
            0.12,
            0,
            this.chompHigh ? 180 : 590,
          );
          break;
        }
        case "energizer":
          this.phrase([392, 523.25, 783.99, 1046.5], 0.075, "triangle", 0.13);
          break;
        case "ghost":
          this.tone(220, 0.24, "triangle", 0.2, 0, 1500);
          this.tone(880, 0.16, "sine", 0.1, 0.13, 1760);
          break;
        case "fruit":
          this.phrase([659.25, 880, 1174.66], 0.085, "triangle", 0.17);
          break;
        case "death":
          this.stopSiren();
          this.tone(740, 0.32, "triangle", 0.15, 0.12, 440);
          this.tone(460, 0.36, "triangle", 0.14, 0.44, 160);
          this.tone(190, 0.6, "sine", 0.2, 0.8, 45);
          break;
        case "start":
          this.phrase(
            [392, 523.25, 659.25, 587.33, 783.99, 659.25, 1046.5],
            0.12,
            "triangle",
            0.13,
          );
          break;
        case "level":
          this.stopSiren();
          this.phrase(
            [523.25, 659.25, 783.99, 1046.5, 987.77, 1318.51],
            0.12,
            "triangle",
            0.14,
          );
          break;
        case "extra-life":
          this.phrase([659.25, 783.99, 987.77, 1318.51], 0.12, "sine", 0.19);
          break;
        case "game-over":
          this.stopSiren();
          break;
        case "ready":
          break;
      }
    }
  }

  update(state: GameState): void {
    if (!this.enabled || !this.context || !this.master) return;
    const silent =
      state.paused ||
      document.hidden ||
      state.phase === "title" ||
      state.phase === "game-over";
    if (silent) {
      this.stopAll();
      if (this.context.state === "running")
        void this.context.suspend().catch(() => {});
      return;
    }
    if (this.context.state === "suspended") {
      void this.context.resume().catch(() => {});
      return;
    }
    if (this.context.state !== "running") return;
    if (state.phase !== "playing") {
      this.stopSiren();
      return;
    }
    if (!this.siren) {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = "sine";
      gain.gain.value = 0;
      oscillator.connect(gain);
      gain.connect(this.master);
      oscillator.start();
      this.siren = { oscillator, gain };
    }
    const frightened = state.frightenedRemaining > 0;
    const pace = 2.4 + Math.min(state.eaten / 70, 2.5);
    const wave = Math.sin(state.time * pace * Math.PI);
    const frequency = frightened
      ? 135 + (wave + 1) * 35
      : 165 + (wave + 1) * 70;
    const now = this.context.currentTime;
    this.siren.oscillator.frequency.setTargetAtTime(frequency, now, 0.035);
    this.siren.gain.gain.setTargetAtTime(frightened ? 0.018 : 0.025, now, 0.08);
  }

  destroy(): void {
    this.destroyed = true;
    this.enabled = false;
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.stopAll();
    void this.context?.close().catch(() => {});
    this.context = null;
    this.master = null;
  }

  private phrase(
    notes: number[],
    step: number,
    type: OscillatorType,
    volume: number,
  ): void {
    notes.forEach((note, i) =>
      this.tone(note, step * 0.85, type, volume, i * step),
    );
  }

  private tone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    delay = 0,
    endFrequency?: number,
  ): void {
    if (!this.context || !this.master || this.voices.size > 32) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const start = this.context.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (endFrequency)
      oscillator.frequency.exponentialRampToValueAtTime(
        endFrequency,
        start + duration,
      );
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(
      volume,
      start + Math.min(0.008, duration / 4),
    );
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    gain.gain.linearRampToValueAtTime(0, start + duration + 0.008);
    oscillator.connect(gain);
    gain.connect(this.master);
    const voice = { oscillator, gain };
    this.voices.add(voice);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      this.voices.delete(voice);
    };
    oscillator.start(start);
    oscillator.stop(start + duration + 0.012);
  }

  private stopSiren(): void {
    if (!this.siren) return;
    this.siren.oscillator.stop();
    this.siren.oscillator.disconnect();
    this.siren.gain.disconnect();
    this.siren = null;
  }

  private stopAll(): void {
    this.stopSiren();
    for (const voice of this.voices) {
      voice.oscillator.onended = null;
      try {
        voice.oscillator.stop();
      } catch {
        /* Already stopped. */
      }
      voice.oscillator.disconnect();
      voice.gain.disconnect();
    }
    this.voices.clear();
  }
}
