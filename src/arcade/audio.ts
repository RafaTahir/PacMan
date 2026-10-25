import type { GameId, GameSignal } from "./shared/contracts";
export class ArcadeSound {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices = new Set<OscillatorNode>();
  private lastShot = 0;
  muted = false;
  async unlock(): Promise<void> {
    if (this.muted) return;
    try {
      if (!this.context) {
        this.context = new AudioContext(); this.master = this.context.createGain();
        this.master.gain.value = 0.19; this.master.connect(this.context.destination);
      }
      if (this.context.state === "suspended") await this.context.resume();
    } catch { /* Play remains available when audio is unsupported or blocked. */ }
  }
  setMuted(value: boolean): void { this.muted = value; if (value) this.pause(); else void this.unlock(); }
  pause(): void {
    for (const oscillator of this.voices) { try { oscillator.stop(); } catch { /* Already ended. */ } }
    this.voices.clear(); void this.context?.suspend().catch(() => {});
  }
  private tone(from: number, to: number, seconds: number, wave: OscillatorType, gain = 0.3, delay = 0): void {
    const context = this.context;
    if (this.muted || !context || !this.master || context.state !== "running" || this.voices.size >= 16) return;
    const oscillator = context.createOscillator(), envelope = context.createGain();
    const now = context.currentTime + delay;
    oscillator.type = wave; oscillator.frequency.setValueAtTime(from, now); oscillator.frequency.exponentialRampToValueAtTime(Math.max(25, to), now + seconds);
    envelope.gain.setValueAtTime(0, now); envelope.gain.linearRampToValueAtTime(gain, now + 0.006); envelope.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    oscillator.connect(envelope); envelope.connect(this.master); this.voices.add(oscillator);
    oscillator.onended = () => { this.voices.delete(oscillator); oscillator.disconnect(); envelope.disconnect(); };
    oscillator.start(now); oscillator.stop(now + seconds + 0.01);
  }
  handle(game: GameId, events: readonly GameSignal[]): void {
    for (const event of events) switch (event.type) {
      case "shot":
        if (performance.now() - this.lastShot < 85) break;
        this.lastShot = performance.now(); this.tone(620, 140, 0.065, "sawtooth", 0.08); break;
      case "bounce": this.tone(game === "midnight-pinball" ? 660 : 440, 990, 0.065, "sine", 0.22); break;
      case "hit": this.tone(140, 35, 0.16, "triangle", 0.35); break;
      case "near-miss": this.tone(330, 920, 0.15, "sine", 0.28); break;
      case "boost": case "dash": this.tone(95, 490, 0.2, "triangle", 0.2); break;
      case "chain": case "upgrade": case "multiball":
        for (let i = 0; i < 3; i++) this.tone(440 * 2 ** (i / 3), 660 * 2 ** (i / 3), 0.14, "sine", 0.18, i * 0.065); break;
      case "boss": this.tone(110, 55, 0.5, "sawtooth", 0.2); break;
      case "death": case "lose": this.tone(330, 45, 0.5, "triangle", 0.3); break;
      case "win": for (let i = 0; i < 4; i++) this.tone(330 * 2 ** (i / 3), 340 * 2 ** (i / 3), 0.2, "triangle", 0.2, i * 0.09); break;
      default: break;
    }
  }
  dispose(): void { this.pause(); void this.context?.close().catch(() => {}); this.context = null; this.master = null; }
}
