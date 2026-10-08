/**
 * Звукові ефекти, синтезовані кодом (WebAudio): у паках асетів звуків немає.
 * Кожен звук — кілька осциляторів/шуму з короткою огинаючою гучності (атака → спад).
 * Браузер дозволяє звук лише після дії користувача — контекст «будимо» на першому натисканні.
 */

type Wave = OscillatorType;

class SfxEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;
  private tensionNodes: { osc: OscillatorNode[]; gain: GainNode } | null = null;

  /** Створити/розбудити аудіоконтекст (викликати з обробника натискання). */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.22;
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate * 0.5;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.22;
    return this.muted;
  }

  private get ready(): boolean {
    return !!this.ctx && !!this.master && this.ctx.state === 'running' && !this.muted;
  }

  /** Тон: частота from→to за dur секунд, огинаюча attack/decay. */
  private tone(freq: number, dur: number, wave: Wave = 'square', vol = 0.5, at = 0, slideTo?: number): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol = 0.4, at = 0, lowpass = 3000): void {
    if (!this.ready || !this.noiseBuf) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /** Коли востаннє грав кожен звук: той самий звук не частіше ніж раз на 40 мс (інакше 10 монет = вибух гучності). */
  private lastPlayed = new Map<SfxName, number>();

  play(name: SfxName): void {
    const now = performance.now();
    if (now - (this.lastPlayed.get(name) ?? -Infinity) < 40) return;
    this.lastPlayed.set(name, now);
    switch (name) {
      case 'click':
        this.tone(880, 0.05, 'square', 0.25);
        break;
      case 'spin':
        this.tone(220, 0.25, 'sawtooth', 0.2, 0, 660);
        this.noise(0.2, 0.08, 0, 1500);
        break;
      case 'reelStop':
        this.tone(140, 0.09, 'square', 0.35);
        this.noise(0.06, 0.15, 0, 800);
        break;
      case 'tick':
        this.tone(1200, 0.02, 'square', 0.08);
        break;
      case 'winSmall':
        // «виграш» навіть на мінімальних сумах — радісне арпеджіо
        [523, 659, 784].forEach((f, i) => this.tone(f, 0.12, 'square', 0.3, i * 0.07));
        break;
      case 'winBig':
        [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.16, 'square', 0.32, i * 0.09));
        this.noise(0.6, 0.06, 0.1, 6000);
        break;
      case 'scatter':
        this.tone(1568, 0.35, 'triangle', 0.35);
        this.tone(2093, 0.3, 'triangle', 0.2, 0.05);
        break;
      case 'bonus':
        [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, 'sawtooth', 0.25, i * 0.12));
        [1047, 1319, 1568].forEach((f, i) => this.tone(f, 0.5, 'square', 0.25, 0.65 + i * 0.03));
        break;
      case 'curse':
        this.tone(110, 0.6, 'sawtooth', 0.35, 0, 55);
        this.tone(116, 0.6, 'sawtooth', 0.25, 0.05, 58);
        break;
      case 'coin':
        this.tone(1318, 0.06, 'square', 0.2);
        this.tone(1760, 0.08, 'square', 0.2, 0.05);
        break;
      case 'swing':
        this.noise(0.09, 0.18, 0, 2500);
        break;
      case 'hit':
        this.noise(0.08, 0.35, 0, 1800);
        this.tone(180, 0.08, 'square', 0.3, 0, 90);
        break;
      case 'hurt':
        this.tone(300, 0.18, 'sawtooth', 0.35, 0, 120);
        this.noise(0.12, 0.25, 0, 1200);
        break;
      case 'parry':
        this.tone(1800, 0.18, 'triangle', 0.4, 0, 2600);
        this.tone(900, 0.12, 'square', 0.2);
        break;
      case 'block':
        this.tone(600, 0.06, 'square', 0.25);
        this.noise(0.05, 0.15, 0, 4000);
        break;
      case 'roll':
        this.noise(0.18, 0.12, 0, 900);
        break;
      case 'heal':
        [440, 554, 659].forEach((f, i) => this.tone(f, 0.15, 'triangle', 0.25, i * 0.06));
        break;
      case 'death':
        this.tone(330, 0.8, 'sawtooth', 0.35, 0, 60);
        break;
      case 'door':
        this.tone(90, 0.2, 'square', 0.3);
        this.noise(0.25, 0.15, 0.02, 600);
        break;
      case 'boss':
        this.tone(70, 1.2, 'sawtooth', 0.35, 0, 140);
        this.tone(73, 1.2, 'square', 0.2, 0, 146);
        break;
    }
  }

  /** Напруга near-miss: тремоло-гул, що повільно росте; зупиняється tension(false). */
  tension(on: boolean): void {
    if (!on) {
      if (this.tensionNodes && this.ctx) {
        const t = this.ctx.currentTime;
        this.tensionNodes.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
        for (const o of this.tensionNodes.osc) o.stop(t + 0.2);
      }
      this.tensionNodes = null;
      return;
    }
    if (!this.ready || this.tensionNodes) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.3);
    g.connect(this.master!);
    const a = ctx.createOscillator();
    a.type = 'sawtooth';
    a.frequency.setValueAtTime(110, t);
    a.frequency.linearRampToValueAtTime(220, t + 2.5);
    // тремоло: другий осцилятор модулює гучність
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 9;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.12;
    lfo.connect(lfoGain).connect(g.gain);
    a.connect(g);
    a.start(t);
    lfo.start(t);
    this.tensionNodes = { osc: [a, lfo], gain: g };
  }
}

export type SfxName =
  | 'click'
  | 'spin'
  | 'reelStop'
  | 'tick'
  | 'winSmall'
  | 'winBig'
  | 'scatter'
  | 'bonus'
  | 'curse'
  | 'coin'
  | 'swing'
  | 'hit'
  | 'hurt'
  | 'parry'
  | 'block'
  | 'roll'
  | 'heal'
  | 'death'
  | 'door'
  | 'boss';

export const sfx = new SfxEngine();

/** Розбудити звук на першу дію користувача. */
export function installAudioUnlock(): void {
  const unlock = () => sfx.unlock();
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
}
