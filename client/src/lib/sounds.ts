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

function noise(ac: AudioContext, duration: number, gain: number, t: number) {
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
  filt.frequency.value = 4000;
  src.connect(filt).connect(g).connect(ac.destination);
  src.start(t);
}

export const sfx = {
  cardDeal() {
    play((ac, t) => {
      noise(ac, 0.06, 0.15, t);
    });
  },

  cardFlip() {
    play((ac, t) => {
      noise(ac, 0.04, 0.12, t);
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(2800, t);
      osc.frequency.exponentialRampToValueAtTime(1200, t + 0.03);
      g.gain.setValueAtTime(0.04, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      osc.connect(g).connect(ac.destination);
      osc.start(t);
      osc.stop(t + 0.05);
    });
  },

  chipClink() {
    play((ac, t) => {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(3200, t);
      osc.frequency.exponentialRampToValueAtTime(1800, t + 0.08);
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(g).connect(ac.destination);
      osc.start(t);
      osc.stop(t + 0.12);

      const osc2 = ac.createOscillator();
      const g2 = ac.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(4800, t + 0.02);
      osc2.frequency.exponentialRampToValueAtTime(2400, t + 0.1);
      g2.gain.setValueAtTime(0.05, t + 0.02);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc2.connect(g2).connect(ac.destination);
      osc2.start(t + 0.02);
      osc2.stop(t + 0.1);
    });
  },

  fold() {
    play((ac, t) => {
      const buf = ac.createBuffer(1, ac.sampleRate * 0.15, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.2;
      const src = ac.createBufferSource();
      src.buffer = buf;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.1, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      const filt = ac.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.setValueAtTime(3000, t);
      filt.frequency.exponentialRampToValueAtTime(200, t + 0.15);
      src.connect(filt).connect(g).connect(ac.destination);
      src.start(t);
    });
  },

  win() {
    play((ac, t) => {
      const notes = [523, 659, 784, 1047];
      notes.forEach((freq, i) => {
        const osc = ac.createOscillator();
        const g = ac.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const start = t + i * 0.08;
        g.gain.setValueAtTime(0, start);
        g.gain.linearRampToValueAtTime(0.1, start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
        osc.connect(g).connect(ac.destination);
        osc.start(start);
        osc.stop(start + 0.25);
      });
    });
  },

  lose() {
    play((ac, t) => {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, t);
      osc.frequency.exponentialRampToValueAtTime(220, t + 0.3);
      g.gain.setValueAtTime(0.07, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(g).connect(ac.destination);
      osc.start(t);
      osc.stop(t + 0.35);
    });
  },

  check() {
    play((ac, t) => {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = 1200;
      g.gain.setValueAtTime(0.04, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      osc.connect(g).connect(ac.destination);
      osc.start(t);
      osc.stop(t + 0.06);
    });
  },

  declare() {
    play((ac, t) => {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600, t);
      osc.frequency.linearRampToValueAtTime(900, t + 0.1);
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.connect(g).connect(ac.destination);
      osc.start(t);
      osc.stop(t + 0.15);
    });
  },

  reveal() {
    play((ac, t) => {
      for (let i = 0; i < 3; i++) {
        const osc = ac.createOscillator();
        const g = ac.createGain();
        osc.type = 'sine';
        osc.frequency.value = 1600 + i * 200;
        const s = t + i * 0.06;
        g.gain.setValueAtTime(0.04, s);
        g.gain.exponentialRampToValueAtTime(0.001, s + 0.08);
        osc.connect(g).connect(ac.destination);
        osc.start(s);
        osc.stop(s + 0.08);
      }
    });
  },
};
