export type AudioCue = 'select' | 'dive' | 'fire' | 'impact' | 'recovery' | 'error';

const CUES: Record<AudioCue, readonly [number, number, number]> = {
  select: [520, 520, .06], dive: [180, 100, .18], fire: [220, 90, .10],
  impact: [110, 45, .12], recovery: [440, 660, .12], error: [180, 120, .16],
};

export class AquariumAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private muted = true;
  private voices = new Set<OscillatorNode>();
  private lastPlayed = new Map<AudioCue, number>();

  async enableFromGesture(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.context.destination);
    }
    await this.context.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.context) this.master.gain.setValueAtTime(muted ? 0 : 1, this.context.currentTime);
  }

  play(cue: AudioCue): void {
    const context = this.context;
    const master = this.master;
    if (this.muted || !context || !master || context.state !== 'running' || this.voices.size >= 4) return;
    const nowMs = performance.now();
    if (nowMs - (this.lastPlayed.get(cue) ?? -Infinity) < 150) return;
    this.lastPlayed.set(cue, nowMs);
    const [startHz, endHz, duration] = CUES[cue];
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = cue === 'impact' || cue === 'error' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(startHz, now);
    oscillator.frequency.exponentialRampToValueAtTime(endHz, now + duration);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(.04, now + Math.min(.02, duration / 3));
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain).connect(master);
    this.voices.add(oscillator);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); this.voices.delete(oscillator); };
    oscillator.start(now); oscillator.stop(now + duration);
  }

  dispose(): void {
    for (const voice of this.voices) { voice.stop(); voice.disconnect(); }
    this.voices.clear(); this.master?.disconnect(); void this.context?.close();
    this.master = undefined; this.context = undefined;
  }
}
