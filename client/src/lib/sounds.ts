let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function play(fn: (ac: AudioContext, t: number) => void) {
  try {
    const ac = getCtx();
    fn(ac, ac.currentTime);
  } catch {}
}

function noise(ac: AudioContext, duration: number, gain: number, t: number, freq = 4000) {
  const buf = ac.createBuffer(1, ac.sampleRate * duration, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + duration);
  const filt = ac.createBiquadFilter();
  filt.type = 'highpass';
  filt.frequency.value = freq;
  src.connect(filt).connect(g).connect(ac.destination);
  src.start(t);
}

function tone(ac: AudioContext, freq: number, duration: number, gain: number, t: number, type: OscillatorType = 'sine') {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + duration);
}

export const sfx = {
  cardDeal() {
    play((ac, t) => {
      noise(ac, 0.05, 0.12, t, 5000);
      tone(ac, 1800, 0.03, 0.02, t + 0.01);
    });
  },

  cardFlip() {
    play((ac, t) => {
      noise(ac, 0.035, 0.1, t, 5000);
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(2400, t);
      osc.frequency.exponentialRampToValueAtTime(1400, t + 0.04);
      g.gain.setValueAtTime(0.035, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      osc.connect(g).connect(ac.destination);
      osc.start(t);
      osc.stop(t + 0.06);
    });
  },

  chipClink() {
    play((ac, t) => {
      [3400, 5200, 4000].forEach((freq, i) => {
        const osc = ac.createOscillator();
        const g = ac.createGain();
        osc.type = 'sine';
        const s = t + i * 0.015;
        osc.frequency.setValueAtTime(freq, s);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.5, s + 0.1);
        g.gain.setValueAtTime(0.06 - i * 0.015, s);
        g.gain.exponentialRampToValueAtTime(0.001, s + 0.1);
        osc.connect(g).connect(ac.destination);
        osc.start(s);
        osc.stop(s + 0.1);
      });
      noise(ac, 0.03, 0.06, t, 6000);
    });
  },

  fold() {
    play((ac, t) => {
      const buf = ac.createBuffer(1, ac.sampleRate * 0.12, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.2;
      const src = ac.createBufferSource();
      src.buffer = buf;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      const filt = ac.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.setValueAtTime(2500, t);
      filt.frequency.exponentialRampToValueAtTime(150, t + 0.12);
      src.connect(filt).connect(g).connect(ac.destination);
      src.start(t);
    });
  },

  win() {
    play((ac, t) => {
      const notes = [523, 659, 784, 1047, 1319];
      notes.forEach((freq, i) => {
        const osc = ac.createOscillator();
        const g = ac.createGain();
        osc.type = i < 3 ? 'sine' : 'triangle';
        osc.frequency.value = freq;
        const start = t + i * 0.07;
        g.gain.setValueAtTime(0, start);
        g.gain.linearRampToValueAtTime(0.09 - i * 0.012, start + 0.015);
        g.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
        osc.connect(g).connect(ac.destination);
        osc.start(start);
        osc.stop(start + 0.3);
      });
      noise(ac, 0.04, 0.03, t + 0.28, 8000);
    });
  },

  lose() {
    play((ac, t) => {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, t);
      osc.frequency.exponentialRampToValueAtTime(180, t + 0.35);
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.connect(g).connect(ac.destination);
      osc.start(t);
      osc.stop(t + 0.4);
      
      const osc2 = ac.createOscillator();
      const g2 = ac.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(300, t + 0.1);
      osc2.frequency.exponentialRampToValueAtTime(140, t + 0.45);
      g2.gain.setValueAtTime(0.04, t + 0.1);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      osc2.connect(g2).connect(ac.destination);
      osc2.start(t + 0.1);
      osc2.stop(t + 0.45);
    });
  },

  check() {
    play((ac, t) => {
      tone(ac, 1400, 0.05, 0.035, t);
    });
  },

  declare() {
    play((ac, t) => {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(650, t);
      osc.frequency.linearRampToValueAtTime(950, t + 0.08);
      g.gain.setValueAtTime(0.05, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.connect(g).connect(ac.destination);
      osc.start(t);
      osc.stop(t + 0.14);
      tone(ac, 1300, 0.06, 0.025, t + 0.05);
    });
  },

  reveal() {
    play((ac, t) => {
      for (let i = 0; i < 3; i++) {
        tone(ac, 1600 + i * 200, 0.07, 0.035, t + i * 0.05);
      }
      noise(ac, 0.02, 0.04, t, 6000);
    });
  },
};
